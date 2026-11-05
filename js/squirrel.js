// A red squirrel that bounds across the forest floor, sits to look around, and collects acorns you drop.
import * as THREE from '../vendor/three.module.js';
import { makeSpriteMesh } from './bugs.js';

const CELL = 512;    // drawn in a 256-unit design space at 2x
const NCELL = 6;     // 0..2 bounding gait, 3 sitting, 4 sitting with acorn, 5 acorn
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const lerp = (a, b, t) => a + (b - a) * t;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- drawing (head points up, x centre 128)
// The animal is drawn naturalistically: one continuous silhouette, soft volume shading, fine low-contrast fur.

const CX = 128;
// one pine-cone size everywhere: about a fifth of the sprite length
const CONE_H = 0.2;                         // cone length as a fraction of the squirrel sprite
const CONE_LEN = CONE_H * 256;              // in design units, for cones drawn inside squirrel frames
const CONE_FRAME = 0.86;                    // the standalone cone fills 86% of its own cell
const CONE_SPRITE = CONE_H / CONE_FRAME;    // sprite size (x L) for the standalone cone frame

function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

// half-width profile along the spine (v: 0 nose tip -> 1 rump), in design units before scaling
const PROFILE = [[0, 1.4], [0.035, 5.2], [0.08, 10], [0.14, 14], [0.19, 14.4], [0.24, 12.6], [0.3, 14.6], [0.42, 18], [0.62, 21.5], [0.76, 22.5], [0.86, 20.5], [0.94, 14], [0.985, 6], [1, 0]];
function profile(v) {
  for (let i = 1; i < PROFILE.length; i++) {
    if (v <= PROFILE[i][0]) {
      const [v0, w0] = PROFILE[i - 1], [v1, w1] = PROFILE[i];
      const t = (v - v0) / (v1 - v0);
      return w0 + (w1 - w0) * (0.5 - 0.5 * Math.cos(t * Math.PI));
    }
  }
  return 0;
}

// spine: nose at (CX, nose), rump at (CX + bend, rump); slight lateral bend for life
function makeBody(nose, rump, wScale, bend = 0) {
  const len = rump - nose;
  const at = (v) => [CX + Math.sin(v * Math.PI) * bend, nose + v * len];
  const N = 60;
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    const [x, y] = at(v);
    const w = profile(v) * wScale * (len / 112);
    left.push([x - w, y]);
    right.push([x + w, y]);
  }
  return { at, left, right, len, w: (v) => profile(v) * wScale * (len / 112) };
}

