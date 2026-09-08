import { gameSpriteHTML } from '../../standalone/game-art.js';
const SIZE = 8;
const COLORS = 6;
const copy = board => board.map(row => row.slice());
const at = (board, index) => board[Math.floor(index / SIZE)][index % SIZE];
const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < 64 && b < 64 && Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) + Math.abs(a % 8 - b % 8) === 1;
const gem = random => Math.max(0, Math.min(5, Math.floor(random() * COLORS)));

const KINDS = ['normal','row','column','bomb','rainbow'];
export const specialKind = value => KINDS[Math.floor(value / COLORS)] || 'normal';
export const gemColor = value => specialKind(value) === 'rainbow' ? -1 : value % COLORS;
export const specialGem = (color, kind) => KINDS.indexOf(kind) * COLORS + ((color % COLORS + COLORS) % COLORS);
const setAt = (board, index, value) => { board[Math.floor(index / SIZE)][index % SIZE] = value; };
const comboAllowed = (a, b) => specialKind(a) === 'rainbow' || specialKind(b) === 'rainbow' || (specialKind(a) !== 'normal' && specialKind(b) !== 'normal');

export function findMatches(board) {
  const runs = [], cells = new Set();
  for (const vertical of [false, true]) for (let line = 0; line < SIZE; line++) {
    let start = 0;
    while (start < SIZE) {
      const index = position => vertical ? position * SIZE + line : line * SIZE + position;
      const color = gemColor(at(board, index(start)));
      let end = start + 1;
      while (end < SIZE && gemColor(at(board, index(end))) === color) end++;
      if (color >= 0 && end - start >= 3) {
        const run = Array.from({ length:end - start }, (_, n) => index(start + n));
        runs.push(run); run.forEach(cell => cells.add(cell));
      }
      start = end;
    }
  }
  return { cells:[...cells], runs };
}

export function swapBoard(board, a, b) {
  const next = copy(board);
  [next[Math.floor(a / SIZE)][a % SIZE], next[Math.floor(b / SIZE)][b % SIZE]] = [at(board, b), at(board, a)];
  return next;
}

export function legalMoves(board) {
  const moves = [];
  for (let a = 0; a < 64; a++) for (const b of [a + 1, a + 8]) {
    if (!adjacent(a, b)) continue;
    if (comboAllowed(at(board,a),at(board,b))) { moves.push([a,b]); continue; }
    if (at(board,a) === at(board,b)) continue;
    const matches = findMatches(swapBoard(board, a, b)).cells;
    if (matches.includes(a) || matches.includes(b)) moves.push([a, b]);
  }
  return moves;
}

export function createBoard(random = Math.random) {
  // Select from allowed colors directly, so even a constant RNG terminates.
  for (let attempt = 0; attempt < 30; attempt++) {
    const board = Array.from({ length:SIZE }, () => []);
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const allowed = Array.from({ length:COLORS }, (_, n) => n).filter(n => !(c >= 2 && board[r][c - 1] === n && board[r][c - 2] === n) && !(r >= 2 && board[r - 1][c] === n && board[r - 2][c] === n));
      board[r][c] = allowed[Math.min(allowed.length - 1, Math.max(0, Math.floor(random() * allowed.length)))];
    }
    if (legalMoves(board).length) return board;
  }
  const board = Array.from({ length:SIZE }, (_, r) => Array.from({ length:SIZE }, (_, c) => (r + c) % COLORS));
  // Plant an A B A / C A D pattern, with a guaranteed vertical swap.
  board[0][0] = 0; board[0][1] = 1; board[0][2] = 0; board[1][1] = 0;
  return board;
}

export function collapseBoard(board, cells, random = Math.random) {
  const cleared = new Set(cells), next = copy(board);
  for (let c = 0; c < SIZE; c++) {
    const survivors = board.map((row, r) => ({ value:row[c], index:r * SIZE + c })).filter(item => !cleared.has(item.index)).map(item => item.value);
    const added = Array.from({ length:SIZE - survivors.length }, () => gem(random));
    [...added, ...survivors].forEach((value, r) => { next[r][c] = value; });
  }
  return next;
}

