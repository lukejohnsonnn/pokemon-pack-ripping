// Pokémon Pack Ripping — standalone server.
// Express serves the single-page frontend and proxies the Pokémon TCG API
// (https://api.pokemontcg.io/v2, no key required) with a TCGdex fallback,
// so the app keeps working if pokemontcg.io is slow or down.
// Card pools, prices and odds are all live data — nothing is invented.
// NOTE: pokemontcg.io is deprecated and scheduled to go offline 1 Mar 2027;
// the TCGdex fallback (api.tcgdex.net) is already wired in for that day.
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PTCG = 'https://api.pokemontcg.io/v2';
const TCGDEX = 'https://api.tcgdex.net/v2/en';

// ---------------------------------------------------------------------------
// Set catalogue — baked-in metadata so the shelf always renders, even if
// the API is unreachable. Set IDs, names, categories and printed totals were
// verified against pokemontcg.io / TCGdex / Bulbapedia set lists (Nov 2026).
// Live totals/logos overwrite these at runtime when the API responds.
// Categories: rare 9 / modern 7 / swsh 4 / vintage 3 = 23 sets.
// ---------------------------------------------------------------------------
const SETS = [
  // 💎 Rare Packs (9) — the grail packs, chase cards among the most expensive
  { id: 'base1',   name: 'Base Set',              series: 'Base',            category: 'rare',   era: 'vintage', packSize: 11, total: 102, releaseDate: '1999-01-09', chase: 'Charizard' },
  { id: 'ecard3',  name: 'Skyridge',              series: 'E-Card',          category: 'rare',   era: 'ex',      packSize: 9,  total: 182, releaseDate: '2003-05-12', chase: 'Crystal Charizard' },
  { id: 'ex15',    name: 'Dragon Frontiers',      series: 'EX',              category: 'rare',   era: 'ex',      packSize: 9,  total: 101, releaseDate: '2006-11-08', chase: 'Charizard ★ (Gold Star)' },
  { id: 'ex8',     name: 'EX Deoxys',             series: 'EX',              category: 'rare',   era: 'ex',      packSize: 9,  total: 108, releaseDate: '2005-02-01', chase: 'Rayquaza ★ (Gold Star)' },
  { id: 'neo4',    name: 'Neo Destiny',           series: 'Neo',             category: 'rare',   era: 'vintage', packSize: 11, total: 113, releaseDate: '2002-02-28', chase: 'Shining Charizard' },
  { id: 'swsh7',   name: 'Evolving Skies',        series: 'Sword & Shield',  category: 'rare',   era: 'swsh',    packSize: 10, total: 237, releaseDate: '2021-08-27', chase: 'Umbreon VMAX (Moonbreon)' },
  { id: 'sv8pt5',  name: 'Prismatic Evolutions',  series: 'Scarlet & Violet', category: 'rare',   era: 'modern',  packSize: 10, total: 180, releaseDate: '2025-01-17', chase: 'Umbreon ex (Special Illustration Rare)' },
  { id: 'ecard2',  name: 'Aquapolis',             series: 'E-Card',          category: 'rare',   era: 'ex',      packSize: 9,  total: 182, releaseDate: '2003-01-15', chase: 'Crystal Lugia' },
  { id: 'ex10',    name: 'Unseen Forces',         series: 'EX',              category: 'rare',   era: 'ex',      packSize: 9,  total: 145, releaseDate: '2005-08-22', chase: 'Lugia ex' },
  // ⚡ Modern Packs (7)
  { id: 'sv8',     name: 'Surging Sparks',        series: 'Scarlet & Violet', category: 'modern', era: 'modern',  packSize: 10, total: 252, releaseDate: '2024-11-08', chase: 'Pikachu ex (Special Illustration Rare)' },
  { id: 'sv3pt5',  name: '151',                   series: 'Scarlet & Violet', category: 'modern', era: 'modern',  packSize: 10, total: 207, releaseDate: '2023-09-22', chase: 'Charizard ex (Special Illustration Rare)' },
  { id: 'sv4pt5',  name: 'Paldean Fates',         series: 'Scarlet & Violet', category: 'modern', era: 'modern',  packSize: 10, total: 245, releaseDate: '2024-01-26', chase: 'Charizard ex (Shiny)' },
  { id: 'sv9',     name: 'Journey Together',      series: 'Scarlet & Violet', category: 'modern', era: 'modern',  packSize: 10, total: 190, releaseDate: '2025-03-28', chase: "Lillie's Clefairy ex (Special Illustration Rare)" },
  { id: 'me1',     name: 'Mega Evolution',        series: 'Mega Evolution',   category: 'modern', era: 'modern',  packSize: 10, total: 188, releaseDate: '2025-09-26', chase: 'Mega Lucario ex (Special Illustration Rare)' },
  { id: 'sv10',    name: 'Destined Rivals',       series: 'Scarlet & Violet', category: 'modern', era: 'modern',  packSize: 10, total: 244, releaseDate: '2025-05-30', chase: "Team Rocket's Mewtwo ex" },
  { id: 'sv6',     name: 'Twilight Masquerade',   series: 'Scarlet & Violet', category: 'modern', era: 'modern',  packSize: 10, total: 226, releaseDate: '2024-05-24', chase: 'Greninja ex (Special Illustration Rare)' },
  // 🗡️ Sword & Shield Era (4)
  { id: 'swsh12pt5', name: 'Crown Zenith',        series: 'Sword & Shield',  category: 'swsh',   era: 'swsh',    packSize: 10, total: 230, releaseDate: '2023-01-20', chase: 'Charizard (Galarian Gallery)' },
  { id: 'swsh9',   name: 'Brilliant Stars',       series: 'Sword & Shield',  category: 'swsh',   era: 'swsh',    packSize: 10, total: 186, releaseDate: '2022-02-25', chase: 'Charizard V (Alternate Art)' },
  { id: 'swsh11',  name: 'Lost Origin',           series: 'Sword & Shield',  category: 'swsh',   era: 'swsh',    packSize: 10, total: 217, releaseDate: '2022-09-09', chase: 'Giratina V (Alternate Art)' },
  { id: 'sma',     name: 'Hidden Fates Shiny Vault', series: 'Sun & Moon',   category: 'swsh',   era: 'vault',   packSize: 10, total: 94,  releaseDate: '2019-08-23', chase: 'Shiny Charizard-GX' },
  // 🏛️ Vintage Classics (3)
  { id: 'neo1',    name: 'Neo Genesis',           series: 'Neo',             category: 'vintage', era: 'vintage', packSize: 11, total: 111, releaseDate: '2000-12-16', chase: 'Lugia (1st Edition Holo)' },
  { id: 'neo3',    name: 'Neo Revelation',        series: 'Neo',             category: 'vintage', era: 'vintage', packSize: 11, total: 66,  releaseDate: '2001-09-21', chase: 'Shining Gyarados' },
  { id: 'base5',   name: 'Team Rocket',           series: 'Base',            category: 'vintage', era: 'vintage', packSize: 11, total: 83,  releaseDate: '2000-04-24', chase: 'Dark Charizard' },
];
const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]));

