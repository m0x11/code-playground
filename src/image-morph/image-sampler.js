// Image → particle-target sampling for the Image Morph tab.
//
// Each image is fitted into the display box (contain, times a fit factor),
// rasterized at up to 2× supersampling, and scored per pixel by one of four
// "ink" measures: dark pixels, light pixels, alpha, or Sobel edges. Points
// are drawn from pixels above the threshold — uniformly, or weighted by
// how far above it they sit, so a photo's tones become particle density
// like a stipple. Points are centered on the fitted image, in css px, the
// same contract as the LaTeX line sampler, so the particle engine takes
// them unchanged. Optionally each point carries its source pixel's color.

const MAX_RASTER = 1800; // long side of the analysis raster, px
let nextId = 1;

export async function loadImageBlob(blob, name = 'image') {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { id: nextId++, name, blob, url, img };
}

export function sampleImagePoints(img, {
  boxW, boxH, fit = 0.8, mode = 'dark', threshold = 0.3, weighted = true,
  maxPoints, withColors = false,
}) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih || boxW <= 0 || boxH <= 0) return null;
  const s = Math.min(boxW / iw, boxH / ih) * fit;
  const w = Math.max(1, iw * s), h = Math.max(1, ih * s);
  const rs = Math.min(2, MAX_RASTER / Math.max(w, h));
  const W = Math.max(1, Math.round(w * rs)), H = Math.max(1, Math.round(h * rs));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const data = g.getImageData(0, 0, W, H).data;
  const N = W * H;
  const ink = new Float32Array(N);

  if (mode === 'edges') {
    const lum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      lum[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) * data[o + 3] / 255;
    }
    let max = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = -lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1]
          + lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1];
        const gy = -lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1]
          + lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1];
        const m = Math.hypot(gx, gy);
        ink[i] = m;
        if (m > max) max = m;
      }
    }
    if (max > 0) for (let i = 0; i < N; i++) ink[i] = ink[i] / max * 255;
  } else {
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const a = data[o + 3] / 255;
      const lum = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      ink[i] = mode === 'alpha' ? a * 255 : mode === 'light' ? lum * a : (255 - lum) * a;
    }
  }

  // Candidate pixels above the threshold, with a cumulative weight table
  // for tone-weighted draws.
  const thr = threshold * 255;
  const idx = new Int32Array(N);
  const cum = weighted ? new Float64Array(N) : null;
  let count = 0, total = 0;
  for (let i = 0; i < N; i++) {
    const v = ink[i];
    if (v > thr) {
      idx[count] = i;
      if (cum) { total += v - thr; cum[count] = total; }
      count++;
    }
  }
  if (!count) return null;

  const n = Math.min(maxPoints, count);
  const points = new Float32Array(n * 2);
  const colors = withColors ? new Uint8Array(n * 3) : null;
  for (let k = 0; k < n; k++) {
    let j;
    if (cum) {
      const r = Math.random() * total;
      let lo = 0, hi = count - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < r) lo = mid + 1; else hi = mid;
      }
      j = lo;
    } else {
      j = Math.floor(Math.random() * count);
    }
    const pi = idx[j], px = pi % W, py = (pi - px) / W;
    points[k * 2] = (px + Math.random()) / rs - w / 2;
    points[k * 2 + 1] = (py + Math.random()) / rs - h / 2;
    if (colors) {
      const o = pi * 4;
      colors[k * 3] = data[o];
      colors[k * 3 + 1] = data[o + 1];
      colors[k * 3 + 2] = data[o + 2];
    }
  }
  return { points, colors, w, h };
}

// A few flat silhouettes (black on transparent) so the tab has something to
// morph before the user adds their own images.
export async function makeDemoShapes() {
  const S = 512;
  const shapes = [
    ['circle', g => { g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); }],
    ['ring', g => {
      g.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
      g.moveTo(S / 2 + S * 0.28, S / 2);
      g.arc(S / 2, S / 2, S * 0.28, 0, Math.PI * 2, true);
    }],
    ['star', g => {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? S * 0.18 : S * 0.44;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
      }
      g.closePath();
    }],
    ['heart', g => {
      const x = S / 2, y = S * 0.3;
      g.moveTo(x, y + S * 0.14);
      g.bezierCurveTo(x, y, x - S * 0.44, y - S * 0.02, x - S * 0.44, y + S * 0.22);
      g.bezierCurveTo(x - S * 0.44, y + S * 0.44, x, y + S * 0.56, x, y + S * 0.64);
      g.bezierCurveTo(x, y + S * 0.56, x + S * 0.44, y + S * 0.44, x + S * 0.44, y + S * 0.22);
      g.bezierCurveTo(x + S * 0.44, y - S * 0.02, x, y, x, y + S * 0.14);
      g.closePath();
    }],
    ['triangle', g => {
      g.moveTo(S / 2, S * 0.08);
      g.lineTo(S * 0.92, S * 0.9);
      g.lineTo(S * 0.08, S * 0.9);
      g.closePath();
    }],
  ];
  const out = [];
  for (const [name, path] of shapes) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.beginPath();
    path(g);
    g.fill('evenodd');
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    out.push({ name: `${name}.png`, blob });
  }
  return out;
}
