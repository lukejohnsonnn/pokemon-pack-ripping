// Pokémon Pack Ripping — client.
// Real data only: sets/pools/prices come from /api/* (Pokémon TCG API,
// TCGdex fallback). Binder lives in localStorage (v1).
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
let rip = null;    // current rip payload
let ripIndex = 0;  // index of active card
let revealedValue = 0;

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
async function loadSets() {
  const res = await fetch('/api/sets');
  const data = await res.json();
  sets = data.sets;
  renderFilters();
  renderShelf();
  $('#shelfLoading').hidden = true;
  // Chase art per set (highest-priced card in the live pool).
  sets.forEach(async (s) => {
    try {
      const r = await fetch('/api/set/' + s.id);
      const d = await r.json();
      if (d.chase) { chaseArt[s.id] = d.chase; const el = document.querySelector(`[data-pack-art="${s.id}"]`); if (el) el.style.backgroundImage = `url("${d.chase.imageHires || d.chase.image}")`; }
    } catch { /* shelf keeps its shimmer placeholder */ }
  });
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
  return `<button class="pack" data-set="${s.id}" type="button" aria-label="Rip ${escapeHtml(s.name)}">
    <span class="pack-inner">
      <span class="pack-art" data-pack-art="${s.id}"></span>
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
  grid.querySelectorAll('.pack').forEach((el) => el.addEventListener('click', () => openPack(el.dataset.set)));
  // Re-apply any chase art already loaded.
  for (const [id, c] of Object.entries(chaseArt)) {
    const el = grid.querySelector(`[data-pack-art="${id}"]`);
    if (el) el.style.backgroundImage = `url("${c.imageHires || c.image}")`;
  }
}

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
  setTimeout(() => { cel.hidden = true; document.body.classList.remove('flash', 'shake'); }, 2600);
}

// ---------------- Rip flow ----------------
function showView(id) {
  for (const v of ['shelfView', 'ripView', 'binderView']) document.getElementById(v).hidden = v !== id;
  window.scrollTo({ top: 0 });
}

async function openPack(setId) {
  const set = sets.find((s) => s.id === setId);
  if (!set) return;
  showView('ripView');
  $('#summary').hidden = true;
  $('#ripControls').hidden = true;
  $('#valuePill').hidden = true;
  revealedValue = 0;
  const stage = $('#ripStage');
  stage.innerHTML = `<div class="sealed-wrap" id="sealedWrap"><div class="pack-inner" id="sealedPack"></div><div class="rip-hint">Tap the pack to tear it open</div></div>`;
  // Reuse the shelf pack face for the big sealed pack.
  const tmp = document.createElement('div');
  tmp.innerHTML = packCardHTML(set);
  const inner = tmp.querySelector('.pack-inner');
  $('#sealedPack').replaceWith(inner);
  inner.id = 'sealedPack';
  const art = chaseArt[setId];
  if (art) { const a = inner.querySelector('.pack-art'); if (a) a.style.backgroundImage = `url("${art.imageHires || art.image}")`; }

  let r;
  try {
    const res = await fetch('/api/rip/' + setId);
    r = await res.json();
    if (r.error) throw new Error(r.error);
  } catch (e) {
    stage.innerHTML = `<p class="empty">Couldn't load that pack right now (${escapeHtml(e.message)}). Check your connection and try again.</p>`;
    return;
  }
  rip = r; ripIndex = 0;
  const wrap = $('#sealedWrap');
  wrap.addEventListener('click', () => tearOpen(wrap), { once: true });
}

function tearOpen(wrap) {
  wrap.classList.add('tearing');
  const top = document.createElement('div');
  top.className = 'tear-top';
  wrap.prepend(top);
  const foil = document.createElement('div');
  foil.className = 'foil-inside';
  wrap.prepend(foil);
  const flash = document.createElement('div');
  flash.className = 'rip-flash';
  wrap.appendChild(flash);
  if (rip.hasSuper) {
    const aura = document.createElement('div');
    aura.className = 'gold-aura';
    wrap.appendChild(aura);
    const rays = document.createElement('div');
    rays.className = 'gold-rays';
    wrap.appendChild(rays);
    const teaser = document.createElement('div');
    teaser.className = 'teaser';
    teaser.textContent = rip.hasGod ? '✨ Something GOD-TIER is in this pack…' : '✨ Something special is in this pack…';
    wrap.appendChild(teaser);
    if (navigator.vibrate) navigator.vibrate(40);
  }
  if (navigator.vibrate) navigator.vibrate(25);
  setTimeout(() => showFan(), rip.hasSuper ? 1100 : 750);
}

