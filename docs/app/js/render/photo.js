/**
 * The photograph, and everything drawn on it.
 *
 * The view keeps a single transformation -- a zoom and a translation from
 * image pixels to screen pixels -- and every point it stores or reports is in
 * IMAGE pixels. Nothing outside this file needs to know where the picture
 * happens to be on the screen, which is what lets a survey be reopened on
 * another device and still have its marks in the right place.
 *
 * The tools are all the same tool: collect points until enough have been
 * collected, then hand them back. What differs is how many are enough and what
 * the caller does with them.
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

export function createPhotoView(canvas, { onPoints, onHint, onDraft } = {}) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, tx: 0, ty: 0 };
  let image = null; // HTMLImageElement
  let panel = null; // the survey panel, for its marks and its scale
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

  function setImage(src) {
    draft = [];
    if (!src) {
      image = null;
      draw();
      return Promise.resolve(null);
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

  function setPanel(next) {
    panel = next;
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

  canvas.addEventListener('wheel', (event) => {
    if (!image) return;
    event.preventDefault();
    zoomAbout(Math.exp(-event.deltaY * 0.0015), canvasPoint(event));
  }, { passive: false });

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

  function drawPolyline(points, colour, { dashed = false, width = 2, ends = true } = {}) {
    if (points.length === 0) return;
    const screen = points.map(toScreen);
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(screen[0].x, screen[0].y);
    for (const p of screen.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ends) {
      for (const p of screen) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLabel(at, text, colour) {
    if (!text) return;
    ctx.save();
    ctx.font = '12px Arial, Helvetica, sans-serif';
    const width = ctx.measureText(text).width + 10;
    const x = at.x + 8;
    const y = at.y - 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, width, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#213b3e';
    ctx.fillText(text, x + 5, y + 13);
    ctx.restore();
  }

  /** A chequered bar one metre long, when the photograph has a scale. */
  function drawScaleBar(w, h) {
    const perMetre = panel?.scale?.pixelsPerMetre;
    if (!perMetre) return;
    const onScreen = perMetre * view.scale;
    if (!(onScreen > 20) || onScreen > w * 0.8) return;
    const x = 16;
    const y = h - 26;
    const segments = 4;
    ctx.save();
    for (let i = 0; i < segments; i += 1) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#213b3e';
      ctx.fillRect(x + (onScreen * i) / segments, y, onScreen / segments, 7);
    }
    ctx.strokeStyle = '#213b3e';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, onScreen, 7);
    ctx.fillStyle = '#213b3e';
    ctx.font = '11px Arial, Helvetica, sans-serif';
    ctx.fillText('1 m', x + onScreen + 6, y + 8);
    ctx.restore();
  }

  function draw() {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    if (!image) {
      ctx.save();
      ctx.fillStyle = '#68807e';
      ctx.font = '13px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No photograph yet.', w / 2, h / 2 - 8);
      ctx.fillText('Load one, or take one, to begin the survey.', w / 2, h / 2 + 12);
      ctx.restore();
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

    if (panel?.scale?.reference) {
      const { a, b } = panel.scale.reference;
      drawPolyline([a, b], COLOURS.scale, { dashed: true });
      drawLabel(toScreen(b), `${panel.scale.reference.length} m`, COLOURS.scale);
    }

    for (const mark of panel?.marks ?? []) {
      const colour = COLOURS[mark.parameter] ?? COLOURS.note;
      if (mark.kind === 'mark' || mark.points.length === 1) {
        const p = toScreen(mark.points[0]);
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();
      } else {
        drawPolyline(mark.points, colour, { dashed: mark.kind === 'chord' });
      }
      drawLabel(toScreen(mark.points[mark.points.length - 1]), mark.label, colour);
    }

    if (draft.length > 0) {
      const live = hover && TOOLS[tool].points > draft.length ? [...draft, hover] : draft;
      drawPolyline(live, COLOURS.draft, { dashed: true });
    }

    drawScaleBar(w, h);
  }

  return {
    setImage,
    setPanel,
    setTool,
    fit,
    draw,
    zoomIn: () => zoomAbout(1.25, centreOf()),
    zoomOut: () => zoomAbout(0.8, centreOf()),
    finish: finishDraft,
    undoPoint,
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

  function centreOf() {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }
}
