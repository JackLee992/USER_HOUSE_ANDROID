// Original six-course marble engine. Coordinates and state are independent of DOM/rendering.
export const ZUMA_WIDTH = 900;
export const ZUMA_HEIGHT = 1100;
export const BALL_RADIUS = 26;
export const BALL_SPACING = 51;
export const COLORS = ['#ef5b5b', '#f7b84b', '#50b96b', '#4b8ee8', '#9a69df', '#f06fb2'];
export const ZUMA_LAYOUTS = Object.freeze({
  portrait: Object.freeze({ width:900, height:1100, ballRadius:26, spacing:51 }),
  landscape: Object.freeze({ width:1280, height:650, ballRadius:29, spacing:57 }),
});
export const POWERUPS = ['bomb', 'slow', 'reverse', 'accuracy'];
// Original tuning values, not claims about the exact timing of the commercial game.
export const POWERUP_DURATION = 16;
export const ZUMA_REVERSE_DURATION = 1.4;
export const DRAIN_MIN_DURATION = 1.25;
export const DRAIN_TARGET_DURATION = 2.2;
const STEP = 1 / 120;
const EPS = .08;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const integer = (n, fallback=0) => Math.max(0, Math.floor(finite(n, fallback)));
const copy = value => JSON.parse(JSON.stringify(value));
const layoutName = value => value === 'landscape' ? 'landscape' : 'portrait';

// Wide, non-crossing lanes leave a clear central aiming area in both orientations.
export const LEVELS = [
  { target:1200, colors:4, speed:38, initial:25, corners:[[-30,150],[790,150],[815,985],[85,985],[85,330],[635,330],[665,825],[250,825],[250,510],[380,430]] },
  { target:1450, colors:4, speed:41, initial:27, corners:[[930,180],[100,180],[85,960],[800,1000],[820,355],[280,330],[240,820],[645,830],[650,505],[520,425]] },
  { target:1650, colors:5, speed:43, initial:28, corners:[[90,-35],[90,965],[800,965],[800,150],[270,150],[270,325],[645,325],[645,795],[260,795],[240,500]] },
  { target:1800, colors:5, speed:45, initial:29, corners:[[940,210],[110,210],[85,985],[820,985],[820,405],[655,380],[660,790],[260,790],[240,385],[475,350]] },
  { target:2000, colors:5, speed:47, initial:30, corners:[[-35,190],[670,145],[835,385],[815,845],[650,1000],[185,990],[70,750],[95,430],[265,305],[615,330],[670,775],[300,840],[240,535]] },
  { target:2250, colors:6, speed:49, initial:31, corners:[[935,980],[100,980],[100,160],[800,160],[800,800],[650,820],[650,345],[280,345],[235,790],[425,865]] },
].map((level, titleIndex) => Object.freeze({ ...level, titleIndex }));

function roundedPath(corners, layout) {
  const shape=ZUMA_LAYOUTS[layout], sx=shape.width/900, sy=shape.height/1100;
  const source=corners.map(([x,y])=>({x,y})), points=[];
  const add=p=>{const q={x:p.x*sx,y:p.y*sy,s:0},last=points.at(-1);if(last){const d=Math.hypot(q.x-last.x,q.y-last.y);if(d<.001)return;q.s=last.s+d;}points.push(q);};
  const line=(a,b)=>{const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/7));for(let i=1;i<=steps;i++)add({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps});};
  add(source[0]);let previous=source[0];
  for(let i=1;i<source.length-1;i++){
    const a=source[i-1],b=source[i],c=source[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(76,ab*.3,bc*.3);
    const entry={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},exit={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};
    line(previous,entry);
    for(let n=1;n<=20;n++){const t=n/20,u=1-t;add({x:u*u*entry.x+2*u*t*b.x+t*t*exit.x,y:u*u*entry.y+2*u*t*b.y+t*t*exit.y});}
    previous=exit;
  }
  line(previous,source.at(-1));return {points,length:points.at(-1).s};
}
const paths=new Map();
export function createZumaPath(index=0, layout='portrait') {
  const course=integer(index)%LEVELS.length,key=layoutName(layout)+':'+course;
  if(!paths.has(key)){
    const corners=LEVELS[course].corners.map(point=>point.slice());
    // A wider marble in the short landscape map needs room around the final inward bend.
    if(layoutName(layout)==='landscape'){
      if(course===0)corners[corners.length-1]=[380,470];
      if(course===1)corners[corners.length-1]=[520,480];
      if(course===5)corners[corners.length-1]=[425,840];
    }
    paths.set(key,roundedPath(corners,layoutName(layout)));
  }
  return paths.get(key);
}
export function zumaPointAt(path,distance) {
  const s=clamp(finite(distance),0,path.length);let lo=0,hi=path.points.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(path.points[mid].s<s)lo=mid+1;else hi=mid;}
  const a=path.points[Math.max(0,lo-1)],b=path.points[lo],t=(s-a.s)/(b.s-a.s||1);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
