/**
 * The Masonry Quality Index, as published.
 *
 * Every number and every criterion in this file is transcribed from
 *
 *   A. Borri, M. Corradi, G. Castori, A. De Maria (2015)
 *   "A method for the analysis and classification of historic masonry"
 *   Bulletin of Earthquake Engineering 13:2647-2665
 *   DOI 10.1007/s10518-015-9731-4
 *
 * and nothing is computed here. The separation is deliberate: a reader with
 * the paper open should be able to check this file line by line against
 * Tables 1 to 9, and the arithmetic that uses it lives in mqi.js.
 *
 * TWO THINGS THAT WILL SURPRISE A READER OF THE PAPER
 *
 * 1. SM is not one of the six terms that are added up. It multiplies their
 *    sum -- Eq. (1), MQI = SM (SD + SS + WC + HJ + VJ + MM) -- because the
 *    state of the blocks themselves scales the quality of everything that was
 *    done with them.
 *
 * 2. Table 9, as printed, carries its column headers in the order A, B, C
 *    while the ranges under them run from the lowest MQI to the highest. Read
 *    literally it would make MQI = 8.5 a category C masonry, which contradicts
 *    both the definition given in the text ("category A, good behavior of
 *    masonry") and the worked example of Fig. 12, where MQI = 8.5 / 9.5 / 9.0
 *    is classified A / A / A. The thresholds below are the ranges of the
 *    printed table with the labels put back the right way round: C is the
 *    lowest band, A the highest.
 */

/** The three loading conditions of Fig. 8. */
export const DIRECTIONS = [
  {
    id: 'V',
    name: 'Vertical actions',
    short: 'Vertical',
    note: 'Vertical static loads: the wall carrying what stands on it.',
  },
  {
    id: 'I',
    name: 'In-plane actions',
    short: 'In-plane',
    note: 'In-plane dynamic loads: the wall acting as a shear panel.',
  },
  {
    id: 'O',
    name: 'Out-of-plane actions',
    short: 'Out-of-plane',
    note: 'Out-of-plane static and dynamic loads: the wall overturning.',
  },
];

export const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);

/** Fulfilled, Partially Fulfilled, Not Fulfilled (Borri and De Maria 2009). */
export const OUTCOMES = [
  { id: 'NF', name: 'Not fulfilled', tone: 'bad' },
  { id: 'PF', name: 'Partially fulfilled', tone: 'warn' },
  { id: 'F', name: 'Fulfilled', tone: 'ok' },
];

export const OUTCOME_IDS = OUTCOMES.map((o) => o.id);

/**
 * Table 8 -- numerical values for analysis.
 *
 * Read as SCORES[parameter][direction][outcome]. The six added parameters each
 * reach their maximum at F, and those maxima sum to exactly 10 in every
 * column, which is why the index runs from 0 to 10 whatever the loading
 * condition. tables.test.js asserts that they still do.
 */
export const SCORES = {
  HJ: { V: { NF: 0, PF: 1, F: 2 }, I: { NF: 0, PF: 0.5, F: 1 }, O: { NF: 0, PF: 1, F: 2 } },
  WC: { V: { NF: 0, PF: 1, F: 1 }, I: { NF: 0, PF: 1, F: 2 }, O: { NF: 0, PF: 1.5, F: 3 } },
  SS: { V: { NF: 0, PF: 1.5, F: 3 }, I: { NF: 0, PF: 1, F: 2 }, O: { NF: 0, PF: 1, F: 2 } },
  VJ: { V: { NF: 0, PF: 0.5, F: 1 }, I: { NF: 0, PF: 1, F: 2 }, O: { NF: 0, PF: 0.5, F: 1 } },
  SD: { V: { NF: 0, PF: 0.5, F: 1 }, I: { NF: 0, PF: 0.5, F: 1 }, O: { NF: 0, PF: 0.5, F: 1 } },
  MM: { V: { NF: 0, PF: 0.5, F: 2 }, I: { NF: 0, PF: 1, F: 2 }, O: { NF: 0, PF: 0.5, F: 1 } },
  SM: { V: { NF: 0.3, PF: 0.7, F: 1 }, I: { NF: 0.3, PF: 0.7, F: 1 }, O: { NF: 0.5, PF: 0.7, F: 1 } },
};

/** The parameter that multiplies, as opposed to the six that are added. */
export const MULTIPLIER = 'SM';

