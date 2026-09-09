// A presentation scheduler, not a game clock. The owner invalidates after a
// state/input/size change; an idle board owns no animation frame callback.
export function createDemandRenderer({
  window: win = globalThis.window,
  document: doc = win?.document,
  isActive = () => true,
  isPaused = () => false,
  render,
}) {
  let pending = null, destroyed = false, pageHidden = false;
  const canRender = () => !destroyed && !pageHidden && !doc?.hidden &&
    doc?.visibilityState !== 'hidden' && isActive() && !isPaused();

  function cancel() {
    if (pending !== null) win.cancelAnimationFrame(pending);
    pending = null;
  }

  function invalidate() {
    if (!canRender()) { cancel(); return; }
    if (pending !== null) return;
    pending = win.requestAnimationFrame(time => {
      pending = null;
      if (canRender()) render(time);
    });
  }

  function visibilityChanged() {
    if (canRender()) invalidate();
    else cancel();
  }
  function pageHide() { pageHidden = true; cancel(); }
  function pageShow() { pageHidden = false; invalidate(); }

  doc?.addEventListener('visibilitychange', visibilityChanged);
  win.addEventListener?.('pagehide', pageHide);
  win.addEventListener?.('pageshow', pageShow);

  return {
    invalidate,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
      doc?.removeEventListener('visibilitychange', visibilityChanged);
      win.removeEventListener?.('pagehide', pageHide);
      win.removeEventListener?.('pageshow', pageShow);
    },
  };
}
