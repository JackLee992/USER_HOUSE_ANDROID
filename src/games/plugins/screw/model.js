export const SCREW_STATE_SCHEMA = 2;
export const SCREW_CAMPAIGN_LEVELS = 12;
export const SCREW_TRAY_SIZE = 5;
export const SCREW_ENDLESS_RULES_VERSION = 2;
export const SCREW_ENDLESS_MIN_PANELS = 28;
export const SCREW_ENDLESS_MAX_PANELS = 32;
export const SCREW_ENDLESS_WAVE_PANELS = SCREW_ENDLESS_MIN_PANELS;
export const SCREW_ENDLESS_REFILL_SCREWS = 24;
export const SCREW_COLORS = Object.freeze([
  Object.freeze({ id:'ruby', name:'珊瑚红', hex:'#d96872', dark:'#8f354a', light:'#f5abb1' }),
  Object.freeze({ id:'ocean', name:'海湾蓝', hex:'#4f82c7', dark:'#2f568c', light:'#9fc0ed' }),
  Object.freeze({ id:'sun', name:'琥珀黄', hex:'#d5a73c', dark:'#89671c', light:'#f4dc8a' }),
  Object.freeze({ id:'leaf', name:'青叶绿', hex:'#63a77a', dark:'#356f4c', light:'#acd9b8' }),
  Object.freeze({ id:'violet', name:'鸢尾紫', hex:'#8f72bd', dark:'#5d4785', light:'#c8b4e4' }),
  Object.freeze({ id:'tangerine', name:'暖橙', hex:'#d68655', dark:'#95512f', light:'#efb08b' }),
  Object.freeze({ id:'lagoon', name:'湖水青', hex:'#57a3a5', dark:'#326c70', light:'#a5d6d5' }),
  Object.freeze({ id:'rose', name:'玫瑰粉', hex:'#c96f91', dark:'#8b3d5d', light:'#eab0c4' }),
]);

const SHAPES = Object.freeze([
  Object.freeze({ type:'capsule', w:276, h:104, holes:[[-86,0],[0,0],[86,0]] }),
  Object.freeze({ type:'plate', w:244, h:150, holes:[[-70,-34],[66,-28],[0,48]] }),
  Object.freeze({ type:'triangle', w:246, h:184, holes:[[0,-52],[-68,46],[68,46]] }),
  Object.freeze({ type:'bar', w:294, h:88, holes:[[-94,0],[0,0],[94,0]] }),
  Object.freeze({ type:'shield', w:216, h:184, holes:[[-58,-33],[58,-33],[0,54]] }),
  Object.freeze({ type:'disc', w:190, h:190, holes:[[-52,-30],[52,-30],[0,55]] }),
  Object.freeze({ type:'cross', w:232, h:180, holes:[[0,-53],[-66,32],[66,32]] }),
]);

const MATERIALS = Object.freeze(['painted-metal','hardwood','acrylic','brushed-steel']);

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result ^= result + Math.imul(result ^ result >>> 7, 61 | result);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(rand, values) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function panelCountForLevel(level) {
  if (level <= 1) return 3;
  if (level <= 3) return 6;
  if (level <= 8) return 9;
  return 12;
}

function groupPalette(rand, group, previous) {
  let colors = shuffle(rand, SCREW_COLORS.map(color => color.id)).slice(0, 3);
  if (group && colors.every(color => previous.includes(color))) {
    const replacement = SCREW_COLORS.map(color => color.id).find(color => !previous.includes(color));
    if (replacement) colors[2] = replacement;
  }
  return colors;
}

