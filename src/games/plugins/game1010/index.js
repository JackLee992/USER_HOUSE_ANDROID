import { drawGameMaterial } from '../../../../standalone/game-art.js';
import { getCanvasPixelRatio } from '../../../../standalone/performance.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'game1010';
export const GAME_VERSION = '1.0.1';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["canvasThemePalette","clearProgress","currentGame","gamePaused","getHostWindow","qs","saveProgress","setScore","settings","showGameOver","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startGame1010(state) {
    const box = env.qs('#wb-gamebox');
    box.innerHTML = '<div class="wb-1010-shell" style="width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px;touch-action:none;overflow:hidden;">'
      + '<div class="wb-1010-top" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;">'
      + '<div class="wb-popstar-stat">消除 <b id="wb-1010-lines">0</b></div><div class="wb-popstar-stat">空格 <b id="wb-1010-empty">100</b></div><div class="wb-popstar-stat">放置 <b id="wb-1010-placed">0</b></div></div>'
      + '<canvas class="wb-1010-canvas" id="wb-1010-canvas" style="justify-self:center;align-self:center;display:block;border:0;background:transparent;touch-action:none;user-select:none;box-sizing:border-box;border-radius:22px;box-shadow:0 10px 24px rgba(99,132,145,.13);"></canvas>'
      + '<div class="wb-1010-tools" style="display:flex;align-items:center;justify-content:center;gap:12px;min-height:42px;flex-wrap:wrap;padding-bottom:2px;">'
      + '<button type="button" class="wb-btn" id="wb-1010-regen" title="重新生成" style="min-width:58px;height:36px;border-radius:999px;padding:0 12px;font-size:17px;">↻ <span id="wb-1010-regen-left">3</span></button>'
      + '<button type="button" class="wb-btn" id="wb-1010-hammer" title="小锤子" style="min-width:58px;height:36px;border-radius:999px;padding:0 12px;font-size:17px;">🔨 <span id="wb-1010-hammer-left">3</span></button>'
      + '<span class="wb-muted" id="wb-1010-tip">拖动方块到棋盘</span></div></div>';
    const c = env.qs('#wb-1010-canvas'), ctx = c.getContext('2d');
    const N = 10;
    const palette = ['#f49aa4','#efbd80','#eadb8b','#96d6a8','#8fc6e8','#b6a4df','#eda6cd','#8bd5ca'];
    const shapes = [
      [[0,0]], [[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,0],[2,0]], [[0,0],[0,1],[0,2]],
      [[0,0],[1,0],[2,0],[3,0]], [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0],[4,0]], [[0,0],[0,1],[0,2],[0,3],[0,4]],
      [[0,0],[1,0],[0,1],[1,1]], [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
      [[0,0],[0,1],[1,1]], [[1,0],[0,1],[1,1]], [[0,0],[1,0],[0,1]], [[0,0],[1,0],[1,1]],
      [[0,0],[0,1],[0,2],[1,2],[2,2]], [[2,0],[2,1],[0,2],[1,2],[2,2]], [[0,0],[1,0],[2,0],[0,1],[0,2]], [[0,0],[1,0],[2,0],[2,1],[2,2]]
    ];
    const blankGrid = () => Array.from({ length:N }, () => Array(N).fill(null));
    const cloneGrid = g => Array.isArray(g) ? g.map(row => Array.isArray(row) ? row.slice(0, N) : Array(N).fill(null)) : blankGrid();
    let grid = cloneGrid(state?.grid);
    let score = Number(state?.score || 0), regen = Math.max(0, Math.min(3, Number(state?.regen == null ? 3 : state.regen))), hammers = Math.max(0, Math.min(3, Number(state?.hammers == null ? 3 : state.hammers)));
    let pieces = Array.isArray(state?.pieces) ? state.pieces.map(p => p && { shape:p.shape, color:p.color, used:!!p.used }) : [];
    let details = Object.assign({ score, clearedLines:0, placements:0, maxClear:0, regenUsed:0, hammerUsed:0, lowSpaceCount:0, toolExhaustLose:false, lastToolPlacement:-1 }, state?.details || {});
    let seen = Object.assign({ scoreMilestone:Math.floor(score / 1000), lowTick:'' }, state?.seen || {});
    let hammerMode = false, dragging = null, hover = null, W = 360, H = 520, board = { x:20, y:20, size:320, cell:32 }, slots = [], over = false;
    const rand = n => Math.floor(Math.random() * n);
    const normalizePiece = p => p && Array.isArray(p.shape) ? p : makePiece();
    function makePiece() { return { shape:shapes[rand(shapes.length)].map(x => x.slice()), color:palette[rand(palette.length)], used:false }; }
    function newBatch() { pieces = [makePiece(), makePiece(), makePiece()]; }
    if (pieces.length !== 3) newBatch(); else pieces = pieces.map(normalizePiece);
    function pieceBounds(shape) {
      const maxX = Math.max(...shape.map(p => p[0])), maxY = Math.max(...shape.map(p => p[1]));
      return { w:maxX + 1, h:maxY + 1 };
    }
    function emptyCount() { let n = 0; for (let r=0;r<N;r++) for (let col=0;col<N;col++) if (!grid[r][col]) n++; return n; }
    function canPlace(piece, row, col) {
      if (!piece || piece.used) return false;
      return piece.shape.every(([x,y]) => row + y >= 0 && row + y < N && col + x >= 0 && col + x < N && !grid[row + y][col + x]);
    }
    function pieceFits(piece) {
      if (!piece || piece.used) return true;
      for (let r=0;r<N;r++) for (let col=0;col<N;col++) if (canPlace(piece, r, col)) return true;
      return false;
    }
    function blocked() { return pieces.filter(p => p && !p.used).some(p => !pieceFits(p)); }
    function save() { env.saveProgress('game1010', { grid, pieces, score, regen, hammers, details, seen }); }
    function addScore(add) {
      if (!add) return;
      score += add; details.score = score; env.setScore('game1010', score);
      const m = Math.floor(score / 1000);
      if (m > (seen.scoreMilestone || 0)) { seen.scoreMilestone = m; env.speak('game1010','score_1000'); }
    }
    function updateUI() {
      const lines = env.qs('#wb-1010-lines'), empty = env.qs('#wb-1010-empty'), placed = env.qs('#wb-1010-placed');
      if (lines) lines.textContent = String(details.clearedLines || 0);
      if (empty) empty.textContent = String(emptyCount());
      if (placed) placed.textContent = String(details.placements || 0);
      const rb = env.qs('#wb-1010-regen'), hb = env.qs('#wb-1010-hammer'), re = env.qs('#wb-1010-regen-left'), he = env.qs('#wb-1010-hammer-left'), tip = env.qs('#wb-1010-tip');
      if (re) re.textContent = regen; if (he) he.textContent = hammers;
      const isBlocked = blocked();
      if (rb) { rb.disabled = over || regen <= 0; rb.classList.toggle('primary', isBlocked && regen > 0); }
      if (hb) { hb.disabled = over || hammers <= 0; hb.classList.toggle('primary', hammerMode || (isBlocked && hammers > 0)); }
      if (tip) tip.textContent = hammerMode ? '选择一个已有格子敲掉' : (isBlocked && (regen || hammers) ? '有方块放不下了，可以用道具救场' : '拖动方块到棋盘，行列满格即消除');
    }
    function resize() {
      const rect = box.getBoundingClientRect();
      const topEl = env.qs('.wb-1010-top', box), toolsEl = env.qs('.wb-1010-tools', box);
      const topH = topEl ? topEl.getBoundingClientRect().height : 34;
      const toolsH = toolsEl ? toolsEl.getBoundingClientRect().height : 44;
      const rawW = Math.max(300, Math.floor(rect.width || 360));
      const availableH = Math.floor((rect.height || 540) - topH - toolsH - 24);
      H = Math.max(220, availableH);
      const gap = Math.max(8, Math.min(14, rawW * .03));
      const slotH = Math.max(64, Math.min(96, H * .18));
      let maxBoard = Math.min(rawW - gap * 2, H - slotH - gap * 3);
      maxBoard = Math.max(150, Math.floor(maxBoard / N) * N);
      W = Math.min(rawW, Math.floor(maxBoard + gap * 2));
      const pixelRatio = getCanvasPixelRatio(env.getHostWindow());
      c.width = Math.floor(W * pixelRatio); c.height = Math.floor(H * pixelRatio);
      c.style.width = W + 'px'; c.style.height = H + 'px';
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      board.size = Math.floor(Math.min(maxBoard, W - gap * 2) / N) * N;
      board.cell = board.size / N;
      board.x = Math.floor((W - board.size) / 2);
      board.y = gap;
      const slotW = (W - gap * 4) / 3, y = board.y + board.size + gap;
      slots = [0,1,2].map(i => ({ x:gap + i * (slotW + gap), y, w:slotW, h:Math.max(58, Math.min(slotH, H - y - gap)) }));
      draw();
    }
    function roundRect1010(ctx,x,y,w,h,r){ if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); } else { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); } }
    function boardTheme1010() {
      const theme = env.settings().theme || 'day';
      if (theme === 'mono') return { bg1:'#f7f7f7', bg2:'#d8d8d8', frame:'#bdbdbd', frame2:'#eeeeee', cellA:'#f8f8f8', cellB:'#ececec', edge:'#e1e1e1', corner:'#d2d2d2', line:'rgba(0,0,0,.20)', dot:'rgba(0,0,0,.12)' };
      if (theme === 'night') return { bg1:'#1b1020', bg2:'#120b17', frame:'#2a1830', frame2:'#211426', cellA:'#24162a', cellB:'#1c1121', edge:'#2d1a34', corner:'#38213c', line:'rgba(244,194,215,.13)', dot:'rgba(244,194,215,.12)' };
      if (theme === 'arcade') return { bg1:'#FFFFFF', bg2:'#D8F0FF', frame:'#E5F4FF', frame2:'#FFFDF8', cellA:'#FFFDF8', cellB:'#F3FAFF', edge:'#E4F4FF', corner:'#FCEAF1', line:'rgba(95,168,215,.18)', dot:'rgba(95,168,215,.14)' };
      if (theme === 'spring') return { bg1:'#F4F1D3', bg2:'#D8EDB2', frame:'#B98A54', frame2:'#F6E7C8', cellA:'#F6E7C8', cellB:'#EAF6D4', edge:'#D8EDB2', corner:'#E3C56A', line:'rgba(76,59,42,.18)', dot:'rgba(111,168,90,.18)' };
      if (theme === 'cyber') return { bg1:'#101A1D', bg2:'#0D1512', frame:'#14201B', frame2:'#24352D', cellA:'#14201B', cellB:'#101A1D', edge:'#1b2c28', corner:'rgba(255,79,163,.20)', line:'rgba(25,211,197,.20)', dot:'rgba(241,232,91,.18)' };
      if (theme === 'tavern') {
        const pal = env.canvasThemePalette();
        return { bg1:pal.top, bg2:pal.bottom, frame:pal.mid, frame2:pal.top, cellA:pal.top, cellB:pal.mid, edge:pal.mid, corner:pal.border, line:pal.grid, dot:pal.pattern };
      }
      return { bg1:'#fff7fb', bg2:'#fff2e6', frame:'#f4c8d6', frame2:'#fffefd', cellA:'#fff9fb', cellB:'#fff1f5', edge:'#fde7ee', corner:'#ffeaf1', line:'rgba(174,82,115,.16)', dot:'rgba(216,112,147,.12)' };
    }
    function drawBlock(x, y, size, color, alpha, compact) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      const pad = compact ? Math.max(1, size * .035) : Math.max(2, size * .065), r = Math.max(3, size * .15);
      ctx.fillStyle = color; roundRect1010(ctx, x + pad, y + pad, size - pad * 2, size - pad * 2, r); ctx.fill();
      ctx.save();roundRect1010(ctx,x+pad,y+pad,size-pad*2,size-pad*2,r);ctx.clip();drawGameMaterial(ctx,3,x+pad,y+pad,size-pad*2,size-pad*2,.28);ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.16)'; roundRect1010(ctx, x + pad * 1.55, y + pad * 1.55, size - pad * 3.1, Math.max(2, (size - pad * 3.1) * .22), r * .7); ctx.fill();
      ctx.strokeStyle = 'rgba(80,103,116,.16)'; ctx.lineWidth = 1; roundRect1010(ctx, x + pad + .5, y + pad + .5, size - pad * 2 - 1, size - pad * 2 - 1, r); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function drawPiece(piece, x, y, unit, alpha, compact) {
      if (!piece || piece.used) return;
      piece.shape.forEach(([px,py]) => drawBlock(x + px * unit, y + py * unit, unit, piece.color, alpha, compact));
    }
    function draw() {
      ctx.clearRect(0,0,W,H);
      const theme = boardTheme1010();
      const bg = ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,theme.bg1); bg.addColorStop(1,theme.bg2); ctx.fillStyle = bg; roundRect1010(ctx,0,0,W,H,22); ctx.fill();
      ctx.fillStyle = theme.frame; roundRect1010(ctx, board.x - 10, board.y - 10, board.size + 20, board.size + 20, 18); ctx.fill();
      ctx.fillStyle = theme.frame2; roundRect1010(ctx, board.x - 6, board.y - 6, board.size + 12, board.size + 12, 14); ctx.fill();
      ctx.fillStyle = theme.dot;
      for (let py = board.y - 3; py <= board.y + board.size + 3; py += Math.max(10, board.cell * .62)) {
        for (let px = board.x - 3; px <= board.x + board.size + 3; px += Math.max(10, board.cell * .62)) {
          ctx.beginPath(); ctx.arc(px, py, Math.max(1, board.cell * .035), 0, Math.PI * 2); ctx.fill();
        }
      }
      for (let r=0;r<N;r++) for (let col=0;col<N;col++) {
        const x = board.x + col * board.cell, y = board.y + r * board.cell;
        const isCorner = (r < 2 || r > 7) && (col < 2 || col > 7);
        const isEdge = !isCorner && (r === 0 || r === 9 || col === 0 || col === 9);
        ctx.fillStyle = isCorner ? theme.corner : (isEdge ? theme.edge : ((r + col) % 2 ? theme.cellA : theme.cellB));
        roundRect1010(ctx, x + 1.2, y + 1.2, board.cell - 2.4, board.cell - 2.4, Math.max(4, board.cell * .18)); ctx.fill();
        ctx.strokeStyle = theme.line; ctx.lineWidth = 1; roundRect1010(ctx, x + 1.2, y + 1.2, board.cell - 2.4, board.cell - 2.4, Math.max(4, board.cell * .18)); ctx.stroke();
        if (grid[r][col]) drawBlock(x, y, board.cell, grid[r][col], 1, false);
      }
      if (hover && dragging) {
        const ok = canPlace(dragging.piece, hover.r, hover.c);
        dragging.piece.shape.forEach(([px,py]) => {
          const r = hover.r + py, col = hover.c + px;
          if (r < 0 || r >= N || col < 0 || col >= N) return;
          ctx.fillStyle = ok ? 'rgba(80,190,128,.36)' : 'rgba(239,104,104,.42)';
          roundRect1010(ctx, board.x + col * board.cell + 3, board.y + r * board.cell + 3, board.cell - 6, board.cell - 6, Math.max(4, board.cell * .16)); ctx.fill();
        });
      }
      slots.forEach((slot, i) => {
        ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.strokeStyle = 'rgba(116,146,154,.18)'; ctx.lineWidth = 2;
        roundRect1010(ctx, slot.x, slot.y, slot.w, slot.h, 16); ctx.fill(); ctx.stroke();
        const p = pieces[i];
        if (p && !p.used && (!dragging || dragging.index !== i)) {
          const b = pieceBounds(p.shape), unit = Math.floor(Math.min(board.cell * .7, (slot.w - 12) / b.w, (slot.h - 12) / b.h));
          drawPiece(p, slot.x + Math.round((slot.w - b.w * unit) / 2), slot.y + Math.round((slot.h - b.h * unit) / 2), unit, 1, true);
        }
      });
      if (dragging) {
        drawPiece(dragging.piece, dragging.x - dragging.ox - dragging.unit * 1.25, dragging.y - dragging.oy + dragging.unit * .8, dragging.unit, .95, true);
      }
    }
    function shade(hex, amt) { const n=parseInt(hex.slice(1),16), r=Math.round(Math.max(0,Math.min(255,(n>>16)+255*amt))), g=Math.round(Math.max(0,Math.min(255,((n>>8)&255)+255*amt))), b=Math.round(Math.max(0,Math.min(255,(n&255)+255*amt))); return 'rgb('+r+','+g+','+b+')'; }
    function scanClear() {
      const rows = [], cols = [];
      for (let r=0;r<N;r++) if (grid[r].every(Boolean)) rows.push(r);
      for (let col=0;col<N;col++) { let full = true; for (let r=0;r<N;r++) if (!grid[r][col]) { full = false; break; } if (full) cols.push(col); }
      if (!rows.length && !cols.length) return 0;
      rows.forEach(r => { for (let col=0;col<N;col++) grid[r][col] = null; });
      cols.forEach(col => { for (let r=0;r<N;r++) grid[r][col] = null; });
      const n = rows.length + cols.length;
      details.clearedLines += n; details.maxClear = Math.max(details.maxClear || 0, n);
      addScore(n * 100 + Math.max(0, n - 1) * 50);
      if (n > 3) env.speak('game1010','clear_3'); else if (Math.random() < .3) env.speak('game1010','clear');
      return n;
    }
    function checkLowSpace() {
      if (emptyCount() >= 5) return;
      const tick = String(details.placements || 0) + ':' + String(details.regenUsed || 0) + ':' + String(details.hammerUsed || 0);
      if (seen.lowTick !== tick) { seen.lowTick = tick; details.lowSpaceCount++; env.speak('game1010','low_space'); }
    }
    function checkEnd() {
      const isBlocked = blocked();
      if (isBlocked && regen <= 0 && hammers <= 0) {
        details.toolExhaustLose = Number(details.lastToolPlacement) === Number(details.placements || 0);
        endGame();
        return true;
      }
      updateUI(); draw(); save();
      return false;
    }
    function placePiece(index, row, col) {
      const p = pieces[index];
      if (!canPlace(p, row, col)) return false;
      p.shape.forEach(([x,y]) => { grid[row + y][col + x] = p.color; });
      p.used = true; details.placements++; addScore(p.shape.length); env.speak('game1010','place');
      scanClear();
      if (pieces.every(x => x && x.used)) newBatch();
      checkLowSpace();
      updateUI(); draw(); save(); checkEnd();
      return true;
    }
    function endGame() {
      if (over) return;
      over = true; env.speak('game1010','gameover'); env.clearProgress('game1010'); env.setScore('game1010', score);
      env.showGameOver('game1010', '游戏结束', '本局分数：' + score + '分，消除' + (details.clearedLines || 0) + '行列，放置' + (details.placements || 0) + '块', null, Object.assign({ score }, details, { details }));
    }
    function pointer(e) { const r=c.getBoundingClientRect(), t=e.touches&&e.touches[0] || e.changedTouches&&e.changedTouches[0] || e; return { x:t.clientX-r.left, y:t.clientY-r.top }; }
    function boardCell(x, y) { return { c:Math.floor((x - board.x) / board.cell), r:Math.floor((y - board.y) / board.cell) }; }
    function hammerAt(x, y) {
      const pos = boardCell(x, y);
      if (pos.r < 0 || pos.r >= N || pos.c < 0 || pos.c >= N || !grid[pos.r][pos.c]) return false;
      grid[pos.r][pos.c] = null; hammers--; details.hammerUsed++; details.lastToolPlacement = details.placements || 0; hammerMode = false; env.speak('game1010','tool');
      checkLowSpace(); updateUI(); draw(); save(); checkEnd();
      return true;
    }
    c.addEventListener('pointerdown', e => {
      if (env.gamePaused || over) return;
      const p = pointer(e);
      if (hammerMode) { hammerAt(p.x, p.y); e.preventDefault(); return; }
      const idx = slots.findIndex(s => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
      if (idx < 0 || !pieces[idx] || pieces[idx].used) return;
      const b = pieceBounds(pieces[idx].shape), slot = slots[idx], unit = Math.floor(Math.min(board.cell * .7, (slot.w - 12) / b.w, (slot.h - 12) / b.h));
      const px = slot.x + (slot.w - b.w * unit) / 2, py = slot.y + (slot.h - b.h * unit) / 2;
      dragging = { index:idx, piece:pieces[idx], x:p.x, y:p.y, ox:p.x - px, oy:p.y - py, unit };
      e.preventDefault(); draw();
    });
    c.addEventListener('pointermove', e => {
      if (!dragging) return;
      const p = pointer(e); dragging.x = p.x; dragging.y = p.y;
      const topLeftX = p.x - dragging.ox - dragging.unit * 1.25, topLeftY = p.y - dragging.oy + dragging.unit * .8;
      hover = boardCell(topLeftX + dragging.unit * .45, topLeftY + dragging.unit * .45);
      e.preventDefault(); draw();
    });
    c.addEventListener('pointerup', e => {
      if (!dragging) return;
      const d = dragging, h = hover; dragging = null; hover = null;
      if (h && placePiece(d.index, h.r, h.c)) { e.preventDefault(); return; }
      e.preventDefault(); draw();
    });
    c.addEventListener('pointercancel', () => { dragging = null; hover = null; draw(); });
    env.qs('#wb-1010-regen').onclick = () => {
      if (env.gamePaused || over || regen <= 0) return;
      regen--; details.regenUsed++; details.lastToolPlacement = details.placements || 0; newBatch(); hammerMode = false; env.speak('game1010','tool');
      updateUI(); draw(); save(); checkEnd();
    };
    env.qs('#wb-1010-hammer').onclick = () => {
      if (env.gamePaused || over || hammers <= 0) return;
      hammerMode = !hammerMode; env.speak('game1010','tool'); updateUI(); draw(); save();
    };
    resize(); env.setScore('game1010', score); updateUI(); checkLowSpace(); checkEnd();
    env.getHostWindow().addEventListener('resize', () => { if(env.currentGame === 'game1010'){ resize(); draw(); } }, { passive:true });
  }
  startGame1010(state);
  return env.activeGameController || null;
}
