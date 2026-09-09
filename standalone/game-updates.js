import { readContentState, parseNative } from './content-state.js';

const busyStates=new Set(['checking','downloading','activating']);
const mb=n=>n<1024*1024?Math.ceil(n/1024)+' KB':(n/1024/1024).toFixed(1)+' MB';
export function changedPackages(state) {
  return (state?.candidate?.packages||[]).filter(pack=>state.active?.packages?.find(old=>old.id===pack.id)?.sha256!==pack.sha256);
}
export function gameUpdatesAvailable(state,host=globalThis) {
  return state?.gameUpdatesEnabled!==false&&typeof host.NativeBridge?.checkGameUpdates==='function';
}

export function installGameUpdates({host=window,document:doc=document,runtime,initialState=null}) {
  let state=initialState,panel=null,busy=false,pull=null,refreshGeneration=0;
  // Native build capability is authoritative; do not mount a disabled control
  // or register a pull gesture that would interfere with ordinary scrolling.
  if(state?.gameUpdatesEnabled===false)return Object.freeze({onEvent:()=>{},refresh:async()=>state,getState:()=>state});
  const el=(tag,text,className)=>{const node=doc.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
  const isHome=()=>!runtime.inspect().game&&!!doc.querySelector('#wb-body > .wb-cardgrid');
  const refresh=async()=>{const generation=++refreshGeneration;try{const next=await readContentState(host);if(generation===refreshGeneration)state=next;}catch(error){runtime.notify(error.message);}render();};
  const invoke=async(method,...args)=>{if(busy||!gameUpdatesAvailable(state,host))return;busy=true;render();try{const response=parseNative(await host.NativeBridge[method](...args));if(response?.error)throw Error(response.error);await refresh();}catch(error){runtime.notify(error.message||'更新暂不可用，请稍后重试');}finally{busy=false;render();}};
  function button(label,handler){const node=el('button',label,'wb-btn');node.type='button';node.onclick=handler;return node;}
  function render() {
    if(state?.gameUpdatesEnabled===false){releasePull(true);panel?.remove();panel=null;return;}
    // Keep the touched node alive while the browser tracks this gesture. A
    // focus/native status refresh must not detach the touchstart target.
    if(!panel?.isConnected||pull)return;
    const canUpdate=gameUpdatesAvailable(state,host),job=state?.job,working=busy||busyStates.has(job?.state);
    panel.replaceChildren();
    const row=el('div',null,'wanba-update-row'),title=el('div');
    title.append(el('strong','游戏内容'),el('small',state?.active?'资源版本 '+state.active.snapshotVersion:'离线游戏已就绪'));
    const check=button('检查更新',()=>invoke('checkGameUpdates'));check.id='wanba-check-games';check.disabled=working||!canUpdate;row.append(title,check);panel.append(row);
    const status=el('p',job?.message|| (canUpdate?'下拉可刷新游戏列表，存档保留在本机。':'安装新版玩吧 App 后，可在此更新游戏内容。'),'wanba-update-status');status.id='wanba-update-status';status.setAttribute('role','status');panel.append(status);
    if(job?.state==='downloading'){const progress=el('progress');progress.max=job.totalBytes||1;progress.value=job.downloadedBytes||0;progress.setAttribute('aria-label','下载进度');panel.append(progress,el('small',mb(job.downloadedBytes||0)+' / '+mb(job.totalBytes||0)));}
    if(state?.candidate){
      const changed=changedPackages(state),details=el('details'),summary=el('summary','可用版本 '+state.candidate.snapshotVersion+' · '+changed.length+' 个资源包 · '+mb(changed.reduce((n,p)=>n+p.size,0)));details.append(summary);
      const list=el('ul');for(const pack of changed){const game=runtime.inspect().games.find(g=>g.id===pack.id.split('.')[1]);list.append(el('li',(game?.name||pack.id)+' · '+pack.version));}details.append(list);panel.append(details);
      const ready=state.candidateReady===true||job?.state==='ready',install=button(ready?'安装并刷新':'下载游戏更新',async()=>{if(!isHome()){runtime.notify('请先返回游戏列表再安装更新');return;}if(ready){const checkpoint=runtime.checkpoint();if(!checkpoint.ok){runtime.notify(checkpoint.message||'存档未完成，请稍后重试');return;}await invoke('activateGameUpdate',state.candidate.snapshotId,JSON.stringify(checkpoint));}else await invoke('downloadGameUpdate',state.candidate.snapshotId);});install.id='wanba-install-games';install.classList.add('primary');install.disabled=working;panel.append(install);
    }
    if(state?.previousSnapshotId&&state.previousSnapshotId!==state.activeSnapshotId){
      const rollback=button('回退内容版本',()=>{
        if(!isHome())return;const checkpoint=runtime.checkpoint();if(!checkpoint.ok){runtime.notify(checkpoint.message);return;}
        const box=el('div',null,'wanba-update-confirm'),confirm=button('确认回退',()=>invoke('rollbackGameUpdate')),cancel=button('取消',()=>box.remove());
        confirm.id='wanba-confirm-rollback';cancel.id='wanba-cancel-rollback';
        box.append(el('p','回退到上一版游戏内容，保留当前存档？'),confirm,cancel);panel.append(box);
      });rollback.id='wanba-rollback-games';rollback.disabled=working;panel.append(rollback);
    }
  }
  function mount() {
    if(state?.gameUpdatesEnabled===false)return;
    const body=doc.querySelector('#wb-body'),grid=body?.querySelector(':scope > .wb-cardgrid');
    if(!grid)return;if(!panel?.isConnected){panel=el('section',null,'wanba-updates');panel.id='wanba-game-updates';body.insertBefore(panel,grid);render();}
  }
  const observer=new MutationObserver(mount);observer.observe(doc.body,{childList:true,subtree:true});mount();
  function releasePull(restore=false){
    const previous=pull;pull=null;
    previous?.body.removeEventListener('touchmove',movePull,true);
    if(restore&&previous?.hint&&previous.status?.isConnected)previous.status.textContent=previous.originalStatus;
    return previous;
  }
  function movePull(event){
    if(!pull)return;
    if(event.touches.length!==1){releasePull(true);return;}
    const dx=event.touches[0].clientX-pull.x,dy=event.touches[0].clientY-pull.y;
    if(dy<0||Math.abs(dx)>Math.max(20,dy)){releasePull(true);return;}
    if(dy>12){
      if(event.cancelable)event.preventDefault();pull.dy=dy;
      const hint=dy>70?'松开刷新':'继续下拉以刷新';
      if(pull.hint!==hint){pull.hint=hint;if(pull.status)pull.status.textContent=hint;}
    }
  }
  doc.addEventListener('touchstart',event=>{
    if(!gameUpdatesAvailable(state,host))return;
    releasePull(true);const body=doc.querySelector('#wb-body');
    if(event.touches.length!==1||!isHome()||body.scrollTop>0||!body.contains(event.target)||event.target.closest('button,input,select,summary'))return;
    const status=panel?.querySelector('.wanba-update-status');
    pull={body,status,originalStatus:status?.textContent||'',x:event.touches[0].clientX,y:event.touches[0].clientY,dy:0,hint:''};
    // Only a gesture beginning at the top may need to cancel native scrolling.
    // Normal upward scrolling removes this listener on its first move.
    body.addEventListener('touchmove',movePull,{passive:false,capture:true});
  },{passive:true,capture:true});
  // A button tap must retain its original target until the synthesized click.
  // Rebuilding the panel here used to remove the rollback confirmation and let
  // the tap activate a game card beneath it on Android.
  doc.addEventListener('touchend',()=>{if(!pull)return;const should=releasePull().dy>70;if(should&&gameUpdatesAvailable(state,host))invoke('checkGameUpdates');else render();},{passive:true,capture:true});
  doc.addEventListener('touchcancel',()=>{if(!pull)return;releasePull();render();},{passive:true,capture:true});
  host.addEventListener('focus',refresh);doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)refresh();});
  return Object.freeze({onEvent:()=>refresh(),refresh,getState:()=>state});
}
