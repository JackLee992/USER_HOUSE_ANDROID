import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {
  BUBBLE_ART_URL, BUBBLE_SOURCE_RECTS, BUBBLE_COLOR_ORDER,
  BUBBLE_PALETTE, BUBBLE_CACHE_LIMITS, createBubbleArt,
} from '../src/games/plugins/paopao/bubble-art.js';
import {createPaopaoHarness} from './helpers/paopao-harness.mjs';

const colors = ['red','blue','green','yellow','purple','orange'];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

// Decode only this shipped 8-bit RGBA atlas, using the PNG scanline filters.
// Inspecting real alpha pixels catches cropped sphere edges that draw-call mocks cannot.
function readAtlasPixels() {
  const png=readFileSync(new URL(BUBBLE_ART_URL)),parts=[];
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.deepEqual([png[24],png[25],png[28]],[8,6,0],'expected noninterlaced RGBA PNG');
  for(let offset=8;offset<png.length;){
    const size=png.readUInt32BE(offset);
    if(png.toString('ascii',offset+4,offset+8)==='IDAT')parts.push(png.subarray(offset+8,offset+8+size));
    offset+=12+size;
  }
  const raw=inflateSync(Buffer.concat(parts)),stride=width*4,pixels=Buffer.alloc(stride*height);
  assert.equal(raw.length,(stride+1)*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  let offset=0;
  for(let y=0;y<height;y++){
    const filter=raw[offset++];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const index=y*stride+x,left=x>=4?pixels[index-4]:0,up=y?pixels[index-stride]:0,upperLeft=y&&x>=4?pixels[index-stride-4]:0;
      const predict=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft);
      pixels[index]=(raw[offset++]+predict)&255;
    }
  }
  return {width,height,alpha:(x,y)=>pixels[(y*width+x)*4+3]};
}

function drawingHost({dpr=1, imageAvailable=true}={}) {
  const canvases = [], images = [];
  let readyCalls = 0;
  const window = {};
  const document = {defaultView:window, createElement:tag => {
    assert.equal(tag,'canvas');
    const canvas = makeCanvas(); canvases.push(canvas); return canvas;
  }};
  function makeCanvas() {
    const operations = [], stack = [];
    const canvas = {width:0,height:0,ownerDocument:document,dataset:{},operations};
    const state = {canvas,globalAlpha:1,getTransform:() => ({a:dpr,b:0,c:0,d:dpr,e:0,f:0})};
    const context = new Proxy(state, {
      get(target,key) {
        if(key in target) return target[key];
        if(key==='save') return () => {stack.push({...target});operations.push(['save']);};
        if(key==='restore') return () => {Object.assign(target,stack.pop());operations.push(['restore']);};
        if(key==='createRadialGradient'||key==='createLinearGradient') return (...args) => {
          operations.push([key,...args]);return {addColorStop:(...stops) => operations.push(['addColorStop',...stops])};
        };
        return (...args) => operations.push([key,...args]);
      },
      set(target,key,value) {target[key]=value;return true;},
    });
    canvas.getContext = () => context;
    return canvas;
  }
  if(imageAvailable) window.Image = class {
    complete = false; naturalWidth = 0; naturalHeight = 0;
    set src(value) {this.url=value;images.push(this);}
  };
  window.document = document;
  const main = makeCanvas(), ctx = main.getContext('2d');
  const art = createBubbleArt({window,document,onReady:() => readyCalls++});
  return {art,ctx,main,canvases,images,
    readyCalls:() => readyCalls,
    load() {for(const image of images){image.complete=true;image.naturalWidth=1536;image.naturalHeight=1024;image.onload?.();}},
    fail() {for(const image of images) image.onerror?.();},
    setDPR(value) {dpr=value;},
  };
}

test('dedicated art stays in the paopao package and all six padded sphere cells are whole', () => {
  assert.match(new URL(BUBBLE_ART_URL).pathname,/\/assets\/game-art\/paopao\/bubbles-v4\.png$/);
  assert.deepEqual(BUBBLE_COLOR_ORDER,colors);
  assert.deepEqual(colors.map(color=>BUBBLE_PALETTE[color]),['#dc4052','#237ec4','#299b67','#f2d65c','#9765bd','#ee913f']);
  assert.equal(BUBBLE_SOURCE_RECTS.length,6);
  for(const [x,y,width,height] of BUBBLE_SOURCE_RECTS){
    assert.equal(width,400);assert.equal(height,400);
    assert.ok(x>=0&&y>=0&&x+width<=1536&&y+height<=1024);
  }
});

