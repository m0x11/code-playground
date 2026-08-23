export class CodeAnimatorRecorder {
  constructor() {
    this.width = 1920;
    this.height = 1080;
  }

  _createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
  }

  // Flatten the code element DOM into [{text, color, italic, shadow}, ...] segments
  _collectSegments(node, parentColor, parentItalic, parentShadow) {
    const segments = [];
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) {
          segments.push({ text: child.textContent, color: parentColor, italic: parentItalic, shadow: parentShadow });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.classList.contains('cursor')) {
          segments.push({ cursor: true, color: parentColor });
          continue;
        }
        const cs = getComputedStyle(child);
        const color = cs.color || parentColor;
        const italic = cs.fontStyle === 'italic';
        const shadow = cs.textShadow !== 'none' ? cs.textShadow : parentShadow;
        segments.push(...this._collectSegments(child, color, italic, shadow));
      }
    }
    return segments;
  }

  _applyShadow(ctx, shadowStr, scale) {
    if (!shadowStr || shadowStr === 'none') {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      return;
    }
    const colorMatch = shadowStr.match(/rgba?\([^)]+\)/);
    const numMatches = [...shadowStr.matchAll(/([\d.]+)px/g)];
    if (colorMatch && numMatches.length >= 3) {
      ctx.shadowOffsetX = parseFloat(numMatches[0][1]) * scale;
      ctx.shadowOffsetY = parseFloat(numMatches[1][1]) * scale;
      ctx.shadowBlur = parseFloat(numMatches[2][1]) * scale;
      ctx.shadowColor = colorMatch[0];
    }
  }

  // Draw the code display element directly onto the canvas using 2D API
  renderFrame(element) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;

    const rect = element.getBoundingClientRect();
    const ds = getComputedStyle(element);

    // Scale: map element dimensions to full canvas
    const scale = Math.min(W / rect.width, H / rect.height);
    const sw = rect.width * scale;
    const sh = rect.height * scale;
    const ox = (W - sw) / 2;
    const oy = (H - sh) / 2;

    // Background — fill entire canvas with theme background
    const bgImage = ds.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
      const angleMatch = bgImage.match(/(\d+)deg/);
      const angle = angleMatch ? parseFloat(angleMatch[1]) : 135;
      const colors = [...bgImage.matchAll(/rgba?\([^)]+\)/g)].map(m => m[0]);
      const positions = [...bgImage.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]) / 100);

      if (colors.length >= 2) {
        const rad = angle * Math.PI / 180;
        const dirX = Math.sin(rad);
        const dirY = -Math.cos(rad);
        const halfLen = (Math.abs(W * dirX) + Math.abs(H * dirY)) / 2;
        const cx = W / 2, cy = H / 2;
        const grad = ctx.createLinearGradient(
          cx - dirX * halfLen, cy - dirY * halfLen,
          cx + dirX * halfLen, cy + dirY * halfLen
        );
        colors.forEach((c, i) => {
          const pos = positions[i] !== undefined ? positions[i] : i / (colors.length - 1);
          grad.addColorStop(pos, c);
        });
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = ds.backgroundColor || '#1a1a2e';
      }
    } else {
      ctx.fillStyle = ds.backgroundColor || '#1a1a2e';
    }
    ctx.fillRect(0, 0, W, H);

    // Clip to code display bounds so scrolled text doesn't bleed out
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, sw, sh);
    ctx.clip();

    // Code text
    const codeEl = element.querySelector('code');
    if (!codeEl) { ctx.restore(); return; }

    const fontSize = parseFloat(ds.fontSize) * scale;
    const fontFamily = ds.fontFamily;
    const lineH = fontSize * 1.6;
    const padTop = parseFloat(ds.paddingTop) * scale;
    const padLeft = parseFloat(ds.paddingLeft) * scale;

    // Scroll offset — the pre element scrolls, shift text up accordingly
    const pre = element.querySelector('pre');
    const scrollOffset = (pre ? pre.scrollTop : 0) * scale;

    // Line numbers
    const hasLineNums = pre && pre.classList.contains('line-numbers');
    ctx.font = `${fontSize}px ${fontFamily}`;
    const lineNumW = hasLineNums ? ctx.measureText('000').width + fontSize : 0;

    const textLeft = ox + padLeft + lineNumW;
    let x = textLeft;
    let y = oy + padTop + fontSize - scrollOffset;
    let lineNum = 1;

    const drawLineNum = () => {
      if (!hasLineNums) return;
      const saved = ctx.fillStyle;
      const savedShadow = ctx.shadowColor;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#555';
      ctx.font = `${fontSize}px ${fontFamily}`;
      const ns = String(lineNum);
      ctx.fillText(ns, ox + padLeft + lineNumW - ctx.measureText(ns).width - fontSize * 0.4, y);
      ctx.fillStyle = saved;
      ctx.shadowColor = savedShadow;
    };

    drawLineNum();

    const defaultColor = ds.color;
    const segments = this._collectSegments(codeEl, defaultColor, false, 'none');

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    for (const seg of segments) {
      if (seg.cursor) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = seg.color;
        ctx.fillRect(x, y - fontSize * 0.8, fontSize * 0.6, fontSize);
        continue;
      }

      ctx.font = `${seg.italic ? 'italic ' : ''}${fontSize}px ${fontFamily}`;
      ctx.fillStyle = seg.color;
      this._applyShadow(ctx, seg.shadow, scale);

      for (const ch of seg.text) {
        if (ch === '\n') {
          lineNum++;
          x = textLeft;
          y += lineH;
          ctx.font = `${fontSize}px ${fontFamily}`;
          drawLineNum();
          ctx.font = `${seg.italic ? 'italic ' : ''}${fontSize}px ${fontFamily}`;
          ctx.fillStyle = seg.color;
          this._applyShadow(ctx, seg.shadow, scale);
          continue;
        }
        ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width;
      }
    }

    // Restore clip
    ctx.restore();
  }

  async record({ codeDisplay, totalLength, stepAnimation, onProgress }) {
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('Recording requires a browser with VideoEncoder support (Chrome 94+, Edge 94+, Safari 16.4+)');
    }

    this._createCanvas();

    let mp4Module;
    try {
      mp4Module = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm');
    } catch {
      throw new Error('Failed to load MP4 encoder. Check your internet connection.');
    }
    const { Muxer, ArrayBufferTarget } = mp4Module;

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: this.width,
        height: this.height,
      },
      fastStart: 'in-memory',
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder error:', e),
    });

    encoder.configure({
      codec: 'avc1.640028',
      width: this.width,
      height: this.height,
      bitrate: 5_000_000,
      framerate: 30,
    });

    const FRAME_US = 33333; // ~30fps in microseconds
    let frameIndex = 0;
    let step = 0;
    let done = false;

    while (!done) {
      const result = stepAnimation();
      done = result.done;
      step++;

      this.renderFrame(codeDisplay);

      // Hold frame proportional to the configured speed
      const delay = result.delay || 33;
      const holdFrames = Math.max(1, Math.round(delay / 33));

      for (let f = 0; f < holdFrames; f++) {
        const frame = new VideoFrame(this.canvas, {
          timestamp: frameIndex * FRAME_US,
          duration: FRAME_US,
        });
        encoder.encode(frame, { keyFrame: frameIndex % 60 === 0 });
        frame.close();
        frameIndex++;
      }

      if (onProgress && totalLength > 0) {
        onProgress(Math.min(step / totalLength, 1));
      }

      // Yield to UI thread periodically
      if (step % 10 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Hold final frame for 0.5s
    for (let i = 0; i < 15; i++) {
      const frame = new VideoFrame(this.canvas, {
        timestamp: frameIndex * FRAME_US,
        duration: FRAME_US,
      });
      encoder.encode(frame, { keyFrame: false });
      frame.close();
      frameIndex++;
    }

    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code-animation.mp4';
    a.click();
    URL.revokeObjectURL(url);
  }
}
