const WIDTH = 900;
const HEIGHT = 620;
const BALL_RADIUS = 17;
const BALL_SPACING = BALL_RADIUS * 1.86;
const COLORS = ['#ef5b5b', '#f7b84b', '#50b96b', '#4b8ee8', '#9a69df', '#f06fb2'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cubicPoint(a, b, c, d, t) {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

export function createZumaPath() {
  const segments = [
    [{ x:-45, y:92 }, { x:230, y:35 }, { x:650, y:55 }, { x:820, y:105 }],
    [{ x:820, y:105 }, { x:920, y:180 }, { x:890, y:445 }, { x:795, y:505 }],
    [{ x:795, y:505 }, { x:610, y:590 }, { x:230, y:570 }, { x:110, y:500 }],
    [{ x:110, y:500 }, { x:20, y:420 }, { x:25, y:255 }, { x:135, y:215 }],
    [{ x:135, y:215 }, { x:270, y:160 }, { x:650, y:165 }, { x:720, y:235 }],
    [{ x:720, y:235 }, { x:790, y:300 }, { x:755, y:395 }, { x:682, y:405 }],
  ];
  const points = [];
  segments.forEach((segment, segmentIndex) => {
    for (let i = segmentIndex ? 1 : 0; i <= 55; i++) {
      points.push(cubicPoint(segment[0], segment[1], segment[2], segment[3], i / 55));
    }
  });
  let distance = 0;
  points.forEach((point, index) => {
    if (index) distance += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
    point.s = distance;
  });
  return { points, length:distance };
}

export function zumaPointAt(path, distance) {
  const s = clamp(Number(distance) || 0, 0, path.length);
  let low = 0;
  let high = path.points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (path.points[mid].s < s) low = mid + 1;
    else high = mid;
  }
  const right = path.points[low];
  const left = path.points[Math.max(0, low - 1)];
  const span = Math.max(1, right.s - left.s);
  const t = clamp((s - left.s) / span, 0, 1);
  return { x:left.x + (right.x - left.x) * t, y:left.y + (right.y - left.y) * t };
}

export function zumaColorCountForProgress(totalBallsGenerated) {
  return Math.min(6, 4 + Math.floor(Math.max(0, (Number(totalBallsGenerated) || 0) - 24) / 120));
}

export function zumaSpeedForState(score, cleared, ballCount, slowRemaining = 0) {
  const count = Math.max(0, Number(ballCount) || 0);
  const raw = 27
    + Math.max(0, Number(score) || 0) / 450
    + Math.max(0, Number(cleared) || 0) / 22
    + Math.max(0, count - 24) * .45;
  const sparseFactor = count >= 24 ? 1 : .7 + count / 24 * .3;
  return Math.min(84, raw) * sparseFactor * (Number(slowRemaining) > 0 ? .38 : 1);
}

export function createZumaChain(ballCount = 24, random = Math.random, colorCount = 4) {
  const count = Math.max(1, Math.floor(Number(ballCount) || 24));
  const colors = clamp(Math.floor(Number(colorCount) || 4), 2, COLORS.length);
  const chain = [];
  for (let i = 0; i < count; i++) {
    let color = Math.floor(random() * colors);
    if (i >= 2 && chain[i - 1].color === color && chain[i - 2].color === color) {
      color = (color + 1 + Math.floor(random() * (colors - 1))) % colors;
    }
    chain.push({ color, s:28 + i * BALL_SPACING });
  }
  return chain;
}

export { createZumaGame } from "./plugins/zuma/view.js";
