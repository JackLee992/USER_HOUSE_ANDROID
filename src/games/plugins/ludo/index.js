// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'ludo';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","cheatAttemptResult","cheatButtonHTML","clearProgress","cloneCheatState","displayCharName","gameActiveStartedAt","gamePaused","getHostDocument","hideGamePauseOverlay","pushCheatUndo","qs","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toast","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startLudo(state) {
    const box = env.qs('#wb-gamebox');
    const path = [[5,10],[4,10],[3,10],[2,10],[1,10],[0,10],[0,9],[0,8],[0,7],[0,6],[0,5],[0,4],[0,3],[0,2],[0,1],[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8],[10,9],[10,10],[9,10],[8,10],[7,10],[6,10]];
    const starts = { red:[[1,7],[1,9],[3,7],[3,9]], blue:[[7,1],[9,1],[7,3],[9,3]] };
    const finish = { red:[[5,9],[5,8],[5,7],[5,6]], blue:[[5,1],[5,2],[5,3],[5,4]] };
    const offset = { red:0, blue:20 };
    const FINAL_POS = 43;
    const ludoFlights = [{ from:11, to:19, line:true }, { from:21, to:29, line:false }];
    const ludoFlightMap = new Map(ludoFlights.map(f => [f.from, f.to]));
    let red = Array.isArray(state?.red) ? state.red.map(v => Number.isFinite(Number(v)) ? Number(v) : -1) : [-1,-1,-1,-1];
    let blue = Array.isArray(state?.blue) ? state.blue.map(v => Number.isFinite(Number(v)) ? Number(v) : -1) : [-1,-1,-1,-1];
    let turn = state?.turn || (state?.firstMover === 'ta' ? 'blue' : 'red'), dice = state?.dice || 0, rolled = !!state?.rolled, busy=false, over=false, redSixStreak = state?.redSixStreak || 0, blueSixStreak = state?.blueSixStreak || 0, turnCount = state?.turnCount || 0, diceRolling=false, diceRollingSide='', diceTimer=null, diceAutoTimer=null, diceStopper=null, diceFace=dice || 1;
	    let details = state?.details || { userCaptures:0, charCaptures:0, userMaxSixStreak:redSixStreak || 0, charMaxSixStreak:blueSixStreak || 0, loserHangar:0, loserOnBoard:0 };
    details.userFlights = Number(details.userFlights || 0);
    details.charFlights = Number(details.charFlights || 0);
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-ludo-panel"><div class="wb-ludo-info"><span class="wb-pill" id="wb-ludo-turn"></span><span class="wb-ludo-dice" id="wb-ludo-dice"></span><button class="wb-btn primary" id="wb-ludo-roll">掷骰</button>' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-ludo" id="wb-ludo-board"></div></div>';
    env.setScore('ludo', 0); draw(); save();
    if (!state?.turn && state?.firstMover) env.speakFirstMover('ludo', state.firstMover);
    env.qs('#wb-ludo-roll').onclick = () => { if(diceRolling && diceRollingSide==='red' && diceStopper) { diceStopper(true); return; } if(turn==='red' && !rolled && !busy && !env.gamePaused) rollRed(); };
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    if (red.every(p=>Number(p)>=FINAL_POS)) setTimeout(()=>checkWin('red'), 0);
    else if (blue.every(p=>Number(p)>=FINAL_POS)) setTimeout(()=>checkWin('blue'), 0);
    else if (turn === 'blue' && !rolled) setTimeout(robot, 650);
    function snapshot(){ return { red:red.slice(), blue:blue.slice(), turn, dice, rolled, redSixStreak, blueSixStreak, turnCount, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||diceRolling||busy||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('ludo', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ red=s.red; blue=s.blue; turn=s.turn; dice=s.dice; rolled=s.rolled; redSixStreak=s.redSixStreak; blueSixStreak=s.blueSixStreak; turnCount=s.turnCount; details=s.details; }); cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('ludo', { red, blue, turn, dice, rolled, redSixStreak, blueSixStreak, turnCount, details, cheatLeft, cheatAttempted, undoStack }); }
    function roll(){ return 1 + Math.floor(Math.random()*6); }
    function diceDotsHTML(v){
      const dots = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] }[v] || [];
      return Array.from({length:9},(_,i)=>dots.includes(i)?'<span class="wb-ludo-dot"></span>':'<span></span>').join('');
    }
    function setDiceDisplay(v, rolling){ const d=env.qs('#wb-ludo-dice'); if(d){ d.innerHTML=v ? diceDotsHTML(v) : ''; d.classList.toggle('rolling', !!rolling); d.classList.toggle('one', v===1); } }
    function animateDice(side, autoMs, done){
      if(diceRolling) return;
      diceRolling = true;
      diceRollingSide = side || '';
      busy = true;
      const finalDice = roll();
      diceFace = dice || 1;
      setDiceDisplay(diceFace, true);
      draw();
      diceTimer = setInterval(()=>{ diceFace = diceFace % 6 + 1; setDiceDisplay(diceFace, true); }, 70);
      const stop = manual => {
        if(!diceRolling) return;
        clearInterval(diceTimer);
        clearTimeout(diceAutoTimer);
        diceTimer = null;
        diceAutoTimer = null;
        diceRolling = false;
        diceRollingSide = '';
        diceStopper = null;
        dice = manual && side === 'red' ? (diceFace || finalDice) : finalDice;
        setDiceDisplay(dice, false);
        done(dice);
      };
      diceStopper = stop;
      diceAutoTimer = setTimeout(()=>stop(false), Math.max(300, autoMs || 1200));
    }
    function legal(arr,d){ const n = Number(d) || 0; return arr.map((p,i)=> canMove(Number(p),n) ? i : -1).filter(i=>i>=0); }
    function canMove(pos,d){ if(pos<0) return d===6; return pos+d<=FINAL_POS; }
    function nextPos(pos,d){ return Number(pos)<0 ? 0 : Math.min(FINAL_POS, Number(pos)+Number(d)); }
    function flightTarget(pos){ return ludoFlightMap.get(Number(pos)); }
    function resolveFlight(pos){ const target = flightTarget(pos); return target == null ? pos : target; }
    function announceFlight(side){
      if (side === 'red') details.userFlights = Number(details.userFlights || 0) + 1;
      else details.charFlights = Number(details.charFlights || 0) + 1;
      env.toast('呜呼！');
      env.speak('ludo', side === 'red' ? 'user_flight' : 'char_flight');
    }
    function rollRed(){ pushUndo(); animateDice('red', 1200, value=>{ turnCount++; dice = Math.max(1, Math.min(6, Number(value) || 1)); rolled=true; busy=false; redSixStreak = dice===6 ? redSixStreak + 1 : 0; blueSixStreak = 0; details.userMaxSixStreak = Math.max(details.userMaxSixStreak || 0, redSixStreak); if(dice===6) env.speak('ludo','roll_6'); const moves=legal(red,dice); draw(); if(!moves.length) { env.speak('ludo','no_move'); env.toast(dice===6?'没有可移动棋子':'需要掷到6才能让停机坪棋子起飞'); setTimeout(endTurn,650); } else if(dice===6 && red.some(p=>Number(p)<0)) env.toast('掷到6了，点击一枚棋子起飞'); save(); }); }
    function moveRed(i){
      const moves=legal(red,dice);
      if(turn!=='red'||!rolled||!moves.includes(i)) return;
      if(env.gamePaused){ env.gamePaused=false; env.gameActiveStartedAt = Date.now(); env.hideGamePauseOverlay(); }
      if(busy && !diceRolling) busy=false;
      if(busy) return;
      pushUndo();
      const wasHome=Number(red[i])<0;
      const landed=nextPos(red[i],dice);
      const target=flightTarget(landed);
      red[i]=landed;
      if(wasHome) env.speak('ludo','user_takeoff');
      if(target!=null){ busy=true; draw(); announceFlight('red'); setTimeout(()=>{ if(over) return; red[i]=target; busy=false; afterMove('red'); },520); return; }
      afterMove('red');
    }
    function robot(){ if(over||env.gamePaused) return; animateDice('blue', 900, value=>{ turnCount++; rolled=true; busy=true; blueSixStreak = value===6 ? blueSixStreak + 1 : 0; redSixStreak = 0; details.charMaxSixStreak = Math.max(details.charMaxSixStreak || 0, blueSixStreak); draw(); setTimeout(()=>{ const moves=legal(blue,value); if(moves.length){ const i=chooseRobot(moves, value); const wasHome=blue[i]<0; const landed=nextPos(blue[i],value); const target=flightTarget(landed); blue[i]=landed; if(wasHome) env.speak('ludo','char_takeoff'); if(target!=null){ draw(); announceFlight('blue'); setTimeout(()=>{ if(over) return; blue[i]=target; afterMove('blue'); },520); return; } afterMove('blue'); } else endTurn(); },450); }); }
    function globalPos(side,pos){ return pos>=0 && pos<40 ? (offset[side] + pos) % 40 : -1; }
    function canCaptureGlobal(side, arr, targetGp){
      return targetGp >= 0 && arr.some(pos => {
        for (let d=1; d<=6; d++) if (canMove(Number(pos), d) && globalPos(side, resolveFlight(nextPos(Number(pos), d))) === targetGp) return true;
        return false;
      });
    }
    function ludoThreat(side, pos){
      const gp = globalPos(side, pos);
      if (gp < 0) return false;
      return side === 'blue' ? canCaptureGlobal('red', red, gp) : canCaptureGlobal('blue', blue, gp);
    }
    function chooseRobot(moves, rollValue){
      const n = Number(rollValue || dice) || 0;
      const takeoff = n === 6 ? moves.filter(i => Number(blue[i]) < 0) : [];
      if (takeoff.length) return takeoff[Math.floor(Math.random() * takeoff.length)];
      const active = blue.map(Number).filter(p => p >= 0 && p < FINAL_POS);
      const front = active.length ? Math.max(...active) : 0;
      const scored = moves.map(i => {
        const from = Number(blue[i]);
        const landed = nextPos(from, n);
        const to = resolveFlight(landed);
        const gp = globalPos('blue', to);
        let s = to * 8 + Math.random();
        if (to >= FINAL_POS) s += 5000;
        if (to !== landed) s += 1600;
        if (gp >= 0 && red.some(r => globalPos('red', r) === gp)) s += 2400;
        if (from >= 0 && ludoThreat('blue', from) && !ludoThreat('blue', to)) s += 750;
        if (to >= 38 && to < FINAL_POS) s += 700 + (to - 38) * 80;
        if (from >= 0 && from < front - 8) s += Math.min(900, (front - from) * 42);
        if (gp >= 0 && ludoThreat('blue', to)) s -= 420;
        if (blue.some((p, idx) => idx !== i && Number(p) === to)) s -= 180;
        return { i, s };
      }).sort((a,b) => b.s - a.s);
      const top = scored.filter(x => x.s >= scored[0].s - 160);
      return top[Math.floor(Math.random() * top.length)].i;
    }
    function sideArr(side){ return side === 'red' ? red : blue; }
    function afterMove(side){ capture(side); if(sideArr(side).some(p=>p>=40&&p<FINAL_POS)) env.speak('ludo','near_finish'); draw(); save(); if(checkWin(side)) return; if(dice===6){ turn=side; rolled=false; busy=false; if(side==='blue') setTimeout(robot,650); else draw(); save(); } else endTurn(); }
    function capture(side){ const otherSide=side==='red'?'blue':'red', mine=sideArr(side), other=sideArr(otherSide); mine.forEach(p=>{ const gp=globalPos(side,p); if(gp<0) return; other.forEach((q,i)=>{ if(globalPos(otherSide,q)===gp){ other[i]=-1; if(side==='red') details.userCaptures++; else details.charCaptures++; env.speak('ludo', side==='red' ? 'user_capture' : 'char_capture'); } }); }); }
    function checkWin(side){ const arr=sideArr(side); if(arr.every(p=>Number(p)>=FINAL_POS)){ over=true; env.clearProgress('ludo'); const loser=side==='red'?blue:red; details.loserHangar = loser.filter(p=>Number(p)<0).length; details.loserOnBoard = loser.filter(p=>Number(p)>=0 && Number(p)<FINAL_POS).length; const meta = { consecutiveSixes:redSixStreak, userHomeAll:red.every(p=>p<0), opponentOnePieceLeft: side==='red' ? blue.filter(p=>Number(p)>=FINAL_POS).length>=3 : red.filter(p=>Number(p)>=FINAL_POS).length>=3, userFlights:details.userFlights || 0, charFlights:details.charFlights || 0, details }; if(side==='red'){ { const curScore = env.scores().ludo; env.setScore('ludo', ((curScore && typeof curScore === 'object' ? curScore.user : curScore) || 0) + 1); } env.speak('ludo','user_win'); env.showGameOver('ludo','你赢了','本局分数：1胜，回合数：'+turnCount, null, meta); } else { env.speak('ludo','user_lose'); env.showGameOver('ludo','游戏结束','本局分数：0胜（TA获胜），回合数：'+turnCount, null, meta); } return true; } return false; }
    function endTurn(){ turn=turn==='red'?'blue':'red'; rolled=false; dice=0; busy=false; draw(); save(); if(turn==='blue') setTimeout(robot,650); }
    function posCoord(side,pos,idx){ if(pos<0) return starts[side][idx]; if(pos>=40) { const f=Math.min(3,pos-40); return finish[side][f] || [5,5]; } return path[globalPos(side,pos)]; }
    function flightCellClass(x,y){ const classes=[]; ['red','blue'].forEach(side=>{ ludoFlights.forEach(f=>{ const a=posCoord(side,f.from,0), b=posCoord(side,f.to,0); if((a[0]===x&&a[1]===y)||(b[0]===x&&b[1]===y)) classes.push(' flight-'+side); }); }); return classes.join(''); }
    function flightCornerPoints(from,to){
      const dx = to[0] - from[0], dy = to[1] - from[1];
      return {
        x1: from[0] + (dx > 0 ? 1 : 0),
        y1: from[1] + (dy > 0 ? 1 : 0),
        x2: to[0] + (dx > 0 ? 0 : 1),
        y2: to[1] + (dy > 0 ? 0 : 1)
      };
    }
    function flightLayerHTML(){ const parts=[]; ['red','blue'].forEach(side=>{ ludoFlights.filter(f=>f.line).forEach(f=>{ const a=posCoord(side,f.from,0), b=posCoord(side,f.to,0), p=flightCornerPoints(a,b); parts.push('<line class="wb-ludo-flight-line '+side+'" x1="'+p.x1+'" y1="'+p.y1+'" x2="'+p.x2+'" y2="'+p.y2+'"></line>'); }); }); return '<svg class="wb-ludo-flight-layer" viewBox="0 0 11 11" preserveAspectRatio="none" aria-hidden="true">'+parts.join('')+'</svg>'; }
	    function draw(){ const board=env.qs('#wb-ludo-board'); const cells=[]; const charLabel=env.displayCharName(); for(let y=0;y<11;y++) for(let x=0;x<11;x++){ let cls='wb-ludo-cell'; if(path.some(p=>p[0]===x&&p[1]===y)) cls+=' path'; if(starts.red.some(p=>p[0]===x&&p[1]===y)||finish.red.some(p=>p[0]===x&&p[1]===y)) cls+=' home-red'; if(starts.blue.some(p=>p[0]===x&&p[1]===y)||finish.blue.some(p=>p[0]===x&&p[1]===y)) cls+=' home-blue'; cls+=flightCellClass(x,y); cells.push('<div class="'+cls+'" data-x="'+x+'" data-y="'+y+'"></div>'); } board.innerHTML=cells.join('')+flightLayerHTML(); addPieces('red',red); addPieces('blue',blue); const t=env.qs('#wb-ludo-turn'); if(t) t.textContent=turn==='red'?'你的回合':charLabel+'的回合'; setDiceDisplay(dice, diceRolling); env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||diceRolling||busy); const rb=env.qs('#wb-ludo-roll'); if(rb){ const userRolling=diceRolling&&diceRollingSide==='red'; const charRolling=diceRolling&&diceRollingSide==='blue'; rb.disabled=env.gamePaused || charRolling || (turn!=='red' && !userRolling) || (rolled && !userRolling) || (busy && !userRolling); rb.textContent=userRolling ? '停止' : (charRolling ? charLabel + '掷骰中' : '掷骰'); } }
    function addPieces(side,arr){ const moves=side==='red'&&turn==='red'&&rolled ? legal(red,dice) : []; arr.forEach((p,i)=>{ const xy=posCoord(side,p,i); const cell=env.qs('.wb-ludo-cell[data-x="'+xy[0]+'"][data-y="'+xy[1]+'"]'); if(!cell) return; const b=env.getHostDocument().createElement('button'); b.type='button'; const can=moves.includes(i); b.className='wb-ludo-piece '+(side==='red'?'red':'blue')+(can?' can':''); b.disabled=side!=='red'||!can; b.textContent=i+1; let tapped=false; const tap=e=>{ e.preventDefault(); if(tapped) return; tapped=true; moveRed(i); setTimeout(()=>{ tapped=false; }, 260); }; b.onclick=tap; b.onpointerup=tap; cell.appendChild(b); }); }
  }
  startLudo(state);
  return env.activeGameController || null;
}
