import { initWanbanXiaowu } from '../src/runtime/wanban-app.js';

try {
  const runtime = await initWanbanXiaowu({ standalone:true });
  window.wanbaApp = Object.freeze({
    pause:runtime.pause,
    save:runtime.save,
    back:runtime.back,
    inspect:runtime.inspect,
    onBackupResult(success, message) {
      runtime.notify(message || (success ? '备份已保存' : '已取消保存备份'));
    },
  });
  document.querySelector('#wanba-boot')?.remove();
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.wanbaApp.pause(); });
  window.addEventListener('pagehide', () => window.wanbaApp.pause());
  window.addEventListener('beforeunload', () => window.wanbaApp.save());
} catch (error) {
  console.error('[玩吧] 启动失败', error);
  const status = document.querySelector('#wanba-boot');
  if (status) {
    status.innerHTML = '<h1>暂时无法打开玩吧</h1><p>请重新打开应用。存档仍保留在本机。</p><button type="button">重试</button>';
    status.querySelector('button').onclick = () => location.reload();
  }
}