function makePanels(level, seed, panelCount) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const groupCount = panelCount / 3;
  const groups = [];
  for (let group = 0; group < groupCount; group += 1) {
    groups.push(groupPalette(rand, group, groups[group - 1] || []));
  }
  const panels = [];
  for (let topIndex = 0; topIndex < panelCount; topIndex += 1) {
    const group = Math.floor(topIndex / 3);
    const stackIndex = topIndex % 3;
    const shape = SHAPES[(level * 2 + topIndex * 3) % SHAPES.length];
    const wave = (level * .71 + topIndex * 1.91);
    const spread = Math.min(54, 18 + level * 3);
    const x = 210 + Math.sin(wave) * spread + (stackIndex - 1) * 9;
    const y = 286 + Math.cos(wave * .83) * Math.min(58, 24 + level * 2) + (stackIndex - 1) * 12;
    const angle = ((topIndex % 2 ? 1 : -1) * (.06 + (level % 5) * .025) + (stackIndex - 1) * .08);
    const colors = groups[group].map((color, index) => groups[group][(index + topIndex + level) % 3]);
    const id = `l${level}-p${topIndex}`;
    panels.push({
      id,
      z:panelCount - 1 - topIndex,
      order:topIndex,
      shape:shape.type,
      x:Number(x.toFixed(2)), y:Number(y.toFixed(2)),
      w:shape.w, h:shape.h, a:Number(angle.toFixed(4)),
      material:MATERIALS[(level + topIndex) % Math.min(MATERIALS.length, 1 + Math.ceil(level / 3))],
      tint:(level + topIndex * 2) % 7,
      gone:false,
      screws:shape.holes.map(([lx, ly], index) => ({
        id:`${id}-s${index}`,
        lx, ly,
        color:colors[index],
        gone:false,
      })),
    });
  }
  // Exchange one screw across every three-panel boundary. The upper board must
  // temporarily hold a future color before it can reveal the missing current
  // color below, so the five-hole tray is part of the solution rather than a
  // punishment used only after a mistake. Counts stay exactly three per box.
  for (let group = 0; group < groupCount - 1; group += 1) {
    const upper = panels[group * 3];
    const lower = panels[(group + 1) * 3];
    const futureColor = groups[group + 1].find(color => !groups[group].includes(color));
    const upperScrew = upper.screws.find(screw => !groups[group + 1].includes(screw.color)) || upper.screws[2];
    const lowerScrew = lower.screws.find(screw => screw.color === futureColor);
    if (upperScrew && lowerScrew) [upperScrew.color, lowerScrew.color] = [lowerScrew.color, upperScrew.color];
  }
  return { panels, groups };
}

