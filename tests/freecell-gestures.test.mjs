import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeCellGame} from '../src/games/freecell.js';

const card=(s,r)=>s*13+r-1;
const col=(index,cardIndex=0)=>({type:'column',index,cardIndex});
function board(columns=[],freecells=[null,null,null,null],counts=[0,0,0,0],autoHome=false){
  const foundations=counts.map((n,s)=>Array.from({length:n},(_,i)=>card(s,i+1)));
  const used=new Set([...columns.flat(),...freecells.filter(c=>c!==null),...foundations.flat()]);
  const cols=Array.from({length:8},(_,i)=>columns[i]?.slice()||[]);
  cols[7].unshift(...Array.from({length:52},(_,i)=>i).filter(c=>!used.has(c)));
  return {columns:cols,freecells,foundations,moves:0,history:[],autoHome};
}
function controller(state){
  const listeners=new Map(),effects={saves:0,finished:0,toasts:[]};let paused=false;
  const root={innerHTML:'',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const game=createFreeCellGame({root,document:{getElementById:()=>true},isPaused:()=>paused,isActive:()=>true,save:()=>effects.saves++,clear(){},finish:()=>effects.finished++,toast:text=>effects.toasts.push(text),speak(){},setScore(){}},state);
  function target(p){
    const s=game.getState(),dataset=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,String(v)]));
    const value=p.type==='column'?s.columns[p.index][p.cardIndex]:p.type==='freecell'?s.freecells[p.index]:s.foundations[p.index].at(-1);
    if(value!==undefined&&value!==null)dataset.card=String(value);
    return {closest:selector=>selector==='[data-type]'?{dataset}:null};
  }
  const dispatch=(type,target,timeStamp,detail=1)=>listeners.get(type)?.({target,timeStamp,detail,preventDefault(){}});
  return {game,root,effects,listeners,target,dispatch,pause:()=>paused=true,
    click:(p,at,detail=1)=>dispatch('click',target(p),at,detail),
    action:action=>dispatch('click',{closest:selector=>selector==='[data-action]'?{dataset:{action}}:null},1000,0)};
}

test('two touch-style clicks across redraw explicitly home one legally eligible unsafe card',()=>{
  const s=board([[card(0,4)]],undefined,[3,2,3,0]),ui=controller(s);
  ui.click(col(0),100);assert.match(ui.root.innerHTML,/fc-card[^"\n]*selected/);
  ui.click(col(0),220);const next=ui.game.getState();
  assert.deepEqual(next.columns[0],[]);assert.equal(next.foundations[0].length,4);
  assert.equal(next.moves,1);assert.equal(next.history.length,1);
  ui.action('undo');assert.deepEqual(ui.game.getState(),s);ui.game.destroy();
});

test('desktop click/click/dblclick cannot collect the next newly exposed card',()=>{
  const s=board([[card(0,2),card(0,1)]]),ui=controller(s),ace=col(0,1);
  const stale=ui.target(ace);ui.click(ace,100);ui.click(ace,200);
  ui.dispatch('dblclick',ui.target(col(0)),201,2);
  ui.dispatch('dblclick',stale,202,2);
  assert.deepEqual(ui.game.getState().foundations[0],[card(0,1)]);
  assert.deepEqual(ui.game.getState().columns[0],[card(0,2)]);
  assert.equal(ui.game.getState().moves,1);ui.game.destroy();
});

test('freecell double tap homes its card and a native dblclick fallback also works',()=>{
  const s=board([[card(0,1)]],[card(2,1),null,null,null]),ui=controller(s),cell={type:'freecell',index:0};
  ui.click(cell,100);ui.click(cell,200);
  assert.equal(ui.game.getState().freecells[0],null);assert.deepEqual(ui.game.getState().foundations[2],[card(2,1)]);
  ui.dispatch('dblclick',ui.target(col(0)),800,2);
  assert.deepEqual(ui.game.getState().foundations[0],[card(0,1)]);assert.equal(ui.game.getState().moves,2);ui.game.destroy();
});

test('an illegal double tap cancels an ambiguous destination without moving another selected card',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const s=board([[card(1,6)],[card(0,7)]]),ui=controller(s);
  ui.click(col(0),100);ui.click(col(1),200);
  assert.deepEqual(ui.game.getState(),s);
  ui.click(col(1),300);t.mock.timers.tick(1000);
  assert.deepEqual(ui.game.getState(),s);assert.equal(ui.effects.saves,1);ui.game.destroy();
});

test('single-click occupied targets still move after the gesture window; empty targets move immediately',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const s=board([[card(1,6)],[card(0,7)]]),ui=controller(s);
  ui.click(col(0),100);ui.click(col(1),200);t.mock.timers.tick(401);
  assert.deepEqual(ui.game.getState().columns[1],[card(0,7),card(1,6)]);
  assert.equal(ui.game.getState().moves,1);
  ui.click(col(1,1),700);ui.click({type:'freecell',index:0},800);
  assert.equal(ui.game.getState().freecells[0],card(1,6));assert.equal(ui.game.getState().moves,2);ui.game.destroy();
});

test('a third different click commits a pending move once and revalidates the next selection',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const s=board([[card(1,6)],[card(0,7)],[card(3,9)]]),ui=controller(s);
  ui.click(col(0),100);ui.click(col(1),200);ui.click(col(2),250);
  assert.equal(ui.game.getState().moves,1);
  ui.click({type:'freecell',index:0},300);t.mock.timers.tick(1000);
  assert.equal(ui.game.getState().freecells[0],card(3,9));assert.equal(ui.game.getState().moves,2);ui.game.destroy();
  const stale=controller(s);stale.click(col(0),100);stale.click(col(1),200);stale.click(col(0),250);
  stale.click({type:'freecell',index:0},300);t.mock.timers.tick(1000);
  assert.equal(stale.game.getState().freecells[0],null);assert.equal(stale.game.getState().moves,1);stale.game.destroy();
});