// Resolve a single visible wave without random refill, useful for exact effect tests.
// swap identifies positions AFTER the swap; preferred determines the new special anchor.
export function resolveWave(board, { swap = null, preferred = [], hit = [] } = {}) {
  const work = copy(board), matches = findMatches(board), seeds = new Set(), created = [], activated = [], blocked = new Set();
  const add = index => { if (index >= 0 && index < 64) seeds.add(index); };
  const row = r => { if (r >= 0 && r < 8) for (let c = 0; c < 8; c++) add(r * 8 + c); };
  const column = c => { if (c >= 0 && c < 8) for (let r = 0; r < 8; r++) add(r * 8 + c); };
  const area = (index, radius) => { const r = index >> 3, c = index % 8; for (let y = Math.max(0,r-radius); y <= Math.min(7,r+radius); y++) for (let x = Math.max(0,c-radius); x <= Math.min(7,c+radius); x++) add(y*8+x); };
  const combo = swap && comboAllowed(at(board,swap[0]),at(board,swap[1]));
  let label = '';
  if (combo) {
    const [a,b] = swap, ka = specialKind(at(board,a)), kb = specialKind(at(board,b));
    add(a); add(b);
    if (ka === 'rainbow' || kb === 'rainbow') {
      const rainbow = ka === 'rainbow' ? a : b, partner = rainbow === a ? b : a, kind = specialKind(at(board,partner));
      if (kind === 'rainbow') { for(let i=0;i<64;i++) add(i); label = '双彩虹 · 全屏清除'; blocked.add(a); blocked.add(b); }
      else {
        const color = gemColor(at(board,partner)); blocked.add(rainbow);
        for(let i=0;i<64;i++) if (gemColor(at(board,i)) === color) {
          if(kind !== 'normal') setAt(work,i,specialGem(color,kind === 'row' || kind === 'column' ? (i%2 ? 'row':'column') : kind));
          add(i);
        }
        label = kind === 'normal' ? '彩虹 · 同色清除' : '彩虹组合 · 同色引爆';
      }
    } else if (ka === 'bomb' && kb === 'bomb') { area(b,2); label = '双爆弹 · 大范围爆破'; }
    else if (ka === 'bomb' || kb === 'bomb') { for(let d=-1;d<=1;d++){row((b>>3)+d);column(b%8+d);} label = '爆弹直线 · 三行三列'; }
    else { row(b>>3); column(b%8); label = '双直线 · 十字清除'; }
  } else {
    matches.cells.forEach(add);
    // Merge intersecting runs, but do not merge unrelated same-color matches.
    const groups = [];
    for (const run of matches.runs) {
      const related = groups.filter(g => run.some(index => g.cells.has(index)));
      const group = { cells:new Set(run), runs:[run] };
      for (const old of related) { old.cells.forEach(i=>group.cells.add(i)); group.runs.push(...old.runs); groups.splice(groups.indexOf(old),1); }
      groups.push(group);
    }
    for (const group of groups) {
      const longest = group.runs.reduce((best, run) => run.length > best.length ? run : best, []);
      const kind = longest.length >= 5 ? 'rainbow' : group.runs.length > 1 ? 'bomb' : longest.length === 4 ? (longest[1]-longest[0] === 1 ? 'row' : 'column') : null;
      if (!kind) continue;
      const candidates = [...preferred, ...group.cells];
      const anchor = candidates.find(i => group.cells.has(i) && specialKind(at(board,i)) === 'normal');
      if(anchor === undefined) continue;
      created.push({ index:anchor, value:specialGem(gemColor(at(board,anchor)),kind) });
      seeds.delete(anchor); blocked.add(anchor);
    }
  }
  hit.forEach(add);
  // A special hit by another special fires once; generated specials survive this wave.
  const queue = [...seeds], visited = new Set();
  for(let q=0;q<queue.length;q++) {
    const index=queue[q]; if(visited.has(index) || blocked.has(index)) continue; visited.add(index);
    const kind=specialKind(at(work,index)); if(kind==='normal') continue;
    activated.push(index);
    if(kind==='row')row(index>>3);
    else if(kind==='column')column(index%8);
    else if(kind==='bomb')area(index,1);
    else {
      const counts=Array(6).fill(0);work.flat().forEach(v=>{const c=gemColor(v);if(c>=0)counts[c]++;});
      const color=counts.indexOf(Math.max(...counts));
      for(let i=0;i<64;i++)if(gemColor(at(work,i))===color)add(i);
    }
    for(const hit of seeds)if(!visited.has(hit) && !blocked.has(hit) && !queue.includes(hit))queue.push(hit);
  }
  created.forEach(({index,value})=>{seeds.delete(index);setAt(work,index,value);});
  const cells=[...seeds], collected=Array(6).fill(0);
  cells.forEach(index=>{const color=gemColor(at(board,index));if(color>=0)collected[color]++;});
  const bonus = matches.runs.reduce((sum,run)=>sum+(run.length>=5?50:run.length===4?20:0),0);
  const points = Math.max(cells.length,matches.cells.length)*10 + bonus;
  return { board:work,cells,created,activated,collected,points,label };
}

export function resolveBoard(board, random = Math.random, options = {}) {
  let next = copy(board), score = 0, reshuffled = false;
  const waves = [], collected = Array(6).fill(0);
  for (let chain = 1; chain <= 100; chain++) {
    const wave=resolveWave(next,chain===1?options:{});
    if (!wave.cells.length) break;
    const before=copy(next), points=wave.points*Math.min(chain,5);
    next=collapseBoard(wave.board,wave.cells,random);
    waves.push({...wave,before,board:copy(next),points,chain});score+=points;
    wave.collected.forEach((n,c)=>{collected[c]+=n;});
  }
  if (findMatches(next).cells.length || !legalMoves(next).length) {
    // Recolor a fresh legal board while preserving earned special types.
    const kinds=next.flat().map(specialKind).filter(k=>k!=='normal');
    next=createBoard(random);
    kinds.forEach((kind,i)=>setAt(next,i,specialGem(at(next,i),kind)));
    // A rainbow itself guarantees a legal exchange; other specials preserve base colors.
    reshuffled=true;
  }
  return { board:next,score,waves,reshuffled,collected };
}

export const MATCH3_MODES = { classic:'经典闯关', ice:'破冰挑战', endless:'无限休闲' };
export const POWERUP_COSTS = { hammer:20, shuffle:15 };
const modeOf = state => Object.hasOwn(MATCH3_MODES,state?.mode) ? state.mode : 'classic';
const count = value => Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0;
const emptyWallet = () => ({ coins:30,stars:0,claimed:{classic:0,ice:0,endless:0} });
const clone = value => JSON.parse(JSON.stringify(value));

