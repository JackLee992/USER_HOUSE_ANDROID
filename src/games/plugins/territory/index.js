// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'territory';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["CHEAT_MAX","addTaWin","cheatAttemptResult","cheatButtonHTML","clearProgress","cloneCheatState","currentGame","displayCharName","gamePaused","markFirstMoverUserAction","nextCharLineTurn","pushCheatUndo","qs","qsa","refreshCheatButton","restoreCheatSnapshot","saveProgress","scores","setScore","showGameOver","speak","speakFirstMover","toast","toastCheatAlreadyAttempted"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startTerritory(state) {
    const box = env.qs('#wb-gamebox'), N = 5;
    const role = env.displayCharName();
    const makeH = () => Array.from({length:N+1}, () => Array(N).fill(''));
    const makeV = () => Array.from({length:N}, () => Array(N+1).fill(''));
    const makeO = () => Array.from({length:N}, () => Array(N).fill(''));
    let h = Array.isArray(state?.h) && state.h.length === N+1 ? state.h : makeH();
    let v = Array.isArray(state?.v) && state.v.length === N ? state.v : makeV();
    let owner = Array.isArray(state?.owner) && state.owner.length === N ? state.owner : makeO();
    let turn = state?.turn || (state?.firstMover === 'ta' ? 'ta' : 'user'), userScore = state?.userScore || 0, taScore = state?.taScore || 0, busy = false, over = false, chain = 0, noSafeSpoken = !!state?.noSafeSpoken;
    let taMoves = state?.taMoves || 0, nextCharLineAt = state?.nextCharLineAt || env.nextCharLineTurn(0);
    let details = state?.details || { turnGains:[] };
	    let cheatLeft = Number.isInteger(state?.cheatLeft) ? state.cheatLeft : env.CHEAT_MAX, cheatAttempted = !!state?.cheatAttempted, undoStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
    box.innerHTML = '<div class="wb-territory-panel"><div class="wb-territory-info"><span class="wb-pill" id="wb-territory-turn"></span><span class="wb-pill" id="wb-territory-score"></span>' + env.cheatButtonHTML(cheatLeft) + '</div><div class="wb-territory-board" id="wb-territory-board"></div></div>';
    draw(); save();
    env.qs('#wb-cheat', box).onclick = cheatUndo;
    if (!state?.turn && state?.firstMover) env.speakFirstMover('territory', state.firstMover);
    if(turn === 'ta') setTimeout(robot, 500);
    function snapshot(){ return { h:env.cloneCheatState(h), v:env.cloneCheatState(v), owner:env.cloneCheatState(owner), turn, userScore, taScore, noSafeSpoken, taMoves, nextCharLineAt, details:env.cloneCheatState(details), chain }; }
	    function pushUndo(){ cheatAttempted = false; undoStack = env.pushCheatUndo(undoStack, snapshot()); }
	    function cheatUndo(){ if(env.gamePaused||over||busy||cheatLeft<=0||!undoStack.length) return; if(cheatAttempted){ env.toastCheatAlreadyAttempted(); return; } cheatAttempted = true; if(env.cheatAttemptResult('territory', box, false) !== 'success'){ draw(); save(); return; } const snap=undoStack.pop(); env.restoreCheatSnapshot(snap, s=>{ h=s.h; v=s.v; owner=s.owner; turn=s.turn; userScore=s.userScore; taScore=s.taScore; noSafeSpoken=s.noSafeSpoken; taMoves=s.taMoves; nextCharLineAt=s.nextCharLineAt; details=s.details; chain=s.chain||0; }); cheatLeft--; details.cheatUsed = (details.cheatUsed || 0) + 1; draw(); save(); }
	    function save(){ if(!over) env.saveProgress('territory', { h, v, owner, turn, userScore, taScore, noSafeSpoken, taMoves, nextCharLineAt, details, cheatLeft, cheatAttempted, undoStack }); }
    function shouldCharNext(){ taMoves++; if(taMoves >= nextCharLineAt){ nextCharLineAt = env.nextCharLineTurn(taMoves); return true; } return false; }
    function sideCount(x,y){ return (h[y][x]?1:0) + (h[y+1][x]?1:0) + (v[y][x]?1:0) + (v[y][x+1]?1:0); }
    function cellsFor(kind,r,c){ const arr=[]; if(kind==='h'){ if(r>0) arr.push([c,r-1]); if(r<N) arr.push([c,r]); } else { if(c>0) arr.push([c-1,r]); if(c<N) arr.push([c,r]); } return arr; }
    function allEdges(){ const out=[]; for(let y=0;y<=N;y++) for(let x=0;x<N;x++) if(!h[y][x]) out.push(['h',y,x]); for(let y=0;y<N;y++) for(let x=0;x<=N;x++) if(!v[y][x]) out.push(['v',y,x]); return out; }
    function edgeEndpoints(e){ const k=e[0], r=e[1], c=e[2]; return k==='h' ? [[c,r],[c+1,r]] : [[c,r],[c,r+1]]; }
    function adjacentEdge(a,b){ if(!a||!b) return true; const ea=edgeEndpoints(a), eb=edgeEndpoints(b); return ea.some(p => eb.some(q => p[0]===q[0] && p[1]===q[1])); }
    function claimedEdges(){ const out=[]; for(let y=0;y<=N;y++) for(let x=0;x<N;x++) if(h[y][x]) out.push(['h',y,x]); for(let y=0;y<N;y++) for(let x=0;x<=N;x++) if(v[y][x]) out.push(['v',y,x]); return out; }
    function legalEdges(){ const edges=allEdges(), claimed=claimedEdges(); if(!claimed.length) return edges; const nearby=edges.filter(e => claimed.some(done => adjacentEdge(e,done))); return nearby.length ? nearby : edges; }
    function isLegalEdge(kind,r,c){ return legalEdges().some(e => e[0]===kind && e[1]===r && e[2]===c); }
    function wouldComplete(e){ return cellsFor(e[0],e[1],e[2]).some(([x,y]) => !owner[y][x] && sideCount(x,y) === 3); }
    function isSafe(e){ return cellsFor(e[0],e[1],e[2]).every(([x,y]) => owner[y][x] || sideCount(x,y) < 2); }
    function applyEdge(kind,r,c, who){ if(kind==='h'){ if(h[r][c]) return 0; h[r][c]=who; } else { if(v[r][c]) return 0; v[r][c]=who; } let gained=0; cellsFor(kind,r,c).forEach(([x,y]) => { if(!owner[y][x] && sideCount(x,y) === 4){ owner[y][x]=who; gained++; } }); if(gained){ if(who==='user') userScore += gained; else taScore += gained; } return gained; }
    function checkNoSafe(skipLine){ if(!noSafeSpoken && legalEdges().length && !legalEdges().some(isSafe)){ noSafeSpoken=true; if(!skipLine){ env.speak('territory','no_safe_edge'); return true; } } return false; }
    function human(kind,r,c){ if(over||busy||turn!=='user') return; if(!isLegalEdge(kind,r,c)){ env.toast('要贴着已有线继续画'); return; } pushUndo(); env.markFirstMoverUserAction(); let userEvent = cellsFor(kind,r,c).some(([x,y]) => !owner[y][x] && sideCount(x,y) === 2) ? 'danger' : ''; const gained=applyEdge(kind,r,c,'user'); details.turnGains.push({side:'user', gain:gained}); if(gained){ chain += gained; if(!userEvent) userEvent = chain > 1 ? 'chain' : 'capture'; } else { chain = 0; if(!userEvent) userEvent = 'edge'; turn='ta'; } let spoke = !!userEvent && Math.random()<.5; if(spoke) env.speak('territory', userEvent); if(checkNoSafe(spoke)) spoke = true; draw(); save(); if(done()) return; if(turn==='ta'){ busy=true; setTimeout(() => robot(spoke), 520); } }
    function robot(skipLine){ if(over||turn!=='ta'||env.currentGame!=='territory') return; const edges=legalEdges(); if(!edges.length){ done(); return; } const completions=edges.filter(wouldComplete), safe=edges.filter(isSafe); const pool=completions.length ? completions : (safe.length ? safe : edges); const e=pool[Math.floor(Math.random()*pool.length)]; const charNext = shouldCharNext(); let spoke = !!skipLine; const gained=applyEdge(e[0],e[1],e[2],'ta'); details.turnGains.push({side:'ta', gain:gained}); if(checkNoSafe(spoke)) spoke = true; if(gained){ if(!spoke){ spoke = true; env.speak('territory','ta_capture'); } draw(); save(); if(done()) return; setTimeout(() => robot(spoke), 520); return; } turn='user'; chain=0; if(!spoke) env.speak('territory', charNext ? 'char_next' : 'user_turn'); busy=false; draw(); save(); done(); }
    function done(){ if(allEdges().length) return false; over=true; env.clearProgress('territory'); const charLabel=role; const rounds=claimedEdges().length, text='本局：你 '+userScore+' 格，'+charLabel+' '+taScore+' 格，回合数：'+rounds, meta={ userScore, taScore, details }; if(userScore>taScore){ const cur=env.scores().territory; env.setScore('territory', ((cur&&typeof cur==='object'?cur.user:cur)||0)+1); env.speak('territory','user_win'); env.showGameOver('territory','你赢了',text,'user_win',meta); } else if(taScore>userScore){ env.addTaWin('territory'); env.speak('territory','user_lose'); env.showGameOver('territory','游戏结束',text,'ta_win',meta); } else { env.speak('territory','draw'); env.showGameOver('territory','平局',text,'draw',meta); } return true; }
	    function draw(){ const charLabel=role; const scoreEl=env.qs('#wb-score'); if(scoreEl) scoreEl.textContent='本局：你' + userScore + '/' + charLabel + taScore; const t=env.qs('#wb-territory-turn'); if(t) t.textContent=(turn==='user'?'你的回合':charLabel+'的回合') + (claimedEdges().length ? '，贴着已有线' : ''); const s=env.qs('#wb-territory-score'); if(s) s.textContent='你 '+userScore+' / '+charLabel+' '+taScore; env.refreshCheatButton(box, cheatLeft, undoStack.length > 0, env.gamePaused||over||busy); const board=env.qs('#wb-territory-board'); if(!board) return; const cells=[]; for(let gy=0;gy<N*2+1;gy++) for(let gx=0;gx<N*2+1;gx++){ if(gy%2===0&&gx%2===0) cells.push('<div class="wb-territory-dot"></div>'); else if(gy%2===0){ const r=gy/2,c=(gx-1)/2,val=h[r][c], legal=!val&&turn==='user'&&!busy&&isLegalEdge('h',r,c); cells.push('<button class="wb-territory-edge h'+(val?' claimed '+val:'')+(legal?' legal':'')+'" data-k="h" data-r="'+r+'" data-c="'+c+'" '+(!legal?'disabled':'')+'></button>'); } else if(gx%2===0){ const r=(gy-1)/2,c=gx/2,val=v[r][c], legal=!val&&turn==='user'&&!busy&&isLegalEdge('v',r,c); cells.push('<button class="wb-territory-edge v'+(val?' claimed '+val:'')+(legal?' legal':'')+'" data-k="v" data-r="'+r+'" data-c="'+c+'" '+(!legal?'disabled':'')+'></button>'); } else { const x=(gx-1)/2,y=(gy-1)/2,o=owner[y][x]; cells.push('<div class="wb-territory-cell '+(o||'')+'">'+(o==='user'?'你':o==='ta'?charLabel:'')+'</div>'); } } board.innerHTML=cells.join(''); env.qsa('.wb-territory-edge', board).forEach(btn => btn.onclick = () => human(btn.dataset.k, +btn.dataset.r, +btn.dataset.c)); }
  }
  startTerritory(state);
  return env.activeGameController || null;
}
