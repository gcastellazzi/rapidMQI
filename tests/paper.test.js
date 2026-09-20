/**
 * The published worked examples, reproduced.
 *
 * Borri et al. (2015) print three complete data sheets -- Figs. 12, 13 and 14
 * -- each giving the seven outcomes, the three indices, the three categories
 * and the mechanical properties. They are the only end-to-end check of this
 * application that does not come from this application, so they are its most
 * valuable tests.
 *
 * ONE OF THE THREE DOES NOT ADD UP, AND IT IS NOT THIS CODE.
 *
 * Fig. 12 and Fig. 14 are reproduced exactly, index by index. Fig. 13, the
 * header-bond brick wall, is reproduced exactly for out-of-plane actions and
 * not at all for the other two: its printed outcomes give 6.5 for vertical and
 * 5.5 for in-plane through Eq. (1), while the sheet prints 1.3 and 0.55. The
 * figure is internally consistent about those two numbers -- its f_m, E and
 * tau_0 are the correlation curves read at 1.3 and 0.55, and its categories C
 * and C follow from them -- so the disagreement is upstream of the index, in
 * the outcomes row or in a step not stated. It is recorded here rather than
 * accommodated: nothing in the application bends to make it come out.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { assess } from '../docs/app/js/core/mqi.js';
import { propertiesFor } from '../docs/app/js/core/correlate.js';

/** Fig. 12 -- perfectly cut stone masonry, Perugia. */
const FIG12 = {
  outcomes: { WC: 'F', MM: 'PF', SS: 'F', VJ: 'F', SM: 'F', HJ: 'F', SD: 'F' },
  mqi: { V: 8.5, O: 9.5, I: 9.0 },
  category: { V: 'A', O: 'A', I: 'A' },
  fm: [6.25, 9.15],
  E: [2400, 3290],
  tau0: [0.133, 0.182],
};

/** Fig. 13 -- single-leaf brick wall, header bond. */
const FIG13 = {
  outcomes: { WC: 'F', MM: 'NF', SS: 'F', VJ: 'NF', SM: 'F', HJ: 'F', SD: 'PF' },
  mqi: { V: 1.3, O: 7.5, I: 0.55 },
  category: { V: 'C', O: 'A', I: 'C' },
  fm: [1.25, 2.19],
  E: [687, 1016],
  tau0: [0.021, 0.034],
};

/** Fig. 14 -- double-leaf un-coursed calcareous stone wall. */
const FIG14 = {
  outcomes: { WC: 'NF', MM: 'PF', SS: 'PF', VJ: 'NF', SM: 'F', HJ: 'NF', SD: 'PF' },
  mqi: { V: 2.5, O: 2, I: 2.5 },
  category: { V: 'B', O: 'C', I: 'C' },
  fm: [1.64, 2.78],
  E: [847, 1236],
  tau0: [0.033, 0.05],
};

const indices = (sheet) => {
  const result = assess(sheet.outcomes);
  return { V: result.V.value, I: result.I.value, O: result.O.value };
};

test('Fig. 12: the index, for all three loading conditions', () => {
  assert.deepEqual(indices(FIG12), { V: 8.5, I: 9.0, O: 9.5 });
});

test('Fig. 12: the categories', () => {
  const result = assess(FIG12.outcomes);
  for (const d of ['V', 'I', 'O']) {
    assert.equal(result[d].category.label, FIG12.category[d]);
    assert.equal(result[d].category.certain, true);
  }
});

test('Fig. 12: the mechanical properties', () => {
  const p = propertiesFor(indices(FIG12));
  assert.deepEqual([p.fm.min, p.fm.max], FIG12.fm);
  assert.deepEqual([p.tau0.min, p.tau0.max], FIG12.tau0);
  // The sheet rounds E to the nearest ten; the curves give 2402 and 3294.
  assert.ok(Math.abs(p.E.min - FIG12.E[0]) <= 5, `E min ${p.E.min}`);
  assert.ok(Math.abs(p.E.max - FIG12.E[1]) <= 5, `E max ${p.E.max}`);
});

test('Fig. 14: the index, the categories and the properties', () => {
  assert.deepEqual(indices(FIG14), { V: 2.5, I: 2.5, O: 2 });
  const result = assess(FIG14.outcomes);
  for (const d of ['V', 'I', 'O']) {
    assert.equal(result[d].category.label, FIG14.category[d]);
  }
  const p = propertiesFor(indices(FIG14));
  assert.deepEqual([p.fm.min, p.fm.max], FIG14.fm);
  assert.deepEqual([p.tau0.min, p.tau0.max], FIG14.tau0);
  assert.ok(Math.abs(p.E.min - FIG14.E[0]) <= 1);
  assert.ok(Math.abs(p.E.max - FIG14.E[1]) <= 1);
});

test('Fig. 14 sits on a band boundary, and the better band takes it', () => {
  // MQI_V is exactly 2.5, the boundary between C and B for vertical actions,
  // and the sheet prints B.
  assert.equal(assess(FIG14.outcomes).V.category.label, 'B');
});

test('Fig. 13: out-of-plane is reproduced exactly', () => {
  const result = assess(FIG13.outcomes);
  assert.equal(result.O.value, 7.5);
  assert.equal(result.O.category.label, 'A');
});

test('Fig. 13: vertical and in-plane disagree with the printed sheet', () => {
  // Documented, not accommodated. If a corrected sheet ever settles this, the
  // expected values here are the ones to change -- not Eq. (1) in mqi.js.
  const got = indices(FIG13);
  assert.equal(got.V, 6.5, 'Eq. (1) on the printed outcomes');
  assert.equal(got.I, 5.5, 'Eq. (1) on the printed outcomes');
  assert.notEqual(got.V, FIG13.mqi.V);
  assert.notEqual(got.I, FIG13.mqi.I);
});

test('Fig. 13: the printed properties follow the printed indices', () => {
  // Which is how we know the sheet means 1.3 and 0.55, rather than mistyping
  // them: its mechanical properties are the correlation curves read there.
  const p = propertiesFor(FIG13.mqi);
  assert.deepEqual([p.fm.min, p.fm.max], FIG13.fm);
  assert.deepEqual([p.tau0.min, p.tau0.max], FIG13.tau0);
  assert.ok(Math.abs(p.E.min - FIG13.E[0]) <= 1);
  assert.ok(Math.abs(p.E.max - FIG13.E[1]) <= 1);
});

test('the shear strength of the data sheets is read at the in-plane index', () => {
  // The axis of Fig. 10b says "vertical actions", but all three sheets read
  // tau_0 at the in-plane index. Fig. 12 is the case where the two differ.
  const atInPlane = propertiesFor(FIG12.mqi, { tau0From: 'I' });
  const atVertical = propertiesFor(FIG12.mqi, { tau0From: 'V' });
  assert.deepEqual([atInPlane.tau0.min, atInPlane.tau0.max], [0.133, 0.182]);
  // What the text gives for MQI = 8.5, and what the sheet does NOT print.
  assert.deepEqual([atVertical.tau0.min, atVertical.tau0.max], [0.119, 0.164]);
});
