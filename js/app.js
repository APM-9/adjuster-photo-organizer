// Field Photos: UI, routing and capture flow.
import { PRESET_ROOMS, SHOWS, LOCATIONS, DAMAGE } from './config.js';
import * as store from './store.js';
import { compressImage, makePlaceholder } from './images.js';
import { photoFileName, showsText } from './naming.js';
import { buildZip, buildSummary, printReport, formatDate } from './export.js';

const $app = document.getElementById('app');
const $overlay = document.getElementById('overlay');
const $toast = document.getElementById('toast');
const cameraInput = document.getElementById('camera-input');
const libraryInput = document.getElementById('library-input');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ICONS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  images: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
  share: '<path d="M12 15V4m-4 4 4-4 4 4M6 12v8h12v-8"/>',
  print: '<path d="M7 9V4h10v5M7 17H5v-7h14v7h-2"/><rect x="7" y="14" width="10" height="6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  archive: '<path d="M4 4h16v4H4zM5 8v12h14V8M10 12h4"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- state ----------

let claims = store.loadClaims();
let persistTimer;
const persist = () => { clearTimeout(persistTimer); store.saveClaims(claims); };
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 300); };
window.addEventListener('pagehide', persist);

const findClaim = (id) => claims.find((c) => c.id === id);
const findRoom = (claim, id) => claim?.rooms.find((r) => r.id === id);

function newRoom(claim, name) {
  let unique = name.trim();
  for (let n = 2; claim.rooms.some((r) => r.name.toLowerCase() === unique.toLowerCase()); n++) {
    unique = `${name.trim()} ${n}`;
  }
  const room = { id: uid(), name: unique, notes: '', measurements: '', replaceList: '', nextSeq: 1, createdAt: Date.now() };
  claim.rooms.push(room);
  return room;
}

// Object URLs for photo blobs, reused across renders.
const urls = new Map();
function urlFor(photo, kind = 'thumb') {
  const key = `${photo.id}:${kind}`;
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(kind === 'thumb' ? photo.thumb : photo.blob));
  return urls.get(key);
}
function dropUrls(id) {
  for (const key of [...urls.keys()]) {
    if (key.startsWith(`${id}:`)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
  }
}

// ---------- feedback ----------

let toastTimer;
function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), ms);
}

function busy(msg) {
  let el = document.getElementById('busy');
  if (!msg) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'busy';
    el.innerHTML = '<div class="spinner"></div><p></p>';
    document.body.append(el);
  }
  el.querySelector('p').textContent = msg;
}

function errorText(err) {
  if (err?.name === 'QuotaExceededError') return 'Phone storage for this app is full. Export and delete an old claim, then try again.';
  return err?.message || String(err);
}

// ---------- routing ----------

const go = (path) => { location.hash = `#/${path}`; };
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let html;
  if (p[0] === 'claim' && p[1]) {
    const claim = findClaim(p[1]);
    if (!claim) return go('');
    if (p[2] === 'room' && p[3]) {
      const room = findRoom(claim, p[3]);
      if (!room) return go(`claim/${claim.id}`);
      html = p[4] === 'photo' && p[5] ? await photoView(claim, room, p[5]) : await roomView(claim, room);
    } else if (p[2] === 'export') {
      html = await exportView(claim);
    } else {
      html = await claimView(claim);
    }
  } else {
    html = await claimsView();
  }
  if (token !== renderToken || html == null) return;
  $app.innerHTML = html;
  $app.querySelectorAll('textarea').forEach(autosize);
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

function shell({ title, sub = '', back = null, body, tools = '' }) {
  return `
    <header class="topbar">
      ${back !== null
        ? `<a class="back" href="#/${back}">${icon('left')}<span>Back</span></a>`
        : '<span class="brand">FP</span>'}
      <div class="titles"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      ${tools}
    </header>
    <main class="content">${body}</main>`;
}

// ---------- views ----------

