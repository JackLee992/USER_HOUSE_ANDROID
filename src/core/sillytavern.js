export function getSillyTavernContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || null;
  } catch (error) {
    console.warn('[玩伴小屋] getContext failed:', error);
    return null;
  }
}

export function waitForHostReady(timeoutMs = 30000) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const done = () => resolve();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      if (globalThis.SillyTavern?.getContext) return done();
    }
    const timer = setInterval(() => {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        if (globalThis.SillyTavern?.getContext || Date.now() - startedAt > timeoutMs) {
          clearInterval(timer);
          done();
        }
      }
    }, 100);
    document.addEventListener('DOMContentLoaded', () => {
      if (globalThis.SillyTavern?.getContext || Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        done();
      }
    }, { once: true });
  });
}
// Optional host adapter: the Android entry does not import SillyTavern's script.js.
export function getRequestHeaders() {
  return getSillyTavernContext()?.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
}
