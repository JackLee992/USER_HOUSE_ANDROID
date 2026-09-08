import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,screenshot} from './android-gecko.mjs';
const out=process.env.QA_OUT||'docs/evidence/android-1.2/compat-phone';mkdirSync(out,{recursive:true});
const c=await connect(),results=[];
try {
 for(let i=0;i<4;i++)await c.evaluate('wanbaApp.back()');
 for(const locale of ['zh-CN','zh-TW','en','ja','ko']) {
  await c.click('[data-tab="settings"]');await c.until('!!document.querySelector("#wanba-language")');
  await c.evaluate(`(()=>{const select=document.querySelector('#wanba-language');select.value=${JSON.stringify(locale)};select.dispatchEvent(new Event('change'))})()`);
  const catalog=await c.evaluate(`(async()=>await (await fetch(new URL('../locales/${locale}.json',location.href))).json())()`);
  await c.until(`document.documentElement.lang===${JSON.stringify(locale)}`);
  await c.click('[data-tab="single"]');await c.wait(400);
  const home=await c.evaluate('({title:document.title,nav:[...document.querySelectorAll("[data-tab]")].map(e=>e.innerText),first:document.querySelector("[data-game=tetris]").innerText,width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');
  assert.equal(home.title,catalog.brand);assert.ok(home.nav.some(label=>label.includes(catalog.strings['单人游戏'])));assert.ok(home.first.includes(catalog.games.tetris.title));assert.ok(home.scrollWidth<=home.width+1);
  screenshot(`${out}/locale-${locale}-home.png`);
  await c.click('[data-tab="settings"]');await c.wait(400);
  const settings=await c.evaluate('({locale:document.querySelector("#wanba-language").value,text:document.querySelector("#wb-body").innerText,width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');
  assert.equal(settings.locale,locale);assert.ok(settings.text.includes(catalog.strings['界面语言']));assert.ok(settings.text.includes('1.2.0'));assert.ok(settings.scrollWidth<=settings.width+1);
  screenshot(`${out}/locale-${locale}-settings.png`);
  results.push({locale,brand:home.title,navigation:home.nav,firstGame:home.first,settingsLanguage:settings.locale,noOverflow:true});console.log('PASS locale '+locale);
 }
 console.log('Five actual language packs and both mobile pages passed.');
} catch(error){screenshot(`${out}/locale-failure.png`);console.error(error);process.exitCode=1;}
finally {
 await c.click('[data-tab="settings"]').catch(()=>{});
 await c.evaluate('(()=>{const select=document.querySelector("#wanba-language");if(select){select.value="zh-CN";select.dispatchEvent(new Event("change"));}})()').catch(()=>{});
 await c.until('document.documentElement.lang==="zh-CN"').catch(()=>{});
 await c.click('[data-tab="single"]').catch(()=>{});
 writeFileSync(`${out}/locales-regression.json`,JSON.stringify({passed:process.exitCode!==1,results,restoredLocale:'zh-CN'},null,2));await c.close();
}
