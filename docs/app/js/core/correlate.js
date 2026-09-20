/**
 * From the index to the mechanical parameters.
 *
 * Section 3 of the paper fits an exponential to each of the three mechanical
 * parameters of the code table against the MQI of the 36 virtual wall panels,
 * twice: once through the lower bound of each range and once through the
 * upper. The six curves annotated on Fig. 10 are transcribed below exactly as
 * they are printed, and the estimate they give is a RANGE, never a single
 * number -- the scatter is the result, not a nuisance to be averaged away.
 *
 *   f_m   = 0.9370 e^(0.2232 MQI)   to   1.6882 e^(0.1988 MQI)    [MPa]
 *   tau_0 = 1.8913 e^(0.2168 MQI)   to   3.0253 e^(0.1992 MQI)    [10^-2 MPa]
 *   E     = 548.31 e^(0.1738 MQI)   to   821.24 e^(0.1634 MQI)    [MPa]
 *
 * WHICH INDEX GOES INTO WHICH CURVE.
 *
 * The abscissa of all three panels of Fig. 10 is labelled "MQI value (vertical
 * actions)", but the paper's own worked examples do not use the vertical index
 * for the shear strength, they use the IN-PLANE one:
 *
 *   Fig. 12   MQI = 8.5 / 9.0 / 9.5 (V/I/O). Printed f_m 6.25-9.15 and
 *             E 2400-3290, which are the curves at 8.5; printed tau_0
 *             0.133-0.182, which is the curve at 9.0, not at 8.5 (the text
 *             itself gives 0.119-0.165 for MQI = 8.5).
 *   Fig. 13   brick wall, class A out-of-plane and class C in-plane, printed
 *             tau_0 0.021-0.034: the curve at MQI = 0.5, which can only be the
 *             in-plane index, since a class A out-of-plane index is above 7.
 *   Fig. 14   random stone wall, class C in-plane, printed tau_0 0.033-0.050:
 *             the curve at MQI = 2.5.
 *
 * Three examples agreeing is a rule, not a slip, and it is the physically
 * sensible one: shear strength is what governs the in-plane response. So this
 * module takes f_m and E from the vertical index and tau_0 from the in-plane
 * index, and `tau0From` can be set to 'V' for anyone who would rather follow
 * the axis label of Fig. 10b.
 *
 * Checks this file is held to, in tests/correlate.test.js: the three worked
 * examples above, and the fourteen rows of Table 12, whose published lower and
 * upper bounds of tau_0 it reproduces to the three decimals they are printed
 * with.
 */

import { edition, row, withFactors } from './reference.js';

const exp = (a, b) => (mqi) => a * Math.exp(b * mqi);

export const CURVES = {
  fm: {
    id: 'fm',
    symbol: 'fₘ',
    name: 'Compressive strength',
    unit: 'MPa',
    min: exp(0.937, 0.2232),
    max: exp(1.6882, 0.1988),
    printed: ['y = 0.937 e^0.2232x', 'y = 1.6882 e^0.1988x'],
    decimals: 2,
  },
  tau0: {
    id: 'tau0',
    symbol: 'τ₀',
    name: 'Shear strength',
    unit: 'MPa',
    // Fig. 10b is plotted in units of 10^-2 MPa; the curves are brought to MPa
    // here so that nothing downstream has to remember the factor.
    min: exp(0.018913, 0.2168),
    max: exp(0.030253, 0.1992),
    printed: ['y = 1.8913 e^0.2168x', 'y = 3.0253 e^0.1992x'],
    decimals: 3,
  },
  E: {
    id: 'E',
    symbol: 'E',
    name: 'Young modulus',
    unit: 'MPa',
    min: exp(548.31, 0.1738),
    max: exp(821.24, 0.1634),
    printed: ['y = 548.31 e^0.1738x', 'y = 821.24 e^0.1634x'],
    decimals: 0,
  },
};

/**
 * The shear modulus is not correlated in the paper. Every row of the code
 * table except the ashlar one has G exactly E/3, so G is derived rather than
 * fitted, and is marked as derived wherever it is shown.
 */
export const G_OVER_E = 1 / 3;

