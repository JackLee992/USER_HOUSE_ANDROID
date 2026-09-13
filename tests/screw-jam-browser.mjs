// Mobile integration regression against an isolated local Chrome profile.
// All gameplay and tool actions use real CDP touch input.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const port = Number(process.env.CDP_PORT || 9357);
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:8877';
const out = process.env.QA_OUT || '.local/qa-screw-jam-1.2.0/browser';
mkdirSync(out, { recursive:true });

const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab = tabs.find(item => item.type === 'page' && (item.url === 'about:blank' || item.url.startsWith(origin + '/')));
if (!tab) throw Error('Isolated local tab unavailable');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

let id = 0;
const pending = new Map(), errors = [], checks = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data), waiter = pending.get(message.id);
  if (waiter) {
    pending.delete(message.id);
    message.error ? waiter.reject(Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const callId = ++id;
  const timer = setTimeout(() => { pending.delete(callId); reject(Error('CDP timeout: ' + method)); }, 15000);
  pending.set(callId, {
    resolve:value => { clearTimeout(timer); resolve(value); },
    reject:error => { clearTimeout(timer); reject(error); },
  });
  socket.send(JSON.stringify({ id:callId, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(expression, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(70);
  }
  throw Error('Timeout: ' + expression);
}
async function touchPoint(x, y) {
  await send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x, y, radiusX:6, radiusY:6 }] });
  await wait(42);
  await send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await wait(75);
}
async function touch(selector) {
  const point = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing '+${JSON.stringify(selector)});element.scrollIntoView({block:'nearest'});const rect=element.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`);
  await touchPoint(point.x, point.y);
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format:'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(shot.data, 'base64'));
}
async function navigate() {
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await send('Page.navigate', { url:origin + '/standalone/index.html?qa=' + marker });
  await until(`location.search===${JSON.stringify('?qa=' + marker)}&&!!window.wanbaApp`);
}
async function clearScrewProgress() {
  await evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',all=JSON.parse(localStorage.getItem(key)||'{}');delete all.screw;localStorage.setItem(key,JSON.stringify(all));return true})()`);
}
async function openScrew({ choice = 'normal', continueSaved = false } = {}) {
  await touch('[data-tab="single"]');
  await touch('[data-game="screw"]');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate('wanbaApp.inspect().started')) return;
    const next = await evaluate(`(()=>{
      if(document.querySelector('#wb-progress-continue'))return ${JSON.stringify(continueSaved ? '#wb-progress-continue' : '#wb-progress-new')};
      if(document.querySelector('[data-choice=${choice}]'))return '[data-choice=${choice}]';
      if(document.querySelector('#wb-start-cover-btn'))return '#wb-start-cover-btn';
      return null;
    })()`);
    if (next) await touch(next);
    await wait(120);
  }
  throw Error('Screw Jam did not start');
}
async function layout() {
  return evaluate(`(()=>{const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const canvas=document.querySelector('#wb-screw-canvas'),box=document.querySelector('#wb-gamebox'),panel=document.querySelector('.wb-screw-panel'),top=document.querySelector('.wb-screw-top');return{viewport:{width:innerWidth,height:innerHeight},canvas:rect(canvas),gamebox:rect(box),panel:rect(panel),top:rect(top),raw:{width:canvas.width,height:canvas.height},art:canvas.dataset.screwArt,mode:canvas.dataset.renderMode,boxes:document.querySelectorAll('.wb-screw-box').length,slots:document.querySelectorAll('.wb-screw-slot').length,tools:[...document.querySelectorAll('.wb-screw-tool')].map(rect),overflow:document.documentElement.scrollWidth-innerWidth,state:wanbaApp.inspect().controller}})()`);
}
async function safeMovePoint() {
  return evaluate(`(async()=>{const model=await import('/src/games/plugins/screw/model.js');const state=wanbaApp.inspect().controller,active=new Set(state.boxes.map(box=>box.color)),hits=model.reachableScrews(state).filter(item=>item.reachable).sort((a,b)=>b.panel.z-a.panel.z),hit=hits.find(item=>active.has(item.screw.color))||hits[0];if(!hit)return null;const rect=document.querySelector('#wb-screw-canvas').getBoundingClientRect();return{id:hit.screw.id,x:rect.x+hit.point.x/420*rect.width,y:rect.y+hit.point.y/560*rect.height};})()`);
}
async function playSafeMove() {
  const before = await evaluate('wanbaApp.inspect().controller.moves');
  const move = await safeMovePoint();
  assert.ok(move, 'a safe reachable screw is exposed');
  await touchPoint(move.x, move.y);
  await until(`wanbaApp.inspect().controller.moves>${before}`);
  return move;
}