// Endless mode deliberately keeps the first 玩伴小屋 board generator: a large,
// irregular 28–32 panel pile, two to four screws per panel, and boxes queued in
// random three-colour batches. The new campaign uses the smaller deterministic
// boards above, while endless retains the original continuous-play rhythm.
function makeEndlessPanels(seed) {
  const rand = mulberry32(seed);
  const between = (min, max) => min + rand() * (max - min);
  const choices = ['capsule','bar','plate','triangle','disc','shield','cross'];
  const panelCount = SCREW_ENDLESS_MIN_PANELS + Math.floor(rand() * (SCREW_ENDLESS_MAX_PANELS - SCREW_ENDLESS_MIN_PANELS + 1));
  const layout = Math.floor(rand() * 4);
  const templates = Array.from({ length:panelCount }, (_, index) => {
    const column = index % 5, row = Math.floor(index / 5) % 7;
    const ring = index / panelCount * Math.PI * 2;
    const shape = choices[Math.floor(rand() * choices.length)];
    if (layout === 0) return { x:38 + column * 86 + between(-18,18), y:46 + row * 118 + between(-20,20), a:(index % 2 ? .58 : -.58) + between(-.28,.28), shape };
    if (layout === 1) return { x:36 + (index % 6) * 70 + between(-18,18), y:52 + Math.floor(index / 6) * 124 + (index % 2 ? 24 : -8) + between(-16,16), a:(index % 2 ? 1 : -1) * between(.16,.62), shape };
    if (layout === 2) {
      const slots = [[52,58],[210,54],[366,62],[56,190],[188,174],[342,188],[68,324],[214,316],[360,328],[52,462],[204,456],[366,464]];
      const slot = slots[index % slots.length];
      return { x:slot[0] + between(-24,24), y:slot[1] + between(-20,20) + Math.floor(index / slots.length) * 20, a:(index % 2 ? .82 : -.82) + between(-.22,.22), shape };
    }
    return { x:210 + Math.cos(ring) * (116 + index % 4 * 28) + between(-14,14), y:268 + Math.sin(ring) * (176 + index % 3 * 28) + between(-14,14), a:ring + between(-.42,.42), shape };
  });

  const screwCounts = templates.map(() => 2 + Math.floor(rand() * 3));
  let screwTotal = screwCounts.reduce((sum, count) => sum + count, 0);
  while (screwTotal % 3) {
    if (screwTotal % 3 === 1) {
      const index = screwCounts.findIndex(count => count > 2);
      if (index >= 0) { screwCounts[index] -= 1; screwTotal -= 1; }
      else { screwCounts[0] += 2; screwTotal += 2; }
    } else {
      const index = screwCounts.findIndex(count => count < 4);
      if (index >= 0) { screwCounts[index] += 1; screwTotal += 1; }
      else { screwCounts[0] -= 2; screwTotal -= 2; }
    }
  }

  const boxCount = Math.max(3, screwTotal / 3), boxQueue = [];
  for (let index = 0; index < boxCount; index += 3) {
    boxQueue.push(...shuffle(rand, SCREW_COLORS.map(color => color.id)).slice(0, Math.min(3, boxCount - index)));
  }
  const screwColors = shuffle(rand, boxQueue.flatMap(color => [color,color,color]));
  let colorOffset = 0;
  for (const count of screwCounts) {
    const slice = screwColors.slice(colorOffset, colorOffset + count);
    if (count >= 3 && slice.every(color => color === slice[0])) {
      const swapAt = screwColors.findIndex((color, index) => index >= colorOffset + count && color !== slice[0]);
      if (swapAt >= 0) [screwColors[colorOffset + count - 1], screwColors[swapAt]] = [screwColors[swapAt], screwColors[colorOffset + count - 1]];
    }
    colorOffset += count;
  }

  colorOffset = 0;
  const panels = templates.map((template, index) => {
    const wide = template.shape === 'capsule' || template.shape === 'bar';
    const round = template.shape === 'disc';
    const w = wide ? between(150,222) : round ? between(104,158) : between(112,178);
    const h = wide ? between(48,72) : round ? w : template.shape === 'triangle' || template.shape === 'cross' ? between(106,158) : between(86,142);
    const cosine = Math.abs(Math.cos(template.a)), sine = Math.abs(Math.sin(template.a));
    const marginX = Math.min(196, cosine * w / 2 + sine * h / 2 + 14);
    const marginY = Math.min(266, sine * w / 2 + cosine * h / 2 + 14);
    const x = Math.max(marginX, Math.min(420 - marginX, template.x));
    const y = Math.max(marginY, Math.min(560 - marginY, template.y));
    const count = screwCounts[index], candidates = [];
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const point = [between(-w * .37,w * .37), between(-h * .37,h * .37)];
      const inside = panelContains({ shape:template.shape, x:0, y:0, w, h, a:0 }, point[0], point[1]);
      if (inside && candidates.every(other => Math.hypot(other[0] - point[0], other[1] - point[1]) >= Math.max(30, Math.min(w,h) * .27))) candidates.push(point);
      if (candidates.length >= count) break;
    }
    while (candidates.length < count) {
      const angle = candidates.length / count * Math.PI * 2;
      candidates.push([Math.cos(angle) * w * .24, Math.sin(angle) * h * .24]);
    }
    const id = `p${index}`;
    const screws = candidates.slice(0,count).map(([lx,ly], screwIndex) => ({
      id:`${id}s${screwIndex}`, lx:Number(lx.toFixed(2)), ly:Number(ly.toFixed(2)), color:screwColors[colorOffset + screwIndex], gone:false,
    }));
    colorOffset += count;
    return { id, z:index, order:index, shape:template.shape, x:Number(x.toFixed(2)), y:Number(y.toFixed(2)), w:Number(w.toFixed(2)), h:Number(h.toFixed(2)), a:Number(template.a.toFixed(4)), material:MATERIALS[index % MATERIALS.length], tint:index % 7, gone:false, screws };
  });
  return { panels, boxQueue };
}

function baseDetails(previous = {}) {
  return {
    removed:Number(previous.removed || 0),
    packed:Number(previous.packed || 0),
    matches:Number(previous.matches || 0),
    fallen:Number(previous.fallen || 0),
    maxTray:Number(previous.maxTray || 0),
    trayFourCount:Number(previous.trayFourCount || 0),
    trayFullCount:Number(previous.trayFullCount || 0),
    addBoxUses:Number(previous.addBoxUses || 0),
    blocked:Number(previous.blocked || 0),
    hints:Number(previous.hints || 0),
    undos:Number(previous.undos || 0),
    levels:Number(previous.levels || 0),
    boxesCompleted:Number(previous.boxesCompleted ?? Math.floor(Number(previous.packed || 0) / 3)),
    progress:0,
    completed:false,
    endlessLayers:Number(previous.endlessLayers || 1),
  };
}

