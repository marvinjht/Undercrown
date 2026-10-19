// Item generation, formatting, and loot drops (rarity cadence + bad-luck protection).
// All item stats are even whole numbers with no random wobble: same tier + rarity = same numbers.
window.G = window.G || {};

(function (G) {
  const L = () => G.CONFIG.loot;

  const even = x => Math.max(2, 2 * Math.round(x / 2));
  function tierFor(room) { return 1 + Math.floor((room - 1) / L().roomsPerTier); }

  function value(k, base, R, tier) {
    const g = G.STAT_INFO[k].growth === 'flat' ? L().tierGrowth : L().chanceTierGrowth;
    return even(base * R.mult * (1 + (tier - 1) * g));
  }

  function generate(rng, { slot, rarity, room, weaponType }) {
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

    const pool = Object.keys(G.AFFIXES).filter(k => !(G.AFFIXES[k].goldOnly && rarity !== 'gold') && !(G.AFFIXES[k].weaponOnly && slot !== 'weapon'));
    const affixes = [];
    for (let i = 0; i < R.affixes && pool.length; i++) {
      const k = pool.splice(Math.floor(rng.float() * pool.length), 1)[0];
      affixes.push(k);
      stats[k] = (stats[k] || 0) + value(k, G.AFFIXES[k].base, R, tier);
    }
    if (affixes.length) name += ' ' + G.AFFIXES[affixes[0]].suffix;

    return { id: G.uid('item'), slot, rarity, room, tier, weaponType: weaponType || null, name, stats, trait, iconKey, affixes };
  }

  function fmtStat(k, v, isWeapon) {
    const label = G.STAT_INFO[k].label;
    if (isWeapon && (k === 'dmg' || k === 'spd')) return `${v} ${label}`;
    return `+${v} ${label}`;
  }

  function statLines(item) {
    return G.STAT_ORDER.filter(k => item.stats[k]).map(k => ({ k, v: item.stats[k], text: fmtStat(k, item.stats[k], item.slot === 'weapon') }));
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

  G.Items = { generate, fmtStat, statLines, compare, tierFor };

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
        const it = generate(rng, { slot, rarity, room, weaponType: slot === 'weapon' ? rollWeaponType(hero, rng) : null });
        if (!pick) pick = it;                                   // fallback: first choice
        if (!hero.gear[slot] || G.Hero.powerWith(hero, it) > now * 1.02) { pick = it; break; }
      }
      exclude.push(pick.slot);
      items.push(pick);
    }
    return items;
  }

  // Room 1: three different grey weapons
  function armory(rng) {
    const types = G.WEAPON_ORDER.slice(), out = [];
    while (out.length < 3) {
      const t = types.splice(Math.floor(rng.float() * types.length), 1)[0];
      out.push(generate(rng, { slot: 'weapon', rarity: 'grey', room: 1, weaponType: t }));
    }
    return out;
  }

  G.Loot = { rarityWeights, rollRarity, offer, armory };
})(window.G);
