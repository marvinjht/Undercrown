// Heart gems: picked (1 of 3 random) after the room 10 boss. Each has an upside and a cost.
window.G = window.G || {};

G.GEMS = {
  phoenix: {
    name: 'Phoenix Heart', color: '#ff8a4c',
    up: 'On death: explode for 100 true damage, and every enemy burns for 100 more over 5 seconds. You become an egg for 5 seconds (half health, can’t attack or dodge). If every enemy dies first, you hatch at 25 health and win.',
    cost: 'In every fight you take 2 burn damage a second.',
  },
  stone: {
    name: 'Heart of Stone', color: '#a8a39a',
    up: 'Hits on your health deal at most 1 for the first 5 seconds of a fight, at most 2 for the next 5, then at most 3 for the rest. Enemies attack with 3 less Attack Speed.',
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
  janus: {
    name: 'Janus’s Eye', color: '#7fd8e8',
    up: 'See the estimated outcome of every fight before you pick a door. From room 11, a hologram of you as you were 10 rooms ago fights beside you in every fight (half its health, damage and other stats).',
    cost: 'You get half the XP from monster fights.',
  },
  gaia: {
    name: 'Gaia’s Embrace', color: '#6fbf5a',
    up: 'Start every fight with Shield 100. While any Shield holds, heal 5 a second (the one healing Gaia allows).',
    cost: 'No healing of any kind, including the tournament heal. Coming back after losing a heart still restores you.',
  },
};
G.GEM_ORDER = ['phoenix', 'stone', 'pure', 'vulture', 'devil', 'gaia', 'janus'];
