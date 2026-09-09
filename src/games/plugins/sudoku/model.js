// Original, framework-free Sudoku rules and save format. Masks use bit 0 for 1.
// Difficulty is a clue-count setting, not a claim about required solving techniques.
export const ALL_DIGITS = 0x1ff;
export const HISTORY_LIMIT = 80;
export const DIFFICULTIES = Object.freeze({ easy: Object.freeze([30, 35]), medium: Object.freeze([43, 48]), hard: Object.freeze([53, 58]), expert: Object.freeze([59, 61]) });
export const UNITS = Object.freeze([
  ...Array.from({ length: 9 }, (_, r) => Object.freeze(Array.from({ length: 9 }, (_, c) => r * 9 + c))),
  ...Array.from({ length: 9 }, (_, c) => Object.freeze(Array.from({ length: 9 }, (_, r) => r * 9 + c))),
  ...Array.from({ length: 9 }, (_, b) => Object.freeze(Array.from({ length: 9 }, (_, k) => Math.floor(b / 3) * 27 + b % 3 * 3 + Math.floor(k / 3) * 9 + k % 3)))
]);
export const PEERS = Object.freeze(Array.from({ length: 81 }, (_, i) => Object.freeze(
  [...new Set(UNITS.filter(unit => unit.includes(i)).flat())].filter(j => j !== i).sort((a, b) => a - b)
)));
const validIndex = i => Number.isInteger(i) && i >= 0 && i < 81;
const validDigit = n => Number.isInteger(n) && n >= 1 && n <= 9;
const validValue = n => Number.isInteger(n) && n >= 0 && n <= 9;
const validMask = n => Number.isInteger(n) && n >= 0 && n <= ALL_DIGITS;
const validBoard = board => Array.isArray(board) && board.length === 81 && Array.from(board).every(validValue);
const bit = digit => 1 << (digit - 1);
const bitDigit = mask => 32 - Math.clz32(mask);
const bitCount = mask => { let n = 0; for (; mask; mask &= mask - 1) n++; return n; };
const counter = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const VALUE_HINTS = ['naked-single', 'hidden-single', 'reveal'];

export function maskDigits(mask) {
  return validMask(mask) ? Array.from({ length: 9 }, (_, i) => i + 1).filter(n => mask & bit(n)) : [];
}

export function candidates(grid, index) {
  if (!validBoard(grid) || !validIndex(index) || grid[index]) return 0;
  let used = 0;
  for (const peer of PEERS[index]) if (grid[peer]) used |= bit(grid[peer]);
  return ALL_DIGITS & ~used;
}

export function conflictCells(grid) {
  if (!validBoard(grid)) return [];
  return grid.flatMap((value, i) => value && PEERS[i].some(j => grid[j] === value) ? [i] : []);
}

export function isComplete(grid, puzzle) {
  return validBoard(grid) && grid.every(Boolean) && (!puzzle || (validBoard(puzzle) && puzzle.every((n, i) => !n || n === grid[i]))) &&
    UNITS.every(unit => unit.reduce((mask, i) => mask | bit(grid[i]), 0) === ALL_DIGITS);
}

/** Bounded MRV search. exhausted must never be interpreted as proof of uniqueness. */
function search(board, limit = 1, maxNodes = 250000) {
  const result = { count: 0, solution: null, nodes: 0, exhausted: false };
  if (!validBoard(board)) return result;
  maxNodes = Number.isFinite(maxNodes) && maxNodes >= 0 ? Math.min(5000000, Math.floor(maxNodes)) : 250000;
  const grid = board.slice(), rows = new Uint16Array(9), columns = new Uint16Array(9), boxes = new Uint16Array(9);
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    const r = Math.floor(i / 9), c = i % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3), m = bit(grid[i]);
    if ((rows[r] | columns[c] | boxes[b]) & m) return result;
    rows[r] |= m; columns[c] |= m; boxes[b] |= m;
  }
  const visit = () => {
    if (result.nodes++ >= maxNodes) { result.exhausted = true; return; }
    let selected = -1, choices = 0, minimum = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const r = Math.floor(i / 9), c = i % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const mask = ALL_DIGITS & ~(rows[r] | columns[c] | boxes[b]), size = bitCount(mask);
      if (!size) return;
      if (size < minimum) { minimum = size; selected = i; choices = mask; if (size === 1) break; }
    }
    if (selected === -1) { result.count++; if (!result.solution) result.solution = grid.slice(); return; }
    const r = Math.floor(selected / 9), c = selected % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    while (choices && result.count < limit && !result.exhausted) {
      const m = choices & -choices; choices ^= m;
      grid[selected] = bitDigit(m); rows[r] |= m; columns[c] |= m; boxes[b] |= m;
      visit();
      grid[selected] = 0; rows[r] ^= m; columns[c] ^= m; boxes[b] ^= m;
    }
  };
  visit();
  return result;
}

