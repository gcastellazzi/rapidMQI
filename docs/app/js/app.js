/**
 * rapidMQI -- the survey itself.
 *
 * This file is the interface and nothing else: it holds the project, wires the
 * controls, and renders. Every number it shows comes from core/, and if a
 * reader wants to check the method rather than the buttons, core/tables.js and
 * core/mqi.js are where to look.
 *
 * The shape of the session is: load a photograph, give it a scale, then answer
 * seven questions about the wall with the photograph in front of you. The
 * seventh answer is not the end -- an outcome can be revisited at any time,
 * and the index changes as it is -- but it is the point at which the wall has
 * a classification and a set of mechanical properties.
 */

import {
  CATEGORIES,
  DIRECTIONS,
  FAMILIES,
  ML,
  ORDER,
  OUTCOMES,
  PARAMETER,
  PARAMETERS,
  SCORES,
  criteriaFor,
} from './core/tables.js';
import { outcomeFromMl } from './core/mqi.js';
import {
  activePanel,
  addPanel,
  duplicatePanel,
  makeProject,
  nextId,
  progressOf,
  removePanel,
  summarise,
  summariseProject,
} from './core/project.js';
import {
  SurveyFileError,
  clearLocal,
  fileNameFor,
  loadLocal,
  parse,
  saveLocal,
  toJSON,
} from './core/persist.js';
import { blockStatistics, checkChord, measure, scaleFrom } from './core/measure.js';
import { EDITIONS, FACTORS, edition, rowsOf } from './core/reference.js';
import { createPhotoView } from './render/photo.js';
import { categoryBar, correlationChart } from './render/chart.js';

// ------------------------------------------------------------- utilities --

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const fmt = (v, n = 2) => (v == null ? '--' : Number(v).toFixed(n).replace(/\.?0+$/, '') || '0');

const LEAVES = {
  single: 'Single-leaf wall',
  double: 'Double-leaf wall',
  triple: 'Three or more leaves',
};

// ----------------------------------------------------------------- state --

let project = loadLocal() ?? makeProject();
let step = 0;
let pendingScale = null;

const panelOf = () => activePanel(project);
const current = () => ORDER[step];

// ------------------------------------------------------------ the canvas --

const stage = $('stage');
const stageForm = document.createElement('div');
stageForm.className = 'stage-form';
stageForm.hidden = true;
stage.insertBefore(stageForm, $('photo'));

const view = createPhotoView($('photo'), {
  onPoints: handlePoints,
  onHint: (text) => setHint(text),
  onDraft: renderDraft,
});

/**
 * While a path is being traced, the fold-out under the toolbar carries the
 * three things that can be done to it. Enter and a double click do the same as
 * Finish, but neither is available on a phone held up against a wall, which is
 * where this application is meant to be used.
 */
function renderDraft(count, tool) {
  if (pendingScale) return;
  if (!count || tool === 'pan' || tool === 'mark') {
    stageForm.hidden = true;
    stageForm.innerHTML = '';
    return;
  }
  stageForm.hidden = false;
  stageForm.innerHTML = `
    <span class="meta">${count} point${count === 1 ? '' : 's'} down</span>
    <button type="button" id="finishDraft" class="primary" ${count < 2 ? 'disabled' : ''}>Finish</button>
    <button type="button" id="undoPoint">Undo point</button>
    <button type="button" id="cancelDraft" class="subtle">Cancel</button>`;
  $('finishDraft').addEventListener('click', () => view.finish());
  $('undoPoint').addEventListener('click', () => view.undoPoint());
  $('cancelDraft').addEventListener('click', () => view.cancel());
}

function setHint(text) {
  $('hint').textContent =
    text ??
    (panelOf().photo
      ? 'Pan and zoom freely; the tools above turn a click into a measurement.'
      : 'Load a photograph of the wall, set its scale from something of known length, then work through the seven parameters.');
}

/**
 * What a completed drawing means depends on the tool it was drawn with and on
 * the parameter being assessed when it was drawn -- a traced path belongs to
 * the leaf connection on one step and to the vertical joints on another.
 */
