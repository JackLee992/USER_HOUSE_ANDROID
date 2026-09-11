import { drawGameSprite } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.

const STYLE_ID='wb-snake-classic-style';
const GRID=21;
const DEFAULT_SPEED_MODE='classic';
const SPEED_MODES=Object.freeze({
  relaxed:Object.freeze({label:'休闲',initialDelay:210,minDelay:128,speedStep:3}),
  classic:Object.freeze({label:'经典',initialDelay:160,minDelay:84,speedStep:3}),
  turbo:Object.freeze({label:'极速',initialDelay:110,minDelay:58,speedStep:2})
});
const DIRS=Object.freeze({up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}});
const KEYMAP=Object.freeze({ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'});

const clonePoint=p=>({x:p.x,y:p.y});
const same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
const opposite=(a,b)=>a&&b&&a.x===-b.x&&a.y===-b.y;
const inside=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<GRID&&p.y>=0&&p.y<GRID;
const validDirection=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Math.abs(p.x)+Math.abs(p.y)===1;
const validSnake=value=>Array.isArray(value)&&value.length>0&&value.length<=GRID*GRID&&value.every(inside)&&new Set(value.map(p=>p.x+','+p.y)).size===value.length;
const hostWindow=env=>{try{return env.getHostWindow?.()||globalThis;}catch{return globalThis;}};
const hostDocument=env=>{try{return env.getHostDocument?.()||hostWindow(env).document||globalThis.document;}catch{return globalThis.document;}};

function ensureStyles(doc){
  if(!doc?.head||doc.getElementById?.(STYLE_ID))return;
  const style=doc.createElement('style');style.id=STYLE_ID;style.textContent=`
#wb-snake-classic-fullscreen,#wb-snake-classic-fullscreen *{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#wb-snake-classic-fullscreen{position:fixed;inset:0;z-index:2147483000;width:100vw;height:100vh;height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;gap:8px;padding:env(safe-area-inset-top) env(safe-area-inset-right) max(8px,env(safe-area-inset-bottom)) env(safe-area-inset-left);overflow:hidden;background:radial-gradient(circle at 50% 16%,#173f34 0,#0b211f 54%,#061311 100%);color:#f4fff7;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;touch-action:none;overscroll-behavior:none;isolation:isolate}
#wb-snake-classic-fullscreen button{font:inherit;color:inherit;touch-action:none;-webkit-tap-highlight-color:transparent;cursor:pointer}#wb-snake-classic-fullscreen button:focus-visible{outline:3px solid #d7ff78;outline-offset:2px}
#wb-snake-classic-fullscreen .sc-head{z-index:3;display:grid;grid-template-columns:58px minmax(0,1fr) 58px;align-items:start;gap:8px;padding:12px 12px 0}.sc-round{width:52px;height:52px;border:0;border-radius:999px;background:rgba(239,255,238,.74);color:#15322d;font-size:13px;font-weight:900;box-shadow:0 10px 24px rgba(0,0,0,.24),inset 0 0 0 1px rgba(255,255,255,.58);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2)}
#wb-snake-classic-fullscreen .sc-score{justify-self:center;min-width:150px;max-width:100%;border-radius:23px;padding:7px 18px 9px;background:rgba(239,255,238,.72);color:#17332e;text-align:center;box-shadow:0 12px 28px rgba(0,0,0,.20),inset 0 0 0 1px rgba(255,255,255,.60);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2)}.sc-score strong{display:block;font-size:29px;line-height:1;font-variant-numeric:tabular-nums}.sc-score span{display:block;margin-top:3px;font-size:10px;font-weight:850;color:#526c61;letter-spacing:.5px}
#wb-snake-classic-fullscreen .sc-stage{position:relative;z-index:1;min-height:0;display:grid;place-items:center;padding:0 12px}#wb-snake-classic-fullscreen .sc-canvas{display:block;width:min(100%,calc(100dvh - 250px));max-width:640px;aspect-ratio:1;border-radius:24px;background:#0b231f;box-shadow:0 24px 54px rgba(0,0,0,.35),0 0 0 1px rgba(218,255,201,.22),inset 0 0 0 2px rgba(255,255,255,.06);touch-action:none}#wb-snake-classic-fullscreen .sc-ready{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(86%,330px);display:grid;gap:7px;padding:16px 18px;border-radius:20px;background:rgba(238,255,224,.92);color:#17352e;text-align:center;box-shadow:0 16px 44px rgba(0,0,0,.34),inset 0 0 0 1px rgba(255,255,255,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.sc-ready[hidden]{display:none!important}.sc-ready strong{font-size:20px}.sc-ready span{font-size:11px;font-weight:750;color:#506b61}
#wb-snake-classic-fullscreen .sc-speed-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:4px 0 1px}.sc-speed-option{min-height:44px;border:1px solid rgba(37,102,79,.16);border-radius:13px;background:rgba(218,235,215,.84);color:#274d40!important;font-size:13px;font-weight:900;box-shadow:inset 0 1px rgba(255,255,255,.74)}.sc-speed-option.is-active{border-color:#25664f;background:#25664f;color:#fff!important;box-shadow:0 5px 13px rgba(30,94,71,.24)}.sc-speed-option:active{transform:scale(.98)}
#wb-snake-classic-fullscreen .sc-controls{z-index:3;display:grid;grid-template-columns:repeat(3,64px);grid-template-rows:repeat(3,54px);justify-content:center;gap:5px;margin:0 auto;padding:4px 0 0}.sc-pad{min-width:54px;min-height:50px;border:1px solid rgba(220,255,207,.38);border-radius:19px;background:linear-gradient(180deg,rgba(238,255,230,.88),rgba(197,231,190,.76));color:#18352d;font-size:24px;font-weight:950;box-shadow:0 7px 18px rgba(0,0,0,.23),inset 0 1px 0 rgba(255,255,255,.68)}.sc-pad:active,.sc-pad.is-held{transform:translateY(1px);background:#d9ff89;color:#11261f}.sc-pad[data-classic-dir=up]{grid-column:2;grid-row:1}.sc-pad[data-classic-dir=left]{grid-column:1;grid-row:2}.sc-pad[data-classic-dir=right]{grid-column:3;grid-row:2}.sc-pad[data-classic-dir=down]{grid-column:2;grid-row:3}.sc-pad-center{grid-column:2;grid-row:2;border-radius:18px;background:rgba(217,255,137,.15);box-shadow:inset 0 0 0 1px rgba(217,255,137,.20)}
#wb-snake-classic-fullscreen .sc-help{z-index:2;margin:0;padding:0 16px 5px;text-align:center;font-size:11px;line-height:1.5;color:rgba(232,255,229,.76)}#wb-snake-classic-fullscreen .sc-mask{position:absolute;inset:0;z-index:8;display:grid;place-items:center;padding:22px;background:rgba(5,14,13,.44);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}#wb-snake-classic-fullscreen .sc-mask[hidden]{display:none!important}.sc-dialog{width:min(100%,330px);border-radius:25px;background:rgba(246,255,240,.93);padding:24px 20px;color:#19352e;text-align:center;box-shadow:0 20px 58px rgba(0,0,0,.38),inset 0 0 0 1px rgba(255,255,255,.72)}.sc-dialog h2{margin:0 0 8px;font-size:23px}.sc-dialog p{margin:0 0 18px;font-size:13px;line-height:1.65;color:#536f63}.sc-dialog-actions{display:grid;gap:10px}.sc-dialog button{min-height:46px;border:0;border-radius:15px;background:#dfeee0;color:#18352d;font-weight:900}.sc-dialog button.primary{background:#25664f;color:#fff}
@media(orientation:landscape){#wb-snake-classic-fullscreen{grid-template-columns:minmax(0,1fr) minmax(148px,25vw);grid-template-rows:auto minmax(0,1fr) auto;gap:6px 9px;padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right));padding-bottom:max(6px,env(safe-area-inset-bottom))}#wb-snake-classic-fullscreen .sc-head{grid-column:1;grid-row:1;padding:7px 8px 0;grid-template-columns:48px minmax(0,1fr) 48px}.sc-round{width:44px;height:44px;font-size:12px}#wb-snake-classic-fullscreen .sc-score{min-width:126px;padding:5px 12px}.sc-score strong{font-size:22px}.sc-score span{font-size:9px}#wb-snake-classic-fullscreen .sc-stage{grid-column:1;grid-row:2/4;padding:0 0 6px 8px;overflow:hidden}#wb-snake-classic-fullscreen .sc-canvas{width:auto;height:100%;max-width:100%;max-height:100%;border-radius:20px}#wb-snake-classic-fullscreen .sc-controls{grid-column:2;grid-row:2;align-self:center;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,48px);gap:4px}.sc-pad{min-width:46px;min-height:44px;border-radius:16px;font-size:21px}#wb-snake-classic-fullscreen .sc-help{grid-column:2;grid-row:3;align-self:end;padding:0 6px 6px;font-size:9px}}
@media(max-height:680px) and (orientation:portrait){#wb-snake-classic-fullscreen .sc-head{padding-top:6px}.sc-round{width:46px;height:46px}.sc-score strong{font-size:24px}#wb-snake-classic-fullscreen .sc-controls{grid-template-columns:repeat(3,58px);grid-template-rows:repeat(3,48px)}#wb-snake-classic-fullscreen .sc-help{display:none}#wb-snake-classic-fullscreen .sc-canvas{width:min(100%,calc(100dvh - 205px))}}
`;doc.head.append?.(style);
}

function createSurface(env){
  const doc=hostDocument(env),win=hostWindow(env),box=env.qs('#wb-gamebox');ensureStyles(doc);
  const root=doc.createElement('section');root.id='wb-snake-classic-fullscreen';root.className='snake-classic';root.setAttribute('aria-label','经典贪吃蛇');root.innerHTML=`
    <header class="sc-head"><button data-classic-exit class="sc-round" type="button" aria-label="返回">返回</button><div class="sc-score"><strong data-classic-score>0</strong><span data-classic-speed>速度 1 · 经典方格</span></div><button data-classic-pause class="sc-round" type="button" aria-label="暂停">暂停</button></header>
    <main class="sc-stage"><canvas class="sc-canvas" width="840" height="840" aria-label="经典贪吃蛇棋盘"></canvas><div class="sc-ready" data-classic-ready><strong>选择节奏</strong><span>选好速度后，滑动棋盘或按方向键开始</span><div class="sc-speed-picker" aria-label="游戏速度"><button class="sc-speed-option" data-classic-speed-mode="relaxed" type="button">休闲</button><button class="sc-speed-option" data-classic-speed-mode="classic" type="button">经典</button><button class="sc-speed-option" data-classic-speed-mode="turbo" type="button">极速</button></div></div></main>
    <nav class="sc-controls" aria-label="经典方向键"><button class="sc-pad" data-classic-dir="up" type="button" aria-label="上">▲</button><button class="sc-pad" data-classic-dir="left" type="button" aria-label="左">◀</button><div class="sc-pad-center"></div><button class="sc-pad" data-classic-dir="right" type="button" aria-label="右">▶</button><button class="sc-pad" data-classic-dir="down" type="button" aria-label="下">▼</button></nav>
    <p class="sc-help">滑动或点击棋盘转向，方向键支持连续预输入。吃到食物会立刻增加一格，撞墙或撞到自己结束。</p>
    <div class="sc-mask" data-classic-mask hidden><div class="sc-dialog"><h2 data-classic-dialog-title>已暂停</h2><p data-classic-dialog-text>可随时调整节奏，当前棋盘和方向会保留。</p><div class="sc-speed-picker" aria-label="游戏速度"><button class="sc-speed-option" data-classic-speed-mode="relaxed" type="button">休闲</button><button class="sc-speed-option" data-classic-speed-mode="classic" type="button">经典</button><button class="sc-speed-option" data-classic-speed-mode="turbo" type="button">极速</button></div><div class="sc-dialog-actions"><button class="primary" data-classic-resume type="button">继续</button><button data-classic-restart type="button">重新开始</button><button data-classic-exit-dialog type="button">保存并退出</button></div></div></div>`;
  if(doc.body?.append)doc.body.append(root);else box.replaceChildren?.(root);
  try{win.NativeBridge?.setGameImmersive?.(true);}catch{}
  return {root,box,release(){try{win.NativeBridge?.setGameImmersive?.(false);}catch{};try{root.remove?.();}catch{};try{box.innerHTML='';}catch{}}};
}

function createInitialSnake(){return [{x:10,y:10},{x:9,y:10},{x:8,y:10},{x:7,y:10}];}

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createClassicGame(env, state) {
  const win=hostWindow(env),doc=hostDocument(env),surface=createSurface(env),root=surface.root;
  const qs=selector=>root.querySelector?.(selector)||env.qs(selector,root);
  const qsa=selector=>[...(root.querySelectorAll?.(selector)||env.qsa?.(selector,root)||[])];
  const canvas=qs('.sc-canvas'),ctx=canvas.getContext('2d'),stage=qs('.sc-stage');
  const scoreLabel=qs('[data-classic-score]'),speedLabel=qs('[data-classic-speed]'),pauseButton=qs('[data-classic-pause]'),mask=qs('[data-classic-mask]'),readyLabel=qs('[data-classic-ready]'),dialogTitle=qs('[data-classic-dialog-title]'),dialogText=qs('[data-classic-dialog-text]');
  let snake=validSnake(state?.snake)?state.snake.map(clonePoint):createInitialSnake();
  let dir=validDirection(state?.dir)?{x:state.dir.x,y:state.dir.y}:{x:1,y:0};
  let next=validDirection(state?.next)?{x:state.next.x,y:state.next.y}:dir;
  if(opposite(next,dir))next=dir;
  let queued=[],food=inside(state?.food)&&!snake.some(p=>same(p,state.food))?clonePoint(state.food):null,score=Number.isFinite(state?.score)?Math.max(0,Math.floor(state.score)):0;
  let speedMode=Object.hasOwn(SPEED_MODES,state?.speedMode)?state.speedMode:DEFAULT_SPEED_MODE;
  let dead=false,destroyed=false,localPaused=false,ready=state?.ready===true||!validSnake(state?.snake),timer=null,raf=null,resizeObserver=null,turnCount=state?.turnCount||0,lastTurnSpeakAt=state?.lastTurnSpeakAt||0;
  let snakeStats=state?.details||{fruits:Math.floor(score/10),turnsSinceFruit:0,maxTurnsBetweenFruits:0,nearFoodPasses:0,deathReason:''};
  let boardSize=420,cell=20,originX=0,originY=0,lastDraw=0;
  if(!food)food=randFood();
  env.setScore('snake',score);

  function randFood(){const spots=[];for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++)if(!snake.some(s=>s.x===x&&s.y===y))spots.push({x,y});return spots.length?spots[Math.floor(Math.random()*spots.length)]:{x:10,y:10};}
  function paused(){return localPaused||env.gamePaused===true;}
  function speedConfig(){return SPEED_MODES[speedMode]||SPEED_MODES[DEFAULT_SPEED_MODE];}
  function delay(){const config=speedConfig();return Math.max(config.minDelay,config.initialDelay-Math.floor(score/10)*config.speedStep);}
  function statePayload(){return {snake:snake.map(clonePoint),dir:{...dir},next:queued[0]||next,food:{...food},score,speedMode,ready,turnCount,lastTurnSpeakAt,controlsHidden:true,controlMode:'classic-fullscreen',details:{...snakeStats}};}
  function save(){if(!dead&&!destroyed)env.saveProgress('snake',statePayload());}
  function clearTimer(){if(timer!=null){win.clearTimeout?.(timer);timer=null;}if(raf!=null){win.cancelAnimationFrame?.(raf);raf=null;}}
  function schedule(){if(dead||destroyed||ready)return;clearTimer();timer=win.setTimeout?.(step,delay());}
  function directionName(vector){return Object.entries(DIRS).find(([,value])=>same(value,vector))?.[0]||'right';}
  function haptic(kind='tick'){try{win.NativeBridge?.performHapticFeedback?.(kind);}catch{}try{win.navigator?.vibrate?.(kind==='eat'?18:8);}catch{}}
  function queueDirection(name){
    const value=DIRS[name];if(!value||dead||destroyed||paused())return false;
    const planned=queued.at(-1)||next||dir;
    if(opposite(value,planned))return false;
    if(same(value,planned)){if(!ready)return false;ready=false;syncReady();haptic('tick');save();schedule();return true;}
    if(queued.length>=3)return false;queued.push(value);next=queued[0];turnCount++;snakeStats.turnsSinceFruit=(snakeStats.turnsSinceFruit||0)+1;
    const now=Date.now();if(turnCount===1||now-lastTurnSpeakAt>=8000){env.speak?.('snake','turn');lastTurnSpeakAt=now;}
    if(ready){ready=false;syncReady();}haptic('tick');save();schedule();return true;
  }
  function restart(){snake=createInitialSnake();dir={x:1,y:0};next=dir;queued=[];score=0;dead=false;localPaused=false;ready=true;snakeStats={fruits:0,turnsSinceFruit:0,maxTurnsBetweenFruits:0,nearFoodPasses:0,deathReason:''};food=randFood();env.setScore('snake',score);syncPause();syncReady();draw(true);save();}
  function finish(reason){dead=true;clearTimer();localPaused=false;syncPause();snakeStats.deathReason=reason;env.speak?.('snake','gameover');releaseSurface();env.showGameOver('snake','游戏结束','本局分数：'+score+'分',null,{score,details:snakeStats});}
  function step(){
    timer=null;if(dead||destroyed)return;if(paused()){schedule();return;}
    if(queued.length){dir=queued.shift();next=queued[0]||dir;}else dir=next;
    const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
    const hitWall=!inside(head),hitBody=snake.some(p=>same(p,head));
    if(hitWall||hitBody){finish(hitWall?'撞墙':'撞身子');return;}
    snake.unshift(head);
    if(same(head,food)){
      score+=10;env.setScore('snake',score);const eaten=score/10;snakeStats.fruits=eaten;snakeStats.maxTurnsBetweenFruits=Math.max(snakeStats.maxTurnsBetweenFruits||0,snakeStats.turnsSinceFruit||0);snakeStats.turnsSinceFruit=0;
      if(eaten===1)env.speak?.('snake','eat_1');if([5,10,20].includes(eaten))env.speak?.('snake','eat_'+eaten);if(eaten>1&&eaten%4===0)env.speak?.('snake','speed_up');
      food=randFood();haptic('eat');
    }else{
      if(Math.abs(head.x-food.x)+Math.abs(head.y-food.y)<=2)snakeStats.nearFoodPasses=(snakeStats.nearFoodPasses||0)+1;
      snake.pop();
    }
    draw();save();schedule();
  }
  function syncPause(){
    const isPaused=paused()&&!dead&&!destroyed;
    pauseButton.textContent=isPaused?'继续':'暂停';pauseButton.setAttribute?.('aria-pressed',String(isPaused));mask.hidden=!isPaused;dialogTitle.textContent='已暂停';dialogText.textContent='当前棋盘已保存，继续后方向队列会保留。';
  }
  function syncReady(){readyLabel.hidden=!ready;}
  function syncSpeed(){
    for(const button of qsa('[data-classic-speed-mode]')){const active=button.dataset.classicSpeedMode===speedMode;button.classList?.toggle('is-active',active);button.setAttribute?.('aria-pressed',String(active));}
  }
  function setSpeedMode(value){
    if(!Object.hasOwn(SPEED_MODES,value)||value===speedMode)return false;
    speedMode=value;syncSpeed();draw(true);save();if(!ready&&!paused())schedule();haptic('tick');return true;
  }
  function boardMetrics(){
    const stageRect=stage.getBoundingClientRect?.()||{width:420,height:420};const stageStyle=win.getComputedStyle?.(stage)||{};
    const horizontal=(parseFloat(stageStyle.paddingLeft)||0)+(parseFloat(stageStyle.paddingRight)||0),vertical=(parseFloat(stageStyle.paddingTop)||0)+(parseFloat(stageStyle.paddingBottom)||0);
    const css=Math.max(160,Math.min(640,(stageRect.width||420)-horizontal,(stageRect.height||420)-vertical));const ratio=Math.min(3,Math.max(1,win.devicePixelRatio||1));
    if(Math.abs(boardSize-css)>1||canvas.width!==Math.round(css*ratio)){boardSize=css;cell=boardSize/GRID;canvas.width=canvas.height=Math.round(boardSize*ratio);canvas.style.width=boardSize+'px';canvas.style.height=boardSize+'px';ctx.setTransform(ratio,0,0,ratio,0,0);}
    const rect=canvas.getBoundingClientRect?.()||{left:0,top:0};
    originX=rect.left||0;originY=rect.top||0;
  }
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
  function draw(force=false){
    const now=Date.now();if(!force&&now-lastDraw<16)return;lastDraw=now;boardMetrics();ctx.setTransform(canvas.width/boardSize,0,0,canvas.height/boardSize,0,0);
    const bg=ctx.createLinearGradient(0,0,boardSize,boardSize);bg.addColorStop(0,'#10382f');bg.addColorStop(1,'#061a17');ctx.fillStyle=bg;ctx.fillRect(0,0,boardSize,boardSize);
    ctx.fillStyle='rgba(222,255,201,.035)';for(let y=0;y<GRID;y++)for(let x=(y%2);x<GRID;x+=2)ctx.fillRect(x*cell,y*cell,cell,cell);
    ctx.strokeStyle='rgba(203,255,190,.16)';ctx.lineWidth=1;for(let i=0;i<=GRID;i++){const p=i*cell+.5;ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,boardSize);ctx.moveTo(0,p);ctx.lineTo(boardSize,p);ctx.stroke();}
    ctx.strokeStyle='rgba(219,255,153,.62)';ctx.lineWidth=Math.max(2,cell*.08);roundedRect(2,2,boardSize-4,boardSize-4,Math.max(14,cell*.6));ctx.stroke();
    const fx=food.x*cell+cell/2,fy=food.y*cell+cell/2,fr=cell*.38;ctx.save();ctx.shadowColor='rgba(255,84,79,.58)';ctx.shadowBlur=cell*.28;ctx.fillStyle='#ff514c';ctx.beginPath();ctx.arc(fx,fy,fr,0,Math.PI*2);ctx.fill();ctx.restore();drawGameSprite(ctx,'fruits',5,fx-fr*1.15,fy-fr*1.15,fr*2.3,fr*2.3);
    for(let i=snake.length-1;i>=0;i--){const p=snake[i],x=p.x*cell+cell*.1,y=p.y*cell+cell*.1,w=cell*.8,r=Math.max(5,cell*.22);const head=i===0;const grd=ctx.createLinearGradient(x,y,x+w,y+w);grd.addColorStop(0,head?'#e5ff8a':'#83e77a');grd.addColorStop(1,head?'#48cf71':(i%2?'#3bc77a':'#2fb86e'));ctx.fillStyle=grd;ctx.shadowColor=head?'rgba(214,255,116,.45)':'transparent';ctx.shadowBlur=head?cell*.16:0;roundedRect(x,y,w,w,r);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='rgba(4,38,30,.38)';ctx.lineWidth=Math.max(1,cell*.04);ctx.stroke();if(head){const fx=dir.x,fy=dir.y;for(const side of [-1,1]){const ex=x+w*.5+fx*w*.18-fy*side*w*.2,ey=y+w*.5+fy*w*.18+fx*side*w*.2;ctx.fillStyle='#fffdf1';ctx.beginPath();ctx.arc(ex,ey,w*.105,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10251f';ctx.beginPath();ctx.arc(ex+fx*w*.035,ey+fy*w*.035,w*.052,0,Math.PI*2);ctx.fill();}}}
    scoreLabel.textContent=String(score);speedLabel.textContent=speedConfig().label+' · 速度 '+(1+Math.floor(score/40))+' · 长度 '+snake.length;syncPause();syncReady();syncSpeed();
  }
  function canvasDirection(clientX,clientY){const rect=canvas.getBoundingClientRect?.()||{left:originX,top:originY,width:boardSize,height:boardSize};const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=clientX-cx,dy=clientY-cy;if(Math.abs(dx)>Math.abs(dy))return dx<0?'left':'right';return dy<0?'up':'down';}
  function directionFromDelta(dx,dy){if(Math.max(Math.abs(dx),Math.abs(dy))<14)return null;return Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');}
  let pointer=null;
  function pointerDown(event){if(dead||destroyed||paused())return;pointer={id:event.pointerId??1,x:event.clientX??0,y:event.clientY??0,moved:false};event.preventDefault?.();canvas.setPointerCapture?.(pointer.id);}
  function pointerMove(event){if(!pointer||((event.pointerId??1)!==pointer.id)||paused())return;const x=event.clientX??pointer.x,y=event.clientY??pointer.y,name=directionFromDelta(x-pointer.x,y-pointer.y);if(name){queueDirection(name);pointer={...pointer,x,y,moved:true};}event.preventDefault?.();}
  function pointerEnd(event){if(!pointer||((event.pointerId??1)!==pointer.id))return;if(!pointer.moved&&!paused())queueDirection(canvasDirection(event.clientX??pointer.x,event.clientY??pointer.y));canvas.releasePointerCapture?.(pointer.id);pointer=null;event.preventDefault?.();}
  function keyHandler(event){const name=KEYMAP[event.key];if(name){if(queueDirection(name))event.preventDefault?.();}}
  const buttonHandlers=[];
  for(const button of qsa('[data-classic-dir]')){
    const name=button.dataset.classicDir;const press=event=>{event.preventDefault?.();button.classList?.add('is-held');button.setPointerCapture?.(event.pointerId);queueDirection(name);};const release=()=>button.classList?.remove('is-held');const click=event=>{if(!win.PointerEvent)press(event);};
    button.addEventListener?.('pointerdown',press);button.addEventListener?.('pointerup',release);button.addEventListener?.('pointercancel',release);button.addEventListener?.('lostpointercapture',release);button.addEventListener?.('click',click);buttonHandlers.push([button,press,release,click]);
  }
  const speedHandlers=[];
  for(const button of qsa('[data-classic-speed-mode]')){const handler=event=>{event.preventDefault?.();setSpeedMode(button.dataset.classicSpeedMode);};button.addEventListener?.('click',handler);speedHandlers.push([button,handler]);}
  const blockContextMenu=event=>event.preventDefault();const resize=()=>draw(true);const visibility=()=>{if(doc.hidden)clearTimer();else schedule();};
  canvas.addEventListener?.('pointerdown',pointerDown);canvas.addEventListener?.('pointermove',pointerMove);canvas.addEventListener?.('pointerup',pointerEnd);canvas.addEventListener?.('pointercancel',pointerEnd);root.addEventListener?.('contextmenu',blockContextMenu);doc.addEventListener?.('keydown',keyHandler);
  pauseButton.addEventListener?.('click',()=>{if(dead||destroyed)return;localPaused=!localPaused;syncPause();save();if(!localPaused)schedule();});
  qs('[data-classic-resume]').addEventListener?.('click',()=>{localPaused=false;syncPause();schedule();});
  qs('[data-classic-restart]').addEventListener?.('click',restart);
  const exit=()=>{save();releaseSurface();if(typeof env.exit==='function')env.exit();else env.qs?.('#wb-back')?.click?.();};
  qs('[data-classic-exit]').addEventListener?.('click',exit);qs('[data-classic-exit-dialog]').addEventListener?.('click',exit);
  resizeObserver=typeof win.ResizeObserver==='function'?new win.ResizeObserver(resize):null;resizeObserver?.observe?.(stage);win.addEventListener?.('resize',resize);doc.addEventListener?.('visibilitychange',visibility);
  let surfaceReleased=false;
  function releaseSurface(){if(surfaceReleased)return;surfaceReleased=true;clearTimer();resizeObserver?.disconnect?.();surface.release();}
  draw(true);save();schedule();
  return {save,getState:()=>({mode:'classic',fullscreen:root.id==='wb-snake-classic-fullscreen',snake:snake.map(clonePoint),dir:{...dir},next:queued[0]||next,queued:queued.map(v=>directionName(v)),food:{...food},score,speedMode,speedLabel:speedConfig().label,turnCount,ready,dead,paused:paused(),delay:delay()}),destroy(){if(destroyed)return;destroyed=true;clearTimer();doc.removeEventListener?.('keydown',keyHandler);doc.removeEventListener?.('visibilitychange',visibility);win.removeEventListener?.('resize',resize);canvas.removeEventListener?.('pointerdown',pointerDown);canvas.removeEventListener?.('pointermove',pointerMove);canvas.removeEventListener?.('pointerup',pointerEnd);canvas.removeEventListener?.('pointercancel',pointerEnd);root.removeEventListener?.('contextmenu',blockContextMenu);for(const [button,press,release,click]of buttonHandlers){button.removeEventListener?.('pointerdown',press);button.removeEventListener?.('pointerup',release);button.removeEventListener?.('pointercancel',release);button.removeEventListener?.('lostpointercapture',release);button.removeEventListener?.('click',click);}for(const [button,handler]of speedHandlers)button.removeEventListener?.('click',handler);releaseSurface();}};
}
