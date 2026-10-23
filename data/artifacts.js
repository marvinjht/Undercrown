// Artifacts (red): one per armor slot and weapon type (two staffs). Fixed stats (one forge Strengthen allowed),
// a class tag, the slot's legendary affix (data/armor.js G.LEGEND_AFFIXES), and an effect that changes how you fight.
// You can wear only one, and each is unique per match.
// stats = flat stats on the item. fx = effect keys read by stats.js and combat.js.
// Weapons keep their weapon type's range, damage type and trait unless the artifact says otherwise.
window.G = window.G || {};

G.ARTIFACTS = {
  // ---------- Armor ----------
  heartlight: { name: 'Heartlight', slot: 'chest', cls: 'mage',
    stats: { hp: 40, ward: 6 }, fx: { beam: { start: 2, step: 2.5, cap: 100, every: 0.5 } },
    desc: 'From half a second in, a beam hits your target every half second: 2 damage, +2.5 more each tick, up to 100 a tick. Switching to a new target starts it over. Built to win long fights.' },
  truesight: { name: 'Truesight', slot: 'helmet', cls: 'archer',
    stats: { hp: 20, dmg: 15, crit: 8 }, fx: { trueStrike: 1 },
    desc: 'Your attacks can’t be dodged or parried, and they hit invisible enemies.' },
  quakestep: { name: 'Quakestep', slot: 'boots', cls: 'warrior', stubborn: true,
    stats: { hp: 25, armor: 5, dodge: 8, spd: 2 }, fx: { stomp: { every: 5, dmg: 30, stun: 2 } },
    desc: 'Every 5 seconds you stomp: 30 damage to every enemy and a 2-second stun.' },
  ghoulgrip: { name: 'Ghoulgrip', slot: 'gloves', cls: 'rogue',
    stats: { dmg: 5, spd: 3 }, fx: { ghoul: { drain: 2, capPct: 0.3, healPct: 0.5 }, ghoulSummon: { count: 2, hpPct: 15, dmgPct: 30 } },
    desc: 'Each hit drains 2 max health from the target (up to 30% of its max) and heals you for half the damage dealt. In every fight (duels and the tournament too), 2 ghouls rise beside you (15% of your health, 30% of your damage) and their hits heal you too.' },
  unbound: { name: 'Unbound', slot: 'legs', cls: 'paladin',
    stats: { hp: 50, armor: 10 }, fx: { ccImmune: 4, stunImmune: 1 },
    desc: 'You can’t be stunned, slowed, knocked back or pulled. Each effect you shrug off gives +4 Damage for the fight.' },

  // ---------- Weapons ----------
  butcher: { name: 'Butcher', slot: 'weapon', weaponType: 'saber', cls: 'rogue',
    stats: { dmg: 15, spd: 14, dodge: 8 }, fx: { butcher: { perStack: 3, pop: 6, popMult: 2 } },
    desc: 'Each hit adds a bleed stack (3 a second each). At 6 stacks the target pops for double the bleed left, all at once.' },
  blinkfang: { name: 'Blinkfang', slot: 'weapon', weaponType: 'daggers', cls: 'rogue',
    stats: { dmg: 10, spd: 18, crit: 10 }, fx: { blink: 0.5, firstCrits: 2, stealthHits: 1 },
    desc: 'At the start you teleport to your target and stun it for half a second. Your first 2 attacks crit, and your attacks don’t break invisibility.' },
  aegis: { name: 'Aegis', slot: 'weapon', weaponType: 'swordShield', cls: 'paladin',
    stats: { dmg: 10, spd: 10, armor: 4, shield: 100 }, fx: { aegisPulse: 16, aegisRebuild: { secs: 4, amount: 50 } },
    desc: 'Start fights with Shield 100 (adds to other Shields). While it holds, it pulses 16 damage to every enemy each second. Once per fight, 4 seconds after it breaks, it rebuilds to 50.' },
  spellbrand: { name: 'Spellbrand', slot: 'weapon', weaponType: 'longsword', cls: 'mage',
    stats: { dmg: 20, spd: 8, manaGain: 25 }, fx: { splitDamage: 1, sunder: { dmg: 45, slow: 0.5, shred: 20, secs: 4 } },
    desc: 'Hits are half physical, half magic. Attacks add 25 mana; at full it casts Sunder: 45 magic damage, −50% Attack Speed and −20 Armor and Magic Resist for 4 seconds.' },
  guillotine: { name: 'Guillotine', slot: 'weapon', weaponType: 'greatAxe', cls: 'warrior',
    stats: { dmg: 21, spd: 8, bleed: 5 }, fx: { pull: 1, execute: { pct: 0.15, bossDmg: 50 } },
    desc: 'At the start you pull your target into melee. Hits on an enemy below 15% health execute it. Bosses take 50 damage instead.' },
  monolith: { name: 'Monolith', slot: 'weapon', weaponType: 'greatHammer', cls: 'warrior',
    stats: { dmg: 20, spd: 6, hp: 100, stun: 30 }, fx: { hpDmg: { per: 30, dmg: 5 } },
    desc: '+5 Damage for every 30 max health.' },
  penitent: { name: 'Penitent', slot: 'weapon', weaponType: 'mace', cls: 'paladin',
    stats: { dmg: 20, spd: 10, holy: 4, hp: 25 }, fx: { penitent: 50 },
    desc: 'Damage you take charges it (at full value, even in player fights), up to 50. Your next hit releases the charge as holy damage and heals you the same amount.' },
  dawnwall: { name: 'Dawnwall', slot: 'weapon', weaponType: 'maceShield', cls: 'paladin',
    stats: { dmg: 10, spd: 10, holy: 5, armor: 10, ward: 10 }, fx: { dawnwall: { every: 3, dmg: 24, stun: 1 } },
    desc: 'Every 3rd hit against you is fully blocked and answered with a holy flash: 24 damage and a 1-second stun.' },
  hummingbird: { name: 'Hummingbird', slot: 'weapon', weaponType: 'shortbow', cls: 'archer',
    stats: { dmg: 9, spd: 18, crit: 6 }, dmgPct: 90, fx: { frenzy: { every: 5, secs: 1 } },
    desc: 'Every 5 seconds, your attack speed doubles for 1 second, and the Attack Speed cap doesn’t apply while it lasts.' },   // dmgPct: its Damage is 10% lower than the usual artifact scaling
  gale: { name: 'Gale', slot: 'weapon', weaponType: 'longbow', cls: 'archer',
    stats: { dmg: 20, spd: 10, pierce: 2 }, fx: { gale: { chance: 15, push: 2, stun: 0, cooldown: 8 } },
    desc: 'Each shot has a 15% chance to knock the target back 2 steps.' },
  hexglass: { name: 'Hexglass', slot: 'weapon', weaponType: 'wandFocus', cls: 'mage',
    stats: { dmg: 8, spd: 10, manaGain: 20, spellDmg: 35, startMana: 50, ward: 4 }, fx: { hex: { pct: 20, secs: 4, max: 3 } },
    desc: 'Each Firebolt curses the target: it takes 20% more damage from everything for 4 seconds, stacking 3 times.' },
  exile: { name: 'Exile', slot: 'weapon', weaponType: 'staff', cls: 'mage',
    stats: { dmg: 10, spd: 6, manaGain: 25, spellDmg: 40 }, fx: { banish: { push: 3, root: 1, cooldown: 6 } },
    baseTrait: 'Far range. Point blank: attacks 25% slower with an enemy right next to you.',
    desc: 'Full mana casts Banish instead of Meteor, hitting one enemy. The first Banish marks it; the next one knocks it back 3 steps and roots it for 1 second (it can’t move, but it can still attack if you’re in range), at most once every 6 seconds.' },
  inferno: { name: 'Inferno', slot: 'weapon', weaponType: 'staff', cls: 'warrior',
    stats: { dmg: 15, spd: 10 }, fx: { meleeStaff: 1, noSpell: 1, physical: 1, burnHit: { dmg: 15, secs: 3 }, fireRing: { start: 1, closed: 3, dmg: 20 } },
    desc: 'A melee staff that deals physical damage. Hits burn for 15 a second over 3 seconds. From 1 second in, fire closes in from both walls (fully closed by 3 seconds); enemies in it burn 20 a second. You’re immune.' },
};
G.ARTIFACT_ORDER = Object.keys(G.ARTIFACTS);
