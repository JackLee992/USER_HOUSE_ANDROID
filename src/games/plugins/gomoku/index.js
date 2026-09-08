// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'gomoku';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","cheatAttemptResult","cheatButtonCompactHTML","choiceForState","choiceSavePatch","clearProgress","cloneCheatState","displayCharNameForGame","esc","gamePaused","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startGomoku(state) {
    if (env.choiceForState('gomoku', state).id === 'endless') { startEndlessGomoku(state); return; }
    const box = env.qs('#wb-gamebox'), n=15;
    let b = Array.isArray(state?.b) && state.b.length === n*n ? state.b : Array(n*n).fill(''), over=false;
    let lastCharMove = Number.isInteger(state?.lastCharMove) ? state.lastCharMove : -1;
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0);
    let details = state?.details || { rounds:0, userBlocks:{2:0,3:0,4:0}, charBlocks:{2:0,3:0,4:0} };
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-gomoku-panel wb-gomoku-with-info"><div class="wb-gomoku-info wb-gomoku-info-normal"><div class="wb-gomoku-stat"><span>轮到</span><b id="wb-gomoku-turn">你</b></div><div class="wb-gomoku-stat"><span>执棋</span><b id="wb-gomoku-stock">你 黑</b></div><div class="wb-gomoku-stat"><span>规则</span><b id="wb-gomoku-captured">五连胜</b></div>' + env.cheatButtonCompactHTML(cheatLeft) + '</div><div class="wb-gomoku">' + b.map((_,i)=>'<button class="wb-gcell" data-i="'+i+'"></button>').join('') + '</div></div>';
    if (!state?.b && state?.firstMover) env.speakFirstMover('gomoku', state.firstMover);
    if (!state?.b && state?.firstMover === 'ta') { const first = bestGomoku(b,n,true); if(first>=0){ b[first]='W'; lastCharMove=first; maybeCharNext(); } }
    draw(); save();
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    env.qsa('.wb-gcell', box).forEach(cell => cell.onclick = () => { const i=+cell.dataset.i; if(env.gamePaused||over||b[i]) return; pushUndo(); env.markFirstMoverUserAction(); const userBlock=blockRank(b,n,i,'W',4); if(userBlock>=2) details.userBlocks[userBlock] = (details.userBlocks[userBlock] || 0) + 1; b[i]='B'; details.rounds=b.filter(Boolean).length; const pat=gomokuPattern(b,n,i,'B'); let userEvent = ''; if(pat) userEvent = pat; else if(lineScore(b,n,i,'B')>=125) userEvent = 'user_three'; const userSpoke = !!userEvent && Math.random()<.5; if(userSpoke) env.speak('gomoku', userEvent); draw(); if(done('B')) return; const ai=bestGomoku(b,n,userSpoke); const aiSpoke = !!bestGomoku.lastSpoke; if(ai>=0){ const charBlock=blockRank(b,n,ai,'B',4); if(charBlock>=2) details.charBlocks[charBlock] = (details.charBlocks[charBlock] || 0) + 1; b[ai]='W'; lastCharMove=ai; details.rounds=b.filter(Boolean).length; if(!userSpoke && !aiSpoke){ const threat = lineScore(b,n,ai,'W')>=80; if(threat) env.speak('gomoku','ai_threat'); else maybeCharNext(); } draw(); if(!done('W')) save(); } });
    function snapshot(){ return { b:b.slice(), lastCharMove, taMoves, nextCharLineAt, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('gomoku', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ b=s.b; lastCharMove=Number.isInteger(s.lastCharMove) ? s.lastCharMove : -1; taMoves=s.taMoves; nextCharLineAt=s.nextCharLineAt; details=s.details; }); cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ env.saveProgress('gomoku', Object.assign({ b, lastCharMove, taMoves, nextCharLineAt, details, cheatLeft, cheatAttempted, undoStack }, env.choiceSavePatch('gomoku', env.choiceForState('gomoku', state)))); }
    function maybeCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ env.speak('gomoku','char_next'); nextCharLineAt = env.nextCharLineTurn(taMoves); return true; } return false; }
    function done(m){ const rounds=b.filter(Boolean).length; details.rounds=rounds; details.gomokuMode='normal'; const meta={gomokuMode:'normal', details}; if(winG(b,n,m)){ over=true; if(m==='B'){ { const curScore = env.scores().gomoku; env.setScore('gomoku', ((curScore && typeof curScore === 'object' ? curScore.user : curScore) || 0) + 1); } env.speak('gomoku','user_win'); env.showGameOver('gomoku', '你赢了', '回合数：' + rounds, 'user_win', meta); } else { env.speak('gomoku','user_lose'); env.showGameOver('gomoku', '游戏结束', '回合数：' + rounds + '（失败）', 'ta_win', meta); } return true; } if(b.every(Boolean)){ over=true; env.speak('gomoku','draw'); env.showGameOver('gomoku', '平局', '回合数：' + rounds + '（平局）', 'draw', meta); return true; } return false; }
	    function draw(){ const turnEl=env.qs('#wb-gomoku-turn', box); if(turnEl) turnEl.textContent='你'; const roleEl=env.qs('#wb-gomoku-stock', box); if(roleEl) roleEl.innerHTML='你 黑<br>' + env.esc(env.displayCharNameForGame('gomoku') || 'TA') + ' 白'; env.qsa('.wb-gcell', box).forEach((c,i)=>{ c.className='wb-gcell' + (b[i]==='B'?' black':b[i]==='W'?' white':'') + (i===lastCharMove && b[i]==='W' ? ' char-last' : ''); }); env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over); }
  }

  function startEndlessGomoku(state) {
    const box = env.qs('#wb-gamebox'), n=15, choice = env.choiceForState('gomoku', state);
    const ENDLESS_STOCK = 30;
    let b = Array.isArray(state?.b) && state.b.length === n*n ? state.b : Array(n*n).fill('');
    let turn = state?.turn || state?.firstMover || 'user';
    let stock = state?.stock || { user:ENDLESS_STOCK, ta:ENDLESS_STOCK };
    let captured = state?.captured || { user:0, ta:0 };
    stock = { user:normalizedStock('user'), ta:normalizedStock('ta') };
    let rounds = state?.rounds || 0, pendingEat = state?.pendingEat || '', over=false, actionBusy=false, highlightLine=[], highlightEat=-1;
    let lastCharMove = Number.isInteger(state?.lastCharMove) ? state.lastCharMove : -1;
    let details = state?.details || { rounds:0, userCaptures:0, charCaptures:0, userRecycles:0, charRecycles:0 };
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-gomoku-panel wb-gomoku-endless-panel"><div class="wb-gomoku-info wb-gomoku-info-endless"><div class="wb-gomoku-stat"><span>轮到</span><b id="wb-gomoku-turn"></b></div><div class="wb-gomoku-stat"><span>余子</span><b id="wb-gomoku-stock"></b></div><div class="wb-gomoku-stat"><span>吃子</span><b id="wb-gomoku-captured"></b></div>' + env.cheatButtonCompactHTML(cheatLeft) + '</div><div class="wb-gomoku">' + b.map((_,i)=>'<button class="wb-gcell" data-i="'+i+'"></button>').join('') + '</div></div>';
    if (!state?.b && state?.firstMover) env.speakFirstMover('gomoku', state.firstMover);
    draw(); save();
    if(turn === 'ta' || pendingEat === 'ta') setTimeout(resumeTaTurn, state?.b ? 260 : 850);
    env.qsa('.wb-gcell', box).forEach(cell => cell.onclick = () => {
      const i=+cell.dataset.i;
      if(env.gamePaused||over||turn!=='user'||actionBusy) return;
      env.markFirstMoverUserAction();
      if(pendingEat === 'user'){ if(b[i] !== 'W') return; pushUndo(); eatAt('user', i); return; }
      if(b[i] || stock.user <= 0) return;
      pushUndo();
      placeAt('user', i);
    });
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    function snapshot(){ return { b:b.slice(), turn, stock:env.cloneCheatState(stock), captured:env.cloneCheatState(captured), rounds, pendingEat, lastCharMove, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||actionBusy||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('gomoku', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ b=s.b; turn=s.turn; stock=s.stock; captured=s.captured; rounds=s.rounds; pendingEat=s.pendingEat; lastCharMove=Number.isInteger(s.lastCharMove) ? s.lastCharMove : -1; details=s.details; }); highlightLine=[]; highlightEat=-1; cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('gomoku', Object.assign({ b, turn, stock, captured, rounds, pendingEat, lastCharMove, details, cheatLeft, cheatAttempted, undoStack }, env.choiceSavePatch('gomoku', choice))); }
    function sideMark(side){ return side === 'user' ? 'B' : 'W'; }
    function other(side){ return side === 'user' ? 'ta' : 'user'; }
    function sideName(side){ return side === 'user' ? '你' : env.displayCharNameForGame('gomoku'); }
    function normalizedStock(side){
      const onBoard = b.filter(v => v === sideMark(side)).length;
      const lost = captured[other(side)] || 0;
      return Math.min(Number(stock[side]) || 0, Math.max(0, ENDLESS_STOCK - onBoard - lost));
    }
    function placeAt(side, i){
      if(stock[side] <= 0 || b[i]) return;
      b[i]=sideMark(side); if(side === 'ta') lastCharMove = i; stock[side]--; rounds++; details.rounds=rounds;
      afterMove(side, i);
    }
    function eatAt(side, i){
      const foe = other(side);
      if(b[i] !== sideMark(foe)) return;
      actionBusy = true;
      highlightEat = i;
      draw();
      setTimeout(() => {
        if(over) return;
        b[i] = sideMark(side);
        if(side === 'ta') lastCharMove = i;
        captured[side]++; details[side === 'user' ? 'userCaptures' : 'charCaptures'] = captured[side];
        env.speak('gomoku', side === 'user' ? 'user_capture' : 'char_capture');
        pendingEat = '';
        highlightEat = -1;
        actionBusy = false;
        afterMove(side, i, true);
      }, 700);
    }
    function afterMove(side, i){
      const line = fiveLine(b, n, sideMark(side), i);
      if(line.length){
        actionBusy = true;
        highlightLine = line.slice();
        draw(); save();
        setTimeout(() => {
          if(over) return;
          line.forEach(p => b[p] = '');
          stock[side] += line.length;
          details[side === 'user' ? 'userRecycles' : 'charRecycles']++;
          highlightLine = [];
          const foeHas = b.some(v => v === sideMark(other(side)));
          if(foeHas){
            pendingEat = side;
            actionBusy = false;
            draw(); save();
            if(side === 'ta') setTimeout(aiEat, 850);
            return;
          }
          actionBusy = false;
          if(checkEnd()) return;
          turn = other(side);
          draw(); save();
          if(turn === 'ta') setTimeout(aiTurn, 850);
        }, 750);
        return;
      }
      if(checkEnd()) return;
      turn = other(side);
      draw(); save();
      if(turn === 'ta') setTimeout(aiTurn, 850);
    }
    function resumeTaTurn(){
      if(env.gamePaused||over||actionBusy) return;
      if(pendingEat === 'ta') { aiEat(); return; }
      if(turn !== 'ta') return;
      const line = fiveLine(b, n, 'W');
      if(line.length) { afterMove('ta', line[0]); return; }
      aiTurn();
    }
    function aiTurn(){
      if(env.gamePaused||over||turn!=='ta'||pendingEat||actionBusy) return;
      const empty = b.map((v,i)=>v?'':i).filter(v=>v!=='');
      if(!empty.length) return;
      const move = bestGomoku(b,n,true);
      placeAt('ta', move >= 0 ? move : empty[Math.floor(Math.random()*empty.length)]);
    }
    function aiEat(){
      if(env.gamePaused||over||pendingEat!=='ta'||actionBusy) return;
      const targets = b.map((v,i)=>v==='B'?i:null).filter(v=>v!==null);
      let best = targets[0];
      for(const i of targets){ const old=b[i]; b[i]='W'; const wins=!!fiveLine(b,n,'W',i).length; b[i]=old; if(wins){ best=i; break; } }
      eatAt('ta', best);
    }
    function checkEnd(){
      const outOfStock = !pendingEat && (stock.user <= 0 || stock.ta <= 0);
      if(!outOfStock) return false;
      over = true;
      let result = 'draw', title = '平局';
      if(captured.user > captured.ta){ result='user_win'; title='你赢了'; env.setScore('gomoku', ((env.scores().gomoku && typeof env.scores().gomoku === 'object' ? env.scores().gomoku.user : env.scores().gomoku) || 0) + 1); env.speak('gomoku','user_win'); }
      else if(captured.ta > captured.user){ result='ta_win'; title='游戏结束'; env.speak('gomoku','user_lose'); }
      else env.speak('gomoku','draw');
      env.clearProgress('gomoku');
      details.gomokuMode = 'endless';
      details.endless = true;
      details.userCaptures = captured.user;
      details.charCaptures = captured.ta;
      env.showGameOver('gomoku', title, '回合数：' + rounds + '，你吃掉' + captured.user + '颗，' + env.displayCharNameForGame('gomoku') + '吃掉' + captured.ta + '颗', result, { rounds, userCaptures:captured.user, taCaptures:captured.ta, gomokuMode:'endless', endless:true, details });
      return true;
    }
    function draw(){
      const charName = env.displayCharNameForGame('gomoku') || 'TA';
      env.qs('#wb-gomoku-turn', box).textContent = pendingEat ? (pendingEat === 'user' ? '你吃子' : charName + '吃子') : (turn === 'user' ? '你' : charName);
      env.qs('#wb-gomoku-stock', box).innerHTML = env.esc(charName) + ' ' + stock.ta + '<br>你 ' + stock.user;
      env.qs('#wb-gomoku-captured', box).innerHTML = env.esc(charName) + ' ' + captured.ta + '<br>你 ' + captured.user;
      env.qsa('.wb-gcell', box).forEach((c,i)=>{ c.className='wb-gcell' + (b[i]==='B'?' black':b[i]==='W'?' white':'') + (i===lastCharMove && b[i]==='W' ? ' char-last' : '') + (pendingEat === 'user' && !actionBusy && b[i] === 'W' ? ' eatable' : '') + (highlightLine.includes(i) ? ' recycle' : '') + (highlightEat === i ? ' eaten' : ''); });
	      env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||actionBusy);
    }
  }

  function bestGomoku(b,n,silent){ bestGomoku.lastSpoke = false; const empty=b.map((v,i)=>v?'':i).filter(v=>v!==''); if(empty.length===n*n){ const c=Math.floor(n/2); return c*n+c; } const win=empty.find(i=>gomokuMoveWins(b,n,i,'W')); if(win!=null) return win; const block=empty.find(i=>gomokuMoveWins(b,n,i,'B')); if(block!=null){ if(!silent){ bestGomoku.lastSpoke = true; env.speak('gomoku','ai_block'); } return block; } let best=-1, bestScore=-1; for(const i of empty){ let score=gomokuMoveScore(b,n,i,'W')*1.12 + gomokuMoveScore(b,n,i,'B')*.96 + gomokuCenterScore(n,i); if(score>bestScore){ bestScore=score; best=i; } } if(bestScore>=180 && !silent){ bestGomoku.lastSpoke = true; env.speak('gomoku','ai_block'); } return best; }

  function gomokuMoveWins(b,n,i,m){ b[i]=m; const ok=winG(b,n,m); b[i]=''; return ok; }

  function gomokuCenterScore(n,i){ const x=i%n,y=Math.floor(i/n), c=(n-1)/2; return Math.max(0, 18 - (Math.abs(x-c)+Math.abs(y-c))*2); }

  function gomokuMoveScore(b,n,i,m){
    const x=i%n,y=Math.floor(i/n), dirs=[[1,0],[0,1],[1,1],[1,-1]];
    let total=0, openThrees=0, fours=0;
    for(const [dx,dy] of dirs){
      let count=1, open=0, gapBoost=0;
      for(const s of [-1,1]){
        let nx=x+dx*s, ny=y+dy*s;
        while(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m){ count++; nx+=dx*s; ny+=dy*s; }
        if(nx>=0&&ny>=0&&nx<n&&ny<n&&!b[ny*n+nx]){
          open++;
          const gx=nx+dx*s, gy=ny+dy*s;
          if(gx>=0&&gy>=0&&gx<n&&gy<n&&b[gy*n+gx]===m) gapBoost++;
        }
      }
      if(count>=4){ fours++; total += open ? 9000 : 2600; }
      else if(count===3&&open===2){ openThrees++; total += 1250; }
      else if(count===3&&open===1) total += 320;
      else if(count===2&&open===2) total += 110;
      else total += Math.pow(5,count) + open*8;
      total += gapBoost * 80;
    }
    if(fours>=2) total += 12000;
    if(openThrees>=2) total += 3600;
    return total;
  }

  function gomokuPattern(b,n,i,m){ const x=i%n,y=Math.floor(i/n), dirs=[[1,0],[0,1],[1,1],[1,-1]]; let best=''; for(const [dx,dy] of dirs){ let count=1, open=0; for(const s of [-1,1]){ let nx=x+dx*s, ny=y+dy*s; while(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m){ count++; nx+=dx*s; ny+=dy*s; } if(nx>=0&&ny>=0&&nx<n&&ny<n&&!b[ny*n+nx]) open++; } if(count>=4&&open===2) return 'user_open_four'; if(count>=4&&open===1) best=best||'user_blocked_four'; else if(count===3&&open===2) best=best||'user_open_three'; } return best; }

  function lineScore(b,n,i,m){ const x=i%n,y=Math.floor(i/n), dirs=[[1,0],[0,1],[1,1],[1,-1]]; let total=0; for(const [dx,dy] of dirs){ let c=1; for(const s of [-1,1]){ let nx=x+dx*s, ny=y+dy*s; while(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m){ c++; nx+=dx*s; ny+=dy*s; } } total += Math.pow(5,c); } return total; }

  function blockRank(b,n,i,m,maxRank){ const x=i%n,y=Math.floor(i/n), dirs=[[1,0],[0,1],[1,1],[1,-1]]; let best=0; for(const [dx,dy] of dirs){ let c=0; for(const s of [-1,1]){ let nx=x+dx*s, ny=y+dy*s; while(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m){ c++; nx+=dx*s; ny+=dy*s; } } best=Math.max(best, c); } return Math.min(maxRank || 4, best); }

  function winG(b,n,m){ for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(b[y*n+x]===m) for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){ let c=0; for(let k=0;k<5;k++){ const nx=x+dx*k, ny=y+dy*k; if(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m) c++; } if(c===5) return true; } return false; }

  function fiveLine(b,n,m,last){
    const dirs=[[1,0],[0,1],[1,1],[1,-1]], points = Number.isInteger(last) ? [last] : b.map((v,i)=>v===m?i:null).filter(v=>v!==null);
    for(const i of points){
      const x=i%n,y=Math.floor(i/n);
      for(const [dx,dy] of dirs){
        const line=[i];
        for(const s of [-1,1]){
          let nx=x+dx*s, ny=y+dy*s;
          while(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m){ line.push(ny*n+nx); nx+=dx*s; ny+=dy*s; }
        }
        if(line.length>=5) return line.slice(0,5);
      }
    }
    return [];
  }
  startGomoku(state);
  return env.activeGameController || null;
}
