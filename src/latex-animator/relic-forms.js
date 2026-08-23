// The relic ring's "Basic Form" SDF family, ported from product-playground's
// src/products/relic/basicform.ts (GLSL) and evaluated face-on: the form is
// a disk-plane figure — capsule spokes radiating from a center bead, an
// accent torus blooming on each spoke, optional inner/outer rings — plus a
// "corner" variant with diamond-section rays and a diamond torus. The ring
// carved an alternating pattern of these; here each call carves ONE
// randomized form into a particle-target point set.
//
// All constants are the settled (grow = 1) values from the shader.
const WEIGHT = 0.04;        // uFormWeight — the single line-thickness dial
const EC_ROD_R = 0.003;
const EC_TORUS_R = 0.005;
const CN_ROD_R = 0.015;
const CN_TORUS_R = 0.02;
const RING_OUTER_RAD = 2.904;
const RING_INNER_RAD = 1.44;
const FORM_R = 3.35;        // sampling half-extent in form units

function smin(a, b, k) {
  if (k < 0.001) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

// Fold the plane point into the nearest spoke's local frame. The shader's
// two fixed pre-rotations map the disk-plane point (u, 0, v) to local
// (0, a, b) with a = -v, b = u; the fold then rotates (a, b) so the spoke
// axis lies along +a.
function spokeLocal(u, v, spokes) {
  const a = -v, b = u;
  const spacing = (2 * Math.PI) / spokes;
  const closest = Math.floor(Math.atan2(b, a) / spacing + 0.5) * spacing;
  const c = Math.cos(-closest), s = Math.sin(-closest);
  return [a * c - b * s, a * s + b * c]; // [along-spoke, across-spoke]
}

function edgeCenterSpokes(u, v, spokes) {
  const [a, b] = spokeLocal(u, v, spokes);
  // rays: capsule along the spoke, radius EC_ROD_R, length 3.2
  const ya = Math.max(0, Math.min(3.2, a));
  const rays = Math.hypot(a - ya, b) - EC_ROD_R;
  // accent torus at 1.4 out: axis along the spoke, ring radius 0.5
  const accent = Math.abs(Math.hypot(a - 1.4, b) - 0.5) - EC_TORUS_R;
  return smin(rays, accent, 0.5);
}

function mapEdgeCenter(u, v, spokes, inner, outer) {
  const r = Math.hypot(u, v);
  const dCenter = r - 0.05;
  const dRing = Math.abs(r - RING_OUTER_RAD) - (outer ? 0.022 : -0.0033);
  const dSpokes = edgeCenterSpokes(u, v, spokes);
  const base = smin(dSpokes, dCenter, 0.26);
  const withRing = smin(base, dRing, 0.33);
  let result = outer ? withRing : Math.max(withRing, base - 0.33);
  if (inner) {
    const dInner = Math.abs(r - RING_INNER_RAD) - (-0.0033);
    const withInner = smin(result, dInner, 0.264);
    result = Math.max(withInner, result - 0.33);
  }
  return result;
}

function sdBox3(px, py, pz, bx, by, bz) {
  const qx = Math.abs(px) - bx, qy = Math.abs(py) - by, qz = Math.abs(pz) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0))
    + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
}

function sdDiamondTorus(px, py, pz, R, rr) {
  let qx = Math.hypot(px, pz) - R, qy = py;
  const c = Math.SQRT1_2;
  const rx = c * qx - c * qy, ry = c * qx + c * qy;
  const dx = Math.abs(rx) - rr, dy = Math.abs(ry) - rr;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

function mapCorner(u, v, spokes) {
  const [a, b] = spokeLocal(u, v, spokes);
  // diamond-section ray: box rotated 45° about the spoke, half-length 1.22
  const hb = b * Math.SQRT1_2;
  const ray = sdBox3(-hb, a - 1.22, hb, CN_ROD_R, 1.22, CN_ROD_R);
  // diamond torus accent at 1.5 out (tipped into the disk plane)
  const accent = sdDiamondTorus(1.5 - a, 0, b, 0.5, CN_TORUS_R);
  const star = smin(ray, accent, 0.5);
  // radial sun-blend garnish
  return smin(star, Math.hypot(u, v) + 1.0, 1.8);
}

// Sample one randomized form into particle targets: points are css px
// centered on the form's middle, scaled so the form's reach maps to
// radiusPx. Returns a Float32Array [x0,y0, x1,y1, ...].
export function sampleRelicForm({ radiusPx, maxPoints }) {
  const spokes = 3 + Math.floor(Math.random() * 10);   // 3–12
  const corner = Math.random() < 0.4;
  const inner = Math.random() < 0.5;
  const outer = Math.random() < 0.7;

  // No orientation roll: unrotated, the fold puts one spoke pointing
  // straight up and the field is even across the vertical axis — every form
  // comes out exactly upright and left/right mirror-symmetric.
  const N = 380;
  const stepU = (2 * FORM_R) / N;
  const xs = [], ys = [];
  for (let iy = 0; iy < N; iy++) {
    const v = -FORM_R + (iy + 0.5) * stepU;
    for (let ix = 0; ix < N; ix++) {
      const u = -FORM_R + (ix + 0.5) * stepU;
      const d = (corner ? mapCorner(u, v, spokes)
                        : mapEdgeCenter(u, v, spokes, inner, outer)) - WEIGHT;
      if (d < 0) { xs.push(u); ys.push(v); }
    }
  }
  if (!xs.length) return sampleRelicForm({ radiusPx, maxPoints }); // degenerate roll — reroll

  const scale = radiusPx / FORM_R;
  const n = Math.min(maxPoints, xs.length * 2);
  const points = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * xs.length);
    points[i * 2] = (xs[j] + (Math.random() - 0.5) * stepU) * scale;
    points[i * 2 + 1] = (ys[j] + (Math.random() - 0.5) * stepU) * scale;
  }
  return points;
}
