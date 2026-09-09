import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DIGITS, DIFFICULTIES, HISTORY_LIMIT, PEERS, UNITS, candidates, conflictCells,
  countSolutions, createSudokuModel, generatePuzzle, isComplete, maskDigits, seededRandom, solve } from '../src/games/plugins/sudoku/model.js';

const empty = () => Array(81).fill(0);
const solved = solve(empty());
const bit = n => 1 << (n - 1);
const blankModel = extra => createSudokuModel({ puzzle: empty(), solution: solved, grid: empty(), ...extra });
const boardSnapshot = model => ({ grid: model.state.grid.slice(), notes: model.state.notes.slice() });

test('all four clue ranges produce unique, valid, deterministic puzzles across independent seeds', () => {
  const distinct = new Set();
  for (const [difficulty, [minimum, maximum]] of Object.entries(DIFFICULTIES)) {
    const blankCounts = new Set();
    for (let seed = 0; seed < 48; seed++) {
      const made = generatePuzzle({ difficulty, seed });
      const blanks = made.puzzle.filter(n => !n).length;
      assert.ok(blanks >= minimum && blanks <= maximum, `${difficulty}/${seed}: ${blanks}`);
      assert.equal(countSolutions(made.puzzle), 1, `${difficulty}/${seed} must be unique`);
      assert.ok(isComplete(made.solution, made.puzzle));
      assert.deepEqual(solve(made.puzzle), made.solution);
      assert.deepEqual(generatePuzzle({ difficulty, random: seededRandom(seed) }), made);
      distinct.add(made.puzzle.join('')); blankCounts.add(blanks);
    }
    assert.equal(blankCounts.size, maximum - minimum + 1);
  }
  assert.equal(distinct.size, 192);
});

test('generation uses exact requested endpoints and safely clamps malformed options', () => {
  for (const blanks of [0, 30, 35, 43, 48, 53, 58, 59, 60, 61]) {
    const made = generatePuzzle({ blanks: [blanks, blanks], seed: blanks });
    assert.equal(made.puzzle.filter(n => !n).length, blanks);
    assert.equal(countSolutions(made.puzzle), 1);
  }
  for (const options of [{ blanks: [-1, 999] }, { blanks: ['bad', null] }, { random: () => NaN }, { random: () => 1 }, { random: () => -1 }]) {
    const made = generatePuzzle(options);
    assert.ok(isComplete(made.solution, made.puzzle)); assert.equal(countSolutions(made.puzzle), 1);
  }
});

test('MRV solver rejects invalid/conflicting inputs, does not mutate input, and never calls timeout unique', () => {
  const grid = empty(), original = grid.slice();
  assert.equal(countSolutions(grid), 2); assert.deepEqual(grid, original);
  assert.ok(isComplete(solve(grid))); assert.deepEqual(grid, original);
  grid[0] = grid[1] = 1;
  assert.equal(solve(grid), null); assert.equal(countSolutions(grid), 0);
  assert.equal(solve([1, 2]), null); assert.equal(solve(Array(81).fill('0')), null);
  assert.equal(solve(Array(81)), null);
  assert.throws(() => countSolutions(empty(), 2, { maxNodes: 0 }), /budget exhausted/);
});

test('candidates cover row, column and box peers while excluding filled cells', () => {
  const grid = empty(); grid[1] = 1; grid[9] = 2; grid[10] = 3; grid[40] = 4;
  assert.deepEqual(maskDigits(candidates(grid, 0)), [4, 5, 6, 7, 8, 9]);
  assert.equal(candidates(grid, 1), 0); assert.equal(candidates(grid, -1), 0);
  assert.equal(candidates(empty(), 0), ALL_DIGITS);
  assert.equal(PEERS[0].length, 20); assert.ok(PEERS[0].includes(20)); assert.ok(!PEERS[0].includes(40));
  assert.deepEqual(maskDigits(-1), []);
});

