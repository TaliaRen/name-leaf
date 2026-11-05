// Procedural "crunch-rustle" of stepping on dry leaves, synthesized with Web Audio (no audio files).
// The context is created lazily on the first user gesture to satisfy autoplay rules.

let actx = null;
let master = null;
let noiseBuf = null; // looping white noise for the wind
let muted = false; // sound is always on (there is no mute switch)

export function initAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  const comp = actx.createDynamicsCompressor(); // keeps loud stomps from clipping
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  setTimeout(fillBank, 0);
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('luoyezi-muted', m ? '1' : '0');
  } catch (e) {
    /* ignore */
  }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, actx.currentTime, 0.03);
}

const rnd = (a, b) => a + Math.random() * (b - a);

// One volume trim per sound effect, so every effect sits at the same loudness (set by measuring each one
// rendered offline; see __measureSounds below). Each sound sends its output through out(name).
// Measured loudest-100 ms levels before trimming: stomp -21.3 dB, step -20.6, fly-away -26.3, fly-in -28.1,
// pine cone -39, wither crinkle -48.8 per tick, breaking snap -49.5. Everything is brought to about -24 dB
// (the crinkle and snaps of withering come in quick streams, so each one sits lower: the crinkle plays
// ~30 times a second, so a single tick is quiet). Withering is meant to be heard as a faint background
// crackle, clearly softer than the other effects.
const TRIM = { crunch: 0.73, snap: 3, rustle: 1, wind: 1, step: 0.68, away: 1.3, arrive: 1.6, crinkle: 0.2, cone: 5.0 };
function out(name) {
  const g = actx.createGain();
  g.gain.value = TRIM[name] ?? 1;
  g.connect(master);
  return g;
}

// Add one band-passed noise grain (a single little crack of a dry leaf) into `out`.
// Each crack rings briefly at its own pitch, which is what makes leaves sound crisp rather than hissy.
function addCrack(out, sr, start, len, freq, q, amp, attackSec = 0.0004) {
  const w0 = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const attack = Math.max(2, Math.floor(sr * attackSec));
  const tau = len * (0.18 + Math.random() * 0.2);
  for (let i = 0; i < len + 200 && start + i < out.length; i++) {
    const env = i < attack ? i / attack : Math.exp(-(i - attack) / tau);
    const x = i < len ? (Math.random() * 2 - 1) * env : 0;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[start + i] += y * amp;
  }
}

