/**
 * Writing a survey down and reading it back.
 *
 * The file is JSON, it carries its own schema number, and it contains the
 * photographs as data URLs so that one file is the whole survey: a report
 * written six months later must not depend on which folder the phone put the
 * pictures in. The cost is size, which is why images are re-encoded on the way
 * in (see downscale, in app.js) rather than stored at whatever resolution the
 * camera happened to use.
 *
 * Reading is deliberately forgiving of missing fields and deliberately strict
 * about wrong ones: a survey file with an unknown outcome in it would produce
 * an index, silently, from something nobody assessed.
 */

import { ORDER, OUTCOME_IDS } from './tables.js';
import { SCHEMA, VIEW_IDS, makeImage, makePanel, makeProject } from './project.js';

export const FILE_VERSION = SCHEMA;
const STORE_KEY = 'rapidMQI.project';

/** The project as it goes into a file. */
export function serialise(project, { withPhotos = true } = {}) {
  const copy = structuredClone(project);
  copy.schema = SCHEMA;
  copy.app = 'rapidMQI';
  copy.savedAt = new Date().toISOString();
  if (!withPhotos) {
    for (const panel of copy.panels) {
      for (const view of VIEW_IDS) {
        const image = panel.images?.[view];
        if (image?.photo) image.photo = { ...image.photo, src: null, omitted: true };
      }
    }
  }
  return copy;
}

export function toJSON(project, options) {
  return JSON.stringify(serialise(project, options), null, 2);
}

class SurveyFileError extends Error {}

/**
 * A project from whatever was in the file.
 *
 * Anything unrecognised is dropped rather than carried along, and anything
 * recognised but invalid stops the load: half a survey read back is worse than
 * a refusal, because only the refusal is visible.
 */
