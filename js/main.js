// Leaf Letters — seen from above: leaves drift down onto the forest floor and gather into what you type.
import * as THREE from '../vendor/three.module.js';
import { buildLeafAtlas, COLS, ROWS } from './leafAtlas.js';
import { loadFont, glyphTargets } from './glyph.js';
import { paintSoil, makeBackgroundMesh, makeHazeMesh, makeDust, makeGradeMesh, DAPPLE_GLSL, GROUND_GLSL, shared } from './background.js';
import { createBugs } from './bugs.js';
import { createSquirrel } from './squirrel.js';
import { initAudio, playCrunch, playRustle, playSnap, playWind, playStep, playFlyAway, playArrive, playCrinkle, playConeDrop } from './sound.js';

// ---------------------------------------------------------------- setup

const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
// on anything with a touch screen the on-screen keyboard only ever comes up from the keyboard button
const autoFocus = !isMobile && !('ontouchstart' in window) && !(navigator.maxTouchPoints > 0);
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const container = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: DPR < 2, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders work directly in display space
container.appendChild(renderer.domElement);

let W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 6000);
camera.position.z = 3000;

const bgMesh = makeBackgroundMesh();
const haze = makeHazeMesh();
const dust = makeDust(isMobile ? 30 : 55);
scene.add(bgMesh, haze, dust, makeGradeMesh());
const bugs = createBugs(scene);
const squirrel = createSquirrel(scene);

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- leaf look

const atlasData = buildLeafAtlas(11);
const atlas = new THREE.DataTexture(atlasData.data, atlasData.width, atlasData.height, THREE.RGBAFormat);
atlas.generateMipmaps = true;
atlas.minFilter = THREE.LinearMipmapLinearFilter;
atlas.magFilter = THREE.LinearFilter;
atlas.anisotropy = 4;
atlas.needsUpdate = true;

const C = {
  deepRed: [0.5, 0.08, 0.06],
  crimson: [0.66, 0.13, 0.08],
  orangeRed: [0.83, 0.28, 0.09],
  orange: [0.9, 0.44, 0.11],
  amber: [0.84, 0.53, 0.1],
  gold: [0.95, 0.69, 0.15],
  yellow: [0.98, 0.8, 0.26],
  caramel: [0.58, 0.32, 0.12],
  brown: [0.4, 0.2, 0.08],
};
// centre -> edge colour pairs per species: maple, ginkgo, oak, birch
const PALETTES = [
  [[C.crimson, C.deepRed], [C.orangeRed, C.crimson], [C.orange, C.orangeRed], [C.deepRed, C.brown], [C.amber, C.orangeRed], [C.crimson, C.crimson]],
  [[C.yellow, C.gold], [C.gold, C.amber], [C.gold, C.gold], [C.amber, C.orange], [C.yellow, C.amber]],
  [[C.caramel, C.brown], [C.amber, C.caramel], [C.orangeRed, C.caramel], [C.caramel, C.deepRed], [C.orange, C.brown]],
  [[C.gold, C.amber], [C.amber, C.caramel], [C.orange, C.orangeRed], [C.amber, C.crimson], [C.caramel, C.brown]],
];
const SPECIES_W = [0.38, 0.13, 0.29, 0.2];
const SPECIES_SIZE = [1.18, 1.0, 1.06, 1.0]; // maple has a long petiole, draw it a bit larger

function jitterColor(c, k) {
  const b = 1 + rand(-k, k);
  const h = rand(-0.04, 0.04);
  return [clamp(c[0] * b + h, 0, 1), clamp(c[1] * b, 0, 1), clamp(c[2] * b - h * 0.5, 0, 1)];
}

function pickSpecies(weights) {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
  return 0;
}

const LATE_GREEN = [[[0.36, 0.5, 0.16], [0.5, 0.58, 0.18]], [[0.52, 0.6, 0.2], [0.72, 0.66, 0.2]], [[0.42, 0.54, 0.17], [0.62, 0.6, 0.18]]];
function makeLook(weights = SPECIES_W, allowGreen = true) {
  const sp = pickSpecies(weights);
  // about one leaf in twelve hasn't turned yet: still green or just going yellow-green
  const pal = allowGreen && Math.random() < 0.08 ? LATE_GREEN[(Math.random() * LATE_GREEN.length) | 0] : PALETTES[sp][(Math.random() * PALETTES[sp].length) | 0];
  const ctype = colourType(pal[0]);
  return {
    ctype,
    wrate: WITHER_SPEED[ctype] * rand(0.85, 1.15), // each colour withers at its own pace, +-15% per leaf
    sizeMul: SPECIES_SIZE[sp] * rand(0.95, 1.05),
    cell: sp * COLS + ((Math.random() * COLS) | 0),
    colA: jitterColor(pal[0], 0.12),
    colB: jitterColor(pal[1], 0.12),
    green: Math.random() < 0.16 ? rand(0.35, 0.9) : 0,
    seed: Math.random(),
    curlL: rand(-0.25, 0.55),
    curlW: rand(0.2, 0.9),
  };
}

// older leaves on the ground: dull, browned, a little greyed
function makeLitterLook() {
  const L = makeLook([0.32, 0.12, 0.34, 0.22], false);
  const dull = (c) => {
    const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    const k = rand(0.46, 0.64);
    return [(c[0] * 0.25 + l * 0.4 + 0.36 * 0.35) * k, (c[1] * 0.25 + l * 0.4 + 0.26 * 0.35) * k, (c[2] * 0.25 + l * 0.4 + 0.17 * 0.35) * k];
  };
  L.colA = dull(L.colA);
  L.colB = dull(L.colB);
  L.green *= 0.4;
  return L;
}

