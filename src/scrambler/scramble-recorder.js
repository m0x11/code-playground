import { ScrambleEngine } from './scramble-engine.js';

export class ScrambleRecorder {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');
    this.recording = false;
  }

  async record({ text, mode, pool, duration, speed, fontFamily, fontSize, color, onProgress }) {
    if (this.recording) return;
    this.recording = true;

    // Wait for fonts to be ready
    await document.fonts.ready;

    const engine = new ScrambleEngine({ text, mode, pool, duration });

    // Determine canvas font size — auto-scale if text overflows 90% of width
    let canvasFontSize = fontSize * (1920 / 800); // Scale up for 1080p
    const maxWidth = this.canvas.width * 0.9;

    this.ctx.font = `${canvasFontSize}px ${fontFamily}`;
    let measured = this.ctx.measureText(text);
    while (measured.width > maxWidth && canvasFontSize > 12) {
      canvasFontSize -= 2;
      this.ctx.font = `${canvasFontSize}px ${fontFamily}`;
      measured = this.ctx.measureText(text);
    }

    // Set up MediaRecorder
    const stream = this.canvas.captureStream(30);

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const downloadPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scramble-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        this.recording = false;
        resolve();
      };
    });

    recorder.start();

    // Calculate total frames
    // We need enough frames for: duration scramble + resolveOrder.length resolve + 0.5s hold
    const resolveFrames = engine.resolveOrder ? engine.resolveOrder.length : text.length;
    const totalEngineFrames = duration + resolveFrames + 5; // +5 buffer
    const holdFrames = Math.ceil(0.5 * 30); // 0.5s at 30fps
    const totalFrames = totalEngineFrames + holdFrames;

    // Render frames
    for (let frame = 0; frame < totalFrames; frame++) {
      let state;
      if (!engine.done) {
        state = engine.step();
      } else {
        state = engine.getState();
      }

      this._renderFrame(state, canvasFontSize, fontFamily, color);

      if (onProgress) {
        onProgress(Math.min(frame / totalFrames, 1));
      }

      // Wait for next frame timing (~33ms for 30fps)
      await new Promise(r => setTimeout(r, 33));
    }

    recorder.stop();
    await downloadPromise;

    if (onProgress) onProgress(1);
  }

  _renderFrame(state, fontSize, fontFamily, color) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Text setup
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure total width for per-character rendering
    const text = state.chars.join('');
    const fullMetrics = ctx.measureText(text);

    // Render text centered
    let x = (w - fullMetrics.width) / 2;
    const y = h / 2;

    for (let i = 0; i < state.chars.length; i++) {
      const ch = state.chars[i];
      const charWidth = ctx.measureText(ch).width;

      ctx.fillStyle = color;
      ctx.globalAlpha = 1;

      ctx.textAlign = 'left';
      ctx.fillText(ch, x, y);
      x += charWidth;
    }

    ctx.globalAlpha = 1;
  }
}
