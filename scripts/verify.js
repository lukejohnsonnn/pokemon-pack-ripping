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
  const health = await get('/api/health');
  console.log('\nhealth: sets=%d sources:', health.sets, Object.fromEntries(Object.entries(health.fetchStatus).map(([k, v]) => [k, v.source])));
  console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('verify crashed:', e.message); process.exit(2); });
