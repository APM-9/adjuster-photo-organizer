// Freehand markup on a photo: circle the damage, mark the water line.
import { loadImage } from './images.js';
import { icon, openSheet } from './ui.js';

const COLORS = [['Red', '#ff2d2d'], ['Yellow', '#ffd400'], ['White', '#ffffff']];

/** save(canvas) stores the marked-up image; onDone() closes. */
export async function openMarkup(photo, { save, onDone }) {
  const el = openSheet(`
    <div class="markup" role="dialog" aria-modal="true">
      <div class="markup-stage"><canvas></canvas></div>
      <footer class="lab-foot">
        <div class="markup-tools">
          ${COLORS.map(([name, hex], i) => `<button type="button" class="swatch ${i ? '' : 'selected'}" data-color="${hex}" style="--c:${hex}" aria-label="${name}"></button>`).join('')}
          <button type="button" class="btn secondary" data-mk="undo">${icon('undo')}Undo</button>
        </div>
        <div class="btn-row">
          <button type="button" class="btn secondary" data-mk="cancel">Cancel</button>
          <button type="button" class="btn primary" data-mk="save">Save markup</button>
        </div>
      </footer>
    </div>`, { full: true });

  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const img = await loadImage(photo.blob);
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const width = Math.max(4, Math.round(canvas.width * 0.007));
  let color = COLORS[0][1];
  const strokes = [];
  let current = null;

  const drawStroke = (s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
    ctx.stroke();
  };
  const redraw = () => {
    ctx.drawImage(img, 0, 0);
    strokes.forEach(drawStroke);
  };
  redraw();

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    current = { color, width, pts: [point(e)] };
    strokes.push(current);
    drawStroke(current);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const [x0, y0] = current.pts[current.pts.length - 1];
    const [x, y] = point(e);
    current.pts.push([x, y]);
    ctx.strokeStyle = current.color;
    ctx.lineWidth = current.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  const end = () => { current = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  el.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s === b));
  }));
  el.querySelector('[data-mk="undo"]').addEventListener('click', () => { strokes.pop(); redraw(); });
  el.querySelector('[data-mk="cancel"]').addEventListener('click', onDone);
  el.querySelector('[data-mk="save"]').addEventListener('click', async () => {
    if (strokes.length) await save(canvas);
    onDone();
  });
}
