// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'game2048';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["DEFAULT_LINES","addSwipe","addTapDirection","choiceForState","choiceSavePatch","cloneCheatState","controlModeLabel","gamePaused","getHostDocument","nextControlMode","qs","qsa","saveProgress","scoreWithChoice","setScore","showGameOver","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function start2048(state) {
    const box = env.qs('#wb-gamebox');
    let controlMode = state?.controlMode || 'swipe';
    if(!['swipe','tap'].includes(controlMode)) controlMode = 'swipe';
    box.innerHTML = '<div class="wb-2048-panel"><div class="wb-touch-togglebar"><button class="wb-btn wb-control-mode-btn" id="wb-2048-mode" type="button"></button></div><div class="wb-grid2048" id="wb-2048"></div><div class="wb-actions wb-2048-tools"><button type="button" class="wb-btn" id="wb-2048-undo">撤回 <span id="wb-2048-undo-left">3</span></button><button type="button" class="wb-btn primary" id="wb-2048-clear">消除 <span id="wb-2048-clear-left">2</span></button></div></div>';
    const choice = env.choiceForState('game2048', state);
    const N = choice.size || 4, TOTAL = N * N;
    let board = Array.isArray(state?.board) && state.board.length === TOTAL ? state.board : Array(TOTAL).fill(0), score = state?.score || 0, seen = state?.seen || {};
    let details = state?.details || { mergeCounts:{}, crisisResolves:0, wasCrowded:false, finalCounts:{} };
    let undoLeft = Number.isInteger(state?.undoLeft) ? state.undoLeft : 3;
    let clearLeft = Number.isInteger(state?.clearLeft) ? state.clearLeft : 2;
    let undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    let clearMode = false;
    if (!state?.board) { add(); add(); }
    draw(); save();
    env.getHostDocument().onkeydown = e => { const dirs = {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'}; if(dirs[e.key]){ e.preventDefault(); move(dirs[e.key]); } };
    env.addSwipe(box, d => { if(controlMode === 'swipe') move(d); });
    env.addTapDirection(env.qs('#wb-2048', box), () => controlMode === 'tap' && !clearMode, move, { fourWay:true });
    env.qs('#wb-2048-undo', box).onclick = undoMove;
    env.qs('#wb-2048-clear', box).onclick = () => { if(env.gamePaused || clearLeft <= 0 || !board.some(Boolean)) return; clearMode = !clearMode; draw(); };
    function snapshot(){ return { board:board.slice(), score, seen:Object.assign({}, seen), details:env.cloneCheatState(details) }; }
    function restore2048(snap){ board=snap.board.slice(); score=snap.score; seen=Object.assign({}, snap.seen || {}); details=snap.details || details; }
    function pushUndo(){ undoStack.push(snapshot()); if(undoStack.length > 3) undoStack.shift(); }
    function undoMove(){ if(env.gamePaused || undoLeft <= 0 || !undoStack.length) return; const snap=undoStack.pop(); restore2048(snap); undoLeft--; clearMode=false; draw(); save(); }
    function clearTile(i){ if(env.gamePaused || !clearMode || clearLeft <= 0 || !board[i]) return; pushUndo(); board[i]=0; clearLeft--; clearMode=false; draw(); save(); }
    const modeBtn = env.qs('#wb-2048-mode', box);
    if(modeBtn) modeBtn.onclick = () => { controlMode = env.nextControlMode(controlMode, ['swipe','tap']); draw(); save(); };
    function save(){ env.saveProgress('game2048', Object.assign({ board, score, seen, details, undoLeft, clearLeft, undoStack, controlMode }, env.choiceSavePatch('game2048', choice))); }
    function add(){ const empt=board.map((v,i)=>v?null:i).filter(v=>v!==null); if(empt.length) board[empt[Math.floor(Math.random()*empt.length)]] = Math.random()<.9?2:4; }
    function rows(dir){ const r=[]; for(let y=0;y<N;y++) r.push(Array.from({length:N},(_,x)=>y*N+x)); if(dir==='right') r.forEach(a=>a.reverse()); if(dir==='up'||dir==='down'){ r.length=0; for(let x=0;x<N;x++) r.push(Array.from({length:N},(_,y)=>y*N+x)); if(dir==='down') r.forEach(a=>a.reverse()); } return r; }
    function move(dir){ if (env.gamePaused) return; clearMode=false; const old=board.join(','), before=snapshot(), merged=[]; rows(dir).forEach(idx=>{ let vals=idx.map(i=>board[i]).filter(Boolean); for(let i=0;i<vals.length-1;i++) if(vals[i]===vals[i+1]){ vals[i]*=2; score+=vals[i]; merged.push(vals[i]); details.mergeCounts[vals[i]] = (details.mergeCounts[vals[i]] || 0) + 1; vals.splice(i+1,1); } while(vals.length<N) vals.push(0); idx.forEach((p,i)=>board[p]=vals[i]); }); if(board.join(',')!==old){ undoStack.push(before); if(undoStack.length > 3) undoStack.shift(); if(!seen.move){ seen.move=1; env.speak('game2048','move'); } const hit=merged.filter(v=>[64,128,256,512,1024,2048,4096,8192,16384,32768,65536].includes(v)).sort((a,b)=>b-a)[0]; if(hit > 2048) env.speak('game2048','tile_big'); else if(hit && env.DEFAULT_LINES.game2048['tile_'+hit]) env.speak('game2048','tile_'+hit); add(); const filled=board.filter(Boolean).length, crowded = Math.max(0, TOTAL - (N === 6 ? 5 : 1)); if(details.wasCrowded && filled<=Math.max(11, TOTAL - N - 1)){ details.crisisResolves++; details.wasCrowded=false; } if(filled>=crowded) details.wasCrowded=true; if(!seen.stuck && filled>=Math.max(13, TOTAL - N)){ seen.stuck=1; env.speak('game2048','stuck'); } if(!seen.gameover && !board.includes(0)){ seen.gameover=1; env.speak('game2048','gameover'); } draw(); save(); } if(!board.includes(0) && !canMove()) { if(!seen.gameover){ seen.gameover=1; env.speak('game2048','gameover'); save(); } details.finalCounts = board.reduce((m,v)=>{ if(v) m[v]=(m[v]||0)+1; return m; }, {}); const finalScore = env.scoreWithChoice('game2048', score, choice); env.showGameOver('game2048', '游戏结束', '本局分数：' + finalScore + '分（' + choice.title + '）', null, { maxTile: Math.max(...board), rawScore:score, difficulty:choice.title, details }); } }
    function canMove(){ return rows('left').some(idx=>idx.some((p,i)=>i<N-1 && board[p]===board[idx[i+1]])) || rows('up').some(idx=>idx.some((p,i)=>i<N-1 && board[p]===board[idx[i+1]])); }
    function draw(){ env.setScore('game2048', env.scoreWithChoice('game2048', score, choice)); const mb=env.qs('#wb-2048-mode', box); if(mb) mb.textContent='模式：' + env.controlModeLabel(controlMode); const grid=env.qs('#wb-2048'); grid.style.setProperty('--wb-2048-size', String(N)); grid.innerHTML=board.map((v,i)=>'<button type="button" class="wb-tile' + (clearMode && v ? ' clearable' : '') + '" data-i="' + i + '" style="--tile-color:' + tileColor(v) + ';background:' + tileColor(v) + ';font-size:' + (v>=10000?16:v>999?22:28) + 'px" ' + (!clearMode || !v ? 'disabled' : '') + '>' + (v||'') + '</button>').join(''); env.qsa('.wb-tile.clearable', grid).forEach(btn=>btn.onclick=()=>clearTile(+btn.dataset.i)); const ub=env.qs('#wb-2048-undo-left', box); if(ub) ub.textContent=String(undoLeft); const cb=env.qs('#wb-2048-clear-left', box); if(cb) cb.textContent=String(clearLeft); const undo=env.qs('#wb-2048-undo', box); if(undo) undo.disabled=env.gamePaused || undoLeft<=0 || !undoStack.length; const clear=env.qs('#wb-2048-clear', box); if(clear){ clear.disabled=env.gamePaused || clearLeft<=0 || !board.some(Boolean); clear.classList.toggle('active', clearMode); } }
    function tileColor(v){ return ({0:'#cdc0b6',2:'#eee4da',4:'#ead8c7',8:'#efb07e',16:'#ec9368',32:'#e87865',64:'#e95f51',128:'#e4c16d',256:'#dfb954',512:'#d7ac3f',1024:'#cfa02f',2048:'#9ccbbb',4096:'#8f7ad8',8192:'#6aa6d8',16384:'#5eb6a1',32768:'#9f7aea',65536:'#f59e0b'})[v] || '#40342f'; }
  }
  start2048(state);
  return env.activeGameController || null;
}
