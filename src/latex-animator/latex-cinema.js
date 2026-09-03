// "Cinematic" canvas modes for the LaTeX animator.
//
// Zoom — equations cascade continuously from deep background up to and past
// the camera: each line drifts closer on an exponential approach, gently
// tilted in 3D (approximated with rotation + squash + shear), crisp at the
// focal plane and defocused at both ends of its journey.
//
// Cell — individual glyphs drift like cells in a wedge-folded curl-noise
// flow (the particle engine's kaleidoscope field in miniature), tilting
// with their motion, blurred by depth and speed; every cycle one line's
// glyphs call their cells home, snap into the crisp equation, hold, and
// let go again.
//
// Both are sprite-based canvas sims: the live overlay and the video
// recorder drive the same step()/draw() with different scales.

import { vnoise } from './latex-particles.js';

const TAU = Math.PI * 2;

const CINEMA_STYLE = (fontCss) =>
  `<style>${fontCss}mjx-container{display:block;margin:0;}mjx-container svg{overflow:visible;}.lx-hidden{visibility:visible !important;}</style>`;

function svgWrap(xml, wp, hp, rs, fontCss) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(wp * rs)}" height="${Math.ceil(hp * rs)}" viewBox="0 0 ${wp} ${hp}">`
    + `<foreignObject x="0" y="0" width="${wp}" height="${hp}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml">${CINEMA_STYLE(fontCss)}${xml}</div>`
    + `</foreignObject></svg>`;
}

async function decodeSvg(svgStr) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  await img.decode();
  return img;
}

// Rasterize equation lines (in-DOM containers or split-line clones) into
// sprites at `rs`× supersampling, ink-padded, in the given color.
export async function rasterizeLines(eqs, { fontFamily, fontSize, color, fontCss, rs = 2 }) {
  const out = [];
  const inkPad = Math.ceil(parseFloat(fontSize) * 0.3) || 10;
  for (const eq of eqs) {
    const svgEl = eq.querySelector('svg');
    if (!svgEl) continue;
    const r = svgEl.getBoundingClientRect();
    const w = Math.ceil(eq.dataset.lxW ? parseFloat(eq.dataset.lxW) : r.width);
    const h = Math.ceil(eq.dataset.lxH ? parseFloat(eq.dataset.lxH) : r.height);
    if (!w || !h) continue;
    const wp = w + 2 * inkPad, hp = h + 2 * inkPad;
    const holder = document.createElement('div');
    holder.style.cssText = `width:${w}px;margin:${inkPad}px;color:${color};font-family:${fontFamily};font-size:${fontSize};`;
    holder.appendChild(eq.cloneNode(true));
    const xml = new XMLSerializer().serializeToString(holder);
    try {
      const img = await decodeSvg(svgWrap(xml, wp, hp, rs, fontCss));
      out.push({ img, w: wp, h: hp });
    } catch { /* skip a bad line */ }
  }
  return out;
}

