/**
 * The correlation curves of Fig. 10, and the comparison with the code table.
 *
 * Table 12 of the paper prints the lower and upper bound of the shear strength
 * at fourteen values of the index, to three decimals. Reproducing all fourteen
 * from the curve coefficients is the check that the coefficients were read off
 * Fig. 10 correctly -- a mistyped digit would show up in the third decimal of
 * some of the rows and nowhere else.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURVES,
  compareWithCode,
  propertiesFor,
  propertiesOver,
  propertyAt,
} from '../docs/app/js/core/correlate.js';
import { rowsOf, withFactors } from '../docs/app/js/core/reference.js';

/** Table 12: MQI, lower bound, upper bound of tau_0 in MPa. */
const TABLE_12 = [
  [0.5, 0.021, 0.033],
  [1.5, 0.027, 0.041],
  [2.5, 0.033, 0.05],
  [3.5, 0.04, 0.061],
  [4, 0.045, 0.067],
  [4.5, 0.05, 0.074],
  [5.5, 0.063, 0.091],
  [6, 0.07, 0.1],
  [6.5, 0.078, 0.11],
  [7.5, 0.096, 0.135],
  [8, 0.108, 0.148],
  [8.5, 0.12, 0.165],
  [9.5, 0.147, 0.201],
  [10, 0.165, 0.222],
];

/**
 * The coefficients are printed on Fig. 10 to four decimal places, so a curve
 * evaluated from them lands within a unit of the last decimal of Table 12, not
 * on it. That unit is the tolerance here, and it is the tolerance of the
 * method: nothing in this application pretends to the third decimal of a shear
 * strength estimated from a photograph.
 */
const LAST_DECIMAL = 0.0011;

test('Table 12 is reproduced, row by row, to the last decimal printed', () => {
  for (const [mqi, low, high] of TABLE_12) {
    const tau = propertyAt('tau0', mqi);
    assert.ok(
      Math.abs(tau.min - low) <= LAST_DECIMAL,
      `MQI ${mqi}: lower bound ${tau.min} against ${low}`,
    );
    assert.ok(
      Math.abs(tau.max - high) <= LAST_DECIMAL,
      `MQI ${mqi}: upper bound ${tau.max} against ${high}`,
    );
  }
});

test('the text of Section 3 is reproduced where it quotes the curves', () => {
  // "for MQI = 1, 0.024 and 0.037"; "for MQI = 8.5 [...] lower and upper bound
  // values are 0.119 and 0.165".
  const close = (got, want, what) =>
    assert.ok(Math.abs(got - want) <= LAST_DECIMAL, `${what}: ${got} against ${want}`);
  const one = propertyAt('tau0', 1);
  close(one.min, 0.024, 'tau_0 lower bound at MQI 1');
  close(one.max, 0.037, 'tau_0 upper bound at MQI 1');
  const high = propertyAt('tau0', 8.5);
  close(high.min, 0.119, 'tau_0 lower bound at MQI 8.5');
  close(high.max, 0.165, 'tau_0 upper bound at MQI 8.5');
});

test('every curve rises with the index', () => {
  for (const id of Object.keys(CURVES)) {
    let previous = -Infinity;
    for (let mqi = 0; mqi <= 10; mqi += 0.5) {
      const p = propertyAt(id, mqi);
      assert.ok(p.min <= p.max, `${id} at ${mqi}: the band is inverted`);
      assert.ok(p.min > previous - 1e-9, `${id} at ${mqi}: the lower bound fell`);
      previous = p.min;
    }
  }
});

test('the lower curve stays below the upper one over the whole range', () => {
  for (let mqi = 0; mqi <= 10; mqi += 0.25) {
    for (const id of Object.keys(CURVES)) {
      const p = propertyAt(id, mqi);
      assert.ok(p.min <= p.max, `${id} at MQI ${mqi}`);
    }
  }
});

test('no properties are offered for an index that is not known', () => {
  assert.equal(propertiesFor(null), null);
  assert.equal(propertiesFor({ V: null, I: 5, O: 5 }), null);
  assert.equal(propertiesFor({ V: 5, I: null, O: 5 }), null, 'tau_0 needs the in-plane index');
});

