// Glyph outlines via opentype.js -> raster mask -> Poisson-disk leaf targets.
import opentype from '../vendor/opentype.module.js';

// Chinese and English letters are set in separate fonts: a lively brush-pen handwriting for Chinese
// (千图笔锋手写体, Qiantu Bifeng) and Sorts Mill Goudy for Latin letters and digits.
export const FONTS_ZH = {
  qiantu: { label: 'Qiantu Bifeng (brush-pen handwriting)', url: 'fonts/QiantuBifeng.woff' },
};
export const FONTS_EN = {
  goudy: { label: 'Sorts Mill Goudy', url: 'fonts/en-SortsMillGoudy.woff' },
};
export const DEFAULT_ZH = 'qiantu';
export const DEFAULT_EN = 'goudy';
const params = (() => {
  try {
    return new URLSearchParams(location.search);
  } catch (e) {
    return new URLSearchParams();
  }
})();
const zhKey = FONTS_ZH[params.get('zh')] ? params.get('zh') : DEFAULT_ZH;
const enKey = FONTS_EN[params.get('en')] ? params.get('en') : DEFAULT_EN;
const RES = 192;          // mask resolution per em
const BASELINE = 0.88;    // baseline position from the top of the em box
let font = null;          // Chinese font
let fontEn = null;        // English font (null: use the Chinese font's own Latin)
let fontPromise = null;
const cache = new Map();

function loadOne(url) {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('font http ' + r.status);
      return r.arrayBuffer();
    })
    .then((buf) => opentype.parse(buf))
    .catch((err) => {
      console.warn('Font load failed, falling back to system font:', url, err);
      return null;
    });
}

export function loadFont() {
  if (!fontPromise) {
    const en = FONTS_EN[enKey].url;
    fontPromise = Promise.all([loadOne(FONTS_ZH[zhKey].url), en ? loadOne(en) : Promise.resolve(null)]).then(([zh, e]) => {
      font = zh;
      fontEn = e;
      cache.clear();
      return font;
    });
  }
  return fontPromise;
}

// Latin letters, digits and Western punctuation go to the English font; everything else to the Chinese one
const isLatin = (ch) => ch.codePointAt(0) < 0x2e80;

