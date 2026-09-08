// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'connect4d';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","cheatButtonHTML","clearProgress","cloneCheatState","displayCharName","gamePaused","getHostDocument","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startConnect4D(state) {
    const box=env.qs('#wb-gamebox'), S=7, dirs=[[1,0],[0,1],[1,1],[1,-1]];
    const role = env.displayCharName();
    let grid=Array.isArray(state?.grid)?state.grid.slice():Array(S*S).fill(''), turn=state?.turn||(state?.firstMover==='ta'?'ta':'user'), over=false, dropping=null, aimCol=-1, aimX=0;
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0);
    let details = state?.details || { rounds:0, userBlocks:{2:0,3:0,4:0}, charBlocks:{2:0,3:0,4:0} };
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML='<div class="wb-c4d-panel"><div class="wb-c4d-info" id="wb-c4d-info"><span id="wb-c4d-text"></span>' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-c4d-mask"><div class="wb-c4d-stage" id="wb-c4d-stage"><div class="wb-c4d-drop-line"></div><div class="wb-c4d" id="wb-c4d-board"></div></div></div></div>';
    if(!state?.turn&&state?.firstMover) env.speakFirstMover('connect4d', state.firstMover); draw(); save(); if(turn==='ta') setTimeout(ai,700);
    function id(x,y){return y*S+x;} function inside(x,y){return x>=0&&y>=0&&x<S&&y<S;}
    function landingRow(x){ for(let y=S-1;y>=0;y--) if(!grid[id(x,y)]) return y; return -1; }
    function legal(){ const a=[]; for(let x=0;x<S;x++) if(landingRow(x)>=0) a.push(x); return a; }
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    function snapshot(){ return { grid:grid.slice(), turn, taMoves, nextCharLineAt, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||dropping||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('connect4d', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ grid=s.grid; turn=s.turn; taMoves=s.taMoves; nextCharLineAt=s.nextCharLineAt; details=s.details; }); aimCol=-1; cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('connect4d',{grid,turn,taMoves,nextCharLineAt,details,cheatLeft,cheatAttempted,undoStack}); }
    function shouldCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ nextCharLineAt = env.nextCharLineTurn(taMoves); return true; } return false; }
    function winner(side){ for(let y=0;y<S;y++) for(let x=0;x<S;x++) if(grid[id(x,y)]===side){ for(const d of dirs){ let ok=true; for(let k=1;k<4;k++){ const nx=x+d[0]*k,ny=y+d[1]*k; if(!inside(nx,ny)||grid[id(nx,ny)]!==side){ ok=false; break; } } if(ok) return true; } } return false; }
    function place(side,x,aimPct,skipLine){ const y=landingRow(x); if(y<0||over||env.gamePaused||dropping) return; if(side==='user'){ pushUndo(); env.markFirstMoverUserAction(); } const br=blockRank(grid,S,id(x,y),side==='user'?'ta':'user',4); if(br>=2){ const bucket=side==='user'?details.userBlocks:details.charBlocks; bucket[br]=(bucket[br]||0)+1; } aimCol=-1; dropping={x,y,side,t:0,aimX:aimPct}; const charNext = side === 'ta' ? shouldCharNext() : false; animateDrop(()=>{ grid[id(x,y)]=side; dropping=null; const rounds=grid.filter(Boolean).length; details.rounds=rounds; if(winner(side)){ over=true; env.clearProgress('connect4d'); const res=side==='user'?'user_win':'ta_win'; if(res==='user_win'){ const cur=env.scores().connect4d; env.setScore('connect4d',((cur&&typeof cur==='object'?cur.user:cur)||0)+1); env.speak('connect4d','user_win'); } else { env.addTaWin('connect4d'); env.speak('connect4d','user_lose'); } env.showGameOver('connect4d',res==='user_win'?'你赢了':'游戏结束','本局：'+(res==='user_win'?'你连成四子':role+'连成四子')+'，回合数：'+rounds,res,{details}); return; } if(!legal().length){ over=true; env.clearProgress('connect4d'); env.speak('connect4d','draw'); env.showGameOver('connect4d','平局','棋盘填满，回合数：'+rounds,'draw',{details}); return; } if(side==='ta' && charNext && !skipLine) env.speak('connect4d','char_next'); turn=side==='user'?'ta':'user'; draw(); save(); if(turn==='ta') setTimeout(ai,700); }); }
    function animateDrop(done){ let n=0; const step=()=>{ n++; if(dropping) dropping.t=n/16; draw(); if(n<16) setTimeout(step,24); else done(); }; step(); }
    function supportedEmpty(x,y){ return inside(x,y) && !grid[id(x,y)] && landingRow(x) === y; }
    function lineScore(side,x,y){
      let best=0;
      dirs.forEach(d=>{
        let count=1, open=0, supported=0;
        [[d[0],d[1]],[-d[0],-d[1]]].forEach(v=>{
          let nx=x+v[0], ny=y+v[1];
          while(inside(nx,ny)&&grid[id(nx,ny)]===side){ count++; nx+=v[0]; ny+=v[1]; }
          if(inside(nx,ny)&&!grid[id(nx,ny)]){ open++; if(supportedEmpty(nx,ny)) supported++; }
        });
        const liveTwo=count>=2&&open>=2, deadOne=count>=1&&open===1;
        best=Math.max(best, count*count*18 + open*10 + supported*26 + (liveTwo?42:0) + (deadOne?8:0));
      });
      return best;
    }
    function immediateWins(side){
      return legal().filter(x=>{ const y=landingRow(x); grid[id(x,y)]=side; const ok=winner(side); grid[id(x,y)]=''; return ok; });
    }
    function createsNextThreat(side,x){
      const y=landingRow(x); if(y<0) return 0;
      grid[id(x,y)]=side;
      const wins=immediateWins(side).length;
      grid[id(x,y)]='';
      return wins;
    }
    function countSupportedWindows(side){
      let score=0, other=side==='user'?'ta':'user';
      for(let y=0;y<S;y++) for(let x=0;x<S;x++) dirs.forEach(d=>{
        const cells=[]; for(let k=0;k<4;k++){ const nx=x+d[0]*k, ny=y+d[1]*k; if(!inside(nx,ny)) return; cells.push([nx,ny]); }
        let mine=0, opp=0, empty=0, support=0;
        cells.forEach(([cx,cy])=>{ const v=grid[id(cx,cy)]; if(v===side) mine++; else if(v===other) opp++; else { empty++; if(supportedEmpty(cx,cy)) support++; } });
        if(opp) return;
        if(mine===3&&support) score+=520;
        else if(mine===2&&empty===2) score+=support ? 105 : 44;
        else if(mine===1&&empty===3&&support) score+=16;
      });
      return score;
    }
    function evaluateMove(x,side){
      const y=landingRow(x);
      if(y<0) return -1e9;
      grid[id(x,y)]=side;
      const win=winner(side);
      const own=lineScore(side,x,y), other=side==='user'?'ta':'user';
      const center=((S-1)/2-Math.abs(x-(S-1)/2))*18;
      const edgePenalty=(x===0||x===S-1)?22:(x===1||x===S-2?8:0);
      const futureThreats=immediateWins(side).length;
      const enemyThreats=immediateWins(other).length;
      const forkScore=Math.max(0, futureThreats-1)*680 + futureThreats*180;
      const windowScore=countSupportedWindows(side);
      const blockValue=countSupportedWindows(other)*.72;
      grid[id(x,y)]='';
      return (win?100000:0) + own + center + forkScore + windowScore + blockValue - enemyThreats*920 - edgePenalty;
    }
    function ai(){
      const m=legal(); if(!m.length) return;
      const userWins=immediateWins('user');
      if(userWins.length){ const blockTalk = Math.random()<.5; if(blockTalk) env.speak('connect4d','ai_block'); place('ta', userWins[0], null, blockTalk); return; }
      const taWins=immediateWins('ta');
      if(taWins.length){ place('ta', taWins[0]); return; }
      const userThreats=m.map(x=>({x, n:createsNextThreat('user',x)})).filter(o=>o.n>0).sort((a,b)=>b.n-a.n);
      if(userThreats.length){ const blockTalk = Math.random()<.5; if(blockTalk) env.speak('connect4d','ai_block'); place('ta', userThreats[0].x, null, blockTalk); return; }
      const taThreats=m.map(x=>({x, n:createsNextThreat('ta',x)})).filter(o=>o.n>0).sort((a,b)=>b.n-a.n);
      if(taThreats.length){ place('ta', taThreats[0].x); return; }
      const scored=m.map(x=>({x, s:evaluateMove(x,'ta')})).sort((a,b)=>b.s-a.s);
      place('ta', scored[0].x);
    }
    function draw(){
      env.qs('#wb-score').textContent=turn==='user'?'你的回合':role+'的回合';
      const info = env.qs('#wb-c4d-text', box);
      if(info) info.textContent='';
	      env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||dropping);
      const html=[];
      for(let y=0;y<S;y++) for(let x=0;x<S;x++){
        const v=grid[id(x,y)], full=landingRow(x)<0, active=(dropping&&dropping.x===x)||aimCol===x;
        html.push('<button class="wb-c4d-cell '+(v||'')+(full?' full':'')+(active?' aim':'')+'" data-x="'+x+'" '+(turn!=='user'||full||dropping?'disabled':'')+'>'+(v?'<span class="wb-c4d-disc '+v+'"></span>':'')+'</button>');
      }
      const board=env.qs('#wb-c4d-board');
      board.innerHTML=html.join('');
      const stage=env.qs('#wb-c4d-stage');
      if(stage){
        const old=env.qs('.wb-c4d-falling', stage); if(old) old.remove();
        if(aimCol>=0 && turn==='user' && !dropping){
          const piece=env.getHostDocument().createElement('span');
          piece.className='wb-c4d-falling user aim-piece';
          piece.style.left='calc('+aimX+'% - 13px)';
          piece.style.top='calc(8% - 13px)';
          stage.appendChild(piece);
        } else if(dropping){
          const t=Math.max(0,Math.min(1,dropping.t||0)), left=dropping.aimX ?? ((dropping.x+.5)*(100/S));
          const boardTop=12, boardHeight=83, cell=boardHeight/S, startTop=8, targetTop=boardTop+(dropping.y+.5)*cell, topPct=startTop+t*(targetTop-startTop);
          const piece=env.getHostDocument().createElement('span');
          piece.className='wb-c4d-falling '+dropping.side;
          piece.style.left='calc('+left+'% - 13px)';
          piece.style.top='calc('+topPct+'% - 13px)';
          stage.appendChild(piece);
        }
      }
      const eventAim=e=>{ const r=board.getBoundingClientRect(); const pct=Math.max(0,Math.min(100,(e.clientX-r.left)/Math.max(1,r.width)*100)); return { pct, col:Math.max(0,Math.min(S-1,Math.floor(pct/100*S))) }; };
      board.onpointerdown=e=>{ if(turn!=='user'||env.gamePaused||dropping) return; const a=eventAim(e); aimCol=a.col; aimX=a.pct; board.setPointerCapture?.(e.pointerId); draw(); e.preventDefault(); };
      board.onpointermove=e=>{ if(turn!=='user'||env.gamePaused||dropping||aimCol<0) return; const a=eventAim(e); aimCol=a.col; aimX=a.pct; draw(); e.preventDefault(); };
      board.onpointerup=e=>{ if(turn!=='user'||dropping) return; const a=aimCol>=0?{ col:aimCol, pct:aimX }:eventAim(e); aimCol=-1; board.releasePointerCapture?.(e.pointerId); draw(); place('user',a.col,a.pct); e.preventDefault(); };
      board.onpointercancel=()=>{ if(aimCol>=0){ aimCol=-1; draw(); } };
    }
  }

  function blockRank(b,n,i,m,maxRank){ const x=i%n,y=Math.floor(i/n), dirs=[[1,0],[0,1],[1,1],[1,-1]]; let best=0; for(const [dx,dy] of dirs){ let c=0; for(const s of [-1,1]){ let nx=x+dx*s, ny=y+dy*s; while(nx>=0&&ny>=0&&nx<n&&ny<n&&b[ny*n+nx]===m){ c++; nx+=dx*s; ny+=dy*s; } } best=Math.max(best, c); } return Math.min(maxRank || 4, best); }
  startConnect4D(state);
  return env.activeGameController || null;
}
