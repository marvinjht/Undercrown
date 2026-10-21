// Meta report: which specs, heart gems, classes and weapon + class builds are strongest.
// Part 1 plays many full bot matches and compares each pick's tournament wins with its fair share.
// Part 2 holds gear fixed and swaps only the spec (or gem) to measure it on its own in player fights.
// Usage: node tools/meta.js [matches] [--json out.json]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, Math }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/config.js', 'data/weapons.js', 'data/armor.js', 'data/relics.js', 'data/artifacts.js', 'data/sets.js', 'data/gems.js', 'data/consumables.js', 'data/specs.js', 'data/monsters.js',
  'src/rng.js', 'src/stats.js', 'src/items.js', 'src/combat.js', 'src/dungeon.js', 'src/tournament.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, C = G.CONFIG;
const MATCHES = +process.argv[2] || 400;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const rng = new G.RNG(424242);

// tally: key -> { picks, wins, fair, reached, placeSum }
const T = {};
const tally = (cat, key, f) => { const o = (T[cat] = T[cat] || {}); const r = (o[key] = o[key] || { picks: 0, wins: 0, fair: 0, inTour: 0, place: 0, dungeonPicks: 0 }); f(r); };
const pool = [];   // late heroes for the controlled tests

function classLabel(h) {
  const st = G.Stats.sets(h);
  if (st.full) return st.look + ' 6';
  if (st.hybrid) return G.HYBRIDS[st.hybrid].name;
  const a = st.active.slice().sort((x, y) => (st.counts[y.cls] || 0) - (st.counts[x.cls] || 0))[0];
  return a ? `${a.cls} ${st.counts[a.cls]}` : 'no set';
}
const mainClass = h => { const st = G.Stats.sets(h); const a = st.active.slice().sort((x, y) => (st.counts[y.cls] || 0) - (st.counts[x.cls] || 0))[0]; return a ? a.cls : 'no set'; };
const weapon = h => (h.gear.weapon ? (h.gear.weapon.artifact ? G.ARTIFACTS[h.gear.weapon.artifact].name + ' (' + G.WEAPONS[h.gear.weapon.weaponType].name + ')' : G.WEAPONS[h.gear.weapon.weaponType].name) : 'none');
const wtype = h => (h.gear.weapon ? G.WEAPONS[h.gear.weapon.weaponType].name : 'none');
const legend = h => { const it = G.SLOTS.map(s => h.gear[s]).find(x => x && x.artifact); return it ? G.ARTIFACTS[it.artifact].name : 'none'; };

for (let mi = 0; mi < MATCHES; mi++) {
  const heroes = [];
  for (let i = 0; i < 6; i++) heroes.push(G.Hero.create({ name: 'AI' + i }, rng.fork()));
  G.Supply.reset(heroes);
  G.Dungeon.planBosses(rng.int(0, 1e9));
  for (let room = 1; room <= C.rooms; room++) {
    for (const h of heroes) {
      if (!h.alive) continue;
      if (C.shopRooms.includes(room)) { G.AI.resolveDoor(h, { type: 'shop' }, room, h.rng); continue; }
      G.AI.aiRoom(h, room);
    }
    if (C.duelRooms.includes(room)) G.Duel.runAll(heroes, room, rng);
  }
  // Dungeon survival by spec and gem (every hero that got that far)
  for (const h of heroes) {
    tally('spec', h.spec || 'none', r => { r.dungeonPicks++; if (h.alive) r.inTour++; });
    tally('gem', h.gem || 'none', r => { r.dungeonPicks++; if (h.alive) r.inTour++; });
  }
  const field = heroes.filter(h => h.alive);
  if (field.length < 2) continue;
  for (const h of field) pool.push(JSON.parse(JSON.stringify({ ...h, rng: undefined })));
  const TT = G.Tournament.create(field, rng.fork());
  G.Tournament.runAll(TT);
  const fair = 1 / field.length;
  for (const e of TT.entrants) {
    const h = e.hero, won = TT.champion === e;
    const keys = { spec: h.spec || 'none', gem: h.gem || 'none', class: mainClass(h), build: classLabel(h), weapon: wtype(h),
      'weapon + class': `${wtype(h)} + ${classLabel(h)}`, artifact: legend(h) };
    for (const cat in keys) tally(cat, keys[cat], r => { r.picks++; r.fair += fair; if (won) r.wins++; r.place += e.place || 1; });
  }
}

