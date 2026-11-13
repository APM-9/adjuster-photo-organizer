// Field Photos: screens, routing and capture flow.
import { PRESET_ROOMS, SHOWS, LOCATIONS, DAMAGE, LOSS_TYPES, DISCLAIMER } from './config.js';
import * as store from './store.js';
import { compressImage, makePlaceholder, encodeImage, loadImage } from './images.js';
import { photoFileName, showsText } from './naming.js';
import { buildZip, buildSummary, buildCsv, printReport, formatDate, fileStem } from './export.js';
import { sortedDamages, damageTitle, damageDetail, openDamageEditor } from './damage.js';
import { openMarkup } from './markup.js';
import {
  esc, uid, plural, icon, toast, busy, errorText, openSheet, closeSheet, autosize,
  chipGroup, wireChips, attachMic, micButton,
} from './ui.js';

const $app = document.getElementById('app');
const cameraInput = document.getElementById('camera-input');
const libraryInput = document.getElementById('library-input');

// ---------- state ----------

let claims = store.loadClaims();
let persistTimer;
const persist = () => { clearTimeout(persistTimer); store.saveClaims(claims); };
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 300); };
window.addEventListener('pagehide', persist);

const findClaim = (id) => claims.find((c) => c.id === id);
const findRoom = (claim, id) => claim?.rooms.find((r) => r.id === id);
const findDamage = (room, id) => room?.damages?.find((d) => d.id === id);

function newRoom(claim, name) {
  let unique = name.trim();
  for (let n = 2; claim.rooms.some((r) => r.name.toLowerCase() === unique.toLowerCase()); n++) {
    unique = `${name.trim()} ${n}`;
  }
  const room = { id: uid(), name: unique, notes: '', measurements: '', replaceList: '', damages: [], nextSeq: 1, createdAt: Date.now() };
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

const roomPhotos = async (claim, room) => (await store.photosByClaim(claim.id)).filter((p) => p.roomId === room.id);

async function unlinkDamage(claimId, damageId) {
  for (const p of await store.photosByClaim(claimId)) {
    if (p.damageId === damageId) { p.damageId = ''; await store.putPhoto(p); }
  }
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
    sub: 'Field damage & photo notes',
    body: `
      <button class="btn primary xl" data-action="new-claim">${icon('plus')}New claim</button>
      ${list.length ? `<ul class="cards">${list.map((c) => `
        <li><a class="card" href="#/claim/${c.id}">
          <div>
            <strong>${esc(c.number)}</strong>
            <span>${esc(c.address || 'No address')}</span>
            <small>${[c.lossType, c.dateOfLoss && `Loss ${formatDate(c.dateOfLoss)}`].filter(Boolean).map(esc).join(' · ')}${c.lossType || c.dateOfLoss ? ' · ' : ''}${plural(c.rooms.length, 'room')} · ${plural(counts[c.id], 'photo')}</small>
          </div>${icon('chevron')}
        </a></li>`).join('')}</ul>`
        : '<p class="empty">No claims yet. Create one, or load the demo claim to see how it works.</p>'}
      <div class="footer-tools">
        <button class="btn ghost" data-action="demo">Load demo data</button>
        ${used != null ? `<p class="muted small">Using ${(used / 1048576).toFixed(1)} MB of phone storage</p>` : ''}
        <p class="muted small disclaimer">${esc(DISCLAIMER)}</p>
      </div>`,
  });
}

