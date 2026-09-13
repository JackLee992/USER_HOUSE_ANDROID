import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as classic from '../src/games/plugins/screwclassic/index.js';

const {createGame, GAME_ID, GAME_VERSION} = classic;
const FORK_BASELINE_COMMIT = 'c25b96a7c5aa74c5b37872bc5e1cd6a8c14e8226';
const FORK_BASELINE_START_SCREW_HASH = '29dd56556451799a15eb890323a70934d7e250803964085e72b15cf2c1e2de66';
const FORK_BASELINE_SCREW_CSS_HASH = 'e2ccda9a83d23c250283787c55b78478935b42593869772e9a32a71e600407d4';
const FORK_BASELINE_ICON_HASH = '03baa527088f73ae9f3ac70e51c11a1d006ff56be40b3cd4f3ba1c201457628b';

function adaptForkBaselineSource(source) {
  let adapted = source.split('\n').map(line => line.startsWith('  ') ? line.slice(2) : line).join('\n');
  adapted = adapted.replace('function startScrew(state) {', 'function startScrew(env, state) {');
  for (const name of ['choiceForState','choiceSavePatch','currentGameDurationMs','getHostWindow','isMobileHost','saveProgress','clearProgress','showGameOver','setScore','speak','qs']) {
    adapted = adapted.replace(new RegExp(`(?<![\\w.$])${name}(?=\\s*\\()`, 'g'), `env.${name}`);
  }
  return adapted
    .replace(/(?<![\w.$])gamePaused\b/g, 'env.gamePaused')
    .replace(/(?<![\w.$])screwTimer\b/g, 'env.screwTimer');
}

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

test('classic Screw records the exact fork baseline source while keeping a separate identity', () => {
  assert.equal(GAME_ID, 'screwclassic');
  assert.equal(GAME_VERSION, '1.0.1');
  assert.equal(classic.FORK_BASELINE_MANIFEST_VERSION, '3.7.0');
  assert.equal(classic.FORK_BASELINE_COMMIT, FORK_BASELINE_COMMIT);
  assert.equal(classic.FORK_BASELINE_START_SCREW_SHA256, FORK_BASELINE_START_SCREW_HASH);
  assert.equal(classic.FORK_BASELINE_SCREW_CSS_SHA256, FORK_BASELINE_SCREW_CSS_HASH);
  assert.equal(classic.FORK_BASELINE_ICON_SHA256, FORK_BASELINE_ICON_HASH);

  const snapshot = readFileSync(new URL('../src/games/plugins/screwclassic/original-startScrew-c25b96a.js', import.meta.url));
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), FORK_BASELINE_START_SCREW_HASH);
  const cssSnapshot = readFileSync(new URL('../src/games/plugins/screwclassic/original-screw-css-c25b96a.css', import.meta.url));
  assert.equal(createHash('sha256').update(cssSnapshot).digest('hex'), FORK_BASELINE_SCREW_CSS_HASH);
  const icon = readFileSync(new URL('../assets/game-icons/screw.png', import.meta.url));
  assert.equal(createHash('sha256').update(icon).digest('hex'), FORK_BASELINE_ICON_HASH);
  const art = JSON.parse(readFileSync(new URL('../assets/game-art/screwclassic/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(art.assetRefs, ['assets/game-icons/screw.png']);
  assert.equal(art.directoryIcon.atlas, 'assets/game-icons/screw.png');
  assert.equal(JSON.stringify(art).includes('icons-v2'), false);
  const core = readFileSync(new URL('../src/games/plugins/screwclassic/fork-baseline-game.js', import.meta.url), 'utf8');
  const coreStart = core.indexOf('function startScrew(env, state) {');
  const coreEnd = core.indexOf('\nexport function createForkBaselineGame', coreStart);
  assert.equal(core.slice(coreStart, coreEnd).trimEnd(), adaptForkBaselineSource(snapshot.toString()).trimEnd());
  assert.match(core, /const panelCount = \(endless \? 28 : 42\) \+ Math\.floor\(rand\(\) \* \(endless \? 5 : 6\)\)/);
  assert.match(core, /function extendEndless\(\)/);
  assert.match(core, /liveScrewCount\(\) <= 24 \|\| livePanelCount\(\) <= 8/);
  assert.match(core, /p\.vy = Math\.min\(noScrewDrop \? 15 : 11\.5, \(p\.vy \|\| 0\) \+ \(noScrewDrop \? \.72 : \.48\)\)/);
  assert.match(core, /setInterval\(step, 33\)/);
  assert.doesNotMatch(core, /drawGameSprite|drawGameMaterial|physicsSaveTick|uiSignature|classicLevels/);

  const adapter = readFileSync(new URL('../src/games/plugins/screwclassic/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(adapter, /const panelCount|function extendEndless|function makeLevel/);
});

test('fork baseline keeps its original normal and continuous endless panel counts', () => {
  const fresh = harness();
  assert.ok(fresh.snapshot().panels.length >= 42 && fresh.snapshot().panels.length <= 47);
  assert.equal(fresh.ids.choiceId, 'screwclassic');
  assert.equal(fresh.snapshot().choice, 'normal');

  const endless = harness({choice:'endless'});
  assert.ok(endless.snapshot().panels.length >= 28 && endless.snapshot().panels.length <= 32);
  assert.equal(endless.ids.choiceId, 'screwclassic');
  assert.equal(endless.ids.choiceSaveId, 'screwclassic');
  assert.equal(endless.snapshot().choice, 'endless');
});

test('the last screw pins the original board, then removing it releases the board under gravity', () => {
  const host = harness(twoScrewState());
  assert.equal(host.env.timer, 73);
  assert.equal(host.ids.choiceId, 'screwclassic');
  assert.equal(host.ids.choiceSaveId, 'screwclassic');
  assert.ok(host.styles.has('wanba-screwclassic-original-css'));
  const css = host.styles.get('wanba-screwclassic-original-css').textContent;
  assert.match(css, /\.wb-gamebox-screwclassic \.wb-screw-panel/);
  assert.match(css, /#wanbanXiaowu-popup\.wb-mono \.wb-gamebox-screwclassic \.wb-screw-canvas/);
  assert.doesNotMatch(css, /\.wb-gamebox-screw(?:\s|\.)/);

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

test('the original 33 ms loop preserves its initial per-tick redraw and save behavior', () => {
  const host = harness(twoScrewState());
  const saves = host.ids.saved.length;
  host.step();
  host.step();
  assert.equal(host.ids.saved.length, saves + 2);
  assert.deepEqual(host.snapshot().panels[0].screws.map(item => item.gone), [false,false]);
});

test('all persistence and result calls are isolated from the Crazy Screw id', () => {
  const state = twoScrewState();
  state.panels[0].screws[0].color = 'purple';
  state.tray = ['red','cyan','green','brown','gray'];
  const host = harness(state);
  host.canvas.onpointerdown({clientX:170, clientY:200, preventDefault() {}});

  assert.deepEqual(host.ids.cleared, ['screwclassic']);
  assert.equal(host.ids.gameOver[0][0], 'screwclassic');
  assert.ok(host.ids.spoken.every(([id]) => id === 'screwclassic'));
  assert.ok(host.ids.saved.every(id => id === 'screwclassic'));
  assert.equal(JSON.stringify(host.ids).includes('"screw"'), false);
});
