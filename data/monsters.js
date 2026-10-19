// Monsters. hp and hit are multipliers on the room's base curve (see CONFIG.monster).
// spd = attacks per 10 seconds. armor/dodge/crit/stun/leech are flat.
// Sprite key = 'monster_' + id.
window.G = window.G || {};

G.MONSTERS = [
  { id: 'rat',      name: 'Giant Rat',        minRoom: 2,  maxRoom: 7,  hp: 0.8, hit: 0.7, spd: 14 },
  { id: 'slime',    name: 'Cave Slime',       minRoom: 2,  maxRoom: 9,  hp: 1.3, hit: 0.9, spd: 8 },
  { id: 'skeleton', name: 'Skeleton',         minRoom: 3,  maxRoom: 14, hp: 1.0, hit: 1.0, spd: 10, armor: 2 },
  { id: 'goblin',   name: 'Goblin Cutthroat', minRoom: 4,  maxRoom: 16, hp: 0.8, hit: 0.75, spd: 16, dodge: 12, crit: 10 },
  { id: 'orc',      name: 'Orc Brute',        minRoom: 8,  maxRoom: 24, hp: 1.3, hit: 1.3, spd: 8, armor: 4 },
  { id: 'wraith',   name: 'Wraith',           minRoom: 12, maxRoom: 30, hp: 0.9, hit: 1.0, spd: 12, dodge: 20 },
  { id: 'troll',    name: 'Cave Troll',       minRoom: 15, maxRoom: 30, hp: 1.6, hit: 1.2, spd: 8, armor: 6 },
  { id: 'ogre',     name: 'Ogre Smasher',     minRoom: 18, maxRoom: 30, hp: 1.4, hit: 1.8, spd: 6, stun: 16 },
  { id: 'cultist',  name: 'Blood Cultist',    minRoom: 20, maxRoom: 30, hp: 1.0, hit: 0.9, spd: 12, leech: 4 },
];

G.BOSSES = {
  boneKing: { id: 'boneKing', name: 'The Bone King', hp: 0.8, hit: 0.9, spd: 10, armor: 4 },
  gorehorn: { id: 'gorehorn', name: 'Gorehorn',      hp: 0.95, hit: 1.2, spd: 8, stun: 14 },
  warden:   { id: 'warden',   name: 'The Warden',    hp: 0.8, hit: 0.85, spd: 10, armor: 6, crit: 8 },
};

G.RIVALS = [
  { name: 'Brakka',   tint: 0xe8a07a },
  { name: 'Sel',      tint: 0xb6e3a1 },
  { name: 'Old Moru', tint: 0xd9a6e8 },
  { name: 'Vex',      tint: 0xf2e28c },
  { name: 'Tamsin',   tint: 0xa9c6e0 },
];
G.PLAYER_TINT = 0x7fd4ff;
