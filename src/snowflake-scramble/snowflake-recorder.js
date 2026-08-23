import {
  randomValues, randomBoxRows, deriveKeyLines, chunkValueRows,
} from './snowflake-keygen.js';

// Records the snowflake-scramble animation to a .webm by drawing each frame
// (values grid with an optional symbol prefix + the snowflake key block) onto a
// 1920x1080 canvas and capturing its stream. Layout mirrors the DOM preview.
export class SnowflakeRecorder {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');
    this.recording = false;
  }

  _scaleUp(val) {
    return val * (1920 / 800);
  }

  // Resize the canvas so the whole composition fits with even padding — the
  // layout structure is frame-independent, so one measurement covers the clip.
  // If it would exceed MAX on either side, scale the whole thing down to fit.
  _fitCanvas(values, keyLines, opts) {
    const MAX = 3840;
    let pad = opts.canvasFontSize * 0.75;
    let m = this._metrics(values, keyLines, opts);
    let w = m.blockWidth + 2 * pad;
    let h = m.totalHeight + 2 * pad;
    const biggest = Math.max(w, h);
    if (biggest > MAX) {
      const scale = MAX / biggest;
      opts.canvasFontSize *= scale;
      pad *= scale;
      m = this._metrics(values, keyLines, opts);
      w = m.blockWidth + 2 * pad;
      h = m.totalHeight + 2 * pad;
    }
    const even = (n) => { n = Math.ceil(n); return n % 2 ? n + 1 : n; };
    this.canvas.width = Math.max(2, even(w));
    this.canvas.height = Math.max(2, even(h));
  }

  _startRecorder() {
    const stream = this.canvas.captureStream(30);
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const downloadPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snowflake-scramble-${this._stamp}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      };
    });

    recorder.start();
    return { recorder, downloadPromise };
  }

  // Measure the layout metrics used by both sizing and drawing.
  _metrics(values, keyLines, opts) {
    const { canvasFontSize, fontFamily, symbol, showValues, valuesPerRow } = opts;
    const ctx = this.ctx;
    ctx.font = `${canvasFontSize}px ${fontFamily}`;

    const em = canvasFontSize;
    const ch = ctx.measureText('0').width;      // monospace advance
    const numW = ctx.measureText('9.999').width; // every value is fixed width
    const symSlot = symbol ? 1.2 * em : 0;       // matches CSS .sf-sym width:1.2em
    const symGap = symbol ? 0.4 * ch : 0;        // .sf-sym margin-right:0.4ch
    const cellGap = 1.2 * ch;                    // .sf-cell margin-right:1.2ch
    const cellW = symSlot + symGap + numW;
    const lineH = 1.5 * canvasFontSize;
    const blockGap = 1.2 * em;                   // .sf-values margin-bottom:1.2em

    const rows = (showValues ? chunkValueRows(values, valuesPerRow) : []);
    const rowW = rows.length ? Math.max(...rows.map(r => r.length * cellW + (r.length - 1) * cellGap)) : 0;
    let keyW = 0;
    for (const line of keyLines) keyW = Math.max(keyW, ctx.measureText(line).width);

    const blockWidth = Math.max(rowW, keyW);
    const valuesH = rows.length ? rows.length * lineH + blockGap : 0;
    const totalHeight = valuesH + keyLines.length * lineH;

    return { em, ch, numW, symSlot, symGap, cellGap, cellW, lineH, blockGap, rows, blockWidth, totalHeight };
  }

  _drawFrame(values, keyLines, opts) {
    const { canvasFontSize, fontFamily, color, bg, symbol, rotate } = opts;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const m = this._metrics(values, keyLines, opts);
    ctx.font = `${canvasFontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';

    const x0 = (W - m.blockWidth) / 2;
    let y = (H - m.totalHeight) / 2;

    // Values grid
    for (const row of m.rows) {
      const cy = y + m.lineH / 2;
      let x = x0;
      for (const cell of row) {
        if (symbol) {
          const cx = x + m.symSlot / 2;
          ctx.textAlign = 'center';
          if (rotate) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(symbol, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(symbol, cx, cy);
          }
          x += m.symSlot + m.symGap;
        }
        ctx.textAlign = 'left';
        ctx.fillText(cell, x, cy);
        x += m.numW + m.cellGap;
      }
      y += m.lineH;
    }
    if (m.rows.length) y += m.blockGap;

    // Key block
    ctx.textAlign = 'left';
    for (const line of keyLines) {
      ctx.fillText(line, x0, y + m.lineH / 2);
      y += m.lineH;
    }
  }

  async _renderFrames(values, keyLines, opts, framesPerTick) {
    for (let f = 0; f < framesPerTick; f++) {
      this._drawFrame(values, keyLines, opts);
      await new Promise(r => setTimeout(r, 33));
    }
  }

  // Records: `duration` scramble ticks -> settle on final values -> short hold.
  async record({
    targetValues = null, duration, speed, density,
    fontSize, fontFamily, color, bg,
    showValues, showBoxes, comment, valuesPerRow = 0, symbol = null, rotate = false,
    stamp, onProgress,
  }) {
    if (this.recording) return;
    this.recording = true;
    this._stamp = stamp || 'video';
    await document.fonts.ready;

    const opts = {
      canvasFontSize: this._scaleUp(fontSize), fontFamily, color, bg,
      symbol, rotate, showValues, valuesPerRow,
    };
    const keyOpts = { showBoxes, comment };

    // Fit the canvas to the composition before capture (layout is frame-stable).
    const sampleValues = (targetValues && targetValues.length === 11) ? targetValues : randomValues();
    const sampleKeyLines = await deriveKeyLines(sampleValues, randomBoxRows(density), keyOpts);
    this._fitCanvas(sampleValues, sampleKeyLines, opts);

    const { recorder, downloadPromise } = this._startRecorder();

    const framesPerTick = Math.max(1, Math.round(speed / 33));
    const holdFrames = Math.ceil(1.2 * 30);
    const totalVideoFrames = duration * framesPerTick + holdFrames;
    let videoFrame = 0;

    for (let t = 0; t < duration; t++) {
      const values = randomValues();
      const keyLines = await deriveKeyLines(values, randomBoxRows(density), keyOpts);
      await this._renderFrames(values, keyLines, opts, framesPerTick);
      videoFrame += framesPerTick;
      if (onProgress) onProgress(Math.min(videoFrame / totalVideoFrames, 0.99));
    }

    // Settle on the final key (target values if given, else a last random one).
    const finalValues = (targetValues && targetValues.length === 11) ? targetValues : randomValues();
    const finalKeyLines = await deriveKeyLines(finalValues, randomBoxRows(density), keyOpts);
    for (let hld = 0; hld < holdFrames; hld++) {
      this._drawFrame(finalValues, finalKeyLines, opts);
      await new Promise(r => setTimeout(r, 33));
      videoFrame++;
      if (onProgress) onProgress(Math.min(videoFrame / totalVideoFrames, 0.99));
    }

    recorder.stop();
    await downloadPromise;
    this.recording = false;
    if (onProgress) onProgress(1);
  }
}
