// Procedural leaf atlas.
// 4 species (rows) x 4 variants (columns), each cell CELL x CELL pixels.
// Channel packing (non-premultiplied):
//   R = normalized distance to leaf edge (0 at edge, 1 at the thickest interior)
//   G = vein mask
//   B = mottling (0.25..1) with dark spots pushed toward 0
//   A = leaf coverage
// Leaf frame: u in [-0.5, 0.5] (left/right), v in [0, 1] (stem at bottom, tip at top).

export const SPECIES = ['maple', 'ginkgo', 'oak', 'birch'];
export const COLS = 4;
export const ROWS = 4;
export const CELL = 256;

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAD = 8;
const toX = (u) => PAD + (u + 0.5) * (CELL - 2 * PAD);
const toY = (v) => PAD + (1 - v) * (CELL - 2 * PAD);

// ---------- outline builders: return { outline:[[u,v]...], veins:[{pts, w}], stem:[[u,v],[u,v]] } ----------

function mapleShape(R) {
  const c = [0, 0.47];
  const lobes = [
    { a: 0, L: 1.0 + R() * 0.08, hw: 0.52 },
    { a: 0.92 + R() * 0.12, L: 0.88 + R() * 0.1, hw: 0.5 },
    { a: -(0.92 + R() * 0.12), L: 0.88 + R() * 0.1, hw: 0.5 },
    { a: 1.78 + R() * 0.12, L: 0.55 + R() * 0.12, hw: 0.46 },
    { a: -(1.78 + R() * 0.12), L: 0.55 + R() * 0.12, hw: 0.46 },
  ];
  const scale = 0.47;
  const teethN = 46 + Math.floor(R() * 14);
  const toothAmp = 0.035 + R() * 0.03;
  const outline = [];
  for (let i = 0; i < 720; i++) {
    const th = -Math.PI + (i / 720) * Math.PI * 2;
    let r = 0.34 + 0.08 * Math.cos(th); // core between lobes (sinus depth)
    for (const lb of lobes) {
      let d = th - lb.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const x = Math.abs(d) / lb.hw;
      // fat lobe with a pointed tip
      if (x < 1) r = Math.max(r, lb.L * Math.pow(1 - x, 0.62));
    }
    if (Math.abs(th) < 2.5) {
      const tri = Math.abs(((th * teethN) / (Math.PI * 2)) % 1 - 0.5) * 2;
      r *= 1 + toothAmp * (tri - 0.5);
    }
    if (Math.abs(th) > 2.75) r = Math.min(r, 0.16);
    outline.push([c[0] + Math.sin(th) * r * scale * 1.04, c[1] + Math.cos(th) * r * scale]);
  }
  const veins = [];
  for (const lb of lobes) {
    const tip = [c[0] + Math.sin(lb.a) * lb.L * scale * 0.93, c[1] + Math.cos(lb.a) * lb.L * scale * 0.93];
    veins.push({ pts: [c, tip], w: 2.6 });
    // secondary veins branching off each primary
    for (let k = 1; k <= 3; k++) {
      const t = k / 4.2;
      const p = [c[0] + (tip[0] - c[0]) * t, c[1] + (tip[1] - c[1]) * t];
      const len = lb.L * scale * (0.32 - t * 0.12);
      for (const s of [-1, 1]) {
        const a = lb.a + s * (0.75 + R() * 0.2);
        veins.push({ pts: [p, [p[0] + Math.sin(a) * len, p[1] + Math.cos(a) * len]], w: 1.1 });
      }
    }
  }
  return { outline, veins, stem: [[0.02, 0.0], c], stemW: 4 };
}

