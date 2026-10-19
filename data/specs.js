// Specializations, offered right after room 5 (3 options). affinity = weapons that make a
// spec more likely to be offered. params = the numbers the game uses; keep desc in sync.
window.G = window.G || {};

G.SPECS = {
  shadow: {
    name: 'Shadow', role: 'Rogue',
    params: { every: 6, duration: 2 },
    desc: 'Every 6 seconds you vanish for 2 seconds. Enemies can’t hit you while hidden, and your first hit out of hiding is a crit.',
    tip: 'Best with fast weapons and crit.',
    affinity: ['daggers', 'saber'],
  },
  bloodthirst: {
    name: 'Bloodthirst', role: 'Reaver',
    params: { leech: 2 },
    desc: 'Heal 2 health every time you hit. The healing stays with you after the fight.',
    tip: 'Fast weapons heal the most.',
    affinity: ['greatAxe', 'daggers'],
  },
  juggernaut: {
    name: 'Juggernaut', role: 'Tank',
    params: { hp: 60, armor: 4 },
    desc: '+60 Health and +4 Armor.',
    tip: 'Wants to stay healthy. Favors campfires.',
    affinity: ['swordShield', 'greatHammer'],
  },
  berserker: {
    name: 'Berserker', role: 'Brawler',
    params: { per: 10, dmg: 2 },
    desc: '+2 Damage for every 10 health you are missing, up to +20.',
    tip: 'Risky. Gets stronger as the no-healing rule bites.',
    affinity: ['greatAxe', 'longsword'],
  },
  treasureHunter: {
    name: 'Treasure Hunter', role: 'Scavenger',
    desc: 'Loot rolls as if you were 6 rooms deeper, one extra item to choose from after fights, and +4 gold per fight.',
    tip: 'Weaker early, should end with the best gear.',
    affinity: [],
  },
  duelist: {
    name: 'Duelist', role: 'Swordmaster',
    params: { every: 4 },
    desc: 'Every 4th attack aimed at you is parried: you take nothing and strike back.',
    tip: 'Best with sabers, longswords and shields.',
    affinity: ['saber', 'longsword', 'swordShield'],
  },
};

G.SPEC_ORDER = ['shadow', 'bloodthirst', 'juggernaut', 'berserker', 'treasureHunter', 'duelist'];
