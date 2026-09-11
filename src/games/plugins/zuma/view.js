import {createZumaEngine,zumaPointAt} from './engine.js';
import {getCanvasPixelRatio,getPerformanceMode} from '../../../../standalone/performance.js';
import {getLocale} from '../../../../standalone/i18n.js';
import {zumaLabels} from './labels.js';
import {createMarbleGL} from './marble-gl.js';
import {readZumaSave,writeZumaSave} from './save.js';

const ART=new URL('../../../../assets/game-art/zuma/',import.meta.url);
const COLORS=['#eb4132','#ffd448','#54b658','#329bec','#9b59df','#f88a32'];
const RGB=COLORS.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255));
const SYMBOLS=['◉','△','✦','≋','◇','⌁'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const styles=`
#wb-zuma-fullscreen{position:fixed;inset:0;z-index:2147483000;box-sizing:border-box;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:#14231d center/cover;color:#f6e5b0;font-family:system-ui,sans-serif;isolation:isolate;overscroll-behavior:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);touch-action:none}
#wb-zuma-fullscreen *{box-sizing:border-box}#wb-zuma-fullscreen button{font:inherit;cursor:pointer;color:#ffedb3;touch-action:manipulation;-webkit-tap-highlight-color:transparent}#wb-zuma-fullscreen button:focus-visible{outline:3px solid #ffe08c;outline-offset:2px}
.zc-head{position:relative;z-index:4;background:linear-gradient(#3e4630,#222e22);border-bottom:2px solid #a58b42;box-shadow:0 5px 18px #0008;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:7px 14px}
.zc-heading{text-align:center;min-width:0}.zc-heading b{display:block;font-family:Georgia,serif;font-size:24px;letter-spacing:5px;color:#f7d270;text-shadow:0 2px #17180e,0 -1px #fff7c2}.zc-heading small{font-size:9px;letter-spacing:2px;color:#d2bb7b;white-space:nowrap}
.zc-score span,.zc-stage-label{font-size:10px;color:#d0bf88;letter-spacing:1px}.zc-score b{display:block;color:#fff4c6;font-size:21px;font-variant-numeric:tabular-nums;text-shadow:0 2px 2px #000}.zc-right{text-align:right}.zc-lives{color:#e5c45b;font-size:17px;letter-spacing:3px;white-space:nowrap}
.zc-progress-wrap{grid-column:1/-1;display:flex;align-items:center;gap:8px;min-width:0}.zc-stage-label{min-width:0;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zc-progress{isolation:isolate;position:relative;height:15px;flex:1;background:#0e1a17;border:2px solid #aa853b;border-radius:12px;box-shadow:inset 0 2px 5px #000,0 1px #c9b471;overflow:hidden}.zc-progress i{position:absolute;inset:2px auto 2px 2px;width:0;max-width:calc(100% - 4px);border-radius:8px;background:linear-gradient(#fff29a,#db9d23 60%,#9e5e0d);box-shadow:0 0 8px #ffc93a}.zc-progress.ready i{background:linear-gradient(#d2ff92,#65c951,#287743)}
.zc-playfield{position:relative;min-height:0;min-width:0;overflow:hidden;background:#14271f center/cover}.zc-board{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}.zc-board canvas{position:absolute;inset:0;display:block;width:100%;height:100%}.zc-board canvas[hidden]{display:none}.zc-canvas{touch-action:none;cursor:crosshair}.zc-effects{position:absolute;left:10px;top:10px;display:flex;gap:6px;pointer-events:none;z-index:3;flex-wrap:wrap;font-size:11px}.zc-effect{padding:5px 8px;border:1px solid #c6a34c;border-radius:5px;background:#152921df;color:#fcdfa2}
.zc-footer{z-index:4;display:grid;grid-template-columns:48px 1fr auto 48px;gap:8px;align-items:center;background:linear-gradient(#283629,#16231c);border-top:2px solid #8f753a;padding:7px 12px;box-shadow:0 -4px 12px #0006}.zc-icon,.zc-button{position:relative;isolation:isolate;border:1px solid #ad924d;border-radius:9px;background:linear-gradient(#4b6550,#1b3c2c);box-shadow:inset 0 1px #dcd08b55,0 3px 5px #0006;text-shadow:0 2px 2px #000}.zc-icon{height:45px;min-width:45px;font-size:21px!important}.zc-button{padding:11px 18px;min-height:46px;font-weight:800!important;letter-spacing:1px}.zc-icon:active,.zc-button:active{transform:translateY(1px);filter:brightness(1.12)}
.zc-hint{font-size:11px;line-height:1.5;color:#cfcca7;text-align:center}.zc-hint small{display:block;font-size:9px;color:#98ad97}.zc-swap{display:flex;align-items:center;gap:9px;min-width:94px;justify-content:center}.zc-preview{width:24px;height:24px;border-radius:50%;border:1px solid #fff5;box-shadow:0 2px 4px #0009;background:#ffd448}.zc-toast{position:absolute;z-index:6;left:50%;top:21%;transform:translateX(-50%);font-weight:900;color:#ffe497;text-shadow:0 3px 4px #102218,0 0 8px #050b08;font-size:24px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .12s}.zc-toast.show{opacity:1}
.zc-mask{position:absolute;inset:0;z-index:8;background:#06110fdc;display:grid;place-items:center;padding:20px;touch-action:pan-y}.zc-mask[hidden]{display:none}.zc-dialog{position:relative;isolation:isolate;max-width:460px;width:100%;padding:29px 24px;border:3px double #bd9a4f;border-radius:16px;background:linear-gradient(145deg,#344333,#182c23);box-shadow:0 20px 60px #0008,inset 0 0 32px #0006;text-align:center;max-height:100%;overflow:auto}.zc-dialog h2{font-size:27px;font-family:Georgia,serif;color:#f7d37a;margin:0 0 14px;text-shadow:0 3px 1px #141d15}.zc-dialog p{font-size:14px;line-height:1.85;color:#e0d6af;white-space:pre-line}.zc-dialog .zc-button{display:block;width:100%;margin-top:12px}.zc-dialog .zc-minor{background:#1a2c22;font-size:12px;font-weight:500!important}.zc-trophy{font-size:49px;color:#f5ce69;text-shadow:0 4px 20px #f5ba3950;margin-bottom:8px}.zc-skin{position:absolute;inset:0;z-index:-1;width:100%;height:100%;pointer-events:none;opacity:.7}.zc-icon .zc-skin,.zc-button .zc-skin{opacity:.86}.zc-footer .zc-skin{opacity:.4}
@media(orientation:landscape){.zc-head{grid-template-columns:1fr auto 1fr;padding:4px 16px;gap:3px 12px}.zc-heading b{font-size:20px;letter-spacing:4px}.zc-heading small{display:none}.zc-score{display:flex;gap:8px;align-items:center}.zc-score b{font-size:20px}.zc-right{display:flex;justify-content:flex-end;gap:10px;align-items:center}.zc-progress-wrap{gap:12px}.zc-progress{height:11px}.zc-stage-label{font-size:9px}.zc-footer{padding:4px 18px;grid-template-columns:48px 1fr auto 48px;gap:14px}.zc-icon{height:42px;min-height:42px}.zc-button{min-height:42px;padding:8px 16px}.zc-hint small{display:none}.zc-dialog{padding:18px 22px}.zc-dialog h2{font-size:23px;margin-bottom:6px}.zc-dialog p{margin:8px 0}.zc-trophy{font-size:33px}.zc-dialog .zc-button{margin-top:8px}#wb-zuma-fullscreen{grid-template-rows:auto minmax(0,1fr)}.zc-footer{position:absolute;left:0;right:0;bottom:0;background:none;border:0;box-shadow:none;pointer-events:none;padding:5px 12px}.zc-footer button{pointer-events:auto}.zc-footer .zc-hint{font-size:10px;text-shadow:0 2px #000}.zc-head{grid-template-columns:110px 85px minmax(0,1fr) 68px;min-height:43px}.zc-heading{grid-column:2;grid-row:1}.zc-score{grid-column:1;grid-row:1}.zc-right{grid-column:4;grid-row:1}.zc-progress-wrap{grid-column:3;grid-row:1;flex-direction:column;gap:3px;align-items:stretch}.zc-stage-label{max-width:100%;text-align:center}.zc-progress{flex:auto}.zc-heading b{font-size:17px}.zc-lives{font-size:13px}.zc-score span{font-size:8px}.zc-score b{font-size:16px}}
`;

export function createZumaGame(saved,env) {
  const {document:doc,window:win}=env, text=zumaLabels(getLocale());
  if(!doc.getElementById('wb-zuma-classic-css')){const style=doc.createElement('style');style.id='wb-zuma-classic-css';style.textContent=styles;doc.head.append(style);}
  const portal=doc.createElement('section');portal.id='wb-zuma-fullscreen';portal.setAttribute('aria-label',text.title);portal.dataset.gameVersion='1.1.3';
  portal.innerHTML=`<header class="zc-head"><div class="zc-score"><span>${text.score}</span><b id="wb-zuma-score">0</b></div><div class="zc-heading"><b>${text.title}</b><small>${text.subtitle}</small></div><div class="zc-right"><div class="zc-lives" id="wb-zuma-lives"></div></div><div class="zc-progress-wrap"><span class="zc-stage-label" id="wb-zuma-level"></span><div class="zc-progress" role="progressbar" aria-label="${text.target}" aria-valuemin="0" aria-valuemax="100"><i></i></div></div></header>
    <main class="zc-playfield"><div class="zc-board"><canvas class="zc-background"></canvas><canvas class="zc-marble-gl" hidden></canvas><canvas id="wb-zuma-canvas" class="zc-canvas wb-zuma-canvas" aria-label="${text.aim}"></canvas></div><div class="zc-effects"></div><div class="zc-toast" role="status"></div></main>
    <footer class="zc-footer"><button class="zc-icon" id="wb-zuma-pause" aria-label="${text.pause}">Ⅱ</button><div class="zc-hint">${text.aim}<small>${text.rotate}</small></div><button class="zc-button zc-swap" id="wb-zuma-swap" aria-label="${text.swap}"><canvas class="zc-preview" width="48" height="48"></canvas>${text.swap} ⇄</button><button class="zc-icon" id="wb-zuma-help" aria-label="${text.help}">?</button></footer>
    <div class="zc-mask" hidden><div class="zc-dialog" role="dialog" aria-modal="true" aria-labelledby="wb-zuma-dialog-title"><div class="zc-trophy">✦</div><h2 id="wb-zuma-dialog-title"></h2><p></p><div class="zc-dialog-buttons"></div></div></div>`;
  doc.body.append(portal);
  const q=s=>portal.querySelector(s),canvas=q('.zc-canvas'),ctx=canvas.getContext('2d'),background=q('.zc-background'),bg=background.getContext('2d'),glCanvas=q('.zc-marble-gl');
  const mode=getPerformanceMode(win),pixelRatio=getCanvasPixelRatio(win),eco=mode==='eco';
  let engine=createZumaEngine(readZumaSave(saved),{layout:win.innerWidth>win.innerHeight?'landscape':'portrait'});
  let destroyed=false,raf=0,lastTime=0,lastSave=0,lastUI='',localPause=false,dialogKind='',activePointer=null,aiming=false,dirty=true,elapsed=0,toastUntil=0,displayScore=-1;
  let art=null,images={},ballCache=[],particles=[],bursts=[],waves=[],floats=[],boardScale=1,glSlowFrames=0,glDisabled=false,audio=null;
  let mouthLoad=0,fireKick=0,swallowPulse=0,lastGulpSound=-1;
  let muted=false;try{muted=win.localStorage.getItem('wanba_zuma_muted_v1')==='1';}catch{}
  const gl=!eco?createMarbleGL(glCanvas,()=>{glDisabled=true;portal.dataset.renderer='canvas2d';dirty=true;}):null;
  portal.dataset.renderer='canvas2d';portal.dataset.performance=mode;
  const nativeImmersive=value=>{try{const result=win.NativeBridge?.setGameImmersive?.(value);result?.catch?.(()=>{});}catch{}};
  nativeImmersive(true);
  function save(force=true){if(!destroyed)env.save(writeZumaSave(engine.serialize()),force);}
  function pause(value){localPause=value;env.setPaused?.(value);if(value){aiming=false;activePointer=null;save();}lastTime=0;dirty=true;}
  function sound(kind){
    if(muted||eco||destroyed)return;if(kind==='gulp'){if(elapsed-lastGulpSound<.09)return;lastGulpSound=elapsed;}
    try {const Audio=win.AudioContext||win.webkitAudioContext;if(!Audio)return;if(!audio)audio=new Audio();if(audio.state==='suspended')audio.resume().catch(()=>{});
      if(kind==='unlock')return;
      const notes=kind==='clear'?[523,659,784]:kind==='coin'?[988,1318]:kind==='match'?[392,587]:kind==='swap'?[420]:[180];
      notes.forEach((frequency,i)=>{const start=audio.currentTime+i*.055,o=audio.createOscillator(),gain=audio.createGain();o.type=kind==='shot'?'triangle':'sine';o.frequency.setValueAtTime(frequency,start);o.frequency.exponentialRampToValueAtTime(frequency*(kind==='shot'?.55:1.08),start+.09);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.065,start+.009);gain.gain.exponentialRampToValueAtTime(.0001,start+.14);o.connect(gain);gain.connect(audio.destination);o.start(start);o.stop(start+.15);});
    }catch{}
  }
  function toast(value){q('.zc-toast').textContent=value;q('.zc-toast').classList.add('show');toastUntil=elapsed+1.7;}
  function dialog(kind){
    dialogKind=kind;const s=engine.state;const titles={pause:text.paused,help:text.helpTitle,levelComplete:text.complete,lifeLost:text.lost,gameOver:text.gameOver};
    q('#wb-zuma-dialog-title').textContent=titles[kind]||text.paused;
    q('.zc-dialog p').textContent=kind==='help'?text.helpBody:kind==='pause'?text.pausedText:`${text.score}  ${s.score.toLocaleString()}\n${text.level}  ${s.levelIndex+1} · ${text.temples[engine.level.titleIndex%6]}`;
    const buttons=q('.zc-dialog-buttons');buttons.replaceChildren();
    const add=(label,action,minor=false)=>{const b=doc.createElement('button');b.className='zc-button'+(minor?' zc-minor':'');b.textContent=label;b.onclick=action;buttons.append(b);skinButton(b);};
    if(kind==='pause'||kind==='help')add(kind==='help'?text.close:text.resume,()=>{q('.zc-mask').hidden=true;dialogKind='';pause(false);nativeImmersive(true);});
    if(kind==='levelComplete')add(text.nextLevel,()=>{engine.advanceLevel();resumeRound();});
    if(kind==='lifeLost')add(text.retry,()=>{engine.retry();resumeRound();});
    if(kind==='gameOver')add(text.finish,finish);
    if(kind==='pause'){add(muted?text.muted:text.sound,()=>{muted=!muted;try{win.localStorage.setItem('wanba_zuma_muted_v1',muted?'1':'0');}catch{}dialog('pause');},true);}
    if(kind!=='gameOver')add(text.exit,exit,true);
    q('.zc-mask').hidden=false;skinUI();dirty=true;
  }
  function resumeRound(){q('.zc-mask').hidden=true;dialogKind='';lastUI='';pause(false);resize();save();}
  function exit(){save();env.exit?.();if(!destroyed)destroy();}
  function finish(){const s=engine.serialize(),details=s.details||{};destroy();env.clear();env.setScore(s.score);env.finish(text.gameOver,`${text.score}: ${s.score}`,{outcome:'score',score:s.score},{score:s.score,maxCombo:details.maxCombo||0,details:{...details,score:s.score,levelsCompleted:s.levelIndex}});}
  function updateUI(){
    const s=engine.state,level=engine.level,progress=clamp(s.levelScore/level.target,0,1),signature=[s.score,s.levelIndex,s.lives,s.current,s.next,s.status,Math.round(progress*100),Math.ceil(s.effects?.slow||0),Math.ceil(s.effects?.reverse||0),Math.ceil(s.effects?.accuracy||0)].join('|');
    if(signature===lastUI)return;lastUI=signature;
    if(s.score!==displayScore){q('#wb-zuma-score').textContent=s.score.toLocaleString();displayScore=s.score;env.setScore(s.score);}
    q('#wb-zuma-lives').textContent='◆'.repeat(clamp(s.lives,0,3))+'◇'.repeat(Math.max(0,3-s.lives))+(s.lives>3?' ×'+s.lives:'');q('#wb-zuma-lives').setAttribute('aria-label',`${text.lives}: ${s.lives}`);
    q('#wb-zuma-level').textContent=`${s.levelIndex+1} · ${text.temples[level.titleIndex%6]}`;
    const meter=q('.zc-progress');meter.setAttribute('aria-valuenow',String(Math.round(progress*100)));meter.title=progress>=1?text.clear:text.target;meter.classList.toggle('ready',progress>=1);meter.querySelector('i').style.width=(progress*100)+'%';
    const preview=q('.zc-preview');preview.style.background=COLORS[s.next];preview.style.backgroundImage=`radial-gradient(circle at 30% 22%,#ffffffa0,transparent 40%),radial-gradient(circle at 40% 30%,transparent 20%,#0008)`;preview.title=text.next;const pc=preview.getContext('2d');pc.clearRect(0,0,48,48);if(ballCache[s.next])pc.drawImage(ballCache[s.next],0,0,48,48);
    q('#wb-zuma-swap').disabled=s.status!=='playing';
    const effects=q('.zc-effects');effects.replaceChildren();for(const key of ['slow','reverse','accuracy'])if(s.effects?.[key]>0){const el=doc.createElement('span');el.className='zc-effect';el.textContent=`${text[key]} ${Math.ceil(s.effects[key])}s`;effects.append(el);}
    if(progress>=1){const el=doc.createElement('span');el.className='zc-effect';el.textContent=text.clear;effects.append(el);}
    if(['levelComplete','lifeLost','gameOver'].includes(s.status)&&dialogKind!==s.status){pause(true);dialog(s.status);save();}
  }
  function sprite(context,name,x,y,w,h){const rect=art?.sprites?.[name];if(!rect||!images.atlas)return false;context.drawImage(images.atlas,...rect,x,y,w,h);return true;}
  function rebuildBalls(){
    const r=engine.level.ballRadius,physical=Math.max(32,Math.ceil(r*2.2*boardScale*pixelRatio));
    ballCache=COLORS.map((color,i)=>{const c=doc.createElement('canvas');c.width=c.height=physical;const b=c.getContext('2d'),rect=art?.sprites?.balls?.[i];if(rect&&images.atlas){b.drawImage(images.atlas,...rect,0,0,physical,physical);}else{const radius=physical*.44,g=b.createRadialGradient(physical*.32,physical*.27,1,physical*.5,physical*.5,radius);g.addColorStop(0,'#fff8');g.addColorStop(.24,color);g.addColorStop(.76,color);g.addColorStop(1,'#1b221f');b.fillStyle=g;b.beginPath();b.arc(physical/2,physical/2,radius,0,Math.PI*2);b.fill();b.fillStyle='#fff8';b.font=`bold ${physical*.4}px serif`;b.textAlign='center';b.textBaseline='middle';b.fillText(SYMBOLS[i],physical/2,physical*.51);}return c;});
  }
  function drawBall(x,y,color,r,alpha=1){ctx.globalAlpha=alpha;ctx.drawImage(ballCache[color]||ballCache[0],x-r*1.08,y-r*1.08,r*2.16,r*2.16);ctx.globalAlpha=1;}
  function drawTrack(){
    const {path,ballRadius:r,width:w,height:h}=engine.level;
    bg.clearRect(0,0,w,h);
    if(!images.background){const g=bg.createRadialGradient(w*.5,h*.4,40,w*.5,h*.5,w*.7);g.addColorStop(0,'#667259');g.addColorStop(1,'#1d382b');bg.fillStyle=g;bg.fillRect(0,0,w,h);}
    const pathLine=()=>{bg.beginPath();path.points.forEach((p,i)=>i?bg.lineTo(p.x,p.y):bg.moveTo(p.x,p.y));};
    bg.lineCap='round';bg.lineJoin='round';
    for(const [size,color] of [[r*2.55,'#10251eaa'],[r*2.32,'#a79458'],[r*2.12,'#494937'],[r*1.92,'#1b3029'],[r*1.6,'#263c32']]){pathLine();bg.lineWidth=size;bg.strokeStyle=color;bg.stroke();}
    bg.save();bg.setLineDash([2,13]);pathLine();bg.lineWidth=1.5;bg.strokeStyle='#bcc88c32';bg.stroke();bg.restore();
    const start=zumaPointAt(path,0),end=zumaPointAt(path,path.length);
    bg.fillStyle='#071411';bg.beginPath();bg.ellipse(start.x,start.y,r*1.2,r*1.05,0,0,Math.PI*2);bg.fill();
    const f=engine.level.frog;bg.beginPath();bg.arc(f.x,f.y,r*2.7,0,Math.PI*2);bg.fillStyle='#233d31';bg.fill();bg.strokeStyle='#a89253';bg.lineWidth=3;bg.stroke();bg.beginPath();bg.arc(f.x,f.y,r*2.35,0,Math.PI*2);bg.strokeStyle='#789670';bg.lineWidth=1;bg.stroke();
  }
  function drawSkull(){
    const level=engine.level,r=level.ballRadius,end=zumaPointAt(level.path,level.path.length),draining=engine.state.status==='draining';
    const jaw=(draining?(.45+.55*Math.abs(Math.sin(engine.state.drainTime*17))):swallowPulse/.16)*r*.38;
    const rect=art?.sprites?.skull;if(!rect||!images.atlas){ctx.fillStyle='#050c09';ctx.strokeStyle='#b39b55';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(end.x,end.y,r*1.3,r*1.6+jaw,0,0,Math.PI*2);ctx.fill();ctx.stroke();return;}
    const w=r*4.2,h=r*5.15,x=end.x-w*.48,y=end.y-h*.74;
    ctx.save();ctx.fillStyle='#050b09';ctx.beginPath();ctx.ellipse(end.x,end.y,r*.95,r*1.45+jaw,0,0,Math.PI*2);ctx.fill();
    if(draining){ctx.save();ctx.translate(end.x,end.y);ctx.rotate(engine.state.drainTime*8);ctx.strokeStyle='#ed88436b';ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,r*(.25+i*.27),i*1.8,i*1.8+2.2);ctx.stroke();}ctx.restore();}
    const [sx,sy,sw,sh]=rect,split=images.motion&&art.motion?.skullJaw?.length ? .63 : .73;
    ctx.drawImage(images.atlas,sx,sy,sw,sh*split,x,y,w,h*split);
    if(images.motion&&art.motion?.skullJaw)ctx.drawImage(images.motion,...art.motion.skullJaw,end.x-r*1.55,end.y-r*.5+jaw,r*3.1,r*2.32);else ctx.drawImage(images.atlas,sx,sy+sh*split,sw,sh*(1-split),x,y+h*split+jaw,w,h*(1-split));ctx.restore();
  }
  function drawFrog(){
    const s=engine.state,{frog:f,ballRadius:r}=engine.level,angle=Number.isFinite(s.aim)?s.aim:-Math.PI/2;
    const loading=mouthLoad>0,progress=1-mouthLoad/.42,recoil=fireKick/.16;
    ctx.save();ctx.translate(f.x-Math.cos(angle)*recoil*r*.16,f.y-Math.sin(angle)*recoil*r*.16);ctx.rotate(angle+Math.PI/2);
    let mouthY=-r*1.63,mouthX=0,rx=r*.57,ry=r*.61;
    const motion=art?.motion,frames=motion?.frogFrames;
    if(images.motion&&frames?.length){
      const frameIndex=loading?(progress<.20?0:progress<.63?1:2):2;const frame=frames[frameIndex]||frames[0];ctx.drawImage(images.motion,...frame,-r*2.15,-r*2.45,r*4.3,r*4.3);
      const anchor=frameIndex===2?[.5,.30]:frameIndex===0?[.5,.23]:(motion.frogMouthAnchor||[.5,.235]);mouthX=(anchor[0]-.5)*r*4.3;mouthY=(-2.45+anchor[1]*4.3)*r;rx=r*.70;ry=r*(frameIndex===1?.58:frameIndex===0?.16:.27);
    }else if(!sprite(ctx,'frog',-r*2.15,-r*2.45,r*4.3,r*4.3)){ctx.fillStyle='#72a65b';ctx.beginPath();ctx.ellipse(0,0,r*1.5,r*1.8,0,0,Math.PI*2);ctx.fill();}
    // The loaded ball is clipped inside the mouth cavity, beneath the lip edge.
    ctx.save();ctx.beginPath();ctx.ellipse(mouthX,mouthY,rx,ry*(loading?1.1:1),0,0,Math.PI*2);ctx.clip();ctx.fillStyle='#07130db0';ctx.fillRect(mouthX-r,mouthY-r,r*2,r*2);
    const gulp=loading?clamp(progress*1.65,0,1):1;
    drawBall(mouthX,mouthY+(1-gulp)*r*.95,s.current,r*.56*(.45+gulp*.55));ctx.restore();
    // The preview sinks briefly as it is loaded, then the next reserve appears.
    drawBall(0,r*.62,s.next,r*.43,loading?clamp(progress*2,0,1):1);ctx.restore();
    if(aiming||s.effects?.accuracy>0){
      let distance=s.effects?.accuracy>0?Math.max(engine.level.width,engine.level.height):r*4.5;
      if(s.effects?.accuracy>0)for(const ball of s.chain){if(ball.s<0)continue;const p=zumaPointAt(engine.level.path,ball.s),dx=p.x-f.x,dy=p.y-f.y,t=dx*Math.cos(angle)+dy*Math.sin(angle),cross=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle));if(t>r*2&&cross<r*1.9)distance=Math.min(distance,t-Math.sqrt(Math.max(0,(r*1.9)**2-cross**2)));}
      ctx.save();ctx.strokeStyle=s.effects?.accuracy>0?'#84eaffd0':'#fff1b990';ctx.lineWidth=s.effects?.accuracy>0?3:2;ctx.setLineDash([5,9]);ctx.beginPath();ctx.moveTo(f.x+Math.cos(angle)*r*2,f.y+Math.sin(angle)*r*2);ctx.lineTo(f.x+Math.cos(angle)*distance,f.y+Math.sin(angle)*distance);ctx.stroke();ctx.restore();
    }
  }
  function drawPower(ball,x,y,r){if(!ball.powerup)return;if(ball.powerupRemaining<3&&Math.floor(elapsed*5)%2===0)return;const icons={bomb:'✹',slow:'◷',reverse:'↶',accuracy:'⌖'};ctx.save();ctx.fillStyle='#12221ee8';ctx.strokeStyle='#fff4bd';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x+r*.6,y-r*.62,r*.43,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ffefb8';ctx.font=`bold ${r*.66}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icons[ball.powerup]||'✦',x+r*.6,y-r*.61);ctx.restore();}
  function drawCoin(){const coin=engine.state.coin;if(!coin)return;const {x,y}=coin,r=engine.level.ballRadius*.82;ctx.save();ctx.translate(x,y);ctx.scale(.88+.12*Math.cos(elapsed*3),1);const g=ctx.createRadialGradient(-r*.3,-r*.3,1,0,0,r);g.addColorStop(0,'#fff6b0');g.addColorStop(.5,'#e9c34b');g.addColorStop(1,'#916624');ctx.fillStyle=g;ctx.strokeStyle='#ffe89a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#795c24';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r*.72,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#976923';ctx.font=`bold ${r*1.3}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',0,1);ctx.restore();}
  function draw(){
    const s=engine.state,level=engine.level,r=level.ballRadius;ctx.clearRect(0,0,level.width,level.height);
    const balls=s.chain.filter(b=>b.s>=0).map(ball=>({...zumaPointAt(level.path,ball.s),r:r*(s.status==='draining'?clamp((level.path.length-ball.s)/(r*1.5),.08,1):1),spin:ball.s/(r*2.6),rect:art?.sprites?.balls?.[ball.color],ball}));
    if(s.shot)balls.push({x:s.shot.x,y:s.shot.y,r:r*.91,spin:elapsed*8,rect:art?.sprites?.balls?.[s.shot.color],ball:s.shot});
    const gpuFX=[];
    for(const p of particles)gpuFX.push({x:p.x,y:p.y,r:eco?5:11,alpha:clamp(p.life/.55,0,1),color:RGB[p.colorIndex]||[1,.8,.35],stretch:1.5,angle:Math.atan2(p.vy,p.vx)});
    for(const wave of waves){const phase=1-wave.life/wave.duration;gpuFX.push({x:wave.x,y:wave.y,r:wave.radius*(.2+phase),alpha:(1-phase)*.85,color:wave.color,kind:1,phase});}
    if(s.shot){const length=Math.hypot(s.shot.vx,s.shot.vy)||1;for(let i=1;i<=6;i++)gpuFX.push({x:s.shot.x-s.shot.vx/length*i*r*.52,y:s.shot.y-s.shot.vy/length*i*r*.52,r:r*(.65-i*.065),alpha:.75-i*.10,color:RGB[s.shot.color],stretch:1.5,angle:Math.atan2(s.shot.vy,s.shot.vx)});}
    if(mouthLoad>0){const f=level.frog;gpuFX.push({x:f.x,y:f.y,r:r*2.2,alpha:mouthLoad/.42*.42,color:RGB[s.current],kind:2,phase:elapsed});}
    if(s.effects.reverse>0){const f=level.frog;gpuFX.push({x:f.x,y:f.y,r:r*(4+(elapsed*2%1)*4),alpha:.22,color:[.3,.85,1],kind:1});}
    const useGL=!glDisabled&&gl?.ready&&balls.every(b=>b.rect);
    const rendered=useGL&&gl.draw(balls,level.width,level.height,elapsed,images.atlas.width,images.atlas.height,eco?[]:gpuFX);
    if(rendered){portal.dataset.renderer='webgl';glCanvas.hidden=false;}else{glCanvas.hidden=true;for(const b of balls)drawBall(b.x,b.y,b.ball.color,b.r);}
    for(const b of balls)drawPower(b.ball,b.x,b.y,r);
    for(const b of bursts){const phase=1-b.life/.22;drawBall(b.x,b.y,b.color,r*(1+phase*.25),1-phase);if(!eco){ctx.globalAlpha=(1-phase)*.8;ctx.strokeStyle='#fff0b3';ctx.lineWidth=3;ctx.beginPath();ctx.arc(b.x,b.y,r*(1+phase),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}}
    drawCoin();drawSkull();drawFrog();
    const head=s.chain[s.chain.length-1];if(head&&head.s>level.path.length-200){const end=zumaPointAt(level.path,level.path.length);ctx.strokeStyle=`rgba(255,91,43,${.5+Math.sin(elapsed*8)*.25})`;ctx.lineWidth=5;ctx.beginPath();ctx.arc(end.x,end.y,r*2.4,0,Math.PI*2);ctx.stroke();}
    if(!rendered)for(const p of particles){ctx.globalAlpha=clamp(p.life/.55,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,p.size,p.size);}ctx.globalAlpha=1;
    ctx.save();ctx.textAlign='center';ctx.font=`bold ${r*.9}px system-ui`;ctx.shadowColor='#102119';ctx.shadowBlur=4;for(const f of floats){ctx.globalAlpha=clamp(f.life,0,1);ctx.fillStyle='#ffed9c';ctx.fillText(f.text,f.x,f.y);}ctx.restore();
    dirty=false;
  }
  function processEvents(){
    for(const event of engine.drainEvents()){
      if(event.type==='shot'){sound('shot');mouthLoad=.42;fireKick=.16;}
      if(event.type==='match'){
        sound('match');const points=event.balls||event.removed||[];
        for(const p of points){bursts.push({x:p.x,y:p.y,color:p.color,life:.22});const pos=Number.isFinite(p.x)?p:zumaPointAt(engine.level.path,p.s||0);for(let i=0;i<(eco?2:6);i++)particles.push({x:pos.x,y:pos.y,vx:(Math.random()-.5)*200,vy:(Math.random()-.5)*200,life:.55,color:COLORS[p.color]||'#ffcf6d',colorIndex:p.color,size:eco?3:5});}
        const center=points[Math.floor(points.length/2)];if(center)waves.push({x:center.x,y:center.y,life:.48,duration:.48,radius:engine.level.ballRadius*(2.8+(event.depth||1)),color:RGB[center.color]||[1,.8,.35]});if(center)floats.push({x:center.x,y:center.y,life:1,text:'+'+(event.gained||event.score||30)});
        if((event.depth||event.combo||0)>1)toast(`${text.combo} ×${event.depth||event.combo}`);
      }
      if(event.type==='powerup'){toast(text[event.power||event.kind]||text.bomb);waves.push({x:event.x,y:event.y,life:.75,duration:.75,radius:engine.level.ballRadius*7,color:event.kind==='bomb'?[1,.45,.12]:[.3,.8,1]});}
      if(event.type==='coin'){sound('coin');toast(`${text.coin} +${event.bonus||event.gained||event.score||100}`);}
      if(event.type==='gap')toast(text.gap);
      if(event.type==='combo')toast(`${text.chain} ×${event.combo||event.count||5}`);
      if(event.type==='zuma'||event.type==='targetReached'){sound('clear');toast(text.ready);}
      if(event.type==='levelComplete')sound('clear');if(event.type==='swallow'){swallowPulse=.16;sound('gulp');}
    }
    particles=particles.slice(-150);bursts=bursts.slice(-70);waves=waves.slice(-12);floats=floats.slice(-10);
  }
  function resize(){
    if(destroyed)return;
    const play=q('.zc-playfield'),rect=play.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    const layout=win.innerWidth>win.innerHeight?'landscape':'portrait';engine.setLayout(layout);
    const {width:w,height:h}=engine.level;boardScale=Math.min(rect.width/w,rect.height/h);
    const board=q('.zc-board');board.style.width=(w*boardScale)+'px';board.style.height=(h*boardScale)+'px';
    for(const c of [canvas,background,glCanvas]){c.width=Math.max(1,Math.round(w*boardScale*pixelRatio));c.height=Math.max(1,Math.round(h*boardScale*pixelRatio));}
    ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);bg.setTransform(background.width/w,0,0,background.height/h,0,0);
    portal.dataset.layout=layout;rebuildBalls();drawTrack();draw();skinUI();lastUI='';updateUI();save();
  }
  function skin(context,image,rect,w,h){
    const [sx,sy,sw,sh]=rect,edge=Math.min(sw/4,sh/3),dest=Math.min(edge,w/4,h/3),xs=[0,dest,w-dest,w],ys=[0,dest,h-dest,h],us=[sx,sx+edge,sx+sw-edge,sx+sw],vs=[sy,sy+edge,sy+sh-edge,sy+sh];
    for(let row=0;row<3;row++)for(let col=0;col<3;col++)context.drawImage(image,us[col],vs[row],us[col+1]-us[col],vs[row+1]-vs[row],xs[col],ys[row],xs[col+1]-xs[col],ys[row+1]-ys[row]);
  }
  function skinButton(el,key='button'){
    if(!images.ui||!art?.ui?.[key])return;let c=el.querySelector(':scope > .zc-skin');if(!c){c=doc.createElement('canvas');c.className='zc-skin';c.setAttribute('aria-hidden','true');el.prepend(c);}
    const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return;c.width=Math.ceil(rect.width*pixelRatio);c.height=Math.ceil(rect.height*pixelRatio);skin(c.getContext('2d'),images.ui,art.ui[key],c.width,c.height);
  }
  function skinUI(){q('.zc-head').style.isolation='isolate';skinButton(q('.zc-head'),'panel');skinButton(q('.zc-progress'),'meter');skinButton(q('.zc-dialog'),'plaque');for(const el of portal.querySelectorAll('.zc-icon,.zc-button'))skinButton(el);}
  async function loadArt(){
    try{
      const manifest=await(await win.fetch(new URL('manifest.json',ART))).json();if(!manifest.classic)return;art=manifest.classic;
      await Promise.allSettled(Object.entries({background:art.background,atlas:art.atlas,ui:art.uiAtlas,motion:art.motion?.atlas}).filter(([,file])=>file).map(async([key,file])=>{if(!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|webp|jpg)$/.test(file))throw Error('Invalid game artwork');const img=new win.Image();img.src=new URL(file,ART).href;await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});if(!destroyed)images[key]=img;}));
      if(destroyed)return;gl?.setAtlas(images.atlas);portal.style.backgroundImage=q('.zc-playfield').style.backgroundImage=`linear-gradient(#15271f20,#15271f20),url("${new URL(art.background,ART).href}")`;resize();
    }catch(error){console.warn('[Zuma] Artwork unavailable; using offline fallback',error.message);}
  }
  function position(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*engine.level.width/rect.width,y:(event.clientY-rect.top)*engine.level.height/rect.height};}
  function aim(event){const p=position(event),f=engine.level.frog;engine.state.aim=Math.atan2(p.y-f.y,p.x-f.x);dirty=true;return p;}
  canvas.onpointerdown=event=>{if(event.button===2)return;if(env.isPaused()||localPause||engine.state.status!=='playing'||activePointer!==null)return;event.preventDefault();sound('unlock');activePointer=event.pointerId;aiming=true;const p=aim(event);activePointer={id:event.pointerId,x:event.clientX,y:event.clientY,frog:Math.hypot(p.x-engine.level.frog.x,p.y-engine.level.frog.y)<engine.level.ballRadius*1.7};try{canvas.setPointerCapture(event.pointerId);}catch{}};
  canvas.onpointermove=event=>{if(activePointer?.id===event.pointerId){event.preventDefault();aim(event);}else if(event.pointerType==='mouse'&&!env.isPaused()){aim(event);}};
  canvas.onpointerup=event=>{if(activePointer?.id!==event.pointerId)return;event.preventDefault();const pointer=activePointer;activePointer=null;aiming=false;aim(event);if(!env.isPaused()&&!localPause){if(pointer.frog&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<12){engine.swap();sound('swap');}else engine.fire(engine.state.aim);}try{canvas.releasePointerCapture(event.pointerId);}catch{}dirty=true;updateUI();save();};
  canvas.onpointercancel=()=>{activePointer=null;aiming=false;dirty=true;};canvas.oncontextmenu=event=>{event.preventDefault();if(!env.isPaused()){engine.swap();sound('swap');updateUI();save();}};
  q('#wb-zuma-swap').onclick=()=>{if(!env.isPaused()&&!localPause){engine.swap();sound('swap');updateUI();dirty=true;save();}};
  q('#wb-zuma-pause').onclick=()=>{pause(true);dialog('pause');};q('#wb-zuma-help').onclick=()=>{pause(true);dialog('help');};
  const keydown=event=>{if(destroyed||!env.isActive())return;if(event.code==='Escape'){event.preventDefault();if(!['playing','draining'].includes(engine.state.status)){dialog(engine.state.status);return;}if(dialogKind==='pause'||dialogKind==='help'){q('.zc-dialog-buttons button')?.click();}else{pause(true);dialog('pause');}}else if(!env.isPaused()&&!localPause&&['Space','KeyX'].includes(event.code)){event.preventDefault();if(event.code==='KeyX'){engine.swap();sound('swap');}else engine.fire(engine.state.aim);dirty=true;updateUI();save();}};
  const visibility=()=>{lastTime=0;if(doc.hidden){pause(true);save();}else if(['playing','draining'].includes(engine.state.status)){dialog('pause');dirty=true;}};
  doc.addEventListener('keydown',keydown);doc.addEventListener('visibilitychange',visibility);win.addEventListener('resize',resize);
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(resize):null;observer?.observe(q('.zc-playfield'));
  function frame(now){
    if(destroyed)return;if(!env.isActive()){destroy();return;}
    const dt=lastTime?Math.min(5,Math.max(0,(now-lastTime)/1000)):0;lastTime=now;
    const paused=env.isPaused()||localPause||doc.hidden;
    if(!paused){elapsed+=dt;mouthLoad=Math.max(0,mouthLoad-dt);fireKick=Math.max(0,fireKick-dt);swallowPulse=Math.max(0,swallowPulse-dt);for(const wave of waves)wave.life-=dt;waves=waves.filter(w=>w.life>0);for(const b of bursts)b.life-=dt;bursts=bursts.filter(b=>b.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vy+=100*dt;}particles=particles.filter(p=>p.life>0);for(const f of floats){f.y-=25*dt;f.life-=dt;}floats=floats.filter(f=>f.life>0);engine.update(dt);processEvents();dirty=true;}
    else if(!dialogKind&&['playing','draining'].includes(engine.state.status)&&!doc.hidden)dialog('pause');
    updateUI();if(toastUntil&&elapsed>toastUntil){q('.zc-toast').classList.remove('show');toastUntil=0;}
    if(dirty&&!doc.hidden){const start=win.performance.now();draw();if(gl?.ready&&!glDisabled){const duration=win.performance.now()-start;if(duration>12)glSlowFrames++;else glSlowFrames=Math.max(0,glSlowFrames-1);if(glSlowFrames>=12){glDisabled=true;glCanvas.hidden=true;portal.dataset.renderer='canvas2d';}}}
    if(!paused&&now-lastSave>1000){lastSave=now;save(false);}raf=win.requestAnimationFrame(frame);
  }
  function destroy(){if(destroyed)return;destroyed=true;win.cancelAnimationFrame(raf);observer?.disconnect();win.removeEventListener('resize',resize);doc.removeEventListener('keydown',keydown);doc.removeEventListener('visibilitychange',visibility);gl?.destroy();audio?.close?.().catch(()=>{});nativeImmersive(false);portal.remove();}
  resize();updateUI();save();loadArt();raf=win.requestAnimationFrame(frame);
  return {save:()=>save(),destroy,getState:()=>({...engine.serialize(),view:{layout:engine.level.layout,width:engine.level.width,height:engine.level.height,ballRadius:engine.level.ballRadius,frog:{...engine.level.frog},renderer:portal.dataset.renderer,paused:env.isPaused()||localPause,assetsReady:!!images.atlas,motionReady:!!images.motion,effects:{sparks:particles.length,waves:waves.length,loading:mouthLoad,swallowing:swallowPulse}}})};
}
