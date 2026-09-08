import { gameSpriteHTML } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'memory';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["GAME_ICON_BASE","clearProgress","esc","gamePaused","qs","qsa","saveMemoryBestMoves","saveProgress","setScore","showGameOver","shuffleArray","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startMemory(state) {
    const box = env.qs('#wb-gamebox');
    const icons = Array.from({ length: 8 }, (_, i) => 'memory-' + (i + 1));
    let cards = Array.isArray(state?.cards) && state.cards.length === 16 && /^memory-\d+$/.test(String(state.cards[0]?.v || '')) ? state.cards : env.shuffleArray(icons.concat(icons).map((v,i)=>({ v, id:i, open:false, done:false })));
    let open = Array.isArray(state?.open) ? state.open : [], moves = state?.moves || 0, matched = state?.matched || 0, combo = state?.combo || 0, busy = false, over = false, seen = state?.seen || {};
    let details = state?.details || { flipCounts:{}, firstTryPairs:0, threePlusTryPairs:0, maxFlipsForOneCard:0 };
    box.innerHTML = '<div class="wb-guess-panel wb-memory-panel"><div class="wb-guess-row"><span class="wb-pill" id="wb-memory-moves">步数：0</span><span class="wb-pill" id="wb-memory-pairs">配对：0/8</span></div><div class="wb-memory" id="wb-memory-board"></div></div>';
    draw(); save();
    function score(){ return Math.max(0, 1200 - moves * 25 + matched * 80); }
    function save(){ if(!over) env.saveProgress('memory', { cards, open, moves, matched, combo, seen, details }); }
    function memoryCardFace(c){ return gameSpriteHTML('fruits',Math.max(0,Math.min(7,Number(c.v.split('-')[1])-1)),c.v); }
    function memoryCardHTML(c,i){ return '<button class="wb-memory-card' + (c.open?' open':'') + (c.done?' done':'') + '" data-i="'+i+'"><span class="wb-memory-inner"><span class="wb-memory-face wb-memory-back"></span><span class="wb-memory-face wb-memory-front">' + memoryCardFace(c) + '</span></span></button>'; }
    function draw(){ const board = env.qs('#wb-memory-board'); if (!board) return; env.qs('#wb-memory-moves').textContent = '步数：' + moves; env.qs('#wb-memory-pairs').textContent = '配对：' + matched + '/8'; env.setScore('memory', score()); board.innerHTML = cards.map(memoryCardHTML).join(''); env.qsa('.wb-memory-card', board).forEach(btn => btn.onclick = () => flip(+btn.dataset.i)); }
    function flip(i){ if(env.gamePaused||busy||over||cards[i].done||cards[i].open||open.length>=2) return; if(moves===0&&open.length===0) env.speak('memory','first_flip'); details.flipCounts[i] = (details.flipCounts[i] || 0) + 1; details.maxFlipsForOneCard = Math.max(details.maxFlipsForOneCard || 0, details.flipCounts[i]); cards[i].open = true; open.push(i); draw(); if(open.length===2){ moves++; const a=cards[open[0]], b=cards[open[1]]; if(a.v===b.v){ const pairFlips = Math.max(details.flipCounts[open[0]] || 0, details.flipCounts[open[1]] || 0); if(pairFlips <= 1) details.firstTryPairs++; if(pairFlips >= 3) details.threePlusTryPairs++; a.done=b.done=true; matched++; combo++; open=[]; env.speak('memory', combo>=2?'combo':'match'); if(matched===4) env.speak('memory','half'); if(matched===7&&!seen.gameover){ seen.gameover=1; env.speak('memory','gameover'); } if(matched===8){ over=true; env.clearProgress('memory'); env.setScore('memory', score()); env.saveMemoryBestMoves(moves); if(!seen.gameover) env.speak('memory','gameover'); env.showGameOver('memory','配对完成','本局分数：'+score()+'分', null, { details }); return; } draw(); save(); } else { combo=0; env.speak('memory','miss'); busy=true; setTimeout(()=>{ cards[open[0]].open=false; cards[open[1]].open=false; open=[]; busy=false; draw(); save(); }, 650); } } else save(); }
  }
  startMemory(state);
  return env.activeGameController || null;
}
