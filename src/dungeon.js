// Rooms, doors, monsters, rewards, XP, hearts, and the AI that plays the rival heroes.
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
  // Trait stats grow with depth: about a third early, full strength by the last rooms
  const traitScale = room => Math.min(1, 0.3 + room / 40);
  function applyTrait(s, trait, room) {
    const T = trait && G.ELITE_TRAITS[trait];
    if (!T) return s;
    for (const k in T.stats || {}) s[k] = (s[k] || 0) + 2 * Math.round(T.stats[k] * traitScale(room || 30) / 2);
    if (T.thorns) s.fx = { ...s.fx, thorns: T.thorns };
    if (T.shieldBreak) s.fx = { ...s.fx, shieldBreak: true };
    return s;
  }

  function splitSpec(sp, base, room, mult) {
    if (!sp) return null;
    return {
      count: sp.count, name: sp.next ? 'Slime' : 'Slimeling', sprite: 'monster_' + base.id, scale: sp.scale,
      s: statBlock({ ...base, hp: sp.hp, hit: sp.hit }, room, mult),
      next: splitSpec(sp.next, base, room, mult),
    };
  }

  // Enemy specs for one fight door. trait = elite/boss trait; harder = Wager multiplier.
  function buildEnemies(mon, room, kind, trait, harder) {
    const M = CFG().monster;
    let mult = kind === 'elite' ? M.elite : kind === 'boss' ? M.boss : { hp: 1, hit: 1 };
    if (harder) mult = { hp: mult.hp * harder, hit: mult.hit * harder };
    const count = (mon.pack || 1) + (kind === 'elite' && mon.pack ? M.elite.packExtra : 0);
    const tr = trait || mon.trait || null;
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        s: applyTrait(statBlock(mon, room, mult), tr, room), name: prefix(mon, kind) + (mon.memberName || mon.name),
        sprite: 'monster_' + mon.id, scale: (mon.scale || 1) * (kind === 'elite' ? 1.12 : 1),
        tint: kind === 'elite' ? 0xffb8a8 : null,
        steal: mon.steal || 0, escapeAfter: mon.escapeAfter || 0,
        split: splitSpec(mon.split, mon, room, mult), boss: kind === 'boss',
      });
    }
    if (tr === 'swarm') {
      const W = M.swarmCopy;
      for (let i = 0; i < G.ELITE_TRAITS.swarm.extra; i++) {
        out.push({ s: statBlock(mon, room, { hp: mult.hp * W.hp, hit: mult.hit * W.hit }), name: 'Swarmling',
          sprite: 'monster_' + mon.id, scale: (mon.scale || 1) * 0.75, tint: 0xffb8a8 });
      }
    }
    return out;
  }

  // "Elite " in front for elite doors, unless the monster is already an elite kind (Elite Slime)
  const prefix = (mon, kind) => (kind === 'elite' && !/^Elite /.test(mon.name) ? 'Elite ' : '');
  function monsterName(mon, kind, trait) {
    const n = prefix(mon, kind) + mon.name;
    const c = (mon.pack || 1) + (kind === 'elite' && mon.pack ? CFG().monster.elite.packExtra : 0);
    const T = trait && G.ELITE_TRAITS[trait];
    return (T ? T.name + ' ' : '') + (c > 1 ? `${n} ×${c}` : n);
  }

  const DOOR_INFO = {
    armory:   { title: 'The Armory', text: () => 'Every warrior starts here. Pick one of three weapons.' },
    fight:    { title: 'Fight',    text: d => `${monsterName(d.monster, 'fight')}. XP and gold; gear 1 fight in 3.` },
    elite:    { title: 'Elite',    text: d => `${monsterName(d.monster, 'elite', d.trait)}. ${G.ELITE_TRAITS[d.trait].desc} Always drops gear.` },
    boss:     { title: 'Boss',     text: d => `${d.monster.name} (${G.ELITE_TRAITS[d.monster.trait].name}). ${G.ELITE_TRAITS[d.monster.trait].desc} Guaranteed rare item.` },
    trash:    { title: 'Trash Pile', text: () => 'No fight. A little gold and some junk. Maybe something useful.' },
    vault:    { title: 'Treasure Vault', text: () => 'No fight. Pick 1 of 3 items, one of them rare.' },
    rest:     { title: 'Campfire', text: () => `Recover ${CFG().restHeal} health. Does not clear poison.` },
    mystery:  { title: 'Unknown',  text: () => 'Could be a gift, could be a fight.' },
    venom:    { title: 'Venom Cache', text: () => `Take an uncommon or better item, but gain ${CFG().poison.venomStacks} poison.` },
    purify:   { title: 'Purifying Spring', text: () => `Clears all poison and heals ${CFG().poison.purifyHeal}.` },
    shop:     { title: 'Plunder', text: () => 'A shared pile of loot. Free picks for everyone, weakest first.' },
    merchant: { title: 'Merchant', text: () => 'No fight. Spend gold on gear and potions, or sell blood.' },
    forge:    { title: 'Forge',    text: () => `No fight. Strengthen an item (${CFG().forge.upgradeCost} gold) or add a random affix to one (${CFG().forge.affixCost} gold).` },
    trainer:  { title: 'Trainer',  text: () => `No fight. Gain ${CFG().xp.trainer} XP.` },
    wager:    { title: 'Wager',    text: d => `${monsterName(d.monster, 'fight')}, tougher than usual. No backing out: bet gold, and win to double it.` },
  };

  // What kind of room this is in the repeating 10-room pattern
  function roomKind(room) {
    const C = CFG();
    if (room === 1) return 'armory';
    if (room >= C.tournamentRoom) return 'tournament';
    if (C.duelRooms.includes(room)) return 'duel';
    if (C.shopRooms.includes(room)) return 'shop';
    if (C.merchantRooms.includes(room)) return 'merchant';
    if (C.bossRooms[room]) return 'boss';
    return 'doors';
  }

  function makeDoors(hero, room, rng) {
    if (room === 1) return [{ type: 'armory' }];
    const kind = roomKind(room);
    if (kind === 'shop') return [{ type: 'shop' }];
    if (kind === 'merchant') return [{ type: 'merchant' }];
    if (kind === 'boss') return [{ type: 'boss', monster: monsterFor(room, 'boss', rng) }];
    const w = t => (t === 'purify' && hero.poison > 0 ? CFG().purifyWeightPoisoned : CFG().doorWeights[t]);
    const types = Object.keys(CFG().doorWeights).filter(t => room >= CFG().doorMinRoom[t]);
    const first = rng.weighted(types.map(t => [t, w(t)]));
    const rest = types.filter(t => t !== first);
    const second = rest.length ? rng.weighted(rest.map(t => [t, w(t)])) : first;
    const doors = [first, second].map(type => {
      const d = { type };
      if (type === 'fight' || type === 'elite' || type === 'wager') d.monster = monsterFor(room, type === 'elite' ? 'elite' : 'fight', rng);
      if (type === 'elite') d.trait = rng.pick(G.ELITE_TRAIT_ORDER);
      return d;
    });
    for (let i = 0; i < 6 && doors[1].monster && doors[0].monster && doors[0].monster.id === doors[1].monster.id; i++) {
      doors[1].monster = monsterFor(room, 'fight', rng);
    }
    return doors;
  }

  function doorInfo(d) { const i = DOOR_INFO[d.type]; return { title: i.title, text: i.text(d) }; }

  function fightOpts(hero, seed) {
    return { seed, aHp: hero.hp, aName: hero.isPlayer ? 'You' : hero.name };
  }
  function doorFoes(door, room) {
    const kind = door.type === 'wager' ? 'fight' : door.type;
    return buildEnemies(door.monster, room, kind, door.trait, door.type === 'wager' ? CFG().wager.monsterMult : null);
  }

  function danger(hero, door, room) {
    if (!door.monster) return null;
    const ps = G.Stats.compute(hero, { buffs: true });
    const foes = doorFoes(door, room);
    let lost = 0, deaths = 0;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const r = G.simulateFight(ps, foes, fightOpts(hero, 1000 + i * 7919 + room));
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

  // ---------- Fights and rewards ----------
  function fight(hero, door, room, rng) {
    return G.simulateFight(G.Stats.compute(hero, { buffs: true }), doorFoes(door, room), fightOpts(hero, rng.int(0, 1e9)));
  }
  // Applies the result. Returns 'won' | 'timeout' | 'heart' (lost a heart, back at full) | 'dead' (out of hearts)
  function applyFight(hero, res, room) {
    hero.buffs = {};
    if (res.goldStolen) hero.gold = Math.max(0, hero.gold - res.goldStolen);
    if (res.winner === 'b') return G.Hero.loseHeart(hero, room) ? 'heart' : 'dead';
    hero.hp = Math.max(1, res.aHp);
    return res.timeout ? 'timeout' : 'won';
  }

  // Does this fight give gear? Normal fights 1 in 3 (1 in 2 with Lucky Find); elites and bosses always.
  function gearDrops(hero, kind, rng) {
    if (kind === 'elite' || kind === 'boss') return true;
    const lucky = G.Stats.treeFx(hero).fx.luckyGear;
    return rng.int(1, 100) <= (lucky ? CFG().gearChance.lucky : CFG().gearChance.fight);
  }

  // Spoils: a small choice on fights with no gear
  function spoilsOptions(hero, room, rng) {
    const S = CFG().spoils;
    const gold = S.gold + 2 * Math.round(room / 2);
    const all = [
      { id: 'gold', title: 'Gold pouch', text: `+${gold} gold`, gold },
      { id: 'xp', title: 'Lessons learned', text: `+${CFG().xp.spoils} XP`, xp: CFG().xp.spoils },
      { id: 'cons', title: 'Supplies', text: 'A random bag item', item: G.Items.rollConsumable(room, rng) },
      { id: 'dmg', title: 'Whetstone', text: `+${S.statDmg} Damage, permanently`, stat: { dmg: S.statDmg } },
      { id: 'hp', title: 'Hearty meal', text: `+${S.statHp} max Health, permanently`, stat: { hp: S.statHp } },
    ];
    const n = G.Stats.treeFx(hero).fx.spoils4 ? 4 : 3;
    return pickN(all, n, rng);
  }
  function takeSpoils(hero, opt) {
    if (opt.gold) { hero.gold += opt.gold; return `took ${opt.gold} gold`; }
    if (opt.xp) { G.Hero.gainXp(hero, opt.xp); return `gained ${opt.xp} XP`; }
    if (opt.item) {
      if (!G.Hero.receive(hero, opt.item)) { hero.gold += 10; return 'took 10 gold (bag full)'; }
      return `took ${opt.item.name}`;
    }
    if (opt.stat) {
      hero.bonus = hero.bonus || {};
      for (const k in opt.stat) hero.bonus[k] = (hero.bonus[k] || 0) + opt.stat[k];
      return `took the ${opt.title.toLowerCase()}`;
    }
    return '';
  }

  // Poison ticks at the start of every room. Dying to it costs a heart.
  function tickPoison(hero, room) {
    if (!hero.alive || hero.poison <= 0) return 0;
    const dmg = hero.poison;
    hero.hp -= dmg;
    if (hero.hp <= 0) { hero.hp = 0; G.Hero.loseHeart(hero, room); }
    return dmg;
  }

  // Bag item use (shared by player and AI). Returns a short message.
  function useItem(hero, item) {
    const i = hero.bag.indexOf(item);
    if (i < 0) return '';
    if (item.kind === 'gear') {
      hero.bag.splice(i, 1);
      const old = G.Hero.equip(hero, item);   // what you wore is gone for good
      return `Equipped ${item.name}${old ? `, replacing ${old.name}` : ''}.`;
    }
    const c = G.CONSUMABLES[item.cid];
    hero.bag.splice(i, 1);
    if (c.heal) return `${c.name}: +${G.Hero.heal(hero, c.heal)} health.`;
    if (c.cure) { const n = hero.poison; hero.poison = 0; return `${c.name}: cleared ${n} poison.`; }
    if (c.buff) { for (const k in c.buff) hero.buffs[k] = (hero.buffs[k] || 0) + c.buff[k]; return `${c.name}: active for your next fight.`; }
    return '';
  }

  // ---------- Merchant ----------
  function merchantStock(hero, room, rng) {
    const ids = G.BUFF_IDS.slice(), buffs = [];
    while (buffs.length < 3 && ids.length) buffs.push(ids.splice(rng.int(0, ids.length - 1), 1)[0]);
    // Every potion and elixir has its own stock of 1 to 3 per visit
    const P = CFG().shop.stock, cstock = {};
    for (const id of ['potion', 'antidote', ...buffs]) cstock[id] = rng.int(P[0], P[1]);
    return { stock: G.Loot.offer(hero, room, 'shop', rng, CFG().shop.gearCount).filter(it => it.kind === 'gear'), buffs, cstock,
      restocks: 0, bought: [], msg: null, freeUsed: false };
  }
  // Price for this hero at this visit (Haggler: first gear purchase is free)
  function merchantPrice(hero, m, item) {
    if (item.kind === 'gear' && G.Stats.treeFx(hero).fx.freeMerchant && !m.freeUsed) return 0;
    return itemPrice(item);
  }

  // ---------- Forge ----------
  // Strengthen: base stats grow by one tier step (not on legendaries: their stats are fixed).
  // Add an affix: one random bonus stat, once per piece.
  function strengthenGains(item) {
    const out = {};
    if (item.rarity === 'legendary') return out;
    for (const k in item.base) {
      if (k === 'spd' && item.slot === 'weapon') continue;
      const growth = G.STAT_INFO[k].growth;
      if (growth === 'fixed') continue;
      const g = growth === 'flat' ? CFG().loot.tierGrowth : CFG().loot.chanceTierGrowth;
      out[k] = Math.max(2, 2 * Math.round(item.base[k] * g / 2));
    }
    return out;
  }
  function forgeStrengthen(item) {
    const add = strengthenGains(item);
    for (const k in add) { item.base[k] += add[k]; item.stats[k] = (item.stats[k] || 0) + add[k]; }
    item.forged = (item.forged || 0) + 1;
    item.name = item.name.replace(/ \+\d+$/, '') + ' +' + item.forged;
  }
  function forgeAffix(item, rng) {
    if (item.affixed) return null;
    return G.Items.addAffix(item, rng);
  }

  G.Dungeon = {
    monsterFor, buildEnemies, monsterName, makeDoors, doorInfo, danger, goldFor, itemPrice, doorFoes,
    specOptions, gemOptions, rollMystery, fight, applyFight, tickPoison, useItem, fightOpts, roomKind, merchantStock, merchantPrice,
    gearDrops, spoilsOptions, takeSpoils, forgeStrengthen, forgeAffix, strengthenGains,
  };

  // ---------------- AI rivals ----------------
  function bestUpgrade(hero, items) {
    const cur = G.Hero.power(hero);
    let best = null, bestP = cur * 1.005;
    for (const it of items) {
      if (it.kind !== 'gear' && it.kind !== 'relic') continue;
      const p = G.Hero.powerWith(hero, it);
      if (p > bestP) { best = it; bestP = p; }
    }
    return best;
  }

  function take(hero, item) {
    if (item.kind === 'consumable') { hero.bag.push(item); return `took ${item.name}`; }
    if (item.kind === 'relic') { G.Hero.addRelic(hero, item); return `took the ${item.name} relic`; }
    G.Hero.equip(hero, item);
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
  function autoSpoils(hero, opts) {
    const pref = ['dmg', 'hp', 'xp', 'gold', 'cons'];
    const pick = pref.map(id => opts.find(o => o.id === id)).find(Boolean) || opts[0];
    return takeSpoils(hero, pick);
  }

  function autoSpec(hero, opts) { G.Hero.setSpec(hero, opts[0]); return opts[0]; }
  function autoTree(hero, lv) {
    const opts = G.Stats.treeOptions(hero.spec, lv);
    let best = opts[0], bp = -1;
    for (const o of opts) { hero.treePicks[lv] = o.id; const p = G.Hero.power(hero); if (p > bp) { bp = p; best = o; } }
    delete hero.treePicks[lv];
    G.Hero.pickTree(hero, lv, best.id);
    return best;
  }
  // Make every pick a level-up owes (spec at 5, tree picks after)
  function autoPicks(hero, rng) {
    let p;
    while ((p = G.Hero.pendingPick(hero))) {
      if (p.kind === 'spec') autoSpec(hero, specOptions(hero, rng));
      else autoTree(hero, p.level);
    }
  }
  function autoGem(hero, opts) {
    const pref = ['pure', 'gaia', 'devil', 'phoenix', 'vulture', 'stone'];
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
        case 'fight': s = hpPct > 0.3 ? 1.3 : 0.4; break;
        case 'elite': s = hpPct > 0.8 ? 2 : hpPct > 0.6 ? 0.9 : 0.05; break;
        case 'wager': s = hpPct > 0.75 && hero.gold >= CFG().wager.bets[0] ? 1.4 : 0.1; break;
        case 'trash': s = 0.8; break;
        case 'vault': s = 2.6; break;
        case 'rest': s = hpPct < 0.5 ? 3 : hpPct < 0.75 ? 1.3 : 0.2; break;
        case 'mystery': s = 0.9; break;
        case 'venom': s = hasAntidote ? 1.6 : hpPct > 0.7 && hero.poison === 0 ? 0.8 : 0.1; break;
        case 'purify': s = hero.poison >= 3 ? 3.5 : hero.poison > 0 ? 1.4 : 0.15; break;
        case 'merchant': s = hero.gold >= 60 ? 1.7 : hero.gold >= 35 ? 1.0 : 0.2; break;
        case 'forge': s = hero.gold >= CFG().forge.upgradeCost ? 1.3 : 0.2; break;
        case 'trainer': s = 1.2; break;
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

  // Rewards after a won fight (XP and gold always; then gear or spoils). AI, and the player when time runs out.
  function autoReward(hero, kind, room, rng) {
    const k = kind === 'wager' ? 'fight' : kind;
    G.Hero.gainXp(hero, CFG().xp[k] || CFG().xp.fight);
    hero.gold += goldFor(k, hero, rng);
    if (gearDrops(hero, k, rng)) return autoLoot(hero, G.Loot.offer(hero, room, k, rng), room);
    return autoSpoils(hero, spoilsOptions(hero, room, rng));
  }

  function wagerBet(hero) {
    const B = CFG().wager.bets;
    return hero.gold >= B[1] ? B[1] : hero.gold >= B[0] ? B[0] : 0;
  }

  // Resolve a whole door with no player input (AI rivals, or the player when time runs out)
  function resolveDoor(hero, d, room, rng) {
    const doFight = (door, kind) => {
      const bet = kind === 'wager' ? wagerBet(hero) : 0;
      const res = fight(hero, door, room, rng);
      const out = applyFight(hero, res, room);
      const nm = monsterName(door.monster, kind === 'wager' ? 'fight' : kind, door.trait);
      if (out === 'dead') { hero.gold = Math.max(0, hero.gold - bet); return `fell to ${nm} and is out`; }
      if (out === 'heart') { hero.gold = Math.max(0, hero.gold - bet); return `lost a heart to ${nm}`; }
      if (out === 'timeout') {
        // Out of time: half the gold and XP, no items
        hero.gold = Math.max(0, hero.gold - bet);
        const k = kind === 'wager' ? 'fight' : kind;
        G.Hero.gainXp(hero, Math.round((CFG().xp[k] || CFG().xp.fight) / 2));
        hero.gold += 2 * Math.round(goldFor(k, hero, rng) / 4);
        return `ran out of time against ${nm}`;
      }
      if (bet) hero.gold += bet;
      return `beat ${nm}, ${autoReward(hero, kind, room, rng)}`;
    };
    switch (d.type) {
      case 'armory': { const it = rng.pick(G.Loot.armory(rng)); G.Hero.equip(hero, it); return `took ${it.name}`; }
      case 'fight': case 'elite': case 'boss': case 'wager': return doFight(d, d.type);
      case 'trash': { hero.gold += goldFor('trash', hero, rng); return `dug through trash, ${autoLoot(hero, G.Loot.offer(hero, room, 'trash', rng), room, false)}`; }
      case 'vault': return `found a vault, ${autoLoot(hero, G.Loot.offer(hero, room, 'vault', rng), room)}`;
      case 'rest': return `rested for ${G.Hero.heal(hero, CFG().restHeal)} health`;
      case 'trainer': G.Hero.gainXp(hero, CFG().xp.trainer); return `trained (+${CFG().xp.trainer} XP)`;
      case 'forge': {
        const F = CFG().forge;
        const it = ['weapon', ...G.SLOTS].map(sl => hero.gear[sl]).find(x => x && x.rarity !== 'legendary');
        if (hero.gold < F.upgradeCost || !it) return 'looked at the forge';
        hero.gold -= F.upgradeCost; forgeStrengthen(it);
        let txt = `strengthened ${it.name}`;
        const af = G.SLOTS.map(sl => hero.gear[sl]).find(x => x && !x.affixed);
        if (af && hero.gold >= F.affixCost + 20) { hero.gold -= F.affixCost; forgeAffix(af, rng); txt += ` and forged a bonus onto ${af.name}`; }
        return txt;
      }
      case 'venom': {
        hero.poison += CFG().poison.venomStacks;
        return `opened a venom cache, ${autoLoot(hero, G.Loot.offer(hero, room, 'shrine', rng), room, false)}`;
      }
      case 'purify': { const n = hero.poison; hero.poison = 0; G.Hero.heal(hero, CFG().poison.purifyHeal); return n ? `washed away ${n} poison` : 'drank from a clean spring'; }
      case 'shop': return soloShop(hero, room, rng);
      case 'merchant': return 'visited a merchant, ' + aiMerchant(hero, room, rng);
      case 'mystery': {
        const ev = rollMystery(rng);
        if (ev.id === 'spring') return `drank from a spring (+${G.Hero.heal(hero, CFG().springHeal)})`;
        if (ev.id === 'cache') { const g = 2 * rng.int(10, 16); hero.gold += g; return `found ${g} gold`; }
        if (ev.id === 'shrine') {
          const max = G.Hero.maxHp(hero);
          const cost = hero.gem === 'stone' ? 1 : CFG().shrineCost;
          if (hero.hp / max > 0.6 && hero.hp > cost) {
            hero.hp -= cost;
            return `bled at a shrine, ${autoLoot(hero, G.Loot.offer(hero, room, 'shrine', rng), room, false)}`;
          }
          return 'walked past a shrine';
        }
        return 'was ambushed: ' + doFight({ type: 'fight', monster: monsterFor(room, 'fight', rng) }, 'fight');
      }
    }
    return '';
  }

  // Merchant door spending for AI
  function aiMerchant(hero, room, rng) {
    const S = CFG().shop, bits = [];
    const max = G.Hero.maxHp(hero);
    const m = merchantStock(hero, room, rng);
    if (hero.gold >= S.potionCost && max - hero.hp >= 30 && hero.gem !== 'gaia') {
      hero.gold -= S.potionCost; G.Hero.heal(hero, G.CONSUMABLES.potion.heal); bits.push('a potion');
    }
    if (hero.poison >= 2 && hero.gold >= G.CONSUMABLES.antidote.price) {
      hero.gold -= G.CONSUMABLES.antidote.price; hero.poison = 0; bits.push('an antidote');
    }
    const stock = m.stock.filter(it => merchantPrice(hero, m, it) <= hero.gold);
    const up = bestUpgrade(hero, stock);
    if (up) { hero.gold -= merchantPrice(hero, m, up); m.freeUsed = true; take(hero, up); bits.push(up.name); }
    return bits.length ? 'bought ' + bits.join(', ') : 'browsed the merchant';
  }

  // Shop round without other players (balance tool / fast-forward after the player is out)
  function soloShop(hero, room, rng) {
    const table = G.Loot.shopTable(room, 4, rng);
    let free = autoLoot(hero, table.slice(rng.int(0, 2)), room, false);
    if (free === 'took nothing') { hero.gold += CFG().shop.passGold; free = `passed for ${CFG().shop.passGold} gold`; }
    return `${free} at the Plunder`;
  }

  function aiRoom(hero, room) {
    const rng = hero.rng;
    if (!hero.alive) return;
    if (roomKind(room) === 'duel' || roomKind(room) === 'tournament') return;   // duels are run for everyone at once
    const hearts = hero.hearts;
    tickPoison(hero, room);
    if (!hero.alive) { hero.lastText = 'succumbed to poison and is out'; return; }
    if (hero.hearts < hearts) { hero.lastText = 'lost a heart to poison'; return; }
    const doors = makeDoors(hero, room, rng);
    const d = chooseDoor(hero, doors, room, rng);
    autoBag(hero, d);
    hero.lastAction = doorInfo(d).title;
    hero.lastText = resolveDoor(hero, d, room, rng);
    if (hero.alive) autoPicks(hero, rng);
    if (hero.alive && room === CFG().gemRoom && !hero.gem) autoGem(hero, gemOptions(hero, rng));
  }

  G.AI = { aiRoom, bestUpgrade, autoLoot, autoSpec, autoTree, autoPicks, autoGem, autoBag, autoSpoils, autoReward, resolveDoor, chooseDoor, aiMerchant, take, wagerBet };
})(window.G);
