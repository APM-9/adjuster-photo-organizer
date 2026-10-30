# Field Photos

M.L.E. Flood Adjuster app.

A mobile-first photo and notes organizer for flood claim field adjusters. It runs in Safari on iPhone with nothing to install. It sits before Xactimate: every photo is sorted by room, renamed and labeled on site, so at home they upload with no re-sorting.

No login, no server, no connection to Xactimate/XactAnalysis. Data stays on the phone: claims and notes in localStorage, photos in IndexedDB.

## Open it on an iPhone

1. Host the folder on any HTTPS static host. This repo is private, so GitHub Pages needs a paid plan; free options are Netlify Drop (drag the folder onto app.netlify.com/drop), Cloudflare Pages or Vercel, each connected to this repo.
2. On the iPhone, open Safari and go to the site address.
3. Tap **Share → Add to Home Screen**. Launch it from the home-screen icon from then on. This matters: iOS can clear site data for Safari tabs that go unused for 7 days, but not for home-screen apps.
4. Allow camera and microphone when asked.

HTTPS is required for dictation and offline mode. All of the hosts above give you HTTPS.

## Testing on a computer

```
cd adjuster-photo-organizer
python3 -m http.server 8000
```
Then open http://localhost:8000. Plain `http://` on a phone over Wi-Fi works for photos, but dictation and offline caching need HTTPS.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | High-contrast theme + print report layout |
| `js/config.js` | Room, label, location and damage lists; photo size settings |
| `js/store.js` | localStorage + IndexedDB |
| `js/images.js` | Photo compression (1600px long side, JPEG 0.82) and demo placeholders |
| `js/naming.js` | File names, e.g. `24-18831_Kitchen_Drywall_NorthWall_03.jpg` |
| `js/export.js` | Zip, text summary, printable report |
| `js/app.js` | Screens, navigation, capture and labeling flow |
| `sw.js` | Offline cache (bump `VERSION` when shipping changes) |
| `vendor/jszip.min.js` | Local JSZip, used when the CDN can't be reached |

## Adding later

- Xactimate-style category names: edit the lists in `js/config.js`.
- Shareable report links / cloud backup: would need a backend; `js/store.js` is the only file that touches storage.
