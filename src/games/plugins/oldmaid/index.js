import { gameSpriteHTML } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'oldmaid';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","OLDMAID_CARD_URL","addTaWin","cheatAttemptResult","cheatButtonHTML","clearProgress","cloneCheatState","currentGame","displayCharName","esc","gamePaused","markFirstMoverUserAction","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","shuffleArray","speak","speakFirstMover","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startOldMaid(state) {
    const box = env.qs('#wb-gamebox');
    const role = env.displayCharName();
    let userHand = Array.isArray(state?.userHand) ? state.userHand : null;
    let taHand = Array.isArray(state?.taHand) ? state.taHand : null;
    let turn = state?.turn || (state?.firstMover === 'ta' ? 'ta' : 'user'), phase = state?.phase || (state?.firstMover === 'ta' ? 'ta_thinking' : 'user_pick'), busy = false, over = false;
    let pending = state?.pending || null, userTurns = state?.userTurns || 0, taTurns = state?.taTurns || 0;
    let details = state?.details || { jokerOwners:[] };
    const log = Array.isArray(state?.log) ? state.log.slice(0, 6) : [];
    if (!userHand || !taHand) deal();
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-oldmaid"><div class="wb-oldmaid-status"><span id="wb-oldmaid-status"></span>' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-oldmaid-reveal" id="wb-oldmaid-reveal"></div><div class="wb-oldmaid-zone"><div class="wb-muted">' + env.esc(role) + '的手牌</div><div class="wb-oldmaid-hand backs" id="wb-oldmaid-ta"></div></div><div class="wb-oldmaid-zone"><div class="wb-muted">你的手牌</div><div class="wb-oldmaid-hand" id="wb-oldmaid-user"></div></div><div class="wb-oldmaid-log" id="wb-oldmaid-log"></div></div>';
    if (!state?.turn && state?.firstMover) env.speakFirstMover('oldmaid', state.firstMover); draw(); save();
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    if (turn === 'ta' && phase === 'ta_thinking') { busy = true; setTimeout(robot, 900); }
    function deal(){ const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q']; const suits=['♠','♥']; const deck=env.shuffleArray(ranks.flatMap(r=>suits.map(s=>r+s)).concat('JOKER')); userHand=[]; taHand=[]; deck.forEach((c,i)=>(i%2?taHand:userHand).push(c)); removePairs(userHand); removePairs(taHand); }
    function rank(c){ return c==='JOKER' ? 'JOKER' : c.slice(0,-1); }
    function label(c){ return c==='JOKER' ? '🃏' : c; }
    function removePairs(hand){ let removed=0; const seen={}; hand.slice().forEach(c=>{ const r=rank(c); if(r==='JOKER') return; (seen[r] ||= []).push(c); }); Object.keys(seen).forEach(r=>{ while(seen[r].length >= 2){ const a=seen[r].pop(), b=seen[r].pop(); hand.splice(hand.indexOf(a),1); hand.splice(hand.indexOf(b),1); removed++; } }); return removed; }
    function jokerOwner(){ return userHand.includes('JOKER') ? 'user' : (taHand.includes('JOKER') ? role : '无'); }
    function markJoker(){ const owner=jokerOwner(); if(details.jokerOwners[details.jokerOwners.length-1] !== owner) details.jokerOwners.push(owner); }
    function snapshot(){ return { userHand:userHand.slice(), taHand:taHand.slice(), turn, phase, pending:env.cloneCheatState(pending), log:log.slice(), userTurns, taTurns, details:env.cloneCheatState(details) }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||busy||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('oldmaid', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ userHand=s.userHand; taHand=s.taHand; turn=s.turn; phase=s.phase; pending=s.pending; log.length=0; (s.log||[]).forEach(x=>log.push(x)); userTurns=s.userTurns; taTurns=s.taTurns; details=s.details; }); cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('oldmaid', { userHand, taHand, turn, phase, pending, log, userTurns, taTurns, details, cheatLeft, cheatAttempted, undoStack }); }
    markJoker();
    function addLog(text){ log.unshift(text); if(log.length>6) log.pop(); }
    function drawCard(from, to, i){ const card = from.splice(i, 1)[0]; to.push(card); return card; }
    function human(i){ if(over||busy||turn!=='user'||phase!=='user_pick'||i<0||i>=taHand.length) return; pushUndo(); env.markFirstMoverUserAction(); userTurns++; const card=drawCard(taHand,userHand,i); markJoker(); pending={ actor:'user', card }; phase='user_review'; addLog('你抽到了 ' + label(card)); env.speak('oldmaid', card==='JOKER' ? 'joker' : 'draw'); draw(); save(); }
    function continueUser(){ if(over||phase!=='user_review') return; env.markFirstMoverUserAction(); const pairs=removePairs(userHand); if(pairs){ addLog('你丢掉了 ' + pairs + ' 对牌'); env.speak('oldmaid','pair'); } pending=null; if(done()) return; turn='ta'; phase='ta_thinking'; busy=true; draw(); save(); setTimeout(robot, 900); }
    function robot(){ if(over||turn!=='ta'||env.currentGame!=='oldmaid') return; if(!userHand.length){ done(); return; } taTurns++; const card=drawCard(userHand,taHand,Math.floor(Math.random()*userHand.length)); markJoker(); pending={ actor:'ta', card }; phase='ta_review'; busy=false; addLog(role + '抽走了 ' + label(card)); env.speak('oldmaid', card==='JOKER' ? 'joker' : 'ta_draw'); draw(); save(); }
    function continueTa(){ if(over||phase!=='ta_review') return; env.markFirstMoverUserAction(); const pairs=removePairs(taHand); if(pairs){ addLog(role + '丢掉了 ' + pairs + ' 对牌'); env.speak('oldmaid','ta_pair'); } pending=null; if(done()) return; turn='user'; phase='user_pick'; busy=false; draw(); save(); }
    function done(){ if(userHand.length && taHand.length) return false; markJoker(); over=true; env.clearProgress('oldmaid'); const userWon = userHand.length === 0, meta={ userTurns, taTurns, details }; if(userWon){ const cur=env.scores().oldmaid; env.setScore('oldmaid', ((cur&&typeof cur==='object'?cur.user:cur)||0)+1); env.speak('oldmaid','user_win'); env.showGameOver('oldmaid','你赢了','本局：你先清空手牌','user_win', meta); } else { env.addTaWin('oldmaid'); env.speak('oldmaid','user_lose'); env.showGameOver('oldmaid','游戏结束','本局：你留下了鬼牌','ta_win', meta); } return true; }
    function drawCardHTML(c, extra){
      if (c === 'JOKER') return '<div class="wb-oldmaid-card joker '+(extra||'')+'">'+gameSpriteHTML('pieces',7,'Joker')+'</div>';
      return '<div class="wb-oldmaid-card '+(extra||'')+'">'+env.esc(label(c))+'</div>';
    }
	    function draw(){ const charLabel=role; const scoreEl=env.qs('#wb-score'); if(scoreEl) scoreEl.textContent='本局：你' + userHand.length + '张 / ' + charLabel + taHand.length + '张'; const st=env.qs('#wb-oldmaid-status'); if(st) st.textContent=(phase==='user_pick'?'你的回合':phase==='user_review'?'看牌':phase==='ta_review'?charLabel + '的回合':charLabel + '正在抽牌') + ' · 你' + userHand.length + '张 / ' + charLabel + taHand.length + '张'; env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||busy); const reveal=env.qs('#wb-oldmaid-reveal'); if(reveal){ reveal.innerHTML=pending ? '<div class="wb-oldmaid-reveal-text">'+(pending.actor==='user'?'你抽到':charLabel + '抽走')+'</div>'+drawCardHTML(pending.card,'big')+'<button class="wb-btn primary" id="wb-oldmaid-next">'+(pending.actor==='user'?'丢对子并让' + charLabel + '抽':'知道了，继续')+'</button>' : ''; const nb=env.qs('#wb-oldmaid-next', reveal); if(nb) nb.onclick=pending.actor==='user'?continueUser:continueTa; } const ta=env.qs('#wb-oldmaid-ta'); if(ta){ ta.innerHTML=taHand.map((_,i)=>'<button class="wb-oldmaid-card back" data-i="'+i+'" '+(phase!=='user_pick'||turn!=='user'||busy?'disabled':'')+'>?</button>').join(''); env.qsa('.wb-oldmaid-card',ta).forEach(btn=>btn.onclick=()=>human(+btn.dataset.i)); } const user=env.qs('#wb-oldmaid-user'); if(user) user.innerHTML=userHand.map(c=>drawCardHTML(c)).join(''); const lg=env.qs('#wb-oldmaid-log'); if(lg) lg.innerHTML=log.map(env.esc).join('<br>'); }
  }
  startOldMaid(state);
  return env.activeGameController || null;
}
