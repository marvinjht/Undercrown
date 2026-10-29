// Class sets. Uncommon and artifact gear carries one class tag. Six slots count: 5 armor + weapon.
// 2 of a class = "two" bonus.
// 4 or 5 = "two" + "four" bonuses (they stack).
// 6 = "two" + "four" + the "six" capstone, and the full class look.
// 4 + 2 = the main class's "two" and "four" bonuses + the other's "two" bonus + that pair's hybrid bonus.
// A single piece of a class gives nothing.
// stats = flat stats added. Other keys are effects the combat sim reads (see src/combat.js).
window.G = window.G || {};

G.CLASSES = {
  warrior: {
    name: 'Warrior', tint: 0xd9534a, color: '#e0645a',
    two:  { stats: { armor: 2, hp: 10 }, desc: '+2 Armor, +10 Health' },
    four: { stats: { armor: 6, hp: 24 }, secondWind: 20, desc: '+6 Armor, +24 Health, and the first time you drop below half health in a fight you heal 20' },
    six:  { name: 'Bloodrage', bloodrage: { heal: 30, max: 10, rivalMax: 30 }, desc: 'Every kill gives +10 max Health (+30 for killing a rival) and heals you 30. In the tournament, both carry into your next match' },
  },
  mage: {
    name: 'Mage', tint: 0x9b7bff, color: '#a996ff',
    two:  { stats: { manaGain: 10 }, arcane: 20, desc: 'Attacks add 10 mana. Every spell you cast also sets off Arcane Blast: 20 magic to every enemy' },
    four: { stats: { manaGain: 16, startMana: 40 }, arcane: 24, spellBonus: 15, desc: 'Attacks add 16 mana, start fights at 40 mana, spells that deal damage deal +15' },
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
    two:  { stats: { ward: 4, holy: 4 }, desc: '+4 Magic Resist, hits add 4 holy damage' },
    four: { stats: { ward: 4, holy: 4, shield: 30 }, shieldBurst: 1, desc: '+4 Magic Resist, hits add 4 holy damage, start fights with Shield 30. When your Shield breaks, it explodes for its starting size as holy damage to every enemy' },
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
  'warrior+mage':    { name: 'Battle Mage',  spellStack: 4, empower: { hits: 3, dmg: 6 },
    desc: 'Each spell gives +4 Damage for the rest of the fight and empowers your next 3 attacks: +6 magic damage each, and they cleave' },
  'warrior+paladin': { name: 'Crusader',     hurtStack: 2, hurtCap: 12, capHeal: 3,
    desc: 'Each hit you take gives +2 Damage, up to +12. At the cap, your hits also heal you 3' },
  'warrior+archer':  { name: 'Ranger',       stats: { armor: 4 }, minRange: 'near', shove: { push: 2, every: 5 },
    desc: '+4 Armor and Near range on any weapon. When an enemy reaches melee, you shove it back 2 steps (once every 5 seconds)' },
  'warrior+rogue':   { name: 'Skirmisher',   afterDodge: 10, dodgeHaste: { spd: 3, secs: 3, max: 3 },
    desc: 'After you dodge, your next hit deals +10 and you gain +3 Attack Speed for 3 seconds (stacks 3 times)' },
  'mage+paladin':    { name: 'Templar',      spellHeal: 10, spellShield: 15,
    desc: 'Each spell you cast heals you 10 and gives Shield 15' },
  'mage+archer':     { name: 'Arcane Archer', everyFourthMagic: 10, manaOnFourth: 25,
    desc: 'Every 4th attack also fires an arcane arrow: 10 magic damage and +25 mana' },
  'mage+rogue':      { name: 'Spellthief',   critMana: 20, spellCrit: 1,
    desc: 'Crits add 20 mana, and your spells can crit (using your Crit)' },
  'archer+paladin':  { name: 'Sentinel',     stats: { shield: 30 }, shieldSpd: 2, sentinelBurst: { dmg: 20, crits: 3 },
    desc: 'Start fights with Shield 30 and +2 Attack Speed while it holds. When it breaks, it bursts for 20 holy damage and your next 3 attacks crit' },
  'paladin+rogue':   { name: 'Inquisitor',   executeHoly: 6, healCut: 3,
    desc: 'Hits on enemies below half health add 6 holy damage and halve their healing for 3 seconds' },
  'archer+rogue':    { name: 'Stalker',      openInvis: 2, firstCrits: 3, sureHits: 3,
    desc: 'Start fights invisible for 2 seconds (adds to Night Lord). Your first 3 attacks crit and can’t be dodged' },
};
G.hybridKey = (a, b) => [a, b].sort((x, y) => G.CLASS_ORDER.indexOf(x) - G.CLASS_ORDER.indexOf(y)).join('+');
