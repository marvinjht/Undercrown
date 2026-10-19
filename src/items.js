// Item generation, formatting, and loot drops (rarity cadence + bad-luck protection).
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

  // Class tag for uncommon+ gear; often matches a class you already wear so sets come together.
  // allowed = the classes this item can roll (weapons are limited to the classes that fit them).
  function rollSet(hero, rng, allowed) {
    const pool = allowed && allowed.length ? allowed : G.CLASS_ORDER;
    if (pool.length === 1) return pool[0];
    if (hero && rng.int(1, 100) <= L().setMatchChance) {
      const counts = G.Stats.sets(hero).counts;
      const best = pool.filter(c => counts[c]).sort((a, b) => counts[b] - counts[a]);
      if (best.length) return rng.chance(0.75) ? best[0] : rng.pick(best);
    }
    return rng.pick(pool);
  }

  function generate(rng, { slot, rarity, room, weaponType, hero, set }) {
    const R = G.RARITY[rarity];
    const tier = tierFor(room);
    const stats = {};
    let name, iconKey, trait = null;

    if (slot === 'weapon') {
      const W = G.WEAPONS[weaponType];
      stats.dmg = value('dmg', W.dmg, R, tier);
      stats.spd = W.spd;
      for (const k in W.bonus) stats[k] = value(k, W.bonus[k], R, tier);
      name = W.bases[R.rank];
      iconKey = weaponType;
      trait = W.trait;
    } else {
      const A = G.ARMOR[slot];
      for (const k in A.primary) stats[k] = value(k, A.primary[k], R, tier);
      name = A.bases[R.rank];
      iconKey = slot;
    }
    let itemSet = null;
    if (rarity !== 'grey') {
      const allowed = slot === 'weapon' ? G.WEAPONS[weaponType].classes : null;
      itemSet = set && (!allowed || allowed.includes(set)) ? set : rollSet(hero, rng, allowed);
    }

    const pool = Object.keys(G.AFFIXES).filter(k => !(G.AFFIXES[k].goldOnly && rarity !== 'gold') && !(G.AFFIXES[k].weaponOnly && slot !== 'weapon'));
    const affixes = [], affixStats = {};
    for (let i = 0; i < R.affixes && pool.length; i++) {
      const k = pool.splice(Math.floor(rng.float() * pool.length), 1)[0];
      affixes.push(k);
      const v = value(k, G.AFFIXES[k].base, R, tier);
      affixStats[k] = v;
      stats[k] = (stats[k] || 0) + v;
    }
    if (affixes.length) name += ' ' + G.AFFIXES[affixes[0]].suffix;

    return { id: G.uid('item'), kind: 'gear', slot, rarity, room, tier, weaponType: weaponType || null, set: itemSet, name, stats, affixStats, trait, iconKey, affixes };
  }

  function fmtStat(k, v, isWeapon) {
    const label = G.STAT_INFO[k].label;
    if (isWeapon && (k === 'dmg' || k === 'spd' || k === 'manaGain' || k === 'spellDmg' || k === 'startMana')) return `${v} ${label}`;
    return `+${v} ${label}`;
  }

  // Base stats first, then each bonus stat (affix) on its own line, so you can see what the bonus adds
  function statLines(item) {
    const aff = item.affixStats || {};
    const isW = item.slot === 'weapon';
    const base = G.STAT_ORDER.filter(k => (item.stats[k] || 0) - (aff[k] || 0) > 0)
      .map(k => ({ k, v: item.stats[k] - (aff[k] || 0), text: fmtStat(k, item.stats[k] - (aff[k] || 0), isW), affix: false }));
    const bonus = (item.affixes || []).filter(k => aff[k])
      .map(k => ({ k, v: aff[k], text: `+${aff[k]} ${G.STAT_INFO[k].label}`, affix: true, suffix: G.AFFIXES[k].suffix }));
    return [...base, ...bonus];
  }

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

  G.Items = { generate, fmtStat, statLines, compare, tierFor, consumable, rollConsumable, rollSet };

  // ---------- Loot ----------
  // Cadence:
  //  1. Odds climb steadily with depth (mostly grey early, more green and gold later).
  //  2. Bad-luck protection: each miss adds weight, so long dry streaks are rare.
  //  3. Smart slots: drops go to slots where they'd actually be an upgrade when possible.
  function rarityWeights(room) {
    const t = Math.min(1, Math.max(0, (room - 1) / (G.CONFIG.rooms - 1)));
    const e = L().early, l = L().late, w = {};
    for (const r of G.RARITY_ORDER) w[r] = e[r] + (l[r] - e[r]) * t;
    return w;
  }

  function rollRarity(hero, room, floor, rng) {
    const effRoom = hero.spec === 'treasureHunter' ? room + L().treasureHunterRooms : room;
    const w = rarityWeights(effRoom);
    const goldOk = effRoom >= L().goldFromRoom;
    let gold = goldOk ? w.gold + hero.pity.gold : 0, green = w.green + hero.pity.green, grey = w.grey;
    if (floor >= 1) grey = 0;
    if (floor >= 2) green = 0;
    const r = rng.weighted([['grey', grey], ['green', green], ['gold', gold]]);
    if (r === 'gold') hero.pity.gold = 0; else if (goldOk) hero.pity.gold += L().pityGoldStep;
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

  // kind: fight | elite | boss | treasure | shrine | shop
  function offer(hero, room, kind, rng, countOverride) {
    let count = countOverride || 2;
    if (!countOverride && hero.spec === 'treasureHunter' && kind !== 'shop') count += 1;
    const items = [], exclude = [];
    const now = G.Hero.power(hero);
    for (let i = 0; i < count; i++) {
      let floor = 0;
      if (kind === 'elite' || kind === 'shrine') floor = 1;
      if (kind === 'boss') floor = i === 0 ? 2 : 1;
      const rarity = rollRarity(hero, room, floor, rng);
      let pick = null;
      for (const slot of slotOrder(hero, room, rng, exclude)) {
        const it = generate(rng, { slot, rarity, room, hero, weaponType: slot === 'weapon' ? rollWeaponType(hero, rng) : null });
        if (!pick) pick = it;                                   // fallback: first choice
        if (!hero.gear[slot] || G.Hero.powerWith(hero, it) > now * 1.02) { pick = it; break; }
      }
      exclude.push(pick.slot);
      items.push(pick);
    }
    const chance = G.CONFIG.consumableChance[kind];
    if (chance && rng.int(1, 100) <= chance) items.push(rollConsumable(room, rng));
    return items;
  }

  // Shop round: the free table everyone picks from (one legendary, rest uncommon+, two consumables)
  function shopTable(room, count, rng) {
    const items = [];
    const nCons = Math.min(2, Math.max(0, count - 2));
    for (let i = 0; i < count - nCons; i++) {
      const slot = rng.pick(G.SLOTS);
      const rarity = i === 0 ? 'gold' : (rng.int(1, 100) <= 25 ? 'gold' : 'green');
      items.push(generate(rng, { slot, rarity, room, weaponType: slot === 'weapon' ? rng.pick(G.WEAPON_ORDER) : null }));
    }
    for (let i = 0; i < nCons; i++) items.push(rollConsumable(Math.max(room, 15), rng, ['greater', 'antidote', ...G.BUFF_IDS]));
    return items;
  }

  // Room 1: three different grey weapons
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
