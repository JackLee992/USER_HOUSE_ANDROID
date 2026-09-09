import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebGLSurface } from '../src/games/shared/webgl-surface.js';
import { createDemandRenderer } from '../src/games/shared/demand-renderer.js';

// API/state recorder only. Actual GLSL appearance and Android driver behavior
// still require browser/device visual checks; this does not simulate a GPU.
function gpu(fault = {}) {
  const live = new Set(), deleted = [], draws = [], uploads = [], listeners = new Map();
  const counts = { shader: 0, program: 0, buffer: 0, texture: 0 };
  const enabled = new Set(), attributes = new Map(), bindings = new Map(), uniforms = new Map();
  let boundBuffer, program, unit = 0, blend, compileCount = 0, linkCount = 0;
  let fallbackCount = 0, contextReleases = 0, clears = 0, textureUploads = 0;
  function make(kind) {
    counts[kind]++;
    if (fault[kind] === counts[kind]) return null;
    const object = { kind, id: counts[kind] };
    live.add(object); return object;
  }
  function remove(object) {
    assert.ok(live.delete(object), 'delete each successfully allocated resource exactly once');
    deleted.push(object);
  }
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, FLOAT: 6, DYNAMIC_DRAW: 7, TRIANGLES: 8, ONE: 9,
    ONE_MINUS_SRC_ALPHA: 10, TEXTURE_2D: 11, TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13, TEXTURE_WRAP_S: 14, TEXTURE_WRAP_T: 15,
    LINEAR: 16, CLAMP_TO_EDGE: 17, BLEND: 18, COLOR_BUFFER_BIT: 19,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 20, RGBA: 21, UNSIGNED_BYTE: 22, TEXTURE0: 100, NO_ERROR: 0,
    createShader: () => make('shader'), shaderSource() {},
    compileShader(shader) { shader.ok = ++compileCount !== fault.compile; },
    getShaderParameter: shader => shader.ok, deleteShader: remove,
    createProgram: () => make('program'), attachShader() {},
    linkProgram(value) { value.ok = ++linkCount !== fault.link; },
    getProgramParameter: value => value.ok, deleteProgram: remove,
    createBuffer: () => make('buffer'), deleteBuffer: remove,
    bindBuffer(_target, value) { boundBuffer = value; },
    bufferData(_target, values) { uploads.push({ buffer: boundBuffer, values: [...values] }); },
    createTexture: () => make('texture'), deleteTexture: remove,
    activeTexture(value) { unit = value - gl.TEXTURE0; },
    bindTexture(_target, texture) { bindings.set(unit, texture); }, texParameteri() {}, pixelStorei() {},
    texImage2D() { textureUploads++; if (fault.uploadThrows) throw new Error('Upload rejected'); },
    getError: () => fault.uploadError ? 1285 : gl.NO_ERROR,
    getUniformLocation(value, name) { assert.ok(live.has(value)); return { program: value, name }; },
    getAttribLocation(value, name) {
      return (value.id === 1 ? { aPosition: 0, aUV: 3, aTint: 5 } : { aPosition: 2, aColor: 3 })[name] ?? -1;
    },
    useProgram(value) { program = value; },
    enableVertexAttribArray(location) { enabled.add(location); },
    disableVertexAttribArray(location) { enabled.delete(location); },
    vertexAttribPointer(location, size, _type, _normalized, stride, offset) {
      attributes.set(location, { size, stride, offset, buffer: boundBuffer });
    },
    uniform1i(location, value) { uniforms.set(location.name, value); },
    uniform1f(location, value) { uniforms.set(location.name, value); },
    uniform2f(location, ...value) { uniforms.set(location.name, value); },
    uniform3f(location, ...value) { uniforms.set(location.name, value); },
    uniform4f(location, ...value) { uniforms.set(location.name, value); },
    uniformMatrix4fv(location, transpose, value) { assert.equal(transpose, false); uniforms.set(location.name, [...value]); },
    enable() {}, clearColor() {}, viewport() {}, clear() { clears++; },
    blendFunc(...value) { blend = value; },
    drawArrays(mode, first, count) {
      draws.push({ mode, first, count, program, buffer: boundBuffer, blend,
        attributes: new Map([...attributes].filter(([key]) => enabled.has(key))),
        bindings: new Map(bindings), uniforms: new Map(uniforms) });
    },
    // Do not clear the live set here: cleanup tests must prove explicit resource
    // deletion, rather than conceal a resource leak with context destruction.
    getExtension: () => ({ loseContext() { contextReleases++; } }),
  };
  const canvas = {
    width: 600, height: 900, hidden: false,
    getContext() {
      if (fault.contextThrows) throw new Error('Context rejected');
      return fault.contextMissing ? null : gl;
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name),
  };
  const surface = createWebGLSurface(canvas, { onFallback() { fallbackCount++; } });
  return { surface, gl, canvas, counts, live, deleted, draws, uploads, listeners,
    get fallbackCount() { return fallbackCount; }, get contextReleases() { return contextReleases; },
    get clears() { return clears; }, get textureUploads() { return textureUploads; },
    lose() {
      let prevented = false;
      live.clear(); // A real loss invalidates all resources in the driver.
      listeners.get('webglcontextlost')({ preventDefault() { prevented = true; } });
      assert.equal(prevented, false, 'permanent fallback must not opt into restoring an abandoned context');
    },
  };
}

