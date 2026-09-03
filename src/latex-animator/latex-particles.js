// Particle engine for the LaTeX animator's "Particles" mode: a fixed pool
// of fine particles forms a group of equation lines, holds, then morphs to
// the next group, cycling forever. Between groups it can stop at (or be
// guided through) randomized relic-ring forms (see relic-forms.js). Motion
// is kinematic — each particle is a damped spring chasing its (possibly
// moving) attractor, stirred by a symmetric standing-wave field chosen from
// several noise patterns (polar Chladni, square-plate Chladni, concentric
// rings, kaleidoscope-folded value noise). Every field keeps many axes of
// symmetry, so particles stream like sand on a sounded plate.
//
// All positions are css px relative to the composition center; draw() takes
// a center and scale, so the same engine drives both the live overlay
// canvas and the video recorder.
//
// Targets may optionally carry per-point colors (Uint8Array, rgb per
// point — the Image Morph tab samples them from photos). When any line
// does, every particle tints toward its target's color over the morph;
// colorless targets (relic forms, plain lines) tint back to the base color.

const SPRING_K = 140;                        // spring stiffness, 1/s²
const SPRING_DAMP = 2 * Math.sqrt(SPRING_K); // critical damping, 1/s
const CYM_KS = [4, 6, 8, 10, 12]; // even angular orders → vertical mirror kept
const CYM_MORPH_AMP = 400;        // force scale per unit of the morph slider
const CYM_IDLE_AMP = 120;         // force scale per unit of the idle slider
const STAGGER_DEFAULT = 0.25;     // departure spread, fraction of the morph
const CYM_R_MIN = 12;             // px — tames the 1/r pole at the plate center
// per-field gain so every pattern lands in a similar force range
const GAIN = { polar: 1, plate: 0.7, rings: 3, kaleido: 50 };
const FORM_MORPH = 0.8;  // stop-mode interlude morph time, fraction of morphMs
const FORM_HOLD = 0.5;   // stop-mode interlude hold time, fraction of holdMs
const GUIDE_MORPH = 1.6; // guide-mode morph time, fraction of morphMs (two legs)
const FORM_ROW_N = 4;    // forms per interlude row
const PLACE_MARGIN = 20; // px kept clear of the canvas edge in random placement

function withAlpha(color, a) {
  if (color.startsWith('rgba(')) return color.replace(/,[^,]+\)$/, `, ${a})`);
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
  return color;
}

// Cheap smooth value noise for the kaleidoscope field.
function hash2(ix, iy) {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return hash2(ix, iy) * (1 - u) * (1 - v) + hash2(ix + 1, iy) * u * (1 - v)
    + hash2(ix, iy + 1) * (1 - u) * v + hash2(ix + 1, iy + 1) * u * v;
}

