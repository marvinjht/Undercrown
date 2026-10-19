// Headless balance test: plays many full 6-player matches with the AI and prints stats.
// Usage: node tools/balance.js [matches]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data/config.js', 'data/weapons.js', 'data/armor.js', 'data/sets.js', 'data/gems.js', 'data/consumables.js', 'data/specs.js', 'data/monsters.js',
  'src/rng.js', 'src/stats.js', 'src/items.js', 'src/combat.js', 'src/dungeon.js', 'src/tournament.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const G = ctx.G;
const MATCHES = +process.argv[2] || 60;
const rng = new G.RNG(12345);
const C = G.CONFIG;
const stats = { heroes: 0, noHeartLost: 0, reachedEnd: 0, heartsAtEnd: {}, levelAt: { 10: [], 20: [], 30: [] }, outBy: {},
  heartLossRoom: {}, duelLen: [], tourLen: [], tourRounds: [], specWins: {}, gemWins: {}, buildWins: {}, sets: {}, hybrids: {}, full: {},
  supplyLow: 0, fightLen: [], gear: [], rarity: { grey: 0, green: 0, rare: 0 }, tagged: 0, effects: 0, tradeoffs: 0 };
G._fightLog = stats.fightLen;

for (let mi = 0; mi < MATCHES; mi++) {
  const heroes = [];
  for (let i = 0; i < 6; i++) heroes.push(G.Hero.create({ name: 'AI' + i }, rng.fork()));
  G.Supply.reset(heroes);
  const lostAny = new Set();
  for (let room = 1; room <= C.rooms; room++) {
    for (const h of heroes) {
      if (!h.alive) continue;
      const before = h.hearts;
      if (C.shopRooms.includes(room)) { h.lastText = G.AI.resolveDoor(h, { type: 'shop' }, room, h.rng); continue; }
      G.AI.aiRoom(h, room);
      if (h.hearts < before) { lostAny.add(h); stats.heartLossRoom[Math.floor((room - 1) / 5) * 5 + 1] = (stats.heartLossRoom[Math.floor((room - 1) / 5) * 5 + 1] || 0) + 1; }
    }
    if (C.duelRooms.includes(room)) {
      const r = G.Duel.runAll(heroes, room, rng);
      for (const p of r.pairs) stats.duelLen.push(p.result.duration);
    }
    if (room === 10 || room === 20 || room === 30) for (const h of heroes) if (h.alive) stats.levelAt[room].push(h.level);
    if (G.CLASS_ORDER.some(c => G.Supply.left(c) <= 2)) stats.supplyLow++;
  }
  for (const h of heroes) {
    stats.heroes++;
    if (!lostAny.has(h) && h.alive) stats.noHeartLost++;
    if (h.alive) {
      stats.reachedEnd++;
      stats.heartsAtEnd[h.hearts] = (stats.heartsAtEnd[h.hearts] || 0) + 1;
      const st = G.Stats.sets(h);
      for (const a of st.active) stats.sets[a.cls + a.tier] = (stats.sets[a.cls + a.tier] || 0) + 1;
      if (st.hybrid) stats.hybrids[st.hybrid] = (stats.hybrids[st.hybrid] || 0) + 1;
      if (st.full) stats.full[st.look] = (stats.full[st.look] || 0) + 1;
      for (const s of G.SLOTS) { const it = h.gear[s]; if (!it) continue; stats.rarity[it.rarity]++; if (it.set) stats.tagged++; if (it.effect) stats.effects++; if (it.tradeoff) stats.tradeoffs++; }
    } else stats.outBy[h.outIn || 'dungeon'] = (stats.outBy[h.outIn || 'dungeon'] || 0) + 1;
  }
  const field = heroes.filter(h => h.alive);
  if (field.length) {
    const T = G.Tournament.create(field, rng.fork());
    G.Tournament.runAll(T);
    stats.tourRounds.push(T.rounds.length);
    for (const r of T.rounds) for (const p of r.pairs) if (p.result) stats.tourLen.push(p.result.duration);
    if (T.champion) {
      const h = T.champion.hero;
      stats.specWins[h.spec || 'none'] = (stats.specWins[h.spec || 'none'] || 0) + 1;
      stats.gemWins[h.gem || 'none'] = (stats.gemWins[h.gem || 'none'] || 0) + 1;
      const st = G.Stats.sets(h);
      const b = st.full ? st.look + ' 6' : st.hybrid ? G.HYBRIDS[st.hybrid].name : st.active.map(a => a.cls + ' ' + st.counts[a.cls]).join('+') || 'no set';
      stats.buildWins[b] = (stats.buildWins[b] || 0) + 1;
    }
  }
}
const pct = (a, b) => Math.round(a / Math.max(1, b) * 100) + '%';
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
G._fightLog = null;
console.log(`${MATCHES} matches, ${stats.heroes} heroes`);
console.log(`Reached room 30 without losing a heart: ${pct(stats.noHeartLost, stats.heroes)}  (target about 60%)`);
console.log(`Reached the tournament at all: ${pct(stats.reachedEnd, stats.heroes)}  hearts left at the end:`, stats.heartsAtEnd, ' knocked out in:', stats.outBy);
console.log('Hearts lost in the dungeon by rooms:', stats.heartLossRoom);
console.log(`Average level at room 10: ${avg(stats.levelAt[10])}, room 20: ${avg(stats.levelAt[20])}, room 30: ${avg(stats.levelAt[30])}`);
console.log(`Monster fight length median ${med(stats.fightLen).toFixed(1)}s | duel median ${med(stats.duelLen).toFixed(1)}s | tournament fight median ${med(stats.tourLen).toFixed(1)}s, rounds per tournament ${avg(stats.tourRounds)}`);
console.log('End gear rarity:', stats.rarity, 'tagged pieces:', stats.tagged, 'with build effect:', stats.effects, 'with trade-off:', stats.tradeoffs);
console.log('Rooms where some class had 2 or fewer pieces left in the supply:', stats.supplyLow, 'of', MATCHES * C.rooms);
console.log('Sets active at end:', stats.sets);
console.log('Hybrids:', stats.hybrids, 'Full sets:', stats.full);
console.log('Tournament wins by spec:', stats.specWins);
console.log('Tournament wins by gem:', stats.gemWins);
console.log('Tournament wins by build:', stats.buildWins);
