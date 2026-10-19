// Monsters. hp and hit are multipliers on the room's base curve (see CONFIG.monster).
// spd = attacks per 10 seconds. armor/ward/dodge/crit/stun/leech/bleed are flat.
// pack = how many show up together (each with the listed hp/hit).
// split = on death, spawns `count` copies of the next stage (Splitting Slime).
// steal = gold taken per hit; escapeAfter = hits before a thief runs off with it.
// Sprite key = 'monster_' + (sprite || id). All monsters are melee in v2.
window.G = window.G || {};

G.MONSTERS = [
  { id: 'rat',      name: 'Giant Rat',        minRoom: 2,  maxRoom: 7,  hp: 0.8, hit: 0.7, spd: 14 },
  { id: 'slime',    name: 'Splitting Slime',  minRoom: 2,  maxRoom: 16, hp: 0.5, hit: 0.8, spd: 8, scale: 1.25,
    split: { count: 2, hp: 0.25, hit: 0.6, scale: 0.9, next: { count: 2, hp: 0.125, hit: 0.45, scale: 0.6 } } },
  { id: 'wolf',     name: 'Wolf Pack',        minRoom: 3,  maxRoom: 14, pack: 3, memberName: 'Wolf', hp: 0.45, hit: 0.5, spd: 14, bleed: 2 },
  { id: 'skeleton', name: 'Skeleton',         minRoom: 3,  maxRoom: 14, hp: 1.0, hit: 1.0, spd: 10, armor: 2 },
  { id: 'goblin',   name: 'Goblin Cutthroat', minRoom: 4,  maxRoom: 16, hp: 0.8, hit: 0.75, spd: 16, dodge: 12, crit: 10 },
  { id: 'thief',    name: 'Thieves',          minRoom: 5,  maxRoom: 20, pack: 2, memberName: 'Thief', hp: 0.65, hit: 0.55, spd: 14, dodge: 10, steal: 2, escapeAfter: 3 },
  { id: 'orc',      name: 'Orc Brute',        minRoom: 8,  maxRoom: 24, hp: 1.3, hit: 1.3, spd: 8, armor: 4 },
  { id: 'golem',    name: 'Rock Golems',      minRoom: 8,  maxRoom: 22, pack: 2, memberName: 'Rock Golem', hp: 0.65, hit: 0.8, spd: 6, armor: 6, stun: 20 },
  { id: 'wraith',   name: 'Wraith',           minRoom: 12, maxRoom: 30, hp: 0.9, hit: 1.0, spd: 12, dodge: 20, ward: 4 },
  { id: 'troll',    name: 'Cave Troll',       minRoom: 15, maxRoom: 30, hp: 1.6, hit: 1.2, spd: 8, armor: 6 },
  { id: 'ogre',     name: 'Ogre Smasher',     minRoom: 18, maxRoom: 30, hp: 1.4, hit: 1.8, spd: 6, stun: 16 },
  { id: 'cultist',  name: 'Blood Cultist',    minRoom: 20, maxRoom: 30, hp: 1.0, hit: 0.9, spd: 12, leech: 4, ward: 4 },
];

G.BOSSES = {
  boneKing: { id: 'boneKing', name: 'The Bone King', hp: 0.8, hit: 0.9, spd: 10, armor: 4 },
  gorehorn: { id: 'gorehorn', name: 'Gorehorn',      hp: 0.95, hit: 1.2, spd: 8, stun: 14 },
  warden:   { id: 'warden',   name: 'The Warden',    hp: 0.8, hit: 0.85, spd: 10, armor: 6, ward: 4, crit: 8 },
};

G.RIVALS = [
  { name: 'Brakka',   tint: 0xe8a07a },
  { name: 'Sel',      tint: 0xb6e3a1 },
  { name: 'Old Moru', tint: 0xd9a6e8 },
  { name: 'Vex',      tint: 0xf2e28c },
  { name: 'Tamsin',   tint: 0xa9c6e0 },
];
G.PLAYER_TINT = 0x7fd4ff;
