// Player-vs-player: duels after the bosses in rooms 10 and 20, and the heart-based tournament after room 30.
// Both use the arena rule (half damage) and fill an odd player out with a ghost: a half-strength copy of
// the strongest other player. Nobody ever gets a bye.
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const half = x => Math.max(0, 2 * Math.round(x * 0.5 / 2));

  // A ghost: a pale, weaker copy of another player's current build
  function ghostOf(hero) {
    const s = { ...G.Stats.compute(hero) };
    const H = CFG().ghost;
    s.maxHp = Math.max(10, 2 * Math.round(s.maxHp * H.hpMult / 2));
    s.dmg = Math.max(2, 2 * Math.round(s.dmg * H.dmgMult / 2));
    s.holy = half(s.holy); s.bleed = half(s.bleed); s.shield = half(s.shield);
    if (s.spell) s.spell = { ...s.spell, dmg: Math.max(2, 2 * Math.round(s.spell.dmg * H.dmgMult / 2)) };
    s.gem = null;   // a ghost doesn't explode or turn to stone
    return { s, name: 'Ghost of ' + (hero.isPlayer ? 'You' : hero.name), hp: s.maxHp, sprite: 'hero', tint: hero.tint, ghost: true, of: hero };
  }
  const strongest = (heroes, except) => heroes.filter(h => h !== except).sort((a, b) => G.Hero.power(b) - G.Hero.power(a))[0] || except;

  // One PvP fight. a and b are { hero, hp } (b may be a ghost spec instead of a hero).
  // seed: multiplayer passes the host's seed so every screen plays the exact same fight
  function pvp(a, b, rng, seed) {
    const bSpec = b.ghost ? b : { s: G.Stats.compute(b.hero), name: b.hero.isPlayer ? 'You' : b.hero.name, hp: b.hp, sprite: 'hero', tint: b.hero.tint };
    return G.simulateFight(G.Stats.compute(a.hero), [bSpec],
      { seed: seed != null ? seed : rng.int(0, 1e9), aHp: a.hp, aName: a.hero.isPlayer ? 'You' : a.hero.name, pvp: true, maxTime: CFG().arena.maxTime });
  }

  // Pair players up. sortKey decides who meets whom (closest first); the last player left fights a ghost.
  function makePairs(list, rng, lastOpp, sortKey) {
    const pool = list.slice().sort(sortKey || (() => rng.float() - 0.5));
    const pairs = [];
    let ghostFor = null;
    if (pool.length % 2 === 1) {
      // The player with the fewest hearts (then lowest health) fights the ghost
      const weakest = pool.slice().sort((x, y) => x.hero.hearts - y.hero.hearts || x.hp - y.hp)[0];
      pool.splice(pool.indexOf(weakest), 1);
      ghostFor = weakest;
    }
    while (pool.length) {
      const a = pool.shift();
      let j = pool.findIndex(b => lastOpp(a) !== b.hero.id);
      if (j < 0) j = 0;
      const b = pool.splice(j, 1)[0];
      pairs.push({ a, b });
    }
    if (ghostFor) {
      const others = list.map(e => e.hero);
      pairs.push({ a: ghostFor, b: ghostOf(strongest(others, ghostFor.hero)), ghost: true });
    }
    return pairs;
  }

  // ---------- Duels (rooms 10 and 20) ----------
  // Fight at current health. The winner's health goes back to what it was; the loser loses a heart and comes
  // back at full health. Past the time limit, both lose a heart.
  const Duel = {
    pairs(heroes, rng) {
      const list = heroes.filter(h => h.alive).map(h => ({ hero: h, hp: h.hp }));
      return makePairs(list, rng, e => e.hero.opponents[e.hero.opponents.length - 1]);
    },
    simulate(pair, rng) { return pvp(pair.a, pair.b, rng, pair.seed); },
    // Returns a short summary; mutates the heroes. hpBefore restores health.
    resolve(pair, res, room) {
      const X = CFG().xp, out = { heartLost: [] };
      const sides = [pair.a, pair.b];
      const winnerSide = res.winner === 'a' ? 0 : 1;
      pair.winner = sides[winnerSide]; pair.result = res;
      pair.draw = !!res.draw;
      for (let i = 0; i < 2; i++) {
        const e = sides[i];
        if (e.ghost) continue;
        const h = e.hero, won = i === winnerSide && !res.draw;
        h.hp = e.hp;                                      // the winner's health goes back to what it was
        if (!pair.ghost) h.opponents.push(sides[1 - i].hero.id);
        G.Hero.gainXp(h, won ? X.duelWin : X.duelLoss);
        if (won && !pair.ghost) h.gold += CFG().duel.winGold;
        if (!won && !pair.ghost) {
          out.heartLost.push(h);
          if (!G.Hero.loseHeart(h, room)) h.outIn = 'duel';   // back at full health, or out
        }
      }
      return out;
    },
    runAll(heroes, room, rng, skip) {
      const lost = [];
      const pairs = this.pairs(heroes, rng);
      for (const p of pairs) {
        if (skip && skip(p)) continue;
        lost.push(...this.resolve(p, this.simulate(p, rng), room).heartLost);
      }
      return { pairs, lost };
    },
  };

  // ---------- Tournament ----------
  // Everyone with hearts enters at their dungeon health plus a 30% heal. Each round everyone is paired again.
  // Winners keep the health they end with; losers lose a heart and come back at full health.
  // Last player with hearts wins.
  function entryHeal(h, max) {
    let heal = 2 * Math.round(max * CFG().arenaHealPct / 2);
    if (h.gem === 'gaia') heal = 0;
    else if (h.gem === 'stone') heal = 1;
    else if (h.gem === 'vulture') heal = 2 * Math.round(heal / 4);
    return heal;
  }

  function create(heroes, rng) {
    const entrants = heroes.map(h => {
      const max = G.Hero.maxHp(h);
      const heal = entryHeal(h, max);
      const hp = Math.min(max, h.hp + heal);
      return { hero: h, before: h.hp, heal: hp - h.hp, hp, maxHp: max, power: G.Hero.power(h), place: null, out: false };
    });
    const T = { entrants, rounds: [], rng, champion: null, lastOpp: {} };
    checkDone(T);
    if (!T.champion) buildRound(T);
    return T;
  }
  const alive = T => T.entrants.filter(e => !e.out);

  function checkDone(T) {
    const left = alive(T);
    if (left.length <= 1) {
      T.champion = left[0] || null;
      if (T.champion) T.champion.place = 1;
      return true;
    }
    return false;
  }

  function buildRound(T) {
    const list = alive(T);
    // closest heart counts meet, ties by health
    const key = (x, y) => y.hero.hearts - x.hero.hearts || y.hp - x.hp;
    const pairs = makePairs(list, T.rng, e => T.lastOpp[e.hero.id], key);
    T.rounds.push({ n: T.rounds.length + 1, pairs });
  }

  function currentRound(T) { return T.rounds[T.rounds.length - 1]; }
  function nextMatch(T) {
    if (T.champion) return null;
    return currentRound(T).pairs.find(p => !p.result) || null;
  }
  function simulate(T, m) { return pvp(m.a, m.b, T.rng, m.seed); }

  function eliminate(T, e) {
    e.out = true;
    e.place = alive(T).length + 1;
  }

  function resolve(T, m, res) {
    m.result = res;
    const sides = [m.a, m.b];
    const wi = res.winner === 'a' ? 0 : 1;
    m.winner = sides[wi];
    const loser = sides[1 - wi];
    const hpOf = i => Math.max(0, i === 0 ? res.aHp : res.bHp);
    m.lostHeart = null; m.lostHearts = [];
    m.draw = !!res.draw;
    for (let i = 0; i < 2; i++) {
      const e = sides[i];
      if (e.ghost) continue;
      if (!m.ghost) T.lastOpp[e.hero.id] = sides[1 - i].hero.id;
      if (m.draw && !m.ghost) {
        // Past the time limit: both lose a heart and come back at full health
        e.hero.hearts = Math.max(0, e.hero.hearts - 1);
        m.lostHearts.push(e); e.hp = e.maxHp;
        continue;
      }
      if (m.draw) { e.hp = Math.max(10, hpOf(i)); continue; }
      if (i === wi) {
        e.hp = Math.max(1, hpOf(i));
        // Warrior 6 (Bloodrage): the kill heal carries into the next fight
        const rage = res.bloodrage ? res.bloodrage[i === 0 ? 'a' : 'b'] : 0;
        if (rage) { const add = e.hero.gem === 'gaia' ? 0 : e.hero.gem === 'stone' ? 1 : rage; e.hp = Math.min(e.maxHp, e.hp + add); m.rageHeal = add; }
      } else if (m.ghost) {
        // Losing to a ghost costs no heart; you limp on with what's left (at least 10)
        e.hp = Math.max(10, hpOf(i));
      } else {
        e.hero.hearts = Math.max(0, e.hero.hearts - 1);
        m.lostHeart = e; m.lostHearts.push(e);
        e.hp = e.maxHp;
      }
    }
    // If a time-out would knock out the last two players at once, they keep their last heart and go again
    const outNow = m.lostHearts.filter(e => e.hero.hearts <= 0);
    if (outNow.length && outNow.length >= alive(T).length) { for (const e of outNow) e.hero.hearts = 1; m.suddenDeath = true; }
    for (const e of m.lostHearts) if (e.hero.hearts <= 0) eliminate(T, e);
    for (const e of m.lostHearts) vultureFeed(T, e.hero);
    // Remember how things stood right after this fight, so the bracket shows history correctly
    m.snap = sides.map(e => (e.ghost ? null : { hearts: e.hero.hearts, hp: e.hp, out: e.out }));
    void loser;
    if (currentRound(T).pairs.every(p => p.result)) {
      if (!checkDone(T)) buildRound(T);
    }
  }

  // Vulture's Heart grows and heals whenever a rival loses a heart
  function vultureFeed(T, victim) {
    for (const e of alive(T)) {
      if (e.hero === victim || e.hero.gem !== 'vulture') continue;
      // +max health and a heal of the same amount; the entrant tracks both
      const n = CFG().vultureHeal;
      e.hero.bonus = e.hero.bonus || {};
      e.hero.bonus.hp = (e.hero.bonus.hp || 0) + n;
      e.maxHp += n;
      e.hp = Math.min(e.maxHp, e.hp + n);
    }
  }

  function runAll(T) {
    let m, guard = 0;
    while ((m = nextMatch(T)) && guard++ < 200) resolve(T, m, simulate(T, m));
  }

  G.Duel = Duel;
  G.Tournament = { create, nextMatch, simulate, resolve, runAll, currentRound, ghostOf, alive, pvp, strongest };
})(window.G);
