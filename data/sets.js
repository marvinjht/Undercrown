// Class sets. Uncommon and legendary gear carries one class tag. Six slots count: 5 armor + weapon.
// 2 of a class = "two" bonus (no look change).
// 4 or 5 = "four" bonus (replaces "two"), and your color and look change.
// 6 = "four" bonus + the "six" capstone, and the full class look.
// 4 + 2 = the main class's "four" bonus + the other's "two" bonus + that pair's hybrid bonus.
// A single piece of a class gives nothing.
// stats = flat stats added. Other keys are effects the combat sim reads (see src/combat.js).
window.G = window.G || {};

G.CLASSES = {
  warrior: {
    name: 'Warrior', tint: 0xd9534a, color: '#e0645a',
    two:  { stats: { armor: 2, hp: 10 }, desc: '+2 Armor, +10 Health' },
    four: { stats: { armor: 6, hp: 24 }, secondWind: 20, desc: '+6 Armor, +24 Health, and the first time you drop below half health in a fight you heal 20' },
    six:  { name: 'Bloodrage', bloodrage: 20, desc: 'Every kill heals you 20. In the tournament, the heal carries into your next match' },
  },
  mage: {
    name: 'Mage', tint: 0x9b7bff, color: '#a996ff',
    two:  { stats: { manaGain: 6 }, arcane: 20, desc: 'Attacks add 6 mana. At 100, cast Arcane Blast: 20 magic to every enemy' },
    four: { stats: { manaGain: 16, startMana: 40 }, arcane: 24, spellBonus: 12, desc: 'Attacks add 16 mana, start fights at 40 mana, spells deal +12' },
    six:  { name: 'Echo', echo: 1, desc: 'Every spell casts again 1 second later for half damage' },
  },
  archer: {
    name: 'Archer', tint: 0x6fcf5a, color: '#86d873',
    two:  { stats: { spd: 2 }, desc: '+2 Attack Speed' },
    four: { stats: { spd: 2, crit: 6 }, doubleShot: 4, desc: '+2 Attack Speed, +6 Crit, every 4th attack is a double shot (two attacks at once)' },
    six:  { name: 'Kiting', kite: 4, desc: 'When an enemy reaches melee range, you step back out of it (at most once every 4 seconds)' },
  },
  paladin: {
    name: 'Paladin', tint: 0xf0c84a, color: '#f0d27a',
    two:  { stats: { ward: 2, holy: 2 }, desc: '+2 Magic Resist, hits add 2 holy damage' },
    four: { stats: { shield: 30, holy: 4 }, desc: 'Start fights with Shield 30, hits add 4 holy damage' },
    six:  { name: 'Consecration', consecrate: 1, desc: 'Holy damage you deal also heals you for the same amount' },
  },
  rogue: {
    name: 'Rogue', tint: 0x56607a, color: '#8e9ab8',
    two:  { stats: { dodge: 4, crit: 2 }, desc: '+4 Dodge, +2 Crit' },
    four: { stats: { dodge: 8 }, firstCrits: 1, critBleed: 4, desc: '+8 Dodge, your first hit each fight is a crit, crits add Bleed 4' },
    six:  { name: 'Vanish', vanish: 2, desc: 'The first time you drop below half health in a fight, you can’t be targeted for 2 seconds' },
  },
};
G.CLASS_ORDER = ['warrior', 'mage', 'archer', 'paladin', 'rogue'];

// Key = the two class ids in CLASS_ORDER order, joined by '+'. Needs 4 of one and 2 of the other.
G.HYBRIDS = {
  'warrior+mage':    { name: 'Battle Mage',  spellStack: 4, desc: 'Each spell you cast gives +4 Damage for the rest of the fight' },
  'warrior+paladin': { name: 'Crusader',     hurtStack: 2, hurtCap: 12, desc: 'Each hit you take gives +2 Damage, up to +12' },
  'warrior+archer':  { name: 'Ranger',       stats: { armor: 4 }, minRange: 'near', desc: '+4 Armor, and Near range on any weapon' },
  'warrior+rogue':   { name: 'Skirmisher',   afterDodge: 10, desc: 'After you dodge, your next hit deals +10' },
  'mage+paladin':    { name: 'Templar',      spellHeal: 10, desc: 'Each spell you cast heals you 10' },
  'mage+archer':     { name: 'Arcane Archer', everyFourthMagic: 10, desc: 'Every 4th attack also deals 10 magic damage' },
  'mage+rogue':      { name: 'Spellthief',   critMana: 20, desc: 'Crits add 20 mana' },
  'archer+paladin':  { name: 'Sentinel',     stats: { shield: 30 }, shieldSpd: 2, desc: 'Start fights with Shield 30; +2 Attack Speed while it holds' },
  'paladin+rogue':   { name: 'Inquisitor',   executeHoly: 6, desc: 'Hits on enemies below half health add 6 holy damage' },
  'archer+rogue':    { name: 'Stalker',      firstCrits: 3, desc: 'Your first 3 attacks each fight are crits' },
};
G.hybridKey = (a, b) => [a, b].sort((x, y) => G.CLASS_ORDER.indexOf(x) - G.CLASS_ORDER.indexOf(y)).join('+');
