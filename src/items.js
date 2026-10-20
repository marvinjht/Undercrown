// Item generation, formatting, the shared set supply, and loot drops (rarity cadence + bad-luck protection).
// All item stats are even whole numbers with no random wobble: same tier + rarity = same numbers.
window.G = window.G || {};

(function (G) {
  const L = () => G.CONFIG.loot;

  const even = x => Math.max(2, 2 * Math.round(x / 2));
  function tierFor(room) { return 1 + Math.floor((room - 1) / L().roomsPerTier); }

  function value(k, base, R, tier) {
    const growth = G.STAT_INFO[k].growth;
    if (growth === 'fixed') return base;
    const g = growth === 'flat' ? L().tierGrowth : L().chanceTierGrowth;
    return even(base * R.mult * (1 + (tier - 1) * g));
  }

  // ---------- Shared set supply ----------
  // Each match has CONFIG.supplyPerClass pieces of every class. A piece is "taken" while a player who still
  // has hearts wears it or carries it in their bag. Replacing or discarding it frees it.
  const Supply = {
    heroes: [],
    reset(heroes) { this.heroes = heroes || []; },
    held(cls, onlyHero) {
      let n = 0;
      for (const h of this.heroes) {
        if (onlyHero && h !== onlyHero) continue;
        if (!h.alive) continue;
        // Legendaries sit on top of the supply: they never use up one of the 12 pieces
        for (const slot of G.SLOTS) { const it = h.gear[slot]; if (it && it.set === cls && it.rarity !== 'legendary') n++; }
        for (const it of h.bag) if (it.kind === 'gear' && it.set === cls && it.rarity !== 'legendary') n++;
      }
      return n;
    },
    left(cls) { return this.heroes.length ? Math.max(0, G.CONFIG.supplyPerClass - this.held(cls)) : G.CONFIG.supplyPerClass; },
    counts() { const o = {}; for (const c of G.CLASS_ORDER) o[c] = this.left(c); return o; },
    // Legendaries of a class someone holds (shown on top of the supply)
    legendaries(cls, onlyHero) {
      let n = 0;
      for (const h of this.heroes) {
        if ((onlyHero && h !== onlyHero) || !h.alive) continue;
        for (const it of [...G.SLOTS.map(sl => h.gear[sl]), ...h.bag]) if (it && it.rarity === 'legendary' && it.set === cls) n++;
      }
      return n;
    },
    // Each legendary exists once per match: held by anyone still in = gone from the pool
    legendTaken() {
      const out = new Set();
      for (const h of this.heroes) {
        if (!h.alive) continue;
        for (const it of [...G.SLOTS.map(sl => h.gear[sl]), ...h.bag]) if (it && it.legendary) out.add(it.legendary);
      }
      return out;
    },
  };

  // Class tag for a tagged item. Weighted by how many pieces of each class are left in the match; often leans
  // toward a class you already wear. allowed = the classes this item can roll (weapons have their own list).
  function rollSet(hero, rng, allowed) {
    const base = allowed && allowed.length ? allowed : G.CLASS_ORDER;
    const pool = base.filter(c => Supply.left(c) > 0);
    if (!pool.length) return null;
    const counts = hero ? G.Stats.sets(hero).counts : {};
    const lean = hero && (rng.int(1, 100) <= L().setMatchChance || G.Stats.treeFx(hero).fx.collector);
    if (lean) {
      const mine = pool.filter(c => counts[c]);
      if (mine.length) return rng.weighted(mine.map(c => [c, (counts[c] || 0) * Supply.left(c)]));
    }
    return rng.weighted(pool.map(c => [c, Supply.left(c)]));
  }

  function generate(rng, { slot, rarity, room, weaponType, hero, set, forceTag }) {
    const R = G.RARITY[rarity];
    const tier = tierFor(room);
    const base = {};
    let name, iconKey, trait = null;

    if (slot === 'weapon') {
      const W = G.WEAPONS[weaponType];
      base.dmg = value('dmg', W.dmg, R, tier);
      base.spd = W.spd;
      for (const k in W.bonus) base[k] = value(k, W.bonus[k], R, tier);
      name = W.bases[R.rank];
      iconKey = weaponType;
      trait = W.trait;
    } else {
      const A = G.ARMOR[slot];
      for (const k in A.primary) base[k] = value(k, A.primary[k], R, tier);
      name = A.bases[R.rank];
      iconKey = slot;
    }

    // Class tag: never on common items; some uncommon and rare items carry one
    let itemSet = null;
    if (rarity !== 'grey') {
      const allowed = slot === 'weapon' ? G.WEAPONS[weaponType].classes : null;
      const thBonus = hero && hero.spec === 'treasureHunter' ? L().treasureHunterTag : 0;
      const tagged = set || forceTag || rng.int(1, 100) <= (L().tagChance[rarity] || 0) + thBonus;
      if (tagged) itemSet = set && (!allowed || allowed.includes(set)) && Supply.left(set) > 0 ? set : rollSet(hero, rng, allowed);
    }

    const stats = { ...base };
    const affixes = [], affixStats = {};
    let tradeoff = null;
    let nAffix = R.affixes;

    if ((rarity === 'green' || rarity === 'rare') && rng.int(1, 100) <= L().tradeoffChance) {
      // Trade-off: a bigger bonus with a cost
      const id = rng.pick(Object.keys(G.TRADEOFFS));
      const T = G.TRADEOFFS[id], give = {}, cost = {};
      for (const k in T.give) { give[k] = value(k, T.give[k], R, tier); stats[k] = (stats[k] || 0) + give[k]; }
      for (const k in T.cost) { cost[k] = value(k, T.cost[k], R, tier); stats[k] = (stats[k] || 0) - cost[k]; }
      tradeoff = { id, give, cost };
      name = T.name + ' ' + name;
      nAffix -= 1;   // a rare with a trade-off keeps one plain affix
    }
    if (nAffix > 0) {
      const pool = Object.keys(G.AFFIXES).filter(k => !(G.AFFIXES[k].rareOnly && rarity !== 'rare') && !(G.AFFIXES[k].weaponOnly && slot !== 'weapon'));
      for (let i = 0; i < nAffix && pool.length; i++) {
        const k = pool.splice(Math.floor(rng.float() * pool.length), 1)[0];
        affixes.push(k);
        const v = value(k, G.AFFIXES[k].base, R, tier);
        affixStats[k] = v;
        stats[k] = (stats[k] || 0) + v;
      }
      if (affixes.length && !tradeoff) name += ' ' + G.AFFIXES[affixes[0]].suffix;
    }

    return { id: G.uid('item'), kind: 'gear', slot, rarity, room, tier, weaponType: weaponType || null, set: itemSet,
      name, base, stats, affixStats, affixes, tradeoff, trait, iconKey };
  }

  // A legendary: fixed stats, its own name, the class tag it was made for
  function legendary(id) {
    const D = G.LEGENDARIES[id];
    const W = D.weaponType ? G.WEAPONS[D.weaponType] : null;
    // Fixed numbers. A legendary weapon's hitting power is set to a late-dungeon rare's (same for everyone, every match).
    const st = { ...D.stats };
    if (W) for (const k of ['dmg', 'spellDmg', 'holy', 'bleed']) if (st[k]) st[k] = value(k, st[k], G.RARITY.rare, G.CONFIG.legendary.tier);
    return { id: G.uid('item'), kind: 'gear', slot: D.slot, rarity: 'legendary', legendary: id, room: 0, tier: G.CONFIG.legendary.tier,
      weaponType: D.weaponType || null, set: D.cls, name: D.name, base: { ...st }, stats: { ...st },
      affixStats: {}, affixes: [], tradeoff: null, trait: D.desc, baseTrait: W ? W.trait : null, iconKey: D.weaponType || D.slot };
  }
  function rollLegendary(rng) {
    const taken = Supply.legendTaken();
    const pool = G.LEGENDARY_ORDER.filter(id => !taken.has(id));
    return pool.length ? legendary(rng.pick(pool)) : null;
  }

  // Relics: collected, never equipped. A relic you already hold at the max can't roll for you.
  function relic(rid) { const R = G.RELICS[rid]; return { id: G.uid('item'), kind: 'relic', rid, name: R.name, rarity: 'relic', iconKey: 'relic_' + rid }; }
  function rollRelic(hero, rng) {
    const pool = G.RELIC_ORDER.filter(r => !hero || ((hero.relics || {})[r] || 0) < G.RELIC_MAX);
    return pool.length ? relic(rng.pick(pool)) : null;
  }
  // Forge: add one random affix to a piece (once per piece)
  function addAffix(item, rng) {
    const R = G.RARITY[item.rarity] || G.RARITY.rare;
    const pool = Object.keys(G.AFFIXES).filter(k => !(item.affixes || []).includes(k) && !(G.AFFIXES[k].weaponOnly && item.slot !== 'weapon'));
    const k = rng.pick(pool);
    const v = value(k, G.AFFIXES[k].base, R, Math.max(1, item.tier || tierFor(20)));
    item.affixes = [...(item.affixes || []), k];
    item.affixStats = { ...(item.affixStats || {}), [k]: v };
    item.stats[k] = (item.stats[k] || 0) + v;
    item.affixed = true;   // the forge adds an affix once per piece
    return { k, v };
  }

  function fmtStat(k, v, isWeapon) {
    const label = G.STAT_INFO[k].label;
    if (v < 0) return `−${-v} ${label}`;
    if (isWeapon && (k === 'dmg' || k === 'spd' || k === 'manaGain' || k === 'spellDmg' || k === 'startMana')) return `${v} ${label}`;
    return `+${v} ${label}`;
  }

  // Base stats first, then bonus stats, trade-offs and build effects each on their own line
  function statLines(item) {
    const isW = item.slot === 'weapon';
    const base = item.base || (() => {   // older items without a stored base
      const b = { ...item.stats };
      for (const k in item.affixStats || {}) b[k] -= item.affixStats[k];
      return b;
    })();
    const out = G.STAT_ORDER.filter(k => base[k] > 0).map(k => ({ k, v: base[k], text: fmtStat(k, base[k], isW), affix: false }));
    for (const k of item.affixes || []) {
      const v = (item.affixStats || {})[k];
      if (v) out.push({ k, v, text: `+${v} ${G.STAT_INFO[k].label}`, affix: true, suffix: G.AFFIXES[k].suffix });
    }
    if (item.tradeoff) {
      const T = G.TRADEOFFS[item.tradeoff.id];
      for (const k in item.tradeoff.give) out.push({ k, v: item.tradeoff.give[k], text: `+${item.tradeoff.give[k]} ${G.STAT_INFO[k].label}`, affix: true, suffix: T.name });
      for (const k in item.tradeoff.cost) out.push({ k, v: -item.tradeoff.cost[k], text: `−${item.tradeoff.cost[k]} ${G.STAT_INFO[k].label}`, affix: true, cost: true, suffix: T.name });
    }
    return out;
  }
  function effectText(item) { return item && item.legendary ? { name: 'Legendary', desc: G.LEGENDARIES[item.legendary].desc } : null; }

  function compare(item, equipped) {
    const out = [];
    for (const k of G.STAT_ORDER) {
      const d = (item.stats[k] || 0) - (equipped ? equipped.stats[k] || 0 : 0);
      if (!d) continue;
      out.push({ k, d, text: `${d > 0 ? '+' : '−'}${Math.abs(d)} ${G.STAT_INFO[k].label}` });
    }
    return out;
  }

  // Consumables (bag items)
  function consumable(cid) {
    const c = G.CONSUMABLES[cid];
    return { id: G.uid('item'), kind: 'consumable', cid, name: c.name, rarity: 'potion', iconKey: 'potion_' + cid };
  }
  function rollConsumable(room, rng, pool) {
    const ids = (pool || Object.keys(G.CONSUMABLES)).filter(k => !G.CONSUMABLES[k].minRoom || room >= G.CONSUMABLES[k].minRoom);
    return consumable(rng.weighted(ids.map(k => [k, G.CONSUMABLES[k].weight])));
  }

  G.Items = { generate, fmtStat, statLines, effectText, compare, tierFor, consumable, rollConsumable, rollSet, legendary, rollLegendary, relic, rollRelic, addAffix };
  G.Supply = Supply;

  // ---------- Loot ----------
  // Cadence:
  //  1. Odds climb steadily with depth (mostly common early, more uncommon and rare later).
  //  2. Bad-luck protection: each miss adds weight, so long dry streaks are rare.
  //  3. Smart slots: drops go to slots where they'd actually help when possible.
  function rarityWeights(room) {
    const t = Math.min(1, Math.max(0, (room - 1) / (G.CONFIG.rooms - 1)));
    const e = L().early, l = L().late, w = {};
    for (const r of G.RARITY_ORDER) w[r] = e[r] + (l[r] - e[r]) * t;
    return w;
  }

  function rollRarity(hero, room, floor, rng) {
    const effRoom = hero.spec === 'treasureHunter' ? room + L().treasureHunterRooms : room;
    const w = rarityWeights(effRoom);
    const rareOk = effRoom >= L().rareFromRoom;
    let rare = rareOk ? w.rare + hero.pity.rare : 0, green = w.green + hero.pity.green, grey = w.grey;
    if (floor >= 1) grey = 0;
    if (floor >= 2) green = 0;
    if (floor >= 1 && !rare && !green) green = 1;
    const r = rng.weighted([['grey', grey], ['green', green], ['rare', rare]]);
    if (r === 'rare') hero.pity.rare = 0; else if (rareOk) hero.pity.rare += L().pityRareStep;
    if (r !== 'grey') hero.pity.green = 0; else hero.pity.green += L().pityGreenStep;
    return r;
  }

  function slotOrder(hero, room, rng, exclude) {
    const entries = G.SLOTS.filter(s => !exclude.includes(s)).map(slot => {
      const it = hero.gear[slot];
      let w = it ? 1 : 5;
      if (it) w += Math.min(3, Math.max(0, (room - it.room) / 4)) + (2 - G.RARITY[it.rarity].rank) * 0.5;
      if (slot === 'weapon') w *= 0.8;
      return [slot, w];
    });
    const order = [];
    while (entries.length) {
      const s = rng.weighted(entries);
      order.push(s);
      entries.splice(entries.findIndex(e => e[0] === s), 1);
    }
    return order;
  }

  function rollWeaponType(hero, rng) {
    const cur = hero.gear.weapon && hero.gear.weapon.weaponType;
    return cur && rng.chance(0.6) ? cur : rng.pick(G.WEAPON_ORDER);
  }

  // kind: fight | elite | boss | vault | trash | shrine | shop
  function offer(hero, room, kind, rng, countOverride) {
    let count = countOverride || (kind === 'elite' || kind === 'vault' ? 3 : kind === 'boss' || kind === 'trash' ? 1 : 2);
    if (!countOverride && hero.spec === 'treasureHunter' && (kind === 'fight' || kind === 'elite')) count += 1;
    const items = [], exclude = [];
    const now = G.Hero.power(hero);
    for (let i = 0; i < count; i++) {
      let floor = 0;
      if (kind === 'elite' || kind === 'shrine') floor = 1;
      if (kind === 'boss') floor = 2;
      if (kind === 'vault') floor = i === 0 ? 2 : 1;
      const rarity = kind === 'trash' ? 'grey' : rollRarity(hero, room, floor, rng);
      let pick = null;
      for (const slot of slotOrder(hero, room, rng, exclude)) {
        const it = generate(rng, { slot, rarity, room, hero, weaponType: slot === 'weapon' ? rollWeaponType(hero, rng) : null });
        if (!pick) pick = it;
        if (!hero.gear[slot] || G.Hero.powerWith(hero, it) > now * 1.02) { pick = it; break; }
      }
      exclude.push(pick.slot);
      items.push(pick);
    }
    const chance = G.CONFIG.consumableChance[kind];
    if (chance && rng.int(1, 100) <= chance) items.push(rollConsumable(room, rng));
    // Relics: elites sometimes, bosses often, the Vault always
    const rc = G.CONFIG.relicChance[kind];
    if (rc && rng.int(1, 100) <= rc) { const r = rollRelic(hero, rng); if (r) items.push(r); }
    // Legendaries: the later bosses always offer one; elites deep in the dungeon sometimes do
    const LG = G.CONFIG.legendary;
    if ((kind === 'boss' && LG.bossRooms.includes(room)) || (kind === 'elite' && room > LG.eliteFromRoom && rng.int(1, 100) <= LG.eliteChance)) {
      const lg = rollLegendary(rng); if (lg) items.push(lg);
    }
    return items;
  }

  // Shop round: the free table everyone picks from (one rare, rest uncommon+, two consumables)
  function shopTable(room, count, rng) {
    const items = [];
    const nCons = Math.min(2, Math.max(0, count - 2));
    for (let i = 0; i < count - nCons; i++) {
      const slot = rng.pick(G.SLOTS);
      const rarity = i === 0 ? 'rare' : (rng.int(1, 100) <= 25 ? 'rare' : 'green');
      items.push(generate(rng, { slot, rarity, room, weaponType: slot === 'weapon' ? rng.pick(G.WEAPON_ORDER) : null }));
    }
    for (let i = 0; i < nCons; i++) items.push(rollConsumable(Math.max(room, 15), rng, ['greater', 'antidote', ...G.BUFF_IDS]));
    items.unshift(rollRelic(null, rng));   // every Plunder has one relic
    return items;
  }

  // Room 1: three different common weapons
  function armory(rng) {
    const types = G.WEAPON_ORDER.slice(), out = [];
    while (out.length < 3) {
      const t = types.splice(Math.floor(rng.float() * types.length), 1)[0];
      if (!t) break;
      out.push(generate(rng, { slot: 'weapon', rarity: 'grey', room: 1, weaponType: t }));
    }
    return out;
  }

  G.Loot = { rarityWeights, rollRarity, offer, armory, shopTable };
})(window.G);