export function createScrewState({ level = 1, mode = 'normal', score = 0, details, campaignStars = 0, seed:requestedSeed } = {}) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const endless = mode === 'endless';
  const seed = endless ? (Number.isFinite(Number(requestedSeed)) ? Number(requestedSeed) >>> 0 : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) :
    (0x51f15e5d ^ Math.imul(safeLevel, 0x45d9f3b)) >>> 0;
  const made = endless ? makeEndlessPanels(seed) : makePanels(safeLevel, seed, panelCountForLevel(safeLevel));
  const boxQueue = made.boxQueue || made.groups.flat();
  return {
    screwSchema:SCREW_STATE_SCHEMA,
    mode:endless ? 'endless' : 'normal',
    endlessRulesVersion:endless ? SCREW_ENDLESS_RULES_VERSION : 0,
    level:safeLevel,
    seed,
    score:Math.max(0, Math.floor(Number(score) || 0)),
    campaignStars:Math.max(0, Math.floor(Number(campaignStars) || 0)),
    panels:made.panels,
    boxQueue,
    boxes:boxQueue.slice(0, 3).map((color, index) => ({ id:`box-${index}`, color, fill:0 })),
    boxIndex:Math.min(3, boxQueue.length),
    boxCapacity:3,
    tray:[],
    trayCapacity:SCREW_TRAY_SIZE,
    tools:{ undo:3, hint:3, extra:endless ? 3 : 1 },
    history:[],
    moves:0,
    levelMaxTray:0,
    status:'playing',
    reward:0,
    details:baseDetails(details),
  };
}

export function isScrewState(state) {
  return !!(state && state.screwSchema === SCREW_STATE_SCHEMA && Array.isArray(state.panels) && Array.isArray(state.boxes) && Array.isArray(state.tray));
}

export function restoreScrewState(saved, mode = 'normal') {
  if (!isScrewState(saved)) return { state:createScrewState({ mode, level:Math.max(1, Number(saved?.level) || 1), score:Number(saved?.score) || 0 }), migrated:!!saved?.panels };
  const state = structuredClone(saved);
  state.mode = state.mode === 'endless' ? 'endless' : mode === 'endless' ? 'endless' : 'normal';
  state.level = Math.max(1, Math.floor(Number(state.level) || 1));
  state.score = Math.max(0, Math.floor(Number(state.score) || 0));
  state.trayCapacity = Math.max(SCREW_TRAY_SIZE, Math.min(7, Math.floor(Number(state.trayCapacity) || SCREW_TRAY_SIZE)));
  const restoringOldEndless = state.mode === 'endless' && state.endlessRulesVersion !== SCREW_ENDLESS_RULES_VERSION;
  if (restoringOldEndless) {
    const addBoxUses = Math.max(0, Math.min(3, Number(state.details?.addBoxUses ?? Math.max(0, Number(state.boxCapacity || state.maxBoxes || 3) - 3)) || 0));
    const previousLayer = Math.max(1, Number(state.details?.endlessLayers || state.level) || 1);
    const targetLayer = state.status === 'level_complete' ? previousLayer + 1 : previousLayer;
    const migrated = createScrewState({
      mode:'endless',
      level:targetLayer,
      score:Number(state.score) || 0,
      details:state.details,
      campaignStars:Number(state.campaignStars) || 0,
    });
    migrated.details.endlessLayers = targetLayer;
    migrated.boxCapacity = 3 + addBoxUses;
    migrated.tools.extra = 3 - addBoxUses;
    migrated.details.addBoxUses = addBoxUses;
    refillBoxes(migrated);
    return { state:migrated, migrated:true };
  }
  state.tools = { undo:Math.max(0, Number(state.tools?.undo ?? 3)), hint:Math.max(0, Number(state.tools?.hint ?? 3)), extra:Math.max(0, Number(state.tools?.extra ?? (state.mode === 'endless' ? 3 : 1))) };
  state.endlessRulesVersion = state.mode === 'endless' ? SCREW_ENDLESS_RULES_VERSION : 0;
  state.boxQueue = Array.isArray(state.boxQueue) ? state.boxQueue.slice() : state.boxes.map(box => box.color);
  state.boxIndex = Math.max(0, Math.min(state.boxQueue.length, Math.floor(Number(state.boxIndex) || state.boxes.length)));
  state.boxCapacity = state.mode === 'endless' ? Math.max(3, Math.min(6, Math.floor(Number(state.boxCapacity || state.maxBoxes) || state.boxes.length || 3))) : 3;
  state.history = Array.isArray(state.history) ? state.history.slice(-3) : [];
  state.moves = Math.max(0, Number(state.moves) || 0);
  state.levelMaxTray = Math.max(0, Number(state.levelMaxTray) || 0);
  state.status = ['playing','level_complete','failed'].includes(state.status) ? state.status : 'playing';
  state.reward = Math.max(0, Number(state.reward) || 0);
  state.details = baseDetails(state.details);
  if (state.mode === 'endless' && state.status === 'level_complete') {
    state.status = 'playing';
    extendEndlessState(state, true);
  }
  state.details.progress = progressPercent(state);
  return { state, migrated:restoringOldEndless };
}

