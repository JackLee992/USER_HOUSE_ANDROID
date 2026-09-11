import test from 'node:test';
import assert from 'node:assert/strict';
import {createZumaEngine,getZumaLevel,createZumaPath,zumaPointAt,zumaTangentAt,sweepCircleHit,LEVELS,ZUMA_LAYOUTS,POWERUP_DURATION,ZUMA_REVERSE_DURATION,ZUMA_INTRO_DURATION} from '../src/games/plugins/zuma/engine.js';

const make=()=>createZumaEngine(null,{random:()=>.37});
function board(engine,balls){engine.state.introTime=null;engine.state.chain=balls.map((ball,i)=>({id:i+1,color:ball[0],s:ball[1],...(ball[2]?{powerup:ball[2],powerupRemaining:POWERUP_DURATION}:{})}));engine.state.nextId=100;engine.state.gaps=[];engine.state.shot=null;engine.state.generating=false;engine.state.coinTimer=100;engine.state.coin=null;engine.state.current=balls[0]?.[0]||0;engine.state.next=engine.state.current;engine.drainEvents();}
function shotAt(engine,index,color){const ball=engine.state.chain[index],p=zumaPointAt(engine.level.path,ball.s),t=zumaTangentAt(engine.level.path,ball.s);engine.state.shot={id:++engine.state.shotSeq,color,x:p.x-t.y*110,y:p.y+t.x*110,vx:t.y*1500,vy:-t.x*1500,gaps:[]};}
function advance(engine,seconds,hz=60){for(let i=0;i<Math.round(seconds*hz);i++)engine.update(1/hz);}
function nearest(path,x,y){return path.points.reduce((a,b)=>Math.hypot(a.x-x,a.y-y)<Math.hypot(b.x-x,b.y-y)?a:b).s;}
function assertClose(a,b,epsilon=1e-7){assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);}

test('six distinct original courses provide usable portrait and landscape lanes',()=>{
  assert.equal(LEVELS.length,6);const shapes=new Set();
  for(const layout of Object.keys(ZUMA_LAYOUTS))for(let i=0;i<6;i++){
    const level=getZumaLevel(i,layout),path=createZumaPath(i,layout);assert.ok(path.length>4000);assert.ok(path.points.length>250);
    assert.deepEqual(zumaPointAt(path,-50),zumaPointAt(path,0));assert.deepEqual(zumaPointAt(path,path.length+500),zumaPointAt(path,path.length));
    for(let n=1;n<path.points.length;n++)assert.ok(path.points[n].s>path.points[n-1].s);
    assert.ok(Math.min(...path.points.map(p=>Math.hypot(p.x-level.frog.x,p.y-level.frog.y)))>level.ballRadius+75);
    for(let a=0;a<path.points.length;a+=4)for(let b=a+30;b<path.points.length;b+=4){
      if(path.points[b].s-path.points[a].s>level.spacing*5)assert.ok(Math.hypot(path.points[a].x-path.points[b].x,path.points[a].y-path.points[b].y)>=level.ballRadius*2+17,`${layout} course ${i}: independent lanes too close`);
    }
    shapes.add(JSON.stringify(path.points));
  }
  assert.equal(shapes.size,12);assert.equal(getZumaLevel(6).titleIndex,0);assert.ok(getZumaLevel(6).speed>getZumaLevel(0).speed);
});

test('fixed-step simulation keeps generation, motion and timers identical across 10–120 Hz',()=>{
  const seed=make().serialize(),reference=createZumaEngine(seed);advance(reference,12,120);
  for(const hz of [10,15,30,60,120]){const engine=createZumaEngine(seed);advance(engine,12,hz);assert.deepEqual(engine.serialize(),reference.serialize(),`${hz} Hz`);}
  const coarse=createZumaEngine(seed);coarse.update(5);coarse.update(5);coarse.update(2);assert.deepEqual(coarse.serialize(),reference.serialize());
});

test('a fixed random seed persists across a serialized continuation including an active shot',()=>{
  const a=createZumaEngine(make().serialize());advance(a,2);a.fire(-Math.PI/2);a.update(.013);
  const saved=a.serialize(),b=createZumaEngine(JSON.parse(JSON.stringify(saved)));assert.deepEqual(b.serialize(),saved);
  for(const dt of [.1,.03,.5,.02,.2,1]){a.update(dt);b.update(dt);}assert.deepEqual(a.serialize(),b.serialize());
  saved.chain[0].color=99;assert.notEqual(a.state.chain[0].color,99,'serialization is a deep snapshot');
});

