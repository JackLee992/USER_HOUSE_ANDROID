import test from 'node:test';
import assert from 'node:assert/strict';
import {createZumaPath as legacyPath,zumaPointAt as legacyPoint} from '../src/games/zuma.js';
import {createZumaEngine,getZumaLevel} from '../src/games/plugins/zuma/engine.js';
import {readZumaSave,writeZumaSave,LEGACY_ZUMA_PATH_LENGTH,LEGACY_ZUMA_SPACING,LEGACY_ZUMA_HEAD_LIMIT,LEGACY_ZUMA_MAX_BALLS} from '../src/games/plugins/zuma/save.js';

const fresh=()=>createZumaEngine(null,{random:()=>.43});
function validLegacy(wrapper){
  assert.equal(wrapper.schema,1);assert.ok(wrapper.chain.length<=LEGACY_ZUMA_MAX_BALLS);
  for(let i=0;i<wrapper.chain.length;i++){
    const ball=wrapper.chain[i];assert.ok(Number.isInteger(ball.color)&&ball.color>=0&&ball.color<=5);assert.ok(Number.isFinite(ball.s)&&ball.s>=28&&ball.s<=LEGACY_ZUMA_HEAD_LIMIT);
    if(i)assert.ok(ball.s-wrapper.chain[i-1].s>=LEGACY_ZUMA_SPACING-1e-8);
    const p=legacyPoint(legacyPath(),ball.s);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    assert.deepEqual(Object.keys(ball).sort(),['color','s']);
  }
  assert.deepEqual(wrapper.tools,{bomb:3,slow:3,rainbow:3});assert.equal(wrapper.resolution,null);assert.equal(wrapper.spawnProgress,0);
  assert.ok(wrapper.details.totalBallsGenerated>=wrapper.chain.length);
}

test('legacy fallback geometry matches the released 900×620 path and 31.62 spacing',()=>{
  assert.equal(LEGACY_ZUMA_PATH_LENGTH,legacyPath().length);assert.equal(LEGACY_ZUMA_SPACING,31.62);assert.equal(LEGACY_ZUMA_MAX_BALLS,94);
  assert.equal(LEGACY_ZUMA_HEAD_LIMIT,legacyPath().length-180);
});

test('a wrapped current game round-trips every internal field without touching the input',()=>{
  const engine=fresh();engine.update(.31);engine.fire(.7);engine.update(.01);engine.state.effects.slow=3.25;engine.state.effects.accuracy=1.5;
  engine.state.coin={x:500,y:180,remaining:6.75};engine.state.gaps=[{leftId:1,rightId:2,shotId:5,depth:2}];engine.state.score=9876;
  const snapshot=engine.serialize(),before=JSON.stringify(snapshot),wrapper=writeZumaSave(snapshot);validLegacy(wrapper);
  assert.equal(wrapper.score,9876);assert.equal(wrapper.slowRemaining,3250,'old game uses milliseconds');assert.equal(JSON.stringify(snapshot),before);
  const nested=readZumaSave(JSON.parse(JSON.stringify(wrapper)));assert.deepEqual(nested,snapshot);
  assert.deepEqual(createZumaEngine(nested).serialize(),snapshot);
  wrapper.chain[0].color=5;wrapper.score=0;assert.deepEqual(readZumaSave(wrapper),snapshot,'legacy projection cannot corrupt the archived classic round');
  nested.chain[0].color=99;assert.notEqual(wrapper.zumaClassic.chain[0].color,99,'read returns an isolated snapshot');
});

test('all six courses and both layouts project only finite nonoverlapping positions short of the legacy pit',()=>{
  for(const layout of ['portrait','landscape'])for(let levelIndex=0;levelIndex<6;levelIndex++){
    const state=fresh().serialize(),level=getZumaLevel(levelIndex,layout);state.layout=layout;state.levelIndex=levelIndex;
    state.chain=Array.from({length:60},(_,i)=>({id:i+1,color:i%level.colors,s:i/(59)*level.path.length}));
    const wrapper=writeZumaSave(state);validLegacy(wrapper);assert.equal(wrapper.chain.length,60);assert.deepEqual(readZumaSave(wrapper),state);
    assert.deepEqual(wrapper.chain.map(b=>b.color),state.chain.map(b=>b.color));
  }
});

