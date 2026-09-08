// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'wordguess';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze(["PROMPT_TEMPLATES","addTaWin","appendModalMask","callApiText","clearProgress","currentCharDescription","currentGame","defaultWordGuessBank","displayCharName","esc","gamePaused","getHostDocument","modalMaskClass","normalizeWordGuessRoundData","parseGeneratedJson","promptTemplates","qs","saveProgress","scores","selectWordGuessRounds","selectedSummaryText","selectedWordGuessRoleName","selectedWorldText","setScore","settings","showGameOver","speak","speakText","toast","wordGuessBank","wordGuessBankSource"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.
export async function createGame(env, state) {
  async function startWordGuess(state) {
	    const cfg=env.settings(); const box=env.qs('#wb-gamebox');
	    const role = env.displayCharName();
		    const roleKey = env.selectedWordGuessRoleName();
		    const source = env.wordGuessBankSource();
		    const rawBank = !state ? (source === 'default' ? await env.defaultWordGuessBank() : env.wordGuessBank(roleKey)) : [];
		    const bank = !state ? env.selectWordGuessRounds(rawBank, 5, '') : [];
	    if (!state && !rawBank.length) box.innerHTML='<div class="wb-guess-panel"><div class="wb-guess-title">我说你猜</div><div class="wb-api-status wb-clue-box">当前角色题库为空，正在抽取默认题库...</div></div>';
		    function normalizeWordRound(item){ const normalized=env.normalizeWordGuessRoundData(item); if(normalized) return normalized; const word=String(item?.word||'').trim(); if(!word) return null; const clues=Array.isArray(item.clues)?item.clues.map(x=>String(x).trim()).filter(Boolean).slice(0,5):[]; while(clues.length<5) clues.push(clues[clues.length-1] || '这个词和现在的场景有关，你再靠近一点想。'); const raw=item.interactions||{}; return { word, type:String(item.type||'未分类'), length:parseInt(item.length,10)||word.length, clues, interactions:{ start:String(raw.start||('我把“' + word + '”藏好了，先从很远的地方说起。')), clue:Array.isArray(raw.clue)?raw.clue:String(raw.clue||'我再换一种说法，你听听是不是离它近一点。'), clue_late:String(raw.clue_late||'这个提示已经很近了，再往前一点就要碰到答案了。'), guess:Array.isArray(raw.guess)?raw.guess:String(raw.guess||'这个方向还差一点，我把线索再往它身边推近些。'), win:String(raw.win||('猜中了，答案就是“' + word + '”。')), reveal:String(raw.reveal||('答案是“' + word + '”。' + role + '把它念出来，像把这题轻轻收好。')) } }; }
	    const roundLimit = 5;
		    let rounds = Array.isArray(state?.rounds) && state.rounds.length ? state.rounds : (state?.round ? [state.round] : (bank.length ? bank.slice(0, roundLimit) : await createWordGuessRounds(roundLimit, true, '')));
		    rounds = rounds.map(normalizeWordRound).filter(Boolean);
		    if (!state && rounds.length < roundLimit) { const seen={}; rounds.forEach(r=>seen[r.word]=1); const more=(await createWordGuessRounds(roundLimit, true, '')).map(normalizeWordRound).filter(r=>r&&!seen[r.word]); rounds = rounds.concat(more).slice(0,roundLimit); }
		    if (!rounds.length && !state) rounds = await createWordGuessRounds(roundLimit, true, '');
	    if (env.currentGame !== 'wordguess') return;
		    let round = rounds[0];
	    round = normalizeWordRound(round) || round;
	    let over=false;
    let userWins = state?.userWins || 0, taWins = state?.taWins || 0, completed = state?.completed || 0, firstClueWin = !!state?.firstClueWin, finalLineSpoken = !!state?.finalLineSpoken;
	    let details = state?.details || { rounds:[] };
	    function finishGame(){ over=true; env.clearProgress('wordguess'); const userWon=userWins > (roundLimit - userWins); env.showGameOver('wordguess', userWon?'你赢了':'游戏结束', '本局：你猜中'+userWins+'题，共'+roundLimit+'题', userWon?'user_win':'ta_win', { firstClueWin, allCorrect: userWins >= roundLimit, userWins, completed: roundLimit, details }); }
	    if (!round || completed >= roundLimit) { finishGame(); return; }
	    let clueIndex = state?.clueIndex || 0, guesses = (state?.roundWord === round.word && Array.isArray(state?.guesses)) ? state.guesses : [], revealed=!!state?.revealed;
	    box.innerHTML='<div class="wb-guess-panel"><div class="wb-guess-title">我说你猜</div><div class="wb-word-meta" id="wb-word-meta"></div><div class="wb-api-status wb-clue-box" id="wb-word-clues"></div><div class="wb-guess-row"><input class="wb-input" id="wb-word-input" placeholder="输入你猜的词"><button class="wb-btn primary" id="wb-word-submit">猜</button><button class="wb-btn" id="wb-word-next">下一个描述</button><button class="wb-btn" id="wb-word-reveal">揭晓答案</button></div><div class="wb-guess-history" id="wb-word-history"></div></div>';
	    draw(); save();
	    if (!state?.roundWord) env.speakText(round.interactions.start);
	    env.qs('#wb-word-submit').onclick=submit; env.qs('#wb-word-next').onclick=nextClue; env.qs('#wb-word-reveal').onclick=reveal; env.qs('#wb-word-input').onkeydown=e=>{ if(e.key==='Enter') submit(); };
	    function save(){ if(!over) env.saveProgress('wordguess',{ rounds, roundWord:round.word, clueIndex, guesses, userWins, taWins, completed, revealed, firstClueWin, finalLineSpoken, details }); }
	    function visibleClues(){ return round.clues.slice(0, Math.max(1, Math.min(5, clueIndex+1))); }
		    function nextClue(){ if(env.gamePaused||over) return; if(clueIndex < Math.min(5, round.clues.length)-1){ clueIndex++; const inter=round.interactions||{}; const nextLines=Array.isArray(inter.clue)?inter.clue:[]; env.speakText(nextLines[clueIndex-1] || inter[clueIndex>=3?'clue_late':'clue']); draw(); save(); } else env.toast('这题已经是最后一条描述了'); }
	    function finishQuestion(userWon, label){
	      if(userWon){ if(clueIndex===0) firstClueWin = true; userWins++; const cur=env.scores().wordguess; env.setScore('wordguess', ((cur&&typeof cur==='object'?cur.user:cur)||0)+1); }
      else { taWins++; env.addTaWin('wordguess'); }
	      completed++;
	      const inter=round.interactions||{};
	      guesses.unshift({ guess:label, ok:!!userWon, text:userWon ? (inter.win || ('答案是：' + round.word + '。' + role + '眼睛一亮：“猜中了，就是它。”')) : (inter.reveal || ('答案是：' + round.word + '。' + role + '把答案轻轻念出来，这一题先收好。')) });
	      details.rounds.push({ word:round.word, clues:(round.clues || []).slice(0,5), guesses:guesses.map(g=>g.guess).reverse(), winClueIndex:userWon ? (clueIndex + 1) : 0 });
	      env.speakText(guesses[0].text);
      if(!finalLineSpoken && (userWins >= 3 || taWins >= 3)){ finalLineSpoken = true; env.speak('wordguess', userWins >= 3 ? 'user_win' : 'user_lose'); }
      draw(); save();
      showWordNextModal(userWon, guesses[0].text);
    }
    function advanceQuestion(){
      if(completed >= roundLimit){ finishGame(); return; }
      rounds.shift();
	      if(!rounds.length){ finishGame(); return; }
      round=normalizeWordRound(rounds[0]) || rounds[0]; rounds[0]=round; clueIndex=0; guesses=[]; revealed=false; draw(); save(); env.speakText((round.interactions||{}).start);
    }
    function showWordNextModal(userWon, text){
      const doc=env.getHostDocument(); const old=env.qs('#wb-word-next-mask', doc); if(old) old.remove();
      const mask=doc.createElement('div'); mask.className=env.modalMaskClass(); mask.id='wb-word-next-mask';
      mask.innerHTML='<div class="wb-modal"><div class="wb-modal-title">' + (userWon?'猜中了':'答案已揭晓') + '</div><div class="wb-api-status" style="margin-bottom:12px;">' + env.esc(text || '') + '</div><div class="wb-actions"><button class="wb-btn primary" id="wb-word-go-next">进入下一题</button></div></div>';
      env.appendModalMask(mask);
      env.qs('#wb-word-go-next', mask).onclick=()=>{ mask.remove(); advanceQuestion(); };
    }
	    function reveal(){ if(env.gamePaused||over||revealed) return; revealed=true; clueIndex=Math.min(4, round.clues.length-1); finishQuestion(false, '揭晓答案'); }
		    function submit(){ if(env.gamePaused||over) return; const input=env.qs('#wb-word-input'); const guess=(input.value||'').trim(); if(!guess){ env.toast('请输入猜测'); return; } input.value=''; if(guess===round.word){ finishQuestion(true, guess); } else { const inter=round.interactions||{}; const wrong=Array.isArray(inter.guess)?inter.guess:[]; guesses.unshift({ guess, ok:false, text: wrong[Math.min(wrong.length-1, guesses.filter(g=>!g.ok).length)] || inter.guess || (role + '轻轻摇头，又把提示说得更软了一点。') }); env.speakText(guesses[0].text); draw(); save(); } }
    function draw(){ env.qs('#wb-word-meta').textContent = '第 ' + (completed+1) + ' 题　字数：' + (round.length || (round.word || '').length) + ' 字　类型：' + (round.type || '未分类') + '　' + visibleClues().length + '/5　你赢：' + userWins; env.qs('#wb-word-clues').textContent = visibleClues().map((c,i)=>(i+1)+'. '+c).join('\n') + (revealed ? '\n\n答案：' + round.word : ''); env.qs('#wb-word-history').innerHTML = guesses.length ? guesses.map(g=>'<div class="wb-guess-item"><b>'+env.esc(g.guess)+'</b>　'+(g.ok?'你赢':'未中')+'<br>'+env.esc(g.text)+'</div>').join('') : '<div class="wb-muted">还没有猜测。</div>'; }
  }

  async function createWordGuessRounds(count, forceFallback, scope) {
    const cfg=env.settings();
    const role = env.displayCharName();
    const normalize = item => env.normalizeWordGuessRoundData(item) || (() => { const word=String(item?.word||'').trim(); if(!word) return null; const clues=Array.isArray(item.clues)?item.clues.map(x=>String(x).trim()).filter(Boolean).slice(0,5):[]; while(clues.length<5) clues.push(clues[clues.length-1] || '这个词和现在的场景有关，你再靠近一点想。'); const raw=item.interactions||{}; const interactions={ start:String(raw.start||('我把“' + word + '”藏好了，先给你一条不太好猜的线。')), clue:String(raw.clue||'我再换一种说法，你听听是不是离它近一点。'), clue_late:String(raw.clue_late||'这个提示已经很近了，再往前一点就要碰到答案了。'), guess:String(raw.guess||'这个答案还没贴到它的影子，我再把线索往它身边推一点。'), win:String(raw.win||('猜中了。' + role + '把“' + word + '”轻轻重复了一遍，像确认你们刚才抓住了同一个小秘密。')), reveal:String(raw.reveal||('答案是“' + word + '”。' + role + '把它说出来时，语气里带着一点只属于这个词的温柔。')) }; return { word, type:String(item.type||'未分类'), length:parseInt(item.length,10)||word.length, clues, interactions }; })();
    const fallback = async () => env.selectWordGuessRounds((await env.defaultWordGuessBank()).map(normalize).filter(Boolean), Math.max(5, count || 5), scope);
    if (forceFallback || !cfg.apiUrl || !cfg.apiModel) return fallback();
	    const prompt = [...(env.promptTemplates().wordGuess || env.PROMPT_TEMPLATES.wordGuess), scope ? ('题库生成内容和范围：' + scope + '\n请只围绕这个范围出题。') : '', '角色描述：'+env.currentCharDescription(cfg), '世界背景：'+(env.selectedWorldText(cfg)||'无'), '大总结：'+(env.selectedSummaryText(cfg)||'无')].filter(Boolean).join('\n');
	    try { const txt = await env.callApiText(cfg, prompt, env.promptTemplates().systems.wordGuess || env.PROMPT_TEMPLATES.systems.wordGuess); const data = env.parseGeneratedJson(txt); const arr = Array.isArray(data) ? data : (Array.isArray(data?.rounds) ? data.rounds : []); const seenWords = {}; const rounds = arr.map(normalize).filter(Boolean).filter(r=>{ if(seenWords[r.word]) return false; seenWords[r.word]=1; return true; }); if(rounds.length>=5) return rounds; const fb = await fallback(); return rounds.concat(fb.filter(r=>!seenWords[r.word])).slice(0,5); } catch(e) { console.warn('[玩伴小屋] word rounds failed:', e); }
    return fallback();
  }
  await startWordGuess(state);
  return env.activeGameController || null;
}
