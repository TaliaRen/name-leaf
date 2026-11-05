// Top-down forest floor: soil, grit, pebbles, twigs, needles, moss, acorns — painted once on a canvas.
// Sunlight arrives as slowly swaying dapples through the canopy (shared GLSL, used by every layer).
import * as THREE from '../vendor/three.module.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Shared uniforms (same objects referenced by all materials).
export const shared = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uSpot: { value: new THREE.Vector4(0, 0, 0, 100) },      // x, y (device px), strength, radius
  // shafts of sunlight let in by the space bar: x, y (device px), strength 0..1, radius (device px)
  uBeam: { value: [new THREE.Vector4(0, 0, 0, 1), new THREE.Vector4(0, 0, 0, 1), new THREE.Vector4(0, 0, 0, 1)] },
  uGroove: { value: null },
  uWet: { value: null },     // damp footprints where crushed leaves sank into the soil
  uSoil: { value: null },    // the painted forest floor
  uGlow: { value: new THREE.Vector4(0, 0, 1, 0) }, // x, y, radius (device px), strength: warm glow under a long press
};

// Dappled canopy light. Returns 0 (deep shade) .. 1 (full sun) for a fragment position in device pixels.
export const DAPPLE_GLSL = /* glsl */ `
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec4 uSpot;
  uniform vec4 uBeam[3];
  float dh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dh(i), dh(i + vec2(1, 0)), f.x), mix(dh(i + vec2(0, 1)), dh(i + vec2(1, 1)), f.x), f.y); }
  float dapple(vec2 frag){
    float m = max(uRes.x, uRes.y);
    float t = uTime;
    vec2 p = frag / m;
    // wind comes from every direction: a smooth random wind vector that keeps changing heading and strength
    vec2 wind = vec2(dn(vec2(t * 0.23, 1.7)), dn(vec2(t * 0.23, 8.3))) * 2.0 - 1.0;
    vec2 wind2 = vec2(dn(vec2(t * 0.41, 4.1)), dn(vec2(t * 0.41, 12.9))) * 2.0 - 1.0;
    float gust = 0.45 + 0.85 * dn(vec2(t * 0.17, 21.0));
    // far canopy: large soft masses that only drift a little
    vec2 q1 = p * 2.6 + wind * 0.05 * gust;
    float far = dn(q1) * 0.65 + dn(q1 * 2.1 + 5.3) * 0.35;
    // near boughs: pushed and twisted by the wind, swinging back and forth around it
    float sw1 = sin(t * 1.15 + dn(vec2(t * 0.3, 2.0)) * 6.0);
    float ang = (wind.x * 0.09 + sw1 * 0.05) * gust;
    vec2 pivot = vec2(0.5, 0.5) + wind * 0.6;
    vec2 pr = pivot + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - pivot);
    pr += wind * 0.06 * gust + vec2(sw1, -sw1) * 0.018 * gust;
    vec2 q2 = pr * 3.4 + vec2(1.7, 0.4);
    float near = dn(q2) * 0.65 + dn(q2 * 2.2 + 2.1) * 0.35;
    // smaller branches answer the wind faster and in their own direction (still one coherent motion each)
    float sw2 = sin(t * 2.1 + dn(vec2(t * 0.5, 9.0)) * 6.0);
    float ang2 = (wind2.y * 0.08 + sw2 * 0.05) * gust;
    vec2 pivot2 = vec2(0.5, 0.5) - wind2 * 0.5;
    vec2 pr2 = pivot2 + mat2(cos(ang2), -sin(ang2), sin(ang2), cos(ang2)) * (p - pivot2);
    pr2 += wind2 * 0.045 * gust + vec2(-sw2, sw2) * 0.014 * gust;
    vec2 q3 = pr2 * 5.2 + vec2(4.1, 2.3);
    float twig = dn(q3) * 0.7 + dn(q3 * 2.1 + 1.3) * 0.3;
    float light = smoothstep(0.3, 0.56, far) * smoothstep(0.34, 0.54, near) * mix(1.0, smoothstep(0.25, 0.5, twig), 0.6);
    light = smoothstep(0.0, 0.6, light);
    // the canopy opens toward the upper left where the low sun comes from
    float wash = smoothstep(1.3, 0.0, length(frag / uRes - vec2(0.08, 1.02)));
    // now and then a thin cloud drifts over the sun and the light softens
    float cloud = smoothstep(0.62, 0.9, dn(vec2(t * 0.04, 3.1)));
    light *= 1.0 - 0.3 * cloud;
    wash *= 1.0 - 0.2 * cloud;
    float l = clamp(light * (0.5 + 0.7 * wash) + wash * 0.22, 0.0, 1.0);
    // a small patch of sunlight that follows the pointer, like a mirror held up to the sun
    float sp = uSpot.z * smoothstep(uSpot.w, uSpot.w * 0.25, length(frag - uSpot.xy));
    // shafts of sun through a gap in the canopy: a soft, leaf-edged pool of warm light, brighter than plain sun,
    // with the canopy's twigs flickering across it
    float bm = 0.0;
    for (int i = 0; i < 3; i++) {
      vec4 b = uBeam[i];
      if (b.z <= 0.001) continue;
      vec2 d = frag - b.xy;
      float a = atan(d.y, d.x);
      float wob = 1.0 + 0.13 * sin(3.0 * a + t * 0.7 + float(i)) + 0.07 * sin(7.0 * a - t * 1.1);
      float r = length(d * vec2(1.0, 1.12)) / (b.w * wob);
      float pool = smoothstep(1.0, 0.35, r);
      float flick = mix(1.0, smoothstep(0.2, 0.55, twig), 0.35 * smoothstep(0.2, 0.8, r));
      bm = max(bm, b.z * pool * flick);
    }
    return max(max(l, sp), bm) + 0.95 * bm;
  }
`;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const shade = (c, f) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;

