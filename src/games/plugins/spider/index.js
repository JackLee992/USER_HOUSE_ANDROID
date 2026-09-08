// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'spider';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["choiceForState","choiceSavePatch","clearProgress","currentGame","gamePaused","getHostDocument","qs","qsa","saveProgress","scores","setScore","showConfirm","showGameOver","shuffleArray","speak","toast"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startSpider(state) {
    const box = env.qs('#wb-gamebox');
    const choice = env.choiceForState('spider', state || {});
    const SUITS = choice.id === 'easy' ? ['S'] : ['S','H'];
    const SUIT_TXT = { S:'♠', H:'♥' };
    const RANK_TXT = { 1:'A', 11:'J', 12:'Q', 13:'K' };
    const MAX_COL = 30;
    const rankText = r => RANK_TXT[r] || String(r);
    const suitText = s => SUIT_TXT[s] || s;
    const faceInner = c => '<div class="corner">'+rankText(c.rank)+suitText(c.suit)+'</div><div class="pip">'+suitText(c.suit)+'</div><div class="rank-bottom">'+rankText(c.rank)+'</div>';
    const newCard = (suit, rank, face) => ({ id:'sp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8), suit, rank, face:!!face });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const makeBatch = () => {
      const arr = [];
      const copiesPerSuit = Math.floor(8 / SUITS.length);
      SUITS.forEach(suit => { for (let n=0;n<copiesPerSuit;n++) for (let r=1;r<=13;r++) arr.push(newCard(suit, r, false)); });
      return env.shuffleArray(arr);
    };
    const initial = () => {
      const deck = makeBatch();
      const cols = Array.from({length:10},()=>[]);
      const counts = [6,6,6,6,5,5,5,5,5,5];
      let left = counts.reduce((a,b)=>a+b,0), col = 0;
      while (left > 0) {
        if (cols[col].length < counts[col]) { const c = deck.shift(); c.face = cols[col].length === counts[col] - 1; cols[col].push(c); left--; }
        col = (col + 1) % 10;
      }
      return Object.assign({ cols, deck, score:0, level:1, moves:0, completed:[], stepsSinceDeal:0, tools:{undo:1, eliminate:5}, details:{ mode:choice.id, hearts:0, spades:0, maxChain:0, deals:0, autoDeals:0, clutch:0, badDeals:0, badDealsTotal:0, emptyCols:0, maxEmptyCols:0, completed:0, moves:0, clearTable:false, undo:0, eliminate:0 }, emptied:{}, dealEmptyLock:false, dangerPeak:false }, env.choiceSavePatch('spider', choice));
    };
    let st = state && Array.isArray(state.cols) ? Object.assign(initial(), state) : initial();
    st.cols = st.cols.map(col => (Array.isArray(col) ? col : []).map(c => Object.assign({}, c, { face:c.face !== false })));
    st.deck = Array.isArray(st.deck) ? st.deck : makeBatch();
    st.completed = Array.isArray(st.completed) ? st.completed : [];
    st.tools = Object.assign({ undo:1, eliminate:5 }, st.tools || {});
    st.details = Object.assign({ mode:choice.id, hearts:0, spades:0, maxChain:0, deals:0, autoDeals:0, clutch:0, badDeals:0, badDealsTotal:0, emptyCols:0, maxEmptyCols:0, completed:0, moves:0, clearTable:false, undo:0, eliminate:0 }, st.details || {});
    st.emptied = st.emptied || {};
    st.stepsSinceDeal = Math.max(0, Number(st.stepsSinceDeal || 0));
    let selected = null, busy = false, over = false, drag = null, eliminateMode = false, hintMode = false;
    const undoStack = [];
    box.innerHTML = '<div class="wb-spider" id="wb-spider"><div class="wb-spider-top"><div class="wb-spider-stat"><small>分数</small><b id="sp-score">0</b></div><div class="wb-spider-stat"><small>完成</small><b id="sp-done-count">0副</b></div><div class="wb-spider-stat"><small>移动</small><b id="sp-moves">0</b></div><div class="wb-spider-stat"><small>最高列</small><b id="sp-height">0/30</b></div></div><div class="wb-spider-deckbar"><div class="wb-spider-dealinfo"><div class="wb-spider-countdown" id="sp-countdown">20 步后发牌</div><div class="wb-muted" id="sp-deal-hint"></div></div><div class="wb-spider-deckside"><div class="wb-spider-pilebox collect"><div class="wb-spider-collectpile empty" id="sp-collect-pile"></div></div><div class="wb-spider-pilebox"><div class="wb-spider-deckpile" aria-hidden="true"><span></span><span></span><span></span></div></div><button class="wb-spider-deck" id="sp-deck" type="button">发牌</button></div></div><div class="wb-spider-board" id="sp-board"></div><div class="wb-spider-tools"><button class="wb-spider-tool" id="sp-hint" type="button">提示</button><button class="wb-spider-tool" id="sp-undo" type="button">撤销</button><button class="wb-spider-tool" id="sp-eliminate" type="button">消除 <span class="left" id="sp-eliminate-left">5</span></button><button class="wb-spider-tool end" id="sp-end" type="button">结束</button></div><div class="wb-spider-done"><div class="wb-spider-done-head"><span id="sp-done-title">已完成牌组</span><span id="sp-done-total">共 0 副</span></div><div class="wb-spider-done-track" id="sp-done-track"></div></div></div>';
    env.speak('spider','start');
    draw(); save();
    setTimeout(()=>{ if(env.currentGame === 'spider') draw(); }, 60);
    env.qs('#sp-deck').onclick = () => manualDeal();
    env.qs('#sp-hint').onclick = () => toggleHint();
    env.qs('#sp-undo').onclick = () => undoMove();
    env.qs('#sp-eliminate').onclick = () => toggleEliminate();
    env.qs('#sp-end').onclick = () => requestEndSpiderGame();
    env.qs('#sp-board').onclick = e => { if (e.target.id === 'sp-board') clearSelection(); };
    env.getHostDocument().addEventListener('keydown', spiderKeydown);
    function spiderKeydown(e){ if(env.currentGame==='spider' && e.key === 'Escape') clearSelection(); }
    function save(){ if(!over) env.saveProgress('spider', Object.assign({}, st, { selected:null })); }
    function snapshot(){ return JSON.parse(JSON.stringify(Object.assign({}, st, { selected:null }))); }
    function pushUndo(){ undoStack.push(snapshot()); if(undoStack.length > 80) undoStack.shift(); }
    function restoreState(next){ st = Object.assign(initial(), next || {}); st.cols = st.cols.map(col => (Array.isArray(col) ? col : []).map(c => Object.assign({}, c, { face:c.face !== false }))); st.deck = Array.isArray(st.deck) ? st.deck : makeBatch(); st.completed = Array.isArray(st.completed) ? st.completed : []; st.tools = Object.assign({ undo:1, eliminate:5 }, st.tools || {}); st.details = Object.assign({ mode:choice.id, hearts:0, spades:0, maxChain:0, deals:0, autoDeals:0, clutch:0, badDeals:0, badDealsTotal:0, emptyCols:0, maxEmptyCols:0, completed:0, moves:0, clearTable:false, undo:0, eliminate:0 }, st.details || {}); st.emptied = st.emptied || {}; st.stepsSinceDeal = Math.max(0, Number(st.stepsSinceDeal || 0)); }
    function undoMove(){ if(busy || over || env.gamePaused || !undoStack.length) return; restoreState(undoStack.pop()); selected=null; eliminateMode=false; hintMode=false; st.score=Math.max(0,Number(st.score||0)-2); st.details.undo=(st.details.undo||0)+1; env.speak('spider','undo'); showSpiderToast('已撤销，分数-2'); draw(); save(); }
    function toggleHint(){ if(busy || over || env.gamePaused) return; selected=null; eliminateMode=false; if(hintMode){ hintMode=false; draw(); return; } st.score=Math.max(0,Number(st.score||0)-2); hintMode=true; showSpiderToast('可移动牌已标蓝，分数-2'); draw(); save(); }
    function toggleEliminate(){ if(busy || over || env.gamePaused || (st.tools.eliminate||0)<=0) return; selected=null; hintMode=false; eliminateMode=!eliminateMode; draw(); showSpiderToast(eliminateMode ? '选择同花色连续牌组，再点一次消除' : '取消消除'); }
    function requestEndSpiderGame(){ if(busy || over) return; env.showConfirm('结束本局', '确定要提前结束无尽蜘蛛纸牌吗？本局会结算并可开启下一把。', endSpiderGame); }
    function endSpiderGame(){ if(busy || over) return; over=true; selected=null; hintMode=false; eliminateMode=false; env.clearProgress('spider'); env.setScore('spider', Math.max(env.scores().spider || 0, st.score)); env.speak('spider','gameover'); draw(); env.showGameOver('spider','提前结束','本局分数：' + st.score + '分（' + choice.title + '），完成' + st.completed.length + '副', { outcome:'score', score:st.score }, { difficulty:choice.title, details:Object.assign({}, st.details, { mode:choice.id, score:st.score, completed:st.completed.length }) }); }
    function ensureDeck(n=30){ while(st.deck.length < n) st.deck.push(...makeBatch()); }
    function topCard(i){ const c=st.cols[i]; return c[c.length-1]; }
    function isRun(col, idx){ const arr = st.cols[col]; if (!arr[idx] || !arr[idx].face) return false; for(let i=idx;i<arr.length;i++) if(!arr[i].face) return false; for(let i=idx;i<arr.length-1;i++) if(arr[i].suit !== arr[i+1].suit || arr[i].rank !== arr[i+1].rank + 1) return false; return true; }
    function canPlace(cards, to){ if(!cards || !cards.length) return false; if(st.cols[to].length + cards.length > MAX_COL) return false; const t = topCard(to); return !t || (t.face && t.rank === cards[0].rank + 1); }
    function legalTargets(cards, from){ return st.cols.map((_,i)=> i!==from && canPlace(cards, i)); }
    function isHelpfulMove(col, idx){ if(!isRun(col, idx)) return false; return legalTargets(st.cols[col].slice(idx), col).some(Boolean); }
    function clearSelection(){ selected=null; draw(); }
    function selectCard(col, idx){ if(busy || over || env.gamePaused) return; const arr=st.cols[col], card=arr[idx]; if(!card || !card.face) return; if(selected && selected.col===col && selected.idx===idx){ clearSelection(); return; } if(!isRun(col, idx)){ flashCard(col, idx); return; } hintMode=false; selected = { col, idx, cards: arr.slice(idx).map(c=>Object.assign({}, c)) }; draw(); }
    async function moveSelected(to){ if(!selected || busy || over || env.gamePaused) return; if(!canPlace(selected.cards, to)){ flashCol(to); return; } await doMove(selected.col, selected.idx, to); }
    async function doMove(from, idx, to){
      busy = true;
      pushUndo();
      const moving = st.cols[from].splice(idx);
      st.cols[to].push(...moving);
      selected = null;
      draw();
      await delay(80);
      st.moves++; st.details.moves = st.moves;
      st.score = Math.max(0, Number(st.score||0) - 1);
      st.stepsSinceDeal = Math.max(0, Number(st.stepsSinceDeal || 0)) + 1;
      await settle([from, to], true);
      await settle([], false);
      if(allFilled()) st.dealEmptyLock = false;
      await autoDealIfDue();
      checkOverflow();
      await checkClearTable();
      env.setScore('spider', st.score);
      draw(); save(); busy = false;
    }
    async function flipIfNeeded(indices){
      let flipped=false;
      for(const i of indices){ const c=topCard(i); if(c && !c.face){ c.face=true; st.score += 15; flipped=true; } }
      if(flipped){ draw(); await delay(180); }
      return flipped;
    }
    function completeAt(col){ const arr=st.cols[col]; if(arr.length < 13) return null; const seq=arr.slice(-13); const suit=seq[0].suit; for(let i=0;i<13;i++){ if(!seq[i].face || seq[i].suit!==suit || seq[i].rank !== 13-i) return null; } return { col, suit, cards:seq };
    }
    async function settle(seed, countMove){
      let chain=0, changed=true, touched = new Set(seed || []);
      while(changed){
        changed=false;
        await flipIfNeeded(Array.from(touched));
        touched.clear();
        const found=[];
        for(let i=0;i<10;i++){ const c=completeAt(i); if(c) found.push(c); }
        if(found.length){
          for(const f of found){
            await animateCollect(f.col, f.suit);
            st.cols[f.col].splice(-13,13);
            chain++;
            const mult = 1 + (chain-1)*0.5;
            st.score += Math.round(500 * mult);
            const done = { suit:f.suit, index:st.completed.length+1, level:st.level || 1, score:st.score };
            st.completed.push(done);
            st.details.completed = st.completed.length;
            if(f.suit==='H') st.details.hearts = (st.details.hearts||0)+1; else st.details.spades = (st.details.spades||0)+1;
            env.speak('spider', f.suit==='H' ? 'complete_heart' : 'complete_spade');
            showSpiderToast('完整牌组 +1');
            touched.add(f.col);
            draw(); await delay(160);
            const track=env.qs('#sp-done-track'); if(track) track.scrollLeft=track.scrollWidth;
          }
          changed=true;
        }
      }
      if(chain >= 3) env.speak('spider','chain_3');
      if(chain) st.details.maxChain = Math.max(st.details.maxChain || 0, chain);
      if(st.completed.length && st.completed.length % 10 === 0) { const t=env.qs('#sp-done-title'); if(t) t.textContent='十副收藏完成'; env.speak('spider','collection_10'); setTimeout(()=>{ const x=env.qs('#sp-done-title'); if(x) x.textContent='已完成牌组'; }, 1400); }
      checkEmptyRewards();
    }
    function checkEmptyRewards(){
      const emptyNow = st.cols.filter(c=>!c.length).length;
      st.details.maxEmptyCols = Math.max(st.details.maxEmptyCols || 0, emptyNow);
      st.cols.forEach((c,i)=>{ if(!c.length && !st.emptied[i]){ st.emptied[i]=true; st.score += 50; st.details.emptyCols=(st.details.emptyCols||0)+1; env.speak('spider','empty_col'); } });
    }
    function resetEmptyRewardsAfterDeal(){ st.emptied = {}; }
    function allFilled(){ return st.cols.every(c=>c.length>0); }
    function dealStepLimit(){
      const collected = Math.max(0, Array.isArray(st.completed) ? st.completed.length : 0);
      return Math.max(10, 20 - Math.floor(collected / 6) * 2);
    }
    function dealStepsLeft(){
      return Math.max(0, dealStepLimit() - Math.max(0, Number(st.stepsSinceDeal || 0)));
    }
    async function manualDeal(){ if(busy || over || env.gamePaused) return; if(!allFilled()){ st.dealEmptyLock=true; draw(); env.speak('spider','auto_3'); return; } busy=true; pushUndo(); await dealRow(false); await settle([], false); checkOverflow(); await checkClearTable(); draw(); save(); busy=false; }
    async function autoDealIfDue(){
      if(over || dealStepsLeft() > 0) return false;
      if(!allFilled()){
        st.dealEmptyLock = true;
        showSpiderToast('步数到达，请先填满空列');
        env.speak('spider','auto_3');
        return false;
      }
      st.details.autoDeals = (st.details.autoDeals || 0) + 1;
      showSpiderToast('步数到达，自动发牌');
      await dealRow(true);
      await settle([], false);
      return true;
    }
    function addDealWant(list, suit, rank, weight, kind){
      if(!suit || rank < 1 || rank > 13) return;
      list.push({ suit, rank, weight:Math.max(1, weight || 1), kind:kind || 'soft' });
    }
    function runSuffixInfo(col){
      const arr=st.cols[col] || [];
      if(!arr.length) return null;
      let start=arr.length-1;
      while(start>0 && arr[start-1].face && arr[start].face && arr[start-1].suit===arr[start].suit && arr[start-1].rank===arr[start].rank+1) start--;
      return { start, len:arr.length-start, head:arr[start], tail:arr[arr.length-1] };
    }
    function dealWantsForCol(col){
      const wants=[];
      const own=topCard(col);
      if(own && own.face && own.rank>1){
        addDealWant(wants, own.suit, own.rank-1, 18, 'direct');
        SUITS.forEach(s=>addDealWant(wants, s, own.rank-1, s===own.suit ? 8 : 4, 'direct'));
      }
      const suffix=runSuffixInfo(col);
      if(suffix && suffix.tail && suffix.tail.rank>1) addDealWant(wants, suffix.tail.suit, suffix.tail.rank-1, 8 + Math.min(12, suffix.len*2), 'direct');
      st.cols.forEach((_,i)=>{
        if(i===col) return;
        const t=topCard(i);
        if(!t || !t.face || t.rank<=1) return;
        SUITS.forEach(s=>addDealWant(wants, s, t.rank-1, s===t.suit ? 11 : 5, 'movable'));
        const run=runSuffixInfo(i);
        if(run && run.tail && run.tail.rank>1) addDealWant(wants, run.tail.suit, run.tail.rank-1, 6 + Math.min(10, run.len*2), 'movable');
      });
      return wants;
    }
    function takeDeckMatch(wants, forceMovable){
      ensureDeck(80);
      const filtered=forceMovable ? wants.filter(w=>w.kind==='movable') : wants;
      const pool=[];
      filtered.forEach(w=>{
        for(let i=0;i<Math.min(st.deck.length, 80);i++){
          const c=st.deck[i];
          if(c && c.suit===w.suit && c.rank===w.rank) pool.push({ idx:i, weight:w.weight });
        }
      });
      if(!pool.length) return null;
      let total=pool.reduce((sum,x)=>sum+x.weight,0), roll=Math.random()*total, pick=pool[0];
      for(const item of pool){ roll-=item.weight; if(roll<=0){ pick=item; break; } }
      const card=st.deck.splice(pick.idx,1)[0];
      card.face=true;
      return card;
    }
    function takeRandomDealCard(col){
      ensureDeck(80);
      const isTall = (st.cols[col] || []).length > MAX_COL - 13;
      if(isTall && st.deck[0] && st.deck[0].rank === 13 && Math.random() < .85){
        const swap = st.deck.findIndex((c,i)=>i>0 && i<80 && c.rank !== 13);
        if(swap > 0) return st.deck.splice(swap,1)[0];
      }
      return st.deck.shift();
    }
    function drawDealCardForCol(col, forceMovable){
      const bad=st.details.badDeals || 0;
      const assistRate=Math.min(.72, .4 + bad*.18);
      const wants=dealWantsForCol(col);
      const smart=(forceMovable || Math.random()<assistRate) ? (takeDeckMatch(wants, forceMovable) || takeDeckMatch(wants, false)) : null;
      const card=smart || takeRandomDealCard(col);
      card.face=true;
      return card;
    }
    async function dealRow(auto){
      ensureDeck(80);
      let forced=(st.details.badDeals || 0) >= 2 ? 2 : ((st.details.badDeals || 0) >= 1 ? 1 : 0);
      for(let i=0;i<10;i++){
        const c=drawDealCardForCol(i, forced>0);
        if(forced>0) forced--;
        await animateDealCard(i); st.cols[i].push(c); draw(); await delay(28);
      }
      const deckPile = env.qs('.wb-spider-deckpile');
      if(deckPile){ deckPile.classList.add('dealt'); await delay(500); deckPile.classList.remove('dealt'); }
      st.details.deals=(st.details.deals||0)+1; st.stepsSinceDeal = 0; st.level = Math.max(1, Math.floor(st.completed.length / 4) + 1); st.dealEmptyLock=false; resetEmptyRewardsAfterDeal(); env.speak('spider','deal');
      if(!hasAnyMove()){ st.details.badDeals=(st.details.badDeals||0)+1; st.details.badDealsTotal=(st.details.badDealsTotal||0)+1; if((st.details.badDeals||0)>=3) env.speak('spider','bad_deal'); } else st.details.badDeals=0;
      draw(); await delay(280);
    }
    async function animateDealCard(i){
      const deck = env.qs('.wb-spider-deckpile') || env.qs('#sp-deck'), board = env.qs('#sp-board');
      if(!deck || !board) return;
      const from = deck.getBoundingClientRect();
      const cols = env.qsa('.wb-spider-col', board).map(x=>x.getBoundingClientRect());
      const r = cols[i]; if(!r) return;
      const fly = env.getHostDocument().createElement('div');
      fly.className = 'wb-spider-fly';
      fly.style.left = (from.left + from.width/2 - 13) + 'px';
      fly.style.top = (from.top + from.height/2 - 18) + 'px';
      fly.style.setProperty('--sp-fly-x', (r.left + r.width/2 - from.left - from.width/2) + 'px');
      fly.style.setProperty('--sp-fly-y', (r.top + Math.min(18, r.height - 20) - from.top - from.height/2) + 'px');
      env.getHostDocument().body.appendChild(fly);
      setTimeout(()=>fly.remove(), 420);
      await delay(120);
    }
    async function animateCollect(col, suit){
      const target = env.qs('#sp-collect-pile');
      if(!target) return;
      const to = target.getBoundingClientRect();
      const arr = st.cols[col] || [];
      for(let idx=arr.length-1; idx>=Math.max(0, arr.length-13); idx--){
        const c = arr[idx];
        const el = env.qs('.wb-spider-card[data-col="'+col+'"][data-idx="'+idx+'"]');
        if(!c || !el) continue;
        const from = el.getBoundingClientRect();
        const fly = env.getHostDocument().createElement('div');
        fly.className = 'wb-spider-collect-fly' + (suit === 'H' ? ' red' : '');
        fly.innerHTML = faceInner(c);
        fly.style.left = from.left + 'px';
        fly.style.top = from.top + 'px';
        fly.style.setProperty('--sp-fly-x', (to.left + to.width/2 - from.left - 13) + 'px');
        fly.style.setProperty('--sp-fly-y', (to.top + to.height/2 - from.top - 18) + 'px');
        env.getHostDocument().body.appendChild(fly);
        setTimeout(()=>fly.remove(), 380);
        await delay(38);
      }
      await delay(260);
    }
    function selectEliminateRun(col, idx){
      if(busy || over || env.gamePaused || !eliminateMode || (st.tools.eliminate||0)<=0) return;
      const arr=st.cols[col], card=arr[idx];
      if(!card || !card.face){ flashCard(col, idx); return; }
      if(selected && selected.col===col && idx>=selected.idx) { eliminateSelectedRun(); return; }
      if(!isRun(col, idx)){ flashCard(col, idx); return; }
      selected = { col, idx, cards: arr.slice(idx).map(c=>Object.assign({}, c)) };
      hintMode = false;
      draw();
      showSpiderToast('再次点击选中牌组即可消除');
    }
    async function eliminateSelectedRun(){
      if(!selected || busy || over || env.gamePaused || !eliminateMode || (st.tools.eliminate||0)<=0) return;
      const col=selected.col, idx=selected.idx;
      if(!isRun(col, idx)){ selected=null; draw(); flashCol(col); return; }
      busy=true;
      pushUndo();
      const removed=st.cols[col].splice(idx);
      selected=null;
      st.tools.eliminate=Math.max(0,(st.tools.eliminate||0)-1);
      st.details.eliminate=(st.details.eliminate||0)+1;
      eliminateMode=false;
      env.speak('spider','eliminate');
      showSpiderToast('消除' + removed.length + '张');
      await settle([col], false); checkOverflow(); await checkClearTable(); draw(); save(); busy=false;
    }
    function hasAnyMove(){
      for(let i=0;i<10;i++) for(let idx=0;idx<st.cols[i].length;idx++) if(isRun(i,idx)){ const cards=st.cols[i].slice(idx); if(legalTargets(cards,i).some(Boolean)) return true; }
      return false;
    }
    function checkOverflow(){
      const max = Math.max(...st.cols.map(c=>c.length));
      if(max >= 30) { st.dangerPeak = true; env.speak('spider','danger'); }
      if(st.dangerPeak && max <= 24){ st.details.clutch = (st.details.clutch||0)+1; st.dangerPeak = false; }
      if(max > MAX_COL){
        over=true; env.clearProgress('spider'); env.setScore('spider', Math.max(env.scores().spider || 0, st.score)); env.speak('spider','gameover'); draw();
        setTimeout(()=>env.showGameOver('spider','牌列溢出','本局分数：' + st.score + '分，完成' + st.completed.length + '副', { outcome:'score', score:st.score }, { details:Object.assign({}, st.details, { score:st.score, completed:st.completed.length }) }), 350);
      }
    }
    async function checkClearTable(){
      if(over || !st.cols.every(c=>c.length===0)) return;
      st.details.clearTable = true;
      st.score += 1000; showSpiderToast('牌桌清空！'); env.speak('spider','clear_table'); await delay(700); ensureDeck(40);
      for(let r=0;r<4;r++) for(let i=0;i<10;i++){ const c=st.deck.shift(); c.face = r===3; st.cols[i].push(c); }
      st.stepsSinceDeal = 0; resetEmptyRewardsAfterDeal(); draw(); save();
    }
    function cardHTML(c, col, idx, top, extra){
      if(!c.face) return '<div class="wb-spider-card back '+(extra||'')+'" data-col="'+col+'" data-idx="'+idx+'" style="top:'+top+'px"></div>';
      const red = c.suit === 'H';
      return '<div class="wb-spider-card '+(red?'red ':'')+(extra||'')+'" data-col="'+col+'" data-idx="'+idx+'" style="top:'+top+'px">'+faceInner(c)+'</div>';
    }
    function spacingForBoard(board){
      const h = Math.max(120, board.clientHeight || 260);
      const w = Math.max(260, board.clientWidth || 420);
      const cardW = Math.min(44, Math.max(23, (w - 18) / 10));
      const cardH = cardW * 1.38;
      return Math.max(3, Math.min(18, Math.floor((h - cardH - 10) / 29)));
    }
    function draw(){
      const scoreEl=env.qs('#wb-score'); if(scoreEl) scoreEl.textContent='本局：' + st.score + '分';
      const highEl=env.qs('#wb-high'); if(highEl) highEl.textContent='最高：' + Math.max(env.scores().spider || 0, st.score) + '分';
      const maxH=Math.max(...st.cols.map(c=>c.length));
      const leftSteps = dealStepsLeft();
      const cd=env.qs('#sp-countdown'); if(cd){ cd.textContent = leftSteps > 0 ? (leftSteps + ' 步后发牌') : '立即发牌'; cd.className='wb-spider-countdown' + (leftSteps <= 3 ? ' warn' : ''); }
      const hint=env.qs('#sp-deal-hint'); if(hint) hint.textContent = st.dealEmptyLock || !allFilled() ? '请先填满空列' : ('已走 ' + Math.max(0, Number(st.stepsSinceDeal || 0)) + '/' + dealStepLimit() + ' 步');
      const deck=env.qs('#sp-deck'); if(deck){ deck.className='wb-spider-deck' + (!allFilled() ? ' blocked' : ''); deck.textContent = leftSteps > 0 ? '提前发牌' : '发牌'; }
      const pile=env.qs('#sp-collect-pile'); if(pile){ const cap=Math.max(1, Math.floor(((pile.clientWidth || 36) + 7) / 16)); const shown=st.completed.slice(0, cap); pile.className='wb-spider-collectpile' + (!shown.length ? ' empty' : ''); pile.innerHTML = shown.length ? shown.map(d=>'<span class="wb-spider-collect-card '+(d.suit==='H'?'red':'')+'" title="第'+d.index+'副">'+faceInner({ rank:1, suit:d.suit })+'</span>').join('') : '<span class="wb-spider-collect-card">'+faceInner({ rank:1, suit:'S' })+'</span>'; }
      const hintBtn=env.qs('#sp-hint'); if(hintBtn) hintBtn.className='wb-spider-tool' + (hintMode ? ' hint-on' : '');
      const elim=env.qs('#sp-eliminate'); if(elim) elim.className='wb-spider-tool' + (eliminateMode ? ' active' : '');
      const elimLeft=env.qs('#sp-eliminate-left'); if(elimLeft) elimLeft.textContent=String(st.tools.eliminate || 0);
      [['#sp-score',st.score],['#sp-done-count',st.completed.length+'副'],['#sp-moves',st.moves||0],['#sp-height',maxH+'/30'],['#sp-done-total','共 '+st.completed.length+' 副']].forEach(([sel,val])=>{ const el=env.qs(sel); if(el) el.textContent=val; });
      const board=env.qs('#sp-board'); if(board){
        const legal = selected && !eliminateMode ? legalTargets(selected.cards, selected.col) : [];
        const gap = spacingForBoard(board);
        const cardW = Math.min(44, Math.max(23, ((board.clientWidth || 420) - 18) / 10));
        env.qs('#wb-spider')?.style.setProperty('--sp-card-w', cardW + 'px');
        const cardAreaH = (Math.max(maxH, 1) - 1) * gap + cardW * 1.38 + 4;
        const colH = Math.max(80, Math.min(Math.max(80, board.clientHeight - 8), cardAreaH));
        board.innerHTML = st.cols.map((col,i)=>{
          let cls='wb-spider-col' + (legal[i]?' legal':'') + (st.dealEmptyLock&&!col.length?' empty-warn':'') + (col.length>MAX_COL?' overflow':'');
          const cards=col.map((c,idx)=> cardHTML(c,i,idx,idx*gap, (selected && selected.col===i && idx>=selected.idx ? 'selected ' : '') + (eliminateMode && c.face && isRun(i,idx) ? 'eliminate-choice ' : '') + (hintMode && c.face && isHelpfulMove(i,idx) ? 'hint-card' : ''))).join('');
          return '<div class="'+cls+'" data-col="'+i+'" style="height:'+colH+'px">'+cards+'</div>';
        }).join('');
        env.qsa('.wb-spider-card', board).forEach(el=>{ el.onclick=e=>{ e.stopPropagation(); const col=+el.dataset.col, idx=+el.dataset.idx; if(eliminateMode) selectEliminateRun(col,idx); else if(selected && selected.col!==col) moveSelected(col); else selectCard(col,idx); }; el.onpointerdown=startDrag; });
        env.qsa('.wb-spider-col', board).forEach(el=>{ el.onclick=e=>{ if(e.target!==el) return; const col=+el.dataset.col; if(eliminateMode) flashCol(col); else if(selected) moveSelected(col); }; });
      }
      const track=env.qs('#sp-done-track'); if(track){ track.innerHTML = st.completed.length ? st.completed.map(d=>'<button class="wb-spider-mini '+(d.suit==='H'?'red':'')+'" data-i="'+d.index+'" title="第 '+d.index+' 副\n花色：'+suitText(d.suit)+'\n等级：'+d.level+'\n分数：'+d.score+'"><span class="wb-spider-mini-main"><span>'+suitText(d.suit)+'</span><span>K→A</span><span>第'+d.index+'副</span></span></button>').join('') : '<div class="wb-spider-empty-done">还没有完成牌组</div>'; env.qsa('.wb-spider-mini', track).forEach(b=>b.onclick=()=>env.toast(b.title.replace(/\n/g,'；'))); }
    }
    function flashCard(col,idx){ draw(); const el=env.qs('.wb-spider-card[data-col="'+col+'"][data-idx="'+idx+'"]'); if(el){ el.classList.add('bad'); setTimeout(()=>el.classList.remove('bad'),240); } }
    function flashCol(col){ const el=env.qs('.wb-spider-col[data-col="'+col+'"]'); if(el){ el.classList.add('illegal'); setTimeout(()=>el.classList.remove('illegal'),240); } }
    function showSpiderToast(text){ const root=env.qs('#wb-spider'); if(!root) return; const el=env.getHostDocument().createElement('div'); el.className='wb-spider-toast'; el.textContent=text; root.appendChild(el); setTimeout(()=>el.remove(),1500); }
    function startDrag(e){
      if(busy || over || env.gamePaused || eliminateMode || e.button===2 || e.pointerType==='touch') return;
      const el=e.currentTarget, col=+el.dataset.col, idx=+el.dataset.idx;
      if(!isRun(col,idx)) return;
      e.preventDefault(); selectCard(col,idx);
      const cards=st.cols[col].slice(idx); const ghost=env.getHostDocument().createElement('div'); ghost.className='wb-spider-stack ghost';
      ghost.innerHTML=cards.map((c,i)=>'<div class="wb-spider-drag-card '+(c.suit==='H'?'red':'')+'" style="top:'+(i*18)+'px"><div class="corner">'+rankText(c.rank)+suitText(c.suit)+'</div><div class="pip">'+suitText(c.suit)+'</div><div class="rank-bottom">'+rankText(c.rank)+'</div></div>').join('');
      env.getHostDocument().body.appendChild(ghost); drag={ from:col, idx, ghost, cards, dx:0, dy:0 };
      moveDrag(e); env.getHostDocument().addEventListener('pointermove', moveDrag, { passive:false }); env.getHostDocument().addEventListener('pointerup', endDrag, { once:true });
    }
    function moveDrag(e){ if(!drag) return; e.preventDefault(); drag.ghost.style.left=(e.clientX - 24)+'px'; drag.ghost.style.top=(e.clientY - 20)+'px'; const target=colFromPoint(e.clientX,e.clientY); env.qsa('.wb-spider-col').forEach(x=>x.classList.remove('legal','illegal')); if(target>=0 && target!==drag.from){ const el=env.qs('.wb-spider-col[data-col="'+target+'"]'); if(el) el.classList.add(canPlace(drag.cards,target)?'legal':'illegal'); } }
    async function endDrag(e){ env.getHostDocument().removeEventListener('pointermove', moveDrag); if(!drag) return; const d=drag; d.ghost.remove(); drag=null; const target=colFromPoint(e.clientX,e.clientY); env.qsa('.wb-spider-col').forEach(x=>x.classList.remove('legal','illegal')); if(target>=0 && target!==d.from && canPlace(d.cards,target)) await doMove(d.from,d.idx,target); else draw(); }
    function colFromPoint(x,y){ const el=env.getHostDocument().elementFromPoint(x,y); const col=el && el.closest ? el.closest('.wb-spider-col') : null; return col ? +col.dataset.col : -1; }
  }
  startSpider(state);
  return env.activeGameController || null;
}
