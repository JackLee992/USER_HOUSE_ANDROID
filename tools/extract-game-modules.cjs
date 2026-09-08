#!/usr/bin/env node
// One-time, scope-aware migration from a pre-module wanban-app.js checkout.
// Install tooling outside the source tree before running:
// npm install --prefix .local/game-extractor --ignore-scripts acorn@8 acorn-walk@8 eslint-scope@8
// This script fails on an already migrated runtime; it never regenerates or overwrites edited plugins.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const requireTool = createRequire(path.resolve('.local/game-extractor/package.json'));
const acorn = requireTool('acorn');
const walk = requireTool('acorn-walk');
const eslintScope = requireTool('eslint-scope');
const runtimePath = 'src/runtime/wanban-app.js';
const source = fs.readFileSync(runtimePath, 'utf8');
const ast = acorn.parse(source, {ecmaVersion:'latest', sourceType:'module', ranges:true});
const manager = eslintScope.analyze(ast, {ecmaVersion:2024, sourceType:'module', optimistic:true});
const ids = {
  snake:'Snake', jump:'Jump', plank:'Plank', sudoku:'Sudoku', minesweeper:'Minesweeper',
  shuerte:'Shuerte', uyangle:'UYangLe', screw:'Screw', popstar:'PopStar', paopao:'Paopao',
  game1010:'Game1010', turkey:'Turkey', spider:'Spider', linklink:'LinkLink', blackjack:'Blackjack',
  game2048:'2048', watermelon:'Watermelon', memory:'Memory', ludo:'Ludo', guessnumber:'GuessNumber',
  wordguess:'WordGuess', tictactoe:'TicTacToe', gomoku:'Gomoku', territory:'Territory', oldmaid:'OldMaid',
  reversi:'Reversi', bombnumber:'BombNumber', connect4d:'Connect4D', draughts:'Draughts',
  westernchess:'WesternChess', chinesechess:'ChineseChess', tetris:'Tetris',
};
const helpers = {
  tictactoe:['bestTic','winner3'],
  gomoku:['startEndlessGomoku','bestGomoku','gomokuMoveWins','gomokuCenterScore','gomokuMoveScore','gomokuPattern','lineScore','blockRank','winG','fiveLine'],
  connect4d:['blockRank'],
  wordguess:['createWordGuessRounds'],
};
const funcs = new Map(), parents = new Map();
walk.fullAncestor(ast, (node, _state, ancestors) => {
  parents.set(node, ancestors[ancestors.length - 2]);
});
let runtimeBody;
walk.full(ast, node => { if (node.type === 'FunctionDeclaration' && node.id?.name === 'startCurrentGame') runtimeBody = parents.get(node); });
walk.full(ast, node => {
  if (node.type === 'FunctionDeclaration' && node.id && parents.get(node) === runtimeBody) funcs.set(node.id.name,node);
});
const refs = manager.scopes.flatMap(s => s.references);
const inside = (node, range) => node.start >= range.start && node.end <= range.end;
const allMoved = new Map();
for (const [id, name] of Object.entries(ids)) {
  if (fs.existsSync(`src/games/plugins/${id}/index.js`)) throw Error(`Refusing to overwrite ${id}`);
  for (const symbol of ['start' + name, ...(helpers[id] || [])]) {
    if (!funcs.has(symbol)) throw Error(`Missing original function: ${symbol}`);
    allMoved.set(symbol, funcs.get(symbol));
  }
}
const unionEnv = new Map(), report = [];
for (const [id, name] of Object.entries(ids)) {
  const symbols = ['start' + name, ...(helpers[id] || [])];
  const nodes = symbols.map(symbol => funcs.get(symbol));
  const inGroup = node => nodes.some(range => inside(node, range));
  const environment = new Map();
  const translated = nodes.map(node => {
    const edits = new Map();
    for (const ref of refs) {
      const ident = ref.identifier;
      if (!inside(ident, node) || !ref.resolved || ref.resolved.identifiers.some(inGroup)) continue;
      const binding = ident.name;
      const mutable = ref.isWrite();
      environment.set(binding, (environment.get(binding) || false) || mutable);
      unionEnv.set(binding, (unionEnv.get(binding) || false) || mutable);
      const parent = parents.get(ident);
      // Object shorthand needs to retain the original public property name.
      const replacement = parent?.type === 'Property' && parent.shorthand
        ? `${binding}:env.${binding}` : `env.${binding}`;
      edits.set(ident.start, {start:ident.start - node.start, end:ident.end - node.start, replacement});
    }
    let text = source.slice(node.start, node.end);
    for (const edit of [...edits.values()].sort((a,b) => b.start - a.start)) {
      text = text.slice(0,edit.start) + edit.replacement + text.slice(edit.end);
    }
    return '  ' + text;
  });
  const envNames = [...environment.keys()].sort();
  const header = `// Independently versioned game plugin. Keep imports relative to this immutable snapshot.\n` +
    `export const GAME_ID = '${id}';\nexport const GAME_VERSION = '1.0.0';\nexport const HOST_API_VERSION = 1;\n` +
    `export const REQUIRED_ENV = Object.freeze(${JSON.stringify(envNames)});\n\n` +
    `// Host state is read through env getters on every callback, never snapshotted by destructuring.\n` +
    `export ${id === 'wordguess' ? 'async ' : ''}function createGame(env, state) {\n`;
  const tail = `\n  ${id === 'wordguess' ? 'await ' : ''}start${name}(state);\n  return env.activeGameController || null;\n}\n`;
  const output = header + translated.join('\n\n') + tail;
  acorn.parse(output, {ecmaVersion:'latest', sourceType:'module'});
  fs.mkdirSync(`src/games/plugins/${id}`, {recursive:true});
  fs.writeFileSync(`src/games/plugins/${id}/index.js`, output);
  report.push({id, entry:`src/games/plugins/${id}/index.js`, version:'1.0.0', functions:symbols,
    environment:envNames, mutableEnvironment:[...environment].filter(([,mutable])=>mutable).map(([name])=>name).sort(),
    originalSha256:crypto.createHash('sha256').update(nodes.map(node=>source.slice(node.start,node.end)).join('\n')).digest('hex')});
}
const modern = {
  zuma:{file:'zuma.js', factory:'createZumaGame', stateFirst:true},
  watersort:{file:'water-sort.js', factory:'createWaterSortGame', stateFirst:true},
  pinball:{file:'space-cadet.js', factory:'createSpaceCadetGame'},
  match3:{file:'match3.js', factory:'createMatch3Game'},
  freecell:{file:'freecell.js', factory:'createFreeCellGame'},
};
for (const [id, info] of Object.entries(modern)) {
  fs.mkdirSync(`src/games/plugins/${id}`,{recursive:true});
  fs.writeFileSync(`src/games/plugins/${id}/index.js`,
    `// Adapter preserves the existing tested engine and its public module path.\nimport { ${info.factory} } from '../../${info.file}';\n` +
    `export const GAME_ID = '${id}';\nexport const GAME_VERSION = '1.0.0';\nexport const HOST_API_VERSION = 1;\n` +
    `export function createGame(env, state) { return ${info.factory}(${info.stateFirst ? 'state, env' : 'env, state'}); }\n`);
}
const allIds = [...Object.keys(ids), ...Object.keys(modern)];
const registry = allIds.map(id=>`import * as ${id} from './${id}/index.js';`).join('\n') +
  `\n\nexport const GAME_HOST_API_VERSION = 1;\nexport const GAME_PLUGINS = Object.freeze({ ${allIds.join(', ')} });\n` +
  `export function gamePlugin(id) {\n  const plugin = GAME_PLUGINS[id];\n  if (!plugin) throw new Error('Unknown game plugin: ' + id);\n  return plugin;\n}\n`;
