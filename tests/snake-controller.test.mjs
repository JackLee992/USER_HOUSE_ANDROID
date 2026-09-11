import test from 'node:test';
import assert from 'node:assert/strict';
import {createArenaGame} from '../src/games/plugins/snake/arena-controller.js';
import {createClassicGame} from '../src/games/plugins/snake/classic.js';
import {createGame} from '../src/games/plugins/snake/index.js';
import {createArena,isArenaState} from '../src/games/plugins/snake/arena-engine.js';
import {arenaProgress} from '../src/games/plugins/snake/arena-save.js';
function harness({mode='normal',dpr=3,state,arenaMode='endless',start=createArenaGame}={}){
  const nodes=new Map(),frames=new Map(),timers=new Map(),saved=[],canvases=[],immersive=[];let clock=0,sequence=0,paused=false,draws=0,disconnected=0;
  const host=new EventTarget(),doc=new EventTarget();host.document=doc;doc.defaultView=host;doc.hidden=false;host.devicePixelRatio=dpr;
  host.CustomEvent=class extends Event{constructor(name,options){super(name);this.detail=options.detail;}};
  host.NativeBridge={setGameImmersive:value=>immersive.push(value)};
  host.localStorage={getItem:()=>mode,setItem(){}};doc.documentElement={dataset:{}};doc.getElementById=()=>null;doc.querySelectorAll=()=>[];
  host.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;};host.clearTimeout=id=>timers.delete(id);
  host.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};host.cancelAnimationFrame=id=>frames.delete(id);
  host.ResizeObserver=class{observe(){}disconnect(){disconnected++;}};
  function element(tag='div'){
    const attrs=new Map(),classes=new Set();
    const node=new EventTarget();Object.assign(node,{tagName:tag.toUpperCase(),style:{},dataset:{},children:[],width:420,height:420,ownerDocument:doc,innerHTML:'',textContent:'',hidden:false,isConnected:true,id:'',className:'',
      classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},toggle(name,value){const on=value===undefined?!classes.has(name):!!value;if(on)classes.add(name);else classes.delete(name);return on;},contains:name=>classes.has(name)},
      append(...values){this.children.push(...values);for(const child of values)if(child&&typeof child==='object'){child.parentNode=this;child.isConnected=true;}},prepend(...values){this.children.unshift(...values);for(const child of values)if(child&&typeof child==='object'){child.parentNode=this;child.isConnected=true;}},replaceChildren(...values){this.children=values;for(const child of values)if(child&&typeof child==='object'){child.parentNode=this;child.isConnected=true;}},remove(){this.isConnected=false;this.parentNode=null;},click(){this.dispatchEvent(new Event('click',{cancelable:true}));},
      setAttribute(name,value){attrs.set(name,String(value));if(name==='id')this.id=String(value);if(name==='class')this.className=String(value);},getAttribute:name=>attrs.get(name)??null,hasAttribute:name=>attrs.has(name),removeAttribute:name=>attrs.delete(name),
      getBoundingClientRect:()=>({left:0,top:0,width:360,height:520}),setPointerCapture(){},releasePointerCapture(){}});
    const gradient={addColorStop(){}};const context=new Proxy({canvas:node,drawImage(){draws++;}}, {get:(target,key)=>key in target?target[key]:String(key).startsWith('create')?()=>gradient:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
    node.getContext=()=>context;node.querySelector=query;node.querySelectorAll=selector=>{
      if(selector==='[data-snake-mode]')return ['endless','timed','classic'].map(name=>{const button=query('mode-'+name);button.dataset.snakeMode=name;return button;});
      if(selector==='[data-classic-dir]')return ['up','left','right','down'].map(name=>{const button=query('classic-'+name);button.dataset.classicDir=name;return button;});
      if(selector==='[data-classic-speed-mode]')return ['relaxed','classic','turbo'].map(name=>{const button=query('speed-'+name);button.dataset.classicSpeedMode=name;return button;});
      return [];
    };
    if(tag==='canvas')canvases.push(node);return node;
  }
  function query(selector){if(!nodes.has(selector)){const node=element(selector==='canvas'||selector==='#wb-canvas'?'canvas':'div');if(selector==='.snake-arena'){node.id='wb-snake-fullscreen';node.classList.add('snake-arena');}nodes.set(selector,node);}return nodes.get(selector);}
  doc.createElement=element;doc.head=element();
  const noop=()=>{};const env={get gamePaused(){return paused;},set gamePaused(value){paused=!!value;},getHostWindow:()=>host,getHostDocument:()=>doc,qs:query,qsa:()=>[],saveProgress:(id,state)=>saved.push(structuredClone(state)),setScore:noop,clearProgress:noop,showGameOver:noop,scheduleFitGameSurface:noop,hideGamePauseOverlay:noop,addSwipe:noop,addTapDirection:noop,speak:noop,isNightTheme:()=>false,settings:()=>({theme:'day'}),canvasThemePalette:()=>({top:'#fff',bottom:'#fff',pattern:'#eee',grid:'#ddd'}),controlModeLabel:()=>'',nextControlMode:()=> 'swipe'};
  const controller=start(env,state,arenaMode);
  const event=(node,type,values={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,values);node.dispatchEvent(event);return event;};
  function frame(at){clock=at;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}const active=[...frames];frames.clear();for(const [,fn]of active)fn(at);}
  return {controller,host,doc,env,query,event,frame,saved,frames,timers,canvases,immersive,pause:value=>{paused=value;},get draws(){return draws;},get disconnected(){return disconnected;}};
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
test('arena owns a fullscreen surface and native immersive state while active',()=>{
  const h=harness();
  assert.equal(h.controller.getState().fullscreen,true);
  assert.equal(h.query('[data-arena-pause]').getAttribute('aria-pressed'),'false');
  assert.deepEqual(h.immersive,[true]);
  h.event(h.query('[data-arena-pause]'),'click');
  assert.equal(h.controller.getState().paused,true);
  assert.equal(h.query('[data-arena-pause]').textContent,'继续');
  assert.equal(h.query('[data-arena-pause-mask]').hidden,false);
  h.event(h.query('[data-arena-resume]'),'click');
  assert.equal(h.controller.getState().paused,false);
  h.controller.destroy();
  assert.equal(h.immersive.at(-1),false);
});
test('joystick and boost have independent pointer ownership and persisted arena snapshots remain valid',()=>{
  const h=harness();h.frame(0);const zone=h.query('[data-arena-stickzone]'),boost=h.query('[data-arena-boost]');
  h.event(zone,'pointerdown',{pointerId:1,clientX:60,clientY:350});h.event(h.doc,'pointermove',{pointerId:1,clientX:110,clientY:295});assert.ok(Number.isFinite(h.controller.getState().steering));h.event(boost,'pointerdown',{pointerId:2});h.frame(100);
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
test('classic mode preserves negative saved directions, grows one cell per fruit, and owns immersive fullscreen',()=>{
  const saved={snake:[{x:10,y:10},{x:11,y:10},{x:12,y:10},{x:13,y:10}],dir:{x:-1,y:0},next:{x:-1,y:0},food:{x:9,y:10},score:20,controlMode:'swipe'};
  const h=harness({state:saved,start:createClassicGame});
  assert.equal(h.controller.getState().fullscreen,true);assert.deepEqual(h.immersive,[true]);assert.deepEqual(h.controller.getState().dir,{x:-1,y:0});
  h.frame(h.controller.getState().delay);
  const played=h.controller.getState();assert.equal(played.score,30);assert.equal(played.snake.length,5);assert.deepEqual(played.snake[0],{x:9,y:10});
  h.controller.destroy();assert.equal(h.immersive.at(-1),false);
});
test('classic controls queue rapid legal turns while non-board taps never steer',()=>{
  const h=harness({start:createClassicGame});
  assert.equal(h.controller.getState().ready,true);assert.equal(h.timers.size,0,'fresh classic games wait for the player');
  h.event(h.query('#wb-snake-classic-fullscreen'),'pointerdown',{pointerId:4,clientX:20,clientY:20});h.event(h.query('#wb-snake-classic-fullscreen'),'pointerup',{pointerId:4,clientX:20,clientY:20});
  assert.deepEqual(h.controller.getState().queued,[],'header and control taps must not become board steering');
  h.event(h.query('classic-up'),'pointerdown',{pointerId:1});h.event(h.query('classic-left'),'pointerdown',{pointerId:2});h.event(h.query('classic-down'),'pointerdown',{pointerId:3});
  assert.equal(h.controller.getState().ready,false);assert.equal(h.timers.size,1,'the first valid direction starts the clock');
  assert.deepEqual(h.controller.getState().queued,['up','left','down']);
  h.event(h.query('classic-right'),'pointerdown',{pointerId:4});
  assert.deepEqual(h.controller.getState().queued,['up','left','down'],'a full queue keeps the earliest committed turns');
  h.controller.destroy();
});
test('classic speed presets are slower by default, apply immediately, and survive restart and save',()=>{
  const h=harness({start:createClassicGame});
  assert.equal(h.controller.getState().speedMode,'classic');assert.equal(h.controller.getState().delay,160);
  h.query('speed-relaxed').click();assert.equal(h.controller.getState().speedMode,'relaxed');assert.equal(h.controller.getState().delay,210);assert.equal(h.saved.at(-1).speedMode,'relaxed');
  h.event(h.query('classic-up'),'pointerdown',{pointerId:1});assert.equal([...h.timers.values()][0].at,210);
  h.query('speed-turbo').click();assert.equal(h.controller.getState().speedMode,'turbo');assert.equal(h.controller.getState().delay,110);assert.equal([...h.timers.values()][0].at,110);
  h.query('[data-classic-restart]').click();assert.equal(h.controller.getState().speedMode,'turbo');assert.equal(h.controller.getState().ready,true);assert.equal(h.controller.getState().delay,110);
  h.controller.destroy();
  const restored=harness({start:createClassicGame,state:{snake:[{x:10,y:10},{x:9,y:10}],dir:{x:1,y:0},next:{x:1,y:0},food:{x:14,y:14},score:20,speedMode:'relaxed'}});assert.equal(restored.controller.getState().speedMode,'relaxed');assert.equal(restored.controller.getState().delay,204);restored.controller.destroy();
});
test('classic return button exits through the legacy host back control',()=>{
  const h=harness({start:createClassicGame});let backs=0;h.query('#wb-back').addEventListener('click',()=>backs++);
  h.query('[data-classic-exit]').click();assert.equal(backs,1);assert.equal(h.immersive.at(-1),false);h.controller.destroy();
});
test('mode selection performs no simulation until a choice and cleans up the selected child',()=>{
  const h=harness({start:createGame});assert.equal(h.controller.getState().mode,'select');assert.equal(h.frames.size+h.timers.size,0);h.query('mode-timed').onclick();assert.equal(h.controller.getState().mode,'timed');assert.equal(h.frames.size,1);h.controller.destroy();assert.equal(h.frames.size+h.timers.size,0);
});


test('game long-press suppresses its context menu only until disposal',()=>{
  const h=harness(),root=h.query('.snake-arena');
  assert.equal(h.event(root,'contextmenu').defaultPrevented,true);
  assert.equal(h.event(h.doc,'contextmenu').defaultPrevented,false,'other application pages keep native text actions');
  h.controller.destroy();
  assert.equal(h.event(root,'contextmenu').defaultPrevented,false,'destroy releases the scoped listener');
});
