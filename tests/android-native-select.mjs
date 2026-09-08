// Shared real-input helpers. No select.value assignment or synthetic change event.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {adb} from './android-driver.mjs';

const localDir='.local/android-native-select';
const remoteXML=`/data/local/tmp/wanba-select-${process.pid}.xml`;
const localXML=`${localDir}/${process.pid}.xml`;
const decode=s=>s.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,(_,hex,dec,name)=>hex?String.fromCodePoint(parseInt(hex,16)):dec?String.fromCodePoint(Number(dec)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name.toLowerCase()]);
const normalize=s=>String(s).replace(/\s+/g,' ').trim();
export function parseNativeNodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(([,source])=>{
    const attrs=Object.fromEntries([...source.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decode(v)]));
    const b=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attrs.bounds||'');
    return {...attrs,rect:b?b.slice(1).map(Number):null};
  });
}
export async function touch(c,selector) {
  await c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Missing/disabled control');el.scrollIntoView({block:'center',inline:'nearest'});return true})()`);
  await c.wait(220);
  const point=await c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Missing/disabled control');const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)throw Error('Invisible control');return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await c.wait(70);
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await c.wait(200); // Allow the real tap/click and resulting navigation to be delivered.
}
export const readSelect=(c,selector)=>c.evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(selector)});return s?{value:s.value,options:[...s.options].map(o=>({value:o.value,text:o.textContent,disabled:o.disabled||o.parentElement?.disabled||false,selected:o.selected}))}:null})()`);
export async function nativeNodes() {
  mkdirSync(localDir,{recursive:true});
  try {
    adb('shell','uiautomator','dump','--compressed',remoteXML);
    const xml=adb('exec-out','cat',remoteXML);
    assert(xml.includes('<hierarchy'),'Native UI dump missing hierarchy');
    writeFileSync(localXML,xml);
    return parseNativeNodes(xml);
  } finally {
    rmSync(localXML,{force:true});
    try {adb('shell','rm','-f',remoteXML);} catch {}
  }
}
async function waitNativeOption(c,text) {
  const wanted=normalize(text),deadline=Date.now()+10000;
  while(Date.now()<deadline) {
    const nodes=await nativeNodes();
    const matches=nodes.filter(n=>normalize(n.text||n['content-desc']||'')===wanted
      && /^(?:io\.github\.jacklee992\.wanba(?:\.compat)?|android)$/.test(n.package||'')
      && /^android\.widget\.(?:CheckedTextView|RadioButton|TextView|Button)$/.test(n.class||'')
      && n.rect&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1]);
    const enabled=matches.filter(n=>n.enabled!=='false');
    if(enabled.length) return enabled.sort((a,b)=>(a.class==='android.widget.CheckedTextView'?-1:0)-(b.class==='android.widget.CheckedTextView'?-1:0))[0];
    if(matches.length)throw Error('Native option is disabled: '+text);
    await c.wait(150);
  }
  throw Error('Native option not found after real select touch: '+text);
}
export async function nativeSelect(c,selector,optionText) {
  const before=await readSelect(c,selector);assert(before,'Missing select '+selector);
  const option=before.options.find(o=>normalize(o.text)===normalize(optionText));assert(option,'Unknown option '+optionText);assert(!option.disabled,'Disabled option '+optionText);
  await touch(c,selector);
  const node=await waitNativeOption(c,optionText),[x1,y1,x2,y2]=node.rect;
  adb('shell','input','tap',String(Math.floor((x1+x2)/2)),String(Math.floor((y1+y2)/2)));
  await c.wait(250); // Single-choice native dialogs confirm immediately.
  return {selector,from:before.value,requestedValue:option.value,nativeText:node.text,nativeBounds:node.rect};
}
export async function nativeSelectValue(c,selector,value) {
  const state=await readSelect(c,selector),option=state?.options.find(o=>o.value===value);
  assert(option,`Missing option ${selector}=${value}`);
  return nativeSelect(c,selector,option.text);
}
export async function cancelNativeSelect(c,selector) {
  const before=await readSelect(c,selector);assert(before);
  await touch(c,selector);
  const option=before.options.find(o=>!o.disabled);assert(option);
  await waitNativeOption(c,option.text); // Prove a native dialog opened before BACK.
  adb('shell','input','keyevent','KEYCODE_BACK');await c.wait(250);
  const after=await readSelect(c,selector);assert.equal(after.value,before.value,'Native cancel changed '+selector);
  return {selector,cancelled:true,value:after.value};
}
