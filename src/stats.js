// Turns a hero's gear + spec into combat stats, and handles hero state changes.
window.G = window.G || {};

(function (G) {
  const C = () => G.CONFIG;

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

  function compute(hero) {
    const P = C().player, CB = C().combat;
    const t = sumGear(hero);
    const s = {
      maxHp: P.baseHp + t.hp,
      dmg: t.dmg || 4,
      spd: t.spd || 10,
      armor: t.armor,
      crit: P.baseCrit + t.crit,
      critDmg: t.critDmg,
      dodge: t.dodge,
      leech: t.leech, shield: t.shield, bleed: t.bleed, stun: t.stun,
      spec: hero.spec || null,
      weaponType: hero.gear.weapon ? hero.gear.weapon.weaponType : null,
    };
    if (hero.spec === 'juggernaut') { s.maxHp += G.SPECS.juggernaut.params.hp; s.armor += G.SPECS.juggernaut.params.armor; }
    if (hero.spec === 'bloodthirst') s.leech += G.SPECS.bloodthirst.params.leech;
    s.dodge = Math.min(CB.dodgeCap, s.dodge);
    s.crit = Math.min(CB.critCap, s.crit);
    s.atkSpd = s.spd / 10;
    return s;
  }

  // Rough single number for "how strong is this build". Used by the AI and upgrade labels.
  const REF_ARMOR = 3, REF_HIT = 12;
  function power(s) {
    const hit = Math.max(2, s.dmg - REF_ARMOR);
    let off = (hit * (1 + s.crit / 100) + s.critDmg * s.crit / 100) * s.atkSpd + s.bleed * Math.min(1, s.atkSpd * 3);
    off *= 1 + s.stun / 200;
    let def = (s.maxHp + s.shield) * REF_HIT / Math.max(2, REF_HIT - s.armor) / (1 - s.dodge / 100);
    def *= 1 + s.leech * s.atkSpd * 0.15;
    if (s.spec === 'shadow') { def *= 1.4; off *= 1.1; }
    if (s.spec === 'duelist') def *= 1.3;
    if (s.spec === 'berserker') off *= 1.25;
    return Math.sqrt(off * def);
  }

  // Keep "missing health" the same when max health changes (new gear, spec).
  function withMaxChange(hero, fn) {
    const before = compute(hero).maxHp;
    const r = fn();
    const after = compute(hero).maxHp;
    hero.hp = Math.max(1, Math.min(after, hero.hp + (after - before)));
    return r;
  }

  G.Stats = { compute, power };

  G.Hero = {
    create(opts, rng) {
      const hero = {
        id: G.uid('hero'), name: opts.name, isPlayer: !!opts.isPlayer, tint: opts.tint,
        gear: {}, spec: null, gold: 0, hp: C().player.baseHp, alive: true, diedRoom: null,
        pity: { gold: 0, green: 0 }, rng, lastAction: '',
      };
      return hero;
    },
    equip(hero, item) {
      return withMaxChange(hero, () => {
        const old = hero.gear[item.slot] || null;
        hero.gear[item.slot] = item;
        return old;
      });
    },
    setSpec(hero, id) { withMaxChange(hero, () => { hero.spec = id; }); },
    heal(hero, amount) {
      const max = compute(hero).maxHp;
      const before = hero.hp;
      hero.hp = Math.min(max, hero.hp + Math.round(amount));
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
  };
})(window.G);
