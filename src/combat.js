// Combat simulation. Pure logic: one hero (side a) against one or more enemies (side b).
// Returns the whole fight as a timeline of events plus position tracks; the arena only plays it back.
// Same seed + same inputs = same fight, so a server can run it and every player sees the same thing.
//
// Rules (all flat numbers):
//  Sides start CONFIG.combat.startGap steps apart. Out of range = walk in at moveSpeed steps/second.
//  Physical hits lose Armor (minus Pierce), magic hits lose Magic Resist; never below minHit. Holy = extra magic.
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
        invis: !!(s.fx && s.fx.openInvis), invisUntil: s.fx && s.fx.openInvis ? s.fx.openInvis : -1,
        nextCheap: s.spec === 'shadow' ? 2 : Infinity, cheapShot: false, smokeUntil: -1, stunImmuneUntil: -1, crack: {},
        bleed: 0, bleedUntil: -1, nextBleed: Infinity,
        firstCrits: Math.max((s.fx && s.fx.firstCrits) || 0, 0), dmgBonus: 0, hurtBonus: 0, nextHitBonus: 0,
        swUsed: false, reviveAvail: !!spec.revive, vanishUsed: false,
        burn: 0, burnUntil: -1, nextBurn: Infinity, kiteNext: 0, dashTo: null,
        selfBurnNext: s.gem === 'phoenix' ? 1 : Infinity, exploded: false, undyingUsed: false, undyingUntil: -1,
        quarterUsed: false, overShield: 0, parryDodge: 0, shred: 0, shredUntil: -1, mark: null,
        thorns: spec.thorns || (s.fx && s.fx.thorns) || 0, shieldBreak: !!(spec.shieldBreak || (s.fx && s.fx.shieldBreak)),
        steal: spec.steal || 0, stolen: 0, split: spec.split || null,
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
    const result = { revived: { a: false, b: false }, goldStolen: 0, bloodrage: { a: 0, b: 0 }, phoenixWin: null };
    const PVP = opts.pvp ? G.CONFIG.arena.damageMult : 1;   // duels and the tournament: half damage
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
      // Bloodthirst: Gorge. Healing past full becomes Shield.
      const over = a - Math.max(0, h), cap = f.s.fx && f.s.fx.overhealShield;
      if (cap && over > 0 && f.overShield < cap) { const add = Math.min(over, cap - f.overShield); f.overShield += add; f.shield += add; }
      return h > 0 ? h : 0;
    }

    // Deal damage after reductions. Returns {dealt, absorbed}.
    // Shields soak hits at full damage (even with Heart of Stone); Stone only turns health damage into 1.
    function damage(def, amt, att) {
      if (att && att.s.gem === 'devil') amt *= 2;
      if (def.s.gem === 'devil') amt *= 2;
      if (PVP !== 1) amt = Math.max(1, 2 * Math.round(amt * PVP / 2));
      let absorbed = 0;
      if (def.shield > 0) {
        if (att && att.shieldBreak) {
          const used = Math.min(def.shield, amt * 2);
          def.shield -= used; absorbed = Math.ceil(used / 2); amt -= absorbed;
        } else { absorbed = Math.min(def.shield, amt); def.shield -= absorbed; amt -= absorbed; }
      }
      // Heart of Stone: each attacker's hits to health deal 1 more than that attacker's last, up to the cap
      if (amt > 0 && def.s.gem === 'stone') { const k = att ? att.id : '_'; def.crack[k] = Math.min(G.CONFIG.stoneCrack, (def.crack[k] || 0) + 1); amt = def.crack[k]; }
      def.hp -= amt;
      // Berserker: Undying Rage keeps you at 1 for a few seconds
      if (def.hp <= 0 && def.undyingUntil >= t) def.hp = 1;
      if (def.mark && att && def.mark.by === att && amt > 0) def.mark.dmg += amt;
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
        // Berserker: Second Breath
        if (fx.quarterHeal && !def.quarterUsed && def.hp < def.maxHp / 4) {
          def.quarterUsed = true;
          const h = heal(def, fx.quarterHeal);
          if (h) push({ type: 'heal', src: def.id, amount: h, label: 'Second Breath' }, def);
        }
        return;
      }
      // Berserker: Undying Rage
      if (def.s.fx && def.s.fx.undying && !def.undyingUsed) {
        def.undyingUsed = true; def.hp = 1; def.undyingUntil = t + def.s.fx.undying;
        push({ type: 'undying', src: def.id }, def);
        return;
      }
      // Phoenix Heart: explode on death. If that clears the fight, you win and stand back up.
      if (def.s.gem === 'phoenix' && !def.exploded) {
        def.exploded = true;
        phoenixBurst(def);
        if (!foes(def).length) {
          def.hp = PX.standUp; result.phoenixWin = def.side;
          push({ type: 'revive', src: def.id }, def);
          return;
        }
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

    function applyBleed(def, amount, att) {
      if (amount <= 0 || !def.alive) return;
      if (def.bleedUntil < t) def.nextBleed = t + 1;
      def.bleed = Math.max(def.bleed, amount);
      def.bleedUntil = t + 3;
      // Rending: bleeding lowers Armor
      const shred = att && att.s.fx && att.s.fx.bleedShred;
      if (shred) { def.shred = shred; def.shredUntil = def.bleedUntil; }
    }
    // Stuns can't chain: after one, the target can't be stunned again for a few seconds
    function stun(att, def, secs = 1) {
      if (!def.alive || (def.s.fx && def.s.fx.stunImmune) || t < def.stunImmuneUntil) return;
      def.nextAtk = Math.max(def.nextAtk, t + secs);
      def.stunImmuneUntil = t + secs + CB.stunImmune;
      push({ type: 'stun', src: att.id, tgt: def.id, secs });
    }

    function cast(f) {
      const sp = f.s.spell, fx = f.s.fx || {};
      const tgts = (sp.aoe ? foes(f) : [target(f)].filter(Boolean)).filter(x => !x.invis);
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
      const dfx = def.s.fx || {};
      const smoke = def.smokeUntil >= t && dfx.smokeDodge ? dfx.smokeDodge : 0;
      if (roll(Math.min(CB.dodgeCap + smoke, (def.s.dodge || 0) + def.parryDodge + smoke))) {
        push({ type: 'dodge', src: att.id, tgt: def.id });
        if (dfx.afterDodge) def.nextHitBonus = dfx.afterDodge;
        return 0;
      }
      if (!counter && def.s.spec === 'duelist') {
        def.incoming++;
        if (def.incoming % (dfx.parryEvery || DU.every) === 0) {
          push({ type: 'parry', src: att.id, tgt: def.id });
          if (dfx.parryDodge) def.parryDodge = Math.min(10, def.parryDodge + dfx.parryDodge);
          if (dfx.parryStun) stun(def, att, 1);
          strike(def, att, true);
          return 0;
        }
      }
      let crit = false, ambush = false;
      if (att.cheapShot) { crit = true; att.cheapShot = false; ambush = true; if (fx.smokeDodge) { att.smokeUntil = t + 2; push({ type: 'smoke', src: att.id, dur: 2 }); } }
      else if (att.firstCrits > 0) { crit = true; att.firstCrits--; }
      else if (counter && fx.counterCrit) crit = true;
      else crit = roll(att.s.crit);
      let raw = att.s.dmg + att.dmgBonus + att.hurtBonus + att.nextHitBonus;
      att.nextHitBonus = 0;
      if (counter && fx.counterDmg) raw += fx.counterDmg;
      if (ambush && fx.cheapDmg) raw += fx.cheapDmg;
      if (att.s.spec === 'berserker') raw += Math.min(fx.berserkCap || CB.berserkCap, Math.floor((att.maxHp - att.hp) / BE.per) * BE.dmg);
      if (crit) raw = raw * 2 + (att.s.critDmg || 0) + (fx.critDmgFlat || 0);
      if (dfx.takeMore) raw += dfx.takeMore;
      const armor = Math.max(0, (def.s.armor || 0) - (def.shredUntil >= t ? def.shred : 0));
      let amt = att.s.type === 'magic'
        ? Math.max(CB.minHit, raw - (def.s.ward || 0))
        : Math.max(CB.minHit, raw - Math.max(0, armor - (att.s.pierce || 0)));
      let holy = att.s.holy || 0;
      if (fx.executeHoly && def.hp < def.maxHp / 2) holy += fx.executeHoly;
      const holyPart = holy ? Math.max(0, holy - (def.s.ward || 0)) : 0;
      amt += holyPart;
      if (fx.everyFourthMagic && att.atkCount % 4 === 0) amt += Math.max(0, fx.everyFourthMagic - (def.s.ward || 0));
      const r = damage(def, amt, att);
      push({ type: 'hit', src: att.id, tgt: def.id, amount: r.dealt, absorbed: r.absorbed, crit, cheap: ambush, counter: !!counter, kind: att.s.type, ranged: att.range > 1 }, att, def);
      att.hitsLanded++;
      if (def.s.fx && def.s.fx.hurtStack) def.hurtBonus = Math.min(def.s.fx.hurtCap, def.hurtBonus + def.s.fx.hurtStack);
      // Life on Hit, plus Paladin 6: Consecration (holy damage heals you), plus crit heals
      const low = att.hp < att.maxHp / 2;
      const lifeOnHit = (att.s.leech || 0) * (fx.lowLeechDouble && low ? 2 : 1) + (fx.consecrate ? holyPart : 0) + (crit && fx.critHeal ? fx.critHeal : 0);
      if (lifeOnHit > 0) { const h = heal(att, lifeOnHit); if (h) push({ type: 'heal', src: att.id, amount: h }, att); }
      // Thorns and Retaliate hurt the attacker
      const back = (def.thorns || 0) + (dfx.retaliate || 0);
      if (back && att.alive && !counter) {
        const rb = damage(att, back, def);
        push({ type: 'thorns', src: def.id, tgt: att.id, amount: rb.dealt }, att);
        afterDamage(att, def);
      }
      if (att.s.healEvery && att.hitsLanded % att.s.healEvery.n === 0) {
        const h = heal(att, att.s.healEvery.amount);
        if (h) push({ type: 'heal', src: att.id, amount: h }, att);
      }
      if (crit && fx.critMana) addMana(att, fx.critMana);
      // Thieves take gold on every hit and keep fighting
      if (att.steal && att.alive) {
        att.stolen += att.steal; result.goldStolen += att.steal;
        push({ type: 'steal', src: att.id, amount: att.steal });
      }
      afterDamage(def, att);
      if (def.alive) {
        applyBleed(def, Math.max(att.s.bleed || 0, crit && fx.critBleed ? fx.critBleed : 0, ambush ? (fx.cheapBleed || SH.bleed) : 0), att);
        if (roll(att.s.stun) || (fx.fourthStun && att.hitsLanded % fx.fourthStun === 0)) stun(att, def, crit ? CB.critStun : 1);   // a crit stun lasts longer
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
    for (const f of fighters) if (f.invis) push({ type: 'stealth_on', src: f.id, label: 'Night Lord' });
    const maxTime = opts.maxTime || CB.maxTime;

    while (t < maxTime && !done()) {
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
        const ffx = f.s.fx || {};
        // Shadow: every few seconds the next attack is a Cheap Shot
        if (f.s.spec === 'shadow' && !f.cheapShot && t >= f.nextCheap) {
          f.cheapShot = true; f.nextCheap = t + (ffx.cheapEvery || SH.every);
          push({ type: 'cheap_ready', src: f.id });
        }
        if (f.invis && t >= f.invisUntil) { f.invis = false; push({ type: 'stealth_off', src: f.id }); }
        // Phoenix Heart cost: 1 burn damage a second
        if (t >= f.selfBurnNext) {
          f.selfBurnNext = t + 1;
          const r = damage(f, PX.selfBurn, null);
          push({ type: 'burn', tgt: f.id, amount: r.dealt, self: true }, f);
          afterDamage(f, null);
          if (!f.alive) continue;
        }
        // Night Lord mark pops for half the damage dealt during it
        if (f.mark && t >= f.mark.until) {
          const m = f.mark; f.mark = null;
          const pop = 2 * Math.floor(m.dmg / 4);
          if (pop > 0) {
            const r = damage(f, pop, null);
            push({ type: 'spellhit', src: m.by.id, tgt: f.id, amount: r.dealt, absorbed: r.absorbed, name: 'Night Lord' }, f);
            afterDamage(f, m.by);
            if (!f.alive) continue;
          }
        }
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
        const spd = f.s.spd + (fx.shieldSpd && f.shield > 0 ? fx.shieldSpd : 0) + (fx.lowSpd && f.hp < f.maxHp / 2 ? fx.lowSpd : 0);
        f.nextAtk = t + 10 / spd;
        attack(f);
      }
    }

    let timeout = false;
    if (!A.alive) winner = 'b';
    else if (!fighters.some(f => f.side === 'b' && f.alive)) winner = 'a';
    else {
      timeout = true;
      result.draw = !!opts.pvp;   // player fights that run out of time: both lose
      const bs = fighters.filter(f => f.side === 'b' && f.alive);
      const bf = bs.reduce((x, f) => x + f.hp, 0) / Math.max(1, bs.reduce((x, f) => x + f.maxHp, 0));
      winner = A.hp / A.maxHp >= bf ? 'a' : 'b';
      push({ type: 'timeout' });
    }
    const B0 = fighters.find(f => f.side === 'b');
    return {
      events, tracks, fighters: meta, winner, timeout, duration: t,
      aHp: Math.max(0, A.hp), bHp: B0 ? Math.max(0, B0.hp) : 0,
      revived: result.revived, goldStolen: result.goldStolen, bloodrage: result.bloodrage, phoenixWin: result.phoenixWin, draw: !!result.draw,
    };
  }

  G.simulateFight = (a, b, o) => { const r = simulateFight(a, b, o); if (G._fightLog) G._fightLog.push(r.duration); return r; };
})(window.G);
