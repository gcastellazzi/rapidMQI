/**
 * The drawings that stand in for a photograph that cannot be taken.
 *
 * Two of the seven parameters are decided by things a camera usually cannot
 * see. The connection between the leaves is inside the wall, and unless a
 * breach, a reveal or a broken corner exposes a section there is nothing to
 * photograph. The shape of the blocks is visible on the face, but what a block
 * actually IS -- a pebble, a roughly squared lump, a cut ashlar -- is a
 * three-dimensional fact that a flat view of a wall states poorly.
 *
 * So the surveyor draws instead: three diagrams per view, one for each
 * outcome, and picking one is a statement about what the wall is understood to
 * be. It is an inference and not an observation, and everything downstream --
 * the panel, the report -- says so.
 *
 * The geometry is fixed rather than random. A diagram that came out slightly
 * different on every render would look like data.
 */

const INK = 'var(--foreground-soft)';
const STONE = 'var(--surface-muted)';
const THROUGH = 'var(--primary-soft)';
const CORE = 'var(--border)';

const svg = (viewBox, body, label) =>
  `<svg viewBox="${viewBox}" class="sketch" role="img" aria-label="${label}">${body}</svg>`;

// ------------------------------------------------------------------ quotes --

/**
 * A dimension line, drawn the way a drawing board draws one: a line between
 * two ticks with the value sitting on it. The value is whatever the surveyor
 * typed -- "24÷32" as readily as "30" -- because a wall is not made of one
 * block and a range is the honest answer.
 */
const QUOTE = 'var(--muted-foreground)';

