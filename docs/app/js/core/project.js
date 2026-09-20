/**
 * What a survey is made of.
 *
 * A PROJECT is a building; a PANEL is one wall of it, with its own photograph,
 * its own seven outcomes and its own index. Keeping several panels together is
 * the point: the interesting reading of a building is rarely the index of one
 * wall, it is how the walls of the same building differ from one another --
 * the ground floor against the added storey, the façade against the party
 * wall, the part that was rebuilt against the part that was not.
 *
 * Everything here is plain data. It holds no canvases, no DOM nodes and no
 * functions, so that a project is exactly what persist.js writes out and what
 * a report reads back.
 */

import { assess, emptyAssessment, isComplete, leverage } from './mqi.js';
import { compareWithCode, propertiesFor, propertiesOver } from './correlate.js';
import { DEFAULT_EDITION } from './reference.js';

export const SCHEMA = 2;

/**
 * The three ways a wall is looked at.
 *
 * The face is what a photograph naturally shows. The other two are what the
 * paper's own data sheets put beside it and what the method actually turns on:
 * a section through the thickness, where the connection between the leaves is
 * decided and where M_l for WC is measured, and a typical block, where the
 * shape is decided. Each carries its own photograph, its own scale and its own
 * marks, because a section is photographed at a different distance from the
 * face and measuring one with the other's scale would be nonsense.
 *
 * `sketch` is the answer to the common case of a section that cannot be
 * photographed because nothing is exposed. The surveyor picks the diagram that
 * matches what the wall is understood to be, which is a drawing of an
 * inference rather than a record of an observation -- and is marked as such
 * wherever it appears.
 */
export const VIEWS = [
  {
    id: 'face',
    name: 'Wall face',
    short: 'Face',
    parameter: null,
    hint: 'The wall as it is seen. Bed joints, vertical joints, mortar, block dimensions.',
  },
  {
    id: 'section',
    name: 'Wall section',
    short: 'Section',
    parameter: 'WC',
    sketch: 'section',
    hint: 'Through the thickness: a breach, a window reveal, a broken corner. M_l for WC is measured here.',
    noPhoto: 'Nothing is exposed. Pick the section this wall is understood to be.',
  },
  {
    id: 'block',
    name: 'Typical block',
    short: 'Block',
    parameter: 'SS',
    sketch: 'block',
    hint: 'One representative block, and what was done to it before it was laid.',
    noPhoto: 'No single block can be seen clearly. Pick the shape these blocks are.',
  },
];

export const VIEW_IDS = VIEWS.map((v) => v.id);
export const VIEW = Object.fromEntries(VIEWS.map((v) => [v.id, v]));

/** One photograph and everything measured on it. */
export function makeImage() {
  return {
    photo: null, // { src, width, height, name } -- src is a data URL
    scale: null, // { pixelsPerMetre, reference }
    // Everything drawn on this photograph, in image pixels: the paths traced
    // for M_l, the blocks measured for SD and the points marked to justify an
    // outcome. They are the one record of what was measured -- the readings
    // are computed from them, never stored beside them and left to drift.
    marks: [], // { id, parameter, kind, points: [{x, y}], label }
    sketch: null, // 'NF' | 'PF' | 'F', when the view is drawn instead of shot
  };
}

/**
 * Identifiers are short and readable because they end up in a JSON file that
 * someone will open in an editor. Uniqueness only has to hold inside one
 * project, so a counter with the clock behind it is enough.
 */
