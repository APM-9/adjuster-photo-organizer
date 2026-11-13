# Field Photos

M.L.E. Flood Adjuster app.

A mobile-first app for flood claim field adjusters. It captures damage room by room on site (damage lines, photos, voice notes) and exports a clean list to enter into the estimate at home. It runs in Safari on iPhone with nothing to install, and works offline.

It is not an estimating tool and does not connect to one. The phone is always the working copy (claims, rooms and damage lines in localStorage, photos in IndexedDB), so it works with no signal. Optional cloud sync through Supabase backs everything up and keeps several devices in step.

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
| 6. Offline + sync | Done. Sync turns on once a Supabase project is connected (below) |
| 7. Export: PDF, text, CSV in room-by-room scoping order | Done |

Exports list each room's damage ceiling to floor, then fixtures and contents (order set in `js/config.js`). The zip holds one folder per room of renamed photos (`24-18831_Kitchen_Drywall_NorthWall_03.jpg`), `summary.txt` and the damage CSV.

## Open it on an iPhone

Deployed on Netlify from `main` (every push redeploys).

1. In Safari, open the site address.
2. Tap **Share → Add to Home Screen**, and launch it from that icon from then on. iOS can clear site data for Safari tabs unused for 7 days, but not for home-screen apps.
3. Allow camera and microphone when asked.

## Cloud sync (Supabase)

Sync is off until the app is connected to a Supabase project. One-time setup:

1. Create a free project at https://supabase.com (pick the US East region for NJ).
2. In the project: **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it. It creates the tables, a private `photos` storage bucket, and row-level security so each signed-in adjuster only sees their own data.
3. **Project Settings → API**: copy the Project URL and the `anon` `public` key into `js/sync-config.js`. The anon key is meant to be public. Never use the `service_role` key in the app.
4. Optional: **Authentication → Sign In / Providers → Email**: leave "Confirm email" on (new accounts click a link in an email before first sign-in) or turn it off for a faster demo.

How it works:
- Sign in on the **Account** screen (cloud button on the Claims screen) with email and password.
- Changes sync a few seconds after each edit, when the app opens, when the connection comes back, and every minute. **Sync now** forces it.
- Each claim (rooms, notes, damage lines) is one record; photos are a record plus image files. If the same item was changed on two devices, the most recent edit wins.
- Deletes sync too. Demo claims never sync. Signing out keeps everything on the phone.

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
| `js/store.js` | localStorage + IndexedDB |
| `js/sync.js` | Supabase sign-in and two-way sync |
| `js/sync-config.js` | Supabase project URL and anon key |
| `supabase/schema.sql` | Database, storage and security setup for Supabase |
| `js/images.js` | Photo compression (1600px long side, JPEG 0.82) and demo placeholders |
| `js/naming.js` | Photo file names |
| `js/export.js` | Zip, text summary, CSV, PDF report |
| `sw.js` | Offline cache (bump `VERSION` when shipping changes) |
| `vendor/jszip.min.js` | Local JSZip, used when the CDN can't be reached |
| `vendor/supabase.js` | Supabase JS client 2.45.4 (MIT), loaded only when sync is configured |
| `netlify.toml` | Netlify settings |

## Not built yet

- **Team accounts.** Sync is per adjuster; firm accounts and an admin view come later.
- **App-level encryption.** Data on the phone relies on iOS device encryption; Supabase encrypts its database and storage at rest. End-to-end encryption is not built.
- **Password reset** from inside the app (can be done from the Supabase dashboard for now).
- **Privacy policy.**
- Team accounts, templates, FileTrac export, sketch helpers (see the handoff).
