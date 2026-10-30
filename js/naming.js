// File and folder naming for exported photos.
// Example: 24-18831_Kitchen_Drywall_NorthWall_03.jpg

export function pascal(text) {
  return String(text || '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

function claimPart(number) {
  return String(number || 'Claim').trim().replace(/[^A-Za-z0-9-]+/g, '-') || 'Claim';
}

export function showsText(photo) {
  if (photo.shows === 'Other' && photo.showsOther) return photo.showsOther;
  return photo.shows || '';
}

export function photoFileName(claim, room, photo) {
  return [
    claimPart(claim.number),
    pascal(room?.name),
    pascal(showsText(photo)),
    pascal(photo.location),
    String(photo.seq).padStart(2, '0'),
  ].filter(Boolean).join('_') + '.jpg';
}

export function folderName(text) {
  return String(text || '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled';
}

export function claimFolderName(claim) {
  return folderName(`${claimPart(claim.number)} ${claim.address || ''}`);
}
