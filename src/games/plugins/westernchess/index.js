// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'westernchess';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","clearProgress","cloneCheatState","displayCharName","esc","gamePaused","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startWesternChess(state) {
    const box = env.qs('#wb-gamebox');
    const role = env.displayCharName();
    const glyph = { wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙', bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟' };
    const value = { P:100, N:320, B:330, R:500, Q:900, K:20000 };
    const startBoard = () => ['bR','bN','bB','bQ','bK','bB','bN','bR','bP','bP','bP','bP','bP','bP','bP','bP','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','wP','wP','wP','wP','wP','wP','wP','wP','wR','wN','wB','wQ','wK','wB','wN','wR'];
    let board = Array.isArray(state?.board) && state.board.length === 64 ? state.board.slice() : startBoard();
    const inferCaptured = victimPrefix => {
      const remaining = board.reduce((counts, p) => { if(p && p[0] === victimPrefix) counts[p] = (counts[p] || 0) + 1; return counts; }, {});
      return startBoard().filter(p => p && p[0] === victimPrefix && (remaining[p] ? (remaining[p]--, false) : true));
    };
    let turn = state?.turn || 'user';
    let selected = Number.isInteger(state?.selected) ? state.selected : -1;
    let moved = Object.assign({ wK:false, wRa:false, wRh:false, bK:false, bRa:false, bRh:false }, state?.moved || {});
    let history = Array.isArray(state?.history) ? state.history.slice(-12) : [];
    let halfmove = Math.max(0, Number(state?.halfmove || 0));
    let over = false, busy = false;
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0);
    let details = Object.assign({ rounds:0, userCaptures:0, charCaptures:0, userChecks:0, charChecks:0, castles:0, promotions:0, queenTrade:false, endReason:'', materialSwing:0 }, state?.details || {});
    let lastMoves = Object.assign({ user:null, ta:null }, state?.lastMoves || {});
    let capturedByUser = Array.isArray(state?.capturedByUser) ? state.capturedByUser.filter(p => glyph[p]) : inferCaptured('b');
    let capturedByTa = Array.isArray(state?.capturedByTa) ? state.capturedByTa.filter(p => glyph[p]) : inferCaptured('w');
    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-chess-panel"><div class="wb-chess-info"><span id="wb-chess-text"></span><button type="button" class="wb-btn primary wb-cheat-btn wb-cheat-compact" id="wb-cheat">反悔 <span class="wb-sudoku-badge" id="wb-cheat-left">' + Math.max(0, Math.min(env.CHEAT_MAX, Number(cheatLeft || 0))) + '</span></button></div><div class="wb-chess-captures ta"><span class="wb-chess-captures-label">' + env.esc(role) + ' 吃掉</span><div class="wb-chess-captured-list" id="wb-chess-char-captures"></div></div><div class="wb-chess-board" id="wb-chess-board"></div><div class="wb-chess-captures user"><span class="wb-chess-captures-label">你吃掉</span><div class="wb-chess-captured-list" id="wb-chess-user-captures"></div></div></div>';
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    draw(); save();
    function x(i){ return i % 8; } function y(i){ return Math.floor(i / 8); } function idx(a,b){ return b * 8 + a; }
    function sideOf(p){ return p && p[0] === 'w' ? 'user' : (p && p[0] === 'b' ? 'ta' : ''); }
    function code(side){ return side === 'user' ? 'w' : 'b'; }
    function foe(side){ return side === 'user' ? 'ta' : 'user'; }
    function type(p){ return p ? p[1] : ''; }
    function inside(a,b){ return a >= 0 && a < 8 && b >= 0 && b < 8; }
    function snapshot(){ return { board:board.slice(), turn, selected, moved:env.cloneCheatState(moved), history:history.slice(), halfmove, taMoves, nextCharLineAt, details:env.cloneCheatState(details), lastMoves:env.cloneCheatState(lastMoves), capturedByUser:capturedByUser.slice(), capturedByTa:capturedByTa.slice() }; }
    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
    function cheatUndo(){
      if(env.gamePaused || over || busy || cheatLeft <= 0 || !undoStack.length) return;
      if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; }
      cheatAttempted = true;
      if(env.cheatAttemptResult('westernchess', box, false) !== 'success'){ draw(); save(); return; }
      const snap = undoStack.pop();
      env.restoreCheatSnapshot(snap, s => { board=s.board; turn=s.turn; selected=s.selected; moved=s.moved; history=s.history || []; halfmove=s.halfmove || 0; taMoves=s.taMoves || 0; nextCharLineAt=s.nextCharLineAt || env.nextCharLineTurn(taMoves); details=s.details || details; lastMoves=Object.assign({user:null,ta:null},s.lastMoves||{}); capturedByUser=Array.isArray(s.capturedByUser)?s.capturedByUser:inferCaptured('b'); capturedByTa=Array.isArray(s.capturedByTa)?s.capturedByTa:inferCaptured('w'); });
      busy = false; cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save();
      if(turn === 'ta') setTimeout(ai, 650);
    }
    function save(){ if(!over) env.saveProgress('westernchess', { board, turn, selected:-1, moved, history, halfmove, taMoves, nextCharLineAt, details, lastMoves, capturedByUser, capturedByTa, cheatLeft, cheatAttempted, undoStack }); }
    function castleKeyForSquare(sq){ return sq === 60 ? 'wK' : sq === 56 ? 'wRa' : sq === 63 ? 'wRh' : sq === 4 ? 'bK' : sq === 0 ? 'bRa' : sq === 7 ? 'bRh' : ''; }
    function applyMoveTo(b, m){
      const p = b[m.from], cap = b[m.to];
      b[m.to] = m.promo ? p[0] + m.promo : p; b[m.from] = '';
      if(m.castle === 'k'){ b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = ''; }
      if(m.castle === 'q'){ b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = ''; }
      return cap;
    }
    function markMoved(m, p, cap){
      const k = castleKeyForSquare(m.from); if(k) moved[k] = true;
      const ck = castleKeyForSquare(m.to); if(ck && cap) moved[ck] = true;
      if(type(p) === 'K') moved[p[0] + 'K'] = true;
      if(m.castle === 'k') moved[p[0] + 'Rh'] = true;
      if(m.castle === 'q') moved[p[0] + 'Ra'] = true;
    }
    function kingSquare(b, side){ const k = code(side) + 'K'; return b.findIndex(p => p === k); }
    function attacked(b, sq, bySide){
      const c = code(bySide), px = x(sq), py = y(sq);
      const pawnFrom = bySide === 'user' ? [[px-1,py+1],[px+1,py+1]] : [[px-1,py-1],[px+1,py-1]];
      if(pawnFrom.some(([a,bb]) => inside(a,bb) && b[idx(a,bb)] === c + 'P')) return true;
      for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) if(inside(px+dx,py+dy) && b[idx(px+dx,py+dy)] === c + 'N') return true;
      for(const [dx,dy,need] of [[1,1,'BQ'],[-1,1,'BQ'],[1,-1,'BQ'],[-1,-1,'BQ'],[1,0,'RQ'],[-1,0,'RQ'],[0,1,'RQ'],[0,-1,'RQ']]){
        let a=px+dx, bb=py+dy;
        while(inside(a,bb)){ const p=b[idx(a,bb)]; if(p){ if(p[0]===c && need.includes(type(p))) return true; break; } a+=dx; bb+=dy; }
      }
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) if((dx||dy) && inside(px+dx,py+dy) && b[idx(px+dx,py+dy)] === c + 'K') return true;
      return false;
    }
    function inCheck(b, side){ const k = kingSquare(b, side); return k >= 0 && attacked(b, k, foe(side)); }
    function addMove(out, from, to, promo, castle){ const target = board[to]; if(!target || sideOf(target) !== sideOf(board[from])) out.push({ from, to, promo, castle, capture:target || '' }); }
    function pseudoMoves(side){
      const out = [], c = code(side);
      for(let i=0;i<64;i++){
        const p = board[i]; if(!p || p[0] !== c) continue;
        const a=x(i), b=y(i), t=type(p);
        if(t === 'P'){
          const dir = side === 'user' ? -1 : 1, start = side === 'user' ? 6 : 1, promoRow = side === 'user' ? 0 : 7;
          const one = idx(a,b+dir);
          if(inside(a,b+dir) && !board[one]){ addMove(out, i, one, b+dir === promoRow ? 'Q' : ''); if(b === start && !board[idx(a,b+dir*2)]) addMove(out, i, idx(a,b+dir*2)); }
          for(const da of [-1,1]) if(inside(a+da,b+dir)){ const j=idx(a+da,b+dir); if(board[j] && sideOf(board[j]) === foe(side)) addMove(out, i, j, b+dir === promoRow ? 'Q' : ''); }
        } else if(t === 'N') {
          [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([dx,dy]) => { if(inside(a+dx,b+dy)) addMove(out, i, idx(a+dx,b+dy)); });
        } else if(t === 'B' || t === 'R' || t === 'Q') {
          const dirs = (t === 'B' ? [[1,1],[-1,1],[1,-1],[-1,-1]] : t === 'R' ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
          dirs.forEach(([dx,dy]) => { let nx=a+dx, ny=b+dy; while(inside(nx,ny)){ const j=idx(nx,ny); if(board[j]){ addMove(out, i, j); break; } addMove(out, i, j); nx+=dx; ny+=dy; } });
        } else if(t === 'K') {
          for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) if((dx||dy) && inside(a+dx,b+dy)) addMove(out, i, idx(a+dx,b+dy));
          const home = side === 'user' ? 60 : 4, row = side === 'user' ? 7 : 0, pref = side === 'user' ? 'w' : 'b';
          if(i === home && !moved[pref+'K'] && !inCheck(board, side)){
            if(!moved[pref+'Rh'] && board[idx(7,row)] === pref+'R' && !board[idx(5,row)] && !board[idx(6,row)] && !attacked(board, idx(5,row), foe(side)) && !attacked(board, idx(6,row), foe(side))) out.push({ from:i, to:idx(6,row), castle:'k', capture:'' });
            if(!moved[pref+'Ra'] && board[idx(0,row)] === pref+'R' && !board[idx(1,row)] && !board[idx(2,row)] && !board[idx(3,row)] && !attacked(board, idx(3,row), foe(side)) && !attacked(board, idx(2,row), foe(side))) out.push({ from:i, to:idx(2,row), castle:'q', capture:'' });
          }
        }
      }
      return out;
    }
    function legalMoves(side){ return pseudoMoves(side).filter(m => { const b=board.slice(); applyMoveTo(b, m); return !inCheck(b, side); }); }
    function repKey(){ return board.join(',') + '|' + turn; }
    function shouldCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ nextCharLineAt = env.nextCharLineTurn(taMoves); return true; } return false; }
    function moveLabel(m, p, cap){ return glyph[p] + String.fromCharCode(97 + x(m.from)) + (8 - y(m.from)) + '-' + String.fromCharCode(97 + x(m.to)) + (8 - y(m.to)) + (cap ? 'x' + glyph[cap] : ''); }
    function doMove(m, side){
      if(over || busy || env.gamePaused) return false;
      const p = board[m.from], cap = board[m.to], wasPawn = type(p) === 'P';
      if(side === 'user'){ pushUndo(); env.markFirstMoverUserAction(); }
      lastMoves[side] = { from:m.from, to:m.to };
      if(cap) (side === 'user' ? capturedByUser : capturedByTa).push(cap);
      markMoved(m, p, cap); applyMoveTo(board, m); selected = -1;
      halfmove = (cap || wasPawn) ? 0 : halfmove + 1;
      details.rounds = (details.rounds || 0) + 1;
      details.materialSwing += (cap ? value[type(cap)] || 0 : 0) * (side === 'user' ? 1 : -1);
      if(cap){ if(side === 'user'){ details.userCaptures++; env.speak('westernchess','user_capture'); } else { details.charCaptures++; env.speak('westernchess','char_capture'); } }
      if(m.castle){ details.castles++; env.speak('westernchess','castle'); }
      if(m.promo){ details.promotions++; env.speak('westernchess','promotion'); }
      if(!board.includes('wQ') && !board.includes('bQ') && !details.queenTrade){ details.queenTrade=true; env.speak('westernchess','queen_trade'); }
      const other = foe(side), checking = inCheck(board, other), moves = legalMoves(other);
      if(checking){ if(side === 'user'){ details.userChecks++; env.speak('westernchess','user_check'); } else { details.charChecks++; env.speak('westernchess','char_check'); } }
      history.push(repKey()); history = history.slice(-12);
      if(checking && !moves.length) return finish(side === 'user' ? 'user_win' : 'ta_win', side === 'user' ? '你赢了' : '游戏结束', '将死', moveLabel(m,p,cap));
      if(!checking && !moves.length) return finish('draw', '平局', '逼和', moveLabel(m,p,cap));
      if(halfmove >= 100) return finish('draw', '平局', '50回合无吃子无兵动', moveLabel(m,p,cap));
      if(history.filter(k => k === repKey()).length >= 3) return finish('draw', '平局', '三次重复局面', moveLabel(m,p,cap));
      turn = other;
      if(side === 'ta' && shouldCharNext() && !checking && !cap) env.speak('westernchess','char_next');
      draw(); save(); if(turn === 'ta') setTimeout(ai, 650);
      return true;
    }
    function finish(result, title, reason, last){
      over = true; details.endReason = reason; env.clearProgress('westernchess');
      draw();
      const meta = { rounds:details.rounds || 0, userCaptures:details.userCaptures || 0, taCaptures:details.charCaptures || 0, cheatUsed:details.cheatUsed || 0, materialSwing:details.materialSwing || 0, details };
      if(result === 'user_win'){ const cur=env.scores().westernchess; env.setScore('westernchess', ((cur && typeof cur === 'object' ? cur.user : cur) || 0) + 1); env.speak('westernchess','user_win'); }
      else if(result === 'ta_win'){ env.addTaWin('westernchess'); env.speak('westernchess','user_lose'); }
      else env.speak('westernchess','draw');
      env.showGameOver('westernchess', title, '本局分数：' + (result === 'user_win' ? '1胜' : '0胜') + '，回合数：' + (details.rounds || 0) + '，原因：' + reason + (last ? '，最后一步：' + last : ''), result, meta);
      return true;
    }
    function select(i){
      if(over || busy || env.gamePaused || turn !== 'user') return;
      const p = board[i], own = sideOf(p) === 'user';
      if(selected === i){ selected = -1; draw(); return; }
      if(own){ selected = i; draw(); return; }
      if(selected >= 0){ const m = legalMoves('user').find(mm => mm.from === selected && mm.to === i); if(m) doMove(m, 'user'); else { const el=env.qs('.wb-chess-cell[data-i="'+i+'"]', box); if(el){ el.classList.add('bad'); setTimeout(()=>el.classList.remove('bad'),240); } } }
    }
    function withChessState(b, movedState, fn){ const oldBoard=board, oldMoved=moved; board=b; moved=movedState || moved; try { return fn(); } finally { board=oldBoard; moved=oldMoved; } }
    function movedAfterState(st, m, p, cap){
      const next=Object.assign({}, st || moved);
      const k=castleKeyForSquare(m.from); if(k) next[k]=true;
      const ck=castleKeyForSquare(m.to); if(ck && cap) next[ck]=true;
      if(type(p)==='K') next[p[0]+'K']=true;
      if(m.castle==='k') next[p[0]+'Rh']=true;
      if(m.castle==='q') next[p[0]+'Ra']=true;
      return next;
    }
    function chessLegal(b, side, movedState){ return withChessState(b, movedState, () => legalMoves(side)); }
    function pst(p, i){
      const side=sideOf(p), t=type(p), a=x(i), yy=y(i), rank=side==='ta'?yy:7-yy, center=3.5-(Math.abs(a-3.5)+Math.abs(yy-3.5))/2;
      if(t==='P') return rank*10 + center*4;
      if(t==='N') return center*18 - ((a===0||a===7||yy===0||yy===7)?22:0);
      if(t==='B') return center*10;
      if(t==='R') return rank*3 + (a===0||a===7?4:0);
      if(t==='Q') return center*6;
      if(t==='K') return rank<3 ? ((a===6||a===1)?24:0) : -center*8;
      return 0;
    }
    function evalChess(b, movedState){
      let score=0, taBishops=0, userBishops=0;
      for(let i=0;i<64;i++){ const p=b[i]; if(!p) continue; const v=(value[type(p)]||0)+pst(p,i); score += sideOf(p)==='ta' ? v : -v; if(p==='bB') taBishops++; if(p==='wB') userBishops++; }
      if(taBishops>=2) score += 35; if(userBishops>=2) score -= 35;
      score += (withChessState(b,movedState,()=>pseudoMoves('ta').length) - withChessState(b,movedState,()=>pseudoMoves('user').length)) * 3;
      if(inCheck(b,'user')) score += 85;
      if(inCheck(b,'ta')) score -= 120;
      const bk=kingSquare(b,'ta'), wk=kingSquare(b,'user');
      if(bk>=0) score += [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0]].filter(([dx,dy])=>inside(x(bk)+dx,y(bk)+dy) && sideOf(b[idx(x(bk)+dx,y(bk)+dy)])==='ta').length*8;
      if(wk>=0) score -= [[-1,1],[0,1],[1,1],[-1,0],[1,0]].filter(([dx,dy])=>inside(x(wk)+dx,y(wk)+dy) && sideOf(b[idx(x(wk)+dx,y(wk)+dy)])==='user').length*8;
      return score;
    }
    function scoreMove(m,b=board,movedState=moved){
      const p=b[m.from], cap=b[m.to], nb=b.slice(); applyMoveTo(nb,m);
      const nextMoved=movedAfterState(movedState,m,p,cap);
      const victim=cap ? (value[type(cap)]||0) : 0, attacker=value[type(p)]||0;
      const check=inCheck(nb,'user')?450:0, unsafe=attacked(nb,m.to,'user') ? -attacker*.85 : 0;
      return victim*10 - attacker + check + unsafe + (m.promo?850:0) + (m.castle?120:0) + evalChess(nb,nextMoved)*.08 + Math.random()*3;
    }
    function searchChess(b, side, movedState, depth, alpha, beta, ply){
      const moves=chessLegal(b, side, movedState);
      if(!moves.length){ if(inCheck(b,side)) return side==='ta' ? -30000 + ply : 30000 - ply; return 0; }
      if(depth<=0) return evalChess(b, movedState);
      moves.sort((a,bm)=>scoreMove(bm,b,movedState)-scoreMove(a,b,movedState));
      if(side==='ta'){
        let best=-Infinity;
        for(const m of moves){ const p=b[m.from], cap=b[m.to], nb=b.slice(); applyMoveTo(nb,m); const v=searchChess(nb,'user',movedAfterState(movedState,m,p,cap),depth-1,alpha,beta,ply+1); if(v>best) best=v; if(v>alpha) alpha=v; if(alpha>=beta) break; }
        return best;
      }
      let best=Infinity;
      for(const m of moves){ const p=b[m.from], cap=b[m.to], nb=b.slice(); applyMoveTo(nb,m); const v=searchChess(nb,'ta',movedAfterState(movedState,m,p,cap),depth-1,alpha,beta,ply+1); if(v<best) best=v; if(v<beta) beta=v; if(alpha>=beta) break; }
      return best;
    }
    function ai(){
      if(over || env.gamePaused || busy || turn !== 'ta') return;
      const moves = legalMoves('ta');
      if(!moves.length) return finish(inCheck(board,'ta') ? 'user_win' : 'draw', inCheck(board,'ta') ? '你赢了' : '平局', inCheck(board,'ta') ? '将死' : '逼和');
      const depth=moves.length>34?2:3;
      moves.sort((a,b) => scoreMove(b) - scoreMove(a));
      let best=moves[0], bestScore=-Infinity;
      for(const m of moves){ const p=board[m.from], cap=board[m.to], nb=board.slice(); applyMoveTo(nb,m); const v=searchChess(nb,'user',movedAfterState(moved,m,p,cap),depth-1,-Infinity,Infinity,1) + Math.random()*2; if(v>bestScore){ bestScore=v; best=m; } }
      doMove(best, 'ta');
    }
    function draw(){
      const userCap = details.userCaptures || 0, charCap = details.charCaptures || 0;
      const scoreEl=env.qs('#wb-score'); if(scoreEl) scoreEl.textContent='本局：你吃' + userCap + ' / ' + role + '吃' + charCap;
      const info=env.qs('#wb-chess-text', box);
      if(info) info.textContent=(turn === 'user' ? '你的回合' : role + '思考中') + (inCheck(board, turn) ? ' · 被将军' : '') + ' · 回合 ' + (details.rounds || 0);
      env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused || over || busy);
      const captureHTML = pieces => pieces.length ? pieces.map(p=>'<span class="wb-chess-captured-piece western" title="' + env.esc(p) + '">' + (glyph[p] || '') + '</span>').join('') : '<span class="wb-chess-no-captures">尚未吃子</span>';
      const charCaptures=env.qs('#wb-chess-char-captures',box); if(charCaptures) charCaptures.innerHTML=captureHTML(capturedByTa);
      const userCaptures=env.qs('#wb-chess-user-captures',box); if(userCaptures) userCaptures.innerHTML=captureHTML(capturedByUser);
      const moves = selected >= 0 ? legalMoves('user').filter(m => m.from === selected) : [];
      const legal = new Set(moves.map(m => m.to));
      const brd=env.qs('#wb-chess-board', box); if(!brd) return;
      const moveClass=i=>{
        const user=lastMoves.user && (lastMoves.user.from===i||lastMoves.user.to===i), ta=lastMoves.ta && (lastMoves.ta.from===i||lastMoves.ta.to===i);
        const from=(lastMoves.user&&lastMoves.user.from===i)||(lastMoves.ta&&lastMoves.ta.from===i);
        const to=(lastMoves.user&&lastMoves.user.to===i)||(lastMoves.ta&&lastMoves.ta.to===i);
        return (user&&ta?' last-both':user?' last-user':ta?' last-ta':'') + (from?' last-from':'') + (to?' last-to':'');
      };
      brd.innerHTML = board.map((p,i) => {
        const dark = (x(i) + y(i)) % 2 ? ' dark' : ' light';
        return '<button class="wb-chess-cell' + dark + moveClass(i) + (i===selected?' selected':'') + (legal.has(i)?' legal':'') + (sideOf(p)==='user'?' user':sideOf(p)==='ta'?' ta':'') + '" data-i="' + i + '" type="button">' + (p ? '<span>' + glyph[p] + '</span>' : '') + '</button>';
      }).join('');
      env.qsa('.wb-chess-cell', brd).forEach(btn => btn.onclick = () => select(+btn.dataset.i));
    }
  }
  startWesternChess(state);
  return env.activeGameController || null;
}