try {
  console.log('PHASE connect');
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled:true });
  await send('Emulation.setTouchEmulationEnabled', { enabled:true });
  await send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:3, mobile:true });
  await navigate();
  await evaluate(`wanbaApp.back();localStorage.clear();localStorage.setItem('wanba_locale_v1','zh-CN');localStorage.setItem('wanbanXiaowu_settings_v1',JSON.stringify({companion:false}));true`);

  for (const mode of ['eco', 'game']) {
    console.log('PHASE render-' + mode);
    await evaluate(`localStorage.setItem('wanba_performance_v1',${JSON.stringify(mode)})`);
    await clearScrewProgress();
    await navigate();
    await openScrew();
    await until('wanbaApp.inspect().controller?.render?.idle');
    const current = await layout(), ratio = mode === 'eco' ? 1 : 3;
    assert.equal(current.state.render.pixelRatio, ratio);
    assert.equal(current.raw.width, 420 * ratio);
    assert.equal(current.raw.height, 560 * ratio);
    assert.equal(current.art, 'atelier-v3');
    assert.equal(current.boxes, 3);
    assert.equal(current.slots, 5);
    assert.ok(current.canvas.x >= current.gamebox.x - 1 && current.canvas.right <= current.gamebox.right + 1);
    assert.ok(current.canvas.y >= current.gamebox.y - 1 && current.canvas.bottom <= current.gamebox.bottom + 1);
    assert.ok(current.overflow <= 1);
    for (const button of current.tools) assert.ok(button.width >= 44 && button.height >= 44, 'tool touch target is at least 44 CSS px');
    checks.push({
      check:`${mode} render profile and mobile layout`,
      layout:{ viewport:current.viewport, canvas:current.canvas, gamebox:current.gamebox, panel:current.panel,
        top:current.top, raw:current.raw, art:current.art, mode:current.mode, boxes:current.boxes,
        slots:current.slots, tools:current.tools, overflow:current.overflow, render:current.state.render },
    });
    await evaluate('wanbaApp.pause();wanbaApp.back();true');
  }

  await evaluate(`localStorage.setItem('wanba_performance_v1','normal')`);
  console.log('PHASE gameplay-normal');
  await clearScrewProgress();
  await navigate();
  await openScrew();
  await until('wanbaApp.inspect().controller?.render?.idle');
  const initial = await layout();
  assert.equal(initial.state.level, 1);
  assert.equal(initial.state.render.pixelRatio, 2);
  await screenshot('level-1-ready');

  const idleDrawCount = initial.state.render.drawCount;
  await wait(650);
  assert.equal((await layout()).state.render.drawCount, idleDrawCount, 'idle board stops requesting frames');

  const hintBefore = initial.state.tools.hint;
  await touch('#wb-screw-hint');
  assert.equal((await layout()).state.tools.hint, hintBefore - 1);
  await until('wanbaApp.inspect().controller.render.idle', 4000);
  checks.push({ check:'hint uses a real touch and animation returns to idle' });

  const first = await playSafeMove();
  console.log('PHASE pause-undo');
  const moving = await layout();
  assert.equal(moving.state.moves, 1);
  assert.equal(moving.state.liveScrews, 8);
  await evaluate('wanbaApp.pause()');
  const pausedDraws = (await layout()).state.render.drawCount;
  await wait(520);
  assert.equal((await layout()).state.render.drawCount, pausedDraws, 'pause freezes an in-flight screw');
  await touch('#wb-pause');
  await until('wanbaApp.inspect().started&&!wanbaApp.inspect().paused', 7000);
  await until('wanbaApp.inspect().controller.render.idle', 4000);
  await touch('#wb-screw-undo');
  const undone = await layout();
  assert.equal(undone.state.moves, 0);
  assert.equal(undone.state.liveScrews, 9);
  assert.equal(undone.state.tools.undo, 2);
  checks.push({ check:'pause freezes active animation and undo restores the move', touched:first.id });

  await playSafeMove();
  await playSafeMove();
  await playSafeMove();
  console.log('PHASE cold-restore');
  const beforeColdRestore = (await layout()).state;
  await evaluate('wanbaApp.save();wanbaApp.back();true');
  await navigate();
  await openScrew({ continueSaved:true });
  const restored = (await layout()).state;
  assert.equal(restored.moves, beforeColdRestore.moves);
  assert.equal(restored.liveScrews, beforeColdRestore.liveScrews);
  assert.deepEqual(restored.boxes, beforeColdRestore.boxes);
  assert.deepEqual(restored.tray, beforeColdRestore.tray);
  checks.push({ check:'cold page navigation restores the exact level state', moves:restored.moves });

  while ((await layout()).state.status === 'playing') await playSafeMove();
  console.log('PHASE completed');
  await until('!document.querySelector("#wb-screw-result").hidden');
  await until('wanbaApp.inspect().controller.render.idle', 4000);
  const completed = await layout();
  assert.equal(completed.state.status, 'level_complete');
  assert.equal(completed.state.liveScrews, 0);
  assert.equal(completed.state.panels.every(panel => panel.gone), true);
  assert.equal(completed.state.moves, 9);
  assert.match(await evaluate('document.querySelector("#wb-screw-result-stars").textContent'), /^★{1,3}☆{0,2}$/);
  await screenshot('level-1-complete');
  checks.push({
    check:'level 1 completes through nine real touch moves',
    state:{ level:completed.state.level, status:completed.state.status, moves:completed.state.moves,
      score:completed.state.score, campaignStars:completed.state.campaignStars,
      liveScrews:completed.state.liveScrews, details:completed.state.details, render:completed.state.render },
  });

  await touch('#wb-screw-result-primary');
  await until('wanbaApp.inspect().controller.level===2&&wanbaApp.inspect().controller.status==="playing"');
  const secondLevel = (await layout()).state;
  assert.equal(secondLevel.liveScrews, 18);
  assert.equal(secondLevel.boxes.length, 3);
  await screenshot('level-2-ready');
  checks.push({ check:'result action advances to the larger second level', level:secondLevel.level, liveScrews:secondLevel.liveScrews });

  console.log('PHASE gameplay-endless');
  await evaluate('wanbaApp.pause();wanbaApp.back();true');
  await clearScrewProgress();
  await navigate();
  await openScrew({ choice:'endless' });
  await until('wanbaApp.inspect().controller?.render?.idle');
  let endless = (await layout()).state;
  assert.equal(endless.mode, 'endless');
  assert.equal(endless.details.endlessLayers, 1);
  assert.equal(endless.status, 'playing');
  for (let move = 0; move < 40 && endless.details.endlessLayers < 2; move += 1) {
    await playSafeMove();
    endless = (await layout()).state;
  }
  assert.equal(endless.details.endlessLayers, 2);
  assert.equal(endless.status, 'playing');
  assert.ok(endless.liveScrews >= 50, 'new layer arrives before the board clears');
  assert.equal(await evaluate('document.querySelector("#wb-screw-result").hidden'), true);
  assert.match(await evaluate('document.querySelector("#wb-screw-progress-text").textContent'), /已收纳 .*盒 · 持续补充/);
  await screenshot('endless-continuous-layer-2');
  const boxesBefore = endless.boxes.length;
  await touch('#wb-screw-extra');
  endless = (await layout()).state;
  assert.equal(boxesBefore, 3);
  assert.equal(endless.boxCapacity, 4);
  assert.equal(endless.boxes.length, 4);
  assert.equal(await evaluate('document.querySelector("#wb-screw-extra-label").textContent'), '加盒');
  await screenshot('endless-add-box');
  checks.push({ check:'endless mode adds a new layer without a level result and expands from three to four collection boxes',
    state:{ layers:endless.details.endlessLayers, status:endless.status, boxes:endless.boxes.length, capacity:endless.boxCapacity,
      liveScrews:endless.liveScrews, boxesCompleted:endless.details.boxesCompleted } });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed:true, checks, errors }, null, 2));
} catch (error) {
  process.exitCode = 1;
  checks.push({ error:error.stack });
  await screenshot('failure');
  console.error(error);
} finally {
  writeFileSync(`${out}/result.json`, JSON.stringify({ passed:process.exitCode !== 1, checks, errors }, null, 2) + '\n');
  socket.close();
}