test('dense chains retain every bead in the classic snapshot while the old chain fits only visible capacity',()=>{
  const state=fresh().serialize(),length=getZumaLevel(0).path.length;
  state.chain=Array.from({length:180},(_,i)=>({id:i+1,color:i%6,s:-500+i/179*(length+650),powerup:i%3===0?'bomb':undefined}));
  const clean=JSON.parse(JSON.stringify(state)),wrapper=writeZumaSave(clean);validLegacy(wrapper);
  assert.equal(wrapper.chain.length,94);assert.equal(wrapper.zumaClassic.chain.length,180);assert.deepEqual(readZumaSave(wrapper),clean);
  const retained=clean.chain.filter(b=>b.s>=0).slice(-94).map(b=>b.color);assert.deepEqual(wrapper.chain.map(b=>b.color),retained);
  assert.ok(wrapper.chain.at(-1).s<=legacyPath().length-180);
});

test('old code saving again drops the nested snapshot and a later upgrade migrates its latest cumulative score',()=>{
  const engine=fresh();engine.state.score=3210;engine.state.levelIndex=4;
  const projected=writeZumaSave(engine.serialize());
  // The released 1.0.0 snapshot() explicitly writes these fields, ignoring unknown keys.
  const oldSaved=JSON.parse(JSON.stringify({chain:projected.chain,score:projected.score+250,current:projected.current,next:projected.next,
    tools:projected.tools,slowRemaining:projected.slowRemaining,spawnProgress:0,aim:projected.aim,resolution:null,details:projected.details,seen:projected.seen}));
  assert.equal(oldSaved.zumaClassic,undefined);assert.equal(readZumaSave(oldSaved),oldSaved);
  const upgraded=createZumaEngine(readZumaSave(oldSaved),{random:()=>.43});assert.equal(upgraded.state.schema,2);assert.equal(upgraded.state.score,3460);
  assert.equal(upgraded.state.levelIndex,0);assert.equal(upgraded.state.chain.length,upgraded.level.initial);assert.equal(upgraded.state.lives,3);
});

test('terminal and offscreen-only rounds keep their full classic status while legacy gets a safe empty chain',()=>{
  for(const status of ['levelComplete','lifeLost','gameOver']){
    const state=fresh().serialize();state.status=status;state.chain=status==='levelComplete'?[]:[{id:1,color:2,s:-100,powerup:'slow',powerupRemaining:16}];
    const wrapper=writeZumaSave(state);validLegacy(wrapper);assert.deepEqual(wrapper.chain,[]);assert.deepEqual(readZumaSave(wrapper),state);
  }
});

test('unwrapped old or flat current saves remain readable, while malformed nested metadata cannot take precedence',()=>{
  assert.equal(readZumaSave(null),null);assert.equal(readZumaSave(undefined),undefined);
  const legacy={score:99,chain:[{color:1,s:300}]};assert.equal(readZumaSave(legacy),legacy);
  const current=fresh().serialize();assert.equal(readZumaSave(current),current);
  const malformed={...legacy,zumaClassic:{schema:2,chain:null}};assert.equal(readZumaSave(malformed),malformed);
  assert.throws(()=>writeZumaSave(legacy),/schema-2/);
});

test('a mid-consumption death preserves full animation state while its legacy projection stays safe',()=>{
  const e=fresh(),end=e.level.path.length;e.state.introTime=null;e.state.chain=Array.from({length:70},(_,i)=>({id:i+1,color:i%4,s:end-1-(69-i)*e.level.spacing}));e.state.nextId=100;e.update(.35);
  assert.equal(e.state.status,'draining');const snapshot=e.serialize(),wrapped=writeZumaSave(snapshot);validLegacy(wrapped);
  assert.deepEqual(readZumaSave(wrapped),snapshot);assert.equal(wrapped.score,snapshot.score);
  const resumed=createZumaEngine(readZumaSave(JSON.parse(JSON.stringify(wrapped))));assert.deepEqual(resumed.serialize(),snapshot);
  e.update(2);resumed.update(2);assert.deepEqual(resumed.serialize(),e.serialize());assert.equal(resumed.state.status,'lifeLost');assert.equal(resumed.state.lives,2);
});


test('the resource save envelope resumes a partially entered opening without skipping or replaying it',()=>{
  const e=fresh();e.update(.4);const snapshot=e.serialize();
  assert.ok(snapshot.introTime>0);assert.ok(snapshot.chain.some(b=>b.s<0));assert.ok(snapshot.chain.some(b=>b.s>=0));
  const wrapper=writeZumaSave(snapshot);validLegacy(wrapper);
  const restored=createZumaEngine(readZumaSave(JSON.parse(JSON.stringify(wrapper))));assert.deepEqual(restored.serialize(),snapshot);
  for(const dt of [.2,.013,.4,.8]){e.update(dt);restored.update(dt);}assert.deepEqual(restored.serialize(),e.serialize());
});
