const SUITS = ['♣', '♥', '♦', '♠'];
const suit = card => Math.floor(card / 13);
const rank = card => card % 13 + 1;
const red = card => suit(card) === 1 || suit(card) === 2;
const label = card => (['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank(card)] + SUITS[suit(card)]);
const cloneBoard = s => ({ columns:s.columns.map(c=>c.slice()), freecells:s.freecells.slice(), foundations:s.foundations.map(c=>c.slice()), moves:s.moves, ...(typeof s.autoHome==='boolean'?{autoHome:s.autoHome}:{}) });
function validBoard(s) {
  if (!s || !Array.isArray(s.columns) || s.columns.length !== 8 || !s.columns.every(Array.isArray) || !Array.isArray(s.freecells) || s.freecells.length !== 4 || !Array.isArray(s.foundations) || s.foundations.length !== 4 || !s.foundations.every(Array.isArray) || !Number.isSafeInteger(s.moves) || s.moves < 0) return false;
  const cards = [...s.columns.flat(), ...s.freecells.filter(c=>c!==null), ...s.foundations.flat()];
  return cards.length === 52 && new Set(cards).size === 52 && cards.every(c=>Number.isInteger(c)&&c>=0&&c<52) && s.foundations.every((pile,i)=>pile.length<=13&&pile.every((c,j)=>c===i*13+j));
}
export function dealFreeCell(random = Math.random) {
  const deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--){ const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1)))); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  const columns=Array.from({length:8},()=>[]); deck.forEach((c,i)=>columns[i%8].push(c));
  return {columns, freecells:[null,null,null,null], foundations:[[],[],[],[]],moves:0,history:[]};
}
export function restoreFreeCell(saved) {
  if(!validBoard(saved)) return dealFreeCell();
  return {...cloneBoard(saved),history:Array.isArray(saved.history)?saved.history.slice(-100).filter(validBoard).map(cloneBoard):[]};
}
function validLocation(s,p) {
  return p && Number.isInteger(p.index) && p.index>=0 && (p.type==='column'?p.index<8:(p.type==='freecell'||p.type==='foundation')&&p.index<4);
}
function sourceCards(s,p) {
  if(!validLocation(s,p)) return [];
  if(p.type==='freecell') return s.freecells[p.index]===null?[]:[s.freecells[p.index]];
  // Foundations are final destinations; undo can recover an earlier placement.
  if(p.type!=='column') return [];
  const pile=s.columns[p.index], start=p.cardIndex??pile.length-1;
  return Number.isInteger(start)&&start>=0&&start<pile.length?pile.slice(start):[];
}
const stacksOn = (a,b) => rank(a)+1===rank(b)&&red(a)!==red(b);
export function canMoveFreeCell(s,from,to) {
  if(!validLocation(s,from)||!validLocation(s,to)||(from.type===to.type&&from.index===to.index)) return false;
  const cards=sourceCards(s,from); if(!cards.length||!cards.every((c,i)=>i===0||stacksOn(c,cards[i-1]))) return false;
  if(to.type==='freecell') return cards.length===1&&s.freecells[to.index]===null;
  if(to.type==='foundation') return cards.length===1&&suit(cards[0])===to.index&&rank(cards[0])===s.foundations[to.index].length+1;
  const target=s.columns[to.index];
  const empties=s.columns.filter((c,i)=>!c.length&&i!==to.index).length;
  const capacity=(s.freecells.filter(c=>c===null).length+1)*2**empties;
  return cards.length<=capacity&&(!target.length||stacksOn(cards[0],target.at(-1)));
}
export function moveFreeCell(s,from,to) {
  if(!canMoveFreeCell(s,from,to)) return s;
  const cards=sourceCards(s,from), next=cloneBoard(s);
  if(from.type==='column') next.columns[from.index].splice(-cards.length); else next.freecells[from.index]=null;
  if(to.type==='column') next.columns[to.index].push(...cards);
  else if(to.type==='freecell') next.freecells[to.index]=cards[0];
  else next.foundations[to.index].push(cards[0]);
  if(s.autoHome) collectSafeCards(next);
  next.moves++;
  next.history=[...(s.history||[]).map(cloneBoard),cloneBoard(s)].slice(-100);
  return next;
}
// A/2 never need to remain as tableau support. Higher cards wait until both
// opposite-color predecessor ranks have already gone home.
export function safeToHomeFreeCell(state, card) {
  if(!Number.isInteger(card)||card<0||card>=52)return false;
  const n=rank(card),own=suit(card);
  if(state.foundations[own].length+1!==n)return false;
  return n<=2 || [0,1,2,3].filter(s=>red(s*13)!==red(card)).every(s=>state.foundations[s].length>=n-1);
}
function collectSafeCards(next) {
  let count=0;
  for(let pass=0;pass<52;pass++) {
    const source=next.freecells.map((card,index)=>({card,index,type:'freecell'})).concat(next.columns.map((pile,index)=>({card:pile.at(-1),index,type:'column'}))).find(p=>safeToHomeFreeCell(next,p.card));
    if(!source)break;
    if(source.type==='column')next.columns[source.index].pop();else next.freecells[source.index]=null;
    next.foundations[suit(source.card)].push(source.card);count++;
  }
  return count;
}
export function autoHomeFreeCell(state) {
  const next=cloneBoard(state);
  if(!collectSafeCards(next))return state;
  next.moves++;
  next.history=[...(state.history||[]).map(cloneBoard),cloneBoard(state)].slice(-100);
  return next;
}
export function undoFreeCell(s) {
  if(!s.history?.length) return s;
  return {...cloneBoard(s.history.at(-1)),...(typeof s.autoHome==='boolean'?{autoHome:s.autoHome}:{}),history:s.history.slice(0,-1).map(cloneBoard)};
}
export function isFreeCellWon(s) { return validBoard(s)&&s.foundations.every(c=>c.length===13); }
export function freeCellHint(s) {
  const sources=[];
  s.columns.forEach((pile,index)=>pile.forEach((_,cardIndex)=>sources.push({type:'column',index,cardIndex})));
  s.freecells.forEach((card,index)=>{if(card!==null)sources.push({type:'freecell',index});});
  const targets=[...Array.from({length:4},(_,index)=>({type:'foundation',index})),...Array.from({length:8},(_,index)=>({type:'column',index})),...Array.from({length:4},(_,index)=>({type:'freecell',index}))];
  let fallback=null;
  for(const to of targets) for(const from of sources) if(canMoveFreeCell(s,from,to)) {
    const move={from,to};
    if(to.type==='foundation'||to.type==='column'&&s.columns[to.index].length) return move;
    if(!(to.type==='column'&&from.type==='column'&&from.cardIndex===0)) fallback ||= move;
  }
  return fallback;
}
// Each rendered card supplies its stack offset; empty slots omit it.
export function freeCellHintHighlights(state, hint, position) {
  if (!hint || !position) return false;
  const matches = endpoint => endpoint?.type === position.type && endpoint.index === position.index;
  if (matches(hint.from)) {
    if (position.type !== 'column') return true;
    const start = hint.from.cardIndex ?? state.columns[position.index].length - 1;
    return Number.isInteger(position.cardIndex) && position.cardIndex >= start && position.cardIndex < state.columns[position.index].length;
  }
  if (!matches(hint.to)) return false;
  if (position.type !== 'column') return true;
  const length = state.columns[position.index].length;
  return length ? position.cardIndex === length - 1 : position.cardIndex === undefined;
}
const FREECELL_STYLES = `
#wb-freecell-fullscreen.wb-freecell,#wb-freecell-fullscreen.wb-freecell *{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#wb-freecell-fullscreen.wb-freecell{--fc-card-h:clamp(58px,13vw,92px);--fc-stack-gap:clamp(21px,4.6vh,30px);position:fixed;inset:0;z-index:2147483000;width:100vw;height:100vh;height:100dvh;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto auto;gap:8px;padding:env(safe-area-inset-top) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));overflow:hidden;background:radial-gradient(circle at 50% -12%,#49a878 0,#24684d 38%,#113f32 100%);color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;touch-action:none;overscroll-behavior:none;isolation:isolate}
#wb-freecell-fullscreen button{font:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent;cursor:pointer}#wb-freecell-fullscreen button:focus-visible{outline:3px solid #ffdd76;outline-offset:2px}
#wb-freecell-fullscreen .fc-head{display:grid;grid-template-columns:58px minmax(0,1fr) 58px;align-items:start;gap:8px;padding:8px 6px 0;z-index:3}#wb-freecell-fullscreen .fc-round{width:52px;height:52px;border:0;border-radius:999px;background:rgba(255,255,255,.74);color:#153e32;font-size:13px;font-weight:850;box-shadow:0 10px 24px rgba(10,45,35,.20),inset 0 0 0 1px rgba(255,255,255,.58);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2)}#wb-freecell-fullscreen .fc-round[aria-pressed="true"]{background:#1f6049;color:#fff}
#wb-freecell-fullscreen .fc-title{justify-self:center;min-width:156px;max-width:100%;border-radius:22px;padding:8px 16px 9px;background:rgba(255,255,255,.67);color:#163f32;text-align:center;box-shadow:0 12px 28px rgba(10,45,35,.16),inset 0 0 0 1px rgba(255,255,255,.62);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2)}#wb-freecell-fullscreen .fc-title strong{display:block;font-size:22px;line-height:1.1}#wb-freecell-fullscreen .fc-title span{display:block;margin-top:2px;font-size:11px;font-weight:750;color:#496d61}
#wb-freecell-fullscreen .fc-status{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;font-size:11px;font-weight:800;color:#dff3e8;text-shadow:0 1px 2px rgba(0,0,0,.22)}#wb-freecell-fullscreen .fc-top,#wb-freecell-fullscreen .fc-columns{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:clamp(3px,1vw,8px)}#wb-freecell-fullscreen .fc-top{padding:0 6px;z-index:2}#wb-freecell-fullscreen .fc-columns{min-height:0;align-items:start;overflow:auto;padding:0 6px 10px;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
#wb-freecell-fullscreen .fc-pile{position:relative;min-width:0;min-height:calc(var(--fc-card-h) + 26px);border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(3,43,34,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}#wb-freecell-fullscreen .fc-card,#wb-freecell-fullscreen .fc-slot{width:100%;height:var(--fc-card-h);box-sizing:border-box}
#wb-freecell-fullscreen .fc-card{display:flex;align-items:flex-start;justify-content:flex-start;white-space:nowrap;position:relative;padding:4px 3px;border:1px solid rgba(35,38,33,.28);border-radius:9px;background:linear-gradient(180deg,#fffefa,#f4eddc);color:#172325;text-align:left;line-height:1.1;font:bold clamp(10px,2.8vw,19px)/1.1 Georgia,serif;box-shadow:0 2px 4px rgba(0,0,0,.18);cursor:pointer;touch-action:manipulation}#wb-freecell-fullscreen .fc-card.red{color:#bd233b}#wb-freecell-fullscreen .fc-columns .fc-card:not(:last-child){margin-bottom:calc(-1 * var(--fc-card-h) + var(--fc-stack-gap))}
#wb-freecell-fullscreen .fc-card.selected{background:linear-gradient(180deg,#fff4bd,#ffe081);outline:3px solid #ffcc4a;outline-offset:-3px}#wb-freecell-fullscreen .fc-slot{display:grid;place-items:center;border:1px dashed rgba(255,255,255,.56);border-radius:10px;background:rgba(5,61,49,.30);color:#d5f0df;cursor:pointer;font-weight:850;font-size:clamp(11px,2.4vw,22px)}#wb-freecell-fullscreen .fc-hint{outline:3px solid #8de8ff!important;outline-offset:-3px}
#wb-freecell-fullscreen .fc-help{margin:0;padding:0 8px;font-size:10px;line-height:1.45;color:#d7eee2;text-align:center}#wb-freecell-fullscreen .fc-tools{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;padding:0 6px 4px}#wb-freecell-fullscreen .fc-tools button{min-height:42px;padding:7px 6px;border:1px solid rgba(255,255,255,.44);border-radius:14px;background:rgba(248,246,230,.92);color:#193f31;font-size:12px;font-weight:850;box-shadow:0 5px 14px rgba(5,36,29,.17)}#wb-freecell-fullscreen .fc-tools button[aria-pressed="true"]{background:#d9f6ce;border-color:#9ae48c}#wb-freecell-fullscreen .fc-tools button:disabled{opacity:.45}
#wb-freecell-fullscreen .fc-mask{position:absolute;inset:0;z-index:8;display:grid;place-items:center;padding:22px;background:rgba(4,22,18,.45);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}#wb-freecell-fullscreen .fc-mask[hidden]{display:none!important}#wb-freecell-fullscreen .fc-dialog{width:min(100%,340px);border-radius:24px;background:rgba(255,255,255,.92);padding:24px 20px;color:#183f32;text-align:center;box-shadow:0 20px 54px rgba(7,40,31,.35),inset 0 0 0 1px rgba(255,255,255,.7)}#wb-freecell-fullscreen .fc-dialog h2{margin:0 0 8px;font-size:23px}#wb-freecell-fullscreen .fc-dialog p{margin:0 0 18px;font-size:13px;line-height:1.7;color:#47695b}#wb-freecell-fullscreen .fc-dialog-actions{display:grid;gap:10px}#wb-freecell-fullscreen .fc-dialog button{min-height:46px;border:0;border-radius:15px;background:#e3eee8;color:#193f31;font-weight:850}#wb-freecell-fullscreen .fc-dialog button.primary{background:#1f6049;color:#fff}
@media(max-width:560px){#wb-freecell-fullscreen.wb-freecell{gap:6px;padding-left:max(5px,env(safe-area-inset-left));padding-right:max(5px,env(safe-area-inset-right));--fc-card-h:clamp(56px,15.8vw,74px);--fc-stack-gap:clamp(20px,4.1vh,27px)}#wb-freecell-fullscreen .fc-head{grid-template-columns:52px minmax(0,1fr) 52px;padding-top:6px}#wb-freecell-fullscreen .fc-round{width:48px;height:48px}#wb-freecell-fullscreen .fc-title{padding:7px 12px;min-width:136px}#wb-freecell-fullscreen .fc-title strong{font-size:20px}#wb-freecell-fullscreen .fc-card{border-radius:8px;padding:4px 2px}#wb-freecell-fullscreen .fc-help{font-size:9px}#wb-freecell-fullscreen .fc-tools{grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}#wb-freecell-fullscreen .fc-tools button{min-height:39px;font-size:10px;padding:5px 3px;border-radius:12px}}
@media(orientation:landscape) and (max-height:520px){#wb-freecell-fullscreen.wb-freecell{grid-template-columns:minmax(0,1fr) minmax(150px,24vw);grid-template-rows:auto auto minmax(0,1fr);gap:5px 7px;--fc-card-h:clamp(48px,11vw,68px);--fc-stack-gap:clamp(17px,6vh,25px);padding-top:max(4px,env(safe-area-inset-top));padding-bottom:max(4px,env(safe-area-inset-bottom))}#wb-freecell-fullscreen .fc-head{grid-column:1/-1;padding-top:2px}#wb-freecell-fullscreen .fc-title strong{font-size:18px}#wb-freecell-fullscreen .fc-title span{font-size:10px}#wb-freecell-fullscreen .fc-top{grid-column:1;grid-row:2}#wb-freecell-fullscreen .fc-status{grid-column:2;grid-row:2;align-content:start}#wb-freecell-fullscreen .fc-columns{grid-column:1;grid-row:3}#wb-freecell-fullscreen .fc-help{display:none}#wb-freecell-fullscreen .fc-tools{grid-column:2;grid-row:3;align-self:start;grid-template-columns:1fr;gap:6px;padding-right:4px}#wb-freecell-fullscreen .fc-tools button{min-height:36px}}
`;
function ensureStyles(doc) {
  if(doc.getElementById('wb-freecell-css'))return;
  const style=doc.createElement('style'); style.id='wb-freecell-css'; style.textContent=FREECELL_STYLES; doc.head?.appendChild?.(style) ?? doc.head?.append?.(style);
}
function hostWindow(env, doc) { return env.window || doc?.defaultView || globalThis; }
function createFreeCellSurface(env, doc) {
  const root=env.root;
  if(doc?.body && typeof doc.createElement==='function') {
    root.innerHTML='';
    const surface=doc.createElement('section');surface.id='wb-freecell-fullscreen';surface.className='wb-freecell';surface.dataset.gameVersion='1.0.1';surface.setAttribute('aria-label','空当接龙');
    doc.body.append(surface);
    return {surface,portal:surface};
  }
  if(root){root.id=root.id||'wb-freecell-fullscreen';root.className=((root.className||'')+' wb-freecell').trim();}
  return {surface:root,portal:null};
}
export function createFreeCellGame(env,state) {
  const {root,document:doc}=env; ensureStyles(doc);
  const win=hostWindow(env,doc),{surface,portal}=createFreeCellSurface(env,doc);
  let current=restoreFreeCell(state),selected=null,hint=null,destroyed=false,finished=false,localPause=false,surfaceReleased=false;
  const doubleTapMs=400;
  let lastTap=null,pendingMove=null,lastDoubleAt=-Infinity;
  const nativeImmersive=value=>{try{const result=win.NativeBridge?.setGameImmersive?.(value);result?.catch?.(()=>{});}catch{}};
  const releaseSurface=()=>{if(surfaceReleased)return;surfaceReleased=true;nativeImmersive(false);portal?.remove?.();};
  const paused=()=>localPause||!!env.isPaused?.();
  const active=()=>!destroyed&&!finished&&!paused()&&(env.isActive?.()??true);
  const data=()=>({...cloneBoard(current),history:current.history.map(cloneBoard)});
  function save(force=true){if(!destroyed&&!finished)env.save(data(),force);}
  function same(a,b){return a&&b&&a.type===b.type&&a.index===b.index;}
  function location(type,index,cardIndex){return `data-type="${type}" data-index="${index}"${cardIndex===undefined?'':` data-card-index="${cardIndex}"`}`;}
  function cardHTML(c,type,index,cardIndex){const p={type,index,cardIndex}; return `<button type="button" class="fc-card ${red(c)?'red':''} ${same(selected,p)&&(type!=='column'||cardIndex>=selected.cardIndex)?'selected':''} ${freeCellHintHighlights(current,hint,p)?'fc-hint':''}" ${location(type,index,cardIndex)} data-card="${c}" aria-label="${type==='column'?'第'+(index+1)+'列 ':type==='freecell'?'空当 '+(index+1)+' ':'收牌区 '}${label(c)}">${label(c)}</button>`;}
  function slot(type,index,text){return `<button type="button" class="fc-slot ${freeCellHintHighlights(current,hint,{type,index})?'fc-hint':''}" ${location(type,index)} aria-label="${type==='column'?'空列':type==='freecell'?'空当':'收牌区'} ${index+1}">${text}</button>`;}
  function draw(){
    const count=current.foundations.flat().length; env.setScore(count*10);
    surface.innerHTML=`<header class="fc-head"><button type="button" class="fc-round" data-action="exit" aria-label="返回">返回</button><div class="fc-title"><strong>空当接龙</strong><span>空当（左）／收牌区（右）</span></div><button type="button" class="fc-round" data-action="pause" aria-label="暂停" aria-pressed="${paused()}">${paused()?'继续':'暂停'}</button></header><div class="fc-status"><span>步数 ${current.moves}</span><span>已归位 ${count}/52</span></div><div class="fc-top">${current.freecells.map((c,i)=>c===null?slot('freecell',i,'空当'):cardHTML(c,'freecell',i)).join('')}${current.foundations.map((p,i)=>p.length?cardHTML(p.at(-1),'foundation',i):slot('foundation',i,SUITS[i])).join('')}</div><div class="fc-columns">${current.columns.map((p,i)=>`<div class="fc-pile" ${location('column',i)}>${p.length?p.map((c,j)=>cardHTML(c,'column',i,j)).join(''):slot('column',i,'＋')}</div>`).join('')}</div><p class="fc-help" aria-live="polite">${selected?'已选中：点击目标空当、列或同花色收牌区。':'点击牌选中，再点击目标；列内红黑交替递减，收牌区从 A 到 K。'} 双击／快速连点同一张露出的牌可归位。安全归档只收不会影响接牌的牌；撤回同时恢复本步自动归档。</p><div class="fc-tools"><button data-action="undo" ${current.history.length?'':'disabled'}>↶ 撤回</button><button data-action="auto-home" title="一次收取全部安全牌；双击或快速连点单张牌则只按同花色 A 到 K 判断">安全归档</button><button data-action="toggle-auto" aria-pressed="${!!current.autoHome}" title="每次有效移动后自动收取安全牌，与该次移动一起撤回">随步归档：${current.autoHome?'开':'关'}</button><button data-action="hint">提示</button><button data-action="finish">结算</button></div><div class="fc-mask" data-freecell-mask ${paused()?'':'hidden'}><section class="fc-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-pause-title"><h2 id="fc-pause-title">已暂停</h2><p>本局已保存，继续后从当前牌局恢复。</p><div class="fc-dialog-actions"><button type="button" class="primary" data-action="resume">继续</button><button type="button" data-action="exit">保存并退出</button></div></section></div>`;
  }
  function cancelPending(){if(pendingMove){clearTimeout(pendingMove.timer);pendingMove=null;}}
  function resetTap(){cancelPending();lastTap=null;}
  function perform(from,to){const next=moveFreeCell(current,from,to);if(next===current)return false; resetTap();current=next;selected=null;hint=null;draw();env.speak('move');save();if(isFreeCellWon(current))settle(true);return true;}
  function requestPause(value){localPause=!!value;resetTap();env.setPaused?.(!!value);draw();save();}
  function exitGame(){save();releaseSurface();env.exit?.();}
  function settle(won){if(finished)return;finished=true;const score=current.foundations.flat().length*10;releaseSurface();env.clear();env.speak(won?'win':'settle');env.finish(won?'接龙成功！':'本局结算',`已归位 ${current.foundations.flat().length}/52 张 · ${current.moves} 步`,{outcome:won?'win':'score',score},{score,details:{moves:current.moves,cardsHome:current.foundations.flat().length}});}
  function hit(event){
    const el=event.target.closest('[data-type]');if(!el)return null;
    const p={type:el.dataset.type,index:Number(el.dataset.index)};
    if(el.dataset.cardIndex!==undefined)p.cardIndex=Number(el.dataset.cardIndex);
    else if(p.type==='column')p.cardIndex=current.columns[p.index].length-1;
    const card=el.dataset.card===undefined?null:Number(el.dataset.card);
    // A redraw can expose another card in the same slot before a late event arrives.
    if(card!==null&&(p.type==='column'?current.columns[p.index][p.cardIndex]:p.type==='freecell'?current.freecells[p.index]:current.foundations[p.index].at(-1))!==card)return null;
    return {p,card};
  }
  function homeCard(target,now){
    resetTap();lastDoubleAt=now;
    const {p,card}=target,cards=sourceCards(current,p);
    if(card!==null&&cards.length===1&&cards[0]===card&&perform(p,{type:'foundation',index:suit(card)}))return;
    selected=null;hint=null;draw();env.toast('这张牌暂不能归位：须已露出，并按同花色 A 到 K 收牌');env.speak('invalid');
  }
  function flushPending(){
    const move=pendingMove;cancelPending();
    if(move&&active()&&current===move.board)perform(move.from,move.to);
  }
  function click(event){const action=event.target.closest('[data-action]')?.dataset.action;
    if(action)resetTap();
    if(action==='resume'){requestPause(false);return;}
    if(action==='exit'){exitGame();return;}
    if(action==='pause'){requestPause(true);return;}
    if(!active()){resetTap();return;}
    if(action==='undo'){current=undoFreeCell(current);selected=null;hint=null;draw();save();env.speak('undo');return;}
    if(action==='toggle-auto'){current={...current,autoHome:!current.autoHome};draw();save();env.toast(current.autoHome?'每次有效移动后自动收取安全牌':'已关闭随步归档，仍可手动点击安全归档');return;}
    if(action==='auto-home'){const next=autoHomeFreeCell(current);if(next===current){env.toast('暂时没有可安全归档的牌');return;}const count=next.foundations.flat().length-current.foundations.flat().length;current=next;selected=null;hint=null;draw();save();env.speak('move');env.toast(`已安全归档 ${count} 张，撤回可整体恢复`);if(isFreeCellWon(current))settle(true);return;}
    if(action==='hint'){hint=freeCellHint(current);selected=null;draw();env.toast(hint?'蓝框标示一个合法步骤（不保证最终可解）':'当前没有可提示的有效步骤，可撤回调整');env.speak('hint');return;}
    if(action==='finish'){settle(false);return;}
    let target=hit(event);if(!target){resetTap();return;}
    const now=event.timeStamp??Date.now(),pointerClick=event.detail!==0;
    const canTap=pointerClick&&target.card!==null&&target.p.type!=='foundation';
    // Browsers may reset click.detail and omit dblclick when selection redraws
    // the button. Card identity and time also recognize two touch-generated clicks.
    if(canTap&&lastTap&&lastTap.card===target.card&&same(lastTap.p,target.p)&&lastTap.p.cardIndex===target.p.cardIndex&&now-lastTap.at>=0&&now-lastTap.at<=doubleTapMs){event.preventDefault?.();homeCard(target,now);return;}
    flushPending();if(!active())return;target=hit(event);if(!target)return;
    const {p}=target;
    lastTap=canTap?{...target,at:now}:null;
    if(selected&&canMoveFreeCell(current,selected,p)){
      // An occupied card is both a move destination and a double-tap source.
      // Wait briefly so an illegal double-tap cannot move a different selection.
      if(canTap){pendingMove={from:selected,to:p,board:current,timer:setTimeout(flushPending,doubleTapMs)};return;}
      if(perform(selected,p))return;
    }
    if(same(selected,p)&&selected.cardIndex===p.cardIndex){selected=null;hint=null;draw();return;}
    const cards=sourceCards(current,p);if(cards.length&&cards.every((c,i)=>i===0||stacksOn(c,cards[i-1]))){selected=p;hint=null;draw();}else{env.toast('此处不能移动：请按红黑交替、点数递减排列');env.speak('invalid');}
  }
  function doubleClick(event){
    if(!active()){resetTap();return;}
    event.preventDefault?.();const now=event.timeStamp??Date.now();
    // The second click already handled this gesture, possibly exposing a new card.
    if(now-lastDoubleAt>=0&&now-lastDoubleAt<=doubleTapMs)return;
    const target=hit(event);if(target&&target.card!==null&&target.p.type!=='foundation')homeCard(target,now);
  }
  const preventMenu=event=>event.preventDefault?.();
  surface.addEventListener('click',click);
  surface.addEventListener('dblclick',doubleClick);
  surface.addEventListener('contextmenu',preventMenu);
  function destroy(){if(destroyed)return;destroyed=true;resetTap();surface.removeEventListener('click',click);surface.removeEventListener('dblclick',doubleClick);surface.removeEventListener('contextmenu',preventMenu);releaseSurface();}
  nativeImmersive(true);
  draw();env.speak(state?'resume':'start');save();if(isFreeCellWon(current))settle(true);
  return {destroy,save,getState:data};
}
