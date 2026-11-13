// Cloud sync with Supabase. The phone stays the working copy: everything
// works offline, and sync pushes local changes and pulls changes made on
// other devices whenever there is a connection and the user is signed in.
//
// Claims (with their rooms, notes and damage lines) are one JSON document
// each; photos are a metadata row plus image files in Storage. When the
// same item changed on two devices, the most recent edit wins.
// Demo claims never sync.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './sync-config.js';
import * as store from './store.js';

const STATE_KEY = 'fpo.sync.v1';
const BUCKET = 'photos';
const PAGE = 1000;

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const blankState = (userId = null) => ({
  userId,
  claimsCursor: null,
  photosCursor: null,
  claims: {}, // id -> content hash last synced
  photos: {}, // id -> { updatedAt, rev } last synced
  deletedClaims: [], // ids waiting to be deleted remotely
  deletedPhotos: [], // { id, rev }
  lastSync: null,
});

let state = loadState();
let client = null;
let session = null;
let app = null;
let running = null;
let rerun = false;
let timer = null;
let status = { code: configured ? 'signed-out' : 'off', message: '' };
const listeners = new Set();

function loadState() {
  try {
    return { ...blankState(), ...JSON.parse(localStorage.getItem(STATE_KEY)) };
  } catch {
    return blankState();
  }
}
const saveState = () => localStorage.setItem(STATE_KEY, JSON.stringify(state));

function setStatus(code, message = '') {
  status = { code, message };
  listeners.forEach((fn) => fn(status));
}

export const getStatus = () => status;
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const lastSync = () => state.lastSync;
export const userEmail = () => session?.user?.email || '';

function loadLibrary() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/supabase.js';
    s.onload = () => resolve(window.supabase);
    s.onerror = () => reject(new Error('Could not load the sync library.'));
    document.head.append(s);
  });
}

/**
 * hooks.getClaims() → current claims array
 * hooks.flush() → save pending local edits now
 * hooks.applyClaims(claims) → replace claims with synced data (no edit stamp)
 * hooks.photosUpdated(ids) → photos changed by sync; refresh the screen
 */
export async function init(hooks) {
  app = hooks;
  store.hooks.photoChanged = () => schedule();
  store.hooks.photosDeleted = (ids) => {
    for (const id of ids) {
      const synced = state.photos[id];
      if (synced) state.deletedPhotos.push({ id, rev: synced.rev });
      delete state.photos[id];
    }
    saveState();
    schedule();
  };
  if (!configured) return;
  try {
    const lib = await loadLibrary();
    client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fpo-auth' },
    });
    session = (await client.auth.getSession()).data.session;
    client.auth.onAuthStateChange((_event, next) => {
      const was = session?.user?.id;
      session = next;
      if (!next) setStatus('signed-out');
      else if (next.user.id !== was) schedule(0);
    });
  } catch (err) {
    setStatus('error', err.message);
    return;
  }
  if (!session) { setStatus('signed-out'); return; }
  startWatching();
  schedule(0);
}

// Debounced sync after local edits.
export function schedule(delay = 4000) {
  if (!session) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, delay);
}

export function claimDeleted(id) {
  if (state.claims[id]) state.deletedClaims.push(id);
  delete state.claims[id];
  saveState();
  schedule();
}

export async function signIn(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  session = (await client.auth.getSession()).data.session;
  startWatching();
  return syncNow();
}

export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) return 'confirm';
  session = data.session;
  startWatching();
  await syncNow();
  return 'ok';
}

let watching = false;
function startWatching() {
  if (watching) return;
  watching = true;
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  setInterval(() => schedule(0), 60000);
}

// Local data stays on the phone after signing out.
export async function signOut() {
  clearTimeout(timer);
  await client.auth.signOut();
  session = null;
  setStatus('signed-out');
}

export function syncNow() {
  if (!client || !session) return Promise.resolve();
  if (running) { rerun = true; return running; }
  running = (async () => {
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      if (state.userId !== session.user.id) {
        // Another account on this phone: start fresh so everything here
        // uploads to the account now signed in.
        state = blankState(session.user.id);
        saveState();
      }
      app.flush();
      await pullClaims();
      await pullPhotos();
      await pushClaims();
      await pushPhotos();
      state.lastSync = Date.now();
      saveState();
      setStatus('synced');
    } catch (err) {
      setStatus(navigator.onLine ? 'error' : 'offline', err.message || String(err));
    }
  })().finally(() => {
    running = null;
    if (rerun) { rerun = false; schedule(1000); }
  });
  return running;
}

// ---------- pull ----------

