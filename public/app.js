// Pokémon Pack Ripping — client.
// Real data only: sets/pools/prices come from /api/* (Pokémon TCG API,
// TCGdex fallback). Binder lives in localStorage (v1).
//
// Opening flow (matches the current live app):
//  - Shelf tap selects a set and shows the sealed pack. Tapping the sealed
//    pack itself does NOTHING — a rip only starts from the Rip button.
//    Swiping over the sealed pack scrolls the page vertically as normal.
//  - Rip button fetches 1 or 5 packs, then a slicing stage: the pack top
//    NEVER moves and there is no black hole. A rainbow trail follows the
//    finger; swipe across the pack (across the tight group for 5 packs)
//    and it opens instantly mid-swipe once past the threshold. No copy
//    anywhere names the threshold — the hint just says swipe across.
//  - "Open all at once" is a switch chosen UP FRONT, before opening.
//    On: slice goes straight to a combined per-pack summary. Off: reveal
//    card by card through each pack in turn.
//  - Every card is tappable to view (full-screen viewer).
//  - Card swipe keeps its tilt during the drag but eases back to zero, so
//    every card ends flat and face-up; the next pack never inherits tilt.
const $ = (s) => document.querySelector(s);
const money = (n) => '$' + (n == null ? '—' : Number(n).toFixed(2));
const fmt = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORIES = [
  { id: 'all', label: 'All packs', icon: '🃏' },
  { id: 'rare', label: 'Rare', icon: '💎' },
  { id: 'modern', label: 'Modern', icon: '⚡' },
  { id: 'swsh', label: 'Sword & Shield', icon: '🗡️' },
  { id: 'vintage', label: 'Vintage', icon: '🏛️' },
];
const ODDS_TEXT = [
  ['Modern — 10 cards', '4 Common · 3 Uncommon · 2 Reverse Holo · 1 Hit. Hit slot: Rare / Holo / Ultra / Secret — secret & alt-art cards are rare pulls, not every pack.'],
  ['Sword & Shield era — 10 cards', '4 Common · 3 Uncommon · 2 Reverse Holo · 1 Hit. Hit slot: Rare / Holo / V / VMAX / Secret — alt-art secrets are rare pulls.'],
  ['Vintage (Base / Neo) — 11 cards', '7 Common · 3 Uncommon · 1 Rare. Rare slot: ~33% Holo Rare, ~67% non-holo Rare (Base Set style).'],
  ['EX / e-Card era — 9 cards', '5 Common · 2 Uncommon · 1 Reverse Holo · 1 Hit. Hit slot: Rare / Holo / ex / Secret — Gold Star ≈ 1.5% of packs (~1 in 67), Crystal / Shining ≈ 3–5%.'],
  ['Hidden Fates Shiny Vault — 10 cards', '10 Shiny Vault cards. Every card in the vault is a Shiny / Shiny GX hit.'],
];

let sets = [];
let filter = 'all';
let chaseArt = {}; // setId -> { imageHires, name, price }
let currentSet = null;   // set being ripped
let packs = [];          // rip payloads for this opening (1 or 5)
let packIdx = 0;         // which pack is being revealed
let rip = null;          // current pack's rip payload (packs[packIdx])
let ripIndex = 0;        // index of active card within the current pack
let revealedValue = 0;
let packCount = 1;       // 1-pack / 5-pack selector, chosen up front
let openAllUpFront = false;
let revealedCards = [];  // cards already revealed, for thumbnails

// ---------------- Credits (localStorage, same model as the binder) ----------------
// Every user starts with 1,000 credits; every pack costs 50 (1 pack = 50,
// 5 packs = 250). The balance is initialised ONCE, when the key is absent —
// later loads never reset it. There is no earning/refill/shop path yet;
// insufficient balance simply blocks the Rip button with a message.
const CREDITS_KEY = 'ppr-credits-v1';
const PACK_COST = 50;
const START_CREDITS = 1000;
function loadCredits() {
  try {
    // Number(null) is 0, so an absent key must be checked BEFORE converting
    // — the first version of this read "0 credits" for every new user.
    const raw = localStorage.getItem(CREDITS_KEY);
    if (raw == null) return START_CREDITS;
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0) return Math.floor(v);
  } catch { /* storage unavailable — play with the starting balance in memory */ }
  return START_CREDITS;
}
let credits = loadCredits();
function saveCredits() { try { localStorage.setItem(CREDITS_KEY, String(credits)); } catch { /* ignore */ } }
saveCredits(); // persist the initialised value once; never resets an existing balance
function updateCreditsUI() {
  const el = $('#creditsCount');
  if (el) el.textContent = credits.toLocaleString();
}
const ripCost = (n) => PACK_COST * n;

// ---------------- Binder (localStorage) ----------------
const BINDER_KEY = 'ppr-binder-v1';
function loadBinder() { try { return JSON.parse(localStorage.getItem(BINDER_KEY) || '[]'); } catch { return []; } }
function saveBinder(b) { localStorage.setItem(BINDER_KEY, JSON.stringify(b)); }
let binder = loadBinder();
let packsRipped = Number(localStorage.getItem('ppr-packs-ripped') || '0');
function updateBinderCount() { $('#binderCount').textContent = binder.length; }