test('legacy schema1 rebuilds the course and preserves cumulative score and statistics',()=>{
  const engine=createZumaEngine({schema:1,score:12345,chain:[{s:999999,color:5}],tools:{bomb:99},details:{shots:78,cleared:30}},{random:()=>.37});
  assert.equal(engine.state.schema,2);assert.equal(engine.state.score,12345);assert.equal(engine.state.levelIndex,0);assert.equal(engine.state.lives,3);
  assert.equal(engine.state.details.shots,78);assert.equal(engine.state.details.cleared,30);assert.equal(engine.state.chain.length,engine.level.initial);
  assert.ok(engine.state.chain.at(-1).s<engine.level.path.length);assert.equal(engine.state.tools,undefined);
  assert.equal(engine.drainEvents()[0].type,'migrated');
});

test('swept ray collision selects the first actual ball even across different loops',()=>{
  assertClose(sweepCircleHit({x:0,y:0},{x:1000,y:0},{x:100,y:0},10),.09);
  assert.equal(sweepCircleHit({x:0,y:0},{x:1000,y:0},{x:100,y:30},10),null);
  assert.equal(sweepCircleHit({x:100,y:0},{x:100,y:0},{x:100,y:0},10),0);
  for(const speed of [1080,100000]){
    const e=make(),far=nearest(e.level.path,450,150),near=nearest(e.level.path,450,330);
    board(e,[[2,far],[1,near]]);e.state.shot={id:1,color:0,x:450,y:610,vx:0,vy:-speed,gaps:[]};advance(e,.6);
    const insert=e.drainEvents().find(v=>v.type==='insert');assert.equal(insert.targetId,2,'nearest impact is the inner lane');assert.equal(e.state.chain.find(b=>b.id===100).color,0);
  }
});

test('insertion removes only a contacting run of three or more',()=>{
  const e=make();board(e,[[3,900],[0,951],[0,1002],[2,1053]]);shotAt(e,1,0);advance(e,.2);
  const matches=e.drainEvents().filter(v=>v.type==='match');assert.equal(matches.length,1);assert.equal(matches[0].count,3);
  assert.deepEqual(e.state.chain.map(b=>b.color),[3,2]);assert.equal(e.state.score,30);assert.equal(e.state.combo,1);
  const no=make();board(no,[[0,900],[1,951],[0,1104]]);shotAt(no,0,0);advance(no,.2);assert.equal(no.state.details.cleared,0,'separated same colors do not form a match');
});

test('same-color gaps attract the front segment; different colors hold until rear catches up',()=>{
  const same=make();board(same,[[3,900],[1,951],[1,1206],[2,1257]]);same.update(.1);
  assert.ok(same.state.chain[2].s<1206);assert.ok(same.state.chain[1].s>951);
  const different=make();board(different,[[3,900],[1,951],[2,1206],[0,1257]]);different.update(.1);
  assertClose(different.state.chain[2].s,1206);assertClose(different.state.chain[3].s,1257);
  assert.ok(different.state.chain[1].s>951);assert.ok(different.state.chain[2].s-different.state.chain[1].s>different.level.spacing);
  advance(different,6);assertClose(different.state.chain[2].s-different.state.chain[1].s,different.level.spacing);
});

test('one-shot attraction cascades and consecutive successful shots have separate counters',()=>{
  const e=make();board(e,[[2,900],[0,951],[1,1002],[1,1053],[0,1104],[0,1155],[3,1206]]);shotAt(e,2,1);advance(e,1);
  const matches=e.drainEvents().filter(v=>v.type==='match');assert.deepEqual(matches.map(v=>v.depth),[1,2]);assert.equal(e.state.combo,1);
  assert.equal(e.state.details.maxChain,2);assert.equal(e.state.details.maxCombo,1);assert.equal(e.state.score,160);
  const streak=make();
  for(let i=0;i<5;i++){board(streak,[[2,900],[0,951],[0,1002],[3,1053]]);shotAt(streak,1,0);advance(streak,.2);}
  assert.equal(streak.state.combo,5);assert.equal(streak.state.details.maxCombo,5);assert.equal(streak.state.details.maxChain,1);assert.equal(streak.state.score,250);
  board(streak,[[0,900],[1,951],[2,1002]]);shotAt(streak,0,2);advance(streak,.2);assert.equal(streak.state.combo,0);
});

