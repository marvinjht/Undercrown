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

  function compute(hero, opts = {}) {
    const P = C().player, CB = C().combat;
    const t = sumGear(hero);
    const wt = hero.gear.weapon ? hero.gear.weapon.weaponType : null;
    const W = wt ? G.WEAPONS[wt] : null;
    const st = sets(hero);
    const fx = {};
    const add = (stats) => { for (const k in stats || {}) t[k] = (t[k] || 0) + stats[k]; };
    for (const a of st.active) {
      for (const tier of TIERS[a.tier]) {
        const b = G.CLASSES[a.cls][tier];
        add(b.stats);
        for (const k in b) if (!['stats', 'desc', 'name'].includes(k)) fx[k] = b[k];
        if (b.arcane) fx.arcane = even(b.arcane * (1 + ((st.maxTier[a.cls] || 1) - 1) * C().loot.tierGrowth));
      }
    }
    if (st.hybrid) {
      const h = G.HYBRIDS[st.hybrid];
      add(h.stats);
      for (const k in h) if (!['stats', 'desc', 'name'].includes(k)) fx[k] = h[k];
    }

    const s = {
      maxHp: P.baseHp + t.hp,
      dmg: t.dmg || 4, spd: t.spd || 10,
      armor: t.armor, ward: t.ward,
      crit: P.baseCrit + t.crit, critDmg: t.critDmg, dodge: t.dodge,
      leech: t.leech, shield: t.shield, bleed: t.bleed, stun: t.stun,
      holy: t.holy, pierce: t.pierce,
      manaGain: t.manaGain, startMana: t.startMana,
      spec: hero.spec || null, gem: hero.gem || null, weaponType: wt,
      type: W ? W.type : 'phys', range: W ? W.range : 'melee',
      cleave: !!(W && W.cleave), healEvery: W && W.healEvery ? W.healEvery : null,
      spell: null, fx, sets: st,
    };
    if (fx.minRange === 'near' && s.range === 'melee') s.range = 'near';

    // Spell: the stronger of the weapon's spell and Arcane Blast
    const cands = [];
    if (W && W.spell) cands.push({ name: W.spell.name, aoe: W.spell.aoe, dmg: t.spellDmg });
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
    if (hero.gem === 'gaia') s.shield += 50;
    if (hero.gem === 'phoenix') s.maxHp = Math.min(s.maxHp, C().phoenix.cap);
    if (hero.gem === 'stone') s.maxHp = 30;

    // Bag buffs (next fight only)
    if (opts.buffs && hero.buffs) {
      const b = hero.buffs;
      s.armor += b.armor || 0; s.ward += b.ward || 0; s.dmg += b.dmg || 0; s.spd += b.spd || 0;
      if (b.fullMana) s.startMana = CB.manaMax;
    }

    s.dodge = Math.min(CB.dodgeCap, s.dodge);
    s.crit = Math.min(CB.critCap, s.crit);
    s.atkSpd = s.spd / 10;
    return s;
  }

  // Rough single number for "how strong is this build". Used by the AI and upgrade labels.
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
    if (s.spec === 'shadow') { def *= 1.4; off *= 1.1; }
    if (s.spec === 'duelist') def *= 1.3;
    if (s.spec === 'berserker') off *= 1.25;
    if (s.gem === 'devil') { off *= 2; def /= 2; }
    if (s.gem === 'stone') def *= 6;
    if (s.gem === 'phoenix') def *= 1.7;
    return Math.sqrt(off * def);
  }

  function withMaxChange(hero, fn) {
    const before = compute(hero).maxHp;
    const r = fn();
    const after = compute(hero).maxHp;
    hero.hp = Math.max(1, Math.min(after, hero.hp + (after - before)));
    return r;
  }

  G.Stats = { compute, power, sets };

  G.Hero = {
    create(opts, rng) {
      return {
        id: G.uid('hero'), name: opts.name, isPlayer: !!opts.isPlayer, tint: opts.tint,
        gear: {}, spec: null, gem: null, gold: 0, hp: C().player.baseHp, alive: true, diedRoom: null,
        pity: { gold: 0, green: 0 }, rng, lastAction: '', bag: [], buffs: {}, poison: 0, phoenixUsed: false,
      };
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
      // Heart of Stone shrinks your health in proportion; Phoenix just caps it
      if (id === 'stone') hero.hp = Math.min(30, Math.max(1, Math.round(hero.hp * 30 / Math.max(1, compute({ ...hero, gem: null }).maxHp))));
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
    maxHp(hero) { return compute(hero).maxHp; },
    power(hero) { return power(compute(hero)); },
    powerWith(hero, item) {
      const saved = hero.gear[item.slot];
      hero.gear[item.slot] = item;
      const p = power(compute(hero));
      hero.gear[item.slot] = saved;
      return p;
    },
    bagFull(hero) { return hero.bag.length >= C().bagSize; },
  };
})(window.G);
