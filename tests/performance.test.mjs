import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceService,initPerformance,getCanvasPixelRatio,setPerformanceMode,PERFORMANCE_STORAGE_KEY} from '../standalone/performance.js';
import {createPaopaoHarness} from './helpers/paopao-harness.mjs';

test('performance defaults to normal, persists all three modes and never exceeds native pixel density',()=>{
  const values=new Map(),changed=[],storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const service=createPerformanceService({storage,onChange:mode=>changed.push(mode)});
  assert.equal(service.mode,'normal');assert.equal(service.pixelRatio(3),2);
  for(const [mode,dpr]of [['eco',1],['normal',2],['game',3]]){
    service.setMode(mode);assert.equal(service.pixelRatio(3),dpr);assert.equal(service.pixelRatio(1),1);
    assert.equal(values.get(PERFORMANCE_STORAGE_KEY),mode);assert.equal(createPerformanceService({storage}).mode,mode);
  }
  assert.deepEqual(changed,['eco','normal','game']);assert.equal(service.pixelRatio(NaN),1);
});
test('invalid preferences and denied storage fail safely without changing clocks',()=>{
  const requestAnimationFrame=()=>{},setInterval=()=>{},events=[];
  const win={devicePixelRatio:4,requestAnimationFrame,setInterval,localStorage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},dispatchEvent:event=>events.push(event)};
  assert.equal(initPerformance(win).mode,'normal');setPerformanceMode('eco',win);assert.equal(getCanvasPixelRatio(win),1);
  assert.equal(win.requestAnimationFrame,requestAnimationFrame);assert.equal(win.setInterval,setInterval);
  assert.equal(events[0].detail.mode,'eco');setPerformanceMode('unexpected',win);assert.equal(initPerformance(win).mode,'normal');
});
test('the actual bubble game allocates 1x, 2x and 3x canvases while simulation state remains identical',()=>{
  const results=[];
  for(const [mode,dpr]of [['eco',1],['normal',2],['game',3]]){
    const host=createPaopaoHarness({mode,devicePixelRatio:3});const canvas=host.canvas();
    assert.equal(canvas.width,Math.floor(parseFloat(canvas.style.width)*dpr));assert.equal(canvas.height,Math.floor(parseFloat(canvas.style.height)*dpr));
    host.frame(1000);host.game.shoot();for(let n=1;n<=10;n++)host.frame(1000+n*1000/60);
    results.push(JSON.parse(JSON.stringify(host.game.snapshot())));host.destroy();
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
test('idle and paused bubbles stop redrawing while pointer changes and complete effects still render',()=>{
  const h=createPaopaoHarness();const initial=h.draws();h.frame(1000);h.frame(1100);assert.equal(h.draws(),initial);
  const event={clientX:180,clientY:440,preventDefault(){}};
  h.canvas().onpointerdown(event);assert.equal(h.draws(),initial+1);
  h.canvas().onpointermove({...event,clientX:200});assert.equal(h.draws(),initial+2);
  h.canvas().onpointercancel();assert.equal(h.draws(),initial+3);
  h.game.fall();h.pause(true);const paused=h.draws();h.frame(1200);h.frame(1500);assert.equal(h.draws(),paused);
  h.pause(false);h.frame(1600);for(let n=1;n<=100;n++)h.frame(1600+n*1000/60);
  assert.equal(h.game.snapshot().falling.length,0);assert.equal(h.game.snapshot().popping.length,0);assert.ok(h.draws()>paused);
  const complete=h.draws();h.frame(4000);h.frame(4100);assert.equal(h.draws(),complete);h.destroy();
});