export function zumaTangentAt(path,s) {
  const a=zumaPointAt(path,s-1),b=zumaPointAt(path,s+1),d=Math.hypot(b.x-a.x,b.y-a.y)||1;
  return {x:(b.x-a.x)/d,y:(b.y-a.y)/d};
}
export function getZumaLevel(index=0,layout='portrait') {
  index=integer(index);layout=layoutName(layout);const base=LEVELS[index%LEVELS.length],cycle=Math.floor(index/LEVELS.length),shape=ZUMA_LAYOUTS[layout];
  return {...base,...shape,layout,path:createZumaPath(index,layout),frog:{x:shape.width*.5,y:610*shape.height/1100},
    colors:Math.min(6,base.colors+cycle),target:Math.min(6000,base.target+cycle*500),speed:Math.min(82,base.speed+cycle*7)};
}
// Earliest intersection parameter, including an initial overlap; never a nearest-path projection.
export function sweepCircleHit(a,b,center,radius) {
  const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-center.x,oy=a.y-center.y,c=ox*ox+oy*oy-radius*radius;
  if(c<=0)return 0;const aa=dx*dx+dy*dy;if(aa<1e-12)return null;
  const bb=2*(ox*dx+oy*dy),disc=bb*bb-4*aa*c;if(disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;
}
function segmentCross(a,b,c,d) {
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-9)return null;
  const qx=c.x-a.x,qy=c.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  return t>1e-8&&t<=1&&u>=0&&u<=1?t:null;
}