function ginkgoShape(R) {
  const b = [0, 0.24];
  const alpha = 0.92 + R() * 0.16;
  const rad = 0.62 + R() * 0.06;
  const notch = R() < 0.75 ? 0.12 + R() * 0.28 : 0;
  const waveF = 10 + R() * 8;
  const waveP = R() * 6;
  const outline = [];
  // left edge (concave curve from base to outer corner)
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = -alpha;
    const r = rad * 0.9 * t;
    const bow = Math.sin(t * Math.PI) * 0.05;
    outline.push([b[0] + Math.sin(a) * r + bow, b[1] + Math.cos(a) * r]);
  }
  // outer wavy arc with a center notch
  for (let i = 0; i <= 160; i++) {
    const a = -alpha + (i / 160) * alpha * 2;
    let r = rad * (0.9 + 0.1 * Math.cos(a / alpha * Math.PI * 0.5));
    r *= 1 + 0.025 * Math.sin(a * waveF + waveP) + 0.012 * Math.sin(a * 37 + waveP);
    r -= notch * rad * Math.exp(-Math.pow(a / 0.06, 2));
    outline.push([b[0] + Math.sin(a) * r, b[1] + Math.cos(a) * r]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const a = alpha;
    const r = rad * 0.9 * t;
    const bow = Math.sin(t * Math.PI) * 0.05;
    outline.push([b[0] + Math.sin(a) * r - bow, b[1] + Math.cos(a) * r]);
  }
  const veins = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = -alpha * 0.95 + (i / (n - 1)) * alpha * 1.9;
    const r = rad * 1.05;
    veins.push({ pts: [b, [b[0] + Math.sin(a) * r * 0.5, b[1] + Math.cos(a) * r * 0.5], [b[0] + Math.sin(a * 1.04) * r, b[1] + Math.cos(a * 1.04) * r]], w: 0.9 });
  }
  return { outline, veins, stem: [[0.03, 0.0], b], stemW: 3.4 };
}

function pinnateShape(R, kind) {
  const base = kind === 'oak' ? 0.09 : 0.14;
  const len = kind === 'oak' ? 0.88 : 0.82;
  const nLobes = kind === 'oak' ? 4 + Math.floor(R() * 2) : 0;
  const phL = R() * 0.4, phR = R() * 0.4;
  const bend = (R() - 0.5) * 0.12;
  const teeth = 20 + Math.floor(R() * 8);
  const wScale = kind === 'oak' ? 0.4 + R() * 0.06 : 0.36 + R() * 0.06;
  const env = (t) => {
    if (kind === 'oak') {
      // obovate: widest near 0.65
      return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.85) * (0.35 + 0.65 * t);
    }
    // birch: deltoid-ovate, widest near 0.28, acuminate tip
    return t < 0.28 ? Math.pow(Math.sin((t / 0.28) * Math.PI * 0.5), 0.55) : Math.pow((1 - t) / 0.72, 1.15);
  };
  const halfW = (t, side) => {
    let w = env(t) * wScale;
    if (kind === 'oak') {
      const ph = side > 0 ? phR : phL;
      const s = Math.abs(Math.sin(Math.PI * (nLobes * t * 0.95 + ph)));
      w *= 0.5 + 0.5 * Math.pow(s, 0.55);
    } else {
      const f1 = Math.abs(((t * teeth) % 1) - 0.5) * 2;
      const f2 = Math.abs(((t * teeth * 2.0) % 1) - 0.5) * 2;
      w *= 1 + 0.07 * (f1 - 0.5) + 0.03 * (f2 - 0.5);
    }
    return w;
  };
  const mid = (t) => [bend * t * t, base + len * t];
  const outline = [];
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const m = mid(t);
    outline.push([m[0] + halfW(t, 1), m[1]]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const m = mid(t);
    outline.push([m[0] - halfW(t, -1), m[1]]);
  }
  const veins = [];
  const midPts = [];
  for (let i = 0; i <= 20; i++) midPts.push(mid((i / 20) * 0.97));
  veins.push({ pts: midPts, w: 2.4 });
  const pairs = kind === 'oak' ? nLobes : 7 + Math.floor(R() * 2);
  for (let k = 0; k < pairs; k++) {
    for (const side of [-1, 1]) {
      let t0;
      if (kind === 'oak') {
        const ph = side > 0 ? phR : phL;
        t0 = ((k + 0.5) - ph) / (nLobes * 0.95);
        if (t0 < 0.06 || t0 > 0.92) continue;
      } else {
        t0 = 0.08 + (k / pairs) * 0.78;
      }
      const m0 = mid(Math.max(0, t0 - 0.1));
      const t1 = Math.min(0.98, t0 + 0.02);
      const m1 = mid(t1);
      const w = halfW(t1, side) * 0.92;
      veins.push({ pts: [m0, [m0[0] + side * w * 0.5, (m0[1] + m1[1]) * 0.5], [m1[0] + side * w, m1[1] + 0.02]], w: 1.2 });
    }
  }
  return { outline, veins, stem: [[0.02, 0.0], mid(0.02)], stemW: 3.6 };
}

// ---------- rasterization helpers ----------

function pathFrom(pts, close = true) {
  const p = new Path2D();
  p.moveTo(toX(pts[0][0]), toY(pts[0][1]));
  for (let i = 1; i < pts.length; i++) p.lineTo(toX(pts[i][0]), toY(pts[i][1]));
  if (close) p.closePath();
  return p;
}

