import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUBBLE_ART_VERSION, BUBBLE_COLOR_ORDER, BUBBLE_PALETTE,
  BUBBLE_CACHE_LIMITS, createBubbleArt,
} from '../src/games/plugins/paopao/bubble-art.js';
import {createPaopaoHarness} from './helpers/paopao-harness.mjs';

const colors = ['red','blue','green','yellow','purple','orange'];

function drawingHost({dpr=1}={}) {
  const canvases = [];
  let imageConstructions = 0;
  const window = {Image:class { constructor() { imageConstructions++; } }};
  const document = {defaultView:window, createElement:tag => {
    assert.equal(tag,'canvas');
    const canvas = makeCanvas(); canvases.push(canvas); return canvas;
  }};
  function makeCanvas() {
    const operations = [];
    const canvas = {width:0,height:0,ownerDocument:document,dataset:{},operations};
    const state = {canvas,globalAlpha:1,getTransform:() => ({a:dpr,b:0,c:0,d:dpr,e:0,f:0})};
    const context = new Proxy(state, {
      get(target,key) {
        if(key in target) return target[key];
        if(key==='createRadialGradient'||key==='createLinearGradient') return (...args) => {
          operations.push([key,...args]);return {addColorStop:(...stops) => operations.push(['addColorStop',...stops])};
        };
        return (...args) => operations.push([key,...args]);
      },
      set(target,key,value) {target[key]=value;operations.push(['set',key,value]);return true;},
    });
    canvas.getContext = () => context;
    return canvas;
  }
  window.document = document;
  const main = makeCanvas(), ctx = main.getContext('2d');
  const art = createBubbleArt({window,document});
  return {art,ctx,main,canvases,imageConstructions:() => imageConstructions,setDPR(value) {dpr=value;}};
}

function rgb(hex) { return [1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)); }
function lab(hex) {
  const [r,g,b]=rgb(hex).map(value=>value/255).map(value=>value>.04045?((value+.055)/1.055)**2.4:value/12.92);
  const x=(r*.4124+g*.3576+b*.1805)/.95047,y=r*.2126+g*.7152+b*.0722,z=(r*.0193+g*.1192+b*.9505)/1.08883;
  const f=value=>value>.008856?Math.cbrt(value):7.787*value+16/116;
  return [116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))];
}
function distance(a,b) { return Math.hypot(...lab(a).map((value,index)=>value-lab(b)[index])); }

test('pastel v5 restores the original palette while keeping every color distinct', () => {
  assert.equal(BUBBLE_ART_VERSION,'pastel-v5');
  assert.deepEqual(BUBBLE_COLOR_ORDER,colors);
  assert.deepEqual(colors.map(color=>BUBBLE_PALETTE[color]),['#f28b94','#8fc7ee','#96d7a7','#f3d878','#b9a4e8','#efb37e']);
  const averageChroma=colors.reduce((sum,color)=>{const channels=rgb(BUBBLE_PALETTE[color]);return sum+Math.max(...channels)-Math.min(...channels);},0)/colors.length;
  assert.ok(averageChroma<100,'base colors stay visibly softer than the previous high-chroma palette');
  for(let left=0;left<colors.length;left++)for(let right=left+1;right<colors.length;right++)
    assert.ok(distance(BUBBLE_PALETTE[colors[left]],BUBBLE_PALETTE[colors[right]])>24,`${colors[left]} and ${colors[right]} remain distinguishable`);
});

function assertPastelSpheres(canvases) {
  const pathNames=new Set(['arc','ellipse','rect','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath']);
  const paths=canvases.map(canvas=>JSON.stringify(canvas.operations.filter(op=>pathNames.has(op[0]))));
  assert.equal(new Set(paths).size,1,'all colors use the same simple circular geometry');
  for(const [index,canvas] of canvases.entries()){
    assert.ok(canvas.operations.some(op=>op[0]==='arc'),'the sphere remains fully circular');
    assert.ok(canvas.operations.some(op=>op[0]==='addColorStop'&&op[1]===.48&&op[2]===BUBBLE_PALETTE[colors[index]]),'each sphere uses its exact base color');
    assert.ok(canvas.operations.some(op=>op[0]==='set'&&op[1]==='fillStyle'&&op[2]==='rgba(255,255,255,.38)'),'highlight stays restrained');
    assert.equal(canvas.operations.some(op=>['fillText','strokeText','rect','moveTo','lineTo','quadraticCurveTo','bezierCurveTo'].includes(op[0])),false,'no center glyph or alternate shape adds visual load');
    assert.equal(canvas.operations.some(op=>op[0]==='set'&&op[1]==='shadowBlur'&&op[2]>0),false,'no outer glow is painted');
    for(const ellipse of canvas.operations.filter(op=>op[0]==='ellipse'))
      assert.ok(ellipse[2]+Math.max(ellipse[3],ellipse[4])<canvas.height/2,'small highlights stay above the center');
  }
}

