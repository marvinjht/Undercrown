// Turns a hero's gear + sets + spec + heart gem (+ bag buffs) into combat stats.
window.G = window.G || {};

(function (G) {
  const C = () => G.CONFIG;
  const even = x => Math.max(0, 2 * Math.round(x / 2));

  function sumGear(hero) {
    const t = {};
    for (const k of G.STAT_ORDER) t[k] = 0;
    for (const slot of G.SLOTS) {
      const it = hero.gear[slot];
      if (!it) continue;
      for (const k in it.stats) t[k] = (t[k] || 0) + it.stats[k];
    }
    return t;
  }

  // Set counts and which bonuses are active. All 6 slots count (5 armor + weapon).
  //   look = the class with 4+ pieces (changes color and silhouette); full = 6 of it
  //   main = the strongest active class (for labels); trim = the hybrid partner
  function sets(hero) {
    const counts = {}, maxTier = {};
    for (const slot of G.SLOTS) {
      const it = hero.gear[slot];
      if (!it || !it.set) continue;
      counts[it.set] = (counts[it.set] || 0) + 1;
      maxTier[it.set] = Math.max(maxTier[it.set] || 1, it.tier || 1);
    }
    const active = [];
    for (const c of G.CLASS_ORDER) {
      const n = counts[c] || 0;
      if (n >= 6) active.push({ cls: c, tier: 'six' });
      else if (n >= 4) active.push({ cls: c, tier: 'four' });
      else if (n >= 2) active.push({ cls: c, tier: 'two' });
    }
    const byCount = active.slice().sort((a, b) => (counts[b.cls] || 0) - (counts[a.cls] || 0));
    const main = byCount.length ? byCount[0].cls : null;
    const look = main && counts[main] >= 4 ? main : null;
    const full = !!(look && counts[look] >= 6);
    let hybrid = null, trim = null;
    if (look && !full) {
      const partner = byCount.find(a => a.cls !== look && counts[a.cls] >= 2);
      if (partner) { hybrid = G.hybridKey(look, partner.cls); trim = partner.cls; }
    }
    return { counts, active, hybrid, main, look, full, trim, maxTier };
  }
  // Which bonus tiers a class tier turns on (6 = the 4-piece bonus plus the capstone)
  const TIERS = { two: ['two'], four: ['four'], six: ['four', 'six'] };

  // The weapon's own attack speed (what the Attack Speed cap counts bonuses on top of)
  function weaponSpd(hero, W) {
    const w = hero.gear.weapon;
    if (!w) return 10;
    if (w.legendary && G.LEGENDARIES[w.legendary].stats.spd) return G.LEGENDARIES[w.legendary].stats.spd;
    return W ? W.spd : 10;
  }

  function compute(hero, opts = {}) {
    const P = C().player, CB = C().combat;
    const t = sumGear(hero);
    const wt = hero.gear.weapon ? hero.gear.weapon.weaponType : null;
    const W = wt ? G.WEAPONS[wt] : null;
    const st = sets(hero);
    const fx = {};
    const add = (stats) => { for (const k in stats || {}) t[k] = (t[k] || 0) + stats[k]; };
    // These effects add up across sources instead of the last one winning
    const ADDITIVE = ['openInvis', 'firstCrits'];
    const merge = (src) => { for (const k in src) fx[k] = ADDITIVE.includes(k) ? (fx[k] || 0) + src[k] : src[k]; };
    for (const a of st.active) {
      for (const tier of TIERS[a.tier]) {
        const b = G.CLASSES[a.cls][tier];
        add(b.stats);
        const o = {}; for (const k in b) if (!['stats', 'desc', 'name'].includes(k)) o[k] = b[k];
        merge(o);
        if (b.arcane) fx.arcane = even(b.arcane * (1 + ((st.maxTier[a.cls] || 1) - 1) * C().loot.tierGrowth));
      }
    }
    if (st.hybrid) {
      const h = G.HYBRIDS[st.hybrid];
      add(h.stats);
      const o = {}; for (const k in h) if (!['stats', 'desc', 'name'].includes(k)) o[k] = h[k];
      merge(o);
    }
    // Relics: each copy strengthens the effect
    for (const rid in hero.relics || {}) { const n = hero.relics[rid]; if (n > 0 && G.RELICS[rid]) merge(G.RELICS[rid].fx(n)); }
    // The legendary you wear
    const leg = G.SLOTS.map(sl => hero.gear[sl]).find(it => it && it.legendary);
    if (leg) merge(G.LEGENDARIES[leg.legendary].fx);
    if (fx.relicSpd) t.spd += fx.relicSpd;   // Twitching Rat Paw
    // Skill tree picks
    const tree = treeFx(hero);
    merge(tree.fx);
    add(tree.stats);
    // Permanent stats from Spoils
    add(hero.bonus);
    // Levels: +4 max health each level past 1; even levels alternate +2 Damage (2, 6, 10...) and +2 Armor (4, 8, 12...)
    const lv = hero.level || 1, LV = C().levels;
    t.hp += Math.max(0, lv - 1) * LV.hpPerLevel;
    t.dmg += Math.floor((lv + 2) / 4) * LV.bump;
    t.armor += Math.floor(lv / 4) * LV.bump;
    // Midas: +10 Damage and +15 Health for every 50 gold you hold
    if (fx.midas) { const n = Math.floor((hero.gold || 0) / fx.midas); t.dmg += 10 * n; t.hp += 15 * n; }

    if (fx.firstCrits) fx.firstCrits = Math.min(C().combat.firstCritCap, fx.firstCrits);
    const s = {
      maxHp: P.baseHp + t.hp,
      dmg: t.dmg || 4, spd: t.spd || 10,
      armor: t.armor, ward: t.ward,
      crit: P.baseCrit + t.crit, critDmg: t.critDmg, dodge: t.dodge,
      leech: t.leech, shield: t.shield, bleed: t.bleed, stun: t.stun,
      holy: t.holy, pierce: t.pierce,
      manaGain: t.manaGain, startMana: t.startMana,
      spec: hero.spec || null, gem: hero.gem || null, weaponType: wt,
      type: W ? W.type : 'phys', range: W ? (fx.meleeStaff ? 'melee' : W.range) : 'melee',
      legendary: leg ? leg.legendary : null,
      cleave: !!(W && W.cleave), healEvery: W && W.healEvery ? W.healEvery : null,
      spell: null, fx, sets: st,
    };
    if (fx.minRange === 'near' && s.range === 'melee') s.range = 'near';

    // Spell: the stronger of the weapon's spell and Arcane Blast
    const cands = [];
    if (W && W.spell && !fx.noSpell) cands.push({ name: W.spell.name, aoe: W.spell.aoe, dmg: t.spellDmg });
    if (fx.sunder) cands.push({ name: 'Sunder', aoe: false, dmg: fx.sunder.dmg, sunder: true });
    if (fx.arcane) cands.push({ name: 'Arcane Blast', aoe: true, dmg: fx.arcane });
    if (cands.length) {
      s.spell = cands.sort((a, b) => b.dmg - a.dmg || (b.aoe ? 1 : 0) - (a.aoe ? 1 : 0))[0];
      s.spell = { ...s.spell, dmg: s.spell.dmg + (fx.spellBonus || 0) };
    }

    // Specializations
    if (hero.spec === 'juggernaut') { s.maxHp += G.SPECS.juggernaut.params.hp; s.armor += G.SPECS.juggernaut.params.armor; }
    if (hero.spec === 'bloodthirst') s.leech += G.SPECS.bloodthirst.params.leech;

    // Heart gems
    if (hero.gem === 'pure') { s.maxHp += 20; s.dmg += 2; }
    if (hero.gem === 'gaia') s.shield += C().gaiaShield;
    if (hero.gem === 'stone') s.maxHp = C().stoneHp;

    // Bag buffs (next fight only)
    if (opts.buffs && hero.buffs) {
      const b = hero.buffs;
      s.armor += b.armor || 0; s.ward += b.ward || 0; s.dmg += b.dmg || 0; s.spd += b.spd || 0;
      if (b.fullMana) s.startMana = CB.manaMax;
    }

    // Trade-offs can push a stat below zero; keep everything sensible
    for (const k of ['armor', 'ward', 'dodge', 'crit', 'critDmg', 'leech', 'shield', 'bleed', 'stun', 'holy', 'pierce', 'manaGain', 'startMana']) s[k] = Math.max(0, s[k] || 0);
    s.maxHp = Math.max(10, s.maxHp);
    s.dmg = Math.max(2, s.dmg);
    // Attack Speed cap: bonus speed on top of the weapon counts fully up to the cap, then half
    const SC = CB.spdSoftCap, baseSpd = weaponSpd(hero, W);
    if (SC && s.spd - baseSpd > SC) s.spd = baseSpd + SC + Math.floor((s.spd - baseSpd - SC) / 2);
    s.spd = Math.max(CB.minSpd, s.spd);
    if (fx.hpShieldPct) s.shield += even(s.maxHp * fx.hpShieldPct / 100);   // Tortoise Shell
    if (fx.armorShield) s.shield += fx.armorShield * s.armor;
    // Monolith: damage from max health
    if (fx.hpDmg) s.dmg += Math.floor(s.maxHp / fx.hpDmg);
    if (fx.openingSpell && s.spell) s.startMana = CB.manaMax;
    s.dodge = Math.min(CB.dodgeCap, s.dodge);
    s.crit = Math.min(CB.critCap, s.crit);
    s.atkSpd = s.spd / 10;
    return s;
  }

  // Skill tree: the picks a hero made at levels 10, 15 and 20, merged into effects and stats
  function treeFx(hero) {
    const out = { fx: {}, stats: {}, nodes: [] };
    if (!hero.spec || !hero.treePicks) return out;
    const T = G.SPEC_TREES[hero.spec];
    for (const lv of C().levels.treeLevels) {
      const id = hero.treePicks[lv];
      if (!id) continue;
      const node = treeOptions(hero.spec, lv).find(n => n.id === id);
      if (!node) continue;
      out.nodes.push(node);
      Object.assign(out.fx, node.fx || {});
      for (const k in node.stats || {}) out.stats[k] = (out.stats[k] || 0) + node.stats[k];
    }
    return out;
  }
  function treeOptions(spec, lv) {
    const T = G.SPEC_TREES[spec];
    if (!T) return [];
    return lv === 10 ? T.t10 : lv === 15 ? T.t15 : [T.t20];
  }

  // Rough single number for "how strong is this build". Used by the AI.
  const REF_ARMOR = 3, REF_WARD = 2, REF_HIT = 12;
  function power(s) {
    const base = s.type === 'magic' ? Math.max(2, s.dmg - REF_WARD) : Math.max(2, s.dmg - Math.max(0, REF_ARMOR - s.pierce));
    const hit = base + s.holy;
    let off = (hit * (1 + s.crit / 100) + s.critDmg * s.crit / 100) * s.atkSpd + s.bleed * Math.min(1, s.atkSpd * 3);
    if (s.spell && s.manaGain > 0) {
      const secs = (G.CONFIG.combat.manaMax - Math.min(99, s.startMana)) / s.manaGain / s.atkSpd;
      off += s.spell.dmg * (s.spell.aoe ? 1.4 : 1) / Math.max(1, secs);
    }
    if (s.cleave) off *= 1.15;
    if (s.fx.doubleShot) off *= 1.2;
    off *= 1 + s.stun / 200;
    if (s.range === 'near') off *= 1.08; else if (s.range === 'far') off *= 1.15;
    let def = (s.maxHp + s.shield) * REF_HIT / Math.max(2, REF_HIT - s.armor) / (1 - s.dodge / 100);
    def *= 1 + s.ward * 0.02 + s.leech * s.atkSpd * 0.15;
    if (s.fx.secondWind) def += s.fx.secondWind;
    if (s.fx.echo && s.spell && s.manaGain > 0) off *= 1.2;
    if (s.fx.kite) def *= 1.15;
    if (s.fx.consecrate) def *= 1 + Math.min(0.3, s.holy * 0.03);
    if (s.fx.vanish) def *= 1.1;
    if (s.fx.bloodrage) def *= 1.08;
    if (s.spec === 'shadow') { off *= 1.2; def *= 1.05; }
    if (s.fx.openInvis) def *= 1.1;
    if (s.spec === 'duelist') def *= 1.3;
    if (s.spec === 'berserker') off *= 1.25;
    if (s.gem === 'devil') { off *= 2; def /= 2; }
    if (s.gem === 'stone') def *= 2.5;
    if (s.gem === 'phoenix') { def *= 1.25; off *= 1.05; }
    if (s.fx.critHeal) def *= 1 + s.crit / 400;
    if (s.fx.fourthStun) off *= 1.06;
    if (s.fx.bleedShred && s.bleed) off *= 1.08;
    if (s.legendary) { off *= 1.2; def *= 1.1; }
    if (s.fx.empower || s.fx.spellShield || s.fx.dodgeHaste || s.fx.shove || s.fx.sentinelBurst || s.fx.healCut || s.fx.sureHits || s.fx.capHeal || s.fx.spellCrit || s.fx.manaOnFourth) off *= 1.12;
    return Math.sqrt(off * def);
  }

  // Raising max health never heals you; lowering it can't leave you above the new max
  function withMaxChange(hero, fn) {
    const r = fn();
    const after = compute(hero).maxHp;
    hero.hp = Math.max(1, Math.min(after, hero.hp));
    return r;
  }

  G.Stats = { compute, power, sets, treeFx, treeOptions };

  G.Hero = {
    create(opts, rng) {
      return {
        id: G.uid('hero'), name: opts.name, isPlayer: !!opts.isPlayer, tint: opts.tint,
        gear: {}, spec: null, gem: null, gold: 0, hp: C().player.baseHp, alive: true, diedRoom: null,
        pity: { rare: 0, green: 0 }, rng, lastAction: '', bag: [], buffs: {}, poison: 0,
        hearts: C().hearts, level: 1, xp: 0, treePicks: {}, opponents: [], relics: {},
      };
    },
    // You can wear only one legendary: a second one only goes on in place of the first
    wornLegendary(hero) { return G.SLOTS.map(sl => hero.gear[sl]).find(it => it && it.rarity === 'legendary') || null; },
    canEquip(hero, item) {
      if (item.kind !== 'gear' || item.rarity !== 'legendary') return true;
      const worn = this.wornLegendary(hero);
      return !worn || worn.slot === item.slot;
    },
    // Relics stack up to the max; a maxed relic can't be taken again
    relicCount(hero, rid) { return (hero.relics || {})[rid] || 0; },
    addRelic(hero, item) {
      hero.relics = hero.relics || {};
      if (this.relicCount(hero, item.rid) >= G.RELIC_MAX) return false;
      withMaxChange(hero, () => { hero.relics[item.rid] = this.relicCount(hero, item.rid) + 1; });
      return true;
    },
    equip(hero, item) {
      return withMaxChange(hero, () => {
        const old = hero.gear[item.slot] || null;
        hero.gear[item.slot] = item;
        return old;
      });
    },
    setSpec(hero, id) { withMaxChange(hero, () => { hero.spec = id; }); },
    setGem(hero, id) {
      hero.gem = id;
      const max = compute(hero).maxHp;
      hero.hp = Math.max(1, Math.min(max, hero.hp));
      // Heart of Stone puts you at exactly its max health, never lower
      if (id === 'stone') hero.hp = C().stoneHp;
    },
    // All healing outside fights goes through here so heart gems apply
    heal(hero, amount) {
      if (hero.gem === 'gaia' || amount <= 0) return 0;
      let a = Math.round(amount);
      if (hero.gem === 'stone') a = 1;
      else if (hero.gem === 'vulture') a = 2 * Math.round(a / 4);
      const max = compute(hero).maxHp, before = hero.hp;
      hero.hp = Math.min(max, hero.hp + a);
      return hero.hp - before;
    },
    // Vulture's Heart: a rival lost a heart. Gain max health and heal the same amount (not reduced).
    vultureFeed(hero, times = 1) {
      const n = C().vultureHeal * times;
      hero.bonus = hero.bonus || {};
      hero.bonus.hp = (hero.bonus.hp || 0) + n;
      const max = compute(hero).maxHp, before = hero.hp;
      hero.hp = Math.min(max, hero.hp + n);
      return hero.hp - before;
    },
    // How much a heal would restore before the max-health cap (heart gems change it)
    healAmount(hero, amount) {
      if (hero.gem === 'gaia' || amount <= 0) return 0;
      if (hero.gem === 'stone') return 1;
      if (hero.gem === 'vulture') return 2 * Math.round(amount / 4);
      return Math.round(amount);
    },
    maxHp(hero) { return compute(hero).maxHp; },
    power(hero) { return power(compute(hero)); },
    powerWith(hero, item) {
      if (item.kind === 'relic') {
        if (this.relicCount(hero, item.rid) >= G.RELIC_MAX) return 0;
        hero.relics = hero.relics || {};
        const n = this.relicCount(hero, item.rid);
        hero.relics[item.rid] = n + 1;
        const p = power(compute(hero)) * 1.1;   // relics are worth a little more than their raw numbers show
        if (n) hero.relics[item.rid] = n; else delete hero.relics[item.rid];
        return p;
      }
      if (!this.canEquip(hero, item)) return 0;
      const saved = hero.gear[item.slot];
      hero.gear[item.slot] = item;
      const p = power(compute(hero));
      hero.gear[item.slot] = saved;
      return p;
    },
    bagFull(hero) { return hero.bag.length >= C().bagSize; },
    // New loot: gear goes straight onto an empty slot; otherwise (or for consumables) into the bag.
    // Returns 'equipped', 'bag', or null when the bag is full.
    canReceive(hero, item) {
      if (item.kind === 'relic') return this.relicCount(hero, item.rid) < G.RELIC_MAX;
      return (item.kind === 'gear' && !hero.gear[item.slot] && this.canEquip(hero, item)) || !this.bagFull(hero);
    },
    receive(hero, item) {
      if (item.kind === 'relic') return this.addRelic(hero, item) ? 'relic' : null;
      if (item.kind === 'gear' && !hero.gear[item.slot] && this.canEquip(hero, item)) { this.equip(hero, item); return 'equipped'; }
      if (this.bagFull(hero)) return null;
      hero.bag.push(item); return 'bag';
    },
    receivedText(item, where) {
      if (where === 'relic') return `Relic: ${item.name}.`;
      return where === 'equipped' ? `You equipped the ${item.name}.` : `${item.name} went into your bag.${item.kind === 'gear' ? ' Click it in your bag and hold Equip to swap it in.' : ''}`;
    },

    // ---------- Levels ----------
    xpToNext(level) { return C().levels.xpBase + level; },
    // Adds XP; returns the levels reached (e.g. [5] or [9, 10])
    gainXp(hero, n) {
      const L = C().levels, reached = [];
      if (!n || hero.level >= L.max) return reached;
      const jr = (hero.relics || {}).journal;   // Dead Man's Journal
      if (jr && G.RELICS.journal) n += G.RELICS.journal.fx(jr).xpBonus;
      hero.xp += n;
      while (hero.level < L.max && hero.xp >= this.xpToNext(hero.level)) {
        hero.xp -= this.xpToNext(hero.level);
        hero.level++;
        reached.push(hero.level);
      }
      if (hero.level >= L.max) hero.xp = 0;
      return reached;
    },
    // Picks still owed: the spec at level 5, then tree picks at 10, 15, 20
    pendingPick(hero) {
      const L = C().levels;
      if (hero.level >= L.specLevel && !hero.spec) return { kind: 'spec', level: L.specLevel };
      if (!hero.spec) return null;
      for (const lv of L.treeLevels) if (hero.level >= lv && !hero.treePicks[lv]) return { kind: 'tree', level: lv };
      return null;
    },
    pickTree(hero, lv, id) { withMaxChange(hero, () => { hero.treePicks[lv] = id; }); },

    // ---------- Hearts ----------
    // Lose a heart. Out of hearts = out of the match. Otherwise you come back at full health, poison cleared.
    loseHeart(hero, room) {
      hero.hearts = Math.max(0, hero.hearts - 1);
      if (hero.hearts <= 0) { hero.alive = false; hero.hp = 0; hero.diedRoom = room; return false; }
      hero.hp = compute(hero).maxHp;
      hero.poison = 0;
      return true;
    },
  };
})(window.G);