export function rotatePoint(x, y, angle = 0) {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return { x:x * cosine - y * sine, y:x * sine + y * cosine };
}

export function screwWorld(panel, screw) {
  const point = rotatePoint(screw.lx, screw.ly, panel.a || 0);
  return { x:panel.x + point.x, y:panel.y + point.y };
}

export function panelContains(panel, x, y) {
  const local = rotatePoint(x - panel.x, y - panel.y, -(panel.a || 0));
  const lx = local.x, ly = local.y, w = panel.w, h = panel.h;
  if (panel.shape === 'disc') return lx * lx + ly * ly <= (w * .5) ** 2;
  if (panel.shape === 'capsule' || panel.shape === 'bar') {
    const radius = h / 2;
    return (Math.abs(lx) <= w / 2 - radius && Math.abs(ly) <= radius) || Math.hypot(Math.abs(lx) - (w / 2 - radius), ly) <= radius;
  }
  if (panel.shape === 'triangle') {
    const a = { x:0, y:-h / 2 }, b = { x:w / 2, y:h / 2 }, c = { x:-w / 2, y:h / 2 };
    const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    const u = ((b.y - c.y) * (lx - c.x) + (c.x - b.x) * (ly - c.y)) / area;
    const v = ((c.y - a.y) * (lx - c.x) + (a.x - c.x) * (ly - c.y)) / area;
    return u >= 0 && v >= 0 && u + v <= 1;
  }
  if (panel.shape === 'shield') {
    if (ly < -h / 2 || ly > h / 2) return false;
    const ratio = (ly + h / 2) / h;
    const half = ratio < .58 ? w / 2 : w / 2 * (1 - (ratio - .58) / .42 * .72);
    return Math.abs(lx) <= half;
  }
  if (panel.shape === 'cross') return (Math.abs(lx) <= w * .18 && Math.abs(ly) <= h / 2) || (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h * .22);
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

export function allLiveScrews(state) {
  const result = [];
  for (const panel of state.panels) {
    if (panel.gone) continue;
    for (const screw of panel.screws || []) {
      if (screw.gone) continue;
      const point = screwWorld(panel, screw);
      result.push({ panel, screw, point });
    }
  }
  return result;
}

export function reachableScrews(state) {
  const livePanels = state.panels.filter(panel => !panel.gone);
  return allLiveScrews(state).map(hit => ({
    ...hit,
    reachable:!livePanels.some(panel => panel !== hit.panel && panel.z > hit.panel.z && panelContains(panel, hit.point.x, hit.point.y)),
  }));
}

function coreSnapshot(state) {
  return {
    panels:structuredClone(state.panels),
    boxQueue:state.boxQueue.slice(),
    boxes:structuredClone(state.boxes),
    boxIndex:state.boxIndex,
    boxCapacity:state.boxCapacity,
    endlessRulesVersion:state.endlessRulesVersion,
    level:state.level,
    seed:state.seed,
    tray:structuredClone(state.tray),
    trayCapacity:state.trayCapacity,
    tools:structuredClone(state.tools),
    moves:state.moves,
    levelMaxTray:state.levelMaxTray,
    status:state.status,
    reward:state.reward,
    score:state.score,
    campaignStars:state.campaignStars,
    details:structuredClone(state.details),
  };
}

function activeBox(state, color) {
  return state.boxes.find(box => box.color === color);
}

function refillBoxes(state) {
  const capacity = state.mode === 'endless' ? state.boxCapacity : 3;
  while (state.boxes.length < capacity && state.boxIndex < state.boxQueue.length) {
    state.boxes.push({ id:`box-${state.boxIndex}`, color:state.boxQueue[state.boxIndex], fill:0 });
    state.boxIndex += 1;
  }
}

function replaceCompletedBox(state, box, events) {
  const index = state.boxes.indexOf(box);
  events.completedBoxes.push(box.color);
  state.details.packed += 3;
  state.details.matches += 1;
  state.details.boxesCompleted += 1;
  state.boxes.splice(index, 1);
  if (state.boxIndex < state.boxQueue.length) {
    state.boxes.splice(index, 0, { id:`box-${state.boxIndex}`, color:state.boxQueue[state.boxIndex], fill:0 });
    state.boxIndex += 1;
  }
  refillBoxes(state);
}

function packIntoBox(state, color, events, source) {
  const box = activeBox(state, color);
  if (!box) return false;
  box.fill += 1;
  events.packed.push({ color, source, boxId:box.id });
  if (box.fill >= 3) replaceCompletedBox(state, box, events);
  return true;
}

function drainTray(state, events) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < state.tray.length; index += 1) {
      const item = state.tray[index];
      if (!activeBox(state, item.color)) continue;
      state.tray.splice(index, 1);
      packIntoBox(state, item.color, events, 'tray');
      changed = true;
      break;
    }
  }
}

