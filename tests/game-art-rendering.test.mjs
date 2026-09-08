import test from 'node:test';
import assert from 'node:assert/strict';
import {preloadGameArt,drawGameSprite,BUBBLE_SOURCE_RECTS} from '../standalone/game-art.js';
function host(){
 const draws=[],clips=[],rasters=[];
 const win={Image:class{set src(value){this.complete=true;this.naturalWidth=1536;this.naturalHeight=1024;queueMicrotask(()=>this.onload());}}};
 const doc={defaultView:win,createElement(){const canvas={width:0,height:0,getContext:()=>({drawImage:(...args)=>draws.push(args),beginPath(){},arc(){},clip(){clips.push('offscreen');}})};rasters.push(canvas);return canvas;}};
 const ctx={canvas:{ownerDocument:doc,dataset:{}},globalAlpha:.75,getTransform:()=>({a:3,d:3}),drawImage:(...args)=>draws.push(args),save(){},restore(){},beginPath(){},arc(){},clip(){clips.push('main');}};
 return {win,ctx,draws,clips,rasters};
}
test('dedicated bubble sprites preserve the full padded source without a circular clip',async()=>{
 const h=host();await preloadGameArt(h.win);
 for(let index=0;index<6;index++)assert.equal(drawGameSprite(h.ctx,'bubbles',index,20,30,28,28),true);
 assert.equal(h.clips.length,0);assert.equal(h.rasters.length,6);
 for(let i=0;i<6;i++){assert.deepEqual(h.draws[i*2].slice(1,5),BUBBLE_SOURCE_RECTS[i]);assert.equal(BUBBLE_SOURCE_RECTS[i][2],BUBBLE_SOURCE_RECTS[i][3]);}
 assert.equal(h.ctx.canvas.dataset.gameArt,'bubbles');
});
test('repeated balls reuse rasterized source and preserve the callers alpha',async()=>{
 const h=host();await preloadGameArt(h.win);
 for(let frame=0;frame<60;frame++)for(let bubble=0;bubble<84;bubble++)drawGameSprite(h.ctx,'bubbles',bubble%6,10,20,28,28,.5);
 assert.equal(h.rasters.length,6);assert.equal(h.draws.length,60*84+6);assert.equal(h.ctx.globalAlpha,.75);
 assert.equal(drawGameSprite(h.ctx,'bubbles',6,0,0,20,20),false);
 assert.equal(drawGameSprite(h.ctx,'bubbles',0,0,0,0,20),false);
});
test('animated size cache evicts old variants instead of retaining unbounded canvases',async()=>{
 const h=host();await preloadGameArt(h.win);
 for(let i=0;i<150;i++)drawGameSprite(h.ctx,'bubbles',i%6,0,0,8+i,8+i);
 const before=h.rasters.length;drawGameSprite(h.ctx,'bubbles',0,0,0,8,8);assert.equal(h.rasters.length,before+1,'oldest small raster was evicted');
});