// ---------------- Card back (real Pokémon card back) ----------------
const CARD_BACK_SVG = `<svg class="card-back-svg" viewBox="0 0 300 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pokémon card back">
<defs><radialGradient id="sw" cx="50%" cy="42%" r="75%"><stop offset="0%" stop-color="#3a6fd8"/><stop offset="55%" stop-color="#2a4fa8"/><stop offset="100%" stop-color="#16265e"/></radialGradient>
<path id="swirl" d="M150 60 C 230 60 260 150 150 210 C 60 260 90 350 150 360" fill="none" stroke="#7fa8ef" stroke-width="10" opacity=".45" stroke-linecap="round"/></defs>
<rect width="300" height="420" fill="url(#sw)"/><rect x="10" y="10" width="280" height="400" rx="14" fill="none" stroke="#f5c542" stroke-width="3"/>
<use href="#swirl" transform="rotate(60 150 210)"/><use href="#swirl" transform="rotate(120 150 210)"/><use href="#swirl" transform="rotate(180 150 210)"/><use href="#swirl" transform="rotate(240 150 210)"/><use href="#swirl" transform="rotate(300 150 210)"/>
<text x="150" y="46" text-anchor="middle" font-family="Arial Black,Arial" font-size="26" font-style="italic" fill="#ffcb05" stroke="#2a75bb" stroke-width="1.2">Pokémon</text>
<circle cx="150" cy="210" r="72" fill="#f2f2f2" stroke="#111" stroke-width="6"/>
<path d="M78 210 a72 72 0 0 1 144 0 z" fill="#e3350d" stroke="#111" stroke-width="6"/>
<rect x="78" y="204" width="144" height="12" fill="#111"/><circle cx="150" cy="210" r="20" fill="#fff" stroke="#111" stroke-width="6"/><circle cx="150" cy="210" r="8" fill="#ddd" stroke="#111" stroke-width="3"/>
<text x="150" y="392" text-anchor="middle" font-family="Arial Black,Arial" font-size="26" font-style="italic" fill="#ffcb05" stroke="#2a75bb" stroke-width="1.2" transform="rotate(180 150 378)">Pokémon</text>
</svg>`;

// ---------------- Shelf ----------------
// Pack-face art background: the chase photo on top, the foil gradient
// underneath. The gradient stays visible while the photo is still loading,
// so a pack is never a flat dark void on first paint (and if the photo
// 404s, the pack still looks like a foil pack).
const ART_GRADIENT = 'linear-gradient(160deg,#3a2a6e,#1c3a6e 45%,#7a2a3a)';
function artBg(url) { return url ? `url("${url}"), ${ART_GRADIENT}` : ART_GRADIENT; }
// Watch a pack-art span's image: once it has actually decoded, mark the
// pack loaded so the loading shimmer stops. (A CSS background has no load
// event of its own, so preload through an Image object.)
function watchArt(root) {
  (root || document).querySelectorAll('.pack-art').forEach((el) => {
    const bg = el.style.backgroundImage || '';
    const m = bg.match(/url\("?([^")]+)"?\)/);
    if (!m) return;
    const img = new Image();
    img.onload = () => { const p = el.closest('.pack') || el.parentElement; if (p) p.classList.add('art-in'); };
    img.onerror = () => { const p = el.closest('.pack') || el.parentElement; if (p) p.classList.add('art-in'); };
    img.src = m[1];
  });
}

async function loadSets() {
  const res = await fetch('/api/sets');
  const data = await res.json();
  sets = data.sets;
  // Chase art is baked into /api/sets (verified hires URLs) and rendered
  // inline by packCardHTML, so packs show their Pokémon on first paint.
  // Previously this loop fired 23 separate /api/set calls, each loading a
  // whole card pool from flaky pokemontcg.io (~10s+ each on fallback),
  // leaving the shelf as blank dark packs for a long time.
  for (const s of sets) {
    // chasePrice comes from the server warmup cache when ready; it is also
    // filled in from /api/set/:id when a pack is opened (see openPack).
    // Art is served through the same-origin /api/img proxy; the pack face
    // uses HIRES — the face crops to the card's illustration window at ~3x
    // zoom, and the 245px small variant goes blurry at that zoom.
    if (s.chaseImage) chaseArt[s.id] = { name: s.chase, imageHires: s.chaseImage, image: s.chaseImageSmall || s.chaseImage, imageSmall: s.chaseImageSmall || s.chaseImage, price: s.chasePrice ?? null };
  }
  // Kick off all 23 hires chase images now (they hit the server-warmed
  // proxy cache), so the shelf backgrounds paint from the browser cache
  // instead of queuing 23 cold upstream fetches on first paint.
  for (const s of sets) if (s.chaseImage) { const im = new Image(); im.src = s.chaseImage; }
  renderFilters();
  renderShelf();
  $('#shelfLoading').hidden = true;
}

function renderFilters() {
  const counts = { all: sets.length };
  for (const s of sets) counts[s.category] = (counts[s.category] || 0) + 1;
  $('#filterRow').innerHTML = CATEGORIES.map((c) =>
    `<button class="filter-chip ${filter === c.id ? 'active' : ''}" data-filter="${c.id}" type="button" role="tab">${c.icon} ${c.label}<span class="n">${counts[c.id] || 0}</span></button>`).join('');
  document.querySelectorAll('.filter-chip').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; renderFilters(); renderShelf(); }));
}

