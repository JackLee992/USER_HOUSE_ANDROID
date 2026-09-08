// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'tictactoe';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","cheatAttemptResult","cheatButtonHTML","cloneCheatState","gamePaused","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startTicTacToe(state) {
    const box = env.qs('#wb-gamebox');
    let b = Array.isArray(state?.b) && state.b.length === 9 ? state.b : Array(9).fill(''), over=false;
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0);
    let details = state?.details || { rounds:0, userBlocks:{2:0,3:0,4:0}, charBlocks:{2:0,3:0,4:0} };
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-board3-panel"><div class="wb-actions wb-cheat-row">' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-board3">' + b.map((_,i)=>'<button class="wb-cell" data-i="'+i+'"></button>').join('') + '</div></div>';
    if (!state?.b && state?.firstMover) env.speakFirstMover('tictactoe', state.firstMover);
    if (!state?.b && state?.firstMover === 'ta') ai();
    draw(); save();
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    env.qsa('.wb-cell', box).forEach(cell => cell.onclick = () => { const i=+cell.dataset.i; if(env.gamePaused||over||b[i]) return; pushUndo(); env.markFirstMoverUserAction(); if(bestTic(b,'O')===i) details.userBlocks[2]++; b[i]='X'; details.rounds=b.filter(Boolean).length; const userSpoke = i===4 || [0,2,6,8].includes(i); if(i===4) env.speak('tictactoe','user_center'); else if([0,2,6,8].includes(i)) env.speak('tictactoe','user_corner'); draw(); if(done()) return; ai(userSpoke); draw(); if(!done()) save(); });
    function snapshot(){ return { b:b.slice(), taMoves, nextCharLineAt, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('tictactoe', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ b=s.b; taMoves=s.taMoves; nextCharLineAt=s.nextCharLineAt; details=s.details; }); cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ env.saveProgress('tictactoe', { b, taMoves, nextCharLineAt, details, cheatLeft, cheatAttempted, undoStack }); }
    function maybeCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ nextCharLineAt = env.nextCharLineTurn(taMoves); env.speak('tictactoe','char_next'); return true; } return false; }
    function ai(skipLine){ const i = bestTic(b,'O') ?? bestTic(b,'X') ?? [4,0,2,6,8,1,3,5,7].find(i=>!b[i]); if(i!=null){ const block = bestTic(b,'X')===i; if(block) details.charBlocks[2]++; let spoke = !!skipLine; if(!spoke && block && Math.random()<.5){ spoke = true; env.speak('tictactoe','ai_block'); } b[i]='O'; details.rounds=b.filter(Boolean).length; if(!spoke) maybeCharNext(); } }
    function done(){ const w=winner3(b); if(w||b.every(Boolean)){ over=true; const rounds=b.filter(Boolean).length, meta={ lastMoveWin:rounds>=8, details:Object.assign(details,{rounds}) }; if(w==='X'){ { const curScore = env.scores().tictactoe; env.setScore('tictactoe', ((curScore && typeof curScore === 'object' ? curScore.user : curScore) || 0) + 1); } env.speak('tictactoe','user_win'); env.showGameOver('tictactoe', '你赢了', '本局分数：1胜，回合数：'+rounds, 'user_win', meta); } else if(w==='O') { env.speak('tictactoe','user_lose'); env.showGameOver('tictactoe', '游戏结束', '本局分数：0胜（失败），回合数：'+rounds, 'ta_win', meta); } else { env.speak('tictactoe','draw'); env.showGameOver('tictactoe', '平局', '本局分数：0胜（平局），回合数：'+rounds, 'draw', meta); } return true; } return false; }
	    function draw(){ env.qsa('.wb-cell', box).forEach((c,i)=>c.textContent=b[i]); env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over); }
  }

  function bestTic(b, m){ const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for(const w of wins){ const vals=w.map(i=>b[i]); if(vals.filter(v=>v===m).length===2 && vals.includes('')) return w[vals.indexOf('')]; } return null; }

  function winner3(b){ const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for(const w of wins) if(b[w[0]]&&b[w[0]]===b[w[1]]&&b[w[1]]===b[w[2]]) return b[w[0]]; return ''; }
  startTicTacToe(state);
  return env.activeGameController || null;
}
