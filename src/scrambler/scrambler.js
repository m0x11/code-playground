import { populateFontSelect } from '../shared/fonts.js';
import { ScrambleEngine } from './scramble-engine.js';
import { ScrambleRenderer } from './scramble-renderer.js';
import { ScrambleRecorder } from './scramble-recorder.js';

export function initScrambler() {
  // Controls
  const textInput = document.getElementById('scrambleText');
  const slideshowTexts = document.getElementById('scrambleSlideshowTexts');
  const singleTextGroup = document.getElementById('singleTextGroup');
  const slideshowTextGroup = document.getElementById('slideshowTextGroup');
  const fontSelect = document.getElementById('scrambleFont');
  const fontSizeSlider = document.getElementById('scrambleFontSize');
  const fontSizeValue = document.getElementById('scrambleFontSizeValue');
  const charSizeSlider = document.getElementById('scrambleCharSize');
  const charSizeValue = document.getElementById('scrambleCharSizeValue');
  const resolvedLetterSpacingSlider = document.getElementById('scrambleResolvedLetterSpacing');
  const resolvedLetterSpacingValue = document.getElementById('scrambleResolvedLetterSpacingValue');
  const letterSpacingSlider = document.getElementById('scrambleLetterSpacing');
  const letterSpacingValue = document.getElementById('scrambleLetterSpacingValue');
  const poolPreset = document.getElementById('scramblePoolPreset');
  const poolInput = document.getElementById('scramblePool');
  const modeSelect = document.getElementById('scrambleMode');
  const speedSlider = document.getElementById('scrambleSpeed');
  const speedValue = document.getElementById('scrambleSpeedValue');
  const durationSlider = document.getElementById('scrambleDuration');
  const durationValue = document.getElementById('scrambleDurationValue');
  const resolveDelaySlider = document.getElementById('scrambleResolveDelay');
  const resolveDelayValue = document.getElementById('scrambleResolveDelayValue');
  const holdTimeSlider = document.getElementById('scrambleHoldTime');
  const holdTimeValue = document.getElementById('scrambleHoldTimeValue');
  const holdTimeGroup = document.getElementById('holdTimeGroup');
  const colorInput = document.getElementById('scrambleColor');
  const playBtn = document.getElementById('scramblePlayBtn');
  const resetBtn = document.getElementById('scrambleResetBtn');
  const recordBtn = document.getElementById('scrambleRecordBtn');
  const recordStatus = document.getElementById('scrambleRecordStatus');

  // Display
  const displayEl = document.getElementById('scramblerDisplay');

  // Populate font selector, default to PP Right Serif Mono
  populateFontSelect(fontSelect);
  fontSelect.value = "'PP Right Serif Mono', monospace";

  const POOL_PRESETS = {
    dot: '⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿',
    minimalDot: '·.•‧∙◦⋅⸱⸳᛫',
    minimalLine: '—–‐―‑⎯⁃',
    ascii: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/~`',
  };

  // Renderer
  const renderer = new ScrambleRenderer(displayEl);
  const recorder = new ScrambleRecorder();

  let engine = null;
  let animationId = null;
  let slideshowRunning = false;

  function getConfig() {
    const mode = modeSelect.value;
    const text = mode === 'slideshow'
      ? (slideshowTexts.value.split('\n').filter(t => t.trim())[0] || 'Hello World')
      : (textInput.value || 'Hello World');
    return {
      text,
      mode,
      pool: poolInput.value,
      duration: parseInt(durationSlider.value),
      resolveDelay: parseInt(resolveDelaySlider.value),
      speed: parseInt(speedSlider.value),
      fontFamily: fontSelect.value,
      fontSize: parseInt(fontSizeSlider.value),
      scrambleCharSize: parseInt(charSizeSlider.value),
      resolvedLetterSpacing: parseInt(resolvedLetterSpacingSlider.value),
      letterSpacing: parseInt(letterSpacingSlider.value),
      color: colorInput.value,
      holdTime: parseInt(holdTimeSlider.value),
    };
  }

  function updatePreviewStyle() {
    const config = getConfig();
    renderer.setStyle({
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      scrambleCharSize: config.scrambleCharSize,
      resolvedLetterSpacing: config.resolvedLetterSpacing,
      letterSpacing: config.letterSpacing,
      color: config.color,
    });
  }

  function stop() {
    if (animationId) {
      clearTimeout(animationId);
      animationId = null;
    }
    slideshowRunning = false;
  }

  function play() {
    stop();

    if (modeSelect.value === 'slideshow') {
      playSlideshow();
      return;
    }

    const config = getConfig();
    engine = new ScrambleEngine({
      text: config.text,
      mode: config.mode,
      pool: config.pool,
      duration: config.duration,
      resolveDelay: config.resolveDelay,
    });

    renderer.init(config.text.length);
    updatePreviewStyle();

    function tick() {
      const state = engine.step();
      renderer.render(state, config.mode);

      if (!state.done) {
        animationId = setTimeout(tick, config.speed);
      }
    }

    tick();
  }

  function playSlideshow() {
    const lines = slideshowTexts.value.split('\n').filter(t => t.trim());
    if (lines.length === 0) return;

    const config = getConfig();
    slideshowRunning = true;

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function randomChar() {
      return config.pool[Math.floor(Math.random() * config.pool.length)];
    }

    // Resolve from noise to text (first slide only)
    function runInitialResolve(text, cb) {
      if (!slideshowRunning) return;

      engine = new ScrambleEngine({
        text,
        mode: 'longRandomResolve',
        pool: config.pool,
        duration: config.duration,
        resolveDelay: config.resolveDelay,
      });

      renderer.init(text.length);
      updatePreviewStyle();

      function tick() {
        if (!slideshowRunning) return;
        const state = engine.step();
        renderer.render(state, 'longRandomResolve');

        if (!state.done) {
          animationId = setTimeout(tick, config.speed);
        } else {
          cb();
        }
      }

      tick();
    }

    // Crossfade: dissolve out of word A (first half), resolve into word B (second half)
    // Dissolve order mirrors resolve order (reversed) for symmetry
    function runCrossfade(fromText, toText, cb) {
      if (!slideshowRunning) return;

      const maxLen = Math.max(fromText.length, toText.length);
      const from = fromText.padEnd(maxLen);
      const to = toText.padEnd(maxLen);

      // All non-space positions participate
      const indices = [];
      for (let i = 0; i < maxLen; i++) {
        if (to[i] !== ' ' || from[i] !== ' ') {
          indices.push(i);
        }
      }

      shuffle(indices);

      const half = Math.floor(config.duration / 2);

      // Dissolve map (first half): reverse of resolve order
      const dissolveOrder = [...indices].reverse();
      const dissolveMap = new Map();
      for (let i = 0; i < dissolveOrder.length; i++) {
        const t = Math.floor((i / dissolveOrder.length) * half) + 1;
        if (!dissolveMap.has(t)) dissolveMap.set(t, []);
        dissolveMap.get(t).push(dissolveOrder[i]);
      }

      // Resolve map (second half): original order
      const resolveMap = new Map();
      for (let i = 0; i < indices.length; i++) {
        const t = half + Math.floor((i / indices.length) * half) + 1;
        if (!resolveMap.has(t)) resolveMap.set(t, []);
        resolveMap.get(t).push(indices[i]);
      }

      const chars = [...from];
      const resolved = new Array(maxLen).fill(true);

      renderer.init(maxLen);
      updatePreviewStyle();
      renderer.render({ chars: [...chars], resolved: [...resolved], done: false }, 'longRandomResolve');

      let tick = 0;

      function step() {
        if (!slideshowRunning) return;
        tick++;

        // Dissolve: un-resolve characters from word A
        const dGroup = dissolveMap.get(tick);
        if (dGroup) {
          for (const idx of dGroup) {
            resolved[idx] = false;
          }
        }

        // Resolve: lock in characters for word B
        const rGroup = resolveMap.get(tick);
        if (rGroup) {
          for (const idx of rGroup) {
            resolved[idx] = true;
            chars[idx] = to[idx];
          }
        }

        // Scramble all unresolved
        for (let i = 0; i < maxLen; i++) {
          if (!resolved[i]) {
            chars[i] = randomChar();
          }
        }

        const done = tick >= config.duration;
        renderer.render({ chars: [...chars], resolved: [...resolved], done }, 'longRandomResolve');

        if (!done) {
          animationId = setTimeout(step, config.speed);
        } else {
          for (let i = 0; i < maxLen; i++) {
            chars[i] = to[i];
            resolved[i] = true;
          }
          renderer.render({ chars: [...chars], resolved: [...resolved], done: true }, 'longRandomResolve');
          cb();
        }
      }

      animationId = setTimeout(step, config.speed);
    }

    // Slideshow loop: resolve first, then crossfade between subsequent texts
    function holdThenNext(index) {
      if (!slideshowRunning) return;
      animationId = setTimeout(() => {
        if (!slideshowRunning) return;
        const nextIndex = (index + 1) % lines.length;
        runCrossfade(lines[index], lines[nextIndex], () => {
          holdThenNext(nextIndex);
        });
      }, config.holdTime);
    }

    runInitialResolve(lines[0], () => {
      holdThenNext(0);
    });
  }

  function reset() {
    stop();
    renderer.clear();
    engine = null;
  }

  async function record() {
    if (recorder.recording) return;

    const config = getConfig();
    recordBtn.disabled = true;
    recordStatus.textContent = 'Preparing...';
    recordStatus.className = 'record-status recording';

    try {
      if (config.mode === 'slideshow') {
        const lines = slideshowTexts.value.split('\n').filter(t => t.trim());
        await recorder.recordSlideshow({
          texts: lines,
          pool: config.pool,
          duration: config.duration,
          resolveDelay: config.resolveDelay,
          holdTime: config.holdTime,
          speed: config.speed,
          fontFamily: config.fontFamily,
          fontSize: config.fontSize,
          scrambleCharSize: config.scrambleCharSize,
          resolvedLetterSpacing: config.resolvedLetterSpacing,
          letterSpacing: config.letterSpacing,
          color: config.color,
          onProgress: (p) => {
            const pct = Math.round(p * 100);
            recordStatus.textContent = `Recording... ${pct}%`;
          },
        });
      } else {
        await recorder.record({
          text: config.text,
          mode: config.mode,
          pool: config.pool,
          duration: config.duration,
          resolveDelay: config.resolveDelay,
          speed: config.speed,
          fontFamily: config.fontFamily,
          fontSize: config.fontSize,
          scrambleCharSize: config.scrambleCharSize,
          resolvedLetterSpacing: config.resolvedLetterSpacing,
          letterSpacing: config.letterSpacing,
          color: config.color,
          onProgress: (p) => {
            const pct = Math.round(p * 100);
            recordStatus.textContent = `Recording... ${pct}%`;
          },
        });
      }
      recordStatus.textContent = 'Download started!';
      recordStatus.className = 'record-status';
    } catch (err) {
      recordStatus.textContent = 'Recording failed: ' + err.message;
      recordStatus.className = 'record-status';
    }

    recordBtn.disabled = false;
    setTimeout(() => {
      recordStatus.textContent = '';
    }, 3000);
  }

  // Show/hide mode-specific controls
  function updateModeUI() {
    const mode = modeSelect.value;
    const isSlideshow = mode === 'slideshow';

    singleTextGroup.style.display = isSlideshow ? 'none' : '';
    slideshowTextGroup.style.display = isSlideshow ? '' : 'none';
    holdTimeGroup.style.display = isSlideshow ? '' : 'none';
  }

  // Event listeners
  playBtn.addEventListener('click', play);
  resetBtn.addEventListener('click', reset);
  recordBtn.addEventListener('click', record);

  modeSelect.addEventListener('change', updateModeUI);

  fontSizeSlider.addEventListener('input', () => {
    fontSizeValue.textContent = fontSizeSlider.value + 'px';
    updatePreviewStyle();
  });

  resolvedLetterSpacingSlider.addEventListener('input', () => {
    resolvedLetterSpacingValue.textContent = resolvedLetterSpacingSlider.value + 'px';
    updatePreviewStyle();
  });

  charSizeSlider.addEventListener('input', () => {
    charSizeValue.textContent = charSizeSlider.value + 'px';
    updatePreviewStyle();
  });

  letterSpacingSlider.addEventListener('input', () => {
    letterSpacingValue.textContent = letterSpacingSlider.value + 'px';
    updatePreviewStyle();
  });

  speedSlider.addEventListener('input', () => {
    speedValue.textContent = speedSlider.value + 'ms';
  });

  durationSlider.addEventListener('input', () => {
    durationValue.textContent = durationSlider.value;
  });

  resolveDelaySlider.addEventListener('input', () => {
    resolveDelayValue.textContent = resolveDelaySlider.value;
  });

  holdTimeSlider.addEventListener('input', () => {
    holdTimeValue.textContent = holdTimeSlider.value + 'ms';
  });

  poolPreset.addEventListener('change', () => {
    const preset = poolPreset.value;
    if (POOL_PRESETS[preset]) {
      poolInput.value = POOL_PRESETS[preset];
    }
  });

  poolInput.addEventListener('input', () => {
    poolPreset.value = 'custom';
  });

  [fontSelect, colorInput].forEach(el => {
    el.addEventListener('change', updatePreviewStyle);
  });

  // Initialize
  updateModeUI();
  updatePreviewStyle();
}
