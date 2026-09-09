import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const gameURL = new URL('../../src/games/plugins/paopao/index.js', import.meta.url);
const source = readFileSync(gameURL, 'utf8');
const moduleBindings = {};
// Use the plugin's real named imports, including independently packaged helpers.
// This harness only instruments local inspection hooks, not rendering dependencies.
for (const [, names, path] of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm)) {
  const imported = await import(new URL(path, gameURL));
  for (const specifier of names.split(',').filter(name => name.trim())) {
    const [name, local = name] = specifier.trim().split(/\s+as\s+/);
    if (!(name in imported)) throw new Error(`Missing production import: ${name}`);
    moduleBindings[local] = imported[name];
  }
}

// Execute the production game with a deterministic clock and a minimal Canvas/DOM host.
export function createPaopaoHarness({mode='normal',devicePixelRatio=1,images=false}={}) {
  const begin = source.indexOf('  function startPaopao(state) {');
  const end = source.indexOf('\n  startPaopao(state);', begin);
  if (begin < 0 || end < begin) throw new Error('Could not locate the production paopao factory');
  const game = source.slice(begin, end).trim();
  const nodes = new Map(), frames = new Map(), timers = new Map(), listeners = new Map(), pendingImages = [];
  let now = 0, id = 0, draws = 0;
  const noop = () => {};
  const gradient = { addColorStop:noop };
  function canvasContext(canvas, main = false) {
    let transform = {a:1,b:0,c:0,d:1,e:0,f:0};
    const values = {canvas, globalAlpha:1,
      clearRect:() => { if (main) draws++; },
      setTransform:(a,b,c,d,e,f) => { transform = {a,b,c,d,e,f}; },
      getTransform:() => transform,
    };
    return new Proxy(values, {
      get:(target, key) => key in target ? target[key] : typeof key === 'string' && key.startsWith('create') ? () => gradient : noop,
      set:(target, key, value) => { target[key] = value; return true; },
    });
  }
  function node(selector) {
    if (!nodes.has(selector)) {
      const canvas = {style:{}, dataset:{}, ownerDocument:document, classList:{ toggle:noop },
        getBoundingClientRect:() => ({ left:0, top:0, width:360, height:560 }),
        addEventListener:(name,fn)=>{nodes.get(selector)['on'+name]=fn;},
      };
      const ctx = canvasContext(canvas, selector === '#wb-paopao-canvas');
      canvas.getContext = () => ctx;
      nodes.set(selector, canvas);
    }
    return nodes.get(selector);
  }
  const host = {
    devicePixelRatio,localStorage:{getItem:()=>mode},
    addEventListener:(name, fn) => listeners.set(name, fn),
    removeEventListener:(name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const document = {hidden:false, defaultView:host, createElement:() => {
    const canvas = {width:0, height:0, ownerDocument:document};
    const ctx = canvasContext(canvas);
    canvas.getContext = () => ctx;
    return canvas;
  }};
  host.document = document;
  if (images) host.Image = class {
    complete = false; naturalWidth = 0; naturalHeight = 0;
    set src(value) { this.url = value; pendingImages.push(this); }
  };
  const requestFrame = fn => { frames.set(++id, fn); return id; };
  const cancelFrame = handle => frames.delete(handle);
  host.requestAnimationFrame = requestFrame;
  host.cancelAnimationFrame = cancelFrame;
  const context = vm.createContext({
    ...moduleBindings,
    qs:node, devicePixelRatio, currentGame:'paopao', gamePaused:false,
    activeGameController:null, performance:{ now:() => now },
    getHostWindow:() => host, getHostDocument:() => document,
    requestAnimationFrame:requestFrame,
    cancelAnimationFrame:cancelFrame,
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
    images:() => pendingImages.slice(),
    loadImages() {
      for (const image of pendingImages) {
        image.complete = true; image.naturalWidth = 1536; image.naturalHeight = 1024;
        image.onload?.();
      }
    },
    hide(value) { document.hidden = value; },
  };
}
