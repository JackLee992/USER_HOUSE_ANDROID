import { readContentState, parseNative } from './content-state.js';

const busyStates=new Set(['checking','downloading','activating']);
const mb=n=>n<1024*1024?Math.ceil(n/1024)+' KB':(n/1024/1024).toFixed(1)+' MB';
export function changedPackages(state) {
  return (state?.candidate?.packages||[]).filter(pack=>state.active?.packages?.find(old=>old.id===pack.id)?.sha256!==pack.sha256);
}

export function installGameUpdates({host=window,document:doc=document,runtime,initialState=null}) {
  let state=initialState,panel=null,busy=false,pull=null,refreshGeneration=0;
  const el=(tag,text,className)=>{const node=doc.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
  const isHome=()=>!runtime.inspect().game&&!!doc.querySelector('#wb-body > .wb-cardgrid');
  const refresh=async()=>{const generation=++refreshGeneration;try{const next=await readContentState(host);if(generation===refreshGeneration)state=next;}catch(error){runtime.notify(error.message);}render();};
  const invoke=async(method,...args)=>{if(busy)return;busy=true;render();try{const response=parseNative(await host.NativeBridge[method](...args));if(response?.error)throw Error(response.error);await refresh();}catch(error){runtime.notify(error.message||'更新暂不可用，请稍后重试');}finally{busy=false;render();}};
  function button(label,handler){const node=el('button',label,'wb-btn');node.type='button';node.onclick=handler;return node;}
  function render() {
    // Keep the touched node alive while the browser tracks this gesture. A
    // focus/native status refresh must not detach the touchstart target.
    if(!panel?.isConnected||pull)return;
    const canUpdate=typeof host.NativeBridge?.checkGameUpdates==='function',job=state?.job,working=busy||busyStates.has(job?.state);
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
    if(state?.previousSnapshotId&&state.previousSnapshotId!==state.activeSnapshotId){const rollback=button('回退内容版本',()=>{if(!isHome())return;const checkpoint=runtime.checkpoint();if(!checkpoint.ok){runtime.notify(checkpoint.message);return;}const box=el('div',null,'wanba-update-confirm');box.append(el('p','回退到上一版游戏内容，保留当前存档？'),button('确认回退',()=>invoke('rollbackGameUpdate')),button('取消',()=>box.remove()));panel.append(box);});rollback.disabled=working;panel.append(rollback);}
  }
  function mount() {
    const body=doc.querySelector('#wb-body'),grid=body?.querySelector(':scope > .wb-cardgrid');
    if(!grid)return;if(!panel?.isConnected){panel=el('section',null,'wanba-updates');panel.id='wanba-game-updates';body.insertBefore(panel,grid);render();}
  }
  const observer=new MutationObserver(mount);observer.observe(doc.body,{childList:true,subtree:true});mount();
  doc.addEventListener('touchstart',event=>{const body=doc.querySelector('#wb-body');if(event.touches.length!==1||!isHome()||body.scrollTop>0||!body.contains(event.target)||event.target.closest('button,input,select,summary')){pull=null;return;}pull={x:event.touches[0].clientX,y:event.touches[0].clientY,dy:0};},{passive:true,capture:true});
  doc.addEventListener('touchmove',event=>{if(!pull)return;const dx=event.touches[0].clientX-pull.x,dy=event.touches[0].clientY-pull.y;if(dy<0||Math.abs(dx)>Math.max(20,dy)){pull=null;return;}if(dy>12){event.preventDefault();pull.dy=dy;const status=panel?.querySelector('.wanba-update-status');if(status)status.textContent=dy>70?'松开刷新':'继续下拉以刷新';}},{passive:false,capture:true});
  doc.addEventListener('touchend',()=>{const should=pull?.dy>70;pull=null;if(should&&typeof host.NativeBridge?.checkGameUpdates==='function')invoke('checkGameUpdates');else render();},{passive:true,capture:true});
  doc.addEventListener('touchcancel',()=>{pull=null;render();},{passive:true,capture:true});
  host.addEventListener('focus',refresh);doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)refresh();});
  return Object.freeze({onEvent:()=>refresh(),refresh,getState:()=>state});
}