function packCardHTML(s) {
  const chase = s.chase ? `Chase: <span class="chase">${escapeHtml(s.chase)}</span>` : '';
  // Pack face uses the HIRES chase image (see loadSets): the face is framed
  // on the card's illustration window at ~3x zoom (styles.css), and the
  // 245px small variant turns to mush at that zoom.
  const artUrl = s.chaseImage || s.chaseImageSmall || (chaseArt[s.id] && (chaseArt[s.id].imageHires || chaseArt[s.id].image)) || '';
  return `<button class="pack" data-set="${s.id}" type="button" aria-label="Open ${escapeHtml(s.name)}">
    <span class="pack-inner">
      <span class="pack-art" data-pack-art="${s.id}" style="background-image:${artBg(artUrl)}"></span>
      <span class="pack-burst"></span><span class="pack-bend"></span><span class="pack-foil"></span>
      <span class="crimp top"></span><span class="crimp bottom"></span>
      <span class="pack-brand"><span class="poke">Pokémon</span><br><span class="tcg">TRADING CARD GAME</span></span>
      <span class="age-badge">6+</span>
      ${s.category === 'rare' ? '<span class="rare-badge">💎 RARE</span>' : ''}
      <span class="pack-name">${escapeHtml(s.name)}</span>
      <span class="pack-strip"><span class="count">${s.packSize}</span> ADDITIONAL GAME CARDS</span>
    </span>
    <span class="pack-meta"><b>${escapeHtml(s.name)}</b> · ${s.total || '—'} cards · ${s.releaseDate ? s.releaseDate.slice(0, 4) : ''}<br>${chase}</span>
  </button>`;
}
function escapeHtml(x) { return String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderShelf() {
  const list = filter === 'all' ? sets : sets.filter((s) => s.category === filter);
  const grid = $('#shelfGrid');
  grid.innerHTML = list.map(packCardHTML).join('');
  // Shelf tap selects the set and shows its sealed pack — it does not rip.
  grid.querySelectorAll('.pack').forEach((el) => el.addEventListener('click', () => openPack(el.dataset.set)));
  for (const [id, c] of Object.entries(chaseArt)) {
    const el = grid.querySelector(`[data-pack-art="${id}"]`);
    if (el) el.style.backgroundImage = artBg(c.imageHires || c.image);
  }
  watchArt(grid);
}

// ---------------- Card viewer (every card is tappable) ----------------
function openViewer(card) {
  if (!card) return;
  $('#viewerImg').src = card.imageHires || card.image || '';
  $('#viewerImg').alt = card.name || '';
  $('#viewerName').textContent = card.name || '';
  $('#viewerRarity').textContent = card.rarity || '';
  $('#viewerPrice').textContent = money(card.price);
  $('#cardViewer').hidden = false;
}
function closeViewer() { $('#cardViewer').hidden = true; }

// ---------------- Sounds & confetti ----------------
let audioCtx = null;
function arpeggio(god) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = god ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.09 + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.09); o.stop(audioCtx.currentTime + i * 0.09 + 0.55);
    });
  } catch { /* audio is a bonus, never a blocker */ }
}
function confetti(n = 90, gold = true) {
  const layer = $('#confettiLayer');
  const colors = gold ? ['#f5c542', '#ffdf7e', '#fff3b0', '#e3350d', '#ffffff'] : ['#f5c542', '#2a75bb', '#ffcb05', '#e3350d', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colors[i % colors.length];
    d.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
    d.style.animationDelay = (Math.random() * 0.5) + 's';
    d.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }
}
let celebrateTimer = null;
function hideCelebration() {
  if (celebrateTimer) { clearTimeout(celebrateTimer); celebrateTimer = null; }
  $('#celebration').hidden = true;
  document.body.classList.remove('flash', 'shake');
}
function celebrate(kind, label) {
  const cel = $('#celebration');
  $('#celeBanner').textContent = kind === 'god' ? '✨ GOD PULL ✨' : '🌟 SUPER RARE 🌟';
  $('#celeSub').textContent = label;
  cel.hidden = false;
  document.body.classList.add('flash');
  if (kind === 'god') document.body.classList.add('shake');
  arpeggio(kind === 'god');
  confetti(kind === 'god' ? 120 : 70, true);
  if (navigator.vibrate) navigator.vibrate(kind === 'god' ? [60, 40, 120] : [80]);
  if (celebrateTimer) clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(hideCelebration, 2600);
}

// ---------------- Navigation ----------------
function showView(id) {
  for (const v of ['shelfView', 'ripView', 'binderView']) document.getElementById(v).hidden = v !== id;
  // Sticky top-bar Back only shows while a set is open (rip view).
  $('#topBackBtn').hidden = id !== 'ripView';
  window.scrollTo({ top: 0 });
}
function backToShelf() {
  currentSet = null; packs = []; rip = null;
  showView('shelfView');
}

