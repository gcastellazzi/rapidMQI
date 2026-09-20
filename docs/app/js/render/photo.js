/**
 * The photograph, and everything drawn on it.
 *
 * The view keeps a single transformation -- a zoom and a translation from
 * image pixels to screen pixels -- and every point it stores or reports is in
 * IMAGE pixels. Nothing outside this file needs to know where the picture
 * happens to be on the screen, which is what lets a survey be reopened on
 * another device and still have its marks in the right place.
 *
 * It works on one IMAGE RECORD at a time -- a photograph, its scale, and the
 * marks measured on it -- because a panel has three of them: the face, a
 * section through the thickness, and a typical block. Each is photographed
 * from a different distance, so each carries its own scale.
 *
 * The tools are all the same tool: collect points until enough have been
 * collected, then hand them back. What differs is how many are enough and what
 * the caller does with them.
 *
 * The same ink serves the screen and the report, so an annotated photograph on
 * a printed data sheet is the one from the screen and not an approximation of
 * it.
 */

const TOOLS = {
  pan: { points: 0 },
  scale: { points: 2, hint: 'Click the two ends of something whose length you know.' },
  ruler: { points: 2, hint: 'Click the two ends of the block to measure it.' },
  path: {
    points: Infinity,
    hint: 'Click along the mortar joints from one point to the other, then Finish.',
  },
  mark: { points: 1, hint: 'Click what you want to point at.' },
};

/** Marks are coloured by the parameter they belong to, not by the tool. */
const COLOURS = {
  WC: '#b34a32',
  VJ: '#1b6a45',
  SD: '#805e16',
  scale: '#157b70',
  draft: '#157b70',
  note: '#46615e',
};

const FONT = (size) => `${size}px Arial, Helvetica, sans-serif`;

// -------------------------------------------------------------- shared ink --