// Styles of footstep sound. Each is a recipe for the same generator below.
export const PRESETS = {
  // A: crisp splitting - clusters of short pitched cracks, one cluster per leaf breaking
  crisp: {
    label: 'A crisp crackle', dur: 0.42, clusters: [3, 9], grainsPer: [3, 10], gap: [0.0008, 0.009],
    freq: [900, 4200], q: [1.6, 4.5], len: [0.003, 0.018], fine: [30, 110], fineFreq: [2500, 7500],
    body: 0.9, bodyFreq: [380, 620], swish: 0, rustle: 0.12,
    // "ga-zhi ga-zhi": the weight sinks into the pile in a few separate crunching pulses
    pulses: [3, 6], pulseLen: [0.045, 0.09], pulseGap: [0.03, 0.1],
  },
  // B: crumpling dry leaves - a dense, unpitched crackle with an airy swish as the foot comes down
  crumple: {
    label: 'B dry leaves crumpled', dur: 0.4, clusters: [18, 40], grainsPer: [4, 14], gap: [0.0004, 0.004],
    freq: [1200, 7000], q: [0.6, 1.2], len: [0.0012, 0.008], fine: [120, 320], fineFreq: [3000, 9000],
    body: 0.35, bodyFreq: [500, 900], swish: 0.5, rustle: 0.15,
  },
  // C: a thick pile on soil - deeper, woodier crunch with a solid low body and fewer high clicks
  thick: {
    label: 'C thick leaf layer (soft)', dur: 0.6, clusters: [8, 16], grainsPer: [2, 6], gap: [0.003, 0.016],
    freq: [380, 1700], q: [0.6, 1.4], len: [0.012, 0.04], fine: [6, 22], fineFreq: [1400, 3200],
    body: 0.8, bodyFreq: [160, 340], swish: 0.4, rustle: 0.75,
    attack: 0.003,   // cracks swell in instead of snapping: a soft, springy pile
    bodyAttack: 0.02,
    lp: 3600,        // roll off the brittle top end
  },
  // C (earlier version): the same thick pile, before it was softened - firmer cracks, brighter top end
  thickFirm: {
    label: 'C original (firmer)', dur: 0.55, clusters: [8, 18], grainsPer: [2, 7], gap: [0.002, 0.014],
    freq: [450, 2400], q: [1.0, 2.6], len: [0.008, 0.032], fine: [20, 70], fineFreq: [1800, 5000],
    body: 1.4, bodyFreq: [180, 420], swish: 0.15, rustle: 0.35,
  },
  // E: a soft, springy pile - no snapping at all: overlapping low rustle grains that swell in gently,
  // a few faint muffled crackles, no thud, the top end rolled off and the whole thing quieter
  fluffy: {
    label: 'E soft, springy leaves', dur: 0.7, clusters: [14, 24], grainsPer: [3, 8], gap: [0.006, 0.03],
    freq: [350, 1400], q: [0.5, 0.9], len: [0.02, 0.07], fine: [18, 40], fineFreq: [2200, 5200],
    body: 0, bodyFreq: [200, 300], swish: 0.5, rustle: 1.0,
    attack: 0.008, lp: 4400, gain: 0.64,
    fineAttack: 0.0008, fineGain: 1.75, // a sprinkle of crisp little crackles over the soft rustle
  },
  // D: soft rustle - mostly the shuffle of leaves, with only a few small cracks
  soft: {
    label: 'D gentle rustle', dur: 0.5, clusters: [2, 6], grainsPer: [2, 5], gap: [0.002, 0.01],
    freq: [1500, 4500], q: [1.0, 2.5], len: [0.003, 0.012], fine: [10, 40], fineFreq: [2500, 6000],
    body: 0.4, bodyFreq: [300, 600], swish: 0.25, rustle: 1.0,
  },
};
let currentPreset = 'fluffy'; // E: a soft, springy pile of leaves
export function setPreset(name) {
  if (PRESETS[name]) currentPreset = name;
}

