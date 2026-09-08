import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/wanba-bridge/bridge.js', import.meta.url), 'utf8');
const trustedOrigin = 'http://127.0.0.1:38657';
const trustedPath = '/assets/www/standalone/index.html';
const backupLimit = 8 * 1024 * 1024;

// Run the complete extension script with a separate page realm and a JSON-only native port.
function harness({ origin = trustedOrigin, pathname = trustedPath, topLevel = true, app } = {}) {
  const page = vm.runInNewContext('globalThis');
  const exportedFunctions = new WeakSet();
  // Firefox principals are stricter than two Node VM globals: a page Promise cannot
  // invoke a raw privileged executor. Preserve that actual Gecko failure boundary.
  page.Promise = new Proxy(page.Promise, {
    construct(target, args, newTarget) {
      if (!exportedFunctions.has(args[0])) throw new Error('Permission denied to access object');
      return Reflect.construct(target, args, newTarget);
    },
  });
  page.wanbaApp = app;
  const sent = [], connections = [], exported = [], errors = [];
  const messages = [], disconnects = [], timers = new Map(), windowEvents = new Map();
  let disconnected = false, nextTimer = 0, now = 0;
  const port = {
    postMessage(message) {
      assert.equal(disconnected, false, 'the bridge must not post to a disconnected port');
      sent.push(JSON.parse(JSON.stringify(message)));
    },
    onMessage: { addListener: listener => messages.push(listener) },
    onDisconnect: { addListener: listener => disconnects.push(listener) },
  };
  const window = {
    wrappedJSObject: page,
    addEventListener(type, listener) {
      const listeners = windowEvents.get(type) || [];
      listeners.push(listener);
      windowEvents.set(type, listeners);
    },
  };
  window.top = topLevel ? window : {};
  const context = vm.createContext({
    window,
    location: { origin, pathname },
    browser: { runtime: { connectNative(name) { connections.push(name); return port; } } },
    exportFunction(fn, object, { defineAs } = {}) {
      const callable = function (...args) { return Reflect.apply(fn, this, args); };
      exportedFunctions.add(callable);
      if (defineAs) {
        exported.push(defineAs);
        Object.defineProperty(object, defineAs, { value: callable, enumerable: true });
      }
      return callable;
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    console: { error: (...args) => errors.push(args) },
  });
  vm.runInContext(source, context, { filename: 'wanba-bridge/bridge.js', timeout: 1000 });
  return {
    page, context, sent, connections, exported, errors, timers,
    bridge: page.NativeBridge,
    receive(message) { for (const listener of messages) listener(message); },
    dispatch(type) { for (const listener of windowEvents.get(type) || []) listener({ type }); },
    disconnect() {
      disconnected = true;
      for (const listener of disconnects) listener();
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= now && timers.delete(id)) timer.callback();
      }
    },
  };
}

test('only the exact trusted origin and standalone top-level path can install the bridge', () => {
  const rejected = [
    { origin: 'http://127.0.0.1' },
    { origin: 'http://127.0.0.1:38658' },
    { origin: 'https://127.0.0.1:38657' },
    { origin: 'http://localhost:38657' },
    { origin: 'http://127.0.0.1.example.test:38657' },
    { origin: 'null' },
    { pathname: '/assets/www/standalone/' },
    { pathname: '/assets/www/standalone/index.html/other' },
    { pathname: '/assets/www/standalone/INDEX.html' },
    { pathname: '/assets/www/standalone/%69ndex.html' },
    { pathname: '/assets/www/games/index.html' },
    { topLevel: false },
  ];
  for (const options of rejected) {
    const h = harness(options);
    assert.equal(h.bridge, undefined, JSON.stringify(options));
    assert.deepEqual(h.connections, []);
    assert.deepEqual(h.exported, []);
    assert.deepEqual(h.sent, []);
  }
  const h = harness();
  assert.deepEqual(h.connections, ['wanba']);
  assert.deepEqual(h.sent, [{ op: 'ready' }]);
});

test('the page receives only the nine declared native operations on a fixed bridge property', () => {
  const h = harness();
  const names = ['activateGameUpdate', 'checkGameUpdates', 'downloadGameUpdate', 'getAppInfo', 'getContentState', 'openDownloads', 'reportGameContentReady', 'rollbackGameUpdate', 'saveBackup'];
  assert.deepEqual(Object.getOwnPropertyNames(h.bridge).sort(), names);
  assert.deepEqual(h.exported.sort(), names);
  for (const name of names) assert.equal(typeof h.bridge[name], 'function');
  const descriptor = Object.getOwnPropertyDescriptor(h.page, 'NativeBridge');
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(Reflect.set(h.page, 'NativeBridge', {}), false);
  assert.equal(Reflect.deleteProperty(h.page, 'NativeBridge'), false);
  assert.equal(h.page.NativeBridge, h.bridge);
  h.bridge.openDownloads();
  assert.deepEqual(h.sent.at(-1), { op: 'downloads' });
});