test('the actual PNG leaves transparent padding around every complete sphere source cell', () => {
  const atlas=readAtlasPixels();assert.deepEqual([atlas.width,atlas.height],[1536,1024]);
  for(const [index,[x,y,width,height]] of BUBBLE_SOURCE_RECTS.entries()){
    let borderAlpha=0,opaquePixels=0;
    for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++){
      const alpha=atlas.alpha(x+dx,y+dy);
      if(dx===0||dy===0||dx===width-1||dy===height-1)borderAlpha=Math.max(borderAlpha,alpha);
      if(alpha>200)opaquePixels++;
    }
    assert.ok(borderAlpha<=4,`${colors[index]} sphere must not touch the source crop boundary`);
    assert.ok(opaquePixels>width*height*.5,`${colors[index]} cell must contain a visible complete bubble`);
  }
});

test('loaded six-color sprites use the corresponding full source cell without circular clipping', async () => {
  const h=drawingHost({dpr:3});h.ctx.globalAlpha=.37;h.load();await flush();
  assert.equal(h.art.ready,true);assert.equal(h.readyCalls(),1);
  for(const color of colors) assert.equal(h.art.draw(h.ctx,color,100,80,28),true);
  assert.equal(h.canvases.length,6);
  assert.equal(h.main.dataset.paopaoArt,'v4');assert.equal(h.main.dataset.gameArt,'bubbles-v4');
  const sourceDraws=h.canvases.flatMap(canvas=>canvas.operations.filter(op=>op[0]==='drawImage'&&op[1]===h.images[0]));
  assert.equal(sourceDraws.length,6);
  sourceDraws.forEach((op,index)=>assert.deepEqual(op.slice(2,6),BUBBLE_SOURCE_RECTS[index]));
  for(const canvas of [h.main,...h.canvases]) assert.equal(canvas.operations.some(op=>op[0]==='clip'),false);
  for(const op of h.main.operations.filter(op=>op[0]==='drawImage')) assert.deepEqual(op.slice(2),[86,66,28,28]);
  assert.equal(h.ctx.globalAlpha,.37);
  h.art.destroy();assert.ok(h.canvases.every(canvas=>canvas.width===0&&canvas.height===0));
});

function assertPlainFallbacks(canvases) {
  const pathNames=new Set(['arc','ellipse','rect','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath']);
  const paths=canvases.map(canvas=>JSON.stringify(canvas.operations.filter(op=>pathNames.has(op[0]))));
  assert.equal(new Set(paths).size,1,'all six colors use the same plain sphere geometry');
  for(const [index,canvas] of canvases.entries()){
    assert.ok(canvas.operations.some(op=>op[0]==='arc'),'a fallback sphere must still be visible');
    assert.ok(canvas.operations.some(op=>op[0]==='addColorStop'&&op[2]===BUBBLE_PALETTE[colors[index]]),'each sphere uses its own color');
    assert.equal(canvas.operations.some(op=>['fillText','strokeText','rect','moveTo','lineTo','quadraticCurveTo','bezierCurveTo'].includes(op[0])),false,'fallback must not add a center glyph');
    for(const ellipse of canvas.operations.filter(op=>op[0]==='ellipse')){
      assert.ok(ellipse[2]+Math.max(ellipse[3],ellipse[4])<canvas.height/2,'small highlights stay above the sphere center');
    }
  }
}

test('pending and failed art retain six plain colored fallbacks and reuse their cached rasters', async () => {
  const h=drawingHost();
  assert.equal(h.art.ready,false);
  for(const color of colors) assert.equal(h.art.draw(h.ctx,color,20,20,28),true);
  assert.equal(h.canvases.length,6);
  assertPlainFallbacks(h.canvases);
  assert.equal(h.main.dataset.paopaoArt,'fallback');
  h.fail();await flush();
  for(const color of colors) assert.equal(h.art.draw(h.ctx,color,20,20,28),true);
  assert.equal(h.canvases.length,6);assert.equal(h.art.ready,false);assert.equal(h.readyCalls(),0);
  h.art.destroy();
});

test('missing Image support still draws all six plain colored fallbacks', () => {
  const h=drawingHost({imageAvailable:false});
  for(const color of colors) assert.equal(h.art.draw(h.ctx,color,0,0,28),true);
  assert.equal(h.art.ready,false);assert.equal(h.readyCalls(),0);
  assert.equal(h.canvases.length,6);assertPlainFallbacks(h.canvases);h.art.destroy();
});

