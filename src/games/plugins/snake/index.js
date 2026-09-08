import { drawGameSprite, drawGameMaterial } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'snake';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["addSwipe","addTapDirection","canvasThemePalette","controlModeLabel","gamePaused","getHostDocument","getHostWindow","isNightTheme","nextControlMode","qs","qsa","saveProgress","scheduleFitGameSurface","setScore","settings","showGameOver","snakeTimer","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startSnake(state) {
    const box = env.qs('#wb-gamebox');
	    let controlMode = state?.controlMode || (state?.controlsHidden === false ? 'keys' : 'swipe');
	    if(!['keys','swipe','tap'].includes(controlMode)) controlMode = 'swipe';
	    box.innerHTML = '<div class="wb-snake-shell control-mode-' + controlMode + (controlMode !== 'keys' ? ' controls-hidden' : '') + '"><div class="wb-touch-togglebar"><button class="wb-btn wb-control-mode-btn" id="wb-snake-toggle-keys" type="button"></button></div><div class="wb-snake-playfield"><canvas class="wb-canvas wb-snake-canvas" id="wb-canvas" width="420" height="420"></canvas><div class="wb-snake-controls" aria-label="贪吃蛇方向键"><button class="wb-btn wb-arcade-btn up" data-dir="up" type="button" title="上" aria-label="上"></button><button class="wb-btn wb-arcade-btn left" data-dir="left" type="button" title="左" aria-label="左"></button><button class="wb-btn wb-arcade-btn down" data-dir="down" type="button" title="下" aria-label="下"></button><button class="wb-btn wb-arcade-btn right" data-dir="right" type="button" title="右" aria-label="右"></button></div></div></div>';
    const c = env.qs('#wb-canvas'), ctx = c.getContext('2d'), n = 21, size = 20;
    let snake = Array.isArray(state?.snake) && state.snake.length ? state.snake : [{x:10,y:10}];
    let dir = state?.dir || {x:1,y:0}, next = state?.next || dir, food = validFood(state?.food) ? state.food : randFood(), score = state?.score || 0, dead = false;
    let turnCount = state?.turnCount || 0, lastTurnSpeakAt = state?.lastTurnSpeakAt || 0;
    let snakeStats = state?.details || { fruits:Math.floor(score / 10), turnsSinceFruit:0, maxTurnsBetweenFruits:0, nearFoodPasses:0, deathReason:'' };
    env.setScore('snake', score);
    function validFood(p){ return p && p.x >= 2 && p.x < n - 2 && p.y >= 2 && p.y < n - 2 && !snake.some(s=>s.x===p.x&&s.y===p.y); }
    function randFood(){ const spots=[]; for(let y=2;y<n-2;y++) for(let x=2;x<n-2;x++) if(!snake.some(s=>s.x===x&&s.y===y)) spots.push({x,y}); return spots.length ? spots[Math.floor(Math.random()*spots.length)] : {x:10,y:10}; }
	    function save(){ if (!dead) env.saveProgress('snake', { snake, dir, next, food, score, turnCount, lastTurnSpeakAt, controlsHidden: controlMode !== 'keys', controlMode, details:snakeStats }); }
    function setSnakeDir(name){
      const m={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}[name];
      if(!m || (m.x === -dir.x && m.y === -dir.y) || (m.x === next.x && m.y === next.y)) return;
      next=m;
      turnCount++;
      snakeStats.turnsSinceFruit = (snakeStats.turnsSinceFruit || 0) + 1;
      const now = Date.now();
      if (turnCount === 1 || now - lastTurnSpeakAt >= 8000) {
        env.speak('snake','turn');
        lastTurnSpeakAt = now;
      }
      save();
    }
    env.getHostDocument().onkeydown = e => { const k={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key]; if(k){ setSnakeDir(k); e.preventDefault(); } };
	    env.addSwipe(box, d => { if(controlMode === 'swipe') setSnakeDir(d); });
	    env.addTapDirection(env.qs('.wb-snake-playfield', box), () => controlMode === 'tap', setSnakeDir, { fourWay:true });
	    function syncSnakeKeyToggle(){
	      const shell = env.qs('.wb-snake-shell', box);
	      if(shell){
	        shell.classList.remove('control-mode-keys','control-mode-swipe','control-mode-tap');
	        shell.classList.add('control-mode-' + controlMode);
	        shell.classList.toggle('controls-hidden', controlMode !== 'keys');
	      }
	      const btn = env.qs('#wb-snake-toggle-keys', box);
	      if(btn) btn.textContent = '模式：' + env.controlModeLabel(controlMode);
	      env.scheduleFitGameSurface();
	    }
	    const snakeToggle = env.qs('#wb-snake-toggle-keys', box);
	    if(snakeToggle) snakeToggle.onclick = () => { controlMode = env.nextControlMode(controlMode, ['keys','swipe','tap']); syncSnakeKeyToggle(); save(); };
	    env.qsa('.wb-snake-controls .wb-btn', box).forEach(btn => {
      const press = e => { e.preventDefault(); setSnakeDir(btn.dataset.dir); };
      btn.onpointerdown = press;
      btn.onclick = e => { if(env.getHostWindow().PointerEvent) return; press(e); };
    });
    function snakeDelay(){ return Math.max(90, 160 - Math.floor(score / 10) * 6); }
    function scheduleSnake(){ if(!dead) env.snakeTimer = setTimeout(stepSnake, snakeDelay()); }
    function stepSnake(){ if(dead) return; if(env.gamePaused){ scheduleSnake(); return; } dir = next; const h = {x: snake[0].x + dir.x, y: snake[0].y + dir.y}; const hitWall=h.x<0||h.y<0||h.x>=n||h.y>=n, hitBody=snake.some(s=>s.x===h.x&&s.y===h.y); if(hitWall||hitBody){ dead=true; snakeStats.deathReason = hitWall ? '撞墙' : '撞身子'; env.speak('snake','gameover'); env.showGameOver('snake', '游戏结束', '本局分数：' + score + '分', null, { score, details:snakeStats }); return; } const nearWall=h.x<=1||h.y<=1||h.x>=n-2||h.y>=n-2, nearSelf=snake.slice(1).some(s=>Math.abs(s.x-h.x)+Math.abs(s.y-h.y)<=1); if((nearWall||nearSelf) && Math.random()<.08) env.speak('snake','close_call'); snake.unshift(h); if(h.x===food.x&&food.y===h.y){ score += 10; env.setScore('snake', score); const eaten = score/10; snakeStats.fruits = eaten; snakeStats.maxTurnsBetweenFruits = Math.max(snakeStats.maxTurnsBetweenFruits || 0, snakeStats.turnsSinceFruit || 0); snakeStats.turnsSinceFruit = 0; if(eaten===1) env.speak('snake','eat_1'); if([5,10,20].includes(eaten)) env.speak('snake','eat_'+eaten); if(eaten>1 && eaten%4===0) env.speak('snake','speed_up'); food=randFood(); } else { if(Math.abs(h.x-food.x)+Math.abs(h.y-food.y)<=2) snakeStats.nearFoodPasses = (snakeStats.nearFoodPasses || 0) + 1; snake.pop(); } draw(); save(); scheduleSnake(); }
    scheduleSnake();
    function draw(){
      const night = env.isNightTheme();
      const mono = (env.settings().theme || 'day') === 'mono';
      const pal = env.canvasThemePalette();
      const bg = ctx.createLinearGradient(0,0,420,420);
      bg.addColorStop(0, pal.top);
      bg.addColorStop(1, pal.bottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,420,420);
      ctx.fillStyle = pal.pattern;
      for(let y=0;y<420;y+=40) for(let x=(y/40)%2?20:0;x<420;x+=40) ctx.fillRect(x,y,20,20);
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      for(let i=0;i<=n;i++){ const p=i*size+.5; ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,420); ctx.moveTo(0,p); ctx.lineTo(420,p); ctx.stroke(); }
      ctx.strokeStyle = mono ? 'rgba(0,0,0,.42)' : (night ? 'rgba(255,255,255,.2)' : 'rgba(80,55,48,.2)');
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5,1.5,417,417);
      const fx = food.x*size + size/2, fy = food.y*size + size/2;
      ctx.fillStyle = mono ? '#333333' : '#ef8f7a';
      ctx.beginPath(); ctx.arc(fx, fy, 8.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = mono ? '#f7f7f7' : '#ffd4c8';
      ctx.beginPath(); ctx.arc(fx-3, fy-3, 2.4, 0, Math.PI*2); ctx.fill();
      drawGameSprite(ctx,'fruits',5,fx-11,fy-11,22,22);
      snake.forEach((s,i)=>{
        const x=s.x*size+2, y=s.y*size+2, r=7;
        ctx.fillStyle = mono ? (i===0 ? '#111111' : (i%2 ? '#2f2f2f' : '#4a4a4a')) : (i===0 ? '#76c7b5' : (i%2 ? '#9ccbbb' : '#8fc5ad'));
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+16-r,y); ctx.quadraticCurveTo(x+16,y,x+16,y+r); ctx.lineTo(x+16,y+16-r); ctx.quadraticCurveTo(x+16,y+16,x+16-r,y+16); ctx.lineTo(x+r,y+16); ctx.quadraticCurveTo(x,y+16,x,y+16-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.fill();
        drawGameSprite(ctx,'candy-bubbles',10,x-2,y-2,20,20);
        if(i===0){ ctx.fillStyle=mono?'#ffffff':(night?'#101010':'#fffaf2'); const ex1=x+7+(dir.x*3)+(dir.y*-3), ey1=y+7+(dir.y*3)+(dir.x*3), ex2=x+9+(dir.x*3)+(dir.y*3), ey2=y+9+(dir.y*3)+(dir.x*-3); ctx.beginPath(); ctx.arc(ex1,ey1,1.7,0,Math.PI*2); ctx.arc(ex2,ey2,1.7,0,Math.PI*2); ctx.fill(); }
      });
    }
	    syncSnakeKeyToggle(); draw(); save();
	  }
  startSnake(state);
  return env.activeGameController || null;
}