export function solve(grid, options = {}) {
  return search(grid, 1, options.maxNodes ?? 250000).solution;
}

/** Counts up to limit (default 2); throws if the search budget cannot prove a count. */
export function countSolutions(grid, limit = 2, options = {}) {
  const result = search(grid, Math.max(1, Math.min(100, counter(limit) || 2)), options.maxNodes ?? 250000);
  if (result.exhausted) throw new RangeError('Sudoku search budget exhausted');
  return result.count;
}

export function seededRandom(seed) {
  let state = Number.isFinite(seed) ? seed >>> 0 : 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const sample = random(), j = Math.floor((Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999999, sample)) : 0) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Original seed bank generated with this module's MRV solver, RNG seed 20260909:
// begin with solve(empty); shuffle clue removals and keep a removal only when
// countSolutions === 1. Escape local minima by adding 2..6 random solution clues,
// then repeat removal; retain a larger puzzle with probability exp(-1.8 * delta).
// These four 20-clue boards were independently produced, not copied from a puzzle
// collection. First-use verification also validates their cached-free solutions.
// Row/band/column/stack/digit permutations and transpose preserve uniqueness;
// adding solution clues preserves it too. Runtime has no unbounded removal loop.
const SEED_PUZZLES = [
  '100406000050000103000020000000000800070000060600030000007200040002890000008001000',
  '000006000000080100709003050201000800000900000600500000000200000040090031068000000',
  '020056700400080003000120000000004090070000000000000200300005000000007601908000000',
  '000406000050000103000020050030000005800900000004000000007200048000090030060001000'
];
let checkedSeeds;

export function generatePuzzle(options = {}) {
  const random = typeof options.random === 'function' ? options.random : options.seed !== undefined ? seededRandom(options.seed) : Math.random;
  if (!checkedSeeds) checkedSeeds = SEED_PUZZLES.map(text => {
    const puzzle = [...text].map(Number), checked = search(puzzle, 2);
    if (checked.exhausted || checked.count !== 1 || !isComplete(checked.solution, puzzle)) throw new Error('Invalid Sudoku seed');
    return { puzzle, solution: checked.solution };
  });
  const supplied = Array.isArray(options.blanks) ? options.blanks : DIFFICULTIES[options.difficulty] || DIFFICULTIES.easy;
  const minimum = Number.isInteger(supplied[0]) ? Math.max(0, Math.min(61, supplied[0])) : 30;
  const maximum = Number.isInteger(supplied[1]) ? Math.max(minimum, Math.min(61, supplied[1])) : minimum;
  const sample = random(), target = minimum + Math.floor((Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999999, sample)) : 0) * (maximum - minimum + 1));
  const seed = shuffled(checkedSeeds, random)[0], digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const rows = shuffled([0, 1, 2], random).flatMap(b => shuffled([0, 1, 2], random).map(r => b * 3 + r));
  const columns = shuffled([0, 1, 2], random).flatMap(b => shuffled([0, 1, 2], random).map(c => b * 3 + c));
  const transpose = random() >= 0.5;
  const transform = board => Array.from({ length: 81 }, (_, i) => {
    const r = rows[Math.floor(i / 9)], c = columns[i % 9], n = board[transpose ? c * 9 + r : r * 9 + c];
    return n ? digits[n - 1] : 0;
  });
  const puzzle = transform(seed.puzzle), solution = transform(seed.solution);
  const empty = shuffled(puzzle.flatMap((n, i) => n ? [] : [i]), random);
  for (const i of empty.slice(0, empty.length - target)) puzzle[i] = solution[i];
  return { puzzle, solution };
}

function cleanDetails(value, hints) {
  const source = plainObject(value), editCounts = {};
  for (const [key, count] of Object.entries(plainObject(source.editCounts))) {
    if (/^(?:[0-9]|[1-7][0-9]|80)$/.test(key) && counter(count)) editCounts[key] = counter(count);
  }
  return { hints, edits: counter(source.edits), editCounts,
    maxEditsOneCell: Math.max(counter(source.maxEditsOneCell), 0, ...Object.values(editCounts)), finalErrors: counter(source.finalErrors) };
}

