import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createMarbleGL} from '../src/games/plugins/zuma/marble-gl.js';

// A WebGL API recorder, not a shader/rasterizer simulator. Visual output and
// driver performance are separately checked in the browser/device evidence.
function gpu({failCompile=0,failLink=0}={}) {
  const live=new Set(),uploads=[],draws=[],listeners=new Map(),created={shader:0,program:0,buffer:0,texture:0};
  let buffer=null,program=null,compileCount=0,linkCount=0,blend=null,clears=0,fallbacks=0;
  const make=kind=>{const object={kind,id:++created[kind]};live.add(object);return object;};
  const remove=object=>live.delete(object);
  const gl={
    VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,FLOAT:6,
    DYNAMIC_DRAW:7,TRIANGLES:8,ONE:9,ONE_MINUS_SRC_ALPHA:10,TEXTURE_2D:11,TEXTURE_MIN_FILTER:12,
    TEXTURE_MAG_FILTER:13,TEXTURE_WRAP_S:14,TEXTURE_WRAP_T:15,LINEAR:16,CLAMP_TO_EDGE:17,
    BLEND:18,COLOR_BUFFER_BIT:19,UNPACK_PREMULTIPLY_ALPHA_WEBGL:20,RGBA:21,UNSIGNED_BYTE:22,TEXTURE0:23,NO_ERROR:0,
    createShader:()=>make('shader'),shaderSource(){},compileShader(s){s.ok=++compileCount!==failCompile;},
    getShaderParameter:s=>s.ok,deleteShader:remove,
    createProgram:()=>make('program'),attachShader(){},linkProgram(p){p.ok=++linkCount!==failLink;},
    getProgramParameter:p=>p.ok,deleteProgram:remove,
    createBuffer:()=>make('buffer'),deleteBuffer:remove,bindBuffer(_target,value){buffer=value;},
    bufferData(_target,data){assert.ok(buffer);uploads.push({buffer,data:Array.from(data)});},
    createTexture:()=>make('texture'),deleteTexture:remove,activeTexture(){},bindTexture(){},texParameteri(){},
    enable(){},clearColor(){},getUniformLocation(p,name){
      assert.ok(live.has(p)&&p.ok,'uniform lookup must not use a failed or deleted program');return {p,name};
    },pixelStorei(){},texImage2D(){},getError:()=>0,
    viewport(){},clear(){clears++;},useProgram(value){program=value;},uniform2f(){},uniform1f(){},uniform1i(){},
    getAttribLocation:(_p,name)=>({aPosition:0,aLocal:1,aRect:2,aColor:2,aSpin:3,aParams:3}[name]),
    enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(){},
    blendFunc(...value){blend=value;},drawArrays(_mode,first,count){draws.push({program,buffer,first,count,blend});},
    getExtension:()=>({loseContext(){live.clear();}}),
  };
  const canvas={width:600,height:900,hidden:true,
    getContext:()=>gl,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),
  };
  const renderer=createMarbleGL(canvas,()=>fallbacks++);
  return {renderer,canvas,gl,live,uploads,draws,listeners,created,get clears(){return clears;},get fallbacks(){return fallbacks;}};
}

const ball={x:40,y:50,r:10,rect:[32,64,128,128],spin:1.25};
const effect={x:80,y:90,r:15,kind:1,alpha:.6,color:[1,.4,.2],stretch:2,angle:Math.PI/2,phase:.25};

test('actual GL renderer batches spheres and additive effects with finite geometry',()=>{
  const g=gpu();assert.equal(g.renderer.ready,false);g.renderer.setAtlas({width:1024,height:1024});
  assert.equal(g.renderer.ready,true);assert.equal(g.canvas.hidden,false);
  assert.equal(g.renderer.draw([ball],900,1100,4,1024,1024,[effect]),true);
  assert.deepEqual(g.draws.map(d=>[d.first,d.count]),[[0,6],[0,6]]);
  assert.deepEqual(g.draws.map(d=>d.blend),[[g.gl.ONE,g.gl.ONE_MINUS_SRC_ALPHA],[g.gl.ONE,g.gl.ONE]]);
  assert.equal(g.uploads[0].data.length,54);assert.equal(g.uploads[1].data.length,60);
  assert.ok(g.uploads.every(u=>u.data.every(Number.isFinite)));
  const sphere=g.uploads[0].data;
  assert.equal(sphere[0],ball.x-ball.r);assert.equal(sphere[1],ball.y-ball.r);
  assert.deepEqual(sphere.slice(4,9),[32/1024,64/1024,128/1024,128/1024,ball.spin]);
  const fx=g.uploads[1].data;assert.equal(fx[0],95);assert.equal(fx[1],60);
  assert.equal(fx[8],effect.kind);assert.equal(fx[9],effect.phase);
  assert.equal(g.clears,1);g.renderer.destroy();assert.equal(g.live.size,0);
});

