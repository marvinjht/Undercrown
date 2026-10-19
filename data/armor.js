// Gear slots, armor pieces, bonus stats ("affixes"), rarities and stat descriptions.
// Values are tier 1, grey. Everything is rounded to even whole numbers.
window.G = window.G || {};

G.SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots'];
G.SLOT_NAMES = { weapon: 'Weapon', helmet: 'Helmet', chest: 'Chestplate', gloves: 'Gloves', legs: 'Leggings', boots: 'Boots' };

G.ARMOR = {
  helmet: { primary: { hp: 16 },            bases: ['Leather Cap', 'Iron Helm', 'Crowned Greathelm'] },
  chest:  { primary: { armor: 2, hp: 12 },  bases: ['Padded Vest', 'Chainmail Hauberk', 'Dragonscale Cuirass'] },
  gloves: { primary: { spd: 2 },            bases: ['Cloth Wraps', 'Studded Gauntlets', 'Forgefire Gauntlets'] },
  legs:   { primary: { armor: 2, hp: 8 },   bases: ['Worn Trousers', 'Plated Greaves', 'Warlord’s Legguards'] },
  boots:  { primary: { dodge: 4 },          bases: ['Soft Boots', 'Ranger Boots', 'Windstep Boots'] },
};

// Bonus stats. Green items get 1, gold items get 2.
G.AFFIXES = {
  hp:      { base: 12, suffix: 'of the Ox' },
  armor:   { base: 2,  suffix: 'of the Turtle' },
  dmg:     { base: 2,  suffix: 'of Fury' },
  crit:    { base: 6,  suffix: 'of Precision' },
  critDmg: { base: 8,  suffix: 'of Ruin' },
  spd:     { base: 2,  suffix: 'of Haste' },
  dodge:   { base: 4,  suffix: 'of the Fox' },
  leech:   { base: 2,  suffix: 'of the Leech', goldOnly: true, weaponOnly: true },
};

G.RARITY = {
  grey:  { name: 'Common',    rank: 0, mult: 1.0, affixes: 0 },
  green: { name: 'Uncommon',  rank: 1, mult: 1.3, affixes: 1 },
  gold:  { name: 'Legendary', rank: 2, mult: 1.6, affixes: 2 },
};
G.RARITY_ORDER = ['grey', 'green', 'gold'];

// growth: 'flat' grows fast with tier, 'chance' grows slowly
G.STAT_INFO = {
  dmg:     { label: 'Damage',      growth: 'flat',   desc: 'Damage dealt by each hit, before the enemy’s armor.' },
  spd:     { label: 'Speed',       growth: 'chance', desc: 'Attacks per 10 seconds. Speed 10 = one attack a second.' },
  hp:      { label: 'Health',      growth: 'flat',   desc: 'More max health. Health does not refill between rooms.' },
  armor:   { label: 'Armor',       growth: 'flat',   desc: 'Every hit you take is reduced by this much (a hit always does at least 2).' },
  crit:    { label: 'Crit',        growth: 'chance', desc: 'Out of 100 hits, how many are crits. Crits deal double damage.' },
  critDmg: { label: 'Crit Damage', growth: 'flat',   desc: 'Extra damage added to every crit.' },
  dodge:   { label: 'Dodge',       growth: 'chance', desc: 'Out of 100 attacks, how many miss you. Max 30.' },
  leech:   { label: 'Life on Hit', growth: 'chance',   desc: 'Heal this much every time you hit. The healing stays after the fight.' },
  shield:  { label: 'Shield',      growth: 'flat',   desc: 'Soaks up this much damage at the start of every fight.' },
  bleed:   { label: 'Bleed',       growth: 'flat',   desc: 'Each hit makes the target take this much damage a second for 3 seconds.' },
  stun:    { label: 'Stun',        growth: 'chance', desc: 'Out of 100 hits, how many stun the target for 1 second.' },
};
G.STAT_ORDER = ['dmg', 'spd', 'hp', 'armor', 'shield', 'crit', 'critDmg', 'dodge', 'leech', 'bleed', 'stun'];