// Render one footstep on dry leaves from a recipe: clusters of short resonant cracks (leaves splitting
// as the weight comes down), a fine crackle of fragments, a low crunch of the pile compressing,
// an airy swish of the shoe, and a rustle of settling debris.
function crunchBuffer(amount, dryness, P) {
  const sr = actx.sampleRate;
  const logRand = (lo, hi) => lo * Math.pow(hi / lo, Math.random());
  const pick = (r) => rnd(r[0], r[1]);
  // schedule the crunching pulses first (if this style has them) so the buffer is long enough
  const pulses = [];
  if (P.pulses) {
    const np = Math.round(pick(P.pulses) * (0.75 + amount * 0.45));
    let t = 0.004;
    for (let i = 0; i < np; i++) {
      const len = pick(P.pulseLen) * (i === 0 ? 1.25 : 1);
      pulses.push({ t, len, low: i % 2 === 0, amp: (1 - (i / (np + 1)) * 0.55) * rnd(0.75, 1.1) });
      t += len * rnd(0.55, 0.8) + pick(P.pulseGap);
    }
  }
  const pulseEnd = pulses.length ? pulses[pulses.length - 1].t + pulses[pulses.length - 1].len : 0;
  const dur = Math.max(P.dur + amount * 0.25 + rnd(0, 0.08), pulseEnd + 0.18);
  const N = Math.floor(sr * dur);
  const out = new Float32Array(N);
  // 0) the pulses: each a dense, shaped burst of cracks; "ga" is lower and chunkier, "zhi" higher and squeakier
  for (const pu of pulses) {
    const center = pu.low ? logRand(650, 1500) : logRand(1700, 3600);
    const grains = Math.round(pu.len * (pu.low ? 950 : 1300) * (0.6 + dryness * 0.6) * (0.7 + amount * 0.5));
    for (let g = 0; g < grains; g++) {
      const u = Math.random();
      const tt = pu.t + u * pu.len;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7); // swells and eases within the pulse
      const len = Math.floor(sr * logRand(pu.low ? 0.003 : 0.002, pu.low ? 0.014 : 0.009));
      addCrack(out, sr, Math.floor(tt * sr), len, center * rnd(0.7, 1.4), rnd(1.2, 3.5), (0.15 + 0.85 * Math.pow(Math.random(), 2)) * pu.amp * env * 0.55);
    }
    // a soft papery body under each "ga"
    if (pu.low) addCrack(out, sr, Math.floor(pu.t * sr), Math.floor(sr * pu.len * 0.8), rnd(350, 600), 0.9, 0.35 * pu.amp);
  }
  // 1) crack clusters
  const clusters = Math.round(pick(P.clusters) * (0.5 + amount * 0.7));
  const roll = rnd(0.07, 0.13);
  for (let c = 0; c < clusters; c++) {
    const t = Math.random() < 0.7 ? Math.pow(Math.random(), 1.8) * 0.16 : roll + Math.pow(Math.random(), 1.5) * 0.22;
    const fade = Math.exp(-t / 0.22);
    const center = logRand(P.freq[0], P.freq[1]) * (0.85 + dryness * 0.3);
    const n = Math.round(pick(P.grainsPer));
    let tt = t;
    for (let k = 0; k < n; k++) {
      tt += pick(P.gap);
      const start = Math.floor(tt * sr);
      if (start >= N) break;
      const amp = (0.25 + 0.75 * Math.pow(Math.random(), 2.5)) * fade * (k === 0 ? 1.4 : 1);
      addCrack(out, sr, start, Math.floor(sr * logRand(P.len[0], P.len[1])), center * rnd(0.75, 1.3), pick(P.q), amp, P.attack);
    }
  }
  // 2) fine crackle
  const fine = Math.round(pick(P.fine) * (0.5 + amount * 0.7) * (0.6 + dryness * 0.6));
  for (let k = 0; k < fine; k++) {
    const t = Math.pow(Math.random(), 1.4) * dur * 0.9;
    addCrack(out, sr, Math.floor(t * sr), Math.floor(sr * logRand(0.0015, 0.006)), logRand(P.fineFreq[0], P.fineFreq[1]), rnd(0.8, 2.5), rnd(0.04, 0.16) * Math.exp(-t / 0.3) * (P.fineGain || 1), P.fineAttack ?? P.attack);
  }
  // 3) the pile compressing
  if (P.body) {
    addCrack(out, sr, 0, Math.floor(sr * 0.05), pick(P.bodyFreq), 0.9, 0.9 * P.body, P.bodyAttack);
    addCrack(out, sr, Math.floor(sr * 0.012), Math.floor(sr * 0.06), pick(P.bodyFreq) * 1.8, 1.1, 0.5 * P.body, P.bodyAttack);
  }
  // 4) the shoe swishing into the leaves: a short airy noise swell
  if (P.swish) {
    const len = Math.floor(sr * rnd(0.08, 0.14));
    for (let k = 0; k < 6; k++) addCrack(out, sr, Math.floor(sr * rnd(0, 0.03)), len, logRand(1800, 4500), 0.5, 0.18 * P.swish, 0.02);
  }
  // 5) rustle of settling debris
  const rn = Math.round(8 + 22 * P.rustle);
  for (let k = 0; k < rn; k++) {
    const t = rnd(0.02, dur * 0.8);
    addCrack(out, sr, Math.floor(t * sr), Math.floor(sr * rnd(0.02, 0.06)), logRand(900, 3200), 0.7, rnd(0.06, 0.14) * P.rustle * Math.exp(-t / 0.35), 0.006);
  }
  // normalise with a little headroom, short fade-out
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = ((0.5 + 0.4 * amount) * (P.gain || 1)) / (peak || 1);
  const fadeN = Math.floor(sr * 0.03);
  for (let i = 0; i < N; i++) out[i] *= g * (i > N - fadeN ? (N - i) / fadeN : 1);
  const buf = actx.createBuffer(1, N, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

// amount: 0..1 how many leaves were crushed; dryness: 0..1 (crisp letter leaves vs soft litter)
export function playCrunch(amount, dryness = 0.8, presetName) {
  if (!actx || muted) return;
  const dest = out('crunch');
  const P = PRESETS[presetName || currentPreset];
  const a = Math.max(0.15, Math.min(1, amount));
  const src = actx.createBufferSource();
  src.buffer = crunchBuffer(a, dryness, P);
  src.playbackRate.value = rnd(0.94, 1.08); // each step a little different in pitch
  const lpf = actx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = P.lp || 6500 + dryness * 5000;
  const g = actx.createGain();
  g.gain.value = 0.8;
  src.connect(lpf);
  lpf.connect(g);
  g.connect(dest);
  src.start(actx.currentTime + 0.003);
}

// A soft, longer "sha-sha" of leaves settling together: like the rustle of a step into leaves but without the
// crunch at the start - many soft, short rustle grains in two or three gentle waves that swell and fade.
function shaBuffer(dur = 1.4) {
  const sr = actx.sampleRate, N = Math.floor(sr * dur);
  const out = new Float32Array(N);
  const waves = 2; // two slow, soft waves
  for (let w = 0; w < waves; w++) {
    const c = (0.18 + (w / waves) * 0.62 + rnd(-0.04, 0.04)) * dur; // centre of this wave
    const half = rnd(0.24, 0.3) * dur;
    const amp = 1 - w * 0.22;
    const n = Math.round(half * 2 * rnd(150, 190)); // fewer, longer grains: a smooth rustle, not a fizz
    for (let g = 0; g < n; g++) {
      const u = rnd(-1, 1);
      const tt = c + u * half;
      if (tt < 0) continue;
      const env = Math.pow(Math.cos((u * Math.PI) / 2), 1.5); // each wave swells and eases
      addCrack(out, sr, Math.floor(tt * sr), Math.floor(sr * rnd(0.03, 0.08)), rnd(700, 2200), rnd(0.4, 0.8), rnd(0.3, 1) * env * amp, 0.012); // lower, softer grains
    }
  }
  // overall: soft in, soft out
  for (let i = 0; i < N; i++) {
    const u = i / N;
    out[i] *= Math.min(1, u / 0.18) * Math.min(1, (1 - u) / 0.35);
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < N; i++) out[i] /= peak || 1;
  const buf = actx.createBuffer(1, N, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

// Small sounds that play during animations are pre-rendered once (a few variations each), so nothing
// is synthesised on the main thread mid-animation.
const bank = { snap: [], rustle: [], step: [], gather: [] };
let banking = false;
function fillBank() {
  if (banking || !actx) return;
  banking = true;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
  const step = () => {
    // one small buffer per idle slot
    if (bank.rustle.length < 6) bank.rustle.push(crunchBuffer(0.15, 0.95, PRESETS.soft));
    else if (bank.snap.length < 4) bank.snap.push(crunchBuffer(0.15, 0.95, PRESETS.crisp));
    else if (bank.step.length < 5) bank.step.push(stepBuffer());
    else if (bank.gather.length < 3) bank.gather.push(shaBuffer());
    else return;
    idle(step);
  };
  idle(step);
}
// a pre-rendered variation; until the bank has one, render a single buffer (rare, right after start)
const fromBank = (list, preset, amount = 0.15, dry = 0.95) => (list.length ? list[(Math.random() * list.length) | 0] : crunchBuffer(amount, dry, preset));

// A light "ka-cha" of a brittle leaf snapping off.
export function playSnap(level = 1) {
  if (!actx || muted) return;
  const dest = out('snap');
  fillBank();
  const src = actx.createBufferSource();
  src.buffer = fromBank(bank.snap, PRESETS.crisp);
  src.playbackRate.value = rnd(1.1, 1.35);
  const g = actx.createGain();
  g.gain.value = 0.16 * level;
  src.connect(g);
  g.connect(dest);
  src.start(actx.currentTime + 0.003);
}

// A faint "sha" of a dry crumb flaking off a withering leaf.
export function playRustle(level = 1) {
  if (!actx || muted) return;
  const dest = out('rustle');
  fillBank();
  const src = actx.createBufferSource();
  src.buffer = fromBank(bank.rustle, PRESETS.soft);
  src.playbackRate.value = rnd(1.0, 1.3);
  const g = actx.createGain();
  g.gain.value = 0.13 * level;
  src.connect(g);
  g.connect(dest);
  src.start(actx.currentTime + 0.003);
}

// A canopy letting go: a bright "hua-la" rustle that bursts, then thins out as the leaves settle.
export function playShower(dur = 1.6) {
  if (!actx || muted || !noiseBuf) return;
  const t = actx.currentTime + 0.01;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.6;
  bp.frequency.setValueAtTime(3200, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + dur);
  const flutter = actx.createGain();
  flutter.gain.value = 0.55;
  const lfo = actx.createOscillator();
  lfo.frequency.value = rnd(11, 17);
  const depth = actx.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth);
  depth.connect(flutter.gain);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(flutter);
  flutter.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  // leaves landing: a scatter of soft crackles, dense at first, thinning out
  for (let i = 0; i < 8; i++) setTimeout(() => playRustle(1 - i / 9), (0.15 + Math.pow(i / 8, 1.4) * dur * 0.9) * 1000);
}

// A gust: a wind whoosh that swells and fades, plus the flutter of leaves turning over as it passes.
// strength 0..1, dur seconds.
export function playWind(strength, dur, leavesAmt = 1, trimName) {
  if (!actx || muted || !noiseBuf) return;
  const dest = out(trimName ?? 'wind');
  const t = actx.currentTime + 0.01;
  const s = Math.max(0, Math.min(1, strength));
  // the air itself: band-passed noise whose pitch and loudness rise and fall
  const w = actx.createBufferSource();
  w.buffer = noiseBuf;
  w.loop = true;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(220, t);
  bp.frequency.linearRampToValueAtTime(420 + 650 * s, t + dur * 0.4);
  bp.frequency.linearRampToValueAtTime(260, t + dur);
  const wg = actx.createGain();
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.exponentialRampToValueAtTime(0.12 + 0.4 * s, t + dur * 0.38);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  w.connect(bp);
  bp.connect(wg);
  wg.connect(dest);
  w.start(t, Math.random() * 1.5);
  w.stop(t + dur + 0.05);
  // the leaves: high, fluttering hiss that arrives a moment after the wind
  const r = actx.createBufferSource();
  r.buffer = noiseBuf;
  r.loop = true;
  const hp = actx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const rg = actx.createGain();
  rg.gain.value = 0;
  const flutter = actx.createGain();
  const lfo = actx.createOscillator();
  lfo.frequency.value = rnd(9, 16);
  const depth = actx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth);
  depth.connect(flutter.gain);
  flutter.gain.value = 0.5;
  const d0 = t + 0.12;
  rg.gain.setValueAtTime(0.0001, d0);
  rg.gain.exponentialRampToValueAtTime(Math.max(0.0002, (0.03 + 0.16 * s) * leavesAmt), d0 + dur * 0.35);
  rg.gain.exponentialRampToValueAtTime(0.0001, d0 + dur * 0.95);
  r.connect(hp);
  hp.connect(flutter);
  flutter.connect(rg);
  rg.connect(dest);
  r.start(t, Math.random() * 1.5);
  r.stop(d0 + dur + 0.05);
  lfo.start(t);
  lfo.stop(d0 + dur + 0.05);
  // a few dry crackles of leaves flipping, more for stronger gusts
  const n = Math.round((1 + s * 4) * leavesAmt);
  for (let i = 0; i < n; i++) setTimeout(() => playRustle(0.4 + s * 0.8), (0.1 + Math.random() * dur * 0.7) * 1000);
}


// One footstep on soft, wet earth: a filtered "squish" of noise whose pitch slides, a scatter of tiny wet pops,
// a slow wobble, and low/high cut filters. The settings below were tuned by ear.
const STEP_DEFAULT = {
  pitch: 990,    // centre of the squish (Hz): lower = deeper, higher = lighter
  slide: 1.45,   // where the pitch ends, relative to the start (<1 slides down, >1 rises)
  focus: 1.45,   // resonance: low = soft and airy, high = ringing / hollow
  attack: 2.5,   // how fast it swells in: low = soft press, high = a hit
  length: 0.42,  // seconds
  pops: 8,       // number of tiny wet pops
  popLevel: 0.085,
  bright: 550,   // top cut (Hz): lower = more muffled
  low: 570,      // bottom cut (Hz): higher = less boomy
  wobble: 0.15,  // gooey wobble in loudness
  volume: 0.36,
};
const STEP = STEP_DEFAULT;

function stepBuffer() {
  const P = STEP;
  const sr = actx.sampleRate, N = Math.floor(sr * (P.length + 0.08));
  const out = new Float32Array(N);
  // the squish: band-passed noise, centre sliding from f0 to f1, rising softly and fading
  {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const n = Math.floor(P.length * sr) * rnd(0.9, 1.1);
    const f0 = P.pitch * rnd(0.92, 1.08), f1 = f0 * P.slide, q = Math.max(0.2, P.focus);
    for (let i = 0; i < n && i < N; i++) {
      const u = i / n;
      const f = f0 * Math.pow(f1 / f0, u);
      const w0 = (2 * Math.PI * f) / sr, al = Math.sin(w0) / (2 * q), a0 = 1 + al;
      const x = Math.random() * 2 - 1;
      const y = (al / a0) * x - (al / a0) * x2 + (2 * Math.cos(w0) / a0) * y1 - ((1 - al) / a0) * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[i] += y * (1 - Math.exp(-u * P.attack * 3)) * Math.pow(1 - u, 1.6);
    }
  }
  // tiny wet pops scattered through it, thinning out toward the end
  for (let k = 0; k < Math.round(P.pops); k++) {
    const u = Math.pow(Math.random(), 0.8);
    const s0 = Math.floor((0.03 + u * P.length) * sr), n = Math.floor(sr * rnd(0.003, 0.006)), f = rnd(900, 1600);
    for (let i = 0; i < n && s0 + i < N; i++) {
      const v = i / n;
      out[s0 + i] += Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-v * 4) * Math.min(1, v * 6) * P.popLevel * (1 - 0.6 * u);
    }
  }
  // gooey wobble
  let ph = rnd(0, 6);
  const fr = rnd(26, 38);
  for (let i = 0; i < N; i++) {
    ph += (2 * Math.PI * fr) / sr;
    out[i] *= 1 - P.wobble + P.wobble * Math.sin(ph + Math.sin(ph * 0.37) * 2);
  }
  // top and bottom cut
  let lp = 0, hp = 0, prev = 0;
  const la = Math.exp((-2 * Math.PI * P.bright) / sr), ha = Math.exp((-2 * Math.PI * P.low) / sr);
  for (let i = 0; i < N; i++) {
    lp = la * lp + (1 - la) * out[i];
    hp = ha * (hp + lp - prev);
    prev = lp;
    out[i] = hp;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < N; i++) out[i] /= peak || 1;
  const buf = actx.createBuffer(1, N, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

let lastStep = 0;
export function playStep(level = 1) {
  if (!actx || muted) return;
  const dest = out('step');
  const t = actx.currentTime + 0.004;
  if (t - lastStep < 0.12) return; // never a machine-gun of steps on a fast drag
  lastStep = t;
  fillBank();
  const src = actx.createBufferSource();
  src.buffer = bank.step.length ? bank.step[(Math.random() * bank.step.length) | 0] : stepBuffer();
  src.playbackRate.value = rnd(0.9, 1.08);
  const g = actx.createGain();
  g.gain.value = STEP.volume * Math.max(0.4, Math.min(1, level)) * rnd(0.85, 1.05);
  src.connect(g);
  g.connect(dest);
  src.start(t);
}

// ---------------------------------------------------------------- the four signature sounds

// Leaves flying AWAY (backspace, the wind after a burial, a breeze taking stomped pieces): mostly the wind
// itself going by, with only a trace of leaves on it. Every fly-away uses this one sound.
let lastAway = 0;
export function playFlyAway(level = 1) {
  if (!actx || muted) return;
  if (actx.currentTime - lastAway < 0.12) return;
  lastAway = actx.currentTime;
  const v = Math.max(0.2, Math.min(1, level));
  playWind(0.35 + 0.45 * v, 1.3 + 0.6 * v, 0.15, 'away');
}

// Leaves flying IN to form the words (typing, the leaves of a burial coming down). Two separate parts:
// first a soft "whoo" of the breeze that carries them, then - only when they land, `landAt` seconds later -
// the rustle of leaves gathering together, a soft crumple like a handful of dry leaves being squeezed.
// Every fly-in uses this one sound.
let lastArrive = 0;
export function playArrive(level = 1, landAt = 1.2) {
  if (!actx || muted || !noiseBuf) return;
  const dest = out('arrive');
  const t = actx.currentTime + 0.01;
  if (t - lastArrive < 0.2) return;
  lastArrive = t;
  const v = Math.max(0.2, Math.min(1, level));
  // 1) the wind that brings them: one full "whoo" - a low body of moving air and a rushing middle that swell
  //    together once and then ease away underneath the landing, so the two parts run into each other
  {
    const peakAt = Math.min(0.6, landAt * 0.45);
    const end = landAt + 0.45; // fades out under the gathering rustle
    const layer = (f0, f1, q, peak, lpHz) => {
      const src = actx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + peakAt);
      bp.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + end);
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lpHz;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak * v, t + peakAt);
      g.gain.exponentialRampToValueAtTime(0.0008, t + end); // a single long fall: one gust, not two
      src.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(dest);
      src.start(t, Math.random() * 1.5);
      src.stop(t + end + 0.05);
    };
    layer(160, 300, 0.7, 0.42, 900);   // the body of the wind
    layer(420, 820, 1.0, 0.3, 1800);   // the rush
  }
  // 2) on landing: a soft, unhurried "sha-sha" as the leaves settle together into the letter
  {
    fillBank();
    const t2 = t + landAt - 0.15;
    const src = actx.createBufferSource();
    src.buffer = bank.gather.length ? bank.gather[(Math.random() * bank.gather.length) | 0] : shaBuffer();
    src.playbackRate.value = rnd(0.94, 1.04);
    const lpf = actx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 3000; // nothing sharp on top
    const g = actx.createGain();
    g.gain.value = 0.2 * v;
    src.connect(lpf);
    lpf.connect(g);
    g.connect(dest);
    src.start(t2);
  }
}