test('immutable snapshot entry installs the bridge while malformed IDs and sibling pages do not', () => {
  const prefix = '/assets/updates/' + 'a'.repeat(64) + '/www/standalone/';
  const h = harness({pathname: prefix + 'index.html'});
  assert.equal(typeof h.bridge.getContentState, 'function');
  for (const pathname of [prefix + 'other.html', prefix.replace('a'.repeat(64), 'a'.repeat(63)) + 'index.html', prefix.replace('a'.repeat(64), 'g'.repeat(64)) + 'index.html'])
    assert.equal(harness({pathname}).bridge, undefined);
});

test('content operations use exported page Promise executors, correlate IDs and preserve exact checkpoints', async () => {
  const h = harness(), snapshotId = 'a'.repeat(64), checkpoint = '{"ok":true,"idle":true,"storage":{"score":"42"}}';
  const operations = [
    ['getContentState', [], 'contentState'], ['checkGameUpdates', [], 'checkUpdate'],
    ['downloadGameUpdate', [snapshotId], 'downloadUpdate'],
    ['activateGameUpdate', [snapshotId, checkpoint], 'activateUpdate'],
    ['rollbackGameUpdate', [], 'rollbackUpdate'], ['reportGameContentReady', [snapshotId], 'contentReady'],
  ];
  const waiting = operations.map(([method, args, op]) => {
    const promise = h.bridge[method](...args), request = h.sent.at(-1);
    assert.ok(promise instanceof h.page.Promise); assert.equal(request.op, op);
    if (args.length) assert.equal(request.snapshotId, snapshotId);
    if (method === 'activateGameUpdate') assert.equal(request.checkpoint, checkpoint);
    return {promise, request};
  });
  for (const {request} of [...waiting].reverse()) h.receive({op:'contentResult', id:request.id, value:JSON.stringify({op:request.op})});
  for (const {promise, request} of waiting) assert.equal(JSON.parse(await promise).op, request.op);
  assert.equal(h.timers.size, 0);
  assert.equal(new Set(waiting.map(({request}) => request.id)).size, 6);
  const count = h.sent.length;
  for (const bad of [null, {}, 'x'.repeat(backupLimit + 1)]) assert.throws(() => h.bridge.activateGameUpdate(snapshotId, bad), /Invalid content checkpoint/);
  assert.equal(h.sent.length, count);
});

test('content update events deliver JSON strings only and failed requests have a bounded timeout', async () => {
  const events = [], h = harness({app: {onGameUpdate: event => events.push(event)}});
  h.receive({op:'gameUpdate', value:'{"state":"ready"}'});
  h.receive({op:'gameUpdate', value:{state:'ready'}});
  assert.deepEqual(events, ['{"state":"ready"}']);
  const promise = h.bridge.getContentState(), rejected = assert.rejects(promise, /Native content request timed out/);
  h.advance(4999); assert.equal(h.timers.size, 1);
  h.advance(1); await rejected; assert.equal(h.timers.size, 0);
  h.disconnect(); await assert.rejects(h.bridge.checkGameUpdates(), /Native bridge disconnected/);
});

test('backup requests preserve string data and enforce the declared 8 MiB character limit', () => {
  const h = harness();
  const json = JSON.stringify({ title: '备份', progress: { score: 42 } });
  h.bridge.saveBackup('save.json', json);
  assert.deepEqual(h.sent.at(-1), { op: 'backup', filename: 'save.json', json });
  const boundary = 'x'.repeat(backupLimit);
  h.bridge.saveBackup('boundary.json', boundary);
  assert.equal(h.sent.at(-1).json, boundary);
  const count = h.sent.length;
  for (const [filename, value] of [
    ['oversized.json', boundary + 'x'],
    ['object.json', {}], ['null.json', null], ['number.json', 123],
    ['boxed.json', new String('{}')], [null, '{}'], [123, '{}'], [{}, '{}'],
  ]) h.bridge.saveBackup(filename, value);
  assert.equal(h.sent.length, count, 'invalid backup inputs must never reach native code');
});