function bodyOutline(ctx, B) {
  const pts = B.right.concat(B.left.slice().reverse());
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

function drawBody(ctx, B, R) {
  const top = B.at(0)[1], bot = B.at(1)[1];
  // base coat: lit from the upper left, darker on the far flank
  const g = ctx.createLinearGradient(CX - 22, top, CX + 22, bot);
  g.addColorStop(0, '#c4713e');
  g.addColorStop(0.45, '#a6582e');
  g.addColorStop(1, '#66341a');
  bodyOutline(ctx, B);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  bodyOutline(ctx, B);
  ctx.clip();
  // winter coat: a faint grey-brown saddle along the back
  const sg = ctx.createLinearGradient(CX - 14, 0, CX + 14, 0);
  sg.addColorStop(0, 'rgba(96,74,60,0)');
  sg.addColorStop(0.5, 'rgba(96,74,60,0.28)');
  sg.addColorStop(1, 'rgba(96,74,60,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(CX - 14, top + B.len * 0.3, 28, B.len * 0.62);
  // fine fur: short low-contrast strokes flowing back from the nose
  ctx.lineCap = 'round';
  const cols = ['#a85a32', '#8e4a28', '#b86c3e', '#7a4024', '#c27a48', '#6e3a22'];
  for (let i = 0; i < 1400; i++) {
    const v = R(), u = R() * 2 - 1;
    const [sx, sy] = B.at(v);
    const w = B.w(v);
    const x = sx + u * w, y = sy;
    const a = Math.PI / 2 + u * (v < 0.22 ? 0.9 : 0.5) + (R() - 0.5) * 0.3;
    const l = (v < 0.22 ? 1.6 : 2.8) + R() * 2;
    ctx.strokeStyle = cols[(R() * cols.length) | 0];
    ctx.globalAlpha = 0.28 + R() * 0.25;
    ctx.lineWidth = 0.5 + R() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // soft sheen on the lit side of the back
  const hl = ctx.createRadialGradient(CX - 8, top + B.len * 0.55, 0, CX - 8, top + B.len * 0.55, B.len * 0.4);
  hl.addColorStop(0, 'rgba(255,214,170,0.16)');
  hl.addColorStop(1, 'rgba(255,214,170,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(CX - 40, top, 80, B.len);
  // rounded volume: inner shadow along the silhouette
  // (the stroke itself is drawn far off to the side; only its blurred shadow lands inside the clip)
  ctx.shadowColor = 'rgba(30,12,4,0.75)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = -2000 + 1.5;
  ctx.shadowOffsetY = 1.5;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 7;
  ctx.translate(2000, 0);
  bodyOutline(ctx, B);
  ctx.stroke();
  ctx.restore();
  // soft fur fringe breaking up the outline
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const v = 0.06 + R() * 0.9;
    const side = R() < 0.5 ? -1 : 1;
    const [sx, sy] = B.at(v);
    const w = B.w(v);
    const x = sx + side * (w - 0.6), y = sy;
    const l = 1.2 + R() * 1.8;
    ctx.strokeStyle = side < 0 ? 'rgba(196,120,72,0.5)' : 'rgba(110,58,32,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * (0.5 + R() * 0.4) * l, y + (0.6 + R() * 0.6) * l); // hairs point outward and back
    ctx.stroke();
  }
}

function drawFace(ctx, B, R) {
  // ears: small pointed ears with dark tufts, laid back
  const ev = 0.21;
  const [ex0, ey] = B.at(ev);
  const ew = B.w(ev);
  for (const sd of [-1, 1]) {
    const x = ex0 + sd * (ew * 0.62), y = ey;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sd * 0.55);
    ctx.fillStyle = '#7a4226';
    ctx.beginPath();
    ctx.moveTo(-2.6, -1);
    ctx.quadraticCurveTo(0, -2.5, 2.6, -1);
    ctx.lineTo(0.4, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(46,24,12,0.8)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      ctx.lineWidth = 0.45 + R() * 0.3;
      ctx.beginPath();
      ctx.moveTo(0.3, 5.5);
      ctx.quadraticCurveTo((R() - 0.5) * 2, 8 + R() * 2, (R() - 0.5) * 3, 9 + R() * 4);
      ctx.stroke();
    }
    ctx.restore();
  }
  // eyes: small, dark and glossy, set on the sides of the head (barely visible from above)
  const vv = 0.13;
  const [cx, cy] = B.at(vv);
  const w = B.w(vv);
  for (const sd of [-1, 1]) {
    const x = cx + sd * (w - 1.1), y = cy;
    ellipse(ctx, x, y, 2.6, 3.4, 'rgba(70,40,24,0.35)', sd * 0.45); // slightly paler fur around the eye
    ellipse(ctx, x + sd * 0.3, y, 1.25, 2.2, '#0d0604', sd * 0.45);
    ellipse(ctx, x + sd * 0.1, y - 0.8, 0.35, 0.5, 'rgba(255,255,255,0.7)');
  }
  // nose and faint whiskers
  const [nx, ny] = B.at(0.012);
  ellipse(ctx, nx, ny + 0.6, 1.4, 1.1, '#2a1610');
  ctx.strokeStyle = 'rgba(220,205,185,0.22)';
  ctx.lineWidth = 0.35;
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + sd * (1.0 + i * 0.25);
      const l = 8 + R() * 6;
      ctx.beginPath();
      ctx.moveTo(nx + sd * 2.5, ny + 4);
      ctx.lineTo(nx + sd * 2.5 + Math.cos(a) * l, ny + 4 + Math.sin(a) * l * 0.5 + 2);
      ctx.stroke();
    }
  }
}