function handlePoints(tool, points) {
  const panel = panelOf();
  if (tool === 'scale') {
    pendingScale = points;
    askForDistance(points);
    return;
  }
  if (tool === 'ruler') {
    addMark(panel, { parameter: 'SD', kind: 'ruler', points });
  } else if (tool === 'path') {
    const parameter = current() === 'WC' || current() === 'VJ' ? current() : 'VJ';
    addMark(panel, { parameter, kind: 'path', points });
    if (current() !== parameter) step = ORDER.indexOf(parameter);
  } else if (tool === 'mark') {
    addMark(panel, { parameter: current(), kind: 'mark', points });
  }
  view.setPanel(panel);
  render();
  save();
}

function addMark(panel, { parameter, kind, points }) {
  panel.marks.push({ id: nextId('mark'), parameter, kind, points, label: '' });
  labelMarks(panel);
}

/** Labels are recomputed rather than stored: they are readings, not records. */
function labelMarks(panel) {
  for (const mark of panel.marks) {
    const m = measure(mark.points, panel.scale);
    if (mark.kind === 'path') mark.label = m.ml != null ? `Mₗ ${m.ml.toFixed(2)}` : '';
    else if (mark.kind === 'ruler') {
      mark.label = m.pathMetres != null ? `${(m.pathMetres * 100).toFixed(0)} cm` : '';
    } else mark.label = mark.parameter ?? '';
  }
}

function askForDistance(points) {
  const m = measure(points, null);
  stageForm.hidden = false;
  stageForm.innerHTML = `
    <label class="field inline-field"><span>Distance between the two points</span>
      <input type="number" id="refLength" min="0.01" step="0.01" value="1" inputmode="decimal">
    </label>
    <span class="unit">m</span>
    <button type="button" id="applyScale" class="primary">Set scale</button>
    <button type="button" id="cancelScale" class="subtle">Cancel</button>
    <span class="meta">${m.pathPixels.toFixed(0)} px on the photograph</span>`;
  $('refLength').focus();
  $('refLength').select();
  $('applyScale').addEventListener('click', () => {
    const length = Number($('refLength').value);
    const panel = panelOf();
    const scale = scaleFrom(points[0], points[1], length);
    if (!scale) return;
    panel.scale = scale;
    labelMarks(panel);
    pendingScale = null;
    stageForm.hidden = true;
    view.setPanel(panel);
    setTool('pan');
    render();
    save();
  });
  $('cancelScale').addEventListener('click', () => {
    pendingScale = null;
    stageForm.hidden = true;
    view.cancel();
  });
}

// --------------------------------------------------------------- the step --

function renderSteps() {
  const panel = panelOf();
  $('steps').innerHTML = PARAMETERS.map((p, i) => {
    const outcome = panel.assessment[p.id];
    const classes = ['', i === step ? 'active' : '', outcome ? 'done' : ''].join(' ');
    return `<button type="button" class="${classes}" data-step="${i}" title="${esc(p.name)}">
      <span>${p.id}</span><span class="dot"></span>
    </button>`;
  }).join('');
}

function renderStep() {
  const panel = panelOf();
  const p = PARAMETER[current()];
  const chosen = panel.assessment[p.id];

  const outcomes = OUTCOMES.map((o) => {
    const { lines, note } = criteriaFor(p.id, o.id, panel.family);
    const scores = DIRECTIONS.map((d) => `${d.id}&nbsp;${SCORES[p.id][d.id][o.id]}`).join(' · ');
    const body = lines.length
      ? `<ul>${lines
          .map((c) => `<li class="${c.kind ?? ''}">${esc(c.text)}</li>`)
          .join('')}</ul>`
      : `<p class="silence">${esc(note ?? 'No criterion in the table applies here.')}</p>`;
    return `<button type="button" class="outcome ${chosen === o.id ? 'chosen' : ''}"
        data-outcome="${o.id}" aria-pressed="${chosen === o.id}">
      <span class="outcome-head">
        <strong class="badge">${o.id}</strong><span>${esc(o.name)}</span>
        <span class="scores">${scores}</span>
      </span>${body}
    </button>`;
  }).join('');

  const unknown = `<button type="button" class="outcome unknown ${chosen ? '' : 'chosen'}"
      data-outcome="" aria-pressed="${!chosen}">
    <span class="outcome-head"><strong class="badge">?</strong>
      <span>Not determinable</span></span>
    <p class="silence">Nothing was exposed that settles this. The index is then reported as the
      interval it is known to lie in, and the report says which observation would close it.</p>
  </button>`;

  $('step').innerHTML = `
    <p class="eyebrow">Parameter ${p.n} of 7 &middot; ${esc(p.table)}</p>
    <h3>${esc(p.name)}</h3>
    <p class="prompt">${esc(p.prompt)}</p>
    <p class="why">${esc(p.why)}</p>
    <div class="outcomes">${outcomes}${unknown}</div>
    ${p.hint ? `<p class="help">${esc(p.hint)}</p>` : ''}
    ${toolBox(panel, p)}
    <label class="field"><span>What you saw</span>
      <textarea id="note" rows="2" placeholder="The sentence that justifies this outcome.">${esc(
        panel.notes[p.id] ?? '',
      )}</textarea>
    </label>`;

  $('stepCount').textContent = `${step + 1} / 7`;
  $('prevStep').disabled = step === 0;
  $('nextStep').disabled = step === ORDER.length - 1;
}

