// Balance knobs for the whole game. Change numbers here; no code changes needed.
// All stats are flat whole numbers. Chance stats (Crit, Dodge, Stun) mean "out of 100".
window.G = window.G || {};

G.CONFIG = {
  rooms: 30,               // room 1 is the Armory (pick 1 of 3 weapons)
  specRoom: 5,             // specialization round comes right after this room
  gemRoom: 10,             // heart gem round comes right after this room
  shopRooms: [8, 16, 24],  // these rooms are shared shop rounds instead of doors
  bossRooms: { 10: 'boneKing', 20: 'gorehorn', 30: 'warden' },

  roundSeconds: 30,
  tourBreakSeconds: 6,
  bagSize: 3,

  player: { baseHp: 100, baseCrit: 6 },

  restHeal: 40,            // campfire (does not clear poison)
  springHeal: 24,          // mystery: healing spring
  shrineCost: 16,          // mystery: blood shrine
  arenaHealPct: 0.30,      // heal walking into the tournament (shown as a number)

  poison: { venomStacks: 3, purifyHeal: 10 },

  shop: {
    reviewSeconds: 10,  // everyone looks over the table before picks start
    turnSeconds: 20,    // each player's turn to pick
    lastCall: 10,       // after the last pick, time left for merchant purchases
    aiPickDelay: 1.4,
    passGold: 30,       // gold for passing on the free table (also what happens if your turn runs out)
    extraTableItems: 2,                   // free table = players + this
    potionCost: 30, potionsPerShop: 1,
    gearCount: 4, restockCost: 10,
    bloodGold: 10, bloodCost: [6, 20],
    itemCost: { grey: 20, green: 44, gold: 90 }, itemCostPerRoom: 2,
  },
  salvage: { grey: 2, green: 8, gold: 20 },

  doorWeights: { fight: 46, elite: 16, treasure: 10, rest: 12, mystery: 8, venom: 6, purify: 6 },
  doorMinRoom: { fight: 2, elite: 4, treasure: 3, rest: 4, mystery: 3, venom: 5, purify: 5 },
  purifyWeightPoisoned: 18,

  gold: { fight: [8, 12], elite: [16, 24], boss: [40, 50], skipItemBase: 10, treasureHunterBonus: 4 },

  // Out of 100 wins, how often a consumable joins the reward choices
  consumableChance: { fight: 35, elite: 60, boss: 100, treasure: 50 },

  loot: {
    early: { grey: 92, green: 8,  gold: 0 },
    late:  { grey: 30, green: 54, gold: 16 },
    goldFromRoom: 8,
    pityGoldStep: 1,
    pityGreenStep: 3,
    roomsPerTier: 4,
    tierGrowth: 0.35,
    chanceTierGrowth: 0.12,
    treasureHunterRooms: 6,
    setMatchChance: 50,      // out of 100: a set tag matches a class you already wear
  },

  monster: {
    hpBase: 60, hpGrowth: 1.085,
    hitBase: 8, hitGrowth: 1.07,
    elite: { hp: 1.5, hit: 1.25, packExtra: 1 },
    boss:  { hp: 2.0, hit: 1.2 },
  },

  combat: {
    dt: 0.05,
    maxTime: 24,
    fastAfter: 10,
    startGap: 6,          // steps between the sides at the start
    moveSpeed: 2,         // steps per second
    ranges: { melee: 1, near: 4, far: 6 },
    minHit: 2,
    dodgeCap: 30,
    critCap: 50,
    berserkCap: 20,
    manaMax: 100,
  },
};