// Rasterize a character into a coverage mask. Returns { mask, adv } where adv is in em.
function rasterize(ch) {
  const cv = document.createElement('canvas');
  cv.width = RES * 1.2;
  cv.height = RES;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  let adv = 1;
  const f = fontEn && isLatin(ch) && fontEn.charToGlyph(ch).index !== 0 ? fontEn : font;
  const glyph = f ? f.charToGlyph(ch) : null;
  if (glyph && glyph.index !== 0) {
    adv = (glyph.advanceWidth || f.unitsPerEm) / f.unitsPerEm;
    const ox = (cv.width - adv * RES) / 2;
    const path = glyph.getPath(ox, RES * BASELINE, RES);
    path.fill = '#fff';
    path.draw(ctx);
  } else {
    // System font fallback (font still loading, or glyph missing from the subset).
    ctx.font = `700 ${RES * 0.92}px "PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei",sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    adv = Math.min(1.15, Math.max(0.3, ctx.measureText(ch).width / RES));
    ctx.fillText(ch, cv.width / 2, RES * BASELINE);
  }
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const w = cv.width, h = cv.height;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = img[i * 4 + 3] > 110 ? 1 : 0;
  return { mask, w, h, adv };
}

function chamfer(mask, w, h) {
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const s2 = Math.SQRT2;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i - 1] + 1, d[i - w] + 1, d[i - w - 1] + s2, d[i - w + 1] + s2);
    }
  for (let y = h - 2; y > 0; y--)
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1, d[i + w + 1] + s2, d[i + w - 1] + s2);
    }
  return d;
}

// Bridson Poisson-disk sampling restricted to the mask; reseeds to reach every stroke.
function poisson(mask, w, h, r, rand) {
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[(y | 0) * w + (x | 0)];
  const fits = (x, y) => {
    const gx = (x / cell) | 0, gy = (y / cell) | 0;
    for (let j = Math.max(0, gy - 2); j <= Math.min(gh - 1, gy + 2); j++)
      for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
        const k = grid[j * gw + i];
        if (k >= 0) {
          const dx = pts[k][0] - x, dy = pts[k][1] - y;
          if (dx * dx + dy * dy < r * r) return false;
        }
      }
    return true;
  };
  const add = (x, y) => {
    pts.push([x, y]);
    active.push(pts.length - 1);
    grid[((y / cell) | 0) * gw + ((x / cell) | 0)] = pts.length - 1;
  };
  // candidate seeds: every inside pixel on a coarse lattice, shuffled
  const seeds = [];
  for (let y = 1; y < h; y += 2) for (let x = 1; x < w; x += 2) if (mask[y * w + x]) seeds.push([x, y]);
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
  }
  let si = 0;
  while (true) {
    if (!active.length) {
      while (si < seeds.length && !fits(seeds[si][0], seeds[si][1])) si++;
      if (si >= seeds.length) break;
      add(seeds[si][0], seeds[si][1]);
    }
    const ai = (rand() * active.length) | 0;
    const p = pts[active[ai]];
    let found = false;
    for (let k = 0; k < 24; k++) {
      const a = rand() * Math.PI * 2;
      const rr = r * (1 + rand());
      const x = p[0] + Math.cos(a) * rr, y = p[1] + Math.sin(a) * rr;
      if (inside(x, y) && fits(x, y)) {
        add(x, y);
        found = true;
        break;
      }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

// Returns { adv, samples:[{x,y,size,rot,edge}] } with x,y in em relative to the em-box center.
// density < 1 produces fewer, larger leaves (used for long texts / small screens).
export function glyphTargets(ch, density = 1) {
  const key = ch + '|' + density.toFixed(2) + '|' + (font ? 1 : 0) + (fontEn ? 1 : 0);
  if (cache.has(key)) return cache.get(key);
  const { mask, w, h, adv } = rasterize(ch);
  const dist = chamfer(mask, w, h);
  const vals = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] > 0) vals.push(dist[i]);
  if (vals.length < 10) {
    const empty = { adv, samples: [] };
    cache.set(key, empty);
    return empty;
  }
  vals.sort((a, b) => a - b);
  const halfW = Math.max(3, vals[Math.floor(vals.length * 0.97)]);
  const strokeEm = (halfW * 2) / RES;

  let seed = 0;
  for (const c of ch) seed = (seed * 31 + c.codePointAt(0)) >>> 0;
  let s = seed + 12345;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const spacing = halfW * 0.56 / Math.sqrt(density);
  const inner = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inner[i] = dist[i] >= halfW * 0.22 ? 1 : 0;
  const pts = poisson(inner, w, h, spacing, rand);
  const samples = [];
  for (const [px, py] of pts) {
    const x = px | 0, y = py | 0;
    const i = y * w + x;
    const d = dist[i];
    // DT gradient points inward; the stroke direction is perpendicular to it
    const gx = (dist[i + 1] || 0) - (dist[i - 1] || 0);
    const gy = (dist[i + w] || 0) - (dist[i - w] || 0);
    const edge = 1 - Math.min(1, d / halfW);
    let rot;
    if (edge > 0.45 && gx * gx + gy * gy > 0.01) {
      // canvas y goes down: the y-up gradient is (gx, -gy); a leaf rotated by theta points along (-sin, cos),
      // so aligning it with the stroke tangent gives theta = atan2(-gy, gx) (+PI for either direction).
      rot = Math.atan2(-gy, gx) + (rand() < 0.5 ? Math.PI : 0) + (rand() - 0.5) * 0.6;
    } else rot = rand() * Math.PI * 2;
    const size = strokeEm * (0.66 + rand() * 0.4) / Math.sqrt(density) * (edge > 0.5 ? 0.85 : 1);
    samples.push({
      x: (px - w / 2) / RES,
      y: (h * 0.5 - py) / RES,
      size,
      rot,
      edge,
      order: rand() * 0.65 + edge * 0.35, // edge leaves tend to land last (crisper outline)
    });
  }
  samples.sort((a, b) => a.order - b.order);
  const out = { adv, samples, strokeEm };
  cache.set(key, out);
  return out;
}

export function fontReady() {
  return !!font;
}
