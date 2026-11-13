# Field Photos

M.L.E. Flood Adjuster app.

A mobile-first app for flood claim field adjusters. It captures damage room by room on site (damage lines, photos, voice notes) and exports a clean list to enter into the estimate at home. It runs in Safari on iPhone with nothing to install, and works offline.

It is not an estimating tool and does not connect to one. No login, no server: data stays on the phone (claims, rooms and damage lines in localStorage, photos in IndexedDB).

Not affiliated with or endorsed by Verisk or Xactimate.

Product brief, business plan and open questions: [docs/HANDOFF.md](docs/HANDOFF.md).

## What it does

| Handoff MVP item | Status |
| --- | --- |
| 1. Claim: number, address, date of loss, loss type | Done |
| 2. Rooms | Done |
| 3. Damage lines: category, action, quantity + unit, water line, notes | Done |
| 4. Photos per room or per damage line, with markup | Done |
| 5. Voice-to-text notes | Done (browser dictation, plus the iPhone keyboard mic) |
| 6. Offline | Done. Sync is not built: it needs a backend and accounts |
| 7. Export: PDF, text, CSV in room-by-room scoping order | Done |

Exports list each room's damage ceiling to floor, then fixtures and contents (order set in `js/config.js`). The zip holds one folder per room of renamed photos (`24-18831_Kitchen_Drywall_NorthWall_03.jpg`), `summary.txt` and the damage CSV.

## Open it on an iPhone

Deployed on Netlify from `main` (every push redeploys).

1. In Safari, open the site address.
2. Tap **Share → Add to Home Screen**, and launch it from that icon from then on. iOS can clear site data for Safari tabs unused for 7 days, but not for home-screen apps.
3. Allow camera and microphone when asked.

## Testing on a computer

```
python3 -m http.server 8000
```
Then open http://localhost:8000. Dictation and offline caching need HTTPS.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | High-contrast theme + print report layout |
| `js/config.js` | Rooms, damage categories (in scoping order) with default units, actions, loss types, photo labels, disclaimer |
| `js/app.js` | Screens, navigation, capture and labeling flow |
| `js/damage.js` | Damage line editor and ordering |
| `js/markup.js` | Draw on photos |
| `js/ui.js` | Shared UI helpers (sheets, chips, toasts, dictation) |
| `js/store.js` | localStorage + IndexedDB. The one place to add sync |
| `js/images.js` | Photo compression (1600px long side, JPEG 0.82) and demo placeholders |
| `js/naming.js` | Photo file names |
| `js/export.js` | Zip, text summary, CSV, PDF report |
| `sw.js` | Offline cache (bump `VERSION` when shipping changes) |
| `vendor/jszip.min.js` | Local JSZip, used when the CDN can't be reached |
| `netlify.toml` | Netlify settings |

## Not built yet

- **Sync and accounts.** Needs a backend (Supabase or Firebase) and a decision on where homeowners' data lives. All storage goes through `js/store.js`.
- **Encryption at rest.** Data on the phone is protected by iOS device encryption, not by the app. Needed with accounts and before firm pilots.
- **Privacy policy.**
- Team accounts, templates, FileTrac export, sketch helpers (see the handoff).
