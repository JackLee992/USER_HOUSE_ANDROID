// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'reversi';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","cheatButtonHTML","clearProgress","cloneCheatState","displayCharName","gamePaused","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startReversi(state) {
    const box=env.qs('#wb-gamebox'), N=8, dirs=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    const role = env.displayCharName();
    let board=Array.isArray(state?.board)?state.board.slice():Array(64).fill('');
    if(!state?.board){ board[27]=board[36]='ta'; board[28]=board[35]='user'; }
    let turn=state?.turn || (state?.firstMover==='ta'?'ta':'user'), over=false, busy=false;
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0), seen = state?.seen || {};
    let details = state?.details || { counts:[] };
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML='<div class="wb-reversi-panel"><div class="wb-reversi-info" id="wb-reversi-info"><span id="wb-reversi-text"></span>' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-reversi" id="wb-reversi-board"></div></div>';
    if(!state?.turn&&state?.firstMover) env.speakFirstMover('reversi', state.firstMover); draw(); save(); if(turn==='ta') setTimeout(ai,700);
    function idx(x,y){return y*N+x;} function inside(x,y){return x>=0&&y>=0&&x<N&&y<N;}
    function flips(side,i){ if(board[i]) return []; const x=i%N,y=Math.floor(i/N), other=side==='user'?'ta':'user', out=[]; dirs.forEach(d=>{ const arr=[]; let cx=x+d[0],cy=y+d[1]; while(inside(cx,cy)&&board[idx(cx,cy)]===other){ arr.push(idx(cx,cy)); cx+=d[0]; cy+=d[1]; } if(arr.length&&inside(cx,cy)&&board[idx(cx,cy)]===side) out.push(...arr); }); return out; }
    function legal(side){ return board.map((_,i)=>flips(side,i).length?i:-1).filter(i=>i>=0); }
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    function snapshot(){ return { board:board.slice(), turn, taMoves, nextCharLineAt, seen:env.cloneCheatState(seen), details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||busy||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('reversi', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ board=s.board; turn=s.turn; taMoves=s.taMoves; nextCharLineAt=s.nextCharLineAt; seen=s.seen; details=s.details; }); cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('reversi',{board,turn,taMoves,nextCharLineAt,seen,details,cheatLeft,cheatAttempted,undoStack}); }
    function count(side){ return board.filter(x=>x===side).length; }
    function shouldCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ nextCharLineAt = env.nextCharLineTurn(taMoves); return true; } return false; }
    function place(side,i,skipLine){
      const f=flips(side,i); if(!f.length) return false;
      if(side==='user') { pushUndo(); env.markFirstMoverUserAction(); }
      const beforeUser=count('user'), beforeTa=count('ta');
      let spoke = !!skipLine;
      const charNext = side === 'ta' ? shouldCharNext() : false;
      board[i]=side; f.forEach(k=>board[k]=side);
      const afterUser=count('user'), afterTa=count('ta');
      details.counts.push({ user:afterUser, ta:afterTa });
      if(side==='ta' && f.length>5 && !spoke){ spoke = true; env.speak('reversi','char_big_flip'); }
      if(side==='user' && f.length>5 && Math.random()<.5){ spoke = true; env.speak('reversi','user_big_flip'); }
      if(side==='user' && beforeUser * 2 < beforeTa && f.length>7) seen.comeback = 1;
      if(!seen.charDouble && afterTa > afterUser * 2 && afterUser > 0){ seen.charDouble=1; if(!spoke){ spoke = true; env.speak('reversi','char_double'); } }
      if(!seen.userDouble && afterUser > afterTa * 2 && afterTa > 0){ seen.userDouble=1; if(!spoke && Math.random()<.5){ spoke = true; env.speak('reversi','user_double'); } }
      if([0,7,56,63].includes(i) && !spoke && (side === 'ta' || Math.random()<.5)){ spoke = true; env.speak('reversi','corner'); }
      if(!seen.endLine && board.filter(x=>!x).length===1){
        seen.endLine=1;
        if(!spoke) env.speak('reversi', afterUser>afterTa ? 'user_win' : (afterTa>afterUser ? 'user_lose' : 'draw'));
      } else if(side==='ta' && charNext && !spoke) {
        spoke = true;
        env.speak('reversi','char_next');
      }
      const other=side==='user'?'ta':'user';
      if(legal(other).length){ turn=other; } else if(legal(side).length){ turn=side; } else return done();
      draw(); save(); if(turn==='ta') setTimeout(() => ai(spoke),700); return true;
    }
    function isCorner(i){ return [0,7,56,63].includes(i); }
    function isXSquare(i){ return [9,14,49,54].includes(i); }
    function isCSquare(i){ return [1,8,6,15,48,57,55,62].includes(i); }
    function adjacentCornerOpen(i){
      const pairs={9:0,1:0,8:0,14:7,6:7,15:7,49:56,48:56,57:56,54:63,55:63,62:63};
      return pairs[i] != null && !board[pairs[i]];
    }
    function simulate(side,i,fn){
      const f=flips(side,i), old=board[i];
      board[i]=side; f.forEach(k=>board[k]=side);
      const out=fn(f);
      board[i]=old; f.forEach(k=>board[k]=side==='user'?'ta':'user');
      return out;
    }
    function stableEdgeScore(side){
      let score=0;
      [[0,1,8],[7,-1,8],[56,1,-8],[63,-1,-8]].forEach(([corner,dx,dy])=>{
        if(board[corner]!==side) return;
        score+=80;
        let p=corner+dx; while(p>=0&&p<64&&Math.floor(p/8)===Math.floor(corner/8)&&board[p]===side){ score+=18; p+=dx; }
        p=corner+dy; while(p>=0&&p<64&&board[p]===side){ score+=18; p+=dy; }
      });
      return score;
    }
    function moveScore(i){
      const weights=[120,-24,18,8,8,18,-24,120,-24,-48,-6,-4,-4,-6,-48,-24,18,-6,10,4,4,10,-6,18,8,-4,4,2,2,4,-4,8,8,-4,4,2,2,4,-4,8,18,-6,10,4,4,10,-6,18,-24,-48,-6,-4,-4,-6,-48,-24,120,-24,18,8,8,18,-24,120];
      return simulate('ta', i, f=>{
        const userMoves=legal('user'), taMoves=legal('ta');
        const userCorners=userMoves.filter(isCorner).length;
        const taCorners=taMoves.filter(isCorner).length;
        const mobility=(taMoves.length-userMoves.length)*7;
        const parity=board.filter(Boolean).length > 48 ? f.length*4 : -Math.min(f.length,5)*2;
        const danger=(adjacentCornerOpen(i)&&!isCorner(i)?90:0) + (isXSquare(i)?28:0) + (isCSquare(i)?16:0);
        const corner=isCorner(i)?500:0;
        const edge=(i<8||i>=56||i%8===0||i%8===7)?28:0;
        return weights[i] + corner + edge + mobility + parity + taCorners*120 - userCorners*220 + stableEdgeScore('ta') - stableEdgeScore('user')*.8 - danger;
      });
    }
    function ai(skipLine){ if(over||env.gamePaused||turn!=='ta') return; const moves=legal('ta'); if(!moves.length){ turn='user'; draw(); save(); return; } moves.sort((a,b)=>moveScore(b)-moveScore(a)); const spoke = !skipLine && isCorner(moves[0]); if(spoke) env.speak('reversi','corner'); place('ta', moves[0], skipLine || spoke); }
    function done(){ over=true; env.clearProgress('reversi'); const u=board.filter(x=>x==='user').length,t=board.filter(x=>x==='ta').length, rounds=Math.max(0,u+t-4); const res=u>t?'user_win':(t>u?'ta_win':'draw'); if(!seen.endLine) env.speak('reversi', res==='ta_win' ? 'user_lose' : res); if(res==='user_win'){ const cur=env.scores().reversi; env.setScore('reversi',((cur&&typeof cur==='object'?cur.user:cur)||0)+1); } else if(res==='ta_win') env.addTaWin('reversi'); env.showGameOver('reversi',res==='user_win'?'你赢了':(res==='draw'?'平局':'游戏结束'),'你'+u+'格 / '+role+t+'格，回合数：'+rounds,res,{userScore:u,taScore:t,comeback:!!seen.comeback,details}); return true; }
	    function draw(){ const u=board.filter(x=>x==='user').length,t=board.filter(x=>x==='ta').length; env.qs('#wb-score').textContent='本局：你'+u+' / '+role+t; const info=env.qs('#wb-reversi-text', box); if(info) info.textContent=(turn==='user'?'你的回合':role+'思考中')+' · 你'+u+' / '+role+t; env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||busy); const leg=new Set(legal('user')); env.qs('#wb-reversi-board').innerHTML=board.map((v,i)=>'<button class="wb-reversi-cell '+v+(leg.has(i)&&turn==='user'?' legal':'')+'" data-i="'+i+'">'+(v?'<span></span>':'')+'</button>').join(''); env.qsa('.wb-reversi-cell',box).forEach(b=>b.onclick=()=>{ if(turn==='user'&&!busy) place('user',+b.dataset.i); }); }
  }
  startReversi(state);
  return env.activeGameController || null;
}
