import {
  createForkBaselineGame,
  FORK_BASELINE_COMMIT,
  FORK_BASELINE_MANIFEST_VERSION,
  FORK_BASELINE_START_SCREW_SHA256,
  ORIGINAL_GAME_ID,
  REQUIRED_ENV,
} from './fork-baseline-game.js';

export const GAME_ID = 'screwclassic';
export const GAME_VERSION = '1.0.1';
export const HOST_API_VERSION = 1;
export const FORK_BASELINE_SCREW_CSS_SHA256 = 'e2ccda9a83d23c250283787c55b78478935b42593869772e9a32a71e600407d4';
export const FORK_BASELINE_ICON_SHA256 = '03baa527088f73ae9f3ac70e51c11a1d006ff56be40b3cd4f3ba1c201457628b';
export {
  FORK_BASELINE_COMMIT,
  FORK_BASELINE_MANIFEST_VERSION,
  FORK_BASELINE_START_SCREW_SHA256,
  REQUIRED_ENV,
};

// These declarations reproduce the fork-baseline Screw CSS under the classic
// game scope. Reset values only prevent later Crazy Screw rules from leaking in.
const ORIGINAL_STYLE = "\n.wb-board-wrap.wb-gamebox-screwclassic { height:100%; flex:1 1 0; align-items:stretch; justify-items:center; padding:8px; background:var(--wb-board); border-radius:0; }\n.wb-gamebox-screwclassic .wb-screw-panel { width:min(100%,560px); height:100%; max-height:100%; min-height:0; display:grid; grid-template-rows:124px minmax(0,1fr); gap:8px; justify-items:center; align-items:stretch; overflow:hidden; box-sizing:border-box; color:var(--wb-text); }\n.wb-gamebox-screwclassic .wb-screw-top { width:100%; height:124px; min-height:124px; display:grid; grid-template-rows:70px 32px; grid-template-columns:minmax(0,1fr); grid-template-areas:none; gap:8px; align-items:center; padding:8px; box-sizing:border-box; overflow:hidden; background:var(--wb-soft); border:1px solid var(--wb-border); border-radius:0; color:var(--wb-text); box-shadow:inset 0 1px 0 rgba(255,255,255,.28); }\n.wb-gamebox-screwclassic .wb-screw-boxes { grid-area:auto; height:70px; min-height:0; display:flex; gap:8px; align-items:center; justify-content:center; min-width:0; max-width:100%; overflow:hidden; flex-wrap:nowrap; }\n.wb-gamebox-screwclassic .wb-screw-tools { width:100%; height:32px; min-width:0; display:grid; grid-template-columns:minmax(150px,1fr) auto auto; gap:8px; align-items:center; justify-content:center; overflow:hidden; }\n.wb-gamebox-screwclassic .wb-screw-box { --d:var(--wb-text); --l:#fff; position:relative; flex:0 0 64px; width:64px; height:58px; border:1px solid color-mix(in srgb,var(--c) 68%,var(--wb-border) 32%); border-radius:8px; background:linear-gradient(180deg,color-mix(in srgb,var(--c) 20%,var(--wb-panel) 80%),color-mix(in srgb,var(--c) 46%,var(--wb-soft) 54%)); box-shadow:inset 0 1px 0 rgba(255,255,255,.42),0 3px 8px rgba(0,0,0,.10); display:grid; grid-template-columns:repeat(2,20px); grid-template-rows:repeat(2,20px); justify-content:center; align-content:center; gap:1px 8px; color:var(--wb-text); }\n.wb-gamebox-screwclassic .wb-screw-box::before { content:''; position:absolute; top:-8px; left:22px; transform:none; width:20px; height:9px; border:0; border-radius:4px 4px 0 0; background:linear-gradient(90deg,var(--wb-border) 0 24%,color-mix(in srgb,var(--c) 68%,#fff 32%) 25% 75%,var(--wb-border) 76%); }\n.wb-gamebox-screwclassic .wb-screw-box::after { display:none; }\n.wb-gamebox-screwclassic .wb-screw-box-hole { position:relative; z-index:1; width:18px; height:18px; border-radius:50%; background:color-mix(in srgb,var(--wb-border) 65%,#777 35%); box-shadow:inset 0 2px 1px rgba(255,255,255,.28),inset 0 -2px 2px rgba(0,0,0,.18); }\n.wb-gamebox-screwclassic .wb-screw-box-hole:first-child { grid-column:1/3; justify-self:center; }\n.wb-gamebox-screwclassic .wb-screw-box-hole i { display:block; width:100%; height:100%; border-radius:50%; box-shadow:inset 0 2px 0 rgba(255,255,255,.36),0 1px 2px rgba(0,0,0,.24); }\n.wb-gamebox-screwclassic .wb-screw-box.active { outline:2px solid color-mix(in srgb,var(--c) 55%,#fff 45%); outline-offset:2px; }\n.wb-gamebox-screwclassic .wb-screw-progress { grid-area:auto; position:relative; width:auto; height:18px; border:1px solid var(--wb-border); border-radius:999px; background:var(--wb-panel); box-shadow:none; overflow:hidden; min-width:150px; }\n.wb-gamebox-screwclassic #wb-screw-progress-fill { display:block; height:100%; width:0; border-radius:0; background:linear-gradient(90deg,var(--wb-accent),var(--wb-accent2)); box-shadow:none; }\n.wb-gamebox-screwclassic #wb-screw-progress-text { position:absolute; inset:0; display:grid; place-items:center; font-size:10px; font-weight:900; color:var(--wb-text); text-shadow:0 1px 0 rgba(255,255,255,.45); }\n.wb-gamebox-screwclassic .wb-screw-tray { min-width:0; display:grid; grid-template-columns:repeat(5,24px); gap:6px; padding:0; border-radius:0; background:none; box-shadow:none; justify-self:center; }\n.wb-gamebox-screwclassic .wb-screw-slot { width:24px; height:24px; padding:0; border:1px solid var(--wb-border); border-radius:50%; background:var(--wb-panel); box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 1px 3px rgba(0,0,0,.08); display:grid; place-items:center; box-sizing:border-box; }\n.wb-gamebox-screwclassic .wb-screw-slot span { width:17px; height:17px; border-radius:50%; box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 1px 3px rgba(0,0,0,.18); }\n.wb-gamebox-screwclassic .wb-screw-canvas { display:block; height:100%; width:auto; max-width:100%; max-height:100%; aspect-ratio:3/4; align-self:center; justify-self:center; background:var(--wb-board); border:0; border-radius:0; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); touch-action:none; user-select:none; -webkit-user-select:none; }\n.wb-gamebox-screwclassic .wb-screw-addbox { justify-self:center; min-width:132px; min-height:0; margin-bottom:2px; padding:6px 10px; border-radius:0; }\n.wb-gamebox-screwclassic .wb-screw-addbox span { display:inline-grid; place-items:center; min-width:18px; height:18px; margin-left:4px; border-radius:999px; background:var(--wb-soft); border:1px solid var(--wb-border); font-size:11px; }\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-top { background:linear-gradient(180deg,#e8f6ff,#fff2f8); border-color:#7DB9D8; box-shadow:inset 0 1px 0 rgba(255,255,255,.72),0 2px 8px rgba(79,141,247,.14); }\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-canvas { background:linear-gradient(180deg,#c9ebff 0%,#a9d7f5 55%,#bfe4ff 100%); border:4px solid #5FA8D7; box-shadow:inset 0 0 0 1px rgba(255,255,255,.42),0 6px 16px rgba(79,141,247,.18); filter:none; image-rendering:auto; }\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-box { border-color:color-mix(in srgb,var(--c) 76%,#24536f 24%); background:linear-gradient(180deg,color-mix(in srgb,var(--c) 22%,#fff 78%),color-mix(in srgb,var(--c) 58%,#f5fbff 42%)); box-shadow:inset 0 1px 0 rgba(255,255,255,.58),0 4px 10px rgba(79,141,247,.14); filter:none; }\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-box::before { background:linear-gradient(90deg,color-mix(in srgb,var(--c) 42%,#24536f 58%) 0 24%,color-mix(in srgb,var(--c) 74%,#fff 26%) 25% 75%,color-mix(in srgb,var(--c) 42%,#24536f 58%) 76%); }\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-box-hole { background:#eef5f8; border:1px solid rgba(36,83,111,.32); }\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-box-hole i,\n#wanbanXiaowu-popup.wb-mono .wb-gamebox-screwclassic .wb-screw-slot span { filter:none; }\n@media (max-width:768px) {\n  .wb-board-wrap.wb-gamebox-screwclassic { padding:0; }\n  .wb-gamebox-screwclassic .wb-screw-panel { width:100%; grid-template-rows:78px minmax(0,1fr); gap:2px; }\n  .wb-gamebox-screwclassic .wb-screw-top { height:78px; min-height:78px; grid-template-rows:40px 29px; gap:2px; padding:3px 4px; }\n  .wb-gamebox-screwclassic .wb-screw-boxes { height:40px; gap:4px; }\n  .wb-gamebox-screwclassic .wb-screw-tools { height:29px; grid-template-columns:minmax(66px,1fr) auto auto; gap:4px; }\n  .wb-gamebox-screwclassic .wb-screw-box { flex-basis:clamp(38px,11.4vw,46px); width:clamp(38px,11.4vw,46px); height:clamp(32px,9.8vw,38px); grid-template-columns:repeat(2,12px); grid-template-rows:repeat(2,12px); gap:0 4px; border-radius:5px; }\n  .wb-gamebox-screwclassic .wb-screw-box::before { top:-6px; left:50%; transform:translateX(-50%); width:16px; height:7px; border-radius:3px 3px 0 0; }\n  .wb-gamebox-screwclassic .wb-screw-box-hole { width:12px; height:12px; }\n  .wb-gamebox-screwclassic .wb-screw-box.active { outline-width:1px; outline-offset:1px; }\n  .wb-gamebox-screwclassic .wb-screw-progress { width:100%; min-width:0; height:13px; justify-self:stretch; }\n  .wb-gamebox-screwclassic #wb-screw-progress-text { font-size:8px; }\n  .wb-gamebox-screwclassic .wb-screw-tray { grid-template-columns:repeat(5,17px); gap:3px; }\n  .wb-gamebox-screwclassic .wb-screw-slot { width:17px; height:17px; }\n  .wb-gamebox-screwclassic .wb-screw-slot span { width:12px; height:12px; }\n  .wb-gamebox-screwclassic .wb-screw-canvas { height:100%; width:auto; max-width:100%; }\n  .wb-gamebox-screwclassic .wb-screw-addbox { min-width:54px; min-height:21px; margin-bottom:0; padding:2px 5px; font-size:9px; }\n  .wb-gamebox-screwclassic .wb-screw-addbox span { min-width:13px; height:13px; font-size:8px; margin-left:2px; }\n}";

function installOriginalStyle(box) {
  const document = box?.ownerDocument;
  if (!document || document.getElementById('wanba-screwclassic-original-css')) return;
  const style = document.createElement('style');
  style.id = 'wanba-screwclassic-original-css';
  style.textContent = ORIGINAL_STYLE;
  (document.head || document.documentElement).appendChild(style);
}

const GAME_ID_METHODS = new Set([
  'choiceForState',
  'choiceSavePatch',
  'clearProgress',
  'saveProgress',
  'setScore',
  'showGameOver',
  'speak',
]);

function isolatedClassicEnv(env) {
  return new Proxy(env, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (!GAME_ID_METHODS.has(property) || typeof value !== 'function') return value;
      return (gameId, ...args) => Reflect.apply(value, target, [gameId === ORIGINAL_GAME_ID ? GAME_ID : gameId, ...args]);
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}

export function createGame(env, state) {
  installOriginalStyle(env.qs('#wb-gamebox'));
  return createForkBaselineGame(isolatedClassicEnv(env), state);
}
