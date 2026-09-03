// Image Morph tab: the LaTeX animator's particle transition, pointed at
// arbitrary images. Every image is sampled into a particle-target point set
// (see image-sampler.js) and handed to the same LatexParticleEngine that
// morphs equations — same cymatic fields, relic-form interludes, live
// overlay canvas, and MP4 recorder — so the two tabs stay in lockstep.

import { LatexParticleEngine } from '../latex-animator/latex-particles.js';
import { sampleRelicForm } from '../latex-animator/relic-forms.js';
import { LatexAnimatorRecorder } from '../latex-animator/latex-animator-recorder.js';
import { loadImageBlob, sampleImagePoints, makeDemoShapes } from './image-sampler.js';

const IDB_NAME = 'image-morph';
const IDB_STORE = 'kv';
const RELIC_POOL = 8;
const LIVE_CAP = 50000; // particles drawn in the live preview; renders use the full count

// ---- IndexedDB (best effort): the image list survives reloads ----
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export function initImageMorph() {
  const $ = (id) => document.getElementById(id);
  const tab = $('tab-image-morph');
  const display = $('imDisplay');
  const hint = $('imHint');
  const list = $('imList');
  const stats = $('imStats');
  const fileInput = $('imFileInput');
  const addBtn = $('imAddBtn');
  const demoBtn = $('imDemoBtn');
  const clearBtn = $('imClearBtn');

  const themeSel = $('imTheme');
  const colorMode = $('imColorMode');
  const colorInput = $('imColor');
  const fit = $('imFit');
  const sampleMode = $('imSampleMode');
  const threshold = $('imThreshold');
  const weighted = $('imWeighted');

  const partCount = $('imPartCount');
  const partSize = $('imPartSize');
  const partGlow = $('imPartGlow');
  const partBlend = $('imPartBlend');
  const partMorph = $('imPartMorph');
  const partHold = $('imPartHold');
  const partScatter = $('imPartScatter');
  const partIdle = $('imPartIdle');
  const partRamp = $('imPartRamp');
  const partStagger = $('imPartStagger');
  const partCymScale = $('imPartCymScale');
  const partCymSize = $('imPartCymSize');
  const partNoise = $('imPartNoise');
  const partIdleNoise = $('imPartIdleNoise');
  const partPlace = $('imPartPlace');
  const partRelicMode = $('imPartRelicMode');

  const displayHeight = $('imDisplayHeight');
  const renderSize = $('imRenderSize');
  const startBtn = $('imStartBtn');
  const resetBtn = $('imResetBtn');
  const pauseBtn = $('imPauseBtn');
  const recordBtn = $('imRecordBtn');
  const screenshotBtn = $('imScreenshotBtn');
  const recordStatus = $('imRecordStatus');
  const progress = $('imProgress');
  const progressBar = progress.firstElementChild;
  const fabPlay = $('imFabPlay');
  const fabRecord = $('imFabRecord');

  const recorder = new LatexAnimatorRecorder();

  let images = [];      // [{ id, name, blob, url, img }]
  let state = null;     // live run: { canvas, ctx, engine, raf, last, paused }
  let gen = 0;          // bumping this aborts an in-flight sampling pass
  let pending = false;  // start requested while the tab was hidden
  let restartTimer = null;

  // ---- Range labels ----
  const LABELS = {
    imFit: v => `${v}%`,
    imThreshold: v => `${v}%`,
    imPartCount: v => v,
    imPartSize: v => `${parseInt(v) / 10}px`,
    imPartGlow: v => `${v}%`,
    imPartMorph: v => `${v}ms`,
    imPartHold: v => `${v}ms`,
    imPartScatter: v => v,
    imPartIdle: v => Number(v).toFixed(2),
    imPartRamp: v => `${v}%`,
    imPartStagger: v => `${v}%`,
    imPartCymScale: v => `${v}px`,
    imPartCymSize: v => `${v}px`,
    imDisplayHeight: v => `${v}px`,
  };
  for (const [id, fmt] of Object.entries(LABELS)) {
    const el = $(id), out = $(`${id}Value`);
    const sync = () => { out.textContent = fmt(el.value); };
    el.addEventListener('input', sync);
    sync();
  }

  // ---- Styling ----
  function particleColor() {
    return colorMode.value === 'custom' ? colorInput.value : getComputedStyle(display).color;
  }

  function applyStyles() {
    display.className = `code-display image-morph-display theme-${themeSel.value}`;
    display.style.height = `${displayHeight.value}px`;
    display.style.padding = '0';
    // Live preview matches the render aspect: height from the slider, width
    // from the Render Size ratio.
    const [rw, rh] = renderSize.value.split('x').map(Number);
    display.style.aspectRatio = `${rw} / ${rh}`;
    display.style.width = 'auto';
    display.style.maxWidth = '100%';
    display.style.margin = '0 auto';
    display.style.alignSelf = 'center';
    colorInput.parentElement.style.display = colorMode.value === 'custom' ? '' : 'none';
    if (state) state.engine.setColor(particleColor());
  }

  function params() {
    return {
      count: parseInt(partCount.value),
      sizePx: parseInt(partSize.value) / 10,
      glow: parseInt(partGlow.value) / 100,
      blend: partBlend.value,
      morphMs: parseInt(partMorph.value),
      holdMs: parseInt(partHold.value),
      scatter: parseInt(partScatter.value),
      idle: parseFloat(partIdle.value),      // 0–1, fine-grained plate hum
      ramp: parseInt(partRamp.value) / 200,      // slider 0–100 → 0–0.5 of the morph per end
      stagger: parseInt(partStagger.value) / 100, // slider 0–90 → departure spread
      cymScale: parseInt(partCymScale.value),
      cymSize: parseInt(partCymSize.value),
      noise: partNoise.value,
      idleNoise: partIdleNoise.value,            // 'same' or a family for the hum
      linesPer: 1,
      place: partPlace.value,
      relicMode: partRelicMode.value,
    };
  }

  function relicFormRow() {
    return {
      radiusPx: Math.min(display.clientWidth, display.clientHeight) * 0.42,
      rowWidthPx: display.clientWidth * 0.86,
    };
  }

  function area() {
    return { w: display.clientWidth, h: display.clientHeight, lineGap: 0 };
  }

  function updateStats(text) {
    if (text) { stats.textContent = text; return; }
    const n = images.length, count = parseInt(partCount.value);
    const cap = count > LIVE_CAP ? ` (live preview shows ${LIVE_CAP.toLocaleString()})` : '';
    stats.textContent = `${n} image${n === 1 ? '' : 's'} · ${count.toLocaleString()} particles${cap}`;
  }

  // ---- Sampling ----
  async function buildLines(maxPoints, onProgress) {
    const lines = [];
    const opts = {
      boxW: display.clientWidth, boxH: display.clientHeight,
      fit: parseInt(fit.value) / 100,
      mode: sampleMode.value,
      threshold: parseInt(threshold.value) / 100,
      weighted: weighted.checked,
      maxPoints,
      withColors: colorMode.value === 'image',
    };
    for (let i = 0; i < images.length; i++) {
      if (onProgress) onProgress(i + 1, images.length);
      await new Promise(r => setTimeout(r, 0)); // let the label paint
      try {
        const line = sampleImagePoints(images[i].img, opts);
        if (line) lines.push(line);
      } catch { /* one bad image shouldn't sink the run */ }
    }
    return lines;
  }

  async function buildForms(maxPoints, onProgress) {
    if (partRelicMode.value === 'off') return [];
    const radiusPx = relicFormRow().radiusPx;
    const forms = [];
    for (let i = 0; i < RELIC_POOL; i++) {
      if (onProgress) onProgress(i + 1, RELIC_POOL);
      await new Promise(r => setTimeout(r, 0));
      forms.push(sampleRelicForm({ radiusPx, maxPoints }));
    }
    return forms;
  }

  // live: cap the pool for the on-screen preview; renders take every particle.
  async function buildEngine(onProgress, { live = false } = {}) {
    const pp = params();
    if (live) pp.count = Math.min(pp.count, LIVE_CAP);
    const lines = await buildLines(pp.count, (i, n) => onProgress(`sampling ${i}/${n} images`));
    if (!lines.length) return null;
    const forms = await buildForms(pp.count, (i, n) => onProgress(`carving relic form ${i}/${n}`));
    return new LatexParticleEngine({
      lines, count: pp.count, params: pp,
      color: particleColor(),
      forms,
      formRow: relicFormRow(),
      area: area(),
    });
  }

  // ---- Live run ----
  async function start() {
    stop();
    if (!images.length) return;
    if (display.clientWidth === 0) { pending = true; return; } // tab hidden
    pending = false;
    const g = ++gen;
    const engine = await buildEngine((t) => { if (g === gen) updateStats(t); }, { live: true });
    if (g !== gen) return;
    updateStats();
    if (!engine) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'latex-particle-canvas';
    display.appendChild(canvas);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = display.clientWidth * dpr;
    canvas.height = display.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    state = { canvas, ctx, engine, raf: 0, last: performance.now(), paused: false };
    hint.style.display = 'none';
    const frame = (now) => {
      if (!state) return;
      const dt = Math.min(100, now - state.last);
      state.last = now;
      if (!state.paused) {
        state.engine.step(dt);
        const w = display.clientWidth, h = display.clientHeight;
        state.ctx.clearRect(0, 0, w, h);
        state.engine.draw(state.ctx, w / 2, h / 2, 1);
      }
      state.raf = requestAnimationFrame(frame);
    };
    state.raf = requestAnimationFrame(frame);
  }

  function stop() {
    gen++;
    pending = false;
    if (!state) return;
    cancelAnimationFrame(state.raf);
    state.canvas.remove();
    state = null;
    pauseBtn.textContent = 'Pause';
    updateStats();
  }

  function scheduleRestart() {
    if (!state && !pending) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(start, 200);
  }

  // Sampling-time controls need a fresh engine; everything else applies live.
  const RESTART_IDS = ['imPartCount', 'imColorMode', 'imFit', 'imSampleMode', 'imThreshold',
    'imWeighted', 'imPartRelicMode', 'imDisplayHeight', 'imRenderSize'];
  const LIVE_IDS = ['imPartSize', 'imPartGlow', 'imPartBlend', 'imPartMorph', 'imPartHold',
    'imPartScatter', 'imPartIdle', 'imPartRamp', 'imPartStagger', 'imPartCymScale', 'imPartCymSize', 'imPartNoise', 'imPartIdleNoise', 'imPartPlace'];
  for (const id of RESTART_IDS) {
    const el = $(id);
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => { applyStyles(); updateStats(); scheduleRestart(); });
  }
  for (const id of LIVE_IDS) {
    const el = $(id);
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => { if (state) state.engine.setParams(params()); });
  }
  themeSel.addEventListener('change', applyStyles);
  colorInput.addEventListener('input', applyStyles);

  // The display is 0×0 while its tab is hidden; sample once it has a size,
  // and resample when its size changes (the engine's area is fixed).
  new ResizeObserver(() => {
    if (display.clientWidth > 0 && (pending || state)) scheduleRestart();
  }).observe(display);

  // ---- Image list ----
  function renderList() {
    list.innerHTML = '';
    images.forEach((im, i) => {
      const item = document.createElement('div');
      item.className = 'im-item';
      const thumb = document.createElement('img');
      thumb.src = im.url;
      thumb.alt = '';
      const name = document.createElement('span');
      name.className = 'im-name';
      name.textContent = im.name;
      name.title = im.name;
      const mk = (label, title, fn, disabled) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.disabled = !!disabled;
        b.addEventListener('click', fn);
        return b;
      };
      item.append(thumb, name,
        mk('↑', 'Move up', () => move(i, -1), i === 0),
        mk('↓', 'Move down', () => move(i, 1), i === images.length - 1),
        mk('✕', 'Remove', () => remove(i)));
      list.appendChild(item);
    });
  }

  function persistImages() {
    idbSet('images', images.map(im => ({ name: im.name, blob: im.blob }))).catch(() => {});
  }

  function afterChange() {
    renderList();
    updateStats();
    persistImages();
    hint.style.display = images.length ? 'none' : '';
    if (images.length) start(); else stop();
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    [images[i], images[j]] = [images[j], images[i]];
    afterChange();
  }

  function remove(i) {
    URL.revokeObjectURL(images[i].url);
    images.splice(i, 1);
    afterChange();
  }

  async function addBlobs(entries) {
    const loaded = [];
    for (const { blob, name } of entries) {
      try { loaded.push(await loadImageBlob(blob, name)); } catch { /* undecodable — skip */ }
    }
    if (!loaded.length) return;
    images.push(...loaded);
    afterChange();
  }

  function addFiles(fileList) {
    const files = [...(fileList || [])].filter(f => f.type.startsWith('image/'));
    return addBlobs(files.map(f => ({ blob: f, name: f.name })));
  }

  addBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  demoBtn.addEventListener('click', async () => { addBlobs(await makeDemoShapes()); });
  clearBtn.addEventListener('click', () => {
    images.forEach(im => URL.revokeObjectURL(im.url));
    images = [];
    afterChange();
  });

  // Drop anywhere on the tab; paste while the tab is active.
  tab.addEventListener('dragover', (e) => { e.preventDefault(); display.classList.add('im-dragover'); });
  tab.addEventListener('dragleave', () => display.classList.remove('im-dragover'));
  tab.addEventListener('drop', (e) => {
    e.preventDefault();
    display.classList.remove('im-dragover');
    addFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', (e) => {
    if (!tab.classList.contains('active')) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); addFiles(files); }
  });

  // ---- Transport ----
  startBtn.addEventListener('click', start);
  resetBtn.addEventListener('click', () => { stop(); hint.style.display = images.length ? 'none' : ''; });
  pauseBtn.addEventListener('click', () => {
    if (!state) return;
    state.paused = !state.paused;
    if (!state.paused) state.last = performance.now();
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  });

  // ---- Recorder ----
  function applyRenderSize() {
    const [w, h] = renderSize.value.split('x').map(Number);
    recorder.width = w;
    recorder.height = h;
  }

  // Render progress: a bar in the always-visible preview header plus the
  // percentage on the pinned Record button. null hides it.
  function setProgress(p) {
    if (p === null) {
      progress.style.display = 'none';
      fabRecord.textContent = '● Record';
      return;
    }
    progress.style.display = '';
    progressBar.style.width = `${Math.round(p * 100)}%`;
    fabRecord.textContent = `● ${Math.round(p * 100)}%`;
  }

  function renderScale() {
    const r = display.getBoundingClientRect();
    return Math.min(recorder.width / r.width, recorder.height / r.height);
  }

  recordBtn.addEventListener('click', async () => {
    if (!images.length) return;
    recordBtn.disabled = true;
    recordStatus.textContent = 'Preparing...';
    setProgress(0);
    applyRenderSize();
    const wasPlaying = !!state;
    stop();
    try {
      const engine = await buildEngine((t) => { recordStatus.textContent = `${t}...`; });
      if (!engine) throw new Error('No image ink to morph — try another sampling mode');
      await recorder.recordParticles({
        display, engine, scale: renderScale(),
        filename: 'image-morph.mp4',
        onProgress: (p) => {
          recordStatus.textContent = `Recording... ${Math.round(p * 100)}%`;
          setProgress(p);
        },
      });
      recordStatus.textContent = 'Done!';
    } catch (err) {
      recordStatus.textContent = `Recording failed: ${err.message}`;
    }
    setProgress(null);
    setTimeout(() => { recordStatus.textContent = ''; }, 3000);
    recordBtn.disabled = false;
    if (wasPlaying) start();
  });

  // Snapshot the live frame (or, when idle, the first image once settled).
  screenshotBtn.addEventListener('click', async () => {
    if (!images.length) return;
    screenshotBtn.disabled = true;
    recordStatus.textContent = 'Capturing...';
    applyRenderSize();
    try {
      let engine = state && state.engine;
      if (!engine) {
        engine = await buildEngine((t) => { recordStatus.textContent = `${t}...`; });
        if (!engine) throw new Error('No image ink to capture');
        const settle = params().morphMs + 400;
        for (let t = 0; t < settle; t += 33) engine.step(33);
      }
      recorder._createCanvas();
      recorder._fillBackground(getComputedStyle(display));
      engine.draw(recorder.ctx, recorder.width / 2, recorder.height / 2, renderScale());
      const blob = await new Promise(res => recorder.canvas.toBlob(res, 'image/png'));
      recorder._download(blob, 'image-morph.png');
      recordStatus.textContent = 'Saved!';
    } catch (err) {
      recordStatus.textContent = `Screenshot failed: ${err.message}`;
    }
    setTimeout(() => { recordStatus.textContent = ''; }, 3000);
    screenshotBtn.disabled = false;
  });

  fabPlay.addEventListener('click', () => startBtn.click());
  fabRecord.addEventListener('click', () => recordBtn.click());
  new MutationObserver(() => { fabRecord.disabled = recordBtn.disabled; })
    .observe(recordBtn, { attributes: true, attributeFilter: ['disabled'] });

  // ---- Boot ----
  applyStyles();
  updateStats();
  idbGet('images').then(async (saved) => {
    if (!saved || !saved.length || images.length) return;
    const loaded = [];
    for (const rec of saved) {
      try { loaded.push(await loadImageBlob(rec.blob, rec.name)); } catch { /* skip */ }
    }
    if (!loaded.length) return;
    images.unshift(...loaded);
    afterChange();
  }).catch(() => {});
}