test('all four marked-ball powerups activate only when cleared, and bombs use physical radius',()=>{
  for(const power of ['bomb','slow','reverse','accuracy']){
    const e=make();board(e,[[3,849],[0,900,power],[0,951],[2,1002],[1,1600]]);shotAt(e,1,0);advance(e,.2);
    assert.equal(e.state.details[power+'Used'],1,power);assert.ok(e.drainEvents().some(v=>v.type==='powerup'&&v.kind===power));
    if(power==='bomb')assert.ok(e.state.details.cleared>3);else assert.ok(e.state.effects[power]>0);
    if(power==='slow'){const first=e.state.chain[0].s;e.update(.5);assertClose(e.state.chain[0].s-first,e.level.speed*.36*.5);}
    if(power==='reverse'){const first=e.state.chain[0].s;e.update(.2);assert.ok(e.state.chain[0].s<first);}
    if(power==='accuracy'){e.state.cooldown=0;assert.ok(e.fire(0));assertClose(Math.hypot(e.state.shot.vx,e.state.shot.vy),1500);}
  }
  const no=make();board(no,[[0,900,'bomb'],[1,951],[2,1002]]);shotAt(no,0,2);advance(no,.2);assert.equal(no.state.details.bombUsed,0);
});

test('current and next colors are drawn only from remaining balls and swapping is reversible',()=>{
  const e=make();board(e,[[2,900],[4,951],[2,1002]]);e.state.current=0;e.state.next=1;e.swap();assert.ok([2,4].includes(e.state.current));assert.ok([2,4].includes(e.state.next));
  e.state.current=2;e.state.next=4;assert.equal(e.swap(),true);assert.equal(e.state.current,4);assert.equal(e.state.next,2);e.swap();assert.equal(e.state.current,2);
  assert.equal(e.fire(0),true);assert.ok([2,4].includes(e.state.current));assert.ok([2,4].includes(e.state.next));assert.equal(e.fire(0),false,'only one projectile is active');
});

test('coins require a direct unobstructed hit and preserve a successful-shot streak',()=>{
  const e=make();board(e,[[2,100],[3,151]]);e.state.combo=4;e.state.coin={x:550,y:610,remaining:8};e.state.current=2;e.fire(0);advance(e,.2);
  assert.equal(e.state.coin,null);assert.equal(e.state.score,500);assert.equal(e.state.combo,4);assert.equal(e.state.details.coins,1);
  const blocked=make(),s=nearest(blocked.level.path,450,330);board(blocked,[[2,s]]);blocked.state.coin={x:450,y:200,remaining:8};blocked.fire(-Math.PI/2);advance(blocked,.5);
  assert.equal(blocked.state.details.coins,0);assert.notEqual(blocked.state.coin,null);
});

test('shooting through an actual curved-path gap rewards a later match, not merely crossing air',()=>{
  const e=make(),p=e.level.path;
  board(e,[[0,nearest(p,425,150)],[0,nearest(p,476,150)],[1,nearest(p,350,330)],[2,nearest(p,550,330)]]);
  e.state.shot={id:1,color:0,x:450,y:610,vx:0,vy:-1080,gaps:[]};advance(e,.6);
  const events=e.drainEvents();assert.ok(events.some(v=>v.type==='match'));assert.ok(events.some(v=>v.type==='gap'&&v.bonus>0));assert.equal(e.state.details.gapShots,1);
  const miss=make();board(miss,[[0,nearest(p,425,150)],[0,nearest(p,476,150)],[1,nearest(p,350,330)],[2,nearest(p,550,330)]]);
  miss.state.shot={id:1,color:3,x:450,y:610,vx:0,vy:-1080,gaps:[]};advance(miss,.6);assert.equal(miss.state.details.gapShots,0);
});

test('filling the finite ZUMA meter stops spawning; clearing leftovers completes and advances a level',()=>{
  const e=make();board(e,[[0,900],[0,951],[1,1200]]);e.state.generating=true;e.state.levelScore=e.level.target-20;shotAt(e,0,0);advance(e,.2);
  assert.equal(e.state.generating,false);assert.equal(e.state.status,'playing');const count=e.state.chain.length,generated=e.state.details.totalBallsGenerated;advance(e,2);assert.ok(e.state.chain.length<=count);assert.equal(e.state.details.totalBallsGenerated,generated);
  board(e,[[1,900],[1,951]]);shotAt(e,0,1);advance(e,.2);assert.equal(e.state.status,'levelComplete');assert.equal(e.state.chain.length,0);
  const score=e.state.score,events=e.drainEvents();assert.equal(events.filter(v=>v.type==='levelComplete').length,1);
  e.update(5);assert.equal(e.drainEvents().length,0);assert.equal(e.advanceLevel(),true);assert.equal(e.state.levelIndex,1);assert.equal(e.state.score,score);assert.equal(e.state.levelScore,0);assert.equal(e.state.generating,true);
});