function cleanSeen(value) {
  const result = {};
  for (const [key, flag] of Object.entries(plainObject(value)).slice(0, 100)) {
    if (/^(first|near|gameover|r[0-8]|c[0-8])$/.test(key) && (flag === true || flag === 1)) result[key] = 1;
  }
  return result;
}

function cleanTransaction(value, puzzle) {
  if (!value || !['input', 'note', 'erase', 'hint', 'fill-notes'].includes(value.kind) || !Array.isArray(value.changes) || !value.changes.length || value.changes.length > 81) return null;
  const seen = new Set(), changes = [];
  for (const change of value.changes) {
    if (!change || !validIndex(change.index) || puzzle[change.index] || seen.has(change.index) ||
      !validValue(change.beforeValue) || !validValue(change.afterValue) || !validMask(change.beforeNotes) || !validMask(change.afterNotes) ||
      (change.beforeValue && change.beforeNotes) || (change.afterValue && change.afterNotes) ||
      (change.beforeValue === change.afterValue && change.beforeNotes === change.afterNotes)) return null;
    seen.add(change.index);
    changes.push({ index: change.index, beforeValue: change.beforeValue, afterValue: change.afterValue, beforeNotes: change.beforeNotes, afterNotes: change.afterNotes });
  }
  return { kind: value.kind, changes };
}

function restoreStack(value, puzzle, grid, notes, reverse, limit) {
  if (!Array.isArray(value)) return [];
  const workGrid = grid.slice(), workNotes = notes.slice(), kept = [];
  for (const raw of value.slice(-limit).reverse()) {
    const transaction = cleanTransaction(raw, puzzle), from = reverse ? 'after' : 'before', to = reverse ? 'before' : 'after';
    if (!transaction || transaction.changes.some(c => workGrid[c.index] !== c[from + 'Value'] || workNotes[c.index] !== c[from + 'Notes'])) break;
    for (const c of transaction.changes) { workGrid[c.index] = c[to + 'Value']; workNotes[c.index] = c[to + 'Notes']; }
    kept.unshift(transaction);
  }
  return kept;
}

function cleanHintPreview(value, grid, hints) {
  const board = grid.join(''), source = plainObject(value), steps = [];
  if (source.board === board && Array.isArray(source.steps) && hints > 0) {
    for (const token of source.steps.slice(-81)) {
      const match = typeof token === 'string' && token.match(/^(naked-single|hidden-single|reveal):([0-9]|[1-7][0-9]|80):([1-9])$/);
      if (match && !grid[Number(match[2])] && !steps.includes(token) && steps.length < hints) steps.push(token);
    }
  }
  return { board, steps };
}

