// Balance knobs for the whole game. Change numbers here; no code changes needed.
// All stats are flat whole numbers. Chance stats (Crit, Dodge, Stun) mean "out of 100".
window.G = window.G || {};

G.CONFIG = {
  rooms: 30,               // room 1 is the Armory (pick 1 of 3 weapons), the run really starts in room 2
  specRoom: 5,             // the specialization round comes right after this room
  bossRooms: { 10: 'boneKing', 20: 'gorehorn', 30: 'warden' },

  roundSeconds: 30,        // every round lasts this long for everyone
  tourBreakSeconds: 6,     // pause between tournament matches

  player: { baseHp: 100, baseCrit: 6 },

  restHeal: 40,            // campfire
  springHeal: 24,          // mystery: healing spring
  shrineCost: 16,          // mystery: blood shrine
  arenaHealPct: 0.30,      // heal everyone gets walking into the tournament (shown as a number)

  shop: {
    potionCost: 30, potionHeal: 40, potionsPerVisit: 1,
    bloodGold: 10, bloodCost: [6, 20],   // sacrifice health for gold: lose 6-20 (even), gain 10
    itemCost: { grey: 20, green: 44, gold: 90 }, itemCostPerRoom: 2,
  },
  salvage: { grey: 2, green: 8, gold: 20 },   // gold for the item you replace

  doorWeights: { fight: 44, elite: 16, treasure: 10, rest: 12, shop: 10, mystery: 8 },
  doorMinRoom: { fight: 2, elite: 4, treasure: 3, rest: 4, shop: 3, mystery: 3 },

  gold: { fight: [8, 12], elite: [16, 24], boss: [40, 50], skipItemBase: 10, treasureHunterBonus: 4 },

  loot: {
    // Rarity weights at room 1 and room 30; rooms in between blend in a straight line
    early: { grey: 92, green: 8,  gold: 0 },
    late:  { grey: 30, green: 54, gold: 16 },
    // Bad-luck protection: each roll that misses adds this weight; resets on a hit
    goldFromRoom: 8,         // no legendary drops before this room (bosses excepted)
    pityGoldStep: 1,
    pityGreenStep: 3,
    roomsPerTier: 4,         // item stats step up every 4 rooms (tier 1 = rooms 1-4)
    tierGrowth: 0.35,        // flat stats (health, damage, armor...) +35% of base per tier
    chanceTierGrowth: 0.12,  // chance stats and speed grow slower
    treasureHunterRooms: 6,  // Treasure Hunter rolls loot as if this many rooms deeper
  },

  monster: {
    hpBase: 60, hpGrowth: 1.085,
    hitBase: 7, hitGrowth: 1.07,   // damage per hit at Speed 10
    elite: { hp: 1.5, hit: 1.25 },
    boss:  { hp: 2.0, hit: 1.2 },
  },

  combat: {
    dt: 0.05,
    maxTime: 24,        // sim seconds; longer fights end in a timeout (fits inside a 30s round)
    fastAfter: 10,      // fights play at 1x, then 2x after this many seconds
    engageDelay: 0.7,
    minHit: 2,          // armor can't reduce a hit below this
    dodgeCap: 30,
    critCap: 50,
    berserkCap: 20,
  },
};
