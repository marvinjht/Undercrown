// Rooms, doors, monsters, events, specs offers, and the AI that plays the rival heroes.
// Everything here is UI-free so the same code can run on a server later.
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;

  function monsterFor(room, kind, rng) {
    if (kind === 'boss') return G.BOSSES[CFG().bossRooms[room]];
    const pool = G.MONSTERS.filter(m => room >= m.minRoom && room <= m.maxRoom);
    return rng.pick(pool);
  }

  const even = x => Math.max(2, 2 * Math.round(x / 2));
  function monsterStats(mon, room, kind) {
    const M = CFG().monster;
    const mult = kind === 'elite' ? M.elite : kind === 'boss' ? M.boss : { hp: 1, hit: 1 };
    const hp = even(M.hpBase * Math.pow(M.hpGrowth, room - 1) * mon.hp * mult.hp);
    const hit = even(M.hitBase * Math.pow(M.hitGrowth, room - 1) * mon.hit * mult.hit);
    return {
      maxHp: hp, dmg: hit, spd: mon.spd, atkSpd: mon.spd / 10,
      armor: mon.armor ? even(mon.armor * (1 + (room - 1) / 20)) : 0,
      dodge: mon.dodge || 0, crit: mon.crit || 0, critDmg: 0, stun: mon.stun || 0, leech: mon.leech || 0,
      shield: 0, bleed: 0, spec: null,
    };
  }

  function monsterName(mon, kind) { return kind === 'elite' ? 'Elite ' + mon.name : mon.name; }

  const DOOR_INFO = {
    fight:    { title: 'Fight',    text: d => `${d.monster.name}. Normal loot.` },
    elite:    { title: 'Elite',    text: d => `Elite ${d.monster.name}. Hits harder; loot is uncommon or better.` },
    boss:     { title: 'Boss',     text: d => `${d.monster.name}. Guaranteed legendary item.` },
    treasure: { title: 'Treasure', text: () => 'No fight. Pick one of two items.' },
    rest:     { title: 'Campfire', text: () => `Rest and recover ${CFG().restHeal} health.` },
    armory:   { title: 'The Armory', text: () => 'Every warrior starts here. Pick one of three weapons.' },
    shop:     { title: 'Merchant', text: () => 'Spend gold on potions and gear.' },
    mystery:  { title: 'Unknown',  text: () => 'Could be a gift, could be a fight.' },
  };

  function makeDoors(hero, room, rng) {
    if (room === 1) return [{ type: 'armory' }];
    if (CFG().bossRooms[room]) return [{ type: 'boss', monster: monsterFor(room, 'boss', rng) }];
    const types = Object.keys(CFG().doorWeights).filter(t => room >= CFG().doorMinRoom[t]);
    const first = rng.weighted(types.map(t => [t, CFG().doorWeights[t]]));
    const rest = types.filter(t => t !== first);
    const second = rest.length ? rng.weighted(rest.map(t => [t, CFG().doorWeights[t]])) : first;
    const doors = [first, second].map(type => {
      const d = { type };
      if (type === 'fight' || type === 'elite') d.monster = monsterFor(room, type, rng);
      return d;
    });
    // Two identical doors would be no choice at all: make the monsters differ
    for (let i = 0; i < 6 && doors[1].monster && doors[0].monster && doors[0].type === doors[1].type && doors[0].monster.id === doors[1].monster.id; i++) {
      doors[1].monster = monsterFor(room, doors[1].type, rng);
    }
    return doors;
  }

  function doorInfo(d) { const i = DOOR_INFO[d.type]; return { title: i.title, text: i.text(d) }; }

  // Estimated danger for fight doors: average health lost over a few quick sims
  function danger(hero, door, room) {
    if (!door.monster) return null;
    const ps = G.Stats.compute(hero), ms = monsterStats(door.monster, room, door.type);
    let lost = 0, deaths = 0, n = 6;
    for (let i = 0; i < n; i++) {
      const r = G.simulateFight(ps, ms, { seed: 1000 + i * 7919 + room, aHp: hero.hp });
      if (r.winner === 'b' && !r.timeout) deaths++;
      lost += hero.hp - r.aHp;
    }
    const avg = lost / n;
    const frac = avg / Math.max(1, hero.hp);
    let level = 'Low';
    if (deaths >= 3 || frac > 0.8) level = 'Deadly';
    else if (deaths >= 1 || frac > 0.45) level = 'High';
    else if (frac > 0.2) level = 'Medium';
    return { level, avgLoss: Math.round(avg) };
  }

  function goldFor(kind, hero, rng) {
    const r = CFG().gold[kind] || [0, 0];
    let g = rng.int(r[0], r[1]);
    if (hero.spec === 'treasureHunter') g += CFG().gold.treasureHunterBonus;
    return 2 * Math.round(g / 2);
  }

  function itemPrice(item) {
    return CFG().shop.itemCost[item.rarity] + item.room * CFG().shop.itemCostPerRoom;
  }

  function specOptions(hero, rng) {
    const wt = hero.gear.weapon && hero.gear.weapon.weaponType;
    const pool = G.SPEC_ORDER.slice(), out = [];
    while (out.length < 3 && pool.length) {
      const id = rng.weighted(pool.map(s => [s, G.SPECS[s].affinity.includes(wt) ? 2.5 : 1]));
      out.push(id);
      pool.splice(pool.indexOf(id), 1);
    }
    return out;
  }

  const MYSTERY = [
    { id: 'spring', weight: 3, title: 'Healing Spring', text: 'Clear water bubbles up between the stones.' },
    { id: 'shrine', weight: 3, title: 'Blood Shrine', text: 'A stone altar asks for blood and offers a gift in return.' },
    { id: 'ambush', weight: 3, title: 'Ambush', text: 'Something drops from the ceiling!' },
    { id: 'cache',  weight: 2, title: 'Abandoned Pack', text: 'A fallen adventurer’s pack, still heavy with coin.' },
  ];
  function rollMystery(rng) { return rng.weighted(MYSTERY.map(m => [m, m.weight])); }

  // Fight a room's monster. Mutates hero hp/alive. Returns sim result + info.
  function fight(hero, monster, kind, room, rng) {
    const ms = monsterStats(monster, room, kind);
    const ps = G.Stats.compute(hero);
    const res = G.simulateFight(ps, ms, { seed: rng.int(0, 1e9), aHp: hero.hp });
    return { res, ms, ps };
  }
  function applyFight(hero, res, room) {
    if (res.timeout) { hero.hp = Math.max(1, res.aHp); return 'timeout'; }
    hero.hp = res.aHp;
    if (res.winner === 'b') { hero.alive = false; hero.hp = 0; hero.diedRoom = room; return 'dead'; }
    return 'won';
  }

  G.Dungeon = {
    monsterFor, monsterStats, monsterName, makeDoors, doorInfo, danger, goldFor, itemPrice,
    specOptions, rollMystery, fight, applyFight,
  };

  // ---------------- AI rivals ----------------
  function bestUpgrade(hero, items) {
    const cur = G.Hero.power(hero);
    let best = null, bestP = cur * 1.005;
    for (const it of items) {
      const p = G.Hero.powerWith(hero, it);
      if (p > bestP) { best = it; bestP = p; }
    }
    return best;
  }

  function aiTake(hero, item) {
    const old = G.Hero.equip(hero, item);
    if (old) hero.gold += CFG().salvage[old.rarity];
  }

  function chooseDoor(hero, doors, room, rng) {
    if (doors.length === 1) return doors[0];
    const hpPct = hero.hp / G.Hero.maxHp(hero);
    const score = d => {
      let s;
      switch (d.type) {
        case 'fight': s = hpPct > 0.3 ? 1.2 : 0.3; break;
        case 'elite': s = hpPct > 0.8 ? 2 : hpPct > 0.6 ? 0.9 : 0.05; break;
        case 'treasure': s = 1.8; break;
        case 'rest': s = hpPct < 0.5 ? 3 : hpPct < 0.75 ? 1.3 : 0.2; break;
        case 'shop': s = hero.gold >= 30 && hpPct < 0.6 ? 2.3 : hero.gold >= 60 ? 1.3 : 0.3; break;
        case 'mystery': s = 0.9; break;
        default: s = 1;
      }
      if (d.monster) {
        const dg = danger(hero, d, room);
        if (dg.level === 'Deadly') s *= 0.05;
        else if (dg.level === 'High') s *= 0.4;
      }
      return s + rng.range(0, 0.5);
    };
    return doors.reduce((a, b) => (score(b) > score(a) ? b : a));
  }

  // Take the best upgrade from a set of items, or gold if none helps. Returns a short summary.
  function autoLoot(hero, items, room, goldInstead = true) {
    const up = bestUpgrade(hero, items);
    if (up) { aiTake(hero, up); return `took ${up.name}`; }
    if (goldInstead) { const g = CFG().gold.skipItemBase + 2 * Math.round(room / 2); hero.gold += g; return `took ${g} gold`; }
    return 'took nothing';
  }

  function autoSpec(hero, opts) {
    const wt = hero.gear.weapon && hero.gear.weapon.weaponType;
    const pick = opts.find(s => G.SPECS[s].affinity.includes(wt)) || opts[0];
    G.Hero.setSpec(hero, pick);
    return pick;
  }

  // Resolve a whole door with no player input (AI rivals, or the player when time runs out)
  function resolveDoor(hero, d, room, rng) {
    const maxHp = () => G.Hero.maxHp(hero);
    const doFight = (mon, kind, lootKind) => {
      const { res } = fight(hero, mon, kind, room, rng);
      const out = applyFight(hero, res, room);
      if (out === 'dead') return `fell to ${monsterName(mon, kind)}`;
      if (out === 'timeout') return `fought ${monsterName(mon, kind)} to a standstill`;
      const g = goldFor(kind === 'fight' ? 'fight' : kind, hero, rng);
      hero.gold += g;
      return `beat ${monsterName(mon, kind)}, ${autoLoot(hero, G.Loot.offer(hero, room, lootKind, rng), room)}`;
    };
    switch (d.type) {
      case 'armory': {
        const it = rng.pick(G.Loot.armory(rng));
        G.Hero.equip(hero, it);
        return `took ${it.name}`;
      }
      case 'fight': case 'elite': case 'boss': return doFight(d.monster, d.type, d.type);
      case 'treasure': return `found treasure, ${autoLoot(hero, G.Loot.offer(hero, room, 'treasure', rng), room)}`;
      case 'rest': return `rested for ${G.Hero.heal(hero, CFG().restHeal)} health`;
      case 'shop': {
        const S = CFG().shop;
        let bits = [];
        if (hero.gold >= S.potionCost && maxHp() - hero.hp >= S.potionHeal * 0.6) {
          hero.gold -= S.potionCost; G.Hero.heal(hero, S.potionHeal); bits.push('bought a potion');
        }
        const forSale = G.Loot.offer(hero, room, 'shop', rng, 2).filter(it => itemPrice(it) <= hero.gold);
        const up = bestUpgrade(hero, forSale);
        if (up) { hero.gold -= itemPrice(up); aiTake(hero, up); bits.push(`bought ${up.name}`); }
        return bits.length ? bits.join(' and ') : 'browsed the merchant';
      }
      case 'mystery': {
        const ev = rollMystery(rng);
        if (ev.id === 'spring') return `drank from a spring (+${G.Hero.heal(hero, CFG().springHeal)})`;
        if (ev.id === 'cache') { const g = 2 * rng.int(10, 16); hero.gold += g; return `found ${g} gold`; }
        if (ev.id === 'shrine') {
          if (hero.hp / maxHp() > 0.6 && hero.hp > CFG().shrineCost) {
            hero.hp -= CFG().shrineCost;
            return `bled at a shrine, ${autoLoot(hero, G.Loot.offer(hero, room, 'shrine', rng), room, false)}`;
          }
          return 'walked past a shrine';
        }
        return 'was ambushed: ' + doFight(monsterFor(room, 'fight', rng), 'fight', 'fight');
      }
    }
    return '';
  }

  function aiRoom(hero, room) {
    const rng = hero.rng;
    const doors = makeDoors(hero, room, rng);
    const d = chooseDoor(hero, doors, room, rng);
    hero.lastAction = doorInfo(d).title;
    hero.lastText = resolveDoor(hero, d, room, rng);
    if (hero.alive && room === CFG().specRoom && !hero.spec) autoSpec(hero, specOptions(hero, rng));
  }

  G.AI = { aiRoom, bestUpgrade, autoLoot, autoSpec, resolveDoor, chooseDoor };
})(window.G);