// ---------------- Rip flow: sealed pack (button-only) ----------------
function openPack(setId) {
  const set = sets.find((s) => s.id === setId);
  if (!set) return;
  currentSet = set;
  packCount = 1;
  openAllUpFront = false;
  packs = []; rip = null; packIdx = 0; ripIndex = 0;
  revealedValue = 0; revealedCards = [];
  showView('ripView');
  $('#summary').hidden = true;
  $('#ripControls').hidden = true;
  $('#valuePill').hidden = true;
  const stage = $('#ripStage');
  const art = chaseArt[setId];
  stage.innerHTML = `
    <div class="sealed-wrap" id="sealedWrap">
      <div class="pack-inner" id="sealedPack"></div>
      <div class="chase-line" id="chaseLine"></div>
      <div class="count-picker" role="group" aria-label="How many packs">
        <button class="count-btn active" data-count="1" type="button">1 pack</button>
        <button class="count-btn" data-count="5" type="button">5 packs</button>
      </div>
      <label class="openall-toggle"><input type="checkbox" id="openAllToggle"> Open all at once</label>
      <button class="primary-btn rip-btn" id="ripBtn" type="button">Rip ${escapeHtml(set.name)}</button>
      <p class="credits-msg" id="creditsMsg" hidden></p>
      <p class="rip-hint">Press Rip, then swipe across the pack to open it.</p>
    </div>`;
  // Reuse the shelf pack face for the big sealed pack. Deliberately NO
  // click / pointer handler on the pack itself: tapping it does nothing.
  const tmp = document.createElement('div');
  tmp.innerHTML = packCardHTML(set);
  const inner = tmp.querySelector('.pack-inner');
  const sealed = $('#sealedPack');
  sealed.replaceWith(inner);
  inner.id = 'sealedPack';
  if (art) { const a = inner.querySelector('.pack-art'); if (a) a.style.backgroundImage = artBg(art.imageHires || art.image); }
  watchArt(stage);
  // Chase card is tappable to view it.
  const chaseLine = $('#chaseLine');
  const renderChaseLine = () => {
    if (!art) return;
    chaseLine.innerHTML = `Chase: <button class="link-btn chase-view" type="button">${escapeHtml(art.name)} · ${money(art.price)} 🔍</button>`;
    chaseLine.querySelector('.chase-view').addEventListener('click', () => openViewer(art));
  };
  renderChaseLine();
  // The chase price is a live TCGplayer price. If the server warmup hadn't
  // filled it in yet when the shelf loaded, fetch it now from /api/set/:id
  // (pool is pre-warmed, so this is fast) instead of showing $— forever.
  if (art && art.price == null) {
    fetch('/api/set/' + setId).then((r) => r.json()).then((d) => {
      if (d.chase && d.chase.price != null && currentSet && currentSet.id === setId) {
        art.price = d.chase.price;
        art.imageHires = d.chase.imageHires || art.imageHires;
        art.image = d.chase.image || art.image;
        renderChaseLine();
      }
    }).catch(() => { /* price stays $—; the pack still rips */ });
  }
  // Rip button shows its cost and blocks when the balance is short.
  // The button is the only place a rip can start, so this is the single
  // gate for spending credits.
  function refreshRipBtn() {
    const btn = $('#ripBtn');
    if (!btn) return;
    const cost = ripCost(packCount);
    btn.textContent = packCount === 5
      ? `Rip 5 ${escapeHtml(set.name)} packs — ${cost} credits`
      : `Rip ${escapeHtml(set.name)} — ${cost} credits`;
    const msg = $('#creditsMsg');
    if (credits < cost) {
      btn.disabled = true;
      if (msg) {
        msg.hidden = false;
        msg.textContent = `Not enough credits — you have ${credits.toLocaleString()} credits. Each pack costs 50 credits.`;
      }
    } else {
      btn.disabled = false;
      if (msg) msg.hidden = true;
    }
  }
  refreshRipBtn();
  stage.querySelectorAll('.count-btn').forEach((b) => b.addEventListener('click', () => {
    packCount = Number(b.dataset.count);
    stage.querySelectorAll('.count-btn').forEach((x) => x.classList.toggle('active', x === b));
    refreshRipBtn();
  }));
  $('#openAllToggle').addEventListener('change', (e) => { openAllUpFront = e.target.checked; });
  $('#ripBtn').addEventListener('click', startRip);
}

async function startRip() {
  if (!currentSet) return;
  // Belt and braces: the button is disabled when the balance is short,
  // but never spend what the user doesn't have.
  if (credits < ripCost(packCount)) return;
  const stage = $('#ripStage');
  const btn = $('#ripBtn');
  btn.disabled = true;
  btn.textContent = 'Loading packs…';
  let data;
  try {
    const res = await fetch('/api/rip/' + currentSet.id, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: packCount }),
    });
    data = await res.json();
    if (data.error) throw new Error(data.error);
  } catch (e) {
    // No deduction on a failed rip — the user keeps their credits and can
    // retry from the sealed pack.
    stage.innerHTML = `<p class="empty">Couldn't load that pack right now (${escapeHtml(e.message)}). Check your connection and try again — no credits were spent.</p>
      <button class="primary-btn" id="retryBtn" type="button">Back to pack</button>`;
    stage.querySelector('#retryBtn').addEventListener('click', () => openPack(currentSet.id));
    return;
  }
  // Deduct ONLY here: the rip loaded successfully, and this is the one
  // place it can happen per rip — re-opening the same rip never re-charges.
  credits -= ripCost(packCount);
  saveCredits();
  updateCreditsUI();
  packs = data.packs;
  packIdx = 0; rip = packs[0]; ripIndex = 0;
  revealedValue = 0; revealedCards = [];
  showSliceStage(data);
}

// ---------------- Slicing stage: rainbow trail, pack never moves ----------------
// The crimp/top stays exactly in place; there is no black hole. A rainbow
// trail follows the finger on a canvas overlay. Swiping across the pack
// (across the tight group for 5 packs) opens it instantly mid-swipe. There
// is deliberately NO swipe progress bar — the trail is the only feedback.
// Short swipes just fade the trail back.
function showSliceStage(data) {
  const stage = $('#ripStage');
  const multi = packs.length > 1;
  const tmp = document.createElement('div');
  tmp.innerHTML = packCardHTML(currentSet);
  const faces = packs.map(() => {
    const inner = tmp.querySelector('.pack-inner').cloneNode(true);
    const art = chaseArt[currentSet.id];
    if (art) { const a = inner.querySelector('.pack-art'); if (a) a.style.backgroundImage = artBg(art.imageHires || art.image); }
    return inner.outerHTML;
  }).join('');
  stage.innerHTML = `
    <div class="slice-wrap ${multi ? 'multi' : ''}" id="sliceWrap">
      <div class="slice-packs" id="slicePacks">${faces}</div>
      <canvas id="trailCanvas" class="trail-canvas"></canvas>
      <p class="slice-hint">Swipe across to open</p>
      <button class="secondary-btn" id="sliceOpenBtn" type="button">Open it</button>
    </div>`;
  // Gold aura / teaser only: light rays, spill and foil flash on open.
  // No dark hole, no moving top.
  if (data.hasSuper) {
    const wrap = $('#sliceWrap');
    const aura = document.createElement('div'); aura.className = 'gold-aura'; wrap.appendChild(aura);
    const rays = document.createElement('div'); rays.className = 'gold-rays'; wrap.appendChild(rays);
    const teaser = document.createElement('div'); teaser.className = 'teaser';
    teaser.textContent = data.hasGod ? '✨ Something GOD-TIER is in these packs…' : '✨ Something special is in these packs…';
    wrap.appendChild(teaser);
  }
  if (navigator.vibrate) navigator.vibrate(25);
  watchArt(stage);
  // Preload the ripped cards' art NOW, while the user is on the slice
  // stage — the fan renders all 11 <img>s at once, and if they only start
  // loading then (each through a cold proxy), flipped cards show a blank
  // face for seconds. Small images first (fast, ~50KB), then the first
  // pack's hires versions so the flip face can sharpen up.
  for (const p of packs) for (const c of p.cards) { const im = new Image(); im.src = c.image; }
  if (packs[0]) for (const c of packs[0].cards) { const im = new Image(); im.src = c.imageHires || c.image; }
  attachSlice($('#sliceWrap'), data);
}

