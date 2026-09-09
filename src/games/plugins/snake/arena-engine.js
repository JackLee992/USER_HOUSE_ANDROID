// Deterministic offline simulation. Rendering and device pixel ratio never enter these rules.
export const ARENA_VERSION = 1;
export const ARENA_RULES = Object.freeze({width:1800,height:1400,step:1/60,speed:100,boostSpeed:172,turnRate:3.4,radius:11,minLength:100,startLength:170,maxLength:1400,boostCost:12,seconds:180,maxFood:1400});
const R=ARENA_RULES,TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export class SpatialGrid {
  constructor(size=64){this.size=size;this.cells=new Map();}
  insert(point){const key=Math.floor(point.x/this.size)+','+Math.floor(point.y/this.size);let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(point);}
  query(x,y,radius){const out=[];for(let cy=Math.floor((y-radius)/this.size);cy<=Math.floor((y+radius)/this.size);cy++)for(let cx=Math.floor((x-radius)/this.size);cx<=Math.floor((x+radius)/this.size);cx++){const cell=this.cells.get(cx+','+cy);if(cell)for(const item of cell)if((item.x-x)**2+(item.y-y)**2<=radius*radius)out.push(item);}return out;}
}
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-32&&p.x<=R.width+32&&p.y>=-32&&p.y<=R.height+32;
export function isArenaState(value){
  return !!value&&value.version===ARENA_VERSION&&['endless','timed'].includes(value.mode)&&Number.isSafeInteger(value.ticks)&&value.ticks>=0&&value.ticks<1e9&&Number.isSafeInteger(value.rng)&&value.rng>0&&value.rng<=0xffffffff&&Number.isSafeInteger(value.nextFood)&&value.nextFood>=0&&
    Number.isInteger(value.foodTarget)&&value.foodTarget>=0&&value.foodTarget<=600&&Array.isArray(value.food)&&value.food.length<=R.maxFood&&value.food.every(p=>validPoint(p)&&Number.isFinite(p.value)&&p.value>0&&p.value<=12&&Number.isInteger(p.color)&&p.color>=0&&p.color<6)&&
    Array.isArray(value.snakes)&&value.snakes.length>0&&value.snakes.length<=10&&value.snakes[0].id==='player'&&new Set(value.snakes.map(s=>s.id)).size===value.snakes.length&&value.snakes.every(s=>validPoint(s)&&typeof s.id==='string'&&/^player$|^ai[1-9]$/.test(s.id)&&typeof s.alive==='boolean'&&Number.isFinite(s.angle)&&Number.isFinite(s.target)&&Number.isFinite(s.length)&&s.length>=R.minLength&&s.length<=R.maxLength&&Number.isFinite(s.best)&&s.best>=s.length&&Number.isFinite(s.eaten)&&s.eaten>=0&&Number.isFinite(s.kills)&&s.kills>=0&&Number.isFinite(s.respawnAt)&&s.respawnAt>=0&&Number.isInteger(s.color)&&s.color>=0&&s.color<6&&Array.isArray(s.body)&&s.body.length>0&&s.body.length<=400&&s.body.every(validPoint))&&
    (value.ended===null||['collision','boundary','time'].includes(value.ended));
}
export function createArena({mode='endless',seed=Date.now(),state:saved,aiCount=7,foodCount=380}={}){
  if(saved&&!isArenaState(saved))throw Error('Invalid arena save');
  const state=saved?JSON.parse(JSON.stringify(saved)):{version:ARENA_VERSION,mode:mode==='timed'?'timed':'endless',rng:(Number(seed)>>>0)||1,ticks:0,nextFood:0,foodTarget:clamp(Math.floor(foodCount),0,600),snakes:[],food:[],ended:null};
  let accumulator=0,input={angle:null,boost:false},bodyGrid=new SpatialGrid(),foodGrid=new SpatialGrid();
  const random=()=>{let n=state.rng;n^=n<<13;n^=n>>>17;n^=n<<5;state.rng=n>>>0;return state.rng/4294967296;};
  function food(x,y,value=1,color=Math.floor(random()*6)){
    if(state.food.length>=R.maxFood)return;
    state.food.push({id:state.nextFood++,x:clamp(x,16,R.width-16),y:clamp(y,16,R.height-16),value,color});
  }
  function makeSnake(id,index){
    let x=R.width/2,y=R.height/2,angle=0;
    if(index){for(let tries=0;tries<40;tries++){x=240+random()*(R.width-480);y=240+random()*(R.height-480);if(state.snakes.every(s=>!s.alive||Math.hypot(s.x-x,s.y-y)>250))break;}angle=random()*TAU;}
    const body=Array.from({length:35},(_,i)=>({x:x-Math.cos(angle)*i*5,y:y-Math.sin(angle)*i*5}));
    return {id,x,y,angle,target:angle,length:R.startLength,best:R.startLength,eaten:0,kills:0,color:index%6,alive:true,respawnAt:0,boost:false,body};
  }
  if(!saved){state.snakes.push(makeSnake('player',0));for(let i=1;i<=clamp(Math.floor(aiCount),0,9);i++)state.snakes.push(makeSnake('ai'+i,i));for(let i=0;i<state.foodTarget;i++)food(20+random()*(R.width-40),20+random()*(R.height-40));if(state.foodTarget)for(let i=0;i<10;i++)food(R.width/2+45+i*24,R.height/2+Math.sin(i*.7)*18);}
  function indexWorld(){bodyGrid=new SpatialGrid();foodGrid=new SpatialGrid();for(const snake of state.snakes)if(snake.alive)for(let i=3;i<snake.body.length;i++)bodyGrid.insert({...snake.body[i],owner:snake.id});for(const dot of state.food)if(!dot.dead)foodGrid.insert(dot);}
  function aiSteer(s,index){
    if((state.ticks+index*3)%10!==0)return;
    const nearby=foodGrid.query(s.x,s.y,300);let desired=s.angle,best=Infinity;
    for(const p of nearby){const d=distance(p,s)/(p.value+1);if(d<best){best=d;desired=Math.atan2(p.y-s.y,p.x-s.x);}}
    let choice=s.angle,cost=Infinity;
    for(const offset of [0,.55,-.55,1.1,-1.1,1.8,-1.8,Math.PI]){
      const angle=s.angle+offset,x=s.x+Math.cos(angle)*105,y=s.y+Math.sin(angle)*105;
      let penalty=Math.abs(angleDifference(angle,desired))*24;
      const edge=Math.min(x,y,R.width-x,R.height-y);if(edge<100)penalty+=(100-edge)*5;
      for(const point of bodyGrid.query(x,y,95))if(point.owner!==s.id)penalty+=Math.max(0,95-Math.hypot(point.x-x,point.y-y))*1.8;
      for(const other of state.snakes)if(other!==s&&other.alive&&Math.hypot(other.x-x,other.y-y)<55)penalty+=160;
      if(penalty<cost){cost=penalty;choice=angle;}
    }
    s.target=choice;s.boost=s.length>R.minLength+40&&cost<20&&random()<.12;
  }
  function move(s,target,boost){
    const turn=clamp(angleDifference(target,s.angle),-R.turnRate*R.step,R.turnRate*R.step);s.angle=Math.atan2(Math.sin(s.angle+turn),Math.cos(s.angle+turn));
    s.boost=!!boost&&s.length>R.minLength+R.boostCost*R.step;
    if(s.boost){s.length=Math.max(R.minLength,s.length-R.boostCost*R.step);if(state.ticks%12===0){const tail=s.body.at(-1);food(tail.x,tail.y,.6,s.color);}}
    const speed=s.boost?R.boostSpeed:R.speed;s.x+=Math.cos(s.angle)*speed*R.step;s.y+=Math.sin(s.angle)*speed*R.step;
    if(distance(s,s.body[0])>=5)s.body.unshift({x:s.x,y:s.y});
    let length=distance(s,s.body[0]),end=s.body.length;for(let i=1;i<s.body.length;i++){length+=distance(s.body[i-1],s.body[i]);if(length>=s.length){end=i+1;break;}}s.body.length=Math.min(end,400);
  }
  function eliminate(s,reason,killer){
    s.alive=false;s.boost=false;s.respawnAt=state.ticks+240;
    for(let i=0;i<s.body.length;i+=3){const point=s.body[i];food(point.x+(random()-.5)*12,point.y+(random()-.5)*12,3,s.color);}
    if(killer&&killer.alive)killer.kills++;
    if(s.id==='player')state.ended=reason;
  }
  function tick(){
    if(state.ended)return;
    state.ticks++;indexWorld();
    for(let i=0;i<state.snakes.length;i++){const s=state.snakes[i];if(!s.alive){if(s.id!=='player'&&state.ticks>=s.respawnAt)state.snakes[i]=makeSnake(s.id,i);continue;}if(i)aiSteer(s,i);move(s,i?s.target:input.angle??s.angle,i?s.boost:input.boost);}
    indexWorld();const deaths=new Map();
    for(const s of state.snakes){if(!s.alive)continue;if(s.x<R.radius||s.y<R.radius||s.x>R.width-R.radius||s.y>R.height-R.radius){deaths.set(s.id,{reason:'boundary'});continue;}
      const hit=bodyGrid.query(s.x,s.y,R.radius*1.8).find(p=>p.owner!==s.id);if(hit)deaths.set(s.id,{reason:'collision',killer:state.snakes.find(other=>other.id===hit.owner)});
    }
    for(let i=0;i<state.snakes.length;i++)for(let j=i+1;j<state.snakes.length;j++){const a=state.snakes[i],b=state.snakes[j];if(a.alive&&b.alive&&distance(a,b)<R.radius*1.8){deaths.set(a.id,{reason:'collision'});deaths.set(b.id,{reason:'collision'});}}
    for(const s of state.snakes)if(deaths.has(s.id))eliminate(s,deaths.get(s.id).reason,deaths.get(s.id).killer);
    for(const s of state.snakes)if(s.alive){for(const dot of foodGrid.query(s.x,s.y,R.radius+6)){if(dot.dead)continue;dot.dead=true;s.length=Math.min(R.maxLength,s.length+dot.value*4);s.eaten++;s.best=Math.max(s.best,s.length);}}
    state.food=state.food.filter(p=>!p.dead);if(state.ticks%6===0&&state.food.length<state.foodTarget)food(20+random()*(R.width-40),20+random()*(R.height-40));
    if(!state.ended&&state.mode==='timed'&&state.ticks>=R.seconds/R.step)state.ended='time';
  }
  return {
    state,
    setInput(next={}){input={angle:Number.isFinite(next.angle)?next.angle:null,boost:next.boost===true};},
    clearInput(){input={angle:null,boost:false};state.snakes[0].boost=false;accumulator=0;},
    advance(seconds){if(!Number.isFinite(seconds)||seconds<=0||state.ended)return 0;accumulator+=Math.min(.25,seconds);let steps=0;while(accumulator+1e-10>=R.step&&!state.ended){tick();accumulator-=R.step;steps++;}return steps;},
    snapshot(){return JSON.parse(JSON.stringify(state));},
    ranking(){return state.snakes.filter(s=>s.alive).sort((a,b)=>b.length-a.length||a.id.localeCompare(b.id)).map(s=>({id:s.id,length:Math.round(s.length),color:s.color}));},
    get elapsed(){return state.ticks*R.step;},
    get remaining(){return Math.max(0,R.seconds-state.ticks*R.step);},
  };
}