async function claimView(claim) {
  const photos = await store.photosByClaim(claim.id);
  const counts = Object.fromEntries(claim.rooms.map((r) => [r.id, 0]));
  photos.forEach((p) => { counts[p.roomId] = (counts[p.roomId] || 0) + 1; });
  const damageLines = claim.rooms.reduce((n, r) => n + (r.damages?.length || 0), 0);
  return shell({
    title: claim.number,
    sub: claim.address,
    back: '',
    tools: `<button class="icon-btn" data-action="edit-claim" data-id="${claim.id}" aria-label="Edit claim">${icon('edit')}</button>`,
    body: `
      <div class="meta-row">
        ${claim.lossType ? `<span><b>${esc(claim.lossType)}</b></span>` : ''}
        ${claim.dateOfLoss ? `<span>Loss <b>${esc(formatDate(claim.dateOfLoss))}</b></span>` : ''}
        <span><b>${damageLines}</b> damage lines</span>
        <span><b>${photos.length}</b> photos</span>
      </div>
      <h2 class="section">Rooms</h2>
      ${claim.rooms.length ? `<ul class="rooms">${claim.rooms.map((r) => `
        <li><a class="room-tile" href="#/claim/${claim.id}/room/${r.id}">
          <span class="room-name">${esc(r.name)}<small>${plural(r.damages?.length || 0, 'line')}</small></span>
          <span class="count ${counts[r.id] ? '' : 'zero'}" aria-label="${plural(counts[r.id], 'photo')}">${counts[r.id]}</span>
        </a></li>`).join('')}</ul>`
        : '<p class="empty">Add the rooms you will scope.</p>'}
      <button class="btn secondary xl" data-action="add-room" data-claim="${claim.id}">${icon('plus')}Add room</button>
      <label class="field">
        <span>Claim notes</span>
        <textarea data-bind="claim.notes" data-claim="${claim.id}" placeholder="Anything not tied to a room: insured contact, access, prior damage…">${esc(claim.notes)}</textarea>
      </label>
      <a class="btn primary xl" href="#/claim/${claim.id}/export">${icon('archive')}Export for home</a>
      <div class="footer-tools">
        <button class="btn danger-ghost" data-action="delete-claim" data-id="${claim.id}">${icon('trash')}Delete claim</button>
      </div>`,
  });
}

async function roomView(claim, room) {
  const photos = await roomPhotos(claim, room);
  const base = `claim/${claim.id}/room/${room.id}`;
  const damages = sortedDamages(room);
  const photoCount = (id) => photos.filter((p) => p.damageId === id).length;
  return shell({
    title: room.name,
    sub: claim.number,
    back: `claim/${claim.id}`,
    tools: `<button class="icon-btn" data-action="rename-room" data-claim="${claim.id}" data-room="${room.id}" aria-label="Rename room">${icon('edit')}</button>`,
    body: `
      <button class="btn camera" data-action="camera" data-claim="${claim.id}" data-room="${room.id}">${icon('camera')}Take photos</button>
      <div class="btn-row">
        <button class="btn primary" data-action="add-damage" data-claim="${claim.id}" data-room="${room.id}">${icon('plus')}Add damage</button>
        <button class="btn secondary" data-action="library" data-claim="${claim.id}" data-room="${room.id}">${icon('images')}Library</button>
      </div>
      <h2 class="section">Damage · ${damages.length}</h2>
      ${damages.length ? `<ul class="damage-list">${damages.map((d) => `
        <li><button class="damage-row" data-action="edit-damage" data-claim="${claim.id}" data-room="${room.id}" data-id="${d.id}">
          <span><strong>${esc(damageTitle(d))}</strong><small>${esc(damageDetail(d) || 'No details yet')}</small>${d.notes ? `<em>${esc(d.notes)}</em>` : ''}</span>
          ${photoCount(d.id) ? `<span class="count">${icon('camera')}${photoCount(d.id)}</span>` : ''}
        </button></li>`).join('')}</ul>`
        : '<p class="empty">No damage entered. Tap Add damage for each item: drywall, flooring, cabinets…</p>'}
      <h2 class="section">Photos · ${photos.length}</h2>
      ${photos.length ? `<ul class="grid">${photos.map((p) => {
        const d = findDamage(room, p.damageId);
        return `
        <li><a href="#/${base}/photo/${p.id}" class="thumb">
          <img src="${urlFor(p)}" alt="" loading="lazy">
          <span class="${showsText(p) ? '' : 'unlabeled'}">${esc(showsText(p) || 'Not labeled')}${p.location ? ` · ${esc(p.location)}` : ''}</span>
          ${p.damage ? `<i class="dmg ${p.damage.toLowerCase()}">${esc(p.damage)}</i>` : ''}
          ${d ? `<i class="linked">${esc(damageTitle(d))}</i>` : ''}
        </a></li>`;
      }).join('')}</ul>`
        : '<p class="empty">No photos in this room yet.</p>'}
      <label class="field">
        <span>Room notes</span>
        <textarea data-bind="room.notes" data-claim="${claim.id}" data-room="${room.id}" placeholder="General notes for this room">${esc(room.notes)}</textarea>
      </label>
      <label class="field">
        <span>Room size <span class="muted">(optional)</span></span>
        <input data-bind="room.measurements" data-claim="${claim.id}" data-room="${room.id}" value="${esc(room.measurements)}" placeholder="e.g. 12 x 14, 8 ft ceiling">
      </label>
      ${room.replaceList ? `
        <label class="field">
          <span>What needs replacing</span>
          <textarea data-bind="room.replaceList" data-claim="${claim.id}" data-room="${room.id}">${esc(room.replaceList)}</textarea>
        </label>` : ''}
      <div class="footer-tools">
        <button class="btn danger-ghost" data-action="delete-room" data-claim="${claim.id}" data-room="${room.id}">${icon('trash')}Delete room</button>
      </div>`,
  });
}

