import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/games/plugins/sudoku/index.js';
import { createSudokuModel, countSolutions, generatePuzzle, isComplete, solve } from '../src/games/plugins/sudoku/model.js';

// Small DOM/event boundary harness: exercises the real controller and renderer.
// It deliberately makes no browser layout, CSS visibility, or touch-size claims.
function harness(saved) {
  let doc, next = 0, paused = false, active = true, duration = saved?.durationMs ?? 10000;
  const frames = new Map(), timers = new Map(), saves = [], finishes = [], scores = [], clears = [], immersive = [];
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = new Map(); this._classes = new Set();
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.classList = { add: (...names) => names.forEach(n => this._classes.add(n)), remove: (...names) => names.forEach(n => this._classes.delete(n)),
        contains: n => this._classes.has(n), toggle: (n, value = !this._classes.has(n)) => value ? this._classes.add(n) : this._classes.delete(n) };
    }
    set className(value) { this._classes = new Set(value.split(' ')); }
    get className() { return [...this._classes].join(' '); }
    get isConnected() { return this === doc || !!this.parentElement?.isConnected; }
    append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
    replaceChildren(...nodes) { for (const node of this.children) node.parentElement = null; this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    addEventListener(kind, action) { if (!this.listeners.has(kind)) this.listeners.set(kind, new Set()); this.listeners.get(kind).add(action); }
    removeEventListener(kind, action) { this.listeners.get(kind)?.delete(action); }
    dispatch(kind, event = {}) { for (const action of this.listeners.get(kind) || []) action(event); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
    focus() { doc.activeElement = this; }
    click() { if (!this.disabled) this.onclick?.({ target: this }); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector === '[data-sudoku-cell]') return !!this.dataset.sudokuCell;
      return this.tagName === selector.split(':')[0].toUpperCase() && (!selector.includes('disabled') || !this.disabled);
    }
    querySelectorAll(selector) { return this.children.flatMap(node => [...(selector.split(',').some(s => node.matches(s.trim())) ? [node] : []), ...node.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { width: 390, height: 390 }; }
  }
  doc = new Element('document'); doc.head = new Element('head'); doc.body = new Element('body'); doc.append(doc.head, doc.body);
  doc.createElement = tag => new Element(tag); doc.createElementNS = (_, tag) => new Element(tag);
  doc.getElementById = id => doc.querySelector('#' + id); doc.activeElement = doc.body; doc.hidden = false; doc.visibilityState = 'visible';
  const win = new Element('window');
  win.requestAnimationFrame = action => { frames.set(++next, action); return next; }; win.cancelAnimationFrame = id => frames.delete(id);
  win.setInterval = action => { timers.set(++next, action); return next; }; win.clearInterval = id => timers.delete(id);
  win.NativeBridge = { setGameImmersive: value => immersive.push(value) };
  const env = { document: doc, window: win, legacy: {
    choiceForState: () => ({ id: 'hard', title: '困难', blanks: [53, 58] }), choiceSavePatch: () => ({ difficulty: 'hard' }), settings: () => ({ theme: 'day' }),
    currentGameDurationMs: () => duration, scoreWithChoice: (_, score) => score, sudokuScore: (_, hints) => 5000 - hints * 100,
  }, isActive: () => active, isPaused: () => paused, setPaused: value => { paused = value; },
    save: (state, force) => saves.push({ state: structuredClone(state), force }), clear: () => clears.push(true), setScore: score => scores.push(score), speak() {},
    finish: (...args) => { finishes.push(args); active = false; }, exit: () => { active = false; } };
  const game = createGame(env, saved);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(action => action(0)); };
  const element = id => { const found = doc.getElementById(id); assert.ok(found, `Missing controller element ${id}`); return found; };
  flush();
  return { game, doc, win, frames, timers, saves, finishes, scores, clears, immersive, element, flush,
    click: id => { element(id).click(); flush(); },
    cell: index => { const board = element('wb-sudoku-board'); board.onclick({ target: board.children[index] }); flush(); },
    key: (key, options = {}) => { const event = { key, target: doc.activeElement, preventDefault() { this.defaultPrevented = true; }, ...options }; doc.dispatch('keydown', event); flush(); return event; },
    toggle: (id, checked) => { const input = element(id); input.checked = checked; input.onchange({ target: input }); flush(); },
    advance: ms => { if (active && !paused && !doc.hidden) duration += ms; [...timers.values()].forEach(action => action()); flush(); },
    hide: () => { doc.hidden = true; doc.visibilityState = 'hidden'; doc.dispatch('visibilitychange'); flush(); },
    show: () => { doc.hidden = false; doc.visibilityState = 'visible'; doc.dispatch('visibilitychange'); flush(); },
  };
}