// ---------------------------------------------------------------- withering colour paths
// Each row is the route a leaf of that colour takes as it dries out; the shader samples it by (age, row).
// They end in warm, dry browns - a dried leaf, never charred.
const WITHER_PATHS = [
  // green: flushes red first, then browns
  [[0.36, 0.5, 0.16], [0.6, 0.38, 0.13], [0.72, 0.22, 0.09], [0.56, 0.3, 0.13], [0.46, 0.3, 0.16]],
  // yellow: straight to a dry tan
  [[0.95, 0.72, 0.18], [0.74, 0.54, 0.24], [0.56, 0.4, 0.2]],
  // orange: straight to a warm brown
  [[0.9, 0.45, 0.12], [0.66, 0.38, 0.16], [0.5, 0.32, 0.16]],
  // red: straight to a reddish brown
  [[0.7, 0.14, 0.08], [0.56, 0.24, 0.12], [0.46, 0.28, 0.15]],
];
const WITHER_SPEED = [0.8, 1.0, 1.2, 1.4]; // green slowest, red fastest
const WITHER_DELAY = [0.6, 0.35, 0.18, 0];  // and red starts first, green clearly last (seconds)
function buildPathTexture() {
  const Wd = 64;
  const data = new Uint8Array(Wd * 4 * 4);
  WITHER_PATHS.forEach((stops, row) => {
    for (let i = 0; i < Wd; i++) {
      const t = (i / (Wd - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      const f = t - k;
      const e = f * f * (3 - 2 * f); // ease between stops so the change never kinks
      for (let c = 0; c < 3; c++) data[(row * Wd + i) * 4 + c] = Math.round((stops[k][c] + (stops[k + 1][c] - stops[k][c]) * e) * 255);
      data[(row * Wd + i) * 4 + 3] = 255;
    }
  });
  const tex = new THREE.DataTexture(data, Wd, 4, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
// which path a leaf follows, judged from its starting colour
function colourType(c) {
  const r = c[0], g = c[1];
  if (g > r * 0.85) return 0;
  if (g > r * 0.62) return 1;
  if (g > r * 0.33) return 2;
  return 3;
}

// ---------------------------------------------------------------- leaf mesh

const leafMat = new THREE.ShaderMaterial({
  uniforms: {
    uAtlas: { value: atlas },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.42, 0.76).normalize() },
    uShadowDir: { value: new THREE.Vector2(0.78, -0.62) },
    uGreen: { value: new THREE.Vector3(0.38, 0.47, 0.14) },
    uPath: { value: buildPathTexture() },
    uSoil: shared.uSoil,
    uGroove: shared.uGroove,
    uWet: shared.uWet,
    uTime: shared.uTime,
    uRes: shared.uRes,
    uBeam: shared.uBeam,
  },
  vertexShader: /* glsl */ `
    attribute vec4 aStat;   // cell, green, seed, kind (0 = shadow, 1 = leaf)
    attribute vec3 aColA;
    attribute vec3 aColB;
    attribute vec4 aDyn;    // curlL, curlW, shadow offset (px), shadow softness
    attribute vec4 aFx;     // alpha, defocus blur (mip bias), letter halo, is-text flag
    attribute vec4 aFrag;   // fragment wedge: start angle, end angle, crack seed, enabled
    attribute vec4 aCrush;  // trampled darkening, sunk-into-soil amount, withering age (0..1), dissolve (0..1)
    uniform vec2 uShadowDir;
    varying vec4 vFrag;
    varying vec4 vCrush;
    varying vec2 vUv;
    varying vec2 vAtlasUv;
    varying vec3 vN;
    varying vec3 vColA;
    varying vec3 vColB;
    varying vec4 vStat;
    varying float vSoft;
    varying vec4 vFx;
    void main(){
      vec3 p = position;
      // curl: cupped across the width, bowed along the length, tip lifted;
      // a drying leaf (age 0.55-0.8) rolls its edges up and its tip curls further
      float wk = smoothstep(0.5, 0.9, aCrush.z) * (1.0 - aCrush.y); // flattens again as it sinks into the soil
      // each species dries in its own way: maple closes like a cupped hand, ginkgo stays nearly flat,
      // oak rolls into a tube along its length, birch only lifts its rim
      float sp = floor(aStat.x / ${COLS}.0);
      float cupL = sp < 0.5 ? 1.6 : sp < 1.5 ? 0.1 : sp < 2.5 ? 0.2 : 0.4;
      float cupW = sp < 0.5 ? 2.6 : sp < 1.5 ? 0.5 : sp < 2.5 ? 4.2 : 1.6;
      float tipK = sp < 0.5 ? 2.4 : sp < 1.5 ? 0.6 : sp < 2.5 ? 1.2 : 1.4;
      p.xy *= 1.0 - 0.08 * wk; // a dry leaf shrinks a little
      float cl = aDyn.x + wk * cupL;
      float cw = aDyn.y + wk * cupW;
      float tip = fract(aStat.z * 7.31) * 1.3 + wk * tipK;
      float yy = p.y + 0.05;
      float tp = max(p.y - 0.1, 0.0);
      p.z += cl * yy * yy + cw * p.x * p.x + tip * tp * tp;
      vec3 n = normalize(vec3(-2.0 * cw * p.x, -(2.0 * cl * yy + 2.0 * tip * tp), 1.0));
      vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
      vN = normalize(mat3(instanceMatrix) * n);
      if (aStat.w < 0.5) {
        // letter leaves cast a wider, softer contact shadow: a dark halo that lifts the word off the ground
        wp = modelMatrix * instanceMatrix * vec4(p.xy * (1.0 + aFx.z * 0.85), p.z, 1.0);
        wp.xy += uShadowDir * aDyn.z * (1.0 - aFx.z * 0.5);
      }
      vec2 cellXY = vec2(mod(aStat.x, ${COLS}.0), floor(aStat.x / ${COLS}.0));
      vAtlasUv = (cellXY + uv) / vec2(${COLS}.0, ${ROWS}.0);
      vUv = uv;
      vColA = aColA;
      vColB = aColB;
      vStat = aStat;
      vSoft = aDyn.w;
      vFx = aFx;
      vFrag = aFrag;
      vCrush = aCrush;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uAtlas;
    uniform vec3 uSunDir;
    uniform vec3 uGreen;
    uniform sampler2D uPath;
    varying vec2 vUv;
    varying vec2 vAtlasUv;
    varying vec3 vN;
    varying vec3 vColA;
    varying vec3 vColB;
    varying vec4 vStat;
    varying float vSoft;
    varying vec4 vFx;
    varying vec4 vFrag;
    varying vec4 vCrush;
    ${DAPPLE_GLSL}
    ${GROUND_GLSL}
    // a crushed leaf is drawn as several wedge-shaped pieces radiating from its centre (roughly along
    // the veins); the shared jagged boundary keeps neighbouring pieces fitting together with a thin crack
    bool outsideFragment(vec2 uv){
      if (vFrag.w < 0.5) return false;
      vec2 d = uv - 0.5;
      float r = length(d);
      float a = atan(d.y, d.x);
      float j = (fract(sin(floor(r * 26.0 + vFrag.z * 53.0) * 12.9898) * 43758.5453) - 0.5) * 0.28
              + sin(r * 37.0 + vFrag.z * 21.0) * 0.08;
      float span = vFrag.y - vFrag.x;
      float rel = mod(a + j - vFrag.x, 6.2831853);
      float gap = 0.011 / max(r, 0.03);
      return !(rel > gap && rel < span - gap);
    }
    void main(){
      // cheap rejections first: invisible instances (leaves still waiting to fall, switched-off shadows) and
      // the transparent parts of each quad never pay for the canopy light below
      if (vFx.x < 0.002) discard;
      if (outsideFragment(vUv)) discard;
      if (vStat.w < 0.5) {
        // soft cast shadow: blurred silhouette from a lower mip level; faint where there is no direct sun
        float a = texture2D(uAtlas, vAtlasUv, 1.2 + vSoft * 2.8 + vFx.z * 2.0).a;
        a *= mix(0.55, 0.1, vSoft) * (1.0 + vFx.z * 0.85) * vFx.x * (1.0 - vCrush.y) * (1.0 - vCrush.w);
        if (a < 0.004) discard;
        float light = dapple(gl_FragCoord.xy);
        a *= mix(mix(0.3, 1.0, light), 1.0, vFx.z);
        gl_FragColor = vec4(0.05, 0.02, 0.008, a);
        return;
      }
      vec4 t = texture2D(uAtlas, vAtlasUv, vFx.y);
      if (t.a < 0.03) discard;
      float light = dapple(gl_FragCoord.xy);
      float edge = t.r, vein = t.g, mott = t.b;
      // withering stages, all driven by the leaf's age
      float ctype = floor(vStat.y * 0.5);        // colour kind: 0 green, 1 yellow, 2 orange, 3 red
      float greenRim = vStat.y - ctype * 2.0;    // the old green-remnant amount
      float age = vCrush.z;                      // withering: 0 fresh .. 1 fully dry
      float k1 = smoothstep(0.2, 0.6, age);      // losing water: duller, no gloss, no glow-through
      float k2 = smoothstep(0.35, 0.75, age);    // dry, browned edges
      float k3 = smoothstep(0.5, 0.9, age);      // curled, wrinkled
      float k4 = smoothstep(0.85, 1.0, age);     // brittle: hairline cracks along the veins, nicks in the rim
      float sp = floor(vStat.x / ${COLS}.0);     // species: 0 maple, 1 ginkgo, 2 oak, 3 birch
      // sinking into the soil: eaten away from the rim toward the middle, with a ragged noisy front
      float dis = vCrush.w;
      float disN = edge + (dn(vUv * 12.0 + vStat.z * 19.0) - 0.5) * 0.35;
      float disFront = dis * 1.4 - 0.08;
      if (dis > 0.0 && disN < disFront) discard;
      if (k4 > 0.0) {
        if (vein > 0.55 && dn(vUv * 46.0 + vStat.z * 31.0) > 1.0 - 0.16 * k4) discard;
        if (edge < 0.08 * k4 && dn(vUv * 15.0 + vStat.z * 7.0) > 0.58) discard;
      }
      // a ginkgo's thin fan frays at the rim as it dries
      if (sp > 0.5 && sp < 1.5 && k3 > 0.0 && edge < 0.07 * k3 && dn(vUv * 24.0 + vStat.z * 13.0) > 0.5) discard;

      // albedo: centre -> edge/tip gradient, mottling, spots, green remnants at the rim
      float g = clamp((1.0 - edge) * 0.85 + (vUv.y - 0.5) * 0.45 + (mott - 0.55) * 0.55, 0.0, 1.0);
      vec3 base = mix(vColA, vColB, g);
      float gr = greenRim * smoothstep(0.42, 0.04, edge + (mott - 0.5) * 0.35) * (1.0 - smoothstep(0.0, 0.2, age));
      base = mix(base, uGreen, gr);
      float spot = 1.0 - smoothstep(0.05, 0.16, mott);
      base = mix(base, base * vec3(0.32, 0.2, 0.11), spot * 0.85);
      base *= 0.8 + 0.2 * smoothstep(0.0, 0.12, edge);       // dry rim
      base *= 0.92 + 0.16 * mott;
      // 1) the colour travels along this leaf's own path (stops at the end of it once fully dry, age 0.85+)
      if (age > 0.0) {
        float cp = clamp(age / 0.85, 0.0, 1.0);
        vec3 pathCol = texture2D(uPath, vec2(0.008 + cp * 0.984, (ctype + 0.5) / 4.0)).rgb;
        float lumB = dot(base, vec3(0.3, 0.59, 0.11));
        float lumA = dot(mix(vColA, vColB, 0.5), vec3(0.3, 0.59, 0.11));
        vec3 shaded = pathCol * clamp(lumB / max(lumA, 0.05), 0.7, 1.3); // keep the leaf's own light and dark pattern
        float lumS = dot(shaded, vec3(0.3, 0.59, 0.11));
        shaded *= mix(min(1.0, lumB / max(lumS, 0.01)), 1.0, smoothstep(0.15, 0.5, age)); // no flash of brightness
        base = mix(base, shaded, smoothstep(0.0, 0.12, age));
      }
      // 2) a scorched brown rim creeps inward; uneven brown blotches open up across the blade
      vec3 scorch = vec3(0.42, 0.27, 0.14) * (0.85 + 0.3 * mott); // a dry, papery brown - not charred
      float front = k2 * 0.3;
      float burn = k2 > 0.0 ? smoothstep(front + 0.04, front - 0.06, edge + (dn(vUv * 9.0 + vStat.z * 37.0) - 0.5) * 0.12) : 0.0;
      float birch = sp > 2.5 ? 1.0 : 0.0;          // birch: a yellow blade freckled with many brown spots
      float blot = (1.0 - smoothstep(k2 * (0.4 + 0.25 * birch), k2 * (0.4 + 0.25 * birch) + 0.07, mott)) * k2;
      base = mix(base, scorch * 1.1, blot * 0.6);
      base = mix(base, scorch, burn * 0.75);
      base *= 1.0 - 0.12 * k2 * smoothstep(front - 0.03, front, edge) * (1.0 - smoothstep(front + 0.01, front + 0.06, edge));
      // losing water: the colour goes flat and a little darker (oak turns leathery)
      float lumD = dot(base, vec3(0.3, 0.59, 0.11));
      base = mix(base, vec3(lumD), 0.22 * k1);
      if (sp > 1.5 && sp < 2.5) base = mix(base, base * vec3(0.78, 0.62, 0.46), 0.5 * k3);
      // ginkgo bleaches toward a pale straw rather than browning
      if (sp > 0.5 && sp < 1.5) base = mix(base, vec3(0.62, 0.52, 0.3) * (0.85 + 0.3 * mott), 0.45 * k3);
      // 3) fine wrinkles; veins stand out paler (the colour itself comes from the path)
      float crease = abs(sin(vUv.x * 46.0 + sin(vUv.y * 17.0 + vStat.z * 9.0) * 2.5)) * abs(sin(vUv.y * 38.0 + vUv.x * 7.0));
      base *= mix(1.0, 0.8 + 0.28 * crease, k3);
      base = mix(base, base + vec3(0.22, 0.16, 0.1), vein * k3 * 0.8);
      // trampled leaves darken toward a damp brown
      base = mix(base, base * vec3(0.5, 0.38, 0.28) + vec3(0.03, 0.02, 0.01), vCrush.x);

      vec3 N = normalize(vN);
      if (!gl_FrontFacing) {
        N = -N;
        float l = dot(base, vec3(0.3, 0.59, 0.11));
        base = mix(base, vec3(l), 0.38) * 1.1 + 0.05;       // paler, duller underside, so a turned leaf reads
      }
      vec3 L = normalize(uSunDir);
      float ndl = dot(N, L);
      float diff = max(ndl, 0.0);
      float trans = max(-ndl, 0.0);
      float sunAmt = mix(mix(0.3, 1.0, vFx.w), 1.0, light); // letters always sit in full sun
      vec3 sun = vec3(1.0, 0.78, 0.5) * 1.2;
      vec3 amb = vec3(0.38, 0.32, 0.3);

      vec3 col = base * amb + base * sun * diff * 0.9 * sunAmt;
      // translucency when a leaf tilts away from the sun: lamina glows, veins and spots block light
      float thin = (1.0 - vein * 0.75) * (1.0 - spot * 0.6);
      vec3 tcol = pow(base, vec3(1.25)) * sun * 1.7 * thin * (0.85 + 0.3 * (1.0 - edge));
      col += tcol * (0.06 + trans * 1.1) * sunAmt * (1.0 - 0.45 * k1 - 0.45 * k3); // dry leaves turn opaque, like paper
      col += vein * diff * 0.1 * sun * base * sunAmt;
      float sheen = pow(1.0 - abs(N.z), 3.0);
      col += sun * base * sheen * 0.25 * sunAmt * (1.0 - max(k1, k3)); // and lose their sheen
      // ground litter settles into the soil tone; letters get a touch more saturation and brightness
      vec3 litter = mix(col, vec3(0.12, 0.08, 0.05), 0.2);
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      vec3 letter = mix(vec3(lum), col, 1.24) * 1.16;
      col = mix(litter, letter, vFx.w);
      // becoming soil: the leaf takes on the exact colour of the ground beneath it (same light, same damp),
      // slightly darker like fresh humus, so by the end it is indistinguishable from the forest floor
      vec3 ground = groundAt(gl_FragCoord.xy / uRes, light) * 0.93;
      col = mix(col, ground, vCrush.y * vCrush.y * (3.0 - 2.0 * vCrush.y));
      gl_FragColor = vec4(col, smoothstep(0.03, 0.5, t.a) * vFx.x);
    }
  `,
  side: THREE.DoubleSide,
  transparent: true,
  depthTest: false,
  depthWrite: false,
});

const leafGeo = new THREE.PlaneGeometry(1, 1, 4, 5);
let cap = 0;
let leafMesh = null;
let attr = null;

function buildLeafMesh(capacity) {
  if (leafMesh) {
    scene.remove(leafMesh);
    leafMesh.geometry.dispose();
    leafMesh.dispose();
  }
  cap = capacity;
  const geo = leafGeo.clone();
  attr = {
    stat: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
    colA: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
    colB: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
    dyn: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
    fx: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
    frag: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
    crush: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
  };
  attr.frag.setUsage(THREE.DynamicDrawUsage);
  attr.crush.setUsage(THREE.DynamicDrawUsage);
  attr.dyn.setUsage(THREE.DynamicDrawUsage);
  attr.fx.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aStat', attr.stat);
  geo.setAttribute('aColA', attr.colA);
  geo.setAttribute('aColB', attr.colB);
  geo.setAttribute('aDyn', attr.dyn);
  geo.setAttribute('aFx', attr.fx);
  geo.setAttribute('aFrag', attr.frag);
  geo.setAttribute('aCrush', attr.crush);
  leafMesh = new THREE.InstancedMesh(geo, leafMat, cap);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leafMesh.frustumCulled = false;
  leafMesh.renderOrder = 1;
  leafMesh.count = 0;
  scene.add(leafMesh);
  staticDirty = true;
}

// ---------------------------------------------------------------- state

const FALL = 0, REST = 1, FREE = 2, VORTEX = 3, SWIRL = 4, FRAG = 5, SINK = 6;
let leaves = [];
let slots = [];
let textChars = [];
let staticDirty = true;
let now = 0;
buildLeafMesh(isMobile ? 12288 : 16384); // one pre-allocated instance pool, large enough that animations never rebuild it

function newLeaf(look) {
  return {
    ...look,
    state: FALL,
    slot: null,
    homeSlot: null,
    ground: false,
    gx: 0, gy: 0, gsize: 10,
    lx: 0, ly: 0, lsize: 0.05, lrot: 0,
    tiltX: rand(-0.35, 0.35),
    tiltY: rand(-0.4, 0.4),
    x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, size: 10, alpha: 1,
    px: 0, py: 0, vxEst: 0, vyEst: 0,
    // breeze spring / free-flight velocity
    ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, fa: 0, fav: 0, fz: 0, fzv: 0, active: false,
    hop: null,
    age: 0,                    // withering: 0 fresh .. 1 fully dry (drives the shader)
    wrate: look.wrate ?? 1,    // withering pace (set per colour kind in makeLook)
    ctype: look.ctype ?? 1,    // colour kind: 0 green, 1 yellow, 2 orange, 3 red
    dis: 0,                    // dissolve into the soil (0..1)
    settleT: -10,
    fadeOut: 0,
    dead: false,
  };
}

// ---------------------------------------------------------------- layout

let blockCenterY = 0;
let textBox = null; // {x0,y0,x1,y1} of the typed text, used to keep ambient leaves off it
let unitS = 160;

function layout() {
  const margin = Math.max(14, W * (isMobile ? 0.045 : 0.07));
  const maxW = W - margin * 2;
  const maxH = H * (isMobile ? 0.6 : 0.66);
  let S = clamp(Math.min(W * 0.27, H * 0.3), 92, 220);
  let lines;
  for (let iter = 0; iter < 14; iter++) {
    lines = [];
    let cur = [], cw = 0;
    for (const s of slots) {
      if (s.kind === 'break') {
        // Enter: the line ends here and the next character starts a new one
        cur.push(s);
        lines.push({ items: cur, w: cw });
        cur = [];
        cw = 0;
        continue;
      }
      const w = s.adv * S;
      if (cw + w > maxW && cur.length) {
        // wrap at the last space on the line, so a word is never split (unless it has no space before it)
        let cut = -1;
        if (s.kind !== 'space') for (let j = cur.length - 1; j > 0; j--) if (cur[j].kind === 'space') {
          cut = j;
          break;
        }
        const carry = cut > 0 ? cur.splice(cut + 1) : [];
        lines.push({ items: cur, w: cur.reduce((a, it) => a + it.adv * S, 0) });
        cur = carry;
        cw = carry.reduce((a, it) => a + it.adv * S, 0);
      }
      cur.push(s);
      cw += w;
    }
    if (cur.length || (slots.length && slots[slots.length - 1].kind === 'break')) lines.push({ items: cur, w: cw }); // a fresh empty line after Enter
    if (lines.length * S * 1.12 <= maxH) break;
    S *= 0.9;
  }
  unitS = S;
  const lh = S * 1.12;
  const total = lines.length * lh;
  blockCenterY = H * 0.035;
  let top = blockCenterY + total / 2;
  let x0 = Infinity, x1 = -Infinity;
  for (const ln of lines) {
    let w = ln.w;
    for (let i = ln.items.length - 1; i >= 0 && ln.items[i].kind === 'space'; i--) w -= ln.items[i].adv * S;
    let x = -w / 2;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + w);
    for (const s of ln.items) {
      s.tx = x + (s.adv * S) / 2;
      s.ty = top - lh / 2;
      s.tS = S;
      x += s.adv * S;
    }
    top -= lh;
  }
  textBox = slots.length ? { x0: x0 - 30, x1: x1 + 30, y0: blockCenterY - total / 2 - 30, y1: blockCenterY + total / 2 + 30 } : null;
}

const inTextBox = (x, y) => textBox && x > textBox.x0 && x < textBox.x1 && y > textBox.y0 && y < textBox.y1;

function restOf(leaf) {
  const s = leaf.slot;
  if (s) return { x: s.cx + leaf.lx * s.S, y: s.cy + leaf.ly * s.S, size: leaf.lsize * s.S * leaf.sizeMul, z: 3 };
  return { x: leaf.gx, y: leaf.gy, size: leaf.gsize, z: leaf.gz || 0 };
}

// ---------------------------------------------------------------- ground litter

const litterSize = () => clamp(Math.min(W, H) / 900, 0.6, 1.3) * rand(18, 34);
function makeLitterLeaf(x, y, fresh = false) {
  const l = newLeaf(fresh ? makeLook() : makeLitterLook());
  l.ground = true;
  l.gx = l.x = x;
  l.gy = l.y = y;
  l.gsize = l.size = litterSize() * l.sizeMul * (fresh ? rand(1.3, 1.55) : 1);
  l.lrot = l.rz = rand(0, TAU);
  l.tiltX = l.rx = rand(-0.2, 0.2);
  l.tiltY = l.ry = rand(-0.25, 0.25);
  l.state = REST;
  return l;
}

let litterTarget = 120;
function seedLitter() {
  litterTarget = Math.round(clamp((W * H) / 3000, 100, 540)); // a natural cover of old fallen leaves
  const keep = leaves.filter((l) => !(l.ground && l.state === REST));
  const fresh = [];
  for (let i = 0; i < litterTarget; i++) fresh.push(makeLitterLeaf(...rimSpot(0.52)));
  // and a few freshly fallen, still colourful leaves already lying on the open ground from the start
  for (let i = 0, n = 6 + ((Math.random() * 4) | 0); i < n; i++) {
    let p = rimSpot(0.46);
    for (let t = 0; t < 10 && inTextBox(p[0], p[1]); t++) p = rimSpot(0.46);
    fresh.push(makeLitterLeaf(p[0], p[1], true));
  }
  leaves = fresh.concat(keep);
  staticDirty = true;
}

// ---------------------------------------------------------------- spawning

// windAng: direction the wind blows toward. from: optional {x,y,z} to start from instead of the sky.
function startFall(leaf, delay, windAng, from) {
  const r = restOf(leaf);
  const f = (leaf.fl = {});
  if (from) {
    f.sx = from.x;
    f.sy = from.y;
    f.zH = Math.max(from.z, 40);
    f.fade = false;
    const dist = Math.hypot(r.x - f.sx, r.y - f.sy);
    f.D = clamp(0.75 + dist / 700, 0.85, 1.7) * rand(0.9, 1.1);
  } else {
    // from the canopy: start high (large, defocused), upwind of the landing spot
    const a = windAng + rand(-0.5, 0.5);
    const d = rand(160, 520);
    f.sx = r.x - Math.cos(a) * d;
    f.sy = r.y - Math.sin(a) * d;
    f.zH = rand(420, 760);
    f.fade = true;
    f.D = rand(1.2, 1.55);
  }
  f.t0 = now + delay;
  f.wa = rand(0.45, 0.85);
  f.wk = Math.random() < 0.5 ? 1 : 2;
  f.A = rand(14, 44) * (0.6 + r.size / 30);
  f.om = (TAU * rand(1.3, 2.6)) / f.D;
  f.ph = rand(0, TAU);
  f.swing = rand(0.45, 0.95);
  const tumble = Math.random() < 0.3;
  f.rzOff = (tumble ? rand(3, 9) : rand(-1.2, 1.2)) * sign();
  f.flip = TAU * [0, 0, 1, 1, 2][(Math.random() * 5) | 0] * sign();
  f.rx0 = leaf.rx;
  leaf.state = FALL;
  leaf.x = f.sx;
  leaf.y = f.sy;
  leaf.z = f.zH;
  leaf.size = r.size;
  leaf.alpha = f.fade ? 0 : 1;
  leaf.hop = null;
}

function charDensity() {
  const n = slots.filter((s) => s.kind === 'char').length;
  let d = isMobile ? 0.82 : 1;
  if (n > 10) d *= 0.8;
  if (n > 18) d *= 0.75;
  return d;
}

const randWind = () => (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.7, 0.7);

function addChar(ch) {
  const isBreak = ch === '\n';
  const isSpace = !isBreak && ch.trim() === '';
  const slot = { ch, kind: isBreak ? 'break' : isSpace ? 'space' : 'char', adv: isBreak ? 0 : 0.45, cx: 0, cy: 0, S: 100 };
  let targets = null;
  if (isBreak) {
    // a line break has no leaves; the text above simply moves up to make room
    slots.push(slot);
    layout();
    slot.cx = slot.tx;
    slot.cy = slot.ty;
    slot.S = slot.tS;
    return;
  }
  if (!isSpace) {
    targets = glyphTargets(ch, charDensity());
    slot.total = targets.samples.length;
    slot.crushed = 0;
    const cjk = ch.codePointAt(0) >= 0x2e80;
    slot.inkOff = 0;
    if (cjk && targets.samples.length) {
      // Chinese characters are spaced by their actual ink (handwritten glyphs are often much narrower than
      // their square box), with a small even gap, and centred on that ink
      let x0 = Infinity, x1 = -Infinity;
      for (const sm of targets.samples) {
        x0 = Math.min(x0, sm.x - sm.size * 0.5);
        x1 = Math.max(x1, sm.x + sm.size * 0.5);
      }
      slot.inkOff = (x0 + x1) / 2;
      slot.adv = Math.max(0.5, x1 - x0 + 0.1);
    } else slot.adv = Math.max(0.3, targets.adv) + 0.02; // Latin keeps its own advance plus a hair of tracking
  }
  slots.push(slot);
  layout();
  slot.cx = slot.tx;
  slot.cy = slot.ty;
  slot.S = slot.tS;

  const wind = randWind();
  if (isSpace) {
    // a space stays a space in the text; meanwhile one to three big leaves let go of the canopy and drift down
    // onto the open ground around the words (this is the only time leaves fall on their own)
    const wind = randWind();
    const n = 1 + ((Math.random() * 3) | 0); // one to three leaves
    for (let i = 0; i < n; i++) spawnGroundFall(i * rand(0.25, 0.5), wind, rand(1.3, 1.55));
    return;
  }
  if (bury.on) {
    // while the text is buried, a new character's leaves just fall into the mound (no letter shape)
    slot.buried = true;
    const n2 = Math.round(targets.samples.length * 0.6);
    for (let i = 0; i < n2; i++) pileLeaf(rand(0, 0.5), slot.S);
    return;
  }
  const w = SPECIES_W.slice();
  w[(Math.random() * 4) | 0] += 0.35; // each character gets a slightly different mix of species
  const n = targets.samples.length;
  targets.samples.forEach((sm, i) => {
    const leaf = newLeaf(makeLook(w));
    leaf.slot = slot;
    leaf.lx = sm.x - slot.inkOff;
    leaf.ly = sm.y;
    leaf.lsize = sm.size;
    leaf.lrot = sm.rot;
    if (sm.edge > 0.5) {
      leaf.tiltX *= 0.5;
      leaf.tiltY *= 0.5;
    }
    startFall(leaf, (i / n) * 0.5 + rand(0, 0.12), wind);
    leaves.push(leaf);
  });
  playArrive(0.9, 1.25); // the fly-in sound: the wind brings them, then they gather as they land (~1.2 s)
  staticDirty = true;
}

// keepHome: remember where the leaf belongs so it can return later
function toFree(leaf, p, keepHome = false) {
  leaf.homeSlot = keepHome ? leaf.slot : null;
  if (!keepHome) leaf.ground = false;
  leaf.state = FREE;
  leaf.fsize = leaf.size;
  leaf.slot = null;
  leaf.fr = p;
  leaf.hop = null;
  leaf.vx = leaf.vxEst;
  leaf.vy = leaf.vyEst;
  leaf.phase = rand(0, TAU);
}

function freeParams(o) {
  return Object.assign(
    { ft0: now, wx: 0, wy: 0, windDecay: 0, bx: 0, by: 0, lift: 0, liftDecay: 1, zT: 80, swayA: 40, omega: 2.5, drag: 2, spin: 0, flip: 0, returnAt: 0 },
    o,
  );
}


// a spot on the ground, likelier toward the edges of the picture: the middle is kept mostly clear for the words
function rimSpot(span = 0.5) {
  for (let t = 0; t < 40; t++) {
    const x = rand(-span, span) * W, y = rand(-span, span) * H;
    const nx = Math.abs(x / W) * 2, ny = Math.abs(y / H) * 2;
    const e = Math.max(nx, ny) * 0.65 + Math.hypot(nx, ny) * 0.35 / Math.SQRT2;
    if (Math.random() < 0.35 + 0.65 * smooth(0.3, 0.8, e)) return [x, y]; // a little thinner in the middle
  }
  return [rand(-span, span) * W, (Math.random() < 0.5 ? -1 : 1) * rand(0.35, span) * H];
}

// a leaf drops from the canopy onto open ground (off the words) and becomes part of the litter
function spawnGroundFall(delay = 0, wind = randWind(), big = 1) {
  for (let t = 0; t < 12; t++) {
    const [x, y] = rimSpot(0.46);
    if (inTextBox(x, y)) continue;
    const l = newLeaf(makeLook());
    l.ground = true;
    l.gx = x;
    l.gy = y;
    l.gsize = litterSize() * l.sizeMul * big;
    l.lrot = rand(0, TAU);
    startFall(l, delay, wind);
    if (big > 1) {
      // a calm, natural fall: from not far upwind, slowly rocking side to side like a falling leaf does,
      // without tumbling or flipping over
      const f = l.fl, a = wind + rand(-0.3, 0.3), d = rand(70, 150);
      f.sx = x - Math.cos(a) * d;
      f.sy = y - Math.sin(a) * d;
      f.zH = rand(380, 520);
      f.D = rand(2.3, 2.9);
      f.wa = rand(0.15, 0.3);
      f.A = rand(10, 18);
      f.om = (TAU * rand(1.2, 1.6)) / f.D;
      f.swing = rand(0.3, 0.5);
      f.rzOff = rand(-0.5, 0.5);
      f.flip = 0;
      l.x = f.sx;
      l.y = f.sy;
      l.z = f.zH;
    }
    leaves.push(l);
    staticDirty = true;
    return;
  }
}

// ---------------------------------------------------------------- text editing

function removeLast() {
  const slot = slots.pop();
  if (!slot) return;
  layout();
  const ang = randWind();
  const own = leaves.filter((l) => l.slot === slot || l.homeSlot === slot);
  if (!own.length) return;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let mn = Infinity, mx = -Infinity;
  for (const l of own) {
    const p = l.x * ux + l.y * uy;
    mn = Math.min(mn, p);
    mx = Math.max(mx, p);
  }
  const span = Math.max(1, mx - mn);
  for (const l of own) {
    const sweep = (l.x * ux + l.y * uy - mn) / span; // the gust front sweeps across the character
    const inFlight = l.state !== REST;
    if (l.state === FALL && now < l.fl.t0) {
      l.dead = true;
      continue;
    }
    // the whole heap of leaves lifts and goes together on one gust: whole leaves, turning slowly as they fly,
    // still looking like the letter until they are up in the air
    const sp = rand(700, 860);
    const ft0 = inFlight ? now : now + sweep * 0.25 + rand(0, 0.06);
    toFree(l, freeParams({
      ft0,
      wx: ux * sp + rand(-40, 40), wy: uy * sp + rand(-40, 40), windDecay: 1.6, bx: ux * 90, by: uy * 90,
      lift: rand(160, 260), liftDecay: 0.9, zT: rand(70, 140),
      swayA: rand(20, 40), omega: rand(2.5, 4), drag: rand(2.4, 3.2),
      spin: sign() * rand(0.8, 2.5), flip: sign() * rand(1.2, 3.5),
    }));
    l.flyText = ft0; // keeps its letter look until it has lifted off
  }
  playFlyAway(0.8);
  staticDirty = true;
}

function clearAll() {
  releaseWhirl();
  slots = [];
  textChars = [];
  ime.value = '';
  const cx = 0, cy = blockCenterY;
  const box = textBox;
  textBox = null;
  let maxR = 1;
  const takers = [];
  for (const l of leaves) {
    if (l.dead) continue;
    if (l.state === FALL && now < l.fl.t0) {
      l.dead = true;
      continue;
    }
    if (l.state === FRAG || l.state === SINK) continue; // already sinking into the soil
    if (l.ground && l.state !== FREE) {
      // some of the nearby litter gets caught up too; the canopy will replace it
      const near = box && l.x > box.x0 - 80 && l.x < box.x1 + 80 && l.y > box.y0 - 80 && l.y < box.y1 + 80;
      if (!near || Math.random() < 0.5) continue;
    }
    takers.push(l);
    maxR = Math.max(maxR, Math.hypot(l.x - cx, l.y - cy));
  }
  const drift = randWind();
  for (const l of takers) {
    const r0 = Math.hypot(l.x - cx, l.y - cy);
    l.fsize = l.size;
    l.slot = null;
    l.homeSlot = null;
    l.ground = false;
    l.hop = null;
    l.state = VORTEX;
    l.vt = {
      t0: now + (r0 / maxR) * 0.3 + rand(0, 0.15),
      x0: l.x, y0: l.y, z0: l.z, rx0: l.rx, rz0: l.rz,
      r0: Math.max(r0, 20) * rand(0.85, 1.1),
      th0: Math.atan2(l.y - cy, l.x - cx),
      cx, cy, dx: Math.cos(drift), dy: Math.sin(drift),
      spin: sign() * rand(4, 10), flip: sign() * rand(3, 9),
      spd: rand(0.85, 1.2), zr: rand(0.6, 1.4),
    };
  }
  staticDirty = true;
}

// ---------------------------------------------------------------- per-frame motion

function updateFall(l) {
  const f = l.fl;
  const r = restOf(l);
  l.size = r.size;
  const u = (now - f.t0) / f.D;
  if (u < 0) {
    l.x = f.sx;
    l.y = f.sy;
    l.z = f.zH;
    l.alpha = f.fade ? 0 : 1;
    return;
  }
  if (u >= 1) {
    l.state = REST;
    l.settleT = now;
    l.alpha = 1;
    updateRest(l, 0);
    return;
  }
  // monotonic time warp: the leaf speeds up and slows down along its path
  const u2 = u + (f.wa * Math.sin(TAU * f.wk * u)) / (TAU * f.wk);
  const e = 1 - Math.pow(1 - u2, 2.3);
  const ez = 1 - Math.pow(1 - u2, 1.9); // descent slows just before touching down
  const env = Math.pow(1 - u2, 1.3) * smooth(0, 0.12, u2);
  const ph = f.ph + f.om * u * f.D;
  let dx = r.x - f.sx, dy = r.y - f.sy;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const sw = f.A * Math.sin(ph) * env, fw = f.A * 0.22 * Math.sin(2 * ph) * env;
  l.x = f.sx + (r.x - f.sx) * e - dy * sw + dx * fw;
  l.y = f.sy + (r.y - f.sy) * e + dx * sw + dy * fw;
  l.z = r.z + (f.zH - r.z) * (1 - ez);
  l.alpha = f.fade ? smooth(0, 0.16, u) : 1;
  const er = smooth(0, 1, u2);
  const ef = smooth(0, 0.85, u2);
  l.rz = l.lrot + f.rzOff * (1 - er) + f.swing * Math.cos(ph) * env;
  l.rx = l.tiltX + f.flip * (1 - ef) + 0.55 * Math.sin(ph * 0.5 + 1.0) * env;
  l.ry = l.tiltY + 0.75 * Math.sin(ph + 1.3) * env;
}

function updateRest(l, dt) {
  const r = restOf(l);
  l.size = r.size;
  if (l.active && dt > 0) {
    const k = 60, c = 5.2, ka = 80, ca = 5.5;
    l.vx += (-k * l.ox - c * l.vx) * dt;
    l.vy += (-k * l.oy - c * l.vy) * dt;
    l.vz += (-40 * l.oz - 6 * l.vz) * dt;
    l.fav += (-ka * l.fa - ca * l.fav) * dt;
    l.fzv += (-ka * l.fz - ca * l.fzv) * dt;
    l.ox += l.vx * dt;
    l.oy += l.vy * dt;
    l.oz += l.vz * dt;
    l.fa += l.fav * dt;
    l.fz += l.fzv * dt;
    const e = Math.abs(l.ox) + Math.abs(l.oy) + Math.abs(l.fa) + Math.abs(l.fz) + Math.abs(l.vx) * 0.01 + Math.abs(l.fav) * 0.01;
    if (e < 0.004) {
      l.ox = l.oy = l.oz = l.vx = l.vy = l.vz = l.fa = l.fav = l.fz = l.fzv = 0;
      l.active = false;
    }
  }
  // landing: a small bounce and the leaf rocking flat
  const s = now - l.settleT;
  let bz = 0, brx = 0;
  if (s < 0.9) {
    bz = 5 * Math.exp(-s * 7) * Math.sin(s * 19);
    brx = 0.38 * Math.exp(-s * 5.5) * Math.sin(s * 15);
  }
  // tap hop: a little jump (and sometimes a full flip) back onto the same spot
  let hx = 0, hy = 0, hz = 0, hrx = 0, hrz = 0;
  if (l.hop) {
    const h = l.hop;
    const u = (now - h.t0) / h.D;
    if (u >= 1) {
      if (h.keep) {
        // it stays turned over, where it landed
        l.tiltX += h.flip;
        l.lrot += h.spin;
        if (!l.slot) {
          l.gx += h.dx;
          l.gy += h.dy;
        }
      }
      l.hop = null;
      l.settleT = now;
    } else if (u > 0) {
      hz = h.h * 4 * u * (1 - u);
      const su = Math.sin(Math.PI * u);
      if (h.keep) {
        // a flick: the slide and the turn carry through to where it lands (no swinging back)
        const e = smooth(0, 1, u);
        hx = h.dx * e;
        hy = h.dy * e;
        hrx = h.flip * e;
        hrz = h.spin * e;
      } else {
        hx = h.dx * su;
        hy = h.dy * su;
        hrx = h.flip * smooth(0, 1, u) + h.wob * su;
        hrz = h.spin * su;
      }
    }
  }
  // gust: rise, turn over (paler underside shows), settle back with a little residual wobble
  let gx = 0, gy = 0, gz = 0, grx = 0, gry = 0;
  if (l.gw) {
    const g = l.gw;
    const u = (now - g.t0) / g.dur;
    if (u >= 1) {
      l.gw = null;
      l.fav += rand(-1, 1) * (1.5 + g.amp * 1.2);
      l.fzv += rand(-0.5, 0.5) * g.amp;
      l.active = true;
    } else if (u > 0) {
      const sv = Math.sin(Math.PI * Math.pow(u, 0.75));
      const th = g.amp * sv;
      grx = th * g.ax;
      gry = th * g.ay;
      gx = g.dx * sv;
      gy = g.dy * sv;
      gz = g.lift * sv;
    }
  }
  l.x = r.x + l.ox + hx + gx;
  l.y = r.y + l.oy + hy + gy;
  l.z = Math.max(0, r.z + bz + l.oz + hz + gz);
  l.rx = l.tiltX + brx + l.fa + hrx + grx;
  l.ry = l.tiltY + l.fa * 0.35 + gry;
  l.rz = l.lrot + l.fz + hrz;
  if (l.fadeOut) {
    l.alpha = clamp(1 - (now - l.fadeOut) / 2.5, 0, 1);
    if (l.alpha <= 0) l.dead = true;
  }
}

function homeAlive(l) {
  if (l.homeSlot) return slots.includes(l.homeSlot);
  return l.ground;
}

function updateFree(l, dt) {
  const p = l.fr;
  l.size = l.fsize;
  if (now < p.ft0) return;
  const t = now - p.ft0;
  l.phase += p.omega * dt;
  const decay = p.windDecay ? Math.exp(-t / p.windDecay) : 1;
  const wx = p.wx * decay + p.bx, wy = p.wy * decay + p.by;
  const wl = Math.hypot(wx, wy) || 1;
  const s = Math.sin(l.phase);
  const gust = 0.55 + 0.9 * s * s; // speeds up and slows down with the flutter
  const sway = p.swayA * Math.cos(l.phase);
  const tvx = wx * gust - (wy / wl) * sway;
  const tvy = wy * gust + (wx / wl) * sway;
  const k = 1 - Math.exp(-dt * p.drag);
  l.vx += (tvx - l.vx) * k;
  l.vy += (tvy - l.vy) * k;
  l.x += l.vx * dt;
  l.y += l.vy * dt;
  const zt = p.zT + p.lift * Math.exp(-t / p.liftDecay);
  l.z += (zt - l.z) * (1 - Math.exp(-dt * 2.4));
  l.rz += p.spin * dt;
  l.rx += p.flip * dt;
  l.ry = Math.sin(l.phase) * 0.7;
  if (p.returnAt && now >= p.returnAt) {
    p.returnAt = 0;
    if (homeAlive(l)) {
      l.slot = l.homeSlot;
      l.homeSlot = null;
      startFall(l, 0, 0, { x: l.x, y: l.y, z: l.z });
      return;
    }
    l.ground = false;
  }
  const m = 160 + l.size * 2;
  if (!p.returnAt && (l.x < -W / 2 - m || l.x > W / 2 + m || l.y < -H / 2 - m || l.y > H / 2 + m)) l.dead = true;
}

function updateVortex(l) {
  const v = l.vt;
  l.size = l.fsize;
  const tau = (now - v.t0) * v.spd;
  if (tau < 0) return;
  const th = v.th0 + 1.4 * tau + 2.7 * tau * tau;
  const r = v.r0 * (1 - 0.62 * smooth(0, 1.0, tau)) + Math.pow(Math.max(0, tau - 0.9), 2) * 480;
  const carry = Math.pow(Math.max(0, tau - 0.6), 2) * 260; // the whole whirlwind drifts away
  const px = v.cx + v.dx * carry + Math.cos(th) * r;
  const py = v.cy + v.dy * carry + Math.sin(th) * r;
  const b = smooth(0, 0.5, tau);
  l.x = v.x0 + (px - v.x0) * b;
  l.y = v.y0 + (py - v.y0) * b;
  // rising toward the camera: leaves grow and their shadows fall away
  l.z = v.z0 + (60 * tau + 230 * tau * tau) * v.zr * b;
  l.rz = v.rz0 + v.spin * tau;
  l.rx = v.rx0 + v.flip * tau;
  l.ry = Math.sin(th * 1.3) * 0.6 * b;
  l.alpha = 1 - smooth(2.2, 3.2, tau);
  if (tau > 3.3) l.dead = true;
}

// ---------------------------------------------------------------- mini tornado (long press on a character)

// A small whirlwind forms on the character: its leaves (and a little litter around it) start circling,
// tighten into a spinning funnel that rises toward the camera, and the funnel wanders off and scatters.
function startTwister(slot) {
  initAudio();
  ptr.longPressed = true;
  const cx = slot.cx, cy = slot.cy, S = slot.S;
  const takers = [];
  let maxR = 1;
  for (const l of leaves) {
    if (l.dead) continue;
    const mine = l.slot === slot || l.homeSlot === slot;
    if (mine && l.state === FALL && now < l.fl.t0) {
      l.dead = true;
      continue;
    }
    const d = Math.hypot(l.x - cx, l.y - cy);
    if (mine && (l.state === REST || l.state === FALL || l.state === FREE || l.state === SWIRL)) takers.push(l);
    else if (l.ground && l.state === REST && d < S * 0.8 && Math.random() < 0.6) takers.push(l); // litter is sucked in too
    else if (l.state === REST && l.slot && d < S * 1.2) {
      // the neighbours shiver in the draught
      const q = 1 - d / (S * 1.2);
      l.hop = { t0: now + rand(0, 0.3), D: 0.5, h: q * rand(4, 12), dx: (cx - l.x) * 0.04, dy: (cy - l.y) * 0.04, flip: 0, wob: rand(-0.5, 0.5), spin: rand(-0.6, 0.6) };
    }
  }
  for (const l of takers) maxR = Math.max(maxR, Math.hypot(l.x - cx, l.y - cy));
  const drift = rand(0, TAU); // where the funnel wanders off to
  for (const l of takers) {
    const r0 = Math.hypot(l.x - cx, l.y - cy);
    l.fsize = l.size;
    l.slot = null;
    l.homeSlot = null;
    l.ground = false;
    l.hop = null;
    l.gw = null;
    l.state = VORTEX;
    l.vt = {
      t0: now + (r0 / maxR) * 0.18 + rand(0, 0.1), // the rim is caught first
      x0: l.x, y0: l.y, z0: l.z, rx0: l.rx, rz0: l.rz,
      r0: Math.max(r0, 12) * rand(0.85, 1.1),
      th0: Math.atan2(l.y - cy, l.x - cx),
      cx, cy, dx: Math.cos(drift), dy: Math.sin(drift),
      spin: sign() * rand(5, 12), flip: sign() * rand(4, 10),
      spd: rand(1.05, 1.35), zr: rand(0.5, 1.1),
    };
  }
  // a little dust is lifted at the foot of the funnel
  for (let i = 0; i < 3; i++) setTimeout(() => windDust(cx, cy, Math.cos(drift + i * 2), Math.sin(drift + i * 2), 0.45, 6), (0.15 + i * 0.25) * 1000);
  playWind(0.6, 2.4);
  [0.2, 0.5, 0.8, 1.2].forEach((d, i) => setTimeout(() => playRustle(0.9 - i * 0.15), d * 1000));
  // the character leaves the text once the funnel has lifted it; the following ones glide over
  slot.dying = true;
  slot.dieAt = now + 1.0;
  staticDirty = true;
}

// ---------------------------------------------------------------- whirlwind (press and hold)

const whirl = { on: false, x: 0, y: 0, t0: 0, str: 0, debris: 0 };

function updateWhirl(dt) {
  if (!whirl.on) {
    if (ptr.down && now - ptr.downT > 0.24 && ptr.maxMove < 10) {
      whirl.on = true;
      whirl.x = ptr.x;
      whirl.y = ptr.y;
      whirl.t0 = now;
      whirl.debris = 0;
    } else return;
  }
  const k = 1 - Math.exp(-dt * 9);
  whirl.x += (ptr.x - whirl.x) * k;
  whirl.y += (ptr.y - whirl.y) * k;
  whirl.str = clamp((now - whirl.t0) / 0.9, 0, 1);
  const R = (55 + 125 * whirl.str) * clamp(unitS / 180, 0.7, 1.2);
  let count = 0;
  for (const l of leaves) if (l.state === SWIRL) count++;
  const capN = isMobile ? 160 : 260;
  for (const l of leaves) {
    if (count >= capN) break;
    if (l.state !== REST && l.state !== FREE) continue;
    if (l.state === FREE && l.fr.returnAt) continue;
    const d = Math.hypot(l.x - whirl.x, l.y - whirl.y);
    if (d > R) continue;
    if (Math.random() > dt * 7 * (1.2 - d / R)) continue;
    if (l.state === REST) l.homeSlot = l.slot;
    l.state = SWIRL;
    l.fsize = l.size;
    l.hop = null;
    l.active = false;
    l.ox = l.oy = l.oz = l.fa = l.fz = 0;
    l.sw = {
      r: d, th: Math.atan2(l.y - whirl.y, l.x - whirl.x),
      ro: rand(12, 30 + 70 * whirl.str), om: rand(5, 8), zt: rand(30, 300), ph: rand(0, TAU), flip: sign() * rand(2, 7),
    };
    count++;
  }
  // loose bits of litter get sucked in too, so the whirlwind is visible even on bare soil
  whirl.debris += dt * 7;
  while (whirl.debris > 1 && count < capN) {
    whirl.debris -= 1;
    const l = newLeaf(makeLitterLook());
    l.size = l.fsize = litterSize() * rand(0.45, 0.8);
    const a = rand(0, TAU), d = R * rand(0.7, 1.1);
    l.x = whirl.x + Math.cos(a) * d;
    l.y = whirl.y + Math.sin(a) * d;
    l.z = 0;
    l.alpha = 0;
    l.state = SWIRL;
    l.sw = { r: d, th: a, ro: rand(10, 60), om: rand(5, 8), zt: rand(20, 200), ph: rand(0, TAU), flip: sign() * rand(2, 7), fadeIn: now };
    leaves.push(l);
    staticDirty = true;
    count++;
  }
}

function updateSwirl(l, dt) {
  const s = l.sw;
  l.size = l.fsize;
  s.r += (s.ro - s.r) * (1 - Math.exp(-dt * 2.6));
  s.th += s.om * (36 / (s.r + 24) + 0.55) * dt;
  l.x = whirl.x + Math.cos(s.th) * s.r;
  l.y = whirl.y + Math.sin(s.th) * s.r;
  l.z += (s.zt * (0.4 + 0.6 * whirl.str) + 28 * Math.sin(now * 3 + s.ph) - l.z) * (1 - Math.exp(-dt * 3));
  l.rz += 9 * dt;
  l.rx += s.flip * dt;
  l.ry = Math.sin(s.th) * 0.6;
  if (s.fadeIn) l.alpha = smooth(0, 0.4, now - s.fadeIn);
}

function releaseWhirl() {
  if (!whirl.on) return;
  whirl.on = false;
  for (const l of leaves) {
    if (l.state !== SWIRL) continue;
    const s = l.sw;
    const vt = s.om * (36 / (s.r + 24) + 0.55) * s.r;
    const out = rand(120, 320);
    const vx = -Math.sin(s.th) * vt * 0.7 + Math.cos(s.th) * out;
    const vy = Math.cos(s.th) * vt * 0.7 + Math.sin(s.th) * out;
    const goesHome = l.homeSlot ? slots.includes(l.homeSlot) : l.ground;
    l.state = FREE;
    l.slot = null;
    l.fr = freeParams({
      wx: vx * 0.5, wy: vy * 0.5, windDecay: 0.7, lift: 60, liftDecay: 0.5, zT: 40,
      swayA: 30, omega: 3, drag: 1.4, spin: sign() * rand(2, 6), flip: s.flip,
      returnAt: goesHome ? now + rand(0.35, 0.95) : 0,
    });
    l.vx = vx;
    l.vy = vy;
    l.phase = rand(0, TAU);
    if (!goesHome) l.ground = false;
  }
  staticDirty = true;
}

// ---------------------------------------------------------------- pointer: breeze, kick, tap

const ptr = { x: 0, y: 0, lx: 0, ly: 0, has: false, moved: false, down: false, downX: 0, downY: 0, downT: 0, maxMove: 0, lastMoveT: -10, samples: [] };

function replaceLeaf(l, delay) {
  // a fresh leaf drifts down to fill the gap in the word
  const nl = newLeaf(makeLook());
  Object.assign(nl, { slot: l.homeSlot || l.slot, lx: l.lx, ly: l.ly, lsize: l.lsize, lrot: l.lrot + rand(-0.3, 0.3) });
  if (!nl.slot) return;
  startFall(nl, delay, randWind());
  leaves.push(nl);
  staticDirty = true;
}

// ---- sunlight spot that follows the pointer, and lines drawn in the soil while dragging

const spot = { x: 0, y: 0, amt: 0 };
function updateSpot(dt) {
  // desktop: the patch follows the mouse as before (pressing changes nothing);
  // phones: it appears under a pressing finger, except on a character, so a long press never lights the leaves up
  const pressingText = ptr.down && (wither.on || slotAt(ptr.downX, ptr.downY));
  const want = ptr.has && !whirl.on && (isMobile ? ptr.down && !pressingText : true) ? 0.85 : 0;
  spot.amt += (want - spot.amt) * (1 - Math.exp(-dt * 6));
  const k = 1 - Math.exp(-dt * 14);
  spot.x += (ptr.x - spot.x) * k;
  spot.y += (ptr.y - spot.y) * k;
  shared.uSpot.value.set((spot.x + W / 2) * DPR, (spot.y + H / 2) * DPR, spot.amt, clamp(Math.min(W, H) * 0.16, 70, 150) * DPR);
}

const groove = { cv: document.createElement('canvas'), ctx: null, tex: null, fadeAcc: 0, live: 0, sx: 1 };
groove.ctx = groove.cv.getContext('2d');
function resizeGroove() {
  const sc = Math.min(1, 1000 / Math.max(W, H));
  groove.sx = sc;
  groove.cv.width = Math.max(2, Math.round(W * sc));
  groove.cv.height = Math.max(2, Math.round(H * sc));
  if (groove.tex) groove.tex.dispose();
  groove.tex = new THREE.CanvasTexture(groove.cv);
  groove.tex.minFilter = THREE.LinearFilter;
  groove.tex.generateMipmaps = false;
  shared.uGroove.value = groove.tex;
}
// k: depth of the mark (1 = a firm, slow drag; lower = a quick, shallow swipe); wk: width factor
function grooveLine(ax, ay, bx, by, k = 1, wk = 1) {
  const c = groove.ctx, sc = groove.sx;
  const tx = (x) => (x + W / 2) * sc, ty = (y) => (H / 2 - y) * sc;
  c.globalCompositeOperation = 'source-over';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
  c.lineWidth = 17 * sc * wk;
  c.beginPath();
  c.moveTo(tx(ax), ty(ay));
  c.lineTo(tx(bx), ty(by));
  c.stroke();
  c.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
  c.lineWidth = 9 * sc * wk;
  c.stroke();
  groove.live = 12;
  groove.tex.needsUpdate = true;
}
function updateGroove(dt) {
  if (groove.live <= 0) return;
  groove.live -= dt;
  groove.fadeAcc += dt;
  if (groove.fadeAcc > 0.12) {
    // the soil slowly settles back
    groove.fadeAcc = 0;
    const c = groove.ctx;
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.03)'; // a walked trail stays readable for a little while, then settles
    c.fillRect(0, 0, groove.cv.width, groove.cv.height);
    c.globalCompositeOperation = 'source-over';
    if (groove.live <= 0) c.clearRect(0, 0, groove.cv.width, groove.cv.height);
    groove.tex.needsUpdate = true;
  }
}