test('pen fill clears its notes and peer digits as a single undoable and redoable transaction', () => {
  const model = blankModel(); model.setInputMode('note');
  for (const i of [0, 1, 9, 10, 40]) { model.input(1, i); model.input(2, i); }
  const before = boardSnapshot(model), historyLength = model.state.history.length;
  model.setInputMode('pen'); const result = model.input(1, 0);
  assert.equal(result.changed, true); assert.equal(model.state.history.length, historyLength + 1);
  assert.equal(model.state.notes[0], 0);
  for (const i of [1, 9, 10]) assert.equal(model.state.notes[i], bit(2));
  assert.equal(model.state.notes[40], bit(1) | bit(2));
  const after = boardSnapshot(model);
  assert.equal(model.undo().changed, true); assert.deepEqual(boardSnapshot(model), before);
  assert.equal(model.state.inputMode, 'pen');
  assert.equal(model.redo().changed, true); assert.deepEqual(boardSnapshot(model), after);
});

test('auto-clean setting persists and changing it is not undone with moves', () => {
  const model = blankModel(); model.setInputMode('note'); model.input(2, 1); model.input(3, 0);
  model.setAutoClean(false); model.setInputMode('pen'); model.input(2, 0);
  assert.equal(model.state.notes[1], bit(2)); assert.equal(model.state.notes[0], 0);
  model.undo(); assert.equal(model.state.autoClean, false); assert.equal(model.state.notes[0], bit(3));
  const restored = createSudokuModel(model.serialize()); assert.equal(restored.state.autoClean, false);
});

test('fill notes replaces all empty-cell masks in one transaction and erase is reversible', () => {
  const made = generatePuzzle({ seed: 9 }), model = createSudokuModel(made);
  const before = boardSnapshot(model); assert.equal(model.fillNotes().changed, true);
  assert.equal(model.state.history.length, 1);
  for (let i = 0; i < 81; i++) assert.equal(model.state.notes[i], candidates(model.state.grid, i));
  const after = boardSnapshot(model); model.undo(); assert.deepEqual(boardSnapshot(model), before);
  model.redo(); assert.deepEqual(boardSnapshot(model), after);
  const index = model.state.grid.findIndex(n => !n); model.erase(index);
  assert.equal(model.state.notes[index], 0); model.undo(); assert.deepEqual(boardSnapshot(model), after);
});

test('original givens cannot be overwritten, annotated, erased, or altered by a forged hint', () => {
  const model = createSudokuModel(null, { seed: 8 }), index = model.state.puzzle.findIndex(Boolean);
  const puzzle = model.state.puzzle.slice(), value = puzzle[index]; model.select(index);
  assert.equal(model.input(value % 9 + 1).changed, false); assert.equal(model.erase().changed, false);
  model.setInputMode('note'); assert.equal(model.input(1).changed, false);
  assert.equal(model.applyHint({ kind: 'reveal', index, digit: value }).changed, false);
  assert.deepEqual(model.state.puzzle, puzzle); assert.equal(model.state.grid[index], value);
  assert.equal(model.state.notes[index], 0);
});

test('cell-first and number-first entry are explicit and do not fill while choosing a number first', () => {
  const model = blankModel(); model.select(0); model.chooseNumber(3); assert.equal(model.state.grid[0], 3);
  model.setNumberFirst(true); model.chooseNumber(4); assert.equal(model.state.grid[0], 3);
  model.select(1); model.select(12); assert.equal(model.state.grid[1], 4); assert.equal(model.state.grid[12], 4);
  model.setInputMode('note'); model.chooseNumber(7); model.select(40);
  assert.equal(model.state.notes[40], bit(7)); model.select(40); assert.equal(model.state.notes[40], 0);
  model.setNumberFirst(false); model.select(41); assert.equal(model.state.notes[41], 0);
});

test('undo and redo survive JSON save/restore, stay bounded, and new moves invalidate redo', () => {
  const model = blankModel(); model.setInputMode('note');
  for (let n = 0; n < HISTORY_LIMIT + 7; n++) model.input(1, n % 81);
  assert.equal(model.state.history.length, HISTORY_LIMIT);
  model.undo(); model.undo(); model.setNumberFirst(true);
  const saved = JSON.parse(JSON.stringify(model.serialize())), restored = createSudokuModel(saved);
  assert.deepEqual(restored.serialize(), saved);
  restored.redo(); model.redo(); assert.deepEqual(restored.serialize(), model.serialize());
  restored.input(8, 60); assert.equal(restored.state.future.length, 0); assert.equal(restored.redo().changed, false);
  saved.grid[0] = 9; assert.notEqual(restored.state.grid[0], 9);
});

