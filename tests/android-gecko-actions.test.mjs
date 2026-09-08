import test from 'node:test';
import assert from 'node:assert/strict';
import {touchActions} from './android-gecko.mjs';

test('Gecko multi-touch begins contacts in separate ticks and holds both until ReleaseActions',()=>{
 const actions=touchActions('touchStart',[{id:7,x:66.1,y:675.2},{id:8,x:294.1,y:675.2}]);
 assert.deepEqual(actions.map(a=>a.id),['finger7','finger8']);
 assert.deepEqual(actions.map(a=>a.actions.map(step=>step.type)),[
  ['pointerMove','pointerDown','pause'],['pointerMove','pause','pointerDown'],
 ]);
 assert.ok(actions.every(a=>a.parameters.pointerType==='touch'));
 assert.ok(actions.every(a=>!a.actions.some(step=>step.type==='pointerUp')));
 assert.equal(actions[1].actions[0].x,294);
});
test('Gecko single touch and moves retain a stable source without adding duplicate presses',()=>{
 assert.deepEqual(touchActions('touchStart',[{x:1,y:2}])[0].actions.map(a=>a.type),['pointerMove','pointerDown']);
 assert.deepEqual(touchActions('touchMove',[{id:7,x:1,y:2}])[0].actions.map(a=>a.type),['pointerMove']);
 assert.equal(touchActions('touchMove',[{id:7,x:1,y:2}])[0].id,'finger7');
});
