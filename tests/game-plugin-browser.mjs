// Integration smoke against a dedicated disposable Chrome profile and local static server.
// node tests/game-plugin-browser.mjs [CDP port] [local origin]
// QA_LOCALE=en QA_CAPTURE_LOCALE=1 QA_OUT=.local/qa-i18n-coverage node tests/game-plugin-browser.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const port=Number(process.argv[2]||9348), origin=process.argv[3]||'http://127.0.0.1:8768';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Local development origin required');
const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));
if(!tab)throw Error('No isolated local development page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),errors=[],requests=[],results=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async expression=>{for(let i=0;i<250;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const locale=process.env.QA_LOCALE||'zh-CN';
if(!['zh-CN','zh-TW','en','ja','ko'].includes(locale))throw Error('Unsupported test locale');
const out=process.env.QA_OUT||'.local/qa-game-modules';mkdirSync(out,{recursive:true});
try {
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:412,height:820,deviceScaleFactor:2.625,mobile:true});
  const initial=Date.now()+'-'+Math.random();await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__wanbaQaGeneration=${JSON.stringify(initial)}`});
  await send('Page.navigate',{url:origin+'/standalone/index.html'});await until(`window.__wanbaQaGeneration===${JSON.stringify(initial)}&&!!window.wanbaApp`);
  await evaluate(`localStorage.clear();localStorage.setItem('wanba_locale_v1',${JSON.stringify(locale)})`);
  const generation=String(Date.now());await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__wanbaQaGeneration=${JSON.stringify(generation)}`});
  await send('Page.reload');await until(`window.__wanbaQaGeneration===${JSON.stringify(generation)}&&!!window.wanbaApp`);
  const games=await evaluate('wanbaApp.inspect().games');assert.equal(games.length,37);
  for (const game of games) {
    await click(`[data-tab="${game.mode}"]`);await click(`[data-game="${game.id}"]`);await wait(140);
    for(let n=0;n<20;n++) {
      const state=await evaluate('({started:wanbaApp.inspect().started,first:!!document.querySelector("[data-first]"),choice:!!document.querySelector("[data-choice]"),progress:!!document.querySelector("#wb-progress-continue"),cover:!!document.querySelector("#wb-start-cover-btn")})');
      if(state.started)break;
      if(state.first)await click('[data-first="user"]');else if(state.choice)await click('[data-choice]');else if(state.progress)await click('#wb-progress-continue');else if(state.cover)await click('#wb-start-cover-btn');else throw Error(game.id+' cannot start');
      await wait(160);
    }
    assert.equal(await evaluate('wanbaApp.inspect().started'),true,game.id);
    if(game.id==='pinball')await until('document.querySelector(".wb-cadet-frame")?.contentWindow?.cadetHost?.snapshot()?.ready');
    if(game.id==='wordguess')await until('!!document.querySelector("#wb-word-input")');
    await wait(250);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,game.id+' layout');
    await evaluate('wanbaApp.pause();wanbaApp.save()');assert.equal(await evaluate('wanbaApp.inspect().paused'),true,game.id+' pause');
    const result={id:game.id,started:true,paused:true};
    if(process.env.QA_CAPTURE_LOCALE==='1')result.untranslated=await evaluate(`(()=>{const root=document.querySelector('#wb-gamebox'),walker=document.createTreeWalker(root,4),out=[];let node;while(node=walker.nextNode()){const text=node.nodeValue.trim();if(/[\u3400-\u9fff]/.test(text)&&text.length>1&&!node.parentElement.closest('script,style,#wb-word-clues,#wb-word-history'))out.push(text);}return [...new Set(out)].slice(0,30);})()`);
    results.push(result);
    await evaluate('wanbaApp.back()');await wait(100);console.log('PASS '+game.id);
  }
  // The alternate board factory and its private helper closure are in the same independent package.
  await click('[data-tab="double"]');await click('[data-game="gomoku"]');await wait(160);
  if(await evaluate('!!document.querySelector("#wb-progress-continue")'))await click('#wb-progress-new');
  for(let n=0;n<20;n++) {
    const step=await evaluate('({started:wanbaApp.inspect().started,first:!!document.querySelector("[data-first]"),choice:!!document.querySelector("[data-choice=\\"endless\\"]"),cover:!!document.querySelector("#wb-start-cover-btn")})');
    if(step.started)break;
    if(step.first)await click('[data-first="user"]');else if(step.choice)await click('[data-choice="endless"]');else if(step.cover)await click('#wb-start-cover-btn');
    await wait(150);
  }
  await until('wanbaApp.inspect().started');await wait(200);assert.equal(await evaluate('!!document.querySelector(".wb-gomoku-endless-panel")'),true);await evaluate('wanbaApp.pause();wanbaApp.back()');
  results.push({id:'gomoku:endless',started:true,paused:true});
  assert.equal(new Set(requests.filter(u=>/\/src\/games\/plugins\/[^/]+\/index\.js$/.test(u))).size,37);
  assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(origin+'/')).length,0);
  console.log('37 module entries + endless Gomoku opened, paused, and saved without external requests or runtime errors.');
} catch(error) {
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/failure.png',Buffer.from(shot.data,'base64'));
  console.error(error);process.exitCode=1;
} finally {writeFileSync(out+'/result.json',JSON.stringify({passed:process.exitCode!==1,results,errors,requests},null,2));socket.close();}
