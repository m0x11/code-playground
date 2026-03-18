export const FONT_OPTIONS = [
  { label: 'SF Mono / Menlo', value: "ui-monospace, 'SF Mono', Menlo, Monaco, monospace" },
  { label: 'PP Right Serif Mono', value: "'PP Right Serif Mono', monospace" },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
  { label: 'Consolas', value: "Consolas, monospace" },
  { label: 'Monaco', value: "'Monaco', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  { label: 'Roboto Mono', value: "'Roboto Mono', monospace" },
  { label: 'Anonymous Pro', value: "'Anonymous Pro', monospace" },
];

export function populateFontSelect(selectEl) {
  FONT_OPTIONS.forEach(font => {
    const opt = document.createElement('option');
    opt.value = font.value;
    opt.textContent = font.label;
    selectEl.appendChild(opt);
  });
}
