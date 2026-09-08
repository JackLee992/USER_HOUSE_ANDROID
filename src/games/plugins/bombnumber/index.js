// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'bombnumber';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","cheatButtonHTML","clearProgress","cloneCheatState","displayCharName","esc","gamePaused","markFirstMoverUserAction","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startBombNumber(state) {
    const box=env.qs('#wb-gamebox'); let bomb=state?.bomb||Math.floor(Math.random()*100)+1, low=state?.low||1, high=state?.high||100, turn=state?.turn||(state?.firstMover==='ta'?'ta':'user'), log=Array.isArray(state?.log)?state.log:[], over=false, busy=false, chosen=null, exploding=0, luckyShrink=!!state?.luckyShrink, userDoomed=!!state?.userDoomed, charDoomed=!!state?.charDoomed, turnCount=state?.turnCount||0;
    let details = state?.details || { picks:[], finalDoomed:false };
    const role = env.displayCharName();
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML='<div class="wb-bomb-panel"><div class="wb-bomb-info" id="wb-bomb-info"><span id="wb-bomb-text"></span>' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-bomb-grid" id="wb-bomb-grid"></div><div class="wb-bomb-log" id="wb-bomb-log"></div></div>';
    if(!state?.turn&&state?.firstMover) env.speakFirstMover('bombnumber', state.firstMover); draw(); save(); if(turn==='ta') setTimeout(aiThink,900);
    function choices(){ return Array.from({length:100},(_,i)=>i+1).filter(n=>n>=low&&n<=high); }
    function rangeEvent(){ const len=choices().length; if(len===1) return 'doomed'; if(len>=80) return 'range_100_80'; if(len>=60) return 'range_80_60'; if(len>=40) return 'range_60_40'; if(len>=20) return 'range_40_20'; return 'range_20_0'; }
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    function snapshot(){ return { low, high, turn, log:log.slice(), luckyShrink, userDoomed, charDoomed, turnCount, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||busy||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('bombnumber', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ low=s.low; high=s.high; turn=s.turn; log=s.log; luckyShrink=s.luckyShrink; userDoomed=s.userDoomed; charDoomed=s.charDoomed; turnCount=s.turnCount; details=s.details; }); chosen=null; exploding=0; cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('bombnumber',{bomb,low,high,turn,log,luckyShrink,userDoomed,charDoomed,turnCount,details,cheatLeft,cheatAttempted,undoStack}); }
    function pick(side,n){ if(over||busy||n<low||n>high) return; if(side==='user'){ pushUndo(); env.markFirstMoverUserAction(); } const before=choices().length; busy=true; turnCount++; chosen={side,n}; log.unshift((side==='user'?'你':role)+'选择了 '+n); draw(); setTimeout(()=>resolvePick(side,n,before),680); }
    function resolvePick(side,n,before){
      if(over) return;
      if(n===bomb){
        details.picks.push({ side, n, low, high, remaining:0 });
        exploding=n; chosen=null; draw();
        setTimeout(()=>{
          over=true; busy=false; env.clearProgress('bombnumber');
          const res=side==='user'?'ta_win':'user_win';
          if(res==='user_win'){ const cur=env.scores().bombnumber; env.setScore('bombnumber',((cur&&typeof cur==='object'?cur.user:cur)||0)+1); env.speak('bombnumber','user_win'); }
          else { env.addTaWin('bombnumber'); env.speak('bombnumber','user_lose'); }
          details.finalDoomed = userDoomed || charDoomed || choices().length === 1;
          env.showGameOver('bombnumber',res==='user_win'?'你赢了':'游戏结束','炸弹数字：'+bomb+'，回合数：'+turnCount,res,{badLuck:side==='user'&&before>=80,luckyShrink,charDoomed,userDoomed,details});
        }, 900);
        return;
      }
      if(n<bomb) low=n+1; else high=n-1;
      if(side==='user' && before-choices().length>=50) luckyShrink=true;
      if(choices().length===1){ if(side==='user') charDoomed=true; else userDoomed=true; }
      details.picks.push({ side, n, low, high, remaining:choices().length });
      if(choices().length===1) details.finalDoomed = true;
      env.speak('bombnumber', rangeEvent());
      turn=side==='user'?'ta':'user'; chosen=null; busy=false; draw(); save();
      if(turn==='ta') setTimeout(aiThink, 500 + Math.random() * 500);
    }
    function aiThink(){ if(over||env.gamePaused||turn!=='ta'||busy) return; const arr=choices(); const n=arr[Math.floor(arr.length/2 + (Math.random()-.5)*Math.max(1,arr.length/3))]||arr[0]; pick('ta', n); }
	    function draw(){ const len=choices().length; env.qs('#wb-score').textContent='范围：'+low+'-'+high; const info=env.qs('#wb-bomb-text', box); if(info) info.textContent=(turn==='user'?'你的回合':role+(busy?'正在判断':'的回合'))+' · 可选 '+len+' 个'; env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||busy); env.qs('#wb-bomb-grid').innerHTML=Array.from({length:100},(_,i)=>{ const n=i+1, ok=n>=low&&n<=high, isChosen=chosen&&chosen.n===n, isBoom=exploding===n; return '<button class="wb-bomb-cell '+(ok?'ok':'off')+(isChosen?' chosen':'')+(isBoom?' boom':'')+'" data-n="'+n+'" '+(!ok||turn!=='user'||busy?'disabled':'')+'>'+(isBoom?'💣':n)+'</button>'; }).join(''); env.qs('#wb-bomb-log').innerHTML=log.slice(0,6).map(env.esc).join('<br>'); env.qsa('.wb-bomb-cell.ok',box).forEach(b=>b.onclick=()=>pick('user',+b.dataset.n)); }
  }
  startBombNumber(state);
  return env.activeGameController || null;
}