function attachSlice(wrap, data) {
  const canvas = wrap.querySelector('#trailCanvas');
  const ctx = canvas.getContext('2d');
  const packsEl = wrap.querySelector('#slicePacks');
  let slicing = false, startX = 0, opened = false, hue = 0;
  let lastPt = null;
  // Cached measurements — the old code called getBoundingClientRect() on
  // every pointermove, forcing a layout read per frame mid-swipe. The pack
  // group only changes size on resize, so measure once and cache.
  let sliceWidth = 1;
  let canvasRect = null;
  function sizeCanvas() {
    const r = packsEl.getBoundingClientRect();
    sliceWidth = Math.max(1, r.width);
    canvas.width = Math.max(1, Math.round(r.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(r.height * devicePixelRatio));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    canvasRect = canvas.getBoundingClientRect();
    // Stroke setup that never changes per segment — set once, not per
    // pointermove. Only the hue (strokeStyle/shadowColor) varies.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10 * devicePixelRatio;
    ctx.shadowBlur = 18 * devicePixelRatio;
  }
  sizeCanvas();
  // Resize is the only thing that invalidates the cached measurements.
  // The listener is removed when the slice completes, so a replaced stage
  // never leaves a stale listener behind.
  window.addEventListener('resize', sizeCanvas);
  function drawTrail(x, y) {
    // Uses the cached canvas rect — no layout read per pointermove.
    const px = (x - canvasRect.left) * devicePixelRatio, py = (y - canvasRect.top) * devicePixelRatio;
    const col = `hsl(${hue % 360}, 100%, 60%)`;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.beginPath();
    if (lastPt) { ctx.moveTo(lastPt[0], lastPt[1]); } else { ctx.moveTo(px, py); }
    ctx.lineTo(px, py);
    ctx.stroke();
    lastPt = [px, py];
    hue += 14;
  }
  function fadeTrail() {
    // Fade the trail out over ~0.4s instead of snapping it away.
    let op = 1;
    const step = () => { op -= 0.12; canvas.style.opacity = String(Math.max(0, op)); if (op > 0) requestAnimationFrame(step); else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.opacity = '1'; } };
    requestAnimationFrame(step);
  }
  function completeSlice() {
    if (opened) return;
    opened = true;
    window.removeEventListener('resize', sizeCanvas);
    // Quick light show only: flash + rays + spill. ~0.4s (0.65s for god
    // packs), then the cards land. No top movement, no black hole.
    const flash = document.createElement('div');
    flash.className = 'rip-flash';
    wrap.appendChild(flash);
    if (navigator.vibrate) navigator.vibrate(40);
    setTimeout(() => {
      if (openAllUpFront) showSummary();
      else showFan();
    }, data.hasGod ? 650 : 400);
  }

  wrap.addEventListener('pointerdown', (e) => {
    if (opened) return;
    // The "Open it" button lives inside this wrap. The old code captured
    // the pointer on ANY pointerdown — including on the button — which
    // retargeted the gesture to the wrap and swallowed the button's click,
    // so "Open it" did nothing. Buttons never start a slice.
    if (e.target.closest('button')) return;
    slicing = true; startX = e.clientX; lastPt = null;
    canvasRect = canvas.getBoundingClientRect(); // re-measure at gesture start (cheap, once per swipe)
    try { wrap.setPointerCapture(e.pointerId); } catch { /* noop */ }
    drawTrail(e.clientX, e.clientY);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!slicing || opened) return;
    // A move with no buttons pressed means the gesture already ended but
    // the release never arrived (finger lifted at the screen edge, browser
    // took the gesture) — end the slice instead of waiting for a pointerup
    // that may never come.
    if (e.buttons === 0) { endSlice(); return; }
    drawTrail(e.clientX, e.clientY);
    // Cached width — no layout read here any more.
    const progress = Math.abs(e.clientX - startX) / sliceWidth;
    if (progress >= 0.5) completeSlice();
  });
  function endSlice() {
    if (!slicing || opened) return;
    slicing = false;
    // Short swipe: just fade the trail back. There is no progress bar
    // any more — nothing else to reset.
    fadeTrail();
  }
  wrap.addEventListener('pointerup', endSlice);
  wrap.addEventListener('pointercancel', endSlice);
  const openBtn = wrap.querySelector('#sliceOpenBtn');
  // Belt and braces: the button must never start a slice gesture, and its
  // click must reach completeSlice even if a pointerdown raced it.
  openBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  openBtn.addEventListener('click', (e) => { e.stopPropagation(); completeSlice(); });
}

// ---------------- Reveal: fan, tap/swipe, ends flat ----------------
// Single source of truth for the counter. The old code updated it in
// showFan/advanceCard only — the swipe-fling path incremented ripIndex
// directly and never touched it, so it stuck at e.g. "11 cards left".
// A card counts as revealed the moment it is flipped face-up, not when it
// is swiped away — so the counter drops on flip, not just on advance.
let activeFlipped = false; // the active card is face-up but not yet advanced
function updateCardsLeft() {
  if (!rip) return;
  const totalCards = packs.reduce((s, p) => s + p.cards.length, 0);
  const done = packs.slice(0, packIdx).reduce((s, p) => s + p.cards.length, 0) + ripIndex + (activeFlipped ? 1 : 0);
  const left = totalCards - done;
  $('#cardsLeft').textContent = packs.length > 1
    ? `Pack ${packIdx + 1} of ${packs.length} · ${left} card${left === 1 ? '' : 's'} left`
    : `${left} card${left === 1 ? '' : 's'} left`;
}

