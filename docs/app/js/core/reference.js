/**
 * The code table the estimate is checked against.
 *
 * Table 10 of the paper reproduces the reference values of the Italian code
 * commentary -- IMIT 2009, that is Circolare 617/2009, Table C8A.2.1 -- for
 * six typologies of existing masonry, and Table 11 its multiplication factors.
 * The correlation curves in correlate.js were fitted on 36 "virtual" wall
 * panels built by combining exactly these two tables, so this edition is the
 * one the curves are coherent with, and it is the default.
 *
 * The values hold under the assumptions stated in Section 3: low quality
 * lime-based mortar, no lacing courses, unconnected or badly connected leaves,
 * as-built unreinforced masonry, and a bond pattern following the rules of art.
 *
 * ADDING THE 2019 EDITION. The current commentary (Circolare 7/2019, Table
 * C8.5.I) revises several of these ranges and adds fv0. It is not transcribed
 * here because it is not in the paper, and a table of this kind is worth
 * nothing unless every digit comes from the source. Add it as a second entry
 * of EDITIONS, with the same row ids, and the interface will offer it: nothing
 * else in the application needs to change.
 */

/** kN/m3 for the weight density, MPa for everything else. */
export const EDITIONS = {
  '2009': {
    id: '2009',
    name: 'Circolare 617/2009, Table C8A.2.1',
    short: 'Italian code commentary 2009',
    source: 'Table 10 of Borri et al. (2015), reproducing IMIT (2009)',
    fittedOn: true,
    rows: [
      {
        id: 'irregular-stone',
        name: 'Irregular stone masonry (pebbles, erratic, irregular stones)',
        family: 'stone',
        fm: [1.0, 1.8],
        tau0: [0.02, 0.032],
        E: [690, 1050],
        G: [230, 350],
        w: 19,
      },
      {
        id: 'uncut-stone',
        name: 'Uncut stone masonry with facing walls of limited thickness and infill core',
        family: 'stone',
        fm: [2.0, 3.0],
        tau0: [0.035, 0.051],
        E: [1020, 1440],
        G: [340, 480],
        w: 20,
      },
      {
        id: 'cut-stone',
        name: 'Cut stone with good bonding',
        family: 'stone',
        fm: [2.6, 3.8],
        tau0: [0.056, 0.074],
        E: [1500, 1980],
        G: [500, 660],
        w: 21,
      },
      {
        id: 'soft-stone',
        name: 'Soft stone masonry (tuff, limestone, etc.)',
        family: 'stone',
        fm: [1.4, 2.4],
        tau0: [0.028, 0.042],
        E: [900, 1260],
        G: [300, 420],
        w: 16,
      },
      {
        id: 'dressed-stone',
        name: 'Dressed rectangular (ashlar) stone masonry',
        family: 'stone',
        fm: [6.0, 8.0],
        tau0: [0.09, 0.12],
        E: [2400, 3200],
        G: [780, 940],
        w: 22,
      },
      {
        id: 'solid-brick',
        name: 'Solid brick masonry with lime mortar',
        family: 'brick',
        fm: [2.4, 4.0],
        tau0: [0.06, 0.09],
        E: [1200, 1800],
        G: [400, 600],
        w: 18,
      },
    ],
  },
};

export const DEFAULT_EDITION = '2009';

/** Table 11 -- multiplication factors for masonry differing from the table rows. */
export const FACTORS = [
  { id: 'good-mortar', name: 'Good quality mortar', factor: 1.5 },
  {
    id: 'thin-joints',
    name: 'Thin bed joints',
    factor: 1.5,
    shearFactor: 1.25,
    note: '1.25 for shear strength at zero confining stress.',
  },
  { id: 'headers', name: 'Transverse connections (headers)', factor: 1.3 },
  { id: 'weak-mortar-core', name: 'Weak mortar and/or wide inner core', factor: 0.7 },
  { id: 'injections', name: 'Grout injections', factor: 1.5 },
  { id: 'ferrocement', name: 'Ferrocement', factor: 1.5 },
];

export const FACTOR = Object.fromEntries(FACTORS.map((f) => [f.id, f]));

export function edition(id = DEFAULT_EDITION) {
  return EDITIONS[id] ?? EDITIONS[DEFAULT_EDITION];
}

export function rowsOf(editionId = DEFAULT_EDITION) {
  return edition(editionId).rows;
}

export function row(rowId, editionId = DEFAULT_EDITION) {
  return rowsOf(editionId).find((r) => r.id === rowId) ?? null;
}

/**
 * A table row with the Table 11 factors applied, as the paper did to build its
 * virtual panels. `which` is the list of factor ids; shear uses the factor's
 * own shearFactor where the table gives a different one.
 */
export function withFactors(baseRow, which = []) {
  if (!baseRow) return null;
  let f = 1;
  let fShear = 1;
  for (const id of which) {
    const factor = FACTOR[id];
    if (!factor) continue;
    f *= factor.factor;
    fShear *= factor.shearFactor ?? factor.factor;
  }
  const scale = (range, k) => range.map((v) => Math.round(v * k * 1e6) / 1e6);
  return {
    ...baseRow,
    applied: which,
    fm: scale(baseRow.fm, f),
    tau0: scale(baseRow.tau0, fShear),
    E: scale(baseRow.E, f),
    G: scale(baseRow.G, f),
  };
}
