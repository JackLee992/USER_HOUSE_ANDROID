import { drawGameSprite, drawGameMaterial } from '../../../../standalone/game-art.js';
// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createClassicGame(env, state) {
  function startTetris(state) {
    const box = env.qs('#wb-gamebox');
    let destroyed = false;
	    let controlMode = state?.controlMode || (state?.controlsHidden ? 'swipe' : 'keys');
	    if(!['keys','swipe','tap'].includes(controlMode)) controlMode = 'swipe';
	    box.innerHTML = '<div class="wb-tetris-shell control-mode-' + controlMode + (controlMode !== 'keys' ? ' controls-hidden' : '') + '"><div class="wb-touch-togglebar"><button class="wb-btn wb-control-mode-btn" id="wb-tetris-toggle-keys" type="button"></button></div><div class="wb-tetris-playfield"><canvas class="wb-canvas wb-tetris-canvas" id="wb-canvas" width="300" height="600"></canvas><div class="wb-tetris-controls" aria-label="俄罗斯方块触控"><button class="wb-btn wb-arcade-btn up" id="wb-tetris-rotate" type="button" title="变换" aria-label="变换"></button><button class="wb-btn wb-arcade-btn left" id="wb-tetris-left" type="button" title="左移" aria-label="左移"></button><button class="wb-btn wb-arcade-btn down primary" id="wb-tetris-softdrop" type="button" title="加速" aria-label="加速"></button><button class="wb-btn wb-arcade-btn right" id="wb-tetris-right" type="button" title="右移" aria-label="右移"></button></div></div></div>';
    const c=env.qs('#wb-canvas'), ctx=c.getContext('2d'), W=10,H=20,S=30;
    const shapes=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]];
    let board = Array.isArray(state?.board) && state.board.length === H ? state.board : Array.from({length:H},()=>Array(W).fill(0));
    let piece = state?.piece || newPiece(), nextPiece = state?.nextPiece || newPiece(), score = state?.score || 0, tetrisSeen = state?.seen || {}, totalLines = state?.totalLines || 0, over=false;
    let details = state?.details || { lineClears:{1:0,2:0,3:0,4:0}, rescues:0 };
    let actionLineAt = state?.actionLineAt || {};
    const firstActionLineAt = Date.now() + 60000;
    if (!actionLineAt.rotate) actionLineAt.rotate = firstActionLineAt;
    if (!actionLineAt.soft_drop) actionLineAt.soft_drop = firstActionLineAt;
    let tetrisBgCache = null;
    env.setScore('tetris', score);
    function cloneShape(s){ return s.map(r=>r.slice()); }
    function newPiece(){ const s=cloneShape(shapes[Math.floor(Math.random()*shapes.length)]); return {s,x:3,y:0}; }
	    function save(){ if(!over && !destroyed) env.saveProgress('tetris', { board, piece, nextPiece, score, seen:tetrisSeen, totalLines, actionLineAt, controlsHidden: controlMode !== 'keys', controlMode, details }); }
    function markTetris(k){ if(!tetrisSeen[k]){ tetrisSeen[k]=1; env.speak('tetris',k); } }
    function markTimedTetrisAction(k){ const now=Date.now(); if(now >= (actionLineAt[k] || 0)){ env.speak('tetris', k); actionLineAt[k]=now + 60000; } }
    const keyHandler=env.getHostDocument().onkeydown=e=>{ if(destroyed || over || env.gamePaused) return; let changed=false, handledByTick=false; if(e.key==='ArrowLeft'||e.key==='a') changed=move(-1,0); if(e.key==='ArrowRight'||e.key==='d') changed=move(1,0); if(e.key==='ArrowDown'||e.key==='s') { markTimedTetrisAction('soft_drop'); tick(); changed=true; handledByTick=true; } if(e.key==='ArrowUp'||e.key==='w') { markTimedTetrisAction('rotate'); rot(); changed=true; } if(changed && !handledByTick){ draw(); save(); } };
    env.addSwipe(box, d=>{ if(controlMode !== 'swipe' || over || env.gamePaused) return; if(d==='down'){ markTimedTetrisAction('soft_drop'); tick(); return; } if(d==='left') move(-1,0); if(d==='right') move(1,0); if(d==='up'){ markTimedTetrisAction('rotate'); rot(); } draw(); save(); });
    env.addTapDirection(env.qs('.wb-tetris-playfield', box), () => controlMode === 'tap', d=>{ if(destroyed || over || env.gamePaused) return; if(d==='left') move(-1,0); if(d==='right') move(1,0); draw(); save(); }, { fourWay:false });
    const bindBtn = (sel, fn, eventKey) => { const btn=env.qs(sel, box); if(!btn) return; const press=e=>{ e.preventDefault(); if(destroyed||over||env.gamePaused) return; if(eventKey) markTimedTetrisAction(eventKey); fn(); if(eventKey !== 'soft_drop'){ draw(); save(); } env.scheduleFitGameSurface(); }; btn.onpointerdown=press; btn.onclick=e=>{ if(env.getHostWindow().PointerEvent) return; press(e); }; };
	    bindBtn('#wb-tetris-rotate', () => rot(), 'rotate');
	    bindBtn('#wb-tetris-left', () => move(-1,0), 'move');
	    bindBtn('#wb-tetris-right', () => move(1,0), 'move');
	    bindBtn('#wb-tetris-softdrop', () => tick(), 'soft_drop');
	    function syncTetrisKeyToggle(){
	      const shell = env.qs('.wb-tetris-shell', box);
	      if(shell){
	        shell.classList.remove('control-mode-keys','control-mode-swipe','control-mode-tap');
	        shell.classList.add('control-mode-' + controlMode);
	        shell.classList.toggle('controls-hidden', controlMode !== 'keys');
	      }
	      const btn = env.qs('#wb-tetris-toggle-keys', box);
	      if(btn) btn.textContent = '模式：' + env.controlModeLabel(controlMode);
	      env.scheduleFitGameSurface();
	    }
	    const tetrisToggle = env.qs('#wb-tetris-toggle-keys', box);
	    if(tetrisToggle) tetrisToggle.onclick = () => { controlMode = env.nextControlMode(controlMode, ['keys','swipe','tap']); syncTetrisKeyToggle(); save(); };
	    env.tetrisTimer=setInterval(tick,500); syncTetrisKeyToggle(); draw(); save();
    function hit(p){ return p.s.some((r,y)=>r.some((v,x)=>v && (p.x+x<0||p.x+x>=W||p.y+y>=H||board[p.y+y]?.[p.x+x]))); }
    function move(dx,dy){ if (env.gamePaused) return false; const p={s:piece.s,x:piece.x+dx,y:piece.y+dy}; if(!hit(p)){ piece=p; if(dx) markTetris('move'); return true; } return false; }
    function rot(){ const s=piece.s[0].map((_,i)=>piece.s.map(r=>r[i]).reverse()); const p={s,x:piece.x,y:piece.y}; if(!hit(p)) piece=p; }
    function pileHeight(){ const first=board.findIndex(r=>r.some(Boolean)); return first < 0 ? 0 : H - first; }
    function tick(){ if(destroyed || over || env.gamePaused) return; if(!move(0,1)){ piece.s.forEach((r,y)=>r.forEach((v,x)=>{ if(v&&piece.y+y>=0) board[piece.y+y][piece.x+x]=1; })); const beforeHeight=pileHeight(); let cleared=0; board=board.filter(r=>{ if(r.every(Boolean)){ cleared++; return false; } return true; }); while(board.length<H) board.unshift(Array(W).fill(0)); const afterHeight=pileHeight(); if(beforeHeight >= Math.ceil(H * 2 / 3) && afterHeight <= Math.floor(H / 3)) details.rescues++; if(cleared){ details.lineClears[cleared] = (details.lineClears[cleared] || 0) + 1; totalLines += cleared; score += [0,100,300,500,800][cleared]; env.setScore('tetris',score); env.speak('tetris','line_'+cleared); if(score>=500&&score<600) env.speak('tetris','score_500'); if(score>=1500&&score<1600) env.speak('tetris','score_1500'); const milestone = Math.floor(score / 500) * 500; if(milestone >= 2000 && !tetrisSeen['score_'+milestone]){ tetrisSeen['score_'+milestone]=1; env.speak('tetris','score_2000_plus'); } } if(!tetrisSeen.danger && board.slice(0,5).some(r=>r.some(Boolean))){ markTetris('danger'); } piece=nextPiece; nextPiece=newPiece(); if(hit(piece)){ over=true; clearInterval(env.tetrisTimer); env.speak('tetris','gameover'); env.showGameOver('tetris', '游戏结束', '本局分数：' + score + '分，消除' + totalLines + '行', null, { lines: totalLines, details }); return; } } draw(); save(); }
    function tetrisBackground(){
      const theme = env.settings().theme || 'day';
      if (tetrisBgCache && tetrisBgCache.key === theme) return tetrisBgCache.canvas;
      const off = env.getHostDocument().createElement('canvas');
      off.width = 300;
      off.height = 600;
      const bgCtx = off.getContext('2d');
      const pal=env.canvasThemePalette();
      const bg=bgCtx.createLinearGradient(0,0,0,600);
      bg.addColorStop(0,pal.top);
      bg.addColorStop(1,pal.bottom);
      bgCtx.fillStyle=bg;
      bgCtx.fillRect(0,0,300,600);
      bgCtx.fillStyle=pal.pattern;
      for(let y=0;y<600;y+=60) for(let x=0;x<300;x+=60) bgCtx.fillRect(x,y,30,30);
      bgCtx.strokeStyle=pal.grid;
      for(let x=1;x<W;x++){ bgCtx.beginPath(); bgCtx.moveTo(x*S,0); bgCtx.lineTo(x*S,600); bgCtx.stroke(); }
      for(let y=1;y<H;y++){ bgCtx.beginPath(); bgCtx.moveTo(0,y*S); bgCtx.lineTo(300,y*S); bgCtx.stroke(); }
      tetrisBgCache = { key:theme, canvas:off };
      return off;
    }
    function drawPreview(night, mono){ const panel={x:206,y:10,w:84,h:84}, s=nextPiece.s, cell=13; ctx.fillStyle=mono?'#f7f7f7':(night?'rgba(17,24,39,.88)':'rgba(255,250,242,.92)'); ctx.fillRect(panel.x,panel.y,panel.w,panel.h); ctx.strokeStyle=mono?'#111':(night?'rgba(255,255,255,.2)':'rgba(80,55,48,.22)'); ctx.strokeRect(panel.x+.5,panel.y+.5,panel.w-1,panel.h-1); ctx.fillStyle=mono?'#111':(night?'#f5eafa':'#5d4038'); ctx.font='12px Georgia, serif'; ctx.fillText('下一块', panel.x+10, panel.y+17); const ox=panel.x+(panel.w-s[0].length*cell)/2, oy=panel.y+34+(42-s.length*cell)/2; s.forEach((r,y)=>r.forEach((v,x)=>{ if(v){ ctx.fillStyle=mono?'#111111':'#ef8f7a'; ctx.fillRect(ox+x*cell+1,oy+y*cell+1,cell-2,cell-2); } })); }
    function draw(){ const night=env.isNightTheme(), mono=(env.settings().theme || 'day') === 'mono'; ctx.drawImage(tetrisBackground(),0,0); const drawCell=(x,y,col)=>{ ctx.fillStyle=col; ctx.fillRect(x*S+1,y*S+1,S-2,S-2); drawGameSprite(ctx,'candy-bubbles',col==='#9ccbbb'?2:5,x*S,y*S,S,S); }; board.forEach((r,y)=>r.forEach((v,x)=>v&&drawCell(x,y,mono?'#3b3b3b':'#9ccbbb'))); piece.s.forEach((r,y)=>r.forEach((v,x)=>v&&drawCell(piece.x+x,piece.y+y,mono?'#111111':'#ef8f7a'))); drawPreview(night, mono); ctx.fillStyle=mono?'#111':(night?'rgba(255,255,255,.92)':'rgba(80,55,48,.88)'); ctx.font='bold 16px system-ui, sans-serif'; ctx.fillText('消除 ' + totalLines + ' 行', 12, 24); }
    return {save, getState:()=>({mode:'classic',score,totalLines,board:board.map(r=>r.slice()),piece:{s:cloneShape(piece.s),x:piece.x,y:piece.y}}), destroy(){if(destroyed)return;destroyed=true;clearInterval(env.tetrisTimer);if(env.getHostDocument().onkeydown===keyHandler)env.getHostDocument().onkeydown=null;box.ontouchstart=box.ontouchend=box.ontouchcancel=null;if(tetrisBgCache){tetrisBgCache.canvas.width=tetrisBgCache.canvas.height=0;tetrisBgCache=null;}}};
  }
  return startTetris(state);
}
