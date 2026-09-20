/**
 * Measuring on the photograph.
 *
 * Everything drawn on an image is stored in IMAGE pixels, never in screen
 * pixels: the survey must survive zooming, panning, a different window and a
 * different device. render/photo.js is the only place that knows about the
 * transformation between the two.
 *
 * One measured distance turns pixels into metres, the same idea as the scale
 * of aLOTofImaginArches, and from there the ruler gives block dimensions for
 * SD and the path tool gives the minimum length ratio M_l for WC and VJ.
 */

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Total length of a polyline, in the units of its points. */
export function polylineLength(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** Straight distance between the ends of a path. */
export function chordLength(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  return distance(points[0], points[points.length - 1]);
}

/**
 * The scale of an image: how many image pixels make a metre, established by
 * pointing at two ends of something whose length is known.
 */
export function scaleFrom(a, b, realLength) {
  const px = distance(a, b);
  if (!(px > 0) || !(realLength > 0)) return null;
  return {
    pixelsPerMetre: px / realLength,
    reference: { a: { ...a }, b: { ...b }, length: realLength },
  };
}

/** Image pixels to metres. Returns null when the image has no scale yet. */
export function toMetres(scale, pixels) {
  if (!scale?.pixelsPerMetre) return null;
  return pixels / scale.pixelsPerMetre;
}

/** Metres to image pixels, for drawing something of a known size. */
export function toPixels(scale, metres) {
  if (!scale?.pixelsPerMetre) return null;
  return metres * scale.pixelsPerMetre;
}

/**
 * A measurement, whatever it was drawn for: its length along the path and its
 * length as the crow flies, in pixels and, when the image is scaled, in
 * metres. `ml` is the ratio of the two, which is M_l when the path was drawn
 * through mortar joints between two points and meaningless otherwise -- the
 * caller decides which, by where it puts the measurement.
 */
export function measure(points, scale) {
  const path = polylineLength(points);
  const chord = chordLength(points);
  return {
    points: points.map((p) => ({ x: p.x, y: p.y })),
    pathPixels: path,
    chordPixels: chord,
    pathMetres: toMetres(scale, path),
    chordMetres: toMetres(scale, chord),
    ml: chord > 0 ? Math.round((path / chord) * 1e4) / 1e4 : null,
  };
}

/**
 * Whether the straight distance a path was measured over is long enough for
 * M_l to mean anything. The paper asks for 1 m, and allows down to 0.5 m.
 */
export function checkChord(chordMetres, { preferred = 1.0, minimum = 0.5 } = {}) {
  if (chordMetres == null) {
    return { ok: null, message: 'Scale the photograph to check the length of this measurement.' };
  }
  if (chordMetres < minimum) {
    return {
      ok: false,
      message:
        `The two ends are ${chordMetres.toFixed(2)} m apart. M_l is defined over a straight ` +
        `distance of about ${preferred} m and not below ${minimum} m; over a shorter one it ` +
        'reports the shape of a single joint rather than the texture of the wall.',
    };
  }
  if (chordMetres < preferred) {
    return {
      ok: true,
      message:
        `Measured over ${chordMetres.toFixed(2)} m. The usual distance is ${preferred} m; ` +
        'this is acceptable but shorter.',
    };
  }
  return { ok: true, message: `Measured over ${chordMetres.toFixed(2)} m.` };
}

/**
 * The largest dimension of a set of measured blocks, and how they fall against
 * the 20 cm and 40 cm thresholds of Table 2 -- which are stated as "more than
 * 50% of the elements", so what the table wants is the median.
 */
export function blockStatistics(lengthsMetres) {
  const sizes = lengthsMetres.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sizes.length === 0) return null;
  const mid = Math.floor(sizes.length / 2);
  const median = sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
  const share = (test) => sizes.filter(test).length / sizes.length;
  return {
    count: sizes.length,
    min: sizes[0],
    max: sizes[sizes.length - 1],
    median,
    belowTwenty: share((v) => v < 0.2),
    twentyToForty: share((v) => v >= 0.2 && v <= 0.4),
    aboveForty: share((v) => v > 0.4),
    suggested: median > 0.4 ? 'F' : median >= 0.2 ? 'PF' : 'NF',
  };
}

/**
 * Representative dimensions.
 *
 * The data sheets of the paper carry a row of them -- "s = 10÷13 cm, h = 5÷6
 * cm, l = 24÷32 cm" for a brick -- and they are written the way a surveyor
 * writes them, as a range rather than as a number, because a wall is not made
 * of one block. So they are kept as the text that was typed and parsed only
 * when something wants to reason with them.
 *
 * Accepts "30", "15÷30", "15-30", "15 – 30", "15,5" and "15.5".
 */
export function parseDimension(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? { min: text, max: text, text: String(text) } : null;
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/,/g, '.');
  if (!cleaned) return null;
  const numbers = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const values = numbers.map(Number).filter((v) => Number.isFinite(v) && v >= 0);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values), text: text.trim() };
}

/** The middle of a dimension, which is what a comparison has to use. */
export function midOf(text) {
  const d = parseDimension(text);
  return d ? (d.min + d.max) / 2 : null;
}

/**
 * Table 4, the qualitative column, turned into a reading of two dimensions.
 *
 * The table says "wall thickness similar to the large dimension of the stones"
 * for F, "wall thickness larger than" for PF and "stones small compared with
 * the wall thickness" for NF, and it gives no numbers for similar, larger or
 * small. The thresholds below are therefore an INTERPRETATION and not the
 * paper: similar is read as within a quarter, and small as less than half.
 * They are offered as a suggestion and never assigned.
 */
export const THICKNESS_BANDS = { similar: 1.25, small: 2 };

export function thicknessHint(thicknessText, blockLengthText) {
  const t = midOf(thicknessText);
  const l = midOf(blockLengthText);
  if (!(t > 0) || !(l > 0)) return null;
  const ratio = t / l;
  const say = (outcome, what) => ({
    outcome,
    ratio: Math.round(ratio * 100) / 100,
    text:
      `A wall ${t} cm thick against a largest block dimension of ${l} cm: the thickness is ` +
      `${what}. Table 4 reads that as ${outcome}, on the qualitative column.`,
  });
  if (ratio <= THICKNESS_BANDS.similar) return say('F', 'similar to the block');
  if (ratio <= THICKNESS_BANDS.small) return say('PF', 'larger than the block');
  return say('NF', `${ratio.toFixed(1)} times the block, which makes the stones small`);
}

/**
 * The header count of Section 4: fewer than 2 per square metre is NF, a
 * limited number -- 2 to 5 -- is PF, and a systematic presence, above 4 to 5,
 * is F. The two bands the paper gives overlap; the boundary is taken at 5.
 */
export function headerHint(perSquareMetre) {
  const n = midOf(perSquareMetre);
  if (n == null) return null;
  const outcome = n < 2 ? 'NF' : n <= 5 ? 'PF' : 'F';
  const what =
    outcome === 'NF'
      ? 'fewer than 2 per square metre, which is as good as none'
      : outcome === 'PF'
        ? 'a limited number, 2 to 5 per square metre'
        : 'a systematic presence, above 5 per square metre';
  return { outcome, count: n, text: `${n} headers per square metre: ${what}. Table 4 reads that as ${outcome}.` };
}
