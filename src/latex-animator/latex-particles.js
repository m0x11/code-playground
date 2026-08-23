// Particle engine for the LaTeX animator's "Particles" mode: a fixed pool
// of fine particles forms one equation line's glyphs, holds, then morphs
// into the next line, cycling forever. Between lines it can detour through
// randomized relic-ring forms (see relic-forms.js). Motion is kinematic —
// each particle is a damped spring chasing its (possibly moving) attractor,
// stirred by a CYMATIC field: a Chladni-style standing wave with k-fold
// dihedral symmetry whose force, F = −∇(Φ²), pushes particles toward the
// nodal lines exactly the way sand organizes on a sounded plate. Every
// segment excites a fresh pair of modes, crossfaded over time, so each
// transition streams in its own many-fold-symmetric pattern.
//
// All positions are css px relative to the composition center; draw() takes
// a center and scale, so the same engine drives both the live overlay
// canvas and the video recorder.

const SPRING_K = 140;                        // spring stiffness, 1/s²
const SPRING_DAMP = 2 * Math.sqrt(SPRING_K); // critical damping, 1/s
const CYM_KS = [4, 6, 8, 10, 12]; // even angular orders → vertical mirror kept
const CYM_MORPH_AMP = 400;        // force scale per unit of the morph slider
const CYM_IDLE_AMP = 120;         // force scale per unit of the idle slider
const CYM_R_MIN = 12;             // px — tames the 1/r pole at the plate center
const FORM_MORPH = 0.8; // interlude morph time, fraction of morphMs
const FORM_HOLD = 0.5;  // interlude hold time, fraction of holdMs
const FORM_ROW_N = 4;   // forms per interlude row

function withAlpha(color, a) {
  if (color.startsWith('rgba(')) return color.replace(/,[^,]+\)$/, `, ${a})`);
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
  return color;
}

export class LatexParticleEngine {
  // lines: [{ points: Float32Array [x0,y0,...], w: css width }] centered.
  // params: { sizePx, glow (0–1), blend, morphMs, holdMs, scatter (px),
  //           idle (0–100) }
  // forms: relic-form point sets to detour through between lines ([] = off).
  // formRow: { radiusPx, rowWidthPx } — the pooled forms' radius and the
  // width available for laying a row of them side by side.
  constructor({ lines, count, params, color, forms = [], formRow = null }) {
    this.lines = lines;
    this.count = count;
    this.p = params;
    this.color = color;
    this.forms = forms;
    this.formRow = formRow || { radiusPx: 180, rowWidthPx: 900 };
    this.lineIndex = 0;
    this.queue = [];
    this.time = 0;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.sx = new Float32Array(count);
    this.sy = new Float32Array(count);
    this.tx = new Float32Array(count);
    this.ty = new Float32Array(count);
    this.dj = new Float32Array(count); // per-particle stagger delay [0,0.25)
    for (let i = 0; i < count; i++) {
      this.dj[i] = Math.random() * 0.25;
      this.x[i] = (Math.random() - 0.5) * 600; // born as loose dust
      this.y[i] = (Math.random() - 0.5) * 300;
    }
    this.seg = { morphMs: params.morphMs, holdMs: params.holdMs };
    this.phase = 'morph';
    this.phaseT = 0;
    this._newCymaticMode();
    this._assign(lines[0].points);
    this._dot = null;
    this._dotKey = '';
  }

  setParams(params) { this.p = params; }
  setColor(color) { this.color = color; }

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

  // Full cycle duration (all lines + one interlude row per transition) —
  // the recorder uses this to size a take.
  totalCycleMs() {
    let total = this.lines.length * (this.p.morphMs + this.p.holdMs);
    if (this.forms.length) {
      total += this.lines.length * (this.p.morphMs * FORM_MORPH + this.p.holdMs * FORM_HOLD);
    }
    return total;
  }

