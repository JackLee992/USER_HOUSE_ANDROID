import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/runtime/wanban-app.js',import.meta.url),'utf8');
const start=source.indexOf('  function commitGameActiveDuration('),end=source.indexOf('  function saveProgress(',start);
assert.ok(start>=0&&end>start);
const durationSource=source.slice(start,end);
const stopSource=source.split('\n').find(line=>line.startsWith('  function stopGame()'));

function runtime({started=false,accumulated=0,next=1800000,activeSince=0,savedDuration=1820290,savedNext=2400000}={}) {
  const storage={
    progress:JSON.stringify({zuma:{savedAt:1720000000000,durationMs:savedDuration,petRewardNextMs:savedNext,score:370,
      chain:[{id:4,color:2,s:450}],zumaClassic:{schema:2,status:'playing',score:370,chain:[{id:4,color:2,s:850}]}}}),
    settings:'{"lastGame":"zuma","theme":"day"}',scores:'{"zuma":2000}',records:'[{"game":"zuma","score":2000}]',
    history:'[{"game":"zuma","durationMs":19000}]',
  };
  const writes=[],flushes=[],noop=()=>{};let context;
  context=vm.createContext({
    currentGame:'zuma',gameStarted:started,gamePaused:!started,gameActiveStartedAt:activeSince,
    gameAccumulatedMs:accumulated,gamePetRewardNextMs:next,activeGameController:null,
    Date:{now:()=>1000000},isGameOnlineActive:()=>context.gameStarted&&!context.gamePaused,
    isGameSurfaceVisible:()=>true,applyTimedGameRewards:noop,
    flushProgressSave:game=>flushes.push(game),progress:()=>JSON.parse(storage.progress),STORAGE_PROGRESS:'progress',
    saveJSON:(key,value)=>{storage[key]=JSON.stringify(value);writes.push(key);return true;},
    flushAllProgressSaves:noop,clearGameDurationRewardTimer:noop,hideGamePauseOverlay:noop,
    getHostDocument:()=>({}),clearTimeout:noop,clearInterval:noop,
    snakeTimer:null,tetrisTimer:null,watermelonTimer:null,jumpTimer:null,screwTimer:null,
    linkLinkTimer:null,shuerteTimer:null,randomLineTimer:null,singleDialogueTimer:null,singleDialogueQueue:null,
    firstMoverAwaitingUserAction:false,
  });
  vm.runInContext(durationSource+stopSource,context);
  return {context,storage,writes,flushes};
}

test('cold restore of lastGame does not reset the saved 40-minute reward threshold to the 30-minute default',()=>{
  const {context,storage,writes,flushes}=runtime();const before={...storage};context.stopGame();
  assert.deepEqual(storage,before,'all five persisted keys remain byte-identical before Continue');
  assert.deepEqual(writes,[]);assert.deepEqual(flushes,[]);
  assert.equal(JSON.parse(storage.progress).zuma.petRewardNextMs,2400000);
});

test('an idle game selection cannot inherit another session duration or reward threshold',()=>{
  const {context,storage,writes}=runtime({accumulated:3600000,next:4200000,savedDuration:1200,savedNext:1800000});
  const before={...storage};context.stopGame();
  assert.deepEqual(storage,before);assert.deepEqual(writes,[]);
  assert.equal(JSON.parse(storage.progress).zuma.durationMs,1200);
});

test('stopping a real active game persists its elapsed time once and preserves its board and other keys',()=>{
  const {context,storage,writes,flushes}=runtime({started:true,accumulated:2000,activeSince:995750,next:2400000,savedDuration:1900});
  const before={...storage},expected=JSON.parse(storage.progress);expected.zuma.durationMs=6250;
  context.stopGame();assert.deepEqual(JSON.parse(storage.progress),expected);
  assert.deepEqual(writes,['progress']);assert.deepEqual(flushes,['zuma']);
  for(const key of ['settings','scores','records','history'])assert.equal(storage[key],before[key]);
  assert.equal(context.gameStarted,false);assert.equal(context.gamePaused,true);assert.equal(context.gameActiveStartedAt,0);
  context.stopGame();assert.deepEqual(writes,['progress'],'a second render cleanup cannot write stale session values');
});
