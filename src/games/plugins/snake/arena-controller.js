import {translateSource} from '../../../../standalone/i18n.js';
import {createArena} from './arena-engine.js';
import {createArenaRenderer} from './arena-renderer.js';
import {arenaProgress} from './arena-save.js';
export function createArenaGame(env,saved,mode='endless'){
  const host=env.getHostWindow(),doc=env.getHostDocument(),box=env.qs('#wb-gamebox');
  const arena=createArena({mode,state:saved?.arena});let joystick=saved?.joystick==='fixed'?'fixed':'floating';
  box.innerHTML=`<style>.snake-arena *{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}</style><section class="snake-arena" style="position:relative;width:100%;height:100%;min-height:300px;overflow:hidden;border-radius:18px;background:#f1f6f7;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;color:#203b45;font-family:inherit">
    <canvas class="snake-arena-canvas" aria-label="离线 AI 贪吃蛇竞技场" style="display:block;touch-action:none"></canvas>
    <div style="position:absolute;top:12px;left:12px;pointer-events:none;display:grid;gap:5px"><strong style="font-size:12px;letter-spacing:.03em;color:#347268">离线 AI</strong><span style="font-size:13px"><span>长度</span> <b data-arena-length style="font-size:23px">170</b></span><span data-arena-clock style="font-size:13px"></span></div>
    <div style="position:absolute;right:12px;top:12px;pointer-events:none;border-radius:12px;padding:9px 11px;background:#ffffffe0;font-size:11px;min-width:76px"><strong>长度榜</strong><div data-arena-ranking style="display:grid;gap:3px;margin-top:6px"></div></div>
    <div data-arena-stickzone style="position:absolute;left:0;bottom:0;width:65%;height:76%;touch-action:none" aria-label="方向摇杆"></div>
    <div data-arena-stick style="position:absolute;pointer-events:none;left:28px;bottom:26px;width:92px;height:92px;border:2px solid #779ca455;border-radius:50%;background:#ffffff77;box-shadow:inset 0 1px 8px #71909816"><span data-arena-knob style="position:absolute;left:27px;top:27px;width:38px;height:38px;border-radius:50%;background:#4b989b99;border:2px solid #ffffffaa;box-sizing:border-box"></span></div>
    <button data-arena-boost type="button" style="position:absolute;right:22px;bottom:26px;width:82px;height:82px;border:3px solid #fff;border-radius:50%;background:#e0a34b;color:#fff;font-size:13px;font-weight:700;box-shadow:0 4px 16px #ac782133;touch-action:none">按住加速</button>
    <button data-arena-control type="button" style="position:absolute;left:12px;bottom:132px;border:0;border-radius:12px;padding:7px 10px;background:#ffffffc9;color:#4c7079;font-size:11px"></button>
    <div style="position:absolute;bottom:7px;left:0;right:0;text-align:center;font-size:10px;color:#657f85;pointer-events:none">左手转向 · 右手加速 · 碰到其他蛇身即淘汰</div>
  </section>`;
  const root=box.querySelector('.snake-arena'),canvas=root.querySelector('canvas'),renderer=createArenaRenderer(canvas,host,doc);
  const lengthLabel=root.querySelector('[data-arena-length]'),clock=root.querySelector('[data-arena-clock]'),ranking=root.querySelector('[data-arena-ranking]');
  const zone=root.querySelector('[data-arena-stickzone]'),stick=root.querySelector('[data-arena-stick]'),knob=root.querySelector('[data-arena-knob]'),boost=root.querySelector('[data-arena-boost]'),control=root.querySelector('[data-arena-control]');
  let destroyed=false,finished=false,frame=0,wake=0,last=null,lastSave=-1,lastHud=-1,wasPaused=false,stickPointer=null,boostPointer=null,stickAngle=null,center={x:74,y:200};
  const keys=new Set(),listeners=[];
  const listen=(node,type,handler,options)=>{node.addEventListener(type,handler,options);listeners.push(()=>node.removeEventListener(type,handler,options));};
  const active=()=>!destroyed&&!finished&&!doc.hidden&&!env.gamePaused;
  function input(){let x=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),y=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);arena.setInput({angle:stickAngle??(x||y?Math.atan2(y,x):null),boost:boostPointer!==null||keys.has(' ')});boost.style.background=boostPointer!==null||keys.has(' ')?'#c9842d':'#e0a34b';}
  function clear(){keys.clear();stickPointer=boostPointer=null;stickAngle=null;arena.clearInput();knob.style.transform='';boost.style.background='#e0a34b';last=null;}
  function save(){if(destroyed||finished||arena.state.ended)return;if(env.gamePaused||doc.hidden)clear();env.saveProgress('snake',arenaProgress(arena.snapshot(),joystick));}
  function hud(){const player=arena.state.snakes[0];lengthLabel.textContent=String(Math.round(player.length));env.setScore('snake',Math.round(player.length));clock.textContent=arena.state.mode==='timed'?Math.floor(Math.ceil(arena.remaining)/60).toString().padStart(2,'0')+':'+(Math.ceil(arena.remaining)%60).toString().padStart(2,'0'):Math.floor(arena.elapsed/60).toString().padStart(2,'0')+':'+Math.floor(arena.elapsed%60).toString().padStart(2,'0');ranking.replaceChildren();arena.ranking().slice(0,4).forEach((item,i)=>{const line=doc.createElement('div');line.style.cssText='display:flex;justify-content:space-between;gap:12px';const who=doc.createElement('span'),value=doc.createElement('b');who.textContent=item.id==='player'?'你':'AI '+item.id.slice(2);value.textContent=String(item.length);const position=doc.createElement('span');position.textContent=(i+1)+'.';line.append(position,who,value);ranking.append(line);});}
  function finish(){if(finished)return;finished=true;clear();env.clearProgress?.('snake');const p=arena.state.snakes[0];env.showGameOver('snake',arena.state.ended==='time'?'限时结束':'竞技结束',translateSource('最长')+' '+Math.round(p.best)+' · '+translateSource('淘汰')+' '+p.kills+' · '+translateSource('存活')+' '+Math.floor(arena.elapsed)+' '+translateSource('秒'),null,{score:Math.round(p.best),details:{mode:arena.state.mode,fruits:p.eaten,eliminations:p.kills,maxLength:Math.round(p.best),arenaSeconds:Math.floor(arena.elapsed),deathReason:arena.state.ended}});}
  function schedule(){if(destroyed||finished||doc.hidden||frame||wake)return;frame=host.requestAnimationFrame(tick);}
  function tick(time){frame=0;if(destroyed||finished)return;if(doc.hidden){clear();return;}if(env.gamePaused){if(!wasPaused){clear();save();wasPaused=true;}wake=host.setTimeout(()=>{wake=0;schedule();},100);return;}if(wasPaused){clear();wasPaused=false;}if(last!==null)arena.advance(Math.max(0,Math.min(.25,(time-last)/1000)));last=time;renderer.draw(arena.state);if(arena.state.ticks-lastHud>=15||lastHud<0){hud();lastHud=arena.state.ticks;}if(arena.state.ticks-lastSave>=60||lastSave<0){save();lastSave=arena.state.ticks;}if(arena.state.ended){hud();finish();return;}schedule();}
  function resize(){if(destroyed)return;const rect=root.getBoundingClientRect();renderer.resize(rect.width,rect.height);renderer.draw(arena.state);}
  function syncControl(){control.textContent=joystick==='floating'?'摇杆：浮动':'摇杆：固定';stick.style.left='28px';stick.style.bottom='26px';stick.style.top='auto';}
  listen(control,'click',()=>{if(!active())return;clear();joystick=joystick==='floating'?'fixed':'floating';syncControl();save();});
  function point(event){const rect=root.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function moveStick(event){if(event.pointerId!==stickPointer||!active())return;const p=point(event),dx=p.x-center.x,dy=p.y-center.y,d=Math.hypot(dx,dy),scale=d>36?36/d:1;knob.style.transform='translate('+(dx*scale)+'px,'+(dy*scale)+'px)';stickAngle=d>6?Math.atan2(dy,dx):null;input();}
  listen(zone,'pointerdown',event=>{if(!active()||stickPointer!==null)return;event.preventDefault();stickPointer=event.pointerId;const rect=root.getBoundingClientRect();center=joystick==='floating'?point(event):{x:74,y:rect.height-72};stick.style.left=(center.x-46)+'px';stick.style.top=(center.y-46)+'px';stick.style.bottom='auto';try{zone.setPointerCapture(event.pointerId);}catch{}moveStick(event);});
  listen(zone,'pointermove',moveStick);
  const releaseStick=event=>{if(event.pointerId!==stickPointer)return;stickPointer=null;stickAngle=null;knob.style.transform='';syncControl();input();};for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(zone,name,releaseStick);
  listen(boost,'pointerdown',event=>{if(!active()||boostPointer!==null)return;event.preventDefault();boostPointer=event.pointerId;try{boost.setPointerCapture(event.pointerId);}catch{}input();});
  const releaseBoost=event=>{if(event.pointerId!==boostPointer)return;boostPointer=null;input();};for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(boost,name,releaseBoost);
  listen(doc,'keydown',event=>{if(!active()||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '].includes(event.key))return;event.preventDefault();keys.add(event.key);input();});
  listen(doc,'keyup',event=>{if(keys.delete(event.key)){event.preventDefault();input();}});
  listen(host,'blur',clear);listen(doc,'visibilitychange',()=>{clear();if(frame)host.cancelAnimationFrame(frame);if(wake)host.clearTimeout(wake);frame=wake=0;if(doc.hidden)save();else schedule();});
  listen(host,'resize',resize);listen(host,'wanba-performance-change',resize);
  const observer=host.ResizeObserver?new host.ResizeObserver(resize):null;observer?.observe(root);
  listen(root,'contextmenu',event=>event.preventDefault());
  syncControl();resize();hud();save();schedule();
  return {save,getState:()=>({mode:arena.state.mode,elapsed:arena.elapsed,remaining:arena.remaining,length:Math.round(arena.state.snakes[0].length),boost:arena.state.snakes[0].boost,alive:arena.state.snakes[0].alive,ended:arena.state.ended,render:renderer.getStats()}),destroy(){if(destroyed)return;destroyed=true;if(frame)host.cancelAnimationFrame(frame);if(wake)host.clearTimeout(wake);frame=wake=0;clear();listeners.forEach(remove=>remove());observer?.disconnect();renderer.destroy();}};
}