export class LatexParticleEngine {
  // lines: [{ points, w, h }] centered per line (css px).
  // params: { sizePx, glow, blend, morphMs, holdMs, scatter, idle, cymScale,
  //           cymSize, linesPer, place ('center'|'random'),
  //           relicMode ('off'|'stop'|'guide'), noise ('polar'|'plate'|
  //           'rings'|'kaleido'),
  //           idleNoise (optional: a noise family for the hold's plate hum,
  //             'same' or absent → the transition's field),
  //           ramp (0–0.5, optional: fraction of each morph over which the
  //             cymatic drive eases in from / back out to the idle level —
  //             0 switches instantly), stagger (0–0.9, optional: how far
  //             into the morph the last particle waits before leaving) }
  // forms: relic-form point sets ([] disables interludes/guides).
  // formRow: { radiusPx, rowWidthPx } for laying rows of forms.
  // area: { w, h, lineGap } — canvas size and line-stack gap, css px.
  constructor({ lines, count, params, color, forms = [], formRow = null, area = null }) {
    this.lines = lines;
    this.count = count;
    this.p = params;
    this.color = color;
    this.forms = forms;
    this.formRow = formRow || { radiusPx: 180, rowWidthPx: 900 };
    this.area = area || { w: 1200, h: 500, lineGap: 18 };
    this.lineIndex = 0;
    this.queue = [];
    this.time = 0;
    this.prevOffset = { x: 0, y: 0 };
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.sx = new Float32Array(count);
    this.sy = new Float32Array(count);
    this.tx = new Float32Array(count);
    this.ty = new Float32Array(count);
    this.gx = new Float32Array(count); // guide waypoints (guide mode)
    this.gy = new Float32Array(count);
    this.dj = new Float32Array(count); // per-particle stagger lot [0,1) × params.stagger
    // optional per-particle color (current / morph source / morph target)
    this.hasColors = lines.some(l => l.colors);
    if (this.hasColors) {
      for (const k of ['cr', 'cg', 'cb', 'sr', 'sg', 'sb', 'tr', 'tg', 'tb']) this[k] = new Float32Array(count);
      const [r, g, b] = this._baseRgb();
      this.cr.fill(r); this.cg.fill(g); this.cb.fill(b);
    }
    this._sprites = new Map(); // quantized color → dot sprite (per-color draw)
    this._spriteGlow = -1;
    for (let i = 0; i < count; i++) {
      this.dj[i] = Math.random();
      this.x[i] = (Math.random() - 0.5) * 600; // born as loose dust
      this.y[i] = (Math.random() - 0.5) * 300;
    }
    const group = this._lineGroup(0);
    this.seg = {
      points: group.points, colors: group.colors, morphMs: params.morphMs, holdMs: params.holdMs,
      line: 0, offset: this._placeOffset(group),
    };
    this.phase = 'morph';
    this.phaseT = 0;
    this._newFieldMode();
    this._assign(this.seg);
    this._dot = null;
    this._dotKey = '';
  }

  setParams(params) {
    const prevIdle = this._idleNoiseKey();
    this.p = params;
    if (this._idleNoiseKey() !== prevIdle) this._rollIdleMode(); // hum switches at once
  }

  // The idle (hold) field family: a separate pattern when params.idleNoise
  // names a family other than the transition's, else the transition's own.
  _idleNoiseKey() {
    const n = this.p.idleNoise;
    return n && n !== 'same' && n !== (this.p.noise || 'polar') ? n : null;
  }
  _rollIdleMode() {
    const n = this._idleNoiseKey();
    this.idleMode = n ? this._makeMode(n) : null;
  }
  setColor(color) { this.color = color; }

  // Stack linesPer consecutive lines (wrapping) into one centered target.
  _lineGroup(start) {
    const K = Math.max(1, Math.min(this.lines.length, this.p.linesPer || 1));
    const chosen = [];
    for (let i = 0; i < K; i++) chosen.push(this.lines[(start + i) % this.lines.length]);
    const gap = this.area.lineGap;
    const totalH = chosen.reduce((s, l) => s + l.h, 0) + gap * (chosen.length - 1);
    let total = 0;
    chosen.forEach(l => { total += l.points.length; });
    const out = new Float32Array(total);
    const withColors = chosen.every(l => l.colors);
    const colors = withColors ? new Uint8Array(total / 2 * 3) : null;
    let o = 0, co = 0, yTop = -totalH / 2;
    for (const l of chosen) {
      const cy = yTop + l.h / 2;
      for (let i = 0; i < l.points.length; i += 2) {
        out[o++] = l.points[i];
        out[o++] = l.points[i + 1] + cy;
      }
      if (colors) { colors.set(l.colors, co); co += l.colors.length; }
      yTop += l.h + gap;
    }
    return { points: out, colors, w: Math.max(...chosen.map(l => l.w)), h: totalH };
  }

  // Random placement: a target-group offset that keeps its box on-canvas.
  _placeOffset(group) {
    if (this.p.place !== 'random') return { x: 0, y: 0 };
    const mx = Math.max(0, (this.area.w - group.w) / 2 - PLACE_MARGIN);
    const my = Math.max(0, (this.area.h - group.h) / 2 - PLACE_MARGIN);
    return { x: (Math.random() * 2 - 1) * mx, y: (Math.random() * 2 - 1) * my };
  }

