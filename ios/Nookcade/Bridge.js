(() => {
  'use strict';
  if (window !== window.top || location.origin !== 'http://127.0.0.1:18737') return;
  const send = (method, ...args) => window.webkit.messageHandlers.wanba.postMessage({method, args});
  Object.defineProperty(window, 'NativeBridge', {configurable:false, writable:false, value:Object.freeze({
    getAppInfo:() => send('getAppInfo'),
    getContentState:() => send('getContentState'),
    onShellState:state => send('onShellState', state),
    saveBackup:(filename, json) => send('saveBackup', filename, json),
    performHapticFeedback:kind => send('performHapticFeedback', kind),
    setGameImmersive:value => send('setGameImmersive', value),
  })});
})();