test('a head reaching the hole drains before costing one life; retries preserve score until a new game',()=>{
  const e=make();e.state.score=345;
  for(let lives=2;lives>=0;lives--){board(e,[[1,e.level.path.length-1]]);e.state.status='playing';e.update(.02);assert.equal(e.state.lives,lives+1);assert.equal(e.state.status,'draining');e.update(1.3);assert.equal(e.state.lives,lives);assert.equal(e.state.status,lives?'lifeLost':'gameOver');e.update(5);assert.equal(e.state.lives,lives);if(lives){assert.ok(e.retry());assert.equal(e.state.score,345);}}
  assert.ok(e.retry());assert.equal(e.state.lives,3);assert.equal(e.state.score,0);assert.equal(e.state.levelIndex,0);
});

test('orientation changes preserve lives, score, balls and an active projectile without overlap',()=>{
  const e=createZumaEngine(make().serialize());e.state.score=789;e.state.lives=2;advance(e,5);e.fire(-.8);e.update(.02);
  const before=e.serialize(),colors=before.chain.map(b=>[b.id,b.color]),speed=Math.hypot(before.shot.vx,before.shot.vy);
  assert.equal(e.setLayout('landscape'),true);assert.equal(e.level.width,1280);assert.equal(e.level.height,650);assert.equal(e.state.score,789);assert.equal(e.state.lives,2);assert.deepEqual(e.state.chain.map(b=>[b.id,b.color]),colors);
  for(let i=1;i<e.state.chain.length;i++)assert.ok(e.state.chain[i].s-e.state.chain[i-1].s>=e.level.spacing-1e-7);
  assert.ok(e.state.chain.at(-1).s<e.level.path.length);assertClose(Math.hypot(e.state.shot.vx,e.state.shot.vy),speed);assert.equal(e.state.shot.id,before.shot.id);
  const restore=createZumaEngine(before,{layout:'landscape'});assert.deepEqual(restore.serialize(),e.serialize());
  assert.equal(e.setLayout('portrait'),true);assert.equal(e.state.score,789);assert.equal(e.state.lives,2);assert.equal(e.setLayout('portrait'),false);
});

test('fresh generation includes all powerups without pre-created triple matches',()=>{
  const seen=new Set();let n=123456;
  const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  for(let i=0;i<50;i++){const e=createZumaEngine(null,{random});for(const b of e.state.chain)if(b.powerup)seen.add(b.powerup);for(let j=2;j<e.state.chain.length;j++)assert.ok(!(e.state.chain[j].color===e.state.chain[j-1].color&&e.state.chain[j].color===e.state.chain[j-2].color));}
  assert.deepEqual([...seen].sort(),['accuracy','bomb','reverse','slow']);
});

test('multiple gaps keep independent movement and reverse affects separated heads without overlapping',()=>{
  const e=make();board(e,[[0,600],[1,651],[2,1000],[2,1051],[2,1350],[3,1401]]);
  e.update(.1);assertClose(e.state.chain[2].s,1000);assert.ok(e.state.chain[4].s<1350,'only matching forward seam attracts');
  const before=e.state.chain.map(b=>b.s);e.state.effects.reverse=2;e.update(.2);
  assert.ok(e.state.chain[0].s<before[0]);assert.ok(e.state.chain.at(-1).s<before.at(-1),'reverse powerup also retreats a disconnected head');
  for(let i=1;i<e.state.chain.length;i++)assert.ok(e.state.chain[i].s-e.state.chain[i-1].s>=e.level.spacing-1e-6);
});

