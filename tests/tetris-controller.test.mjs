import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleGame,battleProgress} from '../src/games/plugins/tetris/battle-controller.js';
import {createClassicGame} from '../src/games/plugins/tetris/classic.js';
import {createGame} from '../src/games/plugins/tetris/index.js';
import {createBattle,isBattleState} from '../src/games/plugins/tetris/battle-engine.js';
function harness({mode='normal',dpr=3,state,battleMode='duel',start=createBattleGame}={}){
  const nodes=new Map(),frames=new Map(),timers=new Map(),saved=[],canvases=[];let clock=0,sequence=0,paused=false,draws=0,disconnected=0;
  const host=new EventTarget(),doc=new EventTarget();host.document=doc;doc.defaultView=host;doc.hidden=false;host.devicePixelRatio=dpr;
  host.CustomEvent=class extends Event{constructor(name,options){super(name);this.detail=options.detail;}};
  host.localStorage={getItem:()=>mode,setItem(){}};doc.documentElement={dataset:{}};doc.getElementById=()=>null;doc.querySelectorAll=()=>[];
  host.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;};host.clearTimeout=id=>timers.delete(id);
  host.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};host.cancelAnimationFrame=id=>frames.delete(id);
  host.ResizeObserver=class{observe(){}disconnect(){disconnected++;}};
  function element(tag='div'){
    const node=new EventTarget();Object.assign(node,{tagName:tag.toUpperCase(),style:{},dataset:{},children:[],width:420,height:420,ownerDocument:doc,innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},getBoundingClientRect:()=>({left:0,top:0,width:360,height:360}),setPointerCapture(){}});
    const gradient={addColorStop(){}};const context=new Proxy({canvas:node,drawImage(){draws++;}}, {get:(target,key)=>key in target?target[key]:String(key).startsWith('create')?()=>gradient:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
    node.getContext=()=>context;node.querySelector=query;node.querySelectorAll=selector=>selector==='[data-tetris-mode]'?['duel','marathon','sprint','classic'].map(name=>{const button=query('mode-'+name);button.dataset.tetrisMode=name;return button;}):selector==='[data-tetris-action]'?['left','right','rotate','soft','hard','hold'].map(name=>{const button=query('action-'+name);button.dataset.tetrisAction=name;return button;}):[];
    if(tag==='canvas')canvases.push(node);return node;
  }
  function query(selector){if(!nodes.has(selector))nodes.set(selector,element(selector.includes('canvas')||selector==='#wb-canvas'?'canvas':'div'));return nodes.get(selector);}
  doc.createElement=element;doc.head=element();
  const noop=()=>{};const env={get gamePaused(){return paused;},getHostWindow:()=>host,getHostDocument:()=>doc,qs:query,qsa:()=>[],saveProgress:(id,state)=>saved.push(structuredClone(state)),setScore:noop,clearProgress:noop,showGameOver:noop,scheduleFitGameSurface:noop,addSwipe:noop,addTapDirection:noop,speak:noop,isNightTheme:()=>false,settings:()=>({theme:'day'}),canvasThemePalette:()=>({top:'#fff',bottom:'#fff',pattern:'#eee',grid:'#ddd'}),controlModeLabel:()=>'',nextControlMode:()=> 'swipe'};
  const controller=start(env,state,battleMode);
  const event=(node,type,values={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,values);node.dispatchEvent(event);return event;};
  function frame(at){clock=at;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}const active=[...frames];frames.clear();for(const [,fn]of active)fn(at);}
  return {controller,host,doc,env,query,event,frame,saved,frames,timers,canvases,pause:value=>{paused=value;},get draws(){return draws;},get disconnected(){return disconnected;}};
}

