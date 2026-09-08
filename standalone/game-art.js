// Immutable raster assets shared by the independently versioned game plugins.
export const GAME_ART_VERSION = '1.0.1';
export const GAME_ART = Object.freeze({...Object.fromEntries(['candy-bubbles','fruits','materials','pieces'].map(name => [name,new URL('../assets/game-art/premium/v1/' + name + '.png',import.meta.url).href])),bubbles:new URL('../assets/game-art/premium/v2/bubbles.png',import.meta.url).href});
const stores = new WeakMap();
const spriteCaches = new WeakMap(), canvasAtlases = new WeakMap();
// Full sphere silhouettes with transparent padding. The generated sheet is kept
// intact; source rectangles center each bubble without clipping its circular rim.
export const BUBBLE_SOURCE_RECTS = Object.freeze([[76,59,408,408],[565,60,408,408],[1051,60,408,408],[76,539,408,408],[565,540,408,408],[1052,539,408,408]].map(Object.freeze));
function sourceRect(img,atlas,index) {
  if(atlas==='bubbles')return BUBBLE_SOURCE_RECTS[index];
  const grid=atlas==='materials'?2:4,inset=atlas==='materials'?0:.02;
  if(index>=grid*grid)return null;
  const sw=img.naturalWidth/grid,sh=img.naturalHeight/grid;
  return [((index%grid)+inset)*sw,(Math.floor(index/grid)+inset)*sh,sw*(1-inset*2),sh*(1-inset*2)];
}
function cachedSprite(ctx,win,img,atlas,index,rect,width,height) {
  const doc=ctx.canvas?.ownerDocument;
  if(atlas==='materials'||!doc?.createElement)return null;
  const transform=ctx.getTransform?.(),ratio=Math.min(4,Math.max(1,Math.abs(transform?.a)||1,Math.abs(transform?.d)||1));
  const w=Math.ceil(width*ratio/8)*8,h=Math.ceil(height*ratio/8)*8;
  if(w>512||h>512)return null;
  let cache=spriteCaches.get(win);if(!cache){cache={entries:new Map(),bytes:0};spriteCaches.set(win,cache);}
  const key=atlas+':'+index+':'+w+':'+h;
  if(cache.entries.has(key))return cache.entries.get(key);
  const canvas=doc.createElement('canvas');canvas.width=w;canvas.height=h;
  const paint=canvas.getContext('2d');if(!paint)return null;
  // Legacy round sprites keep their old shape. Dedicated bubbles need no mask.
  if(atlas==='candy-bubbles'&&index>=8&&index<=13){paint.beginPath();paint.arc(w/2,h/2,Math.min(w,h)*.445,0,Math.PI*2);paint.clip();}
  paint.drawImage(img,...rect,0,0,w,h);
  // Bound both object count and pixel memory. Quantized sizes avoid allocating
  // a fresh raster for each animation frame; old size variants are evicted.
  const bytes=w*h*4;
  while(cache.entries.size&&(cache.entries.size>=64||cache.bytes+bytes>8*1024*1024)){
    const oldest=cache.entries.keys().next().value,entry=cache.entries.get(oldest);
    cache.bytes-=entry.width*entry.height*4;cache.entries.delete(oldest);
  }
  cache.entries.set(key,canvas);cache.bytes+=bytes;return canvas;
}
function imageStore(win) {
  if (!win || typeof win.Image !== 'function') return null;
  if (stores.has(win)) return stores.get(win);
  const store = {};
  stores.set(win,store);
  for (const [name,url] of Object.entries(GAME_ART)) {
    const img = new win.Image();
    const promise = new Promise(resolve => { img.onload=()=>resolve(true); img.onerror=()=>resolve(false); });
    img.decoding='async'; img.src=url; store[name]={img,promise};
  }
  return store;
}
export async function preloadGameArt(win = globalThis) {
  const store=imageStore(win);
  if (!store) return false;
  const result=await Promise.all(Object.values(store).map(item=>item.promise));
  return result.every(Boolean);
}
export function drawGameSprite(ctx, atlas, index, x, y, width, height, alpha = 1) {
  const win=ctx?.canvas?.ownerDocument?.defaultView || globalThis;
  const img=imageStore(win)?.[atlas]?.img;
  if (!img?.complete || !img.naturalWidth || !Number.isInteger(index) || index<0 || width<=0 || height<=0) return false;
  const rect=sourceRect(img,atlas,index);if(!rect)return false;
  const cached=cachedSprite(ctx,win,img,atlas,index,rect,width,height);
  const oldAlpha=ctx.globalAlpha;if(alpha!==1)ctx.globalAlpha=oldAlpha*alpha;
  if(cached)ctx.drawImage(cached,x,y,width,height);
  else if(atlas==='candy-bubbles'&&index>=8&&index<=13){ctx.save();ctx.beginPath();ctx.arc(x+width/2,y+height/2,Math.min(width,height)*.445,0,Math.PI*2);ctx.clip();ctx.drawImage(img,...rect,x,y,width,height);ctx.restore();}
  else ctx.drawImage(img,...rect,x,y,width,height);
  if(alpha!==1)ctx.globalAlpha=oldAlpha;
  if(ctx.canvas?.dataset){let used=canvasAtlases.get(ctx.canvas);if(!used){used=new Set();canvasAtlases.set(ctx.canvas,used);}if(!used.has(atlas)){used.add(atlas);ctx.canvas.dataset.gameArt=[...used].join(' ');}}
  return true;
}
export function drawGameMaterial(ctx,index,x,y,width,height,alpha=1) {
  return drawGameSprite(ctx,'materials',index,x,y,width,height,alpha);
}
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function gameSpriteHTML(atlas,index,label='') {
  if (!Object.hasOwn(GAME_ART,atlas) || atlas==='materials' || !Number.isInteger(index) || index<0 || index>15) return escapeHTML(label);
  return `<span class="wanba-art-sprite" data-art-atlas="${atlas}" role="img" aria-label="${escapeHTML(label)}" style="background-image:url('${GAME_ART[atlas]}');background-size:416.666667% 416.666667%;background-position:${((index%4)+.02)*100/3.04}% ${(Math.floor(index/4)+.02)*100/3.04}%"></span>`;
}
// Existing saved pair identities stay unchanged; only their presentation changes.
const pairSprites = Object.freeze({'🍓':['fruits',1],'🍊':['fruits',3],'🍋':['fruits',12],'🍎':['fruits',5],'🍇':['fruits',2],'🍉':['fruits',10],'🍒':['fruits',0],'🍑':['fruits',7],'🥝':['fruits',13],'🍄':['fruits',8],'🌻':['fruits',9],'🌙':['fruits',15],'⭐':['candy-bubbles',7],'☁️':['candy-bubbles',6],'🐟':['pieces',6],'🐚':['fruits',14],'🍬':['candy-bubbles',4],'🧁':['candy-bubbles',0],'🔔':['pieces',11],'🐾':['pieces',7]});
export function pairSpriteHTML(value) {
  const sprite=pairSprites[value];
  return sprite ? gameSpriteHTML(sprite[0],sprite[1],value) : escapeHTML(value);
}

// Directory artwork uses complete individually illustrated icons.
import { gameArtworkIconV2HTML } from './game-icons.js';
export const gameArtworkIconHTML = gameArtworkIconV2HTML;