const rows = (cat, min = 1) => Object.entries(T[cat] || {}).filter(([, r]) => r.picks >= min)
  .map(([k, r]) => ({ key: k, picks: r.picks, wins: r.wins, ratio: r.wins / Math.max(0.01, r.fair), winPct: r.wins / r.picks, avgPlace: r.place / r.picks,
    reach: r.dungeonPicks ? r.inTour / r.dungeonPicks : null }))
  .sort((a, b) => b.ratio - a.ratio);

// ---------- Part 2: controlled player fights ----------
function controlled(kind, options) {
  const sample = pool.filter((_, i) => i % 3 === 0).slice(0, 240).map(h => { h.rng = new G.RNG(1); return h; });
  const out = {};
  for (const opt of options) {
    let w = 0, n = 0;
    for (let i = 0; i < sample.length; i++) {
      const a = JSON.parse(JSON.stringify(sample[i])); a.rng = new G.RNG(i + 1);
      if (kind === 'spec') { a.spec = opt; a.treePicks = {}; for (const lv of C.levels.treeLevels) if (a.level >= lv) G.AI.autoTree(a, lv); }
      else a.gem = opt;
      a.buffs = {};
      for (let k = 1; k <= 4; k++) {
        const b = sample[(i + k * 37) % sample.length]; b.buffs = {};
        const A = { hero: a, hp: G.Hero.maxHp(a) }, B = { hero: b, hp: G.Hero.maxHp(b) };
        if (kind === 'gem' && opt === 'stone') A.hp = C.stoneHp;
        const r = G.Tournament.pvp(A, B, null, i * 1009 + k);
        if (r.winner === 'a' && !r.draw) w++; n++;
      }
    }
    out[opt] = { winPct: w / n, n };
  }
  return Object.entries(out).sort((x, y) => y[1].winPct - x[1].winPct);
}
const specCtl = controlled('spec', G.SPEC_ORDER);
const gemCtl = controlled('gem', G.GEM_ORDER);

const report = { matches: MATCHES, spec: rows('spec'), gem: rows('gem'), class: rows('class'), build: rows('build', 15), weapon: rows('weapon', 15),
  combo: rows('weapon + class', 12), artifact: rows('artifact', 8), specControlled: specCtl, gemControlled: gemCtl };
const f = x => (x == null ? '-' : x.toFixed(2));
const show = (title, list) => { console.log('\n' + title); for (const r of list) console.log(`  ${r.key.padEnd(34)} picks ${String(r.picks).padStart(5)}  wins ${String(r.wins).padStart(4)}  x${f(r.ratio)} fair  avg place ${f(r.avgPlace)}${r.reach != null ? `  reached tournament ${Math.round(r.reach * 100)}%` : ''}`); };
console.log(`${MATCHES} matches. "x1.00 fair" = won exactly its share of tournaments; above 1 = stronger.`);
show('SPECS', report.spec); show('HEART GEMS', report.gem); show('MAIN CLASS', report.class); show('SET BUILDS (15+ picks)', report.build);
show('WEAPONS (15+ picks)', report.weapon); show('WEAPON + BUILD (12+ picks)', report.combo); show('ARTIFACTS (8+ picks)', report.artifact);
console.log('\nCONTROLLED: same gear, only the spec changes (win % in player fights vs other late heroes)');
for (const [k, v] of specCtl) console.log(`  ${k.padEnd(16)} ${(v.winPct * 100).toFixed(1)}%`);
console.log('\nCONTROLLED: same gear, only the heart gem changes');
for (const [k, v] of gemCtl) console.log(`  ${k.padEnd(16)} ${(v.winPct * 100).toFixed(1)}%`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
