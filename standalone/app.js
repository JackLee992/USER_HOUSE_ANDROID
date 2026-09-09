import { initWanbanXiaowu } from '../src/runtime/wanban-app.js';
import { readAppInfo } from './app-info.js';
import { readContentState, restoreCheckpoint, confirmContentReady } from './content-state.js';
import { installGameUpdates } from './game-updates.js';
import { initI18n, observeLocalizedUI } from './i18n.js';
import { preloadGameArt } from './game-art.js';
import { initPerformance } from './performance.js';

try {
  const contentState = await readContentState(window);
  if (contentState?.restoreStorage) restoreCheckpoint(window.localStorage, contentState.restoreStorage);
  await initI18n();
  initPerformance(window);
  await preloadGameArt(window);
  const runtime = await initWanbanXiaowu({ standalone:true, appInfo:await readAppInfo(window), contentState, startupBlocked:true });
  let updates;
  const app = Object.freeze({
    checkpoint:runtime.checkpoint,
    catalog:runtime.catalog, setCatalog:runtime.setCatalog, launch:runtime.launch,
    openShellTab:runtime.openShellTab, setLocale:runtime.setLocale,
    setPerformance:runtime.setPerformance, setRememberWindow:runtime.setRememberWindow,
    exportBackup:runtime.exportBackup, backupData:runtime.backupData,
    validateBackup:runtime.validateBackup, importBackup:runtime.importBackup,
    pause:runtime.pause,
    save:runtime.save,
    back:runtime.back,
    inspect:runtime.inspect,
    onGameUpdate:() => updates?.onEvent(),
    onBackupResult(success, message) {
      runtime.notify(message || (success ? '备份已保存' : '已取消保存备份'));
    },
  });
  updates = installGameUpdates({runtime,initialState:contentState});
  observeLocalizedUI();
  if (document.hidden) runtime.pause();
  await confirmContentReady(window,contentState?.activeSnapshotId);
  runtime.ready();
  window.wanbaApp = app;
  const notifyNativeShell = () => {
    try { Promise.resolve(window.NativeBridge?.onShellState?.(JSON.stringify(app.catalog()))).catch(error => console.warn('[玩吧] native shell update failed',error)); }
    catch(error) { console.warn('[玩吧] native shell update failed',error); }
  };
  window.addEventListener('wanba:navigation',notifyNativeShell);
  window.addEventListener('wanba-language-change',notifyNativeShell);
  window.addEventListener('wanba-performance-change',notifyNativeShell);
  notifyNativeShell();
  // A native ready event can arrive before the bridge can see wanbaApp.
  // Read the committed state after registration so the update panel cannot
  // remain stuck on its initial "activating" state until a later focus event.
  await updates.refresh();
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.wanbaApp.pause(); });
  window.addEventListener('pagehide', () => window.wanbaApp.pause());
  window.addEventListener('beforeunload', () => window.wanbaApp.save());
  if (document.hidden) window.wanbaApp.pause();
  document.querySelector('#wanba-boot')?.remove();
  window.dispatchEvent(new Event('wanba-app-ready'));
} catch (error) {
  console.error('[玩吧] 启动失败', error);
  const status = document.querySelector('#wanba-boot');
  if (status) {
    status.innerHTML = '<h1>暂时无法打开玩吧</h1><p>请重新打开应用。存档仍保留在本机。</p><button type="button">重试</button>';
    status.querySelector('button').onclick = () => location.reload();
    observeLocalizedUI();
  }
}