fs.writeFileSync('src/games/plugins/registry.js', registry);
// Resolve edits against a fresh read, so concurrent edits outside these exact function ranges survive.
let runtime = fs.readFileSync(runtimePath,'utf8');
for (const [symbol, node] of allMoved) {
  const original = source.slice(node.start,node.end);
  if (runtime.indexOf(original) < 0) throw Error(`Concurrent edit of owned function ${symbol}; refusing migration`);
  runtime = runtime.replace(original, '');
}
runtime = runtime.replace("import { createZumaGame } from '../games/zuma.js';\n", "import { gamePlugin } from '../games/plugins/registry.js';\n");
runtime = runtime.replace("import { createWaterSortGame } from '../games/water-sort.js';\n", '');
runtime = runtime.replace("import { createFreeCellGame } from '../games/freecell.js';\n", '');
runtime = runtime.replace("import { createSpaceCadetGame as createPinballGame, validCadetProgress } from '../games/space-cadet.js';", "import { validCadetProgress } from '../games/space-cadet.js';");
runtime = runtime.replace("import { createMatch3Game, validMatch3Progress } from '../games/match3.js';", "import { validMatch3Progress } from '../games/match3.js';");
const dispatchStart = runtime.indexOf("    if (id === 'snake') startSnake(resumeState);");
const dispatchEnd = runtime.indexOf('    scheduleFitGameSurface();', dispatchStart);
if (dispatchStart < 0 || dispatchEnd < 0) throw Error('Dispatch boundary changed');
runtime = runtime.slice(0, dispatchStart) +
  `    const plugin = gamePlugin(id);\n` +
  `    const env = modularGameEnvironment(id);\n` +
  `    const gameEnv = plugin.REQUIRED_ENV ? env.legacy : env;\n` +
  `    const startPlugin = state => plugin.createGame(gameEnv, state);\n` +
  `    const started = startPlugin(resumeState);\n` +
  `    if (id === 'wordguess') {\n` +
  `      started.catch(e => { console.warn('[玩伴小屋] wordguess start failed:', e); toast('我说你猜加载失败，已尝试重新生成题目'); startPlugin(null).catch(err => console.error('[玩伴小屋] wordguess fallback failed:', err)); });\n` +
  `    } else if (started) activeGameController = started;\n` + runtime.slice(dispatchEnd);
const envAnchor = '  function modularGameEnvironment(id) {\n    return {\n';
if (!runtime.includes(envAnchor)) throw Error('Environment anchor changed');
const entries = [...unionEnv].sort(([a],[b])=>a.localeCompare(b)).map(([name, mutable]) =>
  `      get ${name}() { return ${name}; },` + (mutable ? `\n      set ${name}(value) { ${name} = value; },` : '')).join('\n');
// The modern factories use concise per-game callbacks; extracted factories use the historical signatures.
// Their API lives on env.legacy and is passed only to legacy modules by the registry below.
runtime = runtime.replace(envAnchor, `  function legacyGameEnvironment() {\n    return {\n${entries}\n    };\n  }\n\n${envAnchor}      legacy:legacyGameEnvironment(),\n`);
acorn.parse(runtime,{ecmaVersion:'latest',sourceType:'module'});
fs.writeFileSync(runtimePath,runtime);
fs.mkdirSync('tools/game-modules',{recursive:true});
fs.writeFileSync('tools/game-modules/extraction-report.json',JSON.stringify({hostApiVersion:1,plugins:report},null,2)+'\n');
console.log(JSON.stringify({extracted:Object.keys(ids).length,adapted:Object.keys(modern).length,environment:unionEnv.size,removedFunctions:allMoved.size},null,2));
