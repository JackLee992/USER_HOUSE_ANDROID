// Paopao owns this atlas and its fallback; other games keep their shared art.
export const BUBBLE_ART_URL = new URL('../../../../assets/game-art/paopao/bubbles-v3.png', import.meta.url).href;
export const BUBBLE_COLOR_ORDER = Object.freeze(['red', 'blue', 'green', 'yellow', 'purple', 'orange']);
export const BUBBLE_SOURCE_RECTS = Object.freeze([
  [32, 28, 448, 448], [544, 28, 448, 448], [1056, 28, 448, 448],
  [32, 528, 448, 448], [544, 528, 448, 448], [1056, 528, 448, 448],
].map(Object.freeze));
export const BUBBLE_SHAPES = Object.freeze({ red: 'heart', blue: 'diamond', green: 'triangle', yellow: 'star', purple: 'crescent', orange: 'plus' });
export const BUBBLE_PALETTE = Object.freeze({ red: '#e41c2b', blue: '#0759e8', green: '#12b647', yellow: '#ffcf13', purple: '#881de1', orange: '#ff850a', bomb: '#374151' });
export const BUBBLE_CACHE_LIMITS = Object.freeze({ maxEntries: 48, maxBytes: 2 * 1024 * 1024, maxDimension: 256, quantum: 8 });

function tint(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, value >> 8 & 255, value & 255].map(channel =>
    Math.round(amount > 0 ? channel + (255 - channel) * amount : channel * (1 + amount)));
  return `rgb(${channels.join(',')})`;
}