function strokePolyline(ctx, pts, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
  if (pts.length === 3) {
    ctx.quadraticCurveTo(toX(pts[1][0]), toY(pts[1][1]), toX(pts[2][0]), toY(pts[2][1]));
  } else {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
  }
  ctx.stroke();
}

// Two-pass chamfer distance transform on a binary mask (inside = 1).
function distanceInside(mask, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - w] + a);
        if (x > 0) v = Math.min(v, d[i - w - 1] + b);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + b);
      } else v = Math.min(v, 1);
      if (x === 0) v = Math.min(v, 1);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + a);
      else v = Math.min(v, 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + a);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + b);
        if (x > 0) v = Math.min(v, d[i + w - 1] + b);
      } else v = Math.min(v, 1);
      d[i] = v;
    }
  }
  return d;
}

// Smooth value noise on a CELL grid.
function valueNoise(R, freq) {
  const g = freq + 1;
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = R();
  return (x, y) => {
    const fx = (x / CELL) * freq, fy = (y / CELL) * freq;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i0 = iy * g + ix;
    const a = grid[i0], b = grid[i0 + 1], c = grid[i0 + g], d = grid[i0 + g + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function buildLeafAtlas(seed = 7) {
  const W = COLS * CELL, H = ROWS * CELL;
  const data = new Uint8Array(W * H * 4);
  const cv = document.createElement('canvas');
  cv.width = CELL;
  cv.height = CELL;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const R = mulberry(seed * 1000 + row * 31 + col * 7 + 1);
      const sp = SPECIES[row];
      const shape = sp === 'maple' ? mapleShape(R) : sp === 'ginkgo' ? ginkgoShape(R) : pinnateShape(R, sp);
      const body = pathFrom(shape.outline);

      // --- alpha: blade + petiole ---
      ctx.clearRect(0, 0, CELL, CELL);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.fill(body);
      strokePolyline(ctx, shape.stem, shape.stemW);
      const alphaImg = ctx.getImageData(0, 0, CELL, CELL).data;

      // --- veins (clipped to blade) ---
      ctx.clearRect(0, 0, CELL, CELL);
      ctx.save();
      ctx.clip(body);
      ctx.strokeStyle = '#fff';
      for (const v of shape.veins) {
        ctx.globalAlpha = v.w > 2 ? 1 : 0.75;
        strokePolyline(ctx, v.pts, v.w);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      strokePolyline(ctx, shape.stem, shape.stemW * 0.8);
      const veinImg = ctx.getImageData(0, 0, CELL, CELL).data;

      // --- spots ---
      ctx.clearRect(0, 0, CELL, CELL);
      const nSpots = Math.floor(R() * 10) + (R() < 0.4 ? 8 : 0);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < nSpots; i++) {
        const p = shape.outline[Math.floor(R() * shape.outline.length)];
        const t = 0.3 + R() * 0.65;
        const cx = toX(p[0] * t), cy = toY(0.5 + (p[1] - 0.5) * t);
        const r = 1.5 + R() * R() * 7;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const spotImg = ctx.getImageData(0, 0, CELL, CELL).data;

      // --- distance to edge ---
      const mask = new Uint8Array(CELL * CELL);
      for (let i = 0; i < CELL * CELL; i++) mask[i] = alphaImg[i * 4 + 3] > 127 ? 1 : 0;
      const dist = distanceInside(mask, CELL, CELL);
      let maxD = 1;
      for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];

      const n1 = valueNoise(R, 6), n2 = valueNoise(R, 18), n3 = valueNoise(R, 40);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const si = (y * CELL + x) * 4;
          const a = alphaImg[si + 3];
          // flip vertically so texture v=1 is the leaf tip
          const dx = col * CELL + x, dy = row * CELL + (CELL - 1 - y);
          const di = (dy * W + dx) * 4;
          if (a === 0) {
            data[di] = data[di + 1] = data[di + 2] = data[di + 3] = 0;
            continue;
          }
          const e = Math.min(1, Math.pow(dist[y * CELL + x] / maxD, 0.7));
          const m = 0.25 + 0.75 * (0.55 * n1(x, y) + 0.3 * n2(x, y) + 0.15 * n3(x, y));
          const spot = spotImg[si + 3] / 255;
          data[di] = Math.round(e * 255);
          data[di + 1] = veinImg[si + 3];
          data[di + 2] = Math.round(Math.max(0, m * (1 - spot)) * 255);
          data[di + 3] = a;
        }
      }
    }
  }
  return { data, width: W, height: H };
}
