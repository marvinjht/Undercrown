// Weapon types at tier 1, grey. dmg = damage per hit, spd = attacks per 10 seconds.
// bonus = the weapon type's built-in trait stats (they grow with tier and rarity too).
window.G = window.G || {};

G.WEAPONS = {
  daggers: {
    name: 'Daggers', dmg: 8, spd: 18, bonus: { crit: 10 },
    trait: 'Twin blades: extra Crit.',
    blurb: 'Very fast, light hits. Struggles against heavy armor.',
    bases: ['Rusty Shivs', 'Twin Fangs', 'Nightglass Fangs'],
  },
  saber: {
    name: 'Saber', dmg: 12, spd: 14, bonus: { dodge: 8 },
    trait: 'Light footwork: extra Dodge.',
    blurb: 'Quick strikes and slippery defense.',
    bases: ['Bent Saber', 'Corsair Saber', 'Moonsilver Saber'],
  },
  swordShield: {
    name: 'Sword & Shield', dmg: 8, spd: 10, bonus: { armor: 2, shield: 20 },
    trait: 'Shield: extra Armor, and a Shield that soaks up damage at the start of every fight.',
    blurb: 'Steady damage, hard to wear down.',
    bases: ['Militia Sword & Board', 'Knight’s Blade & Kite Shield', 'Aegis Blade & Bulwark'],
  },
  longsword: {
    name: 'Longsword', dmg: 16, spd: 8, bonus: { crit: 6, critDmg: 12 },
    trait: 'Two-handed: extra Crit and Crit Damage.',
    blurb: 'Heavy, deliberate swings that crit hard.',
    bases: ['Notched Longsword', 'Bastard Longsword', 'Sunsteel Zweihander'],
  },
  greatAxe: {
    name: 'Great Axe', dmg: 14, spd: 8, bonus: { bleed: 4 },
    trait: 'Rending: each hit makes the target bleed for 3 seconds.',
    blurb: 'Big chops that keep hurting.',
    bases: ['Woodcutter’s Axe', 'Bearded Greataxe', 'Gorehorn Cleaver'],
  },
  greatHammer: {
    name: 'Great Hammer', dmg: 24, spd: 6, bonus: { stun: 20 },
    trait: 'Crushing: hits can stun the target for 1 second.',
    blurb: 'Slowest weapon, biggest hits, punches through armor.',
    bases: ['Stone Maul', 'Ironbound Warhammer', 'Mountainbreaker'],
  },
};

G.WEAPON_ORDER = ['daggers', 'saber', 'swordShield', 'longsword', 'greatAxe', 'greatHammer'];