/** The measuring aid for the parameters that have one: WC, VJ and SD. */
function toolBox(panel, p) {
  if (p.quantitative) return mlBox(panel, p);
  if (p.id === 'SD') return blockBox(panel);
  return '';
}

function mlBox(panel, p) {
  const bounds = ML[p.quantitative].bounds;
  const paths = panel.marks.filter((m) => m.kind === 'path' && m.parameter === p.id);
  const readings = paths.map((mark) => {
    const m = measure(mark.points, panel.scale);
    const check = checkChord(m.chordMetres, ML.straightDistance);
    const implied = outcomeFromMl(bounds, m.ml);
    return { mark, m, check, implied };
  });

  const list = readings.length
    ? `<ul class="measured-list">${readings
        .map(
          (r) => `<li>
            <b>M&#8348; ${r.m.ml?.toFixed(2) ?? '--'}</b>
            <span class="o-${r.implied ?? 'none'}">${r.implied ?? '--'}</span>
            <span class="meta">${
              r.m.chordMetres != null ? `over ${r.m.chordMetres.toFixed(2)} m` : 'unscaled'
            }</span>
            <button type="button" data-drop-mark="${r.mark.id}" title="Remove">&times;</button>
          </li>`,
        )
        .join('')}</ul>`
    : '';

  const warning = readings.find((r) => r.check.ok === false);
  return `<div class="tool-box">
    <h4>Minimum length M&#8348; &middot; ${esc(ML[p.quantitative].where)}</h4>
    <p class="help">Pick the <b>Path</b> tool and click along the mortar joints from one point to
      another about a metre away, then Finish. M&#8348; is that path divided by the straight
      distance: below ${bounds[0]} it is NF, above ${bounds[1]} it is F.</p>
    ${list}
    ${warning ? `<p class="status warn">${esc(warning.check.message)}</p>` : ''}
    ${
      !panel.scale
        ? '<p class="status warn">The photograph has no scale yet, so Mₗ can be computed but not checked against the metre it should be measured over.</p>'
        : ''
    }
  </div>`;
}

function blockBox(panel) {
  const rulers = panel.marks.filter((m) => m.kind === 'ruler');
  const sizes = rulers
    .map((mark) => measure(mark.points, panel.scale).pathMetres)
    .filter((v) => v != null);
  const stats = blockStatistics(sizes);
  return `<div class="tool-box">
    <h4>Block dimensions</h4>
    <p class="help">Pick the <b>Ruler</b> tool and click the two ends of a block. Table 2 asks
      about more than half of the elements, so what it wants is the median of a representative
      sample.</p>
    ${
      stats
        ? `<div class="reading"><b>${(stats.median * 100).toFixed(0)}</b><span>cm median of
            ${stats.count}</span><span class="o-${stats.suggested}">${stats.suggested}</span></div>
          <p class="meta">${(stats.belowTwenty * 100).toFixed(0)}% below 20 cm &middot;
            ${(stats.twentyToForty * 100).toFixed(0)}% between &middot;
            ${(stats.aboveForty * 100).toFixed(0)}% above 40 cm</p>
          <ul class="measured-list">${rulers
            .map((mark) => {
              const m = measure(mark.points, panel.scale);
              return `<li><b>${
                m.pathMetres != null ? `${(m.pathMetres * 100).toFixed(0)} cm` : '--'
              }</b><button type="button" data-drop-mark="${mark.id}" title="Remove">&times;</button></li>`;
            })
            .join('')}</ul>`
        : `<p class="meta">${
            panel.scale
              ? 'Nothing measured yet.'
              : 'Set the scale of the photograph first, or a measurement is only pixels.'
          }</p>`
    }
  </div>`;
}