test('legacy saves retain player progress and recover missing answers without losing valid entries', () => {
  const made = generatePuzzle({ seed: 21 }), index = made.puzzle.findIndex(n => !n), grid = made.puzzle.slice(); grid[index] = made.solution[index];
  const legacy = { ...made, grid, selected: index, hints: 3, seen: { first: 1, r0: 1 }, details: { hints: 3, edits: 8, editCounts: { [index]: 2 }, maxEditsOneCell: 2, finalErrors: 0 } };
  const restored = createSudokuModel(legacy);
  assert.deepEqual(restored.state.grid, grid); assert.deepEqual(restored.state.puzzle, made.puzzle);
  assert.equal(restored.state.selected, index); assert.equal(restored.state.hints, 3); assert.equal(restored.state.details.edits, 8);
  assert.deepEqual(restored.state.seen, legacy.seen); assert.equal(restored.state.notes.length, 81);
  const repaired = createSudokuModel({ ...legacy, solution: [] });
  assert.deepEqual(repaired.state.grid, grid); assert.deepEqual(repaired.state.solution, made.solution);
});

test('malformed nested fields cannot replace outer board, pollute prototypes, or corrupt givens/history', () => {
  const made = generatePuzzle({ seed: 31 }), fixed = made.puzzle.findIndex(Boolean), index = made.puzzle.findIndex(n => !n);
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"grid":[9],"edits":"bad","editCounts":{"__proto__":99,"90":2,"0":"oops"}}');
  const grid = made.puzzle.slice(); grid[index] = made.solution[index]; grid[fixed] = 0;
  const restored = createSudokuModel({ ...made, grid, selected: 999, hints: -2, notes: Array(81).fill(-1), details: malicious,
    model: { puzzle: empty(), grid: empty(), solution: [] }, state: { grid: empty() },
    history: [{ kind: 'input', changes: [{ index: fixed, beforeValue: 0, afterValue: made.puzzle[fixed], beforeNotes: 0, afterNotes: 0 }] }], future: [{ bad: true }], seen: ['bad'] });
  assert.equal(restored.state.grid[fixed], made.puzzle[fixed]); assert.equal(restored.state.grid[index], grid[index]);
  assert.deepEqual(restored.state.puzzle, made.puzzle); assert.equal(restored.state.selected, -1);
  assert.equal(restored.state.hints, 0); assert.equal(restored.state.details.edits, 0);
  assert.ok(restored.state.notes.every(n => n === 0)); assert.deepEqual(restored.state.history, []); assert.deepEqual(restored.state.future, []);
  assert.equal({}.polluted, undefined); assert.equal(restored.undo().changed, false);
});

test('restore keeps valid recent transactions but refuses malformed, detached, and filled-cell-note history', () => {
  const model = blankModel(); model.input(1, 0); model.input(2, 1);
  const save = model.serialize(); save.history[0].changes[0].afterValue = 8;
  const restored = createSudokuModel(save); assert.equal(restored.state.history.length, 1);
  restored.undo(); assert.equal(restored.state.grid[1], 0); assert.equal(restored.state.grid[0], 1);
  const bad = model.serialize(); bad.history.at(-1).changes[0].afterNotes = 1;
  assert.equal(createSudokuModel(bad).state.history.length, 0);
});

test('sparse legacy arrays normalize to dense cells and masks instead of silently passing validation', () => {
  const sparse = Array(81); sparse[0] = solved[0];
  const restored = createSudokuModel({ puzzle: sparse, solution: solved, grid: Array(81), notes: Array(81) });
  assert.equal(restored.state.grid[0], solved[0]); assert.equal(restored.state.grid[80], 0);
  assert.equal(Object.keys(restored.state.grid).length, 81); assert.equal(Object.keys(restored.state.notes).length, 81);
  assert.ok(restored.state.notes.every(n => n === 0));
});

