import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENA_RULES,createArena} from '../src/games/plugins/snake/arena-engine.js';

test('continuous steering turns at a bounded rate and moves in real time',()=>{
  const arena=createArena({seed:4,aiCount:0,foodCount:0});
  const player=arena.state.snakes[0],x=player.x;
  arena.setInput({angle:Math.PI/2});
  arena.advance(.1);
  assert.ok(player.x>x,'the simulation must advance rather than depend on render count');
  assert.ok(player.angle>.65&&player.angle<Math.PI/2,'turning is responsive, but not an instant reversal');
});

const run=(arena,seconds,fps=60)=>{for(let i=0;i<seconds*fps;i++)arena.advance(1/fps);};
test('boost is faster, spends length, and automatically stops at the safe minimum',()=>{
  const normal=createArena({seed:2,aiCount:0,foodCount:0}),fast=createArena({seed:2,aiCount:0,foodCount:0});
  fast.setInput({boost:true});run(normal,1);run(fast,1);
  assert.ok(fast.state.snakes[0].x-normal.state.snakes[0].x>200);
  assert.ok(fast.state.snakes[0].length<normal.state.snakes[0].length);
  fast.state.snakes[0].length=100.1;run(fast,1);
  assert.ok(fast.state.snakes[0].length>=100);assert.equal(fast.state.snakes[0].alive,true);assert.equal(fast.state.snakes[0].boost,false);
});
test('food is consumed once and grows the player',()=>{
  const arena=createArena({seed:2,aiCount:0,foodCount:0}),player=arena.state.snakes[0];
  arena.state.food.push({id:1,x:player.x+3,y:player.y,value:2,color:2});
  arena.advance(1/60);assert.equal(player.length,222);assert.equal(player.eaten,1);assert.equal(arena.state.food.length,0);
  arena.advance(1/60);assert.equal(player.length,222);
});

test('several nearby pellets create a visible body-length gain without boost',()=>{
  const arena=createArena({seed:2,aiCount:0,foodCount:0}),player=arena.state.snakes[0];
  player.angle=0;player.target=0;player.x=900;player.y=700;player.length=170;player.body=Array.from({length:35},(_,i)=>({x:900-i*5,y:700}));
  for(let i=1;i<=5;i++)arena.state.food.push({id:i,x:900+i*18,y:700,value:1,color:i%6});
  const beforeLength=player.length,beforeSegments=player.body.length;
  for(let i=0;i<60;i++)arena.advance(1/60);
  assert.equal(player.eaten,5);
  assert.ok(player.length-beforeLength>=90,`expected visible length gain, got ${player.length-beforeLength}`);
  assert.ok(player.body.length-beforeSegments>=15,`expected more rendered body samples, got ${player.body.length-beforeSegments}`);
  assert.equal(player.boost,false);
});

test('head into another body eliminates the snake and leaves collectible food',()=>{
  const arena=createArena({seed:2,aiCount:1,foodCount:0}),[player,other]=arena.state.snakes;
  arena.state.ticks=ARENA_RULES.spawnShieldTicks;
  Object.assign(other,{x:960,y:680,angle:0,target:0,body:[{x:960,y:680},{x:955,y:680},{x:950,y:680},{x:945,y:680},{x:940,y:690},{x:920,y:700},{x:905,y:700}]});
  arena.advance(1/60);assert.equal(player.alive,false);assert.equal(arena.state.ended,'collision');assert.ok(arena.state.food.length>0);assert.equal(other.kills,1);
});
test('head-on collisions resolve simultaneously and own body does not eliminate the player',()=>{
  const arena=createArena({seed:2,aiCount:1,foodCount:0}),[player,other]=arena.state.snakes;
  arena.state.ticks=ARENA_RULES.spawnShieldTicks;
  Object.assign(other,{x:922,y:700,angle:Math.PI,target:Math.PI,body:Array.from({length:35},(_,i)=>({x:922+i*5,y:700}))});
  arena.advance(1/60);assert.equal(player.alive,false);assert.equal(other.alive,false);
  const solo=createArena({seed:2,aiCount:0,foodCount:0});solo.state.snakes[0].body.push({x:902,y:700});solo.advance(1/60);assert.equal(solo.state.snakes[0].alive,true);
});
test('the player has a visible three-second spawn shield, then normal body collisions apply',()=>{
  const arena=createArena({seed:3,aiCount:1,foodCount:0}),[player,other]=arena.state.snakes;
  const crossingBody=()=>Array.from({length:31},(_,i)=>({x:1050-i*5,y:700}));
  Object.assign(other,{x:1050,y:700,angle:0,target:0,body:crossingBody()});
  arena.advance(1/60);assert.equal(player.alive,true);assert.equal(arena.state.ended,null);
  arena.state.ticks=ARENA_RULES.spawnShieldTicks;Object.assign(player,{x:900,y:700,angle:0,target:0,alive:true,body:Array.from({length:35},(_,i)=>({x:900-i*5,y:700}))});Object.assign(other,{x:1050,y:700,alive:true,angle:0,target:0,body:crossingBody()});
  arena.advance(1/60);assert.equal(player.alive,false);assert.equal(arena.state.ended,'collision');
});
test('timed mode finishes on active simulation time and stops consuming ticks',()=>{
  const arena=createArena({mode:'timed',seed:2,aiCount:0,foodCount:0});arena.state.ticks=180*60-1;arena.advance(1/60);
  assert.equal(arena.remaining,0);assert.equal(arena.state.ended,'time');assert.equal(arena.advance(.1),0);assert.equal(arena.elapsed,180);
});
test('10 through 120 fps produce identical fixed-step outcomes with the same inputs',()=>{
  let expected;
  for(const fps of [10,20,30,60,120]){
    const arena=createArena({seed:871,aiCount:4,foodCount:200});
    for(const angle of [0,Math.PI/2,Math.PI]){arena.setInput({angle,boost:true});run(arena,1,fps);}
    if(expected)assert.deepEqual(arena.snapshot(),expected,'fps '+fps);else expected=arena.snapshot();
  }
});
test('save restore preserves world, timer and seeded AI without persisting held inputs',()=>{
  const original=createArena({mode:'timed',seed:717,aiCount:4,foodCount:200});original.setInput({angle:1,boost:true});run(original,1);
  const data=original.snapshot(),restored=createArena({state:data});original.clearInput();
  run(original,1);run(restored,1);assert.deepEqual(restored.snapshot(),original.snapshot());
  data.snakes[0].x=1;assert.notEqual(restored.state.snakes[0].x,1,'restored state owns its data');
  assert.throws(()=>createArena({state:{...original.snapshot(),version:2}}),/Invalid arena save/);
  assert.throws(()=>createArena({state:{...original.snapshot(),food:[{x:NaN}]}}),/Invalid arena save/);
});
test('background-sized deltas are bounded and clearing input discards partial time',()=>{
  const arena=createArena({seed:7,aiCount:0,foodCount:0});assert.equal(arena.advance(30),15);
  arena.advance(1/120);arena.setInput({boost:true});arena.clearInput();assert.equal(arena.advance(1/120),0);assert.equal(arena.state.snakes[0].boost,false);
});
