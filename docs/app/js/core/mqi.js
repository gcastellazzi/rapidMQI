/**
 * The index itself.
 *
 *   MQI = SM (SD + SS + WC + HJ + VJ + MM)          Eq. (1)
 *
 * evaluated once for each of the three loading conditions, because the same
 * wall is not equally good at carrying weight, at working as a shear panel and
 * at refusing to overturn.
 *
 * WHAT IS NOT IN THE PAPER: the interval.
 *
 * A survey is made of what can be seen, and some things cannot be seen at all
 * -- the connection between the leaves when no section is exposed, the mortar
 * when nothing has been opened up. The paper assumes every parameter is
 * assigned. This module lets a parameter be left unassigned and reports the
 * index as the interval it is then known to lie in, obtained by giving every
 * unassigned parameter first its worst outcome and then its best. When
 * everything is assigned the interval collapses to a point and the result is
 * the paper's, exactly.
 *
 * The honest consequence is that the category may also be an interval: a wall
 * whose WC is unknown is C for out-of-plane actions if the leaves turn out to
 * be unconnected and A if they turn out to be tied. Reporting one number would
 * be the survey pretending to knowledge it does not have.
 */

import {
  ADDED,
  CATEGORIES,
  CATEGORY_MEANING,
  DIRECTION_IDS,
  MULTIPLIER,
  ORDER,
  SCORES,
} from './tables.js';

/** Floating point noise is not information: 0.3 * 8.5 must be 2.55. */
const clean = (x) => Math.round(x * 1e10) / 1e10;

const WORST = 'NF';
const BEST = 'F';

/** The empty survey: every parameter unassigned. */
export function emptyAssessment() {
  return Object.fromEntries(ORDER.map((id) => [id, null]));
}

/**
 * One loading condition.
 *
 * `value` is the index when every parameter has been assigned and null when it
 * has not, so that a caller cannot print a number the survey has not earned;
 * `min` and `max` are always there. `terms` carries the contribution of each
 * of the six added parameters and, separately, the multiplier SM.
 */
export function mqiFor(direction, assessment) {
  const unknown = ORDER.filter((id) => !assessment[id]);
  const exact = unknown.length === 0;

  const score = (id, fallback) => SCORES[id][direction][assessment[id] ?? fallback];
  const sum = (fallback) => ADDED.reduce((total, id) => total + score(id, fallback), 0);

  const min = clean(score(MULTIPLIER, WORST) * sum(WORST));
  const max = clean(score(MULTIPLIER, BEST) * sum(BEST));

  const terms = {};
  for (const id of [...ADDED, MULTIPLIER]) {
    terms[id] = {
      outcome: assessment[id] ?? null,
      known: Boolean(assessment[id]),
      score: assessment[id] ? score(id, null) : null,
      min: score(id, WORST),
      max: score(id, BEST),
      role: id === MULTIPLIER ? 'multiplier' : 'added',
    };
  }

  return {
    direction,
    exact,
    unknown,
    value: exact ? min : null,
    min,
    max,
    sum: exact ? clean(sum(null)) : null,
    multiplier: exact ? score(MULTIPLIER, null) : null,
    terms,
  };
}

/**
 * Table 9. At a boundary the higher band wins, which is how the printed ranges
 * read: "2.5 <= MQI <= 5" for B and "5 <= MQI <= 10" for A both claim the
 * value 5, and the better of the two is the one the paper's own worked example
 * uses.
 */
export function classify(direction, value) {
  const { bounds, labels } = CATEGORIES[direction];
  if (value < bounds[0]) return labels[0];
  if (value < bounds[1]) return labels[1];
  return labels[2];
}

/** The category, or the range of categories still open, for a result. */
export function categoryOf(result) {
  const low = classify(result.direction, result.min);
  const high = classify(result.direction, result.max);
  return {
    low,
    high,
    certain: low === high,
    label: low === high ? low : `${low} to ${high}`,
    meaning: low === high ? CATEGORY_MEANING[low] : null,
  };
}

/** All three loading conditions at once, each with its category. */
export function assess(assessment) {
  const out = {};
  for (const d of DIRECTION_IDS) {
    const result = mqiFor(d, assessment);
    result.category = categoryOf(result);
    out[d] = result;
  }
  return out;
}

/**
 * Which missing observation is worth going back to the building for.
 *
 * For each unassigned parameter, the narrowing of the index interval that is
 * guaranteed by settling it -- guaranteed, so the worse of the two outcomes is
 * the one counted -- summed over the three loading conditions.
 */
export function leverage(assessment) {
  const width = (a, d) => {
    const r = mqiFor(d, a);
    return r.max - r.min;
  };
  const out = {};
  for (const id of ORDER) {
    if (assessment[id]) continue;
    let gain = 0;
    for (const d of DIRECTION_IDS) {
      const now = width(assessment, d);
      const after = Math.max(
        width({ ...assessment, [id]: WORST }, d),
        width({ ...assessment, [id]: BEST }, d),
      );
      gain += now - after;
    }
    out[id] = clean(gain);
  }
  return out;
}

/** True when the survey is complete enough for the paper's own arithmetic. */
export function isComplete(assessment) {
  return ORDER.every((id) => Boolean(assessment[id]));
}

/**
 * M_l, the minimum length ratio of Section 2: the shortest path between two
 * points that runs only through mortar joints, divided by the straight
 * distance between them.
 */
export function minimumLength(pathLength, straightDistance) {
  if (!(straightDistance > 0)) return null;
  return clean(pathLength / straightDistance);
}

/** Which outcome an M_l value implies, given the two thresholds of a table. */
export function outcomeFromMl(bounds, ml) {
  if (ml == null || !Number.isFinite(ml)) return null;
  if (ml < bounds[0]) return 'NF';
  if (ml < bounds[1]) return 'PF';
  return 'F';
}
