import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_PLUGINS, GAME_HOST_API_VERSION, gamePlugin} from '../src/games/plugins/registry.js';
import {createGame as createTicTacToe} from '../src/games/plugins/tictactoe/index.js';

test('all 37 independently loadable factories retain their stable game IDs and host contract', () => {
  const ids = ['tetris','snake','game2048','watermelon','memory','jump','plank','sudoku','minesweeper','uyangle','screw','popstar','paopao','game1010','turkey','spider','linklink','shuerte','pinball','match3','freecell','zuma','watersort','ludo','guessnumber','wordguess','tictactoe','gomoku','territory','oldmaid','reversi','bombnumber','connect4d','draughts','blackjack','westernchess','chinesechess'];
  assert.deepEqual(Object.keys(GAME_PLUGINS).sort(), ids.sort());
  for (const id of ids) {
    const plugin = gamePlugin(id);
    assert.equal(plugin.GAME_ID, id);
    assert.match(plugin.GAME_VERSION, /^\d+\.\d+\.\d+$/);
    assert.equal(plugin.HOST_API_VERSION, GAME_HOST_API_VERSION);
    assert.equal(typeof plugin.createGame, 'function');
  }
  assert.throws(() => gamePlugin('missing-game'), /Unknown game plugin/);
});

function ticTacToeHost(savedState) {
  const cells = Array.from({length:9}, (_,i) => ({textContent:'',dataset:{i:String(i)}}));
  const box = {innerHTML:''}, cheat = {};
  let paused = false, snapshot, outcome;
  const noop = () => {};
  const env = {
    qs: selector => selector === '#wb-gamebox' ? box : cheat,
    qsa: () => cells,
    get gamePaused() { return paused; },
    CHEAT_MAX:3,
    cheatButtonHTML:() => '',
    nextCharLineTurn:turn => turn + 5,
    saveProgress:(id,state) => { assert.equal(id,'tictactoe'); snapshot = structuredClone(state); },
    cloneCheatState:structuredClone,
    pushCheatUndo:(stack,state) => [...stack,structuredClone(state)],
    refreshCheatButton:noop, speak:noop, speakFirstMover:noop, markFirstMoverUserAction:noop,
    scores:() => ({}), setScore:noop,
    showGameOver:(id,title,score,result) => { outcome = {id,title,score,result}; },
  };
  createTicTacToe(env,savedState);
  return {cells, pause:value=>{paused=value;}, snapshot:()=>snapshot, outcome:()=>outcome};
}

test('an extracted game reads pause state live and resumes the same UI handlers', () => {
  const host = ticTacToeHost({firstMover:'user'});
  host.pause(true); host.cells[0].onclick();
  assert.equal(host.snapshot().b.filter(Boolean).length,0);
  host.pause(false); host.cells[0].onclick();
  assert.equal(host.snapshot().b[0],'X');
  assert.equal(host.snapshot().b[4],'O');
  assert.equal(host.snapshot().b.filter(Boolean).length,2);
  host.pause(true); host.cells[1].onclick();
  assert.equal(host.snapshot().b[1],'');
});

test('private AI and victory rules travel with the game and loaded progress keeps its original schema', () => {
  const initial = {b:['X','X','','O','O','','','',''], firstMover:'user'};
  const host = ticTacToeHost(initial);
  assert.deepEqual(host.snapshot().b,initial.b);
  host.cells[2].onclick();
  assert.equal(host.cells[2].textContent,'X');
  assert.equal(host.outcome().id,'tictactoe');
  assert.equal(host.outcome().result,'user_win');
});