/** Restores only named top-level fields. Nested UI/history data cannot replace the board. */
export function createSudokuModel(savedState, options = {}) {
  const source = plainObject(savedState), limit = Number.isInteger(options.historyLimit) ? Math.max(1, Math.min(HISTORY_LIMIT, options.historyLimit)) : HISTORY_LIMIT;
  let puzzle = Array.isArray(source.puzzle) && source.puzzle.length === 81 ? Array.from(source.puzzle, n => validValue(n) ? n : 0) : null;
  let solution = isComplete(source.solution) ? source.solution.slice() : null;
  // Keep usable legacy clues and player entries even if its cached answer is damaged.
  if (puzzle && conflictCells(puzzle).length) {
    if (solution) puzzle = puzzle.map((n, i) => n === solution[i] ? n : 0);
    else puzzle = null;
  }
  if (puzzle && (!solution || !puzzle.every((n, i) => !n || n === solution[i]))) solution = solve(puzzle);
  if (!puzzle || !solution) ({ puzzle, solution } = generatePuzzle(options));
  const gridSource = Array.isArray(source.grid) && source.grid.length === 81 ? source.grid : puzzle;
  const grid = puzzle.map((n, i) => n || (validValue(gridSource[i]) ? gridSource[i] : 0));
  const notes = grid.map((n, i) => !n && Array.isArray(source.notes) && validMask(source.notes[i]) ? source.notes[i] : 0);
  const hints = counter(source.hints);
  const state = { version: 2, puzzle, solution, grid, notes,
    selected: validIndex(source.selected) ? source.selected : -1, hints, seen: cleanSeen(source.seen), details: cleanDetails(source.details, hints),
    inputMode: source.inputMode === 'note' ? 'note' : 'pen', numberFirst: source.numberFirst === true,
    activeNumber: validDigit(source.activeNumber) ? source.activeNumber : 0, autoClean: source.autoClean !== false,
    hintPreview: cleanHintPreview(source.hintPreview, grid, hints),
    history: restoreStack(source.history, puzzle, grid, notes, true, limit), future: restoreStack(source.future, puzzle, grid, notes, false, limit) };
  const noChange = (kind, extra = {}) => ({ changed: false, kind, ...extra });
  const editable = index => validIndex(index) && !puzzle[index];

  function transact(kind, update) {
    const beforeGrid = state.grid.slice(), beforeNotes = state.notes.slice();
    update();
    const changes = [];
    for (let i = 0; i < 81; i++) {
      if (beforeGrid[i] !== state.grid[i] || beforeNotes[i] !== state.notes[i]) changes.push({ index: i,
        beforeValue: beforeGrid[i], afterValue: state.grid[i], beforeNotes: beforeNotes[i], afterNotes: state.notes[i] });
    }
    if (!changes.length) return noChange(kind);
    if (changes.some(c => c.beforeValue !== c.afterValue)) state.hintPreview = { board: state.grid.join(''), steps: [] };
    state.history.push({ kind, changes });
    if (state.history.length > limit) state.history.shift();
    state.future = [];
    return { changed: true, kind, cells: changes.map(c => c.index) };
  }

  function markEdit(index) {
    state.details.edits++;
    state.details.editCounts[index] = (state.details.editCounts[index] || 0) + 1;
    state.details.maxEditsOneCell = Math.max(state.details.maxEditsOneCell, state.details.editCounts[index]);
  }

  function place(index, digit, kind = 'input') {
    if (!editable(index) || !validDigit(digit)) return noChange(kind, { index, digit });
    const result = transact(kind, () => {
      state.grid[index] = digit; state.notes[index] = 0;
      if (state.autoClean) for (const peer of PEERS[index]) state.notes[peer] &= ~bit(digit);
    });
    if (result.changed) markEdit(index);
    return { ...result, index, digit };
  }

  function input(digit, index = state.selected) {
    if (!editable(index) || !validDigit(digit)) return noChange('input', { index, digit });
    if (state.inputMode !== 'note') return place(index, digit);
    if (state.grid[index]) return noChange('note', { index, digit });
    const result = transact('note', () => { state.notes[index] ^= bit(digit); });
    return { ...result, index, digit };
  }

  function select(index) {
    if (!validIndex(index)) return noChange('select');
    const changed = state.selected !== index; state.selected = index;
    return state.numberFirst && state.activeNumber ? input(state.activeNumber, index) : { changed, kind: 'select', index };
  }

  function chooseNumber(digit) {
    if (!validDigit(digit)) return noChange('choose-number');
    const changed = state.activeNumber !== digit; state.activeNumber = digit;
    return state.numberFirst ? { changed, kind: 'choose-number', digit } : input(digit);
  }

  function erase(index = state.selected) {
    if (!editable(index)) return noChange('erase', { index });
    const result = transact('erase', () => { state.grid[index] = 0; state.notes[index] = 0; });
    if (result.changed) markEdit(index);
    return { ...result, index };
  }

  function replay(reverse) {
    const stack = reverse ? state.history : state.future, transaction = stack[stack.length - 1], kind = reverse ? 'undo' : 'redo';
    if (!transaction) return noChange(kind);
    const from = reverse ? 'after' : 'before', to = reverse ? 'before' : 'after';
    // Refuse stale/mutated history instead of ever applying it to a different board.
    if (!cleanTransaction(transaction, puzzle) || transaction.changes.some(c => state.grid[c.index] !== c[from + 'Value'] || state.notes[c.index] !== c[from + 'Notes'])) return noChange(kind);
    stack.pop();
    for (const c of transaction.changes) { state.grid[c.index] = c[to + 'Value']; state.notes[c.index] = c[to + 'Notes']; }
    if (transaction.changes.some(c => c.beforeValue !== c.afterValue)) state.hintPreview = { board: state.grid.join(''), steps: [] };
    const destination = reverse ? state.future : state.history; destination.push(transaction);
    if (destination.length > limit) destination.shift();
    return { changed: true, kind, cells: transaction.changes.map(c => c.index) };
  }

  function findHint() {
    const conflicts = conflictCells(state.grid);
    const preferred = cells => cells.includes(state.selected) && editable(state.selected) ? state.selected : cells.find(editable) ?? cells[0] ?? -1;
    if (conflicts.length) return { kind: 'conflict', index: preferred(conflicts), cells: conflicts };
    if (isComplete(state.grid, puzzle)) return { kind: 'complete', index: -1, cells: [] };
    const masks = state.grid.map((_, i) => candidates(state.grid, i));
    const impossible = state.grid.flatMap((n, i) => !n && !masks[i] ? [i] : []);
    if (impossible.length) return { kind: 'contradiction', reason: 'no-candidates', index: preferred(impossible), cells: impossible };
    const checked = search(state.grid);
    if (!checked.solution) {
      const cells = state.grid.flatMap((n, i) => n && editable(i) ? [i] : []);
      return { kind: checked.exhausted ? 'unavailable' : 'contradiction', reason: checked.exhausted ? 'search-budget' : 'no-solution', index: preferred(cells), cells };
    }
    const empty = state.grid.flatMap((n, i) => n ? [] : [i]);
    if (empty.includes(state.selected)) empty.unshift(...empty.splice(empty.indexOf(state.selected), 1));
    for (const index of empty) if (bitCount(masks[index]) === 1) return { kind: 'naked-single', index, digit: bitDigit(masks[index]), candidateMask: masks[index], cells: [index] };
    for (const index of empty) for (let u = 0; u < 27; u++) {
      const unit = UNITS[u]; if (!unit.includes(index)) continue;
      for (const digit of maskDigits(masks[index])) if (unit.filter(i => masks[i] & bit(digit)).length === 1) {
        return { kind: 'hidden-single', index, digit, candidateMask: masks[index], unit: u < 9 ? 'row' : u < 18 ? 'column' : 'box', unitIndex: u % 9, cells: unit.slice() };
      }
    }
    const index = empty[0];
    // Reveal comes from a completion of the *current* board, so legacy non-unique
    // saves can continue on any valid branch. It is explicitly not a logical step.
    return { kind: 'reveal', index, digit: checked.solution[index], cells: [index] };
  }

  function countHint(hint) {
    if (!VALUE_HINTS.includes(hint.kind)) return;
    const board = state.grid.join(''), token = `${hint.kind}:${hint.index}:${hint.digit}`;
    if (state.hintPreview.board !== board) state.hintPreview = { board, steps: [] };
    if (state.hintPreview.steps.includes(token)) return;
    state.hintPreview.steps.push(token);
    state.hints++; state.details.hints = state.hints;
  }

  // The deduction has already exposed an answer when its explanation is shown.
  // Count that assistance even if the dialog is dismissed and the user fills it.
  function previewHint() {
    const hint = findHint();
    countHint(hint);
    return hint;
  }

  function applyHint(requested) {
    const hint = findHint();
    // Never trust a stale or caller-forged deduction after intervening edits.
    if (requested && (requested.kind !== hint.kind || requested.index !== hint.index || requested.digit !== hint.digit)) return noChange('hint', { reason: 'stale-hint', hint });
    if (validIndex(hint.index)) state.selected = hint.index;
    if (!VALUE_HINTS.includes(hint.kind)) return noChange('hint', { hint, reason: hint.kind });
    countHint(hint);
    const result = place(hint.index, hint.digit, 'hint');
    return { ...result, hint };
  }

  function setting(key, value) {
    const changed = state[key] !== value; state[key] = value;
    return { changed, kind: 'setting', setting: key };
  }

  return { state, select, chooseNumber, input, erase, findHint, previewHint, applyHint,
    setInputMode: mode => mode === 'pen' || mode === 'note' ? setting('inputMode', mode) : noChange('setting'),
    setNumberFirst: enabled => setting('numberFirst', enabled === true),
    setAutoClean: enabled => setting('autoClean', enabled !== false),
    fillNotes: () => transact('fill-notes', () => { for (let i = 0; i < 81; i++) state.notes[i] = candidates(state.grid, i); }),
    undo: () => replay(true), redo: () => replay(false),
    serialize: () => JSON.parse(JSON.stringify(state)) };
}