test('a dense rotated chain queues beads outside the entrance and survives save/load without deleting them',()=>{
  const e=createZumaEngine(null,{layout:'portrait',random:()=>.37}),head=e.level.path.length-40,count=90;
  board(e,Array.from({length:count},(_,i)=>[i%4,head-(count-1-i)*e.level.spacing]));e.state.score=1234;
  const original=e.state.chain.map(b=>[b.id,b.color]);e.setLayout('landscape');
  assert.ok(e.state.chain[0].s<0);assert.deepEqual(e.state.chain.map(b=>[b.id,b.color]),original);assert.ok(e.state.chain.at(-1).s<e.level.path.length-e.level.ballRadius*.3);
  const saved=e.serialize(),restored=createZumaEngine(saved);assert.deepEqual(restored.serialize(),saved);
  const tail=e.state.chain[0].s;e.update(.02);assert.ok(e.state.chain[0].s>tail&&e.state.chain[0].s<0,'queued tail advances naturally, not teleported');
  assert.equal(e.state.status,'playing');assert.equal(e.state.lives,3);assert.equal(e.state.score,1234);
});

test('saved cascade seams, coin and powerup durations continue identically after restoration',()=>{
  const a=createZumaEngine(make().serialize());board(a,[[2,600],[0,651],[0,951],[0,1002],[3,1053]]);
  a.state.gaps=[{leftId:2,rightId:3,shotId:18,depth:3}];a.state.coin={x:70,y:650,remaining:3};a.state.effects.slow=4;a.state.effects.accuracy=5;
  const b=createZumaEngine(a.serialize());assert.deepEqual(b.serialize(),a.serialize());advance(a,2);advance(b,2);assert.deepEqual(b.serialize(),a.serialize());
  assert.ok(a.drainEvents().some(e=>e.type==='match'&&e.depth===3));
});

test('shot, powerup, gap and coin results remain stable across low and high frame rates',()=>{
  const setup=make(),p=setup.level.path;
  board(setup,[[0,nearest(p,425,150),'slow'],[0,nearest(p,476,150)],[1,nearest(p,350,330)],[2,nearest(p,550,330)]]);
  setup.state.shot={id:1,color:0,x:450,y:610,vx:0,vy:-1080,gaps:[]};const saved=setup.serialize(),reference=createZumaEngine(saved);advance(reference,2,120);
  for(const hz of [10,15,30,60]){const engine=createZumaEngine(saved);advance(engine,2,hz);assert.deepEqual(engine.serialize(),reference.serialize(),`${hz}Hz with gap and powerup`);}
});

test('six-course long mixed-input sessions keep ordered finite state through retries and rotations',()=>{
  for(let course=0;course<6;course++){
    const seed=make().serialize();seed.levelIndex=course;seed.status='lifeLost';const e=createZumaEngine(seed);e.retry();
    for(let step=0;step<1800;step++){
      if(step%137===0)e.setLayout(e.state.layout==='portrait'?'landscape':'portrait');
      if(step%17===0)e.swap();
      if(step%6===0&&e.state.status==='playing'){
        const candidates=e.state.chain.filter(b=>b.s>=0&&b.color===e.state.current),ball=candidates[step%Math.max(1,candidates.length)];
        const p=ball?zumaPointAt(e.level.path,ball.s):{x:e.level.frog.x,y:0};e.fire(Math.atan2(p.y-e.level.frog.y,p.x-e.level.frog.x));
      }
      e.update(.05);
      for(let i=0;i<e.state.chain.length;i++){
        assert.ok(Number.isFinite(e.state.chain[i].s));if(i)assert.ok(e.state.chain[i].s-e.state.chain[i-1].s>=e.level.spacing-1e-6,`course ${course}, step ${step}: overlapping chain`);
      }
      if(e.state.status==='levelComplete')e.advanceLevel();else if(e.state.status==='lifeLost'||e.state.status==='gameOver')e.retry();
      if(step%200===0){const restored=createZumaEngine(e.serialize());assert.deepEqual(restored.serialize(),e.serialize());}
      e.drainEvents();
    }
    assert.ok(e.state.details.shots>0);
  }
});

test('reaching ZUMA retreats for 1.4 seconds without counting a reverse powerup',()=>{
  const e=make();board(e,[[2,900],[3,951]]);e.state.generating=true;e.state.levelScore=e.level.target-500;e.state.coin={x:550,y:610,remaining:8};e.fire(0);
  while(e.state.coin)e.update(1/120);
  assert.equal(e.state.generating,false);assert.equal(e.state.effects.reverse,ZUMA_REVERSE_DURATION);assert.equal(e.state.details.reverseUsed,0);
  const first=e.state.chain[0].s,head=e.state.chain.at(-1).s,generated=e.state.details.totalBallsGenerated;e.update(.2);
  assert.ok(e.state.chain[0].s<first);assert.ok(e.state.chain.at(-1).s<head);assert.equal(e.state.details.totalBallsGenerated,generated);assert.equal(e.state.details.reverseUsed,0);
  const score=e.state.score;e.update(2);assert.equal(e.state.effects.reverse,0);assert.equal(e.state.score,score);assert.equal(e.state.generating,false);
});