// For cell mode: rasterize each line ONCE, then carve its glyphs out of the
// raster as sub-rect sprites, remembering every glyph's offset from the
// line's center so the cells can reassemble the equation.
export async function buildGlyphSets(eqs, { fontFamily, fontSize, color, fontCss, maxLines = 9, maxGlyphs = 44 }) {
  const RS = 3, GP = 2; // supersample; per-glyph pad, css px
  const inkPad = Math.ceil(parseFloat(fontSize) * 0.3) || 10;
  const sets = [];
  for (const eq of eqs) {
    if (sets.length >= maxLines) break;
    const svgEl = eq.querySelector('svg');
    if (!svgEl || !eq.isConnected) continue; // needs live layout for glyph rects
    const sr = svgEl.getBoundingClientRect();
    if (!sr.width || !sr.height) continue;
    const glyphEls = [...svgEl.querySelectorAll('path, use, rect, text')].filter(g => !g.closest('defs'));
    if (glyphEls.length < 3 || glyphEls.length > maxGlyphs) continue;

    const w = Math.ceil(sr.width), h = Math.ceil(sr.height);
    const wp = w + 2 * inkPad, hp = h + 2 * inkPad;
    const holder = document.createElement('div');
    holder.style.cssText = `width:${w}px;margin:${inkPad}px;color:${color};font-family:${fontFamily};font-size:${fontSize};`;
    holder.appendChild(eq.cloneNode(true));
    const xml = new XMLSerializer().serializeToString(holder);
    let img;
    try {
      img = await decodeSvg(svgWrap(xml, wp, hp, RS, fontCss));
    } catch { continue; }

    const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
    const glyphs = [];
    for (const g of glyphEls) {
      const gr = g.getBoundingClientRect();
      if (!gr.width || !gr.height) continue;
      glyphs.push({
        img,
        sx: (gr.left - sr.left + inkPad - GP) * RS,
        sy: (gr.top - sr.top + inkPad - GP) * RS,
        sw: (gr.width + 2 * GP) * RS,
        sh: (gr.height + 2 * GP) * RS,
        w: gr.width + 2 * GP,
        h: gr.height + 2 * GP,
        dx: gr.left + gr.width / 2 - cx,
        dy: gr.top + gr.height / 2 - cy,
      });
    }
    if (glyphs.length >= 3) sets.push({ glyphs, lineW: sr.width, lineH: sr.height });
  }
  return sets;
}

// ---------------------------------------------------------------- Zoom ----
const DIAGRAM_EVERY_S = 6; // at most one diagram in flight per this interval

export class ZoomSim {
  // params: { count, travelMs, tiltDeg, blur (0–100) }
  // diagrams: rare edge-hugging guest sprites (see buildDiagramSprites)
  constructor({ sprites, area, params, diagrams = [] }) {
    this.sprites = sprites;
    this.area = area;
    this.p = params;
    this.diagrams = diagrams;
    this.lastDiagramAt = 1 - DIAGRAM_EVERY_S; // first one ~1s in, then every 6s
    this.time = 0;
    this.nextIdx = 0;
    this.items = [];
    for (let i = 0; i < params.count; i++) {
      this.items.push(this._spawn(i / params.count));
    }
  }

  setParams(p) { this.p = p; }

  // Birth scale from the Depth dial: shallow (0) births lines at ~80% of
  // natural size — already close to the lens — deep (100) as pinpoints.
  _S0() { return 0.82 * Math.pow(0.025 / 0.82, (this.p.depth ?? 60) / 100); }

  // Projected center and scale of an anchor at flight time t — shared by
  // draw() and the trajectory-aware spawner.
  _proj(ax, ay, t) {
    const { w: W, h: H } = this.area;
    const p = this.p;
    const S0 = this._S0();
    const s = S0 * Math.pow(5.5 / S0, t);
    const mul = Math.pow(s, p.persp ?? 1);
    return { x: W / 2 + (ax - 0.5) * W * mul, y: H / 2 + (ay - 0.5) * H * mul, s };
  }

