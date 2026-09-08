import { gameSpriteHTML } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'minesweeper';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["choiceForState","choiceSavePatch","clearProgress","currentGameDurationMs","gamePaused","minesweeperScore","qs","qsa","saveProgress","scoreWithChoice","setScore","showGameOver","shuffleArray","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startMinesweeper(state) {
    const box = env.qs('#wb-gamebox');
    const choice = env.choiceForState('minesweeper', state);
    const W = choice.width || 16, H = choice.height || 16, MINES = choice.mines || 50, TOTAL = W * H, SAFE = TOTAL - MINES;
    const idx = (r, c) => r * W + c;
    const rc = i => ({ r:Math.floor(i / W), c:i % W });
    const neighbors = i => {
      const p = rc(i), out = [];
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
        if(!dr && !dc) continue;
        const r = p.r + dr, c = p.c + dc;
        if(r >= 0 && r < H && c >= 0 && c < W) out.push(idx(r, c));
      }
      return out;
    };
    const makeCells = () => Array.from({ length:TOTAL }, () => ({ mine:false, n:0, open:false, mark:0, boom:false, pulse:false }));
    const hydrateCells = arr => Array.from({ length:TOTAL }, (_, i) => {
      const c = arr && arr[i] ? arr[i] : {};
      return { mine:!!c.mine, n:Number(c.n || 0), open:!!c.open, mark:Number(c.mark || 0), boom:!!c.boom, pulse:false };
    });
    let cells = Array.isArray(state?.cells) && state.cells.length === TOTAL ? hydrateCells(state.cells) : makeCells();
    let mode = state?.mode === 'flag' ? 'flag' : 'open';
    let started = !!state?.started;
    let over = false;
    let clickCount = Number(state?.clickCount || 0);
    let lastDecisionAt = Number(state?.lastDecisionAt || Date.now());
    let seen = state?.seen || {};
    let details = state?.details || { flags:0, correctFlags:0, openedSafe:0, openedAtBlast:0, hesitations:0, chordSuccesses:0, riskyChordSuccesses:0, unflaggedMines:0, won:false };
    box.innerHTML = '<div class="wb-mines-panel"><div class="wb-mines-top"><span class="wb-pill" id="wb-mines-left"></span><span class="wb-pill" id="wb-mines-opened"></span><span class="wb-pill" id="wb-mines-mode"></span></div><div class="wb-mines-board" id="wb-mines-board"></div><div class="wb-actions wb-mines-actions"><button type="button" class="wb-btn primary" id="wb-mines-open-mode">翻开</button><button type="button" class="wb-btn" id="wb-mines-flag-mode">插旗</button></div></div>';
    draw(); save();

    function save(){ if(!over) env.saveProgress('minesweeper', Object.assign({ cells, mode, started, clickCount, lastDecisionAt, seen, details }, env.choiceSavePatch('minesweeper', choice))); }
    function countFlags(){ return cells.filter(c => c.mark === 1).length; }
    function openedSafe(){ return cells.filter(c => c.open && !c.mine).length; }
    function correctFlags(){ return cells.filter(c => c.mark === 1 && c.mine).length; }
    function remainingMines(){ return MINES - countFlags(); }
    function markDecision(){
      const now = Date.now();
      if(now - lastDecisionAt > 15000) details.hesitations = (details.hesitations || 0) + 1;
      lastDecisionAt = now;
    }
    function placeMines(first) {
      const banned = new Set([first].concat(neighbors(first)));
      const pool = Array.from({ length:TOTAL }, (_, i) => i).filter(i => !banned.has(i));
      env.shuffleArray(pool).slice(0, MINES).forEach(i => cells[i].mine = true);
      cells.forEach((c, i) => { c.n = c.mine ? 0 : neighbors(i).filter(n => cells[n].mine).length; });
      started = true;
    }
    function revealFrom(start) {
      const q = [start], changed = [];
      const seenQ = new Set();
      while(q.length) {
        const i = q.shift();
        if(seenQ.has(i)) continue;
        seenQ.add(i);
        const c = cells[i];
        if(!c || c.open || c.mark === 1) continue;
        c.mark = 0;
        c.open = true;
        changed.push(i);
        if(!c.mine && c.n === 0) neighbors(i).forEach(n => { if(!cells[n].open && cells[n].mark !== 1) q.push(n); });
      }
      return changed;
    }
    function maybeProgressLines(changed) {
      const opened = openedSafe();
      if(changed.some(i => cells[i].open && !cells[i].mine && cells[i].n > 0) && Math.random() < .32) env.speak('minesweeper','number');
      if(changed.filter(i => cells[i].open && !cells[i].mine).length > 5) env.speak('minesweeper','big_open');
      if(opened >= Math.ceil(SAFE / 2) && !seen.half){ seen.half=1; env.speak('minesweeper','half'); }
      if(remainingMines() <= 5 && !seen.last5){ seen.last5=1; env.speak('minesweeper','last_5'); }
    }
    function finalMeta(won, blastIndex) {
      const flags = countFlags(), correct = correctFlags(), opened = openedSafe();
      return {
        won,
        badLuck:!won && clickCount <= 3,
        regret:!won && remainingMines() <= 10,
        riskyChordSuccesses:details.riskyChordSuccesses || 0,
        flags,
        correctFlags:correct,
        openedSafe:opened,
        openedAtBlast:blastIndex == null ? opened : opened,
        unflaggedMines:won ? Math.max(0, MINES - flags) : 0,
        details:Object.assign(details, { won, flags, correctFlags:correct, openedSafe:opened, openedAtBlast:blastIndex == null ? opened : opened, unflaggedMines:won ? Math.max(0, MINES - flags) : 0 })
      };
    }
    function finish(won, blastIndex) {
      over = true;
      details.won = won;
      cells.forEach(c => { if(c.mine) c.open = true; });
      const meta = finalMeta(won, blastIndex);
      const finalScore = env.scoreWithChoice('minesweeper', env.minesweeperScore(env.currentGameDurationMs(), won, meta.correctFlags, meta.openedSafe), choice);
      env.setScore('minesweeper', finalScore);
      env.clearProgress('minesweeper');
      if(!won) env.speak('minesweeper','gameover');
      draw();
      env.showGameOver('minesweeper', won ? '扫雷完成' : '游戏结束', '本局分数：' + finalScore + '分（' + choice.title + '），' + (won ? '胜利' : '失败') + '，排对' + meta.correctFlags + '个雷，插旗' + meta.flags + '个', null, Object.assign(meta, { difficulty:choice.title }));
    }
    function checkWin() {
      if(openedSafe() >= SAFE) finish(true, null);
    }
    function openCell(i) {
      if(env.gamePaused || over) return;
      markDecision();
      const c = cells[i];
      if(!c || c.mark === 1) return;
      if(c.open) { chord(i); return; }
      clickCount++;
      if(!started) placeMines(i);
      if(c.mine){ c.boom = true; finish(false, i); return; }
      const changed = revealFrom(i);
      maybeProgressLines(changed);
      checkWin();
      if(!over){ draw(); save(); }
    }
    function cycleMark(i) {
      if(env.gamePaused || over) return;
      markDecision();
      const c = cells[i];
      if(!c || c.open) return;
      c.mark = (c.mark + 1) % 3;
      details.flags = countFlags();
      details.correctFlags = correctFlags();
      if(Math.random() < .38) env.speak('minesweeper','flag');
      if(remainingMines() <= 5 && !seen.last5){ seen.last5=1; env.speak('minesweeper','last_5'); }
      draw(); save();
    }
    function chord(i) {
      const c = cells[i];
      if(!c || !c.open || !c.n) return;
      markDecision();
      const ns = neighbors(i), flags = ns.filter(n => cells[n].mark === 1).length;
      if(flags !== c.n) { pulse(ns); return; }
      const targets = ns.filter(n => !cells[n].open && cells[n].mark !== 1);
      if(!targets.length) return;
      if(targets.some(n => cells[n].mine)) {
        const mine = targets.find(n => cells[n].mine);
        cells[mine].boom = true;
        finish(false, mine);
        return;
      }
      let changed = [];
      targets.forEach(n => { changed = changed.concat(revealFrom(n)); });
      if(changed.length){
        details.chordSuccesses = (details.chordSuccesses || 0) + 1;
        if(ns.some(n => cells[n].mark === 1 && !cells[n].mine)) details.riskyChordSuccesses = (details.riskyChordSuccesses || 0) + 1;
        env.speak('minesweeper','chord');
        maybeProgressLines(changed);
        checkWin();
        if(!over){ draw(); save(); }
      }
    }
    function pulse(list) {
      list.forEach(n => { if(!cells[n].open) cells[n].pulse = true; });
      draw();
      setTimeout(() => { cells.forEach(c => c.pulse = false); draw(); }, 180);
    }
    function draw() {
      const board = env.qs('#wb-mines-board', box);
      board.style.setProperty('--wb-mines-size', String(W));
      env.qs('#wb-mines-left', box).textContent = '剩余雷：' + remainingMines();
      env.qs('#wb-mines-opened', box).textContent = '已开：' + openedSafe() + '/' + SAFE;
      env.qs('#wb-mines-mode', box).textContent = mode === 'flag' ? '模式：插旗' : '模式：翻开';
      const openBtn = env.qs('#wb-mines-open-mode', box), flagBtn = env.qs('#wb-mines-flag-mode', box);
      openBtn.classList.toggle('primary', mode === 'open');
      flagBtn.classList.toggle('primary', mode === 'flag');
      board.innerHTML = cells.map((c, i) => {
        const shown = c.open, cls = ['wb-mines-cell', shown ? 'open' : 'closed', c.mine && shown ? 'mine' : '', c.boom ? 'boom' : '', c.pulse ? 'pulse' : '', c.n && shown && !c.mine ? ('n' + c.n) : ''].filter(Boolean).join(' ');
        const text = shown ? (c.mine ? '✹' : (c.n ? String(c.n) : '')) : (c.mark === 1 ? '⚑' : (c.mark === 2 ? '?' : ''));
        return '<button type="button" class="' + cls + '" data-i="' + i + '" aria-label="扫雷格">' + (shown&&c.mine?gameSpriteHTML('candy-bubbles',14,'地雷'):text) + '</button>';
      }).join('');
      env.qsa('.wb-mines-cell', board).forEach(btn => btn.onclick = () => {
        const i = +btn.dataset.i;
        if (mode === 'flag' && cells[i] && cells[i].open) chord(i);
        else if (mode === 'flag') cycleMark(i);
        else openCell(i);
      });
      env.qsa('.wb-mines-cell', board).forEach(btn => btn.oncontextmenu = e => {
        e.preventDefault();
        const i = +btn.dataset.i;
        if(cells[i] && cells[i].open) chord(i);
        else cycleMark(i);
      });
    }
    env.qs('#wb-mines-open-mode', box).onclick = () => { mode = 'open'; draw(); save(); };
    env.qs('#wb-mines-flag-mode', box).onclick = () => { mode = 'flag'; draw(); save(); };
  }
  startMinesweeper(state);
  return env.activeGameController || null;
}
