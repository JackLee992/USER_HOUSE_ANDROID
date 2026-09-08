// Only run against the disposable local Chrome QA profile, never a personal browser.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:8768',port=Number(process.argv[2]||9348),out='.local/qa-wordguess-1.0.1';
const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab=tabs.find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin+'/')));
if(!tab)throw Error('No isolated local page');
const socket=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map(),errors=[],results={};
socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async expression=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await wait(100);}throw Error('Timeout '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const readSave=()=>evaluate(`wanbaApp.save();JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).wordguess`);
const readFields=()=>evaluate(`Object.fromEntries([...document.querySelectorAll('[data-word-stat]')].map(item=>[item.dataset.wordStat,{label:item.children[0].textContent,value:item.children[1].textContent,preserved:item.children[1].hasAttribute('data-i18n-skip')}]))`);
async function navigate(){
  const mark=Date.now()+'-'+Math.random();
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__wanbaWordQA=${JSON.stringify(mark)}`});
  await send('Page.navigate',{url:origin+'/standalone/index.html'});
  await until(`window.__wanbaWordQA===${JSON.stringify(mark)}&&!!window.wanbaApp`);
}
async function startWordGuess(){
  await click('[data-tab="double"]');await click('[data-game="wordguess"]');
  for(let n=0;n<25;n++){
    if(await evaluate('!!document.querySelector("#wb-word-input")'))break;
    const selector=await evaluate(`document.querySelector('#wb-progress-continue')?'#wb-progress-continue':document.querySelector('#wb-start-cover-btn')?'#wb-start-cover-btn':null`);
    if(selector)await click(selector);await wait(200);
  }
  await until('!!document.querySelector("#wb-word-input")&&wanbaApp.inspect().started');
  await wait(100);
}
mkdirSync(out,{recursive:true});
try{
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:412,height:820,deviceScaleFactor:2,mobile:true});
  await navigate();
  await evaluate(`wanbaApp.pause();wanbaApp.back();localStorage.clear();localStorage.setItem('wanba_locale_v1','en')`);
  await navigate();await until('document.documentElement.lang==="en"');
  const version=await evaluate(`(await import('../src/games/plugins/wordguess/index.js')).GAME_VERSION`);
  assert.equal(version,'1.0.1');results.version=version;
  await startWordGuess();
  const initial=await readSave(),fields=await readFields();
  assert.equal(fields.clues.label,'Hint');assert.equal(fields.score.label,'Score');
  assert.equal(fields.question.label,'当前题');assert.equal(fields.question.value,'1/5');
  assert.equal(fields.category.value,initial.rounds[0].type);assert.equal(fields.category.preserved,true);
  assert.equal(fields.length.value,String(initial.rounds[0].length));
  assert.equal(await evaluate('document.querySelector("#wb-word-clues").textContent'),'1. '+initial.rounds[0].clues[0]);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  assert.equal(await evaluate(`document.querySelector('#wb-word-meta').textContent.includes(${JSON.stringify(initial.roundWord)})`),false);
  results.initial={fields,puzzles:initial.rounds,saveKeys:Object.keys(initial).sort()};
  writeFileSync(out+'/english-game-1.0.1.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('#wb-word-next');const nextClue=await readSave();assert.deepEqual(nextClue.rounds,initial.rounds);assert.equal(nextClue.clueIndex,1);
  await evaluate(`document.querySelector('#wb-word-input').value=${JSON.stringify(initial.roundWord)}`);await click('#wb-word-submit');
  const correct=await readSave();assert.equal(correct.userWins,1);assert.equal(correct.completed,1);assert.deepEqual(correct.rounds,initial.rounds);
  await click('#wb-word-go-next');const next=await readSave();assert.equal(next.roundWord,initial.rounds[1].word);assert.deepEqual(next.rounds,initial.rounds.slice(1));
  assert.equal((await readFields()).question.value,'2/5');results.gameplay={nextClue:true,exactAnswer:true,score:correct.userWins,nextOriginalPuzzle:true};
  await evaluate('wanbaApp.pause();wanbaApp.save()');const saved=await readSave();
  await navigate();await startWordGuess();const resumed=await readSave();
  for(const key of ['rounds','roundWord','clueIndex','guesses','userWins','taWins','completed','revealed','firstClueWin','finalLineSpoken','details'])assert.deepEqual(resumed[key],saved[key],key+' preserved on actual page reload');
  results.resumed={samePuzzleAndAnswer:true,sameGameSaveFields:true,fields:await readFields()};
  writeFileSync(out+'/english-resume-1.0.1.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.deepEqual(errors,[]);console.log('PASS wordguess 1.0.1: English labels, unchanged Chinese puzzles, exact-answer scoring, original next puzzle, reload and layout.');
}catch(error){console.error(error);writeFileSync(out+'/failure.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));process.exitCode=1;}
finally{writeFileSync(out+'/browser-result.json',JSON.stringify({passed:process.exitCode!==1,results,errors},null,2));socket.close();}
