// Weapon types at tier 1, common. dmg = damage per hit, spd = attacks per 10 seconds.
// range: melee (1 step) | near (4) | far (6). type: phys (Armor blocks it) | magic (Magic Resist blocks it).
// bonus = built-in stats that grow with tier and rarity. spell = what full mana casts.
// classes = the class tags an uncommon or legendary copy can roll (unique items can ignore this later).
window.G = window.G || {};

G.WEAPONS = {
  daggers: {
    classes: ['rogue', 'warrior'],
    name: 'Daggers', range: 'melee', type: 'phys', dmg: 8, spd: 18, bonus: { crit: 10 },
    trait: 'Twin blades: extra Crit.',
    blurb: 'Very fast, light hits. Struggles against heavy armor.',
    bases: ['Rusty Shivs', 'Twin Fangs', 'Nightglass Fangs'],
  },
  saber: {
    classes: ['rogue', 'warrior'],
    name: 'Saber', range: 'melee', type: 'phys', dmg: 14, spd: 14, bonus: { dodge: 10 }, fx: { riposte: 50 },
    trait: 'Light footwork: extra Dodge. Riposte: after you dodge, your next hit deals +50%.',
    blurb: 'Quick strikes and slippery defense.',
    bases: ['Bent Saber', 'Corsair Saber', 'Moonsilver Saber'],
  },
  swordShield: {
    classes: ['warrior', 'paladin'],
    name: 'Sword & Shield', range: 'melee', type: 'phys', dmg: 10, spd: 10, bonus: { armor: 2, shield: 30 }, fx: { bash: 5 }, stubborn: true,
    trait: 'Shield: extra Armor, and a Shield that soaks up damage at the start of every fight. Shield Bash: every 5th hit stuns for 1 second.',
    blurb: 'Steady damage, hard to wear down.',
    bases: ['Militia Sword & Board', 'Knight’s Blade & Kite Shield', 'Aegis Blade & Bulwark'],
  },
  longsword: {
    classes: ['warrior', 'paladin'],
    name: 'Longsword', range: 'reach', type: 'phys', dmg: 18, spd: 8, bonus: { crit: 6, critDmg: 12 },
    trait: 'Two-handed: extra Crit and Crit Damage. Reach: hits from 2 steps away.',
    blurb: 'Heavy, deliberate swings that crit hard.',
    bases: ['Notched Longsword', 'Bastard Longsword', 'Sunsteel Zweihander'],
  },
  greatAxe: {
    classes: ['warrior', 'paladin'],
    name: 'Great Axe', range: 'melee', type: 'phys', dmg: 16, spd: 8, bonus: { bleed: 6 }, cleave: true, fx: { rend: { step: 2, cap: 12 } },
    trait: 'Hits cause Bleed. Cleave: each hit also strikes one more enemy for half damage. Rend: with no second enemy, each hit makes the bleed 2 stronger (up to +12).',
    blurb: 'Big chops that keep hurting. Good against packs.',
    bases: ['Woodcutter’s Axe', 'Bearded Greataxe', 'Gorehorn Cleaver'],
  },
  greatHammer: {
    classes: ['warrior', 'paladin'],
    name: 'Great Hammer', range: 'melee', type: 'phys', dmg: 24, spd: 6, bonus: { stun: 20 },
    trait: 'Crushing: hits can stun the target for 1 second, or 2 seconds on a critical hit.',
    blurb: 'Slowest weapon, biggest hits, punches through armor.',
    bases: ['Stone Maul', 'Ironbound Warhammer', 'Mountainbreaker'],
  },
  mace: {
    classes: ['paladin', 'warrior'],
    name: 'Mace', range: 'melee', type: 'phys', dmg: 12, spd: 10, bonus: { holy: 6 }, healEvery: { n: 5, amount: 12 },
    trait: 'Blessed: hits add holy damage (gets past Armor). Every 5th hit heals you 12.',
    blurb: 'Paladin steel. Partly magic, a little healing.',
    bases: ['Iron Cudgel', 'Flanged Mace', 'Dawnbringer'],
  },
  maceShield: {
    classes: ['paladin', 'warrior'],
    name: 'Mace & Shield', range: 'melee', type: 'phys', dmg: 10, spd: 10, bonus: { holy: 6, shield: 20, ward: 2 },
    trait: 'Blessed: hits add holy damage. Shield and extra Magic Resist.',
    blurb: 'The sturdy holy option.',
    bases: ['Chapel Mace & Buckler', 'Templar Mace & Heater', 'Lightbearer & Sunshield'],
  },
  shortbow: {
    classes: ['archer'],
    name: 'Shortbow', range: 'near', type: 'phys', dmg: 8, spd: 14, bonus: { crit: 6 },
    trait: 'Near range: shoots before melee arrives. Extra Crit.',
    blurb: 'Quick arrows from a few steps away.',
    bases: ['Hunting Bow', 'Recurve Shortbow', 'Galeheart Bow'],
  },
  longbow: {
    classes: ['archer'],
    name: 'Longbow', range: 'far', type: 'phys', dmg: 18, spd: 6, bonus: { pierce: 2 }, fx: { pointBlank: 25 },
    trait: 'Far range: the most free shots. Pierce: ignores some Armor. Point blank: attacks 25% slower with an enemy right next to you.',
    blurb: 'Slow, heavy arrows from across the room.',
    bases: ['Yew Longbow', 'Warbow', 'Skypiercer'],
  },
  wandFocus: {
    classes: ['mage'],
    name: 'Wand & Focus', range: 'near', type: 'magic', dmg: 6, spd: 10, bonus: { manaGain: 20, spellDmg: 30, startMana: 40, ward: 4 },
    spell: { name: 'Firebolt', aoe: false },
    trait: 'Starts fights with mana already charged, plus extra Magic Resist. Casts Firebolt.',
    blurb: 'The first spell comes fast.',
    bases: ['Wand & Glass Orb', 'Wand & Runed Focus', 'Starwand & Prism'],
  },
  staff: {
    classes: ['mage'],
    name: 'Staff', range: 'far', type: 'magic', dmg: 10, spd: 6, bonus: { manaGain: 25, spellDmg: 40 }, fx: { pointBlank: 25 },
    spell: { name: 'Meteor', aoe: true },
    trait: 'Far range. Full mana casts Meteor at every enemy. Point blank: attacks 25% slower with an enemy right next to you.',
    blurb: 'Slow to charge, huge spell. Best against packs.',
    bases: ['Gnarled Staff', 'Runed Staff', 'Staff of the Comet'],
  },
};

G.WEAPON_ORDER = ['daggers', 'saber', 'swordShield', 'longsword', 'greatAxe', 'greatHammer',
  'mace', 'maceShield', 'shortbow', 'longbow', 'wandFocus', 'staff'];