function showFan() {
  const stage = $('#ripStage');
  $('#ripControls').hidden = false;
  $('#valuePill').hidden = false;
  $('#viewCardBtn').hidden = true;
  $('#valueSoFar').textContent = fmt(revealedValue);
  activeFlipped = false;
  updateCardsLeft();
  renderThumbs();
  const fan = document.createElement('div');
  fan.className = 'fan';
  fan.id = 'fan';
  stage.innerHTML = '';
  stage.appendChild(fan);
  rip.cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'flip-card';
    el.dataset.index = i;
    el.dataset.pack = packIdx;
    el.style.zIndex = rip.cards.length - i;
    // Fan offsets are reset to exactly flat for the active card below.
    el.style.transform = `translate3d(0, ${Math.min(i, 4) * 6}px, 0) rotate(${(i % 2 ? 1 : -1) * Math.min(i, 3) * 1.2}deg) scale(${1 - Math.min(i, 4) * 0.02})`;
    // Flip face shows the SMALL image first — it is already preloaded from
    // the slice stage, so the Pokémon picture is there the instant the card
    // flips. The hires version swaps in behind it as soon as it loads
    // (see the upgrade loop below); the face has a foil gradient behind the
    // <img> so it is never a blank face while loading.
    el.innerHTML = `<div class="flip-inner">
      <div class="flip-face flip-back">${CARD_BACK_SVG}<div class="shine"></div></div>
      <div class="flip-face flip-front"><img src="${card.image}" data-hires="${card.imageHires || card.image}" alt="${escapeHtml(card.name)}" draggable="false"><div class="shine"></div>
      <div class="card-price"><span>${escapeHtml(card.name)}</span><span>${money(card.price)}</span></div></div>
    </div>`;
    fan.appendChild(el);
  });
  // Sharpen every flip face to hires in the background; the small image is
  // already showing, so this is a silent upgrade, never a blank wait.
  fan.querySelectorAll('.flip-front img').forEach((img) => {
    if (img.dataset.hires && img.dataset.hires !== img.getAttribute('src')) {
      const hi = new Image();
      hi.onload = () => { img.src = hi.src; };
      hi.src = img.dataset.hires;
    }
  });
  attachReveal(fan);
  markLastCardSpecial();
}

function renderThumbs() {
  const box = $('#revealedThumbs');
  box.innerHTML = revealedCards.map((c, i) =>
    `<button class="thumb" type="button" data-thumb="${i}" aria-label="View ${escapeHtml(c.name)}"><img src="${c.image}" alt="${escapeHtml(c.name)}"></button>`).join('');
  box.querySelectorAll('.thumb').forEach((b) => b.addEventListener('click', () => openViewer(revealedCards[Number(b.dataset.thumb)])));
}

function markLastCardSpecial() {
  if (!rip.hasSuper) return;
  const last = document.querySelector(`.flip-card[data-index="${rip.cards.length - 1}"]`);
  if (last) last.dataset.special = rip.hasGod ? 'god' : 'super';
}

function activeCardEl() { return document.querySelector(`.flip-card[data-index="${ripIndex}"]`); }

function revealActive() {
  const el = activeCardEl();
  if (!el || el.classList.contains('flipped')) return;
  const card = rip.cards[ripIndex];
  const special = el.dataset.special;
  if (special) el.classList.add('gold-halo', 'slowmo');
  el.classList.add('flipped');
  // Settle flat: clear any drag tilt the moment the card is face-up.
  el.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  // Flipped = revealed: the counter drops now, not when the card is
  // swiped away.
  activeFlipped = true;
  updateCardsLeft();
  revealedValue += card.price || 0;
  animateValue(revealedValue);
  revealedCards.push(card);
  renderThumbs();
  $('#viewCardBtn').hidden = false;
  if (navigator.vibrate) navigator.vibrate(15);
  if (card.tier === 'god' || card.tier === 'super') {
    setTimeout(() => celebrate(card.tier, `${card.name} — ${fmt(card.price)}`), special ? 700 : 250);
  }
}

// THE one advance path. Every way of dealing a card away — tap on a
// face-up card, or a swipe on a face-up card — comes through here, so
// ripIndex, the counter, and the next-card reset can never drift apart
// again. dx/dy let a swipe deal the card away in the swipe direction;
// a tap deals it to the right (dx null = 1.2x viewport width).
function advanceCard(dx, dy) {
  const el = activeCardEl();
  if (!el) return;
  const flyX = dx != null ? dx : window.innerWidth * 1.2;
  const flyY = dy != null ? dy : 0;
  // Smooth accelerating fly-off (gentle start, no snap), matched to the
  // removal timer so the card never pops out mid-flight.
  el.style.transition = 'transform .5s cubic-bezier(.45,.05,.55,.2), opacity .5s ease';
  el.style.transform = `translate3d(${flyX}px, ${flyY}px, 0) rotate(0deg)`;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 520);
  ripIndex += 1;
  activeFlipped = false;
  updateCardsLeft();
  $('#viewCardBtn').hidden = true;
  const next = activeCardEl();
  if (next) {
    // Next card starts exactly flat — never inherits the previous tilt.
    next.style.transition = '';
    next.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
    if (next.dataset.special) next.classList.add('gold-halo');
  } else if (packIdx + 1 < packs.length) {
    // Next pack in the batch.
    packIdx += 1;
    rip = packs[packIdx];
    ripIndex = 0;
    setTimeout(showFan, 350);
  } else {
    setTimeout(showSummary, 500);
  }
}

function animateValue(target) {
  const el = $('#valueSoFar');
  const from = parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0;
  const start = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - start) / 450);
    el.textContent = fmt(from + (target - from) * p);
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

