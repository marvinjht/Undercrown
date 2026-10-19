// Class sets. Uncommon and legendary armor carries one class tag. Only the 5 armor slots count.
// 3 of a class = "three" bonus. 5 of a class = "five" bonus (replaces "three").
// 3 of one class + 2 of another = the "three" bonus + that pair's hybrid bonus.
// stats = flat stats added. Other keys are effects the combat sim reads (see src/combat.js).
window.G = window.G || {};

G.CLASSES = {
  warrior: {
    name: 'Warrior', tint: 0xc9b089, color: '#c9b089',
    three: { stats: { armor: 4, hp: 20 }, desc: '+4 Armor, +20 Health' },
    five:  { stats: { armor: 8, hp: 40 }, secondWind: 30, desc: '+8 Armor, +40 Health, and the first time you drop below half health in a fight you heal 30' },
  },
  mage: {
    name: 'Mage', tint: 0x8a7bff, color: '#a196ff',
    three: { stats: { manaGain: 10 }, arcane: 30, desc: 'Attacks add 10 mana. At 100, cast Arcane Blast: 30 magic to every enemy' },
    five:  { stats: { manaGain: 20, startMana: 50 }, arcane: 30, spellBonus: 20, desc: 'Attacks add 20 mana, start fights at 50 mana, spells deal +20' },
  },
  archer: {
    name: 'Archer', tint: 0x7fbf6a, color: '#8fcf78',
    three: { stats: { spd: 2, crit: 6 }, desc: '+2 Speed, +6 Crit' },
    five:  { stats: { spd: 4, crit: 10 }, doubleShot: 4, desc: '+4 Speed, +10 Crit, every 4th attack is a double shot (two attacks at once)' },
  },
  paladin: {
    name: 'Paladin', tint: 0xf0d27a, color: '#f0d27a',
    three: { stats: { armor: 4, ward: 4, holy: 2 }, desc: '+4 Armor, +4 Ward, hits add 2 holy damage' },
    five:  { stats: { shield: 40, holy: 6 }, desc: 'Start fights with Shield 40, hits add 6 holy damage' },
  },
  rogue: {
    name: 'Rogue', tint: 0x6b6f86, color: '#9aa0bf',
    three: { stats: { dodge: 8, crit: 6 }, desc: '+8 Dodge, +6 Crit' },
    five:  { stats: { dodge: 12 }, firstCrits: 1, critBleed: 4, desc: '+12 Dodge, your first hit each fight is a crit, crits add Bleed 4' },
  },
};
G.CLASS_ORDER = ['warrior', 'mage', 'archer', 'paladin', 'rogue'];

// Key = the two class ids in CLASS_ORDER order, joined by '+'
G.HYBRIDS = {
  'warrior+mage':    { name: 'Battle Mage',  spellStack: 4, desc: 'Each spell you cast gives +4 Damage for the rest of the fight' },
  'warrior+paladin': { name: 'Crusader',     hurtStack: 2, hurtCap: 12, desc: 'Each hit you take gives +2 Damage, up to +12' },
  'warrior+archer':  { name: 'Ranger',       stats: { armor: 4 }, minRange: 'near', desc: '+4 Armor, and Near range on any weapon' },
  'warrior+rogue':   { name: 'Skirmisher',   afterDodge: 10, desc: 'After you dodge, your next hit deals +10' },
  'mage+paladin':    { name: 'Templar',      spellHeal: 10, desc: 'Each spell you cast heals you 10' },
  'mage+archer':     { name: 'Arcane Archer', everyFourthMagic: 10, desc: 'Every 4th attack also deals 10 magic damage' },
  'mage+rogue':      { name: 'Spellthief',   critMana: 20, desc: 'Crits add 20 mana' },
  'archer+paladin':  { name: 'Sentinel',     stats: { shield: 30 }, shieldSpd: 2, desc: 'Start fights with Shield 30; +2 Speed while it holds' },
  'paladin+rogue':   { name: 'Inquisitor',   executeHoly: 6, desc: 'Hits on enemies below half health add 6 holy damage' },
  'archer+rogue':    { name: 'Stalker',      firstCrits: 3, desc: 'Your first 3 attacks each fight are crits' },
};
G.hybridKey = (a, b) => [a, b].sort((x, y) => G.CLASS_ORDER.indexOf(x) - G.CLASS_ORDER.indexOf(y)).join('+');