export function progressPercent(state) {
  const total = state.panels.reduce((sum, panel) => sum + (panel.screws?.length || 0), 0);
  const removed = state.panels.reduce((sum, panel) => sum + (panel.screws || []).filter(screw => screw.gone).length, 0);
  return total ? Math.round(removed / total * 100) : 100;
}

export function applyScrew(state, screwId) {
  const events = { ok:false, reason:'missing', route:null, panelReleased:null, packed:[], completedBoxes:[], completed:false, failed:false, endlessExtended:false };
  if (!isScrewState(state) || state.status !== 'playing') { events.reason = 'inactive'; return events; }
  const hit = reachableScrews(state).find(item => item.screw.id === screwId);
  if (!hit) return events;
  if (!hit.reachable) { state.details.blocked += 1; events.reason = 'blocked'; return events; }
  if (!activeBox(state, hit.screw.color) && state.tray.length >= state.trayCapacity) {
    events.reason = 'tray_full';
    if (state.mode === 'endless') {
      state.status = 'failed';
      state.details.completed = false;
      events.failed = true;
    }
    return events;
  }

  state.history.push(coreSnapshot(state));
  state.history = state.history.slice(-3);
  hit.screw.gone = true;
  state.moves += 1;
  state.details.removed += 1;
  events.ok = true;
  events.reason = 'ok';
  if (packIntoBox(state, hit.screw.color, events, 'board')) events.route = 'box';
  else {
    events.route = 'tray';
    state.tray.push({ id:hit.screw.id, color:hit.screw.color });
  }
  drainTray(state, events);
  if (hit.panel.screws.every(screw => screw.gone)) {
    hit.panel.gone = true;
    events.panelReleased = hit.panel.id;
    state.details.fallen += 1;
  }
  state.details.maxTray = Math.max(state.details.maxTray, state.tray.length);
  state.levelMaxTray = Math.max(state.levelMaxTray, state.tray.length);
  if (state.tray.length === 4) state.details.trayFourCount += 1;
  if (state.tray.length >= state.trayCapacity) {
    state.details.trayFullCount += 1;
    if (state.mode !== 'endless') {
      state.status = 'failed';
      state.details.completed = false;
      events.failed = true;
    }
  } else if (state.mode === 'endless') {
    events.endlessExtended = extendEndlessState(state);
  } else if (allLiveScrews(state).length === 0 && state.tray.length === 0 && state.boxes.length === 0) {
    state.status = 'level_complete';
    state.details.completed = true;
    state.details.levels += 1;
    state.details.progress = 100;
    events.completed = true;
  }
  state.details.progress = progressPercent(state);
  return events;
}

export function undoScrew(state) {
  if (!isScrewState(state) || state.status !== 'playing' || state.tools.undo <= 0 || !state.history.length) return false;
  const remaining = state.tools.undo - 1;
  const snapshot = state.history.pop();
  const history = state.history.slice();
  Object.assign(state, structuredClone(snapshot));
  state.history = history;
  state.tools.undo = remaining;
  state.details.undos += 1;
  return true;
}