function batches(surface) {
  const alpha = surface.createBatch({ vertex: 'alpha vertex', fragment: 'alpha fragment',
    attributes: [['aPosition', 2], ['aUV', 2], ['aTint', 4]],
    uniforms: { uSize: 'vec2', uAtlas: 'sampler2D' } });
  const additive = surface.createBatch({ vertex: 'fx vertex', fragment: 'fx fragment',
    attributes: [['aPosition', 2], ['aColor', 4]],
    uniforms: { uSize: 'vec2' }, blend: 'additive' });
  const texture = surface.createTexture();
  return { alpha, additive, texture };
}
const sphereVertices = new Float32Array(6 * 8).fill(.5);
const fxVertices = new Float32Array(6 * 6).fill(.25);
function alphaFrame(g, batch) {
  return g.surface.drawBatch(batch.alpha, { vertices: sphereVertices, uniforms: { uSize: [300, 450] }, textures: { uAtlas: batch.texture } });
}

test('shared GL owns real two-pass submission, resetting attributes and texture state between batches', () => {
  const g = gpu(), batch = batches(g.surface);
  assert.equal(g.surface.uploadTexture(batch.texture, {}), true);
  assert.equal(g.surface.beginFrame(), true);
  assert.equal(alphaFrame(g, batch), true);
  assert.equal(g.surface.drawBatch(batch.additive, { vertices: fxVertices, uniforms: { uSize: [300, 450] } }), true);
  assert.equal(g.clears, 1);
  assert.deepEqual(g.draws.map(draw => [draw.first, draw.count]), [[0, 6], [0, 6]]);
  assert.deepEqual(g.draws.map(draw => draw.blend), [[g.gl.ONE, g.gl.ONE_MINUS_SRC_ALPHA], [g.gl.ONE, g.gl.ONE]]);
  const [alpha, additive] = g.draws;
  assert.deepEqual([...alpha.attributes.keys()], [0, 3, 5]);
  assert.deepEqual([...additive.attributes.keys()].sort(), [2, 3], 'unused arrays from the previous shader are disabled');
  assert.deepEqual(alpha.attributes.get(3), { size: 2, stride: 32, offset: 8, buffer: alpha.buffer });
  assert.deepEqual(additive.attributes.get(3), { size: 4, stride: 24, offset: 8, buffer: additive.buffer });
  assert.ok(alpha.bindings.get(0));
  assert.equal(alpha.uniforms.get('uAtlas'), 0, 'sampler unit is explicit');
  assert.equal(additive.bindings.get(0), null, 'untextured effect batch clears prior texture binding');
  assert.deepEqual(g.uploads.map(upload => upload.values.length), [48, 36]);
  const allocated = { ...g.counts };
  g.surface.beginFrame(); assert.equal(alphaFrame(g, batch), true);
  assert.deepEqual(g.counts, allocated, 'frames reuse programs, buffers and textures');
  assert.equal(g.textureUploads, 1, 'unchanged atlas is not uploaded each frame');
  assert.equal(g.draws[2].bindings.get(0), alpha.bindings.get(0), 'sphere pass rebinds its texture after effects');
  assert.deepEqual([...g.draws[2].attributes.keys()].sort(), [0, 3, 5]);
  g.surface.destroy(); g.surface.destroy();
  assert.equal(g.live.size, 0); assert.equal(g.listeners.size, 0);
  assert.equal(g.contextReleases, 1); assert.equal(g.fallbackCount, 0);
});

