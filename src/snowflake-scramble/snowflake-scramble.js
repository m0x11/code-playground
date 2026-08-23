import {
  randomValues, randomBoxRows, deriveKeyLines, chunkValueRows, resolveSymbol, VALUE_GAP,
} from './snowflake-keygen.js';
import { SnowflakeRecorder } from './snowflake-recorder.js';

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const FONT_FAMILY = "'PP Right Serif Mono', monospace";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Offscreen context for measuring how many value cells fit in a given pixel width.
const measureCtx = document.createElement('canvas').getContext('2d');
function valuesPerRowFor(widthPx, fontSizePx) {
  measureCtx.font = `${fontSizePx}px ${FONT_FAMILY}`;
  const cell = measureCtx.measureText('9.999' + VALUE_GAP).width;
  return Math.max(1, Math.floor(widthPx / cell));
}

export function initSnowflakeScramble() {
  const targetInput = document.getElementById('sfTargetValues');
  const fontSizeSlider = document.getElementById('sfFontSize');
  const fontSizeValue = document.getElementById('sfFontSizeValue');
  const speedSlider = document.getElementById('sfSpeed');
  const speedValue = document.getElementById('sfSpeedValue');
  const durationSlider = document.getElementById('sfDuration');
  const durationValue = document.getElementById('sfDurationValue');
  const densitySlider = document.getElementById('sfDensity');
  const densityValue = document.getElementById('sfDensityValue');
  const valuesWidthSlider = document.getElementById('sfValuesWidth');
  const valuesWidthValue = document.getElementById('sfValuesWidthValue');
  const loopCheck = document.getElementById('sfLoop');
  const showValuesCheck = document.getElementById('sfShowValues');
  const showBoxesCheck = document.getElementById('sfShowBoxes');
  const commentCheck = document.getElementById('sfComment');
  const symbolEnable = document.getElementById('sfSymbolEnable');
  const symbolInput = document.getElementById('sfSymbol');
  const symbolRotate = document.getElementById('sfSymbolRotate');
  const colorInput = document.getElementById('sfColor');
  const bgInput = document.getElementById('sfBg');
  const playBtn = document.getElementById('sfPlayBtn');
  const resetBtn = document.getElementById('sfResetBtn');
  const recordBtn = document.getElementById('sfRecordBtn');
  const recordStatus = document.getElementById('sfRecordStatus');

  const previewEl = document.getElementById('snowflakePreview');
  const displayEl = document.getElementById('snowflakeDisplay');
  const valuesEl = document.getElementById('snowflakeValues');
  const keyEl = document.getElementById('snowflakeKey');

  const recorder = new SnowflakeRecorder();
  let genToken = 0;      // bumping this cancels any in-flight animation loop
  let running = false;   // true while a scramble loop is active
  let lastValues = null; // last settled value set, reused for idle re-renders

  function parseTarget(str) {
    const nums = (str || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number);
    return (nums.length === 11 && nums.every(n => !isNaN(n))) ? nums : null;
  }

  function getConfig() {
    const fontSize = parseInt(fontSizeSlider.value);
    const valuesWidth = parseInt(valuesWidthSlider.value);
    return {
      speed: parseInt(speedSlider.value),
      duration: parseInt(durationSlider.value),
      density: parseInt(densitySlider.value) / 100,
      loop: loopCheck.checked,
      target: parseTarget(targetInput.value),
      fontSize,
      color: colorInput.value,
      bg: bgInput.value,
      symbol: resolveSymbol(symbolInput.value, symbolEnable.checked),
      rotate: symbolRotate.checked,
      lineOpts: {
        showValues: showValuesCheck.checked,
        showBoxes: showBoxesCheck.checked,
        comment: commentCheck.checked,
        valuesPerRow: valuesPerRowFor(valuesWidth, fontSize),
      },
    };
  }

  function applyStyle(cfg) {
    displayEl.style.fontFamily = FONT_FAMILY;
    displayEl.style.fontSize = cfg.fontSize + 'px';
    displayEl.style.color = cfg.color;
    previewEl.style.background = cfg.bg;
  }

  function stop() {
    genToken++;
    running = false;
  }

  // Build the values grid DOM (fixed symbol prefix + scrambling number per cell).
  function renderValuesDOM(values, cfg) {
    if (!cfg.lineOpts.showValues) { valuesEl.innerHTML = ''; return; }
    const symHtml = cfg.symbol
      ? `<span class="sf-sym${cfg.rotate ? ' rot' : ''}">${escapeHtml(cfg.symbol)}</span>`
      : '';
    let html = '';
    for (const row of chunkValueRows(values, cfg.lineOpts.valuesPerRow)) {
      html += '<div class="sf-vrow">';
      for (const cell of row) {
        html += `<span class="sf-cell">${symHtml}<span class="sf-num">${cell}</span></span>`;
      }
      html += '</div>';
    }
    valuesEl.innerHTML = html;
  }

  async function paintFrame(values, cfg) {
    const keyLines = await deriveKeyLines(values, randomBoxRows(cfg.density), cfg.lineOpts);
    renderValuesDOM(values, cfg);
    keyEl.textContent = keyLines.join('\n');
  }

  // Draw one static, settled frame. Reuses the last value set (so tweaking width,
  // size, or colours re-wraps/re-styles the SAME key instead of reshuffling it).
  async function renderStatic(reshuffle = false) {
    const cfg = getConfig();
    applyStyle(cfg);
    if (cfg.target) lastValues = cfg.target;
    else if (reshuffle || !lastValues) lastValues = randomValues();
    await paintFrame(lastValues, cfg);
  }

  async function play() {
    stop();
    const myGen = ++genToken;
    running = true;
    const cfg = getConfig();
    applyStyle(cfg);

    let tick = 0;
    while (genToken === myGen) {
      const vals = randomValues();
      const keyLines = await deriveKeyLines(vals, randomBoxRows(cfg.density), cfg.lineOpts);
      if (genToken !== myGen) return;
      renderValuesDOM(vals, cfg);
      keyEl.textContent = keyLines.join('\n');
      tick++;

      if (!cfg.loop && tick >= cfg.duration) {
        lastValues = cfg.target || randomValues();
        await paintFrame(lastValues, cfg);
        if (genToken !== myGen) return;
        running = false;
        return;
      }

      await sleep(cfg.speed);
    }
  }

  async function reset() {
    stop();
    await renderStatic(true);
  }

  // Re-render a static frame in response to an idle control change (no-op mid-run).
  function refreshIfIdle() {
    if (!running) renderStatic(false);
  }

  async function record() {
    if (recorder.recording) return;
    stop();
    const cfg = getConfig();
    recordBtn.disabled = true;
    playBtn.disabled = true;
    recordStatus.textContent = 'Preparing…';
    recordStatus.className = 'record-status recording';

    try {
      await recorder.record({
        targetValues: cfg.target,
        duration: cfg.duration,
        speed: cfg.speed,
        density: cfg.density,
        fontSize: cfg.fontSize,
        fontFamily: FONT_FAMILY,
        color: cfg.color,
        bg: cfg.bg,
        showValues: cfg.lineOpts.showValues,
        showBoxes: cfg.lineOpts.showBoxes,
        comment: cfg.lineOpts.comment,
        valuesPerRow: cfg.lineOpts.valuesPerRow,
        symbol: cfg.symbol,
        rotate: cfg.rotate,
        stamp: String(Date.now()),
        onProgress: (p) => {
          recordStatus.textContent = `Recording… ${Math.round(p * 100)}%`;
        },
      });
      recordStatus.textContent = 'Download started!';
      recordStatus.className = 'record-status';
    } catch (err) {
      recordStatus.textContent = 'Recording failed: ' + err.message;
      recordStatus.className = 'record-status';
    }

    recordBtn.disabled = false;
    playBtn.disabled = false;
    setTimeout(() => { recordStatus.textContent = ''; }, 3000);
  }

  // Wire up controls
  playBtn.addEventListener('click', play);
  resetBtn.addEventListener('click', reset);
  recordBtn.addEventListener('click', record);

  fontSizeSlider.addEventListener('input', () => {
    fontSizeValue.textContent = fontSizeSlider.value + 'px';
    displayEl.style.fontSize = fontSizeSlider.value + 'px';
    refreshIfIdle(); // font size changes how many values fit per row
  });
  speedSlider.addEventListener('input', () => {
    speedValue.textContent = speedSlider.value + 'ms';
  });
  durationSlider.addEventListener('input', () => {
    durationValue.textContent = durationSlider.value;
  });
  densitySlider.addEventListener('input', () => {
    densityValue.textContent = densitySlider.value + '%';
  });
  valuesWidthSlider.addEventListener('input', () => {
    valuesWidthValue.textContent = valuesWidthSlider.value + 'px';
    refreshIfIdle();
  });

  // Idle style/content changes re-render a static frame so the effect is visible live.
  [colorInput, bgInput].forEach(el => el.addEventListener('input', () => applyStyle(getConfig())));
  [showValuesCheck, showBoxesCheck, commentCheck, symbolEnable, symbolRotate].forEach(el =>
    el.addEventListener('change', refreshIfIdle));
  [targetInput, symbolInput].forEach(el => el.addEventListener('input', refreshIfIdle));

  // Initial paint
  renderStatic();
}