test('the shear modulus is derived, and says so', () => {
  const p = propertiesFor({ V: 8.5, I: 9, O: 9.5 });
  assert.equal(p.G.derived, true);
  assert.equal(p.G.min, Math.round(p.E.min / 3));
  assert.equal(p.G.max, Math.round(p.E.max / 3));
});

test('an incomplete survey spreads the properties instead of hiding them', () => {
  const spread = propertiesOver({ V: 4, I: 4, O: 4 }, { V: 8, I: 8, O: 8 });
  const low = propertiesFor({ V: 4, I: 4, O: 4 });
  const high = propertiesFor({ V: 8, I: 8, O: 8 });
  assert.equal(spread.spread, true);
  assert.equal(spread.fm.min, low.fm.min);
  assert.equal(spread.fm.max, high.fm.max);
  assert.ok(spread.fm.max > spread.fm.min);
});

test('the estimate is compared with the code table by overlap, not by equality', () => {
  // Fig. 12 is a perfectly cut stone wall, so its estimate meets the dressed
  // ashlar row of the table for compressive strength and for stiffness.
  const p = propertiesFor({ V: 8.5, I: 9, O: 9.5 });
  const dressed = compareWithCode(p, 'dressed-stone');
  const at = (id) => dressed.rows.find((r) => r.id === id);
  assert.equal(at('fm').overlaps, true);
  assert.equal(at('E').overlaps, true);

  // It does not meet it for shear strength, and the comparison says so rather
  // than shrugging: 0.133-0.182 MPa against the 0.090-0.120 of the table. The
  // correlation runs above the code at the top of the scale, which is worth
  // knowing and is why the comparison is in the application at all.
  assert.equal(at('tau0').overlaps, false);
  assert.equal(at('tau0').direction, 'above');
  assert.equal(dressed.agrees, false);

  // The same wall against the poorest row of the table: far above it.
  const irregular = compareWithCode(p, 'irregular-stone');
  assert.equal(irregular.agrees, false);
  assert.equal(irregular.rows.find((r) => r.id === 'fm').direction, 'above');
});

test('a poor wall meets the poor row of the table', () => {
  const p = propertiesFor({ V: 2.5, I: 2.5, O: 2 });
  const irregular = compareWithCode(p, 'irregular-stone');
  assert.equal(irregular.rows.find((r) => r.id === 'fm').overlaps, true);
});

test('an unknown row of the table is refused, not guessed', () => {
  const p = propertiesFor({ V: 5, I: 5, O: 5 });
  assert.equal(compareWithCode(p, 'no-such-typology'), null);
  assert.equal(compareWithCode(null, 'irregular-stone'), null);
});

test('the code table holds the ranges the paper prints', () => {
  const rows = rowsOf();
  assert.equal(rows.length, 6);
  const dressed = rows.find((r) => r.id === 'dressed-stone');
  assert.deepEqual(dressed.fm, [6.0, 8.0]);
  assert.deepEqual(dressed.E, [2400, 3200]);
  assert.equal(dressed.w, 22);
  for (const r of rows) {
    assert.ok(r.fm[0] < r.fm[1] && r.E[0] < r.E[1] && r.tau0[0] < r.tau0[1], r.id);
    assert.ok(r.G[0] <= r.E[0] / 3 + 1 && r.G[1] <= r.E[1] / 3 + 1, `${r.id}: G against E/3`);
  }
});

test('the multiplication factors of Table 11 scale a row', () => {
  const base = rowsOf().find((r) => r.id === 'irregular-stone');
  const improved = withFactors(base, ['good-mortar']);
  assert.deepEqual(improved.fm, [1.5, 2.7]);
  // Thin bed joints scale strength by 1.5 but shear at zero confining stress
  // by 1.25 only.
  const thin = withFactors(base, ['thin-joints']);
  assert.equal(thin.fm[0], 1.5);
  assert.equal(thin.tau0[0], 0.025);
  assert.deepEqual(withFactors(base, []).fm, base.fm);
});
