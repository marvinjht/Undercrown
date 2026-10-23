// Specializations, picked at level 5 (3 random options). params = the numbers the game uses; keep desc in sync.
// tree: at level 10 and 15 you pick left or right; level 20 is the capstone. fx keys are read by combat.js.
window.G = window.G || {};

G.SPECS = {
  shadow: {
    name: 'Shadow', role: 'Rogue',
    params: { every: 6, bleed: 4 },
    desc: 'Every 6 seconds your next attack is a Cheap Shot: a guaranteed crit that causes Bleed 4.',
    tip: 'Best with fast weapons and crit.',
    affinity: ['daggers', 'saber'],
  },
  bloodthirst: {
    name: 'Bloodthirst', role: 'Reaver',
    params: { leech: 0, pct: 5 },
    desc: 'Heal 5% of the damage you deal. The healing stays with you after the fight.',
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
    desc: 'Loot rolls as if you were 6 rooms deeper, one extra item to choose from after fights, +4 gold per fight, and you always pick first at Plunder.',
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

G.SPEC_TREES = {
  shadow: {
    t10: [{ id: 'quick', name: 'Quick Hands', fx: { cheapEvery: 4 }, desc: 'Cheap Shot every 4 seconds instead of 6' },
          { id: 'dirty', name: 'Dirty Fighting', fx: { cheapDmg: 10, cheapSlow: { spd: 3, secs: 2 } }, desc: 'Cheap Shots deal +10 and lower the target’s Attack Speed by 3 for 2 seconds' }],
    t15: [{ id: 'poison', name: 'Poisoned Blade', fx: { bladePoison: { cap: 25 } }, desc: 'Every hit adds 1 poison, up to 25. Poisoned enemies take damage equal to their poison every 2 seconds, and in duels it stays with them' },
          { id: 'smoke', name: 'Smoke Bomb', fx: { smokeDodge: 20 }, desc: 'After a Cheap Shot, +20 Dodge for 2 seconds' }],
    t20: { id: 'nightlord', name: 'Night Lord', fx: { openInvis: 3, nightLord: 1 }, desc: 'Start every fight invisible for up to 3 seconds (your first hit reveals you). That hit marks the target for 3 seconds, then it bursts for half the damage it took' },
  },
  bloodthirst: {
    t10: [{ id: 'gorge', name: 'Gorge', fx: { overhealShield: 40 }, desc: 'Healing past full health becomes Shield, up to 40' },
          { id: 'frenzy', name: 'Frenzy', fx: { lowSpd: 4 }, desc: '+4 Attack Speed below half health' }],
    t15: [{ id: 'pact', name: 'Blood Pact', stats: { leech: 4, hp: -10 }, desc: '+4 more Life on Hit, −10 max Health' },
          { id: 'hemorrhage', name: 'Hemorrhage', stats: { bleed: 1 }, fx: { bleedHeal: 50 }, desc: 'Your hits cause Bleed 1, and all bleed you cause heals you for half its damage (rounded up)' }],
    t20: { id: 'sanguine', name: 'Sanguine', fx: { lowLeechDouble: 1 }, desc: 'Life on Hit heals double below half health' },
  },
  juggernaut: {
    t10: [{ id: 'bulwark', name: 'Bulwark', stats: { armor: 4 }, desc: '+4 Armor' },
          { id: 'thick', name: 'Thick Skin', stats: { ward: 4 }, desc: '+4 Magic Resist' }],
    t15: [{ id: 'unstoppable', name: 'Unstoppable', fx: { stunImmune: 1 }, desc: 'You can’t be stunned' },
          { id: 'retaliate', name: 'Retaliate', fx: { retaliate: 4 }, desc: 'Every hit you take deals 4 back' }],
    t20: { id: 'colossus', name: 'Colossus', fx: { armorShield: 4 }, desc: 'Start each fight with Shield equal to 4 times your Armor' },
  },
  berserker: {
    t10: [{ id: 'bloodlust', name: 'Bloodlust', fx: { berserkCap: 30 }, desc: 'Your bonus cap rises from +20 to +30 Damage' },
          { id: 'thrill', name: 'Thrill', fx: { lowSpd: 2 }, desc: '+2 Attack Speed below half health' }],
    t15: [{ id: 'reckless', name: 'Reckless', fx: { critDmgFlat: 10, takeMore: 2 }, desc: 'Crits deal +10, but you take +2 per hit' },
          { id: 'breath', name: 'Second Breath', fx: { quarterHeal: 30 }, desc: 'The first time you drop below a quarter health, heal 30' }],
    t20: { id: 'undying', name: 'Undying Rage', fx: { undying: 3 }, desc: 'Once per fight, at 0 health you stay at 1 for 3 seconds' },
  },
  treasureHunter: {
    t10: [{ id: 'haggler', name: 'Haggler', fx: { freeMerchant: 1 }, desc: 'Your first gear purchase at each merchant is free' },
          { id: 'scavenger', name: 'Scavenger', fx: { spoils4: 1 }, desc: 'Spoils offer 4 choices instead of 3' }],
    t15: [{ id: 'lucky', name: 'Lucky Find', fx: { luckyGear: 1 }, desc: 'Gear from 1 in 2 normal fights instead of 1 in 3' },
          { id: 'collector', name: 'Collector', fx: { collector: 1 }, desc: 'Class-tagged drops lean toward your main class' }],
    t20: { id: 'midas', name: 'Midas', fx: { midas: { per: 25, dmg: 4, hp: 5 } }, desc: '+4 Damage and +5 Health for every 25 gold you hold' },
  },
  duelist: {
    t10: [{ id: 'riposte', name: 'Riposte', fx: { parryShield: 20 }, desc: 'Each parry gives you Shield 20' },
          { id: 'footwork', name: 'Footwork', fx: { parryEvery: 3 }, desc: 'Parry every 3rd attack instead of every 4th' }],
    t15: [{ id: 'read', name: 'Read the Fight', fx: { parrySlow: { spd: 5, max: 15 } }, desc: 'Each parry lowers the attacker’s Attack Speed by 5 for the fight, up to 15' },
          { id: 'disarm', name: 'Disarm', fx: { parryStun: 1 }, desc: 'Parries stun the attacker for 1 second' }],
    t20: { id: 'blademaster', name: 'Blade Master', fx: { counterCrit: 1 }, desc: 'Your counters always crit' },
  },
};

G.SPEC_ORDER = ['shadow', 'bloodthirst', 'juggernaut', 'berserker', 'treasureHunter', 'duelist'];
