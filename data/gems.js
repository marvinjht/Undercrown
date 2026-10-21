// Heart gems: picked (1 of 3 random) after the room 10 boss. Each has an upside and a cost.
window.G = window.G || {};

G.GEMS = {
  phoenix: {
    name: 'Phoenix Heart', color: '#ff8a4c',
    up: 'When you die, you explode for 100 true damage and set every enemy burning for 100 more true damage over 5 seconds (true damage ignores Shields and every reduction). Then you become an egg with half your max health for 5 seconds. The egg can’t attack or dodge, and nothing from your gear, sets, spec or relics protects it. If every enemy dies before it cracks, you hatch at 25 health and win.',
    cost: 'In every fight you take 1 burn damage a second.',
  },
  stone: {
    name: 'Heart of Stone', color: '#a8a39a',
    up: 'For the first 5 seconds of a fight, every hit on your health deals 1. After that, each enemy’s hits deal 1, then 2, then 3 (never more). Enemies attack 15% slower.',
    cost: 'Max Health becomes 25 (gear Health ignored). Every heal restores exactly 1. Shields still take full hits.',
  },
  pure: {
    name: 'Pure Blood', color: '#e05a6a',
    up: '+100 max Health and +2 Damage. Heals you 100 when you take it.',
    cost: 'None. The safe pick.',
  },
  vulture: {
    name: 'Vulture’s Heart', color: '#b58a5a',
    up: 'Whenever a rival loses a heart: +10 max health and heal 10.',
    cost: 'Campfires, potions, springs and the tournament heal restore half.',
  },
  devil: {
    name: 'Devil’s Tooth', color: '#d6402f',
    up: 'Deal double damage.',
    cost: 'Take 50% more damage.',
  },
  gaia: {
    name: 'Gaia’s Embrace', color: '#6fbf5a',
    up: 'Start every fight with Shield 100.',
    cost: 'No healing of any kind, including the tournament heal. Coming back after losing a heart still restores you.',
  },
};
G.GEM_ORDER = ['phoenix', 'stone', 'pure', 'vulture', 'devil', 'gaia'];
