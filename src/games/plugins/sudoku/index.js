// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'sudoku';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["choiceForState","choiceSavePatch","clearProgress","currentGameDurationMs","gamePaused","getHostDocument","isValidSudokuProgressState","isValidSudokuPuzzle","qs","qsa","saveProgress","scoreWithChoice","setScore","settings","showGameOver","shuffleArray","speak","sudokuScore","toast"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startSudoku(state) {
    const box = env.qs('#wb-gamebox');
    const choice = env.choiceForState('sudoku', state);
    const resume = env.isValidSudokuProgressState(state) ? state : null;
    const made = resume && env.isValidSudokuPuzzle(resume.puzzle, resume.solution) ? { puzzle: resume.puzzle.slice(), solution: resume.solution.slice() } : makeSudoku(choice);
    let puzzle = made.puzzle, solution = made.solution;
    let grid = Array.isArray((resume || state)?.grid) && (resume || state).grid.length === 81 ? (resume || state).grid.slice(0, 81) : puzzle.slice();
    grid = Array.from({ length: 81 }, (_, i) => puzzle[i] || (Number.isInteger(grid[i]) && grid[i] >= 1 && grid[i] <= 9 ? grid[i] : 0));
    let selected = Number.isInteger((resume || state)?.selected) ? (resume || state).selected : -1, hints = (resume || state)?.hints || 0, over = false, seen = (resume || state)?.seen || {};
    let details = (resume || state)?.details || { hints:hints, edits:0, editCounts:{}, maxEditsOneCell:0, finalErrors:0 };
    box.innerHTML = '<div class="wb-sudoku-panel"><div class="wb-sudoku-top"><span class="wb-pill" id="wb-sudoku-clues"></span><span class="wb-pill" id="wb-sudoku-hints"></span></div><div id="wb-sudoku-board"></div><div class="wb-actions wb-sudoku-tools"><button type="button" class="wb-btn" id="wb-sudoku-erase">擦除</button><button type="button" class="wb-btn primary" id="wb-sudoku-hint">提示 <span class="wb-sudoku-badge" id="wb-sudoku-hint-badge">0</span></button></div><div class="wb-sudoku-nums">' + Array.from({length:9},(_,i)=>'<button type="button" class="wb-btn" data-n="'+(i+1)+'">'+(i+1)+'</button>').join('') + '</div></div>';
    draw(); save(true);
    function save(force){ if(!over) env.saveProgress('sudoku', Object.assign({ puzzle, solution, grid, selected, hints, seen, details }, env.choiceSavePatch('sudoku', choice)), force ? { immediate:true } : undefined); }
    function row(i){ return Math.floor(i/9); } function col(i){ return i%9; }
    function completeLine(kind, n){ for(let i=0;i<9;i++){ const idx=kind==='r'?n*9+i:i*9+n; if(grid[idx]!==solution[idx]) return false; } return true; }
    function solutionErrors(){ return grid.reduce((sum, v, i) => sum + (v && v !== solution[i] ? 1 : 0), 0); }
    function maybeSudokuGameoverLine(blanks, errors){ if(!seen.gameover && (blanks===1 || errors===1)){ seen.gameover=1; env.speak('sudoku','gameover'); } }
    function hasRuleConflict(i){
      const v = grid[i]; if(!v) return false;
      const r = row(i), c = col(i), br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for(let k=0;k<9;k++){ if(k!==c && grid[r*9+k]===v) return true; if(k!==r && grid[k*9+c]===v) return true; }
      for(let y=br;y<br+3;y++) for(let x=bc;x<bc+3;x++){ const j=y*9+x; if(j!==i && grid[j]===v) return true; }
      return false;
    }
    function draw(){
      const board = env.qs('#wb-sudoku-board', box);
      const full = grid.every(Boolean), errors = full ? solutionErrors() : 0;
      env.qs('#wb-sudoku-clues', box).textContent = full && errors ? '错误：' + errors + '格' : ('题面：' + puzzle.filter(Boolean).length + '格');
      env.qs('#wb-sudoku-hints', box).innerHTML = '提示：<b>' + hints + '</b>';
      const badge = env.qs('#wb-sudoku-hint-badge', box); if (badge) badge.textContent = String(hints);
      board.className = 'wb-sudoku-board';
      board.style.cssText = 'width:100%;max-width:min(390px,64cqh);max-height:100%;aspect-ratio:1/1;position:relative;box-sizing:border-box;border:2px solid var(--wb-text);background:var(--wb-text);overflow:hidden;flex:0 0 auto;';
      const selectedFixed = selected >= 0 && !!puzzle[selected];
      const theme = env.settings().theme || 'day';
      const mono = theme === 'mono', cardTheme = theme === 'card';
      if(cardTheme) board.style.cssText = 'width:100%;max-width:min(390px,64cqh);max-height:100%;aspect-ratio:1/1;position:relative;box-sizing:border-box;border:2px solid rgba(245,201,104,.72);background:#F5C968;overflow:hidden;flex:0 0 auto;box-shadow:0 16px 34px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.04) inset;';
      const same = selectedFixed ? puzzle[selected] : 0, sr=row(selected), sc=col(selected);
      board.innerHTML = Array.from({length:81},(_,i)=>{
        const r = row(i), c = col(i), v = grid[i] || 0;
        const fixed = !!puzzle[i], sel = i === selected, peer = selected >= 0 && (r === sr || c === sc);
        const sameNum = !!(same && fixed && puzzle[i] === same), wrong = !fixed && hasRuleConflict(i);
        const monoDarkFixed = mono && selectedFixed && (sameNum || sel);
        const bg = cardTheme ? (sameNum ? '#F5C968' : (sel ? '#3A0710' : (peer ? (fixed ? '#351018' : '#19080B') : (fixed ? '#2A0B12' : '#0B0506')))) : (monoDarkFixed ? '#111' : (sameNum ? 'var(--wb-gold)' : (peer ? (fixed ? 'var(--wb-soft)' : 'var(--wb-panel)') : (fixed ? 'var(--wb-soft)' : 'var(--wb-panel)'))));
        const color = wrong ? (cardTheme ? '#FF6B7A' : '#ef4444') : (cardTheme ? (sameNum ? '#160608' : (fixed ? '#F5C968' : '#F8EFE7')) : (monoDarkFixed ? '#fff' : 'var(--wb-text)'));
        const line = cardTheme ? 'rgba(245,201,104,.24)' : 'var(--wb-border)', heavy = cardTheme ? 'rgba(245,201,104,.82)' : 'var(--wb-text)';
        const border = 'border-left:'+(c%3===0?'1.5px solid '+heavy:'1px solid '+line)+';border-right:'+(c%3===2?'1.5px solid '+heavy:'1px solid '+line)+';border-top:'+(r%3===0?'1.5px solid '+heavy:'1px solid '+line)+';border-bottom:'+(r%3===2?'1.5px solid '+heavy:'1px solid '+line)+';';
        const outline = sel ? 'outline:2px solid '+(cardTheme ? '#C9182B' : 'var(--wb-accent)')+';outline-offset:-3px;' : '';
        const shadow = wrong ? 'box-shadow:inset 0 0 0 2px '+(cardTheme ? '#FF3048' : '#ef4444')+';' : (peer && !sameNum ? 'box-shadow:inset 0 0 0 999px '+(cardTheme ? 'rgba(201,24,43,.13)' : 'rgba(125,185,216,.10)')+';' : '');
        const cls = ['wb-sudoku-tile', fixed?'fixed':'mutable', sel?'sel':'', peer?'peer':'', sameNum?'same':'', wrong?'wrong':''].filter(Boolean).join(' ');
        return '<button type="button" data-sudoku-cell="1" data-i="'+i+'" class="'+cls+'" style="position:absolute;left:'+((c*100)/9)+'%;top:'+((r*100)/9)+'%;width:'+(100/9)+'%;height:'+(100/9)+'%;display:flex;align-items:center;justify-content:center;margin:0;padding:0;box-sizing:border-box;border-radius:0;font-weight:900;font-size:clamp(15px,3.1vh,24px);line-height:1;background:'+bg+';color:'+color+';'+border+outline+shadow+'">'+(v ? String(v) : '')+'</button>';
      }).join('');
      env.qsa('[data-sudoku-cell]', board).forEach(b=>b.onclick=()=>{ selected=+b.dataset.i; draw(); save(true); });
    }
    function markEdit(i){ details.edits++; details.editCounts[i] = (details.editCounts[i] || 0) + 1; details.maxEditsOneCell = Math.max(details.maxEditsOneCell || 0, details.editCounts[i]); }
    function input(n){ if(env.gamePaused||over||selected<0||puzzle[selected]) return; if(!seen.first){ seen.first=1; env.speak('sudoku','first_fill'); } markEdit(selected); grid[selected]=n; if(hasRuleConflict(selected)) env.speak('sudoku','conflict'); if(completeLine('r',row(selected))&&!seen['r'+row(selected)]){ seen['r'+row(selected)]=1; env.speak('sudoku','row_done'); } if(completeLine('c',col(selected))&&!seen['c'+col(selected)]){ seen['c'+col(selected)]=1; env.speak('sudoku','col_done'); } const blanks=grid.filter(v=>!v).length; if(blanks<=5&&!seen.near){ seen.near=1; env.speak('sudoku','nearly_done'); } const errors=solutionErrors(); maybeSudokuGameoverLine(blanks, errors); if(blanks===0) details.finalErrors = errors; draw(); save(true); if(blanks===0 && errors===0) done(); else if(blanks===0){ env.speak('sudoku','complete_error'); env.toast('已填满，当前错误 ' + errors + ' 格，可以继续修改'); } }
    function erase(){ if(selected<0||puzzle[selected]) return; markEdit(selected); grid[selected]=0; env.speak('sudoku','erase'); maybeSudokuGameoverLine(grid.filter(v=>!v).length, solutionErrors()); draw(); save(true); }
    function hint(){ let i = selected>=0 && !puzzle[selected] && grid[selected]!==solution[selected] ? selected : -1; if(i<0) i=grid.findIndex((v,k)=>!puzzle[k] && v && v!==solution[k]); if(i<0) i=grid.findIndex((v,k)=>!puzzle[k] && !v); if(i<0) return; hints++; details.hints = hints; selected=i; markEdit(i); grid[i]=solution[i]; puzzle[i]=solution[i]; env.speak('sudoku', hints>5?'many_hints':'hint'); maybeSudokuGameoverLine(grid.filter(v=>!v).length, solutionErrors()); draw(); save(true); if(grid.every(Boolean) && solutionErrors()===0) done(); }
    function done(){ const duration = env.currentGameDurationMs(), finalScore = env.scoreWithChoice('sudoku', env.sudokuScore(duration, hints), choice); env.setScore('sudoku', finalScore); details.finalErrors = solutionErrors(); over=true; env.clearProgress('sudoku'); if(!seen.gameover) env.speak('sudoku','gameover'); env.showGameOver('sudoku','数独完成','本局分数：'+finalScore+'分（'+choice.title+'），求助'+hints+'次', null, { hints, score:finalScore, difficulty:choice.title, details }); }
    env.qs('#wb-sudoku-erase', box).onclick=erase; env.qs('#wb-sudoku-hint', box).onclick=hint; env.qsa('.wb-sudoku-nums .wb-btn', box).forEach(b=>b.onclick=()=>input(+b.dataset.n));
    env.getHostDocument().onkeydown=e=>{ if(/^[1-9]$/.test(e.key)) input(+e.key); if(e.key==='Backspace'||e.key==='Delete') erase(); };
    function parseSudoku(str){ return String(str).replace(/\./g,'0').split('').map(x=>parseInt(x,10)||0); }
    function makeSudoku(choiceCfg){
      const bases=[
        ['53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79','534678912672195348198342567859761423426853791713924856961537284287419635345286179'],
        ['..3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..','483921657967345821251876493548132976729564138136798245372689514814253769695417382']
      ];
      const pick=bases[Math.floor(Math.random()*bases.length)], puz0=parseSudoku(pick[0]), sol0=parseSudoku(pick[1]);
      const map={}; env.shuffleArray([1,2,3,4,5,6,7,8,9]).forEach((n,i)=>map[i+1]=n);
      const bandRows=env.shuffleArray([0,1,2]).flatMap(b=>env.shuffleArray([0,1,2]).map(r=>b*3+r));
      const bandCols=env.shuffleArray([0,1,2]).flatMap(b=>env.shuffleArray([0,1,2]).map(c=>b*3+c));
      const transform=arr=>Array.from({length:81},(_,i)=>{ const r=bandRows[row(i)], c=bandCols[col(i)], v=arr[r*9+c]; return v ? map[v] : 0; });
      const solution = transform(sol0);
      if (choiceCfg && Array.isArray(choiceCfg.blanks)) {
        const blanks = choiceCfg.blanks[0] + Math.floor(Math.random() * (choiceCfg.blanks[1] - choiceCfg.blanks[0] + 1));
        const puzzle = solution.slice();
        env.shuffleArray(Array.from({ length:81 }, (_, i) => i)).slice(0, blanks).forEach(i => puzzle[i] = 0);
        return { puzzle, solution };
      }
      return { puzzle:transform(puz0), solution };
    }
  }
  startSudoku(state);
  return env.activeGameController || null;
}
