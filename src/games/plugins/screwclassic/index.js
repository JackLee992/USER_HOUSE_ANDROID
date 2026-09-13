import { drawGameSprite, drawGameMaterial } from '../../../../standalone/game-art.js';
// Independently versioned game plugin. Keep imports relative to this immutable snapshot.
export const GAME_ID = 'screwclassic';
export const GAME_VERSION = '1.0.0';
export const HOST_API_VERSION = 1;
export const ORIGINAL_SOURCE_COMMIT = '8d4abcc9f58d382b0b07c5f92f2eb703171cc8f4';
export const ORIGINAL_PLUGIN_VERSION = '1.0.0';
export const ORIGINAL_PLUGIN_SHA256 = 'b032fe5f76103ca6a35e6f77789eba3ec743870868d13c0d0ec1dfac0f811bfa';
export const REQUIRED_ENV = Object.freeze(["choiceForState","choiceSavePatch","clearProgress","currentGameDurationMs","gamePaused","getHostWindow","isMobileHost","qs","saveProgress","screwTimer","setScore","showGameOver","speak"]);

// Host state is read through env getters on every callback, never snapshotted by destructuring.

// Scoped copy of the original release CSS. This prevents the expanded edition's
// later .wb-screw-* rules from changing the classic board.
const ORIGINAL_STYLE = "\n.wb-board-wrap.wb-gamebox-screwclassic { height:100%; flex:1 1 0; align-items:stretch; justify-items:center; padding:8px; background:var(--wb-board); border-radius:0; }\n.wb-gamebox-screwclassic .wb-screw-panel { width:min(100%,560px); height:100%; max-height:100%; min-height:0; display:grid; grid-template-rows:124px minmax(0,1fr); gap:8px; justify-items:center; align-items:stretch; overflow:hidden; box-sizing:border-box; color:var(--wb-text); }\n.wb-gamebox-screwclassic .wb-screw-top { width:100%; height:124px; min-height:124px; display:grid; grid-template-rows:70px 32px; grid-template-columns:minmax(0,1fr); grid-template-areas:none; gap:8px; align-items:center; padding:8px; box-sizing:border-box; overflow:hidden; background:var(--wb-soft); border:1px solid var(--wb-border); border-radius:0; color:var(--wb-text); box-shadow:inset 0 1px 0 rgba(255,255,255,.28); }\n.wb-gamebox-screwclassic .wb-screw-boxes { grid-area:auto; height:70px; min-height:0; display:flex; gap:8px; align-items:center; justify-content:center; min-width:0; max-width:100%; overflow:hidden; flex-wrap:nowrap; }\n.wb-gamebox-screwclassic .wb-screw-tools { width:100%; height:32px; min-width:0; display:grid; grid-template-columns:minmax(150px,1fr) auto auto; gap:8px; align-items:center; justify-content:center; overflow:hidden; }\n.wb-gamebox-screwclassic .wb-screw-box { --d:var(--wb-text); --l:#fff; position:relative; flex:0 0 64px; width:64px; height:58px; border:1px solid color-mix(in srgb,var(--c) 68%,var(--wb-border) 32%); border-radius:8px; background:linear-gradient(180deg,color-mix(in srgb,var(--c) 20%,var(--wb-panel) 80%),color-mix(in srgb,var(--c) 46%,var(--wb-soft) 54%)); box-shadow:inset 0 1px 0 rgba(255,255,255,.42),0 3px 8px rgba(0,0,0,.10); display:grid; grid-template-columns:repeat(2,20px); grid-template-rows:repeat(2,20px); justify-content:center; align-content:center; gap:1px 8px; color:var(--wb-text); }\n.wb-gamebox-screwclassic .wb-screw-box::before { content:''; position:absolute; top:-8px; left:22px; transform:none; width:20px; height:9px; border:0; border-radius:4px 4px 0 0; background:linear-gradient(90deg,var(--wb-border) 0 24%,color-mix(in srgb,var(--c) 68%,#fff 32%) 25% 75%,var(--wb-border) 76%); }\n.wb-gamebox-screwclassic .wb-screw-box::after { display:none; }\n.wb-gamebox-screwclassic .wb-screw-box-hole { position:relative; z-index:1; width:18px; height:18px; border-radius:50%; background:color-mix(in srgb,var(--wb-border) 65%,#777 35%); box-shadow:inset 0 2px 1px rgba(255,255,255,.28),inset 0 -2px 2px rgba(0,0,0,.18); }\n.wb-gamebox-screwclassic .wb-screw-box-hole:first-child { grid-column:1/3; justify-self:center; }\n.wb-gamebox-screwclassic .wb-screw-box-hole i { display:block; width:100%; height:100%; border-radius:50%; box-shadow:inset 0 2px 0 rgba(255,255,255,.36),0 1px 2px rgba(0,0,0,.24); }\n.wb-gamebox-screwclassic .wb-screw-box.active { outline:2px solid color-mix(in srgb,var(--c) 55%,#fff 45%); outline-offset:2px; }\n.wb-gamebox-screwclassic .wb-screw-progress { grid-area:auto; position:relative; width:auto; height:18px; border:1px solid var(--wb-border); border-radius:999px; background:var(--wb-panel); box-shadow:none; overflow:hidden; min-width:150px; }\n.wb-gamebox-screwclassic #wb-screw-progress-fill { display:block; height:100%; width:0; border-radius:0; background:linear-gradient(90deg,var(--wb-accent),var(--wb-accent2)); box-shadow:none; }\n.wb-gamebox-screwclassic #wb-screw-progress-text { position:absolute; inset:0; display:grid; place-items:center; font-size:10px; font-weight:900; color:var(--wb-text); text-shadow:0 1px 0 rgba(255,255,255,.45); }\n.wb-gamebox-screwclassic .wb-screw-tray { min-width:0; display:grid; grid-template-columns:repeat(5,24px); gap:6px; padding:0; border-radius:0; background:none; box-shadow:none; justify-self:center; }\n.wb-gamebox-screwclassic .wb-screw-slot { width:24px; height:24px; padding:0; border:1px solid var(--wb-border); border-radius:50%; background:var(--wb-panel); box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 1px 3px rgba(0,0,0,.08); display:grid; place-items:center; box-sizing:border-box; }\n.wb-gamebox-screwclassic .wb-screw-slot span { width:17px; height:17px; border-radius:50%; box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 1px 3px rgba(0,0,0,.18); }\n.wb-gamebox-screwclassic .wb-screw-canvas { display:block; height:100%; width:auto; max-width:100%; max-height:100%; aspect-ratio:3/4; align-self:center; justify-self:center; background:var(--wb-board); border:0; border-radius:0; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); touch-action:none; user-select:none; -webkit-user-select:none; }\n.wb-gamebox-screwclassic .wb-screw-addbox { justify-self:center; min-width:132px; min-height:0; margin-bottom:2px; padding:6px 10px; border-radius:0; }\n.wb-gamebox-screwclassic .wb-screw-addbox span { display:inline-grid; place-items:center; min-width:18px; height:18px; margin-left:4px; border-radius:999px; background:var(--wb-soft); border:1px solid var(--wb-border); font-size:11px; }\n@media (max-width:768px) {\n  .wb-board-wrap.wb-gamebox-screwclassic { padding:0; }\n  .wb-gamebox-screwclassic .wb-screw-panel { width:100%; grid-template-rows:78px minmax(0,1fr); gap:2px; }\n  .wb-gamebox-screwclassic .wb-screw-top { height:78px; min-height:78px; grid-template-rows:40px 29px; gap:2px; padding:3px 4px; }\n  .wb-gamebox-screwclassic .wb-screw-boxes { height:40px; gap:4px; }\n  .wb-gamebox-screwclassic .wb-screw-tools { height:29px; grid-template-columns:minmax(66px,1fr) auto auto; gap:4px; }\n  .wb-gamebox-screwclassic .wb-screw-box { flex-basis:clamp(38px,11.4vw,46px); width:clamp(38px,11.4vw,46px); height:clamp(32px,9.8vw,38px); grid-template-columns:repeat(2,12px); grid-template-rows:repeat(2,12px); gap:0 4px; border-radius:5px; }\n  .wb-gamebox-screwclassic .wb-screw-box::before { top:-6px; left:50%; transform:translateX(-50%); width:16px; height:7px; border-radius:3px 3px 0 0; }\n  .wb-gamebox-screwclassic .wb-screw-box-hole { width:12px; height:12px; }\n  .wb-gamebox-screwclassic .wb-screw-box.active { outline-width:1px; outline-offset:1px; }\n  .wb-gamebox-screwclassic .wb-screw-progress { width:100%; min-width:0; height:13px; justify-self:stretch; }\n  .wb-gamebox-screwclassic #wb-screw-progress-text { font-size:8px; }\n  .wb-gamebox-screwclassic .wb-screw-tray { grid-template-columns:repeat(5,17px); gap:3px; }\n  .wb-gamebox-screwclassic .wb-screw-slot { width:17px; height:17px; }\n  .wb-gamebox-screwclassic .wb-screw-slot span { width:12px; height:12px; }\n  .wb-gamebox-screwclassic .wb-screw-canvas { height:100%; width:auto; max-width:100%; }\n  .wb-gamebox-screwclassic .wb-screw-addbox { min-width:54px; min-height:21px; margin-bottom:0; padding:2px 5px; font-size:9px; }\n  .wb-gamebox-screwclassic .wb-screw-addbox span { min-width:13px; height:13px; font-size:8px; margin-left:2px; }\n}";
function installOriginalStyle(box) {
  const document = box?.ownerDocument;
  if (!document || document.getElementById('wanba-screwclassic-original-css')) return;
  const style = document.createElement('style');
  style.id = 'wanba-screwclassic-original-css';
  style.textContent = ORIGINAL_STYLE;
  (document.head || document.documentElement).appendChild(style);
}
export function createGame(env, state) {
  installOriginalStyle(env.qs('#wb-gamebox'));
  function startScrew(state) {
    const box = env.qs('#wb-gamebox');
    box.innerHTML = '<div class="wb-screw-panel"><div class="wb-screw-top"><div class="wb-screw-boxes" id="wb-screw-boxes"></div><div class="wb-screw-tools"><div class="wb-screw-progress"><div id="wb-screw-progress-fill"></div><span id="wb-screw-progress-text">0%</span></div><div class="wb-screw-tray" id="wb-screw-tray"></div><button type="button" class="wb-btn wb-screw-addbox" id="wb-screw-addbox">增加盒子 <span id="wb-screw-addbox-left">3</span></button></div></div><canvas class="wb-canvas wb-screw-canvas" id="wb-screw-canvas" width="420" height="560"></canvas></div>';
    const choice = env.choiceForState('screwclassic', state);
    const endless = choice.id === 'endless';
    const c = env.qs('#wb-screw-canvas'), ctx = c.getContext('2d'), W=420, H=560;
    const colors = [
      { id:'red', hex:'#ef3030' }, { id:'cyan', hex:'#20cce3' }, { id:'green', hex:'#9df043' },
      { id:'purple', hex:'#9b45ec' }, { id:'pink', hex:'#ec4eb2' }, { id:'brown', hex:'#8b5337' }, { id:'gray', hex:'#9b9b9b' },
      { id:'blue', hex:'#4f8df7' }
    ];
    const panelTints = ['rgba(153,105,241,.58)','rgba(108,213,247,.48)','rgba(236,77,165,.48)','rgba(238,194,118,.62)','rgba(195,244,83,.58)','rgba(249,92,108,.50)','rgba(167,197,228,.42)'];
    const shapes = ['capsule','capsule','l','tri','circle','crescent','heart','flower','square','wing','diamond'];
    const colorById = id => colors.find(col => col.id === id) || colors[0];
    const colorIndex = id => Math.max(0, colors.findIndex(col => col.id === id));
    const rngFromSeed = seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };
    const rnd = (rand, min, max) => min + rand() * (max - min);
    const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
    const shuffle = (rand, arr) => {
      const out = arr.slice();
      for(let i=out.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); const tmp=out[i]; out[i]=out[j]; out[j]=tmp; }
      return out;
    };
    function makeLocalHoles(rand, shape, w, h){
      if(shape === 'capsule') return [[-w*.32,-h*.2],[w*.32,-h*.18],[rnd(rand,-w*.08,w*.08),h*.2]];
      if(shape === 'square') return [[-w*.26,-h*.25],[w*.28,-h*.25],[rnd(rand,-w*.14,w*.14),h*.26]];
      if(shape === 'wing') return [[-w*.28,-h*.2],[w*.28,-h*.12],[rnd(rand,-w*.08,w*.1),h*.2]];
      if(shape === 'diamond') return [[0,-h*.28],[-w*.26,h*.08],[w*.25,h*.1]];
      if(shape === 'crescent') return [[-w*.24,-h*.18],[w*.18,-h*.03],[-w*.12,h*.24]];
      if(shape === 'ring') return [[-w*.28,-h*.16],[w*.3,-h*.18],[w*.02,h*.34]];
      if(shape === 'tri') return [[0,-h*.24],[-w*.24,h*.18],[w*.25,h*.2]];
      if(shape === 'l') return [[-w*.28,-h*.2],[-w*.27,h*.28],[w*.2,h*.25]];
      if(shape === 'heart') return [[-w*.22,-h*.12],[w*.22,-h*.12],[0,h*.24]];
      if(shape === 'flower') return [[0,-h*.28],[-w*.25,h*.16],[w*.25,h*.16]];
      if(shape === 'circle') return [[-w*.22,-h*.2],[w*.22,-h*.16],[0,h*.26]];
      return [[-w*.32,-h*.18],[w*.3,-h*.16],[rnd(rand,-w*.14,w*.16),h*.2]];
    }
    function localHoleInside(shape, lx, ly, w, h){
      if(shape === 'circle') return lx*lx + ly*ly <= (w*.42)*(w*.42);
      if(shape === 'capsule') return Math.abs(lx) <= w/2 - h/2 && Math.abs(ly) <= h*.38 || Math.hypot(Math.abs(lx) - (w/2 - h/2), ly) <= h*.38;
      if(shape === 'square') return Math.abs(lx) <= w*.42 && Math.abs(ly) <= h*.42;
      if(shape === 'diamond') return Math.abs(lx) / (w*.43) + Math.abs(ly) / (h*.43) <= 1;
      if(shape === 'wing') return Math.abs(lx) <= w*.42 && Math.abs(ly) <= h*.28 && ly > -h*.36 + Math.abs(lx) * .18;
      if(shape === 'crescent'){ const d=Math.hypot(lx, ly); return d <= w*.42 && d >= w*.27 && !(lx > w*.08 && ly < h*.18 && ly > -h*.24); }
      if(shape === 'ring'){ const d=lx*lx + ly*ly; return d <= (w*.42)*(w*.42) && d >= (w*.29)*(w*.29); }
      if(shape === 'tri'){
        const x1=0, y1=-h*.42, x2=w*.42, y2=h*.42, x3=-w*.42, y3=h*.42;
        const d = (y2-y3)*(x1-x3)+(x3-x2)*(y1-y3);
        const a = ((y2-y3)*(lx-x3)+(x3-x2)*(ly-y3))/d;
        const b = ((y3-y1)*(lx-x3)+(x1-x3)*(ly-y3))/d;
        const g = 1 - a - b;
        return a >= .05 && b >= .05 && g >= .05;
      }
      if(shape === 'l') return (lx >= -w*.42 && lx <= -w*.12 && ly >= -h*.42 && ly <= h*.42) || (lx >= -w*.42 && lx <= w*.42 && ly >= h*.12 && ly <= h*.42);
      if(shape === 'heart'){
        const nx = lx / (w*.42), ny = (ly + h*.05) / (h*.43);
        return Math.pow(nx*nx + ny*ny - 1, 3) - nx*nx * Math.pow(ny, 3) <= .16 && ly <= h*.32;
      }
      if(shape === 'flower'){
        if(lx*lx + ly*ly <= (w*.17)*(w*.17)) return true;
        for(let i=0;i<6;i++){
          const r=rotatePoint(lx, ly, -i * Math.PI / 3), dx=r.x, dy=r.y + h*.22;
          if((dx*dx)/(w*.13*w*.13) + (dy*dy)/(h*.23*h*.23) <= 1) return true;
        }
        return false;
      }
      return Math.abs(lx) <= w*.42 && Math.abs(ly) <= h*.42;
    }
    function fitHoleCount(rand, shape, holes, count, w, h){
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const minTarget = Math.max(42, Math.min(w, h) * .34);
      const candidates = holes.filter(pt => localHoleInside(shape, pt[0], pt[1], w, h));
      for(let i=0;i<36;i++){
        const a = i / 36 * Math.PI * 2 + rnd(rand, -.18, .18);
        const pt = [Math.cos(a) * w * rnd(rand, .18, .36), Math.sin(a) * h * rnd(rand, .18, .36)];
        if(localHoleInside(shape, pt[0], pt[1], w, h)) candidates.push(pt);
      }
      for(let i=0;i<80 && candidates.length < count;i++){
        const pt = [rnd(rand, -w*.4, w*.4), rnd(rand, -h*.4, h*.4)];
        if(localHoleInside(shape, pt[0], pt[1], w, h)) candidates.push(pt);
      }
      if(!candidates.length) candidates.push([0, 0]);
      let best = candidates[0] || [0, 0];
      candidates.forEach(pt => { if(Math.hypot(pt[0], pt[1]) > Math.hypot(best[0], best[1])) best = pt; });
      const out = [best];
      while(out.length < count && candidates.length){
        let chosen = null, chosenScore = -1;
        candidates.forEach(pt => {
          if(out.some(existing => existing === pt)) return;
          const nearest = Math.min(...out.map(existing => dist(existing, pt)));
          const edgeBonus = Math.hypot(pt[0] / Math.max(1, w), pt[1] / Math.max(1, h)) * 18;
          const score = nearest + edgeBonus;
          if(nearest >= minTarget * .82 && score > chosenScore){ chosen = pt; chosenScore = score; }
        });
        if(!chosen){
          candidates.forEach(pt => {
            if(out.some(existing => existing === pt)) return;
            const nearest = Math.min(...out.map(existing => dist(existing, pt)));
            if(nearest > chosenScore){ chosen = pt; chosenScore = nearest; }
          });
        }
        if(!chosen) break;
        out.push(chosen);
      }
      return out.slice(0, count);
    }
    const makeLevel = () => {
      const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      const rand = rngFromSeed(seed);
      const panelCount = (endless ? 28 : 42) + Math.floor(rand() * (endless ? 5 : 6));
      const panels = [];
      const layout = Math.floor(rand() * 4);
      function template(i){
        const col = i % 5, row = Math.floor(i / 5) % 7;
        const ring = i / panelCount * Math.PI * 2;
        if(layout === 0) return { x:38 + col * 86 + rnd(rand,-18,18), y:46 + row * 118 + rnd(rand,-20,20), a:(i % 2 ? .58 : -.58) + rnd(rand,-.28,.28), shape:i % 6 === 0 ? 'l' : (i % 4 === 0 ? 'circle' : pick(rand, shapes)) };
        if(layout === 1) return { x:36 + (i % 6) * 70 + rnd(rand,-18,18), y:52 + Math.floor(i / 6) * 124 + (i % 2 ? 24 : -8) + rnd(rand,-16,16), a:(i % 2 ? 1 : -1) * rnd(rand,.16,.62), shape:i % 4 === 0 ? 'wing' : (i % 5 === 0 ? 'capsule' : pick(rand, shapes)) };
        if(layout === 2){
          const slots = [[52,58],[210,54],[366,62],[56,190],[188,174],[342,188],[68,324],[214,316],[360,328],[52,462],[204,456],[366,464]];
          const s = slots[i % slots.length];
          return { x:s[0] + rnd(rand,-24,24), y:s[1] + rnd(rand,-20,20) + Math.floor(i / slots.length) * 20, a:(i % 2 ? .82 : -.82) + rnd(rand,-.22,.22), shape:i % 6 === 0 ? 'l' : (i % 3 === 0 ? 'square' : pick(rand, shapes)) };
        }
        return { x:210 + Math.cos(ring) * (116 + (i % 4) * 28) + rnd(rand,-14,14), y:268 + Math.sin(ring) * (176 + (i % 3) * 28) + rnd(rand,-14,14), a:ring + rnd(rand,-.42,.42), shape:i % 7 === 0 ? 'heart' : pick(rand, shapes) };
      }
      const templates = Array.from({ length:panelCount }, (_, i) => template(i));
      const fixedTwoScrewShapes = ['flower','star','heart'];
      const screwCounts = templates.map(t => fixedTwoScrewShapes.includes(t.shape) ? 2 : 2 + Math.floor(rand() * 3));
      let screwTotal = screwCounts.reduce((sum, n) => sum + n, 0);
      while(screwTotal % 3){
        if(screwTotal % 3 === 1){
          const idx = screwCounts.findIndex((n, i) => n > 2 && !fixedTwoScrewShapes.includes(templates[i].shape));
          if(idx >= 0){ screwCounts[idx]--; screwTotal--; }
          else { const addIdx = screwCounts.findIndex((n, i) => n < 4 && !fixedTwoScrewShapes.includes(templates[i].shape)); if(addIdx >= 0){ screwCounts[addIdx]++; screwTotal++; } else break; }
        } else {
          const idx = screwCounts.findIndex((n, i) => n < 4 && !fixedTwoScrewShapes.includes(templates[i].shape));
          if(idx >= 0){ screwCounts[idx]++; screwTotal++; }
          else { const dropIdx = screwCounts.findIndex((n, i) => n > 2 && !fixedTwoScrewShapes.includes(templates[i].shape)); if(dropIdx >= 0){ screwCounts[dropIdx]--; screwTotal--; } else break; }
        }
      }
      const boxCount = Math.max(3, screwTotal / 3);
      const topColors = [];
      for(let i=0;i<boxCount;i+=3){
        const batch = shuffle(rand, colors).slice(0, Math.min(3, boxCount - i)).map(col => col.id);
        topColors.push(...batch);
      }
      const boxQueue = topColors.slice();
      const screwColors = shuffle(rand, topColors.flatMap(color => [color, color, color]));
      let colorOffset = 0;
      for(let i=0;i<panelCount;i++){
        const count = screwCounts[i], slice = screwColors.slice(colorOffset, colorOffset + count);
        if(count >= 3 && slice.every(color => color === slice[0])){
          const swapAt = screwColors.findIndex((color, idx) => idx >= colorOffset + count && color !== slice[0]);
          if(swapAt >= 0){ const tmp = screwColors[colorOffset + count - 1]; screwColors[colorOffset + count - 1] = screwColors[swapAt]; screwColors[swapAt] = tmp; }
        }
        colorOffset += count;
      }
      for(let i=0;i<panelCount;i++){
        const t = templates[i], shape = t.shape;
        const w = shape === 'capsule' ? rnd(rand, 150, 222) : shape === 'l' ? rnd(rand, 132, 174) : shape === 'square' ? rnd(rand, 108, 148) : shape === 'wing' ? rnd(rand, 150, 210) : rnd(rand, 104, 158);
        const h = shape === 'capsule' ? rnd(rand, 48, 66) : shape === 'l' ? rnd(rand, 118, 160) : (shape === 'circle' || shape === 'flower' || shape === 'crescent' ? w : shape === 'wing' ? rnd(rand, 76, 112) : rnd(rand, 86, 132));
        const a = t.a;
        const ca = Math.abs(Math.cos(a || 0)), sa = Math.abs(Math.sin(a || 0));
        const marginX = Math.min(W / 2 - 14, ca * w / 2 + sa * h / 2 + 14);
        const marginY = Math.min(H / 2 - 14, sa * w / 2 + ca * h / 2 + 14);
        const x = Math.max(marginX, Math.min(W - marginX, t.x));
        const y = Math.max(marginY, Math.min(H - marginY, t.y));
        const count = screwCounts[i];
        const holes = fitHoleCount(rand, shape, makeLocalHoles(rand, shape, w, h), count, w, h);
        const offset = screwCounts.slice(0, i).reduce((sum, n) => sum + n, 0);
        panels.push({
          id:'p'+i, z:i, shape, x, y, w, h, a, color:panelTints[i % panelTints.length],
          screws:holes.map((pt, j) => ({ id:'p'+i+'s'+j, lx:pt[0], ly:pt[1], color:screwColors[offset + j] || topColors[(i + j) % topColors.length], gone:false })),
          vx:0, vy:0, va:0, gone:false, falling:false, hanging:false
        });
      }
      return { seed, panels, boxQueue, boxes:boxQueue.slice(0, 3).map(color => ({ color, fill:0 })), boxIndex:Math.min(3, boxQueue.length) };
    };
    const generatedFresh = !(state?.panels && state?.boxQueue);
    let made = generatedFresh ? makeLevel() : state;
    let panels = made.panels.map(p => Object.assign({ vx:0, vy:0, va:0, gone:false, falling:false, hanging:false }, p, { screws:(p.screws || []).map(s => Object.assign({}, s)) }));
    let boxQueue = Array.isArray(made.boxQueue) ? made.boxQueue.slice() : [];
    let boxes = Array.isArray(made.boxes) ? made.boxes.map(b => Object.assign({}, b)) : boxQueue.slice(0, 3).map(color => ({ color, fill:0 }));
    let boxIndex = Number.isInteger(made.boxIndex) ? made.boxIndex : boxes.length;
    let maxBoxes = Math.min(6, Math.max(3, Number(state?.maxBoxes || made.maxBoxes || 3)));
    let addBoxUses = Math.min(3, Math.max(0, Number(state?.addBoxUses || made.addBoxUses || Math.max(0, maxBoxes - 3))));
    let tray = Array.isArray(state?.tray) ? state.tray.slice(0, 5) : [];
    let over=false, seen = state?.seen || {}, uiSignature='', physicsSaveTick=0;
    let details = Object.assign({ removed:0, packed:0, matches:0, fallen:0, maxTray:0, trayFourCount:0, trayFullCount:0, addBoxUses:0, blocked:0, progress:0, completed:false, endlessLayers:1 }, state?.details || {});
    if(generatedFresh){
      for(let attempt=0; attempt<6 && currentScrews().filter(h => h.reachable).length < 10; attempt++){
        made = makeLevel();
        panels = made.panels.map(p => Object.assign({ vx:0, vy:0, va:0, gone:false, falling:false, hanging:false }, p, { screws:(p.screws || []).map(s => Object.assign({}, s)) }));
        boxQueue = Array.isArray(made.boxQueue) ? made.boxQueue.slice() : [];
        boxes = Array.isArray(made.boxes) ? made.boxes.map(b => Object.assign({}, b)) : boxQueue.slice(0, 3).map(color => ({ color, fill:0 }));
        boxIndex = Number.isInteger(made.boxIndex) ? made.boxIndex : boxes.length;
      }
    }
    drawUI(); draw(); save();
    function save(){ if(!over) env.saveProgress('screwclassic', Object.assign({ panels, boxQueue, boxes, boxIndex, maxBoxes, addBoxUses, tray, seen, details }, env.choiceSavePatch('screwclassic', choice))); }
    function rotatePoint(x,y,a){ const ca=Math.cos(a||0), sa=Math.sin(a||0); return { x:x*ca-y*sa, y:x*sa+y*ca }; }
    function localToWorld(p, lx, ly){ const r=rotatePoint(lx, ly, p.a || 0); return { x:p.x + r.x, y:p.y + r.y }; }
    function worldToLocal(p, x, y){ return rotatePoint(x - p.x, y - p.y, -(p.a || 0)); }
    function normAngle(a){ while(a > Math.PI) a -= Math.PI * 2; while(a < -Math.PI) a += Math.PI * 2; return a; }
    function panelVisualExtents(p){
      const ca = Math.abs(Math.cos(p.a || 0)), sa = Math.abs(Math.sin(p.a || 0));
      return {
        x: Math.min(W / 2 - 14, ca * (p.w || 0) / 2 + sa * (p.h || 0) / 2 + 14),
        y: Math.min(H / 2 - 14, sa * (p.w || 0) / 2 + ca * (p.h || 0) / 2 + 14)
      };
    }
    function clampPanelInsideCanvas(p, allowBottomExit){
      const e = panelVisualExtents(p);
      p.x = Math.max(e.x, Math.min(W - e.x, p.x));
      p.y = allowBottomExit ? Math.max(e.y, p.y) : Math.max(e.y, Math.min(H - e.y, p.y));
    }
    function panelContains(p, x, y){
      const q = worldToLocal(p, x, y), lx=q.x, ly=q.y, w=p.w, h=p.h;
      if(p.shape === 'circle') return lx*lx + ly*ly <= (w*.5)*(w*.5);
      if(p.shape === 'capsule') return Math.abs(lx) <= w/2 - h/2 && Math.abs(ly) <= h/2 || Math.hypot(Math.abs(lx) - (w/2 - h/2), ly) <= h/2;
      if(p.shape === 'square') return Math.abs(lx) <= w/2 && Math.abs(ly) <= h/2;
      if(p.shape === 'diamond') return Math.abs(lx) / (w/2) + Math.abs(ly) / (h/2) <= 1;
      if(p.shape === 'wing') return Math.abs(lx) <= w/2 && Math.abs(ly) <= h*.34 && ly > -h*.44 + Math.abs(lx) * .18;
      if(p.shape === 'crescent'){ const d=Math.hypot(lx, ly); return d <= w*.5 && d >= w*.22 && !(lx > w*.1 && ly < h*.22 && ly > -h*.28); }
      if(p.shape === 'ring'){ const d=lx*lx + ly*ly; return d <= (w*.5)*(w*.5) && d >= (w*.23)*(w*.23); }
      if(p.shape === 'tri'){
        const x1=0, y1=-h/2, x2=w/2, y2=h/2, x3=-w/2, y3=h/2;
        const d = (y2-y3)*(x1-x3)+(x3-x2)*(y1-y3);
        const a = ((y2-y3)*(lx-x3)+(x3-x2)*(ly-y3))/d;
        const b = ((y3-y1)*(lx-x3)+(x1-x3)*(ly-y3))/d;
        const g = 1 - a - b;
        return a >= 0 && b >= 0 && g >= 0;
      }
      if(p.shape === 'l') return (lx >= -w/2 && lx <= -w*.08 && ly >= -h/2 && ly <= h/2) || (lx >= -w/2 && lx <= w/2 && ly >= h*.08 && ly <= h/2);
      if(p.shape === 'heart'){
        const nx = lx / (w*.46), ny = (ly + h*.05) / (h*.48);
        return Math.pow(nx*nx + ny*ny - 1, 3) - nx*nx * Math.pow(ny, 3) <= .35 && ly <= h*.38;
      }
      if(p.shape === 'flower'){
        if(lx*lx + ly*ly <= (w*.2)*(w*.2)) return true;
        for(let i=0;i<6;i++){
          const r=rotatePoint(lx, ly, -i * Math.PI / 3), dx=r.x, dy=r.y + h*.22;
          if((dx*dx)/(w*.17*w*.17) + (dy*dy)/(h*.28*h*.28) <= 1) return true;
        }
        return false;
      }
      return Math.abs(lx) <= w/2 && Math.abs(ly) <= h/2;
    }
    function liveAnchors(p){ return (p.screws || []).filter(s => !s.gone); }
    function screwWorld(p, s){ return s.anchor ? { x:s.anchor.x, y:s.anchor.y } : localToWorld(p, s.lx, s.ly); }
    function panelCoversScrew(panel, pt){
      const r = 10;
      return [[0,0],[-r,0],[r,0],[0,-r],[0,r],[-r*.65,-r*.65],[r*.65,-r*.65],[-r*.65,r*.65],[r*.65,r*.65]]
        .some(d => panelContains(panel, pt.x + d[0], pt.y + d[1]));
    }
    function isScrewReachable(p, s){
      if(p.gone || p.falling || s.gone) return false;
      const pt = screwWorld(p, s);
      return !panels.some(o => o !== p && !o.gone && o.z > p.z && panelCoversScrew(o, pt));
    }
    function currentScrews(){
      const hits = [];
      panels.forEach(p => (p.screws || []).forEach(s => { if(!s.gone) hits.push({ p, s, pt:screwWorld(p, s), reachable:isScrewReachable(p, s) }); }));
      return hits.sort((a,b) => a.p.z - b.p.z);
    }
    function blockingFrontScrewForPanel(p, oldX, oldY){
      for(const o of panels){
        if(o === p || o.gone || o.z <= p.z) continue;
        for(const s of (o.screws || [])){
          if(s.gone) continue;
          const pt = screwWorld(o, s);
          if(!panelContains(p, pt.x, pt.y)) continue;
          if(Number.isFinite(oldX) && Number.isFinite(oldY)){
            const px = p.x, py = p.y;
            p.x = oldX; p.y = oldY;
            const alreadyCovered = panelContains(p, pt.x, pt.y);
            p.x = px; p.y = py;
            if(alreadyCovered) continue;
          }
          return { p:o, s, pt };
        }
      }
      return null;
    }
    function refillBoxes(){
      while(boxes.length < maxBoxes && boxIndex < boxQueue.length) boxes.push({ color:boxQueue[boxIndex++], fill:0 });
      let moved = false;
      for(let i=0;i<tray.length;i++) if(boxes.some(b => b.color === tray[i] && b.fill < 3)){ moved = true; break; }
      return moved;
    }
    function acceptBox(color){
      return boxes.find(b => b.color === color && b.fill < 3);
    }
    function addToBox(color){
      const b = acceptBox(color);
      if(!b) return false;
      b.fill++;
      if(b.fill >= 3){
        const idx = boxes.indexOf(b);
        if(idx >= 0) boxes.splice(idx, 1);
        details.packed += 3;
        details.matches = (details.matches || 0) + 1;
        if(Math.random() < .3) env.speak('screwclassic','match');
        if(refillBoxes()) setTimeout(() => { if(!over){ drainTray(); drawUI(); save(); } }, 0);
      }
      return true;
    }
    function drainTray(){
      let moved = true;
      while(moved){
        moved = false;
        for(let i=0;i<tray.length;i++){
          if(acceptBox(tray[i])){
            const color = tray.splice(i, 1)[0];
            addToBox(color);
            moved = true;
            break;
          }
        }
      }
    }
    function updatePanelState(p){
      if(p.gone || p.falling) return;
      if(p.stuck){
        if(blockingFrontScrewForPanel(p)){ p.vx = 0; p.vy = 0; p.va = 0; p.hanging = false; return; }
        p.stuck = false;
      }
      const anchors = liveAnchors(p);
      if(!anchors.length){
        p.falling = true; p.stuck = false; p.hanging = false; p.vy = Math.max(1.8, p.vy || 0); p.vx = 0; p.va = 0;
      } else if(anchors.length === 1){
        const a = anchors[0], pt = a.anchor || screwWorld(p, a);
        a.anchor = { x:pt.x, y:pt.y };
        if(p.pivot !== a.id){ p.hangTicks = 0; p.hangSettled = false; }
        p.hanging = true; p.pivot = a.id; p.va = p.va || ((p.x < pt.x) ? -.015 : .015);
      } else {
        p.hanging = false;
      }
    }
    function removeScrew(hit){
      const color = hit.s.color;
      const wasFull = tray.length >= 5;
      hit.s.gone = true;
      details.removed++;
      details.maxTray = Math.max(details.maxTray || 0, tray.length);
      if(acceptBox(color)) addToBox(color);
      else {
        if(wasFull){ fail(); return; }
        tray.push(color);
      }
      panels.forEach(updatePanelState);
      drainTray();
      details.maxTray = Math.max(details.maxTray || 0, tray.length);
      if(tray.length >= 5 && !wasFull){
        details.trayFullCount = (details.trayFullCount || 0) + 1;
        details.trayFourCount = details.trayFullCount;
        env.speak('screwclassic','tray_4');
      }
      if(!seen.first){ seen.first=1; }
      drawUI(); draw(); save();
    }
    function clickAt(x,y){
      if(env.gamePaused||over) return;
      const mobileTouch = env.isMobileHost() || (env.getHostWindow().innerWidth || 800) <= 768;
      const hitRadius = mobileTouch ? 28 : 15;
      const blockedRadius = mobileTouch ? 30 : 15;
      const hit = currentScrews().reverse().find(h => h.reachable && Math.hypot(h.pt.x-x,h.pt.y-y) <= hitRadius);
      if(hit) removeScrew(hit);
      else {
        if(currentScrews().some(h => !h.reachable && Math.hypot(h.pt.x-x,h.pt.y-y) <= blockedRadius)) details.blocked++;
        draw();
      }
    }
    function handleCanvasClientPoint(clientX, clientY){
      const r=c.getBoundingClientRect();
      clickAt((clientX-r.left) * W / r.width, (clientY-r.top) * H / r.height);
    }
    c.onpointerdown = e => {
      e.preventDefault();
      handleCanvasClientPoint(e.clientX, e.clientY);
    };
    c.onclick = e => {
      if(env.getHostWindow().PointerEvent) return;
      handleCanvasClientPoint(e.clientX, e.clientY);
    };
	    function fail(){
	      over=true; env.clearProgress('screwclassic');
	      details.completed = false; details.progress = progressPct(); details.addBoxUses = addBoxUses;
	      env.speak('screwclassic','gameover');
	      if(endless){
	        const boxCount = 3 + Math.max(0, Math.min(3, addBoxUses || 0));
	        const multipliers = { 3:2.2, 4:1.75, 5:1.35, 6:1.05 };
	        const multiplier = multipliers[boxCount] || 1.05;
	        const baseScore = Math.max(0, (details.matches || 0) * 120);
	        const score = Math.round(baseScore * multiplier);
	        details.endlessBoxCount = boxCount;
	        details.endlessBaseScore = baseScore;
	        details.endlessScoreMultiplier = multiplier;
	        env.setScore('screwclassic', score);
	        env.showGameOver('screwclassic','游戏结束','本局分数：'+score+'分，基础分'+baseScore+'，盒子'+boxCount+'个，倍率×'+multiplier+'，托盘已满', null, { completed:false, endless:true, progress:details.progress, addBoxUses, details:Object.assign({}, details, { completed:false, endless:true, endlessBoxCount:boxCount, endlessBaseScore:baseScore, endlessScoreMultiplier:multiplier }) });
	      } else {
	        env.showGameOver('screwclassic','游戏结束','本局分数：0分，托盘已满', null, { completed:false, progress:details.progress, addBoxUses, details });
	      }
	    }
    function finish(){
      over=true; env.clearProgress('screwclassic');
      details.completed = true; details.progress = 100; details.addBoxUses = addBoxUses;
      const score = Math.max(800, 5200 - Math.round(env.currentGameDurationMs()/1000)*7 - details.maxTray*90 - addBoxUses * 650);
      env.setScore('screwclassic', score);
      env.showGameOver('screwclassic','拧螺丝完成','本局分数：'+score+'分，打包'+details.packed+'颗螺丝' + (addBoxUses ? '，增加盒子扣分' : ''), null, { completed:true, score, progress:100, addBoxUses, details:Object.assign({}, details, { addBoxUses }) });
    }
    function livePanelCount(){
      return panels.filter(p => !p.gone).length;
    }
    function liveScrewCount(){
      return currentScrews().length;
    }
    function extendEndless(){
      const next = makeLevel();
      const active = panels.filter(p => !p.gone);
      const zLift = next.panels.length + 1;
      const layer = details.endlessLayers || 1;
      const nextPanels = next.panels.map((p, i) => Object.assign(
        { vx:0, vy:0, va:0, gone:false, falling:false, hanging:false },
        p,
        {
          id:'e' + layer + '_' + (p.id || i),
          z:i,
          screws:(p.screws || []).map((s, j) => Object.assign({}, s, { id:'e' + layer + '_' + (s.id || (i + 's' + j)) }))
        }
      ));
      panels = nextPanels.concat(active.map(p => Object.assign({}, p, { z:(Number(p.z) || 0) + zLift })));
      boxQueue = boxQueue.concat(next.boxQueue || []);
      seen.progress50 = 0;
      seen.progress80 = 0;
      details.endlessLayers = (details.endlessLayers || 1) + 1;
      refillBoxes();
      drainTray();
      drawUI();
      draw();
      save();
    }
    function maybeExtendEndless(){
      if(!endless || over) return;
      if(liveScrewCount() <= 24 || livePanelCount() <= 8) extendEndless();
    }
    function step(){
      if(over || env.gamePaused) return;
      // Preserve every original 33 ms physics constant, but do no canvas/DOM
      // work while every panel is static. The first package used to redraw and
      // rewrite the save 30 times a second even before the first touch.
      if(!panels.some(p => !p.gone && (p.falling || (!p.stuck && liveAnchors(p).length === 1 && !p.hangSettled)))) return;
      panels.forEach(p => {
        if(p.gone) return;
        const anchors = liveAnchors(p);
        if(p.stuck){
          if(blockingFrontScrewForPanel(p)){ p.vx = 0; p.vy = 0; p.va = 0; return; }
          p.stuck = false;
          if(!anchors.length){ p.falling = true; p.hanging = false; p.vy = Math.max(1.8, p.vy || 0); p.vx = 0; p.va = 0; }
        }
        if(p.falling){
          const oldX = p.x, oldY = p.y;
          const noScrewDrop = anchors.length === 0;
          p.vy = Math.min(noScrewDrop ? 15 : 11.5, (p.vy || 0) + (noScrewDrop ? .72 : .48));
          p.vx = noScrewDrop ? 0 : (p.vx || 0) * .992;
          p.y += p.vy; p.x += p.vx || 0;
          clampPanelInsideCanvas(p, true);
          const blocker = blockingFrontScrewForPanel(p, oldX, oldY);
          if(blocker){
            p.x = oldX; p.y = oldY; p.vx = 0; p.vy = 0; p.va = 0; p.falling = false; p.hanging = false; p.stuck = true; return;
          }
          if(!noScrewDrop) panels.forEach(o => {
            if(o === p || o.gone || o.falling) return;
            const hitW = (p.w + o.w) * .32, hitH = (p.h + o.h) * .32;
            const dx = p.x - o.x, dy = p.y - o.y;
            const overlapX = hitW - Math.abs(dx), overlapY = hitH - Math.abs(dy);
            if(overlapX > 0 && overlapY > 0){
              const side = dx < 0 ? -1 : 1;
              if(overlapX < overlapY){
                p.x += side * (overlapX + .8);
                clampPanelInsideCanvas(p, true);
                p.vx = side * Math.max(1.18, Math.abs(p.vx || 0) * .82);
              } else {
                p.y += (dy < 0 ? -1 : 1) * (overlapY + .8);
                clampPanelInsideCanvas(p, true);
                p.vy = dy < 0 ? Math.max(.85, p.vy * .26) : Math.max(1.7, p.vy * .62);
                p.vx += side * .52;
              }
            }
          });
          const ext = panelVisualExtents(p);
          if((noScrewDrop && p.y - ext.y > H + 20) || p.y > H + 120){ p.gone=true; details.fallen++; }
        } else if(!p.stuck && anchors.length === 1){
          const s = anchors[0], pivot = s.anchor || screwWorld(p, s);
          const target = Math.PI / 2 - Math.atan2(-s.ly, -s.lx);
          const delta = normAngle((p.a || 0) - target);
          p.hangTicks = (p.hangTicks || 0) + 1;
          if(p.hangSettled || (p.hangTicks > 18 && Math.abs(delta) < .018 && Math.abs(p.va || 0) < .012) || (p.hangTicks > 105 && Math.abs(p.va || 0) < .04)){
            p.a = target; p.va = 0; p.hangSettled = true;
          } else {
            p.va = ((p.va || 0) - delta * .018) * .88;
            p.a += p.va;
          }
          const local = rotatePoint(s.lx, s.ly, p.a || 0);
          p.x = pivot.x - local.x; p.y = pivot.y - local.y;
        }
      });
      if(panels.every(p => p.gone)) { if(endless) extendEndless(); else finish(); return; }
      maybeExtendEndless();
      drawUI(); draw();
      const stillMoving = panels.some(p => !p.gone && (p.falling || (!p.stuck && liveAnchors(p).length === 1 && !p.hangSettled)));
      physicsSaveTick++;
      if(physicsSaveTick === 1 || physicsSaveTick >= 6 || !stillMoving){ save(); physicsSaveTick=0; }
    }
    env.screwTimer = setInterval(step, 33);
    function progressPct(){ return Math.round(panels.filter(p=>p.gone).length / panels.length * 100); }
    function drawUI(){
      const pct = progressPct();
      details.progress = pct;
      if(!endless && pct >= 50 && !seen.progress50){ seen.progress50 = 1; env.speak('screwclassic','progress_50'); }
      if(!endless && pct >= 80 && !seen.progress80){ seen.progress80 = 1; env.speak('screwclassic','progress_80'); }
      const nextUiSignature = [endless?1:0,pct,details.matches || 0,maxBoxes,addBoxUses,boxIndex,
        boxes.map(item => item.color + ':' + item.fill).join(','),tray.join(',')].join('|');
      if(nextUiSignature === uiSignature) return;
      uiSignature = nextUiSignature;
      const progressWrap = env.qs('.wb-screw-progress', box);
      if(progressWrap) progressWrap.classList.toggle('wb-endless-counter', endless);
      env.qs('#wb-screw-progress-fill', box).style.width = endless ? '0%' : (pct + '%');
      env.qs('#wb-screw-progress-text', box).textContent = endless ? ('收纳盒子 ' + (details.matches || 0) + ' 个') : ('进度 ' + pct + '%');
      env.qs('#wb-screw-boxes', box).innerHTML = boxes.map((b,i) => {
        const col = colorById(b.color);
        return '<div class="wb-screw-box'+(i===0?' active':'')+'" style="--c:'+col.hex+'">' + [0,1,2].map(n => '<span class="wb-screw-box-hole">' + (n < b.fill ? '<i style="background:'+col.hex+'"></i>' : '') + '</span>').join('') + '</div>';
      }).join('');
      env.qs('#wb-screw-tray', box).innerHTML = Array.from({length:5},(_,i)=>'<div class="wb-screw-slot">' + (tray[i] ? '<span style="background:'+colorById(tray[i]).hex+'"></span>' : '') + '</div>').join('');
      const addBtn = env.qs('#wb-screw-addbox', box), left = Math.max(0, 3 - addBoxUses);
      if(addBtn){
        addBtn.disabled = left <= 0 || boxes.length >= 6 || boxIndex >= boxQueue.length;
        addBtn.classList.toggle('disabled', addBtn.disabled);
      }
      const leftEl = env.qs('#wb-screw-addbox-left', box);
      if(leftEl) leftEl.textContent = left;
    }
    const addBoxBtn = env.qs('#wb-screw-addbox', box);
    if(addBoxBtn) addBoxBtn.onclick = () => {
      if(env.gamePaused || over || addBoxUses >= 3 || maxBoxes >= 6) return;
      maxBoxes++;
      addBoxUses++;
      details.addBoxUses = addBoxUses;
      env.speak('screwclassic','add_box');
      refillBoxes();
      drainTray();
      drawUI(); save();
    };
    function drawPanel(p){
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.a || 0); ctx.fillStyle=p.color; ctx.strokeStyle='rgba(255,255,255,.96)'; ctx.lineWidth=7; ctx.lineJoin='round'; ctx.lineCap='round';
      if(p.shape==='tri'){ ctx.beginPath(); ctx.moveTo(0,-p.h/2); ctx.lineTo(p.w/2,p.h/2); ctx.lineTo(-p.w/2,p.h/2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='l'){ ctx.beginPath(); ctx.moveTo(-p.w/2,-p.h/2); ctx.lineTo(-p.w*.08,-p.h/2); ctx.lineTo(-p.w*.08,p.h*.08); ctx.lineTo(p.w/2,p.h*.08); ctx.lineTo(p.w/2,p.h/2); ctx.lineTo(-p.w/2,p.h/2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='capsule'){ ctx.beginPath(); ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,p.h/2); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='square'){ ctx.beginPath(); ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,10); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='diamond'){ ctx.beginPath(); ctx.moveTo(0,-p.h/2); ctx.lineTo(p.w/2,0); ctx.lineTo(0,p.h/2); ctx.lineTo(-p.w/2,0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='wing'){ ctx.beginPath(); ctx.moveTo(-p.w/2,p.h*.2); ctx.bezierCurveTo(-p.w*.42,-p.h*.5,-p.w*.1,-p.h*.18,0,-p.h*.1); ctx.bezierCurveTo(p.w*.18,-p.h*.48,p.w*.5,-p.h*.28,p.w/2,p.h*.14); ctx.bezierCurveTo(p.w*.18,p.h*.34,-p.w*.18,p.h*.36,-p.w/2,p.h*.2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='crescent'){ ctx.beginPath(); ctx.arc(0,0,p.w/2,.18*Math.PI,1.82*Math.PI); ctx.bezierCurveTo(p.w*.04,p.h*.12,p.w*.05,-p.h*.18,p.w*.38,-p.h*.31); ctx.bezierCurveTo(p.w*.08,-p.h*.02,p.w*.08,p.h*.14,p.w*.36,p.h*.32); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='ring'){ ctx.beginPath(); ctx.arc(0,0,p.w/2,0,Math.PI*2); ctx.arc(0,0,p.w/4,0,Math.PI*2,true); ctx.fill('evenodd'); ctx.beginPath(); ctx.arc(0,0,p.w/2,0,Math.PI*2); ctx.stroke(); }
      else if(p.shape==='heart'){ ctx.beginPath(); ctx.moveTo(0,p.h*.35); ctx.bezierCurveTo(-p.w*.52,0,-p.w*.36,-p.h*.46,0,-p.h*.18); ctx.bezierCurveTo(p.w*.36,-p.h*.46,p.w*.52,0,0,p.h*.35); ctx.fill(); ctx.stroke(); }
      else if(p.shape==='flower'){
        for(let i=0;i<6;i++){ ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.ellipse(0,-p.h*.22,p.w*.16,p.h*.28,0,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
        for(let i=0;i<6;i++){ ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.ellipse(0,-p.h*.22,p.w*.16,p.h*.28,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }
        ctx.beginPath(); ctx.arc(0,0,p.w*.18,0,Math.PI*2); ctx.fill();
      }
      else { ctx.beginPath(); ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,12); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    function drawScrew(pt, colorId, reachable){
      const col=colorById(colorId).hex;
      ctx.save();
      ctx.globalAlpha = reachable ? 1 : .52;
      ctx.fillStyle=col; ctx.strokeStyle=reachable ? 'rgba(20,20,20,.55)' : 'rgba(20,20,20,.34)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,reachable ? 13 : 11,0,Math.PI*2); ctx.fill(); ctx.stroke();
      const g=ctx.createRadialGradient(pt.x-4,pt.y-5,2,pt.x,pt.y,14);
      g.addColorStop(0,'rgba(255,255,255,.75)'); g.addColorStop(1,'rgba(0,0,0,.12)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(pt.x,pt.y,reachable ? 12 : 10,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.82)'; ctx.lineWidth=2;
      ctx.beginPath();
      if(colorIndex(colorId) % 2){ ctx.moveTo(pt.x-6,pt.y); ctx.lineTo(pt.x+6,pt.y); }
      else { ctx.moveTo(pt.x-5,pt.y); ctx.lineTo(pt.x+5,pt.y); ctx.moveTo(pt.x,pt.y-5); ctx.lineTo(pt.x,pt.y+5); }
      ctx.stroke();
      drawGameSprite(ctx,'pieces',12,pt.x-10,pt.y-10,20,20,.65);
      if(reachable){ ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(pt.x,pt.y,15,0,Math.PI*2); ctx.stroke(); }
      ctx.restore();
    }
    function draw(){
      const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#c9ebff'); bg.addColorStop(.55,'#a9d7f5'); bg.addColorStop(1,'#bfe4ff'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);drawGameMaterial(ctx,3,0,0,W,H,.25);
      ctx.save();
      ctx.globalAlpha=.18; ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.moveTo(220,20); ctx.lineTo(380,90); ctx.lineTo(292,150); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(110,270); ctx.lineTo(230,330); ctx.lineTo(120,380); ctx.closePath(); ctx.fill();
      ctx.restore();
      const activePanels = panels.filter(p=>!p.gone).sort((a,b)=>a.z-b.z);
      activePanels.forEach(p => {
        drawPanel(p);
        (p.screws || []).filter(s=>!s.gone).forEach(s => drawScrew(screwWorld(p, s), s.color, isScrewReachable(p, s)));
      });
      activePanels.forEach(p => {
        (p.screws || []).filter(s=>!s.gone && isScrewReachable(p, s)).forEach(s => drawScrew(screwWorld(p, s), s.color, true));
      });
    }
  }
  startScrew(state);
  return env.activeGameController || null;
}