  // One interlude row of n forms, laid out side by side and scaled to fit
  // the available width. Forms are drawn fresh from the pool every time.
  _formRowPoints(n) {
    const { radiusPx, rowWidthPx } = this.formRow;
    const cell = rowWidthPx / n;
    const scale = Math.min(1, (cell * 0.46) / radiusPx);
    const chosen = [];
    let total = 0;
    for (let k = 0; k < n; k++) {
      const f = this.forms[Math.floor(Math.random() * this.forms.length)];
      chosen.push(f);
      total += f.length;
    }
    const out = new Float32Array(total);
    let o = 0;
    chosen.forEach((f, k) => {
      const cx = (k - (n - 1) / 2) * cell;
      for (let i = 0; i < f.length; i += 2) {
        out[o++] = f[i] * scale + cx;
        out[o++] = f[i + 1] * scale;
      }
    });
    return out;
  }

  // Full cycle duration — the recorder uses this to size a take.
  totalCycleMs() {
    const K = Math.max(1, Math.min(this.lines.length, this.p.linesPer || 1));
    const segs = Math.ceil(this.lines.length / K);
    let per = this.p.morphMs + this.p.holdMs;
    if (this.forms.length && this.p.relicMode === 'guide') {
      per = this.p.morphMs * GUIDE_MORPH + this.p.holdMs;
    } else if (this.forms.length && this.p.relicMode === 'stop') {
      per += this.p.morphMs * FORM_MORPH + this.p.holdMs * FORM_HOLD;
    }
    return segs * per;
  }

