// Installed Android app regression for Screw Jam 1.1.0.
// CDP only reads state; every game and tool interaction is sent through Android input.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect, adb, screenshot, activity } from './android-driver.mjs';

const out = process.env.QA_OUT || 'docs/evidence/screw-jam-1.1.0/android-emulator';
mkdirSync(out, { recursive:true });
const packageName = activity.split('/')[0], checks = [];
let client, failure = null, inputOffsetY = 0;

function readStatusBarOffset() {
  const windows = adb('shell', 'dumpsys', 'window');
  const match = /type=statusBars frame=\[0,0\]\[\d+,(\d+)\] visible=true/.exec(windows);
  return match ? Number(match[1]) : 0;
}

async function until(fn, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (error) { last = String(error); }
    await client.wait(90);
  }
  throw Error(`Timeout ${label}: ${JSON.stringify(last)}`);
}
async function state() { return client.evaluate('wanbaApp.inspect().controller'); }
async function adbTapPoint(point) {
  const scale = Number(point.dpr) || 1;
  adb('shell', 'input', 'tap', String(Math.round(point.x * scale)), String(Math.round(point.y * scale + inputOffsetY)));
  await client.wait(260);
}
async function adbTap(selector) {
  const point = await client.evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element||element.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});element.scrollIntoView({block:'nearest'});const rect=element.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2,dpr:devicePixelRatio}})()`);
  await adbTapPoint(point);
}
async function clearScrewProgress() {
  await client.evaluate(`(()=>{const key='wanbanXiaowu_progress_v1',all=JSON.parse(localStorage.getItem(key)||'{}');delete all.screw;localStorage.setItem(key,JSON.stringify(all));return true})()`);
}
async function openScrew(continueSaved = false) {
  await client.evaluate('wanbaApp.openShellTab("single")');
  await until(() => client.evaluate('!wanbaApp.inspect().game'), 'catalog');
  const launch = await client.evaluate('wanbaApp.launch("screw","single")');
  assert.equal(launch.ok, true);
  for (let attempt = 0; attempt < 70; attempt += 1) {
    if (await client.evaluate('wanbaApp.inspect().started')) return;
    const selector = await client.evaluate(`(()=>{
      if(document.querySelector('#wb-progress-continue'))return ${JSON.stringify(continueSaved ? '#wb-progress-continue' : '#wb-progress-new')};
      if(document.querySelector('[data-choice="normal"]'))return '[data-choice="normal"]';
      if(document.querySelector('#wb-start-cover-btn'))return '#wb-start-cover-btn';
      return null;
    })()`);
    if (selector) await adbTap(selector);
    await client.wait(100);
  }
  throw Error('Screw Jam did not start');
}
async function safeMovePoint() {
  return client.evaluate(`(async()=>{const model=await import(new URL('../src/games/plugins/screw/model.js',location.href).href);const state=wanbaApp.inspect().controller,active=new Set(state.boxes.map(box=>box.color));const hit=model.reachableScrews(state).filter(item=>item.reachable&&active.has(item.screw.color)).sort((a,b)=>b.panel.z-a.panel.z)[0];if(!hit)return null;const rect=document.querySelector('#wb-screw-canvas').getBoundingClientRect();return{id:hit.screw.id,x:rect.x+hit.point.x/420*rect.width,y:rect.y+hit.point.y/560*rect.height,dpr:devicePixelRatio};})()`);
}
async function playSafeMove() {
  const before = (await state()).moves, point = await safeMovePoint();
  assert.ok(point, 'a safe reachable screw is exposed');
  await adbTapPoint(point);
  await until(async () => (await state()).moves > before, 'screw move');
  return point.id;
}
async function layout() {
  return client.evaluate(`(async()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const canvas=document.querySelector('#wb-screw-canvas'),gamebox=document.querySelector('#wb-gamebox'),module=await import(new URL('../src/games/plugins/screw/index.js',location.href).href);return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},gamebox:rect(gamebox),canvas:rect(canvas),top:rect(document.querySelector('.wb-screw-top')),tools:[...document.querySelectorAll('.wb-screw-tool')].map(rect),boxes:document.querySelectorAll('.wb-screw-box').length,slots:document.querySelectorAll('.wb-screw-slot').length,overflow:document.documentElement.scrollWidth-innerWidth,art:canvas.dataset.screwArt,state:wanbaApp.inspect().controller,codeVersion:module.GAME_VERSION}})()`);
}

try {
  adb('shell', 'am', 'force-stop', packageName);
  adb('shell', 'am', 'start', '-n', activity);
  client = await connect();
  inputOffsetY = readStatusBarOffset();
  await client.evaluate('wanbaApp.setLocale("zh-CN")');
  await clearScrewProgress();
  await client.evaluate('wanbaApp.setPerformance("normal")');
  await openScrew(false);
  await until(async () => (await state())?.render?.idle, 'initial idle');
  const ready = await layout();
  assert.equal(ready.codeVersion, '1.1.0');
  assert.equal(ready.art, 'workshop-v2');
  assert.equal(ready.boxes, 3);
  assert.equal(ready.slots, 5);
  assert.ok(ready.canvas.x >= ready.gamebox.x - 1 && ready.canvas.right <= ready.gamebox.right + 1);
  assert.ok(ready.canvas.y >= ready.gamebox.y - 1 && ready.canvas.bottom <= ready.gamebox.bottom + 1);
  assert.ok(ready.overflow <= 1);
  for (const button of ready.tools) assert.ok(button.width >= 44 && button.height >= 44);
  await client.wait(350);
  screenshot(`${out}/ready.png`);
  checks.push({ check:'installed APK opens Screw Jam 1.1.0 with a fitted mobile board', layout:{ viewport:ready.viewport, gamebox:ready.gamebox, canvas:ready.canvas, top:ready.top, tools:ready.tools } });

  const idleDraws = ready.state.render.drawCount;
  await client.wait(650);
  assert.equal((await state()).render.drawCount, idleDraws);
  await adbTap('#wb-screw-hint');
  await until(async () => (await state()).render.idle, 'hint animation idle', 4000);
  const first = await playSafeMove();
  screenshot(`${out}/screw-flight.png`);
  await adbTap('#wb-pause');
  await until(() => client.evaluate('wanbaApp.inspect().paused'), 'paused');
  const pausedDraws = (await state()).render.drawCount;
  await client.wait(520);
  assert.equal((await state()).render.drawCount, pausedDraws);
  await adbTap('#wb-pause');
  await until(() => client.evaluate('wanbaApp.inspect().started&&!wanbaApp.inspect().paused'), 'resumed', 7000);
  await adbTap('#wb-screw-undo');
  const undone = await state();
  assert.equal(undone.moves, 0);
  assert.equal(undone.liveScrews, 9);
  checks.push({ check:'Android input drives hint, screw, pause, resume, and undo', first, undoRemaining:undone.tools.undo });

  await playSafeMove();
  await playSafeMove();
  await playSafeMove();
  const beforeRestart = await state();
  await client.evaluate('wanbaApp.save();true');
  const storedMoves = await client.evaluate(`JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).screw.moves`);
  assert.equal(storedMoves, beforeRestart.moves);
  // A real background transition gives WebView storage a lifecycle flush before process death.
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await client.wait(900);
  client.close(); client = null;
  adb('shell', 'am', 'force-stop', packageName);
  adb('shell', 'am', 'start', '-n', activity);
  client = await connect();
  inputOffsetY = readStatusBarOffset();
  await openScrew(true);
  const restored = await state();
  assert.equal(restored.moves, beforeRestart.moves);
  assert.equal(restored.liveScrews, beforeRestart.liveScrews);
  assert.deepEqual(restored.boxes, beforeRestart.boxes);
  assert.deepEqual(restored.tray, beforeRestart.tray);
  checks.push({ check:'Android process death restores exact progress', moves:restored.moves, liveScrews:restored.liveScrews });

  while ((await state()).status === 'playing') await playSafeMove();
  await until(() => client.evaluate('!document.querySelector("#wb-screw-result").hidden'), 'result');
  await until(async () => (await state()).render.idle, 'completion idle', 4000);
  const completed = await state();
  assert.equal(completed.status, 'level_complete');
  assert.equal(completed.moves, 9);
  assert.equal(completed.liveScrews, 0);
  screenshot(`${out}/completed.png`);
  await adbTap('#wb-screw-result-primary');
  await until(async () => (await state()).level === 2, 'level 2');
  assert.equal((await state()).liveScrews, 18);
  screenshot(`${out}/level-2.png`);
  checks.push({ check:'nine Android taps complete level 1 and advance to level 2', score:completed.score, stars:completed.levelStars });
  assert.deepEqual(client.errors, []);
  console.log(JSON.stringify({ passed:true, checks }, null, 2));
} catch (error) {
  failure = String(error.stack || error);
  process.exitCode = 1;
  try { screenshot(`${out}/failure.png`); } catch {}
  console.error(failure);
} finally {
  if (client) { await client.evaluate('wanbaApp.save();true').catch(() => {}); client.close(); }
  writeFileSync(`${out}/result.json`, JSON.stringify({ passed:!failure, testedAt:new Date().toISOString(), device:process.env.ADB_SERIAL || 'emulator-5554', input:'Android shell input tap; CDP read-only inspection', checks, error:failure }, null, 2) + '\n');
}
