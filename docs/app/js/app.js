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
  VIEWS,
  VIEW,
  VIEW_IDS,
  activePanel,
  addPanel,
  duplicatePanel,
  imageOf,
  makeProject,
  marksOf,
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
import { annotate, createPhotoView } from './render/photo.js';
import { SKETCHES, sketchCaption, sketchSVG } from './render/sketches.js';
import { categoryBar, correlationChart } from './render/chart.js';

// ------------------------------------------------------------- utilities --

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/**
 * A number with the decimals it is worth, and no trailing zeros -- but only
 * after a decimal point. Stripping them unconditionally turned 1500 MPa into
 * 15 on the printed reference table, which is the kind of thing a reader
 * believes.
 */
const fmt = (v, n = 2) => {
  if (v == null || !Number.isFinite(Number(v))) return '--';
  const text = Number(v).toFixed(n);
  return text.includes('.') ? text.replace(/\.?0+$/, '') || '0' : text;
};

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
/** The photograph being worked on: the face, the section or the block. */
const imageNow = () => imageOf(panelOf());

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
    (imageNow().photo
      ? 'Pan and zoom freely; the tools above turn a click into a measurement.'
      : VIEW[panelOf().view].hint);
}

/**
 * What a completed drawing means depends on the tool it was drawn with and on
 * the parameter being assessed when it was drawn -- a traced path belongs to
 * the leaf connection on one step and to the vertical joints on another.
 */
function handlePoints(tool, points) {
  const panel = panelOf();
  const record = imageOf(panel);
  if (tool === 'scale') {
    pendingScale = points;
    askForDistance(points);
    return;
  }
  if (tool === 'ruler') {
    addMark(record, { parameter: 'SD', kind: 'ruler', points });
  } else if (tool === 'path') {
    // A path traced on a section is about the connection between the leaves; a
    // path traced on the face is about the vertical joints. Nothing about a
    // section tells you how the vertical joints of the face are staggered, so
    // the view decides there, and the step being worked on decides elsewhere.
    const parameter =
      panel.view === 'section'
        ? 'WC'
        : current() === 'WC' || current() === 'VJ'
          ? current()
          : 'VJ';
    addMark(record, { parameter, kind: 'path', points });
    if (current() !== parameter) step = ORDER.indexOf(parameter);
  } else if (tool === 'mark') {
    addMark(record, { parameter: current(), kind: 'mark', points });
  }
  view.refresh(record);
  render();
  save();
}

function addMark(record, { parameter, kind, points }) {
  record.marks.push({ id: nextId('mark'), parameter, kind, points, label: '' });
  labelMarks(record);
}

