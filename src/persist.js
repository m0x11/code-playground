// App-wide state persistence: every control (inputs, selects, textareas, by
// id) plus the active tab is snapshotted to localStorage and restored on the
// next load.
//
// Restore runs in two passes around module init:
//   1. restoreAppState()  — BEFORE init: raw values, so synchronous initial
//      renders (snowflake, scrambler, latex boot) read the restored state.
//   2. initAppStatePersistence() — AFTER init: re-applies raw values (some
//      selects are populated during init, so pass 1 couldn't set them), then
//      replays each control through its own listeners so labels, previews,
//      and dependent controls sync up, and finally starts saving.
const KEY = 'code-playground-state-v1';

// Preset-loader selects: their 'change' handlers overwrite the user content
// they map onto (latexPreset → latexInput, scramblePoolPreset → scramblePool,
// savedThemesSelect → the color pickers). Restored raw, never replayed.
const NO_REPLAY = new Set(['latexPreset', 'scramblePoolPreset', 'savedThemesSelect']);

function fields() {
  return document.querySelectorAll('input[id], select[id], textarea[id]');
}

function skip(el) {
  return el.type === 'file' || el.type === 'button';
}

function applyValues(state) {
  for (const el of fields()) {
    if (skip(el) || !(el.id in state.fields)) continue;
    const v = state.fields[el.id];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
}

export function restoreAppState() {
  let state = null;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { /* corrupt/blocked */ }
  if (!state || !state.fields) return null;
  applyValues(state);
  return state;
}

export function initAppStatePersistence(state) {
  if (state) {
    applyValues(state); // options added during init exist now

    // Replay through the modules' own listeners. Text fields skip replay:
    // their raw values are already in place, and their input handlers only
    // flip preset selects to "custom" or trigger redundant re-renders.
    for (const el of fields()) {
      if (skip(el) || !(el.id in state.fields) || NO_REPLAY.has(el.id)) continue;
      if (el.tagName === 'TEXTAREA' || el.type === 'text') continue;
      const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.dispatchEvent(new Event(evt));
    }

    // Replayed handlers may have reset preset selects; put saved values back.
    for (const id of NO_REPLAY) {
      const el = document.getElementById(id);
      if (el && id in state.fields) el.value = state.fields[id];
    }

    const tabBtn = state.tab && document.querySelector(`.tab-btn[data-tab="${state.tab}"]`);
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
  }

  // Save a full snapshot (debounced) on any interaction. 'input'/'change'
  // bubble, and the snapshot runs after the modules' own handlers, so values
  // they write into OTHER fields (e.g. a preset filling a textarea) are
  // captured too.
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const f = {};
      for (const el of fields()) {
        if (skip(el)) continue;
        f[el.id] = el.type === 'checkbox' ? el.checked : el.value;
      }
      const active = document.querySelector('.tab-btn.active');
      try {
        localStorage.setItem(KEY, JSON.stringify({ fields: f, tab: active ? active.dataset.tab : null }));
      } catch { /* quota / private mode — persistence is best-effort */ }
    }, 250);
  };
  document.addEventListener('input', save);
  document.addEventListener('change', save);
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', save));
}
