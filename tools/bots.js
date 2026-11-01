// Bots vs a player-like hero: plays many full matches where seat 0 uses a test profile and the other 5 seats are bots,
// and reports how often seat 0 wins the tournament and reaches room 30 (a fair share of wins is 1 in 6 = 16.7%).
// Usage: node tools/bots.js [matches per line]      (default 300)
//
// Two experiments:
//   1. What makes bots strong: seat 0 plays like today's bots except for ONE human limitation at a time.
//   2. Difficulty: a "fair" player-like profile (all the limitations together) against Easy, Medium and Hard bots.
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
const N = +process.argv[2] || 300;

// Today's bots: exact sight, gear judged by its combat value, no slips (what a hero with no level does)
const BEST = { sight: 'exact', doorNoise: 0.5, eye: 'power', skipUpgrade: 0, plunderRandom: 0, plunderMiss: 0, specSmart: false, gemRandom: 0, treeRandom: 0, bagSkill: 1 };
// How we model a person: sees skulls not exact odds, reads gear by its stat lines, sometimes misses a Plunder turn
// on the timer, forgets a potion now and then, and picks spec, gem and tree nodes by feel
const HUMAN = { sight: 'skulls', doorNoise: 0.7, eye: 'stats', skipUpgrade: 0.05, plunderRandom: 0.1, plunderMiss: 0.08, specSmart: false, gemRandom: 0.6, treeRandom: 0.4, bagSkill: 0.7 };

function play(seat0, bots, seed) {
  const rng = new G.RNG(seed);
  const heroes = [];
  for (let i = 0; i < 6; i++) {
    const h = G.Hero.create({ name: 'H' + i }, rng.fork());
    if (i === 0) h.botKnobs = seat0; else if (bots) h.botKnobs = bots;
    heroes.push(h);
  }
  G.Supply.reset(heroes);
  G.Dungeon.planBosses(rng.int(0, 1e9));
  for (let room = 1; room <= C.rooms; room++) {
    for (const h of heroes) {
      if (!h.alive) continue;
      if (C.shopRooms.includes(room)) { G.AI.resolveDoor(h, { type: 'shop' }, room, h.rng); G.AI.autoPicks(h, h.rng); continue; }
      G.AI.aiRoom(h, room);
    }
    if (C.duelRooms.includes(room)) G.Duel.runAll(heroes, room, rng);
  }
  const me = heroes[0], field = heroes.filter(h => h.alive);
  let win = false;
  if (field.length) {
    const T = G.Tournament.create(field, rng.fork());
    G.Tournament.runAll(T);
    win = !!(T.champion && T.champion.hero === me);
  }
  return { win, reached: me.alive || field.includes(me), level: me.level };
}

function line(label, seat0, bots) {
  let wins = 0, reached = 0, lv = 0;
  for (let i = 0; i < N; i++) {
    const r = play(seat0, bots, 1000 + i * 7919);
    if (r.win) wins++;
    if (r.reached) reached++;
    lv += r.level;
  }
  const pct = x => (100 * x / N).toFixed(1).padStart(5) + '%';
  console.log(`${label.padEnd(44)} wins ${pct(wins)}   reached room 30 ${pct(reached)}   avg level ${(lv / N).toFixed(1)}`);
}

console.log(`${N} matches per line. Seat 0 against 5 bots; a fair share of wins is 16.7%.\n`);
console.log('1. What makes bots strong (bots play as today; seat 0 differs in ONE way)');
line('Same as the bots (control)', BEST, null);
line('Sees skulls, not exact odds', { ...BEST, sight: 'skulls' }, null);
line('Reads gear by its stat lines', { ...BEST, eye: 'stats' }, null);
line('Misses 8% of Plunder turns, 10% random picks', { ...BEST, plunderMiss: 0.08, plunderRandom: 0.1 }, null);
line('Spec, gem and tree by feel', { ...BEST, gemRandom: 0.6, treeRandom: 0.4 }, null);
line('Forgets potions sometimes (70%)', { ...BEST, bagSkill: 0.7 }, null);
line('Noisier door choices', { ...BEST, doorNoise: 0.7 }, null);
line('All of the above (player-like)', HUMAN, null);
console.log('\n2. Difficulty: the player-like profile against each level');
for (const L of ['easy', 'medium', 'hard']) line(`Player-like vs ${L[0].toUpperCase() + L.slice(1)} bots`, HUMAN, C.bots.levels[L]);
console.log(`\nToday's bots (no level) vs Hard bots: see line 1 control. Knobs: data/config.js CONFIG.bots.`);
