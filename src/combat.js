// Combat simulation. Pure logic: takes two stat blocks, returns the whole fight as a
// timeline of events. The arena (src/arena.js) only plays this timeline back.
// Same seed + same stats = same fight, so a server can run it and every player sees the same result.
//
// Rules (all flat numbers):
//  hit = Damage (+ Berserker bonus). Crit: double, plus Crit Damage.
//  Armor subtracts from every hit taken (never below 2). Shield soaks damage first.
//  Dodge / Crit / Stun are "out of 100". Bleed = damage per second for 3 seconds.
window.G = window.G || {};

(function (G) {
  function fighter(id, s, hp) {
    return {
      id, s, hp: hp == null ? s.maxHp : Math.min(hp, s.maxHp), shield: s.shield || 0,
      nextAtk: 0, invis: false, invisUntil: -1, nextInvis: Infinity, stealthCrit: false,
      incoming: 0, bleed: 0, bleedUntil: -1, nextBleed: Infinity,
    };
  }

  function simulateFight(sa, sb, opts = {}) {
    const C = G.CONFIG.combat;
    const SH = G.SPECS.shadow.params, DU = G.SPECS.duelist.params, BE = G.SPECS.berserker.params;
    const rng = new G.RNG(opts.seed != null ? opts.seed : G.newSeed());
    const roll = n => rng.int(1, 100) <= n;
    const A = fighter('a', sa, opts.aHp), B = fighter('b', sb, opts.bHp);
    const events = [];
    const push = e => { e.hp = { a: Math.max(0, A.hp), b: Math.max(0, B.hp) }; e.sh = { a: A.shield, b: B.shield }; events.push(e); };

    for (const f of [A, B]) {
      f.nextAtk = C.engageDelay + rng.range(0, 0.4) * 10 / f.s.spd;
      if (f.s.spec === 'shadow') f.nextInvis = C.engageDelay + 2.5;
    }
    if (A.shield || B.shield) push({ t: 0, type: 'start' });

    function strike(att, def, t, isCounter) {
      if (def.invis) { push({ t, type: 'hidden', src: att.id, tgt: def.id }); return; }
      if (roll(def.s.dodge)) { push({ t, type: 'dodge', src: att.id, tgt: def.id }); return; }
      if (!isCounter && def.s.spec === 'duelist') {
        def.incoming++;
        if (def.incoming % DU.every === 0) {
          push({ t, type: 'parry', src: att.id, tgt: def.id });
          strike(def, att, t, true);
          return;
        }
      }
      let crit;
      if (att.stealthCrit) { crit = true; att.stealthCrit = false; } else crit = roll(att.s.crit);
      let dmg = att.s.dmg;
      if (att.s.spec === 'berserker') dmg += Math.min(C.berserkCap, Math.floor((att.s.maxHp - att.hp) / BE.per) * BE.dmg);
      if (crit) dmg = dmg * 2 + att.s.critDmg;
      dmg = Math.max(C.minHit, dmg - (def.s.armor || 0));
      let absorbed = 0;
      if (def.shield > 0) { absorbed = Math.min(def.shield, dmg); def.shield -= absorbed; dmg -= absorbed; }
      def.hp -= dmg;
      push({ t, type: 'hit', src: att.id, tgt: def.id, amount: dmg, absorbed, crit, counter: !!isCounter });
      if (att.s.leech > 0 && att.hp > 0) {
        const h = Math.min(att.s.maxHp - att.hp, att.s.leech);
        if (h > 0) { att.hp += h; push({ t, type: 'heal', src: att.id, tgt: att.id, amount: h }); }
      }
      if (def.hp <= 0) return;
      if (att.s.bleed > 0) {
        if (def.bleedUntil < t) def.nextBleed = t + 1;
        def.bleed = att.s.bleed;
        def.bleedUntil = t + 3;
      }
      if (att.s.stun > 0 && roll(att.s.stun)) {
        def.nextAtk = Math.max(def.nextAtk, t + 1);
        push({ t, type: 'stun', src: att.id, tgt: def.id });
      }
    }

    let t = 0, winner = null;
    const checkDeath = () => {
      if (A.hp <= 0 || B.hp <= 0) {
        winner = A.hp <= 0 ? 'b' : 'a';
        push({ t, type: 'death', tgt: winner === 'a' ? 'b' : 'a' });
        return true;
      }
      return false;
    };

    while (t < C.maxTime && !winner) {
      t = Math.round((t + C.dt) * 1000) / 1000;
      for (const f of [A, B]) {
        if (f.s.spec === 'shadow') {
          if (!f.invis && t >= f.nextInvis) {
            f.invis = true; f.invisUntil = t + SH.duration; f.nextInvis = t + SH.every; f.stealthCrit = true;
            push({ t, type: 'stealth_on', src: f.id });
          } else if (f.invis && t >= f.invisUntil) {
            f.invis = false;
            push({ t, type: 'stealth_off', src: f.id });
          }
        }
        if (f.bleedUntil >= t && t >= f.nextBleed) {
          f.hp -= f.bleed; f.nextBleed = t + 1;
          push({ t, type: 'bleed', tgt: f.id, amount: f.bleed });
        }
      }
      if (checkDeath()) break;
      const order = A.nextAtk <= B.nextAtk ? [[A, B], [B, A]] : [[B, A], [A, B]];
      for (const [att, def] of order) {
        if (t >= att.nextAtk && att.hp > 0 && def.hp > 0) {
          att.nextAtk = t + 10 / att.s.spd;
          strike(att, def, t, false);
          if (checkDeath()) break;
        }
      }
    }

    let timeout = false;
    if (!winner) {
      timeout = true;
      winner = A.hp / A.s.maxHp >= B.hp / B.s.maxHp ? 'a' : 'b';
      push({ t, type: 'timeout' });
    }
    return { events, winner, timeout, aHp: Math.max(0, A.hp), bHp: Math.max(0, B.hp), duration: t };
  }

  G.simulateFight = (a, b, o) => { const r = simulateFight(a, b, o); (G._fightLog || []).push(r.duration); return r; };
})(window.G);