// ------------------------------------------------------------- the result --

function renderResults() {
  const panel = panelOf();
  const s = summarise(panel, project);

  const heads = DIRECTIONS.map((d) => {
    const r = s.indices[d.id];
    const c = r.category;
    const grade = c.certain ? `grade-${c.low}` : 'grade-open';
    const index = r.exact
      ? `<span class="index">${fmt(r.value, 2)}</span>`
      : `<span class="index open">${fmt(r.min, 2)} to ${fmt(r.max, 2)}</span>`;
    return `<div class="result-row">
        <div>
          <div class="where">${esc(d.name)}</div>
          ${index}
          ${categoryBar(d.id, {
            min: r.min,
            max: r.max,
            value: r.value,
            bounds: CATEGORIES[d.id].bounds,
          })}
        </div>
        <span class="grade ${grade}" title="${esc(c.meaning ?? 'The category is still open')}">${esc(
          c.label,
        )}</span>
      </div>`;
  }).join('');

  const missing = s.complete
    ? ''
    : `<div class="callout"><strong>${s.missing.length} parameter${
        s.missing.length > 1 ? 's' : ''
      } still open.</strong> The index is an interval until ${
        s.missing.length > 1 ? 'they are' : 'it is'
      } settled.
      ${Object.entries(s.leverage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1)
        .map(
          ([id, gain]) =>
            `Going back for <b>${id}</b> (${esc(PARAMETER[id].short)}) would close the widest part
             of it, ${fmt(gain, 1)} points across the three loading conditions.`,
        )
        .join('')}</div>`;

  const breakdown = `<table class="grid-table">
    <thead><tr><th>Parameter</th><th></th>${DIRECTIONS.map(
      (d) => `<th>${d.id}</th>`,
    ).join('')}</tr></thead>
    <tbody>${ORDER.map((id) => {
      const outcome = panel.assessment[id];
      const cells = DIRECTIONS.map((d) => {
        const t = s.indices[d.id].terms[id];
        return `<td>${t.known ? fmt(t.score, 2) : `<span class="o-none">${fmt(t.min, 1)}&ndash;${fmt(
          t.max,
          1,
        )}</span>`}</td>`;
      }).join('');
      return `<tr><td>${id} <span class="meta">${esc(PARAMETER[id].short)}</span></td>
        <td><span class="o-${outcome ?? 'none'}">${outcome ?? '?'}</span></td>${cells}</tr>`;
    }).join('')}
    <tr class="total"><td>MQI</td><td>${
      s.complete ? `&times;${fmt(s.indices.V.multiplier, 2)}` : ''
    }</td>${DIRECTIONS.map((d) => {
      const r = s.indices[d.id];
      return `<td>${r.exact ? fmt(r.value, 2) : `${fmt(r.min, 1)}&ndash;${fmt(r.max, 1)}`}</td>`;
    }).join('')}</tr>
    </tbody></table>
    <p class="help">SM multiplies the other six, it is not added to them: the row above is the
      product. The columns are Table 8, read at the outcome chosen for each parameter.</p>`;

  $('paneResults').innerHTML = `
    <section>
      <h2>${esc(panel.name || 'This wall')}</h2>
      <div class="result-head">${heads}</div>
      ${missing}
    </section>
    <section>
      <h2>Where the index comes from</h2>
      ${breakdown}
    </section>
    <section>
      <h2>Mechanical properties</h2>
      ${propertiesSection(s)}
    </section>
    <section>
      <h2>Against the code table</h2>
      ${codeSection(s)}
    </section>`;
}