test('pause saves after pausing and acknowledges with plain JSON booleans', () => {
  const events = [];
  const h = harness({ app: { pause: () => events.push('pause'), save: () => events.push('save') } });
  h.receive({ op: 'pause', id: 'pause-1' });
  assert.deepEqual(events, ['pause', 'save']);
  assert.deepEqual(h.sent.at(-1), { op: 'ack', id: 'pause-1', ok: true, handled: false });
  h.receive({ op: 'save', id: 'save-1' });
  assert.deepEqual(events, ['pause', 'save', 'save']);
  assert.deepEqual(h.sent.at(-1), { op: 'ack', id: 'save-1', ok: true, handled: false });
});

test('back reports whether the app handled it and saves only when unhandled', () => {
  for (const handled of [true, false]) {
    const events = [];
    const h = harness({ app: {
      back() { events.push('back'); return handled; },
      save: () => events.push('save'),
    } });
    h.receive({ op: 'back', id: 'back-1' });
    assert.deepEqual(events, handled ? ['back'] : ['back', 'save']);
    assert.deepEqual(h.sent.at(-1), { op: 'ack', id: 'back-1', ok: true, handled });
  }
});

test('lifecycle failures return a negative acknowledgement without escaping the listener', () => {
  for (const op of ['pause', 'save', 'back']) {
    const h = harness({ app: {
      pause() { throw new Error('pause failed'); },
      save() { throw new Error('save failed'); },
      back() { throw new Error('back failed'); },
    } });
    assert.doesNotThrow(() => h.receive({ op, id: `${op}-failed` }));
    assert.deepEqual(h.sent.at(-1), { op: 'ack', id: `${op}-failed`, ok: false, handled: false });
    assert.equal(h.errors.length, 1);
  }
});

test('startup pause/save are deferred in order and acknowledged only after the real app is ready', () => {
  const h = harness();
  h.receive({ op: 'pause', id: 'startup-pause' });
  h.receive({ op: 'save', id: 'startup-save' });
  assert.deepEqual(h.sent, [{ op: 'ready' }], 'no acknowledgement of a no-op pause or save');
  h.dispatch('wanba-app-ready');
  assert.equal(h.sent.length, 1, 'an event without a real app must not discard pending work');
  const events = [];
  h.page.wanbaApp = { pause: () => events.push('pause'), save: () => events.push('save') };
  assert.deepEqual(events, [], 'setting the app alone does not pretend that readiness was signalled');
  h.dispatch('unrelated-event');
  assert.deepEqual(events, []);
  h.dispatch('wanba-app-ready');
  assert.deepEqual(events, ['pause', 'save', 'save']);
  assert.deepEqual(h.sent, [
    { op: 'ready' },
    { op: 'ack', id: 'startup-pause', ok: true, handled: false },
    { op: 'ack', id: 'startup-save', ok: true, handled: false },
  ]);
  h.dispatch('wanba-app-ready');
  assert.deepEqual(events, ['pause', 'save', 'save'], 'each deferred operation runs once');
  assert.equal(h.sent.length, 3);
});

test('disconnect discards deferred startup work instead of replaying it on a later ready event', () => {
  const h = harness();
  h.receive({ op: 'pause', id: 'startup-pause' });
  h.receive({ op: 'save', id: 'startup-save' });
  h.disconnect();
  const events = [];
  h.page.wanbaApp = { pause: () => events.push('pause'), save: () => events.push('save') };
  assert.doesNotThrow(() => h.dispatch('wanba-app-ready'));
  assert.deepEqual(events, []);
  assert.deepEqual(h.sent, [{ op: 'ready' }]);
});

test('back before app initialization stays unhandled so native can leave a failed startup', () => {
  const h = harness();
  h.receive({ op: 'back', id: 'boot-back' });
  assert.deepEqual(h.sent.at(-1), { op: 'ack', id: 'boot-back', ok: true, handled: false });
});

test('lifecycle messages only acknowledge string IDs', () => {
  const events = [];
  const h = harness({ app: { save: () => events.push('save') } });
  const count = h.sent.length;
  for (const id of [undefined, null, 0, {}, []]) h.receive({ op: 'save', id });
  assert.equal(h.sent.length, count);
  assert.equal(events.length, 5, 'missing acknowledgement IDs do not discard a requested save');
});

test('unknown, malformed and evaluation requests cannot invoke page methods or execute code', () => {
  const events = [];
  const h = harness({ app: {
    eval: () => events.push('eval'),
    arbitrary: () => events.push('arbitrary'),
    save: () => events.push('save'),
  } });
  const count = h.sent.length;
  for (const message of [
    null, undefined, true, 42, 'save', [], {}, { op: 1 }, { op: { toString: () => 'save' } },
    ...['eval', 'arbitrary', 'constructor', '__proto__', 'getAppInfo', 'saveBackup'].map(op => ({
      op, id: 'attack', code: 'globalThis.__bridgeExecuted = true', script: 'wanbaApp.save()',
    })),
  ]) h.receive(message);
  assert.deepEqual(events, []);
  assert.equal(h.sent.length, count);
  assert.equal(h.context.__bridgeExecuted, undefined);
  assert.equal(h.page.__bridgeExecuted, undefined);
});