const roundTo = (x, n) => Number(x.toFixed(n));

/** One property, as a range, for a value of the MQI for vertical actions. */
export function propertyAt(id, mqiV) {
  const curve = CURVES[id];
  if (!curve || mqiV == null || !Number.isFinite(mqiV)) return null;
  return {
    id,
    name: curve.name,
    symbol: curve.symbol,
    unit: curve.unit,
    min: roundTo(curve.min(mqiV), curve.decimals),
    max: roundTo(curve.max(mqiV), curve.decimals),
    derived: false,
  };
}

/** Which index each curve is read at. See the note at the head of the file. */
export const SOURCE = { fm: 'V', E: 'V', tau0: 'I' };

const shearModulus = (E) => ({
  id: 'G',
  name: 'Shear modulus',
  symbol: 'G',
  unit: 'MPa',
  min: Math.round(E.min * G_OVER_E),
  max: Math.round(E.max * G_OVER_E),
  derived: true,
  note: 'Derived as E/3, the ratio held by the code table, not fitted against the MQI.',
});

/**
 * All four properties for a completed survey.
 *
 * `mqi` is an object with the index for each loading condition, {V, I, O}, as
 * produced by assess(). When the survey is incomplete the indices are null and
 * this returns null: an estimate of the compressive strength of a wall whose
 * index is only known to within 6 points is not an estimate.
 */
export function propertiesFor(mqi, { tau0From = SOURCE.tau0 } = {}) {
  if (!mqi) return null;
  const v = mqi.V;
  const s = mqi[tau0From];
  if (v == null || s == null || !Number.isFinite(v) || !Number.isFinite(s)) return null;
  const E = propertyAt('E', v);
  return {
    mqi: { ...mqi },
    read: { fm: v, E: v, tau0: s },
    tau0From,
    fm: propertyAt('fm', v),
    tau0: propertyAt('tau0', s),
    E,
    G: shearModulus(E),
  };
}

/**
 * The same when the survey is incomplete and each index is only known to a
 * range: the lowest lower bound and the highest upper bound over it. Marked
 * `spread`, so that a report never presents it as if it were an estimate.
 */
export function propertiesOver(low, high, { tau0From = SOURCE.tau0 } = {}) {
  const a = propertiesFor(low, { tau0From });
  const b = propertiesFor(high, { tau0From });
  if (!a || !b) return null;
  const merge = (id) => ({ ...a[id], min: a[id].min, max: b[id].max, spread: true });
  return {
    mqi: { low, high },
    spread: true,
    tau0From,
    fm: merge('fm'),
    tau0: merge('tau0'),
    E: merge('E'),
    G: merge('G'),
  };
}

/** Where a value sits relative to a range: below it, inside it, or above it. */
export function place(range, value) {
  if (value < range[0]) return 'below';
  if (value > range[1]) return 'above';
  return 'inside';
}

/**
 * The estimate against a row of the code table.
 *
 * Overlap, not equality, is the question: the correlation gives a band and the
 * table gives a band, and what matters is whether the two bands meet. When
 * they do not, either the declared typology or the survey is wrong, and the
 * report says which way the disagreement runs.
 */
export function compareWithCode(properties, rowId, { editionId, factors = [] } = {}) {
  if (!properties) return null;
  const base = row(rowId, editionId);
  if (!base) return null;
  const reference = withFactors(base, factors);

  const one = (id, key = id) => {
    const estimate = properties[id];
    const band = reference[key];
    const overlaps = estimate.min <= band[1] && estimate.max >= band[0];
    return {
      id,
      name: estimate.name,
      unit: estimate.unit,
      estimate: [estimate.min, estimate.max],
      reference: band,
      overlaps,
      direction: overlaps ? 'inside' : estimate.min > band[1] ? 'above' : 'below',
      derived: Boolean(estimate.derived),
    };
  };

  const rows = [one('fm'), one('tau0'), one('E'), one('G')];
  return {
    edition: edition(editionId),
    row: reference,
    factors,
    rows,
    agrees: rows.filter((r) => !r.derived).every((r) => r.overlaps),
  };
}
