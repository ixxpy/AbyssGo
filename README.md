# Bedrock Go — Multiplayer Edition

Real accounts, real friends, real shared clans, real chat — backed by an actual server.
Zero npm dependencies (pure Node.js), so there is nothing that can fail to install.

## Run it on Replit (recommended)

1. Create a new Repl → "Import from files" or just create a **Node.js** Repl and upload
   these files, keeping the folder structure (`server.js`, `package.json`, `public/` folder
   with everything inside it).
2. Click **Run**. Replit auto-detects `npm start` → `node server.js`.
3. Replit gives you a public `https://your-repl-name.username.repl.co` URL — that's the
   address anyone can open to register, log in, add friends, and chat with each other.
4. Turn on **Always On** (or use Replit's "Deployments" feature) so the server — and
   everyone's accounts — stay live even when you close the tab.

## Installing it like an app on Android (Chrome)

Once it's live at a real URL:
1. Open that URL in Chrome on your phone.
2. Tap the **⋮ menu → Install app** (or you'll see an automatic "Add Bedrock Go to Home
   screen" banner). This installs it as a real standalone app icon — full screen, no
   browser bar, works offline for the app shell.
3. This is a PWA install, not a literal `.apk` file — but it behaves like one once
   installed. If you specifically want a real downloadable `.apk`:
   - Go to **pwabuilder.com**, paste your live Replit URL, and it will generate a real,
     signed Android APK/AAB for free — no coding needed, just needs your app to be live
     at a public URL first (which Replit gives you).

## What's real vs. simulated

- **Real**: accounts (hashed passwords, never stored in plain text), sessions/login,
  friends between actual different users, shared clans visible to every member,
  direct-message chat and clan chat (polled every 3s to feel live), admin access
  gated server-side by a developer whitelist.
- **Simulated for now**: the in-game economy (Tickets/A-Cubes top-ups, VIP upgrades,
  redeem codes) — no real payments are wired up, it just grants currency instantly,
  same as before.
- **Data storage**: a single `db.json` file next to `server.js` (auto-created). Fine for
  a project like this; if it ever needs to survive heavy concurrent traffic, swap it for
  a real database later — the API layer won't need to change from the frontend's side.

## Default avatar

Every new player starts with a default blocky avatar (black hair, purple shirt with an
"A" logo, black pants) instead of an emoji — shown on Home, Profile, Avatar tab, and
everywhere else until they upload their own skin or profile picture.
