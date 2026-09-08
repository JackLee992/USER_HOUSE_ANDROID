// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'shuerte';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["choiceForState","choiceSavePatch","clearProgress","currentGame","gamePaused","getHostDocument","qs","qsa","saveProgress","scoreWithChoice","setScore","showGameOver","shuerteFinalScore","shuerteTimer","shuffleArray","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startShuerte(state) {
    const box = env.qs('#wb-gamebox');
    const choice = env.choiceForState('shuerte', state);
    const N = choice.size || 4, TOTAL = N * N, BASE = choice.base || 20, NO_FADE = !!choice.noFade;
    const makeNums = () => env.shuffleArray(Array.from({ length:TOTAL }, (_, i) => i + 1));
    let nums = Array.isArray(state?.nums) && state.nums.length === TOTAL ? state.nums.map(Number) : makeNums();
    let next = Math.max(1, Math.min(TOTAL + 1, Number(state?.next || 1)));
    let score = Math.max(0, Number(state?.score || 0));
    let combo = Math.max(0, Number(state?.combo || 0));
    let maxCombo = Math.max(combo, Number(state?.maxCombo || 0));
    let started = !!state?.started;
    let over = false;
    let startAt = started ? Date.now() : 0;
    let elapsedBefore = Math.max(0, Number(state?.elapsedBefore || 0));
    let lastCorrectAt = Date.now();
    let feedback = state?.feedback || {};
    let tools = Object.assign({ hint:3, focus:2, shuffle:1 }, state?.tools || {});
    let details = Object.assign({ correct:Math.max(0, next - 1), wrong:0, hintUsed:0, focusUsed:0, shuffleUsed:0, reactionTotalMs:0, lateWrongStreak:0 }, state?.details || {});
    let focusUntil = 0, lastProgressSaveAt = 0;
    box.innerHTML = '<div class="wb-shuerte-panel"><div class="wb-shuerte-top"><span class="wb-pill" id="wb-shuerte-target"></span><span class="wb-pill" id="wb-shuerte-time"></span><span class="wb-pill" id="wb-shuerte-combo"></span><span class="wb-pill">' + (NO_FADE ? '盲点：开' : '盲点：关') + '</span></div><div class="wb-shuerte-board" id="wb-shuerte-board"></div><div class="wb-actions wb-shuerte-tools"><button type="button" class="wb-btn" id="wb-shuerte-hint">提示 <span id="wb-shuerte-hint-left">3</span></button><button type="button" class="wb-btn" id="wb-shuerte-focus">聚焦 <span id="wb-shuerte-focus-left">2</span></button><button type="button" class="wb-btn" id="wb-shuerte-shuffle">重排 <span id="wb-shuerte-shuffle-left">1</span></button></div><div class="wb-shuerte-note">按 1 → ' + TOTAL + ' 依次点击；' + (NO_FADE ? '盲点模式点对后不变色，分数略有加成。' : '点对后会变淡，错点会扣分。') + '</div></div>';
    tick();
    draw();
    save();
    if (env.shuerteTimer) clearInterval(env.shuerteTimer);
    env.shuerteTimer = setInterval(tick, 50);

    function elapsedMs() { return elapsedBefore + (started && startAt ? Date.now() - startAt : 0); }
    function shuerteTimeText(ms) { return ((Math.max(0, Number(ms) || 0)) / 1000).toFixed(2) + '秒'; }
    function save() {
      if (!over) env.saveProgress('shuerte', Object.assign({ nums, next, score, combo, maxCombo, started, startAt, elapsedBefore:elapsedMs(), lastCorrectAt, feedback, tools, details }, env.choiceSavePatch('shuerte', choice)));
    }
    function tick() {
      const el = env.qs('#wb-shuerte-time', box);
      if (el) el.textContent = '用时：' + shuerteTimeText(elapsedMs());
      const now = Date.now();
      if (started && !over && env.currentGame === 'shuerte' && !env.gamePaused && now - lastProgressSaveAt >= 500) { lastProgressSaveAt = now; save(); }
    }
    function targetIndex() { return nums.findIndex(v => v === next); }
    function useTool(name) {
      if (env.gamePaused || over || next > TOTAL || (tools[name] || 0) <= 0) return false;
      tools[name]--;
      details[name + 'Used'] = (details[name + 'Used'] || 0) + 1;
      score = Math.max(0, score - 30);
      env.setScore('shuerte', score);
      return true;
    }
    function drawFloat(btn, text, good) {
      const tag = env.getHostDocument().createElement('span');
      tag.className = 'wb-shuerte-float ' + (good ? 'good' : 'bad');
      tag.textContent = text;
      btn.appendChild(tag);
      setTimeout(() => tag.remove(), 520);
    }
    function draw() {
      const board = env.qs('#wb-shuerte-board', box);
      board.style.setProperty('--wb-shuerte-size', String(N));
      env.qs('#wb-shuerte-target', box).textContent = next <= TOTAL ? '目标：' + next : '完成';
      env.qs('#wb-shuerte-combo', box).textContent = '连击：×' + combo + ' / 最高×' + maxCombo;
      ['hint','focus','shuffle'].forEach(k => {
        const left = env.qs('#wb-shuerte-' + k + '-left', box), btn = env.qs('#wb-shuerte-' + k, box);
        if (left) left.textContent = String(tools[k] || 0);
        if (btn) btn.disabled = over || next > TOTAL || (tools[k] || 0) <= 0;
      });
      const tIdx = targetIndex();
      const focusOn = focusUntil > Date.now();
      board.innerHTML = nums.map((v, i) => {
        const done = !NO_FADE && v < next, hit = feedback[i] || '', r = Math.floor(i / N), c = i % N;
        const tr = Math.floor(tIdx / N), tc = tIdx % N;
        const focus = focusOn && tIdx >= 0 && (r === tr || c === tc);
        const cls = ['wb-shuerte-cell', done ? 'done' : '', hit, focus ? 'focus' : '', focusOn && !focus && !done ? 'dim' : ''].filter(Boolean).join(' ');
        return '<button type="button" class="' + cls + '" data-i="' + i + '" aria-label="舒尔特数字' + v + '">' + v + '</button>';
      }).join('');
      env.qsa('.wb-shuerte-cell', board).forEach(btn => btn.onclick = () => clickCell(+btn.dataset.i, btn));
    }
    function clickCell(i, btn) {
      if (env.gamePaused || over || next > TOTAL) return;
      if (!started) { started = true; startAt = Date.now(); lastCorrectAt = Date.now(); env.speak('shuerte','start'); }
      const v = nums[i];
      if (v === next) {
        const now = Date.now();
        details.reactionTotalMs += Math.max(0, now - lastCorrectAt);
        lastCorrectAt = now;
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        details.correct = next;
        const add = BASE + Math.floor(combo / 5) * (N * 4);
        score += add;
        if (!NO_FADE) feedback[i] = 'good';
        drawFloat(btn, '+' + add, true);
        if (next === 1) env.speak('shuerte','first');
        if (combo > 0 && combo % 5 === 0) env.speak('shuerte','combo');
        if (next >= Math.ceil(TOTAL / 2) && !details.halfSpoken) { details.halfSpoken = 1; env.speak('shuerte','half'); }
        if (TOTAL - next <= 4 && !details.lastSpoken) { details.lastSpoken = 1; env.speak('shuerte','last'); }
        next++;
        env.setScore('shuerte', score);
        if (!NO_FADE) setTimeout(() => { delete feedback[i]; draw(); }, 180);
        if (next > TOTAL) finish();
        else { draw(); save(); }
      } else {
        const penalty = N === 4 ? 15 : N === 5 ? 25 : 40;
        score = Math.max(0, score - penalty);
        combo = 0;
        details.wrong = (details.wrong || 0) + 1;
        if (TOTAL - next <= 3) details.lateWrongStreak = (details.lateWrongStreak || 0) + 1;
        feedback[i] = 'bad';
        drawFloat(btn, '-' + penalty, false);
        env.speak('shuerte','wrong');
        env.setScore('shuerte', score);
        draw();
        setTimeout(() => { delete feedback[i]; draw(); }, 220);
        save();
      }
    }
    function finish() {
      if (over) return;
      over = true;
      if (env.shuerteTimer) { clearInterval(env.shuerteTimer); env.shuerteTimer = null; }
      const duration = elapsedMs();
      const toolsUsed = (details.hintUsed || 0) + (details.focusUsed || 0) + (details.shuffleUsed || 0);
      const finalScore = env.scoreWithChoice('shuerte', env.shuerteFinalScore(duration, N, BASE, TOTAL, details.wrong || 0, maxCombo, toolsUsed), choice);
      details.score = finalScore;
      details.size = N;
      details.noFade = NO_FADE;
      details.durationMs = duration;
      details.maxCombo = maxCombo;
      details.avgReactionMs = Math.round((details.reactionTotalMs || duration) / TOTAL);
      details.perfectFast = !(details.wrong || 0) && details.avgReactionMs < 1200;
      details.focusRun = N >= 5 && !(details.wrong || 0) && maxCombo >= TOTAL && details.avgReactionMs < 1800 && !details.perfectFast;
      details.regret = (details.lateWrongStreak || 0) >= 2;
      env.setScore('shuerte', finalScore);
      env.clearProgress('shuerte');
      env.speak('shuerte','gameover');
      draw();
      env.showGameOver('shuerte', '挑战完成', '本局分数：' + finalScore + '分（' + N + '×' + N + (NO_FADE ? '·盲点' : '') + '），用时' + shuerteTimeText(duration) + '，错误' + (details.wrong || 0) + '次，最高连击×' + maxCombo, { outcome:'score', score:finalScore }, { score:finalScore, size:N, maxCombo, wrong:details.wrong || 0, noFade:NO_FADE, durationMs:duration, perfectFast:details.perfectFast, focusRun:details.focusRun, regret:details.regret, details:Object.assign({}, details) });
    }
    env.qs('#wb-shuerte-hint', box).onclick = () => {
      if (!useTool('hint')) return;
      const i = targetIndex();
      if (i >= 0) { feedback[i] = 'hint'; env.speak('shuerte','hint'); draw(); setTimeout(() => { delete feedback[i]; draw(); }, 900); save(); }
    };
    env.qs('#wb-shuerte-focus', box).onclick = () => {
      if (!useTool('focus')) return;
      focusUntil = Date.now() + 1500;
      env.speak('shuerte','focus');
      draw();
      setTimeout(draw, 1550);
      save();
    };
    env.qs('#wb-shuerte-shuffle', box).onclick = () => {
      if (!useTool('shuffle')) return;
      const remaining = env.shuffleArray(nums.filter(v => v >= next));
      let k = 0;
      nums = nums.map(v => v < next ? v : remaining[k++]);
      feedback = {};
      env.speak('shuerte','shuffle');
      draw();
      save();
    };
  }
  startShuerte(state);
  return env.activeGameController || null;
}
