// Paopao owns this atlas and its fallback; other games keep their shared art.
export const BUBBLE_ART_URL = new URL('../../../../assets/game-art/paopao/bubbles-v4.png', import.meta.url).href;
export const BUBBLE_COLOR_ORDER = Object.freeze(['red', 'blue', 'green', 'yellow', 'purple', 'orange']);
export const BUBBLE_SOURCE_RECTS = Object.freeze([
  [76, 73, 400, 400], [568, 73, 400, 400], [1060, 73, 400, 400],
  [76, 549, 400, 400], [568, 549, 400, 400], [1060, 549, 400, 400],
].map(Object.freeze));
export const BUBBLE_PALETTE = Object.freeze({ red: '#dc4052', blue: '#237ec4', green: '#299b67', yellow: '#f2d65c', purple: '#9765bd', orange: '#ee913f', bomb: '#374151' });
export const BUBBLE_CACHE_LIMITS = Object.freeze({ maxEntries: 48, maxBytes: 2 * 1024 * 1024, maxDimension: 256, quantum: 8 });

function tint(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, value >> 8 & 255, value & 255].map(channel =>
    Math.round(amount > 0 ? channel + (255 - channel) * amount : channel * (1 + amount)));
  return `rgb(${channels.join(',')})`;
}

function paintFallback(ctx, color, size) {
  const center = size / 2, radius = size * .465, base = BUBBLE_PALETTE[color];
  const gradient = ctx.createRadialGradient(size * .34, size * .28, size * .025, center, center, radius);
  gradient.addColorStop(0, tint(base, .32)); gradient.addColorStop(.5, base); gradient.addColorStop(1, tint(base, -.42));
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = tint(base, -.55); ctx.lineWidth = Math.max(1, size * .025); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.beginPath();
  ctx.ellipse(size * .32, size * .23, size * .12, size * .055, -.5, 0, Math.PI * 2); ctx.fill();
}

export function createBubbleArt({ window: win = globalThis.window, document: doc = win?.document, onReady = () => {} } = {}) {
  const cache = new Map(), markedCanvases = new WeakMap();
  let image = null, ready = false, destroyed = false, bytes = 0;
  function releaseRaster(canvas) { canvas.width = 0; canvas.height = 0; }
  function clearCache() { for (const canvas of cache.values()) releaseRaster(canvas); cache.clear(); bytes = 0; }
  function loaded() {
    if (destroyed || ready || !image || image.naturalWidth < 1460 || image.naturalHeight < 949) return;
    ready = true; clearCache();
    // Loading can finish between frames, including while the board is idle.
    Promise.resolve().then(() => { if (!destroyed && ready) onReady(); });
  }
  if (typeof win?.Image === 'function') {
    try {
      image = new win.Image(); image.decoding = 'async'; image.onload = loaded;
      image.onerror = () => {}; // Cached colored spheres already provide the full fallback.
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
        ctx.canvas.dataset.paopaoArt = ready ? 'v4' : 'fallback'; markedCanvases.set(ctx.canvas, ready);
        if (ready && !ctx.canvas.dataset.gameArt?.split(' ').includes('bubbles-v4'))
          ctx.canvas.dataset.gameArt = [ctx.canvas.dataset.gameArt, 'bubbles-v4'].filter(Boolean).join(' ');
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