function applyPointer(dt) {
  updateSpot(dt);
  updateGroove(dt);
  if (!ptr.moved || !ptr.has) return;
  ptr.moved = false;
  const ax = ptr.lx, ay = ptr.ly;
  ptr.lx = ptr.x;
  ptr.ly = ptr.y;
  // desktop: a mouse gliding over the ground (no button) turns the leaves it brushes, like a hand skimming them
  if (!ptr.down && ptr.mouse && !isMobile) hoverFlip(ax, ay, ptr.x, ptr.y);
  // drag (not a hold): footprints in the soil; a fast drag is running (longer, lighter strides)
  if (ptr.down && !whirl.on && !wither.on && ptr.maxMove > 10 && Math.hypot(ptr.x - ax, ptr.y - ay) > 0.3) {
    walkPrints(ax, ay, ptr.x, ptr.y, swipeVelocity().speed > SWIPE_FAST);
  }
}

// ---------------------------------------------------------------- footprints along a drag

const walk = { dist: 0, side: 1, lastDown: -1 };
const shoeLen = () => clamp(Math.min(W, H) * 0.1, 42, 68);

// press one shoe print into the soil (carved into the groove layer: shaded on the sun side, lit on the far wall)
function shoePrint(x, y, ang, depth) {
  const c = groove.ctx, sc = groove.sx;
  const L = shoeLen() * sc, Wd = L * 0.42;
  c.save();
  c.translate((x + W / 2) * sc, (H / 2 - y) * sc);
  c.rotate(-ang + Math.PI / 2); // canvas y points down; the toe faces the walking direction
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = `rgba(255,255,255,${depth})`;
  // sole: wide ball of the foot, narrow waist, round heel
  c.beginPath();
  c.ellipse(0, -L * 0.22, Wd * 0.5, L * 0.3, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(0, L * 0.3, Wd * 0.4, L * 0.2, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(0, L * 0.05, Wd * 0.3, L * 0.22, 0, 0, Math.PI * 2);
  c.fill();
  // a few tread bars pressed a little deeper
  c.fillStyle = `rgba(255,255,255,${0.3 * depth})`;
  for (let k = 0; k < 4; k++) c.fillRect(-Wd * 0.4, -L * 0.42 + k * L * 0.1, Wd * 0.8, L * 0.035);
  for (let k = 0; k < 2; k++) c.fillRect(-Wd * 0.3, L * 0.22 + k * L * 0.1, Wd * 0.6, L * 0.035);
  c.restore();
  groove.live = 12;
  groove.tex.needsUpdate = true;
  // the pressed soil is also a little damper and darker than the loose surface around it
  let shoes = 0;
  for (let i = wet.prints.length - 1; i >= 0; i--) if (wet.prints[i].shoe && ++shoes > 40) wet.prints.splice(i, 1);
  wet.prints.push({ x, y, a: shoeLen() * 0.5, b: shoeLen() * 0.2, ang: ang - Math.PI / 2, t0: now, k: 0.5 * depth, shoe: true, times: [0, 0.12, 4.5, 7.5] });
  wet.dirty = true;
  playStep(depth);
}

// walk a trail of alternating left/right prints along the drag; running (fast swipe) = lighter, longer strides
function walkPrints(ax, ay, bx, by, fast) {
  if (walk.lastDown !== ptr.downT) {
    walk.lastDown = ptr.downT;
    walk.dist = shoeLen(); // the first print lands straight away
  }
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const ux = dx / len, uy = dy / len;
  const stride = shoeLen() * (fast ? 2.1 : 1.35);
  let travelled = 0;
  while (walk.dist + (len - travelled) >= stride) {
    const step = stride - walk.dist;
    travelled += step;
    walk.dist = 0;
    const px = ax + ux * travelled - uy * walk.side * shoeLen() * 0.26;
    const py = ay + uy * travelled + ux * walk.side * shoeLen() * 0.26;
    shoePrint(px, py, Math.atan2(uy, ux) + rand(-0.08, 0.08), fast ? 0.6 : 1);
    walk.side = -walk.side;
  }
  walk.dist += len - travelled;
}

// ---------------------------------------------------------------- drag speed

const SWIPE_FAST = 1100; // px/s: faster drags leave running strides

// speed and direction of the pointer over the last ~0.1 s
function swipeVelocity() {
  const sm = ptr.samples;
  const last = sm[sm.length - 1] || { t: now, x: ptr.x, y: ptr.y };
  let first = last;
  for (let i = sm.length - 1; i >= 0; i--) {
    first = sm[i];
    if (last.t - sm[i].t > 0.1) break;
  }
  const dt = Math.max(1 / 120, last.t - first.t);
  const dx = last.x - first.x, dy = last.y - first.y;
  const len = Math.hypot(dx, dy) || 1;
  return { speed: len / dt, ux: dx / len, uy: dy / len, x0: first.x, y0: first.y, x1: last.x, y1: last.y };
}

function windDust(x, y, ux, uy, s, n) {
  for (let i = 0; i < n && puffList.length < DUSTN; i++) {
    const sp = rand(50, 160) * (0.6 + s);
    const a = Math.atan2(uy, ux) + rand(-0.6, 0.6);
    puffList.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rand(0.7, 1.3), s0: rand(4, 8), drag: 1.2 });
  }
}