// Era pack structures + the exact draw weights the app uses (shown in the
// in-app odds panel; official per-card odds are not published by TPCi).
const ODDS = {
  modern: { label: 'Modern (Scarlet & Violet / Mega Evolution) — 10 cards', slots: '4 Common · 3 Uncommon · 2 Reverse Holo · 1 Hit', hit: 'Hit slot: Rare / Holo / Ultra / Secret — Secret & alt-art cards are rare pulls, not every pack' },
  swsh:   { label: 'Sword & Shield era — 10 cards', slots: '4 Common · 3 Uncommon · 2 Reverse Holo · 1 Hit', hit: 'Hit slot: Rare / Holo / V / VMAX / Secret — alt-art secrets are rare pulls' },
  vintage:{ label: 'Vintage (Base / Neo) — 11 cards', slots: '7 Common · 3 Uncommon · 1 Rare', hit: 'Rare slot: ~33% Holo Rare, ~67% non-holo Rare (Base Set style)' },
  ex:     { label: 'EX / e-Card era — 9 cards', slots: '5 Common · 2 Uncommon · 1 Reverse Holo · 1 Hit', hit: 'Hit slot: Rare / Holo / ex / Secret — Gold Star ≈ 1.5% of packs (~1 in 67), Crystal / Shining ≈ 3–5%' },
  vault:  { label: 'Hidden Fates Shiny Vault — 10 cards', slots: '10 Shiny Vault cards', hit: 'Every card in the vault is a Shiny / Shiny GX hit' },
};