function propertiesSection(s) {
  const p = s.properties;
  if (!p) return '<p class="help">Assign the parameters and the correlation curves follow.</p>';
  const spread = p.spread;
  const rows = ['fm', 'tau0', 'E', 'G']
    .map(
      (id) => `<tr><td>${esc(p[id].symbol)} <span class="meta">${esc(p[id].name)}</span></td>
        <td>${fmt(p[id].min, p[id].unit === 'MPa' && id !== 'E' && id !== 'G' ? 3 : 0)}</td>
        <td>${fmt(p[id].max, p[id].unit === 'MPa' && id !== 'E' && id !== 'G' ? 3 : 0)}</td>
        <td class="meta">${esc(p[id].unit)}${p[id].derived ? ' &middot; E/3' : ''}</td></tr>`,
    )
    .join('');

  const mqiV = s.complete ? s.values.V : [s.indices.V.min, s.indices.V.max];
  const mqiShear = s.complete
    ? s.values[p.tau0From]
    : [s.indices[p.tau0From].min, s.indices[p.tau0From].max];

  return `
    ${
      spread
        ? '<p class="status warn">The survey is incomplete, so these are the widest values the ' +
          'correlation allows over the interval of the index, not an estimate.</p>'
        : ''
    }
    <table class="grid-table">
      <thead><tr><th></th><th>min</th><th>max</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="help">Fig. 10 of the paper: f&#8344; and E are read at the vertical index,
      &tau;&#8320; at the ${p.tau0From === 'I' ? 'in-plane' : 'vertical'} one.</p>
    ${correlationChart('fm', { mqi: mqiV, label: 'fₘ [MPa]' })}
    ${correlationChart('tau0', { mqi: mqiShear, label: 'τ₀ [MPa]' })}
    ${correlationChart('E', { mqi: mqiV, label: 'E [MPa]' })}`;
}

function codeSection(s) {
  const panel = s.panel;
  const rows = rowsOf(project.edition);
  const options = [
    `<option value="">Not declared</option>`,
    ...rows.map(
      (r) =>
        `<option value="${r.id}" ${panel.typology === r.id ? 'selected' : ''}>${esc(r.name)}</option>`,
    ),
  ].join('');

  const factors = FACTORS.map(
    (f) => `<label class="check"><input type="checkbox" data-factor="${f.id}" ${
      panel.factors.includes(f.id) ? 'checked' : ''
    }><span>${esc(f.name)} &times;${f.factor}</span></label>`,
  ).join('');

  const table = s.comparison
    ? `<table class="grid-table">
        <thead><tr><th></th><th>this wall</th><th>${esc(
          edition(project.edition).short,
        )}</th><th></th></tr></thead>
        <tbody>${s.comparison.rows
          .map((r) => {
            const tone = r.overlaps ? 'ok' : 'bad';
            const word = r.overlaps ? 'meets' : r.direction;
            return `<tr><td>${esc(r.id === 'tau0' ? 'τ₀' : r.id)}</td>
              <td>${fmt(r.estimate[0], 3)}&ndash;${fmt(r.estimate[1], 3)}</td>
              <td>${fmt(r.reference[0], 3)}&ndash;${fmt(r.reference[1], 3)}</td>
              <td><span class="status ${tone}">${esc(word)}</span></td></tr>`;
          })
          .join('')}</tbody></table>
      <p class="help">${
        s.comparison.agrees
          ? 'The estimate meets the table for every parameter that was fitted.'
          : 'Where the two do not meet, either the declared typology or one of the outcomes is ' +
            'worth revisiting. The correlation is known to run above the table at the top of ' +
            'the scale.'
      }</p>`
    : '<p class="help">Declare which row of the table this wall is meant to be, and the estimate is checked against it.</p>';

  return `<label class="field"><span>Typology, for the comparison</span>
      <select id="typologySelect">${options}</select></label>
    <details class="app-details"><summary>Table 11 factors</summary>${factors}</details>
    ${table}`;
}

// ------------------------------------------------------------ the project --

