import { drawGameSprite } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'watermelon';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["PROGRESS_SAVE_DELAY","canvasThemePalette","gamePaused","getHostDocument","isNightTheme","qs","saveProgress","setScore","settings","showGameOver","speak","watermelonTimer"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startWatermelon(state) {
    const box = env.qs('#wb-gamebox');
    box.innerHTML = '<canvas class="wb-canvas wb-watermelon-canvas" id="wb-watermelon" width="400" height="500"></canvas>';
    const c = env.qs('#wb-watermelon'), ctx = c.getContext('2d');
    const W = 400, H = 500;
    const fruits = [
      {r:14, color:'#f05f6b', name:'樱'}, {r:18, color:'#f59f00', name:'苹'}, {r:23, color:'#ffd166', name:'柠'},
      {r:29, color:'#7bc96f', name:'猕'}, {r:36, color:'#ffb15c', name:'橙'}, {r:45, color:'#d95550', name:'苹'},
      {r:56, color:'#7cc66a', name:'蜜'}, {r:68, color:'#f3c04f', name:'菠'}, {r:82, color:'#2a9d55', name:'瓜'}
    ];
    let balls = Array.isArray(state?.balls) ? state.balls.map(b => Object.assign({ a:0, av:0 }, b)) : [];
    let next = Number.isInteger(state?.next) ? state.next : randNext();
    let score = state?.score || 0, seen = state?.seen || {}, over = false, dropping = false;
    let details = state?.details || { mergeCounts:{}, crisisResolves:0, wasNearTop:false, finalCounts:{} };
    let aiming = false, aimX = null, lastTouchDrop = 0, lastSaveAt = 0;
    let watermelonBgCache = null;
    const fruitCanvasCache = {};
    env.setScore('watermelon', score); draw(); save();
    c.onclick = e => { if(Date.now() - lastTouchDrop < 500 || aiming) return; drop(clientX(e)); };
    c.onpointerdown = e => { if(env.gamePaused || over || dropping) return; aiming = true; aimX = clientX(e); if(!seen.aim){ seen.aim=1; env.speak('watermelon','aim'); } c.setPointerCapture?.(e.pointerId); draw(); e.preventDefault(); };
    c.onpointermove = e => { if(!aiming) return; aimX = clientX(e); draw(); e.preventDefault(); };
    c.onpointerup = e => { if(!aiming) return; const x = clientX(e); aiming = false; aimX = null; lastTouchDrop = Date.now(); c.releasePointerCapture?.(e.pointerId); drop(x); draw(); e.preventDefault(); };
    c.onpointercancel = () => { if(aiming){ aiming = false; aimX = null; draw(); } };
    c.ontouchstart = e => { if(typeof PointerEvent !== 'undefined') return; const t=e.touches[0]; if(t && !env.gamePaused && !over && !dropping){ aiming = true; aimX = clientX(t); if(!seen.aim){ seen.aim=1; env.speak('watermelon','aim'); } draw(); e.preventDefault(); } };
    c.ontouchmove = e => { if(typeof PointerEvent !== 'undefined' || !aiming) return; const t=e.touches[0]; if(t){ aimX = clientX(t); draw(); e.preventDefault(); } };
    c.ontouchend = e => { if(typeof PointerEvent !== 'undefined') return; const t=e.changedTouches[0]; if(t && aiming){ const x = clientX(t); aiming = false; aimX = null; lastTouchDrop = Date.now(); drop(x); draw(); e.preventDefault(); } };
    env.watermelonTimer = setInterval(step, 40);
    function randNext(){ return Math.floor(Math.random()*3); }
    function clientX(e){ const r=c.getBoundingClientRect(); return Math.max(18, Math.min(W-18, (e.clientX-r.left) * W / r.width)); }
    function save(force){ if(over) return; const now=Date.now(); if(!force && now - lastSaveAt < env.PROGRESS_SAVE_DELAY) return; lastSaveAt = now; env.saveProgress('watermelon', { balls: balls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,l:b.l,a:b.a||0,av:b.av||0})), next, score, seen, details }, force ? { immediate:true } : undefined); }
    function drop(x){ if(env.gamePaused||over||dropping) return; aiming=false; aimX=null; const f=fruits[next]; balls.push({x, y:f.r+6, vx:0, vy:0, l:next, a:0, av:0}); next=randNext(); dropping=true; setTimeout(()=>dropping=false,180); if(x < f.r + 12 || x > W - f.r - 12) env.speak('watermelon','drop_edge'); save(true); }
    function step(){ if(env.gamePaused||over) return; balls.forEach(b=>{ const f=fruits[b.l]; b.vy+=0.45; b.x+=b.vx; b.y+=b.vy; b.a=(b.a||0)+(b.av||0); b.av=(b.av||0)*0.985; if(b.x<f.r){ b.x=f.r; b.vx=Math.abs(b.vx)*0.58; b.av += b.vx / f.r * 0.08; } if(b.x>W-f.r){ b.x=W-f.r; b.vx=-Math.abs(b.vx)*0.58; b.av += b.vx / f.r * 0.08; } if(b.y>H-f.r){ b.y=H-f.r; b.vy*=-0.38; b.av += b.vx / f.r * 0.16; b.vx*=0.985; b.av*=0.94; if(Math.abs(b.vy)<.45) b.vy=0; } });
      for(let k=0;k<4;k++) collide();
      balls = balls.filter(Boolean); draw(); save();
      const nearTop = balls.some(b=>b.y-fruits[b.l].r<50 && Math.abs(b.vy)<.3) && balls.length>8;
      if(details.wasNearTop && !nearTop && balls.every(b=>b.y-fruits[b.l].r>=82 || Math.abs(b.vy)>=.35)){ details.crisisResolves++; details.wasNearTop=false; }
      if(nearTop) details.wasNearTop = true;
      if(balls.some(b=>b.y-fruits[b.l].r<36 && Math.abs(b.vy)<.25) && balls.length>8){ over=true; clearInterval(env.watermelonTimer); details.finalCounts = balls.reduce((m,b)=>{ if(b) m[b.l]=(m[b.l]||0)+1; return m; }, {}); if(!seen.gameover){ seen.gameover=1; env.speak('watermelon','gameover'); } env.showGameOver('watermelon','游戏结束','本局分数：'+score+'分', null, { finalWatermelons: balls.filter(b=>b && b.l===fruits.length-1).length, details }); }
    }
    function collide(){ for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++){ const a=balls[i], b=balls[j]; if(!a||!b) continue; const fa=fruits[a.l], fb=fruits[b.l], dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, min=fa.r+fb.r; if(d<min){ if(a.l===b.l && a.l<fruits.length-1){ const nl=a.l+1; score += (nl+1)*20; details.mergeCounts[nl] = (details.mergeCounts[nl] || 0) + 1; env.setScore('watermelon', score); const nx=(a.x+b.x)/2, ny=(a.y+b.y)/2; balls[i]={x:nx,y:ny,vx:(a.vx+b.vx)*.32,vy:-3.2,l:nl,a:((a.a||0)+(b.a||0))/2,av:((a.av||0)+(b.av||0))* .22}; balls[j]=null; if(nl>=4) env.speak('watermelon', nl>=8?'watermelon':('merge_'+(nl>=7?7:nl>=6?6:4))); else if(nl===2 && !seen.merge_2){ seen.merge_2=1; env.speak('watermelon','merge_2'); } continue; } const push=(min-d)/2, nx=dx/d, ny=dy/d; a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push; const rvx=b.vx-a.vx, rvy=b.vy-a.vy, sep=rvx*nx+rvy*ny, tangent=rvx*(-ny)+rvy*nx; a.av=(a.av||0)-tangent/fa.r*.035; b.av=(b.av||0)+tangent/fb.r*.035; if(sep<0){ const imp=-sep*.62; a.vx-=imp*nx; a.vy-=imp*ny; b.vx+=imp*nx; b.vy+=imp*ny; } } } }
    function shade(hex, amt){ const n=parseInt(String(hex).slice(1),16); const r=Math.max(0,Math.min(255,(n>>16)+amt)), g=Math.max(0,Math.min(255,((n>>8)&255)+amt)), b=Math.max(0,Math.min(255,(n&255)+amt)); return 'rgb('+r+','+g+','+b+')'; }
    function drawFruitRaw(ctx,x,y,l,alpha,scale,angle){
      const f=fruits[l], r=f.r*(scale||1);
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(angle||0);
      x=0; y=0;
      ctx.globalAlpha=alpha == null ? 1 : alpha;
      const grad=ctx.createRadialGradient(x-r*.22,y-r*.22,r*.12,x,y,r);
      grad.addColorStop(0,'rgba(255,255,255,.92)');
      grad.addColorStop(.18,shade(f.color,38));
      grad.addColorStop(.72,f.color);
      grad.addColorStop(1,shade(f.color,-42));
      ctx.fillStyle=grad;
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x,y,r*.96,0,Math.PI*2);
      ctx.clip();
      ctx.lineCap='round';
      if(l===0){
        ctx.fillStyle='rgba(255,190,170,.28)';
        for(let a=0;a<Math.PI*2;a+=Math.PI*2/3){
          ctx.beginPath();
          ctx.ellipse(x+Math.cos(a)*r*.26,y+Math.sin(a)*r*.2,r*.18,r*.1,a,0,Math.PI*2);
          ctx.fill();
        }
        ctx.fillStyle='rgba(255,242,200,.7)';
        for(let a=0;a<Math.PI*2;a+=Math.PI*2/5){
          ctx.beginPath();
          ctx.arc(x+Math.cos(a)*r*.34,y+Math.sin(a)*r*.26,Math.max(1,r*.035),0,Math.PI*2);
          ctx.fill();
        }
      } else if(l===1){
        ctx.strokeStyle='rgba(205,49,45,.62)';
        ctx.lineWidth=Math.max(2.4,r*.16);
        ctx.beginPath();
        ctx.arc(x,y,r*.86,0,Math.PI*2);
        ctx.stroke();
        ctx.fillStyle='rgba(255,219,68,.56)';
        ctx.beginPath();
        ctx.ellipse(x-r*.02,y+r*.02,r*.5,r*.56,-.05,0,Math.PI*2);
        ctx.fill();
        ctx.fillStyle='rgba(255,239,128,.72)';
        ctx.beginPath();
        ctx.ellipse(x,y,r*.25,r*.31,0,0,Math.PI*2);
        ctx.fill();
        ctx.fillStyle='rgba(104,60,24,.82)';
        [-1,1].forEach(s=>{
          ctx.beginPath();
          ctx.ellipse(x+s*r*.11,y+r*.02,r*.045,r*.085,s*.35,0,Math.PI*2);
          ctx.fill();
        });
      } else if(l===2){
        ctx.fillStyle='rgba(255,250,192,.34)';
        ctx.beginPath();
        ctx.arc(x,y,r*.88,0,Math.PI*2);
        ctx.fill();
        ctx.strokeStyle='rgba(255,255,235,.78)';
        ctx.lineWidth=Math.max(1.1,r*.045);
        ctx.beginPath();
        ctx.arc(x,y,r*.8,0,Math.PI*2);
        ctx.stroke();
        for(let a=0;a<Math.PI*2;a+=Math.PI/5){
          ctx.beginPath();
          ctx.moveTo(x+Math.cos(a)*r*.08,y+Math.sin(a)*r*.08);
          ctx.lineTo(x+Math.cos(a)*r*.86,y+Math.sin(a)*r*.86);
          ctx.stroke();
        }
        ctx.fillStyle='rgba(255,225,76,.18)';
        for(let a=Math.PI/10;a<Math.PI*2;a+=Math.PI/5){
          ctx.beginPath();
          ctx.ellipse(x+Math.cos(a)*r*.48,y+Math.sin(a)*r*.48,r*.23,r*.09,a,0,Math.PI*2);
          ctx.fill();
        }
      } else if(l===3){
        ctx.fillStyle='rgba(70,45,28,.22)';
        for(let a=0;a<Math.PI*2;a+=Math.PI/5){
          ctx.beginPath();
          ctx.arc(x+Math.cos(a)*r*.42,y+Math.sin(a)*r*.42,Math.max(1.2,r*.035),0,Math.PI*2);
          ctx.fill();
        }
        ctx.fillStyle='rgba(235,245,210,.34)';
        ctx.beginPath();
        ctx.arc(x,y,r*.36,0,Math.PI*2);
        ctx.fill();
      } else if(l===4){
        ctx.fillStyle='rgba(255,238,174,.32)';
        ctx.beginPath();
        ctx.arc(x,y,r*.86,0,Math.PI*2);
        ctx.fill();
        ctx.strokeStyle='rgba(255,246,210,.72)';
        ctx.lineWidth=Math.max(1.2,r*.045);
        ctx.beginPath();
        ctx.arc(x,y,r*.78,0,Math.PI*2);
        ctx.stroke();
        for(let a=0;a<Math.PI*2;a+=Math.PI/5){
          ctx.beginPath();
          ctx.moveTo(x+Math.cos(a)*r*.08,y+Math.sin(a)*r*.08);
          ctx.lineTo(x+Math.cos(a)*r*.84,y+Math.sin(a)*r*.84);
          ctx.stroke();
        }
        ctx.fillStyle='rgba(255,172,40,.18)';
        for(let a=Math.PI/10;a<Math.PI*2;a+=Math.PI/5){
          ctx.beginPath();
          ctx.ellipse(x+Math.cos(a)*r*.46,y+Math.sin(a)*r*.46,r*.24,r*.11,a,0,Math.PI*2);
          ctx.fill();
        }
      } else if(l===5){
        ctx.fillStyle='rgba(255,178,168,.34)';
        for(let a=0;a<Math.PI*2;a+=Math.PI*2/4){
          ctx.beginPath();
          ctx.ellipse(x+Math.cos(a)*r*.28,y+Math.sin(a)*r*.23,r*.28,r*.13,a,0,Math.PI*2);
          ctx.fill();
        }
        ctx.fillStyle='rgba(255,242,202,.78)';
        for(let a=0;a<Math.PI*2;a+=Math.PI*2/12){
          ctx.beginPath();
          ctx.arc(x+Math.cos(a)*r*.36,y+Math.sin(a)*r*.28,Math.max(1.3,r*.028),0,Math.PI*2);
          ctx.fill();
        }
        ctx.fillStyle='rgba(150,25,32,.16)';
        ctx.beginPath();
        ctx.arc(x,y,r*.18,0,Math.PI*2);
        ctx.fill();
      } else if(l===6){
        ctx.strokeStyle='rgba(238,255,210,.62)';
        ctx.lineWidth=Math.max(.8,r*.018);
        for(let k=-7;k<=7;k++){
          const off=(k*.13 + (k%2)*.035)*r;
          ctx.beginPath();
          ctx.moveTo(x-r*.9,y+off-r*(.08+(k%3)*.025));
          ctx.bezierCurveTo(x-r*.48,y+off+r*(.1-(k%2)*.06),x+r*.24,y+off-r*(.12+(k%4)*.02),x+r*.9,y+off+r*(.07-(k%3)*.018));
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x+off-r*(.06-(k%2)*.02),y-r*.9);
          ctx.bezierCurveTo(x+off+r*(.13+(k%3)*.018),y-r*.42,x+off-r*(.11-(k%4)*.012),y+r*.22,x+off+r*(.08+(k%2)*.02),y+r*.9);
          ctx.stroke();
        }
        ctx.strokeStyle='rgba(255,255,232,.42)';
        ctx.lineWidth=Math.max(.7,r*.014);
        for(let k=-6;k<=6;k++){
          ctx.beginPath();
          ctx.moveTo(x-r*.78,y+(k*.14-.05)*r);
          ctx.quadraticCurveTo(x-r*.12,y+(k*.12+(k%2)*.05)*r,x+r*.78,y+(k*.14+.05)*r);
          ctx.stroke();
        }
      } else if(l===7){
        ctx.strokeStyle='rgba(126,82,18,.62)';
        ctx.lineWidth=Math.max(1.1,r*.026);
        const gap = r * .24;
        [-Math.PI / 4, Math.PI / 4].forEach(rot => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          for(let off=-r*1.45; off<=r*1.45; off+=gap){
            ctx.beginPath();
            ctx.moveTo(-r*1.55, off);
            ctx.lineTo(r*1.55, off);
            ctx.stroke();
          }
          ctx.restore();
        });
        const dotR = Math.max(1.25,r*.024);
        for(let a=-6;a<=5;a++){
          for(let b=-6;b<=5;b++){
            const u = (a + .5) * gap;
            const v = (b + .5) * gap;
            const px = (u - v) / Math.SQRT2;
            const py = (u + v) / Math.SQRT2;
            if(px*px + py*py > r*r*.68) continue;
            ctx.fillStyle='rgba(92,60,17,.58)';
            ctx.beginPath();
            ctx.ellipse(x+px,y+py,dotR*1.05,dotR*.78,-Math.PI/4,0,Math.PI*2);
            ctx.fill();
            ctx.fillStyle='rgba(255,235,126,.32)';
            ctx.beginPath();
            ctx.ellipse(x+px-dotR*.28,y+py-dotR*.32,dotR*.62,dotR*.34,-Math.PI/4,0,Math.PI*2);
            ctx.fill();
          }
        }
      } else if(l===8){
        ctx.strokeStyle='rgba(8,78,37,.58)';
        ctx.lineWidth=Math.max(2,r*.075);
        for(let i=-3;i<=3;i++){
          const side = i === 0 ? 0 : (i < 0 ? -1 : 1);
          const topX = x + i*r*.16;
          const midX = x + i*r*.26 + side*r*.12;
          const botX = x + i*r*.16;
          const wobble = (i % 2 ? -1 : 1) * r*.055;
          ctx.beginPath();
          ctx.moveTo(topX,y-r*.92);
          ctx.bezierCurveTo(midX+wobble,y-r*.62,midX-wobble,y-r*.28,midX,y-r*.05);
          ctx.bezierCurveTo(midX+wobble*1.2,y+r*.22,midX-wobble*.8,y+r*.56,botX,y+r*.92);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.strokeStyle='rgba(0,0,0,.22)';
      ctx.lineWidth=Math.max(1.5,r*.05);
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.ellipse(x-r*.28,y-r*.34,r*.18,r*.1,-.55,0,Math.PI*2);
      ctx.fill();
      if(l===7){
        ctx.save();
        ctx.translate(x,y-r*.94);
        ctx.strokeStyle='rgba(35,91,34,.54)';
        ctx.lineWidth=Math.max(.9,r*.018);
        function crownLeaf(angle,len,width,color){
          ctx.save();
          ctx.rotate(angle);
          ctx.fillStyle=color;
          ctx.beginPath();
          ctx.moveTo(0,0);
          ctx.quadraticCurveTo(-width*r*.55,-len*r*.42,0,-len*r);
          ctx.quadraticCurveTo(width*r*.55,-len*r*.42,0,0);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        crownLeaf(-.68,.55,.18,'rgba(66,132,50,.92)');
        crownLeaf(-.42,.72,.2,'rgba(77,150,58,.95)');
        crownLeaf(-.18,.86,.18,'rgba(54,124,47,.94)');
        crownLeaf(.08,.9,.2,'rgba(85,162,61,.96)');
        crownLeaf(.34,.72,.2,'rgba(61,136,50,.94)');
        crownLeaf(.62,.56,.18,'rgba(74,145,55,.92)');
        ctx.fillStyle='rgba(69,122,42,.95)';
        ctx.beginPath();
        ctx.ellipse(0,r*.03,r*.18,r*.075,0,0,Math.PI*2);
        ctx.fill();
        ctx.restore();
      } else if(l>=2){
        ctx.strokeStyle='#5f7f3d';
        ctx.lineWidth=Math.max(1.2,r*.06);
        ctx.beginPath();
        ctx.moveTo(x-r*.08,y-r*.92);
        ctx.quadraticCurveTo(x+r*.06,y-r*1.12,x+r*.18,y-r*.92);
        ctx.stroke();
      }
      ctx.restore();
    }
    function cachedFruitCanvas(l, scale){
      const s = scale || 1;
      const key = l + ':' + s;
      if (fruitCanvasCache[key]) return fruitCanvasCache[key];
      const f = fruits[l], r = f.r * s, pad = Math.ceil(Math.max(8, r * (l === 7 ? .36 : .18)));
      const size = Math.ceil((r + pad) * 2);
      const off = env.getHostDocument().createElement('canvas');
      off.width = size;
      off.height = size;
      const offCtx = off.getContext('2d');
      drawFruitRaw(offCtx, size / 2, size / 2, l, 1, s, 0);
      fruitCanvasCache[key] = { canvas:off, size };
      return fruitCanvasCache[key];
    }
    function drawFruit(x,y,l,alpha,scale,angle){
      const r=fruits[l].r*(scale||1);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle||0);
      const painted=drawGameSprite(ctx,'fruits',[0,1,12,13,4,5,9,8,10][l],-r*1.13,-r*1.13,r*2.26,r*2.26,alpha==null?1:alpha);
      ctx.restore();if(painted)return;
      const item = cachedFruitCanvas(l, scale || 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle || 0);
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(item.canvas, -item.size / 2, -item.size / 2);
      ctx.restore();
    }
    function watermelonBackground(){
      const theme = env.settings().theme || 'day';
      const key = theme + ':' + W + ':' + H;
      if (watermelonBgCache && watermelonBgCache.key === key) return watermelonBgCache.canvas;
      const off = env.getHostDocument().createElement('canvas');
      off.width = W;
      off.height = H;
      const bgCtx = off.getContext('2d');
      const night=env.isNightTheme(theme), pal=env.canvasThemePalette();
      const bg=bgCtx.createLinearGradient(0,0,0,H);
      bg.addColorStop(0,pal.top);
      bg.addColorStop(1,pal.bottom);
      bgCtx.fillStyle=bg;
      bgCtx.fillRect(0,0,W,H);
      bgCtx.fillStyle=pal.pattern;
      for(let y=54;y<H;y+=42) for(let x=(y/42)%2?26:10;x<W;x+=52){ bgCtx.beginPath(); bgCtx.arc(x,y,2.2,0,Math.PI*2); bgCtx.fill(); }
      bgCtx.strokeStyle=pal.border;
      bgCtx.lineWidth=3;
      bgCtx.strokeRect(1.5,1.5,W-3,H-3);
      bgCtx.setLineDash([6,6]);
      bgCtx.strokeStyle=night?pal.grid:'rgba(216,75,66,.38)';
      bgCtx.beginPath();
      bgCtx.moveTo(0,36);
      bgCtx.lineTo(W,36);
      bgCtx.stroke();
      bgCtx.setLineDash([]);
      bgCtx.font='12px Georgia, serif';
      bgCtx.fillStyle=pal.text;
      bgCtx.fillText('下一颗', 12, 22);
      watermelonBgCache = { key, canvas:off };
      return off;
    }
    function drawAim(){ if(!aiming || aimX == null || dropping || env.gamePaused || over) return; const f=fruits[next], x=Math.max(f.r, Math.min(W-f.r, aimX)), y=f.r+6; ctx.save(); ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(58,143,145,.62)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,36); ctx.lineTo(x,H-4); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); drawFruit(x,y,next,.58,1); }
    function draw(){ ctx.clearRect(0,0,W,H); ctx.drawImage(watermelonBackground(),0,0); drawFruit(W-34,22,next,1,.62,0); balls.forEach(b=>{ if(!b) return; drawFruit(b.x,b.y,b.l,1,1,b.a||0); }); drawAim(); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; if(!over && !seen.near_top && balls.some(b=>b.y-fruits[b.l].r<72 && Math.abs(b.vy)<.35)){ seen.near_top=1; env.speak('watermelon','near_top'); } if(!over && !seen.gameover && balls.some(b=>b.y-fruits[b.l].r<50 && Math.abs(b.vy)<.3) && balls.length>8){ seen.gameover=1; env.speak('watermelon','gameover'); } }
  }
  startWatermelon(state);
  return env.activeGameController || null;
}
