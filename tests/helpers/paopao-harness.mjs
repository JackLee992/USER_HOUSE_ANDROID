import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { drawGameSprite } from '../../standalone/game-art.js';
import { getCanvasPixelRatio } from '../../standalone/performance.js';

// Execute the production game with a deterministic clock and a minimal Canvas/DOM host.
export function createPaopaoHarness({mode='normal',devicePixelRatio=1}={}) {
  const source = readFileSync(new URL('../../src/games/plugins/paopao/index.js', import.meta.url), 'utf8');
  const begin = source.indexOf('  function startPaopao(state) {');
  const end = source.indexOf('\n  startPaopao(state);', begin);
  const game = source.slice(begin, end).trim();
  const nodes = new Map(), frames = new Map(), timers = new Map(), listeners = new Map();
  let now = 0, id = 0, draws = 0;
  const noop = () => {};
  const gradient = { addColorStop:noop };
  const ctx = new Proxy({}, { get:(_, key) => key === 'clearRect' ? () => draws++ : key.startsWith('create') ? () => gradient : noop, set:() => true });
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      style:{}, classList:{ toggle:noop }, getContext:() => ctx,
      getBoundingClientRect:() => ({ left:0, top:0, width:360, height:560 }),
      addEventListener:(name,fn)=>{nodes.get(selector)['on'+name]=fn;},
    });
    return nodes.get(selector);
  }
  const host = {
    devicePixelRatio,localStorage:{getItem:()=>mode},
    addEventListener:(name, fn) => listeners.set(name, fn),
    removeEventListener:(name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const context = vm.createContext({
    drawGameSprite,getCanvasPixelRatio,
    qs:node, devicePixelRatio, currentGame:'paopao', gamePaused:false,
    activeGameController:null, performance:{ now:() => now },
    getHostWindow:() => host, getHostDocument:() => ({ hidden:false }),
    requestAnimationFrame:fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame:handle => frames.delete(handle),
    setTimeout:fn => { timers.set(++id, fn); return id; }, clearTimeout:handle => timers.delete(handle),
    saveProgress:noop, clearProgress:noop, setScore:noop, speak:noop, toast:noop, showGameOver:noop,
  });
  // The module reads live host bindings through env; setters still reach the same host state.
  context.env = context;
  // Inspection hooks exist only in this harness, never in the shipped plugin.
  const instrumented = game.slice(0, game.lastIndexOf('}')) + `
    return { snapshot:() => JSON.parse(JSON.stringify({falling,popping,flying,bubbles,shots,score})),
      fall:() => { falling = [{x:100,y:50,vy:1,color:'blue'}]; popping = [{x:100,y:50,life:0,seed:0,color:'blue'}]; },
      shoot:() => { flying = { x:launch.x, y:launch.y, vx:0, vy:-1, color:'blue', bomb:false }; } };
  }`;
  vm.runInContext(instrumented, context);
  const start = () => context.startPaopao({ bubbles:[{r:0,c:0,color:'blue'}], current:'blue', next:'red' });
  let instance = start();
  return {
    get game() { return instance; },
    frame(t) { now = t; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(t)); },
    pause(value) { context.gamePaused = value; },
    restart() { context.activeGameController?.destroy(); instance = start(); return instance; },
    destroy() { context.activeGameController?.destroy(); },
    pending:() => ({ frames:frames.size, timers:timers.size, listeners:listeners.size }),
    draws:() => draws,
    canvas:()=>node('#wb-paopao-canvas'),
  };
}
