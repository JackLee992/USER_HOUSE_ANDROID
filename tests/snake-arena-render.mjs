// Offline Canvas render evidence only; this does not exercise a browser or native UI.
// CANVAS_MODULE may point to an installed @napi-rs/canvas module. No game dependency is added.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createArena} from '../src/games/plugins/snake/arena-engine.js';
import {createArenaRenderer} from '../src/games/plugins/snake/arena-renderer.js';
const require=createRequire(import.meta.url);
const {createCanvas}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const out=resolve(process.env.QA_OUT||'.local/qa-snake-arena');mkdirSync(out,{recursive:true});
const arena=createArena({seed:471,aiCount:7});arena.setInput({angle:-.4});for(let i=0;i<180;i++)arena.advance(1/60);
const results=[];
for(const mode of ['eco','normal','game']){
 const doc={documentElement:{dataset:{}},querySelectorAll:()=>[],createElement:()=>{const canvas=createCanvas(64,64);canvas.style={};return canvas;}};
 const host={document:doc,devicePixelRatio:3,localStorage:{getItem:()=>mode}},canvas=createCanvas(360,520);canvas.style={};
 const renderer=createArenaRenderer(canvas,host,doc);renderer.resize(360,520);const start=performance.now();renderer.draw(arena.state);const elapsed=performance.now()-start;
 writeFileSync(resolve(out,mode+'.png'),canvas.toBuffer('image/png'));results.push({mode,...renderer.getStats(),cpuDrawMs:elapsed,measurement:'single Node Canvas draw, not device FPS'});renderer.destroy();
}
writeFileSync(resolve(out,'render.json'),JSON.stringify({scene:'seed 471, 3 simulated seconds, 7 offline AI opponents',results},null,2)+'\n');console.log(out);
