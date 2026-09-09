import test from 'node:test';
import assert from 'node:assert/strict';
import {createArenaGame} from '../src/games/plugins/snake/arena-controller.js';
import {createClassicGame} from '../src/games/plugins/snake/classic.js';
import {createGame} from '../src/games/plugins/snake/index.js';
import {createArena,isArenaState} from '../src/games/plugins/snake/arena-engine.js';
import {arenaProgress} from '../src/games/plugins/snake/arena-save.js';
function harness({mode='normal',dpr=3,state,arenaMode='endless',start=createArenaGame}={}){
  const nodes=new Map(),frames=new Map(),timers=new Map(),saved=[],canvases=[];let clock=0,sequence=0,paused=false,draws=0,disconnected=0;
  const host=new EventTarget(),doc=new EventTarget();host.document=doc;doc.defaultView=host;doc.hidden=false;host.devicePixelRatio=dpr;
  host.CustomEvent=class extends Event{constructor(name,options){super(name);this.detail=options.detail;}};
  host.localStorage={getItem:()=>mode,setItem(){}};doc.documentElement={dataset:{}};doc.getElementById=()=>null;doc.querySelectorAll=()=>[];
  host.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;};host.clearTimeout=id=>timers.delete(id);
  host.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};host.cancelAnimationFrame=id=>frames.delete(id);
  host.ResizeObserver=class{observe(){}disconnect(){disconnected++;}};
  function element(tag='div'){
    const node=new EventTarget();Object.assign(node,{tagName:tag.toUpperCase(),style:{},dataset:{},children:[],width:420,height:420,ownerDocument:doc,innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},getBoundingClientRect:()=>({left:0,top:0,width:360,height:520}),setPointerCapture(){}});
    const gradient={addColorStop(){}};const context=new Proxy({canvas:node,drawImage(){draws++;}}, {get:(target,key)=>key in target?target[key]:String(key).startsWith('create')?()=>gradient:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
    node.getContext=()=>context;node.querySelector=query;node.querySelectorAll=selector=>selector==='[data-snake-mode]'?['endless','timed','classic'].map(name=>{const button=query('mode-'+name);button.dataset.snakeMode=name;return button;}):[];
    if(tag==='canvas')canvases.push(node);return node;
  }
  function query(selector){if(!nodes.has(selector))nodes.set(selector,element(selector==='canvas'||selector==='#wb-canvas'?'canvas':'div'));return nodes.get(selector);}
  doc.createElement=element;doc.head=element();
  const noop=()=>{};const env={get gamePaused(){return paused;},getHostWindow:()=>host,getHostDocument:()=>doc,qs:query,qsa:()=>[],saveProgress:(id,state)=>saved.push(structuredClone(state)),setScore:noop,clearProgress:noop,showGameOver:noop,scheduleFitGameSurface:noop,addSwipe:noop,addTapDirection:noop,speak:noop,isNightTheme:()=>false,settings:()=>({theme:'day'}),canvasThemePalette:()=>({top:'#fff',bottom:'#fff',pattern:'#eee',grid:'#ddd'}),controlModeLabel:()=>'',nextControlMode:()=> 'swipe'};
  const controller=start(env,state,arenaMode);
  const event=(node,type,values={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,values);node.dispatchEvent(event);return event;};
  function frame(at){clock=at;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}const active=[...frames];frames.clear();for(const [,fn]of active)fn(at);}
  return {controller,host,doc,env,query,event,frame,saved,frames,timers,canvases,pause:value=>{paused=value;},get draws(){return draws;},get disconnected(){return disconnected;}};
}

