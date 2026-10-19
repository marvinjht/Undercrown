// Headless balance test: plays many full runs with the AI and prints survival stats.
// Usage: node tools/balance.js [runs]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data/config.js', 'data/weapons.js', 'data/armor.js', 'data/sets.js', 'data/gems.js', 'data/consumables.js', 'data/specs.js', 'data/monsters.js',
  'src/rng.js', 'src/stats.js', 'src/items.js', 'src/combat.js', 'src/dungeon.js', 'src/tournament.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const G = ctx.G; G._fightLog = [];
const RUNS = +process.argv[2] || 400;
const rng = new G.RNG(12345);
const deathsByRoom = {}, survivors = [], byWeapon = {}, bySpec = {}, fightTimes = [], byGem = {}, setsSeen = {}, hybridsSeen = {};
let finalRarity = { grey: 0, green: 0, gold: 0 };

for (let i = 0; i < RUNS; i++) {
  const h = G.Hero.create({ name: 'AI' }, rng.fork());
  G.AI.aiRoom(h, 1);
  const wt = h.gear.weapon.weaponType;
  for (let room = 2; room <= G.CONFIG.rooms && h.alive; room++) G.AI.aiRoom(h, room);
  byWeapon[wt] = byWeapon[wt] || { n: 0, alive: 0 };
  byWeapon[wt].n++;
  const sp = h.spec || 'none';
  bySpec[sp] = bySpec[sp] || { n: 0, alive: 0, wins: 0 };
  bySpec[sp].n++;
  const gm = h.gem || 'none'; byGem[gm] = byGem[gm] || { n: 0, alive: 0 }; byGem[gm].n++; if (h.alive) byGem[gm].alive++;
  const st = G.Stats.sets(h); for (const a of st.active) setsSeen[a.cls + a.tier] = (setsSeen[a.cls + a.tier] || 0) + 1; if (st.hybrid) hybridsSeen[st.hybrid] = (hybridsSeen[st.hybrid] || 0) + 1;
  if (h.alive) {
    byWeapon[wt].alive++; bySpec[sp].alive++;
    survivors.push(h);
    for (const s of G.SLOTS) if (h.gear[s]) finalRarity[h.gear[s].rarity]++;
  } else deathsByRoom[h.diedRoom] = (deathsByRoom[h.diedRoom] || 0) + 1;
}
const FL = G._fightLog.slice(); G._fightLog = null; FL.sort((a,b)=>a-b); console.log(`Fight length (all sims): median ${FL[FL.length>>1].toFixed(1)}s, 90th ${FL[Math.floor(FL.length*0.9)].toFixed(1)}s, timeouts ${Math.round(FL.filter(x=>x>=G.CONFIG.combat.maxTime-0.01).length/FL.length*100)}%`);
console.log(`Survived to tournament: ${survivors.length}/${RUNS} (${Math.round(survivors.length / RUNS * 100)}%)`);
const bands = {};
for (const r in deathsByRoom) { const b = Math.floor((r - 1) / 5) * 5 + 1; bands[`${b}-${b + 4}`] = (bands[`${b}-${b + 4}`] || 0) + deathsByRoom[r]; }
console.log('Deaths by rooms:', bands, ' boss rooms:', { 10: deathsByRoom[10] || 0, 20: deathsByRoom[20] || 0, 30: deathsByRoom[30] || 0 });
console.log('By weapon:', Object.fromEntries(Object.entries(byWeapon).map(([k, v]) => [k, `${v.alive}/${v.n}`])));
const avgHp = survivors.reduce((a, h) => a + h.hp / G.Hero.maxHp(h), 0) / Math.max(1, survivors.length);
console.log('Avg HP% entering arena:', Math.round(avgHp * 100), ' final gear rarity:', finalRarity);

// Tournament among survivors in groups of 6 to see spec win rates
for (let i = 0; i + 6 <= survivors.length; i += 6) {
  const T = G.Tournament.create(survivors.slice(i, i + 6), rng.fork());
  G.Tournament.runAll(T);
  bySpec[T.champion.hero.spec || 'none'].wins++;
}
console.log('By gem:', Object.fromEntries(Object.entries(byGem).map(([k, v]) => [k, `${v.alive}/${v.n}`])));
console.log('Sets active at end:', setsSeen, 'hybrids:', hybridsSeen);
console.log('By spec (alive/n, tournament wins):', Object.fromEntries(Object.entries(bySpec).map(([k, v]) => [k, `${v.alive}/${v.n}, ${v.wins}w`])));

// Fight length sample
const h = G.Hero.create({ name: 'T' }, new G.RNG(9));
G.Hero.equip(h, G.Items.generate(new G.RNG(1), { slot: 'weapon', rarity: 'grey', room: 1, weaponType: 'longsword' }));
for (const room of [2, 10, 20, 30]) {
  const mon = G.MONSTERS.filter(m => room >= m.minRoom && room <= m.maxRoom)[0];
  const r = G.simulateFight(G.Stats.compute(h), G.Dungeon.buildEnemies(mon, room, 'fight'), { seed: 5 });
  fightTimes.push(`room ${room} (grey gear): ${r.duration.toFixed(1)}s, ${r.winner}, hp ${r.aHp}`);
}
console.log(fightTimes.join('\n'));

// What rarities drop by room band (fresh hero, fight loot, incl. bad-luck protection)
const bandsR = {};
for (let i = 0; i < 300; i++) {
  const hh = G.Hero.create({ name: 'L' }, rng.fork());
  for (let room = 2; room <= 30; room++) {
    const b = room <= 6 ? '2-6' : room <= 12 ? '7-12' : room <= 20 ? '13-20' : '21-30';
    bandsR[b] = bandsR[b] || { grey: 0, green: 0, gold: 0 };
    bandsR[b][G.Loot.rollRarity(hh, room, 0, hh.rng)]++;
    bandsR[b][G.Loot.rollRarity(hh, room, 0, hh.rng)]++;
  }
}
for (const b in bandsR) { const t = bandsR[b], n = t.grey + t.green + t.gold; console.log(`drops rooms ${b}: grey ${Math.round(t.grey / n * 100)}% green ${Math.round(t.green / n * 100)}% gold ${Math.round(t.gold / n * 100)}%`); }
// Average fight length in the dungeon
