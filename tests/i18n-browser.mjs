// Run only with the dedicated temporary Chrome QA profile and local static server.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:8768',port=Number(process.argv[2]||9348);
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));if(!tab)throw Error('No isolated local page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),errors=[],results=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const until=async expression=>{for(let n=0;n<160;n++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const markNextDocument=async()=>{const value=Date.now()+'-'+Math.random();await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__wanbaI18nQa=${JSON.stringify(value)}`});return value;};
const out='.local/qa-i18n';mkdirSync(out,{recursive:true});
try {
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:360,height:760,deviceScaleFactor:2,mobile:true});
  const initial=await markNextDocument();await send('Page.navigate',{url:origin+'/standalone/index.html'});await until(`window.__wanbaI18nQa===${JSON.stringify(initial)}&&!!window.wanbaApp`);
  await evaluate('wanbaApp.pause();wanbaApp.back();window.i18nQA=await import("./i18n.js")');
  for(const locale of ['zh-CN','zh-TW','en','ja','ko']){
    await click('[data-tab="settings"]');await until('!!document.querySelector("#wanba-language")');
    await evaluate(`(()=>{const select=document.querySelector('#wanba-language');select.value=${JSON.stringify(locale)};select.dispatchEvent(new Event('change'));})()`);
    await until(`document.documentElement.lang===${JSON.stringify(locale)}&&!document.querySelector('#wanba-language').disabled`);
    const catalog=await evaluate(`await (await fetch('../locales/${locale}.json')).json()`);
    assert.equal(await evaluate('document.title'),catalog.brand);assert.equal(await evaluate('localStorage.getItem("wanba_locale_v1")'),locale);
    assert.equal(await evaluate('document.querySelector("#wb-export-data").textContent'),catalog.strings['导出备份']);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,locale+' settings width');
    await click('[data-tab="single"]');await wait(80);
    assert.equal(await evaluate('document.querySelector("[data-game=freecell] .wb-game-name").textContent'),catalog.games.freecell.title);
    assert.equal(await evaluate('document.querySelector("#wanba-check-games").textContent'),catalog.strings['检查更新']);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,locale+' catalog width');
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+locale+'-catalog.png',Buffer.from(shot.data,'base64'));
    await click('[data-game="freecell"]');await click('#wb-game-rules');await wait(80);
    assert.equal(await evaluate('document.querySelector("[data-i18n-rules]").textContent'),catalog.games.freecell.rules);
    assert.equal(await evaluate('document.querySelector("#wb-rules-close").textContent'),catalog.strings['关闭']);
    await click('#wb-rules-close');await evaluate('wanbaApp.back()');
    results.push({locale,title:catalog.brand,catalog:true,settings:true,rules:true,width:360});console.log('PASS '+locale);
  }
  const reloaded=await markNextDocument();await send('Page.reload');await until(`window.__wanbaI18nQa===${JSON.stringify(reloaded)}&&!!window.wanbaApp&&document.documentElement.lang==="ko"`);
  assert.equal(await evaluate('document.title'),'눅케이드');
  await evaluate('(()=>{const input=document.createElement("textarea");input.id="qa-user-input";input.value="开始游戏 <img src=x onerror=alert(1)>";document.body.append(input);const pre=document.createElement("pre");pre.id="qa-license";pre.textContent="开始游戏";document.body.append(pre);})()');
  await evaluate('i18nQA=await import("./i18n.js");await i18nQA.setLocale("en")');await wait(80);
  assert.equal(await evaluate('document.querySelector("#qa-user-input").value'),'开始游戏 <img src=x onerror=alert(1)>');assert.equal(await evaluate('document.querySelector("#qa-license").textContent'),'开始游戏');
  assert.equal(await evaluate('document.querySelector("#qa-user-input img")'),null);
  await evaluate('document.querySelector("#qa-user-input").remove();document.querySelector("#qa-license").remove();await i18nQA.setLocale("zh-CN")');
  assert.deepEqual(errors,[]);console.log('All five languages switch, persist, localize actual UI, preserve excluded content, and fit 360 CSS pixels.');
}catch(error){console.error(error);const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/failure.png',Buffer.from(shot.data,'base64'));process.exitCode=1;}
finally{writeFileSync(out+'/result.json',JSON.stringify({passed:process.exitCode!==1,results,errors},null,2));socket.close();}
