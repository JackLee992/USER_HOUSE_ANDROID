import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGame as createClassic} from '../src/games/plugins/screwclassic/index.js';
import {GAME_ID as CRAZY_GAME_ID} from '../src/games/plugins/screw/index.js';

function fakeContext() {
  const gradient = {addColorStop() {}};
  return new Proxy({}, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

function harness(savedState, storage = null) {
  const styles = new Map();
  const document = {
    head: {appendChild(style) { styles.set(style.id, style); }},
    documentElement: {appendChild(style) { styles.set(style.id, style); }},
    createElement() { return {id:'', textContent:''}; },
    getElementById(id) { return styles.get(id) || null; },
  };
  const element = () => ({innerHTML:'', textContent:'', style:{}, disabled:false, classList:{toggle() {}}});
  const box = {...element(), ownerDocument:document};
  const canvas = {
    ...element(), width:420, height:560,
    getContext:() => fakeContext(),
    getBoundingClientRect:() => ({left:0, top:0, width:420, height:560}),
  };
  const elements = new Map([
    ['#wb-gamebox', box], ['#wb-screw-canvas', canvas],
    ['#wb-screw-progress-fill', element()], ['#wb-screw-progress-text', element()],
    ['#wb-screw-boxes', element()], ['#wb-screw-tray', element()],
    ['#wb-screw-addbox', element()], ['#wb-screw-addbox-left', element()],
  ]);
  let snapshot = null, step = null;
  const calls = {saved:[], cleared:[], scored:[], spoken:[], gameOver:[]};
  const env = {
    qs:selector => elements.get(selector) || null,
    get gamePaused() { return false; },
    get screwTimer() { return null; },
    set screwTimer(value) { this.timer = value; },
    currentGameDurationMs:() => 0,
    getHostWindow:() => ({innerWidth:420, PointerEvent:class PointerEvent {}}),
    isMobileHost:() => true,
    choiceForState:(id, state) => ({id:state?.choice || 'normal', multiplier:1}),
    choiceSavePatch:(id, choice) => ({choice:choice.id, difficulty:choice.id}),
    saveProgress:(id, state) => {
      calls.saved.push(id); snapshot = structuredClone(state);
      if (storage) storage[id] = structuredClone(state);
    },
    clearProgress:id => { calls.cleared.push(id); if (storage) delete storage[id]; },
    setScore:(id, score) => calls.scored.push([id, score]),
    showGameOver:(id, ...args) => calls.gameOver.push([id, ...args]),
    speak:(id, event) => calls.spoken.push([id, event]),
  };
  const nativeSetInterval = globalThis.setInterval;
  globalThis.setInterval = callback => { step = callback; return 73; };
  try { createClassic(env, structuredClone(savedState)); }
  finally { globalThis.setInterval = nativeSetInterval; }
  return {canvas, calls, snapshot:() => snapshot, step:() => step()};
}

const colors = ['red','cyan','green','purple'];
function panel(id, z, screwCount, overrides = {}) {
  const points = [[-42,-12],[42,-12],[-24,14],[24,14]];
  return {
    id, z, shape:'capsule', x:55 + (z % 5) * 76, y:70 + Math.floor(z / 5) * 82,
    w:140, h:58, a:0, color:'rgba(153,105,241,.58)', vx:0, vy:0, va:0,
    gone:false, falling:false, hanging:false,
    screws:Array.from({length:screwCount}, (_, index) => ({
      id:`${id}s${index}`, lx:points[index][0], ly:points[index][1], color:colors[index], gone:false,
    })),
    ...overrides,
  };
}

function stateWithPanels(panels, choice = 'normal') {
  return {
    choice, difficulty:choice, panels,
    boxQueue:['red','cyan','green','purple','red','cyan','green','purple'],
    boxes:[{color:'red',fill:0},{color:'cyan',fill:0},{color:'green',fill:0}],
    boxIndex:3, maxBoxes:3, addBoxUses:0, tray:[], seen:{},
    details:{removed:0,packed:0,matches:0,fallen:0,maxTray:0,trayFourCount:0,trayFullCount:0,addBoxUses:0,blocked:0,progress:0,completed:false,endlessLayers:1},
  };
}

function endlessState(counts) {
  return stateWithPanels(counts.map((count, index) => panel(`old${index}`, index, count)), 'endless');
}

function assertExtended(host, oldPanels) {
  host.step();
  const saved = host.snapshot();
  const added = saved.panels.filter(item => item.id.startsWith('e1_'));
  assert.ok(added.length >= 28 && added.length <= 32);
  assert.equal(saved.details.endlessLayers, 2);
  assert.deepEqual(saved.panels.slice(-oldPanels.length).map(item => item.id), oldPanels.map(item => item.id));
  for (const old of oldPanels) {
    const after = saved.panels.find(item => item.id === old.id);
    assert.equal(after.z, old.z + added.length + 1);
  }
  assert.equal(host.calls.gameOver.length, 0);
}

test('fork endless mode extends for either live-screw or live-panel threshold', () => {
  const screwsThreshold = endlessState([3,3,3,3,3,3,2,2,2]);
  assert.equal(screwsThreshold.panels.length, 9);
  assert.equal(screwsThreshold.panels.flatMap(item => item.screws).length, 24);
  assertExtended(harness(screwsThreshold), screwsThreshold.panels);

  const panelsThreshold = endlessState([4,4,4,4,4,4,4,4]);
  assert.equal(panelsThreshold.panels.length, 8);
  assert.equal(panelsThreshold.panels.flatMap(item => item.screws).length, 32);
  assertExtended(harness(panelsThreshold), panelsThreshold.panels);

  const aboveBoth = endlessState([3,3,3,3,3,3,3,2,2]);
  const control = harness(aboveBoth); control.step();
  assert.equal(control.snapshot().details.endlessLayers, 1);
  assert.deepEqual(control.snapshot().panels.map(item => item.id), aboveBoth.panels.map(item => item.id));
});

test('fork tray accepts the fifth unmatched screw and fails on the sixth', () => {
  const state = stateWithPanels([panel('tray', 0, 3, {
    x:210, y:200, w:160, h:60,
    screws:[
      {id:'tray0',lx:-40,ly:0,color:'purple',gone:false},
      {id:'tray1',lx:0,ly:0,color:'brown',gone:false},
      {id:'tray2',lx:40,ly:0,color:'gray',gone:false},
    ],
  })]);
  state.tray = ['purple','pink','brown','gray'];
  const host = harness(state);

  host.canvas.onpointerdown({clientX:170,clientY:200,preventDefault() {}});
  assert.equal(host.calls.gameOver.length, 0);
  assert.equal(host.calls.cleared.length, 0);
  assert.equal(host.snapshot().tray.length, 5);
  assert.equal(host.snapshot().panels[0].screws[0].gone, true);

  host.canvas.onpointerdown({clientX:210,clientY:200,preventDefault() {}});
  assert.deepEqual(host.calls.cleared, ['screwclassic']);
  assert.equal(host.calls.gameOver.length, 1);
  assert.equal(host.calls.gameOver[0][0], 'screwclassic');
  assert.equal(host.snapshot().tray.length, 5);
  assert.equal(host.snapshot().panels[0].screws[1].gone, false);
});

test('a fixed front-layer screw blocks a falling rear panel without reordering depth', () => {
  const back = panel('back', 2, 0, {x:210,y:200,w:160,h:60,falling:true,vy:1.8});
  const front = panel('front', 9, 2, {
    x:210,y:231,w:120,h:50,
    screws:[
      {id:'front0',lx:0,ly:0,color:'red',gone:false},
      {id:'front1',lx:30,ly:0,color:'cyan',gone:false},
    ],
  });
  const state = stateWithPanels([back, front]);
  const beforeOrder = state.panels.map(item => item.id), beforeDepth = state.panels.map(item => item.z);
  const host = harness(state); host.step();
  const saved = host.snapshot(), stopped = saved.panels.find(item => item.id === 'back');

  assert.equal(stopped.stuck, true);
  assert.equal(stopped.falling, false);
  assert.equal(stopped.y, 200);
  assert.equal(stopped.vx, 0); assert.equal(stopped.vy, 0); assert.equal(stopped.va, 0);
  assert.deepEqual(saved.panels.map(item => item.id), beforeOrder);
  assert.deepEqual(saved.panels.map(item => item.z), beforeDepth);
});

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('switching between classic and Crazy Screw keeps both progress sentinels isolated', () => {
  assert.equal(CRAZY_GAME_ID, 'screw');
  const storage = {
    screwclassic:{...stateWithPanels([panel('classic', 0, 2)]),sentinel:'classic-before'},
    screw:{sentinel:'crazy-before',mode:'endless',moves:17,nested:{keep:true}},
  };
  const crazyBefore = digest(storage.screw);
  const firstClassic = harness(storage.screwclassic, storage);
  firstClassic.step();
  assert.ok(firstClassic.calls.saved.every(id => id === 'screwclassic'));
  assert.equal(digest(storage.screw), crazyBefore);

  const classicBeforeSwitch = digest(storage.screwclassic);
  storage[CRAZY_GAME_ID] = {sentinel:'crazy-after',mode:'endless',moves:18,nested:{keep:true}};
  assert.equal(digest(storage.screwclassic), classicBeforeSwitch);

  const crazyAfter = digest(storage.screw);
  const resumedClassic = harness(storage.screwclassic, storage);
  resumedClassic.step();
  assert.ok(resumedClassic.calls.saved.every(id => id === 'screwclassic'));
  assert.equal(digest(storage.screw), crazyAfter);
});
