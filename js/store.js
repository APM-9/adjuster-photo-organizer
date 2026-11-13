// Persistence: claims/rooms/notes in localStorage, photo blobs in IndexedDB.

const CLAIMS_KEY = 'fpo.claims.v1';

export function loadClaims() {
  try {
    return JSON.parse(localStorage.getItem(CLAIMS_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveClaims(claims) {
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
}

let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('field-photos', 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('claimId', 'claimId');
        s.createIndex('roomId', 'roomId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
});

async function photos(mode) {
  return (await db()).transaction('photos', mode).objectStore('photos');
}

// Hooks for sync: told about local photo changes and deletions.
export const hooks = { photoChanged: null, photosDeleted: null };

// touch: false when writing data that came from sync, so it is not
// treated as a new local edit.
export async function putPhoto(photo, { touch = true } = {}) {
  if (touch) photo.updatedAt = Date.now();
  const s = await photos('readwrite');
  s.put(photo);
  await finished(s.transaction);
  if (touch) hooks.photoChanged?.(photo);
}

export async function allPhotos() {
  return done((await photos('readonly')).getAll());
}

export async function getPhoto(id) {
  return done((await photos('readonly')).get(id));
}

export async function deletePhoto(id, { silent = false } = {}) {
  const s = await photos('readwrite');
  s.delete(id);
  await finished(s.transaction);
  if (!silent) hooks.photosDeleted?.([id]);
}

export async function photosByClaim(claimId) {
  const list = await done((await photos('readonly')).index('claimId').getAll(claimId));
  return list.sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
}

async function deleteByIndex(index, key, silent) {
  const s = await photos('readwrite');
  const ids = [];
  const req = s.index(index).openCursor(key);
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) { ids.push(cursor.primaryKey); cursor.delete(); cursor.continue(); }
  };
  await finished(s.transaction);
  if (!silent && ids.length) hooks.photosDeleted?.(ids);
  return ids;
}

export const deletePhotosByClaim = (claimId, { silent = false } = {}) => deleteByIndex('claimId', claimId, silent);
export const deletePhotosByRoom = (roomId, { silent = false } = {}) => deleteByIndex('roomId', roomId, silent);

// Fingerprint of a claim's content, ignoring its edit time. Used to tell
// which claims changed since they were last saved or synced.
export function contentHash(obj) {
  const text = JSON.stringify({ ...obj, updatedAt: undefined });
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + text.length.toString(36);
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* not supported */ }
}

export async function usage() {
  try {
    const { usage } = await navigator.storage.estimate();
    return usage;
  } catch {
    return null;
  }
}
