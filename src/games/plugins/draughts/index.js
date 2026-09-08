// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'draughts';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","cheatButtonHTML","choiceForState","choiceSavePatch","clearProgress","cloneCheatState","displayCharName","gamePaused","markFirstMoverUserAction","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startDraughts(state) {
    const box = env.qs('#wb-gamebox');
    const role = env.displayCharName();
    const choice = env.choiceForState('draughts', state);
    const masterMode = choice.id === 'master';
    const ROWS = [1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1];
    const points = [];
    ROWS.forEach((len, row) => {
      for (let c=0;c<len;c++) points.push({ i:points.length, row, y:row-8, x2:2*c-(len-1) });
    });
    const byKey = new Map(points.map(p => [p.x2 + ',' + p.y, p.i]));
    const topHome = new Set(points.filter(p => p.row <= 3).map(p => p.i));
    const bottomHome = new Set(points.filter(p => p.row >= 13).map(p => p.i));
    const neighbors = points.map(() => []);
    points.forEach(a => points.forEach(b => {
      if (a.i >= b.i) return;
      const dy = b.y - a.y, dx = b.x2 - a.x2;
      if ((dy === 0 && Math.abs(dx) === 2) || (Math.abs(dy) === 1 && Math.abs(dx) === 1)) {
        neighbors[a.i].push(b.i);
        neighbors[b.i].push(a.i);
      }
    }));
    const initialRed = points.filter(p => p.row >= 13).map(p => p.i);
    const initialBlue = points.filter(p => p.row <= 3).map(p => p.i);
    let red = Array.isArray(state?.red) && state.red.length === 10 ? state.red.slice() : initialRed.slice();
    let blue = Array.isArray(state?.blue) && state.blue.length === 10 ? state.blue.slice() : initialBlue.slice();
    let turn = state?.turn || (state?.firstMover === 'ta' ? 'blue' : 'red'), selected = -1, moveMap = new Map(), over = false, busy = false, moving = null;
    let masterActive = !!state?.masterActive, masterPath = Array.isArray(state?.masterPath) ? state.masterPath.slice() : [];
    let masterUndoOpen = !!masterActive;
	    let details = Object.assign({ rounds:0, userMaxJump:0, charMaxJump:0, userHomeCount:0, charHomeCount:0, shock:false, cheatUsed:0 }, state?.details || {});
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
	    let aiRecentMoves = Array.isArray(state?.aiRecentMoves) ? state.aiRecentMoves.slice(-8) : [];
	    let aiTargetBlockPressure = 0;
    box.innerHTML = '<div class="wb-draughts-panel"><div class="wb-draughts-info"><span class="wb-pill" id="wb-draughts-turn"></span><span class="wb-pill" id="wb-draughts-score"></span>' + (masterMode ? '<button type="button" class="wb-btn primary" id="wb-draughts-end">结束</button>' : '') + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-draughts-board" id="wb-draughts-board"></div></div>';
    env.setScore('draughts', 0);
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    const endBtn = env.qs('#wb-draughts-end', box);
    if(endBtn) endBtn.onclick = finishMasterTurn;
    if (!state?.turn && state?.firstMover) env.speakFirstMover('draughts', state.firstMover);
    if (masterMode && selected >= 0) moveMap = immediateMoveMap(red[selected], masterActive);
    draw(); save();
    if (turn === 'blue') setTimeout(ai, 650);

    function sideArr(side){ return side === 'red' ? red : blue; }
    function otherArr(side){ return side === 'red' ? blue : red; }
    function occMap(){ const m = new Map(); red.forEach((p,i)=>m.set(p,{side:'red', idx:i})); blue.forEach((p,i)=>m.set(p,{side:'blue', idx:i})); return m; }
    function isTarget(side, pos){ return side === 'red' ? topHome.has(pos) : bottomHome.has(pos); }
    function isOwnHome(side, pos){ return side === 'red' ? bottomHome.has(pos) : topHome.has(pos); }
    function homeCount(side){ return sideArr(side).filter(p => isTarget(side, p)).length; }
    function distanceMap(targets){
      const dist = new Map(), q = Array.from(targets);
      q.forEach(p => dist.set(p, 0));
      for(let head=0; head<q.length; head++){
        const cur = q[head], d = dist.get(cur) || 0;
        neighbors[cur].forEach(n => {
          if(dist.has(n)) return;
          dist.set(n, d + 1);
          q.push(n);
        });
      }
      return dist;
    }
    const targetDist = { red:distanceMap(topHome), blue:distanceMap(bottomHome) };
    function distToTarget(side, pos){ return targetDist[side].get(pos) ?? 99; }
    function pieceAt(pos){ return occMap().get(pos) || null; }
    function landingFrom(a, b){
      const pa = points[a], pb = points[b];
      return byKey.get((pa.x2 + (pb.x2 - pa.x2) * 2) + ',' + (pa.y + (pb.y - pa.y) * 2));
    }
    function clearLine(a, b, occ, allowOccupiedEnd){
      const pa = points[a], pb = points[b], dx = pb.x2 - pa.x2, dy = pb.y - pa.y;
      const steps = Math.max(Math.abs(dy), Math.abs(dx) / 2);
      if (!steps || !Number.isInteger(steps)) return false;
      const sx = dx / steps, sy = dy / steps;
      if (!((sy === 0 && Math.abs(sx) === 2) || (Math.abs(sy) === 1 && Math.abs(sx) === 1))) return false;
      for (let k=1;k<steps;k++) {
        const p = byKey.get((pa.x2 + sx * k) + ',' + (pa.y + sy * k));
        if (p == null || occ.has(p)) return false;
      }
      return allowOccupiedEnd ? occ.has(b) : !occ.has(b);
    }
    function jumpLandings(cur, occ){
      const pc = points[cur], out = [];
      points.forEach(mid => {
        if (mid.i === cur || !occ.has(mid.i)) return;
        if (!clearLine(cur, mid.i, occ, true)) return;
        const landKey = (pc.x2 + (mid.x2 - pc.x2) * 2) + ',' + (pc.y + (mid.y - pc.y) * 2);
        const land = byKey.get(landKey);
        if (land == null || occ.has(land)) return;
        if (!clearLine(mid.i, land, occ, false)) return;
        out.push(land);
      });
      return out;
    }
    function legalPaths(from){
      const occ = occMap(), out = new Map();
      neighbors[from].forEach(n => { if (!occ.has(n)) out.set(n, [from, n]); });
      const dfs = (cur, path, visited) => {
        jumpLandings(cur, occ).forEach(land => {
          if (visited.has(land)) return;
          const next = path.concat(land);
          if (!out.has(land) || next.length > out.get(land).length) out.set(land, next);
          visited.add(land);
          dfs(land, next, visited);
          visited.delete(land);
        });
      };
      dfs(from, [from], new Set([from]));
      return out;
    }
    function immediateMoveMap(from, onlyJumps){
      const occ = occMap(), out = new Map();
      if(!onlyJumps) neighbors[from].forEach(n => { if(!occ.has(n)) out.set(n, [from, n]); });
      jumpLandings(from, occ).forEach(land => out.set(land, [from, land]));
      return out;
    }
    function allMoves(side){
      const arr = sideArr(side);
      return arr.flatMap((pos, idx) => Array.from(legalPaths(pos).values()).map(path => ({ idx, from:pos, to:path[path.length-1], path })));
    }
    function snapshot(){ return { red:red.slice(), blue:blue.slice(), turn, selected, masterActive, masterPath:masterPath.slice(), details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){
	      if(env.gamePaused||over||busy||cheatLeft<=0||!undoStack.length) return;
	      if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; }
	      cheatAttempted = true;
	      if(env.cheatAttemptResult('draughts', box, false) !== 'success'){ draw(); save(); return; }
	      const snap=undoStack.pop();
	      env.restoreCheatSnapshot(snap, s=>{ red=s.red; blue=s.blue; turn=s.turn; selected=s.selected; masterActive=!!s.masterActive; masterPath=Array.isArray(s.masterPath)?s.masterPath:[]; details=s.details; });
	      moving=null; moveMap=selected >= 0 && masterMode ? immediateMoveMap(red[selected], masterActive) : new Map(); busy=false; cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save();
	      if(turn === 'blue') setTimeout(ai, 650);
	    }
	    function save(){ if(!over) env.saveProgress('draughts', Object.assign({ red, blue, turn, selected, masterActive, masterPath, details, cheatLeft, cheatAttempted, undoStack, aiRecentMoves }, env.choiceSavePatch('draughts', choice))); }
    function selectRed(idx){
      if(env.gamePaused||over||busy||turn!=='red') return;
      if(masterActive){
        if(idx === selected) return;
        resetMasterAttempt(idx);
        return;
      }
      if(selected === idx){ selected=-1; moveMap=new Map(); draw(); return; }
      selected = idx;
      moveMap = masterMode ? immediateMoveMap(red[idx], false) : legalPaths(red[idx]);
      draw();
    }
    function resetMasterAttempt(nextIdx){
      if(!masterMode || !masterActive || selected < 0 || !masterPath.length) return;
      red[selected] = masterPath[0];
      selected = nextIdx;
      masterActive = false;
      masterPath = [];
      moveMap = immediateMoveMap(red[nextIdx], false);
      draw();
      save();
    }
    function moveTo(dest){
      if(selected < 0 || !moveMap.has(dest) || busy) return;
      const path = moveMap.get(dest);
      if(masterMode){ masterStep(path); return; }
      pushUndo();
      env.markFirstMoverUserAction();
      selected = -1;
      moveMap = new Map();
      animateMove('red', selectedIndexFromPath('red', path[0]), path);
    }
    function selectedIndexFromPath(side, from){ return sideArr(side).findIndex(p => p === from); }
    function jumpStepCount(path){
      if(!Array.isArray(path) || path.length < 2) return 0;
      let count = 0;
      for(let i=1;i<path.length;i++) if(!neighbors[path[i - 1]].includes(path[i])) count++;
      return count;
    }
    function animateMove(side, idx, path, onDone){
      if(idx < 0 || !path || path.length < 2) return;
      busy = true;
      moving = { side, pos:path[0] };
      let step = 0;
      const arr = sideArr(side);
      const nextStep = () => {
        step++;
        arr[idx] = path[step];
        moving = { side, pos:path[step] };
        draw();
        if(step < path.length - 1) setTimeout(nextStep, 210);
        else if(onDone) onDone(idx, path);
        else finishMove(side, idx, path);
      };
      draw();
      setTimeout(nextStep, 120);
    }
    function isJumpStep(path){ return path && path.length >= 2 && !neighbors[path[0]].includes(path[path.length - 1]); }
    function masterStep(path){
      if(!masterActive){
        if(!masterUndoOpen){ pushUndo(); env.markFirstMoverUserAction(); masterUndoOpen = true; }
        masterPath = [path[0]];
      }
      const idx = selected;
      selected = -1;
      moveMap = new Map();
      animateMove('red', idx, path, () => {
        const landed = path[path.length - 1];
        busy = false;
        moving = null;
        selected = idx;
        masterActive = true;
        masterPath = masterPath.concat(path.slice(1));
        moveMap = isJumpStep(path) ? immediateMoveMap(landed, true) : new Map();
        draw();
        save();
      });
    }
    function finishMasterTurn(){
      if(!masterMode || !masterActive || selected < 0 || busy || masterPath.length < 2) return;
      const idx = selected;
      const path = masterPath.slice();
      selected = -1;
      masterActive = false;
      masterUndoOpen = false;
      masterPath = [];
      moveMap = new Map();
      finishMove('red', idx, path);
    }
    function finishMove(side, idx, path){
      busy = false;
      moving = null;
      details.rounds = (details.rounds || 0) + 1;
      const jumps = jumpStepCount(path);
      if(side === 'red') details.userMaxJump = Math.max(details.userMaxJump || 0, jumps);
      else details.charMaxJump = Math.max(details.charMaxJump || 0, jumps);
      details.userHomeCount = homeCount('red');
      details.charHomeCount = homeCount('blue');
      let spoke = false;
      const from = path[0], to = path[path.length - 1];
      if(side === 'red' && isOwnHome('red', from) && isTarget('red', to) && jumps > 0) details.shock = true;
      if(isTarget(side, to) && !isTarget(side, from)){ env.speak('draughts', side === 'red' ? 'user_home' : 'char_home'); spoke = true; }
      if(!spoke && Math.random() < .5) env.speak('draughts', side === 'red' ? 'user_move' : 'char_move');
      draw();
      save();
      if(checkWin(side)) return;
      if(side === 'red') masterUndoOpen = false;
      turn = side === 'red' ? 'blue' : 'red';
      draw();
      save();
      if(turn === 'blue') setTimeout(ai, 650);
    }
	    function sideTotalDistance(side){ return sideArr(side).reduce((sum, p) => sum + distToTarget(side, p), 0); }
	    function targetFillScore(side){
	      return sideArr(side).reduce((sum, p) => {
	        if(!isTarget(side, p)) return sum;
	        const pt = points[p];
	        return sum + 260 + (side === 'blue' ? pt.y * 32 : -pt.y * 32) - Math.abs(pt.x2) * 8;
	      }, 0);
	    }
	    function simulateDraughtsMove(side, move, fn){
	      const arr = sideArr(side), old = arr[move.idx];
	      arr[move.idx] = move.to;
	      const out = fn();
	      arr[move.idx] = old;
	      return out;
	    }
	    function boardEval(side){
	      const foe = side === 'blue' ? 'red' : 'blue';
	      const ownHome = homeCount(side), foeHome = homeCount(foe);
	      return ownHome * 1800 - foeHome * 1500 - sideTotalDistance(side) * 95 + sideTotalDistance(foe) * 52 + targetFillScore(side) - targetFillScore(foe) * .75;
	    }
	    function targetSlotValue(side, pos){
	      const pt = points[pos];
	      if(!pt) return 0;
	      return side === 'blue' ? pt.y * 36 - Math.abs(pt.x2) * 7 : -pt.y * 36 - Math.abs(pt.x2) * 7;
	    }
	    function targetBlockPressure(side, moves){
	      const outside = moves.filter(m => !isTarget(side, m.from));
	      if(!outside.length || outside.some(m => isTarget(side, m.to))) return 0;
	      const near = sideArr(side).some(p => !isTarget(side, p) && distToTarget(side, p) <= 2);
	      return near ? 1 : 0;
	    }
	    function homeDeltaForMove(side, move){
	      return (!isTarget(side, move.from) && isTarget(side, move.to) ? 1 : 0) - (isTarget(side, move.from) && !isTarget(side, move.to) ? 1 : 0);
	    }
	    function outsidePieceCount(side){
	      return sideArr(side).filter(p => !isTarget(side, p)).length;
	    }
	    function directHomeMoves(side, moves){
	      return moves.filter(m => !isTarget(side, m.from) && isTarget(side, m.to));
	    }
	    function outsideProgressMoves(side, moves){
	      return moves.filter(m => !isTarget(side, m.from) && distToTarget(side, m.to) < distToTarget(side, m.from));
	    }
	    function targetFreeingMoves(side, moves){
	      return moves.filter(m => isTarget(side, m.from) && isTarget(side, m.to) && targetSlotValue(side, m.to) > targetSlotValue(side, m.from));
	    }
	    function bestReplyPenalty(side, limit){
	      const foe = side === 'blue' ? 'red' : 'blue';
	      const moves = allMoves(foe);
	      if(!moves.length) return 0;
	      return moves.map(m => simulateDraughtsMove(foe, m, () => boardEval(foe))).sort((a,b)=>b-a)[0] * (limit || .18);
	    }
	    function scoreMove(move){
	      const p0 = points[move.from], p1 = points[move.to], side = 'blue';
	      const beforeDist = distToTarget(side, move.from), afterDist = distToTarget(side, move.to);
	      const distGain = (beforeDist - afterDist) * 240;
	      const remainingOutside = outsidePieceCount(side);
	      const directHome = !isTarget(side, move.from) && isTarget(side, move.to);
	      const enterTarget = directHome ? 9000 + Math.max(0, 4 - remainingOutside) * 2200 : 0;
	      const stayTarget = isTarget(side, move.from) ? (isTarget(side, move.to) ? 1250 : -25000) : 0;
	      const finishBonus = homeCount(side) >= 8 && isTarget(side, move.to) ? 1200 : 0;
	      const unresolved = 10 - homeCount(side);
	      const targetShuffle = isTarget(side, move.from) && isTarget(side, move.to);
	      const blockedOutside = unresolved > 0 && aiTargetBlockPressure > 0;
	      const targetSlotDelta = targetShuffle ? targetSlotValue(side, move.to) - targetSlotValue(side, move.from) : 0;
	      const targetShufflePenalty = targetShuffle ? (blockedOutside ? (targetSlotDelta > 0 ? -200 : -6500) : (unresolved > 0 ? -9000 : -900)) : 0;
	      const targetSlotGain = targetShuffle ? targetSlotDelta * 18 : 0;
	      const clearTargetBlock = targetShuffle && blockedOutside && targetSlotDelta > 0 ? targetSlotDelta * 46 + 2400 : 0;
	      const leaveOwnHome = isOwnHome(side, move.from) && !isOwnHome(side, move.to) ? 520 : 0;
	      const ownHomePenalty = isOwnHome(side, move.to) ? -420 : 0;
	      const backwardPenalty = p1.y < p0.y && !isTarget(side, move.to) ? -1200 : 0;
	      const center = -Math.abs(p1.x2) * (isTarget(side, move.to) ? 18 : 4);
	      const jumps = jumpStepCount(move.path);
	      const jumpValue = Math.min(jumps, 3) * 95 - Math.max(0, jumps - 3) * 25;
	      const repeatKey = move.from + '>' + move.to;
	      const reverseKey = move.to + '>' + move.from;
	      const repeatPenalty = aiRecentMoves.includes(repeatKey) ? -1800 : 0;
	      const reversePenalty = aiRecentMoves.includes(reverseKey) ? -2400 : 0;
	      const evalAfter = simulateDraughtsMove(side, move, () => boardEval(side) - bestReplyPenalty(side, .16));
	      return evalAfter + distGain + enterTarget + stayTarget + finishBonus + targetShufflePenalty + targetSlotGain + clearTargetBlock + leaveOwnHome + ownHomePenalty + backwardPenalty + center + jumpValue + repeatPenalty + reversePenalty + Math.random() * 3;
	    }
	    function ai(){
	      if(over||env.gamePaused||busy||turn!=='blue') return;
	      let moves = allMoves('blue');
	      if(!moves.length) { turn='red'; draw(); save(); return; }
	      const currentHome = homeCount('blue');
	      const immediateWin = moves.filter(m => currentHome + homeDeltaForMove('blue', m) >= 10);
	      const entering = directHomeMoves('blue', moves);
	      const outsideCount = outsidePieceCount('blue');
	      const progressing = outsideProgressMoves('blue', moves);
	      aiTargetBlockPressure = targetBlockPressure('blue', moves);
	      const freeing = targetFreeingMoves('blue', moves);
	      if(immediateWin.length) moves = immediateWin;
	      else if(entering.length && outsideCount <= 3) moves = entering;
	      else if(progressing.length && outsideCount <= 3) moves = progressing;
	      else if(aiTargetBlockPressure && freeing.length) moves = freeing;
	      const outsideMoves = moves.filter(m => !isTarget('blue', m.from));
	      if(outsideMoves.length && !aiTargetBlockPressure) moves = outsideMoves;
	      pushUndo();
		      const best = moves.sort((a,b)=>scoreMove(b)-scoreMove(a))[0];
	      aiRecentMoves.push(best.from + '>' + best.to);
	      aiRecentMoves = aiRecentMoves.slice(-8);
	      animateMove('blue', best.idx, best.path);
    }
    function checkWin(side){
      if(homeCount(side) < 10) return false;
      over = true;
      env.clearProgress('draughts');
      details.userHomeCount = homeCount('red');
      details.charHomeCount = homeCount('blue');
      details.userNotHomeAtEnd = 10 - details.userHomeCount;
      details.charNotHomeAtEnd = 10 - details.charHomeCount;
      const meta = { shock:!!details.shock, userNotHomeAtEnd:details.userNotHomeAtEnd, charNotHomeAtEnd:details.charNotHomeAtEnd, details };
      if(side === 'red'){
        const cur = env.scores().draughts;
        env.setScore('draughts', ((cur && typeof cur === 'object' ? cur.user : cur) || 0) + 1);
        env.speak('draughts','user_win');
        env.showGameOver('draughts','你赢了','本局分数：1胜，回合数：'+(details.rounds || 0),'user_win', meta);
      } else {
        env.addTaWin('draughts');
        env.speak('draughts','user_lose');
        env.showGameOver('draughts','游戏结束','本局分数：0胜（TA获胜），回合数：'+(details.rounds || 0),'ta_win', meta);
      }
      return true;
    }
    function zoneClass(p){
      if(topHome.has(p.i)) return 'zone-blue';
      if(bottomHome.has(p.i)) return 'zone-red';
      if(p.row >= 4 && p.row <= 7){
        const count = 8 - p.row;
        const row = points.filter(q => q.row === p.row).sort((a,b) => a.x2 - b.x2);
        const pos = row.findIndex(q => q.i === p.i);
        if(pos >= 0 && pos < count) return 'zone-green';
        if(pos >= row.length - count) return 'zone-yellow';
      }
      if(p.row >= 9 && p.row <= 12){
        const count = p.row - 8;
        const row = points.filter(q => q.row === p.row).sort((a,b) => a.x2 - b.x2);
        const pos = row.findIndex(q => q.i === p.i);
        if(pos >= 0 && pos < count) return 'zone-purple';
        if(pos >= row.length - count) return 'zone-orange';
      }
      return '';
    }
    function draw(){
      const board = env.qs('#wb-draughts-board');
      const charLabel = env.displayCharName();
      const turnEl = env.qs('#wb-draughts-turn');
      const scoreEl = env.qs('#wb-draughts-score');
      if(turnEl) turnEl.textContent = turn === 'red' ? '你的回合' : charLabel + '的回合';
      if(scoreEl) scoreEl.textContent = '你 ' + homeCount('red') + '/10 · ' + charLabel + ' ' + homeCount('blue') + '/10';
	      env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||busy);
      const end = env.qs('#wb-draughts-end', box);
      if(end) end.disabled = env.gamePaused || over || busy || !masterActive || selected < 0 || masterPath.length < 2;
      if(!board) return;
      const occ = occMap(), dests = new Set(moveMap.keys());
      board.innerHTML = points.map(p => {
        const item = occ.get(p.i), sel = item && item.side === 'red' && item.idx === selected, dest = dests.has(p.i), movingHere = moving && moving.pos === p.i;
        const left = 50 + p.x2 * 3.55, top = 50 + p.y * 5.6;
        const cls = ['wb-draughts-hole', zoneClass(p), item ? item.side : '', sel ? 'selected' : '', dest ? 'dest' : '', movingHere ? 'moving' : ''].filter(Boolean).join(' ');
        const disabled = item ? (item.side !== 'red' || turn !== 'red' || busy) : (!dest || busy || turn !== 'red');
        const attr = item ? 'data-piece="' + item.idx + '"' : (dest ? 'data-dest="' + p.i + '"' : '');
        return '<button type="button" class="' + cls + '" style="left:' + left.toFixed(2) + '%;top:' + top.toFixed(2) + '%;" ' + attr + ' ' + (disabled ? 'disabled' : '') + '>' + (item ? '<span></span>' : '') + '</button>';
      }).join('');
      env.qsa('[data-piece]', board).forEach(btn => btn.onclick = () => selectRed(+btn.dataset.piece));
      env.qsa('[data-dest]', board).forEach(btn => btn.onclick = () => moveTo(+btn.dataset.dest));
    }
  }
  startDraughts(state);
  return env.activeGameController || null;
}
