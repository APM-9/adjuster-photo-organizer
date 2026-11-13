# Handoff: Field Adjuster Notes App (Flood Claims)

## 1. Context

- Owner: Ashanti Maurice, Perth Amboy, NJ. Builds mostly from an iPhone, so everything must work great on iPhone (mobile-first PWA or native-feeling web app).
- Origin: a friend's friend is a flood claims field adjuster who uses Xactimate. He handwrites damage notes on site (rooms, drywall, flooring, tile, what needs redoing), then retypes them into Xactimate. He's willing to pay for something that makes this easier.
- He has been slow to respond, so the build must stand on its own as a demo.

## 2. The Problem

Adjusters capture damage by hand in the field, then re-enter it into Xactimate at a desk. That's double work on every claim, and it gets worse in storm surges when they handle many claims.

## 3. Product Concept

A fast, offline-friendly mobile app that captures damage room by room and exports a clean list the adjuster enters into Xactimate.

- It is NOT a Xactimate replacement. It makes Xactimate faster. No Xactimate login or credentials are used or stored.

## 4. MVP Features (build in this order)

1. Create a claim (claim number, address, date of loss, loss type: flood).
2. Add rooms (kitchen, bedroom, etc.).
3. Per room: damage entries with category (drywall, flooring, tile, baseboard, insulation, cabinets, etc.), affected area/measurements, notes, water line height, and action (remove, replace, clean, dry).
4. Photo capture attached to a room or damage entry, with annotation if easy.
5. Voice-to-text for notes (adjusters have wet, gloved hands).
6. Works offline, syncs when back online (flood zones lose signal).
7. Export: clean room-by-room list as PDF and copy-friendly text/CSV, ordered the way Xactimate entry flows.

## 5. Later Features

- Team accounts with an admin dashboard for firms.
- Templates for common loss patterns, saved per adjuster or firm.
- Export formats to fit FileTrac or other file systems (research needed; FKS uses FileTrac).
- Sketch/measurement helpers.

## 6. Protection Strategy (build this into the work)

- Own everything: private GitHub repo under Ashanti's account, own domain, own brand name. Check the name for trademark conflicts before launch.
- Clean separation from Xactimate: no scraping, no using Verisk data, no implying affiliation. Add a disclaimer: "Not affiliated with or endorsed by Verisk or Xactimate."
- Agreements before sharing: get a short written agreement with the friend's friend before any demo that states Ashanti owns the code, brand, and design, plus a simple NDA for firm conversations. Have an attorney review (Ashanti needs a real lawyer; this is not legal advice).
- Pilot terms in writing: free pilot in exchange for feedback and a quote, with no ownership claim by the pilot users.
- Moat is traction, not secrecy: real users, saved templates, and firm workflows make switching painful. Speed to paying users matters more than hiding the idea.
- Demo without exposing the core: show screens and exports, keep the repo private.
- Consider an IP attorney consult and registering the business entity (Ashanti already plans an LLC structure) before talking to large firms.

## 7. Business Model

- Pricing target: $30-50/month per adjuster, with a firm team plan (per-seat discount, admin dashboard).
- Context: Xactimate runs about $350/month or $2,690/year, so this is a small add-on cost.
- Goal math: about 210 adjusters at $40/month is roughly $100k/year. Firms are the faster path.

## 8. Go-to-Market Plan

1. Working demo on iPhone with one full flow (claim, rooms, damage, photos, export).
2. Show the friend's friend; ask for a quote on time saved.
3. Offer free use for two claims to other adjusters (independent adjuster groups on Facebook and LinkedIn).
4. Charge once 3-4 adjusters use it regularly.
5. Pitch firms a team plan. Targets researched:
   - FKS Insurance Services: claims 7,500 loss adjusting professionals (self-reported), flood field team does room-by-room scoping and photo documentation, uses FileTrac. Contact role: Flood Claims Manager (Tony Donizetti).
   - Curley Adjustment Bureau: flood adjusting across NJ, PA, DE.
   - GPS Claims: NFIP and private flood, nationwide.
6. Local networking: NJ Real Estate Investors Association (Meetup), NJ Tech Meetup (Hoboken), and the NJEDA Founders and Funders event on Dec 3, 2026 in New Brunswick.

## 9. Technical Notes for Claude Code

- Stack suggestion: React or Next.js PWA with offline storage (IndexedDB) and a simple backend (Supabase or Firebase) for auth and sync. Open to changes.
- iPhone-first: large tap targets, camera access, dictation, fast load.
- Security: adjusters handle homeowners' addresses and photos, so use proper auth, encrypted storage, and a clear privacy policy.
- Keep the code modular so a team/firm layer can be added.

## 10. Open Questions to Settle in Claude Code

- App name and branding.
- Exact export format that matches Xactimate's entry order.
- Which damage categories and units to include by default.
- PWA vs native wrapper.
