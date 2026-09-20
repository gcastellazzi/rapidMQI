/**
 * The survey model and the file it is written to.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPanel,
  activePanel,
  duplicatePanel,
  makePanel,
  makeProject,
  progressOf,
  removePanel,
  summarise,
  summariseProject,
} from '../docs/app/js/core/project.js';
import { SurveyFileError, fileNameFor, parse, toJSON } from '../docs/app/js/core/persist.js';
import { blockStatistics, checkChord, measure, scaleFrom } from '../docs/app/js/core/measure.js';
import { ORDER } from '../docs/app/js/core/tables.js';

const FIG12 = { WC: 'F', MM: 'PF', SS: 'F', VJ: 'F', SM: 'F', HJ: 'F', SD: 'F' };

test('a new project has one empty panel, and it is the active one', () => {
  const project = makeProject();
  assert.equal(project.panels.length, 1);
  assert.equal(activePanel(project).id, project.activePanelId);
  assert.equal(progressOf(project.panels[0]).done, 0);
  assert.deepEqual(Object.keys(project.panels[0].assessment).sort(), [...ORDER].sort());
});

test('panels are added, duplicated and removed, and one always remains', () => {
  const project = makeProject();
  const second = addPanel(project);
  assert.equal(project.panels.length, 2);
  assert.equal(project.activePanelId, second.id);

  second.assessment = { ...FIG12 };
  second.photo = { src: 'data:image/png;base64,AAAA', width: 100, height: 80, name: 'wall.png' };
  const copy = duplicatePanel(project, second.id);
  assert.deepEqual(copy.assessment, FIG12, 'the outcomes are worth copying');
  assert.equal(copy.photo, null, 'the photograph is not: another wall needs its own');
  assert.notEqual(copy.id, second.id);

  assert.equal(removePanel(project, copy.id), true);
  assert.equal(removePanel(project, second.id), true);
  assert.equal(removePanel(project, project.panels[0].id), false, 'the last panel stays');
  assert.equal(project.panels.length, 1);
});

test('removing the active panel moves the survey to a neighbour', () => {
  const project = makeProject();
  const second = addPanel(project);
  removePanel(project, second.id);
  assert.ok(activePanel(project));
  assert.equal(project.panels.some((p) => p.id === project.activePanelId), true);
});

test('a complete panel gets an index, a category and properties', () => {
  const project = makeProject();
  const panel = activePanel(project);
  panel.assessment = { ...FIG12 };
  panel.typology = 'dressed-stone';
  const s = summarise(panel, project);
  assert.equal(s.complete, true);
  assert.deepEqual(s.values, { V: 8.5, I: 9, O: 9.5 });
  assert.equal(s.indices.O.category.label, 'A');
  assert.deepEqual([s.properties.fm.min, s.properties.fm.max], [6.25, 9.15]);
  assert.ok(s.comparison, 'a declared typology is compared with the code table');
});

test('an incomplete panel gets an interval, and no property is claimed as an estimate', () => {
  const project = makeProject();
  const panel = activePanel(project);
  panel.assessment = { ...FIG12, WC: null };
  const s = summarise(panel, project);
  assert.equal(s.complete, false);
  assert.equal(s.values.V, null);
  assert.deepEqual(s.missing, ['WC']);
  assert.equal(s.properties.spread, true);
  assert.ok(s.leverage.WC > 0, 'the survey says what going back would be worth');
});

test('a panel with no declared typology is not compared with anything', () => {
  const project = makeProject();
  const panel = activePanel(project);
  panel.assessment = { ...FIG12 };
  assert.equal(summarise(panel, project).comparison, null);
});

test('a project summarises every panel in it', () => {
  const project = makeProject();
  activePanel(project).assessment = { ...FIG12 };
  addPanel(project);
  const all = summariseProject(project);
  assert.equal(all.length, 2);
  assert.equal(all[0].complete, true);
  assert.equal(all[1].complete, false);
});

test('a survey survives the round trip to a file', () => {
  const project = makeProject({ name: 'Palazzo', site: 'Perugia', surveyor: 'GC' });
  const panel = activePanel(project);
  panel.name = 'North façade';
  panel.assessment = { ...FIG12 };
  panel.family = 'brick';
  panel.notes = { WC: 'Section exposed at the breach' };
  panel.scale = { pixelsPerMetre: 512, reference: { a: { x: 0, y: 0 }, b: { x: 512, y: 0 }, length: 1 } };
  panel.marks = [{ id: 'm1', parameter: 'VJ', kind: 'path', label: '', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }];
  panel.photo = { src: 'data:image/png;base64,AAAA', width: 640, height: 480, name: 'north.png' };

  const back = parse(toJSON(project));
  assert.equal(back.name, 'Palazzo');
  assert.equal(back.panels[0].name, 'North façade');
  assert.deepEqual(back.panels[0].assessment, panel.assessment);
  assert.equal(back.panels[0].photo.src, panel.photo.src);
  assert.equal(back.panels[0].scale.pixelsPerMetre, 512);
  assert.deepEqual(back.panels[0].marks[0].points, panel.marks[0].points);
  assert.equal(back.activePanelId, project.activePanelId);
  assert.deepEqual(summarise(back.panels[0], back).values, { V: 8.5, I: 9, O: 9.5 });
});

test('a survey can be written without its photographs, and still opens', () => {
  const project = makeProject();
  activePanel(project).photo = { src: 'data:image/png;base64,AAAA', width: 10, height: 10, name: 'x' };
  const light = parse(toJSON(project, { withPhotos: false }));
  assert.equal(light.panels[0].photo.src, null);
  assert.equal(light.panels[0].photo.omitted, true);
  assert.equal(light.panels[0].photo.width, 10, 'the size is kept, so marks still make sense');
});

test('a file that is not a survey is refused, and says why', () => {
  assert.throws(() => parse('{ not json'), SurveyFileError);
  assert.throws(() => parse('{}'), /no panels/);
  assert.throws(() => parse(JSON.stringify({ app: 'aLOTofImaginArches', panels: [{}] })), /aLOT/);
  assert.throws(
    () => parse(JSON.stringify({ app: 'rapidMQI', schema: 99, panels: [{}] })),
    /later version/,
  );
});

test('an outcome that is not an outcome stops the load', () => {
  const bad = JSON.stringify({
    app: 'rapidMQI',
    schema: 1,
    panels: [{ name: 'Wall', assessment: { ...FIG12, HJ: 'excellent' } }],
  });
  assert.throws(() => parse(bad), /excellent/);
});

test('missing parts of a panel are filled in rather than fatal', () => {
  const sparse = JSON.stringify({ app: 'rapidMQI', panels: [{ name: 'Wall' }] });
  const project = parse(sparse);
  assert.equal(project.panels[0].name, 'Wall');
  assert.equal(project.panels[0].family, 'stone');
  assert.deepEqual(Object.values(project.panels[0].assessment), Array(7).fill(null));
});

test('the file name says what the survey is and when it was made', () => {
  const name = fileNameFor(makeProject({ name: 'Palazzo dei Priori', date: '2026-03-04' }));
  assert.equal(name, 'palazzo-dei-priori-2026-03-04.mqi.json');
});

test('one known distance scales an image, and the ruler follows', () => {
  const scale = scaleFrom({ x: 0, y: 0 }, { x: 400, y: 300 }, 1);
  assert.equal(scale.pixelsPerMetre, 500);
  const m = measure([{ x: 0, y: 0 }, { x: 250, y: 0 }], scale);
  assert.equal(m.pathMetres, 0.5);
});

test('the minimum length ratio is the path over the chord', () => {
  const scale = scaleFrom({ x: 0, y: 0 }, { x: 1000, y: 0 }, 1);
  // A staircase path 1.6 m long between two points 1 m apart.
  const m = measure([{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 1000, y: 300 }], scale);
  assert.equal(m.chordMetres.toFixed(3), '1.044');
  assert.equal(m.ml, Math.round((1.3 / 1.044) * 1e4) / 1e4);
});

test('a measurement too short to mean anything is called out', () => {
  assert.equal(checkChord(0.3).ok, false);
  assert.match(checkChord(0.3).message, /0.5 m/);
  assert.equal(checkChord(0.7).ok, true);
  assert.equal(checkChord(1.2).ok, true);
  assert.equal(checkChord(null).ok, null, 'an unscaled photograph cannot be checked');
});

test('block dimensions are judged by the median, as Table 2 asks', () => {
  // "More than 50% of the elements have a large dimension above 40 cm."
  const big = blockStatistics([0.45, 0.5, 0.6, 0.3]);
  assert.equal(big.suggested, 'F');
  assert.equal(big.count, 4);
  const middling = blockStatistics([0.2, 0.25, 0.35, 0.45]);
  assert.equal(middling.suggested, 'PF');
  const small = blockStatistics([0.1, 0.15, 0.18]);
  assert.equal(small.suggested, 'NF');
  assert.equal(small.belowTwenty, 1);
  assert.equal(blockStatistics([]), null);
});

test('a panel made from nothing is still a panel', () => {
  const panel = makePanel();
  assert.equal(panel.marks.length, 0);
  assert.equal(panel.photo, null);
  assert.equal(summarise(panel).complete, false);
});