function foot(ctx, x, y, ang, len, wid) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(-wid, 0, wid, 0);
  g.addColorStop(0, '#6e3c22');
  g.addColorStop(1, '#3e2012');
  ellipse(ctx, 0, 0, wid, len, g);
  ctx.strokeStyle = 'rgba(30,14,6,0.8)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i - 1.5) * wid * 0.45, -len * 0.7);
    ctx.lineTo((i - 1.5) * wid * 0.6, -len - 1.6); // slender toes with claws
    ctx.stroke();
  }
  ctx.restore();
}

// tail plume: many fine translucent hairs, rufous with a darker core
function drawTail(ctx, spine, widthAt) {
  const R = seeded(1234);
  const N = 70;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * (spine.length - 1);
    const k = Math.min(spine.length - 2, Math.floor(t));
    const f = t - k;
    pts.push([lerp(spine[k][0], spine[k + 1][0], f), lerp(spine[k][1], spine[k + 1][1], f)]);
  }
  for (let i = 0; i <= N; i++) {
    const w = widthAt(i / N);
    const g = ctx.createRadialGradient(pts[i][0], pts[i][1], 0, pts[i][0], pts[i][1], w * 0.8);
    g.addColorStop(0, 'rgba(116,56,28,0.9)');
    g.addColorStop(0.6, 'rgba(126,62,30,0.5)');
    g.addColorStop(1, 'rgba(126,62,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], w * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      const q = pts[Math.min(N, i + 1)], o = pts[Math.max(0, i - 1)];
      const ta = Math.atan2(q[1] - o[1], q[0] - o[0]);
      const w = widthAt(i / N);
      const n = pass === 2 ? 4 : 12;
      for (let k = 0; k < n; k++) {
        const sd = R() < 0.5 ? -1 : 1;
        const a = ta + sd * (0.3 + R() * 1.0);
        const len = w * (pass === 2 ? 1.0 + R() * 0.25 : 0.5 + R() * 0.5);
        const ex = p[0] + Math.cos(a) * len, ey = p[1] + Math.sin(a) * len;
        const cx = p[0] + Math.cos(a - sd * 0.3) * len * 0.55, cy = p[1] + Math.sin(a - sd * 0.3) * len * 0.55;
        ctx.lineWidth = pass === 2 ? 0.4 : 0.55 + R() * 0.35;
        ctx.strokeStyle = pass === 0 ? (R() < 0.5 ? '#5e2a14' : '#70361a') : pass === 1 ? (R() < 0.5 ? '#9a4c26' : '#ae5e30') : 'rgba(196,122,74,0.45)';
        ctx.globalAlpha = pass === 2 ? 0.5 : 0.7;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawAcorn(ctx, x, y, s = 1) {
  ctx.save();
  ctx.shadowColor = 'rgba(8,4,2,0.55)';
  ctx.shadowBlur = 4 * s;
  ctx.shadowOffsetX = 2 * s;
  ctx.shadowOffsetY = 2.5 * s;
  const g = ctx.createRadialGradient(x - 4 * s, y + 1 * s, 0, x, y + 4 * s, 13 * s);
  g.addColorStop(0, '#c08a50');
  g.addColorStop(0.55, '#8a5626');
  g.addColorStop(1, '#4e2e10');
  ellipse(ctx, x, y + 4 * s, 8.5 * s, 11.5 * s, g);
  ctx.restore();
  ellipse(ctx, x - 3 * s, y + 3 * s, 1.6 * s, 4.5 * s, 'rgba(255,235,200,0.22)', -0.2);
  const cg = ctx.createRadialGradient(x - 3 * s, y - 7 * s, 0, x, y - 5 * s, 11 * s);
  cg.addColorStop(0, '#8a7050');
  cg.addColorStop(1, '#3a2a18');
  ellipse(ctx, x, y - 5 * s, 10 * s, 6.5 * s, cg);
  const R = seeded(9);
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R());
    ellipse(ctx, x + Math.cos(a) * r * 9 * s, y - 5 * s + Math.sin(a) * r * 5.6 * s, 0.9 * s, 0.6 * s, R() < 0.5 ? 'rgba(30,20,10,0.5)' : 'rgba(170,140,100,0.35)');
  }
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(x, y - 10 * s);
  ctx.lineTo(x + 1.5 * s, y - 14 * s);
  ctx.stroke();
}

// pine cone seen from above: woody scales spiralling round the cone (phyllotaxis); only the upper half
// shows, drawn back to front, lit from the upper left, with a soft contact shadow
function drawPineCone(ctx, x, y, len, ang = 0) {
  const R = seeded(4242);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.save();
  ctx.shadowColor = 'rgba(6,3,1,0.6)';
  ctx.shadowBlur = len * 0.12;
  ctx.shadowOffsetX = len * 0.06;
  ctx.shadowOffsetY = len * 0.07;
  ctx.fillStyle = '#2a1a0c';
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.26, len * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const half = (t) => Math.pow(Math.sin(Math.min(1, t * 0.92 + 0.06) * Math.PI), 0.75) * len * 0.28;
  const scales = [];
  const N = 130;
  for (let i = 0; i < N; i++) {
    const phi = i * 2.39996;
    const depth = Math.sin(phi);
    if (depth > -0.15) scales.push({ t: i / N, phi, depth });
  }
  scales.sort((a, b) => a.depth - b.depth);
  const shade = (c, f) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;
  for (const sc of scales) {
    const yy = -len * 0.46 + sc.t * len * 0.92;
    const hw = half(sc.t);
    const xx = Math.cos(sc.phi) * hw;
    const face = 0.35 + 0.65 * sc.depth;
    const sw = len * 0.07 * (0.6 + (hw / (len * 0.28)) * 0.5);
    const sh = len * 0.065 * (0.55 + face * 0.6);
    const tone = 0.78 + R() * 0.3;
    const lit = Math.max(0, Math.min(1, 0.55 - Math.cos(sc.phi) * 0.35 + sc.depth * 0.25));
    ctx.save();
    ctx.translate(xx, yy);
    ctx.rotate(-Math.cos(sc.phi) * 0.5);
    ctx.fillStyle = 'rgba(14,8,3,0.55)';
    ctx.beginPath();
    ctx.ellipse(sw * 0.15, sh * 0.35, sw * 1.05, sh * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -sh, 0, sh);
    g.addColorStop(0, shade([88, 56, 30], tone * (0.6 + lit * 0.5)));
    g.addColorStop(0.6, shade([122, 84, 46], tone * (0.6 + lit * 0.6)));
    g.addColorStop(1, shade([154, 116, 74], tone * (0.55 + lit * 0.7)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-sw, -sh * 0.5);
    ctx.quadraticCurveTo(-sw * 1.05, sh * 0.6, 0, sh);
    ctx.quadraticCurveTo(sw * 1.05, sh * 0.6, sw, -sh * 0.5);
    ctx.quadraticCurveTo(0, -sh * 0.9, -sw, -sh * 0.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,24,10,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, sh * 0.45, sw * 0.18, sh * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = '#3a2614';
  ctx.lineWidth = len * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, len * 0.45);
  ctx.lineTo(len * 0.015, len * 0.53);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- poses

const POSES = [
  // stretched leap: forepaws reaching beside the chin, hind feet trailing, tail streaming straight back
  { nose: 22, rump: 150, ws: 0.95, bend: 2, fore: [[-9, 40, 0.1], [9, 44, -0.1]], hind: [[-13, 162, Math.PI - 0.15], [13, 165, Math.PI + 0.15]], tail: [[0, 146], [3, 178], [8, 210], [5, 238], [0, 252]], tw: 30 },
  // gathered: body bunched, hind feet planted ahead beside the shoulders, tail arched
  { nose: 40, rump: 144, ws: 1.08, bend: -3, fore: [[-7, 70, 0.05], [7, 72, -0.05]], hind: [[-24, 82, -0.3], [24, 84, 0.3]], tail: [[0, 140], [-6, 168], [-14, 196], [-10, 222], [-3, 238]], tw: 32 },
  // in between
  { nose: 31, rump: 147, ws: 1.0, bend: 0, fore: [[-8, 56, 0.05], [8, 58, -0.05]], hind: [[-19, 124, -0.1], [19, 126, 0.1]], tail: [[0, 143], [-1, 174], [-2, 204], [1, 230], [4, 246]], tw: 31 },
];

function drawRun(ctx, f) {
  const P = POSES[f];
  const R = seeded(77);
  const B = makeBody(P.nose, P.rump, P.ws, P.bend);
  for (const [x, y, a] of P.hind) foot(ctx, CX + x, y, a, 9.5, 3.6);
  drawTail(ctx, P.tail.map(([x, y]) => [CX + x, y]), (t) => P.tw * (0.45 + 0.7 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.82)));
  for (const [x, y, a] of P.fore) foot(ctx, CX + x, y, a, 4.5, 2.6);
  drawBody(ctx, B, R);
  drawFace(ctx, B, R);
}

function drawSit(ctx, holding) {
  const R = seeded(77);
  // sitting up: seen from above the body is short and round; the tail lies on the ground behind it,
  // sweeping to one side with the tip curling back
  const B = makeBody(holding ? 54 : 48, 146, 1.3, 0);
  drawTail(ctx, [[CX, 140], [CX + 6, 168], [CX + 20, 194], [CX + 30, 220], [CX + 24, 242], [CX + 10, 248]], (t) => 27 * (0.55 + 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.85)));
  for (const sd of [-1, 1]) foot(ctx, CX + sd * 24, 128, sd * -0.3, 10, 3.8);
  // the acorn is held up to the mouth: drawn first so the head overlaps it
  // held out in front in the forepaws: most of the cone shows, only its base is tucked under the chin
  if (holding) drawPineCone(ctx, CX, 58 - CONE_LEN * 0.5, CONE_LEN, Math.PI);
  drawBody(ctx, B, R);
  drawFace(ctx, B, R);
  if (holding) for (const sd of [-1, 1]) foot(ctx, CX + sd * 10, 58 - CONE_LEN * 0.32, sd * 1.1, 4.4, 2.6); // forepaws clasping its sides
  else for (const sd of [-1, 1]) foot(ctx, CX + sd * 6, 66, sd * 0.1, 3.6, 2.4);
}

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL * NCELL;
  cv.height = CELL;
  const ctx = cv.getContext('2d');
  const cell = (i, fn) => {
    ctx.save();
    ctx.translate(i * CELL, 0);
    ctx.scale(CELL / 256, CELL / 256);
    fn();
    ctx.restore();
  };
  for (let f = 0; f < 3; f++) cell(f, () => drawRun(ctx, f));
  cell(3, () => drawSit(ctx, false));
  cell(4, () => drawSit(ctx, true));
  cell(5, () => drawPineCone(ctx, 128, 128, 256 * CONE_FRAME));
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------- behaviour

export function createSquirrel(scene) {
  const sprite = makeSpriteMesh(scene, buildAtlas(), NCELL, 8, 1.6);
  const acorns = [];
  let sq = null;
  let nextVisit = rand(6, 12);
  let nextFetch = 0;
  let W = 800, H = 600, L = 120;

  const edgePoint = (near) => {
    const m = L;
    let side = (Math.random() * 4) | 0;
    if (near) {
      const dl = near[0] + W / 2, dr = W / 2 - near[0], db = near[1] + H / 2, dt = H / 2 - near[1];
      const mn = Math.min(dl, dr, db, dt);
      side = mn === dl ? 0 : mn === dr ? 1 : mn === db ? 3 : 2;
    }
    if (side === 0) return [-W / 2 - m, rand(-0.4, 0.4) * H];
    if (side === 1) return [W / 2 + m, rand(-0.4, 0.4) * H];
    if (side === 2) return [rand(-0.4, 0.4) * W, H / 2 + m];
    return [rand(-0.4, 0.4) * W, -H / 2 - m];
  };

  function spawn(stops) {
    const [x, y] = edgePoint();
    const exit = edgePoint([-x, -y]);
    sq = {
      x, y, z: 0, heading: 0, speed: 0, phase: 0, state: 'run', sitT: 0, holding: 0,
      targets: stops.concat([{ x: exit[0], y: exit[1], exit: true }]),
      looks: 0, startled: false, lastStamp: 0,
    };
    const t = sq.targets[0];
    sq.heading = Math.atan2(-(t.x - x), t.y - y);
  }

  function addAcorn(x, y) {
    if (acorns.length >= 4) return false;
    nextFetch = 0;
    acorns.push({ x, y, heading: rand(0, Math.PI * 2), size: L * CONE_SPRITE, frame: 5, z: 140, drop: 0 });
    if (!sq) spawn([]);
    if (sq && sq.startled) nextFetch = 0;
    // a squirrel can only carry one cone: if it's empty-handed and not already fetching, it goes for this one;
    // otherwise it will come back for it after taking the current one away
    if (sq && !sq.startled && !sq.holding && !sq.targets.some((t) => t.acorn)) {
      const exit = sq.targets.find((t) => t.exit);
      const c = acorns[acorns.length - 1];
      sq.targets = [{ x: c.x, y: c.y, acorn: c }].concat(exit ? [exit] : []);
      if (sq.state === 'sit') sq.sitT = Math.min(sq.sitT, 0.3);
    }
    return true;
  }

  function startle(fromX, fromY) {
    if (!sq || sq.startled) return;
    sq.startled = true;
    sq.state = 'run';
    sq.holding = sq.holding ? 1 : 0;
    const away = [sq.x + (sq.x - fromX) * 10, sq.y + (sq.y - fromY) * 10];
    const ex = edgePoint(away);
    sq.targets = [{ x: ex[0], y: ex[1], exit: true }];
  }

  function update(dt, now, env) {
    W = env.W;
    H = env.H;
    L = clamp(Math.min(W, H) * 0.2, 96, 170);
    for (const a of acorns) {
      a.size = L * CONE_SPRITE;
      if (a.z > 0) {
        a.drop += dt;
        a.z = Math.max(0, 140 - 500 * a.drop * a.drop);
      }
    }
    if (!sq && acorns.length && now > (nextFetch ?? 0)) {
      // there is food on the ground: a squirrel always comes for it
      spawn([]);
      sq.targets = [{ x: acorns[0].x, y: acorns[0].y, acorn: acorns[0] }].concat(sq.targets); // one cone per trip
    }
    if (!sq && now > nextVisit) {
      const stops = [];
      const n = Math.random() < 0.6 ? 1 : 2;
      for (let i = 0; i < n; i++) stops.push({ x: rand(-0.35, 0.35) * W, y: rand(-0.35, 0.35) * H, sit: rand(1.4, 3) });
      spawn(stops);
    }
    const out = [];
    if (sq) {
      const s = sq;
      if (env.whirl.on && Math.hypot(s.x - env.whirl.x, s.y - env.whirl.y) < 220) startle(env.whirl.x, env.whirl.y);
      // a moving pointer coming close sends it running
      const forFood = s.targets[0] && s.targets[0].acorn;
      const scare = forFood ? L * 0.45 : L * 0.95; // bolder when it is going for a pine cone
      if (env.ptr.has && now - env.ptr.lastMoveT < 0.25 && Math.hypot(s.x - env.ptr.x, s.y - env.ptr.y) < scare) startle(env.ptr.x, env.ptr.y);
      if (s.state === 'sit') {
        s.sitT -= dt;
        s.heading += Math.sin(now * 3.1 + s.looks) * 0.8 * dt + (Math.random() < dt * 1.2 ? rand(-0.5, 0.5) : 0);
        s.speed = 0;
        s.z = 0;
        if (s.sitT <= 0) s.state = 'run';
      } else {
        const t = s.targets[0];
        if (!t) sq = null;
        else {
          const dx = t.x - s.x, dy = t.y - s.y;
          // for a pine cone it stops with its nose at the cone, not standing on top of it
          const d = Math.max(0, Math.hypot(dx, dy) - (t.acorn ? L * 0.42 : 0));
          const desired = Math.atan2(-dx, dy);
          s.heading += clamp(angDiff(desired, s.heading), -7 * dt, 7 * dt);
          s.phase += dt * (s.startled ? 4.4 : 3.4);
          const leap = Math.max(0, Math.sin(s.phase * Math.PI * 2));
          const base = (s.startled ? 400 : 270) * (L / 120);
          const slow = t.exit ? 1 : clamp(d / 90, 0.35, 1);
          s.speed = base * (0.4 + 0.95 * leap) * slow;
          s.z = 16 * leap;
          const step = Math.min(d, s.speed * dt);
          s.x += -Math.sin(s.heading) * step;
          s.y += Math.cos(s.heading) * step;
          // each landing leaves paw prints in the soil and jostles the leaves
          if (leap < 0.05 && now - s.lastStamp > 0.18) {
            s.lastStamp = now;
            env.stamp?.(s.x, s.y, s.heading, L);
            env.nudge(s.x, s.y, L * 0.3);
          }
          if (d < 8 || (t.exit && (Math.abs(s.x) > W / 2 + L * 0.8 || Math.abs(s.y) > H / 2 + L * 0.8))) {
            s.targets.shift();
            if (t.exit) {
              sq = null;
              nextVisit = now + rand(18, 35);
              nextFetch = now + rand(0.8, 1.6); // soon returns for any cones still on the ground
            } else if (t.acorn) {
              const i = acorns.indexOf(t.acorn);
              if (i >= 0) acorns.splice(i, 1);
              s.holding = 1;
              s.state = 'sit';
              s.sitT = rand(1.2, 2);
              s.targets = s.targets.filter((tt) => tt.exit); // with its mouth full it heads off
            } else {
              s.state = 'sit';
              s.sitT = t.sit || 1.5;
              s.looks = rand(0, 6);
            }
          }
        }
      }
      if (sq) {
        const ph = ((s.phase % 1) + 1) % 1;
        const frame = s.state === 'sit' ? (s.holding ? 4 : 3) : [0, 2, 1, 2][Math.floor(ph * 4) % 4];
        if (s.holding && s.state !== 'sit') {
          // carried in the mouth: pushed before the squirrel so the snout covers part of it
          // gripped by its base, the cone sticks out in front of the snout
          const nose = ([0.4, 0.33, 0.37][frame] ?? 0.37) + CONE_H * 0.35;
          const hx = s.x - Math.sin(s.heading) * L * nose, hy = s.y + Math.cos(s.heading) * L * nose;
          out.push({ x: hx, y: hy, z: s.z, heading: s.heading, size: L * CONE_SPRITE, frame: 5 });
        }
        out.push({ x: s.x, y: s.y, z: s.z, heading: s.heading, size: L, frame });
      }
    }
    for (const a of acorns) out.push(a);
    sprite.draw(out);
  }

  function tap(x, y) {
    if (sq && Math.hypot(sq.x - x, sq.y - y) < L * 0.5) {
      startle(x, y);
      return true;
    }
    return false;
  }

  // the burying wind clears every cone off the ground; a squirrel on its way to one gives up and leaves
  function clearCones() {
    acorns.length = 0;
    if (sq && !sq.holding) {
      const ex = sq.targets.find((t) => t.exit);
      sq.targets = ex ? [ex] : [];
    }
  }

  return { update, tap, addAcorn, clearCones, get active() { return !!sq; }, get cones() { return acorns.length; }, get holding() { return sq ? sq.holding : 0; } };
}

export { buildAtlas as _buildSquirrelAtlas }; // visual check