test('keyboard hold and hard drop save the full battle and compatible classic projection',()=>{
  const h=harness();h.frame(0);h.event(h.doc,'keydown',{key:'c'});assert.equal(h.controller.getState().holdUsed,true);h.event(h.doc,'keyup',{key:'c'});
  h.event(h.doc,'keydown',{key:' '});assert.equal(h.controller.getState().locks,1);assert.ok(h.saved.at(-1).score>0);assert.ok(isBattleState(h.saved.at(-1).battle));assert.equal(h.saved.at(-1).board.length,20);assert.ok(h.saved.at(-1).piece.s.flat().some(Boolean));h.controller.destroy();
});
test('held movement repeats, release stops it, and browser synthetic click does not duplicate a hard drop',()=>{
  const h=harness();h.frame(0);const right=h.query('action-right'),hard=h.query('action-hard');h.event(right,'pointerdown',{pointerId:1});const x=h.controller.getState().current.x;h.frame(200);h.frame(300);assert.ok(h.controller.getState().current.x>x);h.event(right,'pointercancel',{pointerId:1});const released=h.controller.getState().current.x;h.frame(500);assert.equal(h.controller.getState().current.x,released);
  h.event(hard,'pointerdown',{pointerId:2});h.event(hard,'pointerup',{pointerId:2});h.event(hard,'click',{detail:1});assert.equal(h.controller.getState().locks,1);h.event(hard,'click',{detail:0});assert.equal(h.controller.getState().locks,2);h.controller.destroy();
});
test('pause and visibility stop held controls and resume without advancing background time',()=>{
  const h=harness();h.frame(0);h.event(h.query('action-soft'),'pointerdown',{pointerId:1});h.frame(100);h.pause(true);h.frame(200);const before=h.controller.getState();assert.equal(h.frames.size,0);assert.equal(h.timers.size,1);
  h.doc.hidden=true;h.event(h.doc,'visibilitychange');assert.equal(h.frames.size+h.timers.size,0);h.frame(60000);assert.equal(h.controller.getState().ticks,before.ticks);
  h.pause(false);h.doc.hidden=false;h.event(h.doc,'visibilitychange');h.frame(60100);assert.equal(h.controller.getState().ticks,before.ticks);h.frame(60200);assert.equal(h.controller.getState().current.y,before.current.y);h.controller.destroy();const draws=h.draws;h.event(h.host,'resize');h.frame(61000);assert.equal(h.draws,draws);assert.equal(h.frames.size+h.timers.size,0);assert.ok(h.canvases.every(c=>c.width===0&&c.height===0));
});
test('unchanged gravity frames reuse drawing, profile DPR caps and eight block sprites',()=>{
  for(const [mode,ratio]of [['eco',1],['normal',2],['game',3]]){const h=harness({mode});h.frame(0);const before=h.controller.getState().render;const count=h.canvases.length;h.frame(100);h.frame(200);const after=h.controller.getState().render;assert.equal(after.pixelRatio,ratio);assert.equal(after.drawCount,before.drawCount);assert.equal(after.spriteCount,8);assert.equal(h.canvases.length,count);h.controller.destroy();}
});
test('mode page and old classic state dispatch correctly; battle snapshot wins over projection',()=>{
  const menu=harness({start:createGame});assert.equal(menu.controller.getState().mode,'select');assert.equal(menu.frames.size,0);menu.query('mode-sprint').onclick();assert.equal(menu.controller.getState().mode,'sprint');menu.controller.destroy();
  const old={board:Array.from({length:20},()=>Array(10).fill(0)),piece:{s:[[1,1],[1,1]],x:3,y:4},nextPiece:{s:[[1,1,1,1]],x:3,y:0},score:300,totalLines:3};old.board[19][0]=1;
  const classic=harness({start:createGame,state:old});assert.equal(classic.controller.getState().mode,'classic');assert.deepEqual(classic.saved[0].piece,old.piece);assert.equal(classic.saved[0].score,300);classic.controller.destroy();
  const engine=createBattle({seed:2,mode:'marathon'});engine.action('hard');const save=battleProgress(engine.snapshot());const resumed=harness({start:createGame,state:save});assert.equal(resumed.controller.getState().mode,'marathon');assert.equal(resumed.controller.getState().locks,1);resumed.controller.destroy();
  const downgraded=harness({start:createClassicGame,state:save});assert.equal(downgraded.controller.getState().mode,'classic');assert.equal(downgraded.controller.getState().score,save.score);downgraded.controller.destroy();
});

test('held soft drop produces identical logical state at 10, 30, 60 and 120 render Hz',()=>{
  const seed=battleProgress(createBattle({seed:17,mode:'marathon'}).snapshot()),states=[];
  for(const fps of [10,30,60,120]){const h=harness({state:seed});h.frame(0);h.event(h.query('action-soft'),'pointerdown',{pointerId:1});for(let i=1;i<=fps*2;i++)h.frame(i*1000/fps);h.event(h.query('action-soft'),'pointerup',{pointerId:1});h.controller.save();states.push(h.saved.at(-1).battle);h.controller.destroy();}
  for(const state of states.slice(1))assert.deepEqual(state,states[0]);
});

test('a keyboard activation on a focused button is not also treated as a game shortcut',()=>{
  const h=harness();h.frame(0);const hold=h.query('action-hold');hold.tagName='BUTTON';const key=new Event('keydown',{cancelable:true});Object.defineProperty(key,'target',{value:hold});Object.assign(key,{key:' '});h.doc.dispatchEvent(key);assert.equal(h.controller.getState().locks,0);h.event(hold,'click',{detail:0});assert.equal(h.controller.getState().holdUsed,true);h.controller.destroy();
});


test('game long-press suppresses its context menu only until disposal',()=>{
  const h=harness(),root=h.query('.tetris-battle');
  assert.equal(h.event(root,'contextmenu').defaultPrevented,true);
  assert.equal(h.event(h.doc,'contextmenu').defaultPrevented,false,'other application pages keep native text actions');
  h.controller.destroy();
  assert.equal(h.event(root,'contextmenu').defaultPrevented,false,'destroy releases the scoped listener');
});