async function pageAll(table, columns, cursor) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select(columns).order('updated_at', { ascending: true });
    // gte, not gt: rows saved in the same instant as the cursor are re-read,
    // which is harmless because applying a row twice changes nothing.
    if (cursor) q = q.gte('updated_at', cursor);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function pullClaims() {
  const rows = await pageAll('claims', 'id,data,deleted,updated_at', state.claimsCursor);
  if (!rows.length) return;
  let claims = [...app.getClaims()];
  let changed = false;
  for (const row of rows) {
    const i = claims.findIndex((c) => c.id === row.id);
    const local = claims[i];
    if (row.deleted) {
      if (local) {
        claims.splice(i, 1);
        await store.deletePhotosByClaim(row.id, { silent: true });
        changed = true;
      }
      delete state.claims[row.id];
    } else if (state.deletedClaims.includes(row.id)) {
      // Deleted here; the delete is about to be pushed.
    } else if (!local || (row.data.updatedAt || 0) > (local.updatedAt || 0)) {
      if (local) claims[i] = row.data; else claims.push(row.data);
      state.claims[row.id] = store.contentHash(row.data);
      changed = true;
    } else if (store.contentHash(local) === store.contentHash(row.data)) {
      state.claims[row.id] = store.contentHash(local);
    }
    state.claimsCursor = row.updated_at;
  }
  if (changed) app.applyClaims(claims);
  saveState();
}

const filePath = (id, rev, kind) => `${session.user.id}/${id}/${rev}-${kind}.jpg`;

async function download(path) {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

async function pullPhotos() {
  const rows = await pageAll('photos', 'id,meta,blob_rev,has_original,deleted,updated_at', state.photosCursor);
  const updated = [];
  for (const row of rows) {
    const local = await store.getPhoto(row.id);
    if (row.deleted) {
      if (local) { await store.deletePhoto(row.id, { silent: true }); updated.push(row.id); }
      delete state.photos[row.id];
    } else if (state.deletedPhotos.some((d) => d.id === row.id) || state.deletedClaims.includes(row.meta.claimId)) {
      // Deleted here; the delete is about to be pushed.
    } else if (!local || (row.meta.updatedAt || 0) > (local.updatedAt || 0)) {
      const rev = row.blob_rev;
      const photo = { ...row.meta, blobRev: rev };
      if (local && (local.blobRev || 1) === rev) {
        Object.assign(photo, { blob: local.blob, thumb: local.thumb, original: local.original });
      } else {
        photo.blob = await download(filePath(row.id, rev, 'full'));
        photo.thumb = await download(filePath(row.id, rev, 'thumb'));
        if (row.has_original) photo.original = await download(filePath(row.id, rev, 'original'));
      }
      if (!photo.original) delete photo.original;
      await store.putPhoto(photo, { touch: false });
      state.photos[row.id] = { updatedAt: photo.updatedAt, rev };
      updated.push(row.id);
    }
    state.photosCursor = row.updated_at;
    saveState();
  }
  if (updated.length) app.photosUpdated(updated);
}

// ---------- push ----------

// Photos sync only with a real (non-demo) claim that exists on this phone.
const syncedClaimIds = () => new Set(app.getClaims().filter((c) => !c.demo).map((c) => c.id));

async function pushClaims() {
  const changed = app.getClaims().filter((c) => !c.demo && state.claims[c.id] !== store.contentHash(c));
  if (changed.length) {
    const { error } = await client.from('claims').upsert(changed.map((c) => ({ id: c.id, data: c, deleted: false })));
    if (error) throw error;
    changed.forEach((c) => { state.claims[c.id] = store.contentHash(c); });
    saveState();
  }
  if (state.deletedClaims.length) {
    const ids = [...state.deletedClaims];
    const { error } = await client.from('claims').upsert(ids.map((id) => ({ id, data: null, deleted: true })));
    if (error) throw error;
    state.deletedClaims = state.deletedClaims.filter((id) => !ids.includes(id));
    saveState();
  }
}

async function upload(path, blob) {
  const { error } = await client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
}

async function removeFiles(id, rev) {
  // Best effort: a leftover file only costs storage.
  await client.storage.from(BUCKET)
    .remove(['full', 'thumb', 'original'].map((kind) => filePath(id, rev, kind)))
    .catch(() => {});
}

async function pushPhotos() {
  const claimIds = syncedClaimIds();
  for (const p of await store.allPhotos()) {
    if (!claimIds.has(p.claimId)) continue;
    const synced = state.photos[p.id];
    if (synced && synced.updatedAt === p.updatedAt) continue;
    const rev = p.blobRev || 1;
    if (!synced || synced.rev !== rev) {
      await upload(filePath(p.id, rev, 'full'), p.blob);
      await upload(filePath(p.id, rev, 'thumb'), p.thumb);
      if (p.original) await upload(filePath(p.id, rev, 'original'), p.original);
      if (synced) await removeFiles(p.id, synced.rev);
    }
    const { blob, thumb, original, ...meta } = p;
    const { error } = await client.from('photos').upsert({
      id: p.id, claim_id: p.claimId, meta, blob_rev: rev, has_original: Boolean(original), deleted: false,
    });
    if (error) throw error;
    state.photos[p.id] = { updatedAt: p.updatedAt, rev };
    saveState();
  }
  for (const gone of [...state.deletedPhotos]) {
    const { error } = await client.from('photos').upsert({ id: gone.id, meta: null, deleted: true });
    if (error) throw error;
    await removeFiles(gone.id, gone.rev);
    state.deletedPhotos = state.deletedPhotos.filter((d) => d.id !== gone.id);
    saveState();
  }
}