  _spawn(t0 = 0, diagram = false) {
    // diagrams (time-gated by step) take whichever spot is emptiest, via
    // the same trajectory-aware scoring the equations use
    const sp = diagram
      ? this.diagrams[Math.floor(Math.random() * this.diagrams.length)]
      : this.sprites[this.nextIdx++ % this.sprites.length];
    // Trajectory-aware placement: score each candidate anchor by how much
    // its whole FLIGHT will overlap the flights already in progress —
    // projected positions and footprints sampled at shared future instants.
    // Collisions dominate the score; among clean candidates, the one
    // farthest from everyone wins, so the screen fills evenly. Anchors
    // never sit on the optical axis (the perspective sweep needs a lever
    // arm to carry lines out of frame).
    let best = null, bestScore = Infinity;
    for (let c = 0; c < 16; c++) {
      let ax, ay;
      do {
        ax = 0.10 + Math.random() * 0.80;
        ay = 0.12 + Math.random() * 0.76;
      } while (Math.hypot(ax - 0.5, ay - 0.5) < 0.09);
      let penalty = 0, nearest = Infinity;
      for (const o of this.items) {
        if (!o || !o.sp) continue;
        nearest = Math.min(nearest, Math.hypot(ax - o.x, (ay - o.y) * 1.6));
        for (let k = 0; k < 5; k++) {
          const tn = t0 + 0.1 + k * 0.19; // my flight, sampled
          const te = o.t + (tn - t0);     // their flight at the same instant
          if (tn > 1 || te > 1) break;
          const a = this._proj(ax, ay, tn);
          const b = this._proj(o.x, o.y, te);
          const ra = sp.w * 0.3 * a.s;
          const rb = o.sp.w * 0.3 * b.s;
          const gap = Math.hypot(a.x - b.x, (a.y - b.y) * 2.2) - (ra + rb);
          if (gap < 0) penalty += -gap / (ra + rb);
        }
      }
      const score = penalty * 100 - nearest; // collisions first, then spread
      if (score < bestScore) { bestScore = score; best = { x: ax, y: ay }; }
    }
    return { sp, t: t0, x: best.x, y: best.y, swayPh: Math.random() * TAU };
  }