/** The six added parameters, in the order they appear in Eq. (1). */
export const ADDED = ['SD', 'SS', 'WC', 'HJ', 'VJ', 'MM'];

/**
 * Table 9 -- the band boundaries, lowest first, with the labels corrected as
 * explained at the head of this file: category C up to the first bound, B up
 * to the second, A above it.
 */
export const CATEGORIES = {
  V: { bounds: [2.5, 5], labels: ['C', 'B', 'A'] },
  I: { bounds: [3, 5], labels: ['C', 'B', 'A'] },
  O: { bounds: [4, 7], labels: ['C', 'B', 'A'] },
};

export const CATEGORY_MEANING = {
  A: 'Good behaviour of masonry',
  B: 'Behaviour of average quality',
  C: 'Inadequate behaviour of masonry',
};

/**
 * The "minimum length" M_l of Section 2: the ratio between the shortest path
 * joining two points while running only through mortar joints and the straight
 * distance between them. The straight distance is usually taken as 1 m, and
 * values down to 0.5 m are acceptable. It is measured on a wall section for
 * WC and on the wall face for VJ.
 */
export const ML = {
  straightDistance: { preferred: 1.0, minimum: 0.5, unit: 'm' },
  WC: {
    where: 'wall section',
    bounds: [1.25, 1.55],
    note: 'Below 1.25 the connection between the leaves is weak; above 1.55 it is good.',
  },
  VJ: {
    where: 'wall face, one leaf at a time',
    bounds: [1.4, 1.6],
    note: 'Thresholds for a single-leaf wall; a double-leaf wall is judged on both leaves.',
  },
};

/**
 * Tables 1 to 7 -- the criteria themselves, in the words of the paper.
 *
 * `family` marks a line belonging to stone or to brick masonry only, so that
 * the wizard can put the irrelevant half of a table out of the way without
 * hiding it. A line with no family is shown for both.
 */