// Withering: a dry, papery crinkle - many tiny, high crackles as the leaves curl. Called repeatedly while it
// lasts (level 0..1).
export function playCrinkle(level = 1) {
  if (!actx || muted) return;
  const dest = out('crinkle');
  fillBank();
  const src = actx.createBufferSource();
  src.buffer = fromBank(bank.snap, PRESETS.crisp);
  src.playbackRate.value = rnd(0.95, 1.25); // small, low and dry: curling, not breaking
  const hp = actx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1100;
  const g = actx.createGain();
  g.gain.value = 0.07 * Math.max(0.2, Math.min(1, level)) * rnd(0.7, 1.1);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(actx.currentTime + 0.003);
}

// A pine cone dropping onto the forest floor: one soft woody knock and the leaves it lands among.
export function playConeDrop(level = 1) {
  if (!actx || muted || !noiseBuf) return;
  const dest = out('cone');
  const t = actx.currentTime + 0.005;
  const v = Math.max(0.3, Math.min(1, level));
  const knock = (at, amp) => {
    for (const [f, q, a] of [[rnd(520, 640), 6, 1], [rnd(1150, 1350), 8, 0.5]]) {
      const src = actx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(amp * a * v, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(at, Math.random() * 1.5);
      src.stop(at + 0.12);
    }
  };
  knock(t, 0.9); // a single knock
  setTimeout(() => playRustle(0.5 * v), 40);
}

// Debug: render each effect offline and report its loudness (the loudest 100 ms, as RMS), to set TRIM.
export async function __measureSounds() {
  initAudio();
  await new Promise((r) => setTimeout(r, 1500)); // let the pre-rendered bank fill
  const real = actx, realMaster = master;
  const sr = 44100;
  const list = {
    crunch: () => playCrunch(0.8, 0.5), step: () => playStep(1), away: () => playFlyAway(0.8),
    arrive: () => playArrive(0.9, 1.25), crinkle: () => playCrinkle(0.8), cone: () => playConeDrop(1),
    snap: () => playSnap(0.25), rustle: () => playRustle(0.5),
  };
  const res = {};
  for (const [k, fn] of Object.entries(list)) {
    let worst = 0;
    for (let rep = 0; rep < 3; rep++) {
      const oc = new OfflineAudioContext(1, sr * 3, sr);
      actx = oc;
      master = oc.createGain();
      master.gain.value = 0.9;
      master.connect(oc.destination);
      lastAway = lastArrive = lastStep = -99;
      fn();
      const d = (await oc.startRendering()).getChannelData(0);
      const win = Math.round(sr * 0.1);
      for (let i = 0; i + win < d.length; i += Math.round(win / 4)) {
        let e = 0;
        for (let j = i; j < i + win; j++) e += d[j] * d[j];
        worst = Math.max(worst, Math.sqrt(e / win));
      }
    }
    res[k] = +(20 * Math.log10(worst + 1e-9)).toFixed(1);
  }
  actx = real;
  master = realMaster;
  return res;
}
