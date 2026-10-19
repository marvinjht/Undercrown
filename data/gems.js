// Heart gems: picked (1 of 3 random) after the room 10 boss. Each has an upside and a cost.
window.G = window.G || {};

G.GEMS = {
  phoenix: {
    name: 'Phoenix Heart', color: '#ff8a4c',
    up: 'Every time you die, you explode: every enemy takes 50 damage and burns for 10 a second for 5 seconds. If that kills the last enemy, you win, keep your heart and stand back up at 10 health.',
    cost: 'In every fight you take 1 burn damage a second.',
  },
  stone: {
    name: 'Heart of Stone', color: '#a8a39a',
    up: 'Every hit you take deals exactly 1, including bleed and poison.',
    cost: 'Max Health becomes 25 (gear Health ignored). Every heal restores exactly 1. Shields still take full hits.',
  },
  pure: {
    name: 'Pure Blood', color: '#e05a6a',
    up: '+20 Health, +2 Damage.',
    cost: 'None. The safe pick.',
  },
  vulture: {
    name: 'Vulture’s Heart', color: '#b58a5a',
    up: 'Heal 30 whenever a rival loses a heart.',
    cost: 'Campfires, potions, springs and the tournament heal restore half.',
  },
  devil: {
    name: 'Devil’s Tooth', color: '#d6402f',
    up: 'Deal double damage.',
    cost: 'Take double damage.',
  },
  gaia: {
    name: 'Gaia’s Embrace', color: '#6fbf5a',
    up: 'Start every fight with Shield 100.',
    cost: 'No healing of any kind, including the tournament heal. Coming back after losing a heart still restores you.',
  },
};
G.GEM_ORDER = ['phoenix', 'stone', 'pure', 'vulture', 'devil', 'gaia'];
