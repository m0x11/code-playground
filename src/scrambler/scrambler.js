import { populateFontSelect } from '../shared/fonts.js';
import { ScrambleEngine } from './scramble-engine.js';
import { ScrambleRenderer } from './scramble-renderer.js';
import { ScrambleRecorder } from './scramble-recorder.js';

export function initScrambler() {
  // Controls
  const textInput = document.getElementById('scrambleText');
  const fontSelect = document.getElementById('scrambleFont');
  const fontSizeSlider = document.getElementById('scrambleFontSize');
  const fontSizeValue = document.getElementById('scrambleFontSizeValue');
  const poolInput = document.getElementById('scramblePool');
  const modeSelect = document.getElementById('scrambleMode');
  const speedSlider = document.getElementById('scrambleSpeed');
  const speedValue = document.getElementById('scrambleSpeedValue');
  const durationSlider = document.getElementById('scrambleDuration');
  const durationValue = document.getElementById('scrambleDurationValue');
  const charSizeSlider = document.getElementById('scrambleCharSize');
  const charSizeValue = document.getElementById('scrambleCharSizeValue');
  const letterSpacingSlider = document.getElementById('scrambleLetterSpacing');
  const letterSpacingValue = document.getElementById('scrambleLetterSpacingValue');
  const poolPreset = document.getElementById('scramblePoolPreset');
  const colorInput = document.getElementById('scrambleColor');

  const POOL_PRESETS = {
    dot: '⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿',
    ascii: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/~`',
  };
  const playBtn = document.getElementById('scramblePlayBtn');
  const resetBtn = document.getElementById('scrambleResetBtn');
  const recordBtn = document.getElementById('scrambleRecordBtn');
  const recordStatus = document.getElementById('scrambleRecordStatus');

  // Display
  const displayEl = document.getElementById('scramblerDisplay');

  // Populate font selector, default to PP Right Serif Mono
  populateFontSelect(fontSelect);
  fontSelect.value = "'PP Right Serif Mono', monospace";

  // Renderer
  const renderer = new ScrambleRenderer(displayEl);
  const recorder = new ScrambleRecorder();

  let engine = null;
  let animationId = null;

  function getConfig() {
    return {
      text: textInput.value || 'Hello World',
      mode: modeSelect.value,
      pool: poolInput.value,
      duration: parseInt(durationSlider.value),
      speed: parseInt(speedSlider.value),
      fontFamily: fontSelect.value,
      fontSize: parseInt(fontSizeSlider.value),
      scrambleCharSize: parseInt(charSizeSlider.value),
      letterSpacing: parseInt(letterSpacingSlider.value),
      color: colorInput.value,
    };
  }

  function updatePreviewStyle() {
    const config = getConfig();
    renderer.setStyle({
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      scrambleCharSize: config.scrambleCharSize,
      letterSpacing: config.letterSpacing,
      color: config.color,
    });
  }

  function stop() {
    if (animationId) {
      clearTimeout(animationId);
      animationId = null;
    }
  }

  function play() {
    stop();

    const config = getConfig();
    engine = new ScrambleEngine({
      text: config.text,
      mode: config.mode,
      pool: config.pool,
      duration: config.duration,
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
      await recorder.record({
        text: config.text,
        mode: config.mode,
        pool: config.pool,
        duration: config.duration,
        speed: config.speed,
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        color: config.color,
        onProgress: (p) => {
          const pct = Math.round(p * 100);
          recordStatus.textContent = `Recording... ${pct}%`;
        },
      });
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

  // Event listeners
  playBtn.addEventListener('click', play);
  resetBtn.addEventListener('click', reset);
  recordBtn.addEventListener('click', record);

  fontSizeSlider.addEventListener('input', () => {
    fontSizeValue.textContent = fontSizeSlider.value + 'px';
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

  // Initialize display style
  updatePreviewStyle();
}
