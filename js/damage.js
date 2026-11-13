// Damage entries: one line of scope per room (category, action, quantity,
// water line, notes), with photos linked to it.
import { DAMAGE_CATEGORIES, UNITS, ACTIONS } from './config.js';
import { esc, uid, icon, openSheet, chipGroup, wireChips, attachMic, micButton, autosize, toast } from './ui.js';

const ORDER = Object.fromEntries(DAMAGE_CATEGORIES.map(([c], i) => [c, i]));

export const defaultUnit = (category) => DAMAGE_CATEGORIES.find(([c]) => c === category)?.[1] || '';

// Scoping order: ceiling to floor, then fixtures and contents.
export function sortedDamages(room) {
  return [...(room.damages || [])].sort((a, b) =>
    (ORDER[a.category] ?? 99) - (ORDER[b.category] ?? 99) || a.createdAt - b.createdAt);
}

export const damageTitle = (d) => (d.category === 'Other' && d.categoryOther ? d.categoryOther : d.category || 'Damage');

export const damageQty = (d) => (d.qty ? `${d.qty} ${d.unit || ''}`.trim() : '');

export function damageDetail(d) {
  return [d.action, damageQty(d), d.waterLine ? `water line ${d.waterLine} in` : ''].filter(Boolean).join(' · ');
}

/**
 * Full-screen editor for one damage entry.
 * persist(): save claims. capture(damageId): open the camera for this entry
 * (must run inside the tap). photosFor(damageId) → linked photos.
 * thumbUrl(photo) → image URL. unlink(damageId): clear photo links on delete.
 * Returns { refresh } so new photos show up in the open editor.
 */
export function openDamageEditor({ room, damage, persist, capture, photosFor, thumbUrl, unlink, onDone }) {
  const existing = Boolean(damage);
  const lastWaterLine = [...(room.damages || [])].reverse().find((d) => d.waterLine)?.waterLine || '';
  const draft = damage
    ? { ...damage }
    : { id: uid(), category: '', categoryOther: '', action: '', qty: '', unit: '', waterLine: lastWaterLine, notes: '', createdAt: Date.now() };

  const el = openSheet(`
    <div class="labeler" role="dialog" aria-modal="true">
      <header class="lab-head">
        <div>
          <strong>${esc(room.name)} · ${existing ? 'Edit damage' : 'New damage'}</strong>
          <span class="lab-sub"></span>
        </div>
      </header>
      <div class="lab-body">
        <h3>Category</h3>
        ${chipGroup('category', DAMAGE_CATEGORIES.map(([c]) => c), draft.category)}
        <input class="other-input" placeholder="Describe (e.g. Framing)" value="${esc(draft.categoryOther)}" ${draft.category === 'Other' ? '' : 'hidden'}>
        <h3>Action</h3>
        ${chipGroup('action', ACTIONS, draft.action)}
        <h3>Quantity</h3>
        <div class="qty-row">
          <input class="qty" type="text" inputmode="decimal" placeholder="0" value="${esc(draft.qty)}" aria-label="Quantity">
          ${chipGroup('unit', UNITS, draft.unit)}
        </div>
        <h3>Water line <span class="muted">(inches above floor)</span></h3>
        <input class="wl" type="text" inputmode="decimal" placeholder="e.g. 24" value="${esc(draft.waterLine)}">
        <h3>Notes</h3>
        <div class="notes-wrap">
          <textarea class="lab-notes" placeholder="Cut at 4 ft, insulation wet on exterior walls">${esc(draft.notes)}</textarea>
          ${micButton()}
        </div>
        <h3>Photos</h3>
        <div class="strip"></div>
        <button type="button" class="btn secondary" data-ed="photo">${icon('camera')}Add photo to this damage</button>
        ${existing ? `<button type="button" class="btn danger-ghost" data-ed="delete">${icon('trash')}Delete this entry</button>` : ''}
      </div>
      <footer class="lab-foot">
        <div class="btn-row">
          <button type="button" class="btn secondary" data-ed="cancel">Cancel</button>
          <button type="button" class="btn primary" data-ed="save">Save</button>
        </div>
      </footer>
    </div>`, { full: true });

  const sub = el.querySelector('.lab-sub');
  const other = el.querySelector('.other-input');
  const qty = el.querySelector('.qty');
  const wl = el.querySelector('.wl');
  const notes = el.querySelector('.lab-notes');
  const strip = el.querySelector('.strip');
  const unitGroup = el.querySelector('[data-group="unit"]');
  const stopMic = attachMic(el.querySelector('.mic'), notes);
  autosize(notes);

  const updateSub = () => {
    sub.textContent = [damageTitle(draft), damageDetail(draft)].filter(Boolean).join(' · ') || 'Pick a category';
  };
  const setUnit = (unit) => {
    draft.unit = unit;
    unitGroup.querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.value === unit));
  };

  let prevDefault = defaultUnit(draft.category);
  wireChips(el, draft, (key) => {
    if (key === 'category') {
      other.hidden = draft.category !== 'Other';
      if (!other.hidden) other.focus();
      // Follow the category's usual unit unless the unit was picked by hand.
      if (!draft.unit || draft.unit === prevDefault) setUnit(defaultUnit(draft.category));
      prevDefault = defaultUnit(draft.category);
    }
    updateSub();
  });
  other.addEventListener('input', () => { draft.categoryOther = other.value.trim(); updateSub(); });
  qty.addEventListener('input', () => { draft.qty = qty.value.trim(); updateSub(); });
  wl.addEventListener('input', () => { draft.waterLine = wl.value.trim(); updateSub(); });
  notes.addEventListener('input', () => { draft.notes = notes.value; autosize(notes); });
  updateSub();

  const commit = () => {
    if (draft.category !== 'Other') draft.categoryOther = '';
    const entry = { ...draft, notes: draft.notes.trim() };
    room.damages = room.damages || [];
    const i = room.damages.findIndex((d) => d.id === entry.id);
    if (i >= 0) room.damages[i] = entry; else room.damages.push(entry);
    persist();
  };

  const refresh = async () => {
    const photos = await photosFor(draft.id);
    strip.innerHTML = photos.length
      ? photos.map((p) => `<img src="${thumbUrl(p)}" alt="">`).join('')
      : '<p class="muted small">No photos linked yet.</p>';
  };
  refresh();

  const close = () => { stopMic?.(); onDone(); };

  el.querySelector('[data-ed="save"]').addEventListener('click', () => {
    if (!draft.category) { toast('Pick a category first'); return; }
    commit();
    close();
  });
  el.querySelector('[data-ed="cancel"]').addEventListener('click', close);
  el.querySelector('[data-ed="delete"]')?.addEventListener('click', async () => {
    if (!confirm(`Delete this ${damageTitle(draft)} entry? Its photos stay in the room.`)) return;
    room.damages = room.damages.filter((d) => d.id !== draft.id);
    persist();
    await unlink(draft.id);
    close();
  });
  el.querySelector('[data-ed="photo"]').addEventListener('click', () => {
    if (!draft.category) { toast('Pick a category first'); return; }
    // Open the camera first, while we still have the tap gesture.
    capture(draft.id);
    // Save now so the new photo has an entry to link to.
    commit();
  });

  return { refresh, damageId: draft.id };
}