export const PARAMETERS = [
  {
    id: 'SM',
    n: 1,
    table: 'Table 1',
    name: 'Mechanical properties and conservation state of the elements',
    short: 'Elements',
    prompt: 'What are the blocks made of, and what state are they in?',
    why:
      'This is the one parameter that multiplies the others. Sound blocks cannot make up for a ' +
      'bad wall, but decayed ones drag down everything that was well done.',
    criteria: {
      NF: [
        { text: 'Degraded or damaged elements, more than 50% of the total number of elements' },
        { text: 'Hollow bricks, solid below 30%', family: 'brick' },
        { text: 'Mud bricks', family: 'brick' },
        { text: 'Unfired bricks', family: 'brick' },
      ],
      PF: [
        { text: 'Presence of degraded or damaged elements, at least 10% and at most 50%' },
        { text: 'Hollow bricks, solid between 30% and 55%', family: 'brick' },
        { text: 'Sandstone or tuff elements', family: 'stone' },
      ],
      F: [
        { text: 'Undamaged elements, or degraded and damaged elements below 10%' },
        { text: 'Solid fired bricks', family: 'brick' },
        { text: 'Hollow bricks, solid above 55%', family: 'brick' },
        { text: 'Concrete blocks' },
        { text: 'Hardstone', family: 'stone' },
      ],
    },
    hint:
      'Unfired and mud bricks, whose strength is 0.5 to 5 MPa, are generally NF; softstones such ' +
      'as tuff and sandstone, 5 to 20 MPa, are generally PF. Erosion of porous stone belongs here.',
  },
  {
    id: 'SD',
    n: 2,
    table: 'Table 2',
    name: 'Dimensions of the elements',
    short: 'Dimensions',
    prompt: 'How large are the blocks?',
    why: 'Large blocks make a wall behave as one body; small ones let it come apart.',
    measure: 'large dimension of the elements',
    criteria: {
      NF: [
        { text: 'More than 50% of the elements have a large dimension below 20 cm' },
        { text: 'Brick bond pattern made of head joints only', family: 'brick' },
      ],
      PF: [
        { text: 'More than 50% of the elements have a large dimension between 20 and 40 cm' },
        { text: 'Co-presence of elements of different dimensions' },
      ],
      F: [{ text: 'More than 50% of the elements have a large dimension above 40 cm' }],
    },
    hint: 'Scale the photograph first, then measure a representative sample of blocks on it.',
  },
  {
    id: 'SS',
    n: 3,
    table: 'Table 3',
    name: 'Shape of the elements',
    short: 'Shape',
    prompt: 'What shape are the blocks, from pebbles to perfectly cut stone?',
    why:
      'Shape decides how much of one block bears on the next, and whether that bearing is a ' +
      'surface or a point.',
    criteria: {
      NF: [
        {
          text: 'Rubble, rounded or pebble stonework, predominant on both masonry leaves',
          family: 'stone',
        },
      ],
      PF: [
        {
          text:
            'Co-presence of rubble, rounded or pebble stonework and barely or perfectly cut ' +
            'stone and bricks on both masonry leaves',
        },
        { text: 'One masonry leaf made of perfectly cut stones or bricks' },
        {
          text: 'Masonry of irregular rubble, rounded or pebble stones, but with pinning stones',
          family: 'stone',
        },
      ],
      F: [
        {
          text: 'Barely cut or perfectly cut stones on both masonry leaves, predominant',
          family: 'stone',
        },
        { text: 'Brickwork', family: 'brick' },
      ],
    },
  },
  {
    id: 'WC',
    n: 4,
    table: 'Table 4',
    name: 'Wall leaf connections',
    short: 'Leaf connection',
    prompt: 'Are the leaves of the wall tied to one another?',
    why:
      'The out-of-plane behaviour of a wall is decided here, which is why WC carries its largest ' +
      'weight, up to 3, for out-of-plane actions and only 1 for vertical ones.',
    quantitative: 'WC',
    criteria: {
      NF: [
        { text: 'M_l below 1.25 on a visible wall section', kind: 'quantitative' },
        { text: 'Small stones, whatever the value of M_l', kind: 'quantitative', family: 'stone' },
        { text: 'Stones small compared with the wall thickness', kind: 'qualitative' },
        { text: 'No headers, or fewer than 2 per square metre', kind: 'qualitative' },
      ],
      PF: [
        { text: 'M_l between 1.25 and 1.55 on a visible wall section', kind: 'quantitative' },
        {
          text: 'Double-leaf wall with some headers present, about 2 to 5 per square metre',
          kind: 'qualitative',
        },
        {
          text: 'Wall thickness larger than the large dimension of the stones',
          kind: 'qualitative',
        },
      ],
      F: [
        { text: 'M_l above 1.55 on a visible wall section', kind: 'quantitative' },
        {
          text: 'Wall thickness similar to the large dimension of the stones',
          kind: 'qualitative',
        },
        {
          text: 'Systematic presence of headers, more than 4 to 5 per square metre',
          kind: 'qualitative',
        },
      ],
    },
    hint:
      'If a section of the wall is visible the quantitative criteria decide: measure M_l on it. ' +
      'If it is not, judge by the headers and by the thickness.',
  },
  {
    id: 'HJ',
    n: 5,
    table: 'Table 5',
    name: 'Horizontality of bed joints',
    short: 'Bed joints',
    prompt: 'Do the bed joints run through, course by course?',
    why:
      'Continuous bed joints spread a vertical load along the wall instead of concentrating it ' +
      'where two stones happen to touch.',
    criteria: {
      NF: [{ text: 'Bed joints not continuous' }],
      PF: [
        { text: 'Intermediate situation between NF and F' },
        { text: 'Double-leaf wall with only one leaf having continuous bed joints' },
      ],
      F: [
        { text: 'Bed joints continuous' },
        {
          text: 'Stone masonry with brick courses, the distance between courses below 60 cm',
          family: 'stone',
        },
      ],
    },
  },
  {
    id: 'VJ',
    n: 6,
    table: 'Table 6',
    name: 'Staggering of vertical joints',
    short: 'Vertical joints',
    prompt: 'Are the vertical joints staggered, or do they line up?',
    why:
      'A vertical joint that continues from course to course is a crack the wall was built with, ' +
      'which is why VJ weighs most, up to 2, for in-plane actions.',
    quantitative: 'VJ',
    criteria: {
      NF: [
        { text: 'Single-leaf wall with M_l below 1.4', kind: 'quantitative' },
        {
          text: 'Double-leaf wall with M_l below 1.4 on one leaf and below 1.6 on the other',
          kind: 'quantitative',
        },
        { text: 'Wall made of very small stones', kind: 'quantitative', family: 'stone' },
        { text: 'Aligned vertical joints', kind: 'qualitative' },
        {
          text: 'Aligned vertical joints for at least two large stones',
          kind: 'qualitative',
          family: 'stone',
        },
        { text: 'Solid brick wall made of headers only', kind: 'qualitative', family: 'brick' },
      ],
      PF: [
        { text: 'Single-leaf wall with M_l between 1.4 and 1.6', kind: 'quantitative' },
        {
          text:
            'Double-leaf wall: both leaves between 1.4 and 1.6; or at least one leaf above 1.6; ' +
            'or the first leaf above 1.6 and the second between 1.4 and 1.6',
          kind: 'quantitative',
        },
        { text: 'Partially staggered vertical joints', kind: 'qualitative' },
        {
          text:
            'The joint between two bricks is not placed at the middle of the bricks above and below',
          kind: 'qualitative',
          family: 'brick',
        },
      ],
      F: [
        { text: 'Single-leaf wall with M_l above 1.6', kind: 'quantitative' },
        { text: 'Double-leaf wall with M_l above 1.6 on both leaves', kind: 'quantitative' },
        { text: 'Properly staggered vertical joints', kind: 'qualitative' },
        {
          text:
            'The joint between two stones is placed at the middle of the stones above and below',
          kind: 'qualitative',
        },
      ],
    },
    hint:
      'On a double-leaf wall the outdoor face often scores better than the indoor one: more care ' +
      'went into what was meant to be seen. Measure both when you can reach both.',
  },
  {
    id: 'MM',
    n: 7,
    table: 'Table 7',
    name: 'Mortar properties',
    short: 'Mortar',
    prompt: 'What is the mortar like, and how does it bond to the blocks?',
    why:
      'Historic mortars are nearly all lime, but the binder to aggregate ratio, the lime itself ' +
      'and the bond to the blocks change the wall entirely.',
    criteria: {
      NF: [
        { text: 'Very weak, dusty mortar with no cohesion' },
        { text: 'No mortar at all, rubble or pebble stonework', family: 'stone' },
        {
          text: 'Large bed joints of weak mortar, of thickness comparable to the block thickness',
        },
        { text: 'Porous stones or bricks with weak bonding to the mortar' },
      ],
      PF: [
        { text: 'Medium quality mortar, with bed joints not largely notched' },
        {
          text: 'Masonry of irregular rubble stones and weak mortar, but with pinning stones',
          family: 'stone',
        },
      ],
      F: [
        {
          text:
            'Good quality, non-degraded mortar with regular bed joint thickness, or large bed ' +
            'joints of very good quality mortar',
        },
        {
          text: 'Large perfectly cut stones with no mortar or very thin bed joints',
          family: 'stone',
        },
      ],
    },
  },
];

