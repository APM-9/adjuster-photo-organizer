// Shared UI helpers: escaping, icons, toasts, sheets, dictation.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  pen: '<path d="M4 20c4-1 6-3 8-6l6-6-2-2-6 6c-3 2-5 4-6 8z"/>',
  undo: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M9 5v14"/>',
};
export const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const $overlay = document.getElementById('overlay');
const $toast = document.getElementById('toast');

let toastTimer;
export function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), ms);
}

export function busy(msg) {
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

export function errorText(err) {
  if (err?.name === 'QuotaExceededError') return 'Phone storage for this app is full. Export and delete an old claim, then try again.';
  return err?.message || String(err);
}

// A bottom sheet. Pass full: true for a full-screen panel (labeler, editors).
export function openSheet(html, { full = false } = {}) {
  $overlay.innerHTML = full
    ? html
    : `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  $overlay.classList.add('open');
  document.body.classList.add('locked');
  return full ? $overlay.firstElementChild : $overlay.querySelector('.sheet');
}

export function closeSheet() {
  $overlay.classList.remove('open');
  $overlay.innerHTML = '';
  document.body.classList.remove('locked');
}

$overlay.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeSheet(); });

export function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight + 2, 480)}px`;
}

// Single-select chip row. Tapping the selected chip again clears it.
export function chipGroup(name, options, value) {
  return `<div class="chips" data-group="${name}">${options.map((o) =>
    `<button type="button" class="chip ${o === value ? 'selected' : ''}" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
}

export function wireChips(root, draft, onChange) {
  root.querySelectorAll('[data-group]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const key = group.dataset.group;
      draft[key] = draft[key] === chip.dataset.value ? '' : chip.dataset.value;
      group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.value === draft[key]));
      onChange?.(key);
    });
  });
}

// Browser speech recognition on a button. Returns a stop function.
export function attachMic(btn, textarea) {
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

export const micButton = () => `<button type="button" class="btn mic">${icon('mic')}<span>Dictate</span></button>`;