// Tap OR swipe, on the same card, with a lerped rAF drag loop.
// Tilt is kept DURING the drag, but it eases back to zero as the card
// travels, so the card always ends flat and face-up.
function attachReveal(fan) {
  let drag = null;
  let rafId = null;
  let curX = 0, curY = 0, tgtX = 0, tgtY = 0;

  function loop() {
    curX += (tgtX - curX) * 0.42;
    curY += (tgtY - curY) * 0.42;
    const el = activeCardEl();
    if (el && drag) {
      const dist = Math.hypot(curX, curY);
      const tilt = curX * 0.08 * (1 - Math.min(1, dist / 200));
      el.style.transform = `translate3d(${curX}px, ${curY}px, 0) rotate(${tilt}deg)`;
      const glow = Math.min(1, dist / 70);
      el.style.boxShadow = glow > 0.15 ? `0 0 ${20 + glow * 30}px rgba(245,197,66,${glow * 0.8})` : '';
      if (glow > 0.85 && !drag.tick) { drag.tick = true; if (navigator.vibrate) navigator.vibrate(10); }
    }
    if (drag) rafId = requestAnimationFrame(loop);
  }

  fan.addEventListener('pointerdown', (e) => {
    const el = activeCardEl();
    if (!el) return;
    drag = { x0: e.clientX, y0: e.clientY, t0: Date.now(), moved: 0, tick: false };
    curX = curY = tgtX = tgtY = 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  });
  fan.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // A move with no buttons pressed means the gesture already ended but
    // the release never arrived (finger lifted at the screen edge, browser
    // took the gesture). Without this, the drag loop keeps lerping toward
    // a stale point forever and the fan looks frozen — the card drifts off
    // on its own and no later tap or swipe can start a drag.
    if (e.buttons === 0) { endDrag(e); return; }
    tgtX = e.clientX - drag.x0;
    tgtY = e.clientY - drag.y0;
    drag.moved = Math.max(drag.moved, Math.hypot(tgtX, tgtY));
  });
  function endDrag(e) {
    if (!drag) return;
    // Capture the drag and clear it FIRST: releasePointerCapture below
    // fires lostpointercapture synchronously, and that handler also calls
    // endDrag — if drag were still set, the card would advance twice.
    const d = drag;
    drag = null;
    cancelAnimationFrame(rafId);
    const el = activeCardEl();
    // Release pointer capture explicitly before anything below can remove
    // the card: a card taken out of the DOM while it still holds capture
    // can leave the next gesture retargeted at a dead element, so the
    // next card never receives pointerdown and the fan looks frozen.
    if (el && e.pointerId != null) { try { el.releasePointerCapture(e.pointerId); } catch { /* already released on pointerup */ } }
    const dt = Date.now() - d.t0;
    const isTap = d.moved < 12 && dt < 350;
    const fling = Math.hypot(tgtX, tgtY) > 70 || (d.moved > 40 && dt < 250);
    if (!el) return;
    el.style.boxShadow = '';
    if (isTap) {
      el.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      if (el.classList.contains('flipped')) advanceCard();
      else revealActive();
    } else if (fling) {
      if (!el.classList.contains('flipped')) {
        // Swipe on a FACE-DOWN card reveals it in place — it does NOT deal
        // it away. The old code flipped it, scheduled its removal 320ms
        // later, then tried to advance 650ms later; by then the element
        // was gone, so activeCardEl() returned null, ripIndex never
        // advanced, and every later pointerdown bailed out (no active
        // card) — the fan glitched (card flew off, snapped back invisible,
        // vanished) and then froze completely. A second swipe on the now
        // face-up card deals it away through advanceCard() below.
        el.style.transition = 'transform .35s cubic-bezier(.2,1.4,.4,1)';
        el.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
        setTimeout(() => { el.style.transition = ''; }, 380);
        revealActive();
      } else {
        // Swipe on a FACE-UP card deals it away in the swipe direction,
        // through the single shared advance path — no duplicated ripIndex
        // / counter / next-card logic here any more.
        advanceCard(tgtX * 4, tgtY * 2);
      }
    } else {
      // Spring snap-back, landing flat.
      el.style.transition = 'transform .35s cubic-bezier(.2,1.4,.4,1)';
      el.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      setTimeout(() => { el.style.transition = ''; }, 380);
    }
  }
  fan.addEventListener('pointerup', endDrag);
  fan.addEventListener('pointercancel', endDrag);
  // If capture is lost without a pointerup (release never arrived), the
  // drag would otherwise stay live forever — end it here. endDrag clears
  // drag before releasing capture, so this can never double-fire.
  fan.addEventListener('lostpointercapture', endDrag);
  fan.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  fan.addEventListener('contextmenu', (e) => e.preventDefault());
}

