import { gameSpriteHTML } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'popstar';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["appendModalMask","choiceForState","choiceSavePatch","clearProgress","esc","gamePaused","getHostDocument","getHostWindow","isMobileHost","modalMaskClass","qs","qsa","saveProgress","scoreWithChoice","setScore","showGameOver","shuffleArray","speak","toast"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startPopStar(state) {
    const box = env.qs('#wb-gamebox');
    const choice = env.choiceForState('popstar', state);
    const limitedMoves = choice.limitedMoves !== false;
    const N = 10;
    const COLORS = [
      { id:'red', hex:'#ff5d73' },
      { id:'blue', hex:'#4f8df7' },
      { id:'green', hex:'#39c66f' },
      { id:'yellow', hex:'#ffc94d' },
      { id:'purple', hex:'#a66bff' }
    ];
    box.innerHTML = '<div class="wb-popstar-panel">'
      + '<div class="wb-popstar-top"><div class="wb-popstar-stat" id="wb-popstar-level"></div><div class="wb-popstar-stat" id="wb-popstar-score"></div><div class="wb-popstar-stat" id="wb-popstar-target"></div><div class="wb-popstar-stat" id="wb-popstar-moves"></div><div class="wb-popstar-stat" id="wb-popstar-left"></div></div>'
      + '<div class="wb-popstar-stage" id="wb-popstar-stage"><div class="wb-popstar-board" id="wb-popstar-board"></div></div>'
      + '<div class="wb-actions wb-popstar-actions"><button type="button" class="wb-btn" id="wb-popstar-shuffle">打乱 <span class="wb-popstar-badge" id="wb-popstar-shuffle-left">3</span></button><button type="button" class="wb-btn" id="wb-popstar-single">单消 <span class="wb-popstar-badge" id="wb-popstar-single-left">3</span></button></div>'
      + '</div>';
    const panel = env.qs('.wb-popstar-panel', box), stage = env.qs('#wb-popstar-stage', box), boardEl = env.qs('#wb-popstar-board', box);
    const levelEl = env.qs('#wb-popstar-level', box), scoreEl = env.qs('#wb-popstar-score', box), targetEl = env.qs('#wb-popstar-target', box), movesEl = env.qs('#wb-popstar-moves', box), leftEl = env.qs('#wb-popstar-left', box);
    const shuffleBtn = env.qs('#wb-popstar-shuffle', box), singleBtn = env.qs('#wb-popstar-single', box);
    const shuffleLeftEl = env.qs('#wb-popstar-shuffle-left', box), singleLeftEl = env.qs('#wb-popstar-single-left', box);
    const lowFx = env.isMobileHost() || ((env.getHostWindow().innerWidth || 800) <= 768);
    const fitPopStarStage = () => {
      const panelRect = panel.getBoundingClientRect();
      const topH = env.qs('.wb-popstar-top', panel)?.getBoundingClientRect().height || 0;
      const actionsH = env.qs('.wb-popstar-actions', panel)?.getBoundingClientRect().height || 0;
      const availableW = Math.max(0, panelRect.width);
      const availableH = Math.max(0, panelRect.height - topH - actionsH - 18);
      const size = Math.floor(Math.max(120, Math.min(560, availableW, availableH || availableW)));
      stage.style.setProperty('--wb-popstar-size', size + 'px');
    };
    fitPopStarStage();
    const ResizeObs = env.getHostWindow().ResizeObserver;
    if(ResizeObs){
      const ro = new ResizeObs(() => fitPopStarStage());
      ro.observe(panel);
      stage._wbPopStarResizeObserver = ro;
    } else {
      env.getHostWindow().addEventListener('resize', fitPopStarStage, { passive:true });
    }
    const targetScores = [1200, 3000, 5600, 8200, 11200, 14600, 18400];
    const levelTarget = lv => lv <= targetScores.length ? targetScores[lv - 1] : targetScores[targetScores.length - 1] + (lv - targetScores.length) * (3600 + Math.max(0, lv - targetScores.length - 1) * 250);
    const moveLimit = lv => Math.max(20, 25 - Math.floor(lv / 3));
    const starPath = 'M50 8 L61 35 L90 36 L67 54 L75 84 L50 67 L25 84 L33 54 L10 36 L39 35 Z';
    let nextId = Number(state?.nextId || 1);
    let level = Math.max(1, Number(state?.level || 1));
    let score = Math.max(0, Number(state?.score || 0));
    let movesLeft = limitedMoves ? (Number.isFinite(Number(state?.movesLeft)) ? Math.max(0, Number(state.movesLeft)) : moveLimit(level)) : null;
    let shuffleLeft = Math.max(0, Math.min(3, Number(state?.shuffleLeft == null ? 3 : state.shuffleLeft)));
    let singleLeft = Math.max(0, Math.min(3, Number(state?.singleLeft == null ? 3 : state.singleLeft)));
    let toolMode = state?.toolMode === 'single' ? 'single' : '';
    let busy = false, over = false;
    let seen = state?.seen || {};
    let targetMetThisLevel = !!state?.targetMetThisLevel;
    let board = hydrateBoard(state?.board);
    let reviveLeft = Math.max(0, Math.min(5, Number(state?.reviveLeft == null ? 5 : state.reviveLeft)));
    let details = Object.assign({
      level:1, score:0, removedTotal:0, highClears:{ '5':0, '6':0, '7':0, '8plus':0 },
      clutchCount:0, highStreak:0, highComboCount:0, maxHighStreak:0, remainingCounts:{}, shuffleUsed:0, singleUsed:0,
      toolUsedAtLowRemains:false, godMove:false, clutch:false, amazingClear:false, clearAllCount:0, completed:false, remainingAtEnd:0, moveLimits:{}, unusedMoveBonusTotal:0, bigBonusTotal:0, reviveUsed:0
    }, state?.details || {}, { mode: choice.id });
    ensurePlayableBoard();
    drawUI();
    renderBoard();
    save();

    function hydrateBoard(raw){
      if(Array.isArray(raw) && raw.length === N){
        const out = Array.from({ length:N }, (_, r) => Array.from({ length:N }, (_, c) => {
          const item = raw[r] && raw[r][c];
          if(!item) return null;
          const color = COLORS.some(x => x.id === item.color) ? item.color : COLORS[(r + c) % COLORS.length].id;
          const id = String(item.id || ('ps' + (nextId++)));
          return { id, color };
        }));
        if(out.some(row => row.some(Boolean))) return out;
      }
      return makeBoard();
    }
    function save(){
      if(over) return;
      env.saveProgress('popstar', Object.assign({ board, level, score, movesLeft, shuffleLeft, singleLeft, toolMode, seen, targetMetThisLevel, nextId, reviveLeft, details }, env.choiceSavePatch('popstar', choice)));
    }
    function makeCell(color){ return { id:'ps' + (nextId++), color }; }
    function makeBoard(){
      const out = Array.from({ length:N }, () => Array.from({ length:N }, () => makeCell(COLORS[Math.floor(Math.random() * COLORS.length)].id)));
      return out;
    }
    function ensurePlayableBoard(){
      let guard = 0;
      while(!hasMoves(board) && guard < 20){ board = makeBoard(); guard++; }
    }
    function colorHex(id){ return (COLORS.find(c => c.id === id) || COLORS[0]).hex; }
    function inBounds(r,c){ return r >= 0 && r < N && c >= 0 && c < N; }
    function cellAt(r,c){ return inBounds(r,c) ? board[r][c] : null; }
    function groupAt(r,c){
      const start = cellAt(r,c);
      if(!start) return [];
      const seenKey = new Set(), q = [[r,c]], out = [];
      seenKey.add(r + ',' + c);
      while(q.length){
        const cur = q.shift(), rr = cur[0], cc = cur[1], cell = cellAt(rr,cc);
        if(!cell || cell.color !== start.color) continue;
        out.push({ r:rr, c:cc, cell });
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(d => {
          const nr = rr + d[0], nc = cc + d[1], key = nr + ',' + nc;
          if(!inBounds(nr,nc) || seenKey.has(key)) return;
          const next = cellAt(nr,nc);
          if(next && next.color === start.color){ seenKey.add(key); q.push([nr,nc]); }
        });
      }
      return out;
    }
    function hasMoves(bd){
      for(let r=0;r<N;r++) for(let c=0;c<N;c++){
        const cell = bd[r][c];
        if(!cell) continue;
        if((r + 1 < N && bd[r + 1][c] && bd[r + 1][c].color === cell.color) || (c + 1 < N && bd[r][c + 1] && bd[r][c + 1].color === cell.color)) return true;
      }
      return false;
    }
    function remainingCount(){ return board.flat().filter(Boolean).length; }
    function bigClearBonus(n){ return n >= 16 ? 600 : (n >= 12 ? 300 : (n >= 8 ? 100 : 0)); }
    function scoreFor(n){ return n * n * 5 + bigClearBonus(n); }
    function remainingBonus(left){ return left === 0 ? 1000 : (left <= 5 ? 500 : (left <= 10 ? 200 : 0)); }
    function unusedMoveBonus(noMoves){ return noMoves && movesLeft > 0 ? movesLeft * 80 : 0; }
    function centerOf(items){
      const rect = stage.getBoundingClientRect();
      const avgR = items.reduce((s,x)=>s+x.r,0) / Math.max(1, items.length);
      const avgC = items.reduce((s,x)=>s+x.c,0) / Math.max(1, items.length);
      return { x:(avgC + .5) / N * rect.width, y:(avgR + .5) / N * rect.height };
    }
    function addScorePop(text, x, y){
      const el = env.getHostDocument().createElement('div');
      el.className = 'wb-popstar-score-pop';
      el.style.setProperty('--x', x + 'px');
      el.style.setProperty('--y', y + 'px');
      el.textContent = text;
      stage.appendChild(el);
      setTimeout(() => el.remove(), 850);
    }
    function addShards(items){
      const rect = stage.getBoundingClientRect();
      const maxItems = lowFx ? Math.min(items.length, 12) : items.length;
      const shardEach = lowFx ? 2 : 5;
      const frag = env.getHostDocument().createDocumentFragment();
      items.slice(0, maxItems).forEach(item => {
        const x = (item.c + .5) / N * rect.width, y = (item.r + .5) / N * rect.height;
        for(let i=0;i<shardEach;i++){
          const shard = env.getHostDocument().createElement('span');
          shard.className = 'wb-popstar-shard';
          const a = Math.random() * Math.PI * 2, dist = (lowFx ? 14 : 18) + Math.random() * (lowFx ? 20 : 32);
          shard.style.setProperty('--x', x + 'px');
          shard.style.setProperty('--y', y + 'px');
          shard.style.setProperty('--dx', Math.cos(a) * dist + 'px');
          shard.style.setProperty('--dy', Math.sin(a) * dist + 'px');
          shard.style.setProperty('--rot', (Math.random() * 260 - 130) + 'deg');
          shard.style.setProperty('--color', colorHex(item.cell.color));
          frag.appendChild(shard);
          setTimeout(() => shard.remove(), 720);
        }
      });
      stage.appendChild(frag);
    }
    function renderBoard(){
      const live = new Set();
      for(let r=0;r<N;r++) for(let c=0;c<N;c++){
        const cell = board[r][c];
        if(!cell) continue;
        live.add(cell.id);
        let el = env.qs('[data-popstar-id="' + cell.id + '"]', boardEl);
        if(!el){
          el = env.getHostDocument().createElement('button');
          el.type = 'button';
          el.dataset.popstarId = cell.id;
          el.innerHTML = '<span class="wb-popstar-block">'+gameSpriteHTML('candy-bubbles',({red:0,blue:1,green:2,yellow:3,purple:4})[cell.color],cell.color)+'</span>';
          boardEl.appendChild(el);
        }
        el.className = 'wb-popstar-cell';
        el.style.setProperty('--r', r);
        el.style.setProperty('--c', c);
        el.style.setProperty('--star-color', colorHex(cell.color));
        el.disabled = busy || env.gamePaused || over;
        el.onclick = () => clickCell(r,c);
      }
      env.qsa('.wb-popstar-cell', boardEl).forEach(el => {
        if(!live.has(el.dataset.popstarId) && !el.classList.contains('removing')) el.remove();
      });
    }
    function drawUI(){
      fitPopStarStage();
      const target = levelTarget(level), left = remainingCount();
      levelEl.textContent = '第 ' + level + ' 关';
      scoreEl.textContent = '分数 ' + score;
      targetEl.textContent = '目标 ' + target;
      const needPerMove = limitedMoves ? (score >= target ? 0 : Math.ceil((target - score) / Math.max(1, movesLeft))) : 0;
      movesEl.textContent = limitedMoves ? (score >= target ? ('步数 ' + movesLeft + '｜已达') : ('步数 ' + movesLeft + '｜需' + needPerMove + '/步')) : '步数 无限制';
      leftEl.textContent = '剩余 ' + left;
      targetEl.classList.toggle('target-met', score >= target);
      const toolbarScore = env.qs('#wb-score');
      if(toolbarScore) toolbarScore.classList.toggle('target-met', score >= target);
      shuffleLeftEl.textContent = shuffleLeft;
      singleLeftEl.textContent = singleLeft;
      if(shuffleBtn){ shuffleBtn.disabled = busy || over || shuffleLeft <= 0 || left <= 1 || (limitedMoves && movesLeft <= 0); shuffleBtn.classList.toggle('primary', toolMode === 'shuffle'); }
      if(singleBtn){ singleBtn.disabled = busy || over || singleLeft <= 0 || left <= 0 || (limitedMoves && movesLeft <= 0); singleBtn.classList.toggle('primary', toolMode === 'single'); }
      env.setScore('popstar', score);
    }
    function markTargetMet(){
      if(targetMetThisLevel || score < levelTarget(level)) return;
      targetMetThisLevel = true;
      env.speak('popstar','target_met');
      env.toast('分数达标！收尾后进入下一关');
    }
    function applyGravityAndCompact(){
      for(let c=0;c<N;c++){
        const cells = [];
        for(let r=N-1;r>=0;r--) if(board[r][c]) cells.push(board[r][c]);
        for(let r=N-1, i=0;r>=0;r--, i++) board[r][c] = cells[i] || null;
      }
      const cols = [];
      for(let c=0;c<N;c++) if(board.some(row => row[c])) cols.push(c);
      const next = Array.from({ length:N }, () => Array(N).fill(null));
      cols.forEach((oldC, newC) => { for(let r=0;r<N;r++) next[r][newC] = board[r][oldC]; });
      board = next;
    }
    function updateStatsForClear(n){
      details.removedTotal = (details.removedTotal || 0) + n;
      if(n >= 5 && n <= 7) details.highClears[String(n)] = (details.highClears[String(n)] || 0) + 1;
      else if(n >= 8) details.highClears['8plus'] = (details.highClears['8plus'] || 0) + 1;
      if(n >= 4){
        if((details.highStreak || 0) > 0) details.highComboCount = (details.highComboCount || 0) + 1;
        details.highStreak = (details.highStreak || 0) + 1;
        details.maxHighStreak = Math.max(details.maxHighStreak || 0, details.highStreak);
      } else {
        details.highStreak = 0;
      }
    }
    function removeCells(items, points){
      items.forEach(item => {
        const el = env.qs('[data-popstar-id="' + item.cell.id + '"]', boardEl);
        if(el) el.classList.add('removing');
        board[item.r][item.c] = null;
      });
      addShards(items);
      if(points){
        const p = centerOf(items);
        addScorePop('+' + points, p.x, p.y);
      }
    }
    function afterBoardChanged(crossedOnThisMove){
      applyGravityAndCompact();
      const noMoves = !hasMoves(board);
      if(crossedOnThisMove && noMoves) details.clutch = true;
      renderBoard();
      drawUI();
      if(noMoves || (limitedMoves && movesLeft <= 0)) setTimeout(() => finishLevel(noMoves ? 'nomoves' : 'steps'), 520);
      else save();
    }
    function clickCell(r,c){
      if(env.gamePaused || busy || over) return;
      if(limitedMoves && movesLeft <= 0) { finishLevel('steps'); return; }
      const cell = cellAt(r,c);
      if(!cell) return;
      if(toolMode === 'single'){
        busy = true;
        if(limitedMoves) movesLeft = Math.max(0, movesLeft - 1);
        singleLeft--;
        details.singleUsed = (details.singleUsed || 0) + 1;
        if(remainingCount() <= 20) details.toolUsedAtLowRemains = true;
        env.speak('popstar','cheat');
        removeCells([{ r,c,cell }], 0);
        toolMode = '';
        setTimeout(() => { busy = false; afterBoardChanged(false); }, 220);
        drawUI();
        save();
        return;
      }
      const group = groupAt(r,c);
      if(group.length < 2){
        const el = env.qs('[data-popstar-id="' + cell.id + '"]', boardEl);
        if(el){ el.classList.add('hint'); setTimeout(() => el.classList.remove('hint'), 650); }
        return;
      }
      busy = true;
      const beforeScore = score;
      const points = scoreFor(group.length);
      const bigBonus = bigClearBonus(group.length);
      score += points;
      if(limitedMoves) movesLeft = Math.max(0, movesLeft - 1);
      if(bigBonus) details.bigBonusTotal = (details.bigBonusTotal || 0) + bigBonus;
      updateStatsForClear(group.length);
      if(!seen['first_' + level]){ seen['first_' + level] = 1; env.speak('popstar','first_clear'); }
      if(group.length === 2) env.speak('popstar','small_clear');
      else if(group.length >= 4) env.speak('popstar','high_clear');
      removeCells(group, points);
      markTargetMet();
      const crossedOnThisMove = beforeScore < levelTarget(level) && score >= levelTarget(level);
      setTimeout(() => {
        busy = false;
        afterBoardChanged(crossedOnThisMove);
      }, 260);
      drawUI();
      save();
    }
    function shuffleBoard(){
      if(env.gamePaused || busy || over || shuffleLeft <= 0) return;
      if(limitedMoves && movesLeft <= 0) { finishLevel('steps'); return; }
      const slots = [];
      for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(board[r][c]) slots.push({ r,c });
      if(slots.length <= 1) return;
      busy = true;
      if(limitedMoves) movesLeft = Math.max(0, movesLeft - 1);
      shuffleLeft--;
      details.shuffleUsed = (details.shuffleUsed || 0) + 1;
      if(remainingCount() <= 20) details.toolUsedAtLowRemains = true;
      env.speak('popstar','cheat');
      for(let attempt=0; attempt<18; attempt++){
        const shuffled = slots.map(pos => board[pos.r][pos.c]).sort(() => Math.random() - .5);
        const next = board.map(row => row.slice());
        slots.forEach((pos, i) => { next[pos.r][pos.c] = shuffled[i]; });
        if(hasMoves(next) || attempt === 17){ board = next; break; }
      }
      renderBoard();
      drawUI();
      setTimeout(() => {
        busy = false;
        renderBoard();
        if(!hasMoves(board) || (limitedMoves && movesLeft <= 0)) finishLevel(!hasMoves(board) ? 'nomoves' : 'steps');
        else { drawUI(); save(); }
      }, 280);
    }
    function showPopStarRevive(onRevive, onSettle){
      if(reviveLeft <= 0){ onSettle(); return; }
      busy = true;
      const doc = env.getHostDocument();
      const old = env.qs('#wb-revive-mask', doc); if(old) old.remove();
      const mask = doc.createElement('div');
      mask.className = env.modalMaskClass();
      mask.id = 'wb-revive-mask';
      mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">看广告免费复活</div><div style="margin-bottom:10px;line-height:1.8;">骗你的，不看广告也能复活</div><div class="wb-api-status" style="margin-bottom:12px;">剩余复活次数：' + env.esc(reviveLeft) + '</div><div class="wb-actions"><button class="wb-btn primary" id="wb-revive-ok">确认复活</button><button class="wb-btn" id="wb-revive-giveup">认输结算</button></div></div>';
      env.appendModalMask(mask);
      env.qs('#wb-revive-ok', mask).onclick = () => { mask.remove(); reviveLeft = Math.max(0, reviveLeft - 1); details.reviveUsed = (details.reviveUsed || 0) + 1; onRevive(); };
      env.qs('#wb-revive-giveup', mask).onclick = () => { mask.remove(); onSettle(); };
    }
    async function finishLevel(reason){
      if(over || busy) return;
      busy = true;
      const left = remainingCount(), noMoves = !hasMoves(board), bonus = remainingBonus(left), moveBonus = unusedMoveBonus(noMoves), target = levelTarget(level), pass = score + bonus + moveBonus >= target;
      if(!pass && reviveLeft > 0){
        showPopStarRevive(() => {
          if(limitedMoves) movesLeft = Math.max(movesLeft, 5);
          if(!hasMoves(board) && remainingCount() > 1){
            const slots = [];
            for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(board[r][c]) slots.push({ r,c });
            for(let attempt=0; attempt<30 && !hasMoves(board); attempt++){
              const shuffled = env.shuffleArray(slots.map(pos => board[pos.r][pos.c]));
              slots.forEach((pos, i) => { board[pos.r][pos.c] = shuffled[i]; });
            }
            if(!hasMoves(board)) ensurePlayableBoard();
          }
          busy = false;
          over = false;
          showSettle('复活成功', limitedMoves ? '已补充5步，继续挑战' : '棋盘已整理，继续挑战');
          setTimeout(clearSettle, 900);
          renderBoard();
          drawUI();
          save();
        }, () => { reviveLeft = 0; busy = false; finishLevel(reason); });
        return;
      }
      details.remainingCounts[left] = (details.remainingCounts[left] || 0) + 1;
      details.remainingAtEnd = left;
      if(left === 0){ details.amazingClear = true; details.clearAllCount = (details.clearAllCount || 0) + 1; }
      details.moveLimits[level] = moveLimit(level);
      details.unusedMoveBonusTotal = (details.unusedMoveBonusTotal || 0) + (limitedMoves ? moveBonus : 0);
      showSettle(reason === 'steps' ? '步数用完' : '本关结算', '剩余 ' + left + ' 个，奖励 +' + bonus + (moveBonus ? '，余步 +' + moveBonus : ''));
      const cells = [];
      for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(board[r][c]) cells.push({ r,c,cell:board[r][c] });
      for(let i=0;i<cells.length;i++){
        const item = cells[i];
        if(board[item.r] && board[item.r][item.c]){
          removeCells([item], 0);
          board[item.r][item.c] = null;
        }
        if(i % 3 === 0) await delay(42);
      }
      if(bonus || moveBonus){
        score += bonus + moveBonus;
        addScorePop('+' + (bonus + moveBonus), stage.clientWidth / 2, stage.clientHeight / 2);
      }
      const finalScore = env.scoreWithChoice('popstar', score, choice);
      details.score = finalScore;
      details.level = level;
      details.completed = pass;
      if(pass && details.toolUsedAtLowRemains) details.godMove = true;
      if(pass && details.clutch) details.clutchCount = (details.clutchCount || 0) + 1;
      drawUI();
      await delay(650);
      clearSettle();
      if(pass){
        env.speak('popstar','level_clear');
        level++;
        movesLeft = limitedMoves ? moveLimit(level) : null;
        targetMetThisLevel = false;
        board = makeBoard();
        ensurePlayableBoard();
        busy = false;
        renderBoard();
        drawUI();
        save();
        return;
      }
      over = true;
      env.clearProgress('popstar');
      env.setScore('popstar', finalScore);
      details.score = finalScore;
      details.level = level;
      details.completed = false;
      env.speak('popstar','gameover');
      env.showGameOver('popstar','游戏结束','本局分数：' + finalScore + '分，第' + level + '关，目标' + target + '，剩余' + left + '个' + (limitedMoves ? ('，步数' + movesLeft + '步') : '，无限步数'), null, { completed:false, level, score:finalScore, mode:choice.id, maxHighStreak:details.maxHighStreak || 0, clutch:!!details.clutch, godMove:!!details.godMove, details:Object.assign({}, details, { score:finalScore, mode:choice.id }) });
    }
    function showSettle(title, text){
      clearSettle();
      const el = env.getHostDocument().createElement('div');
      el.className = 'wb-popstar-settle';
      el.id = 'wb-popstar-settle';
      el.innerHTML = '<div class="wb-popstar-settle-card"><div style="font-size:20px;">' + env.esc(title) + '</div><div style="margin-top:6px;">' + env.esc(text) + '</div></div>';
      stage.appendChild(el);
    }
    function clearSettle(){ const old = env.qs('#wb-popstar-settle', stage); if(old) old.remove(); }
    function delay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
    env.qs('#wb-popstar-shuffle', box).onclick = shuffleBoard;
    env.qs('#wb-popstar-single', box).onclick = () => {
        if(env.gamePaused || busy || over || singleLeft <= 0 || (limitedMoves && movesLeft <= 0)) return;
      toolMode = toolMode === 'single' ? '' : 'single';
      drawUI();
      env.toast(toolMode === 'single' ? '选择一个星星单独消除' : '已取消单消');
      save();
    };
  }
  startPopStar(state);
  return env.activeGameController || null;
}
