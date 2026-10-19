// Combat simulation. Pure logic: one hero (side a) against one or more enemies (side b).
// Returns the whole fight as a timeline of events plus position tracks; the arena only plays it back.
// Same seed + same inputs = same fight, so a server can run it and every player sees the same thing.
//
// Rules (all flat numbers):
//  Sides start CONFIG.combat.startGap steps apart. Out of range = walk in at moveSpeed steps/second.
//  Physical hits lose Armor (minus Pierce), magic hits lose Ward; never below minHit. Holy = extra magic.
//  Crit: double damage plus Crit Damage. Shield soaks damage first. Mana fills per attack; at 100, cast.
window.G = window.G || {};

(function (G) {
  const C = () => G.CONFIG.combat;

  // side b may be a single stat block (1v1 tournament) or a list of enemy specs
  function toSpecs(b) {
    if (Array.isArray(b)) return b;
    return [{ s: b.s || b, name: b.name || 'Enemy', sprite: b.sprite, tint: b.tint, hp: b.hp }];
  }

  function simulateFight(sa, sb, opts = {}) {
    const CB = C();
    const SH = G.SPECS.shadow.params, DU = G.SPECS.duelist.params, BE = G.SPECS.berserker.params;
    const rng = new G.RNG(opts.seed != null ? opts.seed : G.newSeed());
    const roll = n => n > 0 && rng.int(1, 100) <= n;
    const events = [], tracks = {}, fighters = [], meta = [];
    let seq = 0, t = 0;

    function mk(side, spec, pos, extra = {}) {
      const s = spec.s;
      const f = {
        id: side === 'a' ? 'a' : 'b' + (seq++), side, s, name: spec.name, pos,
        hp: spec.hp != null ? Math.min(spec.hp, s.maxHp) : s.maxHp, maxHp: s.maxHp,
        shield: s.shield || 0, mana: Math.min(CB.manaMax, s.startMana || 0), alive: true,
        nextAtk: 0.3 + rng.range(0, 0.4) * 10 / s.spd, atkCount: 0, hitsLanded: 0, incoming: 0,
        invis: false, invisUntil: -1, nextInvis: s.spec === 'shadow' ? 2.5 : Infinity, stealthCrit: false,
        bleed: 0, bleedUntil: -1, nextBleed: Infinity,
        firstCrits: Math.max((s.fx && s.fx.firstCrits) || 0, 0), dmgBonus: 0, hurtBonus: 0, nextHitBonus: 0,
        swUsed: false, reviveAvail: !!spec.revive, vanishUsed: false,
        burn: 0, burnUntil: -1, nextBurn: Infinity, kiteNext: 0, dashTo: null,
        steal: spec.steal || 0, stolen: 0, escapeAfter: spec.escapeAfter || 0, split: spec.split || null,
        range: CB.ranges[s.range || 'melee'] || 1,
        ...extra,
      };
      fighters.push(f);
      tracks[f.id] = [[t, pos]];
      meta.push({ id: f.id, side, name: spec.name, sprite: spec.sprite, tint: spec.tint, scale: spec.scale || 1,
        maxHp: f.maxHp, hp: f.hp, shield: f.shield, mana: f.mana, hasMana: !!(s.spell && s.manaGain > 0),
        bornAt: t, look: spec.look || null, weapon: spec.weapon || null, range: s.range || 'melee', type: s.type || 'phys' });
      return f;
    }

    const A = mk('a', { s: sa, name: opts.aName || 'You', hp: opts.aHp, revive: opts.aRevive }, 0);
    toSpecs(sb).forEach(sp => mk('b', { ...sp, revive: sp.revive != null ? sp.revive : opts.bRevive }, CB.startGap));
    const result = { revived: { a: false, b: false }, goldStolen: 0, bloodrage: { a: 0, b: 0 } };
    const pending = [];   // delayed actions (Echo recasts)
    const PX = G.CONFIG.phoenix;

    const snap = (...fs) => { const h = {}; for (const f of fs) if (f) h[f.id] = [Math.max(0, f.hp), f.shield, Math.round(f.mana)]; return h; };
    const push = (e, ...fs) => { e.t = t; e.h = snap(...fs); events.push(e); };
    const foes = f => fighters.filter(x => x.alive && x.side !== f.side);
    const target = f => f.side === 'b' ? (A.alive ? A : null) : (foes(f)[0] || null);

    function heal(f, amount) {
      if (!f.alive || amount <= 0 || f.s.gem === 'gaia') return 0;
      const a = f.s.gem === 'stone' ? 1 : amount;
      const h = Math.min(f.maxHp - f.hp, a);
      if (h > 0) f.hp += h;
      return h > 0 ? h : 0;
    }

    // Deal damage after reductions. Returns {dealt, absorbed}.
    function damage(def, amt, att) {
      if (att && att.s.gem === 'devil') amt *= 2;
      if (def.s.gem === 'devil') amt *= 2;
      if (def.s.gem === 'stone') amt = 1;
      let absorbed = 0;
      if (def.shield > 0) { absorbed = Math.min(def.shield, amt); def.shield -= absorbed; amt -= absorbed; }
      def.hp -= amt;
      return { dealt: amt, absorbed };
    }

    function afterDamage(def, att) {
      if (def.hp > 0) {
        const fx = def.s.fx || {};
        if (fx.secondWind && !def.swUsed && def.hp < def.maxHp / 2) {
          def.swUsed = true;
          const h = heal(def, fx.secondWind);
          if (h) push({ type: 'heal', src: def.id, amount: h, label: 'Second Wind' }, def);
        }
        // Rogue 6: Vanish
        if (fx.vanish && !def.vanishUsed && def.hp < def.maxHp / 2) {
          def.vanishUsed = true; def.invis = true; def.invisUntil = Math.max(def.invisUntil, t + fx.vanish);
          push({ type: 'stealth_on', src: def.id, label: 'Vanish' });
        }
        return;
      }
      if (def.reviveAvail) {
        def.reviveAvail = false; def.hp = def.maxHp; result.revived[def.side] = true;
        push({ type: 'revive', src: def.id }, def);
        if (def.s.gem === 'phoenix') phoenixBurst(def);
        return;
      }
      def.alive = false;
      push({ type: 'death', tgt: def.id, src: att ? att.id : null }, def);
      // Warrior 6: Bloodrage
      const afx = att && att.s.fx;
      if (afx && afx.bloodrage && att.alive) {
        result.bloodrage[att.side] += afx.bloodrage;
        const h = heal(att, afx.bloodrage);
        if (h) push({ type: 'heal', src: att.id, amount: h, label: 'Bloodrage' }, att);
      }
      if (def.split) {
        const sp = def.split;
        for (let i = 0; i < sp.count; i++) {
          const child = mk('b', { s: sp.s, name: sp.name, sprite: sp.sprite, scale: sp.scale, split: sp.next || null }, def.pos);
          child.nextAtk = t + 0.6 + i * 0.2;
          push({ type: 'spawn', src: child.id, parent: def.id }, child);
        }
      }
    }

    // Phoenix rebirth: every enemy takes a burst and starts burning
    function phoenixBurst(f) {
      const tgts = foes(f);
      push({ type: 'burst', src: f.id, tgts: tgts.map(x => x.id) });
      for (const d of tgts) {
        if (!d.alive) continue;
        const r = damage(d, PX.burst, null);
        push({ type: 'spellhit', src: f.id, tgt: d.id, amount: r.dealt, absorbed: r.absorbed, name: 'Rebirth' }, d);
        afterDamage(d, f);
        if (d.alive) { d.burn = PX.burn; d.burnUntil = t + PX.burnSeconds + 0.01; d.nextBurn = t + 1; }
      }
    }

    function applyBleed(def, amount) {
      if (amount <= 0 || !def.alive) return;
      if (def.bleedUntil < t) def.nextBleed = t + 1;
      def.bleed = Math.max(def.bleed, amount);
      def.bleedUntil = t + 3;
    }

    function cast(f) {
      const sp = f.s.spell, fx = f.s.fx || {};
      const tgts = sp.aoe ? foes(f) : [target(f)].filter(Boolean);
      push({ type: 'cast', src: f.id, name: sp.name, aoe: sp.aoe, tgts: tgts.map(x => x.id) }, f);
      for (const d of tgts) {
        if (!d.alive) continue;
        const r = damage(d, Math.max(CB.minHit, sp.dmg - (d.s.ward || 0)), f);
        push({ type: 'spellhit', src: f.id, tgt: d.id, amount: r.dealt, absorbed: r.absorbed, name: sp.name }, d);
        afterDamage(d, f);
      }
      f.mana = 0;
      if (fx.echo) pending.push({ at: t + 1, f, sp });
      if (fx.spellHeal) { const h = heal(f, fx.spellHeal); if (h) push({ type: 'heal', src: f.id, amount: h }, f); }
      if (fx.spellStack) f.dmgBonus += fx.spellStack;
    }

    // Mage 6: Echo recasts the spell for half damage, without using mana
    function echo(f, sp) {
      if (!f.alive) return;
      const tgts = sp.aoe ? foes(f) : [target(f)].filter(Boolean);
      if (!tgts.length) return;
      const half = Math.max(CB.minHit, 2 * Math.round(sp.dmg / 4));
      push({ type: 'cast', src: f.id, name: sp.name + ' (Echo)', aoe: sp.aoe, tgts: tgts.map(x => x.id), echo: true }, f);
      for (const d of tgts) {
        if (!d.alive) continue;
        const r = damage(d, Math.max(CB.minHit, half - (d.s.ward || 0)), f);
        push({ type: 'spellhit', src: f.id, tgt: d.id, amount: r.dealt, absorbed: r.absorbed, name: sp.name }, d);
        afterDamage(d, f);
      }
    }

    function addMana(f, n) {
      if (!f.s.spell || n <= 0 || !f.alive) return;
      f.mana = Math.min(CB.manaMax, f.mana + n);
      if (f.mana >= CB.manaMax) cast(f);
    }

    // One strike from att at def. counter = a Duelist riposte. Returns the damage dealt (for cleave).
    function strike(att, def, counter) {
      const fx = att.s.fx || {};
      if (def.invis) { push({ type: 'hidden', src: att.id, tgt: def.id }); return 0; }
      if (roll(def.s.dodge)) {
        push({ type: 'dodge', src: att.id, tgt: def.id });
        if (def.s.fx && def.s.fx.afterDodge) def.nextHitBonus = def.s.fx.afterDodge;
        return 0;
      }
      if (!counter && def.s.spec === 'duelist') {
        def.incoming++;
        if (def.incoming % DU.every === 0) {
          push({ type: 'parry', src: att.id, tgt: def.id });
          strike(def, att, true);
          return 0;
        }
      }
      let crit = false;
      if (att.stealthCrit) { crit = true; att.stealthCrit = false; }
      else if (att.firstCrits > 0) { crit = true; att.firstCrits--; }
      else crit = roll(att.s.crit);
      let raw = att.s.dmg + att.dmgBonus + att.hurtBonus + att.nextHitBonus;
      att.nextHitBonus = 0;
      if (att.s.spec === 'berserker') raw += Math.min(CB.berserkCap, Math.floor((att.maxHp - att.hp) / BE.per) * BE.dmg);
      if (crit) raw = raw * 2 + (att.s.critDmg || 0);
      let amt = att.s.type === 'magic'
        ? Math.max(CB.minHit, raw - (def.s.ward || 0))
        : Math.max(CB.minHit, raw - Math.max(0, (def.s.armor || 0) - (att.s.pierce || 0)));
      let holy = att.s.holy || 0;
      if (fx.executeHoly && def.hp < def.maxHp / 2) holy += fx.executeHoly;
      const holyPart = holy ? Math.max(0, holy - (def.s.ward || 0)) : 0;
      amt += holyPart;
      if (fx.everyFourthMagic && att.atkCount % 4 === 0) amt += Math.max(0, fx.everyFourthMagic - (def.s.ward || 0));
      const r = damage(def, amt, att);
      push({ type: 'hit', src: att.id, tgt: def.id, amount: r.dealt, absorbed: r.absorbed, crit, counter: !!counter, kind: att.s.type, ranged: att.range > 1 }, att, def);
      att.hitsLanded++;
      if (def.s.fx && def.s.fx.hurtStack) def.hurtBonus = Math.min(def.s.fx.hurtCap, def.hurtBonus + def.s.fx.hurtStack);
      // Life on Hit, plus Paladin 6: Consecration (holy damage heals you)
      const lifeOnHit = (att.s.leech || 0) + (fx.consecrate ? holyPart : 0);
      if (lifeOnHit > 0) { const h = heal(att, lifeOnHit); if (h) push({ type: 'heal', src: att.id, amount: h }, att); }
      if (att.s.healEvery && att.hitsLanded % att.s.healEvery.n === 0) {
        const h = heal(att, att.s.healEvery.amount);
        if (h) push({ type: 'heal', src: att.id, amount: h }, att);
      }
      if (crit && fx.critMana) addMana(att, fx.critMana);
      if (att.steal && att.alive) {
        att.stolen += att.steal;
        push({ type: 'steal', src: att.id, amount: att.steal });
        if (att.hitsLanded >= att.escapeAfter) {
          att.alive = false; att.escaped = true; result.goldStolen += att.stolen;
          push({ type: 'escape', src: att.id, amount: att.stolen }, att);
        }
      }
      afterDamage(def, att);
      if (def.alive) {
        applyBleed(def, Math.max(att.s.bleed || 0, crit && fx.critBleed ? fx.critBleed : 0));
        if (roll(att.s.stun)) { def.nextAtk = Math.max(def.nextAtk, t + 1); push({ type: 'stun', src: att.id, tgt: def.id }); }
      }
      return r.dealt;
    }

    function attack(att) {
      const def = target(att);
      if (!def) return;
      att.atkCount++;
      const fx = att.s.fx || {};
      const shots = fx.doubleShot && att.atkCount % fx.doubleShot === 0 ? 2 : 1;
      if (shots === 2) push({ type: 'double', src: att.id });
      for (let i = 0; i < shots; i++) {
        const d = target(att);
        if (!d || !att.alive) break;
        const dealt = strike(att, d, false);
        if (att.s.cleave && dealt > 0) {
          const second = foes(att).find(x => x !== d);
          if (second) {
            const r = damage(second, Math.max(CB.minHit, Math.floor(dealt / 2 / 2) * 2), att);
            push({ type: 'hit', src: att.id, tgt: second.id, amount: r.dealt, absorbed: r.absorbed, cleave: true }, second);
            afterDamage(second, att);
          }
        }
      }
      addMana(att, att.s.manaGain || 0);
    }

    const done = () => !A.alive || !fighters.some(f => f.side === 'b' && f.alive);
    let winner = null;

    while (t < CB.maxTime && !done()) {
      t = Math.round((t + CB.dt) * 1000) / 1000;
      // Move into range (or finish a Kiting step back)
      for (const f of fighters) {
        if (!f.alive) continue;
        if (f.dashTo != null) {
          const d = f.dashTo - f.pos, step = Math.min(Math.abs(d), 10 * CB.dt);
          f.pos += Math.sign(d) * step;
          tracks[f.id].push([t, Math.round(f.pos * 100) / 100]);
          if (Math.abs(f.dashTo - f.pos) < 1e-6) f.dashTo = null;
          continue;
        }
        const tg = target(f);
        if (!tg) continue;
        const d = Math.abs(tg.pos - f.pos);
        if (d > f.range + 1e-6) {
          const step = Math.min(CB.moveSpeed * CB.dt, d - f.range);
          f.pos += tg.pos > f.pos ? step : -step;
          tracks[f.id].push([t, Math.round(f.pos * 100) / 100]);
        }
      }
      // Archer 6: Kiting. When a foe reaches melee range, step back 3.
      for (const f of fighters) {
        const kite = f.alive && f.s.fx && f.s.fx.kite;
        if (!kite || f.dashTo != null || t < f.kiteNext) continue;
        const near = foes(f).some(x => Math.abs(x.pos - f.pos) <= 1 + 1e-6);
        if (!near) continue;
        const dir = f.side === 'a' ? -1 : 1;
        const to = Math.max(-CB.kiteEdge, Math.min(CB.startGap + CB.kiteEdge, f.pos + dir * 3));
        if (Math.abs(to - f.pos) < 0.8) continue;
        f.dashTo = to; f.kiteNext = t + kite;
        push({ type: 'kite', src: f.id });
      }
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= t) { const p = pending.splice(i, 1)[0]; echo(p.f, p.sp); }
      for (const f of fighters) {
        if (!f.alive) continue;
        if (f.s.spec === 'shadow' && !f.invis && t >= f.nextInvis) { f.invis = true; f.invisUntil = t + SH.duration; f.nextInvis = t + SH.every; f.stealthCrit = true; push({ type: 'stealth_on', src: f.id }); }
        else if (f.invis && t >= f.invisUntil) { f.invis = false; push({ type: 'stealth_off', src: f.id }); }
        if (f.burnUntil >= t && t >= f.nextBurn) {
          f.nextBurn = t + 1;
          const r = damage(f, f.burn, null);
          push({ type: 'burn', tgt: f.id, amount: r.dealt }, f);
          afterDamage(f, null);
          if (!f.alive) continue;
        }
        if (f.bleedUntil >= t && t >= f.nextBleed) {
          f.nextBleed = t + 1;
          const r = damage(f, f.bleed, null);
          push({ type: 'bleed', tgt: f.id, amount: r.dealt }, f);
          afterDamage(f, null);
        }
      }
      if (done()) break;
      const ready = fighters.filter(f => f.alive && t >= f.nextAtk).sort((x, y) => x.nextAtk - y.nextAtk);
      for (const f of ready) {
        if (!f.alive || done()) continue;
        const tg = target(f);
        if (!tg || Math.abs(tg.pos - f.pos) > f.range + 1e-6) continue;
        const fx = f.s.fx || {};
        const spd = f.s.spd + (fx.shieldSpd && f.shield > 0 ? fx.shieldSpd : 0);
        f.nextAtk = t + 10 / spd;
        attack(f);
      }
    }

    let timeout = false;
    if (!A.alive) winner = 'b';
    else if (!fighters.some(f => f.side === 'b' && f.alive)) winner = 'a';
    else {
      timeout = true;
      const bs = fighters.filter(f => f.side === 'b' && f.alive);
      const bf = bs.reduce((x, f) => x + f.hp, 0) / Math.max(1, bs.reduce((x, f) => x + f.maxHp, 0));
      winner = A.hp / A.maxHp >= bf ? 'a' : 'b';
      push({ type: 'timeout' });
    }
    const B0 = fighters.find(f => f.side === 'b');
    return {
      events, tracks, fighters: meta, winner, timeout, duration: t,
      aHp: Math.max(0, A.hp), bHp: B0 ? Math.max(0, B0.hp) : 0,
      revived: result.revived, goldStolen: result.goldStolen, bloodrage: result.bloodrage,
    };
  }

  G.simulateFight = (a, b, o) => { const r = simulateFight(a, b, o); if (G._fightLog) G._fightLog.push(r.duration); return r; };
})(window.G);
