import {normalizeCatalogPreferences, toggleFavorite, reorderVisibleIds} from './catalog-preferences.js';

const mounts = new WeakMap();
const paths = {
  favorite:'M6 4h12v17l-6-4-6 4V4Z',
  sort:'M8 4v16m-3-3 3 3 3-3M16 20V4m-3 3 3-3 3 3',
  done:'m5 12 4 4L19 6', up:'m6 14 6-6 6 6', down:'m6 10 6 6 6-6',
  drag:'M8 6h8M8 12h8M8 18h8',
  game:'M7 7h10a4 4 0 0 1 4 4v5a3 3 0 0 1-5 2l-2-2h-4l-2 2a3 3 0 0 1-5-2v-5a4 4 0 0 1 4-4Zm0 3v4m-2-2h4m7-1h.01m2 2h.01',
};
const icon = name => '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + paths[name] + '"/></svg>';

// The caller owns settings persistence and failure messages. No storage or game
// controller is accessed here; cleanup removes every temporary gesture listener.
export function mountCatalog({container, games = [], mode = 'single', preferences,
  onPreferencesChange = () => false, onLaunch = () => {}, scoreLabel = () => '',
  iconHTML, onBrowseGames = () => {}}) {
  mounts.get(container)?.();
  const doc = container.ownerDocument, win = doc.defaultView || globalThis;
  const byId = new Map();
  for (const game of games) if (typeof game?.id === 'string' && /^[a-z0-9]+$/.test(game.id) && !byId.has(game.id)) byId.set(game.id, game);
  const validIds = [...byId.keys()];
  let state = normalizeCatalogPreferences(preferences, validIds);
  let disposed = false, editing = false, gesture = null, toolbar, grid, status, empty;
  const visibleIds = () => state.order.filter(id => mode === 'my'
    ? state.favorites.includes(id) : byId.get(id).mode === mode);
  const element = (tag, className, text) => {
    const node = doc.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  };
  function button(className, label, symbol, handler) {
    const node = element('button', className); node.type = 'button';
    node.setAttribute('aria-label', label);
    if (symbol) node.innerHTML = icon(symbol);
    node.onclick = event => { event.stopPropagation(); if (!disposed) handler(event); };
    return node;
  }
  function focusControl(id, action) {
    const control = action === 'favorite' ? grid?.querySelector(`[data-catalog-favorite="${id}"]`)
      : grid?.querySelector(`[data-catalog-move="${action}"][data-id="${id}"]`);
    const edit = toolbar?.querySelector('.wanba-catalog-edit');
    const fallback = edit && !edit.disabled ? edit : grid?.querySelector('[data-game]') || empty?.querySelector('.wanba-catalog-browse');
    (control && !control.disabled ? control : fallback)?.focus?.();
  }
  function commit(next, focus) {
    if (disposed) return false;
    let accepted = false;
    try { accepted = onPreferencesChange(structuredClone(next)) === true; } catch { /* Caller reports the storage failure. */ }
    if (!accepted || disposed) return false;
    state = normalizeCatalogPreferences(next, validIds);
    render();
    if (focus) focusControl(focus.id, focus.action);
    return true;
  }
  function move(id, direction) {
    const visible = visibleIds(), from = visible.indexOf(id), to = from + direction;
    if (from < 0 || to < 0 || to >= visible.length) return;
    const next = [...visible]; [next[from], next[to]] = [next[to], next[from]];
    commit(reorderVisibleIds(state, visible, next, validIds), {id, action:direction < 0 ? 'up' : 'down'});
  }
  function stopGesture() {
    const previous = gesture; gesture = null;
    if (!previous) return null;
    win.clearTimeout(previous.timer);
    doc.removeEventListener('pointermove', pointerMove);
    doc.removeEventListener('pointerup', pointerEnd);
    doc.removeEventListener('pointercancel', cancelGesture);
    doc.removeEventListener('touchmove', touchMove, true);
    doc.removeEventListener('touchend', touchEnd, true);
    doc.removeEventListener('touchcancel', cancelGesture, true);
    win.removeEventListener?.('blur', cancelGesture);
    doc.removeEventListener('visibilitychange', hidden);
    for (const card of grid?.children || []) { card.style.order = ''; card.classList.remove('is-dragging'); }
    delete container.dataset.catalogDragging;
    if (status) status.textContent = '';
    return previous;
  }
  function cancelGesture() { stopGesture(); }
  function hidden() { if (doc.hidden) cancelGesture(); }
  function startGesture(event, id, input) {
    if (disposed || !editing || visibleIds().length < 2 || (input === 'pointer' && event.button !== 0)) return;
    if (input === 'touch' && event.touches.length !== 1) return;
    cancelGesture(); event.stopPropagation();
    const point = input === 'touch' ? event.touches[0] : event;
    const visible = visibleIds();
    gesture = {id, input, pointerId:point.pointerId ?? point.identifier, x:point.clientX, y:point.clientY,
      visible, order:[...visible], active:false, timer:null};
    const pending = gesture;
    pending.timer = win.setTimeout(() => {
      if (disposed || gesture !== pending || doc.hidden || !container.isConnected) { cancelGesture(); return; }
      pending.active = true; container.dataset.catalogDragging = 'true';
      grid.querySelector(`[data-catalog-game="${id}"]`)?.classList.add('is-dragging');
      status.textContent = '正在移动游戏，松开完成排序';
      if (input === 'touch') {
        doc.removeEventListener('touchmove', touchMove, true);
        doc.addEventListener('touchmove', touchMove, {passive:false, capture:true});
      }
    }, 400);
    if (input === 'touch') {
      // Before the long press activates, the browser owns normal scrolling.
      doc.addEventListener('touchmove', touchMove, {passive:true, capture:true});
      doc.addEventListener('touchend', touchEnd, {passive:true, capture:true});
      doc.addEventListener('touchcancel', cancelGesture, {passive:true, capture:true});
    } else {
      doc.addEventListener('pointermove', pointerMove);
      doc.addEventListener('pointerup', pointerEnd);
      doc.addEventListener('pointercancel', cancelGesture);
    }
    win.addEventListener?.('blur', cancelGesture);
    doc.addEventListener('visibilitychange', hidden);
  }
  function updateGesture(point, event) {
    if (!gesture) return;
    if (!gesture.active) {
      if (Math.hypot(point.clientX - gesture.x, point.clientY - gesture.y) > 8) cancelGesture();
      return;
    }
    if (event.cancelable) event.preventDefault();
    const target = doc.elementFromPoint(point.clientX, point.clientY)?.closest('[data-catalog-game]');
    if (!target || !grid.contains(target)) return;
    const to = gesture.order.indexOf(target.dataset.catalogGame), from = gesture.order.indexOf(gesture.id);
    if (to < 0 || from === to) return;
    gesture.order.splice(from, 1); gesture.order.splice(to, 0, gesture.id);
    for (const card of grid.children) card.style.order = String(gesture.order.indexOf(card.dataset.catalogGame));
  }
  function finishGesture() {
    const previous = stopGesture();
    if (previous?.active && previous.order.some((id, i) => id !== previous.visible[i]))
      commit(reorderVisibleIds(state, previous.visible, previous.order, validIds));
  }
  function pointerMove(event) { if (gesture?.input === 'pointer' && event.pointerId === gesture.pointerId) updateGesture(event, event); }
  function pointerEnd(event) { if (gesture?.input === 'pointer' && event.pointerId === gesture.pointerId) finishGesture(); }
  function touchMove(event) {
    if (gesture?.input !== 'touch') return;
    if (event.touches.length !== 1) { cancelGesture(); return; }
    const point = [...event.touches].find(touch => touch.identifier === gesture.pointerId);
    if (point) updateGesture(point, event);
  }
  function touchEnd(event) {
    if (gesture?.input === 'touch' && [...event.changedTouches].some(touch => touch.identifier === gesture.pointerId)) finishGesture();
  }
  function render() {
    cancelGesture();
    for (const node of [toolbar, grid, status, empty]) node?.remove();
    const visible = visibleIds();
    if (visible.length < 2) editing = false;
    container.dataset.wanbaCatalog = mode;
    if (editing) container.dataset.catalogEditing = 'true'; else delete container.dataset.catalogEditing;
    toolbar = element('div', 'wanba-catalog-toolbar');
    const summary = element('div', 'wanba-catalog-summary');
    summary.append(element('h2', 'wanba-catalog-title', mode === 'my' ? '我的收藏' : mode === 'double' ? '人机挑战' : '单人游戏'));
    const count = element('span', 'wanba-catalog-count');
    count.append(element('span', '', String(visible.length)), element('span', '', '款游戏')); summary.append(count);
    const edit = button('wb-btn wanba-catalog-edit', editing ? '完成排序' : '自定义排序', editing ? 'done' : 'sort', () => {
      editing = !editing; render(); toolbar.querySelector('.wanba-catalog-edit')?.focus?.();
    });
    edit.append(element('span', '', editing ? '完成' : '自定义排序')); edit.disabled = visible.length < 2;
    edit.setAttribute('aria-pressed', String(editing)); toolbar.append(summary, edit);
    grid = element('div', 'wb-cardgrid wanba-catalog-grid');
    for (const [index, id] of visible.entries()) {
      const game = byId.get(id), card = element('article', 'wb-game-card wanba-catalog-card');
      card.dataset.catalogGame = id;
      const launch = button('wanba-catalog-launch', game.name, null, () => { if (!editing) onLaunch(id); });
      launch.dataset.game = id; launch.disabled = editing;
      if (iconHTML) launch.innerHTML = iconHTML(game);
      else { const graphic = element('span', 'wb-game-icon'); graphic.innerHTML = icon('game'); launch.append(graphic); }
      const info = element('span', 'wb-game-info');
      const name = element('span', 'wb-game-name', game.name), descriptionId = 'wanba-catalog-name-' + id;
      name.setAttribute('id', descriptionId);
      info.append(name, element('span', 'wb-muted', scoreLabel(id)));
      launch.append(info);
      const favorite = button('wanba-catalog-favorite', state.favorites.includes(id) ? '取消收藏' : '收藏游戏', 'favorite', () => {
        commit(toggleFavorite(state, id, validIds), {id, action:'favorite'});
      });
      favorite.dataset.catalogFavorite = id; favorite.setAttribute('aria-pressed', String(state.favorites.includes(id)));
      favorite.setAttribute('aria-describedby', descriptionId);
      card.append(launch, favorite);
      if (editing) {
        const controls = element('div', 'wanba-catalog-sort-controls');
        const handle = button('wanba-catalog-drag', '长按拖动排序', 'drag', () => {}); handle.dataset.catalogDrag = id;
        handle.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') startGesture(event, id, 'pointer'); });
        handle.addEventListener('touchstart', event => startGesture(event, id, 'touch'), {passive:true});
        handle.addEventListener('contextmenu', event => event.preventDefault());
        const up = button('wanba-catalog-move', '上移', 'up', () => move(id, -1));
        const down = button('wanba-catalog-move', '下移', 'down', () => move(id, 1));
        for (const [control, direction] of [[up, 'up'], [down, 'down']]) { control.dataset.catalogMove = direction; control.dataset.id = id; }
        for (const control of [handle, up, down]) control.setAttribute('aria-describedby', descriptionId);
        up.disabled = index === 0; down.disabled = index === visible.length - 1;
        controls.append(handle, up, down); card.append(controls);
      }
      grid.append(card);
    }
    status = element('p', 'wanba-catalog-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    container.append(toolbar, grid, status);
    empty = null;
    if (!visible.length) {
      empty = element('section', 'wanba-catalog-empty');
      empty.append(element('h3', '', mode === 'my' ? '还没有收藏的游戏' : '暂无游戏'));
      if (mode === 'my') {
        empty.append(element('p', '', '在游戏列表点收藏，即可在这里找到。'));
        const browse = button('wb-btn primary wanba-catalog-browse', '去看看游戏', null, onBrowseGames);
        browse.textContent = '去看看游戏'; empty.append(browse);
      }
      container.append(empty);
    }
  }
  function cleanup() {
    if (disposed) return;
    disposed = true; cancelGesture();
    for (const node of [toolbar, grid, status, empty]) node?.remove();
    delete container.dataset.wanbaCatalog; delete container.dataset.catalogEditing;
    if (mounts.get(container) === cleanup) mounts.delete(container);
  }
  mounts.set(container, cleanup); render();
  return cleanup;
}
