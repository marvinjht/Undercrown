// Weapon types at tier 1, common. dmg = damage per hit, spd = attacks per 10 seconds.
// range: melee (1 step) | near (4) | far (6). type: phys (Armor blocks it) | magic (Magic Resist blocks it).
// bonus = built-in stats that grow with tier and rarity (Mana per attack and Starting Mana never grow).
// spell = what full mana casts. kind: 'damage' (or none) deals its Spell Damage (phys: Armor blocks it); the rest are
// effects handled in src/combat.js utilitySpell().
// classes = the class tags an uncommon or artifact copy can roll (unique items can ignore this later).
window.G = window.G || {};

G.WEAPONS = {
  daggers: {
    classes: ['rogue', 'warrior'],
    name: 'Daggers', range: 'melee', type: 'phys', dmg: 8, spd: 18, bonus: { crit: 10, manaGain: 8 },
    spell: { name: 'Deep Cut', kind: 'deepCut', crits: 2 },
    trait: 'Twin blades: extra Crit. Casts Deep Cut: your next 2 attacks crit.',
    blurb: 'Very fast, light hits. Struggles against heavy armor.',
    bases: ['Rusty Shivs', 'Twin Fangs', 'Nightglass Fangs'],
  },
  saber: {
    classes: ['rogue', 'warrior'],
    name: 'Saber', range: 'melee', type: 'phys', dmg: 16, spd: 14, bonus: { dodge: 10, manaGain: 12 }, fx: { riposte: 50 },
    spell: { name: 'Feint', kind: 'feint' },
    trait: 'Light footwork: extra Dodge. Riposte: after you dodge, your next hit deals +50%. Casts Feint: the next attack aimed at you misses (and sets off Riposte).',
    blurb: 'Quick strikes and slippery defense.',
    bases: ['Bent Saber', 'Corsair Saber', 'Moonsilver Saber'],
  },
  swordShield: {
    classes: ['warrior', 'paladin'],
    name: 'Sword & Shield', range: 'melee', type: 'phys', dmg: 10, spd: 10, bonus: { armor: 2, shield: 30, manaGain: 16 }, stubborn: true,
    spell: { name: 'Shield Bash', kind: 'bash', stun: 1 },
    trait: 'Shield: extra Armor, and a Shield that soaks up damage at the start of every fight. Casts Shield Bash: your next hit stuns for 1 second.',
    blurb: 'Steady damage, hard to wear down.',
    bases: ['Militia Sword & Board', 'Knight’s Blade & Kite Shield', 'Aegis Blade & Bulwark'],
  },
  longsword: {
    classes: ['warrior', 'paladin'],
    name: 'Longsword', range: 'reach', type: 'phys', dmg: 18, spd: 8, bonus: { crit: 6, critDmg: 12, manaGain: 20 },
    spell: { name: 'Cleave', kind: 'cleave' },
    trait: 'Two-handed: extra Crit and Crit Damage. Reach: hits from 2 steps away. Casts Cleave: a full-damage swing at every enemy within reach.',
    blurb: 'Heavy, deliberate swings that crit hard.',
    bases: ['Notched Longsword', 'Bastard Longsword', 'Sunsteel Zweihander'],
  },
  greatAxe: {
    classes: ['warrior', 'paladin'],
    name: 'Great Axe', range: 'melee', type: 'phys', dmg: 16, spd: 8, bonus: { bleed: 6, manaGain: 25, spellDmg: 50 }, cleave: true, fx: { rend: { step: 2, cap: 12 } },
    spell: { name: 'Decimate', kind: 'damage', phys: true, bleedMult: 2 },
    trait: 'Hits cause Bleed. Cleave: each hit also strikes one more enemy for half damage. Rend: with no second enemy, each hit makes the bleed 2 stronger (up to +12). Casts Decimate: its Spell Damage as a physical blow, and a double-strength bleed.',
    blurb: 'Big chops that keep hurting. Good against packs.',
    bases: ['Woodcutter’s Axe', 'Bearded Greataxe', 'Gorehorn Cleaver'],
  },
  greatHammer: {
    classes: ['warrior', 'paladin'],
    name: 'Great Hammer', range: 'melee', type: 'phys', dmg: 24, spd: 6, bonus: { stun: 20, manaGain: 25 },
    spell: { name: 'Quake', kind: 'quake', stun: 2, reach: 2, limitDmg: 25 },   // limitDmg: what an enemy still under the stun limit takes instead
    trait: 'Crushing: hits can stun the target for 1 second, or 2 seconds on a critical hit. Casts Quake: stuns every enemy within 2 steps for 2 seconds; an enemy that can’t be stunned again yet takes 25 damage instead.',
    blurb: 'Slowest weapon, biggest hits, punches through armor.',
    bases: ['Stone Maul', 'Ironbound Warhammer', 'Mountainbreaker'],
  },
  mace: {
    classes: ['paladin', 'warrior'],
    name: 'Mace', range: 'melee', type: 'phys', dmg: 12, spd: 10, bonus: { holy: 6, manaGain: 16 },
    spell: { name: 'Dawnbringer', kind: 'nextHeal', heal: 30 },
    trait: 'Blessed: hits add holy damage (gets past Armor). Casts Dawnbringer: your next hit heals you 30.',
    blurb: 'Paladin steel. Partly magic, a little healing.',
    bases: ['Iron Cudgel', 'Flanged Mace', 'Dawnbringer'],
  },
  maceShield: {
    classes: ['paladin', 'warrior'],
    name: 'Mace & Shield', range: 'melee', type: 'phys', dmg: 10, spd: 10, bonus: { holy: 6, shield: 20, ward: 2, manaGain: 16 },
    spell: { name: 'Rebuke', kind: 'rebuke', spd: 3, secs: 3 },
    trait: 'Blessed: hits add holy damage. Shield and extra Magic Resist. Casts Rebuke: your next hit lowers the target’s Attack Speed by 3 for 3 seconds.',
    blurb: 'The sturdy holy option.',
    bases: ['Chapel Mace & Buckler', 'Templar Mace & Heater', 'Lightbearer & Sunshield'],
  },
  shortbow: {
    classes: ['archer'],
    name: 'Shortbow', range: 'near', type: 'phys', dmg: 8, spd: 14, bonus: { crit: 6, manaGain: 10 },
    spell: { name: 'Retreat', kind: 'retreat', steps: 1 },
    trait: 'Near range: shoots before melee arrives. Extra Crit. Casts Retreat: you hop 1 step back.',
    blurb: 'Quick arrows from a few steps away.',
    bases: ['Hunting Bow', 'Recurve Shortbow', 'Galeheart Bow'],
  },
  longbow: {
    classes: ['archer'],
    name: 'Longbow', range: 'far', type: 'phys', dmg: 18, spd: 6, bonus: { pierce: 2, manaGain: 20 }, fx: { pointBlank: 15 },
    spell: { name: 'Triple Shot', kind: 'triple', arrows: 3, single: 5 },
    trait: 'Far range: the most free shots. Pierce: ignores some Armor. Point blank: attacks 15% slower with an enemy right next to you. Casts Triple Shot: an arrow at up to 3 enemies, or one arrow for +5 when there’s only one.',
    blurb: 'Slow, heavy arrows from across the room.',
    bases: ['Yew Longbow', 'Warbow', 'Skypiercer'],
  },
  wandFocus: {
    classes: ['mage'],
    name: 'Wand & Focus', range: 'near', type: 'magic', dmg: 6, spd: 10, bonus: { manaGain: 20, spellDmg: 30, startMana: 20, ward: 4 },
    spell: { name: 'Firebolt', aoe: false },
    trait: 'Starts fights with mana already charged, plus extra Magic Resist. Casts Firebolt.',
    blurb: 'The first spell comes fast.',
    bases: ['Wand & Glass Orb', 'Wand & Runed Focus', 'Starwand & Prism'],
  },
  staff: {
    classes: ['mage'],
    name: 'Staff', range: 'far', type: 'magic', dmg: 10, spd: 6, bonus: { manaGain: 25, spellDmg: 40, startMana: 25 }, fx: { pointBlank: 15 },
    spell: { name: 'Meteor', aoe: true },
    trait: 'Far range. Full mana casts Meteor at every enemy. Point blank: attacks 15% slower with an enemy right next to you.',
    blurb: 'Slow to charge, huge spell. Best against packs.',
    bases: ['Gnarled Staff', 'Runed Staff', 'Staff of the Comet'],
  },
};

G.WEAPON_ORDER = ['daggers', 'saber', 'swordShield', 'longsword', 'greatAxe', 'greatHammer',
  'mace', 'maceShield', 'shortbow', 'longbow', 'wandFocus', 'staff'];