test('all partial allocation, compilation and linking failures release prior resources and notify once', () => {
  const faults = [
    { contextMissing: true }, { contextThrows: true },
    ...[1, 2, 3, 4].map(shader => ({ shader })),
    ...[1, 2, 3, 4].map(compile => ({ compile })),
    ...[1, 2].map(program => ({ program })),
    ...[1, 2].map(link => ({ link })),
    ...[1, 2].map(buffer => ({ buffer })), { texture: 1 },
  ];
  for (const fault of faults) {
    const g = gpu(fault), batch = batches(g.surface);
    assert.equal(g.surface.available, false, JSON.stringify(fault));
    assert.equal(g.surface.beginFrame(), false);
    assert.equal(alphaFrame(g, batch), false);
    assert.equal(g.surface.uploadTexture(batch.texture, {}), false);
    assert.equal(g.canvas.hidden, true); assert.equal(g.fallbackCount, 1);
    assert.equal(g.live.size, 0, JSON.stringify(fault));
    assert.equal(g.listeners.size, 0);
    g.surface.destroy(); g.surface.destroy(); assert.equal(g.fallbackCount, 1);
  }
});

test('texture upload exceptions and driver errors fail closed without leaking resources', () => {
  for (const fault of [{ uploadThrows: true }, { uploadError: true }]) {
    const g = gpu(fault), batch = batches(g.surface);
    assert.equal(g.surface.uploadTexture(batch.texture, {}), false);
    assert.equal(g.surface.available, false); assert.equal(g.fallbackCount, 1);
    assert.equal(g.live.size, 0); assert.equal(g.contextReleases, 1);
    assert.equal(alphaFrame(g, batch), false); g.surface.destroy();
  }
});

test('lost or disposed surfaces stop all submission and allocation, and remove lifecycle listeners', () => {
  for (const lifecycle of ['lose', 'destroy']) {
    const g = gpu(), batch = batches(g.surface);
    g.surface.uploadTexture(batch.texture, {});
    if (lifecycle === 'lose') g.lose(); else g.surface.destroy();
    const counts = { ...g.counts }, deleted = g.deleted.length;
    assert.equal(g.surface.available, false); assert.equal(g.canvas.hidden, true);
    assert.equal(g.surface.beginFrame(), false); assert.equal(alphaFrame(g, batch), false);
    assert.equal(g.surface.uploadTexture(batch.texture, {}), false);
    assert.equal(g.surface.createTexture(), null); batches(g.surface);
    assert.deepEqual(g.counts, counts); assert.equal(g.draws.length, 0);
    g.surface.destroy(); assert.equal(g.deleted.length, deleted);
    assert.equal(g.live.size, 0); assert.equal(g.listeners.size, 0);
    assert.equal(g.fallbackCount, lifecycle === 'lose' ? 1 : 0);
    assert.equal(g.contextReleases, lifecycle === 'lose' ? 0 : 1, 'never call GL disposal APIs on a lost context');
  }
});

