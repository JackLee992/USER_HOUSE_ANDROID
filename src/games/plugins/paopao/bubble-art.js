// Paopao renders a small cached pastel sphere for each color and display size.
// Keeping the artwork procedural avoids the saturated glow baked into the v4 atlas.
export const BUBBLE_ART_VERSION = 'pastel-v5';
export const BUBBLE_COLOR_ORDER = Object.freeze(['red', 'blue', 'green', 'yellow', 'purple', 'orange']);
export const BUBBLE_PALETTE = Object.freeze({
  red: '#f28b94',
  blue: '#8fc7ee',
  green: '#96d7a7',
  yellow: '#f3d878',
  purple: '#b9a4e8',
  orange: '#efb37e',
  bomb: '#6f7f91',
});
export const BUBBLE_CACHE_LIMITS = Object.freeze({ maxEntries: 48, maxBytes: 2 * 1024 * 1024, maxDimension: 256, quantum: 8 });

function tint(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, value >> 8 & 255, value & 255].map(channel =>
    Math.round(amount > 0 ? channel + (255 - channel) * amount : channel * (1 + amount)));
  return `rgb(${channels.join(',')})`;
}

function paintSphere(ctx, color, size) {
  const center = size / 2, radius = size * .465, base = BUBBLE_PALETTE[color];
  const gradient = ctx.createRadialGradient(size * .36, size * .31, size * .035, center, center, radius);
  gradient.addColorStop(0, tint(base, .16));
  gradient.addColorStop(.48, base);
  gradient.addColorStop(1, tint(base, -.18));
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = tint(base, -.28);
  ctx.lineWidth = Math.max(1, size * .018);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,.38)';
  ctx.beginPath();
  ctx.ellipse(size * .34, size * .27, size * .095, size * .045, -.48, 0, Math.PI * 2);
  ctx.fill();
}

export function createBubbleArt({ document: doc = globalThis.document } = {}) {
  const cache = new Map(), markedCanvases = new WeakSet();
  let destroyed = false, bytes = 0;
  function releaseRaster(canvas) { canvas.width = 0; canvas.height = 0; }
  function clearCache() { for (const canvas of cache.values()) releaseRaster(canvas); cache.clear(); bytes = 0; }

  return {
    get ready() { return !destroyed; },
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
        paintSphere(paint, color, size);
        const required = size * size * 4;
        while (cache.size && (cache.size >= BUBBLE_CACHE_LIMITS.maxEntries || bytes + required > BUBBLE_CACHE_LIMITS.maxBytes)) {
          const oldest = cache.keys().next().value, previous = cache.get(oldest);
          bytes -= previous.width * previous.height * 4; cache.delete(oldest); releaseRaster(previous);
        }
        cache.set(key, raster); bytes += required;
      }
      ctx.drawImage(raster, x - diameter / 2, y - diameter / 2, diameter, diameter);
      if (ctx.canvas?.dataset && !markedCanvases.has(ctx.canvas)) {
        ctx.canvas.dataset.paopaoArt = BUBBLE_ART_VERSION;
        ctx.canvas.dataset.gameArt = [ctx.canvas.dataset.gameArt, `paopao-${BUBBLE_ART_VERSION}`].filter(Boolean).join(' ');
        markedCanvases.add(ctx.canvas);
      }
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; clearCache();
    },
  };
}