function strokePolyline(ctx, screen, colour, { dashed = false, width = 2, ends = true } = {}) {
  if (screen.length === 0) return;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([width * 3, width * 2.5]);
  ctx.beginPath();
  ctx.moveTo(screen[0].x, screen[0].y);
  for (const p of screen.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (ends) {
    for (const p of screen) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function strokeLabel(ctx, at, text, colour, k = 1) {
  if (!text) return;
  ctx.save();
  ctx.font = FONT(12 * k);
  const width = ctx.measureText(text).width + 10 * k;
  const height = 18 * k;
  const x = at.x + 8 * k;
  const y = at.y - height - 2 * k;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, k);
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#213b3e';
  ctx.fillText(text, x + 5 * k, y + height - 5 * k);
  ctx.restore();
}

/**
 * A quote: a dimension line with a tick at each end and the value sitting on
 * it, which is how a measurement is written on a drawing. The ruler draws
 * these, so that a thickness measured on a photograph of a section reads as a
 * dimension rather than as a stray line.
 */
function strokeDimension(ctx, screen, colour, text, k = 1) {
  const [a, b] = [screen[0], screen[screen.length - 1]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = (-dy / len) * 6 * k;
  const ty = (dx / len) * 6 * k;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.moveTo(a.x - tx, a.y - ty);
  ctx.lineTo(a.x + tx, a.y + ty);
  ctx.moveTo(b.x - tx, b.y - ty);
  ctx.lineTo(b.x + tx, b.y + ty);
  ctx.stroke();
  ctx.restore();
  strokeLabel(ctx, { x: (a.x + b.x) / 2 - 4 * k, y: (a.y + b.y) / 2 + 2 * k }, text, colour, k);
}

/**
 * The scale reference and every mark of one image record, in whatever
 * coordinates `toScreen` maps image pixels to. `k` scales the ink: 1 on
 * screen, larger when the drawing is made at the full resolution of the
 * photograph for a report.
 */
export function paintMarks(ctx, record, toScreen, k = 1) {
  if (!record) return;
  if (record.scale?.reference) {
    const { a, b, length } = record.scale.reference;
    strokePolyline(ctx, [a, b].map(toScreen), COLOURS.scale, { dashed: true, width: 2 * k });
    strokeLabel(ctx, toScreen(b), `${length} m`, COLOURS.scale, k);
  }
  for (const mark of record.marks ?? []) {
    const colour = COLOURS[mark.parameter] ?? COLOURS.note;
    if (mark.kind === 'mark' || mark.points.length === 1) {
      const p = toScreen(mark.points[0]);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 * k, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.restore();
      strokeLabel(ctx, p, mark.label, colour, k);
    } else if (mark.kind === 'ruler') {
      strokeDimension(ctx, mark.points.map(toScreen), colour, mark.label, k);
    } else {
      strokePolyline(ctx, mark.points.map(toScreen), colour, { width: 2 * k });
      strokeLabel(ctx, toScreen(mark.points[mark.points.length - 1]), mark.label, colour, k);
    }
  }
}

/** A chequered bar one metre long, when the photograph has a scale. */
function paintScaleBar(ctx, record, { w, h, zoom, k = 1 }) {
  const perMetre = record?.scale?.pixelsPerMetre;
  if (!perMetre) return;
  const onScreen = perMetre * zoom;
  if (!(onScreen > 20 * k) || onScreen > w * 0.8) return;
  const x = 16 * k;
  const y = h - 26 * k;
  const height = 7 * k;
  const segments = 4;
  ctx.save();
  for (let i = 0; i < segments; i += 1) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#213b3e';
    ctx.fillRect(x + (onScreen * i) / segments, y, onScreen / segments, height);
  }
  ctx.strokeStyle = '#213b3e';
  ctx.lineWidth = Math.max(1, k);
  ctx.strokeRect(x, y, onScreen, height);
  ctx.fillStyle = '#213b3e';
  ctx.font = FONT(11 * k);
  ctx.fillText('1 m', x + onScreen + 6 * k, y + height + k);
  ctx.restore();
}

/**
 * The photograph with its marks on it, as a data URL, at its own resolution.
 *
 * This is what goes on the printed data sheet: a reader of the report can see
 * the path that was traced for M_l and the blocks that were measured, rather
 * than being asked to take the outcome on trust.
 */
export function annotate(record, { maxWidth = 1400, quality = 0.88 } = {}) {
  const src = record?.photo?.src;
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * k);
      canvas.height = Math.round(img.naturalHeight * k);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // The ink is sized against the drawing, not against the original: a mark
      // two pixels wide on a four-thousand-pixel photograph is invisible once
      // the page is printed. The divisor is small on purpose -- these figures
      // end up four or five centimetres wide on a sheet of A4, and a label
      // that looks right on the screen is unreadable there.
      const ink = Math.max(1, canvas.width / 450);
      paintMarks(ctx, record, (p) => ({ x: p.x * k, y: p.y * k }), ink);
      paintScaleBar(ctx, record, { w: canvas.width, h: canvas.height, zoom: k, k: ink });
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ---------------------------------------------------------------- the view --

export function createPhotoView(canvas, { onPoints, onHint, onDraft } = {}) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, tx: 0, ty: 0 };
  let image = null; // HTMLImageElement
  let record = null; // { photo, scale, marks } -- the one being worked on
  let tool = 'pan';
  let draft = [];
  let hover = null;
  const pointers = new Map();
  let pinch = null;

  const toScreen = (p) => ({ x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty });
  const toImage = (q) => ({ x: (q.x - view.tx) / view.scale, y: (q.y - view.ty) / view.scale });

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function size() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function fit() {
    const { w, h } = size();
    if (!image) return;
    const k = Math.min(w / image.naturalWidth, h / image.naturalHeight) * 0.96;
    view.scale = k;
    view.tx = (w - image.naturalWidth * k) / 2;
    view.ty = (h - image.naturalHeight * k) / 2;
    draw();
  }

  function zoomAbout(factor, at) {
    const before = toImage(at);
    view.scale = Math.min(40, Math.max(0.02, view.scale * factor));
    const after = toScreen(before);
    view.tx += at.x - after.x;
    view.ty += at.y - after.y;
    draw();
  }

  /** Show an image record: its photograph, its scale and its marks. */
  function show(next) {
    record = next ?? null;
    draft = [];
    onDraft?.(0, tool);
    const src = record?.photo?.src ?? null;
    if (!src) {
      image = null;
      draw();
      return Promise.resolve(null);
    }
    if (image && image.src === src) {
      fit();
      return Promise.resolve(image);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        image = img;
        fit();
        resolve(img);
      };
      img.onerror = () => reject(new Error('The image could not be read.'));
      img.src = src;
    });
  }

  /** The same record, changed: redraw without reloading the bitmap. */
  function refresh(next) {
    if (next) record = next;
    draw();
  }

  function setTool(next) {
    tool = TOOLS[next] ? next : 'pan';
    draft = [];
    onDraft?.(0, tool);
    onHint?.(TOOLS[tool].hint ?? null);
    canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    draw();
  }

  function finishDraft() {
    if (tool === 'pan' || draft.length === 0) return;
    const wanted = TOOLS[tool].points;
    if (draft.length < Math.min(wanted, 2) && tool !== 'mark') return;
    const points = draft.map((p) => ({ ...p }));
    draft = [];
    onDraft?.(0, tool);
    onPoints?.(tool, points);
    draw();
  }

  function addPoint(p) {
    draft.push(p);
    const wanted = TOOLS[tool].points;
    if (draft.length >= wanted) {
      finishDraft();
      return;
    }
    onDraft?.(draft.length, tool);
    draw();
  }

  /**
   * A path is finished with Enter or a double click on a desktop, and neither
   * exists on the phone this is meant to be used from. The caller is told how
   * many points are down so that it can put a Finish button where a thumb can
   * reach it.
   */
  function undoPoint() {
    if (draft.length === 0) return;
    draft.pop();
    onDraft?.(draft.length, tool);
    draw();
  }

  // ---------------------------------------------------------------- input --

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const at = canvasPoint(event);
    pointers.set(event.pointerId, { at, moved: false, start: at });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) };
      draft = [];
      onDraft?.(0, tool);
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const at = canvasPoint(event);
    const state = pointers.get(event.pointerId);
    if (state) {
      const dx = at.x - state.at.x;
      const dy = at.y - state.at.y;
      if (Math.hypot(at.x - state.start.x, at.y - state.start.y) > 4) state.moved = true;
      state.at = at;

      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
        const centre = { x: (a.at.x + b.at.x) / 2, y: (a.at.y + b.at.y) / 2 };
        if (pinch.distance > 0) zoomAbout(distance / pinch.distance, centre);
        pinch.distance = distance;
        return;
      }
      if (pointers.size === 1 && (tool === 'pan' || event.shiftKey)) {
        view.tx += dx;
        view.ty += dy;
        draw();
        return;
      }
    }
    if (image) {
      hover = toImage(at);
      if (draft.length > 0 || tool !== 'pan') draw();
    }
  });

  function endPointer(event) {
    const state = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!state || !image) return;
    if (state.moved || tool === 'pan') return;
    addPoint(toImage(state.at));
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (event) => pointers.delete(event.pointerId));

  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!image) return;
      event.preventDefault();
      zoomAbout(Math.exp(-event.deltaY * 0.0015), canvasPoint(event));
    },
    { passive: false },
  );

  canvas.addEventListener('dblclick', (event) => {
    event.preventDefault();
    finishDraft();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && draft.length > 1) finishDraft();
    if (event.key === 'Escape' && draft.length > 0) {
      draft = [];
      onDraft?.(0, tool);
      draw();
    }
    if (event.key === 'Backspace' && draft.length > 0 && document.activeElement === canvas) {
      event.preventDefault();
      undoPoint();
    }
  });

  const observer = new ResizeObserver(() => {
    size();
    draw();
  });
  observer.observe(canvas);

  // ----------------------------------------------------------------- draw --

  function drawEmpty(w, h) {
    ctx.save();
    ctx.fillStyle = '#68807e';
    ctx.font = FONT(13);
    ctx.textAlign = 'center';
    ctx.fillText('No photograph in this view.', w / 2, h / 2 - 8);
    ctx.fillText('Load one, or take one, to begin.', w / 2, h / 2 + 12);
    ctx.restore();
  }

  function draw() {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    if (!image) {
      drawEmpty(w, h);
      return;
    }

    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    const at = toScreen({ x: 0, y: 0 });
    ctx.drawImage(
      image,
      at.x,
      at.y,
      image.naturalWidth * view.scale,
      image.naturalHeight * view.scale,
    );
    ctx.restore();

    paintMarks(ctx, record, toScreen, 1);

    if (draft.length > 0) {
      const live = hover && TOOLS[tool].points > draft.length ? [...draft, hover] : draft;
      strokePolyline(ctx, live.map(toScreen), COLOURS.draft, { dashed: true });
    }

    paintScaleBar(ctx, record, { w, h, zoom: view.scale });
  }

  function centreOf() {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  return {
    show,
    refresh,
    setTool,
    fit,
    draw,
    finish: finishDraft,
    undoPoint,
    zoomIn: () => zoomAbout(1.25, centreOf()),
    zoomOut: () => zoomAbout(0.8, centreOf()),
    cancel: () => {
      draft = [];
      onDraft?.(0, tool);
      draw();
    },
    get tool() {
      return tool;
    },
    get hasImage() {
      return Boolean(image);
    },
    destroy: () => observer.disconnect(),
  };
}
