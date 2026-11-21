// The house, once, as data. Every look of the page is drawn from this list: the ink drawing and the lit material.
// Section runs along x: north and the forecourt on the left (x < 5), the terrace and the garden on the right.
// y up, z across the house (it spans z -8 to 4). Levels: ground floor 0.00, upper floor 3.10, roof 6.40, lawn -0.60.
// The section cuts at z = 0. Everything behind the cut is the "behind" part, everything in front of it the "front"
// part (shown only while the camera is inside), and the scale figures are their own part.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { low } from './quality.js';

let seed = 11;
export const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// what the drawing knows about a surface (written into the depth pass, see draw.js)
// paper 1, poche 2 + 0.9 * rank (rank orders the fill on load), earth cut 4, a scale figure 5, a tree or a plant 6
// (figures, trees and plants stay drawn in the lit house: the building turns real, the life in it stays drawn)
export const ID = { paper: 1, poche: 2, earth: 4, person: 5, life: 6 };
export const CUT = 0;
// the south glass, the open door bay in it, the stair along the back wall, the upper floor level
export const GX = 16.94, DOOR = [-3.9, -2.0], ST0 = 7.2, ST1 = 12.0, OG = 3.1;

// ---------------------------------------------------------------- the structure
// Two storeys of concrete under a flat roof. The stair runs in a slot along the back wall, so nothing hangs over it,
// and the camera leaves for the garden through a real opening in the glass.
function structure(box) {
  const carve = (a0, a1, b0, b1, holes) => {
    const cuts = [...new Set([a0, a1, ...holes.flatMap((h) => [h[0], h[1]])].filter((v) => v >= a0 && v <= a1))].sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const p0 = cuts[i], p1 = cuts[i + 1], mid = (p0 + p1) / 2;
      const hs = holes.filter((h) => h[0] < mid && h[1] > mid).map((h) => [h[2], h[3]]).sort((p, q) => p[0] - q[0]);
      let y = b0;
      for (const [q0, q1] of hs) { if (q0 > y) out.push([p0, p1, y, q0]); y = Math.max(y, q1); }
      if (y < b1) out.push([p0, p1, y, b1]);
    }
    return out;
  };
  // a wall: axis 'x' is thick along x and spans (z, y); axis 'z' is thick along z and spans (x, y)
  const wall = (axis, t0, t1, a0, a1, b0, b1, holes, m, inner = 'plaster') => {
    for (const [p0, p1, q0, q1] of carve(a0, a1, b0, b1, holes)) {
      if (axis === 'x') box(t0, q0, p0, t1, q1, p1, { all: m, px: t0 < 10 ? inner : m, nx: t0 < 10 ? m : inner });
      else box(p0, q0, t0, p1, q1, t1, { all: m, pz: t0 < 0 ? inner : m, nz: t0 < 0 ? m : inner });
    }
    for (const h of holes) {
      const tm = (t0 + t1) / 2, f = 0.05;
      if (axis === 'x') {
        if (h[3] - h[2] > 1.9 && h[2] <= b0 + 0.01) continue; // doors stay open (a hole from the floor up)
        box(tm - 0.04, h[2], h[0], tm + 0.04, h[2] + f, h[1], 'steel', 'frame'); box(tm - 0.04, h[3] - f, h[0], tm + 0.04, h[3], h[1], 'steel', 'frame');
        box(tm - 0.04, h[2], h[0], tm + 0.04, h[3], h[0] + f, 'steel', 'frame'); box(tm - 0.04, h[2], h[1] - f, tm + 0.04, h[3], h[1], 'steel', 'frame');
        box(tm - 0.01, h[2], h[0], tm + 0.01, h[3], h[1], 'glass', 'glass');
      } else {
        if (h[2] <= b0 + 0.01 && h[3] - h[2] > 1.9) continue;
        box(h[0], h[2], tm - 0.04, h[1], h[2] + f, tm + 0.04, 'steel', 'frame'); box(h[0], h[3] - f, tm - 0.04, h[1], h[3], tm + 0.04, 'steel', 'frame');
        box(h[0], h[2], tm - 0.04, h[0] + f, h[3], tm + 0.04, 'steel', 'frame'); box(h[1] - f, h[2], tm - 0.04, h[1], h[3], tm + 0.04, 'steel', 'frame');
        if (h[1] - h[0] > 3) { const m = (h[0] + h[1]) / 2; box(m - 0.03, h[2], tm - 0.04, m + 0.03, h[3], tm + 0.04, 'steel', 'frame'); }
        box(h[0], h[2], tm - 0.01, h[1], h[3], tm + 0.01, 'glass', 'glass');
      }
    }
  };
  const SG = { all: 'conc', py: 'oak', ny: 'ceiling' };
  // strip footings under the four sides
  box(4.6, -1.2, -8.4, 5.8, -0.35, 4.4, 'conc');
  box(16.2, -1.2, -8.4, 17.6, -0.35, 4.4, 'conc');
  box(5.8, -1.2, -8.4, 16.2, -0.35, -7.3, 'conc');
  box(5.8, -1.2, 3.3, 16.2, -0.35, 4.4, 'conc');
  // ground slab, and the terrace slab in front of the glass
  box(5.3, -0.35, -7.7, 17.0, 0, 3.7, SG);
  box(17.0, -0.35, -8.0, 21.0, 0, 4.0, { all: 'conc', py: 'pave' });
  // upper floor: open over the living room (x 13.6 to 17), with a slot for the stair along the back wall
  box(5.3, 2.75, -6.5, 13.6, 3.1, 3.7, SG);
  box(ST1, 2.75, -7.7, 13.6, 3.1, -6.5, SG);
  // flat roof with a short overhang to the south, and its parapet
  box(5.0, 6.0, -8.0, 17.6, 6.4, 4.0, { all: 'conc', py: 'gravel', ny: 'ceiling' });
  box(5.0, 6.4, -8.0, 17.6, 6.75, -7.8, 'conc'); box(5.0, 6.4, 3.8, 17.6, 6.75, 4.0, 'conc');
  box(5.0, 6.4, -7.8, 5.2, 6.75, 3.8, 'conc'); box(17.4, 6.4, -7.8, 17.6, 6.75, 3.8, 'conc');
  // north wall: the entrance door on the section line, a window for the bedroom
  wall('x', 5.0, 5.3, -8, 4, -0.35, 0, [], 'conc');
  wall('x', 5.0, 5.3, -8, 4, 0, 6.0, [[-1.2, 1.2, 0, 2.4], [-5.6, -2.4, 4.1, 5.5]], 'conc');
  // back and front walls
  wall('z', -8.0, -7.7, 5.3, 17.0, -0.35, 6.0, [[13.4, 15.5, 3.5, 5.3], [7.0, 10.6, 4.4, 5.5]], 'conc');
  wall('z', 3.7, 4.0, 5.3, 17.0, -0.35, 6.0, [[11.6, 15.6, 0.8, 2.4], [6.4, 9.2, 0.95, 2.2], [6.2, 8.8, 3.95, 5.4], [10.6, 13.0, 3.95, 5.4]], 'conc');
  // upper floor: the wall of the stair slot, and the bedroom partition with its door
  wall('z', -6.5, -6.35, 5.3, 9.75, 3.1, 6.0, [], 'plaster', 'plaster');
  wall('x', 9.6, 9.75, -6.35, 3.7, 3.1, 6.0, [[-5.4, -4.4, 3.1, 5.2]], 'plaster', 'plaster');
  // south glass over both storeys. One bay of the lower band (z -3.9 to -2.0) is left open: the door to the terrace.
  const glassRun = (x, y0, y1, z0, z1, step) => {
    box(x - 0.02, y0, z0, x + 0.02, y1, z1, 'glass', 'glass');
    for (let z = z0; z <= z1 + 1e-3; z += step) box(x - 0.06, y0, Math.max(z0, z - 0.04), x + 0.06, y1, Math.min(z1, z + 0.04), 'steel', 'frame');
    box(x - 0.06, y0, z0, x + 0.06, y0 + 0.06, z1, 'steel', 'frame'); box(x - 0.06, y1 - 0.06, z0, x + 0.06, y1, z1, 'steel', 'frame');
  };
  glassRun(GX, 0, 2.3, -7.7, DOOR[0], 1.9);
  glassRun(GX, 0, 2.3, DOOR[1], 3.7, 1.9);
  glassRun(GX, 2.3, 6.0, -7.7, 3.7, 1.9);
  // the leaf of the sliding door, parked behind the fixed pane next to it
  box(GX - 0.13, 0.02, -5.72, GX - 0.09, 2.24, -3.96, 'glass', 'glass');
  box(GX - 0.15, 0.02, -5.76, GX - 0.07, 2.24, -5.7, 'steel', 'frame'); box(GX - 0.15, 0.02, -3.98, GX - 0.07, 2.24, -3.92, 'steel', 'frame');
  box(GX - 0.15, 2.18, -5.7, GX - 0.07, 2.24, -3.98, 'steel', 'frame'); box(GX - 0.15, 0.02, -5.7, GX - 0.07, 0.08, -3.98, 'steel', 'frame');
  // balustrade at the edge of the gallery, and the guard along the stair slot
  box(13.56, 3.1, -7.7, 13.6, 4.15, 3.7, 'glass', 'glass'); box(13.52, 4.15, -7.7, 13.64, 4.2, 3.7, 'steel', 'frame'); box(13.53, 3.1, -7.7, 13.63, 3.16, 3.7, 'steel', 'frame');
  box(9.75, 3.1, -6.52, ST1, 4.1, -6.48, 'glass', 'glass'); box(9.75, 4.1, -6.54, ST1, 4.15, -6.46, 'steel', 'frame'); box(9.75, 3.1, -6.54, ST1, 3.15, -6.46, 'steel', 'frame');
  // the stair: one straight flight along the back wall, rising towards the garden side
  const n = 17, run = (ST1 - ST0) / n, rise = 3.1 / n, ST = { all: 'conc', py: 'oak' };
  for (let i = 0; i < n; i++) {
    const t = (i + 1) * rise;
    box(ST0 + i * run, Math.max(0, t - 0.45), -7.7, ST0 + (i + 1) * run, t, -6.5, ST, 'stair');
  }
  // paving of the forecourt, two steps from the terrace down to the lawn
  box(-6, 0, -6.5, 5.0, 0.03, 3.5, 'pave', 'land');
  box(21.0, -0.6, -5.4, 21.4, -0.2, -0.6, 'pave', 'land');
  box(21.4, -0.6, -5.4, 21.8, -0.4, -0.6, 'pave', 'land');
}

