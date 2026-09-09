// Isolated local profile only. All game actions use CDP input; instrumentation
// records actual browser WebGL calls without changing production source/state.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PERFORMANCE_MODES } from '../standalone/performance.js';

const port = Number(process.env.CDP_PORT || 9358);
const url = process.env.ZUMA_URL || 'http://127.0.0.1:8878/standalone/index.html';
const out = process.env.QA_OUT || '.local/qa-shared-engine/runtime';
mkdirSync(out, { recursive: true });
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab = tabs.find(value => value.url.startsWith(new URL(url).origin));
assert.ok(tab, 'task-owned QA page is open');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const pending = new Map(), errors = [], warnings = [], reports = [];
let id = 0;
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) {
    const promise = pending.get(message.id); pending.delete(message.id);
    message.error ? promise.reject(Error(JSON.stringify(message.error))) : promise.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  else if (message.method === 'Log.entryAdded') warnings.push(message.params.entry);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const request = ++id; pending.set(request, { resolve, reject });
  socket.send(JSON.stringify({ id: request, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (expression, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await wait(75); }
  throw Error('Timeout: ' + expression);
};
async function touch(x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await wait(40);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(90);
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  const rect = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await touch(rect.x, rect.y);
}
const state = () => evaluate('wanbaApp.inspect().controller');
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(result.data, 'base64'));
}

const instrument = `(() => {
  const qa = window.__sharedEngineQA = {created:{},deleted:{},draws:0,alphaDraws:0,additiveDraws:0,lastFrameBallImages:0,glErrors:[],renderer:null};
  const tracked = context => context.canvas?.classList.contains('zc-marble-gl');
  for (const kind of ['Shader','Program','Buffer','Texture']) for (const verb of ['create','delete']) {
    const method = verb + kind, original = WebGLRenderingContext.prototype[method];
    WebGLRenderingContext.prototype[method] = function(...args) {
      const result = original.apply(this,args);
      if (tracked(this) && (verb==='delete' ? args[0] : result)) {
        const values = verb==='create' ? qa.created : qa.deleted;
        values[kind]=(values[kind]||0)+1;
      }
      return result;
    };
  }
  const draw = WebGLRenderingContext.prototype.drawArrays;
  WebGLRenderingContext.prototype.drawArrays = function(...args) {
    const result=draw.apply(this,args);
    if (tracked(this)) {
      qa.draws++;
      const destination=this.getParameter(this.BLEND_DST_RGB);
      if(destination===this.ONE)qa.additiveDraws++;else if(destination===this.ONE_MINUS_SRC_ALPHA)qa.alphaDraws++;
      if(!qa.renderer){const debug=this.getExtension('WEBGL_debug_renderer_info');qa.renderer=debug?this.getParameter(debug.UNMASKED_RENDERER_WEBGL):this.getParameter(this.RENDERER);}
      const error=this.getError();if(error!==this.NO_ERROR)qa.glErrors.push(error);
    }
    return result;
  };
  const clear=CanvasRenderingContext2D.prototype.clearRect, image=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('zc-canvas'))qa.lastFrameBallImages=0;return clear.apply(this,args);};
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.classList.contains('zc-canvas')&&args[0] instanceof HTMLCanvasElement)qa.lastFrameBallImages++;return image.apply(this,args);};
})();`;

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: instrument });
  assert.deepEqual(PERFORMANCE_MODES.map(mode => mode.id), ['eco', 'normal', 'game']);
  const modes = process.env.QA_MODES ? PERFORMANCE_MODES.filter(mode => process.env.QA_MODES.split(',').includes(mode.id)) : PERFORMANCE_MODES;
  assert.ok(modes.length > 0, 'at least one recognized performance mode is selected');
  for (const mode of modes) {
    await send('Page.navigate', { url }); await until('!!window.wanbaApp');
    await evaluate(`localStorage.removeItem('wanbanXiaowu_progress_v1');localStorage.setItem('wanba_locale_v1','zh-CN');localStorage.setItem('wanba_performance_v1',${JSON.stringify(mode.id)});`);
    await send('Page.reload'); await wait(350); await until('!!window.wanbaApp');
    await evaluate('wanbaApp.back()'); await click('[data-tab="single"]'); await click('[data-game="zuma"]'); await click('#wb-start-cover-btn');
    await until('wanbaApp.inspect().controller?.view?.assetsReady', 30000);
    await until('wanbaApp.inspect().controller.chain.filter(ball=>ball.s>=0).length>=3');
    const expectedRenderer = mode.id === 'eco' ? 'canvas2d' : 'webgl';
    await until(`wanbaApp.inspect().controller.view.renderer===${JSON.stringify(expectedRenderer)}`);
    const dimensions = await evaluate(`(()=>{const c=document.querySelector('.zc-marble-gl'),r=c.getBoundingClientRect(),board=document.querySelector('.zc-board').getBoundingClientRect();return {mode:document.documentElement.dataset.wanbaPerformance,portalMode:document.querySelector('#wb-zuma-fullscreen').dataset.performance,nativeDpr:devicePixelRatio,width:c.width,height:c.height,cssWidth:board.width,cssHeight:board.height,hidden:c.hidden};})()`);
    assert.equal(dimensions.mode, mode.id); assert.equal(dimensions.portalMode, mode.id);
    assert.equal(dimensions.width, Math.round(dimensions.cssWidth * mode.maxDpr));
    assert.equal(dimensions.height, Math.round(dimensions.cssHeight * mode.maxDpr));
    const before = await state(); await click('#wb-zuma-swap'); const swapped = await state();
    assert.equal(swapped.current, before.next); assert.equal(swapped.next, before.current);
    const aim = await evaluate(`(()=>{const r=document.querySelector('.zc-canvas').getBoundingClientRect();return {x:r.x+r.width*.72,y:r.y+r.height*.19};})()`);
    await touch(aim.x, aim.y); assert.equal((await state()).details.shots, before.details.shots + 1);
    if (mode.id !== 'eco') await until('__sharedEngineQA.additiveDraws>0');
    await screenshot(`${mode.id}-rendered`);
    const gpu = await evaluate('structuredClone(__sharedEngineQA)');
    assert.deepEqual(gpu.glErrors, []);
    if (mode.id === 'eco') assert.equal(gpu.draws, 0);
    else {
      assert.deepEqual(gpu.created, { Shader: 4, Program: 2, Buffer: 2, Texture: 1 });
      assert.ok(gpu.alphaDraws > 0 && gpu.additiveDraws > 0);
    }
    const report = { mode: mode.id, dimensions, renderer: expectedRenderer, gpu, shots: (await state()).details.shots };
    if (mode.id !== 'eco') {
      const lastBallImages = gpu.lastFrameBallImages;
      const supported = await evaluate(`(()=>{const canvas=document.querySelector('.zc-marble-gl'),gl=canvas.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context');if(!extension)return false;canvas.addEventListener('webglcontextlost',event=>{__sharedEngineQA.lossDefaultPrevented=event.defaultPrevented;},{once:true});canvas.addEventListener('webglcontextrestored',()=>{__sharedEngineQA.contextRestored=true;},{once:true});extension.loseContext();return true;})()`);
      assert.equal(supported, true, 'actual context loss extension is available');
      await until(`wanbaApp.inspect().controller.view.renderer==='canvas2d'&&document.querySelector('.zc-marble-gl').hidden`);
      const drawCountAfterLoss = await evaluate('__sharedEngineQA.draws');
      const beforeFallbackInput = await state();
      await click('#wb-zuma-swap'); const fallbackSwapped = await state();
      assert.equal(fallbackSwapped.current, beforeFallbackInput.next);
      assert.equal(fallbackSwapped.next, beforeFallbackInput.current);
      await wait(300); await touch(aim.x, aim.y);
      assert.equal((await state()).details.shots, beforeFallbackInput.details.shots + 1);
      await wait(350); await screenshot(`${mode.id}-context-loss-fallback`);
      const after = await evaluate('structuredClone(__sharedEngineQA)');
      assert.equal(after.lossDefaultPrevented, false, 'permanent fallback does not opt into context restoration');
      assert.notEqual(after.contextRestored, true);
      assert.equal(await evaluate(`document.querySelector('.zc-marble-gl').getContext('webgl').isContextLost()`), true);
      assert.equal(after.draws, drawCountAfterLoss, 'lost GPU receives no more draw calls');
      assert.ok(after.lastFrameBallImages > lastBallImages, 'fallback paints chain marbles onto the visible 2D canvas');
      assert.deepEqual(after.created, gpu.created, 'fallback allocates no replacement GPU objects');
      assert.deepEqual(after.glErrors, []);
      report.contextLoss = { passed: true, renderer: (await state()).view.renderer,
        shotsBefore: beforeFallbackInput.details.shots, shotsAfter: (await state()).details.shots,
        gpuDrawsStoppedAt: after.draws, cachedBallImagesBefore: lastBallImages, cachedBallImagesAfter: after.lastFrameBallImages,
        lossDefaultPrevented: after.lossDefaultPrevented, contextRemainsLost: true };
    }
    reports.push(report);
  }
  assert.deepEqual(errors, []);
  const report = { passed: true, checks: reports, errors, browserLog: warnings,
    limitation: 'Headless desktop Chrome API and rendering verification; no device battery/FPS claim. GPU counters are draw-call counts, not presented frames.' };
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await screenshot('failure');
  const report = { passed: false, checks: reports, error: error.stack, errors, browserLog: warnings };
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n'); console.error(JSON.stringify(report, null, 2)); process.exitCode = 1;
} finally { socket.close(); }
