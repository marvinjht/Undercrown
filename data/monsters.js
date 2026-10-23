// Monsters. hp and hit are multipliers on the room's base curve (see CONFIG.monster).
// spd = attacks per 10 seconds. armor/ward/dodge/crit/stun/leech/bleed are flat.
// pack = how many show up together (each with the listed hp/hit).
// split = on death, spawns `count` copies of the next stage (Splitting Slime).
// steal = gold taken per hit (thieves keep fighting; they never run off).
// Sprite key = 'monster_' + (sprite || id). range = 'near'/'far' shoots from a distance; type: 'magic' hits are cut by Magic Resist, not Armor.
window.G = window.G || {};

G.MONSTERS = [
  { id: 'rat',      name: 'Giant Rat',        minRoom: 2,  maxRoom: 7,  hp: 0.8, hit: 0.7, spd: 14 },
  { id: 'slime',    name: 'Splitting Slime',  minRoom: 2,  maxRoom: 16, hp: 0.5, hit: 0.8, spd: 8, scale: 1.25,
    split: { count: 2, hp: 0.25, hit: 0.55, scale: 0.85 } },
  { id: 'slimeElite', name: 'Elite Slime',    minRoom: 15, maxRoom: 30, hp: 0.6, hit: 0.85, spd: 8, scale: 1.35,
    split: { count: 2, hp: 0.3, hit: 0.6, scale: 0.95, next: { count: 2, hp: 0.15, hit: 0.45, scale: 0.65 } } },
  { id: 'wolf',     name: 'Wolf Pack',        minRoom: 3,  maxRoom: 14, pack: 3, memberName: 'Wolf', hp: 0.4, hit: 0.5, spd: 12, bleed: 2 },
  { id: 'snake',    name: 'Snake Nest',       minRoom: 4,  maxRoom: 22, pack: 3, memberName: 'Snake', hp: 0.35, hit: 0.4, spd: 10, poison: 1, crit: 30,
    note: 'Critical bites add 1 poison.',
    // Elite version: a Hydra leads the nest and every bite poisons twice as much
    eliteForm: { name: 'Hydra Nest', leader: { id: 'hydra', name: 'Hydra', hp: 1.0, hit: 0.8, spd: 8, poison: 2, crit: 30, scale: 1.35 }, poison: 2,
      note: 'A Hydra and 3 snakes. Critical bites add 2 poison.' } },
  { id: 'skeletonArcher', name: 'Skeleton Archers', minRoom: 6, maxRoom: 26, pack: 2, memberName: 'Skeleton Archer', hp: 0.45, hit: 0.55, spd: 8, armor: 2, range: 'near',
    note: 'They shoot from a few steps away.' },
  { id: 'disciple', name: 'Disciples',       minRoom: 9, maxRoom: 28, pack: 2, memberName: 'Disciple', hp: 0.45, hit: 0.55, spd: 8, ward: 2, range: 'near', type: 'magic',
    note: 'They cast magic bolts from a few steps away (Magic Resist blocks them, Armor doesn’t).' },
  { id: 'skeleton', name: 'Skeleton',         minRoom: 3,  maxRoom: 14, hp: 1.0, hit: 1.0, spd: 10, armor: 2 },
  { id: 'goblin',   name: 'Goblin Cutthroat', minRoom: 4,  maxRoom: 16, hp: 0.8, hit: 0.75, spd: 16, dodge: 12, crit: 10 },
  { id: 'thief',    name: 'Thieves',          minRoom: 5,  maxRoom: 20, pack: 2, memberName: 'Thief', hp: 0.65, hit: 0.55, spd: 14, dodge: 10, steal: 2 },
  { id: 'orc',      name: 'Orc Brute',        minRoom: 8,  maxRoom: 24, hp: 1.3, hit: 1.3, spd: 8, armor: 4 },
  { id: 'golem',    name: 'Rock Golems',      minRoom: 8,  maxRoom: 22, pack: 2, memberName: 'Rock Golem', hp: 0.65, hit: 0.8, spd: 6, armor: 6, stun: 20 },
  { id: 'wraith',   name: 'Wraith',           minRoom: 12, maxRoom: 30, hp: 0.9, hit: 1.0, spd: 12, dodge: 20, ward: 4 },
  { id: 'troll',    name: 'Cave Troll',       minRoom: 15, maxRoom: 30, hp: 1.6, hit: 1.2, spd: 8, armor: 6 },
  { id: 'ogre',     name: 'Ogre Smasher',     minRoom: 18, maxRoom: 30, hp: 1.4, hit: 1.8, spd: 6, stun: 16 },
  { id: 'cultist',  name: 'Blood Cultist',    minRoom: 20, maxRoom: 30, hp: 1.0, hit: 0.9, spd: 12, leech: 4, ward: 4 },
];

