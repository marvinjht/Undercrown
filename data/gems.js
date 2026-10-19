// Heart gems: picked (1 of 3 random) after the room 10 boss. Each has an upside and a cost.
window.G = window.G || {};

G.GEMS = {
  phoenix: {
    name: 'Phoenix Heart', color: '#ff8a4c',
    up: 'Once per run, when you would die (dungeon or tournament), revive at full health.',
    cost: 'Max Health becomes 50 for the rest of the run (gear Health ignored).',
  },
  stone: {
    name: 'Heart of Stone', color: '#a8a39a',
    up: 'Every hit you take deals exactly 1, including bleed and poison.',
    cost: 'Max Health becomes 30 (gear Health ignored). Every heal restores exactly 1.',
  },
  pure: {
    name: 'Pure Blood', color: '#e05a6a',
    up: '+20 Health, +2 Damage.',
    cost: 'None. The safe pick.',
  },
  vulture: {
    name: 'Vulture’s Heart', color: '#b58a5a',
    up: 'Heal to full whenever another warrior dies before the tournament.',
    cost: 'Campfires, potions, springs and the tournament heal restore half.',
  },
  devil: {
    name: 'Devil’s Tooth', color: '#d6402f',
    up: 'Deal double damage.',
    cost: 'Take double damage.',
  },
  gaia: {
    name: 'Gaia’s Embrace', color: '#6fbf5a',
    up: 'Start every fight with Shield 50.',
    cost: 'No healing of any kind, including the tournament heal.',
  },
};
G.GEM_ORDER = ['phoenix', 'stone', 'pure', 'vulture', 'devil', 'gaia'];
