import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREW_CAMPAIGN_LEVELS,
  SCREW_ENDLESS_MAX_PANELS,
  SCREW_ENDLESS_MIN_PANELS,
  SCREW_ENDLESS_RULES_VERSION,
  addEndlessBox,
  addTraySlot,
  advanceFallingPanel,
  applyScrew,
  createScrewState,
  endlessScore,
  extendEndlessState,
  progressPercent,
  reachableScrews,
  restoreScrewState,
  undoScrew,
  useHint,
} from '../src/games/plugins/screw/model.js';

function solve(state) {
  let turns = 0;
  while (state.status === 'playing' && turns < 200) {
    const id = useHint(state);
    assert.ok(id, `level ${state.level} always exposes a safe move`);
    state.tools.hint += 1; // The solver asks the same question without consuming the player's stock.
    const result = applyScrew(state, id);
    assert.equal(result.ok, true);
    turns += 1;
  }
  return turns;
}

test('all classic campaign boards are deterministic and solvable without filling the tray', () => {
  for (let level = 1; level <= SCREW_CAMPAIGN_LEVELS; level += 1) {
    const first = createScrewState({ level });
    const second = createScrewState({ level });
    assert.deepEqual(first.panels, second.panels);
    assert.deepEqual(first.boxQueue, second.boxQueue);
    const turns = solve(first);
    assert.equal(first.status, 'level_complete', `level ${level}`);
    assert.equal(first.tray.length, 0);
    assert.equal(first.boxes.length, 0);
    assert.equal(progressPercent(first), 100);
    assert.equal(turns, first.panels.length * 3);
  }
});

test('advanced levels require planned temporary storage while remaining fair', () => {
  for (let level = 2; level <= SCREW_CAMPAIGN_LEVELS; level += 1) {
    const state = createScrewState({ level });
    solve(state);
    assert.ok(state.levelMaxTray >= 1, `level ${level} uses the tray`);
    assert.ok(state.levelMaxTray < state.trayCapacity, `level ${level} never fills all temporary holes on the safe route`);
  }
});

test('wrong-color screws occupy temporary holes and the fifth one ends the level fairly', () => {
  const state = createScrewState({ level:2 });
  const future = state.boxQueue[3];
  const top = reachableScrews(state).find(hit => hit.reachable);
  top.screw.color = future;
  state.tray = Array.from({ length:4 }, (_, index) => ({ id:`held-${index}`, color:future }));
  const result = applyScrew(state, top.screw.id);
  assert.equal(result.route, 'tray');
  assert.equal(state.tray.length, 5);
  assert.equal(result.failed, true);
  assert.equal(state.status, 'failed');
});

test('a full tray never deletes an additional screw', () => {
  const state = createScrewState({ level:2 });
  const future = state.boxQueue[3];
  const top = reachableScrews(state).find(hit => hit.reachable);
  top.screw.color = future;
  state.tray = Array.from({ length:state.trayCapacity }, (_, index) => ({ id:`held-${index}`, color:future }));
  const before = structuredClone(state.panels);
  const result = applyScrew(state, top.screw.id);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tray_full');
  assert.deepEqual(state.panels, before);
});

test('original endless rules keep the fifth temporary hole playable and fail on the next unmatched choice', () => {
  const state = createScrewState({ mode:'endless', seed:0x13572468 });
  const reachable = reachableScrews(state).filter(hit => hit.reachable);
  const top = reachable.find(hit => !state.boxes.some(box => box.color === hit.screw.color));
  assert.ok(top, 'fixture exposes a future-colour screw');
  state.tray = Array.from({ length:state.trayCapacity - 1 }, (_, index) => ({ id:`held-${index}`, color:'future' }));
  const fifth = applyScrew(state, top.screw.id);
  assert.equal(fifth.ok, true);
  assert.equal(fifth.route, 'tray');
  assert.equal(state.tray.length, 5);
  assert.equal(state.status, 'playing');
  assert.equal(fifth.failed, false);

  const next = reachableScrews(state).find(hit => hit.reachable && !state.boxes.some(box => box.color === hit.screw.color));
  assert.ok(next, 'fixture exposes another unmatched screw');
  const panelsBefore = structuredClone(state.panels);
  const sixth = applyScrew(state, next.screw.id);
  assert.equal(sixth.ok, false);
  assert.equal(sixth.reason, 'tray_full');
  assert.equal(sixth.failed, true);
  assert.equal(state.status, 'failed');
  assert.deepEqual(state.panels, panelsBefore);
});

test('undo restores the entire move and charges exactly one use', () => {
  const state = createScrewState({ level:3 });
  const before = structuredClone(state);
  const move = reachableScrews(state).find(hit => hit.reachable && state.boxes.some(box => box.color === hit.screw.color));
  assert.equal(applyScrew(state, move.screw.id).ok, true);
  assert.equal(undoScrew(state), true);
  assert.deepEqual(state.panels, before.panels);
  assert.deepEqual(state.boxes, before.boxes);
  assert.deepEqual(state.tray, before.tray);
  assert.equal(state.moves, before.moves);
  assert.equal(state.tools.undo, 2);
  assert.equal(state.details.undos, 1);
});