function renderProject() {
  $('projectName').value = project.name;
  $('projectSite').value = project.site;
  $('projectDate').value = project.date;
  $('projectSurveyor').value = project.surveyor;
  $('tau0Select').value = project.tau0From;

  $('panelList').innerHTML = project.panels
    .map((p) => {
      const s = summarise(p, project);
      const progress = progressOf(p);
      const grade = s.complete ? s.indices.V.category.label : `${progress.done}/7`;
      return `<div class="panel-card ${p.id === project.activePanelId ? 'active' : ''}"
          data-panel="${p.id}" role="button" tabindex="0">
        <div><div class="name">${esc(p.name || 'Untitled')}</div>
          <div class="sub">${esc(p.location || FAMILIES.find((f) => f.id === p.family)?.name || '')}
            &middot; ${
              s.complete
                ? `MQI ${fmt(s.values.V, 1)} / ${fmt(s.values.I, 1)} / ${fmt(s.values.O, 1)}`
                : `${progress.done} of 7 assigned`
            }</div></div>
        <div class="acts">
          <span class="pill">${esc(grade)}</span>
          <button type="button" data-copy="${p.id}" title="Duplicate">&#9783;</button>
          <button type="button" data-remove="${p.id}" title="Remove">&times;</button>
        </div>
      </div>`;
    })
    .join('');

  const all = summariseProject(project);
  $('projectTable').innerHTML = `<table class="grid-table">
    <thead><tr><th>Panel</th><th>V</th><th>I</th><th>O</th><th>class</th></tr></thead>
    <tbody>${all
      .map((s) => {
        const cell = (d) =>
          s.indices[d].exact
            ? fmt(s.indices[d].value, 1)
            : `<span class="o-none">${fmt(s.indices[d].min, 1)}&ndash;${fmt(
                s.indices[d].max,
                1,
              )}</span>`;
        return `<tr><td>${esc(s.panel.name || 'Untitled')}</td>
          <td>${cell('V')}</td><td>${cell('I')}</td><td>${cell('O')}</td>
          <td>${['V', 'I', 'O'].map((d) => esc(s.indices[d].category.label)).join(' ')}</td></tr>`;
      })
      .join('')}</tbody></table>`;

  $('editionSelect').innerHTML = Object.values(EDITIONS)
    .map(
      (e) => `<option value="${e.id}" ${project.edition === e.id ? 'selected' : ''}>${esc(
        e.name,
      )}</option>`,
    )
    .join('');
  $('methodNote').textContent =
    `The correlation curves were fitted on ${edition(project.edition).short}, so that is the ` +
    'edition they are coherent with. Table 9 of the paper prints its category labels in the ' +
    'order A, B, C above ranges that run the other way; rapidMQI classifies C low and A high, ' +
    'which is what the text and the worked examples mean.';
}

// ----------------------------------------------------------------- render --

function render() {
  const panel = panelOf();
  $('panelName').value = panel.name;
  $('panelFamily').value = panel.family;
  $('panelLeaves').value = panel.leaves;
  $('scaleReadout').hidden = !panel.scale;
  if (panel.scale) {
    $('scaleReadout').textContent = `${panel.scale.pixelsPerMetre.toFixed(0)} px/m`;
  }
  renderSteps();
  renderStep();
  renderResults();
  renderProject();
  setHint(null);
}

function save() {
  const result = saveLocal(project);
  $('storeNote').textContent = result.saved
    ? result.withPhotos
      ? 'A working copy is kept in this browser.'
      : 'A working copy is kept in this browser, without the photographs: they did not fit.'
    : 'This browser refused to keep a working copy. Save the survey to a file.';
}

// ------------------------------------------------------------------ input --

function setTool(id) {
  for (const button of document.querySelectorAll('.toolbar .tool')) {
    button.classList.toggle('active', button.dataset.tool === id);
  }
  view.setTool(id);
}

document.querySelector('.toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('.tool');
  if (!button) return;
  setTool(button.dataset.tool);
});

$('zoomIn').addEventListener('click', () => view.zoomIn());
$('zoomOut').addEventListener('click', () => view.zoomOut());
$('zoomFit').addEventListener('click', () => view.fit());

for (const id of ['photoFile', 'photoCamera']) {
  $(id).addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const photo = await downscale(file);
      const panel = panelOf();
      panel.photo = photo;
      panel.scale = null;
      panel.marks = [];
      await view.setImage(photo.src);
      view.setPanel(panel);
      render();
      save();
      setHint('Now set the scale: pick Scale and click the two ends of something you know.');
    } catch (err) {
      setHint(`That image could not be read (${err.message}).`);
    }
  });
}
if ((navigator.maxTouchPoints ?? 0) > 0) $('cameraBtn').hidden = false;

/**
 * A photograph from a phone is four thousand pixels wide and eight megabytes,
 * and the survey carries it inside a JSON file. Two thousand pixels on the
 * long side is more than the eye needs at the zoom levels this work is done
 * at, and it keeps a survey of a dozen walls to something that can be emailed.
 */
async function downscale(file, maxSide = 2000, quality = 0.85) {
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('not an image'));
    image.src = src;
  });
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && src.length < 1.5e6) {
    return { src, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    src: canvas.toDataURL('image/jpeg', quality),
    width: canvas.width,
    height: canvas.height,
    name: file.name,
  };
}

