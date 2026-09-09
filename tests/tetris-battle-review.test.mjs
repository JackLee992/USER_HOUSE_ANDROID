import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,isBattleState,collides,chooseAI} from '../src/games/plugins/tetris/battle-engine.js';
const logical=engine=>{const value=engine.snapshot();value.events=[];return value;};

test('review: imported completed rows are rejected before they poison score and pending with NaN',()=>{
  const state=createBattle({seed:31}).snapshot();
  for(let y=15;y<20;y++)state.players[0].board[y].fill(8);
  assert.equal(collides(state.players[0]),false,'the invalid data is completed rows, not a colliding active piece');
  assert.equal(isBattleState(state),false);
  const restored=createBattle({state,seed:31});restored.action('hard');assert.ok(Number.isFinite(restored.player.score));assert.ok(Number.isFinite(restored.player.pending));assert.ok(isBattleState(restored.snapshot()));
});

test('review: save outcomes agree with player death and sprint completion instead of accepting frozen active games',()=>{
  for(const [mode,mutate]of [
    ['marathon',s=>s.players[0].dead=true],
    ['duel',s=>s.players[1].dead=true],
    ['duel',s=>{s.players[0].dead=s.players[1].dead=true;}],
    ['sprint',s=>{s.players[0].lines=40;s.players[0].level=5;}],
    ['duel',s=>s.ended='win'],
    ['marathon',s=>s.ended='loss'],
  ]){const state=createBattle({seed:9,mode}).snapshot();mutate(state);assert.equal(isBattleState(state),false,mode+' must reject inconsistent outcome');}
});

test('review: clearing the fortieth sprint line wins even when the unused next piece would top out',()=>{
  const state=createBattle({seed:31,mode:'sprint'}).snapshot(),p=state.players[0];p.lines=39;p.level=4;p.board[0][3]=8;p.board[19]=Array.from({length:10},(_,x)=>x===0?0:8);p.current={type:0,rotation:1,x:-2,y:16};p.queue[0]=0;
  assert.ok(isBattleState(state));assert.equal(collides(p),false);
  const game=createBattle({state});assert.equal(game.action('hard'),true);assert.equal(game.player.lines,40);assert.equal(game.state.ended,'win');assert.ok(isBattleState(game.snapshot()));
});

test('review: fractional fixed-step carry survives restore and keeps future actions identical',()=>{
  const game=createBattle({seed:42});game.action('hold');game.advance(.009);const saved=game.snapshot();assert.ok(saved.carry>0);const restored=createBattle({state:saved});
  for(let i=0;i<150;i++){if(i%29===0){game.action('hard');restored.action('hard');}if(i%17===0){game.action('rotate');restored.action('rotate');}const dt=[.004,.013,.061,.097][i%4];game.advance(dt);restored.advance(dt);}
  assert.deepEqual(logical(restored),logical(game));assert.ok(isBattleState(game.snapshot()));
});

test('review: deterministic AI placements and garbage keep ordinary matches inside the save contract',()=>{
  for(const seed of [3,13,73,123]){
    const game=createBattle({seed});
    for(let piece=0;piece<35&&!game.state.ended;piece++){
      const choice=chooseAI(game.player);if(!choice)break;
      for(let r=0;r<choice.rotations;r++)game.action('rotate');
      while(game.player.current.x!==choice.x&&game.action(game.player.current.x>choice.x?'left':'right')){}
      assert.equal(collides(game.player),false);game.action('hard');
      for(let n=0;n<9;n++)game.advance(.25);
      assert.ok(isBattleState(game.snapshot()),'seed '+seed+' piece '+piece);
      assert.ok(Number.isFinite(game.player.score));assert.ok(Number.isFinite(game.opponent.score));
    }
  }
});
