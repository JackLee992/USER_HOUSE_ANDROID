import test from 'node:test';
import assert from 'node:assert/strict';
import {zumaSkullIntroPose} from '../src/games/plugins/zuma/intro-motion.js';

const settled={x:0,y:0,scale:1,rotation:0,shadow:1,opacity:1,impact:0,shakeX:0,shakeY:0};

test('null, nonfinite and completed timelines return a stable skull pose',()=>{
  for(const t of [null,undefined,NaN,Infinity,-Infinity,'1',1.8,10])assert.deepEqual(zumaSkullIntroPose(t),settled);
  assert.deepEqual(zumaSkullIntroPose(-1),zumaSkullIntroPose(0));
});

test('skull flies from above, completes one rotation and shrinks before landing',()=>{
  const start=zumaSkullIntroPose(0),near=zumaSkullIntroPose(1.05-1e-8);
  assert.equal(start.y,-13);assert.equal(start.x,-3);assert.equal(start.scale,1.8);assert.equal(start.rotation,-Math.PI*2);
  assert.ok(near.y>-1e-5&&near.y<=0);assert.ok(Math.abs(near.rotation)<1e-7);assert.ok(Math.abs(near.scale-1)<1e-7);
  let previous=start;
  for(let i=1;i<=100;i++){
    const pose=zumaSkullIntroPose(i/100*1.049);
    assert.ok(pose.y>previous.y);assert.ok(pose.x>previous.x);assert.ok(pose.scale<previous.scale);assert.ok(pose.rotation>previous.rotation);
    assert.equal(pose.impact,0);previous=pose;
  }
});

test('landing triggers bounded impact and bounce, then settles without lingering shake',()=>{
  const contact=zumaSkullIntroPose(1.05),bounce=zumaSkullIntroPose(1.15),end=zumaSkullIntroPose(1.6);
  assert.equal(contact.y,0);assert.equal(contact.impact,1);assert.ok(contact.scale<1);assert.ok(bounce.y<0);assert.ok(bounce.impact<1);
  assert.deepEqual(end,settled);
  for(let t=0;t<1.8;t+=1/240){
    const pose=zumaSkullIntroPose(t);
    assert.ok(Object.values(pose).every(Number.isFinite));assert.ok(Math.abs(pose.shakeX)<=.09);assert.ok(Math.abs(pose.shakeY)<=.13);
    assert.ok(pose.impact>=0&&pose.impact<=1);assert.ok(pose.shadow>=0&&pose.shadow<=1);
  }
});

test('reduced motion keeps only a short small translation and fade',()=>{
  const start=zumaSkullIntroPose(0,{reducedMotion:true});assert.equal(start.y,-.35);assert.equal(start.opacity,.65);
  for(let t=0;t<1.8;t+=.01){
    const pose=zumaSkullIntroPose(t,{reducedMotion:true});
    assert.equal(pose.rotation,0);assert.equal(pose.shakeX,0);assert.equal(pose.shakeY,0);assert.equal(pose.impact,0);assert.equal(pose.scale,1);
    assert.ok(pose.y>=-.35&&pose.y<=0);assert.ok(pose.opacity>=.65&&pose.opacity<=1);
  }
  assert.deepEqual(zumaSkullIntroPose(.45,{reducedMotion:true}),settled);
});

test('pose is deterministic for resumed time and returned objects are isolated',()=>{
  const pose=zumaSkullIntroPose(.73),snapshot={...pose};pose.y=999;
  assert.deepEqual(zumaSkullIntroPose(.73),snapshot);
  const a=zumaSkullIntroPose(null);a.scale=99;assert.deepEqual(zumaSkullIntroPose(null),settled);
});
