import {
  SCREW_CAMPAIGN_LEVELS,
  addTraySlot,
  advanceFallingPanel,
  advanceFlight,
  allLiveScrews,
  applyScrew,
  beginNextScrewLevel,
  colorForScrew,
  createScrewState,
  progressPercent,
  reachableScrews,
  restoreScrewState,
  screwWorld,
  undoScrew,
  useHint,
} from './model.js';

export const GAME_ID = 'screw';
export const GAME_VERSION = '1.1.0';
export const HOST_API_VERSION = 1;
export const REQUIRED_ENV = Object.freeze([
  'activeGameController','choiceForState','choiceSavePatch','clearProgress','currentGameDurationMs',
  'gamePaused','getHostDocument','getHostWindow','qs','saveProgress','scheduleFitGameSurface',
  'setScore','showGameOver','speak','toast',
]);

const W = 420, H = 560;
const PANEL_TINTS = [
  ['#e96f68','#a63f4a'], ['#5d8fdd','#31579f'], ['#e7b746','#a8741d'], ['#62af78','#34764d'],
  ['#9a71d2','#62439a'], ['#dd8350','#9a4b29'], ['#4eafb4','#236e76'],
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
  if (glow) { ctx.shadowColor = color.light; ctx.shadowBlur = 16; }
  const outer = ctx.createRadialGradient(-radius * .32, -radius * .42, radius * .08, 0, 0, radius * 1.08);
  outer.addColorStop(0, '#ffffff'); outer.addColorStop(.12, color.light); outer.addColorStop(.48, color.hex);
  outer.addColorStop(.83, color.dark); outer.addColorStop(1, '#17233a');
  ctx.fillStyle = outer; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineWidth = Math.max(1.2, radius * .1);
  ctx.beginPath(); ctx.arc(-radius*.08, -radius*.1, radius*.72, Math.PI*1.08, Math.PI*1.75); ctx.stroke();
  ctx.strokeStyle = 'rgba(18,27,52,.82)'; ctx.lineWidth = Math.max(2.2, radius * .2); ctx.lineCap = 'round';
  const slot = radius * .42; ctx.beginPath(); ctx.moveTo(-slot,-slot); ctx.lineTo(slot,slot);
  ctx.moveTo(slot,-slot); ctx.lineTo(-slot,slot); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = Math.max(1, radius * .07);
  ctx.beginPath(); ctx.arc(0, 0, radius * .92, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawPanel(ctx, panel, options = {}) {
  const tint = PANEL_TINTS[panel.tint % PANEL_TINTS.length];
  ctx.save(); ctx.translate(panel.x, panel.y); ctx.rotate(panel.a || 0); ctx.globalAlpha *= options.alpha ?? 1;
  ctx.shadowColor = 'rgba(2,8,24,.58)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 11;
  panelPath(ctx, panel); ctx.fillStyle = '#0c1425'; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  panelPath(ctx, panel);
  const gradient = ctx.createLinearGradient(-panel.w * .4, -panel.h / 2, panel.w * .35, panel.h / 2);
  if (panel.material === 'hardwood') {
    gradient.addColorStop(0, '#f2b86b'); gradient.addColorStop(.46, '#c7783f'); gradient.addColorStop(1, '#86452f');
  } else if (panel.material === 'brushed-steel') {
    gradient.addColorStop(0, '#e8eef4'); gradient.addColorStop(.25, '#8795a4');
    gradient.addColorStop(.52, '#d4dde5'); gradient.addColorStop(1, '#627181');
  } else if (panel.material === 'acrylic') {
    gradient.addColorStop(0, tint[0] + 'e8'); gradient.addColorStop(.55, tint[0] + 'b8'); gradient.addColorStop(1, tint[1] + 'dc');
  } else {
    gradient.addColorStop(0, tint[0]); gradient.addColorStop(.55, tint[0]); gradient.addColorStop(1, tint[1]);
  }
  ctx.fillStyle = gradient; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(12,22,45,.48)'; panelPath(ctx, panel); ctx.stroke();
  ctx.save(); panelPath(ctx, panel); ctx.clip();
  const shine = ctx.createLinearGradient(0, -panel.h / 2, 0, panel.h / 2);
  shine.addColorStop(0, 'rgba(255,255,255,.45)'); shine.addColorStop(.22, 'rgba(255,255,255,.13)');
  shine.addColorStop(.5, 'rgba(255,255,255,0)'); shine.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = shine; ctx.fillRect(-panel.w / 2, -panel.h / 2, panel.w, panel.h);
  if (panel.material === 'hardwood') {
    ctx.strokeStyle = 'rgba(105,49,27,.23)'; ctx.lineWidth = 2;
    for (let line = -panel.h / 2 + 19; line < panel.h / 2; line += 19) {
      ctx.beginPath(); ctx.moveTo(-panel.w / 2, line); ctx.bezierCurveTo(-60,line-8,60,line+8,panel.w/2,line-3); ctx.stroke();
    }
  } else if (panel.material === 'brushed-steel') {
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
    for (let line = -panel.h / 2 + 8; line < panel.h / 2; line += 7) {
      ctx.beginPath(); ctx.moveTo(-panel.w / 2, line); ctx.lineTo(panel.w / 2, line); ctx.stroke();
    }
  } else if (panel.material === 'acrylic') {
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath();
    ctx.ellipse(-panel.w*.16,-panel.h*.2,panel.w*.28,panel.h*.08,-.12,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  for (const screw of panel.screws || []) {
    ctx.save(); ctx.translate(screw.lx, screw.ly);
    ctx.fillStyle = 'rgba(3,8,20,.74)'; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(0, 2, 17, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 1, 16, Math.PI*1.05, Math.PI*1.82); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

function drawBackground(ctx) {
  const background = ctx.createLinearGradient(0, 0, 0, H);
  background.addColorStop(0, '#101d37'); background.addColorStop(.52, '#0a1730'); background.addColorStop(1, '#071225');
  ctx.fillStyle = background; ctx.fillRect(0, 0, W, H);
  const halo = ctx.createRadialGradient(W*.5,H*.42,20,W*.5,H*.42,310);
  halo.addColorStop(0,'rgba(78,139,208,.24)'); halo.addColorStop(.65,'rgba(34,78,137,.07)');
  halo.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle = halo; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(129,179,228,.12)';
  for (let y = 24; y < H; y += 34) for (let x = 21 + (Math.floor(y / 34) % 2) * 16; x < W; x += 34) {
    ctx.beginPath(); ctx.arc(x,y,1.2,0,Math.PI*2); ctx.fill();
  }
  ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = '#a9d4ff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-20,H*.14); ctx.lineTo(105,H*.03); ctx.stroke();
  ctx.beginPath(); ctx.arc(W+20,H*.72,74,Math.PI*.65,Math.PI*1.55); ctx.stroke(); ctx.restore();
  const vignette = ctx.createRadialGradient(W/2,H/2,170,W/2,H/2,390);
  vignette.addColorStop(.45,'rgba(0,0,0,0)'); vignette.addColorStop(1,'rgba(0,2,12,.55)');
  ctx.fillStyle = vignette; ctx.fillRect(0,0,W,H);
}

export function createGame(env, savedState) {
  const win = env.getHostWindow(), doc = env.getHostDocument(), root = env.qs('#wb-gamebox');
  const choice = env.choiceForState('screw', savedState);
  const restored = restoreScrewState(savedState, choice.id);
  let state = restored.state, destroyed = false, frameId = 0, lastFrameAt = 0, drawCount = 0;
  let hint = null, shake = null, flights = [], falling = [], particles = [];
  let statusText = '优先拧下与收纳盒同色的螺丝', resizeObserver = null;

  root.innerHTML = [
    '<section class="wb-screw-panel" data-screw-version="workshop-v2">',
    '<header class="wb-screw-top">',
    '<div class="wb-screw-level"><span>LEVEL</span><strong id="wb-screw-level">1</strong><small id="wb-screw-mode">经典闯关</small></div>',
    '<div class="wb-screw-boxes" id="wb-screw-boxes" aria-label="当前收纳盒"></div>',
    '<div class="wb-screw-next"><span>下一箱</span><i id="wb-screw-next-color"></i></div>',
    '<div class="wb-screw-progress"><div id="wb-screw-progress-fill"></div><span id="wb-screw-progress-text">0%</span></div>',
    '<div class="wb-screw-tray-wrap"><span>临时孔位</span><div class="wb-screw-tray" id="wb-screw-tray"></div></div>',
    '<div class="wb-screw-toolbelt" aria-label="解谜工具">',
    '<button type="button" class="wb-screw-tool" id="wb-screw-undo"><b>↶</b><span>撤销</span><em id="wb-screw-undo-left">3</em></button>',
    '<button type="button" class="wb-screw-tool" id="wb-screw-hint"><b>⌖</b><span>提示</span><em id="wb-screw-hint-left">3</em></button>',
    '<button type="button" class="wb-screw-tool" id="wb-screw-extra"><b>＋</b><span>加孔</span><em id="wb-screw-extra-left">1</em></button>',
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
  canvas.dataset.screwArt = 'workshop-v2'; canvas.dataset.renderMode = renderProfile.mode;
  ctx.setTransform(renderProfile.value, 0, 0, renderProfile.value, 0, 0); ctx.imageSmoothingEnabled = true;

  const haptic = (pattern = 10) => { try { win.navigator?.vibrate?.(pattern); } catch {} };
  function save(force = false) {
    if (!destroyed) env.saveProgress('screw', Object.assign(structuredClone(state), env.choiceSavePatch('screw', choice)), force ? { immediate:true } : undefined);
  }
  const scoreNow = () => state.score + Math.round(progressPercent(state) * (4 + Math.min(6, state.level)));
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
    const won = state.status === 'level_complete';
    root.querySelector('#wb-screw-result-stars').textContent = won ? '★'.repeat(state.levelStars || 1) + '☆'.repeat(3 - (state.levelStars || 1)) : '⚙';
    root.querySelector('#wb-screw-result-title').textContent = won ? '第 ' + state.level + ' 关完成' : '临时孔位已满';
    root.querySelector('#wb-screw-result-copy').textContent = won ?
      '本关奖励 ' + state.reward + ' 分 · ' + state.moves + ' 步完成' : '已完成 ' + progressPercent(state) + '%，调整顺序就能解开。';
    const primary = root.querySelector('#wb-screw-result-primary'), secondary = root.querySelector('#wb-screw-result-secondary');
    if (won) {
      const campaignDone = state.mode === 'normal' && state.level >= SCREW_CAMPAIGN_LEVELS;
      primary.textContent = campaignDone ? '完成经典工坊' : '进入第 ' + (state.level + 1) + ' 关';
      primary.onclick = campaignDone ? finishCampaign : nextLevel; secondary.hidden = true;
    } else {
      primary.textContent = '重试本关'; primary.onclick = retryLevel;
      secondary.hidden = false; secondary.textContent = '结算本局'; secondary.onclick = settleFailure;
    }
  }

  function renderUI() {
    const progress = progressPercent(state);
    root.querySelector('#wb-screw-level').textContent = String(state.level);
    root.querySelector('#wb-screw-mode').textContent = state.mode === 'endless' ? '无尽工坊' : '经典闯关 · ' + SCREW_CAMPAIGN_LEVELS + '关';
    root.querySelector('#wb-screw-boxes').innerHTML = state.boxes.map(boxMarkup).join('');
    const next = state.boxQueue[state.boxIndex], nextEl = root.querySelector('#wb-screw-next-color');
    if (next) {
      const color = colorForScrew(next);
      nextEl.style.setProperty('--c', color.hex); nextEl.style.setProperty('--d', color.dark); nextEl.hidden = false;
    } else nextEl.hidden = true;
    root.querySelector('#wb-screw-progress-fill').style.width = progress + '%';
    root.querySelector('#wb-screw-progress-text').textContent = progress + '%';
    root.querySelector('#wb-screw-tray').innerHTML = Array.from({ length:state.trayCapacity }, (_, index) => {
      const item = state.tray[index], color = item ? colorForScrew(item.color) : null;
      return '<i class="wb-screw-slot ' + (item ? 'occupied' : '') + '">' +
        (item ? '<span style="--c:' + color.hex + ';--d:' + color.dark + ';--l:' + color.light + '"></span>' : '') + '</i>';
    }).join('');
    for (const name of ['undo','hint','extra']) {
      root.querySelector('#wb-screw-' + name + '-left').textContent = String(state.tools[name]);
      const button = root.querySelector('#wb-screw-' + name);
      button.disabled = state.status !== 'playing' || state.tools[name] <= 0 || (name === 'undo' && !state.history.length);
    }
    const callout = root.querySelector('#wb-screw-callout');
    callout.textContent = statusText; callout.classList.toggle('warn', state.tray.length >= state.trayCapacity - 1);
    showResult(); updateScore();
  }

  function drawBoard() {
    drawCount += 1; canvas.dataset.drawCount = String(drawCount);
    ctx.save(); ctx.setTransform(renderProfile.value, 0, 0, renderProfile.value, 0, 0); drawBackground(ctx);
    const hits = reachableScrews(state), reachability = new Map(hits.map(hit => [hit.screw.id, hit.reachable]));
    const active = new Set(state.boxes.map(box => box.color));
    for (const panel of state.panels.filter(item => !item.gone).sort((a, b) => a.z - b.z)) {
      const offset = shake?.panelId === panel.id ? Math.sin(shake.phase * Math.PI * 8) * 4 * (1 - shake.phase) : 0;
      const visual = offset ? { ...panel, x:panel.x + offset } : panel;
      drawPanel(ctx, visual);
      for (const screw of panel.screws || []) {
        if (screw.gone) continue;
        const point = screwWorld(visual, screw), reachable = reachability.get(screw.id), highlighted = hint?.id === screw.id;
        const pulse = highlighted ? 1 + Math.sin(hint.phase * Math.PI * 6) * .1 : 1;
        drawScrew(ctx, screw.color, point.x, point.y, (highlighted ? 17 : 14) * pulse, 0,
          highlighted || (reachable && active.has(screw.color)), reachable ? 1 : .9);
        if (highlighted) {
          ctx.strokeStyle = 'rgba(255,244,164,.94)'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.arc(point.x,point.y,25+Math.sin(hint.phase*Math.PI*6)*3,0,Math.PI*2); ctx.stroke();
        }
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
    if (state.status !== 'level_complete' || state.reward > 0) return;
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
      statusText = result.reason === 'tray_full' ? '临时孔位已满，先完成一个颜色盒' : '这颗螺丝暂时不能取下';
      haptic([10,30,10]); renderUI(); return;
    }
    const boxPosition = Math.max(0, beforeBoxes.indexOf(hit.screw.color));
    flights.push({ x:hit.point.x, y:hit.point.y, color:hit.screw.color,
      destX:result.route === 'box' ? 132 + boxPosition * 78 : 140 + Math.min(state.tray.length, 5) * 28,
      destY:-28, time:0, duration:.48 });
    if (result.panelReleased) {
      beforePanel.screws.forEach(screw => { screw.gone = true; });
      falling.push({ ...beforePanel, vx:(beforePanel.x-W/2)*.34, vy:-48, va:beforePanel.x < W/2 ? -.75 : .75, time:0 });
    }
    const color = colorForScrew(hit.screw.color);
    if (result.completedBoxes.length) {
      statusText = color.name + '收纳完成，下一箱已就位'; confetti(hit.point, color.light); haptic([10,20,18]);
    } else if (result.route === 'box') {
      statusText = color.name + '螺丝收入收纳盒'; haptic(9); env.speak('screw','match');
    } else {
      statusText = color.name + '先放入临时孔位'; haptic(7);
    }
    if (state.tray.length === 4) env.speak('screw','tray_4');
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
    if (env.gamePaused || !addTraySlot(state)) return;
    statusText='增加了一个临时孔位'; haptic([8,18,8]); env.speak('screw','add_box');
    save(true); renderUI(); drawBoard();
  }
  function retryLevel() {
    state = createScrewState({ level:state.level, mode:state.mode, score:state.score, campaignStars:state.campaignStars, details:state.details });
    statusText='重新规划顺序，这次一定能解开'; flights=[]; falling=[]; particles=[]; hint=null; shake=null;
    save(true); renderUI(); drawBoard();
  }
  function nextLevel() {
    state=beginNextScrewLevel(state);
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
    env.showGameOver('screw','本局结束','本局分数：'+final+'分，完成'+progressPercent(state)+'%',
      null,{completed:false,score:final,progress:progressPercent(state),details:structuredClone(state.details)});
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
      fullscreen:false, render:{mode:renderProfile.mode,pixelRatio:renderProfile.value,drawCount,idle:!frameId&&!hasAnimation()},
      liveScrews:allLiveScrews(state).length,
    });
  }
  function destroy() {
    if (destroyed) return;
    save(true); destroyed=true;
    if (frameId) win.cancelAnimationFrame(frameId);
    frameId=0; resizeObserver?.disconnect();
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
    statusText='关卡系统已升级，旧进度已转换为公平新关卡';
    env.toast?.('拧螺丝已升级为经典关卡，原分数已保留');
  }
  awardLevel(); renderUI(); drawBoard(); save(true); env.scheduleFitGameSurface?.();
  return controller;
}