const empty = () => Array(81).fill(0), answer = solve(empty());
const alternate = answer.map(n => n === 1 ? 2 : n === 2 ? 1 : n);
const legacyPuzzle = answer.map(n => n <= 2 ? 0 : n);
const boardState = game => { const s = game.getState(); return { grid: s.grid, notes: s.notes, selected: s.selected, hints: s.hints }; };

test('legacy multi-solution saves accept a legal alternative branch with automatic checking enabled', () => {
  const grid = alternate.slice(); grid[0] = 0;
  assert.equal(countSolutions(legacyPuzzle), 2); assert.ok(solve(grid));
  const h = harness({ puzzle: legacyPuzzle, solution: answer, grid, sudokuOptions: { autoCheck: true } });
  assert.equal(h.game.getState().view.uniquePuzzle, false);
  const cells = h.element('wb-sudoku-board').children;
  assert.equal(cells.filter(cell => cell.classList.contains('wrong')).length, 0);
  assert.ok(cells.every(cell => cell.getAttribute('aria-invalid') === 'false'));
  assert.deepEqual(h.game.getState().grid, grid); h.game.destroy();
});

test('a restored complete board settles once after controller mounting with an explicit score result', async () => {
  assert.ok(isComplete(alternate, legacyPuzzle));
  const h = harness({ puzzle: legacyPuzzle, solution: answer, grid: alternate, hints: 3, durationMs: 42000 });
  assert.equal(h.finishes.length, 0, 'the host must have time to attach the returned controller');
  await Promise.resolve();
  assert.equal(h.finishes.length, 1); assert.deepEqual(h.finishes[0][2], { outcome: 'score', score: 4700 });
  assert.equal(h.finishes[0][3].details.hints, 3); assert.deepEqual(h.scores, [4700]); assert.equal(h.clears.length, 1);
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0); assert.deepEqual(h.immersive, [true, false]);
  const saves = h.saves.length; h.advance(60000); h.game.save(); h.game.destroy(); await Promise.resolve();
  assert.equal(h.finishes.length, 1); assert.equal(h.saves.length, saves);
});

test('a recovered-board completion microtask cannot finish a controller already destroyed', async () => {
  const h = harness({ puzzle: legacyPuzzle, solution: answer, grid: alternate }); h.game.destroy();
  await Promise.resolve(); assert.equal(h.finishes.length, 0); assert.equal(h.clears.length, 0);
});

test('controller charges revealed hint previews immediately, persists dismissal, and deduplicates reopens and apply', () => {
  const made = generatePuzzle({ seed: 10 }), h = harness(made);
  const expected = createSudokuModel(made).findHint(), before = h.game.getState().grid;
  h.click('wb-sudoku-hint');
  assert.equal(h.game.getState().hints, 1); assert.equal(h.saves.at(-1).state.hints, 1); assert.equal(h.saves.at(-1).force, true);
  assert.deepEqual(h.game.getState().grid, before); assert.equal(h.game.getState().view.paused, true);
  h.click('wb-sudoku-dialog-close'); assert.equal(h.game.getState().hints, 1);
  h.click('wb-sudoku-hint'); assert.equal(h.game.getState().hints, 1);
  h.click('wb-sudoku-apply-hint'); assert.equal(h.game.getState().hints, 1);
  assert.equal(h.game.getState().grid[expected.index], expected.digit); assert.equal(h.game.getState().puzzle[expected.index], 0);
  h.click('wb-sudoku-undo'); assert.deepEqual(h.game.getState().grid, before); assert.equal(h.game.getState().hints, 1);
  h.game.destroy();
});

