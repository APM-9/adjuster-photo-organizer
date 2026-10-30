// Image compression and demo placeholders.
import { PHOTO_MAX_SIDE, PHOTO_QUALITY, THUMB_MAX_SIDE } from './config.js';

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a readable image.')); };
    img.src = url;
  });
}

function scaled(source, maxSide) {
  const w0 = source.naturalWidth || source.width;
  const h0 = source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress image.'))), 'image/jpeg', quality);
  });
}

async function encode(source) {
  const full = scaled(source, PHOTO_MAX_SIDE);
  const blob = await toBlob(full, PHOTO_QUALITY);
  const thumb = await toBlob(scaled(full, THUMB_MAX_SIDE), 0.72);
  // Free canvas memory early; iOS has a tight canvas budget.
  full.width = full.height = 0;
  return { blob, thumb, width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
}

export async function compressImage(file) {
  return encode(await loadImage(file));
}

const PALETTE = {
  'Overview of room': '#35506b', Drywall: '#8a6d3b', Baseboard: '#6b4f2a',
  Flooring: '#5c4033', Tile: '#3e6b6b', Carpet: '#6b3e57', Cabinets: '#7a5230',
  Ceiling: '#4a5a6a', Wall: '#6a6a4a', Door: '#4f3b2a', Trim: '#5a4a3a',
  Appliance: '#3a4a5a', 'Moisture reading': '#1f5f8b', 'Water line': '#1d4e89',
  Mold: '#3d5a2a', Other: '#555',
};

export async function makePlaceholder({ shows, room, location }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  const base = PALETTE[shows] || '#444';
  const g = ctx.createLinearGradient(0, 0, 1200, 900);
  g.addColorStop(0, base);
  g.addColorStop(1, '#111');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 900);

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let x = -900; x < 1200; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 900); ctx.lineTo(x + 900, 0); ctx.stroke();
  }
  if (shows === 'Water line') {
    ctx.fillStyle = 'rgba(80,160,255,0.35)';
    ctx.fillRect(0, 600, 1200, 300);
    ctx.fillStyle = '#9cd0ff';
    ctx.fillRect(0, 596, 1200, 8);
  }

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 96px -apple-system, system-ui, sans-serif';
  ctx.fillText(shows, 600, 420);
  ctx.font = '52px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText([room, location].filter(Boolean).join(' · '), 600, 500);
  ctx.font = 'bold 30px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('DEMO PLACEHOLDER PHOTO', 600, 840);
  return encode(canvas);
}
