/**
 * The correlation curves, with this wall on them.
 *
 * Drawn as inline SVG rather than on a canvas, for two reasons: it prints at
 * the resolution of the printer rather than of the screen, and a reader who
 * saves the report keeps a drawing that can be reopened and measured.
 *
 * The chart is the honest form of the estimate. A table cell saying
 * "1.64 to 2.78 MPa" invites the eye to average the two; the same pair drawn
 * as a band between two curves shows what it is, which is the width of what is
 * known about a wall seen in a photograph.
 */

import { CURVES } from '../core/correlate.js';

const W = 340;
const H = 200;
const PAD = { left: 46, right: 12, top: 12, bottom: 30 };

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * One property against the index.
 *
 *   id        which curve: 'fm', 'tau0' or 'E'
 *   mqi       the index this wall was read at, or [low, high] when the survey
 *             is incomplete and the index is itself only known to a range
 *   band      the code table range, drawn as a horizontal strip when given
 */
export function correlationChart(id, { mqi = null, band = null, label = '' } = {}) {
  const curve = CURVES[id];
  if (!curve) return '';

  const xs = [];
  for (let v = 0; v <= 10.0001; v += 0.25) xs.push(Math.round(v * 100) / 100);
  const top = Math.max(curve.max(10), band ? band[1] : 0) * 1.05;

  const px = (v) => PAD.left + (v / 10) * (W - PAD.left - PAD.right);
  const py = (v) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);

  const path = (fn) =>
    xs.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(v).toFixed(1)},${py(fn(v)).toFixed(1)}`).join(' ');

  const area =
    `${path(curve.min)} ` +
    xs
      .slice()
      .reverse()
      .map((v) => `L${px(v).toFixed(1)},${py(curve.max(v)).toFixed(1)}`)
      .join(' ') +
    ' Z';

  const ticksY = niceTicks(top);
  const gridY = ticksY
    .map(
      (v) =>
        `<line x1="${px(0)}" y1="${py(v).toFixed(1)}" x2="${px(10)}" y2="${py(v).toFixed(1)}" ` +
        `class="grid"/><text x="${PAD.left - 6}" y="${(py(v) + 3.5).toFixed(1)}" ` +
        `class="tick" text-anchor="end">${format(v, curve.decimals)}</text>`,
    )
    .join('');

  const gridX = [0, 2, 4, 6, 8, 10]
    .map(
      (v) =>
        `<line x1="${px(v).toFixed(1)}" y1="${py(0)}" x2="${px(v).toFixed(1)}" y2="${PAD.top}" ` +
        `class="grid"/><text x="${px(v).toFixed(1)}" y="${H - PAD.bottom + 14}" class="tick" ` +
        `text-anchor="middle">${v}</text>`,
    )
    .join('');

  const codeBand = band
    ? `<rect x="${px(0)}" y="${py(band[1]).toFixed(1)}" width="${(px(10) - px(0)).toFixed(1)}" ` +
      `height="${Math.max(1, py(band[0]) - py(band[1])).toFixed(1)}" class="codeband"/>`
    : '';

  let here = '';
  if (mqi != null) {
    const range = Array.isArray(mqi) ? mqi : [mqi, mqi];
    const lo = Math.max(0, Math.min(10, range[0]));
    const hi = Math.max(0, Math.min(10, range[1]));
    const x1 = px(lo);
    const x2 = px(hi);
    const yTop = py(curve.max(hi));
    const yBottom = py(curve.min(lo));
    here =
      `<rect x="${x1.toFixed(1)}" y="${yTop.toFixed(1)}" ` +
      `width="${Math.max(2, x2 - x1).toFixed(1)}" height="${Math.max(2, yBottom - yTop).toFixed(1)}" ` +
      `class="here"/>` +
      `<line x1="${x1.toFixed(1)}" y1="${py(0)}" x2="${x1.toFixed(1)}" y2="${yTop.toFixed(1)}" class="drop"/>` +
      (hi > lo
        ? `<line x1="${x2.toFixed(1)}" y1="${py(0)}" x2="${x2.toFixed(1)}" y2="${yTop.toFixed(1)}" class="drop"/>`
        : '');
  }

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(
    `${curve.name} against the masonry quality index`,
  )}">
  <g class="axes">${gridY}${gridX}</g>
  ${codeBand}
  <path d="${area}" class="band"/>
  <path d="${path(curve.min)}" class="curve"/>
  <path d="${path(curve.max)}" class="curve"/>
  ${here}
  <line x1="${px(0)}" y1="${py(0)}" x2="${px(10)}" y2="${py(0)}" class="axis"/>
  <line x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${PAD.top}" class="axis"/>
  <text x="${px(5)}" y="${H - 4}" class="axis-label" text-anchor="middle">MQI</text>
  <text x="10" y="${PAD.top - 2}" class="axis-label">${esc(label || `${curve.symbol} [${curve.unit}]`)}</text>
</svg>`;
}

function niceTicks(top) {
  const raw = top / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function format(v, decimals) {
  if (v === 0) return '0';
  if (decimals === 0) return String(Math.round(v));
  return v.toFixed(Math.min(3, decimals));
}

/**
 * A bar for one index: where it falls between 0 and 10, and which of the three
 * category bands it lands in. Reading three of these side by side is how the
 * difference between the loading conditions becomes visible.
 */
export function categoryBar(direction, { min, max, value, bounds }) {
  const w = 240;
  const h = 34;
  const x = (v) => (v / 10) * w;
  const bands = [
    { from: 0, to: bounds[0], label: 'C' },
    { from: bounds[0], to: bounds[1], label: 'B' },
    { from: bounds[1], to: 10, label: 'A' },
  ];
  const strips = bands
    .map(
      (b) =>
        `<rect x="${x(b.from).toFixed(1)}" y="0" width="${(x(b.to) - x(b.from)).toFixed(1)}" ` +
        `height="12" class="band-${b.label}"/>` +
        `<text x="${((x(b.from) + x(b.to)) / 2).toFixed(1)}" y="9.5" class="band-label" ` +
        `text-anchor="middle">${b.label}</text>`,
    )
    .join('');

  const marker =
    value != null
      ? `<polygon points="${x(value).toFixed(1)},14 ${(x(value) - 5).toFixed(1)},24 ${(
          x(value) + 5
        ).toFixed(1)},24" class="marker"/>` +
        `<text x="${x(value).toFixed(1)}" y="33" class="value" text-anchor="middle">${value}</text>`
      : `<rect x="${x(min).toFixed(1)}" y="15" width="${Math.max(2, x(max) - x(min)).toFixed(1)}" ` +
        `height="8" class="interval"/>` +
        `<text x="${((x(min) + x(max)) / 2).toFixed(1)}" y="33" class="value" ` +
        `text-anchor="middle">${min} to ${max}</text>`;

  return `<svg viewBox="0 0 ${w} ${h}" class="catbar" role="img" aria-label="${esc(
    `${direction}: ${value ?? `${min} to ${max}`}`,
  )}">${strips}${marker}</svg>`;
}