  step(dt) {
    const dts = dt / 1000;
    this.time += dts;
    // Tilt dial = rotation SPEED of the whole scene (0 = level camera)
    this.roll = (this.roll || 0) + ((this.p.tiltDeg / 40) * (TAU / 24)) * dts;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.t += dt / this.p.travelMs;
      if (it.t >= 1) {
        const wantDiagram = this.diagrams.length > 0
          && this.time - this.lastDiagramAt >= DIAGRAM_EVERY_S;
        if (wantDiagram) this.lastDiagramAt = this.time;
        this.items[i] = this._spawn(0, wantDiagram);
      }
    }
  }

  draw(ctx, scale = 1, ox = 0, oy = 0) {
    const { w: W, h: H } = this.area;
    const p = this.p;
    const S0 = this._S0(); // Depth dial: ~80% of natural size … pinpoint
    const S1 = 5.5;
    const tF = Math.log(1 / S0) / Math.log(S1 / S0); // focal plane (s = 1)

    // the whole scene turns as one — a continuously rolling camera
    ctx.save();
    ctx.translate(ox + (W / 2) * scale, oy + (H / 2) * scale);
    ctx.rotate(this.roll || 0);
    ctx.translate((-W / 2) * scale, (-H / 2) * scale);

    // terminal fade is a fixed ~150ms wall-clock blink, so short travels
    // don't lose a visible chunk of the pass to it
    const fadeFrac = Math.max(0.03, 150 / p.travelMs);

    const items = [...this.items].sort((a, b) => a.t - b.t); // far first
    for (const it of items) {
      const t = it.t;
      const alpha = Math.max(0, Math.min(Math.min(1, t / 0.22),
        t < 1 - fadeFrac ? 1 : (1 - t) / fadeFrac));
      if (alpha <= 0.004) continue;
      const blur = (p.blur / 100) * Math.max(0, (tF - t) / tF) * 5; // far side only
      const pr = this._proj(it.x, it.y, t); // same math the spawner predicts with
      const s = pr.s;
      const sway = Math.sin(this.time * 0.4 + it.swayPh) * 8;
      const cx = pr.x + sway;
      const cy = pr.y + Math.cos(this.time * 0.33 + it.swayPh) * 6;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = blur > 0.25 ? `blur(${(blur * scale).toFixed(1)}px)` : 'none';
      ctx.translate(cx * scale, cy * scale);
      ctx.scale(s * scale, s * scale);
      ctx.drawImage(it.sp.img, -it.sp.w / 2, -it.sp.h / 2, it.sp.w, it.sp.h);
      ctx.restore();
    }
    ctx.restore();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- Cell ----
// v2 — a high-speed information exchange. Invisible 3D ROUTES span the
// scene (bezier paths whose depth swings in z). Symbols travel them in
// SEGMENTS of 3+ consecutive glyphs; somewhere on screen an equation is
// always assembling — its segments peel off their routes, dock into the
// statement, hold crisp, then break back into segments and ride away.
// Tilt is the excursion into the third dimension: depth = perspective
// scale, pitch squash where a route dives, and focus blur far from z = 0.
const DOCK_MS = 300;       // one glyph's route → slot flight
const GLYPH_STAGGER = 50;  // ms between glyphs of a docking segment
const SEG_LAUNCH = 200;    // ms between a statement's segment launches
const HOLD_MS = 1100;      // complete statement, held crisp

export class CellSim {
  // params: { cells, flowMs (tempo), tiltDeg, blur (0–100) }
  constructor({ sets, area, params }) {
    this.sets = sets;
    this.area = area;
    this.p = params;
    this.time = 0;
    this.lineIdx = 0;
    this.slotIdx = 0;
    this._cool = 0;
    this.routes = [];
    for (let i = 0; i < 6; i++) this.routes.push(this._makeRoute());
    this.convoys = [];
    this.assemblies = [];
    this._allGlyphs = sets.flatMap(s => s.glyphs);
    for (let i = 0; i < 2; i++) this._spawnTransit(Math.random() * 0.6);
  }

  setParams(p) { this.p = p; }
  cycleMs() { return 6000; }

  _depth() { return 0.25 + (this.p.tiltDeg / 60) * 1.0; } // z amplitude
  _crossMs() { return this.p.flowMs * 0.25; }             // tempo: fast crossings

  _makeRoute() {
    const { w: W, h: H } = this.area;
    const edgePt = (e) => e === 0 ? [Math.random() * W, -40]
      : e === 1 ? [W + 40, Math.random() * H]
      : e === 2 ? [Math.random() * W, H + 40]
      : [-40, Math.random() * H];
    const e0 = Math.floor(Math.random() * 4);
    const e1 = (e0 + 1 + Math.floor(Math.random() * 3)) % 4;
    return {
      P0: edgePt(e0), P3: edgePt(e1),
      P1: [W * (0.2 + Math.random() * 0.6), H * (0.2 + Math.random() * 0.6)],
      P2: [W * (0.2 + Math.random() * 0.6), H * (0.2 + Math.random() * 0.6)],
      zf: 1 + Math.random() * 1.4,
      zp: Math.random() * TAU,
    };
  }

  _routePos(rt, u) {
    const t = Math.max(0, Math.min(1, u)), s = 1 - t;
    const b = (a0, a1, a2, a3) =>
      s * s * s * a0 + 3 * s * s * t * a1 + 3 * s * t * t * a2 + t * t * t * a3;
    const db = (a0, a1, a2, a3) =>
      3 * s * s * (a1 - a0) + 6 * s * t * (a2 - a1) + 3 * t * t * (a3 - a2);
    const x = b(rt.P0[0], rt.P1[0], rt.P2[0], rt.P3[0]);
    const y = b(rt.P0[1], rt.P1[1], rt.P2[1], rt.P3[1]);
    const dx = db(rt.P0[0], rt.P1[0], rt.P2[0], rt.P3[0]);
    const dy = db(rt.P0[1], rt.P1[1], rt.P2[1], rt.P3[1]);
    const z = Math.sin(t * Math.PI * rt.zf + rt.zp) * this._depth();
    const dz = Math.cos(t * Math.PI * rt.zf + rt.zp) * Math.PI * rt.zf * this._depth();
    return { x, y, z, dx, dy, dz };
  }

  _nearestU(rt, x, y) {
    let best = 0.5, bd = Infinity;
    for (let u = 0.18; u <= 0.85; u += 0.04) {
      const p = this._routePos(rt, u);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  _randRoute() { return this.routes[Math.floor(Math.random() * this.routes.length)]; }

  _spawnTransit(u0 = 0) {
    const n = 3 + Math.floor(Math.random() * 4);
    const glyphs = Array.from({ length: n }, () =>
      ({ g: this._allGlyphs[Math.floor(Math.random() * this._allGlyphs.length)] }));
    this.convoys.push({ glyphs, route: this._randRoute(), u: u0, spacing: 0.045, state: 'transit' });
  }

  _spawnAssembly() {
    const set = this.sets[this.lineIdx++ % this.sets.length];
    const { w: W, h: H } = this.area;
    const spots = [[0.27, 0.3], [0.72, 0.68], [0.3, 0.72], [0.71, 0.28], [0.5, 0.5]];
    const [fx, fy] = spots[this.slotIdx++ % spots.length];
    const scaleF = Math.min(1, (W * 0.42) / set.lineW, (H * 0.3) / set.lineH);
    const asm = { cx: W * fx, cy: H * fy, scale: scaleF, state: 'building', t: 0, pending: 0, docked: 0 };
    // chunk the statement's glyphs (reading order) into segments of 3–6,
    // never leaving a runt tail shorter than 3
    const glyphs = set.glyphs;
    const segs = [];
    let i = 0;
    while (i < glyphs.length) {
      let len = 3 + Math.floor(Math.random() * 4);
      const rest = glyphs.length - (i + len);
      if (rest > 0 && rest < 3) len += rest;
      segs.push(glyphs.slice(i, i + len));
      i += len;
    }
    asm.pending = segs.length;
    segs.forEach((seg, si) => {
      const route = this._randRoute();
      this.convoys.push({
        glyphs: seg.map(g => ({ g, tx: asm.cx + g.dx * asm.scale, ty: asm.cy + g.dy * asm.scale })),
        route,
        u: 0,
        spacing: 0.05,
        state: 'wait-in',
        delay: si * SEG_LAUNCH,
        dockU: this._nearestU(route, asm.cx, asm.cy),
        asm,
        dockT: 0,
      });
    });
    this.assemblies.push(asm);
  }

  step(dt) {
    const dts = dt / 1000;
    this.time += dts;
    this._cool -= dt;

    // keep the exchange saturated: several statements always in flight
    const targetAsm = Math.max(1, Math.min(5, Math.round(this.p.cells / 28)));
    if (this.assemblies.length < targetAsm && this._cool <= 0) {
      this._spawnAssembly();
      this._cool = 450 + Math.random() * 450;
    }
    const transitTarget = Math.max(2, Math.round(this.p.cells / 30));
    if (this.convoys.filter(c => c.state === 'transit').length < transitTarget && Math.random() < dts * 1.5) {
      this._spawnTransit();
    }

    const du = dt / this._crossMs();
    for (const c of this.convoys) {
      if (c.state === 'wait-in') {
        c.delay -= dt;
        if (c.delay <= 0) c.state = 'ride-in';
      } else if (c.state === 'ride-in') {
        c.u += du;
        if (c.u >= c.dockU) { c.state = 'dock'; c.dockT = 0; }
      } else if (c.state === 'dock') {
        c.dockT += dt;
        if (c.dockT >= DOCK_MS + c.glyphs.length * GLYPH_STAGGER) {
          c.state = 'docked';
          c.asm.docked++;
          if (c.asm.docked >= c.asm.pending && c.asm.state === 'building') {
            c.asm.state = 'hold';
            c.asm.t = 0;
          }
        }
      } else if (c.state === 'undock') {
        c.dockT += dt;
        if (c.dockT >= DOCK_MS + c.glyphs.length * GLYPH_STAGGER) {
          c.state = 'ride-out';
          c.u = c.dockU;
        }
      } else if (c.state === 'ride-out' || c.state === 'transit') {
        c.u += du;
      }
    }

    for (const a of this.assemblies) {
      if (a.state !== 'hold') continue;
      a.t += dt;
      if (a.t >= HOLD_MS) {
        a.state = 'leaving';
        for (const c of this.convoys) {
          if (c.asm === a && c.state === 'docked') {
            c.route = this._randRoute(); // depart on a fresh route
            c.dockU = this._nearestU(c.route, a.cx, a.cy);
            c.state = 'undock';
            c.dockT = 0;
          }
        }
      }
    }

    this.convoys = this.convoys.filter(c =>
      !((c.state === 'ride-out' || c.state === 'transit') && c.u - (c.glyphs.length - 1) * c.spacing > 1.02));
    this.assemblies = this.assemblies.filter(a =>
      a.state !== 'leaving' || this.convoys.some(c => c.asm === a));
    // routes slowly renew so the traffic pattern keeps evolving
    if (Math.random() < dts * 0.15) {
      this.routes[Math.floor(Math.random() * this.routes.length)] = this._makeRoute();
    }
  }

  draw(ctx, scale = 1, ox = 0, oy = 0) {
    const p = this.p;
    const items = [];
    for (const c of this.convoys) {
      for (let i = 0; i < c.glyphs.length; i++) {
        if (c.state === 'wait-in') continue;
        const gy = c.glyphs[i];
        const g = gy.g;
        let x, y, z, ang = 0, pitch = 0, dock = 0;
        if (c.state === 'ride-in' || c.state === 'ride-out' || c.state === 'transit') {
          const u = c.u - i * c.spacing;
          if (u < 0 || u > 1) continue;
          const rp = this._routePos(c.route, u);
          x = rp.x; y = rp.y; z = rp.z;
          ang = Math.atan2(rp.dy, rp.dx) * 0.3;
          pitch = Math.atan2(rp.dz * 90, Math.hypot(rp.dx, rp.dy)); // dive angle
        } else { // dock / docked / undock
          const rp = this._routePos(c.route, Math.max(0, c.dockU - i * c.spacing));
          const gt = Math.max(0, Math.min(1, (c.dockT - i * GLYPH_STAGGER) / DOCK_MS));
          const e = gt * gt * (3 - 2 * gt);
          const m = c.state === 'undock' ? 1 - e : c.state === 'docked' ? 1 : e;
          x = rp.x + (gy.tx - rp.x) * m;
          y = rp.y + (gy.ty - rp.y) * m;
          z = rp.z * (1 - m);
          ang = Math.atan2(rp.dy, rp.dx) * 0.3 * (1 - m);
          pitch = Math.atan2(rp.dz * 90, Math.hypot(rp.dx, rp.dy)) * (1 - m);
          dock = m;
        }
        items.push({ g, x, y, z, ang, pitch, dock, fs: c.asm ? c.asm.scale : 1 });
      }
    }
    items.sort((a, b) => a.z - b.z); // deep first
    for (const it of items) {
      const persp = 1 / (1 - it.z * 0.42); // z > 0 = toward the camera
      const s = (1 - it.dock) * persp * 1.05 + it.dock * it.fs;
      const blur = (p.blur / 100) * Math.abs(it.z) * 5 * (1 - it.dock);
      const alpha = (0.5 + 0.5 * Math.min(1.15, persp)) * (1 - it.dock) + it.dock;
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.filter = blur > 0.25 ? `blur(${(blur * scale).toFixed(1)}px)` : 'none';
      ctx.translate(it.x * scale + ox, it.y * scale + oy);
      ctx.rotate(it.ang);
      // pitch INTO the screen where the route dives
      ctx.transform(1, 0, Math.sin(it.pitch) * 0.35, Math.max(0.3, Math.cos(it.pitch)), 0, 0);
      ctx.scale(s * scale, s * scale);
      const g = it.g;
      ctx.drawImage(g.img, g.sx, g.sy, g.sw, g.sh, -g.w / 2, -g.h / 2, g.w, g.h);
      ctx.restore();
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ Diagrams ----
// EXPERIMENT: a labeled geometric diagram mixed into the zoom flight — the
// ECCENTRIC ANOMALY construction. LaTeX alone can't draw figures (MathJax
// has no TikZ), so the geometry is drawn as vectors; the labels are genuine
// LaTeX typeset through MathJax.tex2svg with the same \var macros/fonts.
export async function buildDiagramSprites({ color, fontCss, labelPx = 16 }) {
  const MJ = window.MathJax;
  if (!MJ || !MJ.tex2svg) return [];
  const RS = 2, SIZE = 170, C = SIZE / 2;

  async function label(tex) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:absolute;left:-100000px;top:0;font-size:${labelPx}px;color:${color};`;
    const node = MJ.tex2svg(tex);
    holder.appendChild(node);
    document.body.appendChild(holder);
    const svgEl = node.querySelector('svg');
    const r = svgEl.getBoundingClientRect();
    // generous ink pad: italic overhangs exceed the metric box and would
    // otherwise clip at the raster edge
    const PAD = 6;
    const w = Math.ceil(r.width) + 2 * PAD, h = Math.ceil(r.height) + 2 * PAD;
    const xml = new XMLSerializer().serializeToString(node);
    holder.remove();
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * RS}" height="${h * RS}" viewBox="0 0 ${w} ${h}">`
      + `<foreignObject width="${w}" height="${h}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${labelPx}px;color:${color};padding:${PAD}px;">`
      + `<style>${fontCss}mjx-container{display:inline-block;margin:0;}mjx-container svg{overflow:visible;}</style>`
      + `${xml}</div></foreignObject></svg>`;
    const img = await decodeSvg(svgStr);
    return { img, w, h };
  }

  const [labA, labE] = await Promise.all([
    label(String.raw`\var{a}`), label(String.raw`\var{E}`),
  ]);

  const c = document.createElement('canvas');
  c.width = SIZE * RS;
  c.height = SIZE * RS;
  const g = c.getContext('2d');
  g.scale(RS, RS);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.4;
  const put = (lab, x, y) => {
    const cx = Math.max(lab.w / 2, Math.min(SIZE - lab.w / 2, x));
    const cy2 = Math.max(lab.h / 2, Math.min(SIZE - lab.h / 2, y));
    g.drawImage(lab.img, cx - lab.w / 2, cy2 - lab.h / 2, lab.w, lab.h);
  };
  const dot = (x, y, r = 2.6) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };

  // the eccentric anomaly: auxiliary circle of radius a circumscribing the
  // ellipse; the planet's ellipse point lifted perpendicular to the circle;
  // E is the central angle to that lifted point
  const cy = C + 3, A = 56, B = 34;
  g.beginPath(); g.arc(C, cy, A, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(C, cy, A, B, 0, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(C - A, cy); g.lineTo(C + A, cy); g.stroke();
  const E = -0.85;
  const qx = C + A * Math.cos(E), qy = cy + A * Math.sin(E);
  g.beginPath(); g.moveTo(C, cy); g.lineTo(qx, qy); g.stroke();
  dot(qx, qy);
  const eyy = cy + B * Math.sin(E);
  g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx, cy); g.stroke();
  g.setLineDash([]);
  dot(qx, eyy);
  g.beginPath(); g.arc(C, cy, 18, E, 0); g.stroke();
  put(labA, C + (A + 14) * Math.cos(E), cy + (A + 14) * Math.sin(E));
  put(labE, C + 29 * Math.cos(E / 2), cy + 29 * Math.sin(E / 2));

  return [{ img: c, w: SIZE, h: SIZE }];
}
