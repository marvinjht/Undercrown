// Rooms, doors, monsters, events, spec and gem offers, and the AI that plays the rival heroes.
// Everything here is UI-free so the same code can run on a server later.
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const even = x => Math.max(2, 2 * Math.round(x / 2));

  function monsterFor(room, kind, rng) {
    if (kind === 'boss') return G.BOSSES[CFG().bossRooms[room]];
    return rng.pick(G.MONSTERS.filter(m => room >= m.minRoom && room <= m.maxRoom));
  }

  function statBlock(def, room, mult) {
    const M = CFG().monster;
    return {
      maxHp: even(M.hpBase * Math.pow(M.hpGrowth, room - 1) * def.hp * mult.hp),
      dmg: even(M.hitBase * Math.pow(M.hitGrowth, room - 1) * def.hit * mult.hit),
      spd: def.spd, atkSpd: def.spd / 10,
      armor: def.armor ? even(def.armor * (1 + (room - 1) / 20)) : 0,
      ward: def.ward ? even(def.ward * (1 + (room - 1) / 20)) : 0,
      dodge: def.dodge || 0, crit: def.crit || 0, critDmg: 0, stun: def.stun || 0, leech: def.leech || 0,
      bleed: def.bleed || 0, shield: 0, holy: 0, pierce: 0, manaGain: 0, startMana: 0,
      spec: null, gem: null, spell: null, fx: {}, type: 'phys', range: 'melee',
    };
  }

  function splitSpec(sp, base, room, mult) {
    if (!sp) return null;
    return {
      count: sp.count, name: 'Slime', sprite: 'monster_' + base.id, scale: sp.scale,
      s: statBlock({ ...base, hp: sp.hp, hit: sp.hit }, room, mult),
      next: splitSpec(sp.next, base, room, mult),
    };
  }

  // Enemy specs for one fight door
  function buildEnemies(mon, room, kind) {
    const M = CFG().monster;
    const mult = kind === 'elite' ? M.elite : kind === 'boss' ? M.boss : { hp: 1, hit: 1 };
    const count = (mon.pack || 1) + (kind === 'elite' && mon.pack ? M.elite.packExtra : 0);
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        s: statBlock(mon, room, mult), name: (kind === 'elite' ? 'Elite ' : '') + (mon.memberName || mon.name),
        sprite: 'monster_' + mon.id, scale: (mon.scale || 1) * (kind === 'elite' ? 1.12 : 1),
        tint: kind === 'elite' ? 0xffb8a8 : null,
        steal: mon.steal || 0, escapeAfter: mon.escapeAfter || 0,
        split: splitSpec(mon.split, mon, room, mult),
      });
    }
    return out;
  }

  function monsterName(mon, kind) {
    const n = (kind === 'elite' ? 'Elite ' : '') + mon.name;
    const c = (mon.pack || 1) + (kind === 'elite' && mon.pack ? CFG().monster.elite.packExtra : 0);
    return c > 1 ? `${n} ×${c}` : n;
  }

  const DOOR_INFO = {
    armory:   { title: 'The Armory', text: () => 'Every warrior starts here. Pick one of three weapons.' },
    fight:    { title: 'Fight',    text: d => `${monsterName(d.monster, 'fight')}. Normal loot.` },
    elite:    { title: 'Elite',    text: d => `${monsterName(d.monster, 'elite')}. Hits harder; loot is uncommon or better.` },
    boss:     { title: 'Boss',     text: d => `${d.monster.name}. Guaranteed legendary item.` },
    treasure: { title: 'Treasure', text: () => 'No fight. Pick one of two items.' },
    rest:     { title: 'Campfire', text: () => `Recover ${CFG().restHeal} health. Does not clear poison.` },
    mystery:  { title: 'Unknown',  text: () => 'Could be a gift, could be a fight.' },
    venom:    { title: 'Venom Cache', text: () => `Take an uncommon or better item, but gain ${CFG().poison.venomStacks} poison.` },
    purify:   { title: 'Purifying Spring', text: () => `Clears all poison and heals ${CFG().poison.purifyHeal}.` },
    shop:     { title: 'Shared Shop', text: () => 'Free picks, weakest first, and the merchant.' },
  };

  function makeDoors(hero, room, rng) {
    if (room === 1) return [{ type: 'armory' }];
    if (CFG().shopRooms.includes(room)) return [{ type: 'shop' }];
    if (CFG().bossRooms[room]) return [{ type: 'boss', monster: monsterFor(room, 'boss', rng) }];
    const w = t => (t === 'purify' && hero.poison > 0 ? CFG().purifyWeightPoisoned : CFG().doorWeights[t]);
    const types = Object.keys(CFG().doorWeights).filter(t => room >= CFG().doorMinRoom[t]);
    const first = rng.weighted(types.map(t => [t, w(t)]));
    const rest = types.filter(t => t !== first);
    const second = rest.length ? rng.weighted(rest.map(t => [t, w(t)])) : first;
    const doors = [first, second].map(type => {
      const d = { type };
      if (type === 'fight' || type === 'elite') d.monster = monsterFor(room, type, rng);
      return d;
    });
    for (let i = 0; i < 6 && doors[1].monster && doors[0].monster && doors[0].type === doors[1].type && doors[0].monster.id === doors[1].monster.id; i++) {
      doors[1].monster = monsterFor(room, doors[1].type, rng);
    }
    return doors;
  }

  function doorInfo(d) { const i = DOOR_INFO[d.type]; return { title: i.title, text: i.text(d) }; }

  function fightOpts(hero, seed) {
    return { seed, aHp: hero.hp, aRevive: hero.gem === 'phoenix' && !hero.phoenixUsed, aName: hero.isPlayer ? 'You' : hero.name };
  }

  function danger(hero, door, room) {
    if (!door.monster) return null;
    const ps = G.Stats.compute(hero, { buffs: true });
    const foes = buildEnemies(door.monster, room, door.type);
    let lost = 0, deaths = 0;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const r = G.simulateFight(ps, foes, { ...fightOpts(hero, 1000 + i * 7919 + room), aRevive: false });
      if (r.winner === 'b' && !r.timeout) deaths++;
      lost += hero.hp - r.aHp;
    }
    const avg = Math.max(0, lost / n);
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
    if (item.kind === 'consumable') return G.CONSUMABLES[item.cid].price;
    return CFG().shop.itemCost[item.rarity] + item.room * CFG().shop.itemCostPerRoom;
  }

  function pickN(ids, n, rng) {
    const pool = ids.slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.float() * pool.length), 1)[0]);
    return out;
  }
  const specOptions = (hero, rng) => pickN(G.SPEC_ORDER, 3, rng);
  const gemOptions = (hero, rng) => pickN(G.GEM_ORDER, 3, rng);

  const MYSTERY = [
    { id: 'spring', weight: 3, title: 'Healing Spring', text: 'Clear water bubbles up between the stones.' },
    { id: 'shrine', weight: 3, title: 'Blood Shrine', text: 'A stone altar asks for blood and offers a gift in return.' },
    { id: 'ambush', weight: 3, title: 'Ambush', text: 'Something drops from the ceiling!' },
    { id: 'cache',  weight: 2, title: 'Abandoned Pack', text: 'A fallen adventurer’s pack, still heavy with coin.' },
  ];
  function rollMystery(rng) { return rng.weighted(MYSTERY.map(m => [m, m.weight])); }

  // Run one fight for a hero (no UI). Returns the sim result.
  function fight(hero, mon, kind, room, rng) {
    const foes = buildEnemies(mon, room, kind);
    return G.simulateFight(G.Stats.compute(hero, { buffs: true }), foes, fightOpts(hero, rng.int(0, 1e9)));
  }
  function applyFight(hero, res, room) {
    hero.buffs = {};
    if (res.revived.a) hero.phoenixUsed = true;
    if (res.goldStolen) hero.gold = Math.max(0, hero.gold - res.goldStolen);
    if (res.timeout) { hero.hp = Math.max(1, res.aHp); return 'timeout'; }
    hero.hp = res.aHp;
    if (res.winner === 'b') { hero.alive = false; hero.hp = 0; hero.diedRoom = room; return 'dead'; }
    return 'won';
  }

  // Poison ticks at the start of every room
  function tickPoison(hero, room) {
    if (!hero.alive || hero.poison <= 0) return 0;
    const dmg = hero.poison;
    hero.hp -= dmg;
    if (hero.hp <= 0) {
      if (hero.gem === 'phoenix' && !hero.phoenixUsed) { hero.phoenixUsed = true; hero.hp = G.Hero.maxHp(hero); }
      else { hero.hp = 0; hero.alive = false; hero.diedRoom = room; }
    }
    return dmg;
  }

  // Bag item use (shared by player and AI). Returns a short message.
  function useItem(hero, item) {
    const i = hero.bag.indexOf(item);
    if (i < 0) return '';
    if (item.kind === 'gear') {
      hero.bag.splice(i, 1);
      const old = G.Hero.equip(hero, item);
      if (old) hero.gold += CFG().salvage[old.rarity];
      return `Equipped ${item.name}${old ? `, scrapped ${old.name}` : ''}.`;
    }
    const c = G.CONSUMABLES[item.cid];
    hero.bag.splice(i, 1);
    if (c.heal) return `${c.name}: +${G.Hero.heal(hero, c.heal)} health.`;
    if (c.cure) { const n = hero.poison; hero.poison = 0; return `${c.name}: cleared ${n} poison.`; }
    if (c.buff) { for (const k in c.buff) hero.buffs[k] = (hero.buffs[k] || 0) + c.buff[k]; return `${c.name}: active for your next fight.`; }
    return '';
  }

  G.Dungeon = {
    monsterFor, buildEnemies, monsterName, makeDoors, doorInfo, danger, goldFor, itemPrice,
    specOptions, gemOptions, rollMystery, fight, applyFight, tickPoison, useItem, fightOpts,
  };

  // ---------------- AI rivals ----------------
  function bestUpgrade(hero, items) {
    const cur = G.Hero.power(hero);
    let best = null, bestP = cur * 1.005;
    for (const it of items) {
      if (it.kind !== 'gear') continue;
      const p = G.Hero.powerWith(hero, it);
      if (p > bestP) { best = it; bestP = p; }
    }
    return best;
  }

  function take(hero, item) {
    if (item.kind === 'consumable') { hero.bag.push(item); return `took ${item.name}`; }
    const old = G.Hero.equip(hero, item);
    if (old) hero.gold += CFG().salvage[old.rarity];
    return `took ${item.name}`;
  }

  // Best upgrade, else a consumable if there's room, else gold
  function autoLoot(hero, items, room, goldInstead = true) {
    const up = bestUpgrade(hero, items);
    if (up) return take(hero, up);
    const cons = items.find(it => it.kind === 'consumable');
    if (cons && !G.Hero.bagFull(hero)) return take(hero, cons);
    if (goldInstead) { const g = CFG().gold.skipItemBase + 2 * Math.round(room / 2); hero.gold += g; return `took ${g} gold`; }
    return 'took nothing';
  }

  function autoSpec(hero, opts) { G.Hero.setSpec(hero, opts[0]); return opts[0]; }
  function autoGem(hero, opts) {
    const pref = ['pure', 'devil', 'gaia', 'vulture', 'phoenix', 'stone'];
    const pick = pref.find(g => opts.includes(g)) || opts[0];
    G.Hero.setGem(hero, pick);
    return pick;
  }

  // Use bag items when it makes sense (AI, and the player when the clock runs out)
  function autoBag(hero, nextDoor) {
    const max = G.Hero.maxHp(hero);
    for (const it of hero.bag.slice()) {
      if (it.kind === 'gear') { if (G.Hero.powerWith(hero, it) > G.Hero.power(hero)) useItem(hero, it); continue; }
      const c = G.CONSUMABLES[it.cid];
      if (c.heal && max - hero.hp >= c.heal * 0.8) useItem(hero, it);
      else if (c.cure && hero.poison >= 3) useItem(hero, it);
      else if (c.buff && nextDoor && (nextDoor.type === 'elite' || nextDoor.type === 'boss')) useItem(hero, it);
    }
  }

  function chooseDoor(hero, doors, room, rng) {
    if (doors.length === 1) return doors[0];
    const hpPct = hero.hp / G.Hero.maxHp(hero);
    const hasAntidote = hero.bag.some(it => it.cid === 'antidote');
    const score = d => {
      let s;
      switch (d.type) {
        case 'fight': s = hpPct > 0.3 ? 1.2 : 0.3; break;
        case 'elite': s = hpPct > 0.8 ? 2 : hpPct > 0.6 ? 0.9 : 0.05; break;
        case 'treasure': s = 1.8; break;
        case 'rest': s = hpPct < 0.5 ? 3 : hpPct < 0.75 ? 1.3 : 0.2; break;
        case 'mystery': s = 0.9; break;
        case 'venom': s = hasAntidote ? 1.6 : hpPct > 0.7 && hero.poison === 0 ? 0.8 : 0.1; break;
        case 'purify': s = hero.poison >= 3 ? 3.5 : hero.poison > 0 ? 1.4 : 0.15; break;
        default: s = 1;
      }
      if (d.monster) {
        const dg = danger(hero, d, room);
        if (dg.level === 'Deadly') s *= 0.05; else if (dg.level === 'High') s *= 0.4;
      }
      return s + rng.range(0, 0.5);
    };
    const scored = doors.map(d => [d, score(d)]);
    return scored.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }

  // Resolve a whole door with no player input (AI rivals, or the player when time runs out)
  function resolveDoor(hero, d, room, rng) {
    const doFight = (mon, kind, lootKind) => {
      const res = fight(hero, mon, kind, room, rng);
      const out = applyFight(hero, res, room);
      const nm = monsterName(mon, kind);
      if (out === 'dead') return `fell to ${nm}`;
      if (out === 'timeout') return `fought ${nm} to a standstill`;
      hero.gold += goldFor(kind === 'fight' ? 'fight' : kind, hero, rng);
      return `beat ${nm}, ${autoLoot(hero, G.Loot.offer(hero, room, lootKind, rng), room)}`;
    };
    switch (d.type) {
      case 'armory': { const it = rng.pick(G.Loot.armory(rng)); G.Hero.equip(hero, it); return `took ${it.name}`; }
      case 'fight': case 'elite': case 'boss': return doFight(d.monster, d.type, d.type);
      case 'treasure': return `found treasure, ${autoLoot(hero, G.Loot.offer(hero, room, 'treasure', rng), room)}`;
      case 'rest': return `rested for ${G.Hero.heal(hero, CFG().restHeal)} health`;
      case 'venom': {
        hero.poison += CFG().poison.venomStacks;
        return `opened a venom cache, ${autoLoot(hero, G.Loot.offer(hero, room, 'shrine', rng), room, false)}`;
      }
      case 'purify': { const n = hero.poison; hero.poison = 0; G.Hero.heal(hero, CFG().poison.purifyHeal); return n ? `washed away ${n} poison` : 'drank from a clean spring'; }
      case 'shop': return soloShop(hero, room, rng);
      case 'mystery': {
        const ev = rollMystery(rng);
        if (ev.id === 'spring') return `drank from a spring (+${G.Hero.heal(hero, CFG().springHeal)})`;
        if (ev.id === 'cache') { const g = 2 * rng.int(10, 16); hero.gold += g; return `found ${g} gold`; }
        if (ev.id === 'shrine') {
          const max = G.Hero.maxHp(hero);
          if (hero.hp / max > 0.6 && hero.hp > CFG().shrineCost) {
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

  // Merchant spending for AI (shared shop round, or the solo shop used by tools)
  function aiMerchant(hero, room, rng) {
    const S = CFG().shop, bits = [];
    const max = G.Hero.maxHp(hero);
    if (hero.gold >= S.potionCost && max - hero.hp >= 40 && hero.gem !== 'gaia') {
      hero.gold -= S.potionCost; G.Hero.heal(hero, G.CONSUMABLES.potion.heal); bits.push('a potion');
    }
    if (hero.poison >= 2 && hero.gold >= G.CONSUMABLES.antidote.price) {
      hero.gold -= G.CONSUMABLES.antidote.price; hero.poison = 0; bits.push('an antidote');
    }
    const stock = G.Loot.offer(hero, room, 'shop', rng, S.gearCount).filter(it => itemPrice(it) <= hero.gold);
    const up = bestUpgrade(hero, stock);
    if (up) { hero.gold -= itemPrice(up); take(hero, up); bits.push(up.name); }
    return bits.length ? 'bought ' + bits.join(', ') : 'browsed the merchant';
  }

  // Shop room without other players (balance tool / fast-forward after the player dies)
  function soloShop(hero, room, rng) {
    const table = G.Loot.shopTable(room, 4, rng);
    const free = autoLoot(hero, table.slice(rng.int(0, 2)), room, false);
    return `${free} at the shop, ${aiMerchant(hero, room, rng)}`;
  }

  function aiRoom(hero, room) {
    const rng = hero.rng;
    if (!hero.alive) return;
    tickPoison(hero, room);
    if (!hero.alive) { hero.lastText = 'succumbed to poison'; return; }
    const doors = makeDoors(hero, room, rng);
    const d = chooseDoor(hero, doors, room, rng);
    autoBag(hero, d);
    hero.lastAction = doorInfo(d).title;
    hero.lastText = resolveDoor(hero, d, room, rng);
    if (hero.alive && room === CFG().specRoom && !hero.spec) autoSpec(hero, specOptions(hero, rng));
    if (hero.alive && room === CFG().gemRoom && !hero.gem) autoGem(hero, gemOptions(hero, rng));
  }

  G.AI = { aiRoom, bestUpgrade, autoLoot, autoSpec, autoGem, autoBag, resolveDoor, chooseDoor, aiMerchant, take };
})(window.G);