export function paintSoil(aspect, long = 1100) {
  if (!isFinite(aspect) || aspect <= 0) aspect = 1.6;
  aspect = Math.min(4, Math.max(0.25, aspect));
  const w = aspect >= 1 ? long : Math.round(long * aspect);
  const h = aspect >= 1 ? Math.round(long / aspect) : long;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const R = rng(1104);
  const k = Math.max(w, h) / 1100; // feature scale
  const rr = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[(R() * arr.length) | 0];
  // small things keep a little more to the sides: the middle of the picture, where the words sit, is a bit clearer
  const pos = () => {
    for (let t = 0; t < 30; t++) {
      const x = R() * w, y = R() * h;
      const nx = Math.abs(x / w - 0.5) * 2, ny = Math.abs(y / h - 0.5) * 2;
      if (Math.max(nx, ny) > 0.55 || R() < 0.3) return [x, y];
    }
    return [R() * w, R() * h];
  };

  // humus base with broad mottling
  ctx.fillStyle = '#2c1c12';
  ctx.fillRect(0, 0, w, h);
  const blot = ['#3a2617', '#22150c', '#45301d', '#2a1b11', '#4b3420', '#1c120a'];
  for (let i = 0; i < 520; i++) {
    const x = R() * w, y = R() * h, r = rr(20, 90) * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = pick(blot);
    g.addColorStop(0, c + 'aa');
    g.addColorStop(1, c + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // mud patches: darker, wet, with a glossy sheen and a small puddle in one of them
  const muds = [];
  for (let i = 0; i < 3; i++) {
    const cx = rr(0.08, 0.92) * w, cy = rr(0.08, 0.92) * h, rad = rr(45, 95) * k;
    muds.push([cx, cy, rad]);
    for (let j = 0; j < 26; j++) {
      const a = R() * 6.283, d = Math.pow(R(), 0.6) * rad * 0.8;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7, r = rad * rr(0.25, 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(24,15,9,0.55)');
      g.addColorStop(1, 'rgba(24,15,9,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // wet sheen
    for (let j = 0; j < 30; j++) {
      const a = R() * 6.283, d = Math.pow(R(), 0.7) * rad * 0.7;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
      ctx.fillStyle = `rgba(255,236,210,${rr(0.04, 0.1)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rr(2, 7) * k, rr(0.6, 1.6) * k, rr(-0.6, -0.2), 0, 6.283);
      ctx.fill();
    }
  }
  {
    const [cx, cy, rad] = muds[0];
    const pr = rad * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * 6.283;
      const rr2 = pr * (1 + 0.18 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 5));
      const x = Math.cos(a) * rr2 * 1.25, y = Math.sin(a) * rr2 * 0.8;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    const pg = ctx.createLinearGradient(-pr, -pr, pr, pr);
    pg.addColorStop(0, '#5b5650');   // sky and canopy reflected in the water
    pg.addColorStop(0.5, '#2a2622');
    pg.addColorStop(1, '#1a1612');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,6,0.7)';
    ctx.lineWidth = 2.5 * k;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,220,0.18)';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.ellipse(-pr * 0.25, -pr * 0.2, pr * 0.7, pr * 0.3, -0.3, 3.6, 5.4);
    ctx.stroke();
    ctx.restore();
  }

  // moss patches
  for (let p = 0; p < 5; p++) {
    const [cx, cy] = pos(), rad = rr(30, 80) * k;
    for (let i = 0; i < 260; i++) {
      const a = R() * 6.283, d = Math.pow(R(), 0.7) * rad;
      ctx.fillStyle = pick(['#33421c', '#46561f', '#28341a', '#56652a', '#3b4a20']) + 'cc';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rr(1, 3.2) * k, 0, 6.283);
      ctx.fill();
    }
  }

  // pine needles
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const [x, y] = pos(), a = R() * 6.283, l = rr(12, 30) * k;
    ctx.strokeStyle = pick(['#8a5a2c', '#6b4220', '#a8743c', '#5a3818']);
    ctx.globalAlpha = rr(0.45, 0.85);
    ctx.lineWidth = rr(0.8, 1.6) * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    if (R() < 0.5) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a + 0.35) * l, y + Math.sin(a + 0.35) * l);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // twigs with small branches
  const twig = (x, y, a, len, wd, depth) => {
    const pts = [[x, y]];
    let cx = x, cy = y, ca = a;
    const n = 8;
    for (let i = 0; i < n; i++) {
      ca += rr(-0.18, 0.18);
      cx += Math.cos(ca) * (len / n);
      cy += Math.sin(ca) * (len / n);
      pts.push([cx, cy]);
    }
    const stroke = (col, lw, ox, oy) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const p of pts) ctx.lineTo(p[0] + ox, p[1] + oy);
      ctx.stroke();
    };
    stroke('rgba(10,5,2,0.55)', wd * 1.3, wd * 0.6, wd * 0.6); // contact shadow
    stroke('#4a3020', wd, 0, 0);
    stroke('#7a5636', wd * 0.45, -wd * 0.18, -wd * 0.18); // highlight
    if (depth > 0)
      for (let b = 0; b < 2; b++) {
        const p = pts[2 + ((R() * 5) | 0)];
        twig(p[0], p[1], a + (R() < 0.5 ? -1 : 1) * rr(0.5, 1.0), len * rr(0.25, 0.45), wd * 0.6, depth - 1);
      }
  };
  for (let i = 0; i < 5; i++) twig(...pos(), R() * 6.283, rr(60, 180) * k, rr(2.5, 5) * k, 1);

  // pebbles (only a few, so the floor doesn't look busy)
  for (let i = 0; i < 22; i++) {
    const [x, y] = pos(), rx = rr(2.5, 9) * k, ry = rx * rr(0.6, 0.95), rot = R() * 3.14;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(8,4,2,0.5)';
    ctx.beginPath();
    ctx.ellipse(rx * 0.35, ry * 0.4, rx * 1.05, ry * 1.05, 0, 0, 6.283);
    ctx.fill();
    const g = ctx.createRadialGradient(-rx * 0.4, -ry * 0.4, 0, 0, 0, rx * 1.1);
    const base = pick([[125, 112, 98], [104, 92, 80], [140, 124, 104], [90, 80, 72]]);
    g.addColorStop(0, `rgb(${base[0] + 40},${base[1] + 36},${base[2] + 30})`);
    g.addColorStop(0.6, `rgb(${base[0]},${base[1]},${base[2]})`);
    g.addColorStop(1, `rgb(${base[0] * 0.55},${base[1] * 0.55},${base[2] * 0.55})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  // acorns and loose caps
  for (let i = 0; i < 3; i++) {
    const [x, y] = pos(), s = rr(7, 10) * k, rot = R() * 6.283;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(8,4,2,0.5)';
    ctx.beginPath();
    ctx.ellipse(s * 0.3, s * 0.35, s * 0.85, s * 1.25, 0, 0, 6.283);
    ctx.fill();
    const capOnly = R() < 0.35;
    if (!capOnly) {
      const g = ctx.createRadialGradient(-s * 0.3, s * 0.1, 0, 0, s * 0.3, s * 1.2);
      g.addColorStop(0, '#c08a4a');
      g.addColorStop(0.6, '#8a5a2a');
      g.addColorStop(1, '#4e3015');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.35, s * 0.7, s * 1.0, 0, 0, 6.283);
      ctx.fill();
    }
    const cg = ctx.createRadialGradient(-s * 0.25, -s * 0.5, 0, 0, -s * 0.4, s);
    cg.addColorStop(0, '#8a6a46');
    cg.addColorStop(1, '#3e2a18');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.4, s * 0.82, s * 0.55, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,18,8,0.6)';
    for (let d = 0; d < 14; d++) {
      ctx.beginPath();
      ctx.arc(rr(-0.6, 0.6) * s, -s * 0.4 + rr(-0.35, 0.35) * s, 0.8 * k, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  // clover patches
  for (let p = 0; p < 3; p++) {
    const [cx, cy] = pos();
    for (let i = 0; i < 16; i++) {
      const x = cx + rr(-40, 40) * k, y = cy + rr(-30, 30) * k, s = rr(3, 5) * k, a = R() * 6.283;
      for (let j = 0; j < 3; j++) {
        const aa = a + (j * 6.283) / 3;
        const g = ctx.createRadialGradient(x + Math.cos(aa) * s * 0.8, y + Math.sin(aa) * s * 0.8, 0, x + Math.cos(aa) * s, y + Math.sin(aa) * s, s);
        g.addColorStop(0, '#6f8a34');
        g.addColorStop(1, '#3d5220');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + Math.cos(aa) * s, y + Math.sin(aa) * s, s, 0, 6.283);
        ctx.fill();
      }
    }
  }
  // tiny wildflowers
  for (let i = 0; i < 10; i++) {
    const [x, y] = pos(), s = rr(2.2, 3.6) * k;
    const col = pick(['#f2ead6', '#f4d35e', '#d9a6e0', '#f2ead6']);
    ctx.fillStyle = col;
    for (let j = 0; j < 5; j++) {
      const a = (j * 6.283) / 5 + R();
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.8, s * 0.5, a, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = '#e0a020';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.55, 0, 6.283);
    ctx.fill();
  }
  // mushrooms seen from above: little clusters of round caps
  for (let c = 0; c < 2; c++) {
    const [cx, cy] = pos();
    const red = R() < 0.35;
    const n = 2 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const x = cx + rr(-18, 18) * k, y = cy + rr(-14, 14) * k, r = rr(5, 11) * k;
      ctx.fillStyle = 'rgba(8,4,2,0.55)';
      ctx.beginPath();
      ctx.arc(x + r * 0.35, y + r * 0.4, r * 1.05, 0, 6.283);
      ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
      if (red) {
        g.addColorStop(0, '#e2553a');
        g.addColorStop(0.7, '#a8261a');
        g.addColorStop(1, '#5e140c');
      } else {
        g.addColorStop(0, '#d9b98a');
        g.addColorStop(0.6, '#9c7448');
        g.addColorStop(1, '#4e3418');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
      if (red) {
        ctx.fillStyle = '#f3ecdc';
        for (let d = 0; d < 6; d++) {
          ctx.beginPath();
          ctx.arc(x + rr(-0.6, 0.6) * r, y + rr(-0.6, 0.6) * r, rr(0.8, 1.6) * k, 0, 6.283);
          ctx.fill();
        }
      }
    }
  }
  // pine cones lying on their side: woody scales spiral round the cone (phyllotaxis);
  // only the half facing up is visible, drawn back to front with soft contact shadows
  const pineCone = (x, y, l, a) => {
    const Rl = rng(((x * 31 + y * 17) | 0) >>> 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.save();
    ctx.filter = 'none';
    ctx.shadowColor = 'rgba(6,3,1,0.7)';
    ctx.shadowBlur = l * 0.25;
    ctx.shadowOffsetX = l * 0.12;
    ctx.shadowOffsetY = l * 0.14;
    ctx.fillStyle = '#2a1a0c';
    ctx.beginPath();
    ctx.ellipse(0, 0, l * 0.27, l * 0.5, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();
    const half = (t) => Math.sin(Math.min(1, t * 0.92 + 0.06) * Math.PI) ** 0.75 * l * 0.29; // tip at t=0, base at t=1
    const scales = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const phi = i * 2.39996; // golden angle
      const depth = Math.sin(phi);
      if (depth < -0.15) continue;
      scales.push({ t, phi, depth });
    }
    scales.sort((p, q) => p.depth - q.depth);
    for (const sc of scales) {
      const yy = -l * 0.48 + sc.t * l * 0.94;
      const hw = half(sc.t);
      const xx = Math.cos(sc.phi) * hw;
      const face = 0.35 + 0.65 * sc.depth; // scales on the flanks are foreshortened
      const sw = l * 0.075 * (0.6 + hw / (l * 0.29) * 0.5);
      const sh = l * 0.07 * (0.55 + face * 0.6);
      const tone = 0.75 + Rl() * 0.35;
      const lit = clamp01(0.55 - Math.cos(sc.phi) * 0.35 + sc.depth * 0.25); // light from the upper left
      ctx.save();
      ctx.translate(xx, yy);
      ctx.rotate(-Math.cos(sc.phi) * 0.5);
      ctx.scale(1, 1);
      // shadow beneath the scale
      ctx.fillStyle = 'rgba(14,8,3,0.55)';
      ctx.beginPath();
      ctx.ellipse(sw * 0.15, sh * 0.35, sw * 1.05, sh * 0.95, 0, 0, 6.283);
      ctx.fill();
      // woody scale with a thickened, weathered tip (apophysis) pointing to the base
      const g = ctx.createLinearGradient(0, -sh, 0, sh);
      g.addColorStop(0, shade([88, 56, 30], tone * (0.6 + lit * 0.5)));
      g.addColorStop(0.6, shade([120, 82, 46], tone * (0.6 + lit * 0.6)));
      g.addColorStop(1, shade([150, 112, 72], tone * (0.55 + lit * 0.7)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-sw, -sh * 0.5);
      ctx.quadraticCurveTo(-sw * 1.05, sh * 0.6, 0, sh);
      ctx.quadraticCurveTo(sw * 1.05, sh * 0.6, sw, -sh * 0.5);
      ctx.quadraticCurveTo(0, -sh * 0.9, -sw, -sh * 0.5);
      ctx.fill();
      // umbo: small dark nub, and fine grain
      ctx.fillStyle = 'rgba(40,24,10,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, sh * 0.45, sw * 0.18, sh * 0.14, 0, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,18,8,0.25)';
      ctx.lineWidth = 0.5 * k;
      ctx.beginPath();
      ctx.moveTo(-sw * 0.5, -sh * 0.2);
      ctx.lineTo(0, sh * 0.3);
      ctx.lineTo(sw * 0.5, -sh * 0.2);
      ctx.stroke();
      ctx.restore();
    }
    // stalk at the base
    ctx.strokeStyle = '#3a2614';
    ctx.lineWidth = l * 0.05;
    ctx.beginPath();
    ctx.moveTo(0, l * 0.47);
    ctx.lineTo(l * 0.015, l * 0.56);
    ctx.stroke();
    ctx.restore();
  };
  for (let i = 0; i < 3; i++) pineCone(...pos(), rr(28, 40) * k, R() * 6.283);

  // footprints pressed into the ground
  const press = (draw) => {
    ctx.save();
    ctx.translate(1.2 * k, 1.2 * k);
    ctx.fillStyle = 'rgba(255,225,190,0.1)';   // lit far rim
    ctx.strokeStyle = 'rgba(255,225,190,0.1)';
    draw();
    ctx.restore();
    ctx.fillStyle = 'rgba(10,6,3,0.5)';
    ctx.strokeStyle = 'rgba(10,6,3,0.5)';
    draw();
  };
  // a bird's trail: three toes forward, one back
  {
    let x = rr(0.15, 0.85) * w, y = rr(0.15, 0.85) * h, a = R() * 6.283;
    for (let i = 0; i < 12; i++) {
      a += rr(-0.25, 0.25);
      const sd = i % 2 ? 1 : -1;
      const px = x + Math.cos(a + Math.PI / 2) * sd * 4 * k, py = y + Math.sin(a + Math.PI / 2) * sd * 4 * k;
      press(() => {
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.4 * k;
        ctx.beginPath();
        for (const d of [-0.5, 0, 0.5]) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(a + d) * 7 * k, py + Math.sin(a + d) * 7 * k);
        }
        ctx.moveTo(px, py);
        ctx.lineTo(px - Math.cos(a) * 4 * k, py - Math.sin(a) * 4 * k);
        ctx.stroke();
      });
      x += Math.cos(a) * 11 * k;
      y += Math.sin(a) * 11 * k;
    }
  }
  // squirrel tracks: groups of four, long hind prints ahead of the small fore prints
  {
    let x = rr(0.2, 0.8) * w, y = rr(0.2, 0.8) * h, a = R() * 6.283;
    for (let i = 0; i < 6; i++) {
      a += rr(-0.3, 0.3);
      const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
      press(() => {
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(x + nx * sd * 3 * k, y + ny * sd * 3 * k, 1.6 * k, 2 * k, a, 0, 6.283);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x + ca * 10 * k + nx * sd * 7 * k, y + sa * 10 * k + ny * sd * 7 * k, 3.6 * k, 1.8 * k, a, 0, 6.283);
          ctx.fill();
        }
      });
      x += ca * 34 * k;
      y += sa * 34 * k;
    }
  }
  // deer hoof prints in the mud
  for (const [mx, my, mr] of muds.slice(1, 3)) {
    let a = R() * 6.283;
    for (let i = 0; i < 3; i++) {
      const x = mx + Math.cos(a) * (i - 1) * mr * 0.45, y = my + Math.sin(a) * (i - 1) * mr * 0.45;
      press(() => {
        for (const sd of [-1, 1]) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(sd * 1 * k, -7 * k);
          ctx.quadraticCurveTo(sd * 6 * k, -4 * k, sd * 4.5 * k, 6 * k);
          ctx.lineTo(sd * 1 * k, 5 * k);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      });
    }
  }

  // a stray feather
  {
    const x = rr(0.1, 0.9) * w, y = rr(0.1, 0.9) * h, l = 46 * k, a = R() * 6.283;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.strokeStyle = 'rgba(8,4,2,0.4)';
    ctx.lineWidth = 6 * k;
    ctx.beginPath();
    ctx.moveTo(3 * k, -l / 2 + 3 * k);
    ctx.lineTo(3 * k, l / 2 + 3 * k);
    ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const t = i / 60;
      const yy = -l / 2 + t * l * 0.85;
      const len = Math.sin(t * Math.PI) * 9 * k + 2 * k;
      ctx.strokeStyle = i % 7 === 0 ? 'rgba(90,80,72,0.8)' : 'rgba(196,188,176,0.75)';
      ctx.lineWidth = 0.8 * k;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(sd * len, yy - len * 0.6);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#e8e2d6';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(0, -l / 2);
    ctx.lineTo(0, l / 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- a big stone and twigs along the bottom,
  // partly out of the picture
  const soilCtx = ctx;
  {
    const m = Math.min(w, h);
    // the stone is painted sharp on its own layer and softened once as a whole (blurring every one of its
    // thousands of tiny moss dots one by one would take seconds)
    const outer = soilCtx;
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const ctx = layer.getContext('2d');
    const moss = (x, y, rad, n = 180, squash = 0.8) => {
      for (let i = 0; i < n; i++) {
        const a = R() * 6.283, d = Math.pow(R(), 0.7) * rad;
        ctx.fillStyle = pick(['#33421c', '#46561f', '#28341a', '#56652a', '#3b4a20']) + 'd0';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * squash, rr(1, 3) * k, 0, 6.283);
        ctx.fill();
      }
      for (let i = 0; i < n * 0.15; i++) {
        const a = R() * 6.283, d = Math.pow(R(), 0.8) * rad * 0.9;
        ctx.fillStyle = 'rgba(150,170,80,0.5)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d - k, y + Math.sin(a) * d * squash - k, rr(0.6, 1.4) * k, 0, 6.283);
        ctx.fill();
      }
    };
    ctx.save();
    // the stone: a big grey boulder at the bottom, mostly below the edge, mossy on its shaded side
    {
      const cx = w * 0.3, cy = h + m * 0.06, rad = m * 0.17;
      const blob = (r, ox = 0, oy = 0) => {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * 6.283;
          const r2 = r * (1 + 0.08 * Math.sin(a * 3 + 0.7) + 0.05 * Math.sin(a * 7 + 2));
          const x = cx + ox + Math.cos(a) * r2 * 1.25, y = cy + oy + Math.sin(a) * r2 * 0.8;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
      };
      ctx.fillStyle = 'rgba(6,4,3,0.5)';
      blob(rad * 1.05, rad * 0.12, rad * 0.1);
      ctx.fill();
      const g = ctx.createRadialGradient(cx - rad * 0.5, cy - rad * 0.55, rad * 0.05, cx, cy, rad * 1.3);
      g.addColorStop(0, '#8a8278');
      g.addColorStop(0.55, '#5b554d');
      g.addColorStop(1, '#2a2622');
      ctx.fillStyle = g;
      blob(rad);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,16,14,0.5)';
      ctx.lineWidth = 1.4 * k;
      for (let i = 0; i < 3; i++) {
        let x = cx + rr(-0.8, 0.8) * rad, y = cy - rad * rr(0.2, 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) ctx.lineTo((x += rr(-8, 8) * k), (y += rr(4, 9) * k));
        ctx.stroke();
      }
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = pick(['rgba(190,196,150,0.5)', 'rgba(170,176,120,0.45)', 'rgba(200,190,120,0.4)']);
        ctx.beginPath();
        ctx.arc(cx + rr(-1, 1) * rad, cy - rad * rr(0.1, 0.7), rr(2, 6) * k, 0, 6.283);
        ctx.fill();
      }
      for (let i = 0; i < 6; i++) moss(cx + rad * rr(0.3, 1.2), cy - rad * rr(0.1, 0.6), rr(14, 26) * k, 140);
      for (let i = 0; i < 4; i++) moss(cx + rr(-1.2, 1.2) * rad, cy - rad * 0.78, rr(10, 20) * k, 90);
    }
    ctx.restore();
    outer.save();
    outer.filter = `blur(${(0.8 * k).toFixed(2)}px)`;
    outer.drawImage(layer, 0, 0);
    outer.restore();
    // a few bigger fallen twigs along the bottom, beside the stone
    twig(w * 0.42, h * 0.95, -0.25, 170 * k, 4.5 * k, 1);
    twig(w * 0.12, h * 0.9, 0.35, 130 * k, 3.8 * k, 1);
    twig(w * 0.55, h * 0.985, -0.08, 120 * k, 3.4 * k, 1);
  }

  // grit: per-pixel grain plus sand specks
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 22;
    let r = d[i] + n, g = d[i + 1] + n * 0.9, b = d[i + 2] + n * 0.8;
    const sp = R();
    if (sp < 0.006) {
      r += 70;
      g += 58;
      b += 44;
    } else if (sp < 0.012) {
      r *= 0.5;
      g *= 0.5;
      b *= 0.5;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);

  // vignette
  const S = Math.max(w, h);
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, S * 0.3, w * 0.5, h * 0.5, S * 0.75);
  vg.addColorStop(0, 'rgba(8,4,2,0)');
  vg.addColorStop(1, 'rgba(8,4,2,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// The lit colour of the forest floor at a screen position. Shared by the background and by leaves sinking
// into the soil, so a leaf that has fully become soil is the exact colour of the ground beneath it.
export const GROUND_GLSL = /* glsl */ `
  uniform sampler2D uSoil;
  uniform sampler2D uGroove;
  uniform sampler2D uWet;
  vec3 groundAt(vec2 uv, float light){
    vec3 c = texture2D(uSoil, uv).rgb;
    vec3 shade = vec3(0.84, 0.8, 0.83);   // cool skylight in the shade
    vec3 sun = vec3(1.3, 1.04, 0.74);     // warm low sun
    // keep the ground a step darker and greyer than the leaves so the words stand out
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    c = mix(vec3(lum), c, 0.62) * 0.88;
    c *= mix(shade, sun, light);
    c += vec3(0.05, 0.025, 0.01) * light;
    // lines drawn in the soil: a carved groove, shadowed on the sun side, lit on the far wall
    vec2 px = 1.0 / vec2(textureSize(uGroove, 0));
    float g = texture2D(uGroove, uv).a;
    float gl = texture2D(uGroove, uv + vec2(-1.2, 1.2) * px).a;
    float gr = texture2D(uGroove, uv + vec2(1.2, -1.2) * px).a;
    c *= 1.0 - 0.42 * g;
    c *= 1.0 - 0.45 * max(0.0, g - gl);
    c += vec3(0.32, 0.22, 0.13) * max(0.0, g - gr) * (0.4 + 0.6 * light);
    // damp, darker soil where leaves sank in
    float wet = texture2D(uWet, uv).a;
    c *= 1.0 - 0.42 * wet;
    c = mix(c, c * vec3(0.86, 0.9, 1.0), wet * 0.35);
    c += vec3(0.05, 0.045, 0.04) * wet * light * smoothstep(0.4, 0.9, wet);
    return c;
  }
`;

export function makeBackgroundMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSoil: shared.uSoil, uTime: shared.uTime, uRes: shared.uRes, uSpot: shared.uSpot, uBeam: shared.uBeam,
      uGroove: shared.uGroove, uWet: shared.uWet, uGlow: shared.uGlow,
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${DAPPLE_GLSL}
      ${GROUND_GLSL}
      uniform vec4 uGlow;
      void main(){
        vec3 c = groundAt(vUv, dapple(gl_FragCoord.xy));
        // a very faint warm glow on the ground where a long press is withering a character
        float gd = smoothstep(uGlow.z, 0.0, length(gl_FragCoord.xy - uGlow.xy));
        c += vec3(1.0, 0.62, 0.3) * uGlow.w * gd * gd;
        c += (dh(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * 2.0;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}

// Warm glow in the air of the sunlit patches (additive, over the leaves).
export function makeHazeMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uRes: shared.uRes, uSpot: shared.uSpot, uBeam: shared.uBeam, uGlow: shared.uGlow },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec4 uGlow;
      varying vec2 vUv;
      ${DAPPLE_GLSL}
      void main(){
        float l = dapple(gl_FragCoord.xy);
        float wash = smoothstep(1.2, 0.0, length(vUv - vec2(0.05, 1.0)));
        vec3 c = vec3(1.0, 0.62, 0.3) * (l * 0.035 + wash * 0.07);
        // faint warm glow where a long press is withering a character
        float gd = smoothstep(uGlow.z, 0.0, length(gl_FragCoord.xy - uGlow.xy));
        c += vec3(1.0, 0.66, 0.32) * uGlow.w * gd * gd * 0.0; // the press glow is drawn on the ground only
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// Dust motes floating in the sunlight.
export function makeDust(count) {
  const geo = new THREE.BufferGeometry();
  const base = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base[i * 3] = Math.random();
    base[i * 3 + 1] = Math.random();
    seed[i * 4] = Math.random();
    seed[i * 4 + 1] = Math.random();
    seed[i * 4 + 2] = 0.7 + Math.random() * 1.8;
    seed[i * 4 + 3] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uRes: shared.uRes, uSpot: shared.uSpot, uBeam: shared.uBeam, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uPx;
      varying float vA;
      ${DAPPLE_GLSL}
      void main(){
        float t = uTime;
        vec2 p = position.xy;
        p += vec2(0.004 + aSeed.x * 0.006, 0.0025 - aSeed.y * 0.005) * t;
        p += vec2(sin(t * (0.2 + aSeed.y * 0.3) + aSeed.w * 6.28), cos(t * (0.17 + aSeed.x * 0.25) + aSeed.w * 4.0)) * 0.012;
        p = fract(p);
        float l = dapple(p * uRes);
        vA = (0.05 + l * 0.9) * (0.5 + 0.5 * sin(t * (0.6 + aSeed.x) + aSeed.w * 9.0));
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        gl_PointSize = aSeed.z * uPx * (1.0 + l);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * smoothstep(0.5, 0.0, d) * vA, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}

// Final colour grade over the whole picture, as on the store cover: a warmer, slightly brighter image, a soft warm glow
// in the middle where the words sit and darker edges. Two full-screen passes drawn last:
//   1) multiply: out = 2 * src * dst, so src 0.5 leaves a pixel as it is and up to 1.0 brightens it (x2 at most)
//   2) add: the warm glow, already darkened by the same vignette
export function makeGradeMesh() {
  const geo = new THREE.PlaneGeometry(2, 2);
  const common = /* glsl */ `
    uniform vec2 uRes;
    // 0 at the centre of the light, 1 at its edge (the centre sits a little above the middle, like the words)
    float gradeDist(vec2 frag) {
      vec2 c = vec2(0.48, 0.53) * uRes;
      vec2 s = vec2(0.55, 0.5) * uRes;
      return length((frag - c) / s);
    }
    float vignette(float d) { return clamp(1.0 - 0.48 * pow(clamp(d - 0.55, 0.0, 1.0), 1.3), 0.0, 1.0); }
  `;
  const vert = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const mul = new THREE.ShaderMaterial({
    uniforms: { uRes: shared.uRes },
    vertexShader: vert,
    fragmentShader: common + /* glsl */ `
      void main(){
        float v = vignette(gradeDist(gl_FragCoord.xy));
        vec3 gain = vec3(1.06, 1.0, 0.92) * 1.2 * v;
        gl_FragColor = vec4(gain * 0.5, 1.0);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
  });
  const add = new THREE.ShaderMaterial({
    uniforms: { uRes: shared.uRes },
    vertexShader: vert,
    fragmentShader: common + /* glsl */ `
      void main(){
        float d = gradeDist(gl_FragCoord.xy);
        float g = clamp(1.0 - d, 0.0, 1.0);
        gl_FragColor = vec4((vec3(0.10, 0.06, 0.02) * g * g + vec3(0.012, 0.008, 0.005)) * vignette(d), 1.0); // glow, plus a small lift so the shade never goes murky on phone screens
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const group = new THREE.Group();
  const a = new THREE.Mesh(geo, mul), b = new THREE.Mesh(geo, add);
  a.renderOrder = 100;
  b.renderOrder = 101;
  a.frustumCulled = b.frustumCulled = false;
  group.add(a, b);
  return group;
}