test('saved preview tokens avoid charging the same displayed answer again after controller restoration', () => {
  const first = harness(generatePuzzle({ seed: 22 })); first.click('wb-sudoku-hint');
  const save = first.saves.at(-1).state; first.game.destroy();
  const resumed = harness(save); resumed.click('wb-sudoku-hint');
  assert.equal(resumed.game.getState().hints, 1); resumed.click('wb-sudoku-apply-hint'); assert.equal(resumed.game.getState().hints, 1);
  resumed.game.destroy();
});

test('pause and background visibility block pointer, keyboard and note edits while preserving the clock', () => {
  const made = generatePuzzle({ seed: 7 }), h = harness(made), index = made.puzzle.findIndex(n => !n);
  h.cell(index); h.click('wb-sudoku-pause'); const before = boardState(h.game), clock = h.element('wb-sudoku-time').textContent;
  h.click('wb-sudoku-number-1'); h.cell((index + 1) % 81); h.key('2'); h.key('Delete'); h.click('wb-sudoku-notes'); h.advance(60000);
  assert.deepEqual(boardState(h.game), before); assert.equal(h.element('wb-sudoku-time').textContent, clock);
  h.click('wb-sudoku-resume'); h.key(String(made.solution[index])); assert.equal(h.game.getState().grid[index], made.solution[index]);
  h.hide(); const hidden = boardState(h.game); h.key('Delete'); h.click('wb-sudoku-number-9'); h.advance(60000); h.show();
  assert.deepEqual(boardState(h.game), hidden); assert.equal(h.game.getState().view.dialog, 'pause');
  h.click('wb-sudoku-resume'); h.advance(1000); assert.equal(h.element('wb-sudoku-time').textContent, '00:11'); h.game.destroy();
});

test('number-first keyboard navigation does not paint cells and notes with undo survive controller save', () => {
  const h = harness({ puzzle: empty(), solution: answer, grid: empty() });
  h.click('wb-sudoku-settings'); h.toggle('wb-sudoku-option-number-first', true); h.click('wb-sudoku-dialog-close');
  h.click('wb-sudoku-number-4'); assert.ok(h.game.getState().grid.every(n => !n));
  h.cell(0); assert.equal(h.game.getState().grid[0], 4);
  h.key('ArrowRight'); assert.equal(h.game.getState().selected, 1); assert.equal(h.game.getState().grid[1], 0);
  h.click('wb-sudoku-notes'); h.click('wb-sudoku-number-2'); h.cell(1); assert.equal(h.game.getState().notes[1], 2);
  const save = h.saves.at(-1).state; h.game.destroy();
  const restored = harness(save); assert.equal(restored.game.getState().numberFirst, true); assert.equal(restored.game.getState().inputMode, 'note');
  restored.click('wb-sudoku-undo'); assert.equal(restored.game.getState().notes[1], 0);
  restored.click('wb-sudoku-redo'); assert.equal(restored.game.getState().notes[1], 2); restored.game.destroy();
});

test('entering the final number finishes once with the real result and removes idle callbacks', async () => {
  const grid = answer.slice(); grid[0] = 0;
  const h = harness({ puzzle: legacyPuzzle, solution: answer, grid, selected: 0, hints: 2 });
  h.click('wb-sudoku-number-' + answer[0]);
  assert.equal(h.finishes.length, 1); assert.deepEqual(h.finishes[0][2], { outcome: 'score', score: 4800 });
  assert.equal(h.finishes[0][3].details.hints, 2); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  const savedCount = h.saves.length; h.key('1'); h.advance(1000); h.game.save(); await Promise.resolve();
  assert.equal(h.finishes.length, 1); assert.equal(h.saves.length, savedCount); h.game.destroy();
});
