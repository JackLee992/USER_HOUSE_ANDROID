// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'chinesechess';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","clearProgress","cloneCheatState","displayCharName","esc","gamePaused","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startChineseChess(state) {
    const box = env.qs('#wb-gamebox');
    const role = env.displayCharName();
    const glyph = { rK:'帅', rA:'仕', rE:'相', rH:'马', rR:'车', rC:'炮', rP:'兵', bK:'将', bA:'士', bE:'象', bH:'馬', bR:'車', bC:'砲', bP:'卒' };
    const value = { P:90, C:450, H:420, E:180, A:180, R:900, K:20000 };
    const startBoard = () => {
      const b = Array(90).fill('');
      ['bR','bH','bE','bA','bK','bA','bE','bH','bR'].forEach((p,i)=>b[i]=p);
      b[19]='bC'; b[25]='bC'; [27,29,31,33,35].forEach(i=>b[i]='bP');
      [54,56,58,60,62].forEach(i=>b[i]='rP'); b[64]='rC'; b[70]='rC';
      ['rR','rH','rE','rA','rK','rA','rE','rH','rR'].forEach((p,i)=>b[81+i]=p);
      return b;
    };
    let board = Array.isArray(state?.board) && state.board.length === 90 ? state.board.slice() : startBoard();
    const inferCaptured = victimPrefix => {
      const remaining = board.reduce((counts, p) => { if(p && p[0] === victimPrefix) counts[p] = (counts[p] || 0) + 1; return counts; }, {});
      return startBoard().filter(p => p && p[0] === victimPrefix && (remaining[p] ? (remaining[p]--, false) : true));
    };
    let turn = state?.turn || 'user', selected = Number.isInteger(state?.selected) ? state.selected : -1;
    let over = false, busy = false, halfmove = Math.max(0, Number(state?.halfmove || 0));
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0);
    let details = Object.assign({ rounds:0, userCaptures:0, charCaptures:0, userChecks:0, charChecks:0, cannonHits:0, horseMoves:0, riverCross:0, faceBlocks:0, endReason:'', materialSwing:0 }, state?.details || {});
    let lastMoves = Object.assign({ user:null, ta:null }, state?.lastMoves || {});
    let capturedByUser = Array.isArray(state?.capturedByUser) ? state.capturedByUser.filter(p => glyph[p]) : inferCaptured('b');
    let capturedByTa = Array.isArray(state?.capturedByTa) ? state.capturedByTa.filter(p => glyph[p]) : inferCaptured('r');
    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-xq-panel"><div class="wb-xq-info"><span id="wb-xq-text"></span><button type="button" class="wb-btn primary wb-cheat-btn wb-cheat-compact" id="wb-cheat">反悔 <span class="wb-sudoku-badge" id="wb-cheat-left">' + Math.max(0, Math.min(env.CHEAT_MAX, Number(cheatLeft || 0))) + '</span></button></div><div class="wb-chess-captures ta"><span class="wb-chess-captures-label">' + env.esc(role) + ' 吃掉</span><div class="wb-chess-captured-list" id="wb-xq-char-captures"></div></div><div class="wb-xq-board" id="wb-xq-board"></div><div class="wb-chess-captures user"><span class="wb-chess-captures-label">你吃掉</span><div class="wb-chess-captured-list" id="wb-xq-user-captures"></div></div></div>';
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    draw(); save();
    function x(i){ return i % 9; } function y(i){ return Math.floor(i / 9); } function idx(a,b){ return b * 9 + a; }
    function sideOf(p){ return p && p[0] === 'r' ? 'user' : (p && p[0] === 'b' ? 'ta' : ''); }
    function code(side){ return side === 'user' ? 'r' : 'b'; }
    function foe(side){ return side === 'user' ? 'ta' : 'user'; }
    function type(p){ return p ? p[1] : ''; }
    function inside(a,b){ return a >= 0 && a < 9 && b >= 0 && b < 10; }
    function palace(side,a,b){ return a >= 3 && a <= 5 && (side === 'user' ? b >= 7 && b <= 9 : b >= 0 && b <= 2); }
    function crossed(side,b){ return side === 'user' ? b <= 4 : b >= 5; }
    function snapshot(){ return { board:board.slice(), turn, selected, halfmove, taMoves, nextCharLineAt, details:env.cloneCheatState(details), lastMoves:env.cloneCheatState(lastMoves), capturedByUser:capturedByUser.slice(), capturedByTa:capturedByTa.slice() }; }
    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
    function cheatUndo(){
      if(env.gamePaused || over || busy || cheatLeft <= 0 || !undoStack.length) return;
      if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; }
      cheatAttempted = true;
      if(env.cheatAttemptResult('chinesechess', box, false) !== 'success'){ draw(); save(); return; }
      const snap = undoStack.pop();
      env.restoreCheatSnapshot(snap, s => { board=s.board; turn=s.turn; selected=s.selected; halfmove=s.halfmove || 0; taMoves=s.taMoves || 0; nextCharLineAt=s.nextCharLineAt || env.nextCharLineTurn(taMoves); details=s.details || details; lastMoves=Object.assign({user:null,ta:null},s.lastMoves||{}); capturedByUser=Array.isArray(s.capturedByUser)?s.capturedByUser:inferCaptured('b'); capturedByTa=Array.isArray(s.capturedByTa)?s.capturedByTa:inferCaptured('r'); });
      busy = false; cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); if(turn === 'ta') setTimeout(ai, 0);
    }
    function save(){ if(!over) env.saveProgress('chinesechess', { board, turn, selected:-1, halfmove, taMoves, nextCharLineAt, details, lastMoves, capturedByUser, capturedByTa, cheatLeft, cheatAttempted, undoStack }); }
    function kingsFace(b){ const r=b.findIndex(p=>p==='rK'), k=b.findIndex(p=>p==='bK'); if(r<0||k<0||x(r)!==x(k)) return false; const a=x(r); for(let yy=Math.min(y(r),y(k))+1; yy<Math.max(y(r),y(k)); yy++) if(b[idx(a,yy)]) return false; return true; }
    function add(out,b,from,to){ if(to < 0 || to >= 90) return; const p=b[from], t=b[to]; if(!t || sideOf(t)!==sideOf(p)) out.push({ from, to, capture:t || '' }); }
    function rawMoves(b, side){
      const out=[], c=code(side);
      for(let i=0;i<90;i++){
        const p=b[i]; if(!p || p[0]!==c) continue;
        const a=x(i), yy=y(i), t=type(p);
        if(t==='K'){
          [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{ const nx=a+dx, ny=yy+dy; if(inside(nx,ny)&&palace(side,nx,ny)) add(out,b,i,idx(nx,ny)); });
          for(let ny=yy+(side==='user'?-1:1); ny>=0&&ny<10; ny+=(side==='user'?-1:1)){ const j=idx(a,ny); if(b[j]){ if(b[j]===code(foe(side))+'K') add(out,b,i,j); break; } }
        } else if(t==='A') {
          [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dx,dy])=>{ const nx=a+dx, ny=yy+dy; if(inside(nx,ny)&&palace(side,nx,ny)) add(out,b,i,idx(nx,ny)); });
        } else if(t==='E') {
          [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(([dx,dy])=>{ const nx=a+dx, ny=yy+dy, eye=idx(a+dx/2, yy+dy/2); if(inside(nx,ny) && !b[eye] && (side==='user'?ny>=5:ny<=4)) add(out,b,i,idx(nx,ny)); });
        } else if(t==='H') {
          [[1,2,0,1],[2,1,1,0],[-1,2,0,1],[-2,1,-1,0],[1,-2,0,-1],[2,-1,1,0],[-1,-2,0,-1],[-2,-1,-1,0]].forEach(([dx,dy,lx,ly])=>{ const nx=a+dx, ny=yy+dy; if(inside(nx,ny) && !b[idx(a+lx,yy+ly)]) add(out,b,i,idx(nx,ny)); });
        } else if(t==='R' || t==='C') {
          [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{ let nx=a+dx, ny=yy+dy, screen=false; while(inside(nx,ny)){ const j=idx(nx,ny); if(t==='R'){ if(b[j]){ add(out,b,i,j); break; } add(out,b,i,j); } else { if(!screen){ if(b[j]) screen=true; else add(out,b,i,j); } else if(b[j]){ if(sideOf(b[j])===foe(side)) add(out,b,i,j); break; } } nx+=dx; ny+=dy; } });
        } else if(t==='P') {
          const dir=side==='user'?-1:1; if(inside(a,yy+dir)) add(out,b,i,idx(a,yy+dir)); if(crossed(side,yy)) [[1,0],[-1,0]].forEach(([dx,dy])=>{ if(inside(a+dx,yy+dy)) add(out,b,i,idx(a+dx,yy+dy)); });
        }
      }
      return out;
    }
    function applyMoveTo(b,m){ const p=b[m.from], cap=b[m.to]; b[m.to]=p; b[m.from]=''; return cap; }
    function inCheck(b, side){ const k=b.findIndex(p=>p===code(side)+'K'); if(k<0 || kingsFace(b)) return true; return rawMoves(b, foe(side)).some(m=>m.to===k); }
    function legalMovesFor(b, side){ return rawMoves(b, side).filter(m=>{ const nb=b.slice(); applyMoveTo(nb,m); return !kingsFace(nb) && !inCheck(nb, side); }); }
    function legalMoves(side){ return legalMovesFor(board, side); }
    function shouldCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ nextCharLineAt = env.nextCharLineTurn(taMoves); return true; } return false; }
    function moveLabel(m,p,cap){ return glyph[p] + '(' + x(m.from) + ',' + y(m.from) + ')-(' + x(m.to) + ',' + y(m.to) + ')' + (cap ? 'x' + glyph[cap] : ''); }
    function doMove(m, side){
      if(over || busy || env.gamePaused) return false;
      const p=board[m.from], cap=board[m.to], beforeY=y(m.from);
      if(side==='user'){ pushUndo(); env.markFirstMoverUserAction(); }
      lastMoves[side] = { from:m.from, to:m.to };
      if(cap) (side==='user' ? capturedByUser : capturedByTa).push(cap);
      applyMoveTo(board,m); selected=-1; halfmove=(cap || type(p)==='P') ? 0 : halfmove + 1; details.rounds=(details.rounds||0)+1;
      details.materialSwing += (cap ? value[type(cap)] || 0 : 0) * (side === 'user' ? 1 : -1);
      if(cap){ if(side==='user'){ details.userCaptures++; env.speak('chinesechess','user_capture'); } else { details.charCaptures++; env.speak('chinesechess','char_capture'); } if(type(p)==='C'){ details.cannonHits++; env.speak('chinesechess','cannon'); } }
      if(type(p)==='H' && Math.random()<.35){ details.horseMoves++; env.speak('chinesechess','horse'); }
      if(type(p)==='P' && !crossed(side,beforeY) && crossed(side,y(m.to))){ details.riverCross++; env.speak('chinesechess','river'); }
      const other=foe(side), checking=inCheck(board, other), moves=legalMoves(other);
      if(checking){ if(side==='user'){ details.userChecks++; env.speak('chinesechess','user_check'); } else { details.charChecks++; env.speak('chinesechess','char_check'); } }
      if(!moves.length) return finish(side==='user'?'user_win':'ta_win', side==='user'?'你赢了':'游戏结束', checking?'将死':'困毙', moveLabel(m,p,cap));
      if(halfmove>=120) return finish('draw','平局','长回合未吃子', moveLabel(m,p,cap));
      turn=other; if(side==='ta' && shouldCharNext() && !checking && !cap) env.speak('chinesechess','char_next'); draw(); save(); if(turn==='ta') setTimeout(ai,0); return true;
    }
    function finish(result,title,reason,last){
      over=true; details.endReason=reason; env.clearProgress('chinesechess');
      draw();
      const meta={ rounds:details.rounds||0, userCaptures:details.userCaptures||0, taCaptures:details.charCaptures||0, cheatUsed:details.cheatUsed||0, materialSwing:details.materialSwing||0, details };
      if(result==='user_win'){ const cur=env.scores().chinesechess; env.setScore('chinesechess', ((cur&&typeof cur==='object'?cur.user:cur)||0)+1); env.speak('chinesechess','user_win'); }
      else if(result==='ta_win'){ env.addTaWin('chinesechess'); env.speak('chinesechess','user_lose'); }
      else env.speak('chinesechess','draw');
      env.showGameOver('chinesechess', title, '本局分数：' + (result==='user_win'?'1胜':'0胜') + '，回合数：' + (details.rounds||0) + '，原因：' + reason + (last ? '，最后一步：' + last : ''), result, meta); return true;
    }
    function select(i){
      if(over || busy || env.gamePaused || turn!=='user') return;
      const p=board[i], own=sideOf(p)==='user';
      if(selected===i){ selected=-1; draw(); return; }
      if(own){ selected=i; draw(); return; }
      if(selected>=0){ const legal=legalMoves('user'), m=legal.find(mm=>mm.from===selected&&mm.to===i); if(m) doMove(m,'user'); else { const raw=rawMoves(board,'user').find(mm=>mm.from===selected&&mm.to===i); if(raw){ details.faceBlocks++; env.speak('chinesechess','face'); } const el=env.qs('.wb-xq-cell[data-i="'+i+'"]', box); if(el){ el.classList.add('bad'); setTimeout(()=>el.classList.remove('bad'),240); } } }
    }
    function xqPosScore(p, i){
      const side=sideOf(p), t=type(p), a=x(i), yy=y(i), adv=side==='ta'?yy:9-yy, center=4-Math.abs(a-4);
      if(t==='P') return adv*8 + center*4 + (crossed(side, yy) ? 42 : 0);
      if(t==='H') return center*10 + (side==='ta'?yy:9-yy)*2;
      if(t==='C') return center*7 + (adv>=3?18:0);
      if(t==='R') return center*5 + adv*3;
      if(t==='A' || t==='E') return side==='ta' ? (yy<=2?14:0) : (yy>=7?14:0);
      if(t==='K') return palace(side,a,yy) ? 8 : -80;
      return 0;
    }
    function evalXq(b){
      let score=0;
      for(let i=0;i<90;i++){ const p=b[i]; if(!p) continue; const v=(value[type(p)]||0)+xqPosScore(p,i); score += sideOf(p)==='ta' ? v : -v; }
      score += (rawMoves(b,'ta').length - rawMoves(b,'user').length) * 4;
      if(inCheck(b,'user')) score += 90;
      if(inCheck(b,'ta')) score -= 120;
      const userDef=b.filter(p=>p==='rA'||p==='rE').length, taDef=b.filter(p=>p==='bA'||p==='bE').length;
      score += (taDef-userDef)*18;
      return score;
    }
    function scoreMove(m,b=board){ const p=b[m.from], cap=b[m.to], nb=b.slice(); applyMoveTo(nb,m); const see=(cap?(value[type(cap)]||0)*10-(value[type(p)]||0):0), check=inCheck(nb,'user')?500:0; return see + check + evalXq(nb) + Math.random()*3; }
    function orderXqMoves(moves,b){
      return moves.map((m,i)=>({ m, i, score:scoreMove(m,b) })).sort((a,z)=>z.score-a.score || a.i-z.i).map(item=>item.m);
    }
    function searchXq(b, side, depth, alpha, beta, ply){
      if(depth<=0) return evalXq(b);
      const moves=legalMovesFor(b, side);
      if(!moves.length) return side==='ta' ? -30000 + ply : 30000 - ply;
      const orderedMoves=depth>1 ? orderXqMoves(moves,b) : moves;
      if(side==='ta'){
        let best=-Infinity;
        for(const m of orderedMoves){ const nb=b.slice(); applyMoveTo(nb,m); const v=searchXq(nb,'user',depth-1,alpha,beta,ply+1); if(v>best) best=v; if(v>alpha) alpha=v; if(alpha>=beta) break; }
        return best;
      }
      let best=Infinity;
      for(const m of orderedMoves){ const nb=b.slice(); applyMoveTo(nb,m); const v=searchXq(nb,'ta',depth-1,alpha,beta,ply+1); if(v<best) best=v; if(v<beta) beta=v; if(alpha>=beta) break; }
      return best;
    }
    function ai(){
      if(over||env.gamePaused||busy||turn!=='ta') return;
      const moves=legalMoves('ta');
      if(!moves.length) return finish(inCheck(board,'ta')?'user_win':'ta_win', inCheck(board,'ta')?'你赢了':'游戏结束', inCheck(board,'ta')?'将死':'困毙');
      const depth=2;
      const orderedMoves=orderXqMoves(moves,board);
      let best=orderedMoves[0], bestScore=-Infinity;
      for(const m of orderedMoves){ const nb=board.slice(); applyMoveTo(nb,m); const v=searchXq(nb,'user',depth-1,-Infinity,Infinity,1) + Math.random()*2; if(v>bestScore){ bestScore=v; best=m; } }
      doMove(best,'ta');
    }
    function draw(){
      const scoreEl=env.qs('#wb-score'); if(scoreEl) scoreEl.textContent='本局：你吃' + (details.userCaptures||0) + ' / ' + role + '吃' + (details.charCaptures||0);
      const info=env.qs('#wb-xq-text', box); if(info) info.textContent=(turn==='user'?'你的回合':role+'思考中') + (inCheck(board, turn)?' · 被将军':'') + ' · 回合 ' + (details.rounds||0);
      env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused || over || busy);
      const captureHTML = pieces => pieces.length ? pieces.map(p=>'<span class="wb-chess-captured-piece xq ' + sideOf(p) + '" title="' + env.esc(glyph[p] || p) + '">' + (glyph[p] || '') + '</span>').join('') : '<span class="wb-chess-no-captures">尚未吃子</span>';
      const charCaptures=env.qs('#wb-xq-char-captures',box); if(charCaptures) charCaptures.innerHTML=captureHTML(capturedByTa);
      const userCaptures=env.qs('#wb-xq-user-captures',box); if(userCaptures) userCaptures.innerHTML=captureHTML(capturedByUser);
      const moves=selected>=0?legalMoves('user').filter(m=>m.from===selected):[], legal=new Set(moves.map(m=>m.to));
      const brd=env.qs('#wb-xq-board', box); if(!brd) return;
      const moveClass=i=>{
        const user=lastMoves.user && (lastMoves.user.from===i||lastMoves.user.to===i), ta=lastMoves.ta && (lastMoves.ta.from===i||lastMoves.ta.to===i);
        const from=(lastMoves.user&&lastMoves.user.from===i)||(lastMoves.ta&&lastMoves.ta.from===i);
        const to=(lastMoves.user&&lastMoves.user.to===i)||(lastMoves.ta&&lastMoves.ta.to===i);
        return (user&&ta?' last-both':user?' last-user':ta?' last-ta':'') + (from?' last-from':'') + (to?' last-to':'');
      };
      const lines='<svg class="wb-xq-lines" viewBox="0 0 900 1072" aria-hidden="true"><g stroke="rgba(98,63,22,.62)" stroke-width="3" fill="none" stroke-linecap="round"><path d="M50 50H850M50 150H850M50 250H850M50 350H850M50 450H850M50 622H850M50 722H850M50 822H850M50 922H850M50 1022H850"/><path d="M50 50V450M150 50V450M250 50V450M350 50V450M450 50V450M550 50V450M650 50V450M750 50V450M850 50V450M50 622V1022M150 622V1022M250 622V1022M350 622V1022M450 622V1022M550 622V1022M650 622V1022M750 622V1022M850 622V1022"/><path d="M350 50L550 250M550 50L350 250M350 822L550 1022M550 822L350 1022"/></g></svg>';
      brd.innerHTML=lines + board.map((p,i)=>'<button class="wb-xq-cell' + moveClass(i) + (i===selected?' selected':'') + (legal.has(i)?' legal':'') + (sideOf(p)==='user'?' user':sideOf(p)==='ta'?' ta':'') + '" data-i="' + i + '" type="button" style="grid-column:' + (x(i)+1) + ';grid-row:' + (y(i)+1+(y(i)>=5?1:0)) + '">' + (p?'<span>'+glyph[p]+'</span>':'') + '</button>').join('') + '<div class="wb-xq-river"><span>楚河</span><span>汉界</span></div>';
      env.qsa('.wb-xq-cell', brd).forEach(btn=>btn.onclick=()=>select(+btn.dataset.i));
    }
  }
  startChineseChess(state);
  return env.activeGameController || null;
}