// Tabs.
for (const tab of document.querySelectorAll('#panel .tabs .tab')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('#panel .tabs .tab')) {
      const on = other === tab;
      other.classList.toggle('active', on);
      other.setAttribute('aria-selected', String(on));
    }
    for (const pane of ['survey', 'results', 'project']) {
      $(`pane${pane[0].toUpperCase()}${pane.slice(1)}`).hidden = pane !== tab.dataset.pane;
    }
  });
}

// The seven, and the answers to them.
$('steps').addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (!button) return;
  step = Number(button.dataset.step);
  render();
});

$('step').addEventListener('click', (event) => {
  const drop = event.target.closest('[data-drop-mark]');
  if (drop) {
    const panel = panelOf();
    panel.marks = panel.marks.filter((m) => m.id !== drop.dataset.dropMark);
    view.setPanel(panel);
    render();
    save();
    return;
  }
  const choice = event.target.closest('.outcome');
  if (!choice) return;
  const panel = panelOf();
  panel.assessment[current()] = choice.dataset.outcome || null;
  render();
  save();
});

$('step').addEventListener('input', (event) => {
  if (event.target.id !== 'note') return;
  panelOf().notes[current()] = event.target.value;
  save();
});

$('prevStep').addEventListener('click', () => {
  step = Math.max(0, step - 1);
  render();
});
$('nextStep').addEventListener('click', () => {
  step = Math.min(ORDER.length - 1, step + 1);
  render();
});

// This wall.
$('panelName').addEventListener('input', (event) => {
  panelOf().name = event.target.value;
  renderProject();
  save();
});
$('panelFamily').innerHTML = FAMILIES.map(
  (f) => `<option value="${f.id}">${esc(f.name)}</option>`,
).join('');
$('panelFamily').addEventListener('change', (event) => {
  panelOf().family = event.target.value;
  render();
  save();
});
$('panelLeaves').addEventListener('change', (event) => {
  panelOf().leaves = event.target.value;
  save();
});

// The result pane's own controls.
$('paneResults').addEventListener('change', (event) => {
  const panel = panelOf();
  if (event.target.id === 'typologySelect') {
    panel.typology = event.target.value || null;
  } else if (event.target.dataset.factor) {
    const id = event.target.dataset.factor;
    panel.factors = event.target.checked
      ? [...new Set([...panel.factors, id])]
      : panel.factors.filter((f) => f !== id);
  } else return;
  renderResults();
  save();
});

// The building.
$('projectName').addEventListener('input', (e) => {
  project.name = e.target.value;
  save();
});
$('projectSite').addEventListener('input', (e) => {
  project.site = e.target.value;
  save();
});
$('projectDate').addEventListener('input', (e) => {
  project.date = e.target.value;
  save();
});
$('projectSurveyor').addEventListener('input', (e) => {
  project.surveyor = e.target.value;
  save();
});
$('editionSelect').addEventListener('change', (e) => {
  project.edition = e.target.value;
  render();
  save();
});
$('tau0Select').addEventListener('change', (e) => {
  project.tau0From = e.target.value;
  render();
  save();
});

$('addPanel').addEventListener('click', () => {
  addPanel(project);
  step = 0;
  switchPanel();
});

$('panelList').addEventListener('click', (event) => {
  const copy = event.target.closest('[data-copy]');
  if (copy) {
    duplicatePanel(project, copy.dataset.copy);
    switchPanel();
    return;
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    if (!removePanel(project, remove.dataset.remove)) {
      setHint('A survey keeps at least one panel.');
      return;
    }
    switchPanel();
    return;
  }
  const card = event.target.closest('[data-panel]');
  if (!card) return;
  project.activePanelId = card.dataset.panel;
  switchPanel();
});

async function switchPanel() {
  const panel = panelOf();
  await view.setImage(panel.photo?.src ?? null);
  view.setPanel(panel);
  step = 0;
  render();
  save();
}

// Files.
$('saveFile').addEventListener('click', () => {
  download(fileNameFor(project), toJSON(project), 'application/json');
});

$('openFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    project = parse(await file.text());
    await switchPanel();
    setHint(`Opened ${file.name}.`);
  } catch (err) {
    setHint(err instanceof SurveyFileError ? err.message : `That file could not be read.`);
  }
});

$('newProject').addEventListener('click', () => {
  if (!window.confirm('Start again? The survey in this browser will be cleared.')) return;
  clearLocal();
  project = makeProject();
  switchPanel();
});

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --------------------------------------------------------------- report ---

