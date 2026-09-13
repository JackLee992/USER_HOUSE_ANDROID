import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREW_CAMPAIGN_LEVELS,
  addTraySlot,
  advanceFallingPanel,
  applyScrew,
  createScrewState,
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