test('backup results deliver strict success and a string message, with an optional acknowledgement', () => {
  const results = [];
  const h = harness({ app: { onBackupResult: (...args) => results.push(args) } });
  h.receive({ op: 'backupResult', id: 'backup-1', success: true, message: '已保存' });
  assert.deepEqual(results, [[true, '已保存']]);
  assert.deepEqual(h.sent.at(-1), { op: 'ack', id: 'backup-1', ok: true, handled: false });
  const count = h.sent.length;
  h.receive({ op: 'backupResult', success: 'true', message: 123 });
  h.receive({ op: 'backupResult', success: false });
  assert.deepEqual(results, [[true, '已保存'], [false, '123'], [false, '']]);
  assert.equal(h.sent.length, count);
});

test('app-info promises correlate out-of-order responses and return the native JSON string', async () => {
  const h = harness();
  const first = h.bridge.getAppInfo(), firstId = h.sent.at(-1).id;
  const second = h.bridge.getAppInfo(), secondId = h.sent.at(-1).id;
  assert.ok(first instanceof h.page.Promise);
  assert.equal(h.sent.at(-1).op, 'info');
  assert.equal(typeof firstId, 'string');
  assert.notEqual(firstId, secondId);
  const firstValue = JSON.stringify({ engine: 'GeckoView', version: '155.0.1' });
  const secondValue = JSON.stringify({ engine: 'GeckoView', state: 'ready' });
  h.receive({ op: 'infoResult', id: secondId, value: secondValue });
  h.receive({ op: 'infoResult', id: firstId, value: firstValue });
  assert.equal(await first, firstValue);
  assert.equal(await second, secondValue);
  assert.equal(h.timers.size, 0, 'completed info requests cancel their timeouts');
  assert.equal(h.sent.length, 3, 'info responses must not generate lifecycle acknowledgements');
  h.receive({ op: 'infoResult', id: firstId, value: 'duplicate' });
  assert.equal(await first, firstValue);
});

test('page Promise rejects a raw privileged executor while getAppInfo exports its executor', async () => {
  const h = harness();
  assert.throws(() => vm.runInContext('new window.wrappedJSObject.Promise(resolve => resolve("raw"))', h.context),
    /Permission denied to access object/);
  const promise = h.bridge.getAppInfo();
  const observed = promise.then(value => JSON.parse(value).engineVersion);
  h.receive({op: 'infoResult', id: h.sent.at(-1).id, value: '{"engineVersion":"155.0.1"}'});
  assert.equal(await observed, '155.0.1');
});

test('unmatched or non-string info results do not resolve a pending request', async () => {
  const h = harness();
  const promise = h.bridge.getAppInfo(), id = h.sent.at(-1).id;
  let settled = false;
  const observed = promise.then(value => { settled = true; return value; });
  h.receive({ op: 'infoResult', id: 'unknown', value: '{}' });
  h.receive({ op: 'infoResult', id, value: { engine: 'GeckoView' } });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(h.timers.size, 1);
  h.receive({ op: 'infoResult', id, value: '{}' });
  assert.equal(await observed, '{}');
});

test('missing app-info responses reject after 1200 ms and late responses are ignored', async () => {
  const h = harness();
  const promise = h.bridge.getAppInfo(), id = h.sent.at(-1).id;
  const rejected = assert.rejects(promise, /Native info timed out/);
  h.advance(1199);
  assert.equal(h.timers.size, 1);
  h.advance(1);
  await rejected;
  assert.equal(h.timers.size, 0);
  h.receive({ op: 'infoResult', id, value: '{}' });
  assert.equal(h.sent.length, 2);
});

test('disconnect disables backup/download writes and rejects new info requests', async () => {
  const h = harness();
  h.disconnect();
  h.bridge.saveBackup('save.json', '{}');
  h.bridge.openDownloads();
  await assert.rejects(h.bridge.getAppInfo(), /Native bridge disconnected/);
  assert.deepEqual(h.sent, [{ op: 'ready' }]);
  assert.equal(h.timers.size, 0);
});

test('an info request already pending at disconnect still settles by its existing deadline', async () => {
  const h = harness();
  const promise = h.bridge.getAppInfo();
  const rejected = assert.rejects(promise, /Native info timed out/);
  h.disconnect();
  h.advance(1200);
  await rejected;
  assert.equal(h.timers.size, 0);
  assert.equal(h.sent.length, 2);
});