function scheduler() {
  const frames = new Map(), docEvents = new Map(), winEvents = new Map(), rendered = [];
  let nextId = 0, requested = 0, cancelled = 0, active = true, paused = false;
  const doc = { hidden: false, visibilityState: 'visible',
    addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: name => docEvents.delete(name) };
  const win = {
    requestAnimationFrame(fn) { const id = nextId++; requested++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { cancelled++; frames.delete(id); },
    addEventListener: (name, fn) => winEvents.set(name, fn), removeEventListener: name => winEvents.delete(name),
  };
  const renderer = createDemandRenderer({ window: win, document: doc,
    isActive: () => active, isPaused: () => paused, render: time => rendered.push(time) });
  return { renderer, frames, rendered, docEvents, winEvents,
    set active(value) { active = value; }, set paused(value) { paused = value; },
    get requested() { return requested; }, get cancelled() { return cancelled; },
    flush(time) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); },
    visibility(hidden) { doc.hidden = hidden; doc.visibilityState = hidden ? 'hidden' : 'visible'; docEvents.get('visibilitychange')(); },
  };
}

test('demand scheduler stays completely idle and coalesces a burst of invalidations into one frame', () => {
  const s = scheduler(); assert.equal(s.requested, 0);
  for (let i = 0; i < 20; i++) s.renderer.invalidate();
  assert.equal(s.requested, 1); assert.equal(s.frames.size, 1);
  s.flush(123); assert.deepEqual(s.rendered, [123]); assert.equal(s.frames.size, 0);
  s.flush(456); assert.equal(s.requested, 1, 'completed renders never request an idle callback');
  s.renderer.invalidate(); s.flush(789); assert.deepEqual(s.rendered, [123, 789]);
  s.renderer.destroy();
});

test('hidden and page-hidden states cancel pending work, with one fresh frame on foreground', () => {
  const s = scheduler(); s.renderer.invalidate(); s.visibility(true);
  assert.equal(s.cancelled, 1, 'rAF handle zero is cancelled too'); assert.equal(s.frames.size, 0);
  s.renderer.invalidate(); s.flush(5000); assert.deepEqual(s.rendered, []);
  s.visibility(false); s.renderer.invalidate(); assert.equal(s.frames.size, 1);
  s.flush(9000); assert.deepEqual(s.rendered, [9000]); assert.equal(s.frames.size, 0);
  s.renderer.invalidate(); s.winEvents.get('pagehide')();
  s.renderer.invalidate(); assert.equal(s.frames.size, 0);
  s.winEvents.get('pageshow')(); s.flush(12000); assert.deepEqual(s.rendered, [9000, 12000]);
  assert.equal(s.frames.size, 0); s.renderer.destroy();
});

test('inactive or paused owners are checked both on invalidation and immediately before rendering', () => {
  const s = scheduler(); s.renderer.invalidate(); s.active = false; s.flush(1);
  assert.deepEqual(s.rendered, []); assert.equal(s.frames.size, 0);
  s.renderer.invalidate(); assert.equal(s.frames.size, 0);
  s.active = true; s.renderer.invalidate(); s.paused = true; s.renderer.invalidate();
  assert.equal(s.frames.size, 0, 'pause invalidation cancels prior work');
  s.visibility(true); s.visibility(false); assert.equal(s.frames.size, 0);
  s.paused = false; s.renderer.invalidate(); s.paused = true; s.flush(2);
  assert.deepEqual(s.rendered, []);
  s.paused = false; s.renderer.invalidate(); s.flush(3); assert.deepEqual(s.rendered, [3]);
  assert.equal(s.frames.size, 0); s.renderer.destroy();
});

test('destroy cancels queued frames, removes listeners and blocks late callbacks and invalidations', () => {
  const s = scheduler(); s.renderer.invalidate(); const lateCallback = [...s.frames.values()][0];
  s.renderer.destroy(); s.renderer.destroy(); s.renderer.invalidate(); lateCallback(100);
  assert.deepEqual(s.rendered, []); assert.equal(s.frames.size, 0);
  assert.equal(s.requested, 1); assert.equal(s.cancelled, 1);
  assert.equal(s.docEvents.size, 0); assert.equal(s.winEvents.size, 0);
});