async function claimsView() {
  const counts = {};
  await Promise.all(claims.map(async (c) => { counts[c.id] = (await store.photosByClaim(c.id)).length; }));
  const used = await store.usage();
  const list = [...claims].sort((a, b) => b.createdAt - a.createdAt);
  return shell({
    title: 'Claims',
    sub: 'Field photo organizer',
    body: `
      <button class="btn primary xl" data-action="new-claim">${icon('plus')}New claim</button>
      ${list.length ? `<ul class="cards">${list.map((c) => `
        <li><a class="card" href="#/claim/${c.id}">
          <div>
            <strong>${esc(c.number)}</strong>
            <span>${esc(c.address || 'No address')}</span>
            <small>${c.dateOfLoss ? `Loss ${esc(formatDate(c.dateOfLoss))} · ` : ''}${plural(c.rooms.length, 'room')} · ${plural(counts[c.id], 'photo')}</small>
          </div>${icon('chevron')}
        </a></li>`).join('')}</ul>`
        : '<p class="empty">No claims yet. Create one, or load the demo claim to see how it works.</p>'}
      <div class="footer-tools">
        <button class="btn ghost" data-action="demo">Load demo data</button>
        ${used != null ? `<p class="muted small">Using ${(used / 1048576).toFixed(1)} MB of phone storage</p>` : ''}
      </div>`,
  });
}

async function claimView(claim) {
  const photos = await store.photosByClaim(claim.id);
  const counts = Object.fromEntries(claim.rooms.map((r) => [r.id, 0]));
  photos.forEach((p) => { counts[p.roomId] = (counts[p.roomId] || 0) + 1; });
  return shell({
    title: claim.number,
    sub: claim.address,
    back: '',
    tools: `<button class="icon-btn" data-action="edit-claim" data-id="${claim.id}" aria-label="Edit claim">${icon('edit')}</button>`,
    body: `
      <div class="meta-row">
        ${claim.dateOfLoss ? `<span>Date of loss <b>${esc(formatDate(claim.dateOfLoss))}</b></span>` : ''}
        <span><b>${photos.length}</b> photos</span>
      </div>
      <h2 class="section">Rooms</h2>
      ${claim.rooms.length ? `<ul class="rooms">${claim.rooms.map((r) => `
        <li><a class="room-tile" href="#/claim/${claim.id}/room/${r.id}">
          <span class="room-name">${esc(r.name)}</span>
          <span class="count ${counts[r.id] ? '' : 'zero'}">${counts[r.id]}</span>
        </a></li>`).join('')}</ul>`
        : '<p class="empty">Add the rooms you will photograph.</p>'}
      <button class="btn secondary xl" data-action="add-room" data-claim="${claim.id}">${icon('plus')}Add room</button>
      <label class="field">
        <span>Claim notes</span>
        <textarea data-bind="claim.notes" data-claim="${claim.id}" placeholder="Anything not tied to a photo: insured contact, access, prior damage…">${esc(claim.notes)}</textarea>
      </label>
      <a class="btn primary xl" href="#/claim/${claim.id}/export">${icon('archive')}Export for home</a>
      <div class="footer-tools">
        <button class="btn danger-ghost" data-action="delete-claim" data-id="${claim.id}">${icon('trash')}Delete claim</button>
      </div>`,
  });
}

