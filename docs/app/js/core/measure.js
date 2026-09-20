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