// leaves brushed by the moving mouse are flicked over: each one lifts a little, turns over once about its own
// axis (in the direction the mouse travels) and lands on its other side, a few pixels further along
function hoverFlip(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  const R = clamp(unitS * 0.26, 22, 48);
  const x0 = Math.min(ax, bx) - R, x1 = Math.max(ax, bx) + R, y0 = Math.min(ay, by) - R, y1 = Math.max(ay, by) + R;
  for (const l of leaves) {
    if (l.state !== REST || l.hop || l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
    if (now - (l.flipT || -9) < 1.0) continue; // just turned: leave it be
    const t = clamp(((l.x - ax) * ux + (l.y - ay) * uy) / len, 0, 1);
    const d = Math.hypot(l.x - (ax + dx * t), l.y - (ay + dy * t));
    if (d > R) continue;
    l.flipT = now;
    const q = 1 - d / R;
    if (Math.random() > 0.7 + 0.3 * q) {
      // at the edge of the touch: just a little lift of the rim
      l.hop = { t0: now, D: 0.45, h: rand(4, 8), dx: 0, dy: 0, flip: 0, wob: sign() * rand(0.6, 1.0), spin: rand(-0.3, 0.3) };
      continue;
    }
    // turn about the leaf's local x axis, choosing the sense that rolls it along the mouse's direction
    const ly = -Math.sin(l.rz) * ux + Math.cos(l.rz) * uy; // travel direction along the leaf's own y axis
    const turn = (ly >= 0 ? -1 : 1) * Math.PI;
    const push = l.slot ? 0 : rand(8, 18) * (0.5 + q); // letter leaves turn in place so the letters stay crisp
    l.hop = {
      t0: now + t * 0.05, D: rand(0.6, 0.75), h: rand(18, 30) * (0.6 + 0.4 * q), dx: ux * push, dy: uy * push,
      flip: turn, wob: 0, spin: rand(-0.6, 0.6), keep: true,
    };
  }
}

// squirrel paw prints: two small fore prints behind, two long hind prints ahead
function stampPrints(x, y, heading, L) {
  if (!groove.tex) return;
  const c = groove.ctx, sc = groove.sx;
  const fx = -Math.sin(heading), fy = Math.cos(heading); // forward
  const rx = Math.cos(heading), ry = Math.sin(heading); // right
  const u = L / 120;
  const dot = (ox, oy, rw, rh) => {
    const px = x + rx * ox * u + fx * oy * u, py = y + ry * ox * u + fy * oy * u;
    c.save();
    c.translate((px + W / 2) * sc, (H / 2 - py) * sc);
    c.rotate(-heading);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.ellipse(0, 0, rw * u * sc, rh * u * sc, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  dot(-4, -6, 1.8, 2.2);
  dot(4, -4, 1.8, 2.2);
  dot(-9, 12, 2.2, 4.2);
  dot(9, 14, 2.2, 4.2);
  groove.live = 12;
  groove.tex.needsUpdate = true;
}

// gentle bounce of resting leaves (used by the squirrel's paws)
function nudge(x, y, r) {
  for (const l of leaves) {
    if (l.state !== REST || l.hop) continue;
    const d = Math.hypot(l.x - x, l.y - y);
    if (d > r) continue;
    const q = 1 - d / r;
    const a = Math.atan2(l.y - y, l.x - x);
    const push = q * rand(4, 10);
    l.hop = { t0: now, D: 0.3 + q * 0.18, h: q * rand(14, 30), dx: Math.cos(a) * push, dy: Math.sin(a) * push, flip: Math.random() < 0.2 * q ? TAU * sign() : 0, wob: rand(-0.8, 0.8), spin: rand(-0.6, 0.6) };
  }
}

function slotAt(x, y) {
  for (const s of slots) {
    if (s.kind !== 'char' || s.dying) continue;
    if (Math.abs(x - s.cx) < (s.adv * s.S) / 2 && Math.abs(y - s.cy) < s.S * 0.55) return s;
  }
  return null;
}
let lastTap = { t: -10, x: 0, y: 0 };
function tapAt(x, y) {
  // double tap anywhere: bury everything under falling leaves, then a wind clears it all away
  const dbl = now - lastTap.t < 0.3 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40;
  lastTap = { t: now, x, y };
  if (bury.on) {
    if (!dbl) treadMound(x, y); // a footprint in the leaf mound; the burial runs on regardless
    return;
  }
  if (dbl) {
    // a double tap never drops pine cones: cancel the one the first tap was about to drop
    pendingCone = 0;
    lastTap.t = -10;
    if (slots.some((sl) => sl.kind === 'char' && !sl.dying)) startBury(); // (with no text there is nothing to bury)
    return;
  }
  // tapping a ladybird, the snail or the squirrel makes it react, and nothing else happens there
  const hitBug = bugs.tap(x, y) || squirrel.tap(x, y);
  // a short tap on a character is a footstep on that pile of leaves
  const onSlot = slotAt(x, y);
  if (onSlot && !hitBug) {
    stomp(x, y, onSlot);
    return;
  }
  // a tap on open ground drops a pine cone (the squirrel will come for it) - but only a single tap: it waits
  // a moment to be sure no second tap follows
  if (!hitBug) {
    const id = ++coneSeq;
    pendingCone = id;
    after(0.3, () => {
      if (pendingCone === id) groundTap(x, y, false);
    });
    return;
  }
  groundTap(x, y, true);
}
let pendingCone = 0, coneSeq = 0;
// the leaves around jump when the cone lands about half a second later (or just a little when a bug was tapped)
function groundTap(x, y, hitBug) {
  const dropped = !hitBug && squirrel.addAcorn(x, y);
  const landDelay = dropped ? 0.5 : 0;
  if (dropped) after(landDelay, () => playConeDrop(1));
  const R = (hitBug ? 0.6 : 1) * (60 + unitS * 0.35);
  for (const l of leaves) {
    if (l.state !== REST) continue;
    const d = Math.hypot(l.x - x, l.y - y);
    if (d > R) continue;
    const q = 1 - d / R;
    const out = Math.atan2(l.y - y, l.x - x);
    l.hop = {
      t0: now + landDelay + d / 380,
      D: 0.38 + q * 0.3,
      h: Math.pow(q, 0.7) * rand(30, 80),
      dx: Math.cos(out) * q * rand(3, 12),
      dy: Math.sin(out) * q * rand(3, 12),
      flip: Math.random() < 0.45 * q ? TAU * sign() : 0,
      wob: rand(-0.6, 0.6),
      spin: rand(-0.7, 0.7),
    };
  }
}

// ---------------------------------------------------------------- trampling (tap on a character)

function wiggle(x, y, r, k = 1) {
  // a passing animal makes the leaves it touches tremble
  for (const l of leaves) {
    if (l.state !== REST || l.hop) continue;
    const d = Math.hypot(l.x - x, l.y - y);
    if (d > r) continue;
    const q = (1 - d / r) * k;
    const a = Math.atan2(l.y - y, l.x - x);
    l.vx += Math.cos(a) * 70 * q; // nudged out of the way
    l.vy += Math.sin(a) * 70 * q;
    l.fav += rand(-5, 5) * q;     // tipped up and rocking
    l.fzv += rand(-2.5, 2.5) * q;
    l.vz += 110 * q;
    l.active = true;
  }
}

function seededRand(seed) {
  let s = (seed * 4294967296) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// break one leaf into 3-6 wedge pieces; under a footstep every piece is squeezed out and sprays away
// from the centre of the step, tumbling, then lands scattered around the spot
let crushEnds = []; // when each piece of the current stomp has mostly sunk away

// one piece of a leaf (a wedge a0..a1 of it, or the whole leaf) that flies along `fly` and then sinks into the soil
function makePiece(l, a0, a1, scale, fly, sinkStart, sinkDur, whole = false) {
  const f = newLeaf({
    cell: l.cell, colA: l.colA, colB: l.colB, green: l.green, seed: l.seed, sizeMul: l.sizeMul, curlL: l.curlL, curlW: l.curlW, ctype: l.ctype,
  });
  f.state = FRAG;
  f.x = l.x;
  f.y = l.y;
  f.z = l.z;
  f.rx = l.rx;
  f.ry = l.ry;
  f.rz = l.rz;
  f.size = l.size * scale;
  f.alpha = l.alpha;
  f.age = l.age || 0; // keeps its withered look
  f.dark = 0;
  f.soil = 0;
  const fromText = !!l.slot;
  f.fg = {
    t0: now, a0, a1, jag: l.seed, mid: (a0 + a1) / 2, fromText, halo: fromText ? 1 : 0, whole,
    sep: whole ? 0 : rand(0.05, 0.12) * l.size, rot: rand(-0.3, 0.3),
    x0: l.x, y0: l.y, z0: l.z, rx0: l.rx, ry0: l.ry, rz0: l.rz, cl0: l.curlL, cw0: l.curlW, size0: l.size * scale,
    fly, sinkStart, sinkDur, flat: whole ? 0.25 : 1,
  };
  crushEnds.push(f.fg.t0 + sinkStart + sinkDur * 0.7); // ~70% sunk: dark, small, nearly gone
  leaves.push(f);
  return f;
}

// break one leaf into 3-6 wedge pieces; under a footstep every piece is squeezed out and sprays away
// from the centre of the step, tumbling, then lands scattered around the spot
function crushLeaf(l, fp, delay) {
  const R = seededRand(l.seed);
  const n = 3 + Math.floor(R() * 4);
  const base = R() * TAU;
  const cuts = [];
  for (let i = 0; i < n; i++) cuts.push(base + ((i + 0.3 + R() * 0.4) * TAU) / n);
  const d0 = Math.hypot(l.x - fp.x, l.y - fp.y);
  const near = 1 - clamp(d0 / fp.reach, 0, 1); // leaves right under the sole are pushed out furthest
  const out = d0 > 1 ? Math.atan2(l.y - fp.y, l.x - fp.x) : R() * TAU;
  const make = (a0, a1, scale, far) => {
    const a = out + (R() - 0.5) * 1.5;
    const dist = (rand(14, 40) + near * rand(24, 70)) * far * (fp.reach / 120);
    const fly = { h: rand(5, 22) * far, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, spin: rand(-6, 6) * far, flip: rand(-7, 7) * far, dur: rand(0.4, 0.62) };
    const f = makePiece(l, a0, a1, scale, fly, fly.dur + rand(0.15, 0.5), rand(1.3, 1.9));
    f.fg.t0 = now + delay;
    if (fp.wind) {
      // after landing, a breeze picks the piece up: pieces on the upwind side go first
      const w = fp.wind;
      const proj = (l.x - fp.x) * w.ux + (l.y - fp.y) * w.uy;
      const lift = scale < 0.6 ? 1.4 : 1; // crumbs are lighter
      f.fg.blow = {
        t: fly.dur + w.wait + clamp(proj / 500, -0.25, 0.4) + rand(0, 0.25),
        ux: w.ux + rand(-0.25, 0.25), uy: w.uy + rand(-0.25, 0.25),
        acc: rand(160, 320) * lift, v0: rand(10, 40), h: rand(15, 50) * lift,
        sway: rand(10, 30), om: rand(3, 6), ph: rand(0, TAU), spin: rand(-7, 7) * lift, flip: rand(-9, 9) * lift, fade: rand(1.4, 2.4),
      };
      crushEnds.pop();
      crushEnds.push(now + delay + f.fg.blow.t + 1.2); // most pieces have blown well clear by then
    }
  };
  // about a third of the pieces stay pressed into the spot where the leaf lay; the rest spray outward
  for (let i = 0; i < n; i++) make(cuts[i], i + 1 < n ? cuts[i + 1] : cuts[0] + TAU, 1, R() < 0.36 ? rand(0.04, 0.16) : 1);
  // crumbs: tiny shards flicked further out
  const m = R() < 0.55 ? 1 + Math.floor(R() * 2) : 0;
  for (let i = 0; i < m; i++) {
    const a0 = R() * TAU;
    make(a0, a0 + rand(0.5, 1.1), rand(0.3, 0.5), rand(1.4, 2));
  }
  l.dead = true;
}

function updateFrag(f) {
  const g = f.fg;
  const t = now - g.t0;
  if (t < 0) return;
  // 0 - 0.1 s: pressed flat and split along the cracks
  const sq = smooth(0, 0.1, t);
  const c = Math.cos(g.rz0), s = Math.sin(g.rz0);
  const ox = Math.cos(g.mid) * g.sep * sq, oy = Math.sin(g.mid) * g.sep * sq;
  let x = g.x0 + c * ox - s * oy, y = g.y0 + s * ox + c * oy;
  let z = g.z0 + (-5 - g.z0) * sq;
  f.curlL = g.cl0 * (1 - sq * g.flat);
  f.curlW = g.cw0 * (1 - sq * g.flat);
  f.rx = g.rx0 * (1 - sq);
  f.ry = g.ry0 * (1 - sq);
  f.rz = g.rz0 + g.rot * sq;
  f.dark = 0.6 * sq * g.flat;
  // pieces at the rim of the footprint spring up, tumble and land nearby (~0.6 s)
  if (g.fly) {
    const u = clamp((t - 0.02) / g.fly.dur, 0, 1);
    const e = 1 - Math.pow(1 - u, 2);
    x += g.fly.dx * e;
    y += g.fly.dy * e;
    z += g.fly.h * 4 * u * (1 - u);
    if (g.fly.bounce && u >= 1) {
      const s2 = t - 0.02 - g.fly.dur;
      z += g.fly.bounce * Math.exp(-s2 * 9) * Math.abs(Math.sin(s2 * 17)); // a little bounce, then still
    }
    f.rz += g.fly.spin * u;
    f.rx += g.fly.flip * u;
  }
  // stomped pieces: a breeze carries them away, tumbling, until they drift out of sight
  if (g.blow && t > g.blow.t) {
    const b = g.blow;
    const bt = t - g.blow.t;
    const dist = b.v0 * bt + 0.5 * b.acc * bt * bt;
    const sw = Math.sin(bt * b.om + b.ph) * b.sway * Math.min(1, bt);
    x += b.ux * dist - b.uy * sw;
    y += b.uy * dist + b.ux * sw;
    z += b.h * smooth(0, 0.6, bt) * (0.7 + 0.3 * Math.sin(bt * 4 + b.ph));
    f.rz += b.spin * bt;
    f.rx += b.flip * bt;
    f.ry = Math.sin(bt * b.om) * 0.6;
    g.halo = 0;
    f.soil = 0;
    f.size = g.size0 * (1 - 0.06 * sq);
    f.alpha = 1 - smooth(b.fade, b.fade + 0.8, bt);
    f.x = x;
    f.y = y;
    f.z = z;
    if (f.alpha <= 0 || Math.abs(x) > W / 2 + 120 || Math.abs(y) > H / 2 + 120) f.dead = true;
    return;
  }
  // then they slowly sink into the soil: darker, smaller, softer, finally gone
  const k = clamp((t - g.sinkStart) / g.sinkDur, 0, 1);
  const se = smooth(0, 1, k);
  if (g.soilRot) {
    // withered pieces are taken in by the soil: deep brown, then the soil's own colour and texture, eaten away
    // from the rim with a ragged edge, pressed flat and a little below the surface; never just faded out
    f.dark = 0.25 * Math.sin(Math.PI * Math.min(1, k * 1.3)); // only a touch darker, like damp leaf
    f.soil = smooth(0.1, 0.8, k);
    f.dis = smooth(0.25, 1, k);
    f.size = g.size0 * (1 - 0.1 * se) * (1 - 0.06 * sq);
    f.alpha = 1;
    f.x = x;
    f.y = y;
    f.z = z - 5 * se;
    if (f.dis >= 1) f.dead = true;
    return;
  }
  f.soil = se;
  g.halo = g.fromText ? (1 - sq * 0.6) * (1 - se) : 0;
  f.size = g.size0 * (1 - 0.45 * se) * (1 - 0.06 * sq);
  f.alpha = 1 - smooth(0.65, 1, k);
  f.x = x;
  f.y = y;
  f.z = z - 6 * se;
  if (k >= 1) f.dead = true;
}

// --- dust puffs: a few soft motes kicked up at the rim of the footprint
const DUSTN = 160;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUSTN * 3);
const dustAttr = new Float32Array(DUSTN * 2);
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
dustGeo.setAttribute('aD', new THREE.BufferAttribute(dustAttr, 2).setUsage(THREE.DynamicDrawUsage));
const puffs = new THREE.Points(
  dustGeo,
  new THREE.ShaderMaterial({
    uniforms: { uPx: { value: DPR } },
    vertexShader: /* glsl */ `
      attribute vec2 aD; // alpha, size
      uniform float uPx;
      varying float vA;
      void main(){ vA = aD.x; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); gl_PointSize = aD.y * uPx; }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.62, 0.52, 0.4, smoothstep(0.5, 0.0, d) * vA); }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }),
);
puffs.frustumCulled = false;
puffs.renderOrder = 1.7;
scene.add(puffs);
const puffList = [];
function spawnDust(fp) {
  const c = Math.cos(fp.ang), s = Math.sin(fp.ang);
  const n = 22 + ((Math.random() * 10) | 0);
  for (let i = 0; i < n && puffList.length < DUSTN; i++) {
    const a = rand(0, TAU);
    const rim = Math.random() < 0.75;
    const r = rim ? 1 : Math.sqrt(Math.random()) * 0.6; // most from the rim of the sole, some from under it
    const ex = Math.cos(a) * fp.b * r, ey = Math.sin(a) * fp.a * r;
    const x = fp.x + c * ex - s * ey, y = fp.y + s * ex + c * ey;
    const out = Math.atan2(y - fp.y, x - fp.x) + rand(-0.4, 0.4);
    const sp = rim ? rand(30, 90) : rand(10, 40);
    puffList.push({ x, y, vx: Math.cos(out) * sp, vy: Math.sin(out) * sp, t: 0, life: rand(0.8, 1.5), s0: rand(8, 16), drag: 2.2, a: rand(0.4, 0.6) });
  }
}
function updateDust(dt) {
  for (let i = puffList.length - 1; i >= 0; i--) {
    const d = puffList[i];
    d.t += dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= 1 - dt * d.drag;
    d.vy *= 1 - dt * d.drag;
    if (d.t > d.life) puffList.splice(i, 1);
  }
  for (let i = 0; i < DUSTN; i++) {
    const d = puffList[i];
    if (d) {
      const u = d.t / d.life;
      dustPos[i * 3] = d.x;
      dustPos[i * 3 + 1] = d.y;
      dustAttr[i * 2] = (d.a || 0.32) * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u);
      dustAttr[i * 2 + 1] = d.s0 * (1 + u * 2.2);
    } else dustAttr[i * 2] = 0;
  }
  dustGeo.attributes.position.needsUpdate = true;
  dustGeo.attributes.aD.needsUpdate = true;
}

// --- damp footprints left in the soil (soft shoe-sole stains that fade after a few seconds)
const wet = { cv: document.createElement('canvas'), ctx: null, tex: null, sc: 1, prints: [] };
wet.ctx = wet.cv.getContext('2d');
function resizeWet() {
  wet.sc = Math.min(1, 520 / Math.max(W, H));
  wet.cv.width = Math.max(2, Math.round(W * wet.sc));
  wet.cv.height = Math.max(2, Math.round(H * wet.sc));
  if (wet.tex) wet.tex.dispose();
  wet.tex = new THREE.CanvasTexture(wet.cv);
  wet.tex.minFilter = THREE.LinearFilter;
  wet.tex.generateMipmaps = false;
  shared.uWet.value = wet.tex;
}
function updateWet() {
  if (!wet.prints.length && !wet.dirty) return;
  // the damp patches change slowly: redraw/upload them ~12 times a second rather than every frame
  const spreading = wet.prints.some((p) => p.ring && now - p.t0 < 2.2);
  if (!wet.dirty && now - (wet.lastDraw || -1) < (spreading ? 0.04 : 0.08)) return;
  wet.lastDraw = now;
  const c = wet.ctx, sc = wet.sc;
  c.clearRect(0, 0, wet.cv.width, wet.cv.height);
  wet.dirty = false;
  for (let i = wet.prints.length - 1; i >= 0; i--) {
    const p = wet.prints[i];
    const t = now - p.t0;
    const sl = p.slow || 1; // some patches appear and fade more slowly
    const tm = p.times || [0.25 * sl, 1.6 * sl, 5 * sl, 8.5 * sl]; // fade in from..to, fade out from..to
    const a = smooth(tm[0], tm[1], t) * (1 - smooth(tm[2], tm[3], t)) * p.k;
    if (t > tm[3]) {
      wet.prints.splice(i, 1);
      wet.dirty = true;
      continue;
    }
    c.save();
    c.translate((p.x + W / 2) * sc, (H / 2 - p.y) * sc);
    c.rotate(-p.ang);
    const L = p.a * sc, Wd = p.b * sc;
    c.filter = 'none';
    c.globalAlpha = a;
    if (p.ring && t < 2.2) {
      // moisture spreading outward through the soil from where the leaves melt in
      const rr = (0.35 + (t / 2.2) * 0.95) * Math.max(L, Wd);
      c.globalAlpha = a > 0 ? Math.min(1, 0.5 * (1 - t / 2.2)) / Math.max(a, 0.001) * a : 0;
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = Math.max(2, rr * 0.18);
      c.beginPath();
      c.ellipse(0, 0, rr, rr * 0.9, 0, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = a;
    }
    if (p.blob) {
      // a soft, irregular damp patch
      for (let k = 0; k < 5; k++) {
        const grow = 0.55 + k * 0.12;
        c.fillStyle = `rgba(255,255,255,${0.26 - k * 0.04})`;
        c.beginPath();
        c.ellipse(Math.sin(k * 2.1) * Wd * 0.12, Math.cos(k * 1.7) * L * 0.1, L * grow, Wd * grow, k * 0.4, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      continue;
    }
    // sole: wide forefoot, narrow waist, round heel, with soft edges built from layered fills
    for (let k = 0; k < 4; k++) {
      const grow = 1 + k * 0.12;
      c.fillStyle = `rgba(255,255,255,${0.32 - k * 0.06})`;
      c.beginPath();
      c.ellipse(0, -L * 0.38, Wd * 0.95 * grow, L * 0.5 * grow, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(0, L * 0.58, Wd * 0.72 * grow, L * 0.36 * grow, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(0, L * 0.12, Wd * 0.6 * grow, L * 0.4 * grow, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  c.globalAlpha = 1;
  wet.tex.needsUpdate = true;
}

function stomp(x, y, slot) {
  initAudio();
  const S = slot.S;
  // one footstep flattens the whole pile: every leaf of the character breaks and sprays outward
  const wa = rand(0, TAU); // the breeze that carries the pieces off comes from a random direction
  const fp = { x, y, a: S * 0.46, b: S * 0.21, ang: rand(-0.35, 0.35), reach: S * 0.75, wind: { ux: Math.cos(wa), uy: Math.sin(wa), wait: rand(0.35, 0.6) } };
  let crushed = 0, dry = 0;
  crushEnds = [];
  for (const l of leaves.slice()) {
    if (l.dead) continue;
    const mine = l.slot === slot || l.homeSlot === slot;
    if (mine && l.state === FALL && now < l.fl.t0) {
      l.dead = true;
      continue;
    }
    const d = Math.hypot(l.x - x, l.y - y);
    if (mine && (l.state === REST || l.state === FALL || l.state === SWIRL || l.state === FREE)) {
      // a shock front: leaves nearest the heel break first
      crushLeaf(l, fp, (d / fp.reach) * 0.07);
      crushed++;
      dry++;
    } else if (l.state === REST && d < fp.reach * 0.8 && l.ground) {
      crushLeaf(l, fp, (d / fp.reach) * 0.07); // litter under the shoe breaks too
      crushed++;
    } else if (l.state === REST && d < fp.reach * 1.3) {
      // neighbouring letters are jolted
      const q = 1 - d / (fp.reach * 1.3);
      l.hop = { t0: now + 0.03, D: 0.3 + q * 0.2, h: q * rand(8, 22), dx: 0, dy: 0, flip: 0, wob: rand(-0.6, 0.6), spin: rand(-0.4, 0.4) };
    }
  }
  spawnDust(fp);
  wet.prints.push({ x, y, a: fp.a, b: fp.b, ang: fp.ang, t0: now, k: 0.85 });
  wet.dirty = true;
  // a full, medium-dry crunch: plenty of leaves, between damp-soft and crisp
  playCrunch(clamp(0.72 + crushed / 450, 0.72, 0.95), 0.5);
  after(0.65, () => playFlyAway(0.5)); // the breeze taking the pieces away
  const wd = fp.wind;
  setTimeout(() => windDust(x, y, wd.ux, wd.uy, 0.4, 12), 650);
  // the character keeps its place until every piece has sunk into the soil; only then does it leave
  // the text and the following characters glide forward
  slot.dying = true;
  // move on once most pieces have mostly sunk, rather than waiting for the very last one
  crushEnds.sort((a, b) => a - b);
  const settled = crushEnds.length ? crushEnds[Math.floor(crushEnds.length * 0.8)] : now;
  slot.dieAt = Math.max(settled, now + 0.5);
  staticDirty = true;
}

function retireDeadSlots() {
  if (composing) return; // never rewrite the text in the middle of an IME composition
  for (let i = slots.length - 1; i >= 0; i--) {
    const sl = slots[i];
    if (!sl.dying || now < sl.dieAt) continue;
    slots.splice(i, 1);
    textChars.splice(i, 1);
    ime.value = textChars.join('');
    layout();
  }
}

// ---------------------------------------------------------------- withering (long press on a character)

const AGE_DUR = 0.6; // seconds for a pace-1 leaf to dry out completely (green takes longer, red less)
const wither = { on: false, slot: null, x: 0, y: 0, t: 0, spread: 100, nextCrumb: 0 };

const withering = []; // characters drying out: once started, a character withers all the way, finger or not

function startWither(slot, x, y) {
  initAudio();
  ptr.longPressed = true;
  slot.withering = true;
  slot.wl = { t0: now, marks: new Map(), lastSnap: 0, lastSoil: 0, nextRustle: now + rand(0.2, 0.4) };
  for (const l of leaves) {
    // leaves of this character that are still to land are dropped, and any that had drifted off stay away,
    // so nothing comes back late and holds the ending up
    if (l.slot === slot && l.state === FALL && now < l.fl.t0) l.dead = true;
    if (l.homeSlot === slot && l.state === FREE) {
      l.homeSlot = null;
      if (l.fr) l.fr.returnAt = 0;
    }
  }
  withering.push(slot);
  Object.assign(wither, { on: true, slot, x, y, progress: 0 });
  // a faint warm glow rings out from the finger across the character, then fades: it has begun
  Object.assign(glow, { x, y, t0: now, reach: slot.S * slot.adv * 0.75 + slot.S * 0.3 });
}

// small app-clock timeline (so everything here follows the animation clock, not wall-clock timers)
const later = [];
function after(sec, fn) {
  later.push({ at: now + sec, fn });
}
function runLater() {
  for (let i = later.length - 1; i >= 0; i--) {
    if (now < later[i].at) continue;
    const e = later.splice(i, 1)[0];
    e.fn();
  }
}

// a brittle leaf lets go and twirls slowly down to the soil
// a small dry flake breaks off the rim of a leaf
function flakeCrumb(l) {
  const a0 = rand(0, TAU), a = rand(0, TAU), d = rand(8, 24);
  const fly = { h: rand(8, 18), dx: Math.cos(a) * d, dy: Math.sin(a) * d, spin: rand(-8, 8), flip: rand(-8, 8), dur: rand(0.6, 0.9) };
  makePiece(l, a0, a0 + rand(0.4, 0.9), rand(0.25, 0.4), fly, fly.dur + rand(0.4, 0.9), rand(2.2, 3.0));
  staticDirty = true;
}

// Rotting into the soil. There is no "whole character" moment: every leaf starts rotting the instant it has
// fully dried, so drying flows straight on into decay with no pause. Once the first leaf has started to rot
// the character is committed and finishes by itself, even if the finger lifts.
const PRE_SOIL = 0.22; // how far toward the soil a dried leaf has already leaned when it starts to rot
const ROT_SOIL = 1.5;  // seconds for a rotting leaf to reach the soil's own colour
const rotting = [];    // committed characters still drying / rotting away

// the soil-colour lean of a drying leaf: linear over the last fifth of drying, so it hands over to the rot smoothly
const preSoil = (age) => PRE_SOIL * clamp((age - 0.8) / 0.2, 0, 1);

function rotLeaf(l) {
  l.state = SINK;
  l.hop = null;
  l.gw = null;
  l.soil = PRE_SOIL;
  l.dis = 0;
  l.dark = 0;
  l.sk = {
    t0: now, x0: l.x, y0: l.y, z0: l.z, rx0: l.rx, ry0: l.ry, rz0: l.rz, size0: l.size,
    dx: rand(-1.5, 1.5), dy: rand(-1.5, 1.5),
    dStart: rand(0.6, 0.9), // starts melting in once it already looks like soil
  };
}

function updateSink(l) {
  const g = l.sk;
  const t = now - g.t0;
  // it relaxes flat onto the ground (no bounce: wet, limp, heavy)
  const e = smooth(0, 0.7, t);
  l.rx = g.rx0 * (1 - e);
  l.ry = g.ry0 * (1 - e);
  l.rz = g.rz0;
  // the colour goes on from the drying lean toward dark humus and then the ground itself; ease-out so the
  // rate at the hand-over matches the drying lean (no hold, no lurch)
  const u = clamp(t / ROT_SOIL, 0, 1);
  l.soil = PRE_SOIL + (1 - PRE_SOIL) * (1 - (1 - u) * (1 - u));
  l.dark = 0.55 * Math.sin(Math.PI * Math.min(1, t / ROT_SOIL)); // darkens like wet decaying leaves on the way
  // finally it is taken into the soil from the rim inward and sinks a little
  l.dis = smooth(g.dStart, g.dStart + 1.0, t);
  const k = (l.soil - PRE_SOIL) / (1 - PRE_SOIL);
  l.size = g.size0 * (1 - 0.08 * k - 0.12 * l.dis);
  l.x = g.x0 + g.dx * e;
  l.y = g.y0 + g.dy * e;
  l.z = Math.max(-4, g.z0 * (1 - e) - 3 * l.dis);
  l.alpha = 1 - smooth(0.85, 1, l.dis);
  if (l.dis >= 1) l.dead = true; // only removed once fully taken in
}

// A fully dried leaf breaks into 3-6 pieces plus a few crumbs. They part a little, tumble the short way down
// to the soil with a small bounce, and lie there; then, staggered as a soft wave across the character, the soil
// takes them in (see updateFrag: colour -> humus -> soil, a ragged dissolve from the rim, sinking slightly).
function shatterLeaf(l, slot) {
  const wl = slot.wl;
  const R = seededRand(l.seed * 7.13 + 1);
  const n = 3 + Math.floor(R() * 4);
  const base = R() * TAU;
  const cuts = [];
  for (let i = 0; i < n; i++) cuts.push(base + ((i + 0.3 + R() * 0.4) * TAU) / n);
  // the melting runs as a soft wave from one end of the character to the other
  if (wl.dir === undefined) wl.dir = Math.random() < 0.5 ? 1 : -1;
  const along = clamp(0.5 + (l.lx / Math.max(0.3, slot.adv)) * wl.dir, 0, 1);
  const sink0 = 0.03 + along * 0.12;
  const reach = l.size / 22;
  const piece = (a0, a1, scale, dist, h, dur) => {
    const mid = l.rz + (a0 + a1) / 2;
    const fly = { h, dx: Math.cos(mid) * dist, dy: Math.sin(mid) * dist, spin: rand(-1.4, 1.4), flip: rand(-2.6, 2.6), dur, bounce: rand(1.5, 3) };
    const f = makePiece(l, a0, a1, scale, fly, dur + sink0 + rand(0, 0.04), rand(0.45, 0.55));
    f.fg.soilRot = true;
    f.fg.halo = 0;
    f.fg.fromText = false; // once broken off it is litter: no letter highlight, the ground's own light
  };
  for (let i = 0; i < n; i++) piece(cuts[i], i + 1 < n ? cuts[i + 1] : cuts[0] + TAU, 1, rand(2, 6) * reach, rand(3, 6), rand(0.26, 0.32));
  for (let i = 0, m = 2 + Math.floor(R() * 2); i < m; i++) {
    const a0 = R() * TAU;
    piece(a0, a0 + rand(0.4, 0.8), rand(0.22, 0.32), rand(4, 12) * reach, rand(2, 5), rand(0.28, 0.36));
  }
  l.dead = true;
  staticDirty = true;
  if (now - wl.lastSnap > 0.06) {
    wl.lastSnap = now;
    playSnap(0.25);
  }
  // the soil where the pieces go in turns dark and damp for a while, and loosens into small clods
  const key = Math.round(l.lx * 5) + ',' + Math.round(l.ly * 5);
  if (!wl.marks.has(key)) {
    wl.marks.set(key, now);
    const S = slot.S, at = 0.4 + sink0;
    wet.prints.push({ x: l.x, y: l.y, a: S * 0.13, b: S * 0.11, ang: rand(0, TAU), t0: now, k: 0.42, blob: true, times: [at, at + 1.0, at + 2.6, at + 5.5] });
    wet.dirty = true;
    const x = l.x, y = l.y;
    [0.2, 0.6, 1.0].forEach((d) => after(at + d, () => soilGrains(x, y, S * 0.13)));
  }
}

// loosened earth: a scatter of small crumbly clods and a couple of hairline cracks, pressed into the relief map
function soilGrains(x, y, r) {
  const c = groove.ctx, sc = groove.sx;
  const px = (vx) => (vx + W / 2) * sc, py = (vy) => (H / 2 - vy) * sc;
  for (let i = 0; i < 7; i++) {
    const a = rand(0, TAU), d = r * Math.sqrt(Math.random());
    const cx = px(x + Math.cos(a) * d), cy = py(y + Math.sin(a) * d), rr = rand(1.1, 3.2) * sc;
    c.fillStyle = `rgba(255,255,255,${rand(0.22, 0.42)})`;
    c.beginPath();
    c.ellipse(cx, cy, rr, rr * rand(0.6, 1), rand(0, TAU), 0, TAU);
    c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.lineWidth = Math.max(0.6, 0.9 * sc);
  for (let i = 0; i < 2; i++) {
    const a = rand(0, TAU), d = rand(0, r * 0.7), len = rand(0.5, 1.1) * r;
    let qx = x + Math.cos(a) * d, qy = y + Math.sin(a) * d, h = rand(0, TAU);
    c.beginPath();
    c.moveTo(px(qx), py(qy));
    for (let k = 0; k < 4; k++) {
      h += rand(-0.7, 0.7);
      qx += (Math.cos(h) * len) / 4;
      qy += (Math.sin(h) * len) / 4;
      c.lineTo(px(qx), py(qy));
    }
    c.stroke();
  }
  groove.live = Math.max(groove.live, 9);
  groove.tex.needsUpdate = true;
}

// once every leaf of a character has broken up, it leaves the text; the following characters start gliding
// over when the soil has taken in about 60% of the pieces
function checkWitherDone(slot) {
  if (slot.dying) return;
  for (const l of leaves) if (l.slot === slot && !l.dead && (l.state === REST || l.state === FALL)) return;
  // every leaf has broken up: the following characters glide over while the last pieces melt in
  slot.dying = true;
  slot.dieAt = now + 0.45; // the following characters move up as the last pieces go in
  after(0.35, () => playRustle(0.35)); // a last soft rustle as it goes in
}

function updateWither(dt) {
  // a long press (~350 ms, moving less than ~10 px) on a character sets it withering
  if (!wither.on && ptr.down && !ptr.longPressed && now - ptr.downT > 0.35 && ptr.maxMove < 10) {
    const slot = slotAt(ptr.downX, ptr.downY);
    if (slot && !slot.withering) startWither(slot, ptr.downX, ptr.downY);
  }
  if (wither.on && !ptr.down) wither.on = false; // only the faint glow follows the finger
  for (let i = withering.length - 1; i >= 0; i--) {
    const slot = withering[i];
    const wl = slot.wl;
    const t = now - wl.t0;
    // the whole character dries at once, each leaf by its own colour: red first, then orange and yellow,
    // green last (green flushes red before it browns); the last few are hurried so the end never drags
    const hurry = 1 + 3 * smooth(0.9, 1.25, t); // the last leaves are hurried along
    let alive = 0, ageSum = 0, broke = false;
    for (const l of leaves) {
      if (l.slot !== slot || l.dead || (l.state !== REST && l.state !== FALL)) continue;
      alive++;
      if (t > WITHER_DELAY[l.ctype] + (l.seed % 1) * 0.08) l.age = Math.min(1, l.age + (dt * l.wrate * hurry) / AGE_DUR);
      ageSum += l.age;
      if (l.age >= 1 && l.state === REST) {
        shatterLeaf(l, slot);
        broke = true;
      }
    }
    if (wither.slot === slot) wither.progress = alive ? ageSum / alive : 1;
    if (alive && now > wl.nextRustle) {
      wl.nextRustle = now + rand(0.026, 0.04); // a dense, fine crackle, about 30 a second
      playCrinkle(0.6 + 0.4 * Math.random()); // the dry, papery crinkle of leaves curling
    }
    if (broke) checkWitherDone(slot);
    if (!alive || slot.dying || !slots.includes(slot)) withering.splice(i, 1);
  }
}

// a faint wisp of fine soil lifting where a leaf melts into the ground
function soilWisp(x, y) {
  if (puffList.length >= DUSTN) return;
  const a = rand(0, TAU), sp = rand(6, 18);
  puffList.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rand(0.9, 1.5), s0: rand(6, 11), drag: 1.5, a: rand(0.22, 0.34) });
}

// a faint warm glow where the finger presses, widening as the character withers; fades after release
const glow = { x: 0, y: 0, amt: 0, r: 0 };
function updateGlow() {
  // a single soft pulse when withering starts: rings out across the character and fades (ground only)
  const t = now - (glow.t0 ?? -9);
  const amt = smooth(0, 0.12, t) * (1 - smooth(0.3, 0.9, t));
  const r = 20 + (glow.reach || 60) * smooth(0, 0.8, t);
  shared.uGlow.value.set((glow.x + W / 2) * DPR, (glow.y + H / 2) * DPR, Math.max(1, r) * DPR, amt * 0.09);
}

// ---------------------------------------------------------------- bury & blow (double tap): clears all the text

const bury = { on: false, phase: '', t0: 0, box: null, dir: 1, windT0: 0, slideNext: 0 };
const BURY_FALL = 1.6, BURY_REST = 0.05, BURY_WIND = 1.15; // covered by 1.6 s, a 0.2 s pause (the gust needs ~0.15 s to reach the heap), 1.4 s of wind: cleared at 3.2 s

// The heap is a union of soft, lumpy mounds - one around each character (or one in the middle if there is
// no text) - so its outline follows the words with an irregular natural edge instead of a hard shape.
function moundAt(x, y) {
  // returns the normalised distance to the heap's edge (< 1 inside), using the nearest lumpy mound
  let best = 9;
  for (const m of bury.mounds) {
    const dx = (x - m.x) / m.rx, dy = (y - m.y) / m.ry;
    const a = Math.atan2(dy, dx);
    const wob = 1 + 0.16 * Math.sin(3 * a + m.p1) + 0.09 * Math.sin(5 * a + m.p2) + 0.05 * Math.sin(9 * a + m.p1 * 2);
    best = Math.min(best, Math.hypot(dx, dy) / wob);
  }
  return best;
}

// one leaf of the heap: falls from the canopy onto a point of it, resting at the heap's height there
// where a heap leaf lands: a random point inside the heap, at the heap's height there
function pileSpot() {
  const b = bury.box;
  let x = 0, y = 0, d = 0;
  for (let k = 0; k < 30; k++) {
    x = rand(b.x0, b.x1);
    y = rand(b.y0, b.y1);
    d = moundAt(x, y);
    if (d <= 1) break;
  }
  // even height across the heap, a little lumpy, tapering only at the rim
  const rim = 1 - smooth(0.7, 1, d);
  const gz = 3 + (0.35 + 0.65 * rim) * 22 * (0.8 + 0.4 * Math.sin(x * 0.03 + y * 0.02) * Math.cos(y * 0.025));
  return { x, y, gz };
}

// one leaf of the heap: falls from the canopy onto its spot of the heap
function pileLeaf(delay, S, spot = pileSpot()) {
  const l = newLeaf(makeLook());
  l.pile = true;
  l.gx = spot.x;
  l.gy = spot.y;
  l.gz = spot.gz;
  l.gsize = (S || unitS) * rand(0.14, 0.22) * l.sizeMul; // fewer, slightly bigger leaves make the same thick heap
  l.lrot = rand(0, TAU);
  l.tiltX = rand(-0.5, 0.5);
  l.tiltY = rand(-0.5, 0.5);
  startFall(l, delay, randWind());
  l.fl.D = rand(0.6, 0.75); // a quick, dense shower
  // they come from lower in the canopy, so they aren't drawn huge (and expensive) while falling
  l.fl.zH = rand(170, 300);
  l.z = l.fl.zH;
  leaves.push(l);
  staticDirty = true;
  return l;
}

function startBury() {
  initAudio();
  wither.on = false;
  // the heap covers the text (or the middle of the screen if there is none), plus a margin
  // one lumpy mound per character, wide enough to overlap its neighbours into a single heap
  const mounds = [];
  for (const sl of slots) {
    if (sl.kind !== 'char' || sl.dying) continue;
    const r = sl.S * 0.78;
    mounds.push({ x: sl.cx, y: sl.cy, rx: r * rand(1.0, 1.15), ry: r * rand(0.95, 1.1), p1: rand(0, TAU), p2: rand(0, TAU) });
  }
  if (!mounds.length) mounds.push({ x: 0, y: blockCenterY, rx: Math.min(W, H) * 0.26, ry: Math.min(W, H) * 0.2, p1: rand(0, TAU), p2: rand(0, TAU) });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const m of mounds) {
    x0 = Math.min(x0, m.x - m.rx * 1.3);
    x1 = Math.max(x1, m.x + m.rx * 1.3);
    y0 = Math.min(y0, m.y - m.ry * 1.3);
    y1 = Math.max(y1, m.y + m.ry * 1.3);
  }
  const box = { x0, x1, y0, y1 };
  Object.assign(bury, { on: true, phase: 'fall', t0: now, box, mounds, dir: Math.random() < 0.5 ? -1 : 1, slideNext: 0 });
  for (const sl of slots) sl.buried = true;
  // the heap's real area (estimated by sampling), so the leaf count keeps the thickness the same at any size
  let inside = 0;
  for (let k = 0; k < 600; k++) if (moundAt(rand(x0, x1), rand(y0, y1)) <= 1) inside++;
  const area = (x1 - x0) * (y1 - y0) * (inside / 600);
  const BURY_DENSITY = 1 / 135; // leaves per square pixel: the heap is equally thick for one word or a whole sentence
  const n = Math.round(Math.min(area * BURY_DENSITY, isMobile ? 1500 : 2600)); // the cap is only a safety limit
  // choose every spot now, lowest layers first (so the upper leaves of the heap are drawn on top), but create
  // the leaves themselves a slice per frame over the first few frames, so the double tap never stalls a frame
  const spots = [];
  for (let i = 0; i < n; i++) spots.push(pileSpot());
  spots.sort((p, q) => p.gz - q.gz);
  leaves = leaves.filter((l) => !l.pile);
  bury.queue = spots.map((sp, i) => ({ sp, t0: now + (i / n) * 0.75 + rand(0, 0.1) })); // lower layers land first
  bury.qi = 0;
  feedBury();
  playArrive(1, 0.85); // the heap's leaves coming down: the breeze, then the gathering as they land
}

// a footprint in the leaf mound (sound and crumbs; the burial goes on)
function treadMound(x, y) {
  initAudio();
  const S = unitS;
  const wa = rand(0, TAU);
  const fp = { x, y, a: S * 0.4, b: S * 0.19, ang: rand(-0.35, 0.35), reach: S * 0.6, wind: { ux: Math.cos(wa), uy: Math.sin(wa), wait: 9 } };
  let n = 0;
  for (const l of leaves.slice()) {
    if (l.dead || !l.pile || l.state !== REST) continue;
    if (Math.hypot(l.x - x, l.y - y) < S * 0.32) {
      crushLeaf(l, fp, Math.hypot(l.x - x, l.y - y) / fp.reach * 0.07);
      n++;
    }
  }
  spawnDust(fp);
  playCrunch(clamp(0.6 + n / 200, 0.6, 0.9), 0.5);
}

function blowAway2(l) {
  const sp = rand(600, 1050);
  const p = freeParams({
    wx: bury.dir * sp, wy: rand(-70, 70), lift: rand(140, 260), liftDecay: 0.5, zT: rand(60, 140),
    swayA: rand(30, 60), omega: rand(3, 6), drag: 2.5, spin: sign() * rand(4, 11), flip: sign() * rand(5, 12),
  });
  toFree(l, p); // also detaches it from its character
  l.homeSlot = null;
  l.pile = false;
  l.vx = bury.dir * sp * 0.4;
  l.vy = rand(-40, 40);
}

// create the next slice of the heap's leaves (each keeps its planned landing time)
function feedBury() {
  const q = bury.queue;
  if (!q || bury.qi >= q.length) return;
  const per = Math.ceil(q.length / 8);
  for (let k = 0; k < per && bury.qi < q.length; k++, bury.qi++) {
    const it = q[bury.qi];
    const l = pileLeaf(0, unitS, it.sp);
    l.fl.t0 = it.t0;
  }
}

function updateBury(dt) {
  if (!bury.on) return;
  feedBury();
  const t = now - bury.t0;
  const b = bury.box;
  if (bury.phase === 'fall' && t > BURY_FALL) bury.phase = 'rest';
  if (bury.phase === 'rest') {
    // now and then a leaf slides off the top of the heap
    if (now > bury.slideNext) {
      bury.slideNext = now + rand(0.25, 0.6);
      const top = leaves.filter((l) => l.pile && l.state === REST && l.gz > 14);
      const l = top[(Math.random() * top.length) | 0];
      if (l) {
        const a = Math.atan2(l.y - (b.y0 + b.y1) / 2, l.x - (b.x0 + b.x1) / 2);
        l.hop = { t0: now, D: 0.5, h: 4, dx: Math.cos(a) * 10, dy: Math.sin(a) * 10, flip: 0, wob: rand(-0.4, 0.4), spin: rand(-0.6, 0.6) };
      }
    }
    if (t > BURY_FALL + BURY_REST) startBuryWind();
  }
  if (bury.phase === 'wind') {
    const tw = now - bury.windT0;
    for (const l of leaves) {
      if (l.dead) continue;
      // anything that has landed in the heap after the wind began goes with the wind straight away
      if (l.blowAt === undefined && l.pile && l.state === REST) l.blowAt = now;
      if (l.blowAt === undefined || now < l.blowAt) continue;
      if (l.state === REST || l.state === FALL || l.state === SWIRL) blowAway2(l);
      l.blowAt = undefined;
    }
    if (tw > BURY_WIND + 0.4 && !leaves.some((l) => l.pile && l.state !== FREE)) endBury();
  }
}

function startBuryWind() {
  bury.phase = 'wind';
  bury.windT0 = now;
  const b = bury.box;
  const startX = bury.dir > 0 ? b.x0 + 20 : b.x1 - 20; // the front starts right at the heap, so the wind is seen at once
  const speed = (b.x1 - b.x0 + 160) / 0.95;
  // the gust front crosses from one side; within the heap the top layers lift before the ones beneath
  const inBox = (l) => l.x > b.x0 - 60 && l.x < b.x1 + 60 && l.y > b.y0 - 60 && l.y < b.y1 + 60;
  for (const l of leaves) {
    if (l.dead) continue;
    const take = l.pile || l.slot || l.homeSlot || (l.ground && l.state === REST && inBox(l));
    if (l.state === FRAG) {
      // trodden or stomped pieces are swept off too
      const g = l.fg;
      const lead = Math.abs(l.x - startX) / speed;
      g.blow = { t: now - g.t0 + lead, ux: bury.dir, uy: rand(-0.15, 0.15), acc: rand(300, 500), v0: 40, h: rand(20, 50), sway: 15, om: 4, ph: rand(0, TAU), spin: rand(-8, 8), flip: rand(-9, 9), fade: rand(1.2, 2) };
      continue;
    }
    if (!take || l.state === FREE || l.state === SINK || l.state === VORTEX) continue;
    const zn = clamp((l.gz || 0) / 28, 0, 1);
    l.blowAt = now + Math.abs(l.x - startX) / speed + (1 - zn) * 0.15 + rand(0, 0.06); // the buried text goes with the leaves
  }
  // the ground is swept: cones, footprints and damp marks go; a few faint streaks of the wind remain
  squirrel.clearCones();
  wet.prints.length = 0;
  wet.dirty = true;
  groove.ctx.clearRect(0, 0, groove.cv.width, groove.cv.height);
  for (let i = 0; i < 6; i++) {
    const y = rand(b.y0, b.y1);
    const x0 = rand(b.x0, b.x1 - (b.x1 - b.x0) * 0.4), len = rand(80, 220);
    const xa = bury.dir > 0 ? x0 : x0 + len, xb = bury.dir > 0 ? x0 + len : x0;
    for (let k = 0; k < 5; k++) {
      const u0 = k / 5, u1 = (k + 1) / 5;
      grooveLine(xa + (xb - xa) * u0, y + Math.sin(u0 * 3) * 4, xa + (xb - xa) * u1, y + Math.sin(u1 * 3) * 4, 0.28 * (1 - k / 6), 0.6);
    }
  }
  groove.live = 6;
  groove.tex.needsUpdate = true;
  playFlyAway(1);
}

function endBury() {
  bury.on = false;
  bury.phase = '';
  // every character written before or during the burial is gone
  for (let i = slots.length - 1; i >= 0; i--) {
    if (!slots[i].buried) continue;
    slots.splice(i, 1);
    textChars.splice(i, 1);
  }
  ime.value = textChars.join('');
  layout();
  staticDirty = true;
}

// ---------------------------------------------------------------- idle life

let nextSwap = 2, nextGroundFall = 3;
function idleLife(dt) {
  // tiny random shivers keep the piles alive
  if (Math.random() < dt * 5 && leaves.length) {
    const l = leaves[(Math.random() * leaves.length) | 0];
    if (l.state === REST && !l.hop) {
      l.fav += rand(-2.4, 2.4);
      l.fzv += rand(-1, 1);
      l.active = true;
    }
  }
  if (now > nextSwap) {
    nextSwap = now + rand(1.1, 2.6);
    const picked = [];
    for (let tries = 0; tries < 40 && picked.length < (Math.random() < 0.35 ? 2 : 1); tries++) {
      const l = leaves[(Math.random() * leaves.length) | 0];
      if (!l || !l.slot || l.state !== REST || l.active || l.hop || now - l.settleT < 1.5 || l.age > 0 || l.slot.withering) continue;
      picked.push(l);
    }
    for (const l of picked) {
      // one leaf lifts off and drifts away; a new one lands on the same spot
      const a = rand(0, TAU), sp = rand(60, 150);
      l.homeSlot = l.slot;
      replaceLeaf(l, rand(0.4, 1.0));
      toFree(l, freeParams({
        wx: Math.cos(a) * sp, wy: Math.sin(a) * sp, lift: rand(120, 220), liftDecay: 1.2, zT: rand(90, 200),
        swayA: rand(30, 60), omega: rand(2, 3.5), drag: 1.6, spin: sign() * rand(0.8, 2.5), flip: sign() * rand(1, 4),
      }));
    }
  }
  // (no leaves fall on their own: they only come down when a space is typed)
  if (now > nextGroundFall) {
    let n = 0;
    for (const l of leaves) if (l.ground) n++;
    nextGroundFall = now + rand(3, 6);
    if (n > litterTarget * 1.2) {
      // the oldest litter quietly decays away
      const old = leaves.find((l) => l.ground && l.state === REST && !l.fadeOut);
      if (old) old.fadeOut = now;
    }
  }
}

// ---------------------------------------------------------------- GPU upload

function writeMatrix(a, o, x, y, z, rx, ry, rz, s) {
  const ca = Math.cos(rx), sa = Math.sin(rx), cb = Math.cos(ry), sb = Math.sin(ry), cc = Math.cos(rz), sc = Math.sin(rz);
  a[o] = (cc * cb - sc * sa * sb) * s;
  a[o + 1] = (sc * cb + cc * sa * sb) * s;
  a[o + 2] = -ca * sb * s;
  a[o + 3] = 0;
  a[o + 4] = -sc * ca * s;
  a[o + 5] = cc * ca * s;
  a[o + 6] = sa * s;
  a[o + 7] = 0;
  a[o + 8] = (cc * sb + sc * sa * cb) * s;
  a[o + 9] = (sc * sb - cc * sa * cb) * s;
  a[o + 10] = ca * cb * s;
  a[o + 11] = 0;
  a[o + 12] = x;
  a[o + 13] = y;
  a[o + 14] = z;
  a[o + 15] = 1;
}

function upload() {
  const n = leaves.length;
  if (n * 2 > cap) {
    let c = cap;
    while (c < n * 2) c *= 2;
    buildLeafMesh(c);
  }
  const m = leafMesh.instanceMatrix.array;
  const dyn = attr.dyn.array;
  const fx = attr.fx.array;
  const frag = attr.frag.array;
  const crush = attr.crush.array;
  for (let i = 0; i < n; i++) {
    const l = leaves[i];
    if (l.dead) {
      // gone, waiting for the next clean-up: simply not drawn
      attr.fx.array[i * 8] = attr.fx.array[i * 8 + 4] = 0;
      continue;
    }
    // top-down: the higher a leaf is, the closer it is to the camera
    const s = l.size * (1 + l.z * 0.0017);
    const o = i * 32;
    writeMatrix(m, o, l.x, l.y, l.z, l.rx, l.ry, l.rz, s);
    m.copyWithin(o + 16, o, o + 16);
    const d = i * 8;
    const off = l.size * 0.09 + 1.5 + l.z * 0.3;
    const soft = clamp(l.z / 300, 0, 1);
    dyn[d] = dyn[d + 4] = l.curlL;
    dyn[d + 1] = dyn[d + 5] = l.curlW;
    dyn[d + 2] = dyn[d + 6] = off;
    dyn[d + 3] = dyn[d + 7] = soft;
    // litter behind the words fades back so the letters read cleanly
    const dimT = l.ground && l.state === REST && inTextBox(l.x, l.y) ? 0.3 : 1;
    l.dim = l.dim === undefined ? dimT : l.dim + (dimT - l.dim) * 0.06;
    let isText = l.slot && (l.state === REST || l.state === FALL) ? 1 : 0;
    // a letter's leaves blown off keep the letter's look until they have lifted clear (no fade first)
    if (l.state === FREE && l.flyText) isText = 1 - smooth(0.1, 0.9, now - l.flyText);
    let halo = isText ? 1 - clamp(l.z / 20, 0, 1) : 0;
    // a fully dried leaf already leans toward the soil colour, so drying flows straight into sinking
    const pre = 0; // (the old soil lean of drying leaves is no longer used)
    if (l.state === SINK || pre > 0) {
      const so = l.state === SINK ? l.soil : pre;
      isText = 1 - so;
      halo = 1 - so;
    }
    // under the burying heap, the letters' own leaves dim into plain litter so no letter shape shows through
    if (bury.on && l.slot && l.slot.buried && l.state !== FREE) {
      const cov = smooth(0.4, 1.3, now - bury.t0);
      isText *= 1 - cov;
      halo *= 1 - cov;
      l.dim = Math.min(l.dim, 1 - 0.7 * cov);
    }
    const f = i * 8;
    // no shadows while a leaf is still in the air; only a contact shadow as it touches down
    const airborne = l.state === FALL || l.state === FREE || l.state === VORTEX || l.state === SWIRL;
    const shadowFade = airborne ? 1 - smooth(4, 30, l.z) : 1;
    fx[f] = l.alpha * l.dim * shadowFade * (l.pile && l.state === REST && l.gz > 9 ? 0 : 1);
    fx[f + 4] = l.alpha * l.dim;
    fx[f + 1] = fx[f + 5] = clamp((l.z - 140) / 380, 0, 1) * 2.2; // defocus near the camera
    if (l.state === SINK) fx[f + 1] = fx[f + 5] = ((l.soil - PRE_SOIL) / (1 - PRE_SOIL)) * 2.2; // detail softens as it turns into soil (from 0, no pop)
    fx[f + 2] = fx[f + 6] = halo;
    fx[f + 3] = fx[f + 7] = isText;
    const fr = i * 8, cr = i * 8;
    crush[cr + 2] = crush[cr + 6] = l.age || 0;
    crush[cr + 3] = crush[cr + 7] = l.state === SINK || l.state === FRAG ? l.dis || 0 : 0;
    if (l.state === FRAG) {
      const g = l.fg;
      frag[fr] = frag[fr + 4] = g.a0;
      frag[fr + 1] = frag[fr + 5] = g.a1;
      frag[fr + 2] = frag[fr + 6] = g.jag;
      frag[fr + 3] = frag[fr + 7] = g.whole ? 0 : 1;
      crush[cr] = crush[cr + 4] = l.dark;
      crush[cr + 1] = crush[cr + 5] = l.soil;
      fx[f + 1] = fx[f + 5] = l.soil * 2.4; // pieces lose their crisp edges as they sink
      fx[f + 2] = fx[f + 6] = g.fromText ? g.halo : 0;
      fx[f + 3] = fx[f + 7] = g.fromText ? 1 - l.soil : 0;
    } else {
      frag[fr + 3] = frag[fr + 7] = 0;
      crush[cr] = crush[cr + 4] = l.state === SINK ? l.dark : 0;
      crush[cr + 1] = crush[cr + 5] = l.state === SINK ? l.soil : pre;
    }
  }
  leafMesh.instanceMatrix.needsUpdate = true;
  attr.dyn.needsUpdate = true;
  attr.fx.needsUpdate = true;
  attr.frag.needsUpdate = true;
  attr.crush.needsUpdate = true;
  if (staticDirty) {
    staticDirty = false;
    const st = attr.stat.array, ca = attr.colA.array, cb = attr.colB.array;
    for (let i = 0; i < n; i++) {
      const l = leaves[i];
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        st[j * 4] = l.cell;
        st[j * 4 + 1] = l.green + (l.ctype || 0) * 2; // green remnant + colour kind packed together
        st[j * 4 + 2] = l.seed;
        st[j * 4 + 3] = k;
        ca[j * 3] = l.colA[0];
        ca[j * 3 + 1] = l.colA[1];
        ca[j * 3 + 2] = l.colA[2];
        cb[j * 3] = l.colB[0];
        cb[j * 3 + 1] = l.colB[1];
        cb[j * 3 + 2] = l.colB[2];
      }
    }
    attr.stat.needsUpdate = attr.colA.needsUpdate = attr.colB.needsUpdate = true;
  }
  leafMesh.count = n * 2;
}

// ---------------------------------------------------------------- loop

function textPoint() {
  for (let i = 0; i < 12; i++) {
    const l = leaves[(Math.random() * leaves.length) | 0];
    if (l && l.slot && l.state === REST) return { x: l.x, y: l.y };
  }
  return null;
}

// A shaft of sunlight through the canopy rests on the words (as on the store cover); it eases to wherever the text
// block is and grows with it. With no text it lies softly in the middle of the picture.
const sun = { x: 0, y: 0, r: 0, k: 0, init: false };
function updateSunOnWords(dt) {
  const has = !!textBox;
  const tx = has ? (textBox.x0 + textBox.x1) / 2 : 0;
  const ty = has ? (textBox.y0 + textBox.y1) / 2 : H * 0.03;
  const span = has ? Math.max(textBox.x1 - textBox.x0, textBox.y1 - textBox.y0) : 0;
  const tr = clamp(Math.max(span * 0.62, Math.min(W, H) * 0.34), 120, Math.max(W, H) * 0.6);
  const tk = has ? 0.9 : 0.55;
  if (!sun.init) Object.assign(sun, { x: tx, y: ty, r: tr, k: tk, init: true });
  const e = 1 - Math.exp(-dt * 1.6);
  sun.x += (tx - sun.x) * e;
  sun.y += (ty - sun.y) * e;
  sun.r += (tr - sun.r) * e;
  sun.k += (tk - sun.k) * e;
  shared.uBeam.value[0].set((sun.x + W / 2) * DPR, (sun.y + H / 2) * DPR, sun.k, sun.r * DPR);
}

function tick(dt) {
  now += dt;
  for (const s of slots) {
    const k = 1 - Math.exp(-dt * 5);
    s.cx += (s.tx - s.cx) * k;
    s.cy += (s.ty - s.cy) * k;
    s.S += (s.tS - s.S) * k;
  }
  updateWither(dt);
  updateBury(dt);
  updateGlow();
  updateSunOnWords(dt);
  runLater();
  applyPointer(dt);
  idleLife(dt);
  let deadNow = 0;
  for (const l of leaves) {
    if (l.dead) {
      deadNow++;
      continue; // finished leaves wait (invisible) for the next clean-up
    }
    l.px = l.x;
    l.py = l.y;
    if (l.state === FALL) updateFall(l);
    else if (l.state === REST) updateRest(l, dt);
    else if (l.state === FREE) updateFree(l, dt);
    else if (l.state === SWIRL) updateSwirl(l, dt);
    else if (l.state === FRAG) updateFrag(l);
    else if (l.state === SINK) updateSink(l);
    else updateVortex(l);
    if (dt > 0) {
      l.vxEst = (l.x - l.px) / dt;
      l.vyEst = (l.y - l.py) / dt;
    }
    if (l.dead) deadNow++;
  }
  // finished leaves are cleared out in batches rather than every frame: each clean-up re-sends every leaf's
  // fixed data to the GPU, which is what used to make the wind after a burial stutter
  if (deadNow && (deadNow > 300 || now - lastCompact > 0.6)) {
    leaves = leaves.filter((l) => !l.dead);
    staticDirty = true;
    lastCompact = now;
  }
  const env = { W, H, unit: clamp(Math.min(W, H) * 0.045, 22, 38), ptr, whirl, textPoint, nudge, wiggle, stamp: stampPrints, now };
  updateDust(dt);
  updateWet();
  retireDeadSlots();
  bugs.update(dt, now, env);
  squirrel.update(dt, now, env);
}

let lastCompact = 0;
let last = performance.now();
let frameMs = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const tStart = performance.now();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  tick(dt);
  upload();
  shared.uTime.value = now;
  renderer.render(scene, camera);
  frameMs = frameMs * 0.9 + (performance.now() - tStart) * 0.1;
}

let litterAspect = 0;
function resize() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  renderer.setSize(W, H);
  camera.left = -W / 2;
  camera.right = W / 2;
  camera.top = H / 2;
  camera.bottom = -H / 2;
  camera.updateProjectionMatrix();
  shared.uRes.value.set(W * DPR, H * DPR);
  const aspect = W / H;
  const old = shared.uSoil.value;
  shared.uSoil.value = paintSoil(aspect, isMobile ? 900 : 1100);
  if (old) old.dispose();
  dust.material.uniforms.uPx.value = DPR * 1.6;
  resizeGroove();
  resizeWet();
  puffs.material.uniforms.uPx.value = DPR;
  layout();
  // reseed the litter when the shape of the screen changes noticeably
  if (Math.abs(aspect - litterAspect) > 0.15 || !litterAspect) {
    litterAspect = aspect;
    seedLitter();
  }
}
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 120);
});
resize();
requestAnimationFrame(frame);
loadFont();

// ---------------------------------------------------------------- input

const ime = document.getElementById('ime');
let composing = false;

function syncText() {
  const next = Array.from(ime.value.replace(/\r/g, '')); // newlines are kept: Enter starts a new line
  let p = 0;
  while (p < next.length && p < textChars.length && next[p] === textChars[p]) p++;
  for (let i = textChars.length - 1; i >= p; i--) removeLast();
  for (let i = p; i < next.length; i++) addChar(next[i]);
  textChars = next;
}

ime.addEventListener('compositionstart', () => (composing = true));
ime.addEventListener('compositionend', () => {
  composing = false;
  syncText();
});
ime.addEventListener('input', (e) => {
  if (composing || e.isComposing) return;
  syncText();
});
ime.addEventListener('keydown', (e) => {
  // Enter adds a line break (the textarea inserts the newline itself; syncText turns it into a new line).
  // The whirlwind in clearAll() is kept for a gesture still to be decided.
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && (!textChars.length || textChars[textChars.length - 1] === '\n')) e.preventDefault(); // no empty lines
});

const canvas = renderer.domElement;
const toWorld = (e) => [e.clientX - W / 2, H / 2 - e.clientY];
canvas.addEventListener('pointerdown', (e) => {
  initAudio(); // audio may only start from a user gesture
  const [x, y] = toWorld(e);
  Object.assign(ptr, { x, y, lx: x, ly: y, has: true, down: true, downX: x, downY: y, downT: now, maxMove: 0, longPressed: false, samples: [{ t: now, x, y }] });
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = toWorld(e);
  if (!ptr.has) {
    ptr.lx = x;
    ptr.ly = y;
    ptr.has = true;
  }
  ptr.x = x;
  ptr.y = y;
  ptr.mouse = e.pointerType === 'mouse';
  ptr.moved = true;
  ptr.lastMoveT = now;
  ptr.samples.push({ t: now, x, y });
  if (ptr.samples.length > 40) ptr.samples.shift();
  if (ptr.down) ptr.maxMove = Math.max(ptr.maxMove, Math.hypot(x - ptr.downX, y - ptr.downY));
});
function endPress(e, cancelled) {
  if (!ptr.down) return;
  ptr.down = false;
  if (whirl.on) releaseWhirl();
  else if (!cancelled && !ptr.longPressed && ptr.maxMove < 12 && now - ptr.downT < 0.35) {
    tapAt(ptr.x, ptr.y);
    // on touch screens a tap never brings up the keyboard (only the keyboard button does)
    if (autoFocus) ime.focus({ preventScroll: true });
  }
  if (e.pointerType !== 'mouse') ptr.has = false;
}
canvas.addEventListener('pointerup', (e) => endPress(e, false));
window.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press menu
canvas.addEventListener('pointercancel', (e) => endPress(e, true));
canvas.addEventListener('pointerleave', (e) => {
  if (!ptr.down) ptr.has = false;
});
if (!isMobile) {
  if (autoFocus) ime.focus({ preventScroll: true });
  window.addEventListener('keydown', (e) => {
    if (document.activeElement !== ime && !e.metaKey && !e.ctrlKey) ime.focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------- export

// ---- keyboard button: bring up (or, on phones, dismiss) the system keyboard via the hidden input
const btnKbd = document.getElementById('btnKbd');
btnKbd.addEventListener('pointerdown', (e) => e.preventDefault()); // don't steal or disturb the input's focus
btnKbd.addEventListener('click', () => {
  if (isMobile && document.activeElement === ime) {
    ime.blur();
    return;
  }
  // must be synchronous inside the click, or iOS won't open the keyboard
  ime.focus({ preventScroll: true });
  const n = ime.value.length;
  try {
    ime.setSelectionRange(n, n);
  } catch (err) {
    /* some inputs don't support selection; the caret is not visible anyway */
  }
});

// ---- save button: one tap, current frame straight to a PNG
const btnSave = document.getElementById('btnSave');
btnSave.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the phone keyboard open
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
btnSave.addEventListener('click', () => {
  // render and read back in the same task: without preserveDrawingBuffer a later read returns black
  upload();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });
  const words = textChars.slice(0, 12).join('').replace(/[\\/:*?"<>|\s]+/g, '').trim();
  const name = `leaf-letters-${words || 'autumn'}.png`;
  const saveDirect = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  if (isIOS && navigator.share) {
    // iOS can't write to Photos from a web page: open the share sheet ("Save Image") right away, in this click
    let file = null;
    try {
      file = new File([blob], name, { type: 'image/png' });
    } catch (err) {
      file = null;
    }
    if (file && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      navigator.share({ files: [file] }).catch((err) => {
        if (err && err.name !== 'AbortError') saveDirect(); // cancelled: do nothing
      });
      return;
    }
  }
  saveDirect();
});

// ---------------------------------------------------------------- tips card

(() => {
  const intro = document.getElementById('intro');
  const btn = document.getElementById('btnHelp');
  if (!intro) return;
  let autoCancelled = false; // a key pressed before the opening card appears cancels it
  let closedOnce = false;    // only the first close moves focus to the input (later ones would pop the phone keyboard)
  const isShown = () => intro.classList.contains('show');
  const open = () => intro.classList.add('show');
  const close = () => {
    if (!isShown()) return;
    intro.classList.remove('show'); // fades out; it stays in the page so it can be opened again
    if (!closedOnce) {
      closedOnce = true;
      // ready to type straight away on a computer; on touch screens the keyboard only comes up from the keyboard button
      if (autoFocus) ime.focus({ preventScroll: true });
      const n = ime.value.length;
      try {
        if (autoFocus) ime.setSelectionRange(n, n);
      } catch (err) {
        /* ignore */
      }
    }
  };
  // a permanent listener (not { once: true }): any key closes the card while it is showing
  window.addEventListener('keydown', () => {
    if (isShown()) close();
    else autoCancelled = true;
  }, true);
  intro.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    close();
  });
  if (btn) {
    btn.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the input's focus / the phone keyboard
    btn.addEventListener('click', () => (isShown() ? close() : open()));
  }
  // shown on every page load, about half a second in
  setTimeout(() => {
    if (!autoCancelled && !closedOnce) open();
  }, 500);
})();

// debug hooks for automated checks
window.__luoye = {
  step: (n, dt = 1 / 60) => {
    const t = performance.now();
    for (let i = 0; i < n; i++) tick(dt);
    upload();
    shared.uTime.value = now;
    renderer.render(scene, camera);
    return +(performance.now() - t).toFixed(1);
  },
  grow: (c) => { buildLeafMesh(c); },
  inst: (i) => ({ m: Array.from(leafMesh.instanceMatrix.array.slice(i * 16, i * 16 + 16)).map((v) => +v.toFixed(1)), fx: Array.from(attr.fx.array.slice(i * 4, i * 4 + 4)), stat: Array.from(attr.stat.array.slice(i * 4, i * 4 + 4)), geoAttrOk: leafMesh.geometry.attributes.aFx === attr.fx, instMatSize: leafMesh.instanceMatrix.count }),
  sample: (k = 5) => leaves.slice(0, k).concat(leaves.slice(-k)).map((l) => ({ st: l.state, a: +(l.alpha ?? -1).toFixed(2), dim: +(l.dim ?? -1).toFixed(2), sz: +l.size.toFixed(1), x: +l.x.toFixed(0), y: +l.y.toFixed(0), z: +l.z.toFixed(0), pile: !!l.pile })),
  // per-phase frame timing, for finding hitches
  prof: (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      tick(1 / 60);
      const t1 = performance.now();
      upload();
      const t2 = performance.now();
      renderer.render(scene, camera);
      const t3 = performance.now();
      if (t3 - t0 > 20) out.push({ i, tick: +(t1 - t0).toFixed(1), upload: +(t2 - t1).toFixed(1), render: +(t3 - t2).toFixed(1), n: leaves.length });
    }
    return out;
  },
  addText: (s) => {
    ime.value += s;
    syncText();
  },
  tap: (cx, cy) => tapAt(cx - W / 2, H / 2 - cy),
  press: (cx, cy) => Object.assign(ptr, { x: cx - W / 2, y: H / 2 - cy, downX: cx - W / 2, downY: H / 2 - cy, has: true, down: true, downT: now, maxMove: 0, longPressed: false }),
  drag: (cx, cy) => Object.assign(ptr, { x: cx - W / 2, y: H / 2 - cy, moved: true }),
  release: () => endPress({ pointerType: 'mouse' }, false),
  swipe: (x0, y0, x1, y1, ms) => {
    // drive a synthetic swipe through the real pointer handlers, one frame per sample
    const c = renderer.domElement;
    const steps = Math.max(2, Math.round(ms / 16.7));
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', bubbles: true }));
    ev('pointerdown', x0, y0);
    tick(1 / 60);
    for (let i = 1; i <= steps; i++) {
      ev('pointermove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
      tick(1 / 60);
    }
    ev('pointerup', x1, y1);
    tick(1 / 60);
  },
  debug: () => {
    const st = [0, 0, 0, 0, 0, 0, 0];
    for (const l of leaves) st[l.state]++;
    const gd = groove.ctx.getImageData(0, 0, groove.cv.width, groove.cv.height).data;
    let gs = 0;
    for (let i = 3; i < gd.length; i += 4) gs += gd[i];
    return { whirl: { ...whirl }, ptr: { ...ptr }, st, unitS, groove: [groove.cv.width, groove.cv.height, gs, groove.live], mesh: { cap, count: leafMesh.count, inScene: scene.children.includes(leafMesh), meshes: scene.children.filter((o) => o.isInstancedMesh).length, nan: leaves.filter((l) => !isFinite(l.x) || !isFinite(l.y) || !isFinite(l.size)).length } };
  },
  state: () => ({
    leaves: leaves.length, slots: slots.length, frameMs: +frameMs.toFixed(2), turning: leaves.filter((l) => l.gw).length, isMobile,
    swirl: leaves.filter((l) => l.state === SWIRL).length, cones: squirrel.cones, sqActive: squirrel.active, holding: squirrel.holding, bugs: bugs.bugs.map((b) => b.kind + ':' + b.state).join(','),
  }),
};