// ---------------------------------------------------------------- the staging
// Furniture as rounded boxes and lathes, placed room by room. Pieces carry a material key from look.js.
function staging(box, item, life) {
  // a rounded box only gets the segments its radius can show: a 1 cm arris needs one bevel, a cushion needs a curve
  const rb = (x0, y0, z0, x1, y1, z1, r, m) => {
    const rr = Math.min(r, (x1 - x0) / 2.1, (y1 - y0) / 2.1, (z1 - z0) / 2.1), seg = rr < 0.022 ? 1 : low || rr < 0.045 ? 2 : 3;
    const g = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, seg, rr); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); item(g, m);
  };
  const cyl = (x, y, z, r0, r1, h, m, seg = 24, open = false) => { const g = new THREE.CylinderGeometry(r0, r1, h, low ? Math.min(seg, 18) : seg, 1, open); g.translate(x, y + h / 2, z); item(g, m); };
  const sph = (x, y, z, r, m) => { const g = new THREE.SphereGeometry(r, low ? 18 : 24, low ? 12 : 16); g.translate(x, y, z); item(g, m); };
  const F = (x0, y0, z0, x1, y1, z1, m) => box(x0, y0, z0, x1, y1, z1, m, 'furn');
  const chair = (x, z, face, y = 0) => { // a wooden dining chair, face = +1 looks +z, -1 looks -z
    const s = face;
    rb(x - 0.22, y + 0.43, z - 0.21, x + 0.22, y + 0.47, z + 0.21, 0.015, 'oakFurn');
    rb(x - 0.22, y + 0.47, z - s * 0.21 - 0.02, x + 0.22, y + 0.88, z - s * 0.21 + 0.02, 0.015, 'oakFurn');
    for (const [dx, dz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) F(x + dx - 0.018, y, z + dz - 0.018, x + dx + 0.018, y + 0.43, z + dz + 0.018, 'oakFurn');
  };
  const lamp = (x, y, z, h, r) => { cyl(x, y, z, 0.16, 0.18, 0.02, 'blackSteel'); cyl(x, y, z, 0.012, 0.012, h, 'blackSteel', 8); cyl(x, y + h, z, r * 0.62, r, r * 1.1, 'shade', 28, true); };
  const plant = (x, y, z, h, s, potR = 0.24) => {
    cyl(x, y, z, potR, potR * 0.8, potR * 2, 'terracotta');
    life(canopy([[0, 0, 0, s, h / 2, s, Math.round(120 * h)]], 0.06, 0.13), 'leaf', [x, y + potR * 2 + h / 2 + 0.05, z]);
    life((() => { const g = new THREE.CylinderGeometry(0.02, 0.025, h * 0.5, 6); g.translate(x, y + potR * 2 + h * 0.25, z); return g; })(), 'bark');
  };

  // a chair that looks along +x (towards the garden)
  const chairX = (x, z, y = 0) => {
    rb(x - 0.21, y + 0.43, z - 0.22, x + 0.21, y + 0.47, z + 0.22, 0.015, 'oakFurn');
    rb(x - 0.23, y + 0.47, z - 0.22, x - 0.19, y + 0.88, z + 0.22, 0.015, 'oakFurn');
    for (const [dx, dz] of [[-0.18, -0.19], [0.18, -0.19], [-0.18, 0.19], [0.18, 0.19]]) F(x + dx - 0.018, y, z + dz - 0.018, x + dx + 0.018, y + 0.43, z + dz + 0.018, 'oakFurn');
  };
  // a pleated curtain hanging in a plane of constant x
  const curtain = (x, y0, y1, z0, z1) => item((() => {
    const w = z1 - z0, h = y1 - y0, g = new THREE.PlaneGeometry(w, h, 84, 16);
    g.rotateY(-Math.PI / 2); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
    const pos = g.attributes.position, folds = 6.5;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getZ(i) - z0) / w, v = (pos.getY(i) - y0) / h, amp = 0.05 * (1 + 0.24 * (1 - v));
      pos.setX(i, x + amp * Math.sin(u * folds * Math.PI * 2) + 0.01 * Math.sin(u * folds * Math.PI * 4 + 0.65) + 0.012 * Math.sin(v * Math.PI) * Math.cos(u * Math.PI * 3));
    }
    g.computeVertexNormals(); return g;
  })(), 'curtain');
  const Y = OG;

  // ---- living room under the open gallery (x 12.2 to 16.9): the sofa turns its back on the dining table
  rb(12.3, 0, -6.2, 16.4, 0.025, -1.9, 0.008, 'rug');
  F(12.62, 0.025, -5.52, 13.5, 0.07, -2.48, 'walnut');
  rb(12.55, 0.07, -5.6, 13.6, 0.38, -2.4, 0.05, 'boucle');
  for (let i = 0; i < 3; i++) {
    const z0 = -5.34 + i * 0.893;
    rb(12.85, 0.37, z0, 13.59, 0.55, z0 + 0.853, 0.075, 'boucle');
    rb(12.57, 0.4, z0, 12.89, 0.92, z0 + 0.853, 0.085, 'boucle');
  }
  rb(12.55, 0.07, -5.6, 13.6, 0.66, -5.34, 0.06, 'boucle'); rb(12.55, 0.07, -2.66, 13.6, 0.66, -2.4, 0.06, 'boucle');
  rb(12.95, 0.52, -5.2, 13.05, 0.88, -4.75, 0.05, 'cushionRust'); rb(12.95, 0.52, -3.2, 13.05, 0.86, -2.78, 0.05, 'cushionSage');
  rb(13.1, 0.55, -4.4, 13.58, 0.61, -3.6, 0.02, 'throwOchre');
  // a round stone table on a drum, with a vase, books and a bowl
  cyl(14.4, 0.025, -4.5, 0.3, 0.34, 0.255, 'travertine', 32); cyl(14.4, 0.28, -4.5, 0.5, 0.5, 0.06, 'travertine', 48);
  cyl(14.2, 0.34, -4.7, 0.09, 0.11, 0.26, 'ceramic');
  rb(14.36, 0.34, -4.46, 14.74, 0.38, -4.2, 0.005, 'book1'); rb(14.38, 0.38, -4.44, 14.7, 0.41, -4.22, 0.005, 'book2');
  item((() => { const g = new THREE.SphereGeometry(0.14, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.translate(14.62, 0.48, -4.74); return g; })(), 'ceramicDark');
  // two lounge chairs with their backs to the glass, clear of the door bay
  for (const cz of [-5.6, -4.36]) {
    rb(15.3, 0.1, cz - 0.4, 16.05, 0.4, cz + 0.4, 0.06, 'cognac'); rb(15.85, 0.36, cz - 0.4, 16.05, 0.86, cz + 0.4, 0.06, 'cognac');
    for (const dz of [-0.32, 0.32]) F(15.35, 0.025, cz + dz - 0.02, 16.0, 0.1, cz + dz + 0.02, 'blackSteel');
  }
  // a wood stove in the corner: its flue runs up through the open height to the roof
  F(15.7, 0, -7.62, 16.75, 0.02, -6.5, 'blackSteel');
  cyl(16.22, 0.02, -7.08, 0.2, 0.22, 0.13, 'blackSteel', 28); cyl(16.22, 0.15, -7.08, 0.3, 0.3, 0.92, 'blackSteel', 32);
  cyl(16.22, 1.07, -7.08, 0.09, 0.2, 0.09, 'blackSteel', 28); cyl(16.22, 1.16, -7.08, 0.09, 0.09, 4.84, 'blackSteel', 20);
  rb(16.07, 0.45, -6.8, 16.37, 0.82, -6.77, 0.02, 'fire');
  cyl(16.22, 6.4, -7.08, 0.09, 0.09, 0.85, 'blackSteel', 20); cyl(16.22, 7.25, -7.08, 0.16, 0.16, 0.03, 'blackSteel', 20);
  for (const [ly, lz] of [[0.065, -7.5], [0.065, -7.38], [0.165, -7.44]]) item((() => { const g = new THREE.CylinderGeometry(0.05, 0.05, 0.36, 12); g.rotateZ(Math.PI / 2); g.translate(15.95, ly, lz); return g; })(), 'bark');
  lamp(13.0, 0.025, -6.0, 1.55, 0.2);
  // a long low cabinet on the back wall, art above it
  F(12.4, 0.08, -7.66, 14.6, 0.52, -7.2, 'walnutDoors'); F(12.4, 0, -7.6, 14.6, 0.08, -7.25, 'blackSteel');
  cyl(12.8, 0.52, -7.42, 0.1, 0.14, 0.4, 'ceramic');
  rb(13.9, 0.52, -7.56, 14.3, 0.56, -7.3, 0.005, 'book0'); rb(13.93, 0.56, -7.54, 14.27, 0.59, -7.32, 0.005, 'book2');
  F(12.45, 1.1, -7.7, 14.55, 2.5, -7.67, 'oakFurn');
  F(12.5, 1.15, -7.67, 14.5, 2.45, -7.64, 'art1');
  // front part: a credenza under the window, a reading chair, an olive in a pot by the glass
  F(11.6, 0.08, 3.1, 15.6, 0.62, 3.66, 'walnutDoors'); F(11.6, 0, 3.15, 15.6, 0.08, 3.6, 'blackSteel');
  cyl(12.4, 0.62, 3.38, 0.1, 0.14, 0.42, 'ceramic');
  lamp(15.0, 0.62, 3.38, 0.44, 0.14);
  rb(9.9, 0.1, 2.3, 10.7, 0.42, 3.1, 0.06, 'leather'); rb(9.9, 0.3, 2.9, 10.7, 0.86, 3.1, 0.05, 'leather');
  for (const dx of [-0.33, 0.33]) F(10.3 + dx - 0.02, 0, 2.36, 10.3 + dx + 0.02, 0.1, 3.04, 'blackSteel');
  cyl(16.1, 0, 2.5, 0.42, 0.36, 0.62, 'travertine');
  life((() => { const g = new THREE.CylinderGeometry(0.06, 0.09, 1.6, 8); g.translate(16.1, 1.42, 2.5); return g; })(), 'bark');
  life(canopy([[0, 0, 0, 0.95, 0.6, 0.85, 320], [0.3, 0.4, 0.2, 0.6, 0.5, 0.55, 130]], 0.07, 0.13), 'olive', [16.0, 2.55, 2.5]);
  F(5.3, 0, 1.7, 5.9, 2.4, 3.6, 'walnutDoors');

  // ---- dining: a long oak table across the house, six chairs, three opal pendants
  rb(9.3, 0.72, -3.9, 12.1, 0.77, -2.9, 0.01, 'oakFurn');
  for (const tx of [9.75, 11.65]) F(tx - 0.04, 0, -3.7, tx + 0.04, 0.72, -3.1, 'oakFurn');
  for (const cx of [9.75, 10.7, 11.65]) { chair(cx, -4.27, 1); chair(cx, -2.53, -1); }
  for (const px of [9.9, 10.7, 11.5]) { cyl(px, 1.95, -3.4, 0.004, 0.004, 0.8, 'blackSteel', 4); sph(px, 1.84, -3.4, 0.14, 'opal'); }
  item((() => { const g = new THREE.SphereGeometry(0.2, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.translate(10.5, 0.97, -3.4); return g; })(), 'ceramic');
  cyl(11.2, 0.77, -3.3, 0.045, 0.055, 0.22, 'ceramicDark');

  // ---- kitchen: tall fronts on the north wall, an island along the house, three stools
  F(5.3, 0, -5.6, 5.95, 2.5, -2.4, 'walnutDoors');
  rb(7.3, 0, -5.6, 8.2, 0.88, -2.8, 0.02, 'walnutDoors');
  rb(7.25, 0.88, -5.65, 8.25, 0.93, -2.75, 0.01, 'marble');
  for (const sz of [-5.0, -4.2, -3.4]) { cyl(8.62, 0, sz, 0.02, 0.02, 0.66, 'blackSteel', 8); cyl(8.62, 0.66, sz, 0.19, 0.19, 0.06, 'leather'); cyl(8.62, 0, sz, 0.17, 0.17, 0.015, 'blackSteel'); }
  item((() => { const g = new THREE.SphereGeometry(0.18, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.translate(7.75, 1.11, -3.4); return g; })(), 'ceramic');
  cyl(7.7, 0.93, -5.1, 0.05, 0.06, 0.3, 'ceramicDark');
  rb(7.45, 0.93, -4.6, 7.95, 0.955, -4.25, 0.004, 'oakFurn');

  // ---- bedroom on the upper floor (x 5.3 to 9.6): the bed stands against the north wall, under the window
  rb(5.35, Y, -4.7, 9.0, Y + 0.02, -0.5, 0.006, 'rug');
  F(5.3, Y, -3.75, 5.38, Y + 0.98, -1.45, 'walnut');
  for (let i = 0; i < 6; i++) rb(5.38, Y + 0.08, -3.7 + i * 0.37, 5.5, Y + 0.94, -3.345 + i * 0.37, 0.035, 'headboard');
  F(5.62, Y + 0.02, -3.5, 7.5, Y + 0.14, -1.7, 'blackSteel');
  rb(5.5, Y + 0.14, -3.68, 7.66, Y + 0.37, -1.52, 0.035, 'walnut');
  rb(5.52, Y + 0.37, -3.62, 7.6, Y + 0.6, -1.58, 0.055, 'linen');
  rb(6.12, Y + 0.52, -3.66, 7.64, Y + 0.7, -1.54, 0.065, 'duvet');
  rb(5.98, Y + 0.66, -3.64, 6.3, Y + 0.73, -1.56, 0.03, 'linen');
  rb(7.0, Y + 0.6, -3.67, 7.56, Y + 0.74, -1.53, 0.04, 'cushionRust');
  for (const pz of [-3.52, -2.52]) rb(5.54, Y + 0.6, pz, 5.8, Y + 0.95, pz + 0.88, 0.08, 'linen');
  for (const pz of [-3.48, -2.48]) rb(5.78, Y + 0.6, pz, 6.06, Y + 0.87, pz + 0.8, 0.075, 'boucle');
  for (const bz of [-4.36, -1.32]) {
    for (const lx of [5.44, 5.86]) for (const lz of [bz + 0.04, bz + 0.46]) F(lx - 0.015, Y + 0.02, lz - 0.015, lx + 0.015, Y + 0.34, lz + 0.015, 'blackSteel');
    rb(5.4, Y + 0.34, bz, 5.9, Y + 0.53, bz + 0.5, 0.018, 'walnut');
    rb(5.39, Y + 0.53, bz - 0.01, 5.91, Y + 0.56, bz + 0.51, 0.008, 'travertine');
    lamp(5.62, Y + 0.56, bz + 0.2, 0.36, 0.12);
    rb(5.66, Y + 0.56, bz + 0.3, 5.86, Y + 0.6, bz + 0.46, 0.004, 'book2');
  }
  // a bench at the foot of the bed, a wardrobe along the wall of the stair, a curtain at the window
  for (const sz of [-3.38, -1.82]) F(7.92, Y + 0.02, sz - 0.02, 8.28, Y + 0.26, sz + 0.02, 'blackSteel');
  rb(7.88, Y + 0.26, -3.5, 8.32, Y + 0.32, -1.7, 0.015, 'walnut');
  for (let i = 0; i < 3; i++) rb(7.89, Y + 0.32, -3.49 + i * 0.6, 8.31, Y + 0.46, -2.91 + i * 0.6, 0.045, 'leather');
  F(5.6, Y, -6.33, 8.6, Y + 2.4, -5.75, 'walnutDoors');
  F(5.34, 5.94, -5.72, 5.5, 5.98, -4.6, 'blackSteel');
  curtain(5.42, Y + 0.01, 5.94, -5.7, -4.66);
  F(9.56, Y + 1.0, -3.3, 9.6, Y + 2.3, -1.1, 'walnut');
  F(9.54, Y + 1.05, -3.25, 9.56, Y + 2.25, -1.15, 'art4');
  // front part: a dresser under the window with a mirror, an armchair
  F(6.2, Y, 3.1, 8.8, Y + 0.75, 3.66, 'walnutDoors');
  rb(6.16, Y + 0.75, 3.06, 8.84, Y + 0.79, 3.68, 0.01, 'travertine');
  cyl(6.7, Y + 0.79, 3.36, 0.08, 0.06, 0.24, 'ceramic');
  rb(8.1, Y + 0.12, 1.2, 8.9, Y + 0.42, 2.0, 0.06, 'boucle'); rb(8.1, Y + 0.3, 1.8, 8.9, Y + 0.86, 2.0, 0.06, 'boucle');
  F(8.15, Y, 1.25, 8.85, Y + 0.12, 1.95, 'blackSteel');

  // ---- gallery on the upper floor (x 9.75 to 13.6): books on the partition wall, a desk at the balustrade
  rb(10.5, Y, -4.3, 13.2, Y + 0.02, -0.7, 0.006, 'rugDark');
  F(9.75, Y, -4.2, 9.78, Y + 2.65, -0.3, 'walnut');
  F(9.75, Y, -4.2, 10.12, Y + 2.65, -4.17, 'walnut'); F(9.75, Y, -0.33, 10.12, Y + 2.65, -0.3, 'walnut'); F(9.75, Y + 2.62, -4.17, 10.12, Y + 2.65, -0.33, 'walnut');
  for (let sI = 0; sI < 6; sI++) {
    const y = Y + 0.05 + sI * 0.43;
    F(9.78, y, -4.17, 10.12, y + 0.025, -0.33, 'walnut');
    let z = -4.1;
    while (z < -0.42) { const w = 0.03 + rnd() * 0.05, h = 0.22 + rnd() * 0.15; if (rnd() < 0.8) F(9.79, y + 0.025, z, 10.02 + rnd() * 0.05, y + 0.025 + h, z + w, 'book' + Math.floor(rnd() * 5)); else z += 0.12 * rnd(); z += w + 0.004; }
  }
  rb(12.35, Y + 0.72, -3.6, 13.25, Y + 0.76, -1.4, 0.01, 'oakFurn');
  F(12.4, Y + 0.02, -3.55, 13.2, Y + 0.72, -3.5, 'blackSteel'); F(12.4, Y + 0.02, -1.5, 13.2, Y + 0.72, -1.45, 'blackSteel');
  chairX(11.92, -2.5, Y + 0.02);
  rb(12.62, Y + 0.76, -2.72, 12.9, Y + 0.775, -2.28, 0.004, 'blackSteel'); rb(12.9, Y + 0.775, -2.72, 12.915, Y + 1.04, -2.28, 0.003, 'blackSteel');
  rb(12.55, Y + 0.76, -1.95, 12.85, Y + 0.82, -1.7, 0.005, 'book3'); rb(12.57, Y + 0.82, -1.93, 12.83, Y + 0.86, -1.72, 0.005, 'book2');
  cyl(12.7, Y + 0.76, -3.3, 0.07, 0.08, 0.02, 'blackSteel'); cyl(12.7, Y + 0.78, -3.3, 0.008, 0.008, 0.38, 'blackSteel', 6); cyl(12.7, Y + 1.16, -3.25, 0.06, 0.09, 0.1, 'shade', 20, true);
  plant(10.1, Y, -5.9, 1.25, 0.38, 0.2);
  F(12.25, Y + 1.0, -7.7, 13.45, Y + 2.1, -7.67, 'oakFurn');
  F(12.3, Y + 1.05, -7.67, 13.4, Y + 2.05, -7.64, 'artSection');
  // three opal globes hang from the roof into the open height above the living room
  for (const [px, py, pz] of [[14.9, 4.3, -4.5], [15.45, 3.8, -4.0], [15.0, 3.35, -3.5]]) { cyl(px, py, pz, 0.004, 0.004, 6.0 - py, 'blackSteel', 4); sph(px, py, pz, 0.15, 'opal'); }
  // front part: a daybed under the window, a lounge chair, a floor lamp
  F(10.42, Y + 0.02, 2.75, 13.0, Y + 0.1, 3.6, 'walnut');
  rb(10.36, Y + 0.1, 2.7, 13.06, Y + 0.4, 3.66, 0.05, 'leather');
  rb(10.5, Y + 0.4, 3.3, 10.95, Y + 0.74, 3.42, 0.05, 'cushionSage'); rb(11.05, Y + 0.4, 3.3, 11.5, Y + 0.76, 3.42, 0.05, 'boucle');
  rb(12.3, Y + 0.12, 0.9, 13.1, Y + 0.42, 1.7, 0.06, 'boucle'); rb(12.9, Y + 0.3, 0.9, 13.1, Y + 0.86, 1.7, 0.06, 'boucle');
  F(12.35, Y, 0.95, 13.05, Y + 0.12, 1.65, 'blackSteel');
  lamp(10.5, Y, 2.3, 1.48, 0.17);

  // ---- terrace and garden
  for (const tz of [-6.8, -5.4]) { rb(18.4, 0.18, tz, 20.3, 0.32, tz + 0.72, 0.03, 'teak'); rb(18.4, 0.3, tz, 18.85, 0.75, tz + 0.72, 0.03, 'teak'); F(18.5, 0, tz + 0.05, 20.2, 0.18, tz + 0.67, 'blackSteel'); }
  cyl(20.3, 0, -0.9, 0.34, 0.3, 0.6, 'terracotta'); life(canopy([[0, 0, 0, 0.5, 0.45, 0.5, 120]], 0.05, 0.1), 'leaf', [20.3, 1.05, -0.9]);
  rb(23.6, -0.42, -6.6, 25.4, -0.28, -5.9, 0.03, 'linenOut'); F(23.7, -0.6, -6.55, 25.3, -0.42, -5.95, 'teak');
}

// people and trees (none of them on the camera's way)
const PEOPLE = [[16.35, 0, -5.9, -1.2], [13.05, OG, -0.4, 1.5], [19.4, 0, -4.4, 1.1], [0.6, 0, -1.8, 2.6], [22.2, -0.6, -4.6, -0.4]];
const TREES = [['round', -1.5, 0, -5.5], ['cypress', -6.5, 0, -11], ['round', -9.0, 0, 1.5], ['olive', 30.5, -0.64, -10.6], ['cypress', 33.5, -0.91, -13], ['round', 36.5, -1.17, -4.5], ['cypress', 39.5, -1.33, -9], ['round', 8.6, 0, 8.4], ['cypress', 27.5, -0.6, 7.5], ['olive', 0.5, 0, 9.5]];
const figureGeo = () => {
  const g = new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.14, 0.1], [0.15, 0.82], [0.19, 1.0], [0.21, 1.36], [0.19, 1.44], [0.07, 1.5], [0.07, 1.54], [0.1, 1.6], [0.1, 1.7], [0.06, 1.75], [0, 1.76]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  g.scale(1, 1, 0.62); return g;
};

// a crown of small leaves, merged into one geometry: clusters are [cx, cy, cz, rx, ry, rz, count].
// A leaf is a flattened octahedron (8 triangles): two thirds of all triangles of the page used to be 20-sided leaves.
function canopy(clusters, s0, s1) {
  const list = [];
  for (const [cx, cy, cz, rx, ry, rz, n] of clusters) for (let i = 0; i < n; i++) {
    let x, y, z; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const k = 0.6 + 0.4 * Math.sqrt(rnd()), r = s0 + rnd() * (s1 - s0), ax = rnd() * 3, az = rnd() * 3;
    if (low && i % 10 > 6) continue;           // the phone draws seven leaves in ten; every tier rolls the same dice
    const g = new THREE.OctahedronGeometry(r * (low ? 1.3 : 1.14), 0); g.scale(1, 0.5, 1); g.rotateX(ax); g.rotateZ(az);
    g.translate(cx + x * rx * k, cy + y * ry * k, cz + z * rz * k); list.push(g);
  }
  return mergeGeometries(list);
}

// uv in metres from world position, by the face's main axis, so textures run on across pieces
function worldUV(pos, nor) {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]);
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else if (ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  return uv;
}

