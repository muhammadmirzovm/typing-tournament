# Typing Tournament

Realtime, ephemeral typing tournament. Host creates a room, players join by key,
and race head-to-head. It's a full-placement bracket — winners play up, losers
play other losers, so everyone is ranked 1st to last. Eliminated/waiting players
can spectate live matches. No auth, no database — everything lives in server
memory and clears when the room empties.

## Stack
- **Server:** Node + Express + Socket.IO (in-memory state)
- **Client:** React + Vite + socket.io-client
- **Text:** MonkeyType-style random common words

## Run locally

Two terminals:

```bash
# 1) server
cd server
npm install
npm run dev      # http://localhost:3001

# 2) client
cd client
npm install
npm run dev      # http://localhost:5173
```

Open http://localhost:5173 — the header should show **connected**.

## Deploy for FREE (no credit card, no money)

The whole app runs on free tiers. Two free services:

**1. Server → Render (free web service)**
- Push this repo to GitHub.
- On [render.com](https://render.com): New → Blueprint → pick this repo. It reads
  [`render.yaml`](render.yaml) and deploys the `server/` folder for free.
- Render's free tier runs a real Node process, so WebSockets work. (It sleeps
  after ~15 min idle and wakes on the next visit — fine for on-demand play.)
- Copy the server URL, e.g. `https://typing-tournament-server.onrender.com`.

**2. Client → Vercel (free static hosting)**
- On [vercel.com](https://vercel.com): New Project → import this repo.
- Set **Root Directory = `client`** (Vercel auto-detects Vite).
- Add an env var: `VITE_SERVER_URL` = your Render server URL from step 1.
- Deploy. You get a free `https://your-app.vercel.app` URL to share.

**3. Lock CORS (optional)**
- Back on Render, set the server's `CLIENT_ORIGIN` env var to your Vercel URL.

> ⚠️ Don't host the **server** on Vercel/Netlify — their serverless functions
> kill long-lived WebSocket connections. Static client on Vercel + Node server
> on Render is the free combo that works.

## Build phases
- [x] **Phase 0** — scaffold + socket connection
- [x] **Phase 1** — solo typing engine (WPM, accuracy, finish detection)
- [x] **Phase 2** — rooms & lobby (create / join by key)
- [x] **Phase 3** — one real 2-player race
- [x] **Phase 4** — bracket engine (random pairings, rounds, champion)
- [x] **Phase 5** — odd players & bots (steady-WPM bot fills the odd slot)
- [x] **Phase 6** — robustness (disconnects, walkovers, room/tournament cleanup)
- [x] **Phase 7** — polish & free deploy (replay, invite link, Render + Vercel)
