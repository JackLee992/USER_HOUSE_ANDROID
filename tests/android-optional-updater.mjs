// Emulator-only candidate integration. Does not install or publish an APK.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {adb,connect,screenshot} from './android-cdp.mjs';
import {nativeNodes,touch} from './android-native-select.mjs';
const enabled=process.env.UPDATER_ENABLED==='1',mode=enabled?'enabled':'disabled';
const out='docs/evidence/app-updater/emulator-'+mode,priv='.local/qa-app-updater/emulator-'+mode;
mkdirSync(out,{recursive:true});mkdirSync(priv,{recursive:true});
const keys=['settings','scores','progress','records','sudokuState'].map(k=>'wanbanXiaowu_'+k+'_v1');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const result={passed:false,mode,scope:'Subsequent source candidate APK; not the published 1.2.1 artifact. No signed update channel or OS APK installation claimed.',testedAt:new Date().toISOString()};let c;
try {
  adb('shell','am','start','-n','io.github.jacklee992.wanba/.MainActivity');c=await connect();
  for(let i=0;i<4&&await c.evaluate('!!wanbaApp.inspect().game');i++){adb('shell','input','keyevent','4');await c.wait(200)}
  const info=await c.evaluate('JSON.parse(NativeBridge.getAppInfo())');
  assert.equal(info.appUpdaterEnabled,enabled);assert.equal(info.gameUpdatesEnabled,enabled);assert.equal(info.nativeSelfUpdateEnabled,enabled);result.nativeInfo=info;
  await touch(c,'[data-tab=single]');await c.wait(250);
  assert.equal(await c.evaluate('!!document.querySelector("#wanba-game-updates")'),enabled);
  result.contentState=await c.evaluate('JSON.parse(NativeBridge.getContentState())');
  if(!enabled){
    assert(!/\/assets\/updates\//.test(await c.evaluate('location.href')));
    for(const expression of ['NativeBridge.checkGameUpdates()','NativeBridge.downloadGameUpdate("0".repeat(64))','NativeBridge.activateGameUpdate("0".repeat(64),"{}")','NativeBridge.rollbackGameUpdate()']){
      const response=await c.evaluate(`JSON.parse(${expression})`);assert.equal(response.code,'GAME_UPDATES_DISABLED');
    }
    result.disabledCallsRejected=true;
  }
  await touch(c,'[data-tab=settings]');await c.wait(250);
  assert.equal(await c.evaluate('!!document.querySelector("#wanba-app-update")'),enabled);
  assert.equal(await c.evaluate('!!document.querySelector("#wanba-downloads")'),enabled);
  const saved=await c.evaluate(`Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`);writeFileSync(priv+'/before.json',JSON.stringify(saved,null,2));
  if(enabled){
    await touch(c,'#wanba-app-update');await c.wait(300);
    let nodes=await nativeNodes();assert(nodes.some(n=>/^检查 app 更新$/i.test(n.text)),'Optional native Activity really opened');
    screenshot(out+'/native-entry.png');
    const tap=n=>{assert(n);const[x,y,r,b]=n.rect;adb('shell','input','tap',String((x+r)>>1),String((y+b)>>1));};
    tap(nodes.find(n=>/^检查 app 更新$/i.test(n.text)));
    await sleep(150);nodes=await nativeNodes();
    const cancel=nodes.find(n=>n.text==='取消下载'&&n.enabled==='true');if(cancel)tap(cancel);
    for(let i=0;i<20;i++){nodes=await nativeNodes();if(nodes.some(n=>/^检查 app 更新$/i.test(n.text)&&n.enabled==='true'))break;await sleep(250)}
    assert(nodes.some(n=>/^检查 app 更新$/i.test(n.text)&&n.enabled==='true'),'Network failure or cancellation unlocks UI');
    result.nativeOutcome=nodes.filter(n=>n.text&&n.class==='android.widget.TextView').map(n=>n.text);
    screenshot(out+'/cancel-or-unpublished-channel.png');
    tap(nodes.find(n=>n.text==='返回'));await c.wait(350);
    const after=await c.evaluate(`Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`);assert.deepEqual(after,saved,'Optional updater did not change game data');
    result.gameStorageUntouched=true;
  } else {
    await c.evaluate('NativeBridge.openAppUpdater(); NativeBridge.openDownloads(); true');await c.wait(300);
    assert.equal(await c.evaluate('JSON.parse(NativeBridge.getAppInfo()).appUpdaterEnabled'),false);
    result.disabledNativeEntriesStayedInGameHost=true;
  }
  result.storage=keys.map(k=>({key:k,sha256:createHash('sha256').update(saved[k]??'null').digest('hex')}));
  await c.evaluate('document.querySelector("#wanba-version")?.closest("section")?.scrollIntoView({block:"center"});true');screenshot(out+'/about.png');
  assert.deepEqual(c.errors,[]);result.noObservedJsExceptions=true;result.passed=true;
} catch(error){result.error=String(error);process.exitCode=1;try{screenshot(priv+'/failure.png')}catch{}console.error(error)}
finally{if(c)c.close();writeFileSync(out+'/report.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,mode,error:result.error,nativeOutcome:result.nativeOutcome}));}
