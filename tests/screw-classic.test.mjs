import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createGame,
  GAME_ID,
  GAME_VERSION,
  ORIGINAL_PLUGIN_SHA256,
  ORIGINAL_PLUGIN_VERSION,
  ORIGINAL_SOURCE_COMMIT,
} from '../src/games/plugins/screwclassic/index.js';

const ORIGINAL_COMMIT = '8d4abcc9f58d382b0b07c5f92f2eb703171cc8f4';
const ORIGINAL_HASH = 'b032fe5f76103ca6a35e6f77789eba3ec743870868d13c0d0ec1dfac0f811bfa';

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

function harness(savedState) {
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
  let snapshot = null;
  const ids = {saved:[], cleared:[], scored:[], spoken:[], gameOver:[]};
  const env = {
    qs:selector => elements.get(selector) || null,
    get gamePaused() { return false; },
    get screwTimer() { return null; },
    set screwTimer(value) { this.timer = value; },
    currentGameDurationMs:() => 0,
    getHostWindow:() => ({innerWidth:420, PointerEvent:class PointerEvent {}}),
    isMobileHost:() => true,
    choiceForState:(id, state) => { ids.choiceId = id; return {id:state?.choice || 'normal', multiplier:1}; },
    choiceSavePatch:(id, choice) => { ids.choiceSaveId = id; return {choice:choice.id, difficulty:choice.id}; },
    saveProgress:(id, state) => { ids.saved.push(id); snapshot = structuredClone(state); },
    clearProgress:id => ids.cleared.push(id),
    setScore:(id, score) => ids.scored.push([id, score]),
    showGameOver:(id, ...args) => ids.gameOver.push([id, ...args]),
    speak:(id, event) => ids.spoken.push([id, event]),
  };
  const nativeSetInterval = globalThis.setInterval;
  let step;
  globalThis.setInterval = callback => { step = callback; return 73; };
  try { createGame(env, savedState); }
  finally { globalThis.setInterval = nativeSetInterval; }
  return {canvas, env, ids, styles, step:() => step(), snapshot:() => snapshot};
}

function twoScrewState() {
  return {
    panels:[{
      id:'p0', z:0, shape:'capsule', x:210, y:200, w:160, h:60, a:0,
      color:'rgba(153,105,241,.58)', vx:0, vy:0, va:0,
      gone:false, falling:false, hanging:false,
      screws:[
        {id:'p0s0', lx:-40, ly:0, color:'red', gone:false},
        {id:'p0s1', lx:40, ly:0, color:'red', gone:false},
      ],
    }],
    boxQueue:['red','cyan','green'],
    boxes:[{color:'red',fill:0},{color:'cyan',fill:0},{color:'green',fill:0}],
    boxIndex:3, maxBoxes:3, addBoxUses:0, tray:[], seen:{}, details:{},
  };
}

test('classic Screw package records the exact first independent package source and keeps a separate identity', () => {
  assert.equal(GAME_ID, 'screwclassic');
  assert.equal(GAME_VERSION, '1.0.0');
  assert.equal(ORIGINAL_PLUGIN_VERSION, '1.0.0');
  assert.equal(ORIGINAL_SOURCE_COMMIT, ORIGINAL_COMMIT);
  assert.equal(ORIGINAL_PLUGIN_SHA256, ORIGINAL_HASH);
  const source = readFileSync(new URL('../src/games/plugins/screwclassic/index.js', import.meta.url), 'utf8');
  assert.match(source, /const panelCount = \(endless \? 28 : 42\) \+ Math\.floor\(rand\(\) \* \(endless \? 5 : 6\)\)/);
  assert.match(source, /function extendEndless\(\)/);
  assert.match(source, /liveScrewCount\(\) <= 24 \|\| livePanelCount\(\) <= 8/);
  assert.match(source, /p\.vy = Math\.min\(noScrewDrop \? 15 : 11\.5, \(p\.vy \|\| 0\) \+ \(noScrewDrop \? \.72 : \.48\)\)/);
  assert.match(source, /setInterval\(step, 33\)/);
  assert.match(source, /choiceForState\('screwclassic', state\)/);
  assert.doesNotMatch(source, /classicLevels/);
});

test('the last screw pins the original board, then removing it releases the board under gravity', () => {
  const host = harness(twoScrewState());
  assert.equal(host.env.timer, 73);
  assert.equal(host.ids.choiceId, 'screwclassic');
  assert.equal(host.ids.choiceSaveId, 'screwclassic');
  assert.ok(host.styles.has('wanba-screwclassic-original-css'));

  host.canvas.onpointerdown({clientX:170, clientY:200, preventDefault() {}});
  let panel = host.snapshot().panels[0];
  let pivot = panel.screws[1];
  assert.equal(panel.hanging, true);
  assert.deepEqual(pivot.anchor, {x:250,y:200});
  assert.equal(panel.screws[0].gone, true);

  host.step();
  panel = host.snapshot().panels[0];
  pivot = panel.screws[1];
  const ca = Math.cos(panel.a), sa = Math.sin(panel.a);
  assert.ok(Math.abs(panel.x + pivot.lx * ca - pivot.ly * sa - pivot.anchor.x) < 1e-9);
  assert.ok(Math.abs(panel.y + pivot.lx * sa + pivot.ly * ca - pivot.anchor.y) < 1e-9);
  assert.notEqual(panel.a, 0, 'the suspended panel starts swinging around its remaining screw');

  host.canvas.onpointerdown({clientX:250, clientY:200, preventDefault() {}});
  panel = host.snapshot().panels[0];
  assert.equal(panel.falling, true);
  assert.equal(panel.vy, 1.8);
  const y = panel.y;

  host.step();
  panel = host.snapshot().panels[0];
  assert.equal(panel.vy, 2.52);
  assert.equal(panel.y, y + 2.52);
  assert.ok(host.ids.saved.length > 0);
  assert.ok(host.ids.saved.every(id => id === 'screwclassic'));
  assert.equal(host.ids.saved.includes('screw'), false);
});

test('the original rules keep their 33 ms physics but remain idle before a move', () => {
  const host = harness(twoScrewState());
  const saves = host.ids.saved.length;
  host.step();
  host.step();
  assert.equal(host.ids.saved.length, saves, 'idle timer does not rewrite the save');
  assert.deepEqual(host.snapshot().panels[0].screws.map(item => item.gone), [false,false]);
});