  // Pair particles to the next target's points by x-rank, so the morph
  // flows across instead of crossing wildly.
  _assign(pts) {
    const nPts = pts.length / 2, n = this.count;
    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => this.x[a] - this.x[b]);
    const picks = new Array(n);
    for (let i = 0; i < n; i++) picks[i] = Math.floor(Math.random() * nPts);
    picks.sort((a, b) => pts[a * 2] - pts[b * 2]);
    for (let i = 0; i < n; i++) {
      const pi = order[i], ti = picks[i];
      this.sx[pi] = this.x[pi];
      this.sy[pi] = this.y[pi];
      this.tx[pi] = pts[ti * 2];
      this.ty[pi] = pts[ti * 2 + 1];
    }
  }

  // Refill the queue with one interlude row + the next line, then start the
  // next segment. The row's form count follows the average width of the
  // line being left and the line being approached.
  _advanceTarget() {
    if (!this.queue.length) {
      const next = (this.lineIndex + 1) % this.lines.length;
      if (this.forms.length) {
        this.queue.push({
          points: this._formRowPoints(FORM_ROW_N),
          morphMs: this.p.morphMs * FORM_MORPH,
          holdMs: this.p.holdMs * FORM_HOLD,
        });
      }
      this.queue.push({
        points: this.lines[next].points,
        morphMs: this.p.morphMs,
        holdMs: this.p.holdMs,
        line: next,
      });
    }
    this.seg = this.queue.shift();
    if (this.seg.line !== undefined) this.lineIndex = this.seg.line;
    this._newCymaticMode(); // every transition rings its own plate modes
    this._assign(this.seg.points);
    this.phase = 'morph';
    this.phaseT = 0;
  }

  // Excite a fresh pair of Chladni modes (even angular order k keeps the
  // vertical mirror; the radial wavelength sets the ring spacing, centered
  // on the Cymatics Scale param with ±30% per-mode variation). The two are
  // crossfaded over time in step(), so the pattern breathes between
  // resonances without ever losing its symmetry.
  _newCymaticMode() {
    const base = this.p.cymScale || 150;
    const pick = () => ({
      k: CYM_KS[Math.floor(Math.random() * CYM_KS.length)],
      q: 2 * Math.PI / (base * (0.7 + Math.random() * 0.6)),
    });
    this.mode = { a: pick(), b: pick() };
  }

  step(dt) {
    dt = Math.min(dt, 100);
    const dts = dt / 1000;
    this.phaseT += dt;
    this.time += dts;

    const morphing = this.phase === 'morph';
    const t = morphing ? Math.min(1, this.phaseT / this.seg.morphMs) : 1;
    // cymatic drive: the morph slider rings the plate hard during
    // transitions; the idle slider keeps a gentle hum while a shape holds
    const ampC = morphing ? this.p.scatter * CYM_MORPH_AMP : this.p.idle * CYM_IDLE_AMP;
    const s = 0.5 + 0.5 * Math.sin(this.time * 0.7); // mode crossfade
    const { a, b } = this.mode;

    for (let i = 0; i < this.count; i++) {
      // attractor: eased morph path, or the held target
      let ax, ay;
      if (morphing) {
        const te = Math.max(0, Math.min(1, (t - this.dj[i]) / (1 - this.dj[i])));
        const e = te < 0.5 ? 4 * te ** 3 : 1 - Math.pow(-2 * te + 2, 3) / 2;
        ax = this.sx[i] + (this.tx[i] - this.sx[i]) * e;
        ay = this.sy[i] + (this.ty[i] - this.sy[i]) * e;
      } else {
        ax = this.tx[i];
        ay = this.ty[i];
      }

      // Chladni force: Φ(r,θ) = cos(kθ)·cos(qr) for the two excited modes,
      // crossfaded; sand feels F = −∇(Φ²) = −2Φ∇Φ, streaming toward the
      // nodal lines. Even k ⇒ the field mirrors across both axes, so all
      // motion carries the pattern's full dihedral symmetry.
      let fx = 0, fy = 0;
      if (ampC > 0) {
        const px = this.x[i], py = this.y[i];
        const r = Math.max(CYM_R_MIN, Math.hypot(px, py));
        const th = Math.atan2(py, px);
        const caA = Math.cos(a.k * th), saA = Math.sin(a.k * th);
        const crA = Math.cos(a.q * r), srA = Math.sin(a.q * r);
        const caB = Math.cos(b.k * th), saB = Math.sin(b.k * th);
        const crB = Math.cos(b.q * r), srB = Math.sin(b.q * r);
        const phi = (1 - s) * caA * crA + s * caB * crB;
        const dR = -(1 - s) * caA * a.q * srA - s * caB * b.q * srB;
        const dTh = -(1 - s) * a.k * saA * crA - s * b.k * saB * crB;
        const ux = px / r, uy = py / r; // e_r; e_θ = (−uy, ux)
        const gx = dR * ux - (dTh / r) * uy;
        const gy = dR * uy + (dTh / r) * ux;
        fx = -2 * phi * gx * ampC;
        fy = -2 * phi * gy * ampC;
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

  // Soft dot sprite: solid core whose fraction shrinks as glow rises, then a
  // radial falloff. Rebuilt only when glow/color change.
  _dotSprite() {
    const key = `${this.p.glow}|${this.color}`;
    if (this._dot && this._dotKey === key) return this._dot;
    const D = 64;
    const c = document.createElement('canvas');
    c.width = D;
    c.height = D;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    const core = Math.max(0.05, 1 - this.p.glow);
    grad.addColorStop(0, this.color);
    grad.addColorStop(core, this.color);
    grad.addColorStop(1, withAlpha(this.color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, D, D);
    this._dot = c;
    this._dotKey = key;
    return c;
  }

  draw(ctx, cx, cy, scale = 1) {
    const dot = this._dotSprite();
    // radius headroom so the glow halo isn't clipped by the sprite edge
    const r = this.p.sizePx * (1 + this.p.glow * 2) * scale;
    ctx.globalCompositeOperation = this.p.blend;
    for (let i = 0; i < this.count; i++) {
      ctx.drawImage(dot, cx + this.x[i] * scale - r, cy + this.y[i] * scale - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Rasterize one typeset line (via SVG → Image, fonts inlined by fontCss) and
// sample its ink into up to maxPoints particle targets, centered on the
// line's midpoint. Returns null for a line with no ink.
export async function sampleLinePoints(eq, { fontFamily, fontSize, width, height, fontCss, maxPoints }) {
  const RS = 2; // supersample for sub-css-pixel targets
  const holder = document.createElement('div');
  holder.style.cssText = `width:${width}px;color:#000;font-family:${fontFamily};font-size:${fontSize};`;
  holder.appendChild(eq.cloneNode(true));
  const xml = new XMLSerializer().serializeToString(holder);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * RS}" height="${height * RS}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml"><style>${fontCss}mjx-container{display:block;margin:0;}.lx-hidden{visibility:visible !important;}</style>${xml}</div>`
    + `</foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();

  const c = document.createElement('canvas');
  c.width = width * RS;
  c.height = height * RS;
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
    points[i * 2] = xs[j] / RS - width / 2 + (Math.random() - 0.5) / RS;
    points[i * 2 + 1] = ys[j] / RS - height / 2 + (Math.random() - 0.5) / RS;
  }
  return { points };
}
