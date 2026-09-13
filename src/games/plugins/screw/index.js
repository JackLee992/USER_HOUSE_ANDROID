import {
  SCREW_CAMPAIGN_LEVELS,
  addEndlessBox,
  addTraySlot,
  advanceFallingPanel,
  advanceFlight,
  allLiveScrews,
  applyScrew,
  beginNextScrewLevel,
  colorForScrew,
  createScrewState,
  endlessScore,
  progressPercent,
  reachableScrews,
  restoreScrewState,
  screwWorld,
  undoScrew,
  useHint,
} from './model.js';

export const GAME_ID = 'screw';
export const GAME_VERSION = '1.2.3';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze([
  'activeGameController','choiceForState','choiceSavePatch','clearProgress','currentGameDurationMs',
  'gamePaused','getHostDocument','getHostWindow','qs','saveProgress','scheduleFitGameSurface',
  'setScore','showGameOver','speak','toast',
]);

const W = 420, H = 560;
const PANEL_TINTS = [
  ['#f2aaa6','#d77c7b'], ['#afccef','#7199c8'], ['#f2d889','#d0ac54'], ['#b5d7bb','#78ad86'],
  ['#cfbde7','#9c7fc1'], ['#edbd9d','#d28c66'], ['#afd9d7','#6daaaa'],
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutCubic = value => 1 - (1 - value) ** 3;
const easeInCubic = value => value ** 3;

function performancePixelRatio(win) {
  let mode = 'normal';
  try { mode = win.localStorage?.getItem('wanba_performance_v1') || 'normal'; } catch {}
  const cap = mode === 'eco' ? 1 : mode === 'game' ? 3 : 2;
  return { mode, value:Math.max(1, Math.min(cap, Number(win.devicePixelRatio) || 1)) };
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function panelPath(ctx, panel) {
  const w = panel.w, h = panel.h;
  if (panel.shape === 'disc') {
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.closePath(); return;
  }
  if (panel.shape === 'capsule' || panel.shape === 'bar') {
    roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2); return;
  }
  if (panel.shape === 'triangle') {
    ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); return;
  }
  if (panel.shape === 'shield') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2 + 24); ctx.quadraticCurveTo(0, -h / 2 - 8, w / 2, -h / 2 + 24);
    ctx.lineTo(w * .43, h * .16); ctx.quadraticCurveTo(w * .25, h * .42, 0, h / 2);
    ctx.quadraticCurveTo(-w * .25, h * .42, -w * .43, h * .16); ctx.closePath(); return;
  }
  if (panel.shape === 'cross') {
    const x = w * .19, y = h * .22;
    ctx.beginPath(); ctx.moveTo(-x,-h/2); ctx.lineTo(x,-h/2); ctx.lineTo(x,-y); ctx.lineTo(w/2,-y);
    ctx.lineTo(w/2,y); ctx.lineTo(x,y); ctx.lineTo(x,h/2); ctx.lineTo(-x,h/2); ctx.lineTo(-x,y);
    ctx.lineTo(-w/2,y); ctx.lineTo(-w/2,-y); ctx.lineTo(-x,-y); ctx.closePath(); return;
  }
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 28);
}