// The Jester: only ever behind a Wager door. One hit pops it, and it explodes on you (CONFIG.wager.jesterBlast).
G.JESTER = { id: 'jester', name: 'The Jester', hp: 0.01, hit: 0, spd: 1, scale: 0.9, fx: { noAttack: 1 } };

// Bosses. Each match draws three of these for rooms 8, 18 and 28 (everyone in a room meets the same ones).
// minions = weak helpers that fight alongside; fx = boss mechanics read by combat.js.
G.BOSSES = {
  boneKing: { id: 'boneKing', name: 'The Bone King', hp: 0.8, hit: 0.9, spd: 10, armor: 4, trait: 'ironclad' },
  gorehorn: { id: 'gorehorn', name: 'Gorehorn',      hp: 0.95, hit: 1.2, spd: 8, stun: 14, trait: 'thorns' },
  warden:   { id: 'warden',   name: 'The Warden',    hp: 0.8, hit: 0.85, spd: 10, armor: 6, ward: 4, crit: 8, trait: 'spellward' },
  yeti:     { id: 'yeti',     name: 'The Frost Yeti', hp: 0.9, hit: 1.0, spd: 8, armor: 2, early: { hit: 1.2 },
    fx: { chill: { stacks: 3, secs: 2, cooldown: 6 } },
    desc: 'Every hit Chills you. At 3 Chill you freeze solid for 2 seconds (at most once every 6). Stubborn: the freeze ignores the stun limit. Kill it fast or dodge.' },
  wraithKing: { id: 'wraithKing', name: 'The Wraith King', hp: 0.75, hit: 0.8, spd: 8, ward: 4, early: { hp: 0.75, hit: 0.7 },
    minions: { count: 3, id: 'ghoul', name: 'Ghoul', hp: 0.1, hit: 0.16, spd: 10 },
    fx: { raise: { count: 3, manaGain: 16 } },   // 16: raises about 1 second sooner than 14
    desc: 'Fights with 3 ghouls. When his bar fills he raises 3 more. Area damage and burst help.' },
  alphaWolf: { id: 'alphaWolf', name: 'The Alpha Wolf', hp: 0.7, hit: 0.85, spd: 10, bleed: 2, early: { hp: 0.8, hit: 0.75 },
    minions: { count: 3, id: 'wolf', name: 'Shadow Wolf', hp: 0.2, hit: 0.24, spd: 12, fx: { packFade: { every: 6, secs: 3 } } },
    desc: 'Leads 3 wolves that vanish for 3 seconds every 6. While they hide, hit the Alpha.' },
  occultist: { id: 'occultist', name: 'The Occultist', hp: 0.75, hit: 0.6, spd: 8, ward: 4, range: 'near', type: 'magic', early: { hp: 0.8, hit: 0.75 },
    minions: { count: 2, id: 'disciple', name: 'Disciple', hp: 0.25, hit: 0.35, spd: 8, range: 'near', type: 'magic' },
    desc: 'Casts magic bolts from range with 2 Disciples whose bolts hit harder than usual. Magic Resist blocks them; Armor doesn’t.' },
  mire:     { id: 'mire',     name: 'The Mire Beast', hp: 1.0, hit: 1.35, spd: 5, armor: 2, early: { hit: 1.15 },
    fx: { mire: { pct: 8, max: 5 } },
    desc: 'Slow, crushing blows. Each hit cuts your Attack Speed by 8%, stacking 5 times.' },
};
G.BOSS_ORDER = Object.keys(G.BOSSES);

// Elite traits: every elite rolls one, shown on its door. Each punishes a one-note build.
G.ELITE_TRAITS = {
  ironclad:      { name: 'Ironclad',      stats: { armor: 12 }, desc: '+12 Armor. Bring magic, holy or Pierce.' },
  spellward:     { name: 'Spellward',     stats: { ward: 12 },  desc: '+12 Magic Resist. Bring physical damage.' },
  swarm:         { name: 'Swarm',         extra: 2,             desc: 'Comes with 2 extra weak copies. Cleave, area spells and fast attacks help.' },
  evasive:       { name: 'Evasive',       stats: { dodge: 20 }, desc: '+20 Dodge. Fast attacks and Crit help.' },
  thorns:        { name: 'Thorns',        thorns: 3,            desc: 'Every hit it takes deals 3 back. Slow heavy hits and Life on Hit help.' },
  shieldbreaker: { name: 'Shieldbreaker', shieldBreak: true,    desc: 'Deals double damage to Shields. Armor and Health help.' },
};
G.ELITE_TRAIT_ORDER = Object.keys(G.ELITE_TRAITS);

G.RIVALS = [
  { name: 'Brakka',   tint: 0xe8a07a },
  { name: 'Sel',      tint: 0xb6e3a1 },
  { name: 'Old Moru', tint: 0xd9a6e8 },
  { name: 'Vex',      tint: 0xf2e28c },
  { name: 'Tamsin',   tint: 0xa9c6e0 },
];
G.PLAYER_TINT = 0x7fd4ff;