async function roomView(claim, room) {
  const photos = (await store.photosByClaim(claim.id)).filter((p) => p.roomId === room.id);
  const base = `claim/${claim.id}/room/${room.id}`;
  const hasExtras = room.measurements || room.replaceList;
  return shell({
    title: room.name,
    sub: claim.number,
    back: `claim/${claim.id}`,
    tools: `<button class="icon-btn" data-action="rename-room" data-claim="${claim.id}" data-room="${room.id}" aria-label="Rename room">${icon('edit')}</button>`,
    body: `
      <button class="btn camera" data-action="camera" data-claim="${claim.id}" data-room="${room.id}">${icon('camera')}Take photos</button>
      <button class="btn secondary" data-action="library" data-claim="${claim.id}" data-room="${room.id}">${icon('images')}Add from photo library</button>
      <h2 class="section">${plural(photos.length, 'photo')}</h2>
      ${photos.length ? `<ul class="grid">${photos.map((p) => `
        <li><a href="#/${base}/photo/${p.id}" class="thumb">
          <img src="${urlFor(p)}" alt="" loading="lazy">
          <span class="${showsText(p) ? '' : 'unlabeled'}">${esc(showsText(p) || 'Not labeled')}${p.location ? ` · ${esc(p.location)}` : ''}</span>
          ${p.damage ? `<i class="dmg ${p.damage.toLowerCase()}">${esc(p.damage)}</i>` : ''}
        </a></li>`).join('')}</ul>`
        : '<p class="empty">No photos in this room yet.</p>'}
      <label class="field">
        <span>Room notes</span>
        <textarea data-bind="room.notes" data-claim="${claim.id}" data-room="${room.id}" placeholder="General notes for this room">${esc(room.notes)}</textarea>
      </label>
      <details class="extras" ${hasExtras ? 'open' : ''}>
        <summary>Measurements &amp; scope <span class="muted">(optional)</span></summary>
        <label class="field">
          <span>Measurements</span>
          <textarea data-bind="room.measurements" data-claim="${claim.id}" data-room="${room.id}" placeholder="e.g. 12 x 14, 8 ft ceiling, water line 24 in">${esc(room.measurements)}</textarea>
        </label>
        <label class="field">
          <span>What needs replacing</span>
          <textarea data-bind="room.replaceList" data-claim="${claim.id}" data-room="${room.id}" placeholder="e.g. drywall to 4 ft, baseboard, LVP flooring">${esc(room.replaceList)}</textarea>
        </label>
      </details>
      <div class="footer-tools">
        <button class="btn danger-ghost" data-action="delete-room" data-claim="${claim.id}" data-room="${room.id}">${icon('trash')}Delete room</button>
      </div>`,
  });
}

