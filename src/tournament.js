// Tournament rules:
//  - Enter at the health you left the dungeon with, plus a heal of 30% of max health.
//  - That number is your "arena health". You start every match at it (winners reset to it).
//  - Seeded by arena health (ties: build power). If the field isn't a power of two,
//    the top seeds get byes into round two.
window.G = window.G || {};

(function (G) {
  function roundName(size) {
    return size === 2 ? 'Final' : size === 4 ? 'Semifinals' : size === 8 ? 'Quarterfinals' : 'Round of ' + size;
  }

  function create(heroes, rng) {
    const entrants = heroes.map(h => {
      const st = G.Stats.compute(h);
      let heal = 2 * Math.round(st.maxHp * G.CONFIG.arenaHealPct / 2);
      if (h.gem === 'gaia') heal = 0;
      else if (h.gem === 'stone') heal = 1;
      else if (h.gem === 'vulture') heal = 2 * Math.round(heal / 4);
      const entryHp = Math.min(st.maxHp, h.hp + heal);
      return { hero: h, before: h.hp, heal: entryHp - h.hp, entryHp, maxHp: st.maxHp, power: G.Stats.power(st), place: null };
    });
    entrants.sort((a, b) => b.entryHp - a.entryHp || b.power - a.power);
    entrants.forEach((e, i) => { e.seed = i + 1; });
    const T = { entrants, rounds: [], alive: entrants.slice(), rng, champion: null };
    if (entrants.length === 1) { T.champion = entrants[0]; entrants[0].place = 1; }
    else buildRound(T);
    return T;
  }

  function buildRound(T) {
    const ps = T.alive.slice().sort((a, b) => a.seed - b.seed);
    let size = 1;
    while (size < ps.length) size *= 2;
    const byes = ps.slice(0, size - ps.length);
    const rest = ps.slice(size - ps.length);
    const matches = [];
    for (let i = 0; i < rest.length / 2; i++) matches.push({ a: rest[i], b: rest[rest.length - 1 - i], result: null, winner: null });
    T.rounds.push({ name: roundName(size), size, byes, matches });
  }

  function currentRound(T) { return T.rounds[T.rounds.length - 1]; }
  function nextMatch(T) {
    if (T.champion) return null;
    return currentRound(T).matches.find(m => !m.result) || null;
  }

  function simulate(T, m) {
    const hb = m.b.hero;
    return G.simulateFight(G.Stats.compute(m.a.hero),
      [{ s: G.Stats.compute(hb), name: hb.isPlayer ? 'You' : hb.name, hp: m.b.entryHp, sprite: 'hero', tint: hb.tint,
         revive: hb.gem === 'phoenix' && !hb.phoenixUsed }],
      { seed: T.rng.int(0, 1e9), aHp: m.a.entryHp, aName: m.a.hero.isPlayer ? 'You' : m.a.hero.name,
        aRevive: m.a.hero.gem === 'phoenix' && !m.a.hero.phoenixUsed });
  }

  function resolve(T, m, result) {
    m.result = result;
    if (result.revived.a) m.a.hero.phoenixUsed = true;
    if (result.revived.b) m.b.hero.phoenixUsed = true;
    m.winner = result.winner === 'a' ? m.a : m.b;
    const loser = m.winner === m.a ? m.b : m.a;
    const round = currentRound(T);
    loser.place = round.size / 2 + 1; // final loser = 2nd, semis = 3rd, quarters = 5th
    if (round.matches.every(x => x.result)) {
      T.alive = [...round.byes, ...round.matches.map(x => x.winner)];
      if (T.alive.length === 1) { T.champion = T.alive[0]; T.champion.place = 1; }
      else buildRound(T);
    }
  }

  function runAll(T) {
    let m;
    while ((m = nextMatch(T))) resolve(T, m, simulate(T, m));
  }

  G.Tournament = { create, nextMatch, simulate, resolve, runAll, currentRound };
})(window.G);