function showFan() {
  const stage = $('#ripStage');
  $('#ripControls').hidden = false;
  $('#valuePill').hidden = false;
  $('#valueSoFar').textContent = '$0.00';
  $('#cardsLeft').textContent = `${rip.cards.length} cards left`;
  const fan = document.createElement('div');
  fan.className = 'fan';
  fan.id = 'fan';
  stage.innerHTML = '';
  stage.appendChild(fan);
  rip.cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'flip-card';
    el.dataset.index = i;
    el.style.zIndex = rip.cards.length - i;
    el.style.transform = `translateY(${Math.min(i, 4) * 6}px) rotate(${(i % 2 ? 1 : -1) * Math.min(i, 3) * 1.2}deg) scale(${1 - Math.min(i, 4) * 0.02})`;
    el.innerHTML = `<div class="flip-inner">
      <div class="flip-face flip-back">${CARD_BACK_SVG}<div class="shine"></div></div>
      <div class="flip-face flip-front"><img src="${card.imageHires || card.image}" alt="${escapeHtml(card.name)}" draggable="false"><div class="shine"></div>
      <div class="card-price"><span>${escapeHtml(card.name)}</span><span>${money(card.price)}</span></div></div>
    </div>`;
    fan.appendChild(el);
  });
  attachReveal(fan);
  markLastCardSpecial();
}

function markLastCardSpecial() {
  // The hit slot is the last card. If the pack hides a super/god card,
  // give that face-down card a breathing gold halo + slow-mo flip.
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
  revealedValue += card.price || 0;
  animateValue(revealedValue);
  if (navigator.vibrate) navigator.vibrate(15);
  // Celebration fires when the special card itself is revealed.
  if (card.tier === 'god' || card.tier === 'super') {
    setTimeout(() => celebrate(card.tier, `${card.name} — ${fmt(card.price)}`), special ? 700 : 250);
  }
}

function advanceCard() {
  const el = activeCardEl();
  if (!el) return;
  el.style.transition = 'transform .45s ease-in, opacity .45s';
  el.style.transform = 'translateX(120vw) rotate(18deg)';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 480);
  ripIndex += 1;
  const left = rip.cards.length - ripIndex;
  $('#cardsLeft').textContent = left > 0 ? `${left} card${left === 1 ? '' : 's'} left` : '';
  const next = activeCardEl();
  if (next) {
    next.style.transform = 'translateY(0) rotate(0deg) scale(1)';
    if (next.dataset.special) next.classList.add('gold-halo');
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
// touch-action:none + non-passive touchmove preventDefault stop the page
// from ever being grabbed instead of the card.
function attachReveal(fan) {
  let drag = null;
  let rafId = null;
  let curX = 0, curY = 0, tgtX = 0, tgtY = 0;

  function loop() {
    curX += (tgtX - curX) * 0.35;
    curY += (tgtY - curY) * 0.35;
    const el = activeCardEl();
    if (el && drag) {
      el.style.transform = `translate(${curX}px, ${curY}px) rotate(${curX * 0.08}deg)`;
      const glow = Math.min(1, Math.hypot(curX, curY) / 70);
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
    tgtX = e.clientX - drag.x0;
    tgtY = e.clientY - drag.y0;
    drag.moved = Math.max(drag.moved, Math.hypot(tgtX, tgtY));
  });
  function endDrag(e) {
    if (!drag) return;
    cancelAnimationFrame(rafId);
    const el = activeCardEl();
    const dt = Date.now() - drag.t0;
    const isTap = drag.moved < 12 && dt < 350;
    const fling = Math.hypot(tgtX, tgtY) > 70 || (drag.moved > 40 && dt < 250);
    const wasDrag = drag;
    drag = null;
    if (!el) return;
    el.style.boxShadow = '';
    if (isTap) {
      el.style.transform = '';
      if (el.classList.contains('flipped')) advanceCard();
      else revealActive();
    } else if (fling) {
      el.style.transition = 'transform .3s ease-out, opacity .3s';
      el.style.transform = `translate(${tgtX * 4}px, ${tgtY * 2}px) rotate(${tgtX * 0.15}deg)`;
      el.style.opacity = '0';
      const flipped = el.classList.contains('flipped');
      setTimeout(() => { el.remove(); }, 320);
      if (flipped) { ripIndex += 1; const left = rip.cards.length - ripIndex; $('#cardsLeft').textContent = left > 0 ? `${left} cards left` : ''; if (!activeCardEl()) setTimeout(showSummary, 350); }
      else { revealActive(); setTimeout(() => { if (activeCardEl()) advanceCard(); }, 650); }
    } else {
      // Spring snap-back.
      el.style.transition = 'transform .35s cubic-bezier(.2,1.4,.4,1)';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 380);
    }
    void wasDrag;
  }
  fan.addEventListener('pointerup', endDrag);
  fan.addEventListener('pointercancel', endDrag);
  fan.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  fan.addEventListener('contextmenu', (e) => e.preventDefault());
}

