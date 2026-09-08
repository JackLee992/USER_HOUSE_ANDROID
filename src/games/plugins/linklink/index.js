import { pairSpriteHTML } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'linklink';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["SCRIPT_ID","appendModalMask","clearProgress","currentGame","esc","formatDuration","gamePaused","getHostDocument","getHostWindow","linkLinkTimer","loadJSON","modalMaskClass","qs","qsa","safeObject","saveJSON","saveProgress","scores","setScore","showGameOver","shuffleArray","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startLinkLink(state) {
    const box = env.qs('#wb-gamebox');
    const EMOJIS = ['🍓','🍊','🍋','🍎','🍇','🍉','🍒','🍑','🥝','🍄','🌻','🌙','⭐','☁️','🐟','🐚','🍬','🧁','🔔','🐾'];
    const LEVELS = [
      { rows:6, cols:6, tiles:36, icons:10, time:90, target:1800, mode:'none', name:'完全静止' },
      { rows:6, cols:8, tiles:48, icons:12, time:90, target:2400, mode:'none', name:'完全静止' },
      { rows:6, cols:8, tiles:48, icons:12, time:85, target:2400, mode:'down', name:'消除后图块向下移动' },
      { rows:7, cols:8, tiles:56, icons:14, time:85, target:2800, mode:'up', name:'消除后图块向上移动' },
      { rows:8, cols:8, tiles:64, icons:16, time:80, target:3200, mode:'left', name:'消除后每行向左靠拢' },
      { rows:8, cols:8, tiles:64, icons:16, time:80, target:3200, mode:'right', name:'消除后每行向右靠拢' },
      { rows:8, cols:9, tiles:72, icons:18, time:78, target:3600, mode:'hCenter', name:'消除后水平向中心集中' },
      { rows:8, cols:9, tiles:68, icons:17, time:78, target:3400, stones:4, mode:'hOut', name:'4个石块；消除后水平向外侧分散' },
      { rows:8, cols:10, tiles:80, icons:20, time:75, target:4000, mode:'vCenter', name:'消除后垂直向中心集中' },
      { rows:8, cols:10, tiles:72, icons:18, time:72, target:3600, stones:8, mode:'altDownLeft', name:'8个石块；奇数次向下，偶数次向左' },
      { rows:8, cols:10, tiles:72, icons:20, time:70, target:3600, stones:8, mode:'randomFixed', name:'8个石块；开局随机移动规则' },
      { rows:8, cols:10, tiles:68, icons:20, time:68, target:3400, stones:12, mode:'switch5', name:'12个石块；每消除5对切换规则' }
    ];
    const MODES = ['up','down','left','right','hCenter','hOut','vCenter'];
    const MODE_TEXT = { none:'完全静止', up:'向上移动', down:'向下移动', left:'向左靠拢', right:'向右靠拢', hCenter:'水平向中心集中', hOut:'水平向外侧分散', vCenter:'垂直向中心集中' };
    const delay = ms => new Promise(r=>setTimeout(r,ms));
    let st = null, selected = null, busy = false, over = false, timer = null, lastTick = Date.now(), hintPair = null, linePath = null, lineKind = '', idle8 = false, idle15 = false, frozenLeft = 0, warned30 = false, pendingRemovals = 0, fadingTiles = new Map();
    box.innerHTML = '<div class="wb-link"><div class="wb-link-top"><div class="wb-link-level"><small>当前关卡</small><b id="ll-level">第 1 关</b></div><div class="wb-link-progress"><div id="ll-progress-text">本关 0 / 1800</div><div class="wb-link-bar"><div class="wb-link-fill" id="ll-fill"></div></div></div><div class="wb-link-total"><small>累计总分</small><b id="ll-total">0</b></div><div class="wb-link-time" id="ll-time">⏱ 01:30</div></div><div class="wb-link-boardwrap"><div class="wb-link-board" id="ll-board"></div></div><div class="wb-link-tools"><button class="wb-link-tool" data-tool="hint"><i>💡</i><span class="name">提示</span><span class="badge" id="ll-hint-left">2</span></button><button class="wb-link-tool" data-tool="shuffle"><i>⇄</i><span class="name">洗牌</span><span class="badge" id="ll-shuffle-left">1</span></button><button class="wb-link-tool" data-tool="freeze"><i>❄</i><span class="name">冻结</span><span class="badge" id="ll-freeze-left">1</span></button><button class="wb-link-tool" data-tool="magic"><i>✦</i><span class="name">消除</span><span class="badge" id="ll-magic-left">0</span></button></div><div class="wb-link-rule" id="ll-rule">本关规则：完全静止</div></div>';
    env.qsa('.wb-link-tool', box).forEach(b => b.onclick = () => useTool(b.dataset.tool));
    function detailsBase(){ return { score:0, level:1, maxCombo:0, comboTimeBonus:0, comboTimeAwards:0, hintUsed:0, shuffleUsed:0, freezeUsed:0, magicUsed:0, deadShuffles:0, deadShufflesInLevel:0, fastClear:false, lastSecond:false, completedAll:false, clearLevels:0, reviveUsed:0 }; }
    function updateBest(){ const key=env.SCRIPT_ID + '_linklinkBest_v1', old=env.safeObject(env.loadJSON(key,{})); env.saveJSON(key,{ score:Math.max(Number(old.score||0),st.totalScore||0), level:Math.max(Number(old.level||0),st.level||1), maxCombo:Math.max(Number(old.maxCombo||0),st.maxCombo||0) }); }
    function newState(){ return { level:1, totalScore:0, levelScore:0, combo:0, maxCombo:0, lastSuccessAt:0, tools:{hint:2,shuffle:1,freeze:1,magic:0}, board:[], details:detailsBase(), used:{hint:0,shuffle:0,freeze:0,magic:0}, pairsCleared:0, mode:'none', startedAt:Date.now(), timeLeft:90, reviveLeft:5 }; }
    function save(force){ if(!over && st && pendingRemovals===0 && !busy) env.saveProgress('linklink', Object.assign({}, st, { selected:null }), force ? { immediate:true } : undefined); }
    const comboTimeBonusFor = combo => (combo >= 3 && combo % 3 === 0 ? 2 : 0);
    function stonePositions(rows, cols, n){
      if(!n) return new Set();
      const pts=[]; const mids=[[Math.floor(rows/2)-1,Math.floor(cols/2)-1],[Math.floor(rows/2)-1,Math.floor(cols/2)],[Math.floor(rows/2),Math.floor(cols/2)-1],[Math.floor(rows/2),Math.floor(cols/2)]];
      if(n===4) pts.push(...mids); else if(n===8) for(let r=1;r<rows-1;r+=2){ pts.push([r,Math.floor(cols/2)-1],[r,Math.floor(cols/2)]); if(pts.length>=8) break; } else for(let r=1;r<rows-1;r+=2){ pts.push([r,2],[r,cols-3]); if(pts.length>=12) break; }
      return new Set(pts.slice(0,n).map(p=>p[0]+','+p[1]));
    }
    function makeIcons(count, kinds){ const icons=EMOJIS.slice(0,kinds), pairs=[]; for(let i=0;i<count/2;i++) pairs.push(icons[i%icons.length]); return env.shuffleArray(pairs); }
    function emptyBoard(rows, cols){ return Array.from({length:rows},()=>Array(cols).fill(null)); }
    function placePaired(rows, cols, tileCount, iconKinds, stones){
      const b=emptyBoard(rows,cols), cells=[]; for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ if(stones.has(r+','+c)) b[r][c]='#'; else cells.push([r,c]); }
      const icons=env.shuffleArray(makeIcons(tileCount, iconKinds).flatMap(x=>[x,x]));
      env.shuffleArray(cells).slice(0,icons.length).forEach((p,i)=>{ b[p[0]][p[1]]=icons[i]; });
      return b;
    }
    function adjacentSameScore(b, rows, cols){ let n=0; for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const v=b[r][c]; if(!v||v==='#') continue; if(c+1<cols&&b[r][c+1]===v) n++; if(r+1<rows&&b[r+1][c]===v) n++; } return n; }
    function countLegalPairs(b=st.board){ const pairs=[]; for(let r1=0;r1<st.rows;r1++) for(let c1=0;c1<st.cols;c1++){ const v=b[r1][c1]; if(!v||v==='#') continue; for(let r2=r1;r2<st.rows;r2++) for(let c2=0;c2<st.cols;c2++){ if(r1===r2&&c2<=c1) continue; if(b[r2][c2]===v){ const path=findPath({r:r1,c:c1},{r:r2,c:c2},b); if(path) pairs.push({a:{r:r1,c:c1},b:{r:r2,c:c2},path}); } } } return pairs; }
    function levelIndex(n){ return Math.min(12, Math.max(1, Number(n || st?.level || 1))) - 1; }
    function startLevel(n){
      const lv=LEVELS[levelIndex(n)], stones=stonePositions(lv.rows,lv.cols,lv.stones||0); st.rows=lv.rows; st.cols=lv.cols; st.level=n; st.levelScore=0; st.timeLeft=lv.time; st.initialTime=lv.time; st.target=lv.target || Math.floor(lv.tiles/2)*100; st.tools={hint:2,shuffle:1,freeze:1,magic:n>=5?1:0}; st.used={hint:0,shuffle:0,freeze:0,magic:0}; st.combo=0; st.lastSuccessAt=0; st.pairsCleared=0; st.deadShufflesInLevel=0; warned30=false; frozenLeft=0; pendingRemovals=0; fadingTiles=new Map(); selected=null; hintPair=null; linePath=null; idle8=idle15=false;
      st.mode = lv.mode==='randomFixed' ? randomMode() : (lv.mode==='switch5' ? randomMode() : lv.mode);
      let best=null, bestAdj=Infinity;
      for(let tries=0;tries<120;tries++){ const b=placePaired(lv.rows,lv.cols,lv.tiles,lv.icons,stones), legal=countLegalPairs(b).length, adj=adjacentSameScore(b,lv.rows,lv.cols); if(legal>=3&&adj<bestAdj){ best=b; bestAdj=adj; if(adj<=1) break; } if(!best&&legal>0) best=b; }
      st.board=best || placePaired(lv.rows,lv.cols,lv.tiles,lv.icons,stones);
      env.speak('linklink','start'); if(lv.mode==='randomFixed'||lv.mode==='switch5') showToast('本关规则：' + MODE_TEXT[st.mode]); draw(); env.setScore('linklink', st.totalScore); lastTick=Date.now(); save(true);
    }
    function randomMode(except){ const arr=MODES.filter(x=>x!==except); return arr[Math.floor(Math.random()*arr.length)]; }
    let comboBonusFlashUntil = 0, comboBonusFlash = 0;
    function addComboTimeBonus(combo){
      const bonus = comboTimeBonusFor(combo);
      if(!bonus) return 0;
      st.timeLeft = Math.max(0, st.timeLeft + bonus);
      st.details.comboTimeBonus = (st.details.comboTimeBonus || 0) + bonus;
      st.details.comboTimeAwards = (st.details.comboTimeAwards || 0) + 1;
      comboBonusFlash = bonus;
      comboBonusFlashUntil = Date.now() + 1200;
      showToast('连击加时 +' + bonus + '秒');
      return bonus;
    }
    st=state ? Object.assign(newState(), state, { selected:null }) : newState(); st.reviveLeft = Math.max(0, Math.min(5, Number(st.reviveLeft == null ? 5 : st.reviveLeft))); if(!st.details) st.details=detailsBase(); if(!st.tools) st.tools={hint:2,shuffle:1,freeze:1,magic:st.level>=5?1:0}; if(!st.used) st.used={hint:0,shuffle:0,freeze:0,magic:0}; if(state && st.board && st.board.length){ st.rows=st.rows||st.board.length; st.cols=st.cols||(st.board[0]||[]).length; st.level=Math.max(1,Number(st.level||1)); const lv=LEVELS[levelIndex(st.level)]; st.target=st.target||lv.target||Math.floor(lv.tiles/2)*100; st.initialTime=st.initialTime||lv.time; st.mode=st.mode||lv.mode||'none'; draw(); env.setScore('linklink', st.totalScore||0); } else startLevel(1); timer=setInterval(tick,250); env.linkLinkTimer=timer; save(true);
    function tick(){ if(env.currentGame!=='linklink'||over){ clearInterval(timer); if(env.linkLinkTimer===timer) env.linkLinkTimer=null; return; } const now=Date.now(), dt=Math.min(.35,(now-lastTick)/1000); lastTick=now; if(env.gamePaused||busy) return; if(frozenLeft>0){ frozenLeft=Math.max(0,frozenLeft-dt); drawTools(); return; } st.timeLeft=Math.max(0,st.timeLeft-dt); if(st.timeLeft<=30&&!warned30){ warned30=true; env.speak('linklink','time_30'); } if(st.lastSuccessAt){ const idle=(now-st.lastSuccessAt)/1000; if(idle>=8&&!idle8){ idle8=true; env.speak('linklink','random'); } if(idle>=15&&!idle15){ idle15=true; const h=env.qs('[data-tool="hint"]',box); h&&h.classList.add('hint'); setTimeout(()=>h&&h.classList.remove('hint'),900); } }
      drawTop(); save(); if(st.timeLeft<=0 && tilesLeft()>0) fail(); }
    function inRange(r,c){ return r>=-1&&r<=st.rows&&c>=-1&&c<=st.cols; }
    function passable(r,c,b,a,z){ if(r===a.r&&c===a.c) return true; if(r===z.r&&c===z.c) return true; if(r<0||r>=st.rows||c<0||c>=st.cols) return true; return !b[r][c]; }
    function findPath(a,z,b=st.board){
      if(!a||!z||b[a.r]?.[a.c]!==b[z.r]?.[z.c]) return null; const dirs=[[0,1],[1,0],[0,-1],[-1,0]], q=[]; let seq=0; const seen=new Map();
      dirs.forEach((d,i)=>{ const nr=a.r+d[0], nc=a.c+d[1]; if(inRange(nr,nc)&&passable(nr,nc,b,a,z)) q.push({r:nr,c:nc,dir:i,turns:0,len:1,path:[a,{r:nr,c:nc}],seq:seq++}); });
      while(q.length){ q.sort((x,y)=>x.turns-y.turns||x.len-y.len||x.seq-y.seq); const cur=q.shift(), key=cur.r+','+cur.c+','+cur.dir+','+cur.turns; if(seen.has(key)&&seen.get(key)<=cur.len) continue; seen.set(key,cur.len); if(cur.r===z.r&&cur.c===z.c) return simplifyPath(cur.path); for(let i=0;i<dirs.length;i++){ const nt=cur.turns+(i===cur.dir?0:1); if(nt>2) continue; const nr=cur.r+dirs[i][0], nc=cur.c+dirs[i][1]; if(!inRange(nr,nc)||!passable(nr,nc,b,a,z)) continue; q.push({r:nr,c:nc,dir:i,turns:nt,len:cur.len+1,path:cur.path.concat([{r:nr,c:nc}]),seq:seq++}); } }
      return null;
    }
    function simplifyPath(path){ const out=[]; for(let i=0;i<path.length;i++){ if(i>0&&i<path.length-1){ const p=path[i-1], c=path[i], n=path[i+1]; if((p.r===c.r&&c.r===n.r)||(p.c===c.c&&c.c===n.c)) continue; } out.push(path[i]); } return out; }
    function pathStats(path){ let turns=Math.max(0,path.length-2), len=0, outside=false; for(let i=0;i<path.length-1;i++){ len+=Math.abs(path[i].r-path[i+1].r)+Math.abs(path[i].c-path[i+1].c); } path.forEach(p=>{ if(p.r<0||p.r>=st.rows||p.c<0||p.c>=st.cols) outside=true; }); return {turns,len,outside,between:Math.max(0,len-1)}; }
    async function clickTile(r,c){ if((busy&&pendingRemovals<=0)||over||env.gamePaused) return; const v=st.board[r]?.[c]; if(!v||v==='#') return; const cur={r,c}; if(selected&&selected.r===r&&selected.c===c){ selected=null; draw(); return; } if(!selected){ selected=cur; draw(); return; } if(st.board[selected.r][selected.c]!==v){ selected=cur; draw(); return; } const path=findPath(selected,cur); if(!path){ markBad(selected,cur); speakMaybe('linklink','wrong',.35); selected=cur; draw(); return; } await removePair(selected,cur,path,false); }
    async function removePair(a,b,path,magic){ if(busy||over) return; const av=st.board[a.r]?.[a.c], bv=st.board[b.r]?.[b.c]; if(!av||!bv||av==='#'||bv==='#') return; hintPair=null; selected=null; linePath=path; const activePath=path; lineKind=magic?'magic':''; draw(); await delay(110); if(st.board[a.r]?.[a.c]!==av||st.board[b.r]?.[b.c]!==bv) return; fadingTiles.set(a.r+','+a.c,av); fadingTiles.set(b.r+','+b.c,bv); st.board[a.r][a.c]=null; st.board[b.r][b.c]=null; pendingRemovals++; const now=Date.now(), ps=pathStats(path); let gain=100; if(!magic){ gain += ps.turns===0?30:(ps.turns===1?20:10); if(ps.outside) gain+=10; gain += Math.min(20, ps.between*2); if(st.lastSuccessAt){ const gap=(now-st.lastSuccessAt)/1000; if(gap<=1.2) gain+=50; else if(gap<=2.5) gain+=25; st.combo = gap<=3 ? st.combo+1 : 1; } else st.combo=1; gain += Math.min(100, Math.max(0, st.combo-1)*10); addComboTimeBonus(st.combo); } else st.combo=Math.max(0,st.combo||0);
      st.maxCombo=Math.max(st.maxCombo,st.combo||0); st.details.maxCombo=Math.max(st.details.maxCombo||0,st.maxCombo); st.levelScore+=gain; st.totalScore+=gain; st.pairsCleared++; if(!magic) st.lastSuccessAt=now; idle8=idle15=false; if(linePath===activePath) linePath=null; if(!magic){ if(ps.turns===0) speakMaybe('linklink','straight',.25); if(ps.turns===2) speakMaybe('linklink','two_turn',.35); if(ps.outside) speakMaybe('linklink','outside',.5); if(st.combo===5) env.speak('linklink','combo_5'); if(st.combo===10) env.speak('linklink','combo_10'); if(st.combo===20) env.speak('linklink','combo_20'); showCombo(st.combo); }
      draw(); save(); setTimeout(()=>{ fadingTiles.delete(a.r+','+a.c); fadingTiles.delete(b.r+','+b.c); pendingRemovals=Math.max(0,pendingRemovals-1); draw(); if(pendingRemovals===0) settleAfterRemovals(); },220); }
    async function settleAfterRemovals(){ if(busy||over||pendingRemovals>0) return; const lv=LEVELS[levelIndex()], willMove=lv.mode!=='none'; if(willMove){ selected=null; await delay(20); applyAfterMove(); draw(); await delay(55); } await ensurePlayable(); if(tilesLeft()===0) await levelClear(); draw(); save(); }
    function speakMaybe(g,e,p){ if(Math.random()<p) env.speak(g,e); }
    function tileCells(){ const arr=[]; for(let r=0;r<st.rows;r++) for(let c=0;c<st.cols;c++) if(st.board[r][c]&&st.board[r][c]!=='#') arr.push([r,c]); return arr; }
    function tilesLeft(){ return tileCells().length; }
    function compressLine(vals, dir){ const out=Array(vals.length).fill(null), segs=[]; let s=0; for(let i=0;i<=vals.length;i++){ if(i===vals.length||vals[i]==='#'){ segs.push([s,i]); if(i<vals.length) out[i]='#'; s=i+1; } } segs.forEach(([a,b])=>{ const items=vals.slice(a,b).filter(Boolean); if(dir==='end') for(let i=0;i<items.length;i++) out[b-items.length+i]=items[i]; else for(let i=0;i<items.length;i++) out[a+i]=items[i]; }); return out; }
    function applyAfterMove(){ const lv=LEVELS[levelIndex()]; let m=st.mode; if(lv.mode==='altDownLeft') m=(st.pairsCleared%2===1)?'down':'left'; if(lv.mode==='switch5'&&st.pairsCleared>0&&st.pairsCleared%5===0){ st.mode=randomMode(st.mode); m=st.mode; showToast('本关规则：' + MODE_TEXT[m]); }
      if(m==='none') return; if(m==='left'||m==='right'||m==='hCenter'||m==='hOut') moveRows(m); else moveCols(m); }
    function moveRows(m){ for(let r=0;r<st.rows;r++){ if(m==='left'||m==='right') st.board[r]=compressLine(st.board[r],m==='right'?'end':'start'); else { const mid=Math.floor(st.cols/2), left=compressLine(st.board[r].slice(0,mid),m==='hCenter'?'end':'start'), right=compressLine(st.board[r].slice(mid),m==='hCenter'?'start':'end'); st.board[r]=left.concat(right); } } }
    function moveCols(m){ for(let c=0;c<st.cols;c++){ const col=[]; for(let r=0;r<st.rows;r++) col.push(st.board[r][c]); let next; if(m==='up'||m==='down') next=compressLine(col,m==='down'?'end':'start'); else { const mid=Math.floor(st.rows/2), top=compressLine(col.slice(0,mid),m==='vCenter'?'end':'start'), bot=compressLine(col.slice(mid),m==='vCenter'?'start':'end'); next=top.concat(bot); } for(let r=0;r<st.rows;r++) st.board[r][c]=next[r]; } }
    async function ensurePlayable(){ if(tilesLeft()===0) return; if(countLegalPairs().length) return; st.timeLeft=Math.max(0,st.timeLeft-5); st.details.deadShuffles++; st.details.deadShufflesInLevel=++st.deadShufflesInLevel; env.speak('linklink','dead_shuffle'); showToast('没有可连接的图块，自动重新排列'); reshuffle(false); draw(); await delay(250); }
    function reshuffle(cost){ fadingTiles=new Map(); pendingRemovals=0; const cells=tileCells(), vals=cells.map(([r,c])=>st.board[r][c]), original=st.board.map(row=>row.slice()); for(let tries=0;tries<80;tries++){ const shuffled=env.shuffleArray(vals.slice()); st.board=original.map(row=>row.slice()); cells.forEach((p,i)=>{ st.board[p[0]][p[1]]=shuffled[i]; }); if(countLegalPairs().length) break; } if(cost){ st.totalScore=Math.max(0,st.totalScore-100); st.combo=0; st.details.shuffleUsed++; env.speak('linklink','shuffle'); } save(); }
    async function useTool(t){ if(busy||over||env.gamePaused||pendingRemovals>0) return; if((st.tools[t]||0)<=0) return; if(t==='hint'){ st.tools.hint--; st.used.hint++; st.details.hintUsed++; env.speak('linklink','hint'); if(!countLegalPairs().length) await ensurePlayable(); const pairs=countLegalPairs(); hintPair=pairs[Math.floor(Math.random()*pairs.length)]||null; if(hintPair){ linePath=hintPair.path; lineKind='hint'; draw(); setTimeout(()=>{ if(env.currentGame==='linklink'){ hintPair=null; linePath=null; draw(); } },2000); } }
      if(t==='shuffle'){ st.tools.shuffle--; st.used.shuffle++; reshuffle(true); selected=null; draw(); }
      if(t==='freeze'){ st.tools.freeze--; st.used.freeze++; st.details.freezeUsed++; frozenLeft=8; env.speak('linklink','freeze'); draw(); }
      if(t==='magic'){ st.tools.magic--; st.used.magic++; st.details.magicUsed++; env.speak('linklink','magic'); if(!countLegalPairs().length) await ensurePlayable(); const p=countLegalPairs()[0]; if(p) await removePair(p.a,p.b,p.path,true); }
      drawTools(); save(); }
    async function levelClear(){ busy=true; const remain=Math.ceil(st.timeLeft), lv=LEVELS[levelIndex()]; const fast=remain>lv.time/2, last=remain<=1; if(fast){ st.details.fastClear=true; env.speak('linklink','fast_clear'); } if(last){ st.details.lastSecond=true; } let bonus=remain*10 + (st.tools.hint||0)*50 + (st.tools.shuffle?100:0) + (st.tools.freeze?100:0) + (st.tools.magic?150:0); st.totalScore += bonus; st.details.clearLevels=st.level; if(st.level>=12) st.details.completedAll=true; showToast('第' + st.level + '关完成 +' + bonus); env.speak('linklink','level_clear'); env.setScore('linklink', st.totalScore); updateBest(); draw(); await delay(1200); startLevel(st.level+1); busy=false; }
    function showReviveChoice(onRevive, onSettle){
      if((st.reviveLeft || 0) <= 0){ onSettle(); return; }
      busy = true;
      const doc = env.getHostDocument();
      const old = env.qs('#wb-revive-mask', doc); if(old) old.remove();
      const mask = doc.createElement('div');
      mask.className = env.modalMaskClass();
      mask.id = 'wb-revive-mask';
      mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">看广告免费复活</div><div style="margin-bottom:10px;line-height:1.8;">骗你的，不看广告也能复活</div><div class="wb-api-status" style="margin-bottom:12px;">剩余复活次数：' + env.esc(st.reviveLeft) + '</div><div class="wb-actions"><button class="wb-btn primary" id="wb-revive-ok">确认复活</button><button class="wb-btn" id="wb-revive-giveup">认输结算</button></div></div>';
      env.appendModalMask(mask);
      env.qs('#wb-revive-ok', mask).onclick = () => { mask.remove(); st.reviveLeft = Math.max(0, (st.reviveLeft || 0) - 1); st.details.reviveUsed = (st.details.reviveUsed || 0) + 1; onRevive(); };
      env.qs('#wb-revive-giveup', mask).onclick = () => { mask.remove(); onSettle(); };
    }
    function fail(){
      if(over) return;
      const settle = () => { over=true; busy=false; clearInterval(timer); if(env.linkLinkTimer===timer) env.linkLinkTimer=null; env.clearProgress('linklink'); st.details.score=st.totalScore; st.details.level=st.level; env.setScore('linklink', Math.max(env.scores().linklink||0, st.totalScore)); updateBest(); env.speak('linklink','gameover'); draw(); env.showGameOver('linklink','时间到','到达第' + st.level + '关，累计总分：' + st.totalScore + '分，最高连击：' + st.maxCombo, {outcome:'score',score:st.totalScore}, { details:Object.assign({},st.details,{score:st.totalScore,level:st.level,maxCombo:st.maxCombo,reviveLeft:st.reviveLeft || 0}) }); };
      showReviveChoice(() => { st.timeLeft = Math.max(st.timeLeft || 0, 30); warned30=false; busy=false; over=false; lastTick=Date.now(); showToast('复活成功，继续找配对'); draw(); save(true); }, settle);
    }
    function finishAll(){ over=true; clearInterval(timer); if(env.linkLinkTimer===timer) env.linkLinkTimer=null; env.clearProgress('linklink'); st.details.score=st.totalScore; st.details.level=12; st.details.maxCombo=st.maxCombo; env.setScore('linklink', Math.max(env.scores().linklink||0, st.totalScore)); updateBest(); env.showGameOver('linklink','全部通关','累计总分：' + st.totalScore + '分，最高连击：' + st.maxCombo + '，用时：' + env.formatDuration(Date.now()-st.startedAt), {outcome:'score',score:st.totalScore}, { details:Object.assign({},st.details,{score:st.totalScore,level:12,maxCombo:st.maxCombo,completedAll:true}) }); }
    function markBad(a,b){ draw(); [a,b].forEach(p=>{ const el=env.qs('.wb-link-tile[data-r="'+p.r+'"][data-c="'+p.c+'"]',box); if(el){ el.classList.add('bad'); setTimeout(()=>el.classList.remove('bad'),200); } }); }
    function drawTop(){ env.qs('#ll-level',box).textContent='第 ' + st.level + ' 关'; env.qs('#ll-progress-text',box).textContent='本关 ' + st.levelScore + ' / ' + st.target; env.qs('#ll-total',box).textContent=String(st.totalScore).replace(/\B(?=(\d{3})+(?!\d))/g, ','); const fill=env.qs('#ll-fill',box); fill.style.width=Math.min(100,st.levelScore/st.target*100)+'%'; fill.classList.toggle('done',st.levelScore>=st.target); const t=env.qs('#ll-time',box), left=Math.ceil(st.timeLeft), bonusActive=Date.now()<comboBonusFlashUntil; t.textContent=(frozenLeft>0?'❄ ':'⏱ ') + String(Math.floor(left/60)).padStart(2,'0') + ':' + String(left%60).padStart(2,'0') + (bonusActive&&comboBonusFlash?(' +' + comboBonusFlash + '秒'):''); t.className='wb-link-time ' + (bonusActive?'bonus ':'' ) + (frozenLeft>0?'freeze':left<=10?'danger':left<=30?'warn':''); }
    function drawTools(){ ['hint','shuffle','freeze','magic'].forEach(k=>{ const el=env.qs('#ll-'+k+'-left',box); if(el) el.textContent=k==='freeze'&&frozenLeft>0?Math.ceil(frozenLeft):st.tools[k]; const btn=env.qs('[data-tool="'+k+'"]',box); if(btn) btn.disabled=(st.tools[k]||0)<=0||(k==='freeze'&&frozenLeft>0); }); }
    function draw(){ drawTop(); drawTools(); const rule=env.qs('#ll-rule',box), lv=LEVELS[levelIndex()]; if(rule) rule.textContent='本关规则：' + (lv.mode==='none'?'完全静止':MODE_TEXT[st.mode]||lv.name); const board=env.qs('#ll-board',box); board.style.setProperty('--ll-cols',st.cols); board.style.setProperty('--ll-rows',st.rows); board.style.setProperty('--ll-ratio',st.cols/st.rows); let html=''; for(let r=0;r<st.rows;r++) for(let c=0;c<st.cols;c++){ const key=r+','+c, fading=fadingTiles.get(key), v=st.board[r][c] || fading, sel=!fading&&selected&&selected.r===r&&selected.c===c, hp=!fading&&hintPair&&(hintPair.a.r===r&&hintPair.a.c===c||hintPair.b.r===r&&hintPair.b.c===c); html += '<button class="wb-link-tile '+(!v?'empty':v==='#'?'stone':fading?'gone':sel?'sel':hp?'hint':'')+'" data-r="'+r+'" data-c="'+c+'">'+(v&&v!=='#'?pairSpriteHTML(v):'')+'</button>'; } board.innerHTML=html; env.qsa('.wb-link-tile',board).forEach(el=>{ const r=+el.dataset.r,c=+el.dataset.c; el.onpointerdown=e=>{ e.preventDefault(); clickTile(r,c); }; el.onclick=e=>{ if(env.getHostWindow().PointerEvent) return; e.preventDefault(); clickTile(r,c); }; }); renderLinkLine(board); }
    function pointFor(board, p){
      const br=board.getBoundingClientRect();
      const clampR=Math.max(0,Math.min(st.rows-1,p.r)), clampC=Math.max(0,Math.min(st.cols-1,p.c));
      const cell=env.qs('.wb-link-tile[data-r="'+clampR+'"][data-c="'+clampC+'"]', board);
      if(cell){
        const cr=cell.getBoundingClientRect();
        const w=cr.width || Math.max(1, br.width / st.cols), h=cr.height || Math.max(1, br.height / st.rows);
        let x=cr.left - br.left + cr.width / 2, y=cr.top - br.top + cr.height / 2;
        if(p.c<0) x=cr.left - br.left - w / 2;
        else if(p.c>=st.cols) x=cr.right - br.left + w / 2;
        if(p.r<0) y=cr.top - br.top - h / 2;
        else if(p.r>=st.rows) y=cr.bottom - br.top + h / 2;
        return [x,y];
      }
      return [(p.c+.5)/st.cols*br.width,(p.r+.5)/st.rows*br.height];
    }
    function renderLinkLine(board){ if(!linePath) return; const br=board.getBoundingClientRect(); const pts=linePath.map(p=>pointFor(board,p)); const svg=env.getHostDocument().createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('class','wb-link-line '+lineKind); svg.setAttribute('viewBox','0 0 '+Math.max(1,br.width).toFixed(2)+' '+Math.max(1,br.height).toFixed(2)); svg.setAttribute('preserveAspectRatio','none'); svg.style.inset='0'; const path=env.getHostDocument().createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d','M '+pts.map(p=>p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' L ')); svg.appendChild(path); board.appendChild(svg); }
    function showCombo(n){ if(n<2) return; const wrap=env.qs('.wb-link-boardwrap',box), el=env.getHostDocument().createElement('div'); el.className='wb-link-combo '+(n>=10?'fire':n>=5?'hot':''); el.textContent='连击 ×'+n; wrap.appendChild(el); setTimeout(()=>el.remove(),900); }
    function showToast(text){ const wrap=env.qs('.wb-link-boardwrap',box), el=env.getHostDocument().createElement('div'); el.className='wb-link-toast'; el.textContent=text; wrap.appendChild(el); setTimeout(()=>el.remove(),1500); }
  }
  startLinkLink(state);
  return env.activeGameController || null;
}