// ---------------------------------------------------------------------------
// Fetching with cache + fallback. Primary: pokemontcg.io (has TCGplayer
// prices). Fallback: TCGdex (same set IDs for the sets in this app, no prices).
// ---------------------------------------------------------------------------
const cache = new Map(); // key -> { at, value }
const CACHE_TTL_MS = 60 * 60 * 1000;
const fetchStatus = {}; // setId -> { source, cards, at, error? }
// TCGdex uses zero-padded modern IDs (sv8 -> sv08, sv3pt5 -> sv03.5, …).
const TCGDEX_ID = { sv8: 'sv08', sv9: 'sv09', sv6: 'sv06', sv3pt5: 'sv03.5', sv4pt5: 'sv04.5', sv8pt5: 'sv08.5', swsh12pt5: 'swsh12.5', me1: 'me01' };

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'pokemon-pack-ripping/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

// pokemontcg.io is flaky (intermittent 500s) — retry a few times.
async function fetchJsonRetry(url, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try { return await fetchJson(url); }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw lastErr;
}

function priceOf(card) {
  // Prefer TCGplayer market, then Cardmarket trend, then TCGplayer mid.
  // (TCGplayer "mid" on thin vintage markets can be a single fantasy listing,
  // so market prices are checked first.)
  const tp = card.tcgplayer && card.tcgplayer.prices;
  if (tp) {
    for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', 'unlimitedHolofoil']) {
      const p = tp[key];
      if (p && typeof p.market === 'number') return p.market;
    }
    for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', 'unlimitedHolofoil']) {
      const p = tp[key];
      if (p && typeof p.mid === 'number') return p.mid;
    }
  }
  const cm = card.cardmarket && card.cardmarket.prices;
  if (cm && typeof cm.trendPrice === 'number') return cm.trendPrice;
  if (cm && typeof cm.averageSellPrice === 'number') return cm.averageSellPrice;
  return null;
}

function normalizeCard(c) {
  const rarity = (c.rarity && c.rarity.trim()) || 'Common'; // Energies arrive with empty rarity
  const price = priceOf(c);
  const imgSmall = (c.images && c.images.small) || c.image || '';
  const imgLarge = (c.images && c.images.large) || c.image || imgSmall;
  return {
    id: c.id, name: c.name, rarity, price,
    number: c.number, supertype: c.supertype || 'Pokémon',
    subtypes: c.subtypes || [], types: c.types || [],
    image: imgSmall, imageHires: imgLarge,
    isReverse: !!(c.tcgplayer && c.tcgplayer.prices && c.tcgplayer.prices.reverseHolofoil),
  };
}

