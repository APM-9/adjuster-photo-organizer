// Export: zip of photos by room, plain-text summary, CSV damage list,
// printable report. Damage is listed room by room in scoping order.
import { DISCLAIMER } from './config.js';
import { photoFileName, showsText, folderName, claimFolderName } from './naming.js';
import { sortedDamages, damageTitle, damageDetail } from './damage.js';

const byRoom = (claim, photos) => claim.rooms.map((room) => ({
  room,
  damages: sortedDamages(room),
  photos: photos.filter((p) => p.roomId === room.id).sort((a, b) => a.seq - b.seq),
}));

function labelLine(p) {
  return [
    showsText(p) && `Shows: ${showsText(p)}`,
    p.location && `Location: ${p.location}`,
    p.damage && `Severity: ${p.damage}`,
  ].filter(Boolean).join(' | ') || 'Not labeled';
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const linkedNames = (claim, room, photos, damageId) =>
  photos.filter((p) => p.damageId === damageId).map((p) => photoFileName(claim, room, p));

export function buildSummary(claim, photos) {
  const out = [
    `CLAIM ${claim.number}`,
    claim.address && `Property: ${claim.address}`,
    claim.lossType && `Loss type: ${claim.lossType}`,
    claim.dateOfLoss && `Date of loss: ${formatDate(claim.dateOfLoss)}`,
    `Photos: ${photos.length}`,
    `Exported: ${new Date().toLocaleString()}`,
  ].filter(Boolean);
  if (claim.notes?.trim()) out.push('', 'CLAIM NOTES', claim.notes.trim());

  for (const { room, damages, photos: list } of byRoom(claim, photos)) {
    out.push('', `=== ${room.name.toUpperCase()} ===`);
    if (room.measurements?.trim()) out.push(`Room size: ${room.measurements.trim()}`);
    if (room.notes?.trim()) out.push(`Room notes: ${room.notes.trim()}`);
    if (room.replaceList?.trim()) out.push(`To replace: ${room.replaceList.trim()}`);
    if (damages.length) {
      out.push('', 'Damage:');
      damages.forEach((d, i) => {
        out.push(`${i + 1}. ${damageTitle(d)}${damageDetail(d) ? ` - ${damageDetail(d)}` : ''}`);
        if (d.notes) out.push(`   Notes: ${d.notes}`);
        const names = linkedNames(claim, room, list, d.id);
        if (names.length) out.push(`   Photos: ${names.join(', ')}`);
      });
    }
    if (list.length) {
      out.push('', `Photos (${list.length}):`);
      for (const p of list) {
        out.push(`- ${photoFileName(claim, room, p)}`, `    ${labelLine(p)}`);
        if (p.notes?.trim()) out.push(`    Notes: ${p.notes.trim()}`);
      }
    }
  }
  out.push('', DISCLAIMER);
  return out.join('\n') + '\n';
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(claim, photos) {
  const rows = [['Claim', 'Loss type', 'Room', 'Line', 'Category', 'Action', 'Quantity', 'Unit', 'Water line (in)', 'Notes', 'Photos']];
  for (const { room, damages, photos: list } of byRoom(claim, photos)) {
    damages.forEach((d, i) => rows.push([
      claim.number, claim.lossType, room.name, i + 1, damageTitle(d), d.action, d.qty, d.unit, d.waterLine, d.notes,
      linkedNames(claim, room, list, d.id).join('; '),
    ]));
  }
  // Byte-order mark so Excel opens it as UTF-8.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const fileStem = (claim) => String(claim.number || 'claim').replace(/[^A-Za-z0-9-]+/g, '-');

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
  if (claim.rooms.some((r) => r.damages?.length)) root.file(`${fileStem(claim)}_damage.csv`, buildCsv(claim, photos));
  // JPEGs are already compressed; STORE is much faster on a phone.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => onProgress?.(m.percent));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function printReport(claim, photos) {
  const root = document.getElementById('print-root');
  const made = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); made.push(u); return u; };

  const sections = byRoom(claim, photos)
    .filter((s) => s.photos.length || s.damages.length || s.room.notes || s.room.measurements || s.room.replaceList);
  const note = (label, text) => (text?.trim() ? `<p class="pr-notes"><b>${label}:</b> ${esc(text)}</p>` : '');
  root.innerHTML = `
    <header class="pr-head">
      <h1>Claim ${esc(claim.number)}</h1>
      <p>${esc(claim.address)}</p>
      <p>${[
        claim.lossType && `Loss type: ${esc(claim.lossType)}`,
        claim.dateOfLoss && `Date of loss: ${esc(formatDate(claim.dateOfLoss))}`,
        `${photos.length} photos`,
        `Printed ${esc(new Date().toLocaleDateString())}`,
      ].filter(Boolean).join(' · ')}</p>
      ${claim.notes?.trim() ? `<p class="pr-notes">${esc(claim.notes)}</p>` : ''}
    </header>
    ${sections.map(({ room, damages, photos: list }) => `
      <section class="pr-room">
        <h2>${esc(room.name)} <span>${damages.length} damage line${damages.length === 1 ? '' : 's'} · ${list.length} photo${list.length === 1 ? '' : 's'}</span></h2>
        ${note('Room size', room.measurements)}${note('Notes', room.notes)}${note('To replace', room.replaceList)}
        ${damages.length ? `
          <table class="pr-table">
            <thead><tr><th>#</th><th>Category</th><th>Action</th><th>Qty</th><th>Water line</th><th>Notes</th></tr></thead>
            <tbody>${damages.map((d, i) => `
              <tr><td>${i + 1}</td><td>${esc(damageTitle(d))}</td><td>${esc(d.action)}</td>
              <td>${esc(d.qty ? `${d.qty} ${d.unit || ''}` : '')}</td><td>${esc(d.waterLine ? `${d.waterLine} in` : '')}</td><td>${esc(d.notes)}</td></tr>`).join('')}
            </tbody>
          </table>` : ''}
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
      </section>`).join('')}
    <footer class="pr-foot">${esc(DISCLAIMER)}</footer>`;

  await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  const cleanup = () => {
    root.innerHTML = '';
    made.forEach((u) => URL.revokeObjectURL(u));
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