function showSummary() {
  $('#ripControls').hidden = true;
  const s = $('#summary');
  const allCards = packs.flatMap((p) => p.cards);
  const total = packs.reduce((sum, p) => sum + p.totalValue, 0);
  const best = allCards.reduce((b, c) => ((c.price || 0) > (b.price || 0) ? c : b), allCards[0]);
  const hasGod = packs.some((p) => p.hasGod);
  const hasSuper = packs.some((p) => p.hasSuper);
  // Save every card from every pack to the binder.
  const now = Date.now();
  for (const p of packs) for (const c of p.cards) binder.push({ id: c.id, name: c.name, rarity: c.rarity, price: c.price, image: c.image, imageHires: c.imageHires, setName: p.set.name, ts: now });
  packsRipped += packs.length;
  localStorage.setItem('ppr-packs-ripped', String(packsRipped));
  saveBinder(binder);
  updateBinderCount();
  s.hidden = false;
  s.innerHTML = `<h3>${escapeHtml(currentSet.name)} — ${packs.length > 1 ? packs.length + ' packs' : 'pack'} summary</h3>
    <div class="total" id="summaryTotal">$0.00</div>
    <p>Best pull: <b>${escapeHtml(best.name)}</b> · ${escapeHtml(best.rarity)} · ${fmt(best.price)}</p>
    ${packs.map((p, i) => `<div class="summary-pack"><b>Pack ${i + 1} — ${fmt(p.totalValue)}</b>
      <div class="summary-grid">${p.cards.map((c) => `<button class="summary-thumb" type="button" data-card="${escapeHtml(c.id)}" aria-label="View ${escapeHtml(c.name)}"><img src="${c.image}" alt="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}"></button>`).join('')}</div></div>`).join('')}
    <div class="summary-actions">
      <button class="primary-btn" id="againBtn" type="button">Rip another ${escapeHtml(currentSet.name)}</button>
      <button class="secondary-btn" id="summaryBinderBtn" type="button">View binder</button>
      <button class="secondary-btn" id="summaryBackBtn" type="button">← Back to all packs</button>
    </div>`;
  s.querySelectorAll('.summary-thumb').forEach((b) => b.addEventListener('click', () => {
    const card = allCards.find((c) => c.id === b.dataset.card);
    openViewer(card);
  }));
  const el = $('#summaryTotal');
  const start = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - start) / 900);
    el.textContent = fmt(total * p);
    if (p < 1) requestAnimationFrame(step);
  })(start);
  if (hasGod) setTimeout(() => celebrate('god', `${best.name} — ${fmt(best.price)}`), 400);
  else if (hasSuper) setTimeout(() => celebrate('super', `${best.name} — ${fmt(best.price)}`), 400);
  $('#againBtn').addEventListener('click', () => openPack(currentSet.id));
  $('#summaryBinderBtn').addEventListener('click', showBinder);
  $('#summaryBackBtn').addEventListener('click', backToShelf);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------- Binder view ----------------
function showBinder() {
  showView('binderView');
  const totalValue = binder.reduce((s, c) => s + (c.price || 0), 0);
  const unique = new Set(binder.map((c) => c.id)).size;
  const best = binder.reduce((b, c) => ((c.price || 0) > (b.price || 0) ? c : b), binder[0]);
  $('#binderStats').innerHTML = `
    <div class="stat"><b>${binder.length}</b><span>cards pulled</span></div>
    <div class="stat"><b>${unique}</b><span>unique cards</span></div>
    <div class="stat"><b>${packsRipped}</b><span>packs ripped</span></div>
    <div class="stat"><b>${fmt(totalValue)}</b><span>total value</span></div>
    ${best ? `<div class="stat"><b>${fmt(best.price)}</b><span>best pull: ${escapeHtml(best.name)}</span></div>` : ''}`;
  const counts = {};
  binder.forEach((c) => { counts[c.id] = (counts[c.id] || 0) + 1; });
  const seen = new Set();
  const uniqueCards = binder.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
    .sort((a, b) => (b.price || 0) - (a.price || 0));
  $('#binderGrid').innerHTML = uniqueCards.length ? uniqueCards.map((c) => `
    <button class="binder-card" type="button" data-card="${escapeHtml(c.id)}" aria-label="View ${escapeHtml(c.name)}"><img src="${c.image}" alt="${escapeHtml(c.name)}" loading="lazy">
    <span class="bc-meta"><b>${escapeHtml(c.name)}</b>${counts[c.id] > 1 ? ` ×${counts[c.id]}` : ''}<br>${escapeHtml(c.rarity)} · ${fmt(c.price)}<br>${escapeHtml(c.setName)}</span></button>`).join('')
    : '<p class="empty">No cards yet — go rip a pack.</p>';
  $('#binderGrid').querySelectorAll('.binder-card').forEach((b) => b.addEventListener('click', () => {
    const card = uniqueCards.find((c) => c.id === b.dataset.card);
    openViewer(card);
  }));
}

// ---------------- Odds modal ----------------
function showOdds() {
  $('#oddsBody').innerHTML = ODDS_TEXT.map(([t, d]) => `<div class="odds-row"><b>${t}</b><span>${d}</span></div>`).join('');
  $('#oddsModal').hidden = false;
}

// ---------------- Wire up ----------------
$('#backBtn').addEventListener('click', backToShelf);
$('#topBackBtn').addEventListener('click', backToShelf);
$('#binderBtn').addEventListener('click', showBinder);
$('#binderBackBtn').addEventListener('click', backToShelf);
$('#clearBinderBtn').addEventListener('click', () => { if (confirm('Clear your whole binder?')) { binder = []; saveBinder(binder); packsRipped = 0; localStorage.setItem('ppr-packs-ripped', '0'); updateBinderCount(); showBinder(); } });
$('#viewCardBtn').addEventListener('click', () => {
  const el = activeCardEl();
  if (el && el.classList.contains('flipped')) openViewer(rip.cards[ripIndex]);
});
$('#oddsBtn').addEventListener('click', showOdds);
$('#oddsClose').addEventListener('click', () => { $('#oddsModal').hidden = true; });
$('#oddsModal').addEventListener('click', (e) => { if (e.target.id === 'oddsModal') $('#oddsModal').hidden = true; });
$('#viewerClose').addEventListener('click', closeViewer);
$('#cardViewer').addEventListener('click', (e) => { if (e.target.id === 'cardViewer') closeViewer(); });
// Celebration is tap-to-dismiss (it used to be pointer-events:none, so it
// could never be closed by tapping it) and Escape closes any overlay.
$('#celebration').addEventListener('click', hideCelebration);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  hideCelebration();
  $('#oddsModal').hidden = true;
  closeViewer();
});

updateBinderCount();
updateCreditsUI();
loadSets().catch(() => { $('#shelfLoading').textContent = 'Could not load packs — check your connection and refresh.'; });
