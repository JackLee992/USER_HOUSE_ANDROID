import { drawGameSprite, drawGameMaterial } from '../../../../standalone/game-art.js';
import { getCanvasPixelRatio } from '../../../../standalone/performance.js';
import { createBubbleArt, BUBBLE_PALETTE } from './bubble-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'paopao';
export const GAME_VERSION = '1.0.2';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["activeGameController","clearProgress","currentGame","gamePaused","getHostDocument","getHostWindow","qs","saveProgress","setScore","showGameOver","speak","toast"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startPaopao(state) {
    const box = env.qs('#wb-gamebox');
    box.innerHTML = '<div class="wb-paopao-shell" style="position:relative;width:100%;height:100%;min-height:0;display:grid;place-items:center;touch-action:none;overflow:hidden;"><canvas class="wb-paopao-canvas" id="wb-paopao-canvas" style="display:block;border:0;background:transparent;touch-action:none;user-select:none;box-sizing:border-box;border-radius:0;box-shadow:0 12px 30px rgba(87,128,150,.18);"></canvas><button type="button" class="wb-btn primary" id="wb-paopao-bomb" style="position:absolute;left:12px;bottom:12px;min-width:54px;height:34px;padding:0 10px;border-radius:999px;z-index:5;" title="炸弹">💣 <span id="wb-paopao-bombs">5</span></button><button type="button" id="wb-paopao-swap" style="position:absolute;width:28px;height:28px;padding:0;border-radius:999px;border:1px solid rgba(51,78,92,.38);background:transparent;box-shadow:none;color:rgba(51,78,92,.72);font-size:22px;line-height:1;z-index:5;cursor:pointer;" title="切换当前泡泡和下一个泡泡" aria-label="切换当前泡泡和下一个泡泡">⇄</button></div>';
    const c = env.qs('#wb-paopao-canvas'), ctx = c.getContext('2d');
    const colors = ['red','yellow','blue','green','purple','orange'];
    const palette = BUBBLE_PALETTE;
    const N = 12, ROWS_INIT = 7, VISIBLE_ROWS = 16;
    let W = 360, H = 560, D = 32, R = 16, rowH = 27.7, lineY = 470, boardPad = 9, launch = { x:180, y:520 };
    let bubbles = Array.isArray(state?.bubbles) ? state.bubbles.map(b => Object.assign({}, b)) : [];
    let falling = Array.isArray(state?.falling) ? state.falling : [];
    let popping = [];
    let score = Number(state?.score || 0), shots = Number(state?.shots || 0), pushes = Number(state?.pushes || 0), shotsSincePush = Number(state?.shotsSincePush ?? (Number(state?.shots || 0) % Math.max(5, 10 - Math.floor(Number(state?.pushes || 0) / 2)))), bombs = Math.max(0, Math.min(5, Number(state?.bombs == null ? 5 : state.bombs)));
    let current = state?.current || '', next = state?.next || '', armedBomb = !!state?.armedBomb;
    let flying = null, aiming = false, resolving = false, aimAngle = 0, over = false, raf = 0, lastT = null, destroyed = false, turnTimer = null;
    const bubbleArt = createBubbleArt({window:env.getHostWindow(),document:env.getHostDocument(),onReady:()=>{
      if(!destroyed&&!over&&env.currentGame==='paopao')draw();
    }});
    let seen = Object.assign({ aim:false, dangerTick:0, scoreMilestone:Math.floor(score/1000) }, state?.seen || {});
    let details = Object.assign({ shots:0, pushes:0, cleared:0, dropTotal:0, dangerCount:0, bombUsed:0, bombBad:false, highStreak:0, maxHighStreak:0, amazingClear:false, clearAllCount:0 }, state?.details || {});
    const cap = row => N;
    const key = (r,col) => r + ':' + col;
    const byKey = () => { const m = new Map(); bubbles.forEach(b => { if (!b.dead) m.set(key(b.r,b.c), b); }); return m; };
    const valid = (r,col) => r >= 0 && col >= 0 && col < cap(r);
    const rowParity = r => Math.abs(r - pushes) % 2;
    const baseCenter = (r,col) => ({ x:boardPad + (rowParity(r) ? D / 2 : 0) + col * D + R, y:boardPad + r * rowH + R });
    const center = (r,col,b) => baseCenter(r,col);
    const hitDistance = () => D * .86;
    const liveColors = () => { const a = [...new Set(bubbles.filter(b => !b.dead).map(b => b.color))]; return a.length ? a : colors.slice(); };
    const rand = arr => arr[Math.floor(Math.random() * arr.length)];
    const randomColor = () => rand(colors);
    function seed() {
      bubbles = [];
      for (let r=0; r<ROWS_INIT; r++) for (let col=0; col<cap(r); col++) bubbles.push({ r, c:col, color:rand(colors) });
      current = rand(colors); next = rand(colors); score = shots = pushes = shotsSincePush = 0; bombs = 5; armedBomb = false; falling = []; details = { shots:0, pushes:0, cleared:0, dropTotal:0, dangerCount:0, bombUsed:0, bombBad:false, highStreak:0, maxHighStreak:0, amazingClear:false, clearAllCount:0 }; seen = { aim:false, dangerTick:0, scoreMilestone:0 };
    }
    if (!bubbles.length) seed();
    if (!current) current = randomColor();
    if (!next) next = randomColor();
    function resize() {
      const rect = box.getBoundingClientRect();
      const rawW = Math.max(1, Math.floor(rect.width || 360));
      const rawH = Math.max(460, Math.floor(rect.height || 560));
      boardPad = Math.max(8, Math.min(12, rawW * .025));
      const maxW = Math.min(rawW - 4, 468);
      D = Math.floor(Math.min(30, (maxW - boardPad * 2) / (N + .5), (rawH - 86 - boardPad * 2) / (VISIBLE_ROWS * 0.8660254 + 3.08)));
      D = Math.max(19, D); R = D / 2; rowH = D * 0.8660254;
      W = Math.floor(D * (N + .5) + boardPad * 2); lineY = Math.floor(boardPad + R + rowH * VISIBLE_ROWS + D * .1);
      launch = { x:W / 2, y:Math.floor(lineY + D * 1.82) };
      H = Math.floor(launch.y + D * 1.22);
      const pixelRatio = getCanvasPixelRatio(env.getHostWindow());
      c.width = Math.floor(W * pixelRatio); c.height = Math.floor(H * pixelRatio);
      c.style.width = W + 'px'; c.style.height = H + 'px';
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const bombBtn = env.qs('#wb-paopao-bomb');
      if (bombBtn) {
        const canvasLeft = (rawW - W) / 2;
        const canvasTop = (rawH - H) / 2;
        bombBtn.style.left = Math.round(canvasLeft + boardPad + 1) + 'px';
        bombBtn.style.top = Math.round(canvasTop + H - D * 3.1) + 'px';
        bombBtn.style.bottom = 'auto';
      }
      const swapBtn = env.qs('#wb-paopao-swap');
      if (swapBtn) {
        const canvasLeft = (rawW - W) / 2;
        const canvasTop = (rawH - H) / 2;
        const arcR = R * 2.45;
        swapBtn.style.left = Math.round(canvasLeft + launch.x + arcR + D * .38) + 'px';
        swapBtn.style.top = Math.round(canvasTop + launch.y - D * 1.32) + 'px';
      }
    }
    function save() { env.saveProgress('paopao', { bubbles, falling, score, shots, pushes, shotsSincePush, bombs, current, next, armedBomb, seen, details }); }
    function updateScore(add) {
      if (!add) return;
      score += add; env.setScore('paopao', score);
      const m = Math.floor(score / 1000);
      if (m > (seen.scoreMilestone || 0)) { seen.scoreMilestone = m; env.speak('paopao','score_1000'); }
    }
    function neighbors(r,col) {
      const out = [[r,col-1],[r,col+1]];
      if (rowParity(r) === 0) out.push([r-1,col-1],[r-1,col],[r+1,col-1],[r+1,col]);
      else out.push([r-1,col],[r-1,col+1],[r+1,col],[r+1,col+1]);
      return out.filter(x => valid(x[0], x[1]));
    }
    function nearestSlot(x,y,hit) {
      const occ = byKey(); let best = null, bd = Infinity;
      const candidates = [];
      if (hit) neighbors(hit.r, hit.c).forEach(n => candidates.push({ r:n[0], c:n[1] }));
      if (!hit || !candidates.length) {
        const maxRow = Math.max(8, ...bubbles.map(b => b.r + 2));
        for (let r=0; r<=maxRow; r++) for (let col=0; col<cap(r); col++) candidates.push({ r, c:col });
      }
      candidates.forEach(slot => {
        if (!valid(slot.r, slot.c) || occ.has(key(slot.r, slot.c))) return;
        const p = baseCenter(slot.r, slot.c), d = (p.x-x)*(p.x-x)+(p.y-y)*(p.y-y);
        if (d < bd) { bd = d; best = { r:slot.r, c:slot.c }; }
      });
      if (best) return best;
      const maxRow = Math.max(8, ...bubbles.map(b => b.r + 2));
      for (let r=0; r<=maxRow; r++) for (let col=0; col<cap(r); col++) if (!occ.has(key(r,col))) {
        const p = baseCenter(r,col), d = (p.x-x)*(p.x-x)+(p.y-y)*(p.y-y);
        if (d < bd) { bd = d; best = { r, c:col }; }
      }
      return best || { r:0, c:0 };
    }
    function cluster(start, sameColor) {
      const occ = byKey(), s = occ.get(key(start.r,start.c)); if (!s) return [];
      const q = [s], seenK = new Set([key(s.r,s.c)]), out = [];
      while(q.length){ const b=q.shift(); out.push(b); neighbors(b.r,b.c).forEach(n => { const k=key(n[0],n[1]), nb=occ.get(k); if(!nb||seenK.has(k)) return; if(sameColor && nb.color !== s.color) return; seenK.add(k); q.push(nb); }); }
      return out;
    }
    function supportedSet() {
      const occ = byKey(), q = [], seenK = new Set();
      bubbles.forEach(b => { if (b.r === 0 && !b.dead) { const k=key(b.r,b.c); seenK.add(k); q.push(b); } });
      while(q.length){ const b=q.shift(); neighbors(b.r,b.c).forEach(n => { const k=key(n[0],n[1]), nb=occ.get(k); if(nb && !seenK.has(k)){ seenK.add(k); q.push(nb); } }); }
      return seenK;
    }
    function popBubbles(list, fall) {
      list.forEach((b,i) => {
        b.dead = true;
        const p = center(b.r,b.c,b);
        if (fall) falling.push({ x:p.x, y:p.y, color:b.color, vy:2 + i*.18 });
        else popping.push({ x:p.x, y:p.y, color:b.color, life:0, seed:(i % 5) * .7 });
      });
      bubbles = bubbles.filter(b => !b.dead);
    }
    function checkDanger() {
      const near = bubbles.some(b => center(b.r,b.c,b).y + R > lineY - D * 1.15);
      if (near && shots !== seen.dangerTick) { seen.dangerTick = shots; details.dangerCount++; env.speak('paopao','danger'); }
      if (bubbles.some(b => center(b.r,b.c,b).y + R >= lineY)) endGame();
    }
    function resolveAt(slot, color, isBomb) {
      if (over || resolving) return;
      resolving = true;
      flying = null;
      const b = { r:slot.r, c:slot.c, color:isBomb ? 'bomb' : color };
      bubbles.push(b);
      let gained = 0, clearCount = 0, dropCount = 0, bombRemoved = 0;
      if (isBomb) {
        env.speak('paopao','bomb'); details.bombUsed++;
        const occ = byKey(), q = [{ r:b.r, c:b.c, d:0 }], seenB = new Set([key(b.r,b.c)]), hit = [];
        while(q.length){ const it=q.shift(), nb=occ.get(key(it.r,it.c)); if(nb) hit.push(nb); if(it.d>=2) continue; neighbors(it.r,it.c).forEach(n => { const k=key(n[0],n[1]); if(!seenB.has(k)){ seenB.add(k); q.push({ r:n[0], c:n[1], d:it.d+1 }); } }); }
        bombRemoved = hit.length; if (bombRemoved <= 4) details.bombBad = true;
        popBubbles(hit, false); clearCount = hit.length; gained += clearCount * 10;
      } else {
        const same = cluster(b, true);
        if (same.length >= 3) { popBubbles(same, false); clearCount = same.length; details.cleared += clearCount; gained += clearCount * 10; env.speak('paopao', clearCount > 5 ? 'clear_5' : 'clear'); }
      }
      const applyDrop = list => {
        if (!list.length) return;
        const start = dropCount;
        dropCount += list.length;
        details.dropTotal += list.length;
        popBubbles(list, true);
        list.forEach(() => { gained += 30; });
      };
      const anchored = supportedSet();
      const hanging = bubbles.filter(x => !anchored.has(key(x.r, x.c)));
      applyDrop(hanging);
      if (dropCount) env.speak('paopao','drop');
      if (gained > 50) details.highStreak++; else details.highStreak = 0;
      details.maxHighStreak = Math.max(details.maxHighStreak || 0, details.highStreak || 0);
      updateScore(gained);
      if((clearCount || dropCount || bombRemoved) && bubbles.length === 0){ details.amazingClear = true; details.clearAllCount = (details.clearAllCount || 0) + 1; env.toast('竟然全部消除！'); }
      shots++; shotsSincePush++; details.shots = shots;
      const shouldPush = shotsSincePush >= pushInterval();
      const finishTurn = () => {
        if (destroyed || over) return;
        if (env.gamePaused) { turnTimer = setTimeout(finishTurn, 50); return; }
        turnTimer = null;
        if (shouldPush) pushDown();
        if (over) return;
        if (bubbles.length <= 5) pushDown();
        if (over) return;
        resolving = false;
        checkDanger();
        if (over) return;
        save(); updateBombUI(); draw();
      };
      if (shouldPush && (clearCount || dropCount || bombRemoved || popping.length)) turnTimer = setTimeout(finishTurn, 360);
      else finishTurn();
    }
    function pushInterval() {
      return Math.max(5, 10 - Math.floor(pushes / 2));
    }
    function pushDown() {
      const pool = colors;
      pushes++; details.pushes = pushes;
      shotsSincePush = 0;
      bubbles.forEach(b => { b.r++; delete b.xOffset; });
      for (let col=0; col<cap(0); col++) bubbles.push({ r:0, c:col, color:rand(pool) });
      checkDanger();
    }
    function endGame() {
      if (over) return;
      over = true; env.speak('paopao','gameover'); env.clearProgress('paopao'); env.setScore('paopao', score);
      env.showGameOver('paopao', '游戏结束', '本局分数：' + score + '分，发射' + shots + '次，下压' + pushes + '行', null, { score, dangerCount:details.dangerCount, dropTotal:details.dropTotal, maxHighStreak:details.maxHighStreak, bombBad:details.bombBad, details });
    }
    function roundRectPaopao(ctx,x,y,w,h,r){ if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); } else { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); } }
    function drawBubble(x,y,color,scale) {
      scale = scale || 1; const rr = R * scale;
      if(color!=='bomb'&&bubbleArt.draw(ctx,color,x,y,rr*2))return;
      if(color==='bomb'&&drawGameSprite(ctx,'candy-bubbles',14,x-rr,y-rr,rr*2,rr*2))return;
      const base = color === 'bomb' ? palette.bomb : palette[color];
      const grad = ctx.createRadialGradient(x-rr*.28,y-rr*.32,rr*.18,x,y,rr*.98);
      grad.addColorStop(0, shade(base, .18)); grad.addColorStop(.62, base); grad.addColorStop(1, shade(base, -.16));
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x,y,rr*.9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.24)'; ctx.beginPath(); ctx.ellipse(x-rr*.22,y-rr*.26,rr*.22,rr*.12,-.45,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.46)'; ctx.lineWidth = Math.max(1, rr*.055); ctx.stroke();
      if (color === 'bomb') { ctx.fillStyle='#fff'; ctx.font='900 '+Math.round(rr*.82)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✦',x,y+1); }
    }
    function drawPop(p) {
      const t = Math.min(1, p.life / 260), rr = R * (.9 + t * .7), alpha = 1 - t;
      const color = palette[p.color] || p.color || palette.blue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = shade(color, .05);
      ctx.lineWidth = Math.max(1, R * .08);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = shade(color, .08);
      for (let i = 0; i < 5; i++) {
        const a = p.seed + i * Math.PI * .4, d = rr * (.35 + t * .7);
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, Math.max(1.2, R * .11 * (1 - t)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    function shade(hex, amt) { const n=parseInt(hex.slice(1),16), r=Math.round(Math.max(0,Math.min(255,(n>>16)+255*amt))), g=Math.round(Math.max(0,Math.min(255,((n>>8)&255)+255*amt))), b=Math.round(Math.max(0,Math.min(255,(n&255)+255*amt))); return 'rgb('+r+','+g+','+b+')'; }
    function trajectory() {
      let x=launch.x, y=launch.y, vx=Math.sin(aimAngle), vy=-Math.cos(aimAngle), pts=[];
      for (let i=0; i<520; i++) {
        x += vx * 4; y += vy * 4;
        if (x <= boardPad + R) { x = boardPad + R; vx *= -1; }
        if (x >= W - boardPad - R) { x = W - boardPad - R; vx *= -1; }
        if (i % 6 === 0) pts.push({x,y});
        if (y <= boardPad + R) break;
        if (bubbles.some(b => { const p=center(b.r,b.c,b); return Math.hypot(p.x-x,p.y-y) <= hitDistance(); })) break;
      }
      return pts;
    }
    function draw() {
      ctx.clearRect(0,0,W,H);
      const bg = ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#f2fbf8'); bg.addColorStop(.58,'#eef8ff'); bg.addColorStop(1,'#fff6ee'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(126,177,191,.6)'; ctx.lineWidth=4; ctx.strokeRect(2,2,W-4,H-4);
      ctx.fillStyle='rgba(151,196,203,.18)'; ctx.fillRect(0,0,boardPad*.7,H); ctx.fillRect(W-boardPad*.7,0,boardPad*.7,H); ctx.fillStyle='rgba(151,196,203,.24)'; ctx.fillRect(0,0,W,boardPad*.65);
      const dangerGrad = ctx.createLinearGradient(0,lineY,W,lineY); dangerGrad.addColorStop(0,'rgba(255,180,171,.18)'); dangerGrad.addColorStop(.5,'rgba(245,135,130,.72)'); dangerGrad.addColorStop(1,'rgba(255,180,171,.18)');
      ctx.strokeStyle=dangerGrad; ctx.lineWidth=3; ctx.setLineDash([8,7]); ctx.beginPath(); ctx.moveTo(boardPad,lineY); ctx.lineTo(W-boardPad,lineY); ctx.stroke(); ctx.setLineDash([]);
      bubbles.forEach(b => { const p=center(b.r,b.c,b); drawBubble(p.x,p.y,b.color,1); });
      falling.forEach(f => drawBubble(f.x,f.y,f.color,.9));
      popping.forEach(p => drawPop(p));
      if (aiming && !flying && !over) { ctx.fillStyle='rgba(40,55,85,.45)'; trajectory().forEach((p,i) => { ctx.beginPath(); ctx.arc(p.x,p.y, i%3===0?3.2:2.4,0,Math.PI*2); ctx.fill(); }); }
      const arcR = R * 2.45;
      ctx.strokeStyle='rgba(111,141,154,.34)'; ctx.lineWidth=Math.max(3, R*.22); ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(launch.x, launch.y, arcR, Math.PI * .25, Math.PI * .75, true); ctx.stroke(); ctx.lineCap='butt';
      drawBubble(launch.x, launch.y, armedBomb ? 'bomb' : current, .98);
      const nextX = launch.x + arcR * .88, nextY = launch.y - arcR * .32;
      drawBubble(nextX, nextY, next, .80);
      if (flying) drawBubble(flying.x, flying.y, flying.bomb ? 'bomb' : flying.color, 1);
    }
    function update(dt) {
      if (destroyed || over || env.currentGame !== 'paopao') return;
      if (flying) {
        const sp = Math.max(560, D * 20), step = sp * dt / 1000;
        const maxSubStep = Math.max(2, D * .16);
        for (let left = step; flying && left > 0; left -= maxSubStep) {
          const part = Math.min(maxSubStep, left);
          flying.x += flying.vx * part; flying.y += flying.vy * part;
          if (flying.x <= boardPad + R) { flying.x = boardPad + R; flying.vx *= -1; }
          if (flying.x >= W - boardPad - R) { flying.x = W - boardPad - R; flying.vx *= -1; }
          const hitTop = flying.y <= boardPad + R;
          const hitBubble = bubbles.find(b => { const p=center(b.r,b.c,b); return Math.hypot(p.x-flying.x,p.y-flying.y) <= hitDistance(); });
          if (hitTop || hitBubble) resolveAt(nearestSlot(flying.x, flying.y, hitBubble), flying.color, flying.bomb);
        }
      }
      // Preserve the original 60 Hz motion without tying gravity to render frequency.
      const frames = dt / (1000 / 60);
      falling.forEach(f => {
        f.y += f.vy * frames + .22 * frames * (frames + 1) / 2;
        f.vy += .22 * frames;
      });
      falling = falling.filter(f => f.y < H + D);
      popping.forEach(p => { p.life += dt; });
      popping = popping.filter(p => p.life < 280);
    }
    function frame(now) {
      if (destroyed || over || env.currentGame !== 'paopao') return;
      // Include the frame that removes the final particle, to clear its last pixels.
      const moving = !env.gamePaused && !env.getHostDocument().hidden && !!(flying || falling.length || popping.length);
      if (env.gamePaused || env.getHostDocument().hidden) {
        lastT = null;
      } else {
        // A suspended tab has no useful simulation time to catch up. Bound shorter
        // stalls too, so the existing shot collision loop cannot monopolize the UI.
        const elapsed = lastT == null ? 0 : now - lastT;
        lastT = now;
        update(elapsed > 1000 ? 0 : Math.max(0, Math.min(250, elapsed)));
      }
      if (!destroyed && !over) {
        if (moving) draw();
        raf = requestAnimationFrame(frame);
      }
    }
    function pointerPos(e) { const r=c.getBoundingClientRect(), t=e.touches&&e.touches[0] || e.changedTouches&&e.changedTouches[0] || e; return { x:t.clientX-r.left, y:t.clientY-r.top }; }
    function setAim(e) { const p=pointerPos(e), dx=p.x-launch.x, dy=launch.y-p.y; aimAngle = Math.max(-1.22, Math.min(1.22, Math.atan2(dx, Math.max(20, dy)))); if(!seen.aim){ seen.aim=true; env.speak('paopao','aim'); } }
    function startAim(e){ if(env.gamePaused||over||flying||resolving) return; aiming=true; setAim(e); e.preventDefault(); draw(); }
    function moveAim(e){ if(!aiming) return; setAim(e); e.preventDefault(); draw(); }
    function fire(e){
      if(!aiming||env.gamePaused||over||flying||resolving) return;
      setAim(e);
      aiming = false;
      const shotColor = current, shotBomb = armedBomb;
      flying = { x:launch.x, y:launch.y, vx:Math.sin(aimAngle), vy:-Math.cos(aimAngle), color:shotColor, bomb:shotBomb };
      current = next;
      next = randomColor();
      armedBomb = false;
      e.preventDefault();
      updateBombUI();
      save();
      draw();
    }
    function updateBombUI(){ const el=env.qs('#wb-paopao-bombs'); if(el) el.textContent=bombs; const btn=env.qs('#wb-paopao-bomb'); if(btn){ btn.disabled=over||flying||resolving||bombs<=0; btn.classList.toggle('primary', armedBomb); } updateSwapUI(); }
    function updateSwapUI(){ const btn=env.qs('#wb-paopao-swap'); if(btn){ const disabled=over||flying||resolving||aiming||armedBomb; btn.disabled=disabled; btn.style.opacity=disabled ? '.32' : '.9'; btn.style.cursor=disabled ? 'default' : 'pointer'; } }
    c.addEventListener('pointerdown', startAim); c.addEventListener('pointermove', moveAim); c.addEventListener('pointerup', fire); c.addEventListener('pointercancel', () => { aiming=false; draw(); });
    env.qs('#wb-paopao-bomb').onclick = () => { if(env.gamePaused||over||flying||resolving||bombs<=0) return; armedBomb = !armedBomb; if(armedBomb){ bombs--; env.speak('paopao','bomb'); } else bombs++; updateBombUI(); save(); draw(); };
    env.qs('#wb-paopao-swap').onclick = e => { e.preventDefault(); if(env.gamePaused||over||flying||resolving||aiming||armedBomb) return; const old=current; current=next; next=old || randomColor(); updateSwapUI(); save(); draw(); };
    resize(); updateBombUI(); env.setScore('paopao', score); checkDanger(); save(); draw();
    const onResize = () => { if (!destroyed && env.currentGame === 'paopao') { resize(); draw(); } };
    env.activeGameController = {
      save:() => { if (!destroyed && !over) save(); },
      destroy:() => {
        destroyed = true;
        bubbleArt.destroy();
        cancelAnimationFrame(raf);
        clearTimeout(turnTimer);
        env.getHostWindow().removeEventListener('resize', onResize);
      },
    };
    raf = requestAnimationFrame(frame);
    env.getHostWindow().addEventListener('resize', onResize, { passive:true });
  }
  startPaopao(state);
  return env.activeGameController || null;
}