export function useHint(state) {
  if (!isScrewState(state) || state.status !== 'playing' || state.tools.hint <= 0) return null;
  const hits = reachableScrews(state).filter(hit => hit.reachable);
  const safe = hits.find(hit => activeBox(state, hit.screw.color));
  const fallback = hits.find(hit => state.tray.length < state.trayCapacity);
  const selected = safe || fallback;
  if (!selected) return null;
  state.tools.hint -= 1;
  state.details.hints += 1;
  return selected.screw.id;
}

export function addTraySlot(state) {
  if (!isScrewState(state) || state.status !== 'playing' || state.tools.extra <= 0 || state.trayCapacity >= 7) return false;
  state.tools.extra -= 1;
  state.trayCapacity += 1;
  state.details.addBoxUses += 1;
  return true;
}

export function addEndlessBox(state) {
  if (!isScrewState(state) || state.mode !== 'endless' || state.status !== 'playing' || state.tools.extra <= 0 || state.boxCapacity >= 6) return false;
  if (state.boxIndex >= state.boxQueue.length) return false;
  state.tools.extra -= 1;
  state.boxCapacity += 1;
  state.details.addBoxUses += 1;
  refillBoxes(state);
  drainTray(state, { packed:[], completedBoxes:[] });
  return true;
}

export function endlessScore(state) {
  const capacity = Math.max(3, Math.min(6, Number(state?.boxCapacity) || 3));
  const multiplier = ({ 3:2.2, 4:1.75, 5:1.35, 6:1.05 })[capacity];
  return Math.round(Math.max(0, Number(state?.details?.boxesCompleted) || 0) * 120 * multiplier);
}

export function extendEndlessState(state, force = false) {
  if (!isScrewState(state) || state.mode !== 'endless' || state.status !== 'playing') return false;
  const active = state.panels.filter(panel => !panel.gone);
  const live = allLiveScrews(state).length;
  if (!force && live > SCREW_ENDLESS_REFILL_SCREWS && active.length > 8) return false;
  const nextLayer = Math.max(1, Number(state.details?.endlessLayers) || 1) + 1;
  const seed = (state.seed ^ Math.imul(nextLayer, 0x6d2b79f5) ^ 0xa511e9b3) >>> 0;
  const made = makeEndlessPanels(seed);
  const zLift = made.panels.length + 1;
  const prefix = `e${nextLayer}-`;
  const fresh = made.panels.map(panel => ({
    ...panel,
    id:prefix + panel.id,
    screws:panel.screws.map(screw => ({ ...screw, id:prefix + screw.id })),
  }));
  state.panels = fresh.concat(active.map(panel => ({ ...panel, z:(Number(panel.z) || 0) + zLift })));
  state.boxQueue = state.boxQueue.concat(made.boxQueue);
  state.seed = seed;
  state.level = nextLayer;
  state.details.endlessLayers = nextLayer;
  state.details.completed = false;
  state.status = 'playing';
  state.reward = 0;
  refillBoxes(state);
  drainTray(state, { packed:[], completedBoxes:[] });
  state.details.progress = progressPercent(state);
  return true;
}

export function beginNextScrewLevel(state) {
  const next = createScrewState({
    level:state.level + 1,
    mode:state.mode,
    score:state.score,
    details:state.details,
    campaignStars:state.campaignStars,
  });
  next.details.endlessLayers = state.mode === 'endless' ? Math.max(state.details.endlessLayers || 1, next.level) : state.details.endlessLayers || 1;
  return next;
}

export function colorForScrew(id) {
  return SCREW_COLORS.find(color => color.id === id) || SCREW_COLORS[0];
}

export function advanceFlight(flight, elapsedSeconds) {
  const elapsed = Math.max(0, Math.min(.25, Number(elapsedSeconds) || 0));
  flight.time = Math.min(flight.duration, (flight.time || 0) + elapsed);
  return flight;
}

export function advanceFallingPanel(panel, elapsedSeconds) {
  const elapsed = Math.max(0, Math.min(.25, Number(elapsedSeconds) || 0));
  const gravity = 980;
  panel.y += panel.vy * elapsed + gravity * elapsed * elapsed / 2;
  panel.vy += gravity * elapsed;
  panel.x += panel.vx * elapsed;
  panel.a += panel.va * elapsed;
  panel.time = (panel.time || 0) + elapsed;
  return panel;
}