test('all six bubbles render procedurally without decoding the old neon atlas', () => {
  const h=drawingHost({dpr:3});
  assert.equal(h.art.ready,true);
  for(const color of colors) assert.equal(h.art.draw(h.ctx,color,100,80,28),true);
  assert.equal(h.imageConstructions(),0);
  assert.equal(h.canvases.length,6);assertPastelSpheres(h.canvases);
  assert.equal(h.main.dataset.paopaoArt,'pastel-v5');
  assert.equal(h.main.dataset.gameArt,'paopao-pastel-v5');
  for(const canvas of h.canvases) assert.equal(canvas.operations.some(op=>op[0]==='drawImage'),false);
  for(const op of h.main.operations.filter(op=>op[0]==='drawImage')) assert.deepEqual(op.slice(2),[86,66,28,28]);
  h.art.destroy();assert.ok(h.canvases.every(canvas=>canvas.width===0&&canvas.height===0));
});

test('cache reuses quantized sizes, respects canvas DPR and clamps unusually high DPR', () => {
  const h=drawingHost({dpr:3});
  for(let frame=0;frame<60;frame++) for(const color of colors) h.art.draw(h.ctx,color,20,20,28);
  assert.equal(h.canvases.length,6,'360 draws rasterize six spheres only');
  for(const canvas of h.canvases){assert.equal(canvas.width,88);assert.equal(canvas.height,88);}
  h.art.draw(h.ctx,'red',20,20,29);assert.equal(h.canvases.length,6,'nearby sizes share an 88px raster');
  h.setDPR(1);h.art.draw(h.ctx,'red',20,20,28);assert.equal(h.canvases.at(-1).width,32);
  h.setDPR(100);h.art.draw(h.ctx,'red',20,20,28);assert.equal(h.canvases.at(-1).width,112);
  assert.ok(h.canvases.every(canvas=>canvas.width<=BUBBLE_CACHE_LIMITS.maxDimension));
  h.art.destroy();
});

test('entry budget evicts old size variants while retaining the most recent sphere', () => {
  assert.equal(BUBBLE_CACHE_LIMITS.maxEntries,48);
  const h=drawingHost();
  const variants=Array.from({length:49},(_,index)=>({color:colors[index%6],diameter:8*(1+Math.floor(index/6))}));
  for(const {color,diameter} of variants) h.art.draw(h.ctx,color,0,0,diameter);
  const count=h.canvases.length,last=variants.at(-1);
  assert.ok(h.canvases.filter(canvas=>canvas.width>0).length<=BUBBLE_CACHE_LIMITS.maxEntries);
  h.art.draw(h.ctx,last.color,0,0,last.diameter);assert.equal(h.canvases.length,count);
  h.art.draw(h.ctx,variants[0].color,0,0,variants[0].diameter);
  assert.equal(h.canvases.length,count+1,'the oldest of 49 entries is evicted');
  h.art.destroy();
});

test('pixel budget evicts large spheres before reaching the entry budget', () => {
  assert.equal(BUBBLE_CACHE_LIMITS.maxBytes,2*1024*1024);
  const h=drawingHost();
  const variants=[...colors.map(color=>({color,diameter:256})),...colors.slice(0,3).map(color=>({color,diameter:248}))];
  for(const {color,diameter} of variants) h.art.draw(h.ctx,color,0,0,diameter);
  const count=h.canvases.length,last=variants.at(-1);
  assert.equal(count,9);
  assert.ok(h.canvases.reduce((sum,canvas)=>sum+canvas.width*canvas.height*4,0)<=BUBBLE_CACHE_LIMITS.maxBytes);
  h.art.draw(h.ctx,last.color,0,0,last.diameter);assert.equal(h.canvases.length,count);
  h.art.draw(h.ctx,'red',0,0,256);assert.equal(h.canvases.length,count+1);
  h.art.destroy();
});

test('destroy releases cached rasters and rejects later drawing', () => {
  const h=drawingHost();h.art.draw(h.ctx,'red',0,0,28);h.art.destroy();
  assert.equal(h.art.ready,false);assert.equal(h.canvases[0].width,0);assert.equal(h.canvases[0].height,0);
  const operations=h.main.operations.length;
  assert.equal(h.art.draw(h.ctx,'red',0,0,28),false);assert.equal(h.main.operations.length,operations);
});

test('the stationary game starts with pastel art and has no image-ready redraw', () => {
  const h=createPaopaoHarness({images:true});h.frame(1000);h.frame(1100);
  const before=h.draws();assert.equal(h.canvas().dataset.paopaoArt,'pastel-v5');assert.equal(h.images().length,0);
  h.loadImages();h.frame(1200);assert.equal(h.draws(),before);
  h.destroy();assert.equal(h.pending().frames,0);
});
