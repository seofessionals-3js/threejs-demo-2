// Cota: a section drawing that swings into perspective, a scan that turns ink into material, a walk in through the
// cut, and back out to the drawing. Everything on screen is a function of two numbers: T (seconds since the page was
// first seen) and the scroll. ?offline hands both to window.__frame(T, s), so a recorder can step it frame by frame.
import * as THREE from 'three';
import { buildPieces, solids, CUT, GX, DOOR, ST0, ST1, OG } from './house.js';
import { createDrawing } from './draw.js';
import { createLook } from './look.js';
import { createReal, SUN_DIR } from './real.js';
import { tier, low, mid, governor, visible, pinnedDpr } from './quality.js';

const Q = new URLSearchParams(location.search);
const OFF = Q.has('offline');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (t, t0, d) => cl((t - t0) / d);
const eOut = (x) => 1 - Math.pow(1 - cl(x), 3);
const eExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * cl(x)));
const eIO = (x) => { x = cl(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eSine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * cl(x));
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const INK = '#1b1c1e', PAPER = '#e9e7e0', ACC = '#e07a12', ACC_HI = '#e07a12', PLATE = '#f4f3ee';

window.__mainOwns = true;
window.__loader.p = 0.3;

// The canvas is as tall as the largest viewport (100lvh), so the URL bar of a phone sliding in and out changes neither
// the size of the picture nor the scale of the scroll. W and H are that box, everything is projected into it.
const glEl = document.getElementById('gl');
const boxW = () => Math.max(1, glEl.clientWidth || innerWidth), boxH = () => Math.max(1, glEl.clientHeight || innerHeight);
let W = boxW(), H = boxH();
// every pass draws into a target and the screen only ever gets a full-screen triangle pair: no depth, no stencil, no MSAA
const renderer = new THREE.WebGLRenderer({ canvas: glEl, antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance' });
renderer.setSize(W, H, false);

// ---------------------------------------------------------------- the camera
// One perspective camera for the whole page. The flat section is a 0.12 degree lens about 11 km away.
// A pose is a position, a point to look at, a lens (vertical fov) and a lens shift in metres at the target.
const cam = new THREE.PerspectiveCamera();
cam.userData.fr = new THREE.Vector4();
const TAN0 = Math.tan((0.06 * Math.PI) / 180);
function placePose(P) {
  cam.position.copy(P.p); cam.up.set(0, 1, 0); cam.lookAt(P.t); cam.updateMatrixWorld();
  const dist = P.p.distanceTo(P.t), th = Math.tan((P.fov * Math.PI) / 360), asp = W / H;
  const near = P.near ?? Math.max(0.05, Math.min(dist - 45, dist * 0.5)), far = Math.max(dist + 170, 220);
  const l = -th * asp + (P.sx || 0) / dist, r = th * asp + (P.sx || 0) / dist, b = -th + (P.sy || 0) / dist, t = th + (P.sy || 0) / dist;
  cam.near = near; cam.far = far;
  cam.projectionMatrix.makePerspective(l * near, r * near, t * near, b * near, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.userData.fr.set(l, r, b, t);
  cam.userData.fov = P.fov;
}
// an orbit state (target, yaw, pitch, lens, distance or the height of the view at the target) as a pose
function orbitPose(st) {
  const th = Math.tan((st.fov * Math.PI) / 360), dist = st.dist ?? st.hgt / 2 / th;
  const yw = (st.yaw * Math.PI) / 180, pt = (st.pitch * Math.PI) / 180;
  const t = V3(st.t);
  const p = t.clone().add(new THREE.Vector3(Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt)).multiplyScalar(dist));
  return { p, t, fov: st.fov, sx: st.sx || 0, sy: st.sy || 0 };
}

// Smooth ease-in that ends with positive velocity (f'(1) = 0.7) so the swing hands into the spline without stopping
const eInCont = (x) => { x = cl(x); return x * x * (2.3 - 1.3 * x); };

// framings: the hero (the flat sheet), the end of the dolly (f1), the section perspective the swing lands on
const F = {};
function frames() {
  W = boxW(); H = boxH();
  const asp = W / H;
  F.portrait = asp < 0.9;
  if (!F.portrait) {
    const vw = Math.max(36, 21 * asp);
    F.hero = { t: [12.6, 2.2, 0], hgt: vw / asp, sx: 0, sy: 0 };
    F.f1 = 58;
    F.end = { t: [10.9, 2.5, -4.4], yaw: 39, pitch: 8.2, fov: 35, dist: 25.5 };
    F.sweep = { t: [12.2, 2.7, -4.0], yaw: 20, pitch: 4.2, fov: 45, dist: 16.2 };
    F.levels = { x0: 22.6, x1: 25.0, short: false };
  } else {
    const vw = 21.5, vh = vw / asp;
    F.hero = { t: [12.4, 2.2, 0], hgt: vh, sx: 0, sy: 1.8 + 0.04 * vh - 1.2 };
    F.f1 = 72;
    F.end = { t: [11.6, 3.0, -3.8], yaw: 49, pitch: 9, fov: 52, dist: 44 };
    F.sweep = { t: [12.6, 2.8, -3.6], yaw: 28, pitch: 6, fov: 56, dist: 27 };
    F.levels = { x0: 21.6, x1: 23.4, short: true };
  }
  F.slot = document.querySelector('#tb .kp').getBoundingClientRect();
}

// the swing: the dolly and the three-quarter orbit overlap smoothly and finish with positive velocity into the sweep
function swingState(sw) {
  const h = F.hero, e = F.end;
  const q1 = eIO(ramp(sw, 0.0, 0.56));
  const q2 = eInCont(ramp(sw, 0.16, 0.84));
  const u = lerp(TAN0, Math.tan((F.f1 * Math.PI) / 360), q1);
  const fovA = (2 * Math.atan(u) * 180) / Math.PI, distA = h.hgt / 2 / u;
  return {
    t: [0, 1, 2].map((i) => lerp(h.t[i], e.t[i], q2)),
    yaw: lerp(0, e.yaw, q2), pitch: lerp(0, e.pitch, q2),
    fov: lerp(fovA, e.fov, q2), dist: lerp(distA, e.dist, q2),
    sx: lerp(h.sx, 0, q2), sy: lerp(h.sy, 0, q2),
  };
}

// ---------------------------------------------------------------- the walk
// Keys at eye height (1.62 m above the floor). rest controls how gently the camera glides through a labelled room.
// Both the scan sweep (WK[0] -> WK[1]) and the interior walk run on one continuous C1-smooth spline with zero stops.
const EYE = 1.62;
function walkKeys() {
  const pf = (f) => (F.portrait ? Math.min(78, f * 1.22) : f); // a tall frame needs a wider lens, but not a fisheye
  const K = (p, t, fov, rest = 0, label = null) => ({ p: V3(p), t: V3(t), fov: pf(fov), rest, label });
  const sw = orbitPose(F.sweep), se = orbitPose(F.end);
  const up = OG + EYE, dz = (DOOR[0] + DOOR[1]) / 2;            // eye height upstairs, the middle of the terrace door
  const sy = (x) => EYE + cl((x - ST0) / (ST1 - ST0)) * OG;     // eye height on the flight
  return [
    { p: se.p, t: se.t, fov: F.end.fov, rest: 0 },
    { p: sw.p, t: sw.t, fov: F.sweep.fov, rest: 0 },
    K([13.9, 1.75, 9.2], [12.0, 2.0, -4.0], 50, 30, ['±0.00', 'Durch den Schnitt', 'Schnitt A-A, auf Augenhöhe geöffnet']),
    K([14.9, EYE, -0.9], [12.3, 2.3, -6.6], 54, 70, ['±0.00', 'Der Wohnraum', '6,00 m hoch, die tiefe Dezembersonne']),
    K([12.4, EYE, -1.5], [8.6, 1.5, -4.4], 56, 0),
    K([8.9, EYE, -1.55], [6.2, 1.6, -5.6], 56, 0),
    K([6.62, EYE, -2.6], [6.4, 1.7, -7.4], 58, 0),
    K([6.5, EYE, -5.9], [9.8, 2.6, -7.2], 58, 0),
    K([6.35, EYE, -7.05], [9.5, 3.4, -7.1], 58, 0),
    K([8.6, sy(8.6), -6.85], [11.6, 4.9, -6.75], 58, 0),
    K([10.8, sy(10.8), -6.85], [12.8, 4.6, -6.0], 58, 0),
    K([12.7, up, -6.9], [12.6, 4.3, -2.6], 56, 0),
    K([12.3, up, -5.4], [12.6, 4.15, -1.2], 54, 55, ['+3.10', 'Die Galerie', 'Bücher, Schreibtisch, der Blick in den Luftraum']),
    K([13.05, up, -4.6], [16.4, 0.4, -3.9], 56, 55, ['+3.10', 'Über dem Wohnraum', 'Vom Rand der Galerie']),
    K([11.2, up, -4.9], [8.0, 4.3, -4.6], 56, 0),
    K([9.0, up, -4.87], [6.4, 4.0, -2.8], 56, 0),
    K([8.5, up, -4.3], [6.0, 3.9, -2.2], 54, 65, ['+3.10', 'Das Schlafzimmer', 'Nach Norden, ruhig und kühl']),
    K([8.85, up, -4.9], [11.5, 4.3, -5.0], 56, 0),
    K([10.6, up, -4.95], [12.6, 4.4, -6.2], 56, 0),
    K([12.3, up, -5.6], [12.2, 4.3, -7.4], 58, 0),
    K([12.75, up, -6.75], [10.0, 3.6, -7.2], 58, 0),
    K([11.6, sy(11.6), -6.85], [8.6, 2.2, -6.8], 58, 0),
    K([9.2, sy(9.2), -6.85], [6.4, 1.2, -6.7], 58, 0),
    K([6.6, EYE, -7.0], [6.4, 1.5, -4.0], 58, 0),
    K([6.45, EYE, -5.5], [6.9, 1.5, -1.6], 56, 0),
    K([7.0, EYE, -1.35], [11.4, 1.15, -3.9], 54, 55, ['±0.00', 'Küche & Essen', 'Kochinsel, Tisch für sechs, drei Kugelleuchten']),
    K([9.6, EYE, -1.5], [14.4, 1.4, -3.2], 54, 0),
    K([13.8, EYE, -1.7], [17.6, 1.5, dz], 54, 0),
    K([15.9, EYE, dz], [20.5, 1.4, dz], 54, 0),
    K([18.6, EYE, dz], [23.5, 0.9, -1.4], 54, 0),
    K([21.5, 1.3, -2.4], [25.0, 0.6, 0.5], 54, 0),
    K([25.6, 1.0, 1.2], [14.0, 2.6, -3.2], 52, 70, ['-0.60', 'Der Garten', 'Das Haus von Süden']),
    K([21.2, 1.4, -2.4], [14.0, 2.0, -2.8], 54, 0),
    K([18.4, EYE, dz], [12.0, 1.8, -2.6], 54, 0),
    K([15.4, EYE, -2.6], [12.6, 1.9, -6.0], 54, 0),
    K([14.2, 1.85, 9.0], [12.2, 2.2, -3.8], 50, 40, ['±0.00', 'Zurück durch den Schnitt', 'Das Haus öffnet sich wieder bei A-A']),
    { p: se.p, t: se.t, fov: F.end.fov, rest: 0 },
  ];
}
let WK = [], WALK = null;
function buildWalk() {
  WK = walkKeys();
  const n = WK.length;
  const pc = new THREE.CatmullRomCurve3(WK.map((k) => k.p), false, 'centripetal');
  const tc = new THREE.CatmullRomCurve3(WK.map((k) => k.t), false, 'centripetal');
  // Continuous C1-smooth scroll parameterization V[0..n-1] -> U[0..n-1] with strictly positive velocity everywhere
  const V = [0], U = [0];
  for (let i = 0; i < n - 1; i++) {
    let len;
    if (i === 0) {
      len = 210; // matched ~6.5 m/vh glide from F.end to F.sweep during the scan
    } else {
      const d = WK[i].p.distanceTo(WK[i + 1].p);
      const a0 = WK[i].t.clone().sub(WK[i].p).normalize(), a1 = WK[i + 1].t.clone().sub(WK[i + 1].p).normalize();
      const ang = (Math.acos(cl(a0.dot(a1), -1, 1)) * 180) / Math.PI;
      len = cl(9 * d + 0.55 * ang, 42, 145) + 0.65 * ((WK[i].rest || 0) + (WK[i + 1].rest || 0));
    }
    V.push(V[i] + len);
    U.push((i + 1) / (n - 1));
  }
  const L = V[n - 1];
  const sec = [];
  for (let i = 0; i < n - 1; i++) sec.push((U[i + 1] - U[i]) / (V[i + 1] - V[i]));
  const M = new Array(n);
  M[0] = 0.95 * sec[0];
  M[n - 1] = 0.95 * sec[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const hMean = 2 / (1 / sec[i - 1] + 1 / sec[i]);
    // Gently slow to 52% cruise speed through labelled rooms so they read clearly without ever freezing the scroll
    M[i] = (WK[i].rest > 0 ? 0.52 : 1.0) * hMean;
  }
  const stops = [];
  for (let i = 0; i < n; i++) {
    if (WK[i].label) {
      const span = Math.max(42, WK[i].rest * 0.95);
      stops.push({ i, v: V[i], a: V[i] - span, b: V[i] + span, label: WK[i].label });
    }
  }
  WALK = { pc, tc, V, U, M, stops, L, n };
  // where the camera passes the cut plane going in and coming out: the front half of the house is shown in between
  let inAt = null, outAt = null;
  for (let v = V[1]; v <= L; v += 0.5) if (walkPose(v).p.z < CUT - 0.35) { if (inAt === null) inAt = v; outAt = v; }
  WALK.inAt = inAt; WALK.outAt = outAt;
}
function walkPose(v) {
  const { pc, tc, V, U, M, L, n } = WALK;
  const vc = cl(v, 0, L);
  let i = n - 2;
  for (let j = 0; j < n - 1; j++) if (vc <= V[j + 1]) { i = j; break; }
  const h = Math.max(1e-6, V[i + 1] - V[i]), t = cl((vc - V[i]) / h), du = U[i + 1] - U[i];
  const m0 = (M[i] * h) / du, m1 = (M[i + 1] * h) / du;
  const t2 = t * t, t3 = t2 * t;
  const s = (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
  const u = cl(U[i] + du * cl(s, 0, 1), 0, 1);
  const idx = u * (n - 1), kIdx = Math.min(n - 2, Math.floor(idx)), kf = idx - kIdx;
  const fov = lerp(WK[kIdx].fov, WK[kIdx + 1].fov, eSine(kf));
  const p = pc.getPoint(u), tg = tc.getPoint(u);
  // shoot like an architectural photographer inside the house: level camera with vertical lens shift,
  // smoothly blended in between WK[1] (F.sweep) and WK[2] (Through the cut) and out at the end.
  const lv = idx <= 1 ? 0 : idx < 2 ? eIO(idx - 1) : idx <= n - 2 ? 1 : 1 - eIO(idx - (n - 2));
  const tl = new THREE.Vector3(tg.x, lerp(tg.y, p.y, lv), tg.z);
  const d = Math.hypot(tl.x - p.x, tl.z - p.z);
  const sy = cl(tg.y - tl.y, -0.42 * d, 0.42 * d);
  return { p, t: tl, fov, sx: 0, sy };
}

// ---------------------------------------------------------------- the story on the scroll (in screen heights)
const CH = {};
function chapters() {
  CH.swing = [0, 2.5];
  CH.sweep = [CH.swing[1], CH.swing[1] + WALK.V[1] / 100];
  CH.walk = [CH.sweep[1], CH.swing[1] + WALK.L / 100];
  CH.rev = [CH.walk[1], CH.walk[1] + 3.4];
  CH.end = [CH.rev[1], CH.rev[1] + 1.2];
  document.getElementById('track').style.height = `${(CH.end[1] + 1) * 100}vh`;
}
const SCAN1 = -60;
// Single C1-continuous forward scan trajectory from x = 24 across the house (to 4.4) and out over the forecourt (-60)
function forwardScanX(sp) {
  if (sp <= 0) return 40;
  if (sp >= 1) return SCAN1;
  if (sp <= 0.82) return lerp(24.0, 4.4, eInCont(sp / 0.82));
  const t = (sp - 0.82) / 0.18;
  // C1 slope match at sp = 0.82: d/dt = -19.6 * 0.7 * (0.18 / 0.82) = -3.01
  return 4.4 - 3.01 * t - 61.39 * t * t;
}
// everything the frame needs, from the scroll position y (in screen heights)
function story(y) {
  const S = { y };
  const p = (r) => cl((y - r[0]) / (r[1] - r[0]));
  S.sw = p(CH.swing); S.sweep = p(CH.sweep); S.walk = p(CH.walk); S.rev = p(CH.rev); S.end = p(CH.end);
  S.chapter = y < CH.swing[1] ? 'swing' : y < CH.sweep[1] ? 'sweep' : y < CH.walk[1] ? 'walk' : y < CH.rev[1] ? 'rev' : 'end';
  // the camera: swing hands directly into the continuous WALK spline at CH.swing[1]
  if (S.chapter === 'swing') S.pose = orbitPose(swingState(S.sw));
  else if (S.chapter === 'sweep' || S.chapter === 'walk') { S.wv = cl((y - CH.swing[1]) * 100, 0, WALK.L); S.pose = walkPose(S.wv); }
  else S.pose = orbitPose(swingState(1 - eInCont(S.rev)));
  // the scan plane: one unbroken C1 sweep forward across the house and hill, and one smooth sweep back at the end
  const sp = cl((y - 2.0) / (CH.sweep[1] - 2.0));
  S.scanIn = ramp(sp, 0.01, 0.08);
  if (S.chapter === 'swing' || S.chapter === 'sweep') S.scanX = forwardScanX(sp);
  else if (S.chapter === 'walk') S.scanX = -100;
  else S.scanX = S.rev < 0.58 ? lerp(-18, 30, eIO(ramp(S.rev, 0, 0.58))) : 40;
  S.scanLine = S.chapter === 'swing' || S.chapter === 'sweep'
    ? S.scanIn * (1 - ramp(sp, 0.84, 0.12))
    : S.chapter === 'rev' ? ramp(S.rev, 0, 0.05) * (1 - ramp(S.rev, 0.52, 0.08)) : 0;
  S.real = S.chapter === 'swing' ? S.scanIn > 0 : S.chapter === 'rev' ? S.rev < 0.62 : S.chapter !== 'end';
  // the sunbeams come in smoothly as the scan passes the south glass
  S.shaft = S.chapter === 'end' ? 0 : eSine(ramp(GX + 0.2 - S.scanX, 0, 6));
  // the front half of the house, while the camera is inside or in the garden
  S.front = S.chapter === 'walk' && S.wv > WALK.inAt && S.wv < WALK.outAt;
  // the sheet (notes, title block): the swing parameter decides, so it comes back on the way out
  const swv = S.chapter === 'swing' ? S.sw : S.chapter === 'rev' ? 1 - eInCont(S.rev) : S.chapter === 'end' ? 0 : 1;
  S.swv = swv;
  S.sheet = 1 - eSine(ramp(swv, 0.45, 0.16));
  S.tb = 1 - eSine(ramp(swv, 0.48, 0.14));
  S.sunLines = S.chapter === 'walk' ? 0 : S.chapter === 'rev' || S.chapter === 'end'
    ? Math.max(S.sheet, 0.5 * ramp(S.scanX - GX - 0.4, 0, 4))
    : lerp(1, 0.5, ramp(S.sw, 0.45, 0.3)) * (1 - ramp(GX + 0.4 - S.scanX, 0, 4));
  return S;
}

// ---------------------------------------------------------------- build
const pieces = buildPieces();
await new Promise((r) => setTimeout(r, 20));
const drawing = createDrawing(renderer, pieces);
const ACC_COL = new THREE.Color(ACC);
window.__loader.p = 0.5;
await new Promise((r) => setTimeout(r, 20));
const look = createLook(renderer, solids().filter((b) => b[2] < CUT && b[5] > CUT && b[6] !== 'glass'));
// what a device class gets: ambient occlusion only on desktop, a smaller static shadow map, fewer steps and pixels for
// the sunbeams, fewer lamps (see quality.js for the tiers: low is a phone such as a Galaxy A51)
const real = createReal(renderer, look, pieces, cam, {
  solid: Q.has('nopre') ? null : drawing.parts,
  ...(low ? { ao: false, shadowSize: 1536, sunSize: 512, shaftSteps: 10, shaftDiv: 3, lamps: 4 }
    : mid ? { ao: false, shadowSize: 2048, sunSize: 1024, shaftSteps: 16, shaftDiv: 2, lamps: 6 }
      : { ao: !Q.has('noao'), shadowSize: 4096, sunSize: 1024, shaftSteps: 22, shaftDiv: 2, lamps: 10 }),
});
window.__loader.p = 0.7;
// the lit house renders below the drawing's resolution (the ink stays sharp at full resolution on top)
const realScale = (dpr) => (Q.has('rs') ? +Q.get('rs') : low ? 0.75 : mid ? 0.7 : dpr >= 1.75 ? 0.65 : 1);
function sizesGL() {
  renderer.setSize(W, H, false);
  const s = drawing.resize();
  real.resize(s.x, s.y, realScale(renderer.getPixelRatio()));
}
// the resolution follows the frame time (quality.js): it starts from a pixel budget and steps down when frames run slow
let dirty = true;
const gov = governor({ apply: (dpr) => { renderer.setPixelRatio(dpr); sizesGL(); dirty = true; } });
frames(); buildWalk(); chapters();

// ---------------------------------------------------------------- the notes on the sheet (SVG, projected from the world every frame)
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('ov');
const mk = (tag, a = {}, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); parent.appendChild(e); return e; };
// attributes and styles are only written when their value changed: most of them stand still for most of the page
const set = (e, a) => { const c = e.__a || (e.__a = {}); for (const k in a) { const v = typeof a[k] === 'number' ? String(+a[k].toFixed(2)) : String(a[k]); if (c[k] !== v) { c[k] = v; e.setAttribute(k, v); } } };
const sty = (e, k, v) => { const c = e.__s || (e.__s = {}); if (c[k] !== v) { c[k] = v; e.style[k] = v; } };
const txt = (e, v) => { if (e.__t !== v) { e.__t = v; e.textContent = v; } };
const v3 = new THREE.Vector3();
const P = (x, y, z = 0) => { v3.set(x, y, z).project(cam); return [((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H]; };
let notes = [];
let tB = Infinity;
function clipStart(a, b, m) {
  let t = 0;
  for (const [k, lo, hi] of [[0, m, W - m], [1, m, H - m]]) {
    const d = b[k] - a[k];
    if (a[k] < lo && d > 0) t = Math.max(t, (lo - a[k]) / d);
    if (a[k] > hi && d < 0) t = Math.max(t, (hi - a[k]) / d);
  }
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), t];
}
function buildNotes() {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  notes = [];
  const pt = F.portrait;
  const R = pt ? 7 : 10;
  [['A', 5.15], ['B', 9.67], ['C', 13.6], ['D', 17.0]].forEach(([l, x], i) => {
    const g = mk('g');
    const ln = mk('line', { stroke: INK, 'stroke-width': 0.5, 'stroke-dasharray': '14 4 2 4', opacity: 0.6 }, g);
    const bub = mk('g', {}, g);
    mk('circle', { r: R, fill: PAPER, stroke: INK, 'stroke-width': 0.8 }, bub);
    const tx = mk('text', { 'text-anchor': 'middle', y: pt ? 2.8 : 3.6, style: pt ? 'font-size:7.5px' : 'font-size:10px' }, bub); tx.textContent = l;
    notes.push((b, S) => {
      const pl = eOut(ramp(b, 0.2 + i * 0.06, 0.75)), pb = eOut(ramp(b, 0.55 + i * 0.06, 0.35));
      const vis = S.sheet;
      if (vis <= 0.001) { set(g, { opacity: 0 }); return; }
      const top = P(x, pt ? 9.6 : 8.6), bot = P(x, -3.0);
      set(ln, { x1: top[0], y1: top[1] + R, x2: lerp(top[0], bot[0], pl), y2: lerp(top[1] + R, bot[1], pl) });
      set(bub, { transform: `translate(${top[0].toFixed(1)} ${top[1].toFixed(1)}) scale(${(0.6 + 0.4 * pb).toFixed(3)})`, opacity: pb });
      set(g, { opacity: (pl > 0 ? 1 : 0) * vis });
    });
  });
  const LV = [[6.4, '+6.40', 'Dach'], [3.1, '+3.10', 'Obergeschoss'], [0, '±0.00', 'Erdgeschoss'], [-0.6, '-0.60', 'Garten']];
  LV.forEach(([y, v, name], i) => {
    const g = mk('g');
    const ln = mk('line', { stroke: INK, 'stroke-width': 0.5 }, g);
    const tri = mk('path', { fill: 'none', stroke: INK, 'stroke-width': 0.8 }, g);
    const tx = mk('text', F.levels.short ? { 'text-anchor': 'end' } : {}, g); tx.textContent = F.levels.short ? v : `${v}  ${name.toUpperCase()}`;
    notes.push((b, S) => {
      const vis = S.sheet;
      if (vis <= 0.001) { set(g, { opacity: 0 }); return; }
      const pl = eOut(ramp(b, 1.45 + i * 0.07, 0.45)), pt2 = eOut(ramp(b, 1.7 + i * 0.07, 0.3));
      const a = P(F.levels.x0, y), e = P(F.levels.x1, y);
      set(ln, { x1: a[0], y1: a[1], x2: lerp(a[0], e[0], pl), y2: lerp(a[1], e[1], pl) });
      const k = pt ? 0.65 : 1;
      set(tri, { d: `M${e[0].toFixed(1)} ${e[1].toFixed(1)} l${-5 * k} ${-8 * k} h${10 * k} z`, opacity: pt2 });
      if (F.levels.short) set(tx, { x: Math.min(e[0] - 5, W - 10), y: e[1] - 4, opacity: pt2 }); else set(tx, { x: e[0] + 10, y: e[1] - 3, opacity: pt2 });
      set(g, { opacity: (pl > 0 ? 1 : 0) * vis });
    });
  });
  // sun angles: they draw from the sun's side, stay through the swing, and hand over to the real beams in the sweep
  [[21.2, 10.45, 12.74, 0.02, '21. MÄR  51°'], [19.3, 11.2, 15.65, 0.02, '21. JUN  72°'], [31.0, 10.97, 9.5, 0.02, '21. DEZ  27°']].forEach(([x0, y0, x1, y1, label], i) => {
    const ln = mk('line', { stroke: ACC_HI, 'stroke-width': 0.8, 'stroke-dasharray': '6 4' });
    const tx = mk('text', { class: 'sun' }); tx.textContent = label;
    notes.push((b, S) => {
      const vis = S.sunLines;
      if (vis <= 0.001) { set(ln, { opacity: 0 }); set(tx, { opacity: 0 }); return; }
      const p = eIO(ramp(b, 1.85 + i * 0.16, 0.8)), pl = ramp(b, 2.45 + i * 0.16, 0.3);
      const A = P(x0, y0), B = P(x1, y1);
      set(ln, { x1: A[0], y1: A[1], x2: lerp(A[0], B[0], p), y2: lerp(A[1], B[1], p), opacity: (p > 0 ? 1 : 0) * vis });
      const c = clipStart(A, B, pt ? 12 : 24), onEdge = c[2] > 0.001;
      const tw = pt ? 66 : 96, flip = onEdge || c[0] + 6 + tw > W - 8;
      set(tx, { x: Math.min(c[0] + (flip ? -4 : 6), W - 10), y: c[1] - 7, 'text-anchor': flip ? 'end' : 'start', opacity: pl * S.sheet });
    });
  });
  const dy = -2.6;
  [[5.0, 9.67, '4.67'], [9.67, 13.6, '3.93'], [13.6, 17.0, '3.40'], [17.0, 21.0, '4.00']].forEach(([x0, x1, label], i) => {
    const g = mk('g');
    const ln = mk('line', { stroke: INK, 'stroke-width': 0.6 }, g);
    const t0 = mk('line', { stroke: INK, 'stroke-width': 1.2 }, g), t1 = mk('line', { stroke: INK, 'stroke-width': 1.2 }, g);
    const tx = mk('text', { 'text-anchor': 'middle' }, g); tx.textContent = label;
    notes.push((b, S) => {
      const vis = S.sheet;
      if (vis <= 0.001) { set(g, { opacity: 0 }); return; }
      const p = eOut(ramp(b, 2.0 + i * 0.12, 0.5)), q = ramp(b, 2.3 + i * 0.12, 0.3);
      const A = P(x0, dy), B = P(x1, dy), E = [lerp(A[0], B[0], p), lerp(A[1], B[1], p)];
      set(ln, { x1: A[0], y1: A[1], x2: E[0], y2: E[1] });
      set(t0, { x1: A[0] - 4, y1: A[1] + 4, x2: A[0] + 4, y2: A[1] - 4, opacity: q });
      set(t1, { x1: B[0] - 4, y1: B[1] + 4, x2: B[0] + 4, y2: B[1] - 4, opacity: q });
      set(tx, { x: (A[0] + B[0]) / 2, y: A[1] - 6, opacity: q });
      set(g, { opacity: (p > 0 ? 1 : 0) * vis });
    });
  });
  const RM = [[14.9, 2.35, 'WOHNEN'], [10.7, 2.35, 'ESSEN'], [7.1, 2.35, 'KÜCHE'], [7.4, 5.2, 'SCHLAFEN'], [11.7, 5.2, 'GALERIE'], [15.4, 5.2, 'LUFTRAUM'], [19.0, 2.1, 'TERRASSE'], [1.4, 0.42, 'VORPLATZ'], [25.6, 0.2, 'GARTEN']];
  RM.forEach(([x, y, label], i) => {
    if (pt && (label === 'VORPLATZ' || label === 'GARTEN' || label === 'LUFTRAUM')) return;
    const tx = mk('text', { class: 'room', 'text-anchor': 'middle' }); tx.textContent = label;
    notes.push((b, S) => {
      const vis = 1 - eSine(ramp(S.swv, 0.48, 0.1));
      if (vis <= 0.001) { set(tx, { opacity: 0 }); return; }
      const p = eOut(ramp(b, 2.15 + i * 0.05, 0.45)), A = P(x, y);
      set(tx, { x: A[0], y: A[1] + (1 - p) * 5, opacity: p * vis });
    });
  });
  // the scan plane, drawn as its outline in the world
  const sg = mk('g', { opacity: 0 });
  const poly = mk('polygon', { fill: 'rgba(224,122,18,0.12)', stroke: ACC, 'stroke-width': 1.2 }, sg);
  const knock = mk('rect', { fill: PLATE, stroke: ACC, 'stroke-width': 0.8, opacity: 0.94, rx: 0 }, sg);
  const st1 = mk('text', { class: 'sun' }, sg);
  st1.textContent = 'CAD-SCHNITTEBENE';
  const st2 = mk('text', { class: 'sun', style: `fill:${INK}` }, sg);
  notes.push((b, S) => {
    const vis = S.scanLine * (S.chapter === 'rev' ? 0.6 : 1);
    if (vis <= 0.001 || S.scanX > 39 || S.scanX < -50) { set(sg, { opacity: 0 }); return; }
    const x = S.scanX;
    const c = [P(x, -2.2, -9.6), P(x, 7.9, -9.6), P(x, 7.9, 0.4), P(x, -2.2, 0.4)];
    set(poly, { points: c.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ') });
    const top = P(x, 8.4, 0.4);
    const tx = cl(top[0], 18, W - 188);
    const ty = cl(top[1], 86, H - 44);
    set(knock, { x: tx - 8, y: ty - 31, width: 150, height: 35 });
    set(st1, { x: tx, y: ty - 17 }); set(st2, { x: tx, y: ty - 4 }); txt(st2, `X = ${x.toFixed(2)} M`);
    set(sg, { opacity: vis });
  });
}

// ---------------------------------------------------------------- the small print
const $ = (q) => document.querySelector(q);
const el = { brand: $('.brand'), cta: $('.cta'), lines: [...document.querySelectorAll('.head .ln > span')], head: $('.head'), sub: $('.sub'), chip: $('.chip'), hint: $('.hint'),
  tb: $('#tb'), frame: $('#tb .frame'), fades: [...document.querySelectorAll('#tb .fade')], t1: $('#tb .t1'), scale: $('#tb .scale'), kp: $('#kp'),
  room: $('.room'), stamp: $('#tb .stamp'), rlv: $('.room .lv'), rname: $('.room b'), rnote: $('.room .nt'), end: $('.end'), endLines: [...document.querySelectorAll('.end .ln > span')], endSub: $('.end .sub2'), endBtn: $('.end .btn'),
  cadMap: $('#cad-map'), cmLbl: $('#cm-lbl'), cmScan: $('#cm-scan'), cmDot: $('#cm-dot'), cmCone: $('#cm-cone'), cmZones: [...document.querySelectorAll('#cad-map .cm-zone')] };
let tbMode = 0, tbSwap = -9, roomKey = '', hoverTag = '', poke = false;
const op = (e, v) => { if (e) sty(e, 'opacity', (+v).toFixed(3)); };

// Interactive CAD radar room jump targets
function jumpToStop(stopName, smooth = true) {
  for (const g of WALK.stops) {
    if (g.label[1] === stopName) {
      const targetY = CH.swing[1] + g.v / 100;
      window.scrollTo({ top: targetY * H, behavior: smooth && !REDUCED ? 'smooth' : 'auto' });
      return targetY;
    }
  }
  return null;
}
window.__jumpTo = jumpToStop;
el.cmZones.forEach((z) => {
  z.addEventListener('mouseenter', () => { hoverTag = z.dataset.tag || ''; poke = true; });
  z.addEventListener('mouseleave', () => { hoverTag = ''; poke = true; });
  z.addEventListener('click', (e) => { e.stopPropagation(); jumpToStop(z.dataset.stop); });
});

function hud(T, S) {
  const b = T - tB;
  op(el.brand, eOut(ramp(b, 0.1, 0.6)));
  const endIn = S.chapter === 'end' ? 1 : S.chapter === 'rev' ? ramp(S.rev, 0.86, 0.14) : 0;
  op(el.cta, eOut(ramp(b, 0.2, 0.6)) * (1 - ramp(endIn, 0, 0.25)));
  op(el.stamp, eOut(ramp(endIn, 0.55, 0.3)));
  sty(el.stamp, 'transform', `rotate(-8deg) scale(${(1.25 - 0.25 * eOut(ramp(endIn, 0.55, 0.3))).toFixed(3)})`);
  // the headline: each line slides up out of its own mask, and leaves as the scroll starts
  const out = S.chapter === 'swing' ? eIO(ramp(S.sw, 0, 0.1)) : 1;
  el.lines.forEach((ln, i) => {
    const s = eExpo(ramp(b, 0.45 + i * 0.17, 1.0));
    sty(ln, 'transform', `translateY(${(125 * (1 - s)).toFixed(2)}%)`);
    sty(ln, 'opacity', s > 0.005 ? '1' : '0');
  });
  sty(el.head, 'transform', `translateY(${(-26 * out).toFixed(1)}px)`); op(el.head, b > 0.44 ? 1 - out : 0);
  sty(el.sub, 'transform', `translateY(${(10 * (1 - eOut(ramp(b, 1.15, 0.6))) - 26 * out).toFixed(1)}px)`);
  op(el.sub, eOut(ramp(b, 1.15, 0.6)) * (1 - out));
  // the lens readout: a 35 mm equivalent focal length (24 mm high frame)
  const fov = cam.userData.fov, mm = 12 / Math.tan((fov * Math.PI) / 360), flat = fov < 1.2;
  const chip = S.chapter === 'walk'
    ? `Augenhöhe ${EYE.toFixed(2)} m &nbsp;/&nbsp; Objektiv <b>${Math.round(mm)} mm</b>`
    : `A-A &nbsp;/&nbsp; Objektiv <b>${Math.round(mm).toLocaleString('de-DE')} mm</b> &nbsp;/&nbsp; ${flat ? '1:100' : 'Nicht maßstäblich'}`;
  if (el.chip.__h !== chip) { el.chip.__h = chip; el.chip.innerHTML = chip; }
  op(el.chip, eOut(ramp(b, 2.5, 0.5)) * (1 - ramp(S.end, 0.2, 0.4)));
  // the hint at the start of the page
  const hv = S.chapter === 'swing' ? eOut(ramp(b, 2.8, 0.5)) * (1 - ramp(S.sw, 0, 0.06)) : 0;
  op(el.hint, hv);
  const bob = hv > 0.01 && !REDUCED;   // the hint bobs as a CSS animation, so a page at rest runs no script for it
  if (el.hint.__bob !== bob) { el.hint.__bob = bob; el.hint.classList.toggle('bob', bob); }
  // the title block: draws its frame, then its text. Its scale stops being true the moment the lens opens.
  sty(el.frame, 'clipPath', `inset(0 0 0 ${(100 * (1 - eIO(ramp(b, 0.55, 0.6)))).toFixed(2)}%)`);
  const m = flat ? 0 : 1;
  if (m !== tbMode) { tbMode = m; tbSwap = T; el.t1.textContent = m ? 'Schnittperspektive' : 'Schnitt A-A'; el.scale.textContent = m ? 'Nicht maßstäblich' : 'Maßstab 1:100'; }
  const swapK = OFF || S.tb > 0.8 ? 1 : ramp(T - tbSwap, 0, 0.35), tv = eOut(ramp(b, 0.9, 0.5));
  el.fades.forEach((f) => op(f, tv * (f === el.t1 || f.classList.contains('rows') ? lerp(0.15, 1, swapK) : 1)));
  const tbVis = cl((S.tb - 0.38) / 0.62);
  op(el.tb, tbVis); op(el.kp, tbVis);
  // the room you are in, as the camera glides through each stop
  let rk = '', rv = 0, activeStop = '';
  if (S.chapter === 'walk') for (const g of WALK.stops) {
    const v = eSine(ramp(S.wv, g.a, 24)) * (1 - eSine(ramp(S.wv, g.b - 24, 24)));
    if (v > rv) { rv = v; rk = g.label.join('|'); activeStop = g.label[1]; }
  }
  if (rk && rk !== roomKey) { roomKey = rk; const [lv, name, note] = rk.split('|'); el.rlv.textContent = lv; el.rname.textContent = name; el.rnote.textContent = note; }
  op(el.room, rv);
  sty(el.room, 'transform', `translateY(${(8 * (1 - rv)).toFixed(1)}px)`);

  // Live CAD section radar updates
  const camX = S.chapter === 'walk' ? cl(cam.position.x, 2.5, 28.5) : 11.5;
  const camY = S.chapter === 'walk' ? cl(cam.position.y, -0.2, 6.2) : 1.6;
  if (el.cadMap) {
    const mapVis = eOut(ramp(b, 1.8, 0.6)) * cl(1 - S.tb * 1.8) * (1 - ramp(S.end, 0.2, 0.4));
    op(el.cadMap, mapVis);
    const inter = mapVis > 0.25;
    if (el.cadMap.__i !== inter) { el.cadMap.__i = inter; el.cadMap.classList.toggle('interactive', inter); }
    txt(el.cmLbl, hoverTag
      ? `SPRUNG // ${hoverTag}`
      : S.chapter === 'walk'
        ? `POS X:${cam.position.x.toFixed(1)} Y:${cam.position.y.toFixed(1)}M`
        : `SCAN X:${cl(S.scanX, -20, 30).toFixed(1)}M // ${Math.round(mm)}MM`);
    const sx = cl(S.scanX, 1.8, 28.2);
    set(el.cmScan, { x1: sx, x2: sx, opacity: S.scanLine > 0.01 ? 1 : 0.25 });
    set(el.cmDot, { cx: camX, cy: camY });
    if (el.cmCone) {
      const dx = S.pose.t.x - S.pose.p.x, dy = (S.pose.t.y - S.pose.p.y) + (S.pose.sy || 0);
      const ang = S.chapter === 'walk' ? Math.atan2(dy, dx) : Math.PI;
      const r = 3.8, sp = 0.38;
      const x1 = camX + Math.cos(ang - sp) * r, y1 = camY + Math.sin(ang - sp) * r;
      const x2 = camX + Math.cos(ang + sp) * r, y2 = camY + Math.sin(ang + sp) * r;
      set(el.cmCone, { points: `${camX.toFixed(2)},${camY.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}` });
      set(el.cmCone, { opacity: S.chapter === 'walk' ? 1 : 0 });
    }
    if (el.cadMap.__stop !== activeStop) { el.cadMap.__stop = activeStop; el.cmZones.forEach((z) => z.classList.toggle('active', z.dataset.stop === activeStop)); }
  }

  // the end: the sheet is back, with the call to action
  const ev = S.chapter === 'end' ? 1 : S.chapter === 'rev' ? ramp(S.rev, 0.86, 0.14) : 0;
  sty(el.end, 'visibility', ev > 0 ? 'visible' : 'hidden');
  el.endLines.forEach((ln, i) => { sty(ln, 'transform', `translateY(${(110 * (1 - eOut(ramp(ev, 0.1 + i * 0.18, 0.6)))).toFixed(2)}%)`); });
  op(el.endSub, eOut(ramp(ev, 0.45, 0.4))); op(el.endBtn, eOut(ramp(ev, 0.6, 0.4)));
  sty(el.endBtn, 'transform', `translateY(${(10 * (1 - eOut(ramp(ev, 0.6, 0.4)))).toFixed(1)}px)`);
}

// ---------------------------------------------------------------- the frame
let tReady = null, loaderDone = false;
function loaderStep(T) {
  if (loaderDone) return;
  const p = Math.min(window.__loader.p, cl((T - 0.6) / 1.0));
  if (OFF && window.__loader.p >= 1) { tReady = 1.6; tB = 1.8; }
  else if (p >= 1 && tReady === null) { tReady = T; tB = T + 0.2; }
  const k = tB < Infinity ? ramp(T - tB, 0, 0.95) : 0;
  window.__drawLoader(T, p, k, F.slot);
  if (k >= 1 && !OFF) loaderDone = true;   // the key plan has landed in the title block: it is drawn again only if the slot moves
}
let lastY = -1, curS = null;
// One frame. Returns true if the picture was drawn again (the page at rest draws nothing).
function update(T, y, force = false) {
  loaderStep(T);
  const b = T - tB;
  const S = story(y); curS = S;
  placePose(S.pose);
  for (const n of notes) n(b, S);
  hud(T, S);
  const building = !(b > 3.8);
  const draw = building || Math.abs(y - lastY) > 1e-6 || dirty || force;
  if (draw) {
    drawing.parts.front.visible = S.front; real.setFront(S.front);
    const beams = S.real && S.shaft > 0.002;
    if (S.chapter === 'walk') {
      // inside the house there is no ink on screen: the lit house, its sunbeams, nothing else
      const rr = real.render(S.front, beams);
      drawing.present(cam, { tReal: rr.color, tShaft: rr.shafts, uShaft: S.shaft, uSunDir: SUN_DIR, uShaftK: F.portrait ? 0.65 : 1 });
    } else {
      drawing.renderND(cam);
      const rr = S.real ? real.render(S.front, beams) : null;
      drawing.compose(cam, {
        cAccent: ACC_COL,
        uEarth: eOut(ramp(b, 0.15, 0.85)),
        uLines: -1.6 + 2.7 * eOut(ramp(b, 0.25, 0.6)) + 26 * eIO(ramp(b, 0.85, 1.45)),
        uPoche: eIO(ramp(b, 0.5, 1.3)),
        uScanX: S.scanX, uScan: S.scanLine, uReal: S.real ? 1 : 0, uShaft: S.shaft, uSunDir: SUN_DIR,
        tReal: rr ? rr.color : null, tShaft: rr ? rr.shafts : null,
        uDpr: renderer.getPixelRatio(), px: 1, dK: 1.6, uShaftK: F.portrait ? 0.65 : 1,
      });
    }
    dirty = false;
  }
  lastY = y;
  window.__st = { T, y: +y.toFixed(3), b, chapter: S.chapter, fov: +cam.userData.fov.toFixed(2), pos: cam.position.toArray().map((v) => +v.toFixed(2)), scanX: +S.scanX.toFixed(2), front: S.front, dpr: renderer.getPixelRatio(), tier };
  return draw;
}

buildNotes();
// A real change of the box rebuilds everything. The URL bar of a phone only moves the bottom of the visible page:
// then the title block (and the key plan in it) has moved, nothing else.
let rsT = 0;
addEventListener('resize', () => {
  clearTimeout(rsT);
  rsT = setTimeout(() => {
    const landed = loaderDone;
    if (boxW() === W && boxH() === H) {
      F.slot = document.querySelector('#tb .kp').getBoundingClientRect();
      if (landed) window.__drawLoader((performance.now() - window.__T0) / 1000, 1, 1, F.slot);
      return;
    }
    frames(); buildWalk(); chapters();
    if (pinnedDpr != null) sizesGL(); else gov.refit();
    gov.hold(); buildNotes(); loaderDone = false; dirty = true;
  }, 80);
}, { passive: true });

// first frames behind the loader: build every shader and upload every texture (the drawing, the scan with the lit
// house behind it, the walk, the front half of the house) while nothing shows, so no chapter stutters when it arrives
update(0, 0, true);
update(0, (CH.sweep[0] + CH.sweep[1]) / 2, true);
update(0, CH.walk[0] + 0.5, true);
update(0, CH.swing[1] + (WALK.inAt + 30) / 100, true);
update(0, 0, true);
await document.fonts.ready;
window.__loader.p = 1;

// ---------------------------------------------------------------- design aids
// __frame(T, s): s is the scroll from 0 to 1 over the whole page. __at(y): y in screen heights. __ch: the chapters.
const total = () => CH.end[1];
let offT = 0, offY = 0;
window.__ch = CH;
window.__frame = (t, s) => new Promise((res) => { offT = t; offY = s * total(); update(t, offY, true); requestAnimationFrame(() => requestAnimationFrame(() => res(true))); });
window.__at = (t, y) => window.__frame(t, y / total());
window.__keys = () => WALK.stops.map((g) => ({ i: g.i, label: g.label[1], y: +(CH.swing[1] + g.v / 100).toFixed(3) }));
// the camera path against solid walls: every point closer than 0.18 m to a non-glass box
window.__checkPath = () => {
  const S = solids().filter((b) => b[6] !== 'glass'), hits = [];
  for (let v = WALK.V[1]; v <= WALK.L; v += 0.5) {
    const p = walkPose(v).p;
    for (const b of S) {
      const dx = Math.max(b[0] - p.x, 0, p.x - b[3]), dy = Math.max(b[1] - p.y, 0, p.y - b[4]), dz = Math.max(b[2] - p.z, 0, p.z - b[5]);
      if (Math.hypot(dx, dy, dz) < 0.18) { hits.push({ y: +(CH.swing[1] + v / 100).toFixed(2), p: p.toArray().map((q) => +q.toFixed(2)), box: b.slice(0, 6).map((q) => +q.toFixed(2)), kind: b[6] }); break; }
    }
  }
  return hits;
};
// the camera path against everything that is on screen at that moment (walls, glass, furniture, people, plants, the
// ground): the exact distance from the eye to the nearest surface, every half metre of the walk
window.__clear = (warn = 0.3, step = 0.5) => {
  const tri = new THREE.Triangle(), c = new THREE.Vector3(), q = new THREE.Vector3();
  const boxes = pieces.map((P) => { const b = new THREE.Box3(); for (let i = 0; i < P.pos.length; i += 3) b.expandByPoint(q.set(P.pos[i], P.pos[i + 1], P.pos[i + 2])); return b; });
  const near = []; let worst = { d: 99 };
  for (let v = WALK.V[1]; v <= WALK.L; v += step) {
    const p = walkPose(v).p, front = v > WALK.inAt && v < WALK.outAt; let min = 99, hit = null;
    for (let k = 0; k < pieces.length; k++) {
      const P = pieces[k];
      if (P.part === 'front' && !front) continue;
      if (boxes[k].distanceToPoint(p) > Math.min(min, 1)) continue;
      for (let i = 0; i < P.pos.length; i += 9) {
        tri.a.set(P.pos[i], P.pos[i + 1], P.pos[i + 2]); tri.b.set(P.pos[i + 3], P.pos[i + 4], P.pos[i + 5]); tri.c.set(P.pos[i + 6], P.pos[i + 7], P.pos[i + 8]);
        const d = tri.closestPointToPoint(p, c).distanceTo(p);
        if (d < min) { min = d; hit = { mat: P.mat, kind: P.kind, at: c.toArray().map((n) => +n.toFixed(2)) }; }
      }
    }
    const r = { y: +(CH.swing[1] + v / 100).toFixed(2), p: p.toArray().map((n) => +n.toFixed(2)), d: +min.toFixed(3), ...hit };
    if (min < worst.d) worst = r;
    if (min < warn && (!near.length || near[near.length - 1].mat !== r.mat || r.y - near[near.length - 1].y > 0.05)) near.push(r);
  }
  return { worst, near };
};
window.__bench = (n = 60, y0 = 0, y1 = total()) => {
  const gl = renderer.getContext(), px = new Uint8Array(4);
  renderer.info.autoReset = false; renderer.info.reset();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { update(9, lerp(y0, y1, i / (n - 1)), true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const ms = (performance.now() - t0) / n;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const out = { ms_per_frame: +ms.toFixed(2), buffer: [size.x, size.y], triangles_per_frame: Math.round(renderer.info.render.triangles / n), calls_per_frame: +(renderer.info.render.calls / n).toFixed(1) };
  renderer.info.autoReset = true;
  return out;
};
window.__dbg = { renderer, real, cam, THREE, drawing }; window.__ready = true;

// The loop. A frame is only worked out while something moves: the scroll, the first seconds of the page, the swap of
// the title block. At rest, and while the page is hidden, it costs a comparison.
let yCur = 0, last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (OFF) return;
  if (!visible()) { gov.frame(now, false); return; }
  const T = (now - window.__T0) / 1000;
  const yT = scrollY / H;
  const moving = Math.abs(yT - yCur) > 1e-4;
  if (REDUCED || !moving) yCur = yT;
  else yCur += (yT - yCur) * (1 - Math.exp(-dt * 6));
  const intro = !(T - tB > 4.4);   // also true while loading (tB is still infinite)
  if (intro) gov.hold(600);
  const drew = moving || dirty || intro || poke || T - tbSwap < 0.45 ? update(T, yCur) : false;
  poke = false;
  gov.frame(now, drew);
}
requestAnimationFrame(loop);
