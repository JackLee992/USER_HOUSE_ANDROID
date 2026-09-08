import { gameSpriteHTML } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'uyangle';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["GAME_ICON_BASE","choiceForState","choiceSavePatch","clearProgress","currentGameDurationMs","esc","gamePaused","getHostWindow","qs","qsa","saveProgress","scoreWithChoice","setScore","showGameOver","shuffleArray","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startUYangLe(state) {
    const box = env.qs('#wb-gamebox');
    const iconUrl = n => env.GAME_ICON_BASE + 'U' + n + '.png';
    const choice = env.choiceForState('uyangle', state);
    const endless = !!choice.endless || choice.id === 'endless';
    const SHUFFLE_MAX = 3;
    const makeTiles = () => {
      const totalCards = choice.cards || 144, layerTotal = choice.compact ? 13 : 10;
      const gridMaxX = choice.compact ? 8 : 10, gridMaxY = 8, centerX = Math.floor(gridMaxX / 2), centerY = 4;
      const pileShapes = ['middle', 'cross', 'butterfly', 'castle', 't', 'wings', 'taper'];
      const pileShape = pileShapes[Math.floor(Math.random() * pileShapes.length)];
      const stackPairs = env.shuffleArray([
        [{ x:1, y:1 }, { x:gridMaxX - 1, y:1 }],
        [{ x:1, y:7 }, { x:gridMaxX - 1, y:7 }],
        [{ x:0, y:4 }, { x:gridMaxX, y:4 }],
        [{ x:Math.max(1, centerX - 2), y:8 }, { x:Math.min(gridMaxX - 1, centerX + 2), y:8 }]
      ]).slice(0, 1 + Math.floor(Math.random() * 2));
      const stackPlans = stackPairs.flatMap(pair => {
        const height = 3 + Math.floor(Math.random() * 6);
        const baseLayer = Math.max(0, Math.floor(Math.random() * Math.max(1, layerTotal - height)));
        return pair.map(anchor => ({ x:anchor.x, y:anchor.y, height, baseLayer }));
      });
      const stackCards = stackPlans.reduce((sum, plan) => sum + plan.height, 0);
      const mainCards = totalCards - stackCards;
      const icons = env.shuffleArray(Array.from({ length:Math.ceil(totalCards / 3) }, (_, i) => Array(3).fill((i % 12) + 1)).flat()).slice(0, totalCards);
      const layerWeights = Array.from({ length:layerTotal }, (_, i) => Math.pow(layerTotal - i, 1.22));
      let counts = layerWeights.map(w => Math.max(2, Math.floor(mainCards * w / layerWeights.reduce((a,b)=>a+b, 0))));
      while(counts.reduce((a,b)=>a+b, 0) < mainCards){
        const i = counts.reduce((best, val, idx) => idx && val < counts[idx - 1] + (idx < 4 ? 3 : 1) ? idx : best, 0);
        counts[i]++;
      }
      while(counts.reduce((a,b)=>a+b, 0) > mainCards){
        for(let i=counts.length-1;i>=0 && counts.reduce((a,b)=>a+b, 0) > mainCards;i--) if(counts[i] > 2) counts[i]--;
      }
      for(let i=1;i<counts.length;i++) if(counts[i] > counts[i - 1]) counts[i] = Math.max(2, counts[i - 1] - 1);
      while(counts.reduce((a,b)=>a+b, 0) < mainCards){
        let changed = false;
        for(let i=0;i<counts.length && counts.reduce((a,b)=>a+b, 0) < mainCards;i++){
          if(i === 0 || counts[i] + 1 <= counts[i - 1]){
            counts[i]++;
            changed = true;
          }
        }
        if(!changed) break;
      }
      const allowed = (shape, x, y, rx, ry, layer) => {
        const t = layer / Math.max(1, layerTotal - 1);
        const ax = Math.abs(x - centerX), ay = Math.abs(y - centerY);
        if(shape === 'cross') return ax <= Math.max(1, rx * .22) || ay <= Math.max(1, ry * .28);
        if(shape === 'butterfly') return (ax >= 1 && ax <= rx && ay <= ry - ax * .22) || (ax <= 1 && ay <= Math.max(1, ry * .42));
        if(shape === 'castle') return ay <= ry && ax <= rx && (y >= 2 || ax <= rx * .45 || Math.round(ax) % 2 === 0);
        if(shape === 't') return (y <= 3 && ax <= rx) || (ax <= Math.max(1, rx * .28) && ay <= ry);
        if(shape === 'wings') return (ax >= Math.max(1, rx * .34) && ax <= rx && ay <= ry) || (ax <= Math.max(1, rx * .25) && ay <= ry * .55);
        if(shape === 'taper') return ax <= Math.max(1, rx - Math.max(0, y - 2) * (.55 + t * .18)) && ay <= ry;
        return ay <= ry && ax <= Math.max(1, rx - Math.max(0, ay - 1) * .45);
      };
      const pointScore = (x, y, layer) => {
        const ax = Math.abs(x - centerX), ay = Math.abs(y - centerY);
        const moduleBonus =
          (y === 1 && ax <= 3 ? -.45 : 0) +
          (x >= 3 && x <= 7 && y >= 3 && y <= 5 ? -.35 : 0) +
          ((x === 2 || x === 8) && y >= 2 && y <= 6 ? -.32 : 0) +
          ((x === 3 || x === 7) && y >= 6 ? -.25 : 0);
        const gap = ((x * 5 + y * 7 + layer * 3) % (layer < 4 ? 19 : 9)) === 0 ? .9 : 0;
        return Math.hypot(ax / 1.25, ay) + moduleBonus + gap;
      };
      const selectSymmetric = (count, layer) => {
        const t = layer / Math.max(1, layerTotal - 1);
        const rx = Math.max(1, Math.round(5 - t * 3.1));
        const ry = Math.max(1, Math.round(4 - t * 2.4));
        const raw = [];
        for(let y=0;y<=gridMaxY;y++) for(let x=0;x<=gridMaxX;x++){
          if(allowed(pileShape, x, y, rx, ry, layer)) raw.push({ x, y, d:pointScore(x, y, layer) });
        }
        const center = raw.filter(p => p.x === centerX).sort((a,b) => a.d - b.d);
        const pairs = [];
        raw.filter(p => p.x < centerX).forEach(left => {
          const right = raw.find(p => p.x === gridMaxX - left.x && p.y === left.y);
          if(right) pairs.push({ left, right, d:(left.d + right.d) / 2 });
        });
        pairs.sort((a,b) => a.d - b.d);
        const selected = [];
        if(count % 2 && center.length) selected.push(center[0]);
        pairs.forEach(pair => {
          if(selected.length + 2 <= count) selected.push(pair.left, pair.right);
        });
        center.slice(count % 2 ? 1 : 0).forEach(p => {
          if(selected.length < count) selected.push(p);
        });
        return selected.slice(0, count).map(p => ({ x:p.x, y:p.y }));
      };
      let iconIndex = 0, id = 0, tiles = [];
      counts.forEach((count, layer) => {
        selectSymmetric(count, layer).forEach(p => {
          tiles.push({ id:id++, icon:icons[iconIndex++], x:p.x, y:p.y, layer, gone:false });
        });
      });
      stackPlans.forEach(plan => {
        for(let i=0;i<plan.height;i++){
          tiles.push({
            id:id++,
            icon:icons[iconIndex++],
            x:plan.x,
            y:plan.y,
            layer:Math.min(layerTotal - 1, plan.baseLayer + i),
            gone:false
          });
        }
      });
      return tiles;
    };
    let tiles = Array.isArray(state?.tiles) && state.tiles.length ? state.tiles.map(t => Object.assign({}, t)) : makeTiles();
    let tray = Array.isArray(state?.tray) ? state.tray.slice(0, 8) : [];
    let hold = Array.isArray(state?.hold) ? state.hold.slice(0, 3) : [];
    let shuffles = state?.shuffles || 0, moveouts = state?.moveouts || 0, moveMode = false, over = false, seen = state?.seen || {};
    let details = state?.details || { matches:0, shuffles, moveouts, badLuck:false, fullTraySurvived:false, endlessLayers:1 };
    let consecutiveShuffles = state?.consecutiveShuffles || 0;
    box.innerHTML = '<div class="wb-uyangle-panel ' + (choice.compact ? 'wb-uyangle-hard' : '') + '"><div class="wb-uyangle-top"><span class="wb-pill" id="wb-uyangle-left"></span><span class="wb-pill" id="wb-uyangle-status"></span></div><div class="wb-uyangle-progress"><div class="wb-uyangle-progress-fill" id="wb-uyangle-progress-fill"></div><span id="wb-uyangle-progress-text"></span></div><div class="wb-uyangle-board" id="wb-uyangle-board"></div><div class="wb-uyangle-hold" id="wb-uyangle-hold"></div><div class="wb-uyangle-tray-wrap"><div class="wb-uyangle-tray" id="wb-uyangle-tray"></div></div><div class="wb-actions wb-uyangle-actions"><button type="button" class="wb-btn" id="wb-uyangle-moveout">移出 <span class="wb-sudoku-badge" id="wb-uyangle-move-badge">3</span></button><button type="button" class="wb-btn primary" id="wb-uyangle-shuffle">打乱 <span class="wb-sudoku-badge" id="wb-uyangle-shuffle-badge">0</span></button></div></div>';
    env.setScore('uyangle', 0); draw(); save();
    function save(){ if(!over) env.saveProgress('uyangle', Object.assign({ tiles, tray, hold, shuffles, moveouts, consecutiveShuffles, seen, details }, env.choiceSavePatch('uyangle', choice))); }
    function activeTiles(){ return tiles.filter(t => !t.gone); }
    function leftCount(){ return activeTiles().length; }
    function layerOffset(layer){
      const offsets = [
        { x:0, y:0 },
        { x:.38, y:.26 },
        { x:-.38, y:.26 },
        { x:.38, y:-.26 },
        { x:-.38, y:-.26 }
      ];
      return offsets[((layer % offsets.length) + offsets.length) % offsets.length];
    }
    function tilePos(tile){
      const off = layerOffset(tile.layer);
      return { x:tile.x + off.x, y:tile.y + off.y };
    }
    function renderMetrics(){
      const allPos = tiles.length ? tiles.map(tilePos) : [{ x:0, y:0 }];
      const minX = Math.min(...allPos.map(p => p.x)), maxX = Math.max(...allPos.map(p => p.x));
      const minY = Math.min(...allPos.map(p => p.y)), maxY = Math.max(...allPos.map(p => p.y));
      const edge = 6;
      return { minX, minY, spanX:Math.max(1, maxX - minX), spanY:Math.max(1, maxY - minY), edge };
    }
    function renderPoint(tile, metrics){
      const pos = tilePos(tile), m = metrics || renderMetrics();
      return {
        left:m.edge + (pos.x - m.minX) / m.spanX * (100 - m.edge * 2),
        top:m.edge + (pos.y - m.minY) / m.spanY * (100 - m.edge * 2)
      };
    }
    function uyangleBoardMetrics(board){
      const rect = board ? board.getBoundingClientRect() : null;
      const boardW = Math.max(1, rect?.width || 100);
      const boardH = Math.max(1, rect?.height || boardW);
      const mobileCss = (env.getHostWindow().innerWidth || 800) <= 768;
      const sample = board ? env.qs('.wb-uyangle-tile', board) : null;
      const sampleRect = sample ? sample.getBoundingClientRect() : null;
      const tileW = Math.max(1, sampleRect?.width || boardW * (mobileCss ? 8.6 : 7.8) / 100);
      const tileH = Math.max(1, sampleRect?.height || tileW);
      return { boardW, boardH, tileW, tileH };
    }
    function tileRectOnBoard(tile, metrics, boardMetrics){
      const pos = renderPoint(tile, metrics);
      const cx = pos.left / 100 * boardMetrics.boardW;
      const cy = pos.top / 100 * boardMetrics.boardH;
      return {
        left:cx - boardMetrics.tileW / 2,
        right:cx + boardMetrics.tileW / 2,
        top:cy - boardMetrics.tileH / 2,
        bottom:cy + boardMetrics.tileH / 2
      };
    }
    function rectsOverlap(a, b){
      const pad = 1;
      return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
    }
    function isBlocked(tile, board, metrics, boardMetrics){
      const m = metrics || renderMetrics();
      const bm = boardMetrics || uyangleBoardMetrics(board || env.qs('#wb-uyangle-board', box));
      const rect = tileRectOnBoard(tile, m, bm);
      return tiles.some(other => {
        if(other.gone || other.layer <= tile.layer) return false;
        return rectsOverlap(rect, tileRectOnBoard(other, m, bm));
      });
    }
    function miniHTML(card, cls, attrs){
      return card ? '<button type="button" class="wb-uyangle-mini '+(cls || '')+'" '+(attrs || '')+'>'+gameSpriteHTML('fruits',(Number(card.icon)-1)%12,'图块 '+card.icon)+'</button>' : '';
    }
    function slotsHTML(cards, pickable, size){
      return Array.from({ length:size || 7 }, (_, i) => '<div class="wb-uyangle-slot">' + (cards[i] ? miniHTML(cards[i], pickable ? 'pickable' : '', pickable ? 'data-i="'+i+'"' : '') : '') + '</div>').join('');
    }
    function removeTriple(icon){
      let need = 3, removed = 0;
      const take = arr => {
        for(let i=arr.length-1;i>=0 && need>0;i--) if(arr[i].icon === icon){ arr.splice(i,1); need--; removed++; }
      };
      take(tray); take(hold);
      if(removed === 3){
        details.matches++;
        consecutiveShuffles = 0;
      }
      return removed === 3;
    }
    function resolveTriples(){
      const counts = {};
      tray.concat(hold).forEach(c => counts[c.icon] = (counts[c.icon] || 0) + 1);
      let matched = 0;
      Object.keys(counts).forEach(icon => { while(counts[icon] >= 3){ if(removeTriple(+icon)){ counts[icon] -= 3; matched++; } else break; } });
      return matched;
    }
    function maybeSpeakMatch(beforeMatches, specialSpoken){
      if(specialSpoken) return;
      const beforeBucket = Math.floor(beforeMatches / 3);
      const afterBucket = Math.floor((details.matches || 0) / 3);
      if(afterBucket > beforeBucket) env.speak('uyangle','match');
    }
    function scoreNow(){ return env.scoreWithChoice('uyangle', Math.max(0, 5000 - Math.round(env.currentGameDurationMs() / 1000) * 4 - shuffles * 300), choice); }
    function extendEndless(){
      const next = makeTiles();
      const active = activeTiles();
      const offset = Math.max(-1, ...tiles.map(t => Number(t.id) || 0)) + 1;
      const minLayer = Math.min(0, ...active.map(t => Number(t.layer) || 0));
      const nextMaxLayer = Math.max(0, ...next.map(t => Number(t.layer) || 0));
      const layerDrop = minLayer - nextMaxLayer - 1;
      tiles = active.concat(next.map(t => Object.assign({}, t, { id:t.id + offset, layer:(Number(t.layer) || 0) + layerDrop })));
      seen.last10 = 0;
      details.endlessLayers = (details.endlessLayers || 1) + 1;
      draw();
      save();
    }
    function maybeExtendEndless(){
      if(!endless || over) return;
      const threshold = Math.max(50, Math.floor((choice.cards || 210) * .24));
      if(leftCount() <= threshold) extendEndless();
    }
    function finish(){
      if(endless){ extendEndless(); return; }
      const finalScore = scoreNow();
      env.setScore('uyangle', finalScore);
      details.shuffles = shuffles;
      details.moveouts = moveouts;
      over = true;
      env.clearProgress('uyangle');
      env.showGameOver('uyangle','U了个U完成','本局分数：'+finalScore+'分（'+choice.title+'），打乱'+shuffles+'次，移出'+moveouts+'次', null, { completed:true, shuffles, moveouts, difficulty:choice.title, fullTraySurvived:!!details.fullTraySurvived, usedAllMoveouts:moveouts >= 3, badLuck:!!details.badLuck, details });
    }
    function fail(){
      details.shuffles = shuffles;
      details.moveouts = moveouts;
      details.clearedCards = (details.matches || 0) * 3;
      over = true;
      env.speak('uyangle','gameover');
      env.clearProgress('uyangle');
      const text = endless ? ('已消除：' + (details.matches || 0) + '组，打乱' + shuffles + '次，移出' + moveouts + '次') : ('本局分数：0分（'+choice.title+'），打乱'+shuffles+'次，移出'+moveouts+'次');
      env.showGameOver('uyangle','游戏结束', text, null, { completed:false, shuffles, moveouts, difficulty:choice.title, fullTraySurvived:!!details.fullTraySurvived, usedAllMoveouts:moveouts >= 3, badLuck:!!details.badLuck, details });
    }
    function pick(id){
      if(env.gamePaused || over || moveMode) return;
      const tile = tiles.find(t => t.id === id && !t.gone);
      if(!tile || isBlocked(tile)) return;
      tile.gone = true;
      tray.push({ icon:tile.icon, id:'tray_' + tile.id + '_' + Date.now() });
      const beforeMatches = details.matches || 0;
      const matched = resolveTriples();
      let specialSpoken = false;
      if(tray.length > 7 && !matched){ fail(); return; }
      if(tray.length === 7) details.fullTraySurvived = true;
      if(leftCount() === 0 && tray.length === 0 && hold.length === 0){ finish(); return; }
      if(tray.length >= 6 && !seen.danger){ seen.danger=1; env.speak('uyangle','danger'); specialSpoken = true; }
      else if(!endless && leftCount() <= 10 && !seen.last10){ seen.last10=1; env.speak('uyangle','last_10'); specialSpoken = true; }
      maybeSpeakMatch(beforeMatches, specialSpoken);
      maybeExtendEndless();
      draw(); save();
    }
    function shuffleBoard(){
      if(env.gamePaused || over || shuffles >= SHUFFLE_MAX) return;
      const alive = activeTiles();
      if(!alive.length) return;
      const icons = env.shuffleArray(alive.map(t => t.icon));
      alive.forEach((t, i) => t.icon = icons[i]);
      shuffles++;
      details.shuffles = shuffles;
      consecutiveShuffles++;
      env.speak('uyangle','shuffle');
      if(consecutiveShuffles >= 2) details.badLuck = true;
      draw(); save();
    }
    function enableMoveOut(){
      if(env.gamePaused || over || moveouts >= 3 || !tray.length) return;
      moveMode = !moveMode;
      draw();
    }
    function moveOut(i){
      if(!moveMode || env.gamePaused || over || moveouts >= 3 || !tray[i]) return;
      hold.push(tray.splice(i,1)[0]);
      moveouts++;
      details.moveouts = moveouts;
      moveMode = false;
      consecutiveShuffles = 0;
      env.speak('uyangle','moveout');
      resolveTriples();
      if(leftCount() === 0 && tray.length === 0 && hold.length === 0){ finish(); return; }
      maybeExtendEndless();
      draw(); save();
    }
    function draw(){
      const board = env.qs('#wb-uyangle-board', box), alive = activeTiles();
      const cleared = Math.max(0, tiles.length - alive.length), progress = tiles.length ? Math.round(cleared / tiles.length * 100) : 0;
      env.qs('#wb-uyangle-left', box).textContent = endless ? '无尽模式' : ('剩余：' + alive.length);
      env.qs('#wb-uyangle-status', box).textContent = moveMode ? '选择要移出的槽牌' : ('槽位：' + tray.length + '/7');
      const progressWrap = env.qs('.wb-uyangle-progress', box);
      if(progressWrap) progressWrap.classList.toggle('wb-endless-counter', endless);
      env.qs('#wb-uyangle-progress-fill', box).style.width = endless ? '0%' : (progress + '%');
      env.qs('#wb-uyangle-progress-text', box).textContent = endless ? ('已消除 ' + (details.matches || 0) + ' 组') : ('进度 ' + progress + '%');
      env.qs('#wb-uyangle-move-badge', box).textContent = String(Math.max(0, 3 - moveouts));
      env.qs('#wb-uyangle-shuffle-badge', box).textContent = String(Math.max(0, SHUFFLE_MAX - shuffles));
      const metrics = renderMetrics(), boardMetrics = uyangleBoardMetrics(board);
      const minLayer = alive.length ? Math.min(...alive.map(t => Number(t.layer) || 0)) : 0;
      board.innerHTML = alive.slice().sort((a,b) => a.layer - b.layer || a.id - b.id).map(t => {
        const blocked = isBlocked(t, board, metrics, boardMetrics), pos = renderPoint(t, metrics);
        return '<button type="button" class="wb-uyangle-tile '+(blocked?'blocked':'')+'" data-id="'+t.id+'" style="left:'+pos.left+'%;top:'+pos.top+'%;z-index:'+(10 + (Number(t.layer) || 0) - minLayer)+';" '+(blocked?'disabled':'')+'>'+gameSpriteHTML('fruits',(Number(t.icon)-1)%12,'图块 '+t.icon)+'</button>';
      }).join('');
      env.qsa('.wb-uyangle-tile:not(:disabled)', board).forEach(btn => btn.onclick = () => pick(+btn.dataset.id));
      env.qs('#wb-uyangle-hold', box).innerHTML = slotsHTML(hold, false, 3);
      const trayEl = env.qs('#wb-uyangle-tray', box);
      trayEl.innerHTML = slotsHTML(tray, moveMode, 7);
      env.qsa('.wb-uyangle-mini.pickable', trayEl).forEach(btn => btn.onclick = () => moveOut(+btn.dataset.i));
      const moveBtn = env.qs('#wb-uyangle-moveout', box);
      moveBtn.disabled = moveouts >= 3 || !tray.length;
      moveBtn.classList.toggle('primary', moveMode);
      const shuffleBtn = env.qs('#wb-uyangle-shuffle', box);
      shuffleBtn.disabled = shuffles >= SHUFFLE_MAX || !alive.length;
      shuffleBtn.classList.toggle('disabled', shuffleBtn.disabled);
    }
    env.qs('#wb-uyangle-shuffle', box).onclick = shuffleBoard;
    env.qs('#wb-uyangle-moveout', box).onclick = enableMoveOut;
  }
  startUYangLe(state);
  return env.activeGameController || null;
}