function paintSymbol(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'heart') {
    ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * .3, y + r * .66, x - r * 1.25, y, x - r * .96, y - r * .5);
    ctx.bezierCurveTo(x - r * .7, y - r, x - r * .2, y - r * .98, x, y - r * .47);
    ctx.bezierCurveTo(x + r * .2, y - r * .98, x + r * .7, y - r, x + r * .96, y - r * .5);
    ctx.bezierCurveTo(x + r * 1.25, y, x + r * .3, y + r * .66, x, y + r);
  } else if (shape === 'diamond') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * .83, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .83, y);
  } else if (shape === 'triangle') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * .8); ctx.lineTo(x - r, y + r * .8);
  } else if (shape === 'star') {
    for (let point = 0; point < 10; point++) {
      const angle = -Math.PI / 2 + point * Math.PI / 5, radius = r * (point % 2 ? .44 : 1);
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else if (shape === 'crescent') {
    ctx.moveTo(x + r * .42, y - r * .94);
    ctx.bezierCurveTo(x - r * .4, y - r * 1.17, x - r * 1.02, y - r * .44, x - r * .93, y + r * .23);
    ctx.bezierCurveTo(x - r * .8, y + r * 1.06, x + r * .35, y + r * 1.34, x + r * .9, y + r * .55);
    ctx.bezierCurveTo(x + r * .22, y + r * .94, x - r * .35, y + r * .45, x - r * .27, y - r * .15);
    ctx.bezierCurveTo(x - r * .22, y - r * .54, x + r * .08, y - r * .82, x + r * .42, y - r * .94);
  } else if (shape === 'plus') {
    for (const [index, point] of [[-.34,-1],[.34,-1],[.34,-.34],[1,-.34],[1,.34],[.34,.34],[.34,1],[-.34,1],[-.34,.34],[-1,.34],[-1,-.34],[-.34,-.34]].entries()) {
      if (index === 0) ctx.moveTo(x + point[0] * r, y + point[1] * r);
      else ctx.lineTo(x + point[0] * r, y + point[1] * r);
    }
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function paintFallback(ctx, color, size) {
  const center = size / 2, radius = size * .465, base = BUBBLE_PALETTE[color];
  const gradient = ctx.createRadialGradient(size * .34, size * .28, size * .025, center, center, radius);
  gradient.addColorStop(0, tint(base, .32)); gradient.addColorStop(.5, base); gradient.addColorStop(1, tint(base, -.42));
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = tint(base, -.55); ctx.lineWidth = Math.max(1, size * .025); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.beginPath();
  ctx.ellipse(size * .32, size * .23, size * .12, size * .055, -.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color === 'yellow' || color === 'orange' ? '#43230b' : '#fffbee';
  ctx.strokeStyle = color === 'yellow' || color === 'orange' ? '#ffe08e' : '#25314b';
  ctx.lineWidth = Math.max(1, size * .02); ctx.lineJoin = 'round';
  paintSymbol(ctx, BUBBLE_SHAPES[color], center, center + size * .02, size * .275);
}

export function createBubbleArt({ window: win = globalThis.window, document: doc = win?.document, onReady = () => {} } = {}) {
  const cache = new Map(), markedCanvases = new WeakMap();
  let image = null, ready = false, destroyed = false, bytes = 0;
  function releaseRaster(canvas) { canvas.width = 0; canvas.height = 0; }
  function clearCache() { for (const canvas of cache.values()) releaseRaster(canvas); cache.clear(); bytes = 0; }
  function loaded() {
    if (destroyed || ready || !image || image.naturalWidth < 1504 || image.naturalHeight < 976) return;
    ready = true; clearCache();
    // Loading can finish between frames, including while the board is idle.
    Promise.resolve().then(() => { if (!destroyed && ready) onReady(); });
  }
  if (typeof win?.Image === 'function') {
    try {
      image = new win.Image(); image.decoding = 'async'; image.onload = loaded;
      image.onerror = () => {}; // Cached vector symbols already provide the full fallback.
      image.src = BUBBLE_ART_URL;
    } catch { image = null; }
  }

  return {
    get ready() { return ready && !destroyed; },
    draw(ctx, color, x, y, diameter) {
      if (destroyed || !BUBBLE_COLOR_ORDER.includes(color) || !Number.isFinite(diameter) || diameter <= 0) return false;
      const owner = doc || ctx.canvas?.ownerDocument;
      if (!owner?.createElement) return false;
      const transform = ctx.getTransform?.();
      const ratio = Math.min(4, Math.max(1, Math.abs(transform?.a) || 1, Math.abs(transform?.d) || 1));
      const size = Math.min(BUBBLE_CACHE_LIMITS.maxDimension, Math.ceil(diameter * ratio / BUBBLE_CACHE_LIMITS.quantum) * BUBBLE_CACHE_LIMITS.quantum);
      const key = `${color}:${size}`;
      let raster = cache.get(key);
      if (!raster) {
        raster = owner.createElement('canvas'); raster.width = raster.height = size;
        const paint = raster.getContext('2d');
        if (!paint) { releaseRaster(raster); return false; }
        if (ready) paint.drawImage(image, ...BUBBLE_SOURCE_RECTS[BUBBLE_COLOR_ORDER.indexOf(color)], 0, 0, size, size);
        else paintFallback(paint, color, size);
        const required = size * size * 4;
        while (cache.size && (cache.size >= BUBBLE_CACHE_LIMITS.maxEntries || bytes + required > BUBBLE_CACHE_LIMITS.maxBytes)) {
          const oldest = cache.keys().next().value, previous = cache.get(oldest);
          bytes -= previous.width * previous.height * 4; cache.delete(oldest); releaseRaster(previous);
        }
        cache.set(key, raster); bytes += required;
      }
      ctx.drawImage(raster, x - diameter / 2, y - diameter / 2, diameter, diameter);
      if (ctx.canvas?.dataset && markedCanvases.get(ctx.canvas) !== ready) {
        ctx.canvas.dataset.paopaoArt = ready ? 'v3' : 'fallback'; markedCanvases.set(ctx.canvas, ready);
        if (ready && !ctx.canvas.dataset.gameArt?.split(' ').includes('bubbles-v3'))
          ctx.canvas.dataset.gameArt = [ctx.canvas.dataset.gameArt, 'bubbles-v3'].filter(Boolean).join(' ');
      }
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; ready = false; clearCache();
      if (image) { image.onload = null; image.onerror = null; image = null; }
    },
  };
}