test('arena restores active time and renders a correct 02:59 countdown',()=>{
  const arena=createArena({mode:'timed',seed:3,aiCount:0,foodCount:0});arena.state.ticks=60;
  const h=harness({state:arenaProgress(arena.snapshot())});assert.equal(h.query('[data-arena-clock]').textContent,'02:59');h.controller.destroy();
});
test('pause, hidden and disposal clear held controls and do not advance background time',()=>{
  const h=harness();h.frame(0);h.event(h.query('[data-arena-boost]'),'pointerdown',{pointerId:2});h.frame(100);assert.equal(h.controller.getState().boost,true);
  h.pause(true);h.frame(200);const elapsed=h.controller.getState().elapsed;assert.equal(h.controller.getState().boost,false);assert.equal(h.frames.size,0);assert.equal(h.timers.size,1);
  h.doc.hidden=true;h.event(h.doc,'visibilitychange');assert.equal(h.frames.size+h.timers.size,0);h.frame(60000);assert.equal(h.controller.getState().elapsed,elapsed);
  h.pause(false);h.doc.hidden=false;h.event(h.doc,'visibilitychange');h.frame(60100);assert.equal(h.controller.getState().elapsed,elapsed);h.frame(60200);assert.ok(h.controller.getState().elapsed>elapsed);assert.equal(h.controller.getState().boost,false);
  h.controller.destroy();h.controller.destroy();const draws=h.draws;h.event(h.host,'resize');h.event(h.doc,'visibilitychange');h.frame(60300);assert.equal(h.draws,draws);assert.equal(h.frames.size+h.timers.size,0);assert.equal(h.disconnected,1);assert.ok(h.canvases.every(canvas=>canvas.width===0&&canvas.height===0));
});
test('joystick and boost have independent pointer ownership and persisted arena snapshots remain valid',()=>{
  const h=harness();h.frame(0);const zone=h.query('[data-arena-stickzone]'),boost=h.query('[data-arena-boost]');
  h.event(zone,'pointerdown',{pointerId:1,clientX:60,clientY:350});h.event(zone,'pointermove',{pointerId:1,clientX:80,clientY:410});h.event(boost,'pointerdown',{pointerId:2});h.frame(100);
  assert.equal(h.controller.getState().boost,true);h.event(zone,'pointerup',{pointerId:1});h.frame(200);assert.equal(h.controller.getState().boost,true);
  h.event(boost,'pointercancel',{pointerId:2});h.frame(300);assert.equal(h.controller.getState().boost,false);h.controller.save();assert.ok(isArenaState(h.saved.at(-1).arena));h.controller.destroy();
});
test('three rendering profiles cap DPR while gradients are reused and released',()=>{
  for(const [mode,expected]of [['eco',1],['normal',2],['game',3]]){const h=harness({mode});h.frame(0);const count=h.canvases.length;h.frame(100);h.frame(200);assert.equal(h.controller.getState().render.pixelRatio,expected);assert.ok(h.controller.getState().render.spriteCount<=12);assert.equal(h.canvases.length,count,'frames reuse cached sprite canvases');h.controller.destroy();assert.ok(h.canvases.every(c=>c.width===0));}
});
test('an old classic save resumes unchanged and arena projection remains playable by the classic factory',()=>{
  const old={snake:[{x:10,y:10},{x:9,y:10}],dir:{x:1,y:0},next:{x:1,y:0},food:{x:14,y:14},score:20,controlMode:'swipe'};
  const h=harness({state:old,start:createGame});assert.equal(h.controller.getState().mode,'classic');assert.deepEqual(h.saved[0].snake,old.snake);assert.equal(h.saved[0].score,20);h.controller.destroy();
  const projection=arenaProgress(createArena({seed:1,aiCount:0,foodCount:0}).snapshot());const legacy=harness({state:projection,start:createClassicGame});assert.equal(legacy.controller.getState().mode,'classic');assert.equal(legacy.controller.getState().score,170);legacy.controller.destroy();
});
test('mode selection performs no simulation until a choice and cleans up the selected child',()=>{
  const h=harness({start:createGame});assert.equal(h.controller.getState().mode,'select');assert.equal(h.frames.size+h.timers.size,0);h.query('mode-timed').onclick();assert.equal(h.controller.getState().mode,'timed');assert.equal(h.frames.size,1);h.controller.destroy();assert.equal(h.frames.size+h.timers.size,0);
});
