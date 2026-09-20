/**
 * The tables, checked against the shape the method requires of them.
 *
 * These are not tests of arithmetic -- there is none in tables.js -- but of
 * transcription. A digit mistyped from Table 8 would leave the application
 * working perfectly and answering wrongly, which is the failure mode worth
 * spending a test file on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADDED,
  CATEGORIES,
  DIRECTION_IDS,
  MULTIPLIER,
  ORDER,
  OUTCOME_IDS,
  PARAMETERS,
  SCORES,
  appliesTo,
  criteriaFor,
} from '../docs/app/js/core/tables.js';

test('the index reaches exactly 10 in every loading condition', () => {
  for (const d of DIRECTION_IDS) {
    const best = ADDED.reduce((sum, id) => sum + SCORES[id][d].F, 0);
    assert.equal(best, 10, `sum of the fulfilled scores for ${d}`);
    assert.equal(SCORES[MULTIPLIER][d].F, 1, `the multiplier is 1 when fulfilled, for ${d}`);
  }
});

test('the index is zero when nothing is fulfilled', () => {
  for (const d of DIRECTION_IDS) {
    const worst = ADDED.reduce((sum, id) => sum + SCORES[id][d].NF, 0);
    assert.equal(worst, 0);
  }
});

test('no score decreases as the outcome improves', () => {
  for (const id of ORDER) {
    for (const d of DIRECTION_IDS) {
      const { NF, PF, F } = SCORES[id][d];
      assert.ok(NF <= PF && PF <= F, `${id} ${d}: ${NF} ${PF} ${F} is not monotone`);
    }
  }
});

test('the multiplier never falls to zero', () => {
  // SM scales the sum; were it allowed to be zero a single decayed course
  // would annihilate the index rather than reduce it.
  for (const d of DIRECTION_IDS) {
    assert.ok(SCORES[MULTIPLIER][d].NF > 0);
  }
});

test('the multiplier is more forgiving out of plane than in plane', () => {
  // Table 8: SM starts at 0.3 for V and I but at 0.5 for O.
  assert.equal(SCORES.SM.V.NF, 0.3);
  assert.equal(SCORES.SM.I.NF, 0.3);
  assert.equal(SCORES.SM.O.NF, 0.5);
});

test('the parameters of Eq. (1) are the seven of the method, once each', () => {
  assert.equal(ORDER.length, 7);
  assert.deepEqual([...new Set(ORDER)].sort(), [...ORDER].sort());
  assert.deepEqual([...ADDED, MULTIPLIER].sort(), [...ORDER].sort());
  assert.equal(ADDED.includes(MULTIPLIER), false);
});

test('every parameter carries criteria for all three outcomes', () => {
  for (const p of PARAMETERS) {
    for (const outcome of OUTCOME_IDS) {
      const lines = p.criteria[outcome];
      assert.ok(Array.isArray(lines) && lines.length > 0, `${p.id} has no ${outcome} criteria`);
      for (const line of lines) {
        assert.equal(typeof line.text, 'string');
        assert.ok(line.text.length > 0);
      }
    }
    assert.ok(SCORES[p.id], `${p.id} has criteria but no scores`);
  }
});

test('a surveyor is never shown an empty column without being told why', () => {
  // Table 3 filtered to brick masonry has nothing under NF, because brickwork
  // is fulfilled outright. That silence is declared in NO_CRITERION; any other
  // empty column would be a line lost in transcription.
  const silences = [];
  for (const p of PARAMETERS) {
    for (const family of ['stone', 'brick', 'mixed']) {
      for (const outcome of OUTCOME_IDS) {
        const { lines, note } = criteriaFor(p.id, outcome, family);
        if (lines.length > 0) continue;
        silences.push(`${p.id}/${family}/${outcome}`);
        assert.ok(note, `${p.id} ${outcome} shows nothing for ${family} masonry and says nothing`);
      }
    }
  }
  assert.deepEqual(silences, ['SS/brick/NF']);
});

test('the family filter never invents a line', () => {
  for (const p of PARAMETERS) {
    for (const outcome of OUTCOME_IDS) {
      const all = p.criteria[outcome];
      const mixed = all.filter((c) => appliesTo(c, 'mixed'));
      assert.equal(mixed.length, all.length, `${p.id} ${outcome}: mixed masonry sees everything`);
      for (const family of ['stone', 'brick']) {
        for (const line of all.filter((c) => appliesTo(c, family))) {
          assert.ok(!line.family || line.family === family);
        }
      }
    }
  }
});

test('the category bands are ordered and inside the range of the index', () => {
  for (const d of DIRECTION_IDS) {
    const { bounds, labels } = CATEGORIES[d];
    assert.deepEqual(labels, ['C', 'B', 'A']);
    assert.ok(bounds[0] < bounds[1]);
    assert.ok(bounds[0] > 0 && bounds[1] < 10);
  }
});

test('out-of-plane classification is the strictest of the three', () => {
  // A wall must reach 7 to be class A out of plane, against 5 for the others:
  // the out-of-plane mechanism is the one that kills.
  assert.equal(CATEGORIES.O.bounds[1], 7);
  assert.equal(CATEGORIES.V.bounds[1], 5);
  assert.equal(CATEGORIES.I.bounds[1], 5);
});