test('a legal double tap with an existing selection homes only the tapped card',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const s=board([[card(1,3)],[card(0,4)]],undefined,[3,2,0,0]),ui=controller(s);
  ui.click(col(0),100);ui.click(col(1),200);ui.click(col(1),300);t.mock.timers.tick(1000);
  const next=ui.game.getState();assert.deepEqual(next.columns[0],s.columns[0]);assert.deepEqual(next.columns[1],[]);
  assert.equal(next.foundations[0].length,4);assert.equal(next.moves,1);
  ui.action('undo');assert.deepEqual(ui.game.getState(),s);ui.game.destroy();
});

test('double tapping a buried card or a foundation never skips to another card',()=>{
  const s=board([[card(0,1),card(1,2)]]),ui=controller(s);
  ui.click(col(0),100);ui.click(col(0),200);
  assert.deepEqual(ui.game.getState(),s);
  ui.dispatch('dblclick',ui.target({type:'foundation',index:0}),700,2);
  assert.deepEqual(ui.game.getState(),s);ui.game.destroy();
});

test('keyboard activation and slow repeated clicks retain selection behavior',()=>{
  const s=board([[card(0,1)]]),ui=controller(s);
  ui.click(col(0),100,0);ui.click(col(0),200,0);assert.deepEqual(ui.game.getState(),s);
  ui.click(col(0),700);ui.click(col(0),1200);assert.deepEqual(ui.game.getState(),s);ui.game.destroy();
});

test('explicit double tap and enabled safe follow-up collection are one undo transaction',()=>{
  const s=board([[card(0,2),card(0,1)],[card(1,1)]],undefined,undefined,true),ui=controller(s);
  ui.click(col(0,1),100);ui.click(col(0,1),200);
  assert.deepEqual(ui.game.getState().foundations[0],[card(0,1),card(0,2)]);
  assert.deepEqual(ui.game.getState().foundations[1],[card(1,1)]);
  assert.equal(ui.game.getState().moves,1);assert.equal(ui.game.getState().history.length,1);
  ui.action('undo');assert.deepEqual(ui.game.getState(),s);ui.game.destroy();
});

test('pending moves do not run after pause, undo, or destroy',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const stop of ['pause','undo','destroy']){
    const s=board([[card(1,6)],[card(0,7)]]),ui=controller(s);
    ui.click(col(0),100);ui.click(col(1),200);
    if(stop==='pause')ui.pause();else if(stop==='undo')ui.action('undo');else ui.game.destroy();
    t.mock.timers.tick(1000);assert.deepEqual(ui.game.getState(),s);
    ui.game.destroy();assert.equal(ui.listeners.size,0);
  }
});

test('winning double tap settles once, even if a late native dblclick follows',()=>{
  const s=board([[card(0,13)]],undefined,[12,13,13,13]),ui=controller(s),target=ui.target(col(0));
  ui.click(col(0),100);ui.click(col(0),200);ui.dispatch('dblclick',target,201,2);
  assert.equal(ui.effects.finished,1);assert.equal(ui.game.getState().moves,1);ui.game.destroy();
});

test('fullscreen surface enters native immersive mode and exits cleanly',()=>{
  const listeners=new Map(),immersive=[],pauses=[],saves=[];
  const makeEl=()=>({
    innerHTML:'',dataset:{},attrs:{},children:[],isConnected:false,
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:name=>listeners.delete(name),
    setAttribute(name,value){this.attrs[name]=String(value);},
    append(...nodes){this.children.push(...nodes);},
    remove(){this.removed=true;this.isConnected=false;},
  });
  const root=makeEl(),surface=makeEl();
  const doc={getElementById:()=>true,createElement:()=>surface,body:{append(node){node.isConnected=true;}},head:{append(){}}};
  const game=createFreeCellGame({
    root,document:doc,window:{NativeBridge:{setGameImmersive:value=>immersive.push(value)}},
    isPaused:()=>pauses.at(-1)===true,isActive:()=>true,setPaused:value=>pauses.push(value),
    save:state=>saves.push(state),clear(){},finish(){},toast(){},speak(){},setScore(){},exit(){pauses.push('exit');}
  },board());
  assert.equal(root.innerHTML,'');
  assert.equal(surface.id,'wb-freecell-fullscreen');
  assert.equal(surface.className,'wb-freecell');
  assert.match(surface.innerHTML,/data-action="pause"/);
  assert.deepEqual(immersive,[true]);
  listeners.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'pause'}}:null},preventDefault(){},detail:1,timeStamp:1});
  assert.deepEqual(pauses,[true]);
  assert.match(surface.innerHTML,/data-freecell-mask/);
  assert.doesNotMatch(surface.innerHTML,/data-freecell-mask hidden/);
  listeners.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'resume'}}:null},preventDefault(){},detail:1,timeStamp:2});
  assert.deepEqual(pauses,[true,false]);
  listeners.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'exit'}}:null},preventDefault(){},detail:1,timeStamp:3});
  assert.deepEqual(immersive,[true,false]);
  assert.equal(surface.removed,true);
  assert.equal(pauses.at(-1),'exit');
  const count=saves.length;
  game.destroy();
  assert.deepEqual(immersive,[true,false]);
  assert.equal(saves.length,count);
  assert.equal(listeners.size,0);
});
