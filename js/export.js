// Export: zip of photos by room, plain-text summary, printable report.
import { photoFileName, showsText, folderName, claimFolderName } from './naming.js';

const byRoom = (claim, photos) => claim.rooms.map((room) => ({
  room,
  photos: photos.filter((p) => p.roomId === room.id).sort((a, b) => a.seq - b.seq),
}));

function labelLine(p) {
  return [
    showsText(p) && `Shows: ${showsText(p)}`,
    p.location && `Location: ${p.location}`,
    p.damage && `Damage: ${p.damage}`,
  ].filter(Boolean).join(' | ') || 'Not labeled';
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function buildSummary(claim, photos) {
  const out = [
    `CLAIM ${claim.number}`,
    claim.address && `Property: ${claim.address}`,
    claim.dateOfLoss && `Date of loss: ${formatDate(claim.dateOfLoss)}`,
    `Photos: ${photos.length}`,
    `Exported: ${new Date().toLocaleString()}`,
  ].filter(Boolean);
  if (claim.notes?.trim()) out.push('', 'CLAIM NOTES', claim.notes.trim());

  for (const { room, photos: list } of byRoom(claim, photos)) {
    out.push('', `=== ${room.name.toUpperCase()} (${list.length} photo${list.length === 1 ? '' : 's'}) ===`);
    if (room.notes?.trim()) out.push(`Room notes: ${room.notes.trim()}`);
    if (room.measurements?.trim()) out.push(`Measurements: ${room.measurements.trim()}`);
    if (room.replaceList?.trim()) out.push(`To replace: ${room.replaceList.trim()}`);
    for (const p of list) {
      out.push(`- ${photoFileName(claim, room, p)}`, `    ${labelLine(p)}`);
      if (p.notes?.trim()) out.push(`    Notes: ${p.notes.trim()}`);
    }
  }
  return out.join('\n') + '\n';
}

// JSZip comes from the CDN script tag; fall back to the bundled copy when
// the CDN is unreachable (offline, or blocked network).
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('The zip library could not load. Reload the app and try again.'));
    document.head.append(s);
  });
}

export async function buildZip(claim, photos, onProgress) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder(claimFolderName(claim));
  for (const { room, photos: list } of byRoom(claim, photos)) {
    if (!list.length) continue;
    const folder = root.folder(folderName(room.name));
    for (const p of list) folder.file(photoFileName(claim, room, p), p.blob);
  }
  root.file('summary.txt', buildSummary(claim, photos));
  // JPEGs are already compressed; STORE is much faster on a phone.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => onProgress?.(m.percent));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function printReport(claim, photos) {
  const root = document.getElementById('print-root');
  const made = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); made.push(u); return u; };

  const sections = byRoom(claim, photos).filter((s) => s.photos.length || s.room.notes || s.room.measurements || s.room.replaceList);
  root.innerHTML = `
    <header class="pr-head">
      <h1>Claim ${esc(claim.number)}</h1>
      <p>${esc(claim.address)}</p>
      <p>${claim.dateOfLoss ? `Date of loss: ${esc(formatDate(claim.dateOfLoss))} · ` : ''}${photos.length} photos · Printed ${esc(new Date().toLocaleDateString())}</p>
      ${claim.notes?.trim() ? `<p class="pr-notes">${esc(claim.notes)}</p>` : ''}
    </header>
    ${sections.map(({ room, photos: list }) => `
      <section class="pr-room">
        <h2>${esc(room.name)} <span>${list.length} photo${list.length === 1 ? '' : 's'}</span></h2>
        ${room.notes?.trim() ? `<p class="pr-notes"><b>Notes:</b> ${esc(room.notes)}</p>` : ''}
        ${room.measurements?.trim() ? `<p class="pr-notes"><b>Measurements:</b> ${esc(room.measurements)}</p>` : ''}
        ${room.replaceList?.trim() ? `<p class="pr-notes"><b>To replace:</b> ${esc(room.replaceList)}</p>` : ''}
        <div class="pr-grid">
          ${list.map((p) => `
            <figure>
              <img src="${url(p.blob)}" alt="">
              <figcaption>
                <b>${esc(photoFileName(claim, room, p))}</b>
                <span>${esc(labelLine(p))}</span>
                ${p.notes?.trim() ? `<span>${esc(p.notes)}</span>` : ''}
              </figcaption>
            </figure>`).join('')}
        </div>
      </section>`).join('')}`;

  await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  const cleanup = () => {
    root.innerHTML = '';
    made.forEach((u) => URL.revokeObjectURL(u));
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
