import { drawGameSprite, drawGameMaterial } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'jump';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["JUMP_DOWN_URL","JUMP_STAND_URL","canvasThemePalette","gamePaused","getHostDocument","isNightTheme","jumpTimer","preventLongPressSelection","qs","saveProgress","setScore","settings","showGameOver","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startJump(state) {
    const box = env.qs('#wb-gamebox');
    box.innerHTML = '<div class="wb-jump-shell"><canvas class="wb-canvas wb-jump-canvas" id="wb-jump" width="520" height="640"></canvas><div class="wb-jump-help" data-label="长按空格/屏幕蓄力" aria-label="长按空格/屏幕蓄力"></div></div>';
    const c = env.qs('#wb-jump'), shell = env.qs('.wb-jump-shell', box), ctx = c.getContext('2d');
    env.preventLongPressSelection(shell);
    const W = 520, H = 640;
    let score = state?.score || 0;
    let details = state?.details || { perfects:0, nearMisses:0 };
    let seen = state?.seen || {};
    let dead = false;
    let charging = false;
    let charge = 0;
    let chargeDir = 1;
    let flight = null;
    let transition = null;
    let particles = [];
    let platforms = Array.isArray(state?.platforms) && state.platforms.length >= 2 ? state.platforms : [
      makePlatform(170, 440, 0),
      makePlatform(330, 275, 1)
    ];
    let player = state?.player || { x: platforms[0].x, y: standY(platforms[0]), z: 0 };
    let jumpBgCache = null;
    const heroStand = loadJumpHero(env.JUMP_STAND_URL), heroDown = loadJumpHero(env.JUMP_DOWN_URL);
    if (state?.player && Math.abs(player.y - standY(platforms[0])) > 28 && !state?.flight) player.y = standY(platforms[0]);
    env.setScore('jump', score);
    if (!seen.start) { seen.start = 1; }
    function standY(p) { return p.y - 8; }
    function loadJumpHero(src){ const img = new Image(); img.onload = draw; img.src = src; return img; }
    function makePlatform(x, y, i) {
      const colors = themePlatformColors();
      return { x, y, r: 38 + Math.floor(Math.random() * 18), h: 46 + Math.floor(Math.random() * 22), c: colors[i % colors.length], kind: i % colors.length };
    }
    function themePlatformColors() {
      const t = env.settings().theme || 'day';
      if(t === 'mono') return ['#1b1b1b','#5d5d5d','#9a9a9a','#cfcfcf','#ffffff'];
      if(t === 'spring') return ['#B77B42','#8FBF68','#D8B15E','#78A6C8','#A7784F'];
      if(t === 'cyber') return ['#F1E85B','#19D3C5','#FF4FA3','#FF8A3D','#8B6BFF'];
      if(t === 'night') return ['#8B6BFF','#FF4FA3','#19D3C5','#F1E85B','#6f7dff'];
      return ['#f2a7c2','#8dc7ee','#f5c66f','#a6d58b','#c6a0e8'];
    }
    function nextPlatform(from, i) {
      const side = Math.random() < .5 ? -1 : 1;
      const dx = side * (120 + Math.random() * 95);
      const dy = -(105 + Math.random() * 80);
      return makePlatform(Math.max(96, Math.min(W - 96, from.x + dx)), Math.max(160, from.y + dy), i);
    }
    function save() {
      if (!dead) env.saveProgress('jump', { score, platforms, player, seen, details });
    }
    function pointerDown(e) {
      if (dead || env.gamePaused || flight || transition || charging) return;
      e.preventDefault();
      charging = true;
      charge = 0;
      chargeDir = 1;
      if (!seen.charge) { seen.charge = 1; env.speak('jump', 'charge'); }
    }
    function pointerUp(e) {
      if (!charging || dead) return;
      e.preventDefault();
      charging = false;
      startFlight();
    }
    c.addEventListener('pointerdown', pointerDown);
    c.addEventListener('pointerup', pointerUp);
    c.addEventListener('pointercancel', pointerUp);
    c.addEventListener('pointerleave', pointerUp);
    env.getHostDocument().onkeydown = e => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (!charging) pointerDown(e);
      }
    };
    env.getHostDocument().onkeyup = e => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        pointerUp(e);
      }
    };
    function startFlight() {
      const from = platforms[0], to = platforms[1];
      const vx = to.x - from.x, vy = standY(to) - standY(from);
      const dist = Math.max(1, Math.hypot(vx, vy));
      const power = 72 + charge * 230;
      const ratio = power / dist;
      const ex = player.x + vx * ratio, ey = player.y + vy * ratio;
      const willMiss = Math.hypot(ex - to.x, ey - standY(to)) > to.r * .72;
      if (!seen.gameover && willMiss) { seen.gameover = 1; env.speak('jump', 'gameover'); }
      flight = {
        t: 0,
        sx: player.x,
        sy: player.y,
        ex,
        ey,
        target: to
      };
      if (!willMiss && !seen.jump) { seen.jump = 1; }
      charge = 0;
      save();
    }
    function finishFlight() {
      const to = flight.target;
      player.x = flight.ex;
      player.y = flight.ey;
      player.z = 0;
      flight = null;
      const d = Math.hypot(player.x - to.x, player.y - standY(to));
      if (d <= to.r * .72) {
        const perfect = d <= to.r * .22;
        score += perfect ? 2 : 1;
        env.setScore('jump', score);
        if (perfect) details.perfects++;
        else if (d > to.r * .58) details.nearMisses++;
        env.speak('jump', perfect ? 'perfect' : 'land');
        emitLanding(player.x, player.y, perfect);
        if ([10,20,30,40].includes(score) && !seen['score_' + score]) { seen['score_' + score] = 1; env.speak('jump', 'score_' + score); }
        if (score >= 50 && score % 10 === 0 && !seen['score_' + score]) { seen['score_' + score] = 1; env.speak('jump', 'score_50_plus'); }
        platforms = [to, nextPlatform(to, score)];
        transition = { t: 0, dx: 170 - platforms[0].x, dy: 440 - platforms[0].y };
      } else {
        dead = true;
        clearInterval(env.jumpTimer);
        env.jumpTimer = null;
        if (!seen.gameover) env.speak('jump', 'gameover');
        env.showGameOver('jump', '游戏结束', '本局分数：' + score + '分', null, { details });
      }
    }
    function loop() {
      if (dead) return;
      if (env.gamePaused) return;
      if (charging) {
        charge += chargeDir * .035;
        if (charge >= 1) { charge = 1; chargeDir = -1; }
        if (charge <= 0) { charge = 0; chargeDir = 1; }
      }
      if (flight) {
        flight.t = Math.min(1, flight.t + .045);
        const t = flight.t;
        player.x = flight.sx + (flight.ex - flight.sx) * t;
        player.y = flight.sy + (flight.ey - flight.sy) * t;
        player.z = Math.sin(Math.PI * t) * 118;
        if (t >= 1) finishFlight();
      } else if (transition) {
        transition.t = Math.min(1, transition.t + .055);
        if (transition.t >= 1) {
          platforms.forEach(p => { p.x += transition.dx; p.y += transition.dy; });
          player.x += transition.dx;
          player.y += transition.dy;
          transition = null;
          player.x = platforms[0].x;
          player.y = standY(platforms[0]);
          save();
        }
      }
      updateParticles();
      draw();
    }
    function ease(t){ return 1 - Math.pow(1 - t, 3); }
    function emitLanding(x,y,perfect){
      const count = perfect ? 22 : 12;
      const colors = env.settings().theme === 'cyber' ? ['#F1E85B','#19D3C5','#FF4FA3'] : (env.settings().theme === 'spring' ? ['#E3C56A','#6FA85A','#D97B54'] : ['#fff1a8','#f2a7c2','#8dc7ee']);
      for(let i=0;i<count;i++){
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * (perfect ? 3.6 : 2.2);
        particles.push({ x, y:y-20, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 1.5, life:perfect?34:24, max:perfect?34:24, c:colors[i%colors.length], s:perfect?3.8:2.8 });
      }
    }
    function updateParticles(){
      particles = particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += .12; p.life--;
        return p.life > 0;
      });
    }
    function drawBlock(p) {
      const night = env.isNightTheme();
      const spring = env.settings().theme === 'spring';
      const cyber = env.settings().theme === 'cyber';
      const topH = p.r * .42, bottomY = p.y + p.h;
      ctx.save();
      ctx.fillStyle = night ? 'rgba(0,0,0,.46)' : 'rgba(65,45,35,.18)';
      ctx.beginPath();
      ctx.ellipse(p.x + 7, bottomY + topH * .48, p.r * 1.15, topH * .68, 0, 0, Math.PI * 2);
      ctx.fill();
      const baseColor = spring ? (p.kind % 2 ? '#8FBF68' : '#A66E3D') : p.c;
      const side = ctx.createLinearGradient(p.x - p.r, p.y, p.x + p.r, bottomY);
      side.addColorStop(0, shade(baseColor, night ? -.26 : -.16));
      side.addColorStop(.5, shade(baseColor, night ? -.08 : .02));
      side.addColorStop(1, shade(baseColor, night ? -.48 : -.32));
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.moveTo(p.x - p.r, p.y);
      ctx.quadraticCurveTo(p.x, p.y + topH, p.x + p.r, p.y);
      ctx.lineTo(p.x + p.r, p.y + p.h);
      ctx.quadraticCurveTo(p.x, bottomY + topH, p.x - p.r, bottomY);
      ctx.closePath();
      ctx.fill();
      if(spring){
        ctx.strokeStyle=p.kind % 2 ? 'rgba(76,93,42,.32)' : 'rgba(92,54,25,.36)';
        ctx.lineWidth=1.4;
        for(let y=p.y+12;y<bottomY;y+=14){
          ctx.beginPath(); ctx.moveTo(p.x-p.r+9,y); ctx.quadraticCurveTo(p.x,y+5,p.x+p.r-9,y-2); ctx.stroke();
        }
      } else if(!night) {
        ctx.fillStyle='rgba(255,255,255,.18)';
        ctx.beginPath();
        ctx.moveTo(p.x-p.r*.72,p.y+12);
        ctx.quadraticCurveTo(p.x-p.r*.28,p.y+32,p.x-p.r*.54,bottomY-8);
        ctx.lineTo(p.x-p.r*.36,bottomY-2);
        ctx.quadraticCurveTo(p.x-p.r*.08,p.y+34,p.x-p.r*.42,p.y+10);
        ctx.fill();
      }
      const top = ctx.createRadialGradient(p.x - p.r * .35, p.y - p.r * .18, 5, p.x, p.y, p.r);
      top.addColorStop(0, shade(p.c, night ? .12 : .26));
      top.addColorStop(1, spring ? (p.kind % 2 ? '#A9D97B' : '#D2A05E') : p.c);
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, topH, 0, 0, Math.PI * 2);
      ctx.fill();
      if(cyber){
        ctx.strokeStyle='rgba(241,232,91,.7)';
        ctx.lineWidth=3;
        ctx.shadowColor='rgba(25,211,197,.42)';
        ctx.shadowBlur=12;
      } else {
        ctx.strokeStyle = night ? 'rgba(255,255,255,.25)' : 'rgba(57,44,38,.25)';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
      ctx.shadowBlur=0;
      if(spring && p.kind % 2 === 0){
        ctx.strokeStyle='rgba(89,53,26,.5)';
        ctx.lineWidth=1.7;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r*.55, topH*.5, 0, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(p.x + p.r*.1, p.y + 1, p.r*.28, topH*.24, .18, 0, Math.PI*2); ctx.stroke();
      } else if(!night){
        ctx.fillStyle='rgba(255,255,255,.24)';
        ctx.beginPath(); ctx.ellipse(p.x-p.r*.25,p.y-p.r*.08,p.r*.35,p.r*.12,-.08,0,Math.PI*2); ctx.fill();
      } else {
        ctx.strokeStyle=cyber?'rgba(25,211,197,.52)':'rgba(244,194,215,.35)';
        ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.ellipse(p.x,p.y,p.r*.72,p.r*.27,0,0,Math.PI*2); ctx.stroke();
      }
      if(spring){
        ctx.fillStyle='#6FA85A';
        for(const g of [[-p.r-8,12],[-p.r+4,8],[p.r-8,11],[p.r+3,7]]){
          ctx.beginPath();
          ctx.moveTo(p.x+g[0], bottomY + topH*.55);
          ctx.quadraticCurveTo(p.x+g[0]+5, bottomY + topH*.55 - g[1], p.x+g[0]+11, bottomY + topH*.55);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
    function roundRect(ctx,x,y,w,h,r){ if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); } else { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); } }
    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.max(0, Math.min(255, (n >> 16) + 255 * amt));
      const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + 255 * amt));
      const b = Math.max(0, Math.min(255, (n & 255) + 255 * amt));
      return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
    }
    function drawPlayer() {
      const press = charging && !flight ? charge : 0;
      const x = player.x, footY = player.y - player.z + press * 10;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + 8, 21 + press * 10, 7 + press * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      const heroSize=72;
      ctx.save();ctx.translate(x,footY);if(flight)ctx.rotate(Math.sin(Math.PI*flight.t)*.12);ctx.scale(1+press*.13,1-press*.23);
      const premiumHero=drawGameSprite(ctx,'pieces',7,-heroSize/2,-heroSize+2,heroSize,heroSize);ctx.restore();
      if(premiumHero){ctx.restore();return;}
      const img = (charging || flight) ? heroDown : heroStand;
      if(img && img.complete && img.naturalWidth){
        const baseH = 72, baseW = Math.max(42, baseH * img.naturalWidth / img.naturalHeight);
        const sx = 1 + press * .13, sy = 1 - press * .23;
        ctx.translate(x, footY);
        if(flight) ctx.rotate(Math.sin(Math.PI * flight.t) * .12);
        ctx.scale(sx, sy);
        ctx.drawImage(img, -baseW / 2, -baseH + 2, baseW, baseH);
      } else {
        ctx.font='42px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillText('⭐', x, footY - 26);
      }
      ctx.textAlign='start';
      ctx.textBaseline='alphabetic';
      ctx.restore();
    }
    function drawParticles(){
      for(const p of particles){
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function drawChargeFx(){
      if(!charging || flight) return;
      const night = env.isNightTheme();
      const ring = 26 + charge * 42;
      ctx.save();
      ctx.strokeStyle = env.settings().theme === 'cyber' ? 'rgba(241,232,91,.68)' : (env.settings().theme === 'spring' ? 'rgba(217,123,84,.62)' : 'rgba(240,138,108,.58)');
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(player.x, player.y + 10, ring, ring * .28, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = night ? 'rgba(25,211,197,.12)' : 'rgba(255,255,255,.32)';
      ctx.beginPath(); ctx.ellipse(player.x, player.y + 10, ring * .76, ring * .2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function drawJumpBackdrop(ctx,pal){
      const t = env.settings().theme || 'day';
      if(t === 'spring'){
        const earth=ctx.createLinearGradient(0,500,0,H);
        earth.addColorStop(0,'rgba(216,237,178,.18)');
        earth.addColorStop(1,'rgba(111,168,90,.28)');
        ctx.fillStyle=earth;
        ctx.fillRect(0,500,W,140);
        ctx.fillStyle='rgba(111,168,90,.16)';
        ctx.beginPath(); ctx.ellipse(86,546,126,32,0,0,Math.PI*2); ctx.ellipse(355,585,190,42,0,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(122,103,82,.22)';
        ctx.lineWidth=4;
        for(let x=18;x<W;x+=52){ ctx.beginPath(); ctx.moveTo(x,558); ctx.lineTo(x+30,538); ctx.stroke(); }
        for(let x=28;x<W;x+=42){
          const y=592 + (x % 3) * 8;
          ctx.fillStyle=x % 84 ? 'rgba(111,168,90,.55)' : 'rgba(217,123,84,.72)';
          ctx.beginPath();
          ctx.moveTo(x,y);
          ctx.quadraticCurveTo(x+5,y-18,x+12,y);
          ctx.quadraticCurveTo(x+7,y-8,x,y);
          ctx.fill();
          if(x % 84 === 0){ ctx.beginPath(); ctx.arc(x+9,y-14,3,0,Math.PI*2); ctx.fill(); }
        }
        ctx.fillStyle='rgba(125,185,216,.22)';
        ctx.beginPath(); ctx.arc(410,118,38,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.58)';
        for(const cloud of [[100,104,44],[306,78,36],[438,174,30]]){
          ctx.beginPath(); ctx.ellipse(cloud[0],cloud[1],cloud[2],12,0,0,Math.PI*2); ctx.ellipse(cloud[0]+24,cloud[1]+4,cloud[2]*.7,10,0,0,Math.PI*2); ctx.ellipse(cloud[0]-20,cloud[1]+5,cloud[2]*.52,9,0,0,Math.PI*2); ctx.fill();
        }
        return;
      }
      if(t === 'cyber' || t === 'night'){
        const floor=ctx.createLinearGradient(0,500,0,H);
        floor.addColorStop(0,'rgba(25,211,197,.02)');
        floor.addColorStop(1,t === 'cyber' ? 'rgba(25,211,197,.12)' : 'rgba(139,107,255,.1)');
        ctx.fillStyle=floor;
        ctx.fillRect(0,500,W,140);
        ctx.strokeStyle = t === 'cyber' ? 'rgba(25,211,197,.16)' : 'rgba(244,194,215,.1)';
        ctx.lineWidth=1;
        for(let y=120;y<620;y+=34){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y-42); ctx.stroke(); }
        for(let x=-80;x<W+100;x+=50){ ctx.beginPath(); ctx.moveTo(x,640); ctx.lineTo(x+180,180); ctx.stroke(); }
        ctx.strokeStyle = t === 'cyber' ? 'rgba(241,232,91,.18)' : 'rgba(255,79,163,.12)';
        for(let y=528;y<640;y+=22){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        ctx.fillStyle = t === 'cyber' ? 'rgba(241,232,91,.16)' : 'rgba(255,79,163,.12)';
        for(let i=0;i<18;i++){ const x=(i*73)%W, y=48+(i*97)%500; ctx.fillRect(x,y,3+(i%3)*2,3); }
        ctx.strokeStyle = t === 'cyber' ? 'rgba(241,232,91,.22)' : 'rgba(139,107,255,.18)';
        ctx.lineWidth=3;
        ctx.beginPath(); ctx.roundRect(32,104,W-64,426,18); ctx.stroke();
        return;
      }
      const floor=ctx.createLinearGradient(0,502,0,H);
      floor.addColorStop(0,'rgba(255,255,255,.05)');
      floor.addColorStop(1,'rgba(216,112,147,.18)');
      ctx.fillStyle=floor;
      ctx.fillRect(0,502,W,138);
      ctx.fillStyle='rgba(255,255,255,.5)';
      for(const cloud of [[88,98,42],[348,78,48],[442,168,32]]){
        ctx.beginPath(); ctx.ellipse(cloud[0],cloud[1],cloud[2],13,0,0,Math.PI*2); ctx.ellipse(cloud[0]+25,cloud[1]+5,cloud[2]*.68,10,0,0,Math.PI*2); ctx.ellipse(cloud[0]-20,cloud[1]+5,cloud[2]*.52,9,0,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='rgba(242,167,194,.28)';
      for(let x=24;x<W;x+=48){
        const y=594 + (x % 4) * 6;
        ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+7,y-5,2.8,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='rgba(216,112,147,.12)';
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 88, y = 130 + (i % 3) * 42;
        ctx.beginPath(); ctx.ellipse(x, y, 45, 12, -.12, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle='rgba(245,198,111,.18)';
      ctx.beginPath(); ctx.arc(430,108,35,0,Math.PI*2); ctx.fill();
    }
    function drawHud() {
      const night = env.isNightTheme();
      const pal = env.canvasThemePalette();
      ctx.fillStyle = night ? 'rgba(255,255,255,.86)' : pal.text;
      ctx.font = '700 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(String(score), 28, 42);
      ctx.font = '500 15px system-ui, -apple-system, sans-serif';
      ctx.fillText(charging ? '松手起跳' : '按住蓄力', 28, 68);
      ctx.fillStyle = night ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.12)';
      ctx.fillRect(28, 84, 150, 8);
      ctx.fillStyle = env.settings().theme === 'cyber' ? '#FF8A3D' : (env.settings().theme === 'spring' ? '#D97B54' : '#f08a6c');
      ctx.fillRect(28, 84, 150 * charge, 8);
    }
    function draw() {
      const night = env.isNightTheme();
      const pal = env.canvasThemePalette();
      ctx.drawImage(jumpBackground(pal), 0, 0);
      const tx = transition ? ease(transition.t) * transition.dx : 0;
      const ty = transition ? ease(transition.t) * transition.dy : 0;
      ctx.save();
      ctx.translate(tx, ty);
      platforms.slice().sort((a,b)=>a.y-b.y).forEach(drawBlock);
      drawChargeFx();
      drawPlayer();
      drawParticles();
      ctx.restore();
      drawHud();
      if (env.gamePaused) {
        ctx.fillStyle = night ? 'rgba(0,0,0,.54)' : 'rgba(255,255,255,.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = night ? '#fff' : '#1d1a18';
        ctx.font = '800 38px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSE', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
    }
    function jumpBackground(pal) {
      const theme = env.settings().theme || 'day';
      if (jumpBgCache && jumpBgCache.key === theme) return jumpBgCache.canvas;
      const off = env.getHostDocument().createElement('canvas');
      off.width = W;
      off.height = H;
      const bgCtx = off.getContext('2d');
      const bg = bgCtx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, pal.top);
      bg.addColorStop(.64, pal.mid);
      bg.addColorStop(1, pal.bottom);
      bgCtx.fillStyle = bg;
      bgCtx.fillRect(0, 0, W, H);
      drawJumpBackdrop(bgCtx, pal);
      jumpBgCache = { key:theme, canvas:off };
      return off;
    }
    clearInterval(env.jumpTimer);
    env.jumpTimer = setInterval(loop, 32);
    draw();
    save();
  }
  startJump(state);
  return env.activeGameController || null;
}