test('completion validates every unit and accepts another valid solution of legacy non-unique puzzles', () => {
  const alternate = solved.map(n => n === 1 ? 2 : n === 2 ? 1 : n);
  assert.notDeepEqual(alternate, solved); assert.ok(isComplete(alternate, empty()));
  const model = blankModel({ grid: alternate }); assert.equal(model.findHint().kind, 'complete');
  const broken = alternate.slice(); broken[0] = broken[1]; assert.equal(isComplete(broken), false);
  assert.ok(conflictCells(broken).includes(0)); assert.ok(conflictCells(broken).includes(1));
  const mismatchingGiven = empty(); mismatchingGiven[0] = solved[0]; assert.equal(isComplete(alternate, mismatchingGiven), false);
  assert.equal(isComplete(empty()), false);
});

test('hints identify current-board conflicts and contradictions before offering a digit', () => {
  const conflict = blankModel(); conflict.input(1, 0); conflict.input(1, 1);
  const hint = conflict.findHint(), before = boardSnapshot(conflict);
  assert.equal(hint.kind, 'conflict'); assert.deepEqual(hint.cells, [0, 1]);
  assert.equal(conflict.applyHint(hint).changed, false); assert.deepEqual(boardSnapshot(conflict), before); assert.equal(conflict.state.hints, 0);
  const grid = empty(); for (let i = 0; i < 8; i++) grid[i] = i + 1; grid[17] = 9;
  const impossible = blankModel({ grid }); assert.equal(conflictCells(grid).length, 0);
  assert.equal(impossible.findHint().kind, 'contradiction'); assert.equal(impossible.findHint().reason, 'no-candidates');
  const made = generatePuzzle({ difficulty: 'hard', seed: 0 }), wrong = made.puzzle.slice(); wrong[0] = 4;
  const contradiction = createSudokuModel({ ...made, grid: wrong });
  assert.equal(contradiction.findHint().kind, 'contradiction'); assert.equal(contradiction.findHint().reason, 'no-solution');
});

test('naked and hidden hints include verifiable logical provenance independent of notes', () => {
  const grid = solved.slice(); grid[0] = 0; const model = blankModel({ grid, notes: Array(81).fill(0) });
  const naked = model.findHint(); assert.equal(naked.kind, 'naked-single'); assert.equal(naked.index, 0); assert.equal(naked.digit, solved[0]);
  assert.equal(naked.candidateMask, bit(naked.digit));
  const hiddenModel = createSudokuModel(null, { difficulty: 'expert', seed: 1 }), hidden = hiddenModel.findHint();
  assert.equal(hidden.kind, 'hidden-single'); assert.ok(maskDigits(hidden.candidateMask).length > 1);
  const unit = UNITS[(hidden.unit === 'row' ? 0 : hidden.unit === 'column' ? 9 : 18) + hidden.unitIndex];
  assert.deepEqual(unit.filter(i => candidates(hiddenModel.state.grid, i) & bit(hidden.digit)), [hidden.index]);
});

test('hint fill is editable and undoable without changing original givens or refunding hint usage', () => {
  const model = createSudokuModel(null, { seed: 20 }), puzzle = model.state.puzzle.slice(); model.fillNotes();
  const before = boardSnapshot(model), hint = model.findHint();
  model.setInputMode('note'); assert.equal(model.applyHint(hint).changed, true);
  assert.equal(model.state.grid[hint.index], hint.digit); assert.deepEqual(model.state.puzzle, puzzle);
  assert.equal(model.state.puzzle[hint.index], 0); assert.equal(model.state.hints, 1);
  assert.equal(model.state.inputMode, 'note'); model.undo(); assert.deepEqual(boardSnapshot(model), before);
  assert.equal(model.state.hints, 1); assert.equal(model.state.details.hints, 1);
  model.redo(); assert.equal(model.erase(hint.index).changed, true);
});

test('reveal is explicitly marked and follows a valid legacy branch, while stale hints cannot write', () => {
  const alternate = solved.map(n => n === 1 ? 2 : n === 2 ? 1 : n), grid = empty(); grid[0] = alternate[0];
  const model = blankModel({ grid }); const reveal = model.findHint();
  assert.equal(reveal.kind, 'reveal'); assert.ok(candidates(grid, reveal.index) & bit(reveal.digit));
  model.applyHint(reveal); assert.ok(solve(model.state.grid)); assert.equal(model.state.grid[0], alternate[0]);
  const fresh = blankModel(), old = fresh.findHint(); fresh.input(9, old.index);
  const before = boardSnapshot(fresh); assert.equal(fresh.applyHint(old).changed, false); assert.deepEqual(boardSnapshot(fresh), before);
});