let counter = 0;
export function nextId(prefix = 'panel') {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** A wall, before anything has been observed about it. */
export function makePanel(overrides = {}) {
  return {
    id: nextId(),
    name: 'Untitled panel',
    location: '',
    description: '',
    family: 'stone',
    leaves: 'double',
    images: Object.fromEntries(VIEW_IDS.map((id) => [id, makeImage()])),
    view: 'face', // the one the stage is showing
    assessment: emptyAssessment(),
    notes: {}, // parameter id -> what the surveyor saw
    typology: null, // id of the row of the code table this wall is declared to be
    factors: [], // ids of the Table 11 multiplication factors applied to it
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** The image record a panel is currently working on, or any named one. */
export function imageOf(panel, which = panel?.view ?? 'face') {
  if (!panel) return null;
  if (!panel.images[which]) panel.images[which] = makeImage();
  return panel.images[which];
}

/** Every mark on a panel, whichever photograph it was drawn on. */
export function marksOf(panel, kind = null, parameter = null) {
  const out = [];
  for (const id of VIEW_IDS) {
    for (const mark of panel.images[id]?.marks ?? []) {
      if (kind && mark.kind !== kind) continue;
      if (parameter && mark.parameter !== parameter) continue;
      out.push({ ...mark, view: id, scale: panel.images[id].scale });
    }
  }
  return out;
}

/** A building, with one empty wall ready to be surveyed. */
export function makeProject(overrides = {}) {
  const first = makePanel({ name: 'Panel 1' });
  return {
    schema: SCHEMA,
    app: 'rapidMQI',
    name: 'Untitled survey',
    site: '',
    surveyor: '',
    date: new Date().toISOString().slice(0, 10),
    edition: DEFAULT_EDITION,
    tau0From: 'I',
    panels: [first],
    activePanelId: first.id,
    ...overrides,
  };
}

export function activePanel(project) {
  return project.panels.find((p) => p.id === project.activePanelId) ?? project.panels[0] ?? null;
}

export function addPanel(project, overrides = {}) {
  const panel = makePanel({ name: `Panel ${project.panels.length + 1}`, ...overrides });
  project.panels.push(panel);
  project.activePanelId = panel.id;
  return panel;
}

/**
 * Copying a panel keeps everything but the photographs and what was measured
 * on them: two walls of the same building are usually built the same way, and
 * the point of duplicating is to change the one or two parameters that differ.
 * The sketches are kept, because a drawing of how the leaves are tied is a
 * statement about the construction rather than about one wall.
 */
export function duplicatePanel(project, id) {
  const source = project.panels.find((p) => p.id === id);
  if (!source) return null;
  const images = Object.fromEntries(
    VIEW_IDS.map((view) => [view, { ...makeImage(), sketch: source.images[view]?.sketch ?? null }]),
  );
  const copy = makePanel({
    ...structuredClone(source),
    id: nextId(),
    name: `${source.name} (copy)`,
    images,
    createdAt: new Date().toISOString(),
  });
  project.panels.push(copy);
  project.activePanelId = copy.id;
  return copy;
}

export function removePanel(project, id) {
  if (project.panels.length <= 1) return false;
  const index = project.panels.findIndex((p) => p.id === id);
  if (index < 0) return false;
  project.panels.splice(index, 1);
  if (project.activePanelId === id) {
    project.activePanelId = project.panels[Math.min(index, project.panels.length - 1)].id;
  }
  return true;
}

/**
 * Everything that can be said about one wall: the three indices, the three
 * categories, the mechanical properties when the survey is complete enough to
 * have earned them, and the comparison with the declared row of the code
 * table. Nothing is cached -- it is a few dozen multiplications, and a stale
 * result on a survey report is worse than any amount of arithmetic.
 */
export function summarise(panel, project = {}) {
  const indices = assess(panel.assessment);
  const complete = isComplete(panel.assessment);
  const values = { V: indices.V.value, I: indices.I.value, O: indices.O.value };
  const tau0From = project.tau0From ?? 'I';

  const properties = complete
    ? propertiesFor(values, { tau0From })
    : propertiesOver(
        { V: indices.V.min, I: indices.I.min, O: indices.O.min },
        { V: indices.V.max, I: indices.I.max, O: indices.O.max },
        { tau0From },
      );

  const comparison =
    panel.typology && properties
      ? compareWithCode(properties, panel.typology, {
          editionId: project.edition,
          factors: panel.factors ?? [],
        })
      : null;

  return {
    panel,
    complete,
    indices,
    values,
    properties,
    comparison,
    missing: indices.V.unknown,
    leverage: complete ? {} : leverage(panel.assessment),
  };
}

/** The comparative table of a whole building. */
export function summariseProject(project) {
  return project.panels.map((panel) => summarise(panel, project));
}

/** How far through the seven a panel is, for the progress readout. */
export function progressOf(panel) {
  const values = Object.values(panel.assessment);
  const done = values.filter(Boolean).length;
  return { done, total: values.length, fraction: done / values.length };
}