export function createZumaEngine(saved,options={}) {
  let level,events=[];
  const valid=saved?.schema===2;
  const state={schema:2,layout:layoutName(valid?saved.layout:(options.layout||saved?.layout)),levelIndex:valid?integer(saved.levelIndex):0,
    lives:valid?clamp(integer(saved.lives,3),0,99):3,score:integer(saved?.score),levelScore:valid?integer(saved.levelScore):0,
    status:valid&&['playing','draining','levelComplete','lifeLost','gameOver'].includes(saved.status)?saved.status:'playing',
    generating:valid?saved.generating!==false:true,chain:[],gaps:[],shot:null,current:0,next:0,aim:finite(saved?.aim,-Math.PI/2),
    combo:valid?integer(saved.combo):0,chainDepth:valid?integer(saved.chainDepth):0,shotSeq:valid?integer(saved.shotSeq):0,nextId:valid?Math.max(1,integer(saved.nextId,1)):1,
    effects:{slow:0,reverse:0,accuracy:0},elapsed:valid?Math.max(0,finite(saved.elapsed)):0,accumulator:valid?clamp(finite(saved.accumulator),0,STEP):0,
    cooldown:valid?Math.max(0,finite(saved.cooldown)):0,coin:null,coinTimer:valid?Math.max(0,finite(saved.coinTimer,6)):6,dangerActive:valid&&saved.dangerActive===true,
    drainTime:valid?Math.max(0,finite(saved.drainTime)):0,drainAcceleration:valid?Math.max(1800,finite(saved.drainAcceleration,1800)):1800,
    coinsCollected:valid?integer(saved.coinsCollected):0,rng:valid?integer(saved.rng)||1:options.random?1:Math.floor(Math.random()*4294967295)||1,
    details:{shots:0,misses:0,cleared:0,maxCombo:0,maxChain:0,totalBallsGenerated:0,coins:0,gapShots:0,bombUsed:0,slowUsed:0,reverseUsed:0,accuracyUsed:0,levelsCompleted:0,maxSpeed:0,dangerCount:0,clearAllCount:0},
  };
  const emit=(type,data={})=>events.push({type,...data});
  function random(){if(options.random)return clamp(finite(options.random(),.5),0,.999999999);let n=state.rng|0;n^=n<<13;n^=n>>>17;n^=n<<5;state.rng=n>>>0;return state.rng/4294967296;}
  function pick(values){return values[Math.floor(random()*values.length)];}
  function activeColors(){const colors=[...new Set(state.chain.map(b=>b.color))];return colors.length?colors:Array.from({length:level.colors},(_,i)=>i);}
  function refreshColors(){const colors=activeColors();if(!colors.includes(state.current))state.current=pick(colors);if(!colors.includes(state.next))state.next=pick(colors);}
  function makeBall(s,previous=[]){let color=Math.floor(random()*level.colors);if(previous.length>=2&&previous[0].color===color&&previous[1].color===color)color=(color+1+Math.floor(random()*(level.colors-1)))%level.colors;
    const ball={id:state.nextId++,color,s};if(random()<.11){ball.powerup=pick(POWERUPS);ball.powerupRemaining=POWERUP_DURATION;}state.details.totalBallsGenerated++;return ball;}
  function resetBoard(){
    level=getZumaLevel(state.levelIndex,state.layout);state.chain=[];state.gaps=[];state.shot=null;state.levelScore=0;state.generating=true;state.status='playing';state.combo=0;state.chainDepth=0;
    state.effects={slow:0,reverse:0,accuracy:0};state.elapsed=0;state.accumulator=0;state.cooldown=0;state.coin=null;state.coinTimer=6;state.coinsCollected=0;state.dangerActive=false;state.drainTime=0;state.drainAcceleration=1800;
    for(let i=0;i<level.initial;i++)state.chain.push(makeBall(level.spacing*.6+i*level.spacing,state.chain.slice(-2)));
    state.current=pick(activeColors());state.next=pick(activeColors());
  }
  level=getZumaLevel(state.levelIndex,state.layout);
  for(const key of Object.keys(state.details))state.details[key]=key==='maxSpeed'?Math.max(0,finite(saved?.details?.[key])):integer(saved?.details?.[key]);
  if(valid){
    const ids=new Set();
    for(const original of (Array.isArray(saved.chain)?saved.chain:[]).slice(0,240)){
      const id=integer(original.id,state.nextId);if(ids.has(id))continue;ids.add(id);state.nextId=Math.max(state.nextId,id+1);
      const ball={id,color:clamp(integer(original.color),0,level.colors-1),s:clamp(finite(original.s),-240*level.spacing,level.path.length+level.spacing)};
      if(POWERUPS.includes(original.powerup)){ball.powerup=original.powerup;ball.powerupRemaining=clamp(finite(original.powerupRemaining,POWERUP_DURATION),0,POWERUP_DURATION);}state.chain.push(ball);
    }
    state.chain.sort((a,b)=>a.s-b.s);
    for(let i=1;i<state.chain.length;i++)if(state.chain[i].s<state.chain[i-1].s+level.spacing-EPS)state.chain[i].s=state.chain[i-1].s+level.spacing;
    state.gaps=(Array.isArray(saved.gaps)?saved.gaps:[]).filter(g=>ids.has(g.leftId)&&ids.has(g.rightId)).map(g=>({leftId:g.leftId,rightId:g.rightId,shotId:integer(g.shotId),depth:Math.max(1,integer(g.depth,1))}));
    state.current=integer(saved.current);state.next=integer(saved.next);
    for(const key of Object.keys(state.effects))state.effects[key]=clamp(finite(saved.effects?.[key]),0,30);
    if(saved.shot&&[saved.shot.x,saved.shot.y,saved.shot.vx,saved.shot.vy].every(Number.isFinite))state.shot={id:integer(saved.shot.id),x:saved.shot.x,y:saved.shot.y,vx:saved.shot.vx,vy:saved.shot.vy,color:clamp(integer(saved.shot.color),0,5),gaps:(saved.shot.gaps||[]).slice(0,20).map(g=>({key:String(g.key),bonus:clamp(integer(g.bonus),10,500)}))};
    if(saved.coin&&[saved.coin.x,saved.coin.y,saved.coin.remaining].every(Number.isFinite))state.coin={x:saved.coin.x,y:saved.coin.y,remaining:clamp(saved.coin.remaining,0,15)};
    refreshColors();
    // Stored distances belong to the stored layout. An override performs the same remapping as a live rotation.
    if(options.layout&&layoutName(options.layout)!==state.layout)setLayout(options.layout);
  }else{
    resetBoard();if(saved)emit('migrated',{fromSchema:integer(saved.schema,1),score:state.score});
  }
  function addScore(points){const before=Math.floor(state.score/50000);state.score+=points;state.levelScore+=points;
    const earned=Math.floor(state.score/50000)-before;if(earned){state.lives+=earned;emit('extraLife',{lives:state.lives});}
    if(state.generating&&state.levelScore>=level.target){state.generating=false;state.effects.reverse=Math.max(state.effects.reverse,ZUMA_REVERSE_DURATION);emit('zuma',{score:state.score});}
  }
  function matchBounds(index){const chain=state.chain,color=chain[index]?.color;if(color===undefined)return null;let left=index,right=index;
    while(left>0&&chain[left-1].color===color&&chain[left].s-chain[left-1].s<=level.spacing+EPS)left--;
    while(right<chain.length-1&&chain[right+1].color===color&&chain[right+1].s-chain[right].s<=level.spacing+EPS)right++;
    return right-left+1>=3?{left,right}:null;
  }
  function clearMatch(bounds,cause={shotId:0,depth:1},shot=null){
    const old=state.chain,removed=new Set(old.slice(bounds.left,bounds.right+1).map(b=>b.id)),queue=old.filter(b=>removed.has(b.id)),powerups=[];
    // Bombs expand by physical distance, including nearby parallel lanes; each marked ball activates once.
    for(let q=0;q<queue.length;q++){
      const ball=queue[q];if(!ball.powerup)continue;const point=zumaPointAt(level.path,ball.s);powerups.push({kind:ball.powerup,...point});
      if(ball.powerup==='bomb')for(const neighbor of old){const p=zumaPointAt(level.path,neighbor.s);if(!removed.has(neighbor.id)&&Math.hypot(p.x-point.x,p.y-point.y)<=level.ballRadius*4.4){removed.add(neighbor.id);queue.push(neighbor);}}
    }
    const depth=Math.max(1,cause.depth),score=removed.size*10+(depth-1)*100;
    state.chain=old.filter(b=>!removed.has(b.id));state.chainDepth=depth;state.details.maxChain=Math.max(state.details.maxChain,depth);state.details.cleared+=removed.size;
    if(shot){state.combo++;state.details.maxCombo=Math.max(state.details.maxCombo,state.combo);if(state.combo>=5){const bonus=100+(state.combo-5)*10;addScore(bonus);emit('combo',{count:state.combo,bonus});}}
    const validPairs=new Set(state.chain.slice(1).map((b,i)=>state.chain[i].id+':'+b.id));state.gaps=state.gaps.filter(g=>validPairs.has(g.leftId+':'+g.rightId));
    for(let i=1;i<state.chain.length;i++){
      const left=state.chain[i-1],right=state.chain[i],oldLeft=old.indexOf(left),oldRight=old.indexOf(right);
      if(oldRight-oldLeft>1){state.gaps=state.gaps.filter(g=>g.leftId!==left.id||g.rightId!==right.id);state.gaps.push({leftId:left.id,rightId:right.id,shotId:cause.shotId,depth:depth+1});}
    }
    addScore(score);emit('match',{count:removed.size,depth,shotId:cause.shotId,gained:score,balls:queue.map(b=>({...zumaPointAt(level.path,b.s),color:b.color}))});
    if(shot?.gaps.length){const bonus=Math.max(...shot.gaps.map(g=>g.bonus))*shot.gaps.length;addScore(bonus);state.details.gapShots++;emit('gap',{count:shot.gaps.length,bonus});}
    for(const power of powerups){const kind=power.kind;state.details[kind+'Used']++;if(kind!=='bomb')state.effects[kind]=Math.max(state.effects[kind],kind==='reverse'?2.8:8);emit('powerup',power);}
    refreshColors();completeIfEmpty();
  }
  function completeIfEmpty(){if(state.status==='playing'&&!state.generating&&!state.chain.length){state.status='levelComplete';state.shot=null;state.coin=null;state.details.levelsCompleted++;state.details.clearAllCount++;emit('levelComplete',{levelIndex:state.levelIndex,score:state.score});}}
  function fitDrainAcceleration(){
    const remaining=Math.max(.1,DRAIN_TARGET_DURATION-state.drainTime),distance=Math.max(0,level.path.length+level.ballRadius*.35-(state.chain[0]?.s??level.path.length));
    // Integrate the same continuous speed curve after a rotation or for a long
    // queued tail, rather than deleting distant balls when an arbitrary timer ends.
    const needed=(distance-350*remaining)/(state.drainTime*remaining+.5*remaining*remaining);
    state.drainAcceleration=Math.max(state.drainAcceleration,needed);
  }
  function beginDrain(){
    if(state.status!=='playing')return;state.status='draining';state.generating=false;state.shot=null;state.coin=null;state.gaps=[];state.drainTime=0;state.drainAcceleration=1800;
    fitDrainAcceleration();emit('drain',{minimumDuration:DRAIN_MIN_DURATION});
  }
  function finishDrain(){
    if(state.status!=='draining')return;state.lives=Math.max(0,state.lives-1);state.status=state.lives?'lifeLost':'gameOver';emit(state.status,{lives:state.lives,score:state.score});
  }
  function tickDrain(dt){
    const before=state.drainTime,advance=350*dt+state.drainAcceleration*(before*dt+.5*dt*dt);
    state.drainTime+=dt;state.elapsed+=dt;
    for(const ball of state.chain)ball.s+=advance;
    const mouth=level.path.length+level.ballRadius*.35;
    while(state.chain.length&&state.chain.at(-1).s>=mouth){const ball=state.chain.pop();emit('swallow',{ballId:ball.id,color:ball.color,...zumaPointAt(level.path,level.path.length)});}
    if(!state.chain.length&&state.drainTime+1e-9>=DRAIN_MIN_DURATION)finishDrain();
  }
  function moveChain(dt){
    const chain=state.chain;if(!chain.length)return;const groups=[];let start=0;
    for(let i=1;i<=chain.length;i++)if(i===chain.length||chain[i].s-chain[i-1].s>level.spacing+EPS){groups.push({start,end:i-1});start=i;}
    const base=level.speed*(state.effects.slow>0?.36:1),reverse=state.effects.reverse>0;
    for(let n=0;n<groups.length;n++){
      const group=groups[n];let delta;
      if(n===0)delta=(reverse?-base*2.8:base)*dt;
      else{
        const rear=chain[group.start-1],front=chain[group.start],same=rear.color===front.color;
        delta=(same?-Math.max(230,base*5):reverse?-base*2.8:0)*dt;
        // The disconnected front waits for the rear; only a matching seam attracts backwards.
        delta=Math.max(delta,rear.s+level.spacing-front.s);
      }
      if(n===0&&reverse&&chain[group.start].s>=0)delta=Math.max(delta,-chain[group.start].s);
      for(let i=group.start;i<=group.end;i++)chain[i].s+=delta;
      if(n>0&&chain[group.start].s-chain[group.start-1].s<=level.spacing+EPS){
        const correction=chain[group.start-1].s+level.spacing-chain[group.start].s;
        for(let i=group.start;i<=group.end;i++)chain[i].s+=correction;
        const left=chain[group.start-1],right=chain[group.start],cause=state.gaps.find(g=>g.leftId===left.id&&g.rightId===right.id)||{shotId:0,depth:1};
        state.gaps=state.gaps.filter(g=>g.leftId!==left.id||g.rightId!==right.id);
        const match=matchBounds(group.start);if(match){clearMatch(match,cause);return;}
      }
    }
    if(chain.at(-1)?.s>=level.path.length-level.ballRadius*.3)beginDrain();
  }
  function rememberGaps(a,b,shot){
    const chain=state.chain,clearance=level.ballRadius*2;
    for(let i=1;i<chain.length;i++){
      const left=chain[i-1],right=chain[i],start=left.s+clearance,end=right.s-clearance,key=left.id+':'+right.id;
      if(end<=start||shot.gaps.some(g=>g.key===key))continue;
      let previous=zumaPointAt(level.path,start),crossed=false;
      for(let s=start+10;s<end+10;s+=10){const point=zumaPointAt(level.path,Math.min(s,end));if(segmentCross(a,b,previous,point)!==null){crossed=true;break;}previous=point;}
      if(crossed){const width=right.s-left.s-level.spacing,bonus=Math.round(clamp(500-(width-level.spacing)*2.4,10,500));shot.gaps.push({key,bonus});}
    }
  }
  function insertShot(shot,index,impact){
    const chain=state.chain,target=chain[index],point=zumaPointAt(level.path,target.s),tangent=zumaTangentAt(level.path,target.s);
    const ahead=(impact.x-point.x)*tangent.x+(impact.y-point.y)*tangent.y>=0,at=index+(ahead?1:0);
    const ball={id:state.nextId++,color:shot.color,s:target.s+(ahead?level.spacing:-level.spacing)};
    if(at>0)ball.s=Math.max(ball.s,chain[at-1].s+level.spacing);ball.s=Math.max(0,ball.s);chain.splice(at,0,ball);
    for(let i=at+1;i<chain.length&&chain[i].s<chain[i-1].s+level.spacing;i++)chain[i].s=chain[i-1].s+level.spacing;
    // Preserve untouched seams; splitting one seam transfers its pending cascade to
    // the new edge instead of accidentally deleting both gaps beside the hit ball.
    const neighbors=new Set(chain.slice(1).map((b,i)=>chain[i].id+':'+b.id));
    state.gaps=state.gaps.flatMap(g=>{
      if(neighbors.has(g.leftId+':'+g.rightId))return [g];
      if(neighbors.has(g.leftId+':'+ball.id))return [{...g,rightId:ball.id}];
      if(neighbors.has(ball.id+':'+g.rightId))return [{...g,leftId:ball.id}];
      return [];
    });
    emit('insert',{ballId:ball.id,targetId:target.id,index:at,...impact});const bounds=matchBounds(at);
    if(bounds)clearMatch(bounds,{shotId:shot.id,depth:1},shot);else {state.combo=0;state.chainDepth=0;emit('noMatch',{shotId:shot.id});}
    refreshColors();
  }
  function moveShot(dt){
    const shot=state.shot;if(!shot)return;const a={x:shot.x,y:shot.y},b={x:shot.x+shot.vx*dt,y:shot.y+shot.vy*dt};let hit=null;
    for(let i=0;i<state.chain.length;i++){
      if(state.chain[i].s<0)continue; // A dense chain reflow can queue intact beads before the entrance.
      const t=sweepCircleHit(a,b,zumaPointAt(level.path,state.chain[i].s),level.ballRadius*1.94);
      if(t!==null&&(!hit||t<hit.t))hit={t,index:i};
    }
    const coinT=state.coin?sweepCircleHit(a,b,state.coin,level.ballRadius+20):null;
    if(coinT!==null&&(!hit||coinT<hit.t))hit={t:coinT,coin:true};
    const end=hit?{x:a.x+(b.x-a.x)*hit.t,y:a.y+(b.y-a.y)*hit.t}:b;rememberGaps(a,end,shot);shot.x=end.x;shot.y=end.y;
    if(hit){state.shot=null;if(hit.coin){const position=state.coin;state.coin=null;state.coinsCollected++;state.details.coins++;const bonus=500+(state.coinsCollected-1)*100;addScore(bonus);emit('coin',{x:position.x,y:position.y,bonus});completeIfEmpty();}else insertShot(shot,hit.index,end);return;}
    if(b.x<-80||b.x>level.width+80||b.y<-80||b.y>level.height+80){state.shot=null;state.combo=0;state.details.misses++;emit('miss',{shotId:shot.id});}
  }
  function spawnCoin(){
    // Outside the outer rail: players must clear a line or deliberately shoot through a gap.
    const spots=[[450,75],[855,530],[430,1050],[40,650],[260,90]];const [x,y]=pick(spots);
    state.coin={x:x*level.width/900,y:y*level.height/1100,remaining:10};emit('coinAppeared',{...state.coin});
  }
  function tick(dt){
    if(state.status==='draining'){tickDrain(dt);return;}
    if(state.status!=='playing')return;state.elapsed+=dt;state.cooldown=Math.max(0,state.cooldown-dt);
    for(const effect of Object.keys(state.effects))state.effects[effect]=Math.max(0,state.effects[effect]-dt);
    for(const ball of state.chain)if(ball.powerup&&ball.s>=0){
      ball.powerupRemaining=Math.max(0,finite(ball.powerupRemaining,POWERUP_DURATION)-dt);
      if(ball.powerupRemaining<=1e-9){delete ball.powerup;delete ball.powerupRemaining;emit('powerupExpired',{ballId:ball.id});}
    }
    moveChain(dt);if(state.status!=='playing')return;moveShot(dt);if(state.status!=='playing')return;
    state.details.maxSpeed=Math.max(state.details.maxSpeed,level.speed*(state.effects.slow>0?.36:1));
    const danger=(state.chain.at(-1)?.s||0)>level.path.length*.86;
    if(danger&&!state.dangerActive){state.details.dangerCount++;emit('danger');}state.dangerActive=danger;
    if(state.generating){
      // Insertion leaves real gaps; spawning only fills the entrance, never repacks the whole chain.
      if(!state.chain.length)state.chain.push(makeBall(0));
      else if(state.chain[0].s>=level.spacing)state.chain.unshift(makeBall(state.chain[0].s-level.spacing,state.chain.slice(0,2)));
    }
    if(state.coin){state.coin.remaining-=dt;if(state.coin.remaining<=0)state.coin=null;}
    else if((state.coinTimer-=dt)<=0){spawnCoin();state.coinTimer=9+random()*5;}
    completeIfEmpty();
  }
  function update(dt){
    if(state.status!=='playing'&&state.status!=='draining')return;dt=clamp(finite(dt),0,5);state.accumulator+=dt;
    while(state.accumulator+1e-10>=STEP){state.accumulator-=STEP;if(Math.abs(state.accumulator)<1e-10)state.accumulator=0;tick(STEP);if(state.status!=='playing'&&state.status!=='draining'){state.accumulator=0;break;}}
  }
  function fire(angle){
    if(state.status!=='playing'||state.shot||state.cooldown>0||!Number.isFinite(angle))return false;
    refreshColors();state.aim=angle;const speed=state.effects.accuracy>0?1500:1080,offset=level.ballRadius*1.45;
    state.shot={id:++state.shotSeq,color:state.current,x:level.frog.x+Math.cos(angle)*offset,y:level.frog.y+Math.sin(angle)*offset,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,gaps:[]};
    state.current=state.next;state.next=pick(activeColors());state.cooldown=state.effects.accuracy>0?.08:.16;state.details.shots++;emit('shot',{shotId:state.shot.id,color:state.shot.color});return true;
  }
  function swap(){if(state.status!=='playing')return false;refreshColors();[state.current,state.next]=[state.next,state.current];emit('swap',{current:state.current,next:state.next});return true;}
  function advanceLevel(){if(state.status!=='levelComplete')return false;state.levelIndex++;resetBoard();emit('levelStart',{levelIndex:state.levelIndex});return true;}
  function retry(){if(state.status!=='lifeLost'&&state.status!=='gameOver')return false;if(state.status==='gameOver'){state.lives=3;state.score=0;state.levelIndex=0;for(const key of Object.keys(state.details))state.details[key]=0;}resetBoard();emit('levelStart',{levelIndex:state.levelIndex});return true;}
  function setLayout(value){
    value=layoutName(value);if(value===state.layout)return false;const old=level;state.layout=value;level=getZumaLevel(state.levelIndex,value);
    const ratio=level.path.length/old.path.length,positions=state.chain.map(ball=>ball.s);
    // Keep contacting segments attached. Preserve each real gap relative to track length,
    // while anchoring the dangerous head at its previous normalized progress.
    if(state.chain.length)state.chain.at(-1).s=positions.at(-1)*ratio;
    for(let i=state.chain.length-2;i>=0;i--){const gap=positions[i+1]-positions[i];state.chain[i].s=state.chain[i+1].s-level.spacing-(gap>old.spacing+EPS?(gap-old.spacing)*ratio:0);}
    // Rotation must not itself put a head into the hole. Any excess tail stays queued
    // before the entrance (s < 0), re-entering naturally rather than deleting beads.
    const excess=state.status==='draining'?0:Math.max(0,(state.chain.at(-1)?.s||0)-(level.path.length-level.ballRadius));
    for(const ball of state.chain)ball.s-=excess;
    const sx=level.width/old.width,sy=level.height/old.height;
    if(state.shot){const shot=state.shot,speed=Math.hypot(shot.vx,shot.vy);shot.x*=sx;shot.y*=sy;shot.vx*=sx;shot.vy*=sy;const length=Math.hypot(shot.vx,shot.vy)||1;shot.vx=shot.vx/length*speed;shot.vy=shot.vy/length*speed;}
    if(state.coin){state.coin.x*=sx;state.coin.y*=sy;}
    state.aim=Math.atan2(Math.sin(state.aim)*sy,Math.cos(state.aim)*sx);if(state.status==='draining')fitDrainAcceleration();emit('layout',{layout:value});return true;
  }
  return {state,get level(){return level;},update,fire,swap,advanceLevel,retry,setLayout,
    drainEvents(){const pending=events;events=[];return pending;},serialize(){return copy(state);}};
}
