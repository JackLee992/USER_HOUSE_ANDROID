/* global browser, exportFunction */
(() => {
  'use strict';
  // Match patterns do not express ports. Enforce the complete trusted origin here too.
  if (window.top !== window || location.origin !== 'http://127.0.0.1:38657'
      || !(location.pathname === '/assets/www/standalone/index.html'
        || /^\/assets\/updates\/[0-9a-f]{64}\/www\/standalone\/index\.html$/.test(location.pathname))) return;
  const page = window.wrappedJSObject;
  const port = browser.runtime.connectNative('wanba');
  const pending = new Map();
  const deferred = [];
  let nextId = 0;
  let connected = true;
  let shellRequested = false;
  const bridge = new page.Object();
  exportFunction(value => {
    if (connected && typeof value === 'string' && value.length <= 512 * 1024) port.postMessage({op:'shellState',value});
  }, bridge, {defineAs:'onShellState'});
  exportFunction((filename, json) => {
    if (connected && typeof filename === 'string' && typeof json === 'string' && json.length <= 16 * 1024 * 1024)
      port.postMessage({op: 'backup', filename, json});
  }, bridge, {defineAs: 'saveBackup'});
  exportFunction(() => { if (connected) port.postMessage({op: 'downloads'}); }, bridge, {defineAs: 'openDownloads'});
  exportFunction(() => { if (connected) port.postMessage({op: 'appUpdater'}); }, bridge, {defineAs: 'openAppUpdater'});
  exportFunction(enabled => {
    if (connected && typeof enabled === 'boolean') port.postMessage({op: 'immersive', enabled});
  }, bridge, {defineAs: 'setGameImmersive'});
  exportFunction(kind => {
    if (connected && typeof kind === 'string' && kind.length <= 24) port.postMessage({op: 'haptic', kind});
  }, bridge, {defineAs: 'performHapticFeedback'});
  // The page-realm Promise invokes its executor from the page's principal too.
  // Export that callback explicitly, not just the outer getAppInfo function.
  exportFunction(() => new page.Promise(exportFunction((resolve, reject) => {
    if (!connected) { reject(new page.Error('Native bridge disconnected')); return; }
    const id = `info-${++nextId}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new page.Error('Native info timed out')); }, 1200);
    pending.set(id, value => { clearTimeout(timer); resolve(value); });
    port.postMessage({op: 'info', id});
  }, page)), bridge, {defineAs: 'getAppInfo'});
  const requestContent = (op, values = {}) => new page.Promise(exportFunction((resolve, reject) => {
    if (!connected) { reject(new page.Error('Native bridge disconnected')); return; }
    const id = `content-${++nextId}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new page.Error('Native content request timed out')); }, 5000);
    pending.set(id, value => { clearTimeout(timer); resolve(value); });
    port.postMessage({op, id, ...values});
  }, page));
  exportFunction(() => requestContent('contentState'), bridge, {defineAs: 'getContentState'});
  exportFunction(() => requestContent('checkUpdate'), bridge, {defineAs: 'checkGameUpdates'});
  exportFunction(snapshotId => requestContent('downloadUpdate', {snapshotId:String(snapshotId)}), bridge, {defineAs: 'downloadGameUpdate'});
  exportFunction((snapshotId, checkpoint) => {
    if (typeof checkpoint !== 'string' || checkpoint.length > 8 * 1024 * 1024) throw new page.Error('Invalid content checkpoint');
    return requestContent('activateUpdate', {snapshotId:String(snapshotId), checkpoint});
  }, bridge, {defineAs: 'activateGameUpdate'});
  exportFunction(() => requestContent('rollbackUpdate'), bridge, {defineAs: 'rollbackGameUpdate'});
  exportFunction(snapshotId => requestContent('contentReady', {snapshotId:String(snapshotId)}), bridge, {defineAs: 'reportGameContentReady'});
  Object.defineProperty(page, 'NativeBridge', {value: bridge, configurable: false, writable: false});
  const receive = message => {
    if (!message || typeof message.op !== 'string') return;
    if (message.op === 'infoResult' || message.op === 'contentResult') {
      const resolve = pending.get(message.id);
      if (resolve && typeof message.value === 'string') { pending.delete(message.id); resolve(message.value); }
      return;
    }
    const app = page.wanbaApp;
    if (message.op === 'shellProbe') {
      shellRequested = true;
      if (app) port.postMessage({op:'shellAvailable',available:typeof app.catalog==='function'});
      return;
    }
    if (message.op === 'shellCommand') {
      const allowed = new Set(['catalog','setCatalog','launch','openShellTab','setLocale','setPerformance','setRememberWindow','exportBackup','backupData','validateBackup','importBackup','checkpoint']);
      if (typeof message.id !== 'string' || !allowed.has(message.method) || !Array.isArray(message.arguments)) return;
      const reply = result => { if (connected) port.postMessage({op:'ack',id:message.id,...result}); };
      if (!app || typeof app[message.method] !== 'function') { reply({ok:false,error:'Native shell API unavailable'}); return; }
      try {
        // Objects must enter the page realm as data, so plain-object validation and prototypes stay correct.
        const args = page.JSON.parse(JSON.stringify(message.arguments));
        const fulfilled = exportFunction(value => reply({ok:true,value:JSON.parse(JSON.stringify(value ?? null))}), page);
        const rejected = exportFunction(error => reply({ok:false,error:String(error?.message || error)}), page);
        const result = app[message.method](...args);
        new page.Promise(exportFunction(resolve => resolve(result), page)).then(fulfilled,rejected);
      } catch (error) { reply({ok:false,error:String(error?.message || error)}); }
      return;
    }
    // Startup may finish after Android has already moved the session to the background.
    // Keep pause/save requests until the real application exists; never acknowledge a no-op save.
    if (!app && (message.op === 'pause' || message.op === 'save')) { deferred.push(message); return; }
    let handled = false;
    let ok = false;
    try {
      switch (message.op) {
        case 'pause': if (app) { app.pause(); app.save(); } ok = true; break;
        case 'save': if (app) app.save(); ok = true; break;
        case 'back': if (app) { handled = !!app.back(); if (!handled) app.save(); } ok = true; break;
        case 'backupResult':
          if (app && typeof app.onBackupResult === 'function') app.onBackupResult(message.success === true, String(message.message || ''));
          ok = true; break;
        case 'gameUpdate':
          if (app && typeof app.onGameUpdate === 'function' && typeof message.value === 'string') app.onGameUpdate(message.value);
          ok = true; break;
        default: return;
      }
    } catch (error) { console.error('Wanba native lifecycle failed', error); }
    if (typeof message.id === 'string') port.postMessage({op: 'ack', id: message.id, ok, handled});
  };
  port.onMessage.addListener(receive);
  window.addEventListener('wanba-app-ready', () => {
    if (connected && page.wanbaApp) for (const message of deferred.splice(0)) receive(message);
    if (connected && page.wanbaApp && shellRequested) port.postMessage({op:'shellAvailable',available:typeof page.wanbaApp.catalog==='function'});
  });
  port.onDisconnect.addListener(() => { connected = false; pending.clear(); deferred.length = 0; });
  port.postMessage({op: 'ready'});
})();
