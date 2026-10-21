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

  // A plain stat block for allies (Ghoulgrip's ghouls)
  function allyStats(hp, dmg) {
    return { maxHp: hp, dmg, spd: 10, atkSpd: 1, armor: 0, ward: 0, dodge: 0, crit: 0, critDmg: 0, stun: 0, leech: 0, bleed: 0, shield: 0,
      holy: 0, pierce: 0, manaGain: 0, startMana: 0, spec: null, gem: null, spell: null, fx: {}, type: 'phys', range: 'melee' };
  }

  function simulateFight(sa, sb, opts = {}) {
    const CB = C();
    const SH = G.SPECS.shadow.params, DU = G.SPECS.duelist.params, BE = G.SPECS.berserker.params, BT = G.SPECS.bloodthirst.params;
    const rng = new G.RNG(opts.seed != null ? opts.seed : G.newSeed());
    const roll = n => n > 0 && rng.int(1, 100) <= n;
    const events = [], tracks = {}, fighters = [], meta = [];
    let seq = 0, t = 0;

    function mk(side, spec, pos, extra = {}) {
      const s = spec.s;
      const f = {
        id: side === 'a' ? (spec.ally ? 'g' + (seq++) : 'a') : 'b' + (seq++), side, s, name: spec.name, pos, owner: spec.owner || null, ally: !!spec.ally,
        hp: spec.hp != null ? Math.min(spec.hp, s.maxHp) : s.maxHp, maxHp: s.maxHp, maxHp0: s.maxHp,
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
        steal: spec.steal || 0, stolen: 0, split: spec.split || null, isBoss: !!spec.boss,
        range: CB.ranges[s.range || 'melee'] || 1,
        // v0.1: hybrids, relics and artifacts
        empower: 0, haste: [], sureHits: (s.fx && s.fx.sureHits) || 0, healCutUntil: -1, sentinelUsed: false, sentinelPending: false,
        shoveNext: 0, beamSec: 0, nextBeam: s.fx && s.fx.beam ? (s.fx.beam.every || 1) : Infinity, beamTarget: null, bleedBy: null,
        nextStomp: s.fx && s.fx.stomp ? s.fx.stomp.every : Infinity, nextPulse: 1, drained: 0,
        butcher: 0, charge: 0, blockCount: 0, frenzyUntil: -1, nextFrenzy: s.fx && s.fx.frenzy ? s.fx.frenzy.every : Infinity,
        wallStunNext: 0, hex: 0, hexUntil: -1, sunderUntil: -1, sunderFx: null, primedUsed: false,
        nextRing: s.fx && s.fx.fireRing ? s.fx.fireRing.start : Infinity, executedBoss: false,
        // v0.25: relics, snakes, new bosses, the Phoenix egg
        isElite: !!spec.isElite, raiseSpec: spec.raiseSpec || null, raised: false, poisonGain: 0,
        pxBurn: 0, pxBurnUntil: -1, pxNextBurn: Infinity, pxBy: null,
        chill: 0, chillReadyAt: 0, mired: 0, gauzeAt: -1, gauzeReady: 0, egg: false, eggUntil: -1,
        fadeNext: s.fx && s.fx.packFade ? s.fx.packFade.every : Infinity,
        // v0.28: weapon traits, poison in fights, Night Lord mark, Aegis rebuild, Paladin shield burst
        riposte: false, rend: 0, fpoison: 0, nextPoison: Infinity, nightInvis: !!(s.fx && s.fx.nightLord), markUsed: false,
        shield0: s.shield || 0, aegisRebuildAt: -1, aegisRebuilt: false, palBurstUsed: false, palBurstPending: false, bladePoison: 0,
        // v0.32: legendary affixes, Exile's root
        hitStacks: 0, stunBlockReady: 0, stunUntil: -1, rootUntil: -1,
        ...extra,
      };
      fighters.push(f);
      tracks[f.id] = [[t, pos]];
      meta.push({ id: f.id, side, name: spec.name, sprite: spec.sprite, tint: spec.tint, scale: spec.scale || 1,
        maxHp: f.maxHp, hp: f.hp, shield: f.shield, mana: f.mana, hasMana: !!(s.spell && s.manaGain > 0),
        bornAt: t, ally: !!spec.ally, look: spec.look || null, weapon: spec.weapon || null, range: s.range || 'melee', type: s.type || 'phys' });
      return f;
    }

    const A = mk('a', { s: sa, name: opts.aName || 'You', hp: opts.aHp, revive: opts.aRevive }, 0);
    toSpecs(sb).forEach(sp => mk('b', { ...sp, revive: sp.revive != null ? sp.revive : opts.bRevive }, CB.startGap));
    // Ghoulgrip: ghouls rise beside whoever wears it (monster fights, duels and the tournament)
    for (const owner of fighters.slice()) {
      const GS = owner.s.fx && owner.s.fx.ghoulSummon;
      if (!GS || owner.ally) continue;
      for (let i = 0; i < GS.count; i++) {
        const gs = allyStats(Math.max(4, 2 * Math.round(owner.s.maxHp * GS.hpPct / 200)), Math.max(2, 2 * Math.round(owner.s.dmg * GS.dmgPct / 200)));
        mk(owner.side, { s: gs, name: 'Ghoul', sprite: 'monster_ghoul', ally: true, owner, scale: 0.8 }, owner.pos + (owner.side === 'a' ? 0.5 : -0.5));
      }
    }
    // The fight is between the main fighters: allies don't keep it going
    const mainB = () => fighters.filter(f => f.side === 'b' && f.alive && !f.ally);
    const result = { revived: { a: false, b: false }, goldStolen: 0, bloodrage: { a: 0, b: 0 }, phoenixWin: null };
    const POISON_CAP = (G.CONFIG.poison && G.CONFIG.poison.fightCap) || 50;
    const PVP = opts.pvp ? G.CONFIG.arena.damageMult : 1;   // duels and the tournament: half damage
    const pending = [];   // delayed actions (Echo recasts)
    const PX = G.CONFIG.phoenix;

    const snap = (...fs) => { const h = {}; for (const f of fs) if (f) h[f.id] = [Math.max(0, f.hp), f.shield, Math.round(f.mana), f.maxHp]; return h; };
    // Arena walls (Kiting can step past the start lines up to here)
    const WALL_L = -CB.kiteEdge, WALL_R = CB.startGap + CB.kiteEdge;
    const clampPos = x => Math.max(WALL_L, Math.min(WALL_R, x));
    // Sunder lowers Armor and Magic Resist for a few seconds
    const sunderShred = f => (f.sunderUntil >= t && f.sunderFx ? f.sunderFx.shred : 0);
    const wardOf = f => (f.egg ? 0 : Math.max(0, (f.s.ward || 0) - sunderShred(f)));
    const armorOf = f => (f.egg ? 0 : Math.max(0, (f.s.armor || 0) - (f.shredUntil >= t ? f.shred : 0) - sunderShred(f)));
    // Spell damage: Magic Resist cuts it, unless the caster deals physical damage (Inferno), then Armor does
    const spellCut = (f, d) => (f.s.fx && f.s.fx.physical ? Math.max(0, armorOf(d) - (f.s.pierce || 0)) : wardOf(d));
    // A Phoenix egg has none of its owner's stats or effects
    const fxOf = f => (f.egg ? {} : (f.s.fx || {}));
    // Unbound: crowd control just bounces off and makes you angrier
    function ccBlocked(def) {
      const fx = def.s.fx || {};
      if (!fx.ccImmune) return false;
      def.dmgBonus += fx.ccImmune;
      push({ type: 'shrug', src: def.id, amount: fx.ccImmune });
      return true;
    }
    // A damage hit from an effect (beam, stomp, pulse, fire...). Applies reductions the caller already did.
    function fxHit(att, def, amount, name) {
      if (!def.alive) return 0;
      const r = damage(def, amount, att);
      push({ type: 'fxhit', src: att ? att.id : null, tgt: def.id, amount: r.dealt, absorbed: r.absorbed, name }, def);
      afterDamage(def, att);
      return r.dealt;
    }
    const push = (e, ...fs) => { e.t = t; e.h = snap(...fs); events.push(e); };
    const foes = f => fighters.filter(x => x.alive && x.side !== f.side);
    // Heroes go for the first enemy they can see (wolves that fade out are skipped while another is visible)
    // Monsters go for the closest of you (your ghouls stand in front); you're the target when nothing else is near
    const target = f => {
      if (f.side === 'b') {
        if (!A.alive) return null;
        let best = A, bd = Math.abs(A.pos - f.pos) - 0.01;
        for (const x of fighters) if (x.ally && x.side === 'a' && x.alive && !x.invis) { const d = Math.abs(x.pos - f.pos); if (d < bd) { best = x; bd = d; } }
        return best;
      }
      const fs = foes(f); return fs.find(x => !x.invis) || fs[0] || null;
    };

    // Grave Salt: the strongest one among your enemies cuts your healing by its %
    const healCutPct = f => { let p = 0; for (const x of fighters) if (x.alive && x.side !== f.side && x.s.fx && x.s.fx.antiHeal) p = Math.max(p, x.s.fx.antiHeal); return p; };
    function heal(f, amount) {
      if (!f.alive || f.egg || amount <= 0 || f.s.gem === 'gaia') return 0;
      if (f.healCutUntil >= t) amount = Math.floor(amount / 2);
      const cut = healCutPct(f);
      if (cut) amount = Math.round(amount * (1 - cut / 100));
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
      if (def.s.gem === 'devil') amt *= G.CONFIG.devilTaken || 1.5;
      // Hexglass: cursed targets take more from everything
      if (def.hexUntil >= t && def.hex) amt = Math.round(amt * (1 + def.hex * def.hexPct / 100));
      // Relics: Giant's Knucklebone (bosses and elites), Poacher's Snare (healthy targets), Gravedigger's Spade (dying ones)
      if (att && !att.egg && att.s.fx) {
        const afx = att.s.fx;
        let pct = 0;
        if (afx.bigDmg && (def.isBoss || def.isElite)) pct += afx.bigDmg;
        if (afx.freshDmg && def.hp >= def.maxHp * 0.8) pct += afx.freshDmg;
        if (afx.lowDmg && def.hp < def.maxHp * 0.3) pct += afx.lowDmg;
        if (pct) amt = Math.round(amt * (1 + pct / 100));
      }
      if (PVP !== 1) amt = Math.max(1, 2 * Math.round(amt * PVP / 2));
      let absorbed = 0;
      if (def.shield > 0) {
        if (att && att.shieldBreak) {
          const used = Math.min(def.shield, amt * 2);
          def.shield -= used; absorbed = Math.ceil(used / 2); amt -= absorbed;
        } else { absorbed = Math.min(def.shield, amt); def.shield -= absorbed; amt -= absorbed; }
        // Sentinel: the shield breaking sets off a burst (handled in afterDamage)
        if (def.shield <= 0 && def.s.fx && def.s.fx.sentinelBurst && !def.sentinelUsed) { def.sentinelUsed = true; def.sentinelPending = true; }
        // Paladin 4: the shield breaking explodes for its starting size as holy damage
        if (def.shield <= 0 && def.s.fx && def.s.fx.shieldBurst && !def.palBurstUsed && def.shield0 > 0) { def.palBurstUsed = true; def.palBurstPending = true; }
        // Aegis: rebuilds once, a few seconds after it breaks
        if (def.shield <= 0 && def.s.fx && def.s.fx.aegisRebuild && !def.aegisRebuilt && def.aegisRebuildAt < 0) def.aegisRebuildAt = t + def.s.fx.aegisRebuild.secs;
      }
      // Heart of Stone: each attacker's hits to health deal 1 more than that attacker's last, up to the cap
      // (and for the first few seconds of a fight, every hit deals just 1)
      if (amt > 0 && def.s.gem === 'stone' && !def.egg) {
        // 1 per hit for the first 5 seconds, 2 for the next 5, then 3 for the rest of the fight
        const SG = G.CONFIG.stoneGrace;
        amt = t < SG ? 1 : t < 2 * SG ? Math.min(amt, 2) : Math.min(amt, G.CONFIG.stoneCrack);
      }
      def.hp -= amt;
      // Penitent: damage you take charges your next hit
      if (amt > 0 && def.s.fx && def.s.fx.penitent && !def.egg) def.charge = Math.min(def.s.fx.penitent, def.charge + Math.round(amt / PVP));   // charges at full value in player fights
      // Bloody Gauze: 2 seconds after taking damage, heal (at most once every 3 seconds)
      if (amt > 0 && def.s.fx && def.s.fx.gauze && !def.egg && t >= def.gauzeReady) { def.gauzeAt = t + 2; def.gauzeReady = t + 3; }
      // Berserker: Undying Rage keeps you at 1 for a few seconds (never as an egg)
      if (def.hp <= 0 && def.undyingUntil >= t && !def.egg) def.hp = 1;
      if (def.mark && att && def.mark.by === att && amt > 0) def.mark.dmg += amt;
      return { dealt: amt, absorbed };
    }

    function afterDamage(def, att) {
      // The Phoenix egg: no effects at all. It cracks for good at 0.
      if (def.egg) {
        if (def.hp > 0 || !def.alive) return;
        def.alive = false; def.egg = false;
        push({ type: 'death', tgt: def.id, src: att ? att.id : null }, def);
        return;
      }
      if (def.hp > 0 && def.palBurstPending) {
        def.palBurstPending = false;
        const tg = att && att.alive && att.side !== def.side ? att : target(def);
        push({ type: 'palburst', src: def.id });
        if (tg) for (const x of foes(def)) fxHit(def, x, Math.max(CB.minHit, def.shield0 - wardOf(x)), 'Holy Burst');
      }
      if (def.hp > 0 && def.sentinelPending) {
        def.sentinelPending = false;
        const SB = def.s.fx.sentinelBurst, tg = att && att.alive && att.side !== def.side ? att : target(def);
        def.firstCrits += SB.crits;
        push({ type: 'sentinel', src: def.id });
        if (tg) fxHit(def, tg, Math.max(CB.minHit, SB.dmg - wardOf(tg)), 'Sentinel');
      }
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
      // Phoenix Heart: explode on death and burn them. If that clears the fight, you stand back up;
      // otherwise you curl up in an egg with half your health. If they all die before it cracks, you hatch.
      if (def.s.gem === 'phoenix' && !def.exploded) {
        def.exploded = true;
        phoenixBurst(def);
        if (!foes(def).some(x => !x.ally)) {
          def.hp = PX.standUp; result.phoenixWin = def.side;
          push({ type: 'revive', src: def.id }, def);
          return;
        }
        def.egg = true; def.eggUntil = t + (PX.eggSeconds || 5);
        def.hp = Math.max(1, Math.floor(def.maxHp * (PX.eggHpPct || 50) / 100));
        def.shield = 0; def.mana = 0; def.nextAtk = Infinity; def.selfBurnNext = Infinity;
        def.invis = false; def.bleedUntil = -1; def.burnUntil = -1; def.dashTo = null;
        push({ type: 'egg', src: def.id, secs: PX.eggSeconds || 5 }, def);
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
        const dealt = trueDamage(d, PX.burst);
        push({ type: 'spellhit', src: f.id, tgt: d.id, amount: dealt, absorbed: 0, name: 'Rebirth' }, d);
        afterDamage(d, f);
        if (d.alive && PX.burn) { d.pxBurn = PX.burn; d.pxBurnUntil = t + PX.burnSeconds + 0.01; d.pxNextBurn = t + 1; d.pxBy = f; }
      }
    }

    // True damage (Phoenix Heart): ignores Shields, Heart of Stone and every reduction. Player fights still quarter it.
    // True damage (Phoenix Heart): ignores Armor and Magic Resist only. Shields take it at its raw number,
    // and Heart of Stone still applies (that's part of damage())
    function trueDamage(def, amt) {
      return damage(def, amt, null).dealt;
    }
    function applyBleed(def, amount, att) {
      if (amount <= 0 || !def.alive) return;
      if (def.bleedUntil < t) def.nextBleed = t + 1;
      if (amount >= def.bleed || def.bleedUntil < t) def.bleedBy = att || null;
      def.bleed = Math.max(def.bleed, amount);
      def.bleedUntil = t + 3;
      // Rending: bleeding lowers Armor
      const shred = att && att.s.fx && att.s.fx.bleedShred;
      if (shred) { def.shred = shred; def.shredUntil = def.bleedUntil; }
    }
    // Stuns can't chain: after one, the target can't be stunned again for a few seconds
    function stun(att, def, secs = 1, ignoreLimit = false) {
      if (!def.alive) return false;
      if (def.s.fx && def.s.fx.stunImmune) { ccBlocked(def); return false; }
      if (!ignoreLimit && t < def.stunImmuneUntil) return false;
      // Steadfast (legendary legs): one stun every few seconds just bounces off
      const sb = def.s.fx && def.s.fx.stunBlock;
      if (sb && t >= def.stunBlockReady) { def.stunBlockReady = t + sb; push({ type: 'stunblock', src: def.id }); return false; }
      def.nextAtk = Math.max(def.nextAtk, t + secs);
      def.stunUntil = Math.max(def.stunUntil, t + secs);
      if (!ignoreLimit) def.stunImmuneUntil = t + secs + CB.stunImmune;
      push({ type: 'stun', src: att.id, tgt: def.id, secs });
      return true;
    }
    // Knockback, pull or shove: move a fighter to a spot. Returns true if it hit the wall.
    function displace(def, to) {
      const c = clampPos(to);
      def.dashTo = c;
      return c !== to;
    }

    // recastSp: Twincast (legendary staff) casting the same spell again: the hits only, no mana or side effects
    function cast(f, recastSp) {
      const sp = recastSp || f.s.spell, fx = f.s.fx || {};
      // Wraith King: Raise Dead calls more ghouls (once)
      if (sp.raise) {
        f.mana = 0; f.raised = true;
        push({ type: 'raise', src: f.id }, f);
        for (let i = 0; i < sp.raise && f.raiseSpec; i++) {
          const child = mk('b', f.raiseSpec, f.pos);
          child.nextAtk = t + 0.6 + i * 0.15;
          push({ type: 'spawn', src: child.id, parent: f.id }, child);
        }
        return;
      }
      const tgts = (sp.aoe ? foes(f) : [target(f)].filter(Boolean)).filter(x => !x.invis);
      push({ type: 'cast', src: f.id, name: sp.name + (recastSp ? ' (Twincast)' : ''), aoe: sp.aoe, tgts: tgts.map(x => x.id) }, f);
      const scrit = fx.spellCrit && roll(f.s.crit);
      for (const d of tgts) {
        if (!d.alive) continue;
        const raw = sp.dmg * (scrit ? 2 : 1);
        const r = damage(d, Math.max(CB.minHit, raw - spellCut(f, d)), f);
        push({ type: 'spellhit', src: f.id, tgt: d.id, amount: r.dealt, absorbed: r.absorbed, name: sp.name, crit: !!scrit }, d);
        afterDamage(d, f);
        if (!d.alive) continue;
        // Spellbrand: Sunder slows and lowers resistances
        if (sp.sunder) {
          const S = fx.sunder;
          d.sunderUntil = t + S.secs;
          d.sunderFx = { shred: S.shred, slow: (d.s.fx && d.s.fx.ccImmune) ? 0 : S.slow };
          if (d.s.fx && d.s.fx.ccImmune) ccBlocked(d);
          push({ type: 'sunder', src: f.id, tgt: d.id });
        }
        // Hexglass: each Firebolt curses the target
        if (fx.hex && sp.name === 'Firebolt') {
          d.hex = Math.min(fx.hex.max, (d.hexUntil >= t ? d.hex : 0) + 1);
          d.hexUntil = t + fx.hex.secs; d.hexPct = fx.hex.pct;
          push({ type: 'hex', src: f.id, tgt: d.id, stacks: d.hex });
        }
        // Searing (legendary wand): Firebolt burns for a share of the target's max health
        if (fx.boltBurn && sp.name === 'Firebolt') {
          const b = Math.max(1, Math.ceil(d.maxHp * fx.boltBurn.pct / 100));
          if (d.burnUntil < t) d.nextBurn = t + 1;
          d.burn = Math.max(d.burnUntil >= t ? d.burn : 0, b); d.burnUntil = Math.max(d.burnUntil, t + fx.boltBurn.secs + 0.01);
          push({ type: 'sear', src: f.id, tgt: d.id });
        }
        // Exile: Banish knocks the target back and roots it (it can still attack, it just can't move)
        // A Twincast repeat doesn't knock back again: it extends the root by its length instead (2 seconds in all)
        if (sp.banish && recastSp && !(d.s.fx && d.s.fx.ccImmune)) {
          const add = sp.banish.root;
          d.rootUntil = d.rootUntil > t ? d.rootUntil + add : t + add;
          push({ type: 'root', src: f.id, tgt: d.id, secs: Math.round((d.rootUntil - t) * 10) / 10, delay: 0, extend: true });
        } else if (sp.banish && !ccBlocked(d)) {
          const dir = Math.sign(d.pos - f.pos) || (f.side === 'a' ? 1 : -1);
          const before = d.pos, wall = displace(d, d.pos + dir * sp.banish.push);
          const travel = Math.abs((d.dashTo != null ? d.dashTo : before) - before) / 10;   // knockbacks move 10 steps a second
          d.rootUntil = Math.max(d.rootUntil, t + travel + sp.banish.root);
          push({ type: 'root', src: f.id, tgt: d.id, secs: sp.banish.root, delay: travel, slam: wall });
        }
      }
      if (recastSp) return;
      f.mana = 0;
      if (fx.primedMana && !f.primedUsed) { f.primedUsed = true; f.mana = fx.primedMana; }
      if (fx.spellShield) { f.shield += fx.spellShield; push({ type: 'shieldup', src: f.id, amount: fx.spellShield }, f); }
      if (fx.empower) f.empower = fx.empower.hits;
      if (fx.echo) pending.push({ at: t + 1, f, sp });
      if (fx.doubleCast) pending.push({ at: t + 0.4, f, sp, recast: true });   // Twincast
      if (fx.spellHeal) { const h = heal(f, fx.spellHeal); if (h) push({ type: 'heal', src: f.id, amount: h }, f); }
      if (fx.spellStack) f.dmgBonus += fx.spellStack;
    }

    // Mage 6: Echo recasts the spell for half damage, without using mana
    function echo(f, sp) {
      if (!f.alive || f.egg) return;
      const tgts = sp.aoe ? foes(f) : [target(f)].filter(Boolean);
      if (!tgts.length) return;
      const half = Math.max(CB.minHit, 2 * Math.round(sp.dmg / 4));
      push({ type: 'cast', src: f.id, name: sp.name + ' (Echo)', aoe: sp.aoe, tgts: tgts.map(x => x.id), echo: true }, f);
      for (const d of tgts) {
        if (!d.alive) continue;
        const r = damage(d, Math.max(CB.minHit, half - spellCut(f, d)), f);
        push({ type: 'spellhit', src: f.id, tgt: d.id, amount: r.dealt, absorbed: r.absorbed, name: sp.name }, d);
        afterDamage(d, f);
      }
    }

    function addMana(f, n) {
      if (!f.s.spell || n <= 0 || !f.alive || f.egg || f.raised) return;
      f.mana = Math.min(CB.manaMax, f.mana + n);
      if (f.mana >= CB.manaMax) cast(f);
    }

    // One strike from att at def. counter = a Duelist riposte. Returns the damage dealt (for cleave).
    function strike(att, def, counter) {
      const fx = att.s.fx || {};
      const sure = fx.trueStrike || att.sureHits > 0;   // Truesight / Stalker: can't be dodged
      if (att.sureHits > 0) att.sureHits--;
      if (def.invis && !fx.trueStrike) { push({ type: 'hidden', src: att.id, tgt: def.id }); return 0; }
      const dfx = fxOf(def);
      const smoke = def.smokeUntil >= t && dfx.smokeDodge ? dfx.smokeDodge : 0;
      if (!sure && !def.egg && roll(Math.min(CB.dodgeCap + smoke, (def.s.dodge || 0) + def.parryDodge + smoke))) {
        // Parrying (legendary saber): the dodge becomes a parry that strikes back, stuns and heals
        if (dfx.dodgeParry && !counter && def.alive) {
          push({ type: 'parry', src: att.id, tgt: def.id });
          const h = heal(def, dfx.dodgeParry.heal); if (h) push({ type: 'heal', src: def.id, amount: h, label: 'Parry' }, def);
          stun(def, att, dfx.dodgeParry.stun);
          if (att.alive) strike(def, att, true);
          return 0;
        }
        push({ type: 'dodge', src: att.id, tgt: def.id });
        if (dfx.afterDodge) def.nextHitBonus = dfx.afterDodge;
        if (dfx.riposte) def.riposte = true;   // Saber: the next hit deals +50%
        // Skirmisher: dodging speeds you up
        if (dfx.dodgeHaste) { def.haste.push(t + dfx.dodgeHaste.secs); if (def.haste.length > dfx.dodgeHaste.max) def.haste.shift(); }
        return 0;
      }
      // Dawnwall: every few hits against you are blocked and answered
      if (dfx.dawnwall && !counter) {
        def.blockCount++;
        if (def.blockCount % dfx.dawnwall.every === 0) {
          push({ type: 'block', src: def.id, tgt: att.id });
          fxHit(def, att, Math.max(CB.minHit, dfx.dawnwall.dmg - wardOf(att)), 'Dawnwall');
          if (att.alive) stun(def, att, dfx.dawnwall.stun);
          return 0;
        }
      }
      if (!counter && def.s.spec === 'duelist' && !fx.trueStrike && !def.egg) {
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
      // Clear-eyed (legendary helmet): some crits land as normal hits
      if (crit && dfx.critGuard && roll(dfx.critGuard)) { crit = false; push({ type: 'critguard', src: def.id }); }
      let raw = att.s.dmg + att.dmgBonus + att.hurtBonus + att.nextHitBonus;
      att.nextHitBonus = 0;
      if (att.riposte) { att.riposte = false; raw = Math.round(raw * (1 + fx.riposte / 100)); }
      if (counter && fx.counterDmg) raw += fx.counterDmg;
      if (ambush && fx.cheapDmg) raw += fx.cheapDmg;
      if (att.s.spec === 'berserker') raw += Math.min(fx.berserkCap || CB.berserkCap, Math.floor((att.maxHp - att.hp) / BE.per) * BE.dmg);
      if (crit) raw = raw * 2 + (att.s.critDmg || 0) + (fx.critDmgFlat || 0);
      if (dfx.takeMore) raw += dfx.takeMore;
      const armor = def.egg ? 0 : Math.max(0, (def.s.armor || 0) - (def.shredUntil >= t ? def.shred : 0) - sunderShred(def));
      const ward = wardOf(def);
      const physCut = Math.max(0, armor - (att.s.pierce || 0));
      let amt;
      if (fx.splitDamage) amt = Math.max(CB.minHit, Math.max(0, Math.ceil(raw / 2) - physCut) + Math.max(0, Math.floor(raw / 2) - ward));   // Spellbrand
      else amt = att.s.type === 'magic' ? Math.max(CB.minHit, raw - ward) : Math.max(CB.minHit, raw - physCut);
      let holy = att.s.holy || 0;
      if (fx.executeHoly && def.hp < def.maxHp / 2) { holy += fx.executeHoly; if (fx.healCut) def.healCutUntil = t + fx.healCut; }
      // Penitent: release the stored charge as holy damage, and heal the same
      let penance = 0;
      if (fx.penitent && att.charge > 0) { penance = att.charge; att.charge = 0; holy += penance; }
      let holyPart = holy ? Math.max(0, holy - ward) : 0;
      if (fx.holyShield && def.shield > 0 && holyPart) holyPart += Math.min(def.shield, holyPart) * (fx.holyShield - 1);   // Radiant: holy doubled against Shields
      amt += holyPart;
      if (att.empowerNow) amt += Math.max(0, fx.empower.dmg - ward);   // Battle Mage
      const fourth = fx.everyFourthMagic && att.atkCount % 4 === 0;
      if (fourth) amt += Math.max(0, fx.everyFourthMagic - ward);
      if (fx.stunnedDmg && def.stunUntil > t) amt = Math.round(amt * (1 + fx.stunnedDmg / 100));   // Crushing (legendary hammer)
      const r = damage(def, amt, att);
      push({ type: 'hit', src: att.id, tgt: def.id, amount: r.dealt, absorbed: r.absorbed, crit, cheap: ambush, counter: !!counter, kind: att.s.type, ranged: att.range > 2, empowered: !!att.empowerNow }, att, def);
      att.hitsLanded++;
      if (fx.hitSpd && att.hitStacks < fx.hitSpd.max) att.hitStacks = Math.min(fx.hitSpd.max, att.hitStacks + fx.hitSpd.per);   // Relentless (legendary gloves)
      if (penance) { const h = heal(att, Math.max(1, Math.round(penance * PVP))); push({ type: 'penance', src: att.id, amount: penance, heal: h }, att); }
      if (fourth && fx.manaOnFourth) addMana(att, fx.manaOnFourth);
      // Ghoulgrip: drain max health and feed on the damage
      if (fx.ghoul && r.dealt > 0 && def.alive) {
        const G0 = fx.ghoul, cap = Math.floor(def.maxHp0 * G0.capPct);
        const take = Math.min(G0.drain, cap - def.drained);
        if (take > 0) { def.drained += take; def.maxHp -= take; def.hp = Math.min(def.hp, def.maxHp); }
        const h = heal(att, Math.floor(r.dealt * G0.healPct));
        push({ type: 'drain', src: att.id, tgt: def.id, amount: take, heal: h }, att, def);
      }
      if (!def.egg && def.s.fx && def.s.fx.hurtStack) def.hurtBonus = Math.min(def.s.fx.hurtCap, def.hurtBonus + def.s.fx.hurtStack);
      // Life on Hit, plus Paladin 6: Consecration (holy damage heals you), plus crit heals
      const low = att.hp < att.maxHp / 2;
      const lifeOnHit = (att.s.leech || 0) * (fx.lowLeechDouble && low ? 2 : 1) + (att.s.spec === 'bloodthirst' ? Math.floor(r.dealt * BT.pct / 100) : 0) + (fx.consecrate ? holyPart : 0) + (crit && fx.critHeal ? fx.critHeal : 0)
        + (fx.capHeal && att.hurtBonus >= (fx.hurtCap || 0) ? fx.capHeal : 0);
      if (lifeOnHit > 0) { const h = heal(att, lifeOnHit); if (h) push({ type: 'heal', src: att.id, amount: h }, att); }
      // Ghoulgrip ghouls: their hits heal you for half
      if (att.owner && att.owner.alive && r.dealt > 0) { const h = heal(att.owner, Math.floor(r.dealt / 2)); if (h) push({ type: 'heal', src: att.owner.id, amount: h }, att.owner); }
      // Thorns and Retaliate hurt the attacker
      const back = def.egg ? 0 : (def.thorns || 0) + (dfx.retaliate || 0);
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
      // Snake bites: poison that stays after the fight (up to the cap per fight)
      // Shadow: Poisoned Blade. Every hit poisons (up to the cap); poison hurts during the fight too
      if (fx.bladePoison && def.alive && !def.egg && !dfx.poisonImmune && def.fpoison < fx.bladePoison.cap) {
        def.fpoison = Math.min(fx.bladePoison.cap, def.fpoison + 1);
        if (def.nextPoison === Infinity) def.nextPoison = t + 2;
        if (opts.pvp) def.bladePoison = def.fpoison;   // a duel's poison stays with the loser and winner alike
      }
      // Night Lord: your first hit out of hiding marks the target; the mark bursts for half the damage it took
      if (att.nightInvis) {
        att.nightInvis = false;
        // Blinkfang's attacks don't break invisibility
        if (att.invis && !fx.stealthHits) { att.invis = false; att.invisUntil = -1; push({ type: 'stealth_off', src: att.id }); }
        if (!att.markUsed && def.alive) { att.markUsed = true; def.mark = { by: att, dmg: 0, until: t + 3 }; push({ type: 'mark', src: att.id, tgt: def.id }); }
      }
      // Snakes: only critical bites poison
      if (att.s.poison && crit && def.alive && def === A && !dfx.poisonImmune && def.poisonGain < POISON_CAP) {
        const add = Math.min(att.s.poison, POISON_CAP - def.poisonGain);
        def.poisonGain += add;
        push({ type: 'poison', src: att.id, tgt: def.id, amount: add, total: def.poisonGain });
      }
      // Frost Yeti: Chill builds to a freeze (which can't happen again for a few seconds)
      if (fx.chill && def.alive && t >= def.chillReadyAt) {
        def.chill++;
        if (def.chill >= fx.chill.stacks) {
          def.chill = 0; def.chillReadyAt = t + fx.chill.cooldown;
          push({ type: 'freeze', src: att.id, tgt: def.id, secs: fx.chill.secs });
          stun(att, def, fx.chill.secs, true);
        } else push({ type: 'chill', src: att.id, tgt: def.id, stacks: def.chill });
      }
      // Mire Beast: each hit slows the target's attacks
      if (fx.mire && def.alive && def.mired < fx.mire.max) {
        def.mired++; def.mirePct = fx.mire.pct;
        push({ type: 'mire', src: att.id, tgt: def.id, stacks: def.mired });
      }
      afterDamage(def, att);
      // Guillotine: execute below the threshold (bosses take a heavy hit once instead)
      if (def.alive && fx.execute && att.range <= 1 && def.hp < def.maxHp * fx.execute.pct) {
        if (def.isBoss) { if (!def.executedBoss) { def.executedBoss = true; fxHit(att, def, fx.execute.bossDmg, 'Guillotine'); } }
        else { def.hp = 0; push({ type: 'execute', src: att.id, tgt: def.id }, def); afterDamage(def, att); }
      }
      if (def.alive) {
        applyBleed(def, Math.max(att.s.bleed || 0, crit && fx.critBleed ? fx.critBleed : 0, ambush ? (fx.cheapBleed || SH.bleed) : 0), att);
        // Butcher: stacking bleed that pops at 10
        if (fx.butcher) {
          def.butcher++;
          if (def.bleedUntil < t) def.nextBleed = t + 1;
          def.bleed = Math.max(def.bleed, fx.butcher.perStack * def.butcher); def.bleedUntil = t + 3; def.bleedBy = att;
          if (def.butcher >= fx.butcher.pop) {
            const left = def.bleed * Math.max(1, Math.ceil(def.bleedUntil - t)) * (fx.butcher.popMult || 1);
            def.butcher = 0; def.bleed = 0; def.bleedUntil = -1;
            push({ type: 'pop', src: att.id, tgt: def.id });
            fxHit(att, def, left, 'Butcher');
          }
        }
        // Inferno: hits set the target burning
        if (def.alive && fx.burnHit) {
          if (def.burnUntil < t) def.nextBurn = t + 1;
          def.burn = Math.max(def.burnUntil >= t ? def.burn : 0, fx.burnHit.dmg); def.burnUntil = Math.max(def.burnUntil, t + fx.burnHit.secs + 0.01);
        }
        // Gale: every few shots knock the target back; into the wall = stunned
        if (def.alive && fx.gale && att.atkCount % fx.gale.every === 0 && !counter) {
          if (!ccBlocked(def)) {
            const dir = Math.sign(def.pos - att.pos) || (att.side === 'a' ? 1 : -1);
            const slam = displace(def, def.pos + dir * fx.gale.push);
            push({ type: 'knock', src: att.id, tgt: def.id, slam });
            if (slam && fx.gale.stun && t >= def.wallStunNext) { def.wallStunNext = t + fx.gale.cooldown; stun(att, def, fx.gale.stun, true); }
          }
        }
      }
      if (def.alive) {
        if (roll(att.s.stun) || (fx.fourthStun && att.hitsLanded % fx.fourthStun === 0)) stun(att, def, crit ? CB.critStun : 1);   // a crit stun lasts longer
        // Sword & Shield: Shield Bash every few hits (ignores the stun limit, so it combos)
        if (def.alive && fx.bash && att.hitsLanded % fx.bash === 0 && !counter) {
          push({ type: 'bash', src: att.id, tgt: def.id }); stun(att, def, 1, true);
          if (fx.bashShield) { att.shield += fx.bashShield; push({ type: 'shieldup', src: att.id, amount: fx.bashShield, label: 'Bastion' }, att); }   // Bastion (legendary sword & shield)
        }
      }
      return r.dealt;
    }

    function attack(att) {
      const def = target(att);
      if (!def) return;
      att.atkCount++;
      const fx = att.s.fx || {};
      const twin = fx.twinStrike && att.atkCount % fx.twinStrike === 0;   // Twinned (legendary daggers)
      const shots = (fx.doubleShot && att.atkCount % fx.doubleShot === 0) || twin ? 2 : 1;
      if (shots === 2) push({ type: 'double', src: att.id, twin: !!twin });
      for (let i = 0; i < shots; i++) {
        const d = target(att);
        if (!d || !att.alive) break;
        att.empowerNow = att.empower > 0;
        if (att.empowerNow) att.empower--;
        const dealt = strike(att, d, false);
        // Volley (legendary shortbow): every few shots a second arrow for half damage
        if (fx.volley && i === 0 && att.atkCount % fx.volley === 0 && dealt > 0 && d.alive) fxHit(att, d, Math.max(CB.minHit, 2 * Math.round(dealt / 4)), 'Volley');
        const cleaves = att.s.cleave || att.empowerNow;
        att.empowerNow = false;
        if (cleaves && dealt > 0) {
          const second = foes(att).find(x => x !== d);
          // Great Axe: Rend. With no second target, the cleave feeds a growing bleed instead
          if (!second && fx.rend && d.alive) {
            d.rend = Math.min(fx.rend.cap, (d.bleedUntil >= t ? d.rend : 0) + fx.rend.step);
            applyBleed(d, (att.s.bleed || 0) + d.rend, att);
          }
          if (second) {
            const r = damage(second, fx.cleaveFull ? dealt : Math.max(CB.minHit, Math.floor(dealt / 2 / 2) * 2), att);
            push({ type: 'hit', src: att.id, tgt: second.id, amount: r.dealt, absorbed: r.absorbed, cleave: true }, second);
            afterDamage(second, att);
          }
        }
      }
      addMana(att, att.s.manaGain || 0);
    }

    const done = () => !A.alive || !mainB().length;
    let winner = null;
    for (const f of fighters) if (f.invis) push({ type: 'stealth_on', src: f.id, label: 'Night Lord' });
    // Openers: Blinkfang teleports in and stuns, Guillotine drags the target in
    for (const f of fighters) {
      const fx = f.s.fx || {};
      const tg = target(f);
      if (!tg) continue;
      const dir = Math.sign(tg.pos - f.pos) || 1;
      if (fx.blink) {
        f.pos = tg.pos - dir; tracks[f.id].push([t, f.pos]); tracks[f.id].push([t + 0.01, f.pos]);
        push({ type: 'blink', src: f.id, tgt: tg.id });
        stun(f, tg, fx.blink);
      }
      if (fx.pull && !ccBlocked(tg)) { displace(tg, f.pos + dir); push({ type: 'pull', src: f.id, tgt: tg.id }); }
      if (fx.fireRing) push({ type: 'firering', src: f.id, start: fx.fireRing.start, closed: fx.fireRing.closed });
    }
    const maxTime = opts.maxTime || CB.maxTime;

    while (t < maxTime && !done()) {
      t = Math.round((t + CB.dt) * 1000) / 1000;
      // Move into range (or finish a Kiting step back)
      for (const f of fighters) {
        if (!f.alive || f.egg) continue;
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
        if (f.rootUntil > t) continue;   // Exile's Banish: rooted fighters can't walk (they can still attack in range)
        if (d > f.range + 1e-6) {
          const step = Math.min((CB.moveSpeed + ((f.s.fx && f.s.fx.moveBonus) || 0)) * CB.dt, d - f.range);   // Swift (legendary boots)
          f.pos += tg.pos > f.pos ? step : -step;
          tracks[f.id].push([t, Math.round(f.pos * 100) / 100]);
        }
      }
      // Archer 6: Kiting. When a foe reaches melee range, step back 3.
      for (const f of fighters) {
        const kite = f.alive && !f.egg && f.s.fx && f.s.fx.kite;
        if (!kite || f.dashTo != null || t < f.kiteNext || f.rootUntil > t) continue;
        const near = foes(f).some(x => Math.abs(x.pos - f.pos) <= 1 + 1e-6);
        if (!near) continue;
        const foe = foes(f).filter(x => Math.abs(x.pos - f.pos) <= 1 + 1e-6)[0];
        const dir = Math.sign(f.pos - foe.pos) || (f.side === 'a' ? -1 : 1);
        let to = Math.max(-CB.kiteEdge, Math.min(CB.startGap + CB.kiteEdge, f.pos + dir * 3));
        // Backed against the wall: roll past the enemy and kite the other way
        if (Math.abs(to - f.pos) < 0.8) to = Math.max(-CB.kiteEdge, Math.min(CB.startGap + CB.kiteEdge, foe.pos - dir * 2.5));
        if (Math.abs(to - f.pos) < 0.8) continue;
        f.dashTo = to; f.kiteNext = t + kite;
        push({ type: 'kite', src: f.id });
      }
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= t) { const p = pending.splice(i, 1)[0]; if (p.recast) { if (p.f.alive && !p.f.egg) cast(p.f, p.sp); } else echo(p.f, p.sp); }
      for (const f of fighters) {
        if (!f.alive) continue;
        // The egg cracks if the fight isn't over in time
        if (f.egg) {
          if (t >= f.eggUntil) { f.hp = 0; f.alive = false; f.egg = false; push({ type: 'death', tgt: f.id, src: null }, f); }
          continue;
        }
        const ffx = f.s.fx || {};
        // Gaia's Embrace: heal 5 a second while any Shield holds (this ignores Gaia's no-healing rule)
        if (f.s.gem === 'gaia' && f.shield > 0 && !f.egg && t >= (f.gaiaNext || 1)) {
          f.gaiaNext = t + 1;
          const a = Math.min(f.maxHp - f.hp, Math.floor((G.CONFIG.gaiaRegen || 5) * (1 - healCutPct(f) / 100)));
          if (a > 0) { f.hp += a; push({ type: 'heal', src: f.id, amount: a, label: 'Gaia' }, f); }
        }
        // Aegis rebuilds its shield once
        if (f.aegisRebuildAt >= 0 && t >= f.aegisRebuildAt && !f.aegisRebuilt) {
          f.aegisRebuilt = true; f.aegisRebuildAt = -1;
          f.shield += ffx.aegisRebuild.amount; push({ type: 'shieldup', src: f.id, amount: ffx.aegisRebuild.amount, label: 'Aegis' }, f);
        }
        // Poison in a fight (Poisoned Blade): its stacks as damage every 2 seconds
        if (f.fpoison > 0 && t >= f.nextPoison) {
          f.nextPoison = t + 2;
          const r = damage(f, f.fpoison, null);
          push({ type: 'burn', tgt: f.id, amount: r.dealt, poison: true }, f);
          afterDamage(f, null);
          if (!f.alive) continue;
        }
        // Bloody Gauze
        if (f.gauzeAt >= 0 && t >= f.gauzeAt) {
          f.gauzeAt = -1;
          const h = heal(f, ffx.gauze || 0);
          if (h) push({ type: 'heal', src: f.id, amount: h, label: 'Bloody Gauze' }, f);
        }
        // Alpha Wolf's pack: fade out for a few seconds every few seconds
        if (t >= f.fadeNext) {
          f.fadeNext = t + ffx.packFade.every;
          f.invis = true; f.invisUntil = Math.max(f.invisUntil, t + ffx.packFade.secs);
          push({ type: 'stealth_on', src: f.id, label: 'Fade' });
        }
        // Heartlight: a beam that grows each second
        if (t >= f.nextBeam) {
          f.nextBeam = t + (ffx.beam.every || 1);
          const bt = target(f);
          if (bt !== f.beamTarget) { f.beamTarget = bt; f.beamSec = 0; }   // a new target starts the ramp over
          f.beamSec++;
          const tg = target(f);
          if (tg && !tg.invis) { const B = ffx.beam; const d = Math.min(B.cap, B.start + B.step * (f.beamSec - 1)); push({ type: 'beam', src: f.id, tgt: tg.id, power: d }); fxHit(f, tg, d, 'Heartlight'); }
        }
        // Quakestep: stomp every few seconds
        if (t >= f.nextStomp) {
          f.nextStomp = t + ffx.stomp.every;
          push({ type: 'stomp', src: f.id });
          for (const x of foes(f)) { fxHit(f, x, Math.max(CB.minHit, ffx.stomp.dmg - Math.max(0, (x.s.armor || 0))), 'Quakestep'); if (x.alive) stun(f, x, ffx.stomp.stun, true); }
        }
        // Aegis: pulses while its shield holds
        if (ffx.aegisPulse && f.shield > 0 && t >= f.nextPulse) {
          f.nextPulse = t + 1;
          push({ type: 'pulse', src: f.id });
          for (const x of foes(f)) fxHit(f, x, ffx.aegisPulse, 'Aegis');
        }
        // Hummingbird: a burst of speed every few seconds
        if (t >= f.nextFrenzy) { f.nextFrenzy = t + ffx.frenzy.every; f.frenzyUntil = t + ffx.frenzy.secs; push({ type: 'frenzy', src: f.id }); }
        // Inferno: fire closes in from both walls; enemies outside the safe middle burn
        if (t >= f.nextRing) {
          f.nextRing = t + 1;
          const R = ffx.fireRing, p = Math.min(1, (t - R.start) / (R.closed - R.start)), mid = (WALL_L + WALL_R) / 2;
          const lo = WALL_L + p * (mid - WALL_L), hi = WALL_R - p * (WALL_R - mid);
          for (const x of foes(f)) if (p >= 1 || x.pos < lo - 1e-6 || x.pos > hi + 1e-6) fxHit(f, x, R.dmg, 'Inferno');
        }
        if (!f.alive) continue;
        // Ranger: shove enemies that reach melee
        if (ffx.shove && t >= f.shoveNext && f.dashTo == null) {
          const near = foes(f).filter(x => Math.abs(x.pos - f.pos) <= 1 + 1e-6 && x.dashTo == null);
          if (near.length) {
            f.shoveNext = t + ffx.shove.every;
            for (const x of near) if (!ccBlocked(x)) { displace(x, x.pos + (Math.sign(x.pos - f.pos) || 1) * ffx.shove.push); push({ type: 'shove', src: f.id, tgt: x.id }); }
          }
        }
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
        if (f.pxBurnUntil >= t && t >= f.pxNextBurn) {
          f.pxNextBurn = t + 1;
          const d = trueDamage(f, f.pxBurn);
          push({ type: 'burn', tgt: f.id, amount: d, true: true }, f);
          afterDamage(f, f.pxBy && f.pxBy.alive ? f.pxBy : null);
          if (!f.alive) continue;
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
          // Hemorrhage: your bleed heals you for the damage it deals
          const by = f.bleedBy;
          if (by && by.alive && by.s.fx && by.s.fx.bleedHeal && r.dealt > 0) { const h = heal(by, Math.ceil(r.dealt * by.s.fx.bleedHeal / 100)); if (h) push({ type: 'heal', src: by.id, amount: h }, by); }
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
        let spd = f.s.spd + (fx.shieldSpd && f.shield > 0 ? fx.shieldSpd : 0) + (fx.lowSpd && f.hp < f.maxHp / 2 ? fx.lowSpd : 0);
        if (fx.dodgeHaste) { f.haste = f.haste.filter(x => x > t); spd += f.haste.length * fx.dodgeHaste.spd; }
        spd += f.hitStacks;   // Relentless: counts past the Attack Speed cap
        if (f.frenzyUntil >= t) spd = (spd - f.s.spd + (f.s.spdUncapped || f.s.spd)) * 2;   // Hummingbird: ignores the Attack Speed cap while active
        if (f.sunderUntil >= t && f.sunderFx) spd *= 1 - f.sunderFx.slow;
        if (f.mired) spd *= 1 - f.mired * (f.mirePct || 8) / 100;   // Mire Beast
        // Point blank: Longbow and Staff slow down with an enemy right next to them
        if (fx.pointBlank && Math.abs(tg.pos - f.pos) <= 1 + 1e-6) spd *= 1 - fx.pointBlank / 100;
        // Heart of Stone: its wearer's enemies attack slower
        if (tg.s.gem === 'stone' && !tg.egg) spd *= 1 - (G.CONFIG.stoneSlow || 15) / 100;
        f.nextAtk = t + 10 / spd;
        attack(f);
      }
    }

    // A Phoenix egg still standing when the other side is gone hatches
    for (const f of fighters) {
      if (!f.alive || !f.egg) continue;
      if (!fighters.some(x => x.alive && x.side !== f.side && !x.ally)) {
        f.egg = false; f.hp = PX.standUp; result.phoenixWin = f.side;
        push({ type: 'revive', src: f.id, hatch: true }, f);
      }
    }
    let timeout = false;
    if (!A.alive) winner = 'b';
    else if (!mainB().length) winner = 'a';
    else {
      timeout = true;
      result.draw = !!opts.pvp;   // player fights that run out of time: both lose
      const bs = mainB();
      const bf = bs.reduce((x, f) => x + f.hp, 0) / Math.max(1, bs.reduce((x, f) => x + f.maxHp, 0));
      winner = !A.egg && A.hp / A.maxHp >= bf ? 'a' : 'b';   // an unhatched egg loses on time
      push({ type: 'timeout' });
    }
    const B0 = fighters.find(f => f.side === 'b');
    return {
      events, tracks, fighters: meta, winner, timeout, duration: t,
      aHp: Math.max(0, A.hp), bHp: B0 ? Math.max(0, B0.hp) : 0,
      revived: result.revived, goldStolen: result.goldStolen, bloodrage: result.bloodrage, phoenixWin: result.phoenixWin, draw: !!result.draw,
      poison: A.alive ? A.poisonGain : 0,
      bladePoison: { a: A.bladePoison || 0, b: B0 ? B0.bladePoison || 0 : 0 },
    };
  }

  // _lastArgs: multiplayer sends a fight's exact inputs to spectators, who replay it locally
  G.simulateFight = (a, b, o) => { G._lastArgs = [a, b, o]; const r = simulateFight(a, b, o); if (G._fightLog) G._fightLog.push(r.duration); return r; };
})(window.G);
