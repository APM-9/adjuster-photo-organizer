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

export async function putPhoto(photo) {
  const s = await photos('readwrite');
  s.put(photo);
  return finished(s.transaction);
}

export async function getPhoto(id) {
  return done((await photos('readonly')).get(id));
}

export async function deletePhoto(id) {
  const s = await photos('readwrite');
  s.delete(id);
  return finished(s.transaction);
}

export async function photosByClaim(claimId) {
  const list = await done((await photos('readonly')).index('claimId').getAll(claimId));
  return list.sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
}

async function deleteByIndex(index, key) {
  const s = await photos('readwrite');
  const req = s.index(index).openCursor(key);
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };
  return finished(s.transaction);
}

export const deletePhotosByClaim = (claimId) => deleteByIndex('claimId', claimId);
export const deletePhotosByRoom = (roomId) => deleteByIndex('roomId', roomId);

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