async function photoView(claim, room, photoId) {
  const photos = await roomPhotos(claim, room);
  const i = photos.findIndex((p) => p.id === photoId);
  const base = `claim/${claim.id}/room/${room.id}`;
  if (i < 0) { go(base); return null; }
  const p = photos[i];
  const prev = photos[i - 1], next = photos[i + 1];
  const others = claim.rooms.filter((r) => r.id !== room.id);
  const damages = sortedDamages(room);
  const rows = [
    ['Shows', showsText(p)], ['Location', p.location], ['Severity', p.damage], ['Notes', p.notes],
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
      <div class="btn-row">
        <button class="btn primary" data-action="edit-label" data-id="${p.id}">${icon('edit')}Edit label</button>
        <button class="btn secondary" data-action="markup" data-id="${p.id}">${icon('pen')}Mark up</button>
      </div>
      ${p.original ? `<button class="btn ghost" data-action="undo-markup" data-id="${p.id}">Remove markup</button>` : ''}
      <label class="field">
        <span>Damage entry</span>
        <select data-action-change="link-damage" data-id="${p.id}">
          <option value="">Not linked</option>
          ${damages.map((d) => `<option value="${d.id}" ${d.id === p.damageId ? 'selected' : ''}>${esc(damageTitle(d))}${damageDetail(d) ? ` · ${esc(damageDetail(d))}` : ''}</option>`).join('')}
        </select>
      </label>
      ${others.length ? `
        <div class="field">
          <span>Move to another room</span>
          <div class="move-row">
            <select id="move-target" aria-label="Move to room">
              ${others.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
            </select>
            <button class="btn secondary" data-action="move-photo" data-id="${p.id}">Move</button>
          </div>
        </div>` : ''}
      <div class="footer-tools">
        <button class="btn danger-ghost" data-action="delete-photo" data-id="${p.id}" data-next="${next?.id || prev?.id || ''}">${icon('trash')}Delete photo</button>
      </div>`,
  });
}

let lastZip = null;
const zipSignature = (claim, photos) => JSON.stringify([
  claim.number, claim.lossType, claim.notes,
  claim.rooms.map((r) => [r.id, r.name, r.notes, r.measurements, r.replaceList, r.damages]),
  photos.map((p) => [p.id, p.roomId, p.seq, p.shows, p.showsOther, p.location, p.damage, p.notes, p.damageId, Boolean(p.original)]),
]);

async function exportView(claim) {
  const photos = await store.photosByClaim(claim.id);
  const summary = buildSummary(claim, photos);
  const unlabeled = photos.filter((p) => !p.shows).length;
  const damageLines = claim.rooms.reduce((n, r) => n + (r.damages?.length || 0), 0);
  const signature = zipSignature(claim, photos);
  const ready = lastZip?.claimId === claim.id && lastZip.signature === signature;
  const canShare = ready && navigator.canShare?.({ files: [lastZip.file] });
  return shell({
    title: 'Export',
    sub: claim.number,
    back: `claim/${claim.id}`,
    body: `
      <div class="meta-row">
        <span><b>${claim.rooms.length}</b> rooms</span>
        <span><b>${damageLines}</b> damage lines</span>
        <span><b>${photos.length}</b> photos</span>
        ${unlabeled ? `<span class="warn"><b>${unlabeled}</b> unlabeled</span>` : ''}
      </div>
      <section class="panel">
        <h2>Photos zip</h2>
        <p class="muted">One folder per room, every photo renamed. Includes summary.txt and the damage CSV.</p>
        ${ready ? `
          <p class="ok">${esc(lastZip.file.name)} · ${(lastZip.file.size / 1048576).toFixed(1)} MB</p>
          ${canShare ? `<button class="btn primary xl" data-action="share-zip">${icon('share')}Share / AirDrop / Save to Files</button>` : ''}
          <button class="btn ${canShare ? 'secondary' : 'primary xl'}" data-action="download-zip">${icon('download')}Download zip</button>
          <button class="btn ghost" data-action="build-zip" data-id="${claim.id}">Rebuild zip</button>`
        : `<button class="btn primary xl" data-action="build-zip" data-id="${claim.id}" ${photos.length || damageLines ? '' : 'disabled'}>${icon('archive')}Build zip</button>`}
      </section>
      <section class="panel">
        <h2>Damage list (CSV)</h2>
        <p class="muted">Room by room, ceiling to floor. Opens in Excel, Numbers or Google Sheets.</p>
        <button class="btn secondary" data-action="csv" data-id="${claim.id}" ${damageLines ? '' : 'disabled'}>${icon('table')}Save CSV</button>
      </section>
      <section class="panel">
        <h2>Text summary</h2>
        <button class="btn secondary" data-action="copy-summary">${icon('copy')}Copy summary</button>
        <textarea id="summary" class="mono" readonly>${esc(summary)}</textarea>
      </section>
      <section class="panel">
        <h2>PDF report</h2>
        <p class="muted">Damage table and photos by room. In the print screen, pinch out on the preview or tap Share, then Save to Files.</p>
        <button class="btn secondary" data-action="print" data-id="${claim.id}" ${photos.length || damageLines ? '' : 'disabled'}>${icon('print')}Print or save PDF</button>
      </section>
      <p class="muted small disclaimer">${esc(DISCLAIMER)}</p>`,
  });
}

// ---------- sheets ----------

function openClaimForm(claim) {
  const lossType = claim ? claim.lossType || '' : 'Flood';
  const sheet = openSheet(`
    <h2>${claim ? 'Edit claim' : 'New claim'}</h2>
    <form id="claim-form">
      <label class="field"><span>Claim number</span>
        <input name="number" required autocomplete="off" autocapitalize="characters" value="${esc(claim?.number)}" placeholder="24-18831"></label>
      <label class="field"><span>Property address</span>
        <input name="address" autocomplete="street-address" value="${esc(claim?.address)}" placeholder="Street, city"></label>
      <label class="field"><span>Date of loss</span>
        <input name="dateOfLoss" type="date" value="${esc(claim?.dateOfLoss)}"></label>
      <label class="field"><span>Loss type</span>
        <select name="lossType">${LOSS_TYPES.map((t) => `<option ${t === lossType ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
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
    <p class="muted">Tap each room you will scope.</p>
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

let damageEditor = null;

function editDamage(claim, room, damage) {
  damageEditor = openDamageEditor({
    room,
    damage,
    persist,
    capture: (damageId) => startCapture(claim.id, room.id, true, damageId),
    photosFor: async (damageId) => (await roomPhotos(claim, room)).filter((p) => p.damageId === damageId),
    thumbUrl: (p) => urlFor(p),
    unlink: (damageId) => unlinkDamage(claim.id, damageId),
    onDone: () => { damageEditor = null; closeSheet(); render(); },
  });
}

// ---------- capture + labeling ----------

let captureCtx = null;

// Must be called synchronously inside a tap handler: iOS only opens the
// camera from a direct user gesture.
function startCapture(claimId, roomId, camera, damageId = '') {
  captureCtx = { claimId, roomId, camera, damageId };
  const input = camera ? cameraInput : libraryInput;
  input.value = '';
  input.click();
}

cameraInput.addEventListener('change', () => handleFiles([...cameraInput.files]));
libraryInput.addEventListener('change', () => handleFiles([...libraryInput.files]));

async function handleFiles(files) {
  if (!files.length || !captureCtx) return;
  const { claimId, roomId, camera, damageId } = captureCtx;
  const claim = findClaim(claimId);
  const room = findRoom(claim, roomId);
  if (!room) return;
  // Photos taken from a damage entry are labeled from that entry.
  const linked = findDamage(room, damageId);
  const ids = [];
  try {
    for (let i = 0; i < files.length; i++) {
      busy(files.length > 1 ? `Saving photo ${i + 1} of ${files.length}…` : 'Saving photo…');
      const img = await compressImage(files[i]);
      const photo = {
        id: uid(), claimId, roomId, seq: room.nextSeq++, createdAt: Date.now(), ...img,
        shows: linked && SHOWS.includes(linked.category) ? linked.category : '',
        showsOther: '', location: '', damage: '', notes: '', damageId: linked ? linked.id : '',
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
  if (linked) {
    if (damageEditor?.damageId === linked.id) damageEditor.refresh();
    if (ids.length) toast('Photo added to this damage', 1500);
    return;
  }
  render();
  if (ids.length) openLabeler(ids, { camera });
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
    const nextButton = camera && last && !editing;

    const el = openSheet(`
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
          <h3>Severity <span class="muted">(optional)</span></h3>
          ${chipGroup('damage', DAMAGE, draft.damage)}
          <h3>Notes</h3>
          <div class="notes-wrap">
            <textarea class="lab-notes" placeholder="Water line at two feet, drywall needs to come out">${esc(draft.notes)}</textarea>
            ${micButton()}
          </div>
        </div>
        <footer class="lab-foot">
          <div class="btn-row">
            <button type="button" class="btn secondary" data-lab="skip">${editing ? 'Cancel' : 'Skip'}</button>
            <button type="button" class="btn ${nextButton ? 'secondary' : 'primary'}" data-lab="save">${last ? 'Save' : 'Save · next'}</button>
          </div>
          ${nextButton ? `<button type="button" class="btn camera" data-lab="save-next">${icon('camera')}Save &amp; take next photo</button>` : ''}
        </footer>
      </div>`, { full: true });

    const nameEl = el.querySelector('.lab-name');
    const other = el.querySelector('.other-input');
    const notes = el.querySelector('.lab-notes');
    const updateName = () => { nameEl.textContent = photoFileName(claim, room, { ...photo, ...draft }); };
    updateName();
    autosize(notes);

    wireChips(el, draft, (key) => {
      if (key === 'shows') {
        other.hidden = draft.shows !== 'Other';
        if (!other.hidden) other.focus();
      }
      updateName();
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

// ---------- actions ----------

async function loadDemo() {
  const old = claims.filter((c) => c.demo);
  for (const c of old) await store.deletePhotosByClaim(c.id);
  claims = claims.filter((c) => !c.demo);

  const claim = {
    id: uid(), demo: true, number: '24-18831', address: '1427 Bayou Ridge Dr, Houston, TX',
    lossType: 'Flood', dateOfLoss: '2026-09-28', rooms: [], createdAt: Date.now(),
    notes: 'Insured: R. Alvarez. Water entered from the street around 6 AM. Power was off for 3 days.',
  };
  // damages: [category, action, qty, unit, water line in, notes]
  // photos: [shows, location, severity, notes, index of linked damage]
  const plan = {
    Kitchen: {
      notes: 'Standing water about 2 ft. Lower cabinets swollen.',
      measurements: '12 x 14, 8 ft ceiling',
      damages: [
        ['Drywall', 'Remove & replace', 112, 'SF', 24, 'Flood cut at 4 ft, all walls'],
        ['Insulation', 'Remove & replace', 56, 'SF', 24, 'Exterior walls only'],
        ['Baseboard', 'Remove & replace', 52, 'LF', 24, ''],
        ['Cabinets', 'Remove & replace', 14, 'LF', 24, 'Base cabinets, toe kicks delaminated'],
        ['Appliances', 'Remove', 2, 'EA', 24, 'Dishwasher and range'],
        ['Flooring', 'Remove & replace', 168, 'SF', 24, 'LVP lifting at seams'],
      ],
      photos: [
        ['Overview of room', 'Whole room', '', '', -1],
        ['Water line', 'North wall', 'Moderate', 'Water line at two feet', 0],
        ['Drywall', 'North wall', 'Severe', 'Wicking up to about 30 inches', 0],
        ['Cabinets', 'East wall', 'Severe', 'Base cabinet toe kicks delaminated', 3],
        ['Flooring', 'Floor', 'Moderate', 'LVP lifting at seams', 5],
      ],
    },
    'Living Room': {
      notes: '', measurements: '16 x 18, 8 ft ceiling',
      damages: [
        ['Drywall', 'Remove & replace', 136, 'SF', 18, 'Flood cut at 2 ft'],
        ['Baseboard', 'Remove & replace', 68, 'LF', 18, ''],
        ['Carpet & pad', 'Remove & replace', 288, 'SF', 18, 'Saturated, odor present'],
      ],
      photos: [
        ['Overview of room', 'Whole room', '', '', -1],
        ['Carpet', 'Floor', 'Severe', 'Carpet and pad saturated, odor present', 2],
        ['Baseboard', 'West wall', 'Moderate', '', 1],
        ['Moisture reading', 'South wall', '', 'Meter reads 38 percent at 12 inches', 0],
      ],
    },
    Basement: {
      notes: 'Fully flooded. Water heater and furnace submerged.',
      measurements: '',
      damages: [
        ['Drywall', 'Remove & replace', 320, 'SF', 72, 'Finished walls, full height'],
        ['Insulation', 'Remove & replace', 320, 'SF', 72, ''],
        ['Paneling', 'Remove', 120, 'SF', 72, 'Mold behind paneling, treat studs'],
        ['Appliances', 'Replace', 2, 'EA', 72, 'Water heater and furnace'],
      ],
      photos: [
        ['Overview of room', 'Whole room', '', '', -1],
        ['Water line', 'East wall', 'Severe', 'Water line at 6 ft', 0],
        ['Mold', 'Corner', 'Severe', 'Visible growth behind paneling', 2],
        ['Appliance', 'Floor', 'Severe', 'Water heater submerged', 3],
      ],
    },
  };
  busy('Building demo claim…');
  try {
    for (const [name, data] of Object.entries(plan)) {
      const room = newRoom(claim, name);
      Object.assign(room, { notes: data.notes, measurements: data.measurements });
      room.damages = data.damages.map(([category, action, qty, unit, waterLine, notes], i) => ({
        id: uid(), category, categoryOther: '', action, qty: String(qty), unit, waterLine: String(waterLine), notes, createdAt: Date.now() + i,
      }));
      for (const [shows, location, damage, notes, link] of data.photos) {
        const img = await makePlaceholder({ shows, room: name, location });
        await store.putPhoto({
          id: uid(), claimId: claim.id, roomId: room.id, seq: room.nextSeq++, createdAt: Date.now(),
          ...img, shows, showsOther: '', location, damage, notes, damageId: room.damages[link]?.id || '',
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

function saveFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
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
    if (!confirm(`Delete ${room.name}, its damage entries and all its photos?`)) return;
    await store.deletePhotosByRoom(room.id);
    claim.rooms = claim.rooms.filter((r) => r !== room);
    persist();
    go(`claim/${claim.id}`);
  },
  'add-damage': (el) => {
    const claim = findClaim(el.dataset.claim);
    editDamage(claim, findRoom(claim, el.dataset.room), null);
  },
  'edit-damage': (el) => {
    const claim = findClaim(el.dataset.claim);
    const room = findRoom(claim, el.dataset.room);
    editDamage(claim, room, findDamage(room, el.dataset.id));
  },
  camera: (el) => startCapture(el.dataset.claim, el.dataset.room, true),
  library: (el) => startCapture(el.dataset.claim, el.dataset.room, false),
  'edit-label': (el) => openLabeler([el.dataset.id], { editing: true }),
  markup: async (el) => {
    const photo = await store.getPhoto(el.dataset.id);
    openMarkup(photo, {
      save: async (canvas) => {
        busy('Saving markup…');
        try {
          photo.original = photo.original || photo.blob;
          Object.assign(photo, await encodeImage(canvas));
          await store.putPhoto(photo);
          dropUrls(photo.id);
        } catch (err) {
          toast(`Could not save markup. ${errorText(err)}`, 5000);
        } finally {
          busy(null);
        }
      },
      onDone: () => { closeSheet(); render(); },
    });
  },
  'undo-markup': async (el) => {
    const photo = await store.getPhoto(el.dataset.id);
    if (!photo?.original || !confirm('Remove the markup and restore the original photo?')) return;
    Object.assign(photo, await encodeImage(await loadImage(photo.original)), { blob: photo.original });
    delete photo.original;
    await store.putPhoto(photo);
    dropUrls(photo.id);
    render();
  },
  'move-photo': async (el) => {
    const photo = await store.getPhoto(el.dataset.id);
    const claim = findClaim(photo.claimId);
    const target = findRoom(claim, document.getElementById('move-target').value);
    photo.roomId = target.id;
    photo.seq = target.nextSeq++;
    photo.damageId = '';
    persist();
    await store.putPhoto(photo);
    toast(`Moved to ${target.name}`);
    go(`claim/${claim.id}/room/${target.id}/photo/${photo.id}`);
  },
  'delete-photo': async (el) => {
    const photo = await store.getPhoto(el.dataset.id);
    if (!photo || !confirm('Delete this photo? This cannot be undone.')) return;
    await store.deletePhoto(photo.id);
    dropUrls(photo.id);
    const base = `claim/${photo.claimId}/room/${photo.roomId}`;
    go(el.dataset.next ? `${base}/photo/${el.dataset.next}` : base);
  },
  'build-zip': async (el) => {
    const claim = findClaim(el.dataset.id);
    busy('Building zip…');
    try {
      const photos = await store.photosByClaim(claim.id);
      const blob = await buildZip(claim, photos, (pct) => busy(`Building zip… ${Math.round(pct)}%`));
      lastZip = {
        claimId: claim.id,
        signature: zipSignature(claim, photos),
        file: new File([blob], `${fileStem(claim)}_photos.zip`, { type: 'application/zip' }),
      };
      render();
    } catch (err) {
      toast(errorText(err), 5000);
    } finally {
      busy(null);
    }
  },
  'download-zip': () => saveFile(lastZip.file),
  'share-zip': async () => {
    try {
      await navigator.share({ files: [lastZip.file], title: lastZip.file.name });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Sharing failed. Use Download zip instead.');
    }
  },
  csv: async (el) => {
    const claim = findClaim(el.dataset.id);
    const csv = buildCsv(claim, await store.photosByClaim(claim.id));
    const file = new File([csv], `${fileStem(claim)}_damage.csv`, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    saveFile(file);
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
    try {
      await printReport(claim, await store.photosByClaim(claim.id));
    } catch (err) {
      toast(errorText(err), 5000);
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el, e);
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-action-change="link-damage"]');
  if (!el) return;
  const photo = await store.getPhoto(el.dataset.id);
  photo.damageId = el.value;
  await store.putPhoto(photo);
  toast(el.value ? 'Linked to damage entry' : 'Unlinked', 1500);
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
  if (el.tagName === 'TEXTAREA') autosize(el);
  persistSoon();
});

// ---------- boot ----------

store.requestPersistence();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
