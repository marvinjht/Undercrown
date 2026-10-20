// Gear slots, armor pieces, bonus stats ("affixes"), rarities and stat descriptions.
// Values are tier 1, common. Everything is rounded to even whole numbers.
window.G = window.G || {};

G.SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots'];
G.ARMOR_SLOTS = ['helmet', 'chest', 'gloves', 'legs', 'boots'];
G.SLOT_NAMES = { weapon: 'Weapon', helmet: 'Helmet', chest: 'Chestplate', gloves: 'Gloves', legs: 'Leggings', boots: 'Boots' };

G.ARMOR = {
  helmet: { primary: { hp: 10 },            bases: ['Leather Cap', 'Iron Helm', 'Crowned Greathelm'] },
  chest:  { primary: { armor: 2, hp: 8 },   bases: ['Padded Vest', 'Chainmail Hauberk', 'Dragonscale Cuirass'] },
  gloves: { primary: { spd: 2 },            bases: ['Cloth Wraps', 'Studded Gauntlets', 'Forgefire Gauntlets'] },
  legs:   { primary: { armor: 2, hp: 6 },   bases: ['Worn Trousers', 'Plated Greaves', 'Warlord’s Legguards'] },
  boots:  { primary: { dodge: 4 },          bases: ['Soft Boots', 'Ranger Boots', 'Windstep Boots'] },
};

// Bonus stats. Uncommon items get a bonus stat or a trade-off; rare items get a bonus stat and a build effect.
G.AFFIXES = {
  hp:      { base: 8,  suffix: 'of the Ox' },
  armor:   { base: 2,  suffix: 'of the Turtle' },
  ward:    { base: 2,  suffix: 'of Warding' },
  dmg:     { base: 2,  suffix: 'of Fury' },
  crit:    { base: 6,  suffix: 'of Precision' },
  critDmg: { base: 8,  suffix: 'of Ruin' },
  spd:     { base: 2,  suffix: 'of Haste' },
  dodge:   { base: 4,  suffix: 'of the Fox' },
  leech:   { base: 2,  suffix: 'of the Leech', rareOnly: true, weaponOnly: true },
};

// Trade-offs (uncommon): a bigger bonus with a cost. Both sides grow with tier.
G.TRADEOFFS = {
  heavy:      { name: 'Heavy',      give: { armor: 6 }, cost: { spd: 2 } },
  reckless:   { name: 'Reckless',   give: { dmg: 6 },   cost: { armor: 4 } },
  glass:      { name: 'Glass',      give: { crit: 10 }, cost: { hp: 16 } },
  nimble:     { name: 'Nimble',     give: { dodge: 6 }, cost: { armor: 2 } },
  spellguard: { name: 'Spellguard', give: { ward: 6 },  cost: { dmg: 2 } },
  vampiric:   { name: 'Vampiric',   give: { leech: 2 }, cost: { hp: 20 } },
  frenzied:   { name: 'Frenzied',   give: { spd: 4 },   cost: { ward: 4 } },
};

// Build effects moved to relics (data/relics.js).


// Common grey, Uncommon green, Rare blue (two affixes), Legendary gold (fixed stats, see data/legendaries.js).
G.RARITY = {
  grey:  { name: 'Common',   rank: 0, mult: 1.0, affixes: 0 },
  green: { name: 'Uncommon', rank: 1, mult: 1.3, affixes: 1 },
  rare:  { name: 'Rare',     rank: 2, mult: 1.6, affixes: 2 },
  legendary: { name: 'Legendary', rank: 3, mult: 1.6, affixes: 0 },
};
G.RARITY_ORDER = ['grey', 'green', 'rare'];

// growth: 'flat' grows fast with tier, 'chance' grows slowly, 'fixed' never changes
G.STAT_INFO = {
  dmg:       { label: 'Damage',      growth: 'flat',   desc: 'Damage dealt by each hit, before the enemy’s Armor or Magic Resist.' },
  spd:       { label: 'Attack Speed',       growth: 'chance', desc: 'Attacks per 10 seconds. Attack Speed 10 = one attack a second.' },
  hp:        { label: 'Health',      growth: 'flat',   desc: 'More max health. Health does not refill between rooms.' },
  armor:     { label: 'Armor',       growth: 'flat',   desc: 'Every physical hit you take is reduced by this much (a hit always does at least 2).' },
  ward:      { label: 'Magic Resist',        growth: 'flat',   desc: 'Every magic hit you take (spells, wands, holy damage) is reduced by this much.' },
  shield:    { label: 'Shield',      growth: 'flat',   desc: 'Soaks up this much damage at the start of every fight.' },
  crit:      { label: 'Crit',        growth: 'chance', desc: 'Out of 100 hits, how many are crits. Crits deal double damage.' },
  critDmg:   { label: 'Crit Damage', growth: 'flat',   desc: 'Extra damage added to every crit.' },
  dodge:     { label: 'Dodge',       growth: 'chance', desc: 'Out of 100 attacks, how many miss you. Max 30.' },
  leech:     { label: 'Life on Hit', growth: 'chance', desc: 'Heal this much every time you hit. The healing stays after the fight.' },
  holy:      { label: 'Holy',        growth: 'flat',   desc: 'Extra magic damage added to every hit. Gets past Armor; Magic Resist blocks it.' },
  pierce:    { label: 'Pierce',      growth: 'chance', desc: 'Your physical hits ignore this much of the target’s Armor.' },
  bleed:     { label: 'Bleed',       growth: 'flat',   desc: 'Each hit makes the target take this much damage a second for 3 seconds.' },
  stun:      { label: 'Stun',        growth: 'chance', desc: 'Out of 100 hits, how many stun the target for 1 second (2 seconds if the hit was critical).' },
  manaGain:  { label: 'Mana per attack', growth: 'fixed', desc: 'Mana gained each attack. At 100 mana you cast your spell.' },
  spellDmg:  { label: 'Spell Damage', growth: 'flat',  desc: 'Magic damage your spell deals.' },
  startMana: { label: 'Starting Mana', growth: 'fixed', desc: 'Mana you start every fight with.' },
};
G.STAT_ORDER = ['dmg', 'spd', 'hp', 'armor', 'ward', 'shield', 'holy', 'crit', 'critDmg', 'dodge', 'pierce',
  'leech', 'bleed', 'stun', 'manaGain', 'spellDmg', 'startMana'];
