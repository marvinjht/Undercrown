// How hard each part of the dungeon hits: plays many full matches with the AI and reports, per phase (morning, evening,
// night) and per boss (by the room it appears in), how often a fight costs a heart and how much health it costs.
// Usage: node tools/fights.js [matches] [--set PATH=VALUE ...]
//   --set tries a number without editing the data files, e.g.
//   node tools/fights.js 400 --set BOSSES.gorehorn.hit=1.0 --set CONFIG.monster.phase.night.hit=1.05
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data/config.js', 'data/weapons.js', 'data/armor.js', 'data/relics.js', 'data/artifacts.js', 'data/sets.js', 'data/gems.js', 'data/consumables.js', 'data/specs.js', 'data/monsters.js',
  'src/rng.js', 'src/stats.js', 'src/items.js', 'src/combat.js', 'src/dungeon.js', 'src/tournament.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const G = ctx.G, C = G.CONFIG;
const args = process.argv.slice(2);
const N = +(args.find(a => /^\d+$/.test(a)) || 300);
// --set CONFIG.a.b=1.2 (any path under G)
for (let i = 0; i < args.length; i++) if (args[i] === '--set') {
  const [p, v] = args[++i].split('=');
  const keys = p.split('.'), last = keys.pop();
  let o = G;
  for (const k of keys) o = o[k];
  console.log(`set ${p}: ${o[last]} -> ${v}`);
  o[last] = Number(v);
}

const phases = {}, bosses = {};
const add = (tbl, key, lostHp, maxHp, heart) => {
  const t = tbl[key] = tbl[key] || { n: 0, hearts: 0, lost: 0, lostPct: 0 };
  t.n++; t.lost += lostHp; t.lostPct += lostHp / maxHp; if (heart) t.hearts++;
};
const rng = new G.RNG(4242);
let heroes0 = 0, clean = 0;
for (let mi = 0; mi < N; mi++) {
  const heroes = [];
  for (let i = 0; i < 6; i++) heroes.push(G.Hero.create({ name: 'AI' + i }, rng.fork()));
  G.Supply.reset(heroes);
  G.Dungeon.planBosses(rng.int(0, 1e9));
  const lostAny = new Set();
  for (let room = 1; room <= C.rooms; room++) {
    for (const h of heroes) {
      if (!h.alive) continue;
      if (C.shopRooms.includes(room)) { G.AI.resolveDoor(h, { type: 'shop' }, room, h.rng); continue; }
      const hp0 = h.hp, max0 = G.Hero.maxHp(h), hearts0 = h.hearts;
      G.AI.aiRoom(h, room);
      const kind = h.lastAction;   // the door's title
      const fought = /^(beat|lost a heart|fell to|ran out of time)/.test(h.lastText || '');
      if (h.hearts < hearts0) lostAny.add(h);
      if (!fought || !['Fight', 'Elite', 'Boss'].includes(kind)) continue;
      const heart = h.hearts < hearts0;
      const lost = heart ? hp0 : Math.max(0, hp0 - h.hp);
      const ph = G.phaseOf(room).id;
      add(phases, `${ph} ${kind}`, lost, max0, heart);
      add(phases, `${ph} (all fights)`, lost, max0, heart);
      if (kind === 'Boss') { const b = G.Dungeon.monsterFor(room, 'boss'); add(bosses, `${b.name} (room ${room}, ${ph})`, lost, max0, heart); }
    }
    if (C.duelRooms.includes(room)) G.Duel.runAll(heroes, room, rng);
  }
  for (const h of heroes) { heroes0++; if (h.alive && !lostAny.has(h)) clean++; }
}
const row = (k, t) => `${k.padEnd(36)} ${String(t.n).padStart(6)} fights   heart lost ${(100 * t.hearts / t.n).toFixed(1).padStart(5)}%   ` +
  `health lost ${Math.round(t.lost / t.n).toString().padStart(4)} (${Math.round(100 * t.lostPct / t.n)}% of max)`;
console.log(`\n${N} matches, ${heroes0} heroes. Reached room 30 without losing a heart (dungeon only): ${(100 * clean / heroes0).toFixed(0)}%\n`);
console.log('By phase');
for (const ph of ['morning', 'evening', 'night']) for (const k of ['(all fights)', 'Fight', 'Elite', 'Boss']) if (phases[`${ph} ${k}`]) console.log('  ' + row(`${ph} ${k}`, phases[`${ph} ${k}`]));
console.log('\nBy boss');
for (const k of Object.keys(bosses).sort((a, b) => +a.match(/room (\d+)/)[1] - +b.match(/room (\d+)/)[1] || a.localeCompare(b))) console.log('  ' + row(k, bosses[k]));