  // Pair particles to the segment's points by x-rank so the morph flows
  // across instead of crossing wildly; guide waypoints pair the same way.
  _assign(seg) {
    const pts = seg.points, nPts = pts.length / 2, n = this.count;
    const off = seg.offset || { x: 0, y: 0 };
    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => this.x[a] - this.x[b]);
    const picks = new Array(n);
    for (let i = 0; i < n; i++) picks[i] = Math.floor(Math.random() * nPts);
    picks.sort((a, b) => pts[a * 2] - pts[b * 2]);
    const cols = this.hasColors ? seg.colors : null;
    const base = this.hasColors ? this._baseRgb() : null;
    for (let i = 0; i < n; i++) {
      const pi = order[i], ti = picks[i];
      this.sx[pi] = this.x[pi];
      this.sy[pi] = this.y[pi];
      this.tx[pi] = pts[ti * 2] + off.x;
      this.ty[pi] = pts[ti * 2 + 1] + off.y;
      if (base) {
        this.sr[pi] = this.cr[pi]; this.sg[pi] = this.cg[pi]; this.sb[pi] = this.cb[pi];
        if (cols) {
          this.tr[pi] = cols[ti * 3]; this.tg[pi] = cols[ti * 3 + 1]; this.tb[pi] = cols[ti * 3 + 2];
        } else {
          this.tr[pi] = base[0]; this.tg[pi] = base[1]; this.tb[pi] = base[2];
        }
      }
    }
    this.guided = !!seg.guide;
    if (seg.guide) {
      // the form ghost sits midway between where we left and where we land
      const g = seg.guide, gN = g.length / 2;
      const go = { x: (this.prevOffset.x + off.x) / 2, y: (this.prevOffset.y + off.y) / 2 };
      const gpicks = new Array(n);
      for (let i = 0; i < n; i++) gpicks[i] = Math.floor(Math.random() * gN);
      gpicks.sort((a, b) => g[a * 2] - g[b * 2]);
      for (let i = 0; i < n; i++) {
        const pi = order[i], gi = gpicks[i];
        this.gx[pi] = g[gi * 2] + go.x;
        this.gy[pi] = g[gi * 2 + 1] + go.y;
      }
    }
    if (seg.line !== undefined) this.prevOffset = off;
  }

  // Refill the queue for the next line group, then start the next segment.
  _advanceTarget() {
    if (!this.queue.length) {
      const K = Math.max(1, Math.min(this.lines.length, this.p.linesPer || 1));
      const next = (this.lineIndex + K) % this.lines.length;
      const group = this._lineGroup(next);
      const offset = this._placeOffset(group);
      if (this.forms.length && this.p.relicMode === 'stop') {
        this.queue.push({
          points: this._formRowPoints(FORM_ROW_N),
          morphMs: this.p.morphMs * FORM_MORPH,
          holdMs: this.p.holdMs * FORM_HOLD,
          offset: { x: 0, y: 0 },
        });
      }
      const seg = {
        points: group.points,
        colors: group.colors,
        morphMs: this.p.morphMs,
        holdMs: this.p.holdMs,
        line: next,
        offset,
      };
      if (this.forms.length && this.p.relicMode === 'guide') {
        seg.guide = this._formRowPoints(FORM_ROW_N);
        seg.morphMs = this.p.morphMs * GUIDE_MORPH; // two legs, one sweep
      }
      this.queue.push(seg);
    }
    this.seg = this.queue.shift();
    if (this.seg.line !== undefined) this.lineIndex = this.seg.line;
    this._newFieldMode(); // every transition rings its own pattern
    this._assign(this.seg);
    this.phase = 'morph';
    this.phaseT = 0;
  }

  // Excite fresh symmetric fields for the coming segment: one for the
  // transition and, if a different family is chosen, one for the hold.
  _newFieldMode() {
    this.mode = this._makeMode(this.p.noise || 'polar');
    this._rollIdleMode();
  }

  // Roll one randomized field of the given family. All patterns keep at
  // least both mirror axes; wavelengths center on cymScale ±30%.
  _makeMode(noise) {
    const base = this.p.cymScale || 150;
    const lam = () => base * (0.7 + Math.random() * 0.6);
    if (noise === 'plate') {
      const nm = () => [1 + Math.floor(Math.random() * 4), 1 + Math.floor(Math.random() * 4)];
      return { type: 'plate', nm1: nm(), nm2: nm(), a: Math.PI / lam() };
    }
    if (noise === 'rings') {
      return { type: 'rings', q1: 2 * Math.PI / lam(), q2: 2 * Math.PI / lam() };
    }
    if (noise === 'kaleido') {
      return {
        type: 'kaleido',
        k: CYM_KS[Math.floor(Math.random() * CYM_KS.length)],
        lam: lam(),
        seed: Math.random() * 100,
      };
    }
    const pick = () => ({
      k: CYM_KS[Math.floor(Math.random() * CYM_KS.length)],
      q: 2 * Math.PI / lam(),
    });
    return { type: 'polar', a: pick(), b: pick() };
  }

  // Symmetric field force of mode m at (px,py). s crossfades paired
  // sub-modes. Chladni-style fields use the sand force F = −∇(Φ²); the
  // kaleidoscope uses the curl of wedge-folded value noise (divergence-free
  // flow with full dihedral symmetry).
  _fieldForce(m, px, py, s, out) {
    if (m.type === 'plate') {
      const a = m.a, [n1, m1] = m.nm1, [n2, m2] = m.nm2;
      const phi1 = Math.cos(n1 * a * px) * Math.cos(m1 * a * py)
        + Math.cos(m1 * a * px) * Math.cos(n1 * a * py);
      const d1x = -n1 * a * Math.sin(n1 * a * px) * Math.cos(m1 * a * py)
        - m1 * a * Math.sin(m1 * a * px) * Math.cos(n1 * a * py);
      const d1y = -m1 * a * Math.cos(n1 * a * px) * Math.sin(m1 * a * py)
        - n1 * a * Math.cos(m1 * a * px) * Math.sin(n1 * a * py);
      const phi2 = Math.cos(n2 * a * px) * Math.cos(m2 * a * py)
        + Math.cos(m2 * a * px) * Math.cos(n2 * a * py);
      const d2x = -n2 * a * Math.sin(n2 * a * px) * Math.cos(m2 * a * py)
        - m2 * a * Math.sin(m2 * a * px) * Math.cos(n2 * a * py);
      const d2y = -m2 * a * Math.cos(n2 * a * px) * Math.sin(m2 * a * py)
        - n2 * a * Math.cos(m2 * a * px) * Math.sin(n2 * a * py);
      const phi = (1 - s) * phi1 + s * phi2;
      out.x = -2 * phi * ((1 - s) * d1x + s * d2x) * GAIN.plate;
      out.y = -2 * phi * ((1 - s) * d1y + s * d2y) * GAIN.plate;
      return;
    }
    const r = Math.max(CYM_R_MIN, Math.hypot(px, py));
    const ux = px / r, uy = py / r;
    if (m.type === 'rings') {
      const phi = (1 - s) * Math.cos(m.q1 * r) + s * Math.cos(m.q2 * r);
      const dR = -(1 - s) * m.q1 * Math.sin(m.q1 * r) - s * m.q2 * Math.sin(m.q2 * r);
      const f = -2 * phi * dR * GAIN.rings;
      out.x = f * ux;
      out.y = f * uy;
      return;
    }
    if (m.type === 'kaleido') {
      // fold the angle into one mirrored wedge, sample noise there, take the
      // curl, then map the (radial, tangential) force back to this wedge —
      // flipping the tangential part on mirrored copies keeps D_k symmetry
      const w = 2 * Math.PI / m.k;
      let th = Math.atan2(py, px) % w;
      if (th < 0) th += w;
      const mirrored = th > w / 2;
      if (mirrored) th = w - th;
      const cx = (r * Math.cos(th)) / m.lam + m.seed;
      const cy = (r * Math.sin(th)) / m.lam + this.time * 0.12;
      const d = 0.35;
      const dnx = (vnoise(cx + d, cy) - vnoise(cx - d, cy)) / (2 * d);
      const dny = (vnoise(cx, cy + d) - vnoise(cx, cy - d)) / (2 * d);
      // curl in folded coords; project onto folded radial/tangential axes
      const Fx = dny, Fy = -dnx;
      const c = Math.cos(th), sn = Math.sin(th);
      const fr = Fx * c + Fy * sn;
      let ft = -Fx * sn + Fy * c;
      if (mirrored) ft = -ft;
      const g = GAIN.kaleido / m.lam;
      out.x = (fr * ux - ft * uy) * g * m.lam;
      out.y = (fr * uy + ft * ux) * g * m.lam;
      return;
    }
    // polar Chladni (default): cymSize spreads the angular pattern outward
    // by flattening the 1/r intensity envelope inside that radius
    const { a, b } = m;
    const th = Math.atan2(py, px);
    const caA = Math.cos(a.k * th), saA = Math.sin(a.k * th);
    const crA = Math.cos(a.q * r), srA = Math.sin(a.q * r);
    const caB = Math.cos(b.k * th), saB = Math.sin(b.k * th);
    const crB = Math.cos(b.q * r), srB = Math.sin(b.q * r);
    const phi = (1 - s) * caA * crA + s * caB * crB;
    const dR = -(1 - s) * caA * a.q * srA - s * caB * b.q * srB;
    const dTh = -(1 - s) * a.k * saA * crA - s * b.k * saB * crB;
    const rDiv = Math.max(r, this.p.cymSize || CYM_R_MIN);
    const gx = dR * ux - (dTh / rDiv) * uy;
    const gy = dR * uy + (dTh / rDiv) * ux;
    out.x = -2 * phi * gx * GAIN.polar;
    out.y = -2 * phi * gy * GAIN.polar;
  }

  step(dt) {
    dt = Math.min(dt, 100);
    const dts = dt / 1000;
    this.phaseT += dt;
    this.time += dts;

    const morphing = this.phase === 'morph';
    const t = morphing ? Math.min(1, this.phaseT / this.seg.morphMs) : 1;
    // Cymatic drive: idle hum while holding; during a morph it eases from
    // the idle level up to the morph level and back (smoothstep over the
    // ramp fraction at each end) so the break-up and landing aren't jolts.
    // With a separate idle field, the two patterns crossfade through the
    // ramp instead (idle weight fades out as the transition's fades in).
    const idleAmp = this.p.idle * CYM_IDLE_AMP;
    let env = 0;
    if (morphing) {
      const ramp = Math.min(0.5, Math.max(0, this.p.ramp || 0));
      env = 1;
      if (ramp > 0) {
        const u = Math.min(1, t / ramp, (1 - t) / ramp);
        env = u * u * (3 - 2 * u);
      }
    }
    const morphAmp = this.p.scatter * CYM_MORPH_AMP;
    let wMorph, wIdle; // force weights on this.mode / this.idleMode
    if (this.idleMode) {
      wMorph = morphAmp * env;
      wIdle = idleAmp * (1 - env);
    } else {
      wMorph = idleAmp + (morphAmp - idleAmp) * env;
      wIdle = 0;
    }
    const stag = Math.min(0.9, Math.max(0, this.p.stagger ?? STAGGER_DEFAULT));
    const s = 0.5 + 0.5 * Math.sin(this.time * 0.7); // sub-mode crossfade
    const force = { x: 0, y: 0 };

    for (let i = 0; i < this.count; i++) {
      // attractor: eased morph path (optionally via the guide ghost) or the
      // held target
      let ax, ay;
      if (morphing) {
        const d = this.dj[i] * stag;
        const te = Math.max(0, Math.min(1, (t - d) / (1 - d)));
        const e = te < 0.5 ? 4 * te ** 3 : 1 - Math.pow(-2 * te + 2, 3) / 2;
        if (this.hasColors) {
          this.cr[i] = this.sr[i] + (this.tr[i] - this.sr[i]) * e;
          this.cg[i] = this.sg[i] + (this.tg[i] - this.sg[i]) * e;
          this.cb[i] = this.sb[i] + (this.tb[i] - this.sb[i]) * e;
        }
        if (this.guided) {
          if (e < 0.5) {
            const u = e * 2;
            ax = this.sx[i] + (this.gx[i] - this.sx[i]) * u;
            ay = this.sy[i] + (this.gy[i] - this.sy[i]) * u;
          } else {
            const u = e * 2 - 1;
            ax = this.gx[i] + (this.tx[i] - this.gx[i]) * u;
            ay = this.gy[i] + (this.ty[i] - this.gy[i]) * u;
          }
        } else {
          ax = this.sx[i] + (this.tx[i] - this.sx[i]) * e;
          ay = this.sy[i] + (this.ty[i] - this.sy[i]) * e;
        }
      } else {
        ax = this.tx[i];
        ay = this.ty[i];
      }

      let fx = 0, fy = 0;
      if (wMorph > 0) {
        this._fieldForce(this.mode, this.x[i], this.y[i], s, force);
        fx += force.x * wMorph;
        fy += force.y * wMorph;
      }
      if (wIdle > 0) {
        this._fieldForce(this.idleMode, this.x[i], this.y[i], s, force);
        fx += force.x * wIdle;
        fy += force.y * wIdle;
      }

      // damped-spring kinematics toward the attractor
      this.vx[i] += ((ax - this.x[i]) * SPRING_K - this.vx[i] * SPRING_DAMP + fx) * dts;
      this.vy[i] += ((ay - this.y[i]) * SPRING_K - this.vy[i] * SPRING_DAMP + fy) * dts;
      this.x[i] += this.vx[i] * dts;
      this.y[i] += this.vy[i] * dts;
    }

    if (morphing && t >= 1) {
      this.phase = 'hold';
      this.phaseT = 0;
    } else if (!morphing && this.phaseT >= this.seg.holdMs) {
      this._advanceTarget();
    }
  }

  // Resolve this.color (any css color) to [r, g, b] via canvas normalization.
  _baseRgb() {
    if (this._baseKey === this.color) return this._base;
    const g = document.createElement('canvas').getContext('2d');
    g.fillStyle = this.color;
    const fs = g.fillStyle; // normalized: '#rrggbb' when opaque, else 'rgba(r, g, b, a)'
    const hex = /^#([0-9a-f]{6})$/i.exec(fs);
    this._base = hex
      ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16))
      : (fs.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
    this._baseKey = this.color;
    return this._base;
  }

  // Soft dot sprite: solid core whose fraction shrinks as glow rises, then a
  // radial falloff. Any css color; D is the sprite raster size.
  _makeSprite(color, D) {
    const c = document.createElement('canvas');
    c.width = D;
    c.height = D;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    const core = Math.max(0.05, 1 - this.p.glow);
    grad.addColorStop(0, color);
    grad.addColorStop(core, color);
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, D, D);
    return c;
  }

  // Single-color sprite for the base color. Rebuilt only when glow/color change.
  _dotSprite() {
    const key = `${this.p.glow}|${this.color}`;
    if (this._dot && this._dotKey === key) return this._dot;
    this._dot = this._makeSprite(this.color, 64);
    this._dotKey = key;
    return this._dot;
  }

  // Per-color sprites, quantized to 4 bits per channel and cached (at most
  // 4096 small rasters; the cache resets whenever glow changes).
  _colorSprite(r, g, b) {
    if (this._spriteGlow !== this.p.glow) { this._sprites.clear(); this._spriteGlow = this.p.glow; }
    const qr = (r >> 4) & 15, qg = (g >> 4) & 15, qb = (b >> 4) & 15;
    const key = (qr << 8) | (qg << 4) | qb;
    let sp = this._sprites.get(key);
    if (!sp) {
      sp = this._makeSprite(`rgb(${qr * 17}, ${qg * 17}, ${qb * 17})`, 32);
      this._sprites.set(key, sp);
    }
    return sp;
  }

  draw(ctx, cx, cy, scale = 1) {
    // radius headroom so the glow halo isn't clipped by the sprite edge
    const r = this.p.sizePx * (1 + this.p.glow * 2) * scale;
    ctx.globalCompositeOperation = this.p.blend;
    if (this.hasColors) {
      for (let i = 0; i < this.count; i++) {
        const dot = this._colorSprite(this.cr[i], this.cg[i], this.cb[i]);
        ctx.drawImage(dot, cx + this.x[i] * scale - r, cy + this.y[i] * scale - r, r * 2, r * 2);
      }
    } else {
      const dot = this._dotSprite();
      for (let i = 0; i < this.count; i++) {
        ctx.drawImage(dot, cx + this.x[i] * scale - r, cy + this.y[i] * scale - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Rasterize one typeset line (via SVG → Image, fonts inlined by fontCss) and
// sample its ink into up to maxPoints particle targets, centered on the
// line's midpoint. Returns null for a line with no ink.
export async function sampleLinePoints(eq, { fontFamily, fontSize, width, height, fontCss, maxPoints }) {
  const RS = 2; // supersample for sub-css-pixel targets
  // ~0.3em padding + the svg overflow rule (restating MathJax's stylesheet,
  // absent in this serialized context): glyph ink — hats, subscript
  // descenders — extends past the equation's declared box and would clip.
  const inkPad = Math.ceil(parseFloat(fontSize) * 0.3) || 10;
  const wp = width + 2 * inkPad, hp = height + 2 * inkPad;
  const holder = document.createElement('div');
  holder.style.cssText = `width:${width}px;margin:${inkPad}px;color:#000;font-family:${fontFamily};font-size:${fontSize};`;
  holder.appendChild(eq.cloneNode(true));
  const xml = new XMLSerializer().serializeToString(holder);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wp * RS}" height="${hp * RS}" viewBox="0 0 ${wp} ${hp}">`
    + `<foreignObject x="0" y="0" width="${wp}" height="${hp}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml"><style>${fontCss}mjx-container{display:block;margin:0;}mjx-container svg{overflow:visible;}.lx-hidden{visibility:visible !important;}</style>${xml}</div>`
    + `</foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();

  const c = document.createElement('canvas');
  c.width = wp * RS;
  c.height = hp * RS;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const xs = [], ys = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 100) { xs.push(x); ys.push(y); }
    }
  }
  if (!xs.length) return null;

  const n = Math.min(maxPoints, xs.length);
  const points = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * xs.length);
    points[i * 2] = xs[j] / RS - wp / 2 + (Math.random() - 0.5) / RS;
    points[i * 2 + 1] = ys[j] / RS - hp / 2 + (Math.random() - 0.5) / RS;
  }
  return { points };
}