export function levelConfig(level, mode = 'classic') {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  if (mode === 'endless') return { target:1000,moves:0,goals:[] };
  const goals = mode === 'ice' || n < 2 ? [] : [{color:(n-2)%6,count:12+n*2}];
  if(mode === 'classic' && n>=4)goals.push({color:(n+1)%6,count:10+n});
  return { target:(mode === 'ice' ? 400 : 600)+(n-1)*180,moves:Math.max(18,28-Math.floor((n-1)/3)),goals };
}
export function createIce(level) {
  return Array.from({length:64},(_,i)=>{
    const r=i>>3,c=i%8,center=r>=2&&r<=5&&c>=2&&c<=5;
    const ring=r>=1&&r<=6&&c>=1&&c<=6;
    return center ? (level>=3 && (r+c)%3===0 ? 2 : 1) : ring && (level>=4 || level>=2&&(r+c)%2===0) ? 1 : 0;
  });
}
export function turnOutcome(state) {
  const mode=modeOf(state), scoreMet=state.levelScore>=levelConfig(state.level,mode).target;
  const goalsMet=(state.goals||[]).every(g=>(state.collected?.[g.color]||0)>=g.count);
  if(scoreMet && goalsMet && (mode!=='ice' || (state.ice||[]).every(n=>n===0)))return 'level';
  return mode!=='endless' && state.moves<=0 ? 'gameover' : 'continue';
}
function freshProgress(mode,level=1,score=0,random=Math.random) {
  const config=levelConfig(level,mode);
  return {mode,board:createBoard(random),level,score,levelScore:0,moves:config.moves,goals:config.goals,collected:Array(6).fill(0),ice:mode==='ice'?createIce(level):Array(64).fill(0),turnsUsed:0,toolsUsed:0};
}
function validProgress(saved) {
  return saved && Array.isArray(saved.board) && saved.board.length===8 && saved.board.every(row=>Array.isArray(row)&&row.length===8&&row.every(n=>Number.isInteger(n)&&n>=0&&n<30)) && ['score','levelScore','moves','level'].every(k=>Number.isFinite(saved[k])) && saved.level>=1 && saved.moves>=0 && saved.score>=0 && saved.levelScore>=0;
}
// The runtime must retain v3 zero-move saves: endless never consumes moves,
// and a failed finite level can be retried without losing its shared wallet.
export function validMatch3Progress(saved) {
  if(!saved)return false;
  if(saved.rulesVersion===3)return validProgress(saved) && Object.hasOwn(MATCH3_MODES,saved.mode) && !!saved.wallet && ['coins','stars'].every(key=>Number.isFinite(saved.wallet[key])&&saved.wallet[key]>=0);
  return !!(Array.isArray(saved.board)&&saved.board.length===8&&saved.board.every(row=>Array.isArray(row)&&row.length===8)&&saved.moves>0);
}
function readProgress(saved, mode) {
  const goals=saved.rulesVersion>=2 && Array.isArray(saved.goals) ? saved.goals.filter(g=>Number.isInteger(g.color)&&g.color>=0&&g.color<6&&Number.isInteger(g.count)&&g.count>0).map(g=>({color:g.color,count:g.count})) : [];
  return {mode,board:copy(saved.board),score:saved.score,levelScore:saved.levelScore,moves:Math.floor(saved.moves),level:Math.floor(saved.level),goals:mode==='classic'?goals:[],collected:Array.from({length:6},(_,c)=>count(saved.collected?.[c])),ice:mode==='ice' ? (Array.isArray(saved.ice)&&saved.ice.length===64?saved.ice.map(n=>Math.min(2,count(n))):createIce(saved.level)) : Array(64).fill(0),turnsUsed:count(saved.turnsUsed),toolsUsed:count(saved.toolsUsed)};
}
export function migrateState(saved, random = Math.random) {
  const mode=modeOf(saved), progress=validProgress(saved)?readProgress(saved,mode):freshProgress(mode,1,0,random);
  const wallet=saved?.wallet && typeof saved.wallet==='object' ? {coins:count(saved.wallet.coins),stars:count(saved.wallet.stars),claimed:Object.fromEntries(Object.keys(MATCH3_MODES).map(m=>[m,count(saved.wallet.claimed?.[m])]))} : emptyWallet();
  const modeStates={};
  for(const m of Object.keys(MATCH3_MODES))if(m!==mode && validProgress(saved?.modeStates?.[m]))modeStates[m]=readProgress({...saved.modeStates[m],rulesVersion:3},m);
  return {rulesVersion:3,...progress,wallet,modeStates,lastReward:saved?.lastReward&&typeof saved.lastReward==='object'?{mode:modeOf(saved.lastReward),level:count(saved.lastReward.level),stars:count(saved.lastReward.stars),coins:count(saved.lastReward.coins)}:null};
}
function progressOnly(state) {
  return readProgress({...state,rulesVersion:3},modeOf(state));
}
export function switchMode(state, mode, random = Math.random) {
  if(!Object.hasOwn(MATCH3_MODES,mode) || mode===modeOf(state))return state;
  const next=clone(state), modeStates={...next.modeStates,[modeOf(state)]:progressOnly(state)};
  const progress=modeStates[mode] || freshProgress(mode,1,0,random);
  delete modeStates[mode];
  return {...next,...progress,modeStates};
}
export function retryLevel(state,random=Math.random) {
  if(turnOutcome(state)!=='gameover')return state;
  return {...clone(state),...freshProgress(modeOf(state),state.level,Math.max(0,state.score-state.levelScore),random)};
}
// Wallet and claim watermark commit together with the stable board. Re-loading a
// completed level cannot issue its reward twice, even before advancing the level.
export function claimLevelReward(state) {
  if(turnOutcome(state)!=='level')return {state,reward:null};
  const mode=modeOf(state),wallet=state.wallet||emptyWallet();
  const lastLevel=mode==='endless'?state.level+Math.floor(state.levelScore/levelConfig(state.level,mode).target)-1:state.level;
  const rewardCount=Math.max(0,lastLevel-Math.max(state.level,(wallet.claimed?.[mode]||0)+1)+1);
  if(!rewardCount)return {state,reward:null};
  const fraction=state.moves/levelConfig(state.level,mode).moves;
  const stars=mode==='endless'?rewardCount:fraction>=1/3?3:fraction>=1/6?2:1;
  const reward={mode,level:lastLevel,stars,coins:mode==='endless'?20*rewardCount:20+stars*10};
  return {state:{...state,wallet:{...wallet,coins:wallet.coins+reward.coins,stars:wallet.stars+stars,claimed:{...wallet.claimed,[mode]:lastLevel}},lastReward:reward},reward};
}
export function advanceLevel(state,random=Math.random) {
  if(turnOutcome(state)!=='level')return state;
  const {state:claimed}=claimLevelReward(state),mode=modeOf(state);
  if(mode==='endless'){const target=levelConfig(state.level,mode).target;return {...claimed,level:state.level+Math.floor(state.levelScore/target),levelScore:state.levelScore%target};}
  return {...claimed,...freshProgress(mode,state.level+1,state.score,random)};
}
function applyResolution(state,result,spendMove) {
  const ice=(state.ice||Array(64).fill(0)).slice();
  if(modeOf(state)==='ice')for(const wave of result.waves)for(const index of new Set([...wave.cells,...wave.created.map(c=>c.index)]))ice[index]=Math.max(0,ice[index]-1);
  return {...state,board:result.board,score:state.score+result.score,levelScore:state.levelScore+result.score,moves:modeOf(state)==='endless'?state.moves:state.moves-(spendMove?1:0),collected:result.collected.map((n,c)=>n+(state.collected?.[c]||0)),ice,turnsUsed:count(state.turnsUsed)+(spendMove?1:0)};
}
export function playMove(state, a, b, random = Math.random) {
  if (!adjacent(a,b) || turnOutcome(state)!=='continue') return {valid:false,state};
  const board=swapBoard(state.board,a,b), matches=findMatches(board).cells;
  if(!comboAllowed(at(board,a),at(board,b)) && !matches.includes(a) && !matches.includes(b))return {valid:false,state};
  const result=resolveBoard(board,random,{swap:[a,b],preferred:[b,a]});
  const next=applyResolution(state,result,true);
  return {valid:true,state:next,waves:result.waves,reshuffled:result.reshuffled,outcome:turnOutcome(next)};
}
export function shuffleBoard(board,random=Math.random) {
  const next=createBoard(random),kinds=board.flat().map(specialKind).filter(k=>k!=='normal');
  kinds.forEach((kind,i)=>setAt(next,i,specialGem(at(next,i),kind)));
  return next;
}
export function usePowerup(state,kind,index=null,random=Math.random) {
  if(!Object.hasOwn(POWERUP_COSTS,kind) || turnOutcome(state)!=='continue' || count(state.wallet?.coins)<POWERUP_COSTS[kind] || kind==='hammer'&&(!Number.isInteger(index)||index<0||index>=64))return {valid:false,state};
  let result, next;
  if(kind==='hammer'){
    result=resolveBoard(state.board,random,{hit:[index]});next=applyResolution(state,result,false);
  }else{
    next={...state,board:shuffleBoard(state.board,random)};result={waves:[],reshuffled:true};
  }
  next={...next,wallet:{...state.wallet,coins:state.wallet.coins-POWERUP_COSTS[kind]},toolsUsed:count(state.toolsUsed)+1};
  return {valid:true,state:next,waves:result.waves,reshuffled:result.reshuffled,outcome:turnOutcome(next)};
}

