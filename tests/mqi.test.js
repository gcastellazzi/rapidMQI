/**
 * Eq. (1), the categories, and the interval that an incomplete survey leaves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assess,
  categoryOf,
  classify,
  emptyAssessment,
  isComplete,
  leverage,
  minimumLength,
  mqiFor,
  outcomeFromMl,
} from '../docs/app/js/core/mqi.js';
import { ML, ORDER } from '../docs/app/js/core/tables.js';

const all = (outcome) => Object.fromEntries(ORDER.map((id) => [id, outcome]));

test('a perfect wall scores 10 and a worthless one scores 0', () => {
  for (const d of ['V', 'I', 'O']) {
    assert.equal(mqiFor(d, all('F')).value, 10);
    assert.equal(mqiFor(d, all('NF')).value, 0);
  }
});

test('the multiplier multiplies, it does not add', () => {
  // Everything fulfilled but the blocks themselves decayed: the sum is still
  // 10, and the index is the multiplier.
  const wall = { ...all('F'), SM: 'NF' };
  assert.equal(mqiFor('V', wall).value, 3);
  assert.equal(mqiFor('I', wall).value, 3);
  assert.equal(mqiFor('O', wall).value, 5);
  assert.equal(mqiFor('V', wall).sum, 10);
});

test('floating point never leaks into the index', () => {
  const wall = { ...all('PF'), SM: 'NF' };
  for (const d of ['V', 'I', 'O']) {
    const value = mqiFor(d, wall).value;
    assert.equal(value, Number(value.toFixed(10)));
  }
});

test('an empty survey is an interval from 0 to 10, and no number', () => {
  const empty = emptyAssessment();
  assert.equal(isComplete(empty), false);
  for (const d of ['V', 'I', 'O']) {
    const r = mqiFor(d, empty);
    assert.equal(r.value, null, 'no index is reported until the survey earns one');
    assert.equal(r.min, 0);
    assert.equal(r.max, 10);
    assert.equal(r.unknown.length, 7);
    assert.equal(r.exact, false);
  }
});

test('the interval closes as parameters are assigned', () => {
  const wall = { ...all('F'), WC: null };
  const r = mqiFor('O', wall);
  assert.equal(r.exact, false);
  assert.deepEqual(r.unknown, ['WC']);
  // WC is worth 3 out of 10 out of plane, and nothing else is in doubt.
  assert.equal(r.min, 7);
  assert.equal(r.max, 10);
  assert.equal(categoryOf(r).label, 'A', 'A either way: the unknown does not matter here');
  assert.equal(categoryOf(r).certain, true);
});

test('an unknown parameter can leave the category genuinely open', () => {
  const wall = { ...all('PF'), WC: null };
  const r = mqiFor('O', wall);
  const c = categoryOf(r);
  assert.equal(c.certain, false);
  assert.equal(c.label, 'C to B');
  assert.equal(c.meaning, null, 'no single meaning is claimed for an open category');
});

test('leverage names the observation worth going back for', () => {
  const wall = { ...all('PF'), SM: 'F', WC: null, SD: null };
  const gain = leverage(wall);
  assert.ok(gain.WC > gain.SD, 'the leaf connection is worth more than the block size');
  assert.equal(Object.keys(gain).length, 2, 'only the unassigned parameters have leverage');
  // WC spans 0 to 3 out of plane, 0 to 2 in plane, 0 to 1 vertical; SD spans
  // 0 to 1 in all three. The multiplier is fulfilled here, so it scales by 1.
  assert.equal(gain.WC, 6);
  assert.equal(gain.SD, 3);
});

test('leverage is measured through the multiplier, not around it', () => {
  // The same unknown is worth less on a wall of decayed blocks, because
  // everything it could add would be scaled down by SM.
  const decayed = leverage({ ...all('PF'), SM: 'PF', WC: null });
  assert.equal(decayed.WC, 4.2, '0.7 times the span of 6');
});

test('classification follows Table 9, with the boundary going to the better band', () => {
  assert.equal(classify('V', 2.49), 'C');
  assert.equal(classify('V', 2.5), 'B');
  assert.equal(classify('V', 5), 'A');
  assert.equal(classify('I', 2.99), 'C');
  assert.equal(classify('I', 3), 'B');
  assert.equal(classify('I', 5), 'A');
  assert.equal(classify('O', 3.99), 'C');
  assert.equal(classify('O', 4), 'B');
  assert.equal(classify('O', 7), 'A');
});

test('the same wall is classified separately in each direction', () => {
  // A wall of good blocks, well shaped and coursed, with no ties between the
  // leaves: sound to carry weight, ready to peel apart out of plane.
  const wall = { SM: 'F', SD: 'F', SS: 'F', HJ: 'F', VJ: 'F', MM: 'F', WC: 'NF' };
  const r = assess(wall);
  assert.equal(r.V.value, 9);
  assert.equal(r.I.value, 8);
  assert.equal(r.O.value, 7);
  assert.equal(r.V.category.label, 'A');
  assert.equal(r.O.category.label, 'A');
});

test('the terms of the sum are reported, so a result can be taken apart', () => {
  const r = mqiFor('O', { ...all('F'), WC: 'NF' });
  assert.equal(r.terms.WC.score, 0);
  assert.equal(r.terms.WC.outcome, 'NF');
  assert.equal(r.terms.SM.role, 'multiplier');
  assert.equal(r.terms.HJ.role, 'added');
  assert.equal(r.sum, 7);
  assert.equal(r.multiplier, 1);
});

test('the minimum length ratio and the outcome it implies', () => {
  assert.equal(minimumLength(1.6, 1), 1.6);
  assert.equal(minimumLength(0.8, 0.5), 1.6);
  assert.equal(minimumLength(1, 0), null);

  // Table 4, on a wall section.
  assert.equal(outcomeFromMl(ML.WC.bounds, 1.2), 'NF');
  assert.equal(outcomeFromMl(ML.WC.bounds, 1.4), 'PF');
  assert.equal(outcomeFromMl(ML.WC.bounds, 1.6), 'F');
  // Table 6, on the wall face.
  assert.equal(outcomeFromMl(ML.VJ.bounds, 1.3), 'NF');
  assert.equal(outcomeFromMl(ML.VJ.bounds, 1.5), 'PF');
  assert.equal(outcomeFromMl(ML.VJ.bounds, 1.7), 'F');
  assert.equal(outcomeFromMl(ML.VJ.bounds, null), null);
});
