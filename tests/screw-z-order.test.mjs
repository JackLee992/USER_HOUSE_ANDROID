import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stablePanelFrontness,
  stablePanelPaintStack,
} from '../src/games/plugins/screw/index.js';

const panel = (id, z, gone = false) => ({ id, z, order:z, gone, screws:[] });

test('moving boards stay between the same neighbours in the paint stack', () => {
  const back = panel('back', 0);
  const released = panel('released', 1, true);
  const front = panel('front', 2);

  const stack = stablePanelPaintStack([back, released, front], [released]);

  assert.deepEqual(stack.map(entry => entry.panel.id), ['back', 'released', 'front']);
  assert.deepEqual(stack.map(entry => entry.released), [false, true, false]);
});

test('removing another board does not renormalize a surviving board depth', () => {
  const boards = [panel('back', 0), panel('middle', 1), panel('front', 2)];
  const before = stablePanelFrontness(boards[1], boards);
  boards[2].gone = true;
  const after = stablePanelFrontness(boards[1], boards);

  assert.equal(before, .5);
  assert.equal(after, before);
});

test('paint planning does not mutate saved panel order', () => {
  const panels = [panel('front', 9), panel('back', 1), panel('middle', 4)];
  const before = panels.map(item => item.id);

  assert.deepEqual(stablePanelPaintStack(panels).map(entry => entry.panel.id), ['back', 'middle', 'front']);
  assert.deepEqual(panels.map(item => item.id), before);
});

test('several moving boards follow layer order instead of tap order', () => {
  const panels = [panel('back', 0), panel('front', 5, true), panel('middle', 3, true)];
  const stack = stablePanelPaintStack(panels, [panels[1], panels[2]]);

  assert.deepEqual(stack.map(entry => entry.panel.id), ['back', 'middle', 'front']);
});
