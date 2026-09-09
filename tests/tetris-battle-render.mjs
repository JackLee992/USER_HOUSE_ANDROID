// Real offline Canvas rendering only; the composed image does not test DOM/native layout.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBattle,chooseAI} from '../src/games/plugins/tetris/battle-engine.js';
import {createBattleRenderer} from '../src/games/plugins/tetris/battle-renderer.js';
const require=createRequire(import.meta.url),{createCanvas}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const out=resolve(process.env.QA_OUT||'.local/qa-tetris-battle');mkdirSync(out,{recursive:true});
const engine=createBattle({seed:471,mode:'duel'});
for(let step=0;step<6;step++){const choice=chooseAI(engine.player);if(choice){for(let r=0;r<choice.rotations;r++)engine.action('rotate');while(engine.player.current.x!==choice.x&&engine.action(engine.player.current.x>choice.x?'left':'right')){}engine.action('hard');}for(let tick=0;tick<126;tick++)engine.advance(1/60);}
engine.action('hold');
const results=[];
for(const [mode,layout,width,height] of [['eco','normal',340,400],['normal','normal',340,400],['game','normal',340,400],['normal','narrow-tall',220,600],['normal','landscape-short',620,236]]){
 const doc={documentElement:{dataset:{}},querySelectorAll:()=>[],createElement:()=>{const c=createCanvas(40,40);c.style={};return c;}};
 const host={document:doc,devicePixelRatio:3,localStorage:{getItem:()=>mode}};
 const canvases=Object.fromEntries(['board','hold','next','opponent'].map(key=>{const canvas=createCanvas(100,100);canvas.style={};return[key,canvas];}));
 const renderer=createBattleRenderer(canvases,host,doc);renderer.resize(width,height);const start=performance.now();renderer.draw(engine.state);const cpuDrawMs=performance.now()-start;
 const page=createCanvas((width+32)*2,(height+72)*2),ctx=page.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#eef2f7';ctx.fillRect(0,0,width+32,height+72);ctx.fillStyle='#314b6f';ctx.font='bold 13px sans-serif';ctx.fillText('OFFLINE AI DUEL',16,24);
 const stats=renderer.getStats(),sideX=28+stats.width;const sideHeight=4*stats.side+56;if(sideHeight>height)throw new Error('sidebar exceeds stage');if(stats.width+84+12>width)throw new Error('board and label column exceed stage');
 ctx.drawImage(canvases.board,16,42,stats.width,stats.height);
 const preview=(name,label,y)=>{ctx.fillStyle='#60718a';ctx.font='10px sans-serif';ctx.fillText(label,sideX,y);const canvas=canvases[name];ctx.drawImage(canvas,sideX,y+5,parseFloat(canvas.style.width),parseFloat(canvas.style.height));};
 preview('hold','HOLD',49);preview('next','NEXT 3',49+stats.side*.6+20);preview('opponent','OFFLINE AI',49+stats.side*2+40);
 writeFileSync(resolve(out,(layout==='normal'?mode:layout)+'.png'),page.toBuffer('image/png'));results.push({mode,layout,stageWidth:width,stageHeight:height,sideHeight,...stats,cpuDrawMs,measurement:'single Node Canvas draw; not browser, device FPS, or DOM layout'});renderer.destroy();
}
writeFileSync(resolve(out,'render.json'),JSON.stringify({scene:'seed 471; legal player placement and AI game steps; independent previews',results},null,2)+'\n');console.log(out);