async function loadPool(setId) {
  const cached = cache.get(setId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const meta = SET_BY_ID[setId];
  let pool = null; let source = null; let error = null;
  // Primary: pokemontcg.io — page through the whole set (pageSize 250).
  try {
    const cards = [];
    let page = 1;
    for (;;) {
      const data = await fetchJsonRetry(`${PTCG}/cards?q=set.id:${setId}&page=${page}&pageSize=250&orderBy=number`);
      cards.push(...(data.data || []));
      if (!data.data || data.data.length < 250 || page * 250 >= (data.totalCount || 0)) break;
      page += 1;
      if (page > 4) break;
    }
    if (!cards.length) throw new Error('empty pool');
    pool = cards.map(normalizeCard);
    source = 'pokemontcg.io';
  } catch (e) { error = String(e && e.message || e); }
  // Fallback: TCGdex (same set IDs for vintage sets, zero-padded for modern;
  // no prices, but real cards + art). The set endpoint's card list has no
  // rarity, so rarities come from the card-detail endpoint, fetched in
  // batches of 20 (cached for an hour, so this runs once per set).
  if (!pool) {
    try {
      const data = await fetchJson(`${TCGDEX}/sets/${TCGDEX_ID[setId] || setId}`);
      const list = data.cards || [];
      if (!list.length) throw new Error('empty pool');
      const details = new Map();
      for (let i = 0; i < list.length; i += 20) {
        const batch = await Promise.all(list.slice(i, i + 20).map((c) =>
          fetchJson(`${TCGDEX}/cards/${c.id}`).catch(() => null)));
        for (const d of batch) if (d && d.id) details.set(d.id, d);
      }
      const cards = list.map((c) => {
        const d = details.get(c.id) || {};
        return {
          id: c.id, name: c.name, rarity: d.rarity || 'Common', price: null,
          number: c.localId, supertype: 'Pokémon', subtypes: d.subtypes || [], types: d.types || [],
          // TCGdex image field is a bare path — the real file is <path>/high.png
          image: c.image + '/high.png', imageHires: c.image + '/high.png',
          isReverse: !!(d.variants && d.variants.reverse),
        };
      });
      pool = cards; source = 'tcgdex (fallback)';
    } catch (e2) { error = `${error}; tcgdex: ${e2.message}`; }
  }
  if (!pool) throw new Error(`Could not load set ${setId}: ${error}`);
  const value = { meta, cards: pool, source, fetchedAt: new Date().toISOString() };
  cache.set(setId, { at: Date.now(), value });
  fetchStatus[setId] = { source, cards: pool.length, at: value.fetchedAt };
  return value;
}

async function loadSetMeta(setId) {
  try {
    const data = await fetchJson(`${PTCG}/sets/${setId}`);
    return data.data || null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Rip logic — one place, used by /api/rip and by verify.js.
// ---------------------------------------------------------------------------
function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Unique pick from a bucket (bounded retries; null if bucket is exhausted).
function uniquePick(arr, seen, rng = Math.random) {
  for (let i = 0; i < 200 && arr.length; i++) { const c = pick(arr, rng); if (!seen.has(c.id)) return c; }
  return null;
}
const isGoldStar = (c) => /★/.test(c.name) || /gold star/i.test(c.rarity || '');
const isSecret = (c) => /Secret|Rainbow|Hyper|Illustration|Shiny/i.test(c.rarity || '') || (c.subtypes || []).some((s) => /Secret|Illustration/i.test(s));
const isUltra = (c) => /Ultra|Rainbow|Secret|Hyper|Illustration|Shiny|ex$|VMAX|VSTAR/i.test(c.rarity || '');

function tierOf(card) {
  const price = card.price || 0;
  if (price >= 500 || isGoldStar(card)) return 'god';
  if (price >= 100 || isSecret(card) || /Special Illustration|Hyper Rare/.test(card.rarity || '')) return 'super';
  if (isUltra(card) || price >= 25) return 'ultra';
  if (/Holo/.test(card.rarity || '')) return 'holo';
  return 'normal';
}

function ripPack(setId, pool, rng = Math.random) {
  const meta = SET_BY_ID[setId];
  const byRarity = (re) => pool.filter((c) => re.test(c.rarity || ''));
  const commons = byRarity(/^Common$/i);
  const uncommons = byRarity(/^Uncommon$/i);
  const rares = byRarity(/^Rare(?! Secret| Rainbow| Ultra| Shiny)/i).filter((c) => !isSecret(c));
  const holoRares = byRarity(/Rare Holo/i);
  const secrets = pool.filter(isSecret);
  const goldStars = pool.filter(isGoldStar);
  const nonHit = [...commons, ...uncommons];
  const reverses = pool.filter((c) => c.isReverse);

  const seen = new Set();
  const drawUnique = (arr, n) => {
    const out = [];
    for (const c of shuffle(arr, rng)) { if (out.length >= n) break; if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }
    return out;
  };
  // Hit slot is drawn last and kept even if it forces a re-pick.
  let hit = null; let rest = [];
  if (meta.era === 'vault') {
    rest = drawUnique(pool, meta.packSize);
  } else if (meta.era === 'vintage') {
    rest = [...drawUnique(commons, 7), ...drawUnique(uncommons, 3)];
    hit = (rng() < 0.33 && holoRares.length ? uniquePick(holoRares, seen, rng) : null)
      || uniquePick(rares, seen, rng) || uniquePick(pool, seen, rng);
  } else if (meta.era === 'ex') {
    // Hit slot: Gold Star ≈1.5% of packs, other secrets ≈5%, else rare/holo.
    const roll = rng();
    if (goldStars.length && roll < 0.015) hit = uniquePick(goldStars, seen, rng);
    else if (secrets.length && roll < 0.065) hit = uniquePick(secrets, seen, rng);
    hit = hit || uniquePick(holoRares, seen, rng) || uniquePick(rares, seen, rng) || uniquePick(pool, seen, rng);
    if (hit) seen.add(hit.id);
    rest = [...drawUnique(commons, 5), ...drawUnique(uncommons, 2),
      reverses.length ? (uniquePick(reverses, seen, rng) || drawUnique(nonHit, 1)[0]) : drawUnique(nonHit, 1)[0]].filter(Boolean);
  } else {
    // modern / swsh: 4C / 3U / 2 reverse / 1 hit
    const roll = rng();
    if (secrets.length && roll < 0.10) hit = uniquePick(secrets, seen, rng);
    hit = hit || uniquePick([...holoRares, ...rares], seen, rng) || uniquePick(pool, seen, rng);
    if (hit) seen.add(hit.id);
    rest = [...drawUnique(commons, 4), ...drawUnique(uncommons, 3),
      ...(reverses.length ? drawUnique(reverses, 2) : drawUnique(nonHit, 2))];
  }
  let cards = hit ? [...rest, hit] : rest;
  // Top up to the exact pack size (bounded retries; duplicates only as a last resort).
  let guard = 0;
  while (cards.length < meta.packSize && guard++ < 500) {
    const c = uniquePick(pool, new Set(cards.map((x) => x.id)), rng);
    if (!c) break;
    cards.push(c);
  }
  while (cards.length < meta.packSize) cards.push(pick(pool, rng));
  cards = cards.slice(0, meta.packSize);
  const withTiers = cards.map((c) => ({ ...c, tier: tierOf(c) }));
  const total = withTiers.reduce((s, c) => s + (c.price || 0), 0);
  const best = withTiers.reduce((b, c) => ((c.price || 0) > (b.price || 0) ? c : b), withTiers[0]);
  const hasSuper = withTiers.some((c) => c.tier === 'super' || c.tier === 'god');
  const hasGod = withTiers.some((c) => c.tier === 'god');
  return { set: meta, cards: withTiers, totalValue: Math.round(total * 100) / 100, best, hasSuper, hasGod, odds: ODDS[meta.era] };
}

function topChase(pool) {
  return [...pool].sort((a, b) => (b.price || 0) - (a.price || 0))[0] || pool[0];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/sets', async (req, res) => {
  // Live totals/logos when the API answers, baked-in metadata otherwise.
  const sets = await Promise.all(SETS.map(async (s) => {
    const live = await loadSetMeta(s.id).catch(() => null);
    return { ...s, total: (live && live.total) || s.total, logo: live && live.images ? live.images.logo : null, symbol: live && live.images ? live.images.symbol : null, live: !!live };
  }));
  res.json({ sets, categories: { rare: 9, modern: 7, swsh: 4, vintage: 3 }, total: SETS.length });
});

app.get('/api/set/:id', async (req, res) => {
  const setId = req.params.id;
  if (!SET_BY_ID[setId]) return res.status(404).json({ error: 'unknown set' });
  try {
    const { cards, source, fetchedAt } = await loadPool(setId);
    const chase = topChase(cards);
    res.json({ set: SET_BY_ID[setId], source, fetchedAt, cards: cards.length, chase, cardsUrl: null });
  } catch (e) { res.status(502).json({ error: String(e.message) }); }
});

app.get('/api/pool/:id', async (req, res) => {
  const setId = req.params.id;
  if (!SET_BY_ID[setId]) return res.status(404).json({ error: 'unknown set' });
  try {
    const { cards, source } = await loadPool(setId);
    res.json({ set: SET_BY_ID[setId], source, cards });
  } catch (e) { res.status(502).json({ error: String(e.message) }); }
});

app.get('/api/rip/:id', async (req, res) => {
  const setId = req.params.id;
  if (!SET_BY_ID[setId]) return res.status(404).json({ error: 'unknown set' });
  try {
    const { cards } = await loadPool(setId);
    res.json(ripPack(setId, cards));
  } catch (e) { res.status(502).json({ error: String(e.message) }); }
});

// POST /api/rip/:id { count: 1..5 } — rip several packs of the same set in
// one call (the 5-pack mode). Every pack is drawn independently with the
// same real odds; the client slices all five at once, then reveals them
// pack by pack (or jumps straight to the combined summary when the
// up-front "open all at once" switch is on).
app.post('/api/rip/:id', async (req, res) => {
  const setId = req.params.id;
  if (!SET_BY_ID[setId]) return res.status(404).json({ error: 'unknown set' });
  const count = Math.min(5, Math.max(1, Number((req.body && req.body.count) || 1) || 1));
  try {
    const { cards } = await loadPool(setId);
    const packs = Array.from({ length: count }, () => ripPack(setId, cards));
    const allCards = packs.flatMap((p) => p.cards);
    const totalValue = Math.round(packs.reduce((s, p) => s + p.totalValue, 0) * 100) / 100;
    const best = allCards.reduce((b, c) => ((c.price || 0) > (b.price || 0) ? c : b), allCards[0]);
    res.json({
      set: SET_BY_ID[setId], count, packs,
      totalValue, best,
      hasSuper: packs.some((p) => p.hasSuper),
      hasGod: packs.some((p) => p.hasGod),
    });
  } catch (e) { res.status(502).json({ error: String(e.message) }); }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sets: SETS.length, categories: { rare: 9, modern: 7, swsh: 4, vintage: 3 }, fetchStatus, uptimeSec: Math.round(process.uptime()) });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`pokemon-pack-ripping listening on :${PORT} — ${SETS.length} sets`));
module.exports = { SETS, ripPack, tierOf, loadPool };