function drawScrew(ctx, colorId, x, y, radius = 14, rotation = 0, glow = false, alpha = 1) {
  const color = colorForScrew(colorId);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha *= alpha;
  ctx.shadowColor = glow ? 'rgba(109,76,54,.28)' : 'rgba(83,55,75,.22)'; ctx.shadowBlur = glow ? 8 : 5; ctx.shadowOffsetY = glow ? 2 : 3;
  const outer = ctx.createRadialGradient(-radius * .34, -radius * .42, radius * .05, 0, 0, radius * 1.08);
  outer.addColorStop(0, '#fffefa'); outer.addColorStop(.16, color.light); outer.addColorStop(.5, color.hex);
  outer.addColorStop(.86, color.dark); outer.addColorStop(1, '#68475d');
  ctx.fillStyle = outer; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = 'rgba(255,255,255,.78)'; ctx.lineWidth = Math.max(1.2, radius * .1);
  ctx.beginPath(); ctx.arc(-radius*.08, -radius*.1, radius*.73, Math.PI*1.08, Math.PI*1.76); ctx.stroke();
  ctx.strokeStyle = '#5e3a52'; ctx.lineWidth = Math.max(2.2, radius * .2); ctx.lineCap = 'round';
  const slot = radius * .42; ctx.beginPath(); ctx.moveTo(-slot,-slot); ctx.lineTo(slot,slot);
  ctx.moveTo(slot,-slot); ctx.lineTo(-slot,slot); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.36)'; ctx.lineWidth = Math.max(1, radius * .07);
  ctx.beginPath(); ctx.arc(0, 0, radius * .92, 0, Math.PI * 2); ctx.stroke();
  if (glow) {
    ctx.strokeStyle = 'rgba(255,249,226,.96)'; ctx.lineWidth = Math.max(2, radius * .16);
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.18, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawPanel(ctx, panel, options = {}) {
  const tint = PANEL_TINTS[panel.tint % PANEL_TINTS.length];
  ctx.save(); ctx.translate(panel.x, panel.y); ctx.rotate(panel.a || 0); ctx.globalAlpha *= options.alpha ?? 1;
  if (options.filter && 'filter' in ctx) ctx.filter = options.filter;
  const edgeAlpha = options.edgeAlpha ?? 1;
  ctx.shadowColor = `rgba(91,59,80,${options.shadowAlpha ?? .2})`; ctx.shadowBlur = options.shadowBlur ?? 12; ctx.shadowOffsetY = options.shadowOffsetY ?? 7;
  panelPath(ctx, panel); ctx.fillStyle = '#7f6174'; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  panelPath(ctx, panel);
  const gradient = ctx.createLinearGradient(-panel.w * .4, -panel.h / 2, panel.w * .35, panel.h / 2);
  if (panel.material === 'hardwood') {
    gradient.addColorStop(0, '#fff0dc'); gradient.addColorStop(.48, '#edcfaa'); gradient.addColorStop(1, '#d9aa7b');
  } else if (panel.material === 'brushed-steel') {
    gradient.addColorStop(0, '#fffefe'); gradient.addColorStop(.27, '#e7e2e8');
    gradient.addColorStop(.56, '#f5f1f5'); gradient.addColorStop(1, '#beb8c4');
  } else if (panel.material === 'acrylic') {
    // Keep the glass-like palette opaque enough that buried pieces do not show
    // through as false targets on an already dense endless board.
    gradient.addColorStop(0, tint[0]); gradient.addColorStop(.55, tint[0]); gradient.addColorStop(1, tint[1]);
  } else {
    gradient.addColorStop(0, tint[0]); gradient.addColorStop(.55, tint[0]); gradient.addColorStop(1, tint[1]);
  }
  ctx.fillStyle = gradient; ctx.fill();
  ctx.lineWidth = options.outerWidth ?? 3; ctx.strokeStyle = `rgba(255,255,255,${.76 * edgeAlpha})`; ctx.stroke();
  if ((options.innerWidth ?? 1) > 0) {
    ctx.lineWidth = options.innerWidth ?? 1; ctx.strokeStyle = `rgba(104,72,91,${.34 * edgeAlpha})`; panelPath(ctx, panel); ctx.stroke();
  }
  ctx.save(); panelPath(ctx, panel); ctx.clip();
  if (options.detail !== false) {
    const shine = ctx.createLinearGradient(0, -panel.h / 2, 0, panel.h / 2);
    shine.addColorStop(0, 'rgba(255,255,255,.38)'); shine.addColorStop(.24, 'rgba(255,255,255,.1)');
    shine.addColorStop(.58, 'rgba(255,255,255,0)'); shine.addColorStop(1, 'rgba(91,54,77,.07)');
    ctx.fillStyle = shine; ctx.fillRect(-panel.w / 2, -panel.h / 2, panel.w, panel.h);
    if (panel.material === 'hardwood') {
      ctx.strokeStyle = 'rgba(148,91,56,.08)'; ctx.lineWidth = 1;
      for (let line = -panel.h / 2 + 28; line < panel.h / 2; line += 28) {
        ctx.beginPath(); ctx.moveTo(-panel.w / 2, line); ctx.bezierCurveTo(-60,line-6,60,line+6,panel.w/2,line-2); ctx.stroke();
      }
    } else if (panel.material === 'brushed-steel') {
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
      for (let line = -panel.h / 2 + 14; line < panel.h / 2; line += 14) {
        ctx.beginPath(); ctx.moveTo(-panel.w / 2, line); ctx.lineTo(panel.w / 2, line); ctx.stroke();
      }
    } else if (panel.material === 'acrylic') {
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath();
      ctx.ellipse(-panel.w*.16,-panel.h*.2,panel.w*.28,panel.h*.08,-.12,0,Math.PI*2); ctx.fill();
    }
  }
  if (options.fog) {
    ctx.fillStyle = `rgba(250,247,248,${options.fog})`;
    panelPath(ctx, panel); ctx.fill();
  }
  ctx.restore();
  for (const screw of panel.screws || []) {
    if (options.visibleScrewIds && !options.visibleScrewIds.has(screw.id)) continue;
    ctx.save(); ctx.translate(screw.lx, screw.ly);
    ctx.fillStyle = '#d8ceca'; ctx.shadowColor = 'rgba(91,57,76,.18)'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(0, 2, 17, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 1, 16, Math.PI*1.05, Math.PI*1.82); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

function drawBackground(ctx) {
  const background = ctx.createLinearGradient(0, 0, 0, H);
  background.addColorStop(0, '#faf8f6'); background.addColorStop(.54, '#f3efee'); background.addColorStop(1, '#ece9e7');
  ctx.fillStyle = background; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.shadowColor='rgba(95,75,82,.12)'; ctx.shadowBlur=14; ctx.shadowOffsetY=6;
  roundRectPath(ctx,12,10,W-24,H-20,30); ctx.fillStyle='#eee8e4'; ctx.fill(); ctx.restore();
  const desk = ctx.createLinearGradient(15, 10, W-12, H);
  desk.addColorStop(0, '#f8f5f1'); desk.addColorStop(.48, '#f1ece8'); desk.addColorStop(1, '#e9e3df');
  roundRectPath(ctx,12,10,W-24,H-20,30); ctx.fillStyle=desk; ctx.fill();
  ctx.save(); roundRectPath(ctx,12,10,W-24,H-20,30); ctx.clip();
  ctx.strokeStyle='rgba(137,105,93,.03)'; ctx.lineWidth=1;
  for (let y=34; y<H; y+=50) {
    ctx.beginPath(); ctx.moveTo(4,y); ctx.bezierCurveTo(112,y-7,292,y+8,W+8,y-3); ctx.stroke();
  }
  const center = ctx.createRadialGradient(W*.5,H*.42,24,W*.5,H*.42,255);
  center.addColorStop(0,'rgba(255,255,255,.18)'); center.addColorStop(.72,'rgba(255,255,255,.04)'); center.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=center; ctx.fillRect(0,0,W,H); ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.58)'; ctx.lineWidth=1.5; roundRectPath(ctx,15,13,W-30,H-26,27); ctx.stroke();
}

export function createGame(env, savedState) {
  const win = env.getHostWindow(), doc = env.getHostDocument(), root = env.qs('#wb-gamebox');
  const choice = env.choiceForState('screw', savedState);
  const restored = restoreScrewState(savedState, choice.id);
  let state = restored.state, destroyed = false, frameId = 0, lastFrameAt = 0, drawCount = 0, staticBuildCount = 0;
  let focusStats = { priority:0, secondary:0, hidden:0 };
  let hint = null, shake = null, flights = [], falling = [], particles = [];
  let statusText = state.mode === 'endless' ? '持续收纳，板件会自动补入' : '优先拧下与收纳盒同色的螺丝', resizeObserver = null;

  root.innerHTML = [
    '<section class="wb-screw-panel" data-screw-version="atelier-v3">',
    '<header class="wb-screw-top">',
    '<div class="wb-screw-level"><span id="wb-screw-level-label">关卡</span><strong id="wb-screw-level">1</strong><small id="wb-screw-mode">经典工坊</small></div>',
    '<div class="wb-screw-boxes" id="wb-screw-boxes" aria-label="当前收纳盒"></div>',
    '<div class="wb-screw-next"><span>下一盒</span><i id="wb-screw-next-color"></i></div>',
    '<div class="wb-screw-progress"><div id="wb-screw-progress-fill"></div><span id="wb-screw-progress-text">0%</span></div>',
    '<div class="wb-screw-tray-wrap"><span>暂存</span><div class="wb-screw-tray" id="wb-screw-tray"></div></div>',
    '<div class="wb-screw-toolbelt" aria-label="解谜工具">',
    '<button type="button" class="wb-screw-tool" id="wb-screw-undo"><b>↶</b><span>撤销</span><em id="wb-screw-undo-left">3</em></button>',
    '<button type="button" class="wb-screw-tool" id="wb-screw-hint"><b>◉</b><span>提示</span><em id="wb-screw-hint-left">3</em></button>',
    '<button type="button" class="wb-screw-tool" id="wb-screw-extra"><b>＋</b><span id="wb-screw-extra-label">加孔</span><em id="wb-screw-extra-left">1</em></button>',
    '</div></header>',
    '<div class="wb-screw-stage"><canvas class="wb-screw-canvas" id="wb-screw-canvas" aria-label="拧螺丝游戏板"></canvas>',
    '<div class="wb-screw-callout" id="wb-screw-callout" role="status"></div>',
    '<div class="wb-screw-result" id="wb-screw-result" hidden><div class="wb-screw-result-card">',
    '<div class="wb-screw-result-stars" id="wb-screw-result-stars"></div><h3 id="wb-screw-result-title"></h3>',
    '<p id="wb-screw-result-copy"></p><button type="button" class="wb-btn primary" id="wb-screw-result-primary"></button>',
    '<button type="button" class="wb-btn" id="wb-screw-result-secondary"></button></div></div></div></section>',
  ].join('');

  const canvas = root.querySelector('#wb-screw-canvas');
  const ctx = canvas.getContext('2d', { alpha:false, desynchronized:true });
  const renderProfile = performancePixelRatio(win);
  canvas.width = Math.round(W * renderProfile.value); canvas.height = Math.round(H * renderProfile.value);
  canvas.dataset.screwArt = 'atelier-v3'; canvas.dataset.renderMode = renderProfile.mode; canvas.dataset.depthFocus = 'semantic-v2';
  ctx.setTransform(renderProfile.value, 0, 0, renderProfile.value, 0, 0); ctx.imageSmoothingEnabled = true;
  const staticLayer = doc.createElement('canvas');
  staticLayer.width = canvas.width; staticLayer.height = canvas.height;
  const staticCtx = staticLayer.getContext('2d', { alpha:false, desynchronized:true });
  staticCtx.imageSmoothingEnabled = true;
  let staticDirty = true;
  const invalidateBoard = () => { staticDirty = true; };

  const haptic = (pattern = 10) => { try { win.navigator?.vibrate?.(pattern); } catch {} };
  function save(force = false) {
    if (!destroyed) env.saveProgress('screw', Object.assign(structuredClone(state), env.choiceSavePatch('screw', choice)), force ? { immediate:true } : undefined);
  }
  const scoreNow = () => state.mode === 'endless' ? state.score + endlessScore(state) : state.score + Math.round(progressPercent(state) * (4 + Math.min(6, state.level)));
  const updateScore = () => env.setScore('screw', scoreNow());

  function boxMarkup(box) {
    const color = colorForScrew(box.color);
    const holes = Array.from({ length:3 }, (_, index) =>
      '<i class="wb-screw-box-hole ' + (index < box.fill ? 'filled' : '') + '">' +
      (index < box.fill ? '<span style="--c:' + color.hex + ';--d:' + color.dark + ';--l:' + color.light + '"></span>' : '') + '</i>'
    ).join('');
    return '<div class="wb-screw-box" style="--c:' + color.hex + ';--d:' + color.dark + ';--l:' + color.light +
      '" aria-label="' + color.name + ' ' + box.fill + '/3">' + holes + '<small>' + box.fill + '/3</small></div>';
  }

  function showResult() {
    const overlay = root.querySelector('#wb-screw-result');
    if (state.status === 'playing') { overlay.hidden = true; return; }
    overlay.hidden = false;
    const won = state.status === 'level_complete', endless = state.mode === 'endless';
    root.querySelector('#wb-screw-result-stars').textContent = won ? '★'.repeat(state.levelStars || 1) + '☆'.repeat(3 - (state.levelStars || 1)) : endless ? '✦' : '⚙';
    root.querySelector('#wb-screw-result-title').textContent = won ? '第 ' + state.level + ' 关完成' : endless ? '本次收纳结束' : '临时孔位已满';
    root.querySelector('#wb-screw-result-copy').textContent = won ?
      '本关奖励 ' + state.reward + ' 分 · ' + state.moves + ' 步完成' : endless ?
      '坚持到第 ' + state.details.endlessLayers + ' 层 · 收纳 ' + state.details.boxesCompleted + ' 盒 · ' + scoreNow() + ' 分' :
      '已完成 ' + progressPercent(state) + '%，调整顺序就能解开。';
    const primary = root.querySelector('#wb-screw-result-primary'), secondary = root.querySelector('#wb-screw-result-secondary');
    if (won) {
      const campaignDone = state.mode === 'normal' && state.level >= SCREW_CAMPAIGN_LEVELS;
      primary.textContent = campaignDone ? '完成经典工坊' : '进入第 ' + (state.level + 1) + ' 关';
      primary.onclick = campaignDone ? finishCampaign : nextLevel; secondary.hidden = true;
    } else {
      primary.textContent = endless ? '重新开始' : '重试本关'; primary.onclick = retryLevel;
      secondary.hidden = false; secondary.textContent = endless ? '结束并结算' : '结算本局'; secondary.onclick = settleFailure;
    }
  }

  function renderUI() {
    const progress = progressPercent(state);
    const endless = state.mode === 'endless', displayLevel = endless ? state.details.endlessLayers : state.level;
    root.querySelector('.wb-screw-panel').classList.toggle('is-endless', endless);
    root.querySelector('#wb-screw-level-label').textContent = endless ? '层数' : '关卡';
    root.querySelector('#wb-screw-level').textContent = String(displayLevel);
    root.querySelector('#wb-screw-mode').textContent = endless ? '无尽工坊' : '经典工坊 · ' + SCREW_CAMPAIGN_LEVELS + '关';
    const boxesEl = root.querySelector('#wb-screw-boxes');
    boxesEl.classList.toggle('many', state.boxes.length > 3); boxesEl.innerHTML = state.boxes.map(boxMarkup).join('');
    const next = state.boxQueue[state.boxIndex], nextEl = root.querySelector('#wb-screw-next-color');
    if (next) {
      const color = colorForScrew(next);
      nextEl.style.setProperty('--c', color.hex); nextEl.style.setProperty('--d', color.dark); nextEl.hidden = false;
    } else nextEl.hidden = true;
    const continuousProgress = (state.details.boxesCompleted % 5) * 20;
    root.querySelector('#wb-screw-progress-fill').style.width = (endless ? continuousProgress : progress) + '%';
    root.querySelector('#wb-screw-progress-text').textContent = endless ? '已收纳 ' + state.details.boxesCompleted + ' 盒 · 持续补充' : progress + '%';
    root.querySelector('#wb-screw-tray').innerHTML = Array.from({ length:state.trayCapacity }, (_, index) => {
      const item = state.tray[index], color = item ? colorForScrew(item.color) : null;
      return '<i class="wb-screw-slot ' + (item ? 'occupied' : '') + '">' +
        (item ? '<span style="--c:' + color.hex + ';--d:' + color.dark + ';--l:' + color.light + '"></span>' : '') + '</i>';
    }).join('');
    for (const name of ['undo','hint','extra']) {
      root.querySelector('#wb-screw-' + name + '-left').textContent = String(state.tools[name]);
      const button = root.querySelector('#wb-screw-' + name);
      const extraBlocked = name === 'extra' && (endless ? state.boxCapacity >= 6 || state.boxIndex >= state.boxQueue.length : state.trayCapacity >= 7);
      button.disabled = state.status !== 'playing' || state.tools[name] <= 0 || (name === 'undo' && !state.history.length) || extraBlocked;
    }
    root.querySelector('#wb-screw-extra-label').textContent = endless ? '加盒' : '加孔';
    const callout = root.querySelector('#wb-screw-callout');
    callout.textContent = statusText; callout.classList.toggle('warn', state.tray.length >= state.trayCapacity - 1);
    showResult(); updateScore();
  }

  function depthStyle(index, count, focus) {
    const frontness = count <= 1 ? 1 : index / (count - 1);
    if (focus === 'priority') return {
      alpha:1, filter:'none', fog:0, edgeAlpha:1, outerWidth:3, innerWidth:1,
      detail:true, shadowAlpha:.2, shadowBlur:12, shadowOffsetY:7,
    };
    if (focus === 'secondary') return {
      alpha:.78, filter:'saturate(.66) contrast(.96)', fog:.04, edgeAlpha:.62, outerWidth:2, innerWidth:.7,
      detail:true, shadowAlpha:.12, shadowBlur:8, shadowOffsetY:5,
    };
    return {
      alpha:frontness >= .62 ? .48 : .36,
      filter:'saturate(.3) brightness(1.05)', fog:frontness >= .62 ? .14 : .2,
      edgeAlpha:.28, outerWidth:1, innerWidth:0, detail:false,
      shadowAlpha:.06, shadowBlur:4, shadowOffsetY:3,
    };
  }

  function paintStaticBoard(target, activeShake = null) {
    target.save(); target.setTransform(renderProfile.value, 0, 0, renderProfile.value, 0, 0); drawBackground(target);
    const hits = reachableScrews(state), reachability = new Map(hits.map(hit => [hit.screw.id, hit.reachable]));
    const active = new Set(state.boxes.map(box => box.color));
    const visibleScrewIds = new Set(hits.filter(hit => hit.reachable).map(hit => hit.screw.id));
    const priorityPanels = new Set(hits.filter(hit => hit.reachable && active.has(hit.screw.color)).map(hit => hit.panel.id));
    const secondaryPanels = new Set(hits.filter(hit => hit.reachable && !active.has(hit.screw.color)).map(hit => hit.panel.id));
    const nextFocusStats = { priority:0, secondary:0, hidden:0 };
    for (const hit of hits) {
      if (!hit.reachable) nextFocusStats.hidden += 1;
      else if (active.has(hit.screw.color)) nextFocusStats.priority += 1;
      else nextFocusStats.secondary += 1;
    }
    focusStats = nextFocusStats;
    const panels = state.panels.filter(item => !item.gone).sort((a, b) => a.z - b.z);
    for (let index = 0; index < panels.length; index += 1) {
      const panel = panels[index];
      const offset = activeShake?.panelId === panel.id ? Math.sin(activeShake.phase * Math.PI * 8) * 4 * (1 - activeShake.phase) : 0;
      const visual = offset ? { ...panel, x:panel.x + offset } : panel;
      const focus = priorityPanels.has(panel.id) ? 'priority' : secondaryPanels.has(panel.id) ? 'secondary' : 'hidden';
      const depth = depthStyle(index, panels.length, focus);
      drawPanel(target, visual, { ...depth, visibleScrewIds });
      for (const screw of panel.screws || []) {
        if (screw.gone) continue;
        const point = screwWorld(visual, screw), reachable = !!reachability.get(screw.id);
        if (!reachable) continue;
        const priority = active.has(screw.color);
        drawScrew(target, screw.color, point.x, point.y, priority ? 14 : 13, 0, priority, priority ? 1 : .76);
      }
    }
    target.restore();
  }

  function ensureStaticBoard() {
    if (!staticDirty) return;
    staticCtx.save(); staticCtx.setTransform(1,0,0,1,0,0); staticCtx.clearRect(0,0,staticLayer.width,staticLayer.height); staticCtx.restore();
    paintStaticBoard(staticCtx);
    staticDirty = false; staticBuildCount += 1;
  }

  function drawBoard() {
    drawCount += 1; canvas.dataset.drawCount = String(drawCount);
    if (shake) paintStaticBoard(ctx, shake);
    else {
      ensureStaticBoard();
      ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(staticLayer,0,0); ctx.restore();
    }
    ctx.save(); ctx.setTransform(renderProfile.value, 0, 0, renderProfile.value, 0, 0);
    if (hint) {
      const highlighted = allLiveScrews(state).find(hit => hit.screw.id === hint.id);
      if (highlighted) {
        const pulse = 1 + Math.sin(hint.phase * Math.PI * 6) * .1;
        drawScrew(ctx, highlighted.screw.color, highlighted.point.x, highlighted.point.y, 17 * pulse, 0, true, 1);
        ctx.strokeStyle = 'rgba(255,244,164,.94)'; ctx.lineWidth = 3; ctx.beginPath();
        ctx.arc(highlighted.point.x,highlighted.point.y,25+Math.sin(hint.phase*Math.PI*6)*3,0,Math.PI*2); ctx.stroke();
      }
    }
    for (const panel of falling) drawPanel(ctx, panel, { alpha:clamp(1 - Math.max(0, panel.time - .55) / .45, 0, 1) });
    for (const flight of flights) {
      const t = clamp(flight.time / flight.duration, 0, 1);
      let x, y, scale;
      if (t < .28) {
        const p = easeOutCubic(t / .28); x = flight.x; y = flight.y - 30 * p; scale = 1 + .36 * p;
      } else {
        const p = (t - .28) / .72, eased = easeInCubic(p), sx = flight.x, sy = flight.y - 30;
        x = sx + (flight.destX - sx) * eased; y = sy + (flight.destY - sy) * eased - Math.sin(p * Math.PI) * 58; scale = 1.36 - p * .56;
      }
      drawScrew(ctx, flight.color, x, y, 14 * scale, t * Math.PI * 7, true, 1 - Math.max(0, t - .82) / .18);
    }
    for (const particle of particles) {
      const alpha = clamp(1 - particle.time / particle.duration, 0, 1);
      ctx.globalAlpha = alpha; ctx.fillStyle = particle.color; ctx.beginPath();
      ctx.arc(particle.x,particle.y,particle.size*alpha,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  const hasAnimation = () => !!(flights.length || falling.length || particles.length || hint || shake);
  function scheduleFrame() {
    if (!destroyed && !frameId && hasAnimation() && !env.gamePaused) frameId = win.requestAnimationFrame(frame);
  }
  function frame(now) {
    frameId = 0;
    if (destroyed || env.gamePaused) { lastFrameAt = 0; return; }
    if (!lastFrameAt) { lastFrameAt = now; drawBoard(); scheduleFrame(); return; }
    const elapsed = clamp((now - lastFrameAt) / 1000, 0, .25); lastFrameAt = now;
    flights.forEach(item => advanceFlight(item, elapsed)); falling.forEach(item => advanceFallingPanel(item, elapsed));
    particles.forEach(item => { item.time += elapsed; item.x += item.vx * elapsed; item.y += item.vy * elapsed; item.vy += 260 * elapsed; });
    if (hint) { hint.phase += elapsed; if (hint.phase >= 1.35) hint = null; }
    if (shake) { shake.phase += elapsed / .42; if (shake.phase >= 1) shake = null; }
    flights = flights.filter(item => item.time < item.duration);
    falling = falling.filter(item => item.y - item.h / 2 < H + 90 && item.time < 1.1);
    particles = particles.filter(item => item.time < item.duration);
    drawBoard();
    if (hasAnimation()) scheduleFrame(); else lastFrameAt = 0;
  }

  function confetti(point, color) {
    const random = index => ((Math.imul(index + state.moves * 17, 2654435761) >>> 8) % 1000) / 1000;
    for (let index = 0; index < 12; index += 1) {
      const angle = random(index) * Math.PI * 2, speed = 42 + random(index + 20) * 86;
      particles.push({ x:point.x, y:point.y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed-50,
        size:2+random(index+40)*3, time:0, duration:.45+random(index+60)*.35, color });
    }
  }

  function awardLevel() {
    if (state.mode !== 'normal' || state.status !== 'level_complete' || state.reward > 0) return;
    const toolsUsed = (3 - state.tools.hint) + (3 - state.tools.undo) + (1 - state.tools.extra);
    const cleanBonus = (state.levelMaxTray || 0) <= 1 ? 220 : (state.levelMaxTray || 0) <= 3 ? 90 : 0;
    state.reward = Math.max(360, 1180 + state.level * 55 + cleanBonus - state.moves * 14 - toolsUsed * 80);
    state.levelStars = (state.levelMaxTray || 0) <= 1 && toolsUsed === 0 ? 3 : (state.levelMaxTray || 0) <= 3 ? 2 : 1;
    state.score += state.reward; state.campaignStars += state.levelStars;
  }

  function handleTap(event) {
    if (destroyed || env.gamePaused || state.status !== 'playing') return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * W / rect.width, y = (event.clientY - rect.top) * H / rect.height;
    const hit = reachableScrews(state).map(item => ({ ...item, distance:Math.hypot(item.point.x-x,item.point.y-y) }))
      .filter(item => item.distance <= 28).sort((a,b) => a.distance-b.distance || b.panel.z-a.panel.z)[0];
    if (!hit) return;
    if (!hit.reachable) {
      state.details.blocked += 1; shake = { panelId:hit.panel.id, phase:0 }; statusText = '这颗螺丝被上层板件压住了';
      haptic([8,25,8]); renderUI(); drawBoard(); scheduleFrame(); return;
    }
    const beforePanel = structuredClone(hit.panel), beforeBoxes = state.boxes.map(box => box.color);
    const result = applyScrew(state, hit.screw.id);
    if (!result.ok) {
      if (result.failed) {
        statusText = '5 个临时孔位已满，本次收纳结束'; env.speak('screw','gameover'); haptic([25,45,25]); save(true);
        renderUI(); drawBoard(); return;
      } else statusText = result.reason === 'tray_full' ? '临时孔位已满，先完成一个颜色盒' : '这颗螺丝暂时不能取下';
      haptic([10,30,10]); renderUI(); drawBoard(); return;
    }
    invalidateBoard();
    const boxPosition = Math.max(0, beforeBoxes.indexOf(hit.screw.color));
    const boxSpan = beforeBoxes.length > 1 ? 264 / (beforeBoxes.length - 1) : 0;
    flights.push({ x:hit.point.x, y:hit.point.y, color:hit.screw.color,
      destX:result.route === 'box' ? 78 + boxPosition * boxSpan : 140 + Math.min(state.tray.length, 5) * 28,
      destY:-28, time:0, duration:.48 });
    if (result.panelReleased) {
      beforePanel.screws.forEach(screw => { screw.gone = true; });
      falling.push({ ...beforePanel, vx:(beforePanel.x-W/2)*.34, vy:-48, va:beforePanel.x < W/2 ? -.75 : .75, time:0 });
    }
    const color = colorForScrew(hit.screw.color);
    if (result.endlessExtended) {
      statusText = '新的板件已接入，继续收纳'; confetti({ x:W / 2, y:84 }, '#fff1ae'); haptic([10,18,14]);
    } else if (result.completedBoxes.length) {
      statusText = color.name + '收纳完成，下一箱已就位'; confetti(hit.point, color.light); haptic([10,20,18]);
    } else if (result.route === 'box') {
      statusText = color.name + '螺丝收入收纳盒'; haptic(9); env.speak('screw','match');
    } else {
      statusText = state.mode === 'endless' && state.tray.length >= state.trayCapacity ?
        '临时孔位已满，下一颗必须匹配当前收纳盒' : color.name + '先放入临时孔位'; haptic(7);
    }
    if (state.tray.length === (state.mode === 'endless' ? state.trayCapacity : state.trayCapacity - 1)) env.speak('screw','tray_4');
    if (result.completed) {
      awardLevel(); statusText = '第 ' + state.level + ' 关完成'; env.speak('screw','progress_80'); haptic([18,40,25]);
    }
    if (result.failed) {
      statusText = '临时孔位已满，换个顺序再试'; env.speak('screw','gameover'); haptic([25,45,25]);
    }
    save(true); renderUI(); drawBoard(); scheduleFrame();
  }

  function onUndo() {
    if (env.gamePaused || !undoScrew(state)) return;
    invalidateBoard();
    flights=[]; falling=[]; particles=[]; hint=null; shake=null; statusText='已撤销上一步';
    haptic(8); save(true); renderUI(); drawBoard();
  }
  function onHint() {
    if (env.gamePaused) return;
    const id = useHint(state); if (!id) return;
    hint={id,phase:0}; statusText='发光的螺丝可以安全取下';
    haptic(7); save(true); renderUI(); drawBoard(); scheduleFrame();
  }
  function onExtra() {
    if (env.gamePaused) return;
    const added = state.mode === 'endless' ? addEndlessBox(state) : addTraySlot(state);
    if (!added) return;
    invalidateBoard();
    statusText = state.mode === 'endless' ? '增加了一个收纳盒，计分倍率已调整' : '增加了一个临时孔位';
    haptic([8,18,8]); env.speak('screw','add_box');
    save(true); renderUI(); drawBoard();
  }
  function retryLevel() {
    const endless = state.mode === 'endless';
    state = createScrewState({ level:endless ? 1 : state.level, mode:state.mode, score:endless ? 0 : state.score,
      campaignStars:state.campaignStars, details:endless ? undefined : state.details });
    invalidateBoard();
    statusText = endless ? '新的无尽收纳开始，板件会持续补入' : '重新规划顺序，这次一定能解开';
    flights=[]; falling=[]; particles=[]; hint=null; shake=null;
    save(true); renderUI(); drawBoard();
  }
  function nextLevel() {
    state=beginNextScrewLevel(state);
    invalidateBoard();
    statusText=state.level >= 4 ? '留意被遮住的螺丝与下一箱颜色' : '优先拧下与收纳盒同色的螺丝';
    flights=[]; falling=[]; particles=[]; hint=null; shake=null;
    save(true); renderUI(); drawBoard(); env.speak('screw','start');
  }
  function finishCampaign() {
    if (destroyed) return;
    state.details.completed=true; state.details.progress=100; env.clearProgress('screw');
    env.showGameOver('screw','经典工坊完成','总分：'+state.score+'分 · '+SCREW_CAMPAIGN_LEVELS+'关 · '+state.campaignStars+'颗星',
      null,{completed:true,score:state.score,progress:100,levels:SCREW_CAMPAIGN_LEVELS,details:structuredClone(state.details)});
  }
  function settleFailure() {
    if (destroyed) return;
    const final=scoreNow(); state.details.completed=false; env.clearProgress('screw');
    const endless = state.mode === 'endless';
    const summary = endless ? '本局分数：'+final+'分 · 第'+state.details.endlessLayers+'层 · 收纳'+state.details.boxesCompleted+'盒' :
      '本局分数：'+final+'分，完成'+progressPercent(state)+'%';
    env.showGameOver('screw','本局结束',summary,
      null,{completed:false,endless,score:final,progress:progressPercent(state),details:structuredClone(state.details)});
  }
  function onContextMenu(event) { if (event.target === canvas || canvas.contains?.(event.target)) event.preventDefault(); }
  function onVisibility() { if (doc.hidden) onPause(); else if (!env.gamePaused) onResume(); }
  function onPause() {
    if (frameId) win.cancelAnimationFrame(frameId);
    frameId=0; lastFrameAt=0; save(true);
  }
  function onResume() { if (!destroyed) { lastFrameAt=0; drawBoard(); scheduleFrame(); } }
  function getState() {
    return Object.assign(structuredClone(state), {
      fullscreen:false, render:{mode:renderProfile.mode,pixelRatio:renderProfile.value,drawCount,staticBuildCount,depthFocus:canvas.dataset.depthFocus,focus:structuredClone(focusStats),idle:!frameId&&!hasAnimation()},
      liveScrews:allLiveScrews(state).length,
    });
  }
  function destroy() {
    if (destroyed) return;
    save(true); destroyed=true;
    if (frameId) win.cancelAnimationFrame(frameId);
    frameId=0; resizeObserver?.disconnect();
    staticLayer.width=0; staticLayer.height=0;
    canvas.removeEventListener('pointerdown',handleTap); canvas.removeEventListener('contextmenu',onContextMenu);
    doc.removeEventListener('visibilitychange',onVisibility);
    flights=[]; falling=[]; particles=[]; hint=null; shake=null;
  }

  const controller={save,destroy,getState,onPause,onResume};
  env.activeGameController=controller;
  canvas.addEventListener('pointerdown',handleTap,{passive:false});
  canvas.addEventListener('contextmenu',onContextMenu);
  doc.addEventListener('visibilitychange',onVisibility);
  root.querySelector('#wb-screw-undo').onclick=onUndo;
  root.querySelector('#wb-screw-hint').onclick=onHint;
  root.querySelector('#wb-screw-extra').onclick=onExtra;
  if (win.ResizeObserver) {
    resizeObserver=new win.ResizeObserver(() => { if (!destroyed) drawBoard(); });
    resizeObserver.observe(canvas);
  }
  if (restored.migrated) {
    statusText=state.mode === 'endless' ? '旧分数已保留，无尽模式已恢复连续补层' : '旧进度已转换为公平新关卡';
    env.toast?.(state.mode === 'endless' ? '无尽模式已恢复连续游玩，原分数已保留' : '拧螺丝经典关卡已升级，原分数已保留');
  }
  awardLevel(); renderUI(); drawBoard(); save(true); env.scheduleFitGameSurface?.();
  return controller;
}
