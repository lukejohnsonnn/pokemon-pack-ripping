# Pokémon Pack Ripping

A super satisfying Pokémon pack-ripping app. Real sets, real art, real pull odds — live from the Pokémon TCG API.

- **23 packs**, in four categories: 💎 Rare Packs (9 grail sets), ⚡ Modern (7), 🗡️ Sword & Shield Era (4), 🏛️ Vintage Classics (3)
- Menu packs look like real foil booster packs: crimped seals, chase-card art, Pokémon wordmark, 6+ badge, card-count strip
- Rip flow: tap the pack to tear the foil, then reveal each card by **tapping it or swiping it** (either direction) — tap/swipe again to move on
- **Dopamine celebrations** for super-special cards (Special Illustration / Hyper / Secret / Gold Star, or a $100+ hit; $500+ or Gold Star = GOD PULL): gold aura + teaser on the tear, halo + slow-mo flip on the face-down card, jackpot arpeggio, confetti cannon, flash/shake, GOD PULL banner, price count-up — tied to real pull odds, so god pulls stay rare
- Persistent binder (stats, duplicates, best pulls, pack history) — saved in the browser's localStorage in v1, so no database is needed
- Live TCGplayer market prices, era-correct pack structure (modern 10-card, vintage 11-card, EX/e-Card 9-card, Gold Star ≈ 1-in-67 packs), odds panel in-app

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

## Deploy on Render (free, like Usually)

1. Create an **empty** public repo on GitHub (e.g. `pokemon-pack-ripping` — no README, no license, or the push will clash).
2. Push this repo to it:
   ```bash
   git remote add origin https://github.com/lukejohnsonnn/pokemon-pack-ripping.git
   git push -u origin main
   ```
3. In Render: **New → Web Service → Build and deploy from a Git repository** → pick the repo. Render reads `render.yaml` (the Blueprint): free plan, `npm install`, `node server.js`, health check `/api/health`.
4. Auto-deploy is on: every push to `main` redeploys.

No environment variables or database are required. The app fetches card data live from `https://api.pokemontcg.io/v2` (no API key needed, 1,000 req/day unauthenticated) and caches pools in memory for an hour.

## How data works

- `GET /api/sets` — the 23 sets with live totals/logos when the API answers, baked-in metadata otherwise.
- `GET /api/set/:id` — set + its top chase card (highest TCGplayer market price in the pool), used for pack art.
- `GET /api/pool/:id` — the full live card pool for a set.
- `GET /api/rip/:id` — a freshly drawn pack: era-correct slots, tiers (`normal / holo / ultra / super / god`), total value, best pull.
- `GET /api/health` — uptime + per-set fetch status (which source served each pool: `pokemontcg.io` or `tcgdex` fallback).

If pokemontcg.io is unreachable, the server falls back to TCGdex (`api.tcgdex.net`, same set IDs) for card pools — art still loads, prices just show as unavailable. The shelf always renders from baked-in metadata even if both are down.

> **Heads-up:** pokemontcg.io is deprecated and scheduled to go offline on **1 March 2027**. The TCGdex fallback in `server.js` is already wired in for that day; if prices disappear after the shutdown, the app keeps ripping from TCGdex and prices can be re-pointed at a successor API (e.g. Scrydex) in one place (`loadPool` / `priceOf` in `server.js`).

## Verify

```bash
npm start            # in one terminal
npm run verify       # in another — rips every set and checks counts/structure
```

`scripts/verify.js` hits the running server's `/api/rip/:id` for all 23 sets and asserts pack size, slot structure, and that every set returns real cards. It reports which source served each pool.

## Tech

Node 18+ / Express only (no build step, no frontend framework). Single-page frontend in `public/` — plain HTML/CSS/JS, pointer-events swipe with a lerped `requestAnimationFrame` loop, `touch-action: none` + non-passive `touchmove` so swipes never grab the page.
