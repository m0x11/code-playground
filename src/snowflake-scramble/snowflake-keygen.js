// Snowflake key generation — mirrors /Users/m/Desktop/keygen/keygen.js exactly.
// 11 floats -> toFixed(3) + join(',') -> SHA-256 seed -> Ed25519 public key
// -> last-32-byte hex (uppercase) -> snowflake ASCII layout.
import * as ed from '@noble/ed25519';

const DECIMAL_PLACES = 3;

// Every value stays < 10 so each renders as a fixed-width "X.XXX" (5 chars) —
// keeps the values line and the whole layout from jumping around as it scrambles.
const MAX_VALUE = 9.999;

// Loose ranges used when scrambling random values. Modelled on real snowflake
// params (spoke counts, radii/positions in a small positive range), all < 10.
export const VALUE_RANGES = [
  [3, 9.999], // numSpokes
  [0, 2],     // t3CenterPosY
  [0, 1.5],   // t3CenterRadius
  [0, 2],     // t3NeighborPosY
  [0, 1.5],   // t3NeighborRadius
  [0, 4],     // rayLength
  [3, 9.999], // secSpokes
  [0, 2],     // secT3CenterPosY
  [0, 1.5],   // secT3CenterRadius
  [0, 2],     // secT3NeighborPosY
  [0, 1.5],   // secT3NeighborRadius
];

export function randomValues() {
  return VALUE_RANGES.map(([lo, hi]) => Math.min(MAX_VALUE, lo + Math.random() * (hi - lo)));
}

export function canonicalize(values) {
  return values.map(v => Number(v).toFixed(DECIMAL_PLACES)).join(',');
}

// Gap rendered between value cells when they wrap into a grid.
export const VALUE_GAP = '   ';

// One fixed-width cell per value ("X.XXX", 5 chars thanks to the < 10 cap).
export function valueCell(v) {
  return Number(v).toFixed(DECIMAL_PLACES);
}

// Human-facing values line: "7.000, 1.300, 0.360, ..."
export function formatValues(values) {
  return values.map(v => Number(v).toFixed(DECIMAL_PLACES)).join(', ');
}

const HEX = '0123456789ABCDEF';
function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15];
  return s;
}

async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

// Real 64-char uppercase public-key hex for a value set.
export async function derivePubHex(values) {
  const canonical = canonicalize(values);
  const seed = await sha256(new TextEncoder().encode(canonical));
  const pub = await ed.getPublicKeyAsync(seed); // 32-byte raw Ed25519 public key
  return bytesToHex(pub);
}

// Slice the 64 hex chars into the snowflake shape (identical widths to keygen.js).
export function layoutKey(hex) {
  let i = 0;
  const s = (n) => { const out = hex.slice(i, i + n); i += n; return out; };
  return [
    `      ${s(5)}             ${s(4)}     ${s(4)}`,
    `   ${s(3)}      ${s(2)}           ${s(2)}       ${s(2)}`,
    `  ${s(5)}   ${s(27)}`,
    `   ${s(3)}      ${s(2)}`,
    `      ${s(5)}`,
  ];
}

const STARS_ROW = ' *  *  *  * ';

// 4 rows of 4 boxes (each [x] or [ ]) with randomized placement, plus a stars row.
// 16 boxes + 4 stars = the 20-cell matrix from keygen.js.
export function randomBoxRows(density = 0.6) {
  const rows = [];
  for (let r = 0; r < 4; r++) {
    let row = '';
    for (let c = 0; c < 4; c++) row += Math.random() < density ? '[x]' : '[ ]';
    rows.push(row);
  }
  rows.push(STARS_ROW);
  return rows;
}

const PAD_WIDTH = 41;

// Split the 11 value cells into rows of at most `perRow` (0 = all on one row).
export function chunkValueRows(values, perRow = 0) {
  const cells = values.map(valueCell);
  const per = perRow > 0 ? Math.min(perRow, cells.length) : cells.length;
  const rows = [];
  for (let i = 0; i < cells.length; i += per) rows.push(cells.slice(i, i + per));
  return rows;
}

// The snowflake key block as text lines (with optional boxes + // prefix).
export async function deriveKeyLines(values, boxRows, opts = {}) {
  const { showBoxes = true, comment = true } = opts;
  const hex = await derivePubHex(values);
  const prefix = comment ? '//  ' : '';
  return layoutKey(hex).map((line, idx) => {
    const body = showBoxes ? line.padEnd(PAD_WIDTH) + (boxRows[idx] || '') : line;
    return prefix + body;
  });
}

// Common LaTeX symbol commands mapped to their glyphs. Anything else is used
// literally (so a pasted "†", "✦", etc. works too). Empty + enabled -> dagger.
const LATEX_GLYPHS = {
  '\\dagger': '†', '\\dag': '†', '\\ddagger': '‡', '\\ddag': '‡',
  '\\star': '⋆', '\\ast': '∗', '\\bullet': '•', '\\circ': '∘',
  '\\times': '×', '\\cdot': '·', '\\diamond': '⋄', '\\diamondsuit': '♦',
  '\\oplus': '⊕', '\\otimes': '⊗', '\\infty': '∞', '\\S': '§', '\\P': '¶',
  '\\spadesuit': '♠', '\\clubsuit': '♣', '\\heartsuit': '♥',
  '\\flat': '♭', '\\sharp': '♯', '\\natural': '♮', '\\cross': '✝', '\\maltese': '✠',
};

// Resolve the symbol input to a glyph, or null when the prefix is disabled.
export function resolveSymbol(input, enabled) {
  if (!enabled) return null;
  const t = (input || '').trim();
  if (!t) return '†';
  return LATEX_GLYPHS[t] || t;
}

// Kept for the standalone text path / tests: full frame as plain text lines.
export async function buildFrameLines(values, boxRows, opts = {}) {
  const { showValues = true, valuesPerRow = 0 } = opts;
  const lines = [];
  if (showValues) {
    for (const row of chunkValueRows(values, valuesPerRow)) lines.push(row.join(VALUE_GAP));
    lines.push('');
  }
  return lines.concat(await deriveKeyLines(values, boxRows, opts));
}