const STYLES = `
.m3-game{max-width:620px;margin:0 auto;padding:12px;color:#eaf8ff;font-family:inherit}.m3-game *{box-sizing:border-box}.m3-game .m3-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:14px}.m3-game .m3-stat{flex:1;background:linear-gradient(145deg,#223f58,#14263e);border:1px solid #6bd7e52b;border-radius:15px;padding:10px 12px}.m3-game .m3-label{font-size:12px;color:#b6d7e7}.m3-game .m3-value{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}.m3-game .m3-progress{height:7px;overflow:hidden;border-radius:10px;background:#102139;margin:0 0 14px}.m3-game .m3-progress span{display:block;height:100%;background:linear-gradient(90deg,#42d8c7,#ebda85);border-radius:10px}.m3-game .m3-board{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px;padding:10px;background:linear-gradient(140deg,#142d47,#09172c);border:1px solid #69b5c544;box-shadow:0 12px 30px #0003,inset 0 1px #ffffff17;border-radius:20px;touch-action:none;user-select:none}.m3-game .m3-cell{min-width:0;aspect-ratio:1;border:1px solid #b0e6ff0c;border-radius:11px;background:#ffffff06;padding:5px;display:grid;place-items:center;cursor:pointer;position:relative;touch-action:none}.m3-game .m3-cell:focus-visible{outline:3px solid #fff;outline-offset:1px;z-index:2}.m3-game .m3-cell[aria-pressed=true]{background:#def7ff24;border-color:#f1d68a;box-shadow:0 0 0 2px #f1d68a77,0 0 16px #edda7766;z-index:2}.m3-game .m3-gem{display:grid;place-items:center;width:100%;height:100%;filter:drop-shadow(0 3px 2px #0007);will-change:transform,opacity}.m3-game .m3-stone{width:91%;height:91%;display:grid;place-items:center;position:relative;background:radial-gradient(ellipse at 32% 20%,#ffffffcf,transparent 37%),linear-gradient(150deg,var(--light),var(--dark));box-shadow:inset 0 0 0 2px #ffffff5c,inset 0 -5px 7px #0003;border-radius:25%}.m3-game .m3-stone:after{content:attr(data-mark);color:#fff;font-size:clamp(10px,2vw,14px);line-height:1;text-shadow:0 1px 3px #0008;font-weight:900}.m3-game .m3-kind-0{--light:#ff819e;--dark:#b52155;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);border-radius:0}.m3-game .m3-kind-1{--light:#ffc959;--dark:#b9741e;border-radius:50%}.m3-game .m3-kind-2{--light:#72eabc;--dark:#178770;clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)}.m3-game .m3-kind-3{--light:#84c8ff;--dark:#305bbd;border-radius:17%}.m3-game .m3-kind-4{--light:#c5a0ff;--dark:#7441c1;clip-path:polygon(50% 0,100% 35%,82% 100%,18% 100%,0 35%)}.m3-game .m3-kind-5{--light:#ffaf83;--dark:#cb5430;clip-path:polygon(50% 0,100% 95%,0 95%)}.m3-game .m3-status{min-height:28px;text-align:center;color:#f2d890;font-size:14px;padding-top:12px}.m3-game .m3-help{color:#abc3d7;font-size:12px;line-height:1.7;text-align:center;margin:8px 0}.m3-game .m3-tools{display:flex;justify-content:center;margin-top:10px}.m3-game .m3-hint{border:1px solid #94ccdd55;border-radius:12px;padding:9px 18px;background:#21425b;color:#ebfaff;font:inherit;cursor:pointer}.m3-game .m3-cell.m3-suggest{box-shadow:inset 0 0 0 2px #faf3ac;background:#edd47933}@media(max-width:420px){.m3-game{padding:6px}.m3-game .m3-board{gap:3px;padding:7px;border-radius:15px}.m3-game .m3-cell{padding:3px;border-radius:7px}.m3-game .m3-stat{padding:8px}.m3-game .m3-value{font-size:20px}}
`;
const FIT_STYLES = `
.m3-game{width:min(100%,620px);height:100%;min-height:0;padding:0;display:flex;flex-direction:column;align-items:stretch}.m3-game .m3-top{margin:0;flex-shrink:0}.m3-game .m3-stat{padding:6px 10px}.m3-game .m3-value{font-size:19px;line-height:1.3;white-space:nowrap}.m3-game .m3-progress{height:6px;min-height:6px;margin:6px 0}.m3-game .m3-board{width:min(100%,max(120px,calc(100cqh - 170px)));max-width:480px;aspect-ratio:1;align-self:center;flex-shrink:0;padding:6px;gap:3px}.m3-game .m3-status{color:#70532e;min-height:24px;line-height:20px;padding-top:4px;flex-shrink:0}.m3-game .m3-tools{margin:0;flex-shrink:0}.m3-game .m3-hint{padding:5px 16px;line-height:20px}.m3-game .m3-help{color:#52677b;font-size:11px;line-height:16px;margin:4px 0;flex-shrink:0}
`;
const SPECIAL_NAMES = {row:'横向直线',column:'纵向直线',bomb:'爆弹',rainbow:'彩虹'};
const SPECIAL_MARKS = {row:'↔',column:'↕',bomb:'✹',rainbow:'◉'};
const SPECIAL_STYLES = `
.m3-game .m3-board{width:min(100%,max(120px,calc(100cqh - 212px)))}.m3-game .m3-goals{min-height:24px;color:#6d4b2c;font-size:12px;text-align:center;line-height:20px;margin-bottom:4px}.m3-game .m3-gem{position:relative}.m3-game .m3-power{position:absolute;right:-3px;bottom:-2px;min-width:17px;height:17px;line-height:17px;background:#fff4d1;color:#583b20;border-radius:6px;font-size:14px;text-align:center;box-shadow:0 1px 4px #000a;z-index:2}.m3-game .m3-special-row,.m3-game .m3-special-column{box-shadow:inset 0 0 0 2px #fff,0 0 8px #fff7}.m3-game .m3-special-row:before,.m3-game .m3-special-column:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 5px,#fff9 5px 7px);pointer-events:none}.m3-game .m3-special-column:before{background:repeating-linear-gradient(90deg,transparent 0 5px,#fff9 5px 7px)}.m3-game .m3-special-bomb{box-shadow:inset 0 0 0 3px #fff2ab,0 0 9px #ffdb83;clip-path:none;border-radius:35%}.m3-game .m3-special-rainbow{clip-path:none;border-radius:50%;background:conic-gradient(#ff7299,#ffc65b,#7addab,#65b9fa,#b892f0,#ff7299);box-shadow:inset 0 0 0 2px white,0 0 8px #ffffffa0}.m3-game .m3-status{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;
const NAMES = ['红色爱心','金色星星','绿色菱形','蓝色六角形','紫色水滴','橙色方糖'];
const MARKS = ['♥','★','◆','⬡','♦','■'];
const ART_GEMS = [0,3,2,1,4,5];

const MODE_STYLES = `
.m3-game{position:relative}.m3-game .m3-meta{display:flex;gap:8px;align-items:center;justify-content:space-between;min-height:32px;flex-shrink:0;color:#684d2e;font-size:12px}.m3-game .m3-mode{border:1px solid #a88555;border-radius:8px;padding:4px 5px;background:#fff7e5;color:#553c25;font:inherit;max-width:135px}.m3-game .m3-wallet{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}.m3-game .m3-board{width:min(100%,max(120px,calc(100cqh - 234px)))}.m3-game .m3-cell[data-ice="1"]{background:#b5efff55;box-shadow:inset 0 0 0 2px #9fe7ff}.m3-game .m3-cell[data-ice="2"]{background:#b5efff77;box-shadow:inset 0 0 0 3px #edfcff,0 0 4px #78ceff}.m3-game .m3-ice{position:absolute;top:0;left:1px;color:#fff;font-size:10px;z-index:3;text-shadow:0 1px 2px #163e5d;pointer-events:none}.m3-game .m3-tools{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}.m3-game .m3-tool{border:1px solid #94ccdd55;border-radius:9px;padding:5px 7px;background:#21425b;color:#ebfaff;font:inherit;font-size:11px;line-height:18px;cursor:pointer}.m3-game .m3-tool:disabled,.m3-game .m3-mode:disabled{opacity:.45;cursor:default}.m3-game .m3-tool[aria-pressed=true]{background:#835623;box-shadow:0 0 0 2px #ebca7a}.m3-game .m3-confirm{position:absolute;inset:0;z-index:10;background:#12243ab8;display:grid;place-items:center;padding:20px;border-radius:14px}.m3-game .m3-confirm[hidden],.m3-game [hidden]{display:none!important}.m3-game .m3-dialog{max-width:330px;padding:20px;background:#fff4dc;border:2px solid #d8b776;border-radius:18px;color:#573f27;font-size:14px;line-height:1.7;box-shadow:0 15px 35px #0005}.m3-game .m3-dialog-actions{display:flex;gap:10px;justify-content:center;margin-top:15px}.m3-game .m3-help{margin:3px 0;font-size:10px;line-height:15px}.m3-game .m3-hint{padding:5px 7px}
`;

export function createMatch3Game(env, saved) {
  const doc = env.document || document, win = env.window || window;
  let destroyed=false,busy=false,finished=false,selected=-1,frame=0,cancelTween=null,gesture=null,armedHammer=false,confirmAction=null,suppressClick=false;
  let state=migrateState(saved);
  if(findMatches(state.board).cells.length || !legalMoves(state.board).length)state.board=resolveBoard(state.board).board;
  const style=doc.createElement('style');style.textContent=STYLES+FIT_STYLES+SPECIAL_STYLES+MODE_STYLES;
  const shell=doc.createElement('section');shell.className='m3-game';shell.setAttribute('aria-label','宝石消消乐');
  shell.innerHTML=`<div class="m3-meta"><label>玩法 <select class="m3-mode" aria-label="选择游戏模式"><option value="classic">经典闯关</option><option value="ice">破冰挑战</option><option value="endless">无限休闲</option></select></label><span class="m3-wallet" aria-live="polite"></span></div><div class="m3-top"><div class="m3-stat"><div class="m3-label">关卡</div><div class="m3-value" data-stat="level"></div></div><div class="m3-stat"><div class="m3-label">本关 / 目标</div><div class="m3-value" data-stat="target"></div></div><div class="m3-stat"><div class="m3-label">剩余步数</div><div class="m3-value" data-stat="moves"></div></div></div><div class="m3-progress" role="progressbar" aria-label="本关得分进度"><span></span></div><div class="m3-goals" aria-live="polite"></div><div class="m3-board" role="group" aria-label="八行八列宝石棋盘"></div><div class="m3-status" role="status" aria-live="polite">多连制造特效 · 初始 30 金币可使用道具</div><div class="m3-tools"><button class="m3-tool m3-hint" type="button">寻找一步</button><button class="m3-tool m3-hammer" type="button" aria-pressed="false">小锤 · 20币</button><button class="m3-tool m3-shuffle" type="button">重排 · 15币</button><button class="m3-tool m3-retry" type="button" hidden>重试本关</button><button class="m3-tool m3-end" type="button">结束本局</button></div><p class="m3-help">点选或滑动交换 · 四连清线 / 五连彩虹 / L、T 爆弹<br>金币为本局道具奖励 · 两颗特效交换可组合</p><div class="m3-confirm" role="dialog" aria-modal="true" aria-label="确认操作" hidden><div class="m3-dialog"><div class="m3-confirm-text"></div><div class="m3-dialog-actions"><button class="m3-tool m3-confirm-ok" type="button">确认</button><button class="m3-tool m3-confirm-cancel" type="button">取消</button></div></div></div>`;
  env.root.replaceChildren(style,shell);
  const boardEl=shell.querySelector('.m3-board'),status=shell.querySelector('.m3-status'),hint=shell.querySelector('.m3-hint'),modeSelect=shell.querySelector('.m3-mode'),hammer=shell.querySelector('.m3-hammer'),shuffle=shell.querySelector('.m3-shuffle'),retry=shell.querySelector('.m3-retry'),end=shell.querySelector('.m3-end'),confirm=shell.querySelector('.m3-confirm'),confirmOK=shell.querySelector('.m3-confirm-ok'),confirmCancel=shell.querySelector('.m3-confirm-cancel');
  const buttons=Array.from({length:64},(_,index)=>{const button=doc.createElement('button');button.className='m3-cell';button.type='button';button.dataset.index=index;button.setAttribute('aria-pressed','false');boardEl.append(button);return button;});
  const alive=()=>!destroyed&&(!env.isActive||env.isActive());
  const paused=()=>!!env.isPaused?.();
  const available=()=>alive()&&!paused()&&!busy&&!finished&&!confirmAction;
  const snapshot=()=>clone(state);
  const persist=force=>{if(alive()&&!finished)env.save(snapshot(),!!force);};
  function render(board=state.board,ice=state.ice){
    buttons.forEach((button,index)=>{
      const value=at(board,index),kind=specialKind(value),color=value%6,layers=ice[index]||0;
      button.dataset.special=kind;button.dataset.ice=String(layers);
      button.innerHTML=`<span class="m3-gem"><span class="m3-stone m3-kind-${color} m3-special-${kind}" data-mark="${kind==='rainbow'?'◉':MARKS[color]}">${gameSpriteHTML('candy-bubbles',kind==='rainbow'?6:ART_GEMS[color],NAMES[color])}</span>${kind!=='normal'?`<b class="m3-power">${SPECIAL_MARKS[kind]}</b>`:''}</span>${layers?`<span class="m3-ice">❄${layers===2?'²':''}</span>`:''}`;
      button.setAttribute('aria-label',`第${Math.floor(index/8)+1}行第${index%8+1}列 ${kind==='rainbow'?'彩虹万能糖':NAMES[color]+(SPECIAL_NAMES[kind]?' · '+SPECIAL_NAMES[kind]:'')}${layers?' · '+layers+'层冰':''}`);
      button.setAttribute('aria-pressed',String(selected===index));button.classList.remove('m3-suggest');
    });
    const config=levelConfig(state.level,state.mode),blocked=busy||finished;
    shell.querySelector('[data-stat=level]').textContent=state.mode==='endless'?`里程 ${state.level}`:state.level;
    shell.querySelector('[data-stat=target]').textContent=`${state.levelScore} / ${config.target}`;
    shell.querySelector('[data-stat=moves]').textContent=state.mode==='endless'?'∞':state.moves;
    shell.querySelector('.m3-wallet').textContent=`★ ${state.wallet.stars}　金币 ${state.wallet.coins}`;
    shell.querySelector('.m3-goals').textContent=state.mode==='ice'?`❄ 剩余冰层 ${ice.reduce((a,b)=>a+b,0)} · 消除冰格宝石破冰`:state.mode==='endless'?'不限步、不失败 · 每 1000 分奖励 ★1 / 20币':state.goals.length?'收集：'+state.goals.map(g=>`${MARKS[g.color]} ${Math.min(g.count,state.collected[g.color])}/${g.count}`).join('　'):'达成分数过关 · 剩余步数越多星级越高';
    const progress=shell.querySelector('.m3-progress');
    progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(config.target));progress.setAttribute('aria-valuenow',String(Math.min(state.levelScore,config.target)));progress.firstElementChild.style.width=`${Math.min(100,state.levelScore/config.target*100)}%`;
    const ended=turnOutcome(state)==='gameover';
    modeSelect.value=state.mode;modeSelect.disabled=blocked;
    hint.disabled=blocked||ended;hammer.disabled=blocked||ended||state.wallet.coins<POWERUP_COSTS.hammer;shuffle.disabled=blocked||ended||state.wallet.coins<POWERUP_COSTS.shuffle;
    hammer.setAttribute('aria-pressed',String(armedHammer));hammer.textContent=armedHammer?'取消小锤':'小锤 · 20币';retry.hidden=!ended;retry.disabled=blocked;end.disabled=blocked;
  }
  function tween(duration,update=()=>{}){
    return new Promise(resolve=>{
      let elapsed=0,previous=null;cancelTween=()=>{cancelTween=null;resolve(false);};
      const tick=now=>{if(!alive()){cancelTween?.();return;}const delta=previous===null?0:now-previous>250?0:now-previous;previous=now;if(!paused()){elapsed+=delta;update(Math.min(1,elapsed/duration));}if(elapsed>=duration){cancelTween=null;frame=0;resolve(true);}else frame=win.requestAnimationFrame(tick);};
      frame=win.requestAnimationFrame(tick);
    });
  }
  function swapVisual(a,b,reverse=false){
    const rectA=buttons[a].getBoundingClientRect(),rectB=buttons[b].getBoundingClientRect(),x=rectB.left-rectA.left,y=rectB.top-rectA.top;
    return tween(170,t=>{const p=reverse?1-t:t;buttons[a].firstElementChild.style.transform=`translate(${x*p}px,${y*p}px)`;buttons[b].firstElementChild.style.transform=`translate(${-x*p}px,${-y*p}px)`;});
  }
  function settle(){
    env.setScore(state.score);
    let rewardCoins=0,rewardStars=0;
    while(turnOutcome(state)==='level'){
      const claimed=claimLevelReward(state);rewardCoins+=claimed.reward?.coins||0;rewardStars+=claimed.reward?.stars||0;state=advanceLevel(claimed.state);
    }
    if(rewardCoins){status.textContent=`过关！★ +${rewardStars} / 金币 +${rewardCoins} · ${state.mode==='endless'?'继续下一里程':'第 '+state.level+' 关'}`;env.speak?.('level_up');env.toast?.(`获得 ${rewardStars} 星、${rewardCoins} 金币`);}
    if(turnOutcome(state)==='gameover')status.textContent='步数用完了 · 可重试本关，星币与其他模式进度保留';
    render();persist(true);
  }
  async function animateResult(result){
    const ice=state.ice.slice();
    for(const wave of result.waves){
      render(wave.before,ice);status.textContent=`${wave.label||(wave.created.length?'生成'+wave.created.map(c=>SPECIAL_NAMES[specialKind(c.value)]).join('、'):wave.chain>1?`${wave.chain} 连锁！`:'消除！')} +${wave.points}`;
      if(!await tween(190,t=>wave.cells.forEach(index=>{const el=buttons[index].firstElementChild;el.style.transform=`scale(${1-t*.85}) rotate(${t*25}deg)`;el.style.opacity=String(1-t);})))return false;
      if(state.mode==='ice')for(const index of new Set([...wave.cells,...wave.created.map(c=>c.index)]))ice[index]=Math.max(0,ice[index]-1);
      render(wave.board,ice);
      const affected=new Set(wave.cells.map(index=>index%8));
      if(!await tween(210,t=>buttons.forEach((button,index)=>{if(affected.has(index%8)){button.firstElementChild.style.transform=`translateY(${-20*(1-t)}px)`;button.firstElementChild.style.opacity=String(.3+.7*t);}})))return false;
    }
    if(!alive())return false;
    state=result.state;env.speak?.(result.waves.length>1?'streak':'merge');
    if(result.reshuffled)status.textContent='棋盘已重新排列，特效保留';
    settle();return true;
  }
  async function attempt(a,b){
    if(!available()||armedHammer||turnOutcome(state)!=='continue')return;
    if(!adjacent(a,b)){selected=b;render();return;}
    busy=true;selected=-1;render();const result=playMove(state,a,b);
    if(!await swapVisual(a,b))return;
    if(!result.valid){status.textContent='这一步没有连成三个，换个方向试试';env.speak?.('invalid');if(!await swapVisual(a,b,true))return;}
    else if(!await animateResult(result))return;
    busy=false;render();
  }
  async function hammerAt(index){
    if(!available())return;const result=usePowerup(state,'hammer',index);if(!result.valid)return;
    armedHammer=false;selected=-1;busy=true;render();if(!await animateResult(result))return;busy=false;render();
  }
  function choose(index){
    if(!available()||turnOutcome(state)!=='continue')return;
    if(armedHammer){void hammerAt(index);return;}
    if(selected===index){selected=-1;render();}else if(selected<0){selected=index;render();}else void attempt(selected,index);
  }
  function cellFrom(event){const cell=event.target.closest?.('.m3-cell');return cell&&boardEl.contains(cell)?Number(cell.dataset.index):-1;}
  function click(event){const index=cellFrom(event),suppressed=suppressClick;suppressClick=false;if(index>=0&&(!suppressed||event.detail===0))choose(index);}
  function down(event){suppressClick=false;const index=cellFrom(event);if(index>=0&&available()&&!armedHammer)gesture={index,x:event.clientX,y:event.clientY,id:event.pointerId};}
  function up(event){
    if(!gesture||gesture.id!==event.pointerId)return;const start=gesture;gesture=null;const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;suppressClick=true;
    const to=start.index+(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):Math.sign(dy)*8);if(adjacent(start.index,to))void attempt(start.index,to);
  }
  function cancel(){gesture=null;}
  function showHint(){if(!available()||turnOutcome(state)!=='continue')return;const move=legalMoves(state.board)[0];if(move){selected=-1;armedHammer=false;render();move.forEach(index=>buttons[index].classList.add('m3-suggest'));status.textContent='试着交换这两颗发光的宝石';}}
  function ask(text,action,label='确认'){
    if(!available())return;gesture=null;selected=-1;armedHammer=false;render();confirmAction=action;shell.querySelector('.m3-confirm-text').textContent=text;confirmOK.textContent=label;confirm.hidden=false;confirmOK.focus?.();
  }
  function closeConfirm(){confirmAction=null;confirm.hidden=true;modeSelect.focus?.();}
  function acceptConfirm(){if(!alive()||paused()||busy||!confirmAction)return;const action=confirmAction;closeConfirm();action();}
  function rejectConfirm(){if(!alive()||paused())return;closeConfirm();}
  function changeMode(){const next=modeSelect.value;modeSelect.value=state.mode;if(next===state.mode||!Object.hasOwn(MATCH3_MODES,next))return;ask(`切换到${MATCH3_MODES[next]}？当前棋盘会保存，切回可继续；三种玩法共享本局星币。`,()=>{state=switchMode(state,next);status.textContent=`${MATCH3_MODES[next]} · ${next==='endless'?'不限步数，放心消除':'已恢复该模式进度'}`;settle();},'保存并切换');}
  function armHammer(){if(!available()||turnOutcome(state)!=='continue'||state.wallet.coins<POWERUP_COSTS.hammer)return;armedHammer=!armedHammer;selected=-1;render();status.textContent=armedHammer?'点选要敲碎的宝石 · 确定落锤后扣 20 金币，不扣步':'已取消小锤';}
  function useShuffle(){if(!available())return;ask('花费 15 金币重排棋盘？保留特效、冰层与剩余步数。',()=>{const result=usePowerup(state,'shuffle');if(result.valid){state=result.state;status.textContent='已重排 · 花费 15 金币，特效保留';settle();}},'花 15 币重排');}
  function retryCurrent(){if(!available()||turnOutcome(state)!=='gameover')return;ask('重试本关？本关分数与目标归零，已获得的星币和其他模式进度保留。',()=>{state=retryLevel(state);status.textContent='本关重新开始，试试制造特效';settle();},'重试本关');}
  function finishRun(){if(!available())return;ask('结束并记录本局成绩？全部模式进度与本局星币将重置；只想稍后继续，请用外层返回。',()=>{finished=true;render();env.clear();env.finish('宝石消消乐 · 本局完成',`${MATCH3_MODES[state.mode]}第 ${state.level} 关，${state.score} 分；本局获得 ${state.wallet.stars} 星`,{outcome:'score',score:state.score},{score:state.score,level:state.level,mode:state.mode,stars:state.wallet.stars,coins:state.wallet.coins});},'结束并结算');}
  const listeners=[[boardEl,'click',click],[boardEl,'pointerdown',down],[win,'pointerup',up],[win,'pointercancel',cancel],[hint,'click',showHint],[modeSelect,'change',changeMode],[hammer,'click',armHammer],[shuffle,'click',useShuffle],[retry,'click',retryCurrent],[end,'click',finishRun],[confirmOK,'click',acceptConfirm],[confirmCancel,'click',rejectConfirm]];
  listeners.forEach(([el,event,handler])=>el.addEventListener(event,handler));
  render();settle();env.speak?.(saved?'resume':'start');
  return {getState:snapshot,save(){persist(true);},destroy(){if(destroyed)return;destroyed=true;if(frame)win.cancelAnimationFrame(frame);cancelTween?.();listeners.forEach(([el,event,handler])=>el.removeEventListener(event,handler));style.remove();shell.remove();}};
}
