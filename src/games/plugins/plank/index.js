import { drawGameSprite, drawGameMaterial } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'plank';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["PLANK_STAND_URL","PLANK_WALK_URL","canvasThemePalette","gamePaused","getHostDocument","isNightTheme","jumpTimer","preventLongPressSelection","qs","saveProgress","setScore","settings","showGameOver","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startPlank(state) {
    const box = env.qs('#wb-gamebox');
    box.innerHTML = '<div class="wb-plank-shell"><canvas class="wb-canvas wb-plank-canvas" id="wb-plank" width="520" height="360"></canvas><div class="wb-jump-help" data-label="长按空格/屏幕生成木板" aria-label="长按空格/屏幕生成木板"></div></div>';
    const c = env.qs('#wb-plank'), shell = env.qs('.wb-plank-shell', box), ctx = c.getContext('2d');
    env.preventLongPressSelection(shell);
    let score = state?.score || 0, bridge = state?.bridge || 0, charging = false, over = false, seen = state?.seen || {}, perfectStreak = state?.perfectStreak || 0, bestPerfectStreak = state?.bestPerfectStreak || state?.perfectStreak || 0;
    let phase = 'ready', angle = 0, walk = 0, drop = 0, scroll = 0, failMode = '';
    let leftW = 76, gap = state?.gap || rand(80, 190), rightW = state?.rightW || rand(55, 95);
    let nextGap = state?.nextGap || rand(80, 190), nextW = state?.nextW || rand(55, 95);
    let plankSkyCache = null;
    let details = state?.details || { perfects:0, nearMisses:0 };
    const groundY = 268, leftX = 55;
    const heroStand = loadPlankHero(env.PLANK_STAND_URL), heroWalk = loadPlankHero(env.PLANK_WALK_URL);
    env.setScore('plank', score); draw(); save();
    function rand(a,b){ return Math.floor(a + Math.random() * (b - a)); }
    function loadPlankHero(src){ const img = new Image(); img.onload = draw; img.src = src; return img; }
    function save(){ if(!over) env.saveProgress('plank', { score, bridge: phase === 'ready' || charging ? bridge : 0, gap, rightW, nextGap, nextW, seen, perfectStreak, bestPerfectStreak, details }); }
    function startCharge(){ if(env.gamePaused||over||charging||phase!=='ready') return; charging=true; bridge=0; }
    function endCharge(){ if(!charging||env.gamePaused||over) return; charging=false; if(!seen.gameover && (bridge < gap || bridge > gap + rightW)){ seen.gameover=1; env.speak('plank','gameover'); } phase='falling'; angle=0; }
    function nextPillar(){ score++; env.setScore('plank', score); if(score===10) env.speak('plank','score_10'); if(score===20) env.speak('plank','score_20'); if(score===30) env.speak('plank','score_30'); if(score===40) env.speak('plank','score_40'); if(score>=50&&score%10===0) env.speak('plank','score_50_plus'); if(Math.abs(bridge-gap-rightW/2)<10){ details.perfects++; perfectStreak++; bestPerfectStreak=Math.max(bestPerfectStreak, perfectStreak); env.speak('plank','perfect'); if(perfectStreak>=3 && !seen.perfectStreak){ seen.perfectStreak=1; env.speak('plank','perfect_streak'); } } else perfectStreak=0; gap=nextGap; rightW=nextW; nextGap=rand(80,190); nextW=rand(55,95); bridge=0; angle=0; walk=0; drop=0; scroll=0; phase='ready'; save(); }
    function fail(){ const miss = failMode === 'short' ? gap - bridge : (failMode === 'long' ? bridge - (gap + rightW) : 0); if(miss > 0 && miss <= 10) details.nearMisses++; over=true; clearInterval(env.jumpTimer); env.jumpTimer=null; if(!seen.gameover) env.speak('plank','gameover'); env.showGameOver('plank','游戏结束','本局分数：'+score+'分', null, { perfectStreak: bestPerfectStreak, nearMiss: miss > 0 && miss <= 10, farMiss: miss >= 58, details }); }
    function loop(){
      if(env.gamePaused||over) return;
      if(charging) bridge=Math.min(302, bridge+3.45);
      if(phase==='falling'){
        angle=Math.min(Math.PI/2, angle+0.095);
        if(angle>=Math.PI/2){
          failMode = bridge < gap ? 'short' : (bridge > gap + rightW ? 'long' : '');
          if(failMode) perfectStreak = 0;
          phase = failMode ? 'walkingFail' : 'walking';
          walk = 0; drop = 0;
        }
      } else if(phase==='walking' || phase==='walkingFail'){
        const walkTarget = phase==='walking' ? gap + rightW - 10 : Math.max(18, bridge + 14);
        walk = Math.min(walkTarget, walk + 4.2);
        if(walk >= walkTarget){
          if(phase==='walking') phase='scrolling';
          else phase='dropping';
        }
      } else if(phase==='dropping'){
        drop += 8.5;
        if(drop > 118) fail();
      } else if(phase==='scrolling'){
        const target = gap + rightW;
        scroll = Math.min(target, scroll + 7.5);
        if(scroll >= target) nextPillar();
      }
      draw();
    }
    function draw(){
      ctx.clearRect(0,0,520,360);
      const pal=env.canvasThemePalette();
      ctx.drawImage(plankSky(pal),0,0);
      const rightX = leftX + leftW + gap;
      const thirdX = rightX + rightW + nextGap;
      const offset = phase === 'scrolling' ? scroll : 0;
      ctx.save();
      ctx.translate(-offset, 0);
      drawPillar(leftX, leftW, pal, false);
      drawPillar(rightX, rightW, pal, true);
      drawPillar(thirdX, nextW, pal, false);
      drawBridge(leftX + leftW, groundY);
      const hero = heroPos(leftX + leftW);
      drawHero(hero.x, hero.y, phase === 'dropping');
      ctx.restore();
      drawHud(pal);
    }
    function plankSky(pal){
      const theme = env.settings().theme || 'day';
      if (plankSkyCache && plankSkyCache.key === theme) return plankSkyCache.canvas;
      const off = env.getHostDocument().createElement('canvas');
      off.width = 520;
      off.height = 360;
      drawSky(off.getContext('2d'), pal);
      plankSkyCache = { key:theme, canvas:off };
      return off;
    }
    function heroPos(baseX){
      const startX = baseX - 19;
      if(phase==='walking' || phase==='walkingFail') return { x: baseX + walk - 12, y: groundY - 29 };
      if(phase==='dropping'){
        const x = baseX + walk - 12 + (failMode === 'long' ? drop * .08 : 0);
        return { x, y: groundY - 29 + drop };
      }
      if(phase==='scrolling') return { x: baseX + gap + rightW - 22, y: groundY - 29 };
      return { x:startX, y:groundY - 29 };
    }
    function drawSky(ctx,pal){
      const grad = ctx.createLinearGradient(0,0,0,360);
      grad.addColorStop(0, pal.top || '#e9f8ff');
      grad.addColorStop(0.62, '#f8fdff');
      grad.addColorStop(1, '#d7f0da');
      ctx.fillStyle=grad; ctx.fillRect(0,0,520,360);
      ctx.fillStyle='rgba(255,255,255,.62)';
      for(const cloud of [[78,72,38],[370,62,48],[450,125,30]]){
        ctx.beginPath(); ctx.ellipse(cloud[0],cloud[1],cloud[2],13,0,0,Math.PI*2); ctx.ellipse(cloud[0]+24,cloud[1]+4,cloud[2]*.7,10,0,0,Math.PI*2); ctx.ellipse(cloud[0]-22,cloud[1]+5,cloud[2]*.55,9,0,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='rgba(111,168,90,.18)';
      ctx.fillRect(0,groundY+54,520,38);
    }
    function drawPillar(x,w,pal,active){
      if((env.settings().theme || 'day') === 'mono') drawMonoPillar(x,w,active);
      else if(env.isNightTheme()) drawPixelPillar(x,w,pal,active);
      else drawWoodPillar(x,w,pal,active);
    }
    function drawMonoPillar(x,w,active){
      const top = groundY, h = 106, ix = Math.round(x), iw = Math.round(w);
      ctx.fillStyle='#bcbcbc';
      ctx.fillRect(ix + 8, top + h + 4, iw, 8);
      ctx.fillStyle='#111';
      ctx.fillRect(ix, top - 8, iw, h + 18);
      ctx.fillStyle=active ? '#efefef' : '#d6d6d6';
      ctx.fillRect(ix + 5, top - 4, iw - 10, h + 10);
      ctx.fillStyle='#8a8a8a';
      ctx.fillRect(ix + 5, top + h - 20, iw - 10, 14);
      ctx.fillStyle='#fff';
      ctx.fillRect(ix + 8, top - 1, iw - 16, 8);
      ctx.fillStyle='#111';
      for(let yy=top+14; yy<top+h-18; yy+=18) ctx.fillRect(ix + 10, yy, iw - 20, 4);
      for(let xx=ix+14; xx<ix+iw-8; xx+=18) ctx.fillRect(xx, top + 12, 4, h - 26);
      if(active){
        ctx.fillStyle='#111';
        ctx.fillRect(ix + iw + 6, top + h - 18, 8, 8);
        ctx.fillRect(ix + iw + 16, top + h - 10, 5, 5);
      }
    }
    function drawWoodPillar(x,w,pal,active){
      const top = groundY, h = 106, cx = x + w / 2;
      ctx.fillStyle='rgba(78,52,30,.18)';
      ctx.beginPath(); ctx.ellipse(cx, 354, w * .62, 8, 0, 0, Math.PI * 2); ctx.fill();
      const body=ctx.createLinearGradient(x,top,x+w,top);
      body.addColorStop(0,'#7c4f2d'); body.addColorStop(.52, active ? '#b98247' : '#9d693b'); body.addColorStop(1,'#66411f');
      ctx.fillStyle=body;
      ctx.fillRect(x, top - 1, w, h + 10);
      ctx.lineWidth=3;
      ctx.strokeStyle='rgba(78,45,23,.72)';
      ctx.strokeRect(x, top - 1, w, h + 10);
      ctx.fillStyle=active ? '#e5b96d' : '#d39a58';
      ctx.beginPath(); ctx.ellipse(cx, top - 4, w * .56, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle='rgba(78,45,23,.72)';
      ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.ellipse(cx, top - 4, w * .56, 13, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle='rgba(92,54,25,.62)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(cx, top - 4, w * .36, 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + w * .08, top - 3, w * .19, 4, .15, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle='rgba(65,38,22,.36)';
      ctx.lineWidth=1.6;
      for(let i=0;i<4;i++){
        const gx = x + 12 + i * Math.max(10, w / 5);
        ctx.beginPath();
        ctx.moveTo(gx, top + 12);
        ctx.bezierCurveTo(gx - 5, top + 36, gx + 6, top + 58, gx - 2, top + 92);
        ctx.stroke();
      }
      ctx.strokeStyle='rgba(255,235,184,.28)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x + 12, top + 11); ctx.lineTo(x + 8, top + h - 13); ctx.stroke();
      const grassY = 352;
      for(const g of [[x-12,17,'#6FA85A'],[x-5,12,'#91bd62'],[x+w-7,16,'#6FA85A'],[x+w+3,11,'#91bd62'],[x+12,10,'#7ab45f']]){
        ctx.fillStyle=g[2];
        ctx.beginPath();
        ctx.moveTo(g[0], grassY);
        ctx.quadraticCurveTo(g[0] + 5, grassY - g[1], g[0] + 11, grassY);
        ctx.closePath();
        ctx.fill();
      }
      if(active){
        ctx.fillStyle='#d97b54';
        ctx.beginPath(); ctx.arc(x + w + 12, grassY - 10, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle='#e3c56a';
        ctx.beginPath(); ctx.arc(x + w + 8, grassY - 7, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    function drawPixelPillar(x,w,pal,active){
      const top = groundY, h = 106, ix = Math.round(x), iw = Math.round(w);
      const neon = env.settings().theme === 'cyber' ? '#F1E85B' : '#f4c2d7';
      const neon2 = env.settings().theme === 'cyber' ? '#19D3C5' : '#8ed8ff';
      ctx.fillStyle='rgba(0,0,0,.32)';
      ctx.fillRect(ix + 6, top + h - 2, iw, 8);
      ctx.fillStyle=env.settings().theme === 'cyber' ? '#16231d' : '#241324';
      ctx.fillRect(ix + 4, top + 2, iw - 8, h + 4);
      ctx.fillStyle=env.settings().theme === 'cyber' ? '#24352D' : '#33203a';
      ctx.fillRect(ix + 10, top + 8, iw - 20, h - 3);
      ctx.fillStyle=active ? neon : 'rgba(255,255,255,.16)';
      ctx.fillRect(ix - 2, top - 8, iw + 4, 10);
      ctx.fillStyle=env.settings().theme === 'cyber' ? '#101A1D' : '#1b1020';
      ctx.fillRect(ix + 8, top - 4, iw - 16, 4);
      ctx.fillStyle=neon2;
      ctx.fillRect(ix + 4, top + 12, 4, 22);
      ctx.fillRect(ix + iw - 8, top + h - 34, 4, 22);
      ctx.fillStyle='rgba(255,255,255,.1)';
      for(let y=top+22;y<top+h;y+=18) ctx.fillRect(ix + 14, y, iw - 28, 3);
      ctx.strokeStyle=active ? neon : 'rgba(185,196,184,.45)';
      ctx.lineWidth=2;
      ctx.strokeRect(ix + 3, top + 1, iw - 6, h + 5);
    }
    function drawBridge(baseX,baseY){
      ctx.save();
      ctx.translate(baseX,baseY);
      ctx.rotate(-Math.PI/2 + angle);
      if(bridge>0&&drawGameSprite(ctx,'pieces',10,0,-9,bridge,18)){ctx.restore();return;}
      if((env.settings().theme || 'day') === 'mono'){
        const len = Math.max(0, Math.round(bridge));
        ctx.fillStyle='#111';
        ctx.fillRect(0,-7,len,14);
        ctx.fillStyle='#f2f2f2';
        for(let x=6;x<len;x+=18) ctx.fillRect(x,-5,8,10);
        ctx.fillStyle='#777';
        for(let x=0;x<len;x+=18) ctx.fillRect(x,-7,3,14);
        ctx.strokeStyle='#111';
        ctx.lineWidth=3;
        ctx.strokeRect(0,-7,len,14);
      } else if(env.isNightTheme()){
        const neon = env.settings().theme === 'cyber' ? '#F1E85B' : '#f4c2d7';
        ctx.fillStyle=env.settings().theme === 'cyber' ? '#18231E' : '#211426';
        ctx.fillRect(0,-6,bridge,12);
        ctx.strokeStyle=neon; ctx.lineWidth=2; ctx.strokeRect(0,-6,bridge,12);
        ctx.fillStyle=env.settings().theme === 'cyber' ? '#19D3C5' : '#8ed8ff';
        for(let x=14;x<bridge;x+=26) ctx.fillRect(x,-3,8,6);
      } else {
        const bg=ctx.createLinearGradient(0,-7,0,9);
        bg.addColorStop(0,'#c88b46'); bg.addColorStop(.55,'#8b582c'); bg.addColorStop(1,'#56351d');
        ctx.fillStyle=bg;
        ctx.beginPath(); ctx.roundRect(0,-7,bridge,14,5); ctx.fill();
        ctx.strokeStyle='rgba(65,38,22,.58)'; ctx.lineWidth=2; ctx.stroke();
        ctx.strokeStyle='rgba(255,224,158,.34)'; ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.moveTo(9,-2); ctx.bezierCurveTo(bridge*.28,-6,bridge*.62,4,bridge-8,-2); ctx.stroke();
        ctx.fillStyle='rgba(64,38,20,.36)';
        for(let x=16;x<bridge;x+=34){ ctx.beginPath(); ctx.arc(x,0,2.2,0,Math.PI*2); ctx.fill(); }
      }
      ctx.restore();
    }
    function drawHero(x,y,fallingHero){
      ctx.save();
      ctx.translate(x,y);
      if(fallingHero) ctx.rotate(Math.min(.75, drop/160));
      ctx.fillStyle='rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.ellipse(2,32,15,5,0,0,Math.PI*2); ctx.fill();
      if(drawGameSprite(ctx,'pieces',7,-34,-40,68,68)){ctx.restore();return;}
      const walking = phase === 'walking' || phase === 'walkingFail';
      const img = fallingHero ? heroWalk : (walking && Math.floor(walk / 14) % 2 ? heroWalk : heroStand);
      if(img && img.complete && img.naturalWidth){
        const h = 66, w = Math.max(39, h * img.naturalWidth / img.naturalHeight);
        if(fallingHero) ctx.rotate(-0.34);
        ctx.drawImage(img, -w / 2, -39, w, h);
      } else {
        ctx.font='34px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillText('🐱', 0, -6);
      }
      ctx.textAlign='start';
      ctx.textBaseline='alphabetic';
      ctx.restore();
    }
    function drawHud(pal){
      ctx.fillStyle='rgba(255,255,255,.72)';
      ctx.beginPath(); ctx.roundRect(226,18,68,36,12); ctx.fill();
      ctx.fillStyle=pal.text; ctx.font='900 20px sans-serif'; ctx.textAlign='center'; ctx.fillText(score+'',260,42); ctx.textAlign='start';
    }
    shell.onpointerdown=e=>{ startCharge(); shell.setPointerCapture?.(e.pointerId); e.preventDefault(); };
    shell.onpointerup=e=>{ endCharge(); shell.releasePointerCapture?.(e.pointerId); e.preventDefault(); };
    shell.onpointercancel=endCharge;
    env.getHostDocument().onkeydown=e=>{ if(e.code==='Space'){ e.preventDefault(); startCharge(); } };
    env.getHostDocument().onkeyup=e=>{ if(e.code==='Space'){ e.preventDefault(); endCharge(); } };
    clearInterval(env.jumpTimer); env.jumpTimer=setInterval(loop, 32);
  }
  startPlank(state);
  return env.activeGameController || null;
}