async function photoView(claim, room, photoId) {
  const photos = (await store.photosByClaim(claim.id)).filter((p) => p.roomId === room.id);
  const i = photos.findIndex((p) => p.id === photoId);
  const base = `claim/${claim.id}/room/${room.id}`;
  if (i < 0) { go(base); return null; }
  const p = photos[i];
  const prev = photos[i - 1], next = photos[i + 1];
  const others = claim.rooms.filter((r) => r.id !== room.id);
  const rows = [
    ['Shows', showsText(p)], ['Location', p.location], ['Damage', p.damage], ['Notes', p.notes],
  ];
  return shell({
    title: `Photo ${i + 1} of ${photos.length}`,
    sub: room.name,
    back: base,
    body: `
      <figure class="viewer"><img src="${urlFor(p, 'full')}" alt=""></figure>
      <div class="pager">
        ${prev ? `<a class="btn secondary" href="#/${base}/photo/${prev.id}">${icon('left')}Prev</a>` : '<span></span>'}
        ${next ? `<a class="btn secondary" href="#/${base}/photo/${next.id}">Next${icon('chevron')}</a>` : '<span></span>'}
      </div>
      <p class="filename">${esc(photoFileName(claim, room, p))}</p>
      <dl class="label-table">
        ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd class="${v ? '' : 'muted'}">${esc(v || '—')}</dd></div>`).join('')}
      </dl>
      <button class="btn primary xl" data-action="edit-label" data-id="${p.id}">${icon('edit')}Edit label</button>
      ${others.length ? `
        <div class="move-row">
          <select id="move-target" aria-label="Move to room">
            ${others.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
          </select>
          <button class="btn secondary" data-action="move-photo" data-id="${p.id}">Move</button>
        </div>` : ''}
      <div class="footer-tools">
        <button class="btn danger-ghost" data-action="delete-photo" data-id="${p.id}" data-next="${next?.id || prev?.id || ''}">${icon('trash')}Delete photo</button>
      </div>`,
  });
}

let lastZip = null;
const zipSignature = (claim, photos) => JSON.stringify([
  claim.number, claim.notes, claim.rooms.map((r) => [r.id, r.name, r.notes, r.measurements, r.replaceList]),
  photos.map((p) => [p.id, p.roomId, p.seq, p.shows, p.showsOther, p.location, p.damage, p.notes]),
]);

async function exportView(claim) {
  const photos = await store.photosByClaim(claim.id);
  const summary = buildSummary(claim, photos);
  const unlabeled = photos.filter((p) => !p.shows).length;
  // A zip is only offered while it still matches the claim's photos and labels.
  const signature = zipSignature(claim, photos);
  const ready = lastZip?.claimId === claim.id && lastZip.signature === signature;
  const canShare = ready && navigator.canShare?.({ files: [lastZip.file] });
  return shell({
    title: 'Export',
    sub: claim.number,
    back: `claim/${claim.id}`,
    body: `
      <div class="meta-row">
        <span><b>${photos.length}</b> photos</span>
        <span><b>${claim.rooms.length}</b> rooms</span>
        ${unlabeled ? `<span class="warn"><b>${unlabeled}</b> unlabeled</span>` : ''}
      </div>
      <section class="panel">
        <h2>Photos zip</h2>
        <p class="muted">One folder per room, every photo already renamed. Includes summary.txt.</p>
        ${ready ? `
          <p class="ok">${esc(lastZip.file.name)} · ${(lastZip.file.size / 1048576).toFixed(1)} MB</p>
          ${canShare ? `<button class="btn primary xl" data-action="share-zip">${icon('share')}Share / AirDrop / Save to Files</button>` : ''}
          <button class="btn ${canShare ? 'secondary' : 'primary xl'}" data-action="download-zip">${icon('download')}Download zip</button>
          <button class="btn ghost" data-action="build-zip" data-id="${claim.id}">Rebuild zip</button>`
        : `<button class="btn primary xl" data-action="build-zip" data-id="${claim.id}" ${photos.length ? '' : 'disabled'}>${icon('archive')}Build zip</button>`}
      </section>
      <section class="panel">
        <h2>Text summary</h2>
        <button class="btn secondary" data-action="copy-summary">${icon('copy')}Copy summary</button>
        <textarea id="summary" class="mono" readonly>${esc(summary)}</textarea>
      </section>
      <section class="panel">
        <h2>Printable report</h2>
        <p class="muted">Thumbnails grouped by room. In the print screen, choose Save to Files for a PDF.</p>
        <button class="btn secondary" data-action="print" data-id="${claim.id}" ${photos.length ? '' : 'disabled'}>${icon('print')}Print or save PDF</button>
      </section>`,
  });
}

// ---------- sheets ----------

function openSheet(html) {
  $overlay.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  $overlay.classList.add('open');
  document.body.classList.add('locked');
  return $overlay.querySelector('.sheet');
}

function closeSheet() {
  $overlay.classList.remove('open');
  $overlay.innerHTML = '';
  document.body.classList.remove('locked');
}

$overlay.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeSheet(); });

function openClaimForm(claim) {
  const sheet = openSheet(`
    <h2>${claim ? 'Edit claim' : 'New claim'}</h2>
    <form id="claim-form">
      <label class="field"><span>Claim number</span>
        <input name="number" required autocomplete="off" autocapitalize="characters" value="${esc(claim?.number)}" placeholder="24-18831"></label>
      <label class="field"><span>Property address</span>
        <input name="address" autocomplete="street-address" value="${esc(claim?.address)}" placeholder="Street, city"></label>
      <label class="field"><span>Date of loss</span>
        <input name="dateOfLoss" type="date" value="${esc(claim?.dateOfLoss)}"></label>
      <div class="btn-row">
        <button type="button" class="btn secondary" data-close>Cancel</button>
        <button class="btn primary">${claim ? 'Save' : 'Create claim'}</button>
      </div>
    </form>`);
  const form = sheet.querySelector('form');
  if (!claim) form.number.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.number = data.number.trim();
    if (!data.number) return;
    if (claim) {
      Object.assign(claim, data);
      persist();
      closeSheet();
      render();
    } else {
      const created = { id: uid(), ...data, notes: '', rooms: [], createdAt: Date.now() };
      claims.push(created);
      persist();
      closeSheet();
      go(`claim/${created.id}`);
    }
  });
}

function openRoomPicker(claim) {
  const sheet = openSheet(`
    <h2>Add rooms</h2>
    <p class="muted">Tap each room you will photograph.</p>
    <div class="chips">${PRESET_ROOMS.map((r) => `<button type="button" class="chip" data-room-name="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <form id="custom-room" class="inline-form">
      <input name="name" placeholder="Custom room (e.g. Laundry)" autocomplete="off">
      <button class="btn secondary">Add</button>
    </form>
    <button type="button" class="btn primary xl" data-close>Done</button>`);
  const add = (name) => {
    if (!name.trim()) return;
    const room = newRoom(claim, name);
    persist();
    render();
    toast(`Added ${room.name}`, 1500);
  };
  sheet.querySelectorAll('[data-room-name]').forEach((b) => b.addEventListener('click', () => {
    add(b.dataset.roomName);
    b.classList.add('selected');
  }));
  sheet.querySelector('#custom-room').addEventListener('submit', (e) => {
    e.preventDefault();
    add(e.target.name.value);
    e.target.reset();
  });
}

// ---------- capture + labeling ----------

let captureCtx = null;

// Must be called synchronously inside a tap handler: iOS only opens the
// camera from a direct user gesture.
function startCapture(claimId, roomId, camera) {
  captureCtx = { claimId, roomId, camera };
  const input = camera ? cameraInput : libraryInput;
  input.value = '';
  input.click();
}

cameraInput.addEventListener('change', () => handleFiles([...cameraInput.files]));
libraryInput.addEventListener('change', () => handleFiles([...libraryInput.files]));

async function handleFiles(files) {
  if (!files.length || !captureCtx) return;
  const { claimId, roomId, camera } = captureCtx;
  const claim = findClaim(claimId);
  const room = findRoom(claim, roomId);
  if (!room) return;
  const ids = [];
  try {
    for (let i = 0; i < files.length; i++) {
      busy(files.length > 1 ? `Saving photo ${i + 1} of ${files.length}…` : 'Saving photo…');
      const img = await compressImage(files[i]);
      const photo = {
        id: uid(), claimId, roomId, seq: room.nextSeq++, createdAt: Date.now(), ...img,
        shows: '', showsOther: '', location: '', damage: '', notes: '',
      };
      await store.putPhoto(photo);
      persist();
      ids.push(photo.id);
    }
  } catch (err) {
    toast(`Could not save photo. ${errorText(err)}`, 5000);
  } finally {
    busy(null);
  }
  render();
  if (ids.length) openLabeler(ids, { camera });
}

function chipGroup(name, options, value) {
  return `<div class="chips" data-group="${name}">${options.map((o) =>
    `<button type="button" class="chip ${o === value ? 'selected' : ''}" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
}

/**
 * Full-screen label editor.
 * queue: photo ids to label in order. camera: offer "Save & next photo".
 * editing: labeling an existing photo from the photo view.
 */
async function openLabeler(queue, { camera = false, editing = false } = {}) {
  let index = 0;
  let stopMic = null;

  const finish = () => { stopMic?.(); closeSheet(); render(); };

  const show = async () => {
    stopMic?.();
    const photo = await store.getPhoto(queue[index]);
    if (!photo) return advance();
    const claim = findClaim(photo.claimId);
    const room = findRoom(claim, photo.roomId);
    const draft = { shows: photo.shows, showsOther: photo.showsOther, location: photo.location, damage: photo.damage, notes: photo.notes };
    const last = index === queue.length - 1;
    const counter = queue.length > 1 ? ` · ${index + 1} of ${queue.length}` : '';

    $overlay.innerHTML = `
      <div class="labeler" role="dialog" aria-modal="true">
        <header class="lab-head">
          <img src="${urlFor(photo)}" alt="">
          <div>
            <strong>${esc(room.name)}${counter}</strong>
            <code class="lab-name"></code>
          </div>
        </header>
        <div class="lab-body">
          <h3>What does it show?</h3>
          ${chipGroup('shows', SHOWS, draft.shows)}
          <input class="other-input" placeholder="Describe (e.g. Vanity)" value="${esc(draft.showsOther)}" ${draft.shows === 'Other' ? '' : 'hidden'}>
          <h3>Location</h3>
          ${chipGroup('location', LOCATIONS, draft.location)}
          <h3>Damage <span class="muted">(optional)</span></h3>
          ${chipGroup('damage', DAMAGE, draft.damage)}
          <h3>Notes</h3>
          <div class="notes-wrap">
            <textarea class="lab-notes" placeholder="Water line at two feet, drywall needs to come out">${esc(draft.notes)}</textarea>
            <button type="button" class="btn mic">${icon('mic')}<span>Dictate</span></button>
          </div>
        </div>
        <footer class="lab-foot">
          <div class="btn-row">
            <button type="button" class="btn secondary" data-lab="skip">${editing ? 'Cancel' : 'Skip'}</button>
            <button type="button" class="btn ${camera && last && !editing ? 'secondary' : 'primary'}" data-lab="save">${last ? 'Save' : 'Save · next'}</button>
          </div>
          ${camera && last && !editing ? `<button type="button" class="btn camera" data-lab="save-next">${icon('camera')}Save &amp; take next photo</button>` : ''}
        </footer>
      </div>`;
    $overlay.classList.add('open');
    document.body.classList.add('locked');

    const el = $overlay.querySelector('.labeler');
    const nameEl = el.querySelector('.lab-name');
    const other = el.querySelector('.other-input');
    const notes = el.querySelector('.lab-notes');
    const updateName = () => { nameEl.textContent = photoFileName(claim, room, { ...photo, ...draft }); };
    updateName();
    autosize(notes);

    el.querySelectorAll('[data-group]').forEach((group) => {
      group.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const key = group.dataset.group;
        draft[key] = draft[key] === chip.dataset.value ? '' : chip.dataset.value;
        group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.value === draft[key]));
        if (key === 'shows') {
          other.hidden = draft.shows !== 'Other';
          if (!other.hidden) other.focus();
        }
        updateName();
      });
    });
    other.addEventListener('input', () => { draft.showsOther = other.value.trim(); updateName(); });
    notes.addEventListener('input', () => { draft.notes = notes.value; autosize(notes); });
    stopMic = attachMic(el.querySelector('.mic'), notes);

    const save = async () => {
      stopMic?.();
      if (draft.shows !== 'Other') draft.showsOther = '';
      Object.assign(photo, draft, { notes: draft.notes.trim() });
      try {
        await store.putPhoto(photo);
      } catch (err) {
        toast(`Could not save label. ${errorText(err)}`, 5000);
      }
    };

    el.querySelector('[data-lab="skip"]').addEventListener('click', () => (editing ? finish() : advance()));
    el.querySelector('[data-lab="save"]').addEventListener('click', async () => { await save(); advance(); });
    el.querySelector('[data-lab="save-next"]')?.addEventListener('click', () => {
      // Open the camera first, while we still have the tap gesture.
      startCapture(photo.claimId, photo.roomId, true);
      save().then(finish);
    });
  };

  const advance = () => {
    index++;
    if (index < queue.length) show(); else finish();
  };

  show();
}