// ---------------------------------------------------------------- pieces
// Everything becomes a list of pieces: flat arrays of triangles in world space with a material key, a drawing id and
// a part (behind, front, people). draw.js and real.js merge them however they need.
export function buildPieces({ extent = [-16, 46, -24, 16] } = {}) {
  const pieces = [];
  const push = (pos, nor, mat, id, part, extra = {}) => pieces.push({ pos, nor, mat, id, part, ...extra });
  const faceKey = (spec, ax, sg) => {
    if (typeof spec === 'string') return spec;
    const k = (sg > 0 ? 'p' : 'n') + 'xyz'[ax];
    return spec[k] || spec.all;
  };
  // a box, split at the cut: the faces on the cut become poche on both halves
  const box = (x0, y0, z0, x1, y1, z1, spec, kind = 'struct') => {
    const halves = [];
    if (z1 <= CUT) halves.push(['behind', [x0, y0, z0, x1, y1, z1], false]);
    else if (z0 >= CUT) halves.push(['front', [x0, y0, z0, x1, y1, z1], false]);
    else { halves.push(['behind', [x0, y0, z0, x1, y1, CUT], true]); halves.push(['front', [x0, y0, CUT, x1, y1, z1], true]); }
    const cy = (y0 + y1) / 2;
    const rank = Math.min(1, Math.max(0, (cy + 1.2) / 8.0)) * 0.82 + rnd() * 0.18;
    for (const [part, b, split] of halves) {
      for (let ax = 0; ax < 3; ax++) for (const sg of [1, -1]) {
        const n = [0, 0, 0]; n[ax] = sg;
        const u = (ax + 1) % 3, v = (ax + 2) % 3;
        const at = sg > 0 ? b[ax + 3] : b[ax];
        const corner = (uu, vv) => { const q = [0, 0, 0]; q[ax] = at; q[u] = uu; q[v] = vv; return q; };
        const c = [corner(b[u], b[v]), corner(b[u + 3], b[v]), corner(b[u + 3], b[v + 3]), corner(b[u], b[v + 3])];
        const A = new THREE.Vector3(...c[0]), B = new THREE.Vector3(...c[1]), D = new THREE.Vector3(...c[2]);
        const order = B.clone().sub(A).cross(D.clone().sub(A)).dot(new THREE.Vector3(...n)) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        const pos = [], nor = [];
        for (const k of order) { pos.push(...c[k]); nor.push(...n); }
        const onCut = split && ax === 2 && ((part === 'behind' && sg > 0) || (part === 'front' && sg < 0));
        const glass = spec === 'glass';
        push(pos, nor, onCut ? 'poche' : faceKey(spec, ax, sg), glass ? 0 : onCut ? ID.poche + 0.9 * rank : ID.paper, part, { glass, kind });
      }
    }
  };
  const fromGeo = (g, mat, part, id = ID.paper, kind = 'item') => {
    const ng = g.index ? g.toNonIndexed() : g;
    push(Array.from(ng.attributes.position.array), Array.from(ng.attributes.normal.array), mat, id, part, { kind });
  };
  const item = (g, mat, at = null) => {
    if (at) g.translate(at[0], at[1], at[2]);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    fromGeo(g, mat, c.z < CUT ? 'behind' : 'front');
  };
  const life = (g, mat, at = null) => { if (at) g.translate(at[0], at[1], at[2]); g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); fromGeo(g, mat, c.z < CUT ? 'behind' : 'front', ID.life, 'life'); };
  structure(box);
  staging(box, item, life);
  // people: their own part, so the page can keep them drawn inside the real house
  for (const [x, y, z, ry] of PEOPLE) { const g = figureGeo(); g.rotateY(ry); g.translate(x, y, z); fromGeo(g, 'figure', 'people', ID.person, 'person'); }
  // trees
  for (const [kind, x, y, z] of TREES) {
    if (x < extent[0] + 2 || x > extent[1] - 2 || z < extent[2] + 2 || z > extent[3] - 2) continue;
    const at = (g, m, dy) => { g.translate(x, y + dy, z); life(g, m); };
    if (kind === 'cypress') {
      at(canopy([[0, 0, 0, 0.8, 3.3, 0.8, 520]], 0.11, 0.2), 'leafDark', 3.7);
      at(new THREE.CylinderGeometry(0.1, 0.14, 1.2, 8), 'bark', 0.6);
    } else {
      const olive = kind === 'olive';
      const t = new THREE.CylinderGeometry(0.1, 0.2, 2.4, 8); t.rotateZ(olive ? 0.16 : 0.04); at(t, 'bark', 1.2);
      const br = new THREE.CylinderGeometry(0.05, 0.09, 1.6, 6); br.rotateZ(-0.7); br.translate(0.3, 0, 0); at(br, 'bark', 2.4);
      const cl = olive ? [[-0.4, 0, 0, 1.6, 0.9, 1.4, 380], [0.9, 0.4, 0.3, 1.1, 0.7, 1.0, 220], [-0.2, 0.8, -0.4, 1.0, 0.6, 1.0, 180]]
        : [[0, 0, 0, 1.7, 1.6, 1.6, 520], [0.5, 0.9, 0.3, 1.1, 0.9, 1.0, 220]];
      at(canopy(cl, olive ? 0.1 : 0.12, olive ? 0.18 : 0.22), olive ? 'olive' : 'leaf', olive ? 3.0 : 3.6);
    }
  }
  // the land: the section profile extruded along z, split at the cut; the faces on the cut are the earth cut
  const [X0, X1, Z0, Z1] = extent;
  // under the house the earth is dug out only for the strip footings; the terrace ends in a low retaining edge
  const PH = [[X0, 0], [4.6, 0], [4.6, -1.2], [5.8, -1.2], [5.8, -0.35], [16.2, -0.35], [16.2, -1.2], [17.6, -1.2], [17.6, -0.35], [21, -0.35], [21, -0.6], [30, -0.6], [38, -1.3], [X1, -1.5], [X1, -8], [X0, -8]];
  const PS = [[X0, 0], [21, 0], [21, -0.6], [30, -0.6], [38, -1.3], [X1, -1.5], [X1, -8], [X0, -8]];
  const PF = PS;
  const band = (prof, z0, z1, part, cutAt) => {
    // one strip per stretch of the profile, each a plain quad down to the bottom: no long thin triangles, so the cut face
    // has no hairline cracks for the edge finder to ink
    const top = prof.slice(0, -2), yB = prof[prof.length - 1][1], strips = [];
    for (let i = 0; i < top.length - 1; i++) {
      const [xa, ya] = top[i], [xb, yb] = top[i + 1];
      if (xb - xa < 1e-6) continue;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape([[xa, ya], [xb, yb], [xb, yB], [xa, yB]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false });
      g.translate(0, 0, z0); strips.push(g.index ? g.toNonIndexed() : g);
    }
    const ng = mergeGeometries(strips);
    const P = ng.attributes.position.array, N = ng.attributes.normal.array;
    // split triangles into top (grass), sides and caps by their normal
    const groups = {};
    for (let t = 0; t < P.length / 9; t++) {
      const nz = N[t * 9 + 2], ny = N[t * 9 + 1], z = P[t * 9 + 2];
      const nx = N[t * 9];
      let key = ny > 0.35 ? 'grass' : prof === PS && Math.abs(nx) > 0.9 ? 'conc' : 'earthCut', id = ID.paper;
      if (Math.abs(nz) > 0.9 && cutAt !== null && Math.abs(z - cutAt) < 0.01) id = ID.earth;
      const k = key + ':' + id;
      (groups[k] ||= { pos: [], nor: [], mat: key, id });
      for (let j = 0; j < 9; j++) { groups[k].pos.push(P[t * 9 + j]); groups[k].nor.push(N[t * 9 + j]); }
    }
    for (const g2 of Object.values(groups)) push(g2.pos, g2.nor, g2.mat, g2.id, part, { kind: 'land' });
  };
  band(PH, -8, CUT - 0.003, 'behind', CUT - 0.003);
  band(PS, Z0, -8, 'behind', null);
  band(PH, CUT + 0.003, 4, 'front', CUT + 0.003);
  band(PF, 4, Z1, 'front', null);
  // the two halves of the land leave a hairline at the cut. While the front half is shown, a strip of lawn lies over it.
  for (let i = 0; i < PH.length - 3; i++) {
    const [xa, ya] = PH[i], [xb, yb] = PH[i + 1];
    if (xb - xa < 1e-6) continue;
    const q = [[xa, ya, -0.008], [xa, ya, 0.008], [xb, yb, 0.008], [xa, ya, -0.008], [xb, yb, 0.008], [xb, yb, -0.008]];
    push(q.flatMap(([x, y, z]) => [x, y + 0.0015, z]), q.flatMap(() => [0, 1, 0]), 'grass', ID.paper, 'front', { kind: 'land' });
  }
  for (const p of pieces) {
    p.uv = worldUV(p.pos, p.nor);
    if (p.mat === 'curtain') {
      for (let i = 0; i < p.pos.length / 3; i++) { p.uv[i * 2] = p.pos[i * 3 + 2] * 2.2; p.uv[i * 2 + 1] = p.pos[i * 3 + 1] * 1.4; }
    } else if (p.mat.startsWith('art')) { // a picture is painted for its face: stretch uv to 0..1 across it
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let i = 0; i < p.uv.length; i += 2) { u0 = Math.min(u0, p.uv[i]); u1 = Math.max(u1, p.uv[i]); v0 = Math.min(v0, p.uv[i + 1]); v1 = Math.max(v1, p.uv[i + 1]); }
      for (let i = 0; i < p.uv.length; i += 2) { p.uv[i] = (p.uv[i] - u0) / Math.max(1e-4, u1 - u0); p.uv[i + 1] = (p.uv[i + 1] - v0) / Math.max(1e-4, v1 - v0); }
    }
  }
  return pieces;
}

// merged geometry of some pieces, with the attributes asked for
export function mergePieces(list, { uv = false, id = false } = {}) {
  let n = 0; for (const p of list) n += p.pos.length;
  const pos = new Float32Array(n), nor = new Float32Array(n), uvs = uv ? new Float32Array((n / 3) * 2) : null, ids = id ? new Float32Array(n / 3) : null;
  let o = 0;
  for (const p of list) {
    pos.set(p.pos, o); nor.set(p.nor, o);
    if (uv) uvs.set(p.uv, (o / 3) * 2);
    if (id) ids.fill(p.id, o / 3, o / 3 + p.pos.length / 3);
    o += p.pos.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (id) g.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
  g.computeBoundingSphere();
  return g;
}

// boxes the camera must not enter (structure, glass marked), for checking a camera path
export function solids() {
  const list = [];
  structure((x0, y0, z0, x1, y1, z1, spec, kind = 'struct') => list.push([x0, y0, z0, x1, y1, z1, spec === 'glass' ? 'glass' : kind]));
  return list;
}