test('large batches reuse GPU objects and a later effect-free frame clears old effects',()=>{
  const g=gpu();g.renderer.setAtlas({});
  const balls=Array.from({length:260},(_,i)=>({...ball,x:i*2})),effects=Array.from({length:300},()=>effect);
  g.renderer.draw(balls,900,1100,0,1024,1024,effects);
  assert.deepEqual(g.draws.map(d=>d.count),[1560,1800]);
  assert.deepEqual(g.uploads.map(u=>u.data.length),[260*54,300*60]);
  const created={...g.created};g.renderer.draw([ball],900,1100,1,1024,1024,[]);
  assert.deepEqual(g.created,created,'no per-frame textures, programs or GPU buffers');
  assert.equal(g.draws.length,3);assert.equal(g.clears,2);assert.equal(g.draws[2].count,6);
  g.renderer.destroy();assert.equal(g.live.size,0);assert.equal(g.listeners.size,0);
});

test('context loss hides the GPU layer, notifies the host and stops subsequent GL drawing',()=>{
  const g=gpu();g.renderer.setAtlas({});let prevented=false;
  g.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});
  assert.equal(prevented,false,'permanent fallback does not permit context restoration');assert.equal(g.fallbacks,1);assert.equal(g.canvas.hidden,true);assert.equal(g.renderer.ready,false);
  g.renderer.setAtlas({});assert.equal(g.renderer.draw([ball],900,1100,1,1024,1024,[effect]),false);
  assert.equal(g.draws.length,0);g.renderer.destroy();assert.equal(g.listeners.size,0);
});

test('partial shader or program failures fall back and release every successfully allocated object',()=>{
  for(const fault of [{failCompile:2},{failCompile:4},{failLink:1},{failLink:2}]){
    const g=gpu(fault);assert.equal(g.fallbacks,1);assert.equal(g.canvas.hidden,true);assert.equal(g.renderer.ready,false);
    assert.equal(g.renderer.draw([ball],900,1100,0,1024,1024),false);
    g.renderer.destroy();assert.equal(g.live.size,0,JSON.stringify(fault));assert.equal(g.listeners.size,0);
  }
});

const view=readFileSync(new URL('../src/games/plugins/zuma/view.js',import.meta.url),'utf8');
function functionBefore(name,next){
  const start=view.indexOf(`  function ${name}(`),end=view.indexOf(`  function ${next}(`,start);
  assert.ok(start>=0&&end>start,`view function ${name} is present`);return view.slice(start,end);
}
function frameHarness(paused=false){
  const queued=[{type:'shot'},{type:'swallow'},{type:'match',balls:[{x:100,y:120,color:0}],gained:30,depth:1}];
  const updates=[],state={status:'draining',score:42,chain:[{s:100,color:0}]};
  const context=vm.createContext({
    destroyed:false,env:{isActive:()=>true,isPaused:()=>paused},doc:{hidden:false},localPause:false,
    lastTime:1000,elapsed:0,engine:{state,level:{ballRadius:26},update:dt=>updates.push(dt),drainEvents:()=>queued.splice(0)},
    mouthLoad:0,fireKick:0,swallowPulse:0,waves:[],bursts:[],particles:[],floats:[],dirty:false,dialogKind:'pause',
    toastUntil:0,lastSave:2000,raf:0,gl:null,glDisabled:false,
    win:{performance:{now:()=>0},requestAnimationFrame:()=>1},
    eco:false,COLORS:['#ff0000'],RGB:[[1,0,0]],text:{},sound(){},toast(){},updateUI(){},draw(){},save(){},destroy(){},dialog(){},
  });
  vm.runInContext(functionBefore('processEvents','resize')+functionBefore('frame','destroy'),context);
  return {context,updates,state};
}

test('a long frame still advances full engine time but newly created feedback survives its first draw',()=>{
  const {context:c,updates}=frameHarness();c.frame(1500);
  assert.deepEqual(updates,[.5]);assert.ok(c.mouthLoad>0,'new frog loading is visible');
  assert.ok(c.fireKick>0,'new recoil is visible');assert.ok(c.swallowPulse>0,'new swallow is visible');
  assert.equal(c.bursts.length,1);assert.equal(c.particles.length,6);assert.equal(c.waves.length,1);
});

test('paused drawing freezes the engine, view feedback and saveable state',()=>{
  const {context:c,updates,state}=frameHarness(true);c.mouthLoad=.25;c.swallowPulse=.12;
  c.waves=[{life:.4}];c.particles=[{x:1,y:2,vx:9,vy:10,life:.3}];
  const saved=JSON.stringify(state),particles=JSON.stringify(c.particles);c.frame(6000);
  assert.deepEqual(updates,[]);assert.equal(c.mouthLoad,.25);assert.equal(c.swallowPulse,.12);
  assert.equal(c.waves[0].life,.4);assert.equal(JSON.stringify(c.particles),particles);assert.equal(JSON.stringify(state),saved);
});

test('the dangerous end hole remains visible when artwork cannot be decoded',()=>{
  let marks=0;
  const ctx=new Proxy({}, {get(_target,name){
    return (..._args)=>{if(['fill','stroke','fillText','drawImage'].includes(name))marks++;};
  },set:()=>true});
  const c=vm.createContext({ctx,art:null,images:{},swallowPulse:0,
    engine:{state:{status:'playing',drainTime:0},level:{ballRadius:26,path:{length:4000}}},
    zumaPointAt:()=>({x:400,y:800}),
  });
  vm.runInContext(functionBefore('drawSkull','drawFrog'),c);c.drawSkull();
  assert.ok(marks>0,'offline fallback must still paint the end hole');
});