test('hint prefers an active toolbox color and extra hole is a one-use saved upgrade', () => {
  const state = createScrewState({ level:5 });
  const hint = useHint(state);
  const hit = reachableScrews(state).find(item => item.screw.id === hint);
  assert.ok(state.boxes.some(box => box.color === hit.screw.color));
  assert.equal(state.tools.hint, 2);
  assert.equal(addTraySlot(state), true);
  assert.equal(state.trayCapacity, 6);
  assert.equal(state.tools.extra, 0);
  assert.equal(addTraySlot(state), false);
});

test('legacy random-board saves migrate to the deterministic campaign while keeping mode and score', () => {
  const legacy = { panels:[{ id:'old-random-board' }], score:860, choice:'endless' };
  const restored = restoreScrewState(legacy, 'endless');
  assert.equal(restored.migrated, true);
  assert.equal(restored.state.mode, 'endless');
  assert.equal(restored.state.score, 860);
  assert.equal(restored.state.screwSchema, 2);
});

test('endless mode continuously adds new layers instead of completing a level', () => {
  const state = createScrewState({ mode:'endless', seed:0x24681357 });
  const initialPanels = state.panels.length;
  assert.ok(initialPanels >= SCREW_ENDLESS_MIN_PANELS && initialPanels <= SCREW_ENDLESS_MAX_PANELS);
  assert.ok(state.panels.every(panel => panel.screws.length >= 2 && panel.screws.length <= 4));
  assert.equal(state.panels.reduce((sum, panel) => sum + panel.screws.length, 0) % 3, 0);
  assert.equal(state.status, 'playing');
  assert.equal(state.details.endlessLayers, 1);
  assert.equal(state.tools.extra, 3);

  const oldIds = new Set(state.panels.map(panel => panel.id));
  assert.equal(extendEndlessState(state, true), true);
  assert.equal(state.status, 'playing');
  assert.equal(state.details.endlessLayers, 2);
  assert.ok(state.panels.length > initialPanels);
  assert.ok(state.panels.some(panel => panel.id.startsWith('e2-')));
  assert.ok(state.panels.some(panel => oldIds.has(panel.id)), 'unfinished panels stay in the same continuous run');
});

test('endless add-box tool restores the original capacity and score multiplier rules', () => {
  const state = createScrewState({ mode:'endless', seed:0x31415926 });
  state.details.boxesCompleted = 10;
  assert.equal(endlessScore(state), 2640);
  assert.equal(addEndlessBox(state), true);
  assert.equal(state.boxCapacity, 4);
  assert.equal(state.boxes.length, 4);
  assert.equal(addEndlessBox(state), true);
  assert.equal(addEndlessBox(state), true);
  assert.equal(state.boxCapacity, 6);
  assert.equal(state.boxes.length, 6);
  assert.equal(state.tools.extra, 0);
  assert.equal(addEndlessBox(state), false);
  assert.equal(endlessScore(state), 1260);
});

test('undo restores an endless move that triggered a new layer', () => {
  const state = createScrewState({ mode:'endless', seed:0x42424242 });
  const reachable = reachableScrews(state).filter(hit => hit.reachable);
  const move = reachable.find(hit => state.boxes.some(box => box.color === hit.screw.color)) || reachable[0];
  const keep = new Set([move.screw.id]);
  for (const hit of reachableScrews(state)) {
    if (keep.size < 25) keep.add(hit.screw.id);
    hit.screw.gone = !keep.has(hit.screw.id);
  }
  const before = structuredClone(state);
  const result = applyScrew(state, move.screw.id);
  assert.equal(result?.endlessExtended, true);
  assert.equal(undoScrew(state), true);
  assert.equal(state.details.endlessLayers, before.details.endlessLayers);
  assert.deepEqual(state.panels, before.panels);
  assert.deepEqual(state.boxQueue, before.boxQueue);
  assert.deepEqual(state.boxes, before.boxes);
});

test('completed saves from the short-lived endless campaign resume as a continuous run', () => {
  const old = createScrewState({ mode:'endless' });
  delete old.endlessRulesVersion;
  old.status = 'level_complete';
  const { state, migrated } = restoreScrewState(old, 'endless');
  assert.equal(migrated, true);
  assert.equal(state.status, 'playing');
  assert.equal(state.details.endlessLayers, 2);
  assert.equal(state.endlessRulesVersion, SCREW_ENDLESS_RULES_VERSION);
  assert.ok(state.panels.length >= SCREW_ENDLESS_MIN_PANELS && state.panels.length <= SCREW_ENDLESS_MAX_PANELS);
});

function fallingAt(fps, milliseconds = 800) {
  const panel = { x:10, y:20, a:.1, vx:42, vy:-120, va:1.4, time:0 };
  const frames = Math.round(milliseconds * fps / 1000);
  for (let frame = 0; frame < frames; frame += 1) advanceFallingPanel(panel, 1 / fps);
  return panel;
}

for (const fps of [10, 15, 30, 120]) test(`released boards fall the same distance at ${fps} and 60 FPS`, () => {
  const expected = fallingAt(60), actual = fallingAt(fps);
  for (const key of ['x','y','a','vx','vy']) assert.ok(Math.abs(actual[key] - expected[key]) < .001, `${key}: ${actual[key]} versus ${expected[key]}`);
});
