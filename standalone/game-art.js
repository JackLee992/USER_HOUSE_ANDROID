// Immutable raster assets shared by the independently versioned game plugins.
export const GAME_ART_VERSION = '1.0.0';
export const GAME_ART = Object.freeze(Object.fromEntries(['candy-bubbles','fruits','materials','pieces'].map(name => [name,new URL('../assets/game-art/premium/v1/' + name + '.png',import.meta.url).href])));
const stores = new WeakMap();
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
  const grid=atlas==='materials'?2:4;
  if (!img?.complete || !img.naturalWidth || !Number.isInteger(index) || index<0 || index>=grid*grid || width<=0 || height<=0) return false;
  const sw=img.naturalWidth/grid,sh=img.naturalHeight/grid;
  ctx.save(); ctx.globalAlpha*=alpha;
  if(atlas==='candy-bubbles'&&index>=8&&index<=13){ctx.beginPath();ctx.arc(x+width/2,y+height/2,Math.min(width,height)*.445,0,Math.PI*2);ctx.clip();}
  // Trim the transparent sprite cell margins so neighboring cells never bleed at small sizes.
  const inset=atlas==='materials'?0:.02;
  ctx.drawImage(img,((index%grid)+inset)*sw,(Math.floor(index/grid)+inset)*sh,sw*(1-inset*2),sh*(1-inset*2),x,y,width,height);
  ctx.restore();
  if (ctx.canvas.dataset) {
    const used=(ctx.canvas.dataset.gameArt || '').split(' ').filter(Boolean);
    if (!used.includes(atlas)) ctx.canvas.dataset.gameArt=[...used,atlas].join(' ');
  }
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

const ART_ICONS = Object.freeze({"tetris":["candy-bubbles",5,"▦"],"snake":["candy-bubbles",10,"→"],"game2048":["candy-bubbles",15,"2048"],"watermelon":["fruits",10,""],"memory":["fruits",1,"2×"],"jump":["pieces",7,"↑"],"plank":["pieces",7,"━"],"sudoku":["candy-bubbles",15,"1–9"],"minesweeper":["candy-bubbles",14,""],"uyangle":["fruits",0,"3×"],"screw":["pieces",12,""],"popstar":["candy-bubbles",3,""],"paopao":["candy-bubbles",9,""],"game1010":["candy-bubbles",15,"10×10"],"turkey":["candy-bubbles",5,"↔"],"spider":["pieces",5,"♠"],"linklink":["fruits",4,"2×"],"shuerte":["candy-bubbles",15,"1→25"],"pinball":["candy-bubbles",6,"★"],"match3":["candy-bubbles",0,"3"],"freecell":["pieces",4,"A♠"],"zuma":["pieces",6,""],"watersort":["candy-bubbles",9,"↕"],"ludo":["pieces",8,""],"guessnumber":["candy-bubbles",15,"1234"],"wordguess":["candy-bubbles",15,"ABC"],"tictactoe":["pieces",3,"X O"],"gomoku":["pieces",0,"5"],"territory":["pieces",15,"□"],"oldmaid":["pieces",7,"J"],"reversi":["pieces",0,"●○"],"bombnumber":["candy-bubbles",14,"1–99"],"connect4d":["pieces",3,"4"],"draughts":["pieces",2,"☆"],"blackjack":["pieces",4,"21"],"westernchess":["pieces",4,"♔"],"chinesechess":["pieces",1,"将"]});
export function gameArtworkIconHTML(id) {
  const spec=ART_ICONS[id];
  if(!spec)return '';
  return `<div class="wb-game-icon wanba-game-art-icon" aria-hidden="true">${gameSpriteHTML(spec[0],spec[1])}${spec[2]?`<b class="wanba-art-icon-mark">${escapeHTML(spec[2])}</b>`:''}</div>`;
}
