// Heart gems: picked (1 of 3 random) after the room 10 boss. Each has an upside and a cost.
window.G = window.G || {};

G.GEMS = {
  phoenix: {
    name: 'Phoenix Heart', color: '#ff8a4c',
    up: 'When you die, you explode for 100 true damage and set every enemy burning for 100 more true damage over 5 seconds (true damage ignores Armor and Magic Resist; Shields take its full amount). Then you become an egg with half your max health for 5 seconds. The egg can’t attack or dodge, and nothing from your gear, sets, spec or relics protects it. If every enemy dies before it cracks, you hatch at 25 health and win.',
    cost: 'In every fight you take 1 burn damage a second.',
  },
  stone: {
    name: 'Heart of Stone', color: '#a8a39a',
    up: 'Hits on your health deal at most 1 for the first 5 seconds of a fight, at most 2 for the next 5, then at most 3 for the rest. Enemies attack 15% slower.',
    cost: 'Max Health becomes 25 (gear Health ignored). Every heal restores exactly 1. Shields still take full hits.',
  },
  pure: {
    name: 'Pure Blood', color: '#e05a6a',
    up: '+50 max Health and +2 Damage. Heals you 50 when you take it.',
    cost: 'None. The safe pick.',
  },
  vulture: {
    name: 'Vulture’s Heart', color: '#b58a5a',
    up: 'Whenever a rival loses a heart: +10 max Health and heal 30.',
    cost: 'Campfires, potions, springs and the tournament heal restore half.',
  },
  devil: {
    name: 'Devil’s Tooth', color: '#d6402f',
    up: 'Deal double damage.',
    cost: 'Take 50% more damage.',
  },
  gaia: {
    name: 'Gaia’s Embrace', color: '#6fbf5a',
    up: 'Start every fight with Shield 100. While any Shield holds, heal 5 a second (the one healing Gaia allows).',
    cost: 'No healing of any kind, including the tournament heal. Coming back after losing a heart still restores you.',
  },
};
G.GEM_ORDER = ['phoenix', 'stone', 'pure', 'vulture', 'devil', 'gaia'];