function attachMic(btn, textarea) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.hidden = true; return null; }
  let rec = null;
  const label = btn.querySelector('span');
  const reset = () => {
    rec = null;
    btn.classList.remove('live');
    btn.querySelector('svg').outerHTML = icon('mic');
    label.textContent = 'Dictate';
  };
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    const base = textarea.value.trim() ? `${textarea.value.trim()} ` : '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      textarea.value = base + text.trim();
      textarea.dispatchEvent(new Event('input'));
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      toast(e.error === 'not-allowed'
        ? 'Microphone is blocked. Allow it in Settings › Safari › Microphone, or use the keyboard mic.'
        : `Dictation stopped (${e.error}). The keyboard mic also works.`, 5000);
    };
    rec.onend = reset;
    try {
      rec.start();
      btn.classList.add('live');
      btn.querySelector('svg').outerHTML = icon('stop');
      label.textContent = 'Stop';
    } catch {
      reset();
    }
  });
  return () => { if (rec) { rec.onend = null; rec.abort(); reset(); } };
}

// ---------- actions ----------

async function loadDemo() {
  const old = claims.filter((c) => c.demo);
  for (const c of old) await store.deletePhotosByClaim(c.id);
  claims = claims.filter((c) => !c.demo);

  const claim = {
    id: uid(), demo: true, number: '24-18831', address: '1427 Bayou Ridge Dr, Houston, TX',
    dateOfLoss: '2026-09-28', rooms: [], createdAt: Date.now(),
    notes: 'Insured: R. Alvarez. Water entered from the street around 6 AM. Power was off for 3 days.',
  };
  const plan = {
    Kitchen: {
      notes: 'Standing water about 2 ft. Lower cabinets swollen.',
      measurements: '12 x 14, 8 ft ceiling. Water line 24 in.',
      replaceList: 'Drywall to 4 ft, base cabinets, baseboard, LVP flooring',
      photos: [
        ['Overview of room', 'Whole room', '', ''],
        ['Water line', 'North wall', 'Moderate', 'Water line at two feet, drywall needs to come out'],
        ['Drywall', 'North wall', 'Severe', 'Wicking up to about 30 inches'],
        ['Cabinets', 'East wall', 'Severe', 'Base cabinet toe kicks delaminated'],
        ['Flooring', 'Floor', 'Moderate', 'LVP lifting at seams'],
      ],
    },
    'Living Room': {
      notes: '', measurements: '', replaceList: '',
      photos: [
        ['Overview of room', 'Whole room', '', ''],
        ['Carpet', 'Floor', 'Severe', 'Carpet and pad saturated, odor present'],
        ['Baseboard', 'West wall', 'Moderate', ''],
        ['Moisture reading', 'South wall', '', 'Meter reads 38 percent at 12 inches'],
      ],
    },
    Basement: {
      notes: 'Fully flooded. Water heater and furnace submerged.',
      measurements: '', replaceList: '',
      photos: [
        ['Overview of room', 'Whole room', '', ''],
        ['Water line', 'East wall', 'Severe', 'Water line at 6 ft'],
        ['Mold', 'Corner', 'Severe', 'Visible growth behind paneling'],
        ['Appliance', 'Floor', 'Severe', 'Water heater submerged'],
      ],
    },
  };
  busy('Building demo claim…');
  try {
    for (const [name, data] of Object.entries(plan)) {
      const room = newRoom(claim, name);
      Object.assign(room, { notes: data.notes, measurements: data.measurements, replaceList: data.replaceList });
      for (const [shows, location, damage, notes] of data.photos) {
        const img = await makePlaceholder({ shows, room: name, location });
        await store.putPhoto({
          id: uid(), claimId: claim.id, roomId: room.id, seq: room.nextSeq++, createdAt: Date.now(),
          ...img, shows, showsOther: '', location, damage, notes,
        });
      }
    }
    claims.push(claim);
    persist();
    go(`claim/${claim.id}`);
  } catch (err) {
    toast(`Demo failed. ${errorText(err)}`, 5000);
  } finally {
    busy(null);
  }
}