/** Labels are recomputed rather than stored: they are readings, not records. */
function labelMarks(record) {
  for (const mark of record.marks) {
    const m = measure(mark.points, record.scale);
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
    const record = imageNow();
    const scale = scaleFrom(points[0], points[1], length);
    if (!scale) return;
    record.scale = scale;
    labelMarks(record);
    pendingScale = null;
    stageForm.hidden = true;
    view.refresh(record);
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
  // Every path traced for this parameter, on whichever photograph it was
  // drawn, each measured against the scale of the photograph it belongs to.
  const readings = marksOf(panel, 'path', p.id).map((mark) => {
    const m = measure(mark.points, mark.scale);
    return {
      mark,
      m,
      check: checkChord(m.chordMetres, ML.straightDistance),
      implied: outcomeFromMl(bounds, m.ml),
    };
  });

  const list = readings.length
    ? `<ul class="measured-list">${readings
        .map(
          (r) => `<li>
            <b>M&#8348; ${r.m.ml?.toFixed(2) ?? '--'}</b>
            <span class="o-${r.implied ?? 'none'}">${r.implied ?? '--'}</span>
            <span class="meta">${
              r.m.chordMetres != null ? `over ${r.m.chordMetres.toFixed(2)} m` : 'unscaled'
            } &middot; ${esc(VIEW[r.mark.view].short.toLowerCase())}</span>
            <button type="button" data-drop-mark="${r.mark.id}" title="Remove">&times;</button>
          </li>`,
        )
        .join('')}</ul>`
    : '';

  const warning = readings.find((r) => r.check.ok === false);
  const unscaled = readings.some((r) => r.m.chordMetres == null);
  const elsewhere =
    p.id === 'WC' && readings.length === 0 && panel.view !== 'section'
      ? '<p class="help">M\u2097 for the leaf connection is measured on a <b>section</b>. Open the ' +
        'Wall section view on the right, load a photograph of a breach or a reveal, and trace it ' +
        'there. If nothing is exposed, pick one of the three sections instead.</p>'
      : '';

  return `<div class="tool-box">
    <h4>Minimum length M&#8348; &middot; ${esc(ML[p.quantitative].where)}</h4>
    <p class="help">Pick the <b>Path</b> tool and click along the mortar joints from one point to
      another about a metre away, then Finish. M&#8348; is that path divided by the straight
      distance: below ${bounds[0]} it is NF, above ${bounds[1]} it is F.</p>
    ${elsewhere}
    ${list}
    ${warning ? `<p class="status warn">${esc(warning.check.message)}</p>` : ''}
    ${
      unscaled
        ? '<p class="status warn">That photograph has no scale, so M\u2097 can be computed but not checked against the metre it should be measured over.</p>'
        : ''
    }
  </div>`;
}

function blockBox(panel) {
  const rulers = marksOf(panel, 'ruler');
  const measured = rulers.map((mark) => ({ mark, m: measure(mark.points, mark.scale) }));
  const stats = blockStatistics(measured.map((r) => r.m.pathMetres));
  const anyScale = VIEW_IDS.some((id) => panel.images[id].scale);
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
          <ul class="measured-list">${measured
            .map(
              (r) => `<li><b>${
                r.m.pathMetres != null ? `${(r.m.pathMetres * 100).toFixed(0)} cm` : '--'
              }</b><span class="meta">${esc(VIEW[r.mark.view].short.toLowerCase())}</span>
              <button type="button" data-drop-mark="${r.mark.id}" title="Remove">&times;</button></li>`,
            )
            .join('')}</ul>`
        : `<p class="meta">${
            anyScale
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

  const heads = resultHeads(s);

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

  const breakdown = breakdownTable(s);

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

/**
 * The three indices with their category bars, and the table that takes the
 * index apart. Both are wanted twice -- on the screen and on the printed
 * sheet -- and a report that redrew them its own way would eventually stop
 * agreeing with the application.
 */
function resultHeads(s) {
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
  return heads;
}

function breakdownTable(s) {
  const panel = s.panel;
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
  return breakdown;
}

/** How many decimals each property is worth quoting to. */
const DECIMALS = { fm: 2, tau0: 3, E: 0, G: 0 };

/** The four properties as a table, with the warning an interval deserves. */
function propertiesTable(s) {
  const p = s.properties;
  if (!p) return '';
  const rows = ['fm', 'tau0', 'E', 'G']
    .map(
      (id) => `<tr><td>${esc(p[id].symbol)} <span class="meta">${esc(p[id].name)}</span></td>
        <td>${fmt(p[id].min, DECIMALS[id])}</td>
        <td>${fmt(p[id].max, DECIMALS[id])}</td>
        <td class="meta">${esc(p[id].unit)}${p[id].derived ? ' &middot; E/3' : ''}</td></tr>`,
    )
    .join('');

  return `${
    p.spread
      ? '<p class="status warn">The survey is incomplete, so these are the widest values the ' +
        'correlation allows over the interval of the index, not an estimate.</p>'
      : ''
  }
    <table class="grid-table">
      <thead><tr><th></th><th>min</th><th>max</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function propertiesSection(s) {
  const p = s.properties;
  if (!p) return '<p class="help">Assign the parameters and the correlation curves follow.</p>';

  const mqiV = s.complete ? s.values.V : [s.indices.V.min, s.indices.V.max];
  const mqiShear = s.complete
    ? s.values[p.tau0From]
    : [s.indices[p.tau0From].min, s.indices[p.tau0From].max];

  return `${propertiesTable(s)}
    <p class="help">Fig. 10 of the paper: f&#8344; and E are read at the vertical index,
      &tau;&#8320; at the ${p.tau0From === 'I' ? 'in-plane' : 'vertical'} one.</p>
    ${correlationChart('fm', { mqi: mqiV, label: 'f\u2098 [MPa]' })}
    ${correlationChart('tau0', { mqi: mqiShear, label: '\u03c4\u2080 [MPa]' })}
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

  return `<label class="field"><span>Typology, for the comparison</span>
      <select id="typologySelect">${options}</select></label>
    <details class="app-details"><summary>Table 11 factors</summary>${factors}</details>
    ${codeTable(s)}`;
}

/** The comparison itself, without the controls: the screen and the report. */
function codeTable(s) {
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
  return table;
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

// ------------------------------------------------------- the other views --

/**
 * The strip that says what is being looked at. A view that already holds a
 * photograph or a drawing is marked, so that a survey with nothing in the
 * section view is visibly a survey with nothing in the section view.
 */
function renderViewTabs() {
  const panel = panelOf();
  $('viewTabs').innerHTML = VIEWS.map((v) => {
    const image = panel.images[v.id];
    const has = Boolean(image.photo || image.sketch);
    return `<button type="button" class="${v.id === panel.view ? 'active' : ''} ${
      has ? 'has-content' : ''
    }" data-view="${v.id}" role="tab" aria-selected="${v.id === panel.view}"
      title="${esc(v.hint)}"><span class="dot"></span>${esc(v.short)}</button>`;
  }).join('');
}

function renderAux() {
  const panel = panelOf();
  for (const id of ['section', 'block']) {
    const name = id[0].toUpperCase() + id.slice(1);
    $(`aux${name}`).classList.toggle('active', panel.view === id);
    $(`aux${name}Body`).innerHTML = auxBody(panel, id);
  }
}

/**
 * Either the photograph, as a thumbnail that opens it for measuring, or the
 * three hypotheses. Choosing one of those is an assessment of the parameter
 * the view belongs to, and it is applied as one.
 */
function auxBody(panel, id) {
  const image = panel.images[id];
  if (image.photo?.src) {
    const marks = image.marks.length;
    return `<button type="button" class="photo-thumb" data-open="${id}"
        title="Open this photograph for measuring">
        <img src="${image.photo.src}" alt="${esc(VIEW[id].name)}">
      </button>
      <p class="meta">${
        image.scale ? `${image.scale.pixelsPerMetre.toFixed(0)} px/m` : 'no scale yet'
      }${marks ? ` &middot; ${marks} mark${marks > 1 ? 's' : ''}` : ''}</p>`;
  }
  const chosen = SKETCHES[id].options.find((o) => o.outcome === image.sketch);
  return `<div class="sketch-choice">${SKETCHES[id].options
    .map(
      (o) => `<button type="button" class="sketch-option ${
        image.sketch === o.outcome ? 'chosen' : ''
      }" data-sketch="${id}" data-outcome="${o.outcome}"
        title="${esc(`${o.title}. ${o.caption}`)}">
        ${sketchSVG(id, o.outcome)}<span class="badge">${o.outcome}</span>
      </button>`,
    )
    .join('')}</div>
    <p class="meta">${
      chosen
        ? `<b>${esc(chosen.title)}.</b> Drawn, not photographed.`
        : esc(VIEW[id].noPhoto)
    }</p>`;
}

async function setView(id) {
  const panel = panelOf();
  panel.view = VIEW_IDS.includes(id) ? id : 'face';
  await view.show(imageOf(panel));
  render();
  save();
}

/**
 * A drawing is an inference, and an inference about the section IS the answer
 * to WC, so choosing one answers it -- and takes the wizard to that parameter,
 * where the criteria of the table can be read against the choice just made.
 */
function chooseSketch(id, outcome) {
  const panel = panelOf();
  const image = panel.images[id];
  image.sketch = image.sketch === outcome ? null : outcome;
  const parameter = VIEW[id].parameter;
  if (image.sketch && parameter) {
    panel.assessment[parameter] = image.sketch;
    step = ORDER.indexOf(parameter);
  }
  render();
  save();
}

$('viewTabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (button) setView(button.dataset.view);
});

$('aux').addEventListener('click', (event) => {
  const open = event.target.closest('[data-open]');
  if (open) {
    setView(open.dataset.open);
    return;
  }
  const sketch = event.target.closest('[data-sketch]');
  if (sketch) {
    chooseSketch(sketch.dataset.sketch, sketch.dataset.outcome);
    return;
  }
  const clear = event.target.closest('[data-clear]');
  if (!clear) return;
  const panel = panelOf();
  const id = clear.dataset.clear;
  panel.images[id] = { photo: null, scale: null, marks: [], sketch: null };
  if (panel.view === id) view.show(panel.images[id]);
  render();
  save();
});

// ----------------------------------------------------------------- render --

function render() {
  const panel = panelOf();
  $('panelName').value = panel.name;
  $('panelFamily').value = panel.family;
  $('panelLeaves').value = panel.leaves;
  const record = imageOf(panel);
  $('scaleReadout').hidden = !record.scale;
  if (record.scale) {
    $('scaleReadout').textContent = `${record.scale.pixelsPerMetre.toFixed(0)} px/m`;
  }
  renderViewTabs();
  renderAux();
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

/** A photograph belongs to one view, and replaces whatever that view held. */
async function loadPhotoInto(viewId, file) {
  try {
    const photo = await downscale(file);
    const panel = panelOf();
    const record = imageOf(panel, viewId);
    record.photo = photo;
    record.scale = null;
    record.marks = [];
    panel.view = viewId;
    await view.show(record);
    render();
    save();
    setHint('Now set the scale: pick Scale and click the two ends of something you know.');
  } catch (err) {
    setHint(`That image could not be read (${err.message}).`);
  }
}

for (const [id, viewId] of [
  ['photoFile', null],
  ['photoCamera', null],
  ['sectionFile', 'section'],
  ['blockFile', 'block'],
]) {
  $(id).addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) loadPhotoInto(viewId ?? panelOf().view, file);
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
    for (const id of VIEW_IDS) {
      panel.images[id].marks = panel.images[id].marks.filter(
        (m) => m.id !== drop.dataset.dropMark,
      );
    }
    view.refresh(imageOf(panel));
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
  await view.show(imageOf(panel));
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

$('printReport').addEventListener('click', async () => {
  const button = $('printReport');
  const was = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing...';
  try {
    $('report').innerHTML = await reportHTML();
    $('report').hidden = false;
    window.print();
  } finally {
    button.disabled = false;
    button.textContent = was;
    window.setTimeout(() => {
      $('report').hidden = true;
    }, 500);
  }
});

/**
 * Two sheets for each wall.
 *
 * The first follows the data sheets of Figs. 12 to 14: the photographs, what
 * the wall is made of, the seven outcomes in a strip. The photographs carry
 * the marks that were made on them, because a report that showed a bare
 * picture would be asking its reader to take the outcomes on trust.
 *
 * The second is what the application shows on the screen -- the indices, the
 * bars, the breakdown, the properties and the comparison with the code table
 * -- on paper, because that is the part of a survey anyone else will want to
 * argue with.
 */
async function reportHTML() {
  const summaries = summariseProject(project);

  // Annotating is asynchronous and building markup is not, so every
  // photograph is drawn first and the sheets are assembled from the results.
  const figures = new Map();
  for (const s of summaries) {
    for (const id of VIEW_IDS) {
      const src = await annotate(s.panel.images[id], { maxWidth: 1200 });
      if (src) figures.set(`${s.panel.id}:${id}`, src);
    }
  }

  const sheets = summaries.map((s) => dataSheet(s, figures) + resultSheet(s)).join('');
  return `<h2>${esc(project.name || 'Masonry quality survey')}</h2>
    <p class="meta">${[project.site, project.date, project.surveyor]
      .filter(Boolean)
      .map(esc)
      .join(' &middot; ')}</p>
    <p class="meta">Masonry Quality Index after Borri, Corradi, Castori and De Maria (2015).
      Computed with rapidMQI.</p>
    ${sheets}`;
}

function figureFor(panel, id, figures) {
  const record = panel.images[id];
  const v = VIEW[id];
  const src = figures.get(`${panel.id}:${id}`);
  if (src) {
    const marks = record.marks.length;
    return `<figure>
      <img src="${src}" alt="${esc(v.name)}">
      <figcaption><b>${esc(v.name)}.</b> Photograph${
        record.scale ? `, scaled at ${record.scale.pixelsPerMetre.toFixed(0)} px/m` : ', unscaled'
      }${marks ? `, with ${marks} measurement${marks > 1 ? 's' : ''} marked on it` : ''}.</figcaption>
    </figure>`;
  }
  if (record.sketch) {
    return `<figure>
      ${sketchSVG(id, record.sketch)}
      <figcaption><b>${esc(v.name)}.</b> ${esc(sketchCaption(id, record.sketch))}
        <em>Drawn, not photographed.</em></figcaption>
    </figure>`;
  }
  return `<figure><figcaption><b>${esc(v.name)}.</b> Not recorded.</figcaption></figure>`;
}

function dataSheet(s, figures) {
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
          ${
            s.properties.spread
              ? '<p class="help">Interval, not estimate: the survey is incomplete.</p>'
              : ''
          }`
        : ''
    }`;

  const notes = ORDER.filter((id) => panel.notes[id])
    .map((id) => `<p><b>${id}</b> ${esc(panel.notes[id])}</p>`)
    .join('');

  return `<article class="sheet">
    <div class="sheet-row"><div class="label">Views</div><div class="body">
      <div class="sheet-figures">
        ${VIEW_IDS.map((id) => figureFor(panel, id, figures)).join('')}
      </div>
    </div></div>
    <div class="sheet-row"><div class="label">Description</div><div class="body">
      <h2>${esc(panel.name || 'Untitled panel')}</h2>
      <p class="meta">${esc(project.name)}${project.site ? ` &middot; ${esc(project.site)}` : ''}
        ${project.date ? ` &middot; ${esc(project.date)}` : ''}
        ${project.surveyor ? ` &middot; ${esc(project.surveyor)}` : ''}</p>
      <p>${esc(panel.description || '')}</p>
      <p class="meta">${esc(FAMILIES.find((f) => f.id === panel.family)?.name ?? '')}
        &middot; ${esc(LEAVES[panel.leaves] ?? panel.leaves)}</p>
      ${notes}
    </div></div>
    <div class="sheet-row"><div class="label">Analysis</div><div class="body">
      ${outcomes}
      ${analysis}
    </div></div>
  </article>`;
}

function resultSheet(s) {
  const mqiV = s.complete ? s.values.V : [s.indices.V.min, s.indices.V.max];
  const shear = s.properties?.tau0From ?? project.tau0From ?? 'I';
  const mqiShear = s.complete ? s.values[shear] : [s.indices[shear].min, s.indices[shear].max];

  return `<article class="sheet">
    <div class="sheet-row"><div class="label">Results</div><div class="body">
      <h2>${esc(s.panel.name || 'Untitled panel')}</h2>
      <div class="results-grid">
        <div>
          <h3>The index, and its category</h3>
          ${resultHeads(s)}
          <h3>Where the index comes from</h3>
          ${breakdownTable(s)}
        </div>
        <div>
          <h3>Mechanical properties</h3>
          ${
            s.properties
              ? `${propertiesTable(s)}
                <div class="charts">
                  ${correlationChart('fm', { mqi: mqiV, label: 'fₘ [MPa]' })}
                  ${correlationChart('tau0', { mqi: mqiShear, label: 'τ₀ [MPa]' })}
                  ${correlationChart('E', { mqi: mqiV, label: 'E [MPa]' })}
                </div>`
              : '<p class="help">The survey has no index yet.</p>'
          }
          <h3>Against the code table</h3>
          ${codeTable(s)}
          ${normativeBlock(s)}
        </div>
      </div>
    </div></div>
  </article>`;
}

/** The reference values the estimate was checked against, and Table 9. */
function normativeBlock(s) {
  const ed = edition(project.edition);
  const row = s.comparison?.row;
  const applied = (row?.applied ?? [])
    .map((id) => FACTORS.find((f) => f.id === id)?.name)
    .filter(Boolean);

  return `<h3>Reference values</h3>
    <p class="code-note">${esc(ed.name)}${row ? `, "${esc(row.name)}"` : ''}.
      ${applied.length ? `Table 11 factors applied: ${esc(applied.join(', '))}.` : ''}</p>
    ${
      row
        ? `<table class="grid-table">
            <thead><tr><th></th><th>min</th><th>max</th></tr></thead>
            <tbody>
              <tr><td>f&#8344; [MPa]</td><td>${fmt(row.fm[0], 2)}</td><td>${fmt(row.fm[1], 2)}</td></tr>
              <tr><td>&tau;&#8320; [MPa]</td><td>${fmt(row.tau0[0], 3)}</td><td>${fmt(
                row.tau0[1],
                3,
              )}</td></tr>
              <tr><td>E [MPa]</td><td>${fmt(row.E[0], 0)}</td><td>${fmt(row.E[1], 0)}</td></tr>
              <tr><td>G [MPa]</td><td>${fmt(row.G[0], 0)}</td><td>${fmt(row.G[1], 0)}</td></tr>
              <tr><td>w [kN/m&sup3;]</td><td>${fmt(row.w, 0)}</td><td></td></tr>
            </tbody></table>`
        : '<p class="code-note">No typology was declared for this panel.</p>'
    }
    <h3>Classification, Table 9</h3>
    <table class="grid-table">
      <thead><tr><th>Actions</th><th>C</th><th>B</th><th>A</th></tr></thead>
      <tbody>${DIRECTIONS.map((d) => {
        const [low, high] = CATEGORIES[d.id].bounds;
        const here = s.indices[d.id].category;
        const cell = (label, text) =>
          `<td>${here.certain && here.low === label ? `<b>${text}</b>` : text}</td>`;
        return `<tr><td>${esc(d.short)}</td>${cell('C', `0 to ${low}`)}${cell(
          'B',
          `${low} to ${high}`,
        )}${cell('A', `${high} to 10`)}</tr>`;
      }).join('')}</tbody>
    </table>
    <p class="code-note">The printed table of the paper carries these labels in the order A, B, C
      above ranges running the other way; they are used here as the text and the worked examples
      of the paper mean them, C lowest and A highest.</p>`;
}

// ------------------------------------------------------------------ start --

(async function start() {
  await view.show(imageOf(panelOf()));
  setTool('pan');
  render();
  save();
})();
