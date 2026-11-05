// Ladybugs and ants crawling over the forest floor and the leaf letters.
// Drawn procedurally into a small sprite atlas; rendered as one InstancedMesh (shadow + body per bug).
import * as THREE from '../vendor/three.module.js';
import { DAPPLE_GLSL, shared } from './background.js';

const CELL = 128;
const NCELL = 12; // 0,1 ladybug walk | 2,3 ladybug flying | 4,5 ant walk | 6..8 butterfly open/half/closed | 9,10 snail out | 11 snail hidden
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------------------------------------------------------------- sprite drawing (head points up)

function legLine(ctx, pts, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function drawLadybug(ctx, frame) {
  const cx = 64, cy = 66;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const flying = frame >= 2;
  // legs (tripod gait), short tips peeking out
  ctx.strokeStyle = '#120a08';
  const ph = frame % 2 ? 1 : -1;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = cy - 14 + i * 14;
      const sw = (i % 2 === 0 ? ph : -ph) * side * 6 * (flying ? 0 : 1);
      const ang = (-0.9 + i * 0.9) + sw * 0.05;
      const x0 = cx + side * 18, y0 = y;
      const x1 = x0 + side * Math.cos(ang) * 16, y1 = y0 + Math.sin(ang) * 16 + sw;
      legLine(ctx, [[x0, y0], [x1, y1], [x1 + side * 5, y1 + 4]], 3);
    }
  }
  // antennae
  legLine(ctx, [[cx - 5, cy - 34], [cx - 10, cy - 44], [cx - 13, cy - 47]], 2);
  legLine(ctx, [[cx + 5, cy - 34], [cx + 10, cy - 44], [cx + 13, cy - 47]], 2);
  // head
  ctx.fillStyle = '#100907';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 31, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy - 33, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 6, cy - 33, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (flying) {
    // membranous hind wings, slightly blurred by motion
    const spread = frame === 2 ? 0.55 : 0.85;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * 6, cy - 16);
      ctx.rotate(side * spread);
      const g = ctx.createLinearGradient(0, 0, 0, 56);
      g.addColorStop(0, 'rgba(230,225,215,0.75)');
      g.addColorStop(1, 'rgba(200,195,190,0.25)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(side * 6, 28, 13, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,60,50,0.4)';
      ctx.lineWidth = 1;
      legLine(ctx, [[0, 2], [side * 7, 30], [side * 6, 52]], 1);
      ctx.restore();
    }
    // abdomen
    ctx.fillStyle = '#1a0f0b';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 15, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // pronotum
  ctx.fillStyle = '#140b08';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 20, 21, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.ellipse(cx - 13, cy - 21, 5, 4, 0.3, 0, Math.PI * 2);
  ctx.ellipse(cx + 13, cy - 21, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // elytra (open when flying)
  const elytron = (side) => {
    ctx.save();
    if (flying) {
      ctx.translate(cx + side * 2, cy - 14);
      ctx.rotate(side * (frame === 2 ? 0.45 : 0.6));
      ctx.translate(-(cx + side * 2), -(cy - 14));
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.bezierCurveTo(cx + side * 34, cy - 18, cx + side * 36, cy + 26, cx, cy + 34);
    ctx.closePath();
    const g = ctx.createRadialGradient(cx + side * 10 - 6, cy - 6, 2, cx + side * 8, cy + 4, 36);
    g.addColorStop(0, '#ff6a45');
    g.addColorStop(0.45, '#d4281a');
    g.addColorStop(1, '#6e0c07');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = '#120a08';
    const spots = [[12, -2, 5.5], [20, 14, 5], [9, 20, 4.5]];
    for (const [sx, sy, r] of spots) {
      ctx.beginPath();
      ctx.arc(cx + side * sx, cy + sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,225,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + side * 12 - 3, cy - 8, 6, 3.5, -0.5 * side, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  elytron(-1);
  elytron(1);
  if (!flying) {
    ctx.fillStyle = '#120a08';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 5, 0, Math.PI * 2); // scutellum spot
    ctx.fill();
    ctx.strokeStyle = '#140b08';
    legLine(ctx, [[cx, cy - 14], [cx, cy + 33]], 1.6);
  }
  ctx.restore();
}

function drawAnt(ctx, frame) {
  const cx = 64;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a0f0a';
  const ph = frame % 2 ? 1 : -1;
  // legs: three pairs from the thorax, two segments each
  const base = [[-0.75, 46], [0, 54], [0.7, 60]];
  for (const side of [-1, 1]) {
    base.forEach(([a, y], i) => {
      const sw = (i % 2 === 0 ? ph : -ph) * side * 0.28;
      const ang = a + sw;
      const x0 = cx + side * 4, y0 = y;
      const x1 = x0 + side * Math.cos(ang) * 17, y1 = y0 + Math.sin(ang) * 17;
      const x2 = x1 + side * Math.cos(ang + side * 0) * 6 + side * 4, y2 = y1 + (i === 0 ? -12 : i === 1 ? 4 : 16);
      legLine(ctx, [[x0, y0], [x1, y1], [x2, y2]], 2.2);
    });
  }
  // elbowed antennae
  legLine(ctx, [[cx - 4, 26], [cx - 10, 16], [cx - 16, 10]], 1.8);
  legLine(ctx, [[cx + 4, 26], [cx + 10, 16], [cx + 16, 10]], 1.8);
  const seg = (y, rx, ry) => {
    const g = ctx.createRadialGradient(cx - rx * 0.35, y - ry * 0.4, 1, cx, y, Math.max(rx, ry) * 1.1);
    g.addColorStop(0, '#6a4630');
    g.addColorStop(0.4, '#2a1810');
    g.addColorStop(1, '#0e0806');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  seg(30, 9, 10);  // head
  seg(52, 6, 13);  // thorax
  seg(68, 3.5, 4); // petiole
  seg(88, 12, 18); // gaster
  ctx.restore();
}

// peacock butterfly seen from above; sx squeezes the wings as they rise (1 open .. ~0.1 closed)
function drawButterfly(ctx, sx, under) {
  const cx = 64, cy = 64;
  for (const sd of [-1, 1]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sd * sx, 1);
    // forewing
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.bezierCurveTo(18, -30, 46, -34, 54, -24);
    ctx.bezierCurveTo(58, -14, 48, 2, 36, 6);
    ctx.bezierCurveTo(22, 8, 8, 4, 2, 2);
    ctx.closePath();
    let g = ctx.createLinearGradient(0, 0, 56, -26);
    if (under) {
      g.addColorStop(0, '#2a1c14');
      g.addColorStop(1, '#4a382a');
    } else {
      g.addColorStop(0, '#6a1a0e');
      g.addColorStop(0.25, '#b8361c');
      g.addColorStop(0.8, '#c24a22');
      g.addColorStop(1, '#3a140a');
    }
    ctx.fillStyle = g;
    ctx.fill();
    if (!under) {
      // eyespot near the wing tip
      const ex = 40, ey = -20;
      ctx.fillStyle = '#e8d6a0';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 10, 7, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a7aa8';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6.5, 4.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0e0a';
      ctx.beginPath();
      ctx.ellipse(ex + 1, ey, 3.5, 2.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0e0a';
      ctx.beginPath();
      ctx.ellipse(28, -16, 4, 2.5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // hindwing
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.bezierCurveTo(20, 4, 42, 12, 40, 28);
    ctx.bezierCurveTo(36, 42, 18, 44, 8, 34);
    ctx.bezierCurveTo(4, 24, 2, 14, 2, 2);
    ctx.closePath();
    g = ctx.createLinearGradient(0, 0, 40, 40);
    if (under) {
      g.addColorStop(0, '#22160e');
      g.addColorStop(1, '#3e2e22');
    } else {
      g.addColorStop(0, '#6a1a0e');
      g.addColorStop(0.4, '#b23a1c');
      g.addColorStop(1, '#3a140a');
    }
    ctx.fillStyle = g;
    ctx.fill();
    if (!under) {
      ctx.fillStyle = '#1a0e0a';
      ctx.beginPath();
      ctx.ellipse(26, 26, 8, 6, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a6a9a';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(22 + i * 2.5, 24 + i * 1.5, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // dark veins and border
    ctx.strokeStyle = 'rgba(30,10,6,0.55)';
    ctx.lineWidth = 0.8;
    for (const [x1, y1] of [[50, -22], [44, -6], [32, 4], [36, 24], [22, 38]]) {
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }
  // fuzzy body and clubbed antennae
  ctx.fillStyle = '#20140e';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 3.2, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 15, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#20140e';
  ctx.lineWidth = 1;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + sd, cy - 17);
    ctx.quadraticCurveTo(cx + sd * 6, cy - 30, cx + sd * 10, cy - 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + sd * 10, cy - 38, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// garden snail from above: striped spiral shell; foot and eye stalks when out
function drawSnail(ctx, mode) {
  const cx = 64;
  if (mode < 2) {
    const ext = mode === 1 ? 6 : 0;
    const g = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
    g.addColorStop(0, '#7a6a58');
    g.addColorStop(0.5, '#b8a68c');
    g.addColorStop(1, '#7a6a58');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, 66 - ext * 0.5, 11, 44 + ext * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(80,66,50,0.5)';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.arc(cx + (Math.sin(i * 7.3) * 7), 30 + i * 3.2 - ext, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,250,240,0.35)'; // slimy sheen
    ctx.beginPath();
    ctx.ellipse(cx - 4, 50 - ext, 2.5, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a7a64';
    ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx + sd * 4, 26 - ext);
      ctx.lineTo(cx + sd * 10, 8 - ext);
      ctx.stroke();
      ctx.fillStyle = '#2a2018';
      ctx.beginPath();
      ctx.arc(cx + sd * 10, 8 - ext, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + sd * 3, 24 - ext);
      ctx.lineTo(cx + sd * 6, 18 - ext);
      ctx.stroke();
    }
  }
  // shell
  const sx = cx, sy = 70, R0 = 30;
  ctx.fillStyle = 'rgba(8,4,2,0.4)';
  ctx.beginPath();
  ctx.ellipse(sx + 3, sy + 4, R0, R0 * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  const sg = ctx.createRadialGradient(sx - 8, sy - 10, 2, sx, sy, R0);
  sg.addColorStop(0, '#e2c08a');
  sg.addColorStop(0.5, '#a87a44');
  sg.addColorStop(1, '#4e3418');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(sx, sy, R0, R0 * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  // spiral bands
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? 'rgba(240,214,170,0.5)' : 'rgba(60,34,14,0.75)';
    ctx.lineWidth = pass ? 1.2 : 3.2;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2 * 2.6;
      const r = R0 * 0.92 * Math.exp(-a * 0.16) - pass * 2.5;
      const x = sx + Math.cos(a + 2) * r, y = sy + Math.sin(a + 2) * r * 0.92;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,245,225,0.4)';
  ctx.beginPath();
  ctx.ellipse(sx - 10, sy - 12, 7, 4, -0.6, 0, Math.PI * 2);
  ctx.fill();
  if (mode === 2) {
    // just a sliver of body at the opening
    ctx.fillStyle = '#9a8a72';
    ctx.beginPath();
    ctx.ellipse(sx, sy - R0 * 0.85, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildBugAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL * NCELL;
  cv.height = CELL;
  const ctx = cv.getContext('2d');
  for (let f = 0; f < 4; f++) {
    ctx.save();
    ctx.translate(f * CELL, 0);
    drawLadybug(ctx, f);
    ctx.restore();
  }
  for (let f = 0; f < 2; f++) {
    ctx.save();
    ctx.translate((4 + f) * CELL, 0);
    drawAnt(ctx, f);
    ctx.restore();
  }
  [[1, false], [0.5, false], [0.14, true]].forEach(([sx, under], f) => {
    ctx.save();
    ctx.translate((6 + f) * CELL, 0);
    drawButterfly(ctx, sx, under);
    ctx.restore();
  });
  for (let f = 0; f < 3; f++) {
    ctx.save();
    ctx.translate((9 + f) * CELL, 0);
    drawSnail(ctx, f);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- simulation

const MAXB = 16;

// Sprite atlas renderer shared by the critters: one shadow instance + one body instance per sprite.
export function makeSpriteMesh(scene, tex, ncell, maxSprites, order) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(maxSprites * 2 * 4), 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aBug', attr);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uTime: shared.uTime, uRes: shared.uRes, uSpot: shared.uSpot, uBeam: shared.uBeam },
    vertexShader: /* glsl */ `
      attribute vec4 aBug; // frame, kind (0 shadow / 1 body), alpha, height
      varying vec2 vUv; varying float vKind; varying float vAlpha; varying float vH;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        if (aBug.y < 0.5) wp.xy += vec2(0.78, -0.62) * (1.5 + aBug.w * 0.32);
        vUv = vec2((aBug.x + uv.x) / ${ncell}.0, uv.y);
        vKind = aBug.y; vAlpha = aBug.z; vH = aBug.w;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      varying vec2 vUv; varying float vKind; varying float vAlpha; varying float vH;
      ${DAPPLE_GLSL}
      void main(){
        float light = dapple(gl_FragCoord.xy);
        if (vKind < 0.5) {
          float soft = clamp(vH / 200.0, 0.0, 1.0);
          float a = texture2D(uTex, vUv, 1.0 + soft * 2.5).a * mix(0.55, 0.15, soft) * mix(0.35, 1.0, light) * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(0.05, 0.02, 0.008, a);
          return;
        }
        vec4 t = texture2D(uTex, vUv);
        if (t.a < 0.05) discard;
        vec3 c = t.rgb * mix(vec3(0.6, 0.57, 0.6), vec3(1.35, 1.15, 0.9), light);
        gl_FragColor = vec4(c, t.a * vAlpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, maxSprites * 2);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.count = 0;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  // sprites: [{x, y, z, heading, size, frame, alpha}]
  function draw(sprites) {
    const n = Math.min(sprites.length, maxSprites);
    const a = attr.array;
    for (let i = 0; i < n; i++) {
      const b = sprites[i];
      const s = b.size * (1 + b.z * 0.004);
      q.setFromAxisAngle(zAxis, b.heading);
      pos.set(b.x, b.y, b.z);
      scl.set(s, s, s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i * 2, m);
      mesh.setMatrixAt(i * 2 + 1, m);
      for (let k = 0; k < 2; k++) {
        const j = (i * 2 + k) * 4;
        a[j] = b.frame;
        a[j + 1] = k;
        a[j + 2] = b.alpha ?? 1;
        a[j + 3] = b.z;
      }
    }
    mesh.count = n * 2;
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  }
  return { mesh, draw };
}

export function createBugs(scene) {
  const tex = buildBugAtlas();
  const sprite = makeSpriteMesh(scene, tex, NCELL, MAXB, 1.5);

  const bugs = [];
  let W = 800, H = 600, unit = 22;
  let nextLady = 1.5, nextAnts = 3, nextFly = 4;

  const inside = (x, y, m = 20) => Math.abs(x) < W / 2 - m && Math.abs(y) < H / 2 - m;
  const edgeStart = () => {
    const side = (Math.random() * 4) | 0;
    const m = 30;
    if (side === 0) return [-W / 2 - m, rand(-H / 2, H / 2) * 0.8];
    if (side === 1) return [W / 2 + m, rand(-H / 2, H / 2) * 0.8];
    if (side === 2) return [rand(-W / 2, W / 2) * 0.8, H / 2 + m];
    return [rand(-W / 2, W / 2) * 0.8, -H / 2 - m];
  };

  function spawnLady() {
    const [x, y] = edgeStart();
    bugs.push({
      kind: 'lady', x, y, z: 0, heading: Math.atan2(-x, y) + Math.PI, speed: 0,
      base: rand(14, 20), state: 'walk', target: null, t: 0, stride: 0, frame: 0, alpha: 1, flee: 0, wander: rand(0, 6),
      size: unit * rand(0.95, 1.1),
    });
  }

  function spawnButterfly() {
    const [x, y] = edgeStart();
    bugs.push({
      kind: 'fly', x, y, z: 120, heading: 0, speed: 0, state: 'air', t: 0, frame: 6, alpha: 1, flee: 0,
      wander: rand(0, 6), size: unit * 1.9, target: null, airT: rand(3, 6), flap: 0,
    });
  }

  function spawnSnail() {
    bugs.push({
      kind: 'snail', x: rand(-0.35, 0.35) * W, y: rand(-0.38, -0.15) * H, z: 0, heading: rand(0, 6.28), speed: 0,
      state: 'crawl', t: 0, frame: 9, alpha: 1, flee: 0, wander: rand(0, 6), size: unit * 1.7, hide: 0,
    });
  }

  function updateButterfly(b, dt, now, env) {
    const near = env.ptr.has && Math.hypot(b.x - env.ptr.x, b.y - env.ptr.y) < 110;
    const gust = env.whirl.on && Math.hypot(b.x - env.whirl.x, b.y - env.whirl.y) < 240;
    if (b.state === 'rest') {
      b.t += dt;
      // slow open-and-close while basking
      const c = 0.5 + 0.5 * Math.sin(now * 1.3 + b.wander);
      b.frame = c > 0.66 ? 6 : c > 0.25 ? 7 : 8;
      b.z = 0;
      if (near || gust || b.t > b.restT) {
        b.state = 'air';
        b.airT = rand(3, 7);
        b.t = 0;
        b.target = null;
        if (near) b.heading = Math.atan2(-(b.x - env.ptr.x), b.y - env.ptr.y);
      }
      return;
    }
    b.t += dt;
    b.flap += dt * (b.state === 'land' ? 9 : 16);
    b.frame = [6, 7, 8, 7][Math.floor(b.flap) % 4];
    if (!b.target || Math.hypot(b.target[0] - b.x, b.target[1] - b.y) < 20) {
      b.target = [rand(-0.45, 0.45) * W, rand(-0.45, 0.45) * H];
    }
    if (b.t > b.airT && b.state === 'air') {
      // choose somewhere to land, often on the words
      const p = Math.random() < 0.55 ? env.textPoint() : null;
      b.target = p ? [p.x, p.y] : [rand(-0.4, 0.4) * W, rand(-0.4, 0.4) * H];
      b.state = 'land';
    }
    let desired = Math.atan2(-(b.target[0] - b.x), b.target[1] - b.y) + Math.sin(now * 2.7 + b.wander) * 0.9;
    if (near) desired = Math.atan2(-(b.x - env.ptr.x), b.y - env.ptr.y);
    b.heading += clamp(angDiff(desired, b.heading), -4 * dt, 4 * dt);
    b.speed = near ? 170 : 90;
    b.x += -Math.sin(b.heading) * b.speed * dt;
    b.y += Math.cos(b.heading) * b.speed * dt;
    const d = Math.hypot(b.target[0] - b.x, b.target[1] - b.y);
    const zt = b.state === 'land' ? Math.min(140, d * 0.8) : 110 + 40 * Math.sin(now * 1.7 + b.wander);
    b.z += (zt + 14 * Math.sin(b.flap * 1.6) - b.z) * (1 - Math.exp(-dt * 3));
    if (b.state === 'land' && d < 12 && !near) {
      b.state = 'rest';
      b.t = 0;
      b.restT = rand(5, 12);
    }
    // keep it on screen
    if (Math.abs(b.x) > W / 2 + 60 || Math.abs(b.y) > H / 2 + 60) b.target = [0, 0];
  }

  function updateSnail(b, dt, now, env) {
    const near = env.ptr.has && Math.hypot(b.x - env.ptr.x, b.y - env.ptr.y) < 75;
    const gust = env.whirl.on && Math.hypot(b.x - env.whirl.x, b.y - env.whirl.y) < 200;
    if (near || gust) b.hide = 2.5; // pulls into its shell
    if (b.hide > 0) {
      b.hide -= dt;
      b.frame = 11;
      return;
    }
    b.t += dt;
    b.heading += Math.sin(now * 0.4 + b.wander) * 0.25 * dt;
    // gently steer back toward the middle of the screen
    if (Math.abs(b.x) > W * 0.42 || Math.abs(b.y) > H * 0.42) b.heading += clamp(angDiff(Math.atan2(b.x, -b.y), b.heading), -0.5 * dt, 0.5 * dt);
    const pulse = 0.5 + 0.5 * Math.sin(b.t * 2.2);
    b.speed = 1.2 + 1.6 * pulse; // a snail's pace
    b.frame = pulse > 0.5 ? 10 : 9;
    b.x += -Math.sin(b.heading) * b.speed * dt;
    b.y += Math.cos(b.heading) * b.speed * dt;
    if (now - (b.lastWig || 0) > 0.35) {
      b.lastWig = now;
      env.wiggle?.(b.x, b.y, b.size * 0.5, 0.8);
    }
  }

  function spawnAntLine() {
    const [x, y] = edgeStart();
    // the leader heads across the screen; followers trace its trail
    const goal = [-x * 1.2 + rand(-0.2, 0.2) * W, -y * 1.2 + rand(-0.2, 0.2) * H];
    const leader = {
      kind: 'ant', x, y, z: 0, heading: 0, speed: 0, base: rand(30, 40), state: 'walk', goal, trail: [[x, y, 0]], dist: 0,
      t: 0, stride: 0, frame: 0, alpha: 1, flee: 0, wander: rand(0, 6), size: unit * rand(0.68, 0.78), leader: null,
    };
    leader.heading = Math.atan2(-(goal[0] - x), goal[1] - y);
    bugs.push(leader);
    const n = 3 + ((Math.random() * 4) | 0);
    for (let i = 1; i <= n; i++) {
      bugs.push({
        kind: 'ant', x, y, z: 0, heading: leader.heading, speed: 0, base: leader.base, state: 'follow', leader, gap: i * unit * 0.95,
        t: -i * 0.4, stride: rand(0, 5), frame: 0, alpha: 1, flee: 0, wander: rand(0, 6), size: unit * rand(0.66, 0.76),
      });
    }
  }

  function trailPoint(leader, back) {
    const target = leader.dist - back;
    const tr = leader.trail;
    if (target <= 0) return tr[0];
    for (let i = tr.length - 1; i > 0; i--) if (tr[i - 1][2] <= target) return tr[i - 1];
    return tr[0];
  }

  function steer(b, desired, dt, rate) {
    b.heading += clamp(angDiff(desired, b.heading), -rate * dt, rate * dt);
  }

  function update(dt, now, env) {
    W = env.W;
    H = env.H;
    unit = env.unit;
    // the cast: two seven-spot ladybirds and one snail
    if (bugs.filter((b) => b.kind === 'lady').length < 2 && now > nextLady) {
      spawnLady();
      nextLady = now + rand(2, 5);
    }
    if (!bugs.some((b) => b.kind === 'snail')) spawnSnail();

    for (const b of bugs) {
      if (b.kind === 'fly') {
        b.size = unit * 1.9;
        updateButterfly(b, dt, now, env);
        continue;
      }
      if (b.kind === 'snail') {
        b.size = unit * 1.7;
        updateSnail(b, dt, now, env);
        continue;
      }
      // threats: pointer and whirlwind
      let fx = 0, fy = 0, threat = 0;
      if (env.ptr.has) {
        const d = Math.hypot(b.x - env.ptr.x, b.y - env.ptr.y);
        const r = b.kind === 'lady' ? 70 : 85;
        if (d < r) {
          threat = 1 - d / r;
          fx += (b.x - env.ptr.x) / (d || 1);
          fy += (b.y - env.ptr.y) / (d || 1);
        }
      }
      if (env.whirl.on) {
        const d = Math.hypot(b.x - env.whirl.x, b.y - env.whirl.y);
        if (d < 190) {
          threat = Math.max(threat, 1 - d / 190);
          fx += (b.x - env.whirl.x) / (d || 1);
          fy += (b.y - env.whirl.y) / (d || 1);
          if (b.kind === 'lady' && d < 120 && b.state !== 'fly') takeOff(b);
        }
      }
      if (threat > 0 && b.state !== 'fly') {
        b.flee = Math.max(b.flee, 0.6 + threat);
        b.fleeDir = Math.atan2(-fx, fy);
      }
      b.flee = Math.max(0, b.flee - dt);

      if (b.state === 'fly') {
        b.t += dt;
        b.z += (40 + b.t * 160) * dt;
        b.heading += Math.sin(now * 9 + b.wander) * 2.2 * dt;
        b.speed = 70 + b.t * 70;
        b.frame = 2 + (Math.floor(now * 26) % 2);
      } else {
        let desired = b.heading;
        let speed = b.base;
        if (b.kind === 'lady') {
          if (b.state === 'pause') {
            speed = 0;
            if ((b.t -= dt) <= 0) b.state = 'walk';
          } else {
            if (!b.target || Math.hypot(b.target[0] - b.x, b.target[1] - b.y) < 6) {
              if (b.target && Math.random() < 0.6) {
                b.state = 'pause';
                b.t = rand(0.8, 3);
              }
              const p = Math.random() < 0.65 ? env.textPoint() : null;
              b.target = p ? [p.x, p.y] : [rand(-0.42, 0.42) * W, rand(-0.42, 0.42) * H];
            }
            desired = Math.atan2(-(b.target[0] - b.x), b.target[1] - b.y) + Math.sin(now * 0.9 + b.wander) * 0.5;
          }
        } else if (b.state === 'follow') {
          if (b.t < 0) {
            b.t += dt;
            speed = 0;
          } else {
            const p = trailPoint(b.leader, b.gap);
            const d = Math.hypot(p[0] - b.x, p[1] - b.y);
            desired = Math.atan2(-(p[0] - b.x), p[1] - b.y);
            speed = d > 4 ? b.base * clamp(d / (unit * 0.6), 0.4, 1.6) : 0;
            if (!bugs.includes(b.leader) || b.leader.state === 'gone') {
              b.state = 'walk';
              b.goal = b.leader.goal;
            }
          }
        } else {
          // ants: purposeful but jittery, with short pauses
          if (b.state === 'pause') {
            speed = 0;
            if ((b.t -= dt) <= 0) b.state = 'walk';
          } else if (Math.random() < dt * 0.35) {
            b.state = 'pause';
            b.t = rand(0.15, 0.6);
          }
          const g = b.goal || [0, 0];
          desired = Math.atan2(-(g[0] - b.x), g[1] - b.y) + Math.sin(now * 2.3 + b.wander) * 0.7 + Math.sin(now * 5.1 + b.wander * 2) * 0.3;
        }
        if (b.flee > 0) {
          desired = b.fleeDir;
          speed = b.base * (b.kind === 'lady' ? 3.2 : 3.6);
          if (b.state === 'pause') b.state = 'walk';
        }
        steer(b, desired, dt, b.flee > 0 ? 9 : b.kind === 'lady' ? 2.6 : 5);
        b.speed += (speed - b.speed) * (1 - Math.exp(-dt * 8));
      }
      const dx = -Math.sin(b.heading) * b.speed * dt, dy = Math.cos(b.heading) * b.speed * dt;
      b.x += dx;
      b.y += dy;
      // leaves of the letters wobble as a ladybird crawls over them
      if (b.state !== 'fly' && b.speed > 2 && now - (b.lastWig || 0) > 0.16) {
        b.lastWig = now;
        env.wiggle?.(b.x, b.y, b.size * 0.6, b.flee > 0 ? 1.6 : 1.1);
      }
      if (b.state !== 'fly') {
        b.stride += Math.hypot(dx, dy);
        const len = b.kind === 'lady' ? 3.2 : 4.5;
        const base = b.kind === 'lady' ? 0 : 4;
        b.frame = base + (Math.floor(b.stride / len) % 2);
      }
      if (b.trail) {
        b.dist += Math.hypot(dx, dy);
        const last = b.trail[b.trail.length - 1];
        if (b.dist - last[2] > 2) b.trail.push([b.x, b.y, b.dist]);
        if (b.trail.length > 600) b.trail.splice(0, 100);
      }
      const far = Math.abs(b.x) > W / 2 + 80 || Math.abs(b.y) > H / 2 + 80;
      if (b.state === 'fly' && (far || b.z > 600)) b.state = 'gone';
      if (b.kind === 'ant' && far && (b.state === 'walk' || b.state === 'pause') && b.goal && b.t >= 0) {
        // left the screen on the far side
        if (Math.hypot(b.x - b.goal[0], b.y - b.goal[1]) < Math.max(W, H) * 0.6 || b.age > 40) b.state = 'gone';
      }
      if (b.kind === 'lady' && far && b.state !== 'fly' && b.target) {
        // keep walkers on screen
        b.target = [rand(-0.35, 0.35) * W, rand(-0.35, 0.35) * H];
      }
      b.age = (b.age || 0) + dt;
      if (b.kind === 'ant' && b.age > 70) b.state = 'gone';
    }
    for (let i = bugs.length - 1; i >= 0; i--) {
      if (bugs[i].state === 'gone') {
        const b = bugs.splice(i, 1)[0];
        if (b.kind === 'lady') nextLady = now + rand(6, 14);
      }
    }
    upload();
  }

  function takeOff(b) {
    b.state = 'fly';
    b.t = 0;
    b.flee = 0;
  }

  // returns true if a bug was hit
  function tap(x, y) {
    let hit = false;
    for (const b of bugs) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < Math.max(24, b.size * 0.9)) {
        hit = true;
        if (b.kind === 'fly' && b.state === 'rest') {
          b.state = 'air';
          b.t = 0;
          b.airT = rand(3, 6);
        } else if (b.kind === 'snail') b.hide = 3;
        else if (b.kind === 'lady' && b.state !== 'fly') takeOff(b);
        else if (b.kind === 'ant') {
          b.flee = 1.6;
          b.fleeDir = Math.atan2(-(b.x - x), b.y - y);
        }
      }
    }
    return hit;
  }

  function upload() {
    sprite.draw(bugs);
  }

  return { update, tap, bugs };
}
