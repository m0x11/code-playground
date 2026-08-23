import { ScrambleEngine } from './scramble-engine.js';

export class ScrambleRecorder {
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

  _autoScaleFont(fontSize, fontFamily, text) {
    let size = this._scaleUp(fontSize);
    const maxWidth = this.canvas.width * 0.9;
    this.ctx.font = `${size}px ${fontFamily}`;
    let measured = this.ctx.measureText(text);
    while (measured.width > maxWidth && size > 12) {
      size -= 2;
      this.ctx.font = `${size}px ${fontFamily}`;
      measured = this.ctx.measureText(text);
    }
    return size;
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
        a.download = `scramble-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      };
    });

    recorder.start();
    return { recorder, downloadPromise };
  }

  // Render multiple video frames for one engine tick to match speed timing
  async _renderTickFrames(state, opts, framesPerTick) {
    for (let f = 0; f < framesPerTick; f++) {
      this._renderFrame(state, opts);
      await new Promise(r => setTimeout(r, 33));
    }
  }

  async record({ text, mode, pool, duration, resolveDelay = 0, speed, fontFamily, fontSize, scrambleCharSize, resolvedLetterSpacing = 0, letterSpacing = 0, color, onProgress }) {
    if (this.recording) return;
    this.recording = true;
    await document.fonts.ready;

    const canvasFontSize = this._autoScaleFont(fontSize, fontFamily, text);
    const canvasScrambleSize = scrambleCharSize ? this._scaleUp(scrambleCharSize) : canvasFontSize;
    const canvasResolvedLetterSpacing = this._scaleUp(resolvedLetterSpacing);
    const canvasLetterSpacing = this._scaleUp(letterSpacing);
    const opts = { canvasFontSize, canvasScrambleSize, canvasResolvedLetterSpacing, canvasLetterSpacing, fontFamily, color };

    const engine = new ScrambleEngine({ text, mode, pool, duration, resolveDelay });

    const { recorder, downloadPromise } = this._startRecorder();

    // How many video frames per engine tick to match speed
    const framesPerTick = Math.max(1, Math.round(speed / 33));
    const resolveFrames = engine.resolveOrder ? engine.resolveOrder.length : text.length;
    const totalEngineTicks = duration + resolveDelay + resolveFrames + 5;
    const holdFrames = Math.ceil(0.5 * 30);
    const totalVideoFrames = totalEngineTicks * framesPerTick + holdFrames;
    let videoFrame = 0;

    while (!engine.done) {
      const state = engine.step();
      await this._renderTickFrames(state, opts, framesPerTick);
      videoFrame += framesPerTick;
      if (onProgress) onProgress(Math.min(videoFrame / totalVideoFrames, 0.99));
    }

    // Hold on final frame
    const finalState = engine.getState();
    for (let h = 0; h < holdFrames; h++) {
      this._renderFrame(finalState, opts);
      await new Promise(r => setTimeout(r, 33));
    }

    recorder.stop();
    await downloadPromise;
    this.recording = false;
    if (onProgress) onProgress(1);
  }

  async recordSlideshow({ texts, pool, duration, resolveDelay = 0, holdTime = 1000, speed, fontFamily, fontSize, scrambleCharSize, resolvedLetterSpacing = 0, letterSpacing = 0, color, onProgress }) {
    if (this.recording || texts.length === 0) return;
    this.recording = true;
    await document.fonts.ready;

    const longestText = texts.reduce((a, b) => a.length > b.length ? a : b, '');
    const canvasFontSize = this._autoScaleFont(fontSize, fontFamily, longestText);
    const canvasScrambleSize = scrambleCharSize ? this._scaleUp(scrambleCharSize) : canvasFontSize;
    const canvasResolvedLetterSpacing = this._scaleUp(resolvedLetterSpacing);
    const canvasLetterSpacing = this._scaleUp(letterSpacing);
    const opts = { canvasFontSize, canvasScrambleSize, canvasResolvedLetterSpacing, canvasLetterSpacing, fontFamily, color };

    const { recorder, downloadPromise } = this._startRecorder();

    const framesPerTick = Math.max(1, Math.round(speed / 33));
    const holdFrames = Math.ceil((holdTime / 1000) * 30);
    const initialTicks = resolveDelay + duration + 5;
    const totalVideoFrames = (initialTicks * framesPerTick) + (holdFrames + duration * framesPerTick) * texts.length;
    let videoFrame = 0;

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    const randomChar = () => pool[Math.floor(Math.random() * pool.length)];

    // 1) Initial resolve from noise to first text
    const firstEngine = new ScrambleEngine({
      text: texts[0], mode: 'longRandomResolve', pool, duration, resolveDelay,
    });
    while (!firstEngine.done) {
      const state = firstEngine.step();
      await this._renderTickFrames(state, opts, framesPerTick);
      videoFrame += framesPerTick;
      if (onProgress) onProgress(Math.min(videoFrame / totalVideoFrames, 0.99));
    }

    // 2) Loop through slides with crossfade transitions
    for (let i = 0; i < texts.length; i++) {
      // Hold on current text
      const holdChars = [...texts[i]];
      const holdResolved = new Array(texts[i].length).fill(true);
      const holdState = { chars: holdChars, resolved: holdResolved, done: true };
      for (let h = 0; h < holdFrames; h++) {
        this._renderFrame(holdState, opts);
        await new Promise(r => setTimeout(r, 33));
        videoFrame++;
        if (onProgress) onProgress(Math.min(videoFrame / totalVideoFrames, 0.99));
      }

      // Crossfade to next text
      const nextIndex = (i + 1) % texts.length;
      const fromText = texts[i];
      const toText = texts[nextIndex];
      const maxLen = Math.max(fromText.length, toText.length);
      const from = fromText.padEnd(maxLen);
      const to = toText.padEnd(maxLen);

      const indices = [];
      for (let c = 0; c < maxLen; c++) {
        if (to[c] !== ' ' || from[c] !== ' ') indices.push(c);
      }
      shuffle(indices);

      const half = Math.floor(duration / 2);

      // Dissolve map (first half): reverse of resolve order
      const dissolveOrder = [...indices].reverse();
      const dissolveMap = new Map();
      for (let c = 0; c < dissolveOrder.length; c++) {
        const t = Math.floor((c / dissolveOrder.length) * half) + 1;
        if (!dissolveMap.has(t)) dissolveMap.set(t, []);
        dissolveMap.get(t).push(dissolveOrder[c]);
      }

      // Resolve map (second half): original order
      const resolveMap = new Map();
      for (let c = 0; c < indices.length; c++) {
        const t = half + Math.floor((c / indices.length) * half) + 1;
        if (!resolveMap.has(t)) resolveMap.set(t, []);
        resolveMap.get(t).push(indices[c]);
      }

      const chars = [...from];
      const resolved = new Array(maxLen).fill(true);

      for (let t = 1; t <= duration; t++) {
        // Dissolve
        const dGroup = dissolveMap.get(t);
        if (dGroup) {
          for (const idx of dGroup) {
            resolved[idx] = false;
          }
        }
        // Resolve
        const rGroup = resolveMap.get(t);
        if (rGroup) {
          for (const idx of rGroup) {
            resolved[idx] = true;
            chars[idx] = to[idx];
          }
        }
        // Scramble unresolved
        for (let c = 0; c < maxLen; c++) {
          if (!resolved[c]) chars[c] = randomChar();
        }
        const state = { chars: [...chars], resolved: [...resolved], done: false };
        await this._renderTickFrames(state, opts, framesPerTick);
        videoFrame += framesPerTick;
        if (onProgress) onProgress(Math.min(videoFrame / totalVideoFrames, 0.99));
      }
    }

    recorder.stop();
    await downloadPromise;
    this.recording = false;
    if (onProgress) onProgress(1);
  }

  _renderFrame(state, { canvasFontSize, canvasScrambleSize, canvasResolvedLetterSpacing, canvasLetterSpacing, fontFamily, color }) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Measure total width including letter spacing and per-char font sizes
    let totalWidth = 0;
    const charWidths = [];
    for (let i = 0; i < state.chars.length; i++) {
      const size = state.resolved[i] ? canvasFontSize : canvasScrambleSize;
      ctx.font = `${size}px ${fontFamily}`;
      const cw = ctx.measureText(state.chars[i]).width;
      charWidths.push(cw);
      totalWidth += cw;
      if (i < state.chars.length - 1) {
        totalWidth += state.resolved[i] ? canvasResolvedLetterSpacing : canvasLetterSpacing;
      }
    }

    // Render centered
    let x = (w - totalWidth) / 2;
    const y = h / 2;

    for (let i = 0; i < state.chars.length; i++) {
      const size = state.resolved[i] ? canvasFontSize : canvasScrambleSize;
      ctx.font = `${size}px ${fontFamily}`;
      ctx.fillText(state.chars[i], x, y);
      x += charWidths[i];
      if (i < state.chars.length - 1) {
        x += state.resolved[i] ? canvasResolvedLetterSpacing : canvasLetterSpacing;
      }
    }
  }
}
