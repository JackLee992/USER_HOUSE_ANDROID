// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'guessnumber';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["esc","gamePaused","isMobileHost","qs","qsa","saveProgress","scores","setScore","showGameOver","shuffleArray","speak","toast"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export function createGame(env, state) {
  function startGuessNumber(state) {
    const box = env.qs('#wb-gamebox');
    let answer = state?.answer || env.shuffleArray('0123456789'.split('')).slice(0,4).join('');
    let tries = state?.tries || 0, history = Array.isArray(state?.history) ? state.history : [], over=false;
    const mobileInput = env.isMobileHost();
    box.innerHTML = '<div class="wb-guess-panel wb-number-guess"><div class="wb-guess-title">猜数字</div><div class="wb-muted">角色想好了一个四位数。输入四位不重复数字，提示会显示“数字对几个、位置对几个”。</div><div class="wb-guess-row"><input class="wb-input" id="wb-num-guess" inputmode="' + (mobileInput ? 'none' : 'numeric') + '" maxlength="4" placeholder="输入四位数" ' + (mobileInput ? 'readonly autocomplete="off"' : '') + '><button class="wb-btn primary" id="wb-num-submit">猜</button></div><div class="wb-num-keypad" id="wb-num-keypad">' + '1234567890'.split('').map(n=>'<button class="wb-btn" data-num="'+n+'" type="button">'+n+'</button>').join('') + '<button class="wb-btn" data-act="back" type="button">退格</button><button class="wb-btn" data-act="clear" type="button">清空</button></div><div class="wb-guess-history" id="wb-num-history"></div></div>';
    draw(); save();
    env.qs('#wb-num-submit').onclick = submit; env.qs('#wb-num-guess').onkeydown = e => { if(e.key==='Enter') submit(); };
    env.qsa('#wb-num-keypad .wb-btn', box).forEach(btn => btn.onclick = () => { const input=env.qs('#wb-num-guess'); if(!input) return; if(btn.dataset.num){ if(input.value.length<4 && !input.value.includes(btn.dataset.num)) input.value += btn.dataset.num; if(!mobileInput) input.focus(); return; } if(btn.dataset.act==='back') input.value=input.value.slice(0,-1); if(btn.dataset.act==='clear') input.value=''; if(!mobileInput) input.focus(); });
    function save(){ if(!over) env.saveProgress('guessnumber', { answer, tries, history }); }
    function hintText(guess, nums, pos){ return '数字对 ' + nums + ' 个，位置对 ' + pos + ' 个。'; }
    function submit(){ if(env.gamePaused||over) return; const input=env.qs('#wb-num-guess'); const g=(input.value||'').trim(); if(!/^\d{4}$/.test(g) || new Set(g).size!==4){ env.toast('请输入四位不重复数字'); return; } tries++; let pos=0, nums=0; for(let i=0;i<4;i++){ if(g[i]===answer[i]) pos++; if(answer.includes(g[i])) nums++; } const text=hintText(g, nums, pos); history.unshift({ guess:g, nums, pos, text }); input.value=''; if(pos===4){ over=true; const cur=env.scores().guessnumber; env.setScore('guessnumber', ((cur&&typeof cur==='object'?cur.user:cur)||0)+1); env.speak('guessnumber','user_win'); draw(); env.showGameOver('guessnumber','你猜中了','猜数次数：'+tries+'次', 'user_win', { tries, details:{ guesses:history.slice().reverse().map(x=>({ guess:x.guess, nums:x.nums, pos:x.pos })) } }); return; } if(tries>=6) env.speak('guessnumber','many_tries'); else env.speak('guessnumber', pos>=3||nums>=4?'very_close':(pos>=2||nums>=3?'close':(nums===0?'miss':'guess'))); draw(); save(); }
    function draw(){ const h=env.qs('#wb-num-history'); h.innerHTML = history.length ? history.map(x=>'<div class="wb-guess-item"><b>'+env.esc(x.guess)+'</b>　'+env.esc(hintText(x.guess, x.nums, x.pos))+'</div>').join('') : '<div class="wb-muted">还没有猜测记录。</div>'; }
  }
  startGuessNumber(state);
  return env.activeGameController || null;
}