$('printReport').addEventListener('click', () => {
  $('report').innerHTML = reportHTML();
  $('report').hidden = false;
  window.print();
  window.setTimeout(() => {
    $('report').hidden = true;
  }, 500);
});

/**
 * The printed sheet follows the data sheets of Figs. 12 to 14: the photograph,
 * what the wall is made of, the seven outcomes in a strip, and the analysis.
 * A reader who knows the paper recognises the page.
 */
function reportHTML() {
  const sheets = summariseProject(project)
    .map((s) => {
      const panel = s.panel;
      const outcomes = `<div class="outcomes-strip">
          ${ORDER.map((id) => `<div class="h">${id}</div>`).join('')}
          ${ORDER.map((id) => {
            const o = panel.assessment[id];
            return `<div class="o-${o ?? 'none'}">${o ?? '?'}</div>`;
          }).join('')}
        </div>`;

      const analysis = `<table class="grid-table">
        <thead><tr><th></th>${DIRECTIONS.map((d) => `<th>${esc(d.short)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>MQI</td>${DIRECTIONS.map((d) => {
            const r = s.indices[d.id];
            return `<td>${r.exact ? fmt(r.value, 2) : `${fmt(r.min, 1)}&ndash;${fmt(r.max, 1)}`}</td>`;
          }).join('')}</tr>
          <tr><td>Category</td>${DIRECTIONS.map(
            (d) => `<td>${esc(s.indices[d.id].category.label)}</td>`,
          ).join('')}</tr>
        </tbody></table>
        ${
          s.properties
            ? `<table class="grid-table"><tbody>
                <tr><td>f&#8344; [MPa]</td><td>${fmt(s.properties.fm.min, 2)}&ndash;${fmt(
                  s.properties.fm.max,
                  2,
                )}</td>
                <td>&tau;&#8320; [MPa]</td><td>${fmt(s.properties.tau0.min, 3)}&ndash;${fmt(
                  s.properties.tau0.max,
                  3,
                )}</td>
                <td>E [MPa]</td><td>${fmt(s.properties.E.min, 0)}&ndash;${fmt(
                  s.properties.E.max,
                  0,
                )}</td></tr></tbody></table>
              ${s.properties.spread ? '<p class="help">Interval, not estimate: the survey is incomplete.</p>' : ''}`
            : ''
        }`;

      const notes = ORDER.filter((id) => panel.notes[id])
        .map((id) => `<p><b>${id}</b> ${esc(panel.notes[id])}</p>`)
        .join('');

      return `<article class="sheet">
        <div class="sheet-row"><div class="label">Photo</div><div class="body sheet-photo">
          ${
            panel.photo?.src
              ? `<img src="${panel.photo.src}" alt="${esc(panel.name)}">`
              : '<p class="help">No photograph.</p>'
          }
        </div></div>
        <div class="sheet-row"><div class="label">Description</div><div class="body">
          <h2>${esc(panel.name || 'Untitled panel')}</h2>
          <p class="meta">${esc(project.name)}${project.site ? ` &middot; ${esc(project.site)}` : ''}
            ${project.date ? ` &middot; ${esc(project.date)}` : ''}
            ${project.surveyor ? ` &middot; ${esc(project.surveyor)}` : ''}</p>
          <p>${esc(panel.description || '')}</p>
          <p class="meta">${esc(FAMILIES.find((f) => f.id === panel.family)?.name ?? '')}
            &middot; ${esc(LEAVES[panel.leaves] ?? panel.leaves)}
            ${panel.scale ? `&middot; scaled at ${panel.scale.pixelsPerMetre.toFixed(0)} px/m` : ''}</p>
          ${notes}
        </div></div>
        <div class="sheet-row"><div class="label">Analysis</div><div class="body">
          ${outcomes}
          ${analysis}
        </div></div>
      </article>`;
    })
    .join('');

  return `<h2>${esc(project.name || 'Masonry quality survey')}</h2>
    <p class="meta">Masonry Quality Index after Borri, Corradi, Castori and De Maria (2015).
      Computed with rapidMQI.</p>
    ${sheets}`;
}

// ------------------------------------------------------------------ start --

(async function start() {
  const panel = panelOf();
  if (panel.photo?.src) await view.setImage(panel.photo.src);
  view.setPanel(panel);
  setTool('pan');
  render();
  save();
})();
