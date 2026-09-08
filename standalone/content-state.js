export const CHECKPOINT_KEYS=Object.freeze(['settings','scores','progress','records','sudokuState'].map(name=>'wanbanXiaowu_'+name+'_v1'));
export const parseNative=value=>typeof value==='string'?JSON.parse(value):value;

export async function readContentState(host=globalThis) {
  if(typeof host.NativeBridge?.getContentState!=='function')return null;
  const state=parseNative(await host.NativeBridge.getContentState());
  if(!state||typeof state!=='object')throw Error('无法读取游戏内容状态');
  if(state.error)throw Error(state.error);
  return state;
}

export async function confirmContentReady(host,snapshotId,timeoutMs=5000) {
  if(!snapshotId||typeof host.NativeBridge?.reportGameContentReady!=='function')return;
  const response=parseNative(await host.NativeBridge.reportGameContentReady(snapshotId));
  if(response?.error)throw Error(response.error);
  const deadline=Date.now()+timeoutMs;
  do {const state=await readContentState(host);if(state?.activeSnapshotId!==snapshotId)throw Error('游戏内容已切换，请重新打开');if(state.bootHealthy===true)return;if(state.job?.state==='error')throw Error(state.job.message||'内容初始化失败');await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
  throw Error('内容保存尚未完成，请重新打开应用');
}

export function validateStorageCheckpoint(storage) {
  if(!storage||Array.isArray(storage)||typeof storage!=='object'||Object.keys(storage).length!==CHECKPOINT_KEYS.length||Object.keys(storage).some(key=>!CHECKPOINT_KEYS.includes(key)))throw Error('存档检查点格式无效');
  for(const raw of Object.values(storage)){if(raw!==null&&typeof raw!=='string')throw Error('存档检查点值无效');if(raw!==null){const value=JSON.parse(raw);if(!value||typeof value!=='object')throw Error('存档检查点内容无效');}}
  return storage;
}

export function captureStorage(storage) {
  return validateStorageCheckpoint(Object.fromEntries(CHECKPOINT_KEYS.map(key=>[key,storage.getItem(key)])));
}

export function restoreCheckpoint(storage,checkpoint) {
  if(!checkpoint)return;
  // Native returns the validated storage object, not an executable migration.
  const target=validateStorageCheckpoint(checkpoint.storage||checkpoint),before=captureStorage(storage);
  const put=(key,raw)=>{if(raw===null)storage.removeItem(key);else storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('存档写入未完成');};
  try {for(const key of CHECKPOINT_KEYS)put(key,target[key]);}
  catch(error){for(const key of CHECKPOINT_KEYS)try{put(key,before[key]);}catch{}throw error;}
}

export function gameContentMetadata(id,contentState,version='1.0.0') {
  const active=contentState?.active,game=active?.games?.[id];
  return Object.freeze({gameVersion:game?.version||version,runtimeApi:active?.runtimeApi||1,saveSchema:game?.saveSchema??(id==='match3'?3:id==='pinball'?2:1),snapshotId:contentState?.activeSnapshotId||'builtin',artVersions:Object.fromEntries((game?.art||[]).map(id=>[id,active.packages?.find(p=>p.id===id)?.version||'unknown']))});
}

export function requireCompatibleSave(state,content) {
  if(!state?._content)return; // Original saves use the existing per-game validators.
  if(state._content.runtimeApi!==content.runtimeApi||state._content.saveSchema!==content.saveSchema)throw Error('此存档需要其他游戏版本，已保留原存档。请更新游戏内容后重试。');
}