test('one successful load replaces cached fallback artwork and notifies readiness once', async () => {
  const h=drawingHost();h.art.draw(h.ctx,'red',0,0,28);
  const fallback=h.canvases[0];
  assert.equal(fallback.operations.some(op=>op[0]==='drawImage'),false);
  h.load();await flush();h.art.draw(h.ctx,'red',0,0,28);
  assert.equal(h.readyCalls(),1);assert.equal(h.canvases.length,2);
  assert.equal(fallback.width,0);assert.equal(fallback.height,0);
  assert.ok(h.canvases[1].operations.some(op=>op[0]==='drawImage'&&op[1]===h.images[0]));
  h.load();await flush();assert.equal(h.readyCalls(),1);h.art.destroy();
});

test('cache reuses quantized sizes, respects canvas DPR and clamps unusually high DPR', async () => {
  const h=drawingHost({dpr:3});h.load();await flush();
  for(let frame=0;frame<60;frame++) for(const color of colors) h.art.draw(h.ctx,color,20,20,28);
  assert.equal(h.canvases.length,6,'360 draws should rasterize six cells only');
  for(const canvas of h.canvases){assert.equal(canvas.width,88);assert.equal(canvas.height,88);}
  h.art.draw(h.ctx,'red',20,20,29);assert.equal(h.canvases.length,6,'84 and 87 physical pixels share an 88px raster');
  h.setDPR(1);h.art.draw(h.ctx,'red',20,20,28);assert.equal(h.canvases.at(-1).width,32);
  h.setDPR(100);h.art.draw(h.ctx,'red',20,20,28);assert.equal(h.canvases.at(-1).width,112);
  assert.ok(h.canvases.every(canvas=>canvas.width<=BUBBLE_CACHE_LIMITS.maxDimension));
  h.art.destroy();
});

test('entry budget evicts old size variants while retaining the most recent sprite', async () => {
  assert.equal(BUBBLE_CACHE_LIMITS.maxEntries,48);
  const h=drawingHost();h.load();await flush();
  const variants=Array.from({length:49},(_,index)=>({color:colors[index%6],diameter:8*(1+Math.floor(index/6))}));
  for(const {color,diameter} of variants) h.art.draw(h.ctx,color,0,0,diameter);
  const count=h.canvases.length,last=variants.at(-1);
  assert.ok(h.canvases.filter(canvas=>canvas.width>0).length<=BUBBLE_CACHE_LIMITS.maxEntries);
  h.art.draw(h.ctx,last.color,0,0,last.diameter);assert.equal(h.canvases.length,count);
  h.art.draw(h.ctx,variants[0].color,0,0,variants[0].diameter);
  assert.equal(h.canvases.length,count+1,'the oldest of 49 distinct entries must have been evicted');
  h.art.destroy();
});

test('pixel budget evicts large sprites even before reaching the entry budget', async () => {
  assert.equal(BUBBLE_CACHE_LIMITS.maxBytes,2*1024*1024);
  const h=drawingHost();h.load();await flush();
  const variants=[...colors.map(color=>({color,diameter:256})),...colors.slice(0,3).map(color=>({color,diameter:248}))];
  for(const {color,diameter} of variants) h.art.draw(h.ctx,color,0,0,diameter);
  const count=h.canvases.length,last=variants.at(-1);
  assert.equal(count,9,'large sprites within maxDimension still use cached rasters');
  assert.ok(h.canvases.reduce((sum,canvas)=>sum+canvas.width*canvas.height*4,0)<=BUBBLE_CACHE_LIMITS.maxBytes);
  h.art.draw(h.ctx,last.color,0,0,last.diameter);assert.equal(h.canvases.length,count);
  h.art.draw(h.ctx,'red',0,0,256);assert.equal(h.canvases.length,count+1,'nine large entries exceed two MiB');
  h.art.destroy();
});

test('destroy cancels a queued ready notification and rejects any later drawing', async () => {
  const h=drawingHost();h.load();h.art.destroy();await flush();
  assert.equal(h.readyCalls(),0);
  const operations=h.main.operations.length;
  assert.equal(h.art.draw(h.ctx,'red',0,0,28),false);
  assert.equal(h.main.operations.length,operations);
  assert.equal(h.images[0].onload,null);assert.equal(h.images[0].onerror,null);
});

test('actual stationary game redraws once when its dedicated artwork becomes ready', async () => {
  const h=createPaopaoHarness({images:true});h.frame(1000);h.frame(1100);
  const before=h.draws();h.loadImages();await flush();h.frame(1200);
  assert.equal(h.draws(),before+1);
  h.frame(1300);h.frame(1400);assert.equal(h.draws(),before+1);
  h.destroy();
});

test('actual game destroyed before image readiness never redraws its old board', async () => {
  const h=createPaopaoHarness({images:true});const before=h.draws();
  h.loadImages();h.destroy();await flush();h.frame(1000);
  assert.equal(h.draws(),before);assert.equal(h.pending().frames,0);
});
