// Deterministic 60 Hz rules. Rendering, input devices and storage remain outside this module.
export const WIDTH=10, HEIGHT=20;
export const SHAPES=Object.freeze([
 [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
 [[2,2],[2,2]], [[0,3,0],[3,3,3],[0,0,0]],
 [[4,0,0],[4,4,4],[0,0,0]], [[0,0,5],[5,5,5],[0,0,0]],
 [[6,6,0],[0,6,6],[0,0,0]], [[0,7,7],[7,7,0],[0,0,0]]
].map(s=>Object.freeze(s.map(r=>Object.freeze(r)))));
const copy=v=>JSON.parse(JSON.stringify(v));
export function cells(piece){let a=SHAPES[piece.type].map(r=>r.slice());for(let n=0;n<piece.rotation;n++)a=a[0].map((_,x)=>a.map(r=>r[x]).reverse());return a;}
function random(p){let x=p.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;p.rng=x>>>0||1;return p.rng/4294967296;}
function refill(p){while(p.queue.length<7){const bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(random(p)*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}p.queue.push(...bag);}}
export function collides(p,c=p.current){return cells(c).some((r,y)=>r.some((v,x)=>v&&(c.x+x<0||c.x+x>=10||c.y+y>=20||(c.y+y>=0&&p.board[c.y+y][c.x+x]))));}
export function ghostY(p){let y=p.current.y;while(!collides(p,{...p.current,y:y+1}))y++;return y;}
function spawn(p,type){if(type===undefined){refill(p);type=p.queue.shift();refill(p);}p.current={type,rotation:0,x:type===1?4:3,y:0};p.gravity=0;p.lockTicks=0;p.resets=0;if(collides(p))p.dead=true;}
function player(seed){const p={board:Array.from({length:20},()=>Array(10).fill(0)),queue:[],current:null,hold:null,holdUsed:false,score:0,lines:0,level:1,combo:-1,backToBack:false,pending:0,dead:false,locks:0,gravity:0,lockTicks:0,resets:0,rng:seed>>>0||1,garbageRng:(seed^0x85ebca6b)>>>0||1};spawn(p);return p;}
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function validPlayer(p){return p&&Array.isArray(p.board)&&p.board.length===20&&p.board.every(r=>Array.isArray(r)&&r.length===10&&r.every(v=>integer(v,0,8))&&!r.every(Boolean))&&p.current&&integer(p.current.type,0,6)&&integer(p.current.rotation,0,3)&&integer(p.current.x,-4,10)&&integer(p.current.y,-4,20)&&Array.isArray(p.queue)&&p.queue.length>=3&&p.queue.length<=14&&p.queue.every(v=>integer(v,0,6))&&(p.hold===null||integer(p.hold,0,6))&&typeof p.holdUsed==='boolean'&&typeof p.dead==='boolean'&&typeof p.backToBack==='boolean'&&['score','lines','locks'].every(k=>integer(p[k],0,1e10))&&integer(p.level,1,1000001)&&integer(p.combo,-1,1e10)&&integer(p.pending,0,20)&&integer(p.gravity,0,1000)&&integer(p.lockTicks,0,30)&&integer(p.resets,0,15)&&integer(p.rng,1,4294967295)&&integer(p.garbageRng,1,4294967295)&&(p.dead||!collides(p));}
function resultOf(state){const [p,ai]=state.players;if(state.mode==='sprint'&&p.lines>=40)return 'win';if(p.dead)return state.mode==='duel'&&ai.dead?'draw':'loss';if(state.mode==='duel'&&ai.dead)return 'win';return null;}
export function isBattleState(v){return !!(v&&v.version===1&&['duel','marathon','sprint'].includes(v.mode)&&integer(v.ticks,0,1e10)&&Number.isFinite(v.carry)&&v.carry>=0&&v.carry<1/60+1e-8&&integer(v.aiClock,0,600)&&integer(v.revision,0,1e12)&&[null,'win','loss','draw'].includes(v.ended)&&Array.isArray(v.players)&&v.players.length===2&&v.players.every(validPlayer)&&v.ended===resultOf(v));}
// A bounded, explicit kick search for casual play, not a claim of official SRS behavior.
function rotate(p,direction){if(p.current.type===1)return false;const rotation=(p.current.rotation+direction+4)%4;const offsets=[[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,-2]];for(const [dx,dy] of offsets){const c={...p.current,rotation,x:p.current.x+dx,y:p.current.y+dy};if(!collides(p,c)){p.current=c;return true;}}return false;}
function move(p,dx,dy){const c={...p.current,x:p.current.x+dx,y:p.current.y+dy};if(collides(p,c))return false;p.current=c;return true;}
function settle(p){let above=false;cells(p.current).forEach((r,y)=>r.forEach((v,x)=>{if(v){const row=p.current.y+y;if(row<0)above=true;else p.board[row][p.current.x+x]=v;}}));const rows=[];p.board.forEach((r,i)=>{if(r.every(Boolean))rows.push(i);});p.board=p.board.filter((_,i)=>!rows.includes(i));while(p.board.length<20)p.board.unshift(Array(10).fill(0));if(above)p.dead=true;return rows;}
function boardCost(board,cleared){const heights=Array(10).fill(0);let holes=0;for(let x=0;x<10;x++){let seen=false;for(let y=0;y<20;y++){if(board[y][x]){if(!seen)heights[x]=20-y;seen=true;}else if(seen)holes++;}}const bump=heights.slice(1).reduce((sum,h,i)=>sum+Math.abs(h-heights[i]),0);return heights.reduce((a,b)=>a+b,0)*.53+holes*8.2+bump*.31+Math.max(...heights)*.75-cleared*6.4;}
// Enumerate only placements reachable by rotating at the current height and then translating.
export function chooseAI(p){let best=null;for(let rotations=0;rotations<4;rotations++){for(let target=-3;target<10;target++){const trial=copy(p);let valid=true;for(let r=0;r<rotations;r++)if(!rotate(trial,1)){valid=false;break;}if(!valid)continue;while(trial.current.x!==target){if(!move(trial,Math.sign(target-trial.current.x),0)){valid=false;break;}}if(!valid)continue;trial.current.y=ghostY(trial);const rows=settle(trial);if(trial.dead)continue;const cost=boardCost(trial.board,rows.length);if(!best||cost<best.cost)best={rotations,x:target,cost};}}return best;}
export function createBattle({mode='duel',seed=Date.now()>>>0,state:saved}={}){
 const state=isBattleState(saved)?copy(saved):{version:1,mode:['duel','marathon','sprint'].includes(mode)?mode:'duel',ticks:0,carry:0,aiClock:0,revision:0,players:[player(seed),player(seed)],ended:null,events:[]};
 state.events=[];
 function changed(){state.revision++;}
 function event(player,kind,extra={}){state.events.push({tick:state.ticks,player,kind,rows:[],lines:0,attack:0,...extra});if(state.events.length>8)state.events.shift();}
 function outcome(){state.ended=resultOf(state); }
 function garbage(p,n,index){if(!n)return;const randomState={rng:p.garbageRng};for(let i=0;i<n;i++){if(p.board[0].some(Boolean))p.dead=true;p.board.shift();const hole=Math.floor(random(randomState)*10);p.board.push(Array.from({length:10},(_,x)=>x===hole?0:8));}p.garbageRng=randomState.rng;event(index,'garbage',{lines:n});}
 function lock(index){const p=state.players[index];if(p.dead)return;const rows=settle(p),count=rows.length;let attack=0;p.locks++;p.holdUsed=false;
  if(count){p.combo++;const bonus=count===4&&p.backToBack?1.5:1;p.score+=Math.round([0,100,300,500,800][count]*p.level*bonus)+Math.max(0,p.combo)*50*p.level;attack=[0,0,1,2,4][count]+(count===4&&p.backToBack?1:0)+Math.min(4,Math.floor(p.combo/2));p.backToBack=count===4;p.lines+=count;p.level=1+Math.floor(p.lines/10);event(index,'clear',{rows,lines:count,attack});}else p.combo=-1;
  if(state.mode==='duel'){const cancel=Math.min(attack,p.pending);p.pending-=cancel;attack-=cancel;if(attack)state.players[1-index].pending=Math.min(20,state.players[1-index].pending+attack);if(!count){const n=Math.min(8,p.pending);p.pending-=n;garbage(p,n,index);}}
  if(!p.dead)spawn(p);event(index,'lock');changed();outcome();
 }
 function action(name,index=0){const p=state.players[index];if(state.ended||p.dead)return false;const grounded=collides(p,{...p.current,y:p.current.y+1});let ok=false;
  if(name==='left'||name==='right')ok=move(p,name==='left'?-1:1,0);
  else if(name==='rotate'||name==='ccw')ok=rotate(p,name==='rotate'?1:-1);
  else if(name==='soft'){ok=move(p,0,1);if(ok){p.score++;p.gravity=0;p.lockTicks=0;}}
  else if(name==='hard'){const y=ghostY(p);p.score+=(y-p.current.y)*2;p.current.y=y;lock(index);return true;}
  else if(name==='hold'&&!p.holdUsed){const type=p.current.type,held=p.hold;p.hold=type;spawn(p,held===null?undefined:held);p.holdUsed=true;ok=true;outcome();}
  if(ok){if(grounded&&['left','right','rotate','ccw'].includes(name)&&p.resets<15){p.lockTicks=0;p.resets++;}changed();}return ok;
 }
 function step(){state.ticks++;const p=state.players[0];p.gravity++;const interval=Math.max(4,48-((p.level-1)*4));if(p.gravity>=interval){p.gravity=0;if(move(p,0,1))changed();}
  if(collides(p,{...p.current,y:p.current.y+1})){p.lockTicks++;if(p.lockTicks>=30)lock(0);}else p.lockTicks=0;
  if(state.mode==='duel'&&!state.ended){state.aiClock++;const delay=Math.max(60,126-Math.floor(state.ticks/3600)*6);if(state.aiClock>=delay){state.aiClock=0;const ai=state.players[1],choice=chooseAI(ai);if(choice){for(let n=0;n<choice.rotations;n++)rotate(ai,1);while(ai.current.x!==choice.x&&move(ai,Math.sign(choice.x-ai.current.x),0)){}action('hard',1);}else {ai.dead=true;changed();outcome();}}}
 }
 return {state,get player(){return state.players[0];},get opponent(){return state.players[1];},action:name=>action(name),advance(seconds){if(state.ended||!Number.isFinite(seconds)||seconds<=0)return;state.carry+=Math.min(.25,seconds);while(state.carry+1e-10>=1/60&&!state.ended){state.carry=Math.max(0,state.carry-1/60);step();}if(state.ended)state.carry=0;},snapshot(){return copy(state);}};
}