test('marked marbles expire after 16 visible seconds without disappearing or changing color',()=>{
  const e=make();board(e,[[0,900,'bomb'],[1,951],[2,1002]]);const original=e.state.chain.map(b=>[b.id,b.color]);advance(e,13.5);
  assert.ok(e.state.chain[0].powerupRemaining<3&&e.state.chain[0].powerupRemaining>2,'renderer can blink in the final three seconds');
  advance(e,2.5);assert.equal(e.state.chain[0].powerup,undefined);assert.equal(e.state.chain[0].powerupRemaining,undefined);
  assert.deepEqual(e.state.chain.map(b=>[b.id,b.color]),original);assert.equal(e.state.score,0);assert.equal(e.state.details.bombUsed,0);assert.equal(e.state.details.cleared,0);
  assert.ok(e.drainEvents().some(v=>v.type==='powerupExpired'&&v.ballId===1));
});

test('an offscreen queued mark does not age, while restored visible countdowns resume exactly',()=>{
  const e=make();board(e,[[0,-500,'slow'],[1,-449],[2,700,'accuracy']]);e.state.effects.slow=4;e.update(.37);
  assert.equal(e.state.chain[0].powerupRemaining,POWERUP_DURATION);assert.ok(e.state.chain[2].powerupRemaining<POWERUP_DURATION);
  const saved=e.serialize(),restored=createZumaEngine(saved);assert.deepEqual(restored.serialize(),saved,'fractional maxSpeed and powerup lifetime preserve exactly');
  e.update(1.5);restored.update(1.5);assert.deepEqual(restored.serialize(),e.serialize());assert.equal(e.state.chain[0].powerupRemaining,POWERUP_DURATION);
  const frozen=e.serialize();e.state.status='lifeLost';const round=e.serialize();e.update(2);assert.deepEqual(e.serialize(),round,'stopped rounds cannot age marks');
  assert.equal(e.state.chain[2].powerupRemaining,frozen.chain[2].powerupRemaining);
});

test('death consumes successive moving marbles before one delayed life-loss event',()=>{
  const e=make(),end=e.level.path.length;board(e,Array.from({length:12},(_,i)=>[i%4,end-1-(11-i)*e.level.spacing]));e.state.generating=true;e.fire(0);
  e.update(1/120);assert.equal(e.state.status,'draining');assert.equal(e.state.lives,3);assert.equal(e.state.chain.length,12);assert.equal(e.state.generating,false);assert.equal(e.state.shot,null);
  assert.equal(e.fire(0),false);assert.equal(e.swap(),false);assert.equal(e.retry(),false);assert.equal(e.advanceLevel(),false);
  const first=e.state.chain[0].s;e.update(.1);assert.ok(e.state.chain[0].s>first);assert.ok(e.state.chain.length>0&&e.state.chain.length<12,'the chain is consumed progressively, not deleted on entry');
  const initialEvents=e.drainEvents();assert.equal(initialEvents.filter(v=>v.type==='drain').length,1);assert.ok(initialEvents.some(v=>v.type==='swallow'));assert.ok(!initialEvents.some(v=>v.type==='lifeLost'));
  e.update(.6);assert.equal(e.state.lives,3,'minimum animation time precedes life deduction');e.update(1.6);
  assert.deepEqual(e.state.chain,[]);assert.equal(e.state.status,'lifeLost');assert.equal(e.state.lives,2);
  const finalEvents=e.drainEvents();assert.equal(finalEvents.filter(v=>v.type==='lifeLost').length,1);e.update(5);assert.equal(e.state.lives,2);assert.deepEqual(e.drainEvents(),[]);
  e.retry();assert.equal(e.state.status,'playing');assert.equal(e.state.drainTime,0);assert.equal(e.state.lives,2);
});