/** Lookup by id, for the many places that hold a parameter id and want the rest. */
export const PARAMETER = Object.fromEntries(PARAMETERS.map((p) => [p.id, p]));

/** The wizard order: the order in which the paper introduces them. */
export const ORDER = PARAMETERS.map((p) => p.id);

/**
 * The families the application distinguishes. The paper writes one set of
 * tables covering stone and brick together, so the family does not change any
 * number: it only decides which criteria are brought forward and which are
 * kept out of the way.
 */
export const FAMILIES = [
  { id: 'stone', name: 'Stone masonry' },
  { id: 'brick', name: 'Brick masonry' },
  { id: 'mixed', name: 'Mixed stone and brick' },
];

/** Whether a criterion line applies to the declared family. */
export function appliesTo(criterion, family) {
  if (!criterion.family) return true;
  if (family === 'mixed') return true;
  return criterion.family === family;
}

/**
 * Where the tables are deliberately silent.
 *
 * Filtering Table 3 down to brick masonry leaves the NF column empty, and that
 * is not a gap in the transcription: Table 3 gives "Brickwork" as F outright,
 * so there is no case in which the shape of a brick is not fulfilled. The
 * wizard says so in as many words rather than showing an empty column, and
 * tables.test.js checks that this remains the only such silence.
 */
export const NO_CRITERION = {
  SS: {
    brick: {
      NF: 'Table 3 gives brickwork as fulfilled outright: the shape of a brick is never the ' +
        'problem. Choose this only if the wall is not really brickwork.',
      PF: null,
    },
  },
};

/**
 * The criteria to put in front of a surveyor: the lines of the table that
 * apply to the declared family, and, when there are none, the reason why.
 */
export function criteriaFor(parameterId, outcome, family) {
  const parameter = PARAMETER[parameterId];
  const lines = (parameter?.criteria?.[outcome] ?? []).filter((c) => appliesTo(c, family));
  const note = NO_CRITERION[parameterId]?.[family]?.[outcome] ?? null;
  return { lines, note, empty: lines.length === 0 };
}
