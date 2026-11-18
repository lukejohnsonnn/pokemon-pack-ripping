// Verification: rip every set via the running server and check structure.
// Usage: npm start (terminal 1) then node scripts/verify.js (terminal 2).
// Exits non-zero if any set fails.
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const EXPECTED = {
  base1: 11, sv8: 10, sv3pt5: 10, sv4pt5: 10, swsh12pt5: 10, swsh9: 10, sv9: 10, me1: 10,
  ex15: 9, ecard3: 9, ex8: 9, swsh7: 10, neo4: 11, neo1: 11, sma: 10, base5: 11,
  sv8pt5: 10, ecard2: 9, ex10: 9, neo3: 11, swsh11: 10, sv10: 10, sv6: 10,
};
const CATS = { rare: 9, modern: 7, swsh: 4, vintage: 3 };

async function get(p) {
  const r = await fetch(BASE + p);
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
async function post(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

(async () => {
  let fail = 0;
  const sets = await get('/api/sets');
  console.log(`sets: ${sets.sets.length} (expect 23)  categories:`, sets.categories);
  if (sets.sets.length !== 23) { console.log('FAIL: set count'); fail++; }
  for (const [k, v] of Object.entries(CATS)) {
    const n = sets.sets.filter((s) => s.category === k).length;
    console.log(`  category ${k}: ${n} (expect ${v})${n === v ? '' : '  <-- FAIL'}`);
    if (n !== v) fail++;
  }
  for (const [id, size] of Object.entries(EXPECTED)) {
    try {
      const rip = await get(`/api/rip/${id}`);
      const okSize = rip.cards.length === size;
      const okNames = rip.cards.every((c) => c.name && c.image);
      const commons = rip.cards.filter((c) => c.rarity === 'Common').length;
      console.log(`${okSize && okNames ? 'OK  ' : 'FAIL'} ${id.padEnd(10)} ${rip.set.name.padEnd(26)} cards=${rip.cards.length} (expect ${size}) commons=${commons} best=${rip.best.name} ${rip.best.price != null ? '$' + rip.best.price : 'no-price'} value=$${rip.totalValue} super=${rip.hasSuper} god=${rip.hasGod}`);
      if (!okSize || !okNames) fail++;
    } catch (e) {
      console.log(`FAIL ${id}: ${e.message}`);
      fail++;
    }
  }
  // 5-pack batch: one POST must return 5 real packs of the right size.
  try {
    const batch = await post('/api/rip/sv8', { count: 5 });
    const sizes = batch.packs.map((p) => p.cards.length);
    const okBatch = batch.packs.length === 5 && sizes.every((n) => n === 10) && batch.totalValue >= 0;
    console.log(`${okBatch ? 'OK  ' : 'FAIL'} 5-pack batch sv8: packs=${batch.packs.length} sizes=[${sizes.join(',')}] total=$${batch.totalValue} super=${batch.hasSuper} god=${batch.hasGod}`);
    if (!okBatch) fail++;
    const batch1 = await post('/api/rip/base1', { count: 5 });
    const okVintage = batch1.packs.length === 5 && batch1.packs.every((p) => p.cards.length === 11);
    console.log(`${okVintage ? 'OK  ' : 'FAIL'} 5-pack batch base1: packs=${batch1.packs.length} sizes=[${batch1.packs.map((p) => p.cards.length).join(',')}]`);
    if (!okVintage) fail++;
    const bad = await fetch(BASE + '/api/rip/sv8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 6 }) });
    const badData = await bad.json();
    const okCap = badData.packs.length === 5;
    console.log(`${okCap ? 'OK  ' : 'FAIL'} count=6 capped to 5 packs`);
    if (!okCap) fail++;
  } catch (e) { console.log(`FAIL 5-pack batch: ${e.message}`); fail++; }
  const health = await get('/api/health');
  console.log('\nhealth: sets=%d sources:', health.sets, Object.fromEntries(Object.entries(health.fetchStatus).map(([k, v]) => [k, v.source])));
  console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('verify crashed:', e.message); process.exit(2); });
