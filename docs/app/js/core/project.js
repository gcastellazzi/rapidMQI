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

export const SCHEMA = 1;

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
    photo: null, // { src, width, height, name } -- src is a data URL
    scale: null, // { pixelsPerMetre, reference }
    assessment: emptyAssessment(),
    notes: {}, // parameter id -> what the surveyor saw
    // Everything drawn on the photograph, in image pixels: the paths traced
    // for M_l, the blocks measured for SD and the points marked to justify an
    // outcome. They are the one record of what was measured -- the readings
    // are computed from them, never stored beside them and left to drift.
    marks: [], // { id, parameter, kind, points: [{x, y}], label }
    typology: null, // id of the row of the code table this wall is declared to be
    factors: [], // ids of the Table 11 multiplication factors applied to it
    createdAt: new Date().toISOString(),
    ...overrides,
  };
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
 * Copying a panel keeps everything but the photograph and the marks drawn on
 * it: two walls of the same building are usually built the same way, and the
 * point of duplicating is to change the one or two parameters that differ.
 */
export function duplicatePanel(project, id) {
  const source = project.panels.find((p) => p.id === id);
  if (!source) return null;
  const copy = makePanel({
    ...structuredClone(source),
    id: nextId(),
    name: `${source.name} (copy)`,
    photo: null,
    scale: null,
    marks: [],
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