function showSummary() {
  $('#ripControls').hidden = true;
  const s = $('#summary');
  const total = rip.totalValue;
  const best = rip.best;
  // Save to binder.
  const now = Date.now();
  for (const c of rip.cards) binder.push({ id: c.id, name: c.name, rarity: c.rarity, price: c.price, image: c.image, setName: rip.set.name, ts: now });
  packsRipped += 1;
  localStorage.setItem('ppr-packs-ripped', String(packsRipped));
  saveBinder(binder);
  updateBinderCount();
  s.hidden = false;
  s.innerHTML = `<h3>${escapeHtml(rip.set.name)} — pack summary</h3>
    <div class="total" id="summaryTotal">$0.00</div>
    <p>Best pull: <b>${escapeHtml(best.name)}</b> · ${escapeHtml(best.rarity)} · ${fmt(best.price)}</p>
    <div class="summary-grid">${rip.cards.map((c) => `<img src="${c.image}" alt="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}">`).join('')}</div>
    <div class="summary-actions">
      <button class="primary-btn" id="againBtn" type="button">Rip another ${escapeHtml(rip.set.name)}</button>
      <button class="secondary-btn" id="summaryBinderBtn" type="button">View binder</button>
      <button class="secondary-btn" id="summaryBackBtn" type="button">All packs</button>
    </div>`;
  // Count-up total.
  const el = $('#summaryTotal');
  const start = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - start) / 900);
    el.textContent = fmt(total * p);
    if (p < 1) requestAnimationFrame(step);
  })(start);
  if (rip.hasGod) setTimeout(() => celebrate('god', `${best.name} — ${fmt(best.price)}`), 400);
  else if (rip.hasSuper) setTimeout(() => celebrate('super', `${best.name} — ${fmt(best.price)}`), 400);
  $('#againBtn').addEventListener('click', () => openPack(rip.set.id));
  $('#summaryBinderBtn').addEventListener('click', showBinder);
  $('#summaryBackBtn').addEventListener('click', () => showView('shelfView'));
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
    <div class="binder-card"><img src="${c.image}" alt="${escapeHtml(c.name)}" loading="lazy">
    <div class="bc-meta"><b>${escapeHtml(c.name)}</b>${counts[c.id] > 1 ? ` ×${counts[c.id]}` : ''}<br>${escapeHtml(c.rarity)} · ${fmt(c.price)}<br>${escapeHtml(c.setName)}</div></div>`).join('')
    : '<p class="empty">No cards yet — go rip a pack.</p>';
}

// ---------------- Odds modal ----------------
function showOdds() {
  $('#oddsBody').innerHTML = ODDS_TEXT.map(([t, d]) => `<div class="odds-row"><b>${t}</b><span>${d}</span></div>`).join('');
  $('#oddsModal').hidden = false;
}

// ---------------- Wire up ----------------
$('#backBtn').addEventListener('click', () => showView('shelfView'));
$('#binderBtn').addEventListener('click', showBinder);
$('#binderBackBtn').addEventListener('click', () => showView('shelfView'));
$('#clearBinderBtn').addEventListener('click', () => { if (confirm('Clear your whole binder?')) { binder = []; saveBinder(binder); packsRipped = 0; localStorage.setItem('ppr-packs-ripped', '0'); updateBinderCount(); showBinder(); } });
$('#openAllBtn').addEventListener('click', () => {
  // Flip everything at once, then jump to the summary.
  document.querySelectorAll('.flip-card').forEach((el) => el.classList.add('flipped'));
  rip.cards.forEach((c) => { revealedValue += c.price || 0; });
  animateValue(revealedValue);
  if (rip.hasSuper) confetti(rip.hasGod ? 120 : 70, true);
  setTimeout(showSummary, 900);
});
$('#oddsBtn').addEventListener('click', showOdds);
$('#oddsClose').addEventListener('click', () => { $('#oddsModal').hidden = true; });
$('#oddsModal').addEventListener('click', (e) => { if (e.target.id === 'oddsModal') $('#oddsModal').hidden = true; });

updateBinderCount();
loadSets().catch(() => { $('#shelfLoading').textContent = 'Could not load packs — check your connection and refresh.'; });