test('previewing an answer counts assistance even when dismissed and filled manually', () => {
  const model = createSudokuModel(null, { seed: 10 }), before = boardSnapshot(model), originalPuzzle = model.state.puzzle.slice();
  const hint = model.previewHint();
  assert.ok(['naked-single', 'hidden-single', 'reveal'].includes(hint.kind));
  assert.equal(model.state.hints, 1); assert.equal(model.state.details.hints, 1);
  assert.deepEqual(boardSnapshot(model), before); assert.equal(model.state.history.length, 0);
  model.input(hint.digit, hint.index);
  assert.equal(model.state.hints, 1); assert.deepEqual(model.state.puzzle, originalPuzzle);
});

test('repeated previews of the same deduction are charged once and notes do not invalidate it', () => {
  const model = createSudokuModel(null, { seed: 12 }), hint = model.previewHint();
  assert.deepEqual(model.previewHint(), hint); assert.equal(model.state.hints, 1);
  model.fillNotes(); assert.deepEqual(model.previewHint(), hint); assert.equal(model.state.hints, 1);
  model.undo(); assert.deepEqual(model.previewHint(), hint); assert.equal(model.state.hints, 1);
  assert.equal(model.state.hintPreview.steps.length, 1);
});

test('applying a previewed hint does not charge twice, while direct apply still charges once', () => {
  const model = createSudokuModel(null, { seed: 16 }), hint = model.previewHint();
  assert.equal(model.applyHint(hint).changed, true); assert.equal(model.state.hints, 1); assert.equal(model.state.details.hints, 1);
  assert.deepEqual(model.state.hintPreview.steps, []);
  const direct = createSudokuModel(null, { seed: 16 });
  assert.equal(direct.applyHint().changed, true); assert.equal(direct.state.hints, 1);
});

test('a changed board starts a new hint context and revealing the next deduction is counted', () => {
  const model = createSudokuModel(null, { seed: 18 }), first = model.previewHint();
  model.input(first.digit, first.index);
  const next = model.previewHint();
  assert.notEqual(next.index, first.index); assert.equal(model.state.hints, 2);
  assert.deepEqual(model.previewHint(), next); assert.equal(model.state.hints, 2);
  model.applyHint(next); assert.equal(model.state.hints, 2);
});

test('preview tokens survive JSON restore and cannot override the board or refund saved hint usage', () => {
  const model = createSudokuModel(null, { seed: 22 }), hint = model.previewHint(), save = model.serialize();
  const restored = createSudokuModel(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.serialize(), save); assert.deepEqual(restored.previewHint(), hint);
  assert.equal(restored.state.hints, 1); restored.applyHint(hint); assert.equal(restored.state.hints, 1);
  const detached = createSudokuModel({ ...save, hintPreview: { board: 'bad', steps: save.hintPreview.steps, grid: empty() } });
  assert.deepEqual(detached.state.grid, save.grid); assert.deepEqual(detached.state.hintPreview.steps, []);
  detached.previewHint(); assert.equal(detached.state.hints, 2);
  const malformed = createSudokuModel({ ...save, hintPreview: { board: save.grid.join(''), steps: ['reveal:100:1', null, {}, 'naked-single:0:99'] } });
  assert.deepEqual(malformed.state.hintPreview.steps, []); assert.equal(malformed.state.hints, 1);
});

test('conflict and contradiction guidance previews do not charge an answer hint', () => {
  const conflict = blankModel(); conflict.input(1, 0); conflict.input(1, 1);
  assert.equal(conflict.previewHint().kind, 'conflict'); assert.equal(conflict.state.hints, 0);
  const grid = empty(); for (let i = 0; i < 8; i++) grid[i] = i + 1; grid[17] = 9;
  const impossible = blankModel({ grid }); assert.equal(impossible.previewHint().kind, 'contradiction'); assert.equal(impossible.state.hints, 0);
  const completed = blankModel({ grid: solved }); assert.equal(completed.previewHint().kind, 'complete'); assert.equal(completed.state.hints, 0);
});
