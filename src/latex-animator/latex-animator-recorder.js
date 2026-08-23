export class LatexAnimatorRecorder {
  constructor() {
    this.width = 1920;
    this.height = 1080;
    this._fontCss = null;
  }

  // Helper CSS for rasterized clones. The equation gap follows the live
  // stage's --lx-gap (Line Spacing slider); MathJax's own stylesheet is
  // absent inside foreignObject, so the margin must be restated here.
  _helperCssFor(stage) {
    const gap = getComputedStyle(stage).getPropertyValue('--lx-gap').trim() || '0.55em';
    return `
.lx-hidden{visibility:hidden;}
mjx-container{display:block;margin:0;}
mjx-container + mjx-container{margin-top:${gap};}
.latex-caret{display:none;position:absolute;width:.07em;}
.latex-caret.visible{display:block;background:currentColor;}
`;
  }

  _createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
  }

  _fetchB64(url) {
    return fetch(url).then(r => r.arrayBuffer()).then(buf => {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    });
  }

  // Inline the PP web fonts as base64 so \text runs render inside the rasterized SVG.
  async _ensureFonts() {
    if (this._fontCss) return;
    const files = [
      { fam: 'PP Editorial New', style: 'normal', url: '/fonts/PPEditorialNew-Regular.woff2' },
      { fam: 'PP Editorial New', style: 'italic', url: '/fonts/PPEditorialNew-Italic.woff2' },
      { fam: 'PP Editorial New Ultralight', style: 'normal', url: '/fonts/PPEditorialNew-Ultralight.woff2' },
      { fam: 'PP Right Serif Mono', style: 'normal', url: '/fonts/PPRightSerifMono-Regular.woff2' },
    ];
    let css = '';
    for (const f of files) {
      try {
        const b64 = await this._fetchB64(f.url);
        css += `@font-face{font-family:'${f.fam}';font-style:${f.style};font-weight:normal;`
          + `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
      } catch { /* font missing — skip */ }
    }
    this._fontCss = css;
  }

  _fillBackground(ds) {
    const ctx = this.ctx, W = this.width, H = this.height;
    const bgImage = ds.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
      const angleMatch = bgImage.match(/(\d+)deg/);
      const angle = angleMatch ? parseFloat(angleMatch[1]) : 135;
      const colors = [...bgImage.matchAll(/rgba?\([^)]+\)/g)].map(m => m[0]);
      const positions = [...bgImage.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]) / 100);
      if (colors.length >= 2) {
        const rad = angle * Math.PI / 180;
        const dirX = Math.sin(rad), dirY = -Math.cos(rad);
        const halfLen = (Math.abs(W * dirX) + Math.abs(H * dirY)) / 2;
        const cx = W / 2, cy = H / 2;
        const grad = ctx.createLinearGradient(cx - dirX * halfLen, cy - dirY * halfLen, cx + dirX * halfLen, cy + dirY * halfLen);
        colors.forEach((c, i) => {
          const pos = positions[i] !== undefined ? positions[i] : i / (colors.length - 1);
          grad.addColorStop(Math.min(Math.max(pos, 0), 1), c);
        });
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = ds.backgroundColor || '#faf8f5';
      }
    } else {
      ctx.fillStyle = ds.backgroundColor || '#faf8f5';
    }
    ctx.fillRect(0, 0, W, H);
  }

  async renderFrame(display, stage) {
    const ctx = this.ctx, W = this.width, H = this.height;
    const dispRect = display.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const ds = getComputedStyle(display);
    const ss = getComputedStyle(stage);

    this._fillBackground(ds);

    const scale = Math.min(W / dispRect.width, H / dispRect.height);
    const sw = dispRect.width * scale, sh = dispRect.height * scale;
    const ox = (W - sw) / 2, oy = (H - sh) / 2;

    // Clone the stage at its current reveal state, inline the styles it needs.
    // Alignment (center/left) follows the live stage's computed style.
    const clone = stage.cloneNode(true);
    clone.style.cssText = `width:${stageRect.width}px;height:${stageRect.height}px;`
      + `color:${ss.color};font-family:${ss.fontFamily};font-size:${ss.fontSize};`
      + `position:relative;margin:0;display:flex;flex-direction:column;`
      + `justify-content:center;align-items:${ss.alignItems};text-align:${ss.textAlign};overflow:hidden;`;
    const xml = new XMLSerializer().serializeToString(clone);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${stageRect.width}" height="${stageRect.height}">`
      + `<foreignObject x="0" y="0" width="100%" height="100%">`
      + `<div xmlns="http://www.w3.org/1999/xhtml"><style>${this._fontCss}${this._helperCssFor(stage)}</style>${xml}</div>`
      + `</foreignObject></svg>`;

    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();

    const dx = ox + (stageRect.left - dispRect.left) * scale;
    const dy = oy + (stageRect.top - dispRect.top) * scale;
    ctx.drawImage(img, dx, dy, stageRect.width * scale, stageRect.height * scale);
  }

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Rasterize the stage exactly as record() would, at its current reveal state.
  async screenshot({ display, stage, filename = 'latex-frame.png' }) {
    await this._ensureFonts();
    this._createCanvas();
    await this.renderFrame(display, stage);
    const blob = await new Promise(res => this.canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Failed to encode PNG');
    this._download(blob, filename);
  }

  // Shared prep for full/paged captures: clone the stage (everything
  // revealed), measure it, and run a cheap low-res alpha probe that yields
  // the true flowed content height plus a blank-row map for page breaks.
  // The live reveal state is untouched (visibility overridden in the clone).
  async _captureCore(display, stage) {
    if (!stage.querySelector('mjx-container')) {
      throw new Error('Nothing to capture — no typeset content');
    }
    if (typeof CompressionStream === 'undefined') {
      throw new Error('Capture requires CompressionStream (Chrome 80+, Safari 16.4+)');
    }
    await this._ensureFonts();
    const ds = getComputedStyle(display);
    const ss = getComputedStyle(stage);
    const padX = parseFloat(ds.paddingLeft) || 0;
    const padY = parseFloat(ds.paddingTop) || 0;
    // Fit the capture to the CONTENT, not the stage: scrollWidth equals the
    // viewport width whenever the window is wider than the widest equation,
    // which made the 3840px frame mostly margin (tiny low-res text column)
    // on wide monitors. Measure the widest equation SVG instead.
    let contentW = 0;
    stage.querySelectorAll('mjx-container > svg, mjx-container svg').forEach(svg => {
      contentW = Math.max(contentW, svg.getBoundingClientRect().width);
    });
    if (!contentW) throw new Error('Nothing to capture — no typeset content');
    const layoutW = Math.ceil(contentW) + 2;

    // Alignment (center/left) follows the live stage's computed style.
    // Restate --lx-gap: overwriting cssText wipes the inline custom prop,
    // and the off-screen measurement below resolves margins through it.
    const gap = ss.getPropertyValue('--lx-gap').trim() || '0.55em';
    const clone = stage.cloneNode(true);
    clone.style.cssText = `width:${layoutW}px;--lx-gap:${gap};`
      + `color:${ss.color};font-family:${ss.fontFamily};font-size:${ss.fontSize};`
      + `position:relative;margin:0;display:flex;flex-direction:column;`
      + `justify-content:flex-start;align-items:${ss.alignItems};text-align:${ss.textAlign};overflow:visible;`;
    // The live stage's scrollHeight doesn't match how the clone flows (the
    // stage viewport clips/centers; the clone stacks from the top), so lay
    // the clone out off-screen and measure its true height. This measurement
    // overshoots the foreignObject flow by up to ~25% (margin collapse), so
    // it's only a layout-box upper bound; the probe below finds the truth.
    const meas = document.createElement('div');
    meas.style.cssText = `position:absolute;left:-100000px;top:0;visibility:hidden;width:${layoutW}px;`;
    meas.appendChild(clone);
    document.body.appendChild(meas);
    const fullH = Math.ceil(clone.getBoundingClientRect().height) + 2;
    meas.remove();

    const genH = Math.ceil(fullH * 1.1) + 64;
    const totalW = layoutW + 2 * padX;
    const xml = new XMLSerializer().serializeToString(clone);
    const revealCss = '.lx-hidden{visibility:visible !important;}';
    const core = { ds, padX, padY, layoutW, genH, totalW, xml, revealCss,
                   helperCss: this._helperCssFor(stage) };

    // PASS 1: low-res raster → true content height + blank-row map (both in
    // CSS px). The coarse scan can miss sub-pixel hairlines, so pad heights
    // and only treat GENEROUS runs of blank rows as safe page breaks.
    const probeScale = Math.min(1, 640 / layoutW);
    const pw = Math.max(1, Math.round(layoutW * probeScale));
    const ph = Math.max(1, Math.round(genH * probeScale));
    const probeImg = new Image();
    probeImg.src = 'data:image/svg+xml;charset=utf-8,'
      + encodeURIComponent(this._pageSvg(core, probeScale, pw, ph, 0, genH, true));
    await probeImg.decode();
    const p1 = document.createElement('canvas');
    p1.width = pw;
    p1.height = ph;
    const p1ctx = p1.getContext('2d', { willReadFrequently: true });
    p1ctx.drawImage(probeImg, 0, 0, pw, ph);
    const p1data = p1ctx.getImageData(0, 0, pw, ph).data;
    const rowBlank = new Uint8Array(ph);
    let p1bottom = 0;
    for (let y = 0; y < ph; y++) {
      let blank = 1;
      for (let x = 0; x < pw; x++) {
        if (p1data[(y * pw + x) * 4 + 3] > 1) { blank = 0; break; }
      }
      rowBlank[y] = blank;
      if (!blank) p1bottom = y + 1;
    }
    if (!p1bottom) throw new Error('Capture came out empty');
    core.trueH = Math.min(genH, Math.ceil(p1bottom / probeScale) + 24);
    core.rowBlank = rowBlank;
    core.probeScale = probeScale;
    return core;
  }

  // SVG for one slice of the page. contentOnly=true (probe) omits padding.
  // cssTop/cssH window the CONTENT in css coords — padding regions and
  // anything outside the window stay transparent (pure background), so a
  // page's margins never leak the neighboring page's equations.
  _pageSvg(core, scale, wPx, hPx, cssTop, cssH, contentOnly) {
    const vx = contentOnly ? 0 : -core.padX;
    const vw = contentOnly ? core.layoutW : core.totalW;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}"`
      + ` viewBox="${vx} ${cssTop} ${vw} ${cssH}">`
      + `<foreignObject x="0" y="0" width="${core.layoutW}" height="${core.genH}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml"><style>${this._fontCss}${core.helperCss}${core.revealCss}</style>${core.xml}</div>`
      + `</foreignObject></svg>`;
  }

  // Render content window [cssTop, cssTop+cssContentH) plus padding into one
  // PNG, in ≤2048-tall canvas STRIPS. Canvas size limits are unreliable
  // across GPUs/browsers — oversized canvases get their backing store
  // silently downscaled — so no canvas here ever exceeds 3840×2048; the PNG
  // is assembled manually, streamed through CompressionStream('deflate').
  async _renderRegionPng(core, cssTop, cssContentH, scale, filename) {
    const { ds, padX, padY, totalW } = core;
    const W = Math.round(totalW * scale);
    const outH = Math.round((cssContentH + 2 * padY) * scale);
    const contentTopPx = Math.round(padY * scale);
    const contentBotPx = Math.round((padY + cssContentH) * scale);

    const STRIP = 2048;
    const strip = document.createElement('canvas');
    strip.width = W;
    strip.height = STRIP;
    const sctx = strip.getContext('2d', { willReadFrequently: true });

    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const compressed = [];
    const readLoop = (async () => {
      const reader = cs.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        compressed.push(value);
      }
    })();

    for (let y0 = 0; y0 < outH; y0 += STRIP) {
      const h = Math.min(STRIP, outH - y0);
      sctx.clearRect(0, 0, W, STRIP);
      // Background: paint the display's fill as if the canvas were the full
      // page, translated so this strip sees its slice (gradients line up).
      sctx.save();
      sctx.translate(0, -y0);
      const keep = [this.canvas, this.ctx, this.width, this.height];
      this.canvas = strip; this.ctx = sctx; this.width = W; this.height = outH;
      this._fillBackground(ds);
      [this.canvas, this.ctx, this.width, this.height] = keep;
      sctx.restore();
      // Content: only the part of this strip inside the content band.
      const iTop = Math.max(y0, contentTopPx);
      const iBot = Math.min(y0 + h, contentBotPx);
      if (iBot > iTop) {
        const cssY0 = cssTop + (iTop - contentTopPx) / scale;
        const cssH = (iBot - iTop) / scale;
        const im = new Image();
        im.src = 'data:image/svg+xml;charset=utf-8,'
          + encodeURIComponent(this._pageSvg(core, scale, W, iBot - iTop, cssY0, cssH, false));
        await im.decode();
        sctx.drawImage(im, 0, iTop - y0);
      }
      // PNG scanlines: filter byte 0 + RGBA per row.
      const data = sctx.getImageData(0, 0, W, h).data;
      const rowBytes = W * 4;
      const out = new Uint8Array(h * (rowBytes + 1));
      for (let r = 0; r < h; r++) {
        out[r * (rowBytes + 1)] = 0;
        out.set(data.subarray(r * rowBytes, (r + 1) * rowBytes), r * (rowBytes + 1) + 1);
      }
      await writer.write(out);
    }
    await writer.close();
    await readLoop;

    let idatLen = 0;
    for (const c of compressed) idatLen += c.length;
    const idat = new Uint8Array(idatLen);
    for (let off = 0, i = 0; i < compressed.length; i++) { idat.set(compressed[i], off); off += compressed[i].length; }

    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, W); dv.setUint32(4, outH);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

    const blob = new Blob([
      new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      this._pngChunk('IHDR', ihdr),
      this._pngChunk('IDAT', idat),
      this._pngChunk('IEND', new Uint8Array(0)),
    ], { type: 'image/png' });
    this._download(blob, filename);
    return { width: W, height: outH };
  }

  // Everything as ONE tall PNG, `width` px wide (height unbounded up to sanity).
  async captureFull({ display, stage, filename = 'latex-capture-4k.png', width = 3840 }) {
    const core = await this._captureCore(display, stage);
    let scale = width / core.totalW;
    const H = () => Math.round((core.trueH + 2 * core.padY) * scale);
    if (H() > 30000) scale *= 30000 / H(); // time/memory sanity only
    return this._renderRegionPng(core, 0, core.trueH, scale, filename);
  }

  // Everything as a SERIES of pages, each ≤maxSide on BOTH sides, cut at
  // blank gaps between equations — for tools like Figma that silently
  // downscale any imported image past 4096px.
  async capturePages({ display, stage, base = 'latex-capture', maxSide = 4096 }) {
    const core = await this._captureCore(display, stage);
    let scale = Math.min(3840, maxSide) / core.totalW;
    const maxContentCss = maxSide / scale - 2 * core.padY;
    if (maxContentCss <= 0) throw new Error('Padding too large for the page size');

    // Page breaks: prefer the LAST generous blank run (≥6 probe rows) that
    // keeps the page under maxContentCss; fall back to a hard cut.
    const { rowBlank, probeScale, trueH } = core;
    const cuts = [];
    let start = 0;
    while (trueH - start > maxContentCss) {
      const limitRow = Math.floor((start + maxContentCss) * probeScale);
      const minRow = Math.ceil((start + maxContentCss * 0.25) * probeScale);
      let cut = -1;
      for (let y = Math.min(limitRow, rowBlank.length - 1), run = 0; y >= minRow; y--) {
        run = rowBlank[y] ? run + 1 : 0;
        if (run >= 6) { cut = (y + run / 2) / probeScale; break; }
      }
      if (cut < 0) cut = start + maxContentCss;
      cuts.push(cut);
      start = cut;
    }
    const bounds = [0, ...cuts, trueH];

    let width = 0, height = 0;
    for (let i = 0; i < bounds.length - 1; i++) {
      const name = `${base}-p${String(i + 1).padStart(2, '0')}.png`;
      const r = await this._renderRegionPng(core, bounds[i], bounds[i + 1] - bounds[i], scale, name);
      width = r.width;
      height = Math.max(height, r.height);
      await new Promise(res => setTimeout(res, 300)); // let downloads settle
    }
    return { pages: bounds.length - 1, width, height };
  }

  _pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    if (!this._crcT) {
      this._crcT = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        this._crcT[n] = c;
      }
    }
    let c = -1;
    for (let i = 4; i < 8 + data.length; i++) c = this._crcT[(c ^ out[i]) & 0xFF] ^ (c >>> 8);
    dv.setUint32(8 + data.length, (c ^ -1) >>> 0);
    return out;
  }

  // Shared MP4 pipeline: returns { addFrames(n), finish(filename) }.
  // addFrames encodes the CURRENT canvas contents n times at 30fps.
  async _startMp4() {
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('Recording requires a browser with VideoEncoder support (Chrome 94+, Edge 94+, Safari 16.4+)');
    }
    let mp4Module;
    try {
      mp4Module = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm');
    } catch {
      throw new Error('Failed to load MP4 encoder. Check your internet connection.');
    }
    const { Muxer, ArrayBufferTarget } = mp4Module;

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: this.width, height: this.height },
      fastStart: 'in-memory',
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder error:', e),
    });
    // H.264 High@4.0 tops out at 1080p; larger frames need level 5.1.
    // Bitrate scales with pixel count (5 Mbps at 1080p → ~20 Mbps at 4K).
    const pixels = this.width * this.height;
    const codec = pixels > 1920 * 1080 ? 'avc1.640033' : 'avc1.640028';
    const bitrate = Math.round(5_000_000 * Math.max(1, pixels / (1920 * 1080)));
    encoder.configure({ codec, width: this.width, height: this.height, bitrate, framerate: 30 });

    const FRAME_US = 33333;
    let frameIndex = 0;
    return {
      addFrames: (n = 1) => {
        for (let i = 0; i < n; i++) {
          const frame = new VideoFrame(this.canvas, { timestamp: frameIndex * FRAME_US, duration: FRAME_US });
          encoder.encode(frame, { keyFrame: frameIndex % 60 === 0 });
          frame.close();
          frameIndex++;
        }
      },
      finish: async (filename) => {
        await encoder.flush();
        encoder.close();
        muxer.finalize();
        this._download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), filename);
      },
    };
  }

  async record({ display, stage, totalUnits, stepReveal, onProgress }) {
    await this._ensureFonts();
    this._createCanvas();
    const mp4 = await this._startMp4();

    let step = 0, done = false;

    // Opening hold (blank/first state) so the video doesn't start mid-stroke.
    await this.renderFrame(display, stage);
    mp4.addFrames(12);

    while (!done) {
      const result = stepReveal();
      done = result.done;
      step++;

      await this.renderFrame(display, stage);
      mp4.addFrames(Math.max(1, Math.round((result.delay || 33) / 33)));

      if (onProgress && totalUnits > 0) onProgress(Math.min(step / totalUnits, 1));
      if (step % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // Final hold ~1s.
    mp4.addFrames(30);
    await mp4.finish('latex-animation.mp4');
  }

  // Particle mode: the animator hands over a ready engine (lines already
  // sampled); drive it at a fixed 30fps for one full cycle through its
  // lines, drawing scaled onto the encoder canvas.
  async recordParticles({ display, engine, scale, onProgress }) {
    await this._ensureFonts();
    this._createCanvas();
    const mp4 = await this._startMp4();
    const ds = getComputedStyle(display);

    const cycleMs = engine.totalCycleMs();
    const totalFrames = Math.round(cycleMs / 1000 * 30) + 15; // small tail
    for (let f = 0; f < totalFrames; f++) {
      engine.step(1000 / 30);
      this._fillBackground(ds);
      engine.draw(this.ctx, this.width / 2, this.height / 2, scale);
      mp4.addFrames(1);
      if (f % 10 === 0) {
        if (onProgress) onProgress(f / totalFrames);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    await mp4.finish('latex-particles.mp4');
    if (onProgress) onProgress(1);
  }

  // Float mode ("calculating math"): rasterize each equation ONCE, then run
  // the same particle sim as the live mode straight onto the canvas — fade
  // in, zoom toward the camera, fade out past the threshold, respawn at a
  // new random spot. Deterministic 30fps; no DOM timing involved.
  async recordFloat({ display, stage, equations, params, onProgress }) {
    await this._ensureFonts();
    this._createCanvas();
    const mp4 = await this._startMp4();

    const ds = getComputedStyle(display);
    const ss = getComputedStyle(stage);
    const dispRect = display.getBoundingClientRect();
    const pxScale = Math.min(this.width / dispRect.width, this.height / dispRect.height);
    // Sprites peak at natural size (×pxScale on canvas), so rasterizing at
    // ~pxScale keeps even the final frame of the zoom pixel-sharp.
    const RASTER = Math.min(6, Math.max(2, Math.ceil(pxScale)));

    const sprites = [];
    for (const eq of equations) {
      const svgEl = eq.querySelector('svg');
      if (!svgEl) continue;
      // Split-line clones are off-DOM (rect would be 0) and carry their CSS
      // size in data-lx-w/h; live containers are measured directly.
      const r = svgEl.getBoundingClientRect();
      const w = Math.ceil(eq.dataset.lxW ? parseFloat(eq.dataset.lxW) : r.width);
      const h = Math.ceil(eq.dataset.lxH ? parseFloat(eq.dataset.lxH) : r.height);
      if (!w || !h) continue;
      // Build the wrapper in the DOM so the serializer escapes quotes in
      // computed styles (font-family values contain double quotes, which
      // would break a hand-assembled style="..." attribute).
      const holder = document.createElement('div');
      holder.style.cssText = `width:${w}px;color:${ss.color};font-family:${ss.fontFamily};font-size:${ss.fontSize};`;
      holder.appendChild(eq.cloneNode(true));
      const xml = new XMLSerializer().serializeToString(holder);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * RASTER}" height="${h * RASTER}" viewBox="0 0 ${w} ${h}">`
        + `<foreignObject x="0" y="0" width="${w}" height="${h}">`
        + `<div xmlns="http://www.w3.org/1999/xhtml">`
        + `<style>${this._fontCss}mjx-container{display:block;margin:0;}.lx-hidden{visibility:visible !important;}</style>${xml}</div>`
        + `</foreignObject></svg>`;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      try {
        await img.decode();
        sprites.push({ img, w, h });
      } catch { /* one bad equation shouldn't sink the take */ }
    }
    if (!sprites.length) throw new Error('No equations to float');

    // A unit is one sprite drawn at 1 position (random/cascade) or at 4
    // grid-snapped, axis-mirrored positions (symmetry) — same rules as the
    // live engine in latex-animator.js.
    const { count, life, zoom, fadeAt, layout = 'random', reveal = 'off' } = params;
    const W = this.width, H = this.height;
    const GRID = 8;
    // Glyph-cascade approximation: sprites are flat rasters, so the reveal
    // is done with vertical strips shown in the chosen order — ≈ per-glyph
    // granularity for a math line.
    const FI = 0.18, STRIPS = 24;
    const stripOrder = (mode) => {
      const idx = Array.from({ length: STRIPS }, (_, i) => i);
      if (mode === 'rtl') idx.reverse();
      else if (mode === 'center') {
        const out = [], mid = Math.floor(STRIPS / 2);
        let l = mid - 1, r = mid;
        while (l >= 0 || r < STRIPS) {
          if (r < STRIPS) out.push(idx[r++]);
          if (l >= 0) out.push(idx[l--]);
        }
        return out;
      } else if (mode === 'random') {
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [idx[i], idx[j]] = [idx[j], idx[i]];
        }
      }
      return idx;
    };
    const per = layout === 'symmetry' ? 4 : 1;
    const nUnits = Math.max(1, Math.round(count / per));
    const st = { slot: 0, slots: nUnits, eqIndex: 0, units: [] };
    // Cascade step mirrors the live engine: median equation height + the
    // Line Spacing gap (both css px, scaled to canvas), ladder centered.
    let cascade = null;
    if (layout === 'cascade') {
      const hs = sprites.map(sp => sp.h).sort((a, b) => a - b);
      const lineH = hs[Math.floor(hs.length / 2)] || 24;
      const fontPx = parseFloat(ss.fontSize) || 34;
      const step = (lineH + (params.gap || 0.55) * fontPx) * pxScale;
      const slots = Math.max(1, Math.floor((H * 0.96) / step));
      cascade = { step, slots, y0: (H - (slots - 1) * step) / 2 };
      st.slots = slots;
    }
    // Best-candidate sampling (random layout): matches the live engine —
    // several tries, keep the farthest-from-everyone spot; y-distance
    // weighted up since equations are wide and flat. Normalized to % so the
    // metric is aspect-independent.
    const bestSpot = (existing) => {
      let best = null, bestScore = -1;
      for (let c = 0; c < 14; c++) {
        const x = Math.random() * W, y = Math.random() * H;
        let score = Infinity;
        for (const [ex, ey] of existing) {
          const dx = (x - ex) / W * 100, dy = (y - ey) / H * 100 * 2.5;
          score = Math.min(score, dx * dx + dy * dy);
        }
        if (score > bestScore) { bestScore = score; best = [x, y]; }
      }
      return best;
    };
    // Shuffled-bag draw (symmetry): cycles the pool before any repeats, so a
    // quartet — and the screen — never shows the same equation twice.
    const draw = () => {
      if (!st.bag || !st.bag.length) {
        st.bag = sprites.map((_, i) => i);
        for (let i = st.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [st.bag[i], st.bag[j]] = [st.bag[j], st.bag[i]];
        }
      }
      return sprites[st.bag.pop()];
    };
    const spawn = (born, self) => {
      let unitSprites, positions;
      if (layout === 'cascade') {
        unitSprites = [sprites[st.eqIndex++ % sprites.length]];
        positions = [[W / 2, cascade.y0 + (st.slot++ % cascade.slots) * cascade.step]];
      } else if (layout === 'symmetry') {
        const x = (Math.floor(Math.random() * (GRID / 2)) + 0.5) / GRID * W;
        const y = (Math.floor(Math.random() * (GRID / 2)) + 0.5) / GRID * H;
        positions = [[x, y], [W - x, y], [x, H - y], [W - x, H - y]];
        unitSprites = positions.map(() => draw());
      } else {
        unitSprites = [sprites[Math.floor(Math.random() * sprites.length)]];
        positions = [bestSpot(st.units.filter(u => u !== self).flatMap(u => u.positions))];
      }
      // Cascade keeps uniform lifetimes so the descending order holds.
      return { sprites: unitSprites, positions, born,
               stripOrders: reveal !== 'off' ? unitSprites.map(() => stripOrder(reveal)) : null,
               life: layout === 'cascade' ? life : life * (0.75 + Math.random() * 0.5) };
    };
    const units = st.units; // grows during the loop, so early spawns repel later ones
    for (let i = 0; i < nUnits; i++) units.push(spawn(i * (life / nUnits)));

    const FPS = 30;
    const totalFrames = Math.round((life * 2.5 + 1000) / 1000 * FPS);
    const ctx = this.ctx;
    for (let f = 0; f < totalFrames; f++) {
      const now = f * (1000 / FPS);
      this._fillBackground(ds);

      const drawable = [];
      for (const u of units) {
        let t = (now - u.born) / u.life;
        if (t >= 1) { Object.assign(u, spawn(now, u)); t = 0; }
        if (t < 0) continue; // staggered birth still pending
        const s = 1 / zoom + (1 - 1 / zoom) * Math.pow(t, 1.6); // 1/zoom → natural size
        // With the strip cascade on, the cascade IS the entrance — only the
        // fade-out curve applies to the item's own alpha.
        const fadeOut = t <= fadeAt ? 1 : 1 - (t - fadeAt) / (1 - fadeAt);
        const alpha = Math.max(0, reveal !== 'off'
          ? Math.min(1, fadeOut)
          : Math.min(Math.min(1, t / FI), fadeOut));
        if (alpha > 0) drawable.push({ u, s, alpha, t });
      }
      drawable.sort((a, b) => a.s - b.s); // closer (bigger) equations drawn on top

      for (const { u, s, alpha, t } of drawable) {
        ctx.globalAlpha = alpha;
        u.positions.forEach(([x, y], k) => {
          const sp = u.sprites[k];
          const dw = sp.w * pxScale * s;
          const dh = sp.h * pxScale * s;
          const dx = x - dw / 2, dy = y - dh / 2;
          const order = u.stripOrders && u.stripOrders[k];
          if (order && t < FI) {
            const shown = Math.floor(STRIPS * (t / FI));
            const sw = sp.img.width / STRIPS, dws = dw / STRIPS;
            for (let i = 0; i < shown; i++) {
              const idx = order[i];
              ctx.drawImage(sp.img, idx * sw, 0, sw, sp.img.height,
                            dx + idx * dws, dy, dws, dh);
            }
          } else {
            ctx.drawImage(sp.img, dx, dy, dw, dh);
          }
        });
      }
      ctx.globalAlpha = 1;

      mp4.addFrames(1);
      if (f % 10 === 0) {
        if (onProgress) onProgress(f / totalFrames);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    await mp4.finish('latex-float.mp4');
    if (onProgress) onProgress(1);
  }
}