test('a whole-path queued chain accelerates continuously into the hole within 2.2 seconds at all frame rates',()=>{
  const e=make(),end=e.level.path.length;board(e,Array.from({length:120},(_,i)=>[i%4,end-1-(119-i)*e.level.spacing]));e.update(1/120);
  const snapshot=e.serialize();assert.ok(snapshot.chain[0].s<0);assert.ok(snapshot.drainAcceleration>1800);
  const a=createZumaEngine(snapshot),b=createZumaEngine(snapshot);a.update(.2);assert.ok(a.state.chain.length>60,'early stage still has a visibly travelling chain');assert.equal(a.state.lives,3);
  a.update(2.1);advance(b,2.3,120);assert.equal(a.state.chain.length,0);assert.equal(a.state.lives,2);assert.ok(a.state.drainTime<=2.21);assert.deepEqual(a.serialize(),b.serialize());
  for(const hz of [10,15,30,60]){const other=createZumaEngine(snapshot);advance(other,2.4,hz);assert.deepEqual(other.serialize(),b.serialize());}
});

test('draining snapshots resume exactly and rotation does not restart or cancel consumption',()=>{
  const e=make(),end=e.level.path.length;board(e,Array.from({length:85},(_,i)=>[i%4,end-1-(84-i)*e.level.spacing]));e.update(.35);
  assert.equal(e.state.status,'draining');const saved=e.serialize(),restored=createZumaEngine(saved);assert.deepEqual(restored.serialize(),saved);
  e.update(0);assert.deepEqual(e.serialize(),saved,'a paused caller can leave the animation state untouched');
  e.setLayout('landscape');restored.setLayout('landscape');assert.equal(e.state.drainTime,saved.drainTime);assert.equal(e.state.lives,3);assert.deepEqual(e.serialize(),restored.serialize());
  for(const dt of [.02,.33,.2,.9,.8]){e.update(dt);restored.update(dt);}assert.deepEqual(e.serialize(),restored.serialize());assert.equal(e.state.status,'lifeLost');assert.equal(e.state.lives,2);assert.equal(e.state.chain.length,0);
});


test('fresh rounds feed marbles progressively from the entrance then ease to normal speed',()=>{
  for(const layout of ['portrait','landscape']){
    const e=createZumaEngine(null,{layout,random:()=>.37}),ids=e.state.chain.map(b=>b.id);
    assert.equal(e.state.introTime,0);assert.ok(e.state.chain.every(b=>b.s<0));assert.equal(e.fire(0),false);
    e.update(.25);const early=e.state.chain.at(-1).s,visible=e.state.chain.filter(b=>b.s>=0).length;
    assert.ok(visible>0&&visible<e.level.initial);e.update(.25);const fast=e.state.chain.at(-1).s-early;
    e.update(ZUMA_INTRO_DURATION-.75);const late=e.state.chain.at(-1).s;e.update(.25);
    assert.ok(e.state.chain.at(-1).s-late<fast/3,'the visible rush decelerates');
    assert.equal(e.state.introTime,null);assert.deepEqual(e.state.chain.map(b=>b.id),ids);
    assertClose(e.state.chain[0].s,e.level.spacing*.6);const head=e.state.chain.at(-1).s;e.update(.1);
    assertClose(e.state.chain.at(-1).s-head,e.level.speed*.1);assert.equal(e.fire(0),true);
  }
});

test('intro replay and continuation cover retry, next course, pause, rotation and old saves',()=>{
  const e=make();e.update(.613);const saved=e.serialize(),restored=createZumaEngine(saved);
  assert.deepEqual(restored.serialize(),saved);e.update(0);assert.deepEqual(e.serialize(),saved);
  e.setLayout('landscape');restored.setLayout('landscape');assert.equal(e.state.introTime,saved.introTime);
  for(const dt of [.13,.45,.8]){e.update(dt);restored.update(dt);}assert.deepEqual(e.serialize(),restored.serialize());
  e.state.status='lifeLost';assert.equal(e.retry(),true);assert.equal(e.state.introTime,0);assert.ok(e.state.chain.every(b=>b.s<0));
  e.state.status='levelComplete';assert.equal(e.advanceLevel(),true);assert.equal(e.state.introTime,0);assert.equal(e.state.levelIndex,1);
  e.state.status='gameOver';assert.equal(e.retry(),true);assert.equal(e.state.introTime,0);assert.equal(e.state.levelIndex,0);
  const old=restored.serialize();delete old.introTime;const legacy=createZumaEngine(old);assert.equal(legacy.state.introTime,null);
  assert.deepEqual(legacy.state.chain,old.chain,'existing rounds do not replay or teleport');
});