async function deletePhotoById(id) {
  const photo = await store.getPhoto(id);
  if (!photo || !confirm('Delete this photo? This cannot be undone.')) return false;
  await store.deletePhoto(id);
  dropUrls(id);
  return photo;
}

const actions = {
  'new-claim': () => openClaimForm(),
  'edit-claim': (el) => openClaimForm(findClaim(el.dataset.id)),
  demo: () => {
    if (claims.some((c) => c.demo) && !confirm('Replace the existing demo claim with a fresh one?')) return;
    loadDemo();
  },
  'delete-claim': async (el) => {
    const claim = findClaim(el.dataset.id);
    if (!confirm(`Delete claim ${claim.number} and all its photos? Export first if you still need them.`)) return;
    await store.deletePhotosByClaim(claim.id);
    claims = claims.filter((c) => c !== claim);
    persist();
    go('');
  },
  'add-room': (el) => openRoomPicker(findClaim(el.dataset.claim)),
  'rename-room': (el) => {
    const claim = findClaim(el.dataset.claim);
    const room = findRoom(claim, el.dataset.room);
    const name = prompt('Room name', room.name)?.trim();
    if (!name || name === room.name) return;
    room.name = name;
    persist();
    render();
  },
  'delete-room': async (el) => {
    const claim = findClaim(el.dataset.claim);
    const room = findRoom(claim, el.dataset.room);
    if (!confirm(`Delete ${room.name} and all its photos?`)) return;
    await store.deletePhotosByRoom(room.id);
    claim.rooms = claim.rooms.filter((r) => r !== room);
    persist();
    go(`claim/${claim.id}`);
  },
  camera: (el) => startCapture(el.dataset.claim, el.dataset.room, true),
  library: (el) => startCapture(el.dataset.claim, el.dataset.room, false),
  'edit-label': (el) => openLabeler([el.dataset.id], { editing: true }),
  'move-photo': async (el) => {
    const photo = await store.getPhoto(el.dataset.id);
    const claim = findClaim(photo.claimId);
    const target = findRoom(claim, document.getElementById('move-target').value);
    photo.roomId = target.id;
    photo.seq = target.nextSeq++;
    persist();
    await store.putPhoto(photo);
    toast(`Moved to ${target.name}`);
    go(`claim/${claim.id}/room/${target.id}/photo/${photo.id}`);
  },
  'delete-photo': async (el) => {
    const photo = await deletePhotoById(el.dataset.id);
    if (!photo) return;
    const base = `claim/${photo.claimId}/room/${photo.roomId}`;
    go(el.dataset.next ? `${base}/photo/${el.dataset.next}` : base);
  },
  'build-zip': async (el) => {
    const claim = findClaim(el.dataset.id);
    busy('Building zip…');
    try {
      const photos = await store.photosByClaim(claim.id);
      const blob = await buildZip(claim, photos, (pct) => busy(`Building zip… ${Math.round(pct)}%`));
      const name = `${claim.number.replace(/[^A-Za-z0-9-]+/g, '-')}_photos.zip`;
      lastZip = { claimId: claim.id, signature: zipSignature(claim, photos), file: new File([blob], name, { type: 'application/zip' }) };
      render();
    } catch (err) {
      toast(errorText(err), 5000);
    } finally {
      busy(null);
    }
  },
  'download-zip': () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(lastZip.file);
    a.download = lastZip.file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  },
  'share-zip': async () => {
    try {
      await navigator.share({ files: [lastZip.file], title: lastZip.file.name });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Sharing failed. Use Download zip instead.');
    }
  },
  'copy-summary': async () => {
    const text = document.getElementById('summary').value;
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied');
    } catch {
      const ta = document.getElementById('summary');
      ta.focus();
      ta.setSelectionRange(0, text.length);
      toast('Select all and copy');
    }
  },
  print: async (el) => {
    const claim = findClaim(el.dataset.id);
    busy('Preparing report…');
    try {
      const photos = await store.photosByClaim(claim.id);
      busy(null);
      await printReport(claim, photos);
    } catch (err) {
      toast(errorText(err), 5000);
    } finally {
      busy(null);
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el, e);
});

// Autosave for notes fields.
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  const [kind, field] = el.dataset.bind.split('.');
  const claim = findClaim(el.dataset.claim);
  const target = kind === 'claim' ? claim : findRoom(claim, el.dataset.room);
  if (!target) return;
  target[field] = el.value;
  autosize(el);
  persistSoon();
});

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight + 2, 480)}px`;
}

// ---------- boot ----------

store.requestPersistence();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