function quote(x1, y1, x2, y2, text, { dx = 0, dy = -3.5, rotate = 0, size = 7.5 } = {}) {
  if (!text) return '';
  const ax = x2 - x1;
  const ay = y2 - y1;
  const len = Math.hypot(ax, ay) || 1;
  // The ticks are short strokes across the line, so that the quote reads as a
  // dimension and not as an edge of the thing being measured.
  const tx = (-ay / len) * 3;
  const ty = (ax / len) * 3;
  const mx = (x1 + x2) / 2 + dx;
  const my = (y1 + y2) / 2 + dy;
  const turn = rotate ? ` transform="rotate(${rotate} ${mx} ${my})"` : '';
  return `<g class="quote">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${QUOTE}" stroke-width="0.7"/>
    <line x1="${x1 - tx}" y1="${y1 - ty}" x2="${x1 + tx}" y2="${y1 + ty}" stroke="${QUOTE}" stroke-width="0.7"/>
    <line x1="${x2 - tx}" y1="${y2 - ty}" x2="${x2 + tx}" y2="${y2 + ty}" stroke="${QUOTE}" stroke-width="0.7"/>
    <text x="${mx}" y="${my}" text-anchor="middle" font-size="${size}" fill="${QUOTE}"
      font-family="Arial, Helvetica, sans-serif"${turn}>${esc(text)}</text>
  </g>`;
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const has = (d, id) => typeof d?.[id] === 'string' && d[id].trim().length > 0;

// ------------------------------------------------------------- the section --

/**
 * A cut through the thickness of the wall: the outer face on the left, the
 * inner face on the right, and whatever is between them. A stone that reaches
 * from one face to the other is a header, and headers are the whole question.
 */
const W = 120; // the thickness of the wall, across the drawing
const H = 116;
const ROWS = 7;
const ROW_H = 14;
const TOP = 6;

/** Each row is either a pair of stones with a core between them, or a header. */
const SECTION_ROWS = {
  NF: ['split', 'split', 'split', 'split', 'split', 'split', 'split'],
  PF: ['split', 'header', 'split', 'split', 'header', 'split', 'split'],
  F: ['header', 'split', 'header', 'split', 'header', 'split', 'header'],
};

/** A little variation, fixed, so the leaves do not read as machine-cut. */
const JITTER = [0, 2, -1.5, 1, -2, 1.5, -1];

function sectionBody(outcome) {
  const rows = SECTION_ROWS[outcome];
  const parts = [];

  // The core: loose material between two leaves that are not tied. It is drawn
  // for every case, and simply gets crossed by the headers where there are any.
  if (outcome !== 'F') {
    parts.push(
      `<rect x="${W / 2 - 9}" y="${TOP}" width="18" height="${ROWS * ROW_H}" fill="${CORE}" opacity="0.7"/>`,
    );
  }

  rows.forEach((kind, i) => {
    const y = TOP + i * ROW_H;
    const h = ROW_H - 2.5;
    const j = JITTER[i];
    if (kind === 'header') {
      parts.push(
        `<rect x="6" y="${y}" width="${W - 12}" height="${h}" rx="1.5" fill="${THROUGH}" stroke="${INK}" stroke-width="1.1"/>`,
      );
      return;
    }
    // Two leaves. For NF the joint between them runs dead straight down the
    // middle of the wall, which is the defect the drawing is about; for PF the
    // leaves at least bite into the core a little.
    const bite = outcome === 'NF' ? 0 : 3 + j;
    parts.push(
      `<rect x="6" y="${y}" width="${W / 2 - 15 + bite}" height="${h}" rx="1.5" fill="${STONE}" stroke="${INK}" stroke-width="1.1"/>`,
      `<rect x="${W / 2 + 9 - bite}" y="${y}" width="${W / 2 - 15 + bite}" height="${h}" rx="1.5" fill="${STONE}" stroke="${INK}" stroke-width="1.1"/>`,
    );
  });

  // The two faces of the wall.
  parts.push(
    `<line x1="5" y1="${TOP - 3}" x2="5" y2="${TOP + ROWS * ROW_H + 1}" stroke="${INK}" stroke-width="1.6"/>`,
    `<line x1="${W - 5}" y1="${TOP - 3}" x2="${W - 5}" y2="${TOP + ROWS * ROW_H + 1}" stroke="${INK}" stroke-width="1.6"/>`,
  );
  return parts.join('');
}

// --------------------------------------------------------------- the block --

/**
 * One block, drawn in cabinet projection: the face it shows to the street, the
 * bed it lies on, and the depth it goes back into the wall. What matters is
 * how far it is from a box.
 */
const BX = 14;
const BY = 52;
const BW = 74;
const BH = 38;
const DX = 24;
const DY = -17;

const poly = (points, fill, width = 1.2) =>
  `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="${width}" stroke-linejoin="round"/>`;

function boxBody(jitter) {
  // The eight corners of the block, each pushed off true by a fixed amount.
  const j = (i) => jitter[i] ?? [0, 0];
  const p = (x, y, i) => [Math.round((x + j(i)[0]) * 10) / 10, Math.round((y + j(i)[1]) * 10) / 10];

  const a = p(BX, BY, 0); // front bottom left
  const b = p(BX + BW, BY, 1); // front bottom right
  const c = p(BX + BW, BY - BH, 2); // front top right
  const d = p(BX, BY - BH, 3); // front top left
  const e = p(BX + DX, BY - BH + DY, 4); // back top left
  const f = p(BX + BW + DX, BY - BH + DY, 5); // back top right
  const g = p(BX + BW + DX, BY + DY, 6); // back bottom right

  return [
    poly([d, e, f, c], STONE), // the bed above
    poly([c, f, g, b], CORE), // the side going into the wall
    poly([a, b, c, d], STONE), // the face
  ].join('');
}

/** Perfectly cut: a box, and nothing to say about it. */
const CUT = boxBody([]);

/**
 * Barely cut: recognisably a box, but no two faces parallel and no edge
 * straight. The offsets are large enough to read at the size these are drawn
 * at, which is a thumbnail in a corner of the screen.
 */
const ROUGH = boxBody([
  [-2, 3],
  [3, -2],
  [-3, 3],
  [2, -3],
  [-3, 2],
  [4, 1],
  [2, 3],
]);

/**
 * A pebble. Drawn as one closed curve rather than as a degenerate box, because
 * the point of the NF case is that there are no faces at all: whatever bearing
 * one of these has on the next is a point, not a surface.
 */
const PEBBLE = `
  <path d="M 22 40 C 18 26, 34 14, 54 15 C 76 16, 96 24, 97 40 C 98 55, 80 64, 58 63 C 36 62, 26 54, 22 40 Z"
        fill="${STONE}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M 34 28 C 44 22, 62 22, 72 27" fill="none" stroke="${INK}" stroke-width="0.8" opacity="0.5"/>
  <path d="M 30 48 C 44 56, 70 56, 86 46" fill="none" stroke="${INK}" stroke-width="0.8" opacity="0.5"/>`;

// ------------------------------------------------------------------ export --

export const SKETCHES = {
  section: {
    view: 'section',
    parameter: 'WC',
    title: 'The section this wall is understood to be',
    options: [
      {
        outcome: 'NF',
        title: 'Two leaves, unconnected',
        caption: 'No headers. A straight joint runs down the middle, with loose infill.',
      },
      {
        outcome: 'PF',
        title: 'Some headers',
        caption: 'Two leaves that bite into the core, tied here and there: 2 to 5 per square metre.',
      },
      {
        outcome: 'F',
        title: 'Systematic headers',
        caption: 'Stones reaching from face to face, course after course. One wall, not two.',
      },
    ],
  },
  block: {
    view: 'block',
    parameter: 'SS',
    title: 'The shape these blocks are',
    options: [
      {
        outcome: 'NF',
        title: 'Rubble, rounded or pebble',
        caption: 'No faces: whatever bearing one has on the next is a point.',
      },
      {
        outcome: 'PF',
        title: 'Barely squared',
        caption: 'Recognisably a block, but no two faces parallel. Often with pinning stones.',
      },
      {
        outcome: 'F',
        title: 'Cut stone or brick',
        caption: 'Flat beds and square ends: one block bears on the next across a surface.',
      },
    ],
  },
};

const BLOCK_BODY = { NF: PEBBLE, PF: ROUGH, F: CUT };

/**
 * The drawing for one view and one outcome, as inline SVG, with the
 * representative dimensions quoted on it when there are any.
 *
 * The drawing grows to make room for the quotes rather than squeezing them in:
 * a thumbnail with no dimensions keeps the tight box it was designed in.
 */
export function sketchSVG(view, outcome, dimensions = null) {
  if (!outcome) return '';
  if (view === 'section') {
    const t = has(dimensions, 't');
    const base = TOP + ROWS * ROW_H;
    const body = sectionBody(outcome) + (t ? quote(5, base + 9, W - 5, base + 9, `t = ${dimensions.t} cm`, { dy: 9 }) : '');
    return svg(t ? `0 0 ${W} ${H + 22}` : `0 0 ${W} ${H}`, body, `Wall section, ${outcome}`);
  }
  if (view === 'block') {
    const quotes = [
      has(dimensions, 'l')
        ? quote(BX, BY + 10, BX + BW, BY + 10, `l ${dimensions.l}`, { dy: 9 })
        : '',
      // Read bottom to top, the way a drawing board writes a height.
      has(dimensions, 'h')
        ? quote(BX - 8, BY, BX - 8, BY - BH, `h ${dimensions.h}`, { dx: -4, dy: 0, rotate: -90 })
        : '',
      has(dimensions, 's')
        ? quote(BX + 5, BY - BH - 7, BX + DX + 5, BY - BH + DY - 7, `s ${dimensions.s}`, {
            // The depth line is short and the label is not, so the label is
            // pushed clear of it rather than sitting across its ticks.
            dx: -15,
            dy: -8,
          })
        : '',
    ].join('');
    const any = quotes.length > 0;
    return svg(
      any ? '-14 -20 148 100' : '0 0 120 78',
      BLOCK_BODY[outcome] + quotes,
      `Typical block, ${outcome}`,
    );
  }
  return '';
}

/** What a chosen sketch says, in one line, for the panel and for the report. */
export function sketchCaption(view, outcome) {
  const option = SKETCHES[view]?.options.find((o) => o.outcome === outcome);
  return option ? `${option.title}. ${option.caption}` : '';
}