export function parse(text) {
  let raw;
  try {
    raw = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (err) {
    throw new SurveyFileError('This file is not JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new SurveyFileError('This file is not a survey.');
  if (raw.app && raw.app !== 'rapidMQI') {
    throw new SurveyFileError(`This file was written by ${raw.app}, not by rapidMQI.`);
  }
  if (!Array.isArray(raw.panels) || raw.panels.length === 0) {
    throw new SurveyFileError('This survey has no panels in it.');
  }
  if (Number(raw.schema) > SCHEMA) {
    throw new SurveyFileError(
      `This survey was written by a later version of rapidMQI (schema ${raw.schema}, this one ` +
        `reads ${SCHEMA}). Update the application rather than let it read the file wrongly.`,
    );
  }

  const base = makeProject();
  const project = {
    ...base,
    ...pick(raw, ['name', 'site', 'surveyor', 'date', 'edition', 'tau0From']),
    schema: SCHEMA,
    panels: raw.panels.map(readPanel),
  };
  const active = raw.activePanelId;
  project.activePanelId = project.panels.some((p) => p.id === active)
    ? active
    : project.panels[0].id;
  return project;
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
  return out;
}

function readPanel(raw) {
  if (!raw || typeof raw !== 'object') throw new SurveyFileError('A panel is not an object.');
  const panel = makePanel({
    ...pick(raw, [
      'id',
      'name',
      'location',
      'description',
      'family',
      'leaves',
      'typology',
      'createdAt',
    ]),
  });

  panel.assessment = readAssessment(raw.assessment, panel.name);
  panel.notes = isObject(raw.notes) ? { ...raw.notes } : {};
  panel.factors = Array.isArray(raw.factors) ? raw.factors.filter((f) => typeof f === 'string') : [];
  panel.images = readImages(raw);
  panel.view = VIEW_IDS.includes(raw.view) ? raw.view : 'face';
  return panel;
}

/**
 * Schema 1 kept one photograph per panel, with its scale and its marks beside
 * it; schema 2 keeps three, one for the face, one for a section and one for a
 * block, each with its own. A file written by the older version is read into
 * the face view, which is what its single photograph was.
 */
function readImages(raw) {
  const images = Object.fromEntries(VIEW_IDS.map((id) => [id, makeImage()]));
  if (isObject(raw.images)) {
    for (const id of VIEW_IDS) {
      const from = raw.images[id];
      if (!isObject(from)) continue;
      images[id] = {
        photo: readPhoto(from.photo),
        scale: readScale(from.scale),
        marks: Array.isArray(from.marks) ? from.marks.filter(isMark).map(readMark) : [],
        sketch: OUTCOME_IDS.includes(from.sketch) ? from.sketch : null,
        dimensions: readDimensions(from.dimensions),
      };
    }
    return images;
  }
  images.face = {
    photo: readPhoto(raw.photo),
    scale: readScale(raw.scale),
    marks: Array.isArray(raw.marks) ? raw.marks.filter(isMark).map(readMark) : [],
    sketch: null,
    dimensions: {},
  };
  return images;
}

function readAssessment(raw, panelName) {
  const assessment = Object.fromEntries(ORDER.map((id) => [id, null]));
  if (!isObject(raw)) return assessment;
  for (const id of ORDER) {
    const value = raw[id];
    if (value == null) continue;
    if (!OUTCOME_IDS.includes(value)) {
      throw new SurveyFileError(
        `Panel "${panelName}" has "${value}" for ${id}, which is not one of ` +
          `${OUTCOME_IDS.join(', ')}.`,
      );
    }
    assessment[id] = value;
  }
  return assessment;
}

function readPhoto(raw) {
  if (!isObject(raw)) return null;
  const { src, width, height, name, omitted } = raw;
  if (omitted || typeof src !== 'string' || !src.startsWith('data:image/')) {
    // A survey saved without its photographs still opens; the pane says so.
    return width && height ? { src: null, width, height, name: name ?? '', omitted: true } : null;
  }
  if (!(width > 0) || !(height > 0)) throw new SurveyFileError('A photograph has no size.');
  return { src, width, height, name: name ?? '' };
}

function readScale(raw) {
  if (!isObject(raw)) return null;
  if (!(raw.pixelsPerMetre > 0)) return null;
  return { pixelsPerMetre: raw.pixelsPerMetre, reference: raw.reference ?? null };
}

/** Dimensions are free text, so they are cleaned rather than validated. */
function readDimensions(raw) {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 24);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = String(value);
  }
  return out;
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isPoint = (p) => isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y);
const isMark = (m) => isObject(m) && Array.isArray(m.points) && m.points.every(isPoint);

function readMark(raw) {
  return {
    id: typeof raw.id === 'string' ? raw.id : `mark-${Math.random().toString(36).slice(2, 8)}`,
    parameter: typeof raw.parameter === 'string' ? raw.parameter : null,
    kind: typeof raw.kind === 'string' ? raw.kind : 'note',
    label: typeof raw.label === 'string' ? raw.label : '',
    // What the surveyor called this quote: "t", "wall thickness", nothing.
    name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : '',
    points: raw.points.map((p) => ({ x: p.x, y: p.y })),
  };
}

/**
 * The working copy kept in the browser, so that a phone going to sleep in a
 * courtyard does not cost a morning's survey. It is a convenience and never
 * the record: storage can be full, cleared, or refused outright in a private
 * window, so every path through here tolerates failure in silence.
 */
export function saveLocal(project) {
  try {
    localStorage.setItem(STORE_KEY, toJSON(project));
    return { saved: true, withPhotos: true };
  } catch (err) {
    try {
      // Almost always the quota, and almost always the photographs.
      localStorage.setItem(STORE_KEY, toJSON(project, { withPhotos: false }));
      return { saved: true, withPhotos: false };
    } catch (err2) {
      return { saved: false, withPhotos: false };
    }
  }
}

export function loadLocal() {
  try {
    const text = localStorage.getItem(STORE_KEY);
    if (!text) return null;
    return parse(text);
  } catch (err) {
    return null;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (err) {
    /* nothing to do: the copy was a convenience */
  }
}

/** A file name that sorts by date and says what it is. */
export function fileNameFor(project) {
  const slug = (project.name || 'survey')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'survey'}-${project.date ?? new Date().toISOString().slice(0, 10)}.mqi.json`;
}

export { SurveyFileError };
