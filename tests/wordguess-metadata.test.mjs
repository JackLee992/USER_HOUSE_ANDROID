import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,GAME_ID,GAME_VERSION,HOST_API_VERSION} from '../src/games/plugins/wordguess/index.js';
import {wordGuessFixture,wordGuessHarness} from './helpers/wordguess-harness.mjs';
import {createI18n} from '../standalone/i18n.js';
import {readFileSync} from 'node:fs';

test('wordguess 1.0.1 splits metadata without exposing the answer or interpreting category markup',async()=>{
  assert.equal(GAME_ID,'wordguess');assert.equal(GAME_VERSION,'1.0.1');assert.equal(HOST_API_VERSION,1);
  const host=await wordGuessHarness(createGame),fields=host.fields();
  assert.equal(fields.question.label,'当前题');assert.equal(fields.question.value,'1/5');
  assert.equal(fields.length.value,'2');assert.equal(fields.category.value,wordGuessFixture()[0].type);assert.equal(fields.category.preserved,true);
  assert.equal(fields.source.value,'内置题库');assert.equal(fields.clues.value,'1/5');assert.equal(fields.score.value,'0');
  assert.doesNotMatch(host.node('#wb-word-meta').textContent,/风筝/);
  assert.equal(host.node('#wb-word-meta').children[2].children[2].children.length,0);
  assert.deepEqual(host.snapshot().rounds,wordGuessFixture());assert.equal(host.snapshot().roundWord,'风筝');assert.equal(host.bankReads(),1);
});
test('language 1.0.1 translates separate controls without changing Chinese puzzle data',async()=>{
  const i18n=createI18n({language:'en',load:async id=>JSON.parse(readFileSync(new URL('../locales/'+id+'.json',import.meta.url)))});await i18n.init();
  const host=await wordGuessHarness(createGame),fields=host.fields();
  assert.equal(i18n.translateSource(fields.clues.label),'Hint');assert.equal(i18n.translateSource(fields.score.label),'Score');
  assert.equal(i18n.translateSource(fields.question.label),'Question');assert.equal(i18n.translateSource(fields.source.label),'Puzzle source');
  assert.deepEqual(host.snapshot().rounds,wordGuessFixture());
});
test('saved puzzles resume without reading a new bank and preserve the old save shape exactly',async()=>{
  const initial={rounds:wordGuessFixture(),roundWord:'风筝',clueIndex:1,guesses:[{guess:'纸鸢',ok:false,text:'还没有猜中'}],userWins:1,taWins:0,completed:1,revealed:false,firstClueWin:false,finalLineSpoken:false,details:{rounds:[]}};
  const host=await wordGuessHarness(createGame,initial);assert.deepEqual(host.snapshot(),initial);assert.equal(host.bankReads(),0);
  assert.equal(host.fields().question.value,'2/5');assert.equal(host.fields().source.value,'存档题目');assert.equal(host.fields().clues.value,'2/5');assert.equal(host.fields().score.value,'1');
});
test('pause, next clue, exact-answer scoring and advance keep their existing behavior',async()=>{
  const host=await wordGuessHarness(createGame);const before=host.snapshot();
  host.paused(true);host.node('#wb-word-next').onclick();assert.deepEqual(host.snapshot(),before);assert.equal(host.fields().clues.value,'1/5');
  host.paused(false);host.node('#wb-word-next').onclick();assert.equal(host.snapshot().clueIndex,1);assert.equal(host.fields().clues.value,'2/5');
  host.node('#wb-word-input').value='风车';host.node('#wb-word-submit').onclick();assert.equal(host.snapshot().userWins,0);assert.equal(host.snapshot().guesses[0].ok,false);
  host.node('#wb-word-input').value='风筝';host.node('#wb-word-submit').onclick();assert.equal(host.snapshot().userWins,1);assert.equal(host.snapshot().completed,1);assert.equal(host.fields().score.value,'1');assert.equal(host.events.filter(event=>event[0]==='score').length,1);
  host.node('#wb-word-go-next').onclick();assert.equal(host.snapshot().roundWord,'算盘');assert.equal(host.snapshot().rounds.length,4);assert.equal(host.fields().question.value,'2/5');assert.equal(host.fields().clues.value,'1/5');
});
