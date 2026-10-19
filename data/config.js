// Balance knobs for the whole game. Change numbers here; no code changes needed.
// All stats are flat whole numbers. Chance stats (Crit, Dodge, Stun) mean "out of 100".
window.G = window.G || {};

G.CONFIG = {
  rooms: 30,               // room 1 is the Armory (pick 1 of 3 weapons)
  gemRoom: 10,             // heart gem pick comes right after this room's boss
  duelRooms: [10, 20],     // after the boss, everyone is paired up for a duel
  shopRooms: [8, 16, 24],  // these rooms are shop rounds (free picks) instead of doors
  bossRooms: { 10: 'boneKing', 20: 'gorehorn', 30: 'warden' },

  roundSeconds: 45,        // doors, rewards, spec picks... (fights don't count against it)
  tourBreakSeconds: 6,
  bagSize: 3,

  player: { baseHp: 100, baseCrit: 6 },

  hearts: 3,               // lose one when you die in the dungeon or lose a duel/tournament fight

  // Leveling: going from level N to N+1 costs xpBase + N XP
  levels: { max: 20, xpBase: 9, hpPerLevel: 4, specLevel: 5, treeLevels: [10, 15, 20] },
  xp: { fight: 12, elite: 24, boss: 45, duelWin: 24, duelLoss: 12, trainer: 36, spoils: 18 },

  restHeal: 30,            // campfire (does not clear poison)
  springHeal: 20,          // mystery: healing spring
  shrineCost: 16,          // mystery: blood shrine
  arenaHealPct: 0.30,      // heal walking into the tournament (shown as a number)

  poison: { venomStacks: 3, purifyHeal: 10 },

  phoenix: { burst: 50, burn: 10, burnSeconds: 5, selfBurn: 1, standUp: 10 },
  stoneHp: 25,
  gaiaShield: 100,
  vultureHeal: 30,

  // PvP (duels and the tournament): every hit deals half damage so fights last longer
  arena: { damageMult: 0.25 },
  // Ghosts fill in when a duel or tournament round has an odd number of players
  ghost: { hpMult: 0.5, dmgMult: 0.5 },
  duel: { winGold: 20 },

  shop: {
    reviewSeconds: 10,  // everyone looks over the table before picks start
    turnSeconds: 20,    // each player's turn to pick
    aiPickDelay: 1.4,
    passGold: 30,       // gold for passing on the free table (also what happens if your turn runs out)
    extraTableItems: 2,                   // free table = players + this
    // Everything below is the merchant door
    potionCost: 30, potionStock: [1, 3],   // a merchant has 1 to 3 potions
    gearCount: 4, restockCosts: [25, 50],  // two restocks per visit
    bloodGold: 10, bloodCost: [6, 20],
    itemCost: { grey: 20, green: 44, rare: 90 }, itemCostPerRoom: 2,
  },
  salvage: { grey: 2, green: 8, rare: 20 },

  // Door weights (out of the total). Trash Pile replaces Treasure; the Vault is rare.
  doorWeights: { fight: 46, elite: 16, trash: 8, vault: 4, rest: 10, mystery: 7, venom: 5, purify: 5, merchant: 18, forge: 7, trainer: 7, wager: 6 },
  doorMinRoom: { fight: 2, elite: 4, trash: 3, vault: 6, rest: 4, mystery: 3, venom: 5, purify: 5, merchant: 3, forge: 5, trainer: 3, wager: 6 },
  merchantGapFromShop: 1,
  purifyWeightPoisoned: 18,

  forge: { upgradeCost: 40, rerollCost: 25 },
  wager: { bets: [20, 40], monsterMult: 1.25 },

  gold: { fight: [8, 12], elite: [16, 24], boss: [40, 50], trash: [8, 14], skipItemBase: 10, treasureHunterBonus: 4 },

  // Gear pacing: normal fights give gear 1 in 3 times (otherwise Spoils), elites and bosses always do
  gearChance: { fight: 33, lucky: 50 },
  spoils: { gold: 24, statDmg: 2, statHp: 8 },

  // Out of 100 wins, how often a consumable joins the reward choices
  consumableChance: { fight: 35, elite: 60, boss: 100, vault: 50 },

  loot: {
    early: { grey: 92, green: 8,  rare: 0 },
    late:  { grey: 30, green: 54, rare: 16 },
    rareFromRoom: 8,
    pityRareStep: 1,
    pityGreenStep: 3,
    roomsPerTier: 4,
    tierGrowth: 0.25,
    chanceTierGrowth: 0.10,
    treasureHunterRooms: 6,
    tagChance: { green: 45, rare: 65 },   // out of 100: how often an item carries a class tag
    tradeoffChance: 50,                   // out of 100: an uncommon item's bonus is a trade-off
    setMatchChance: 70,                   // out of 100: a tag leans toward a class you already wear
  },

  // Shared set supply: pieces of each class in the whole match
  supplyPerClass: 12,

  monster: {
    hpBase: 50, hpGrowth: 1.08,
    hitBase: 6, hitGrowth: 1.065,
    elite: { hp: 1.35, hit: 1.15, packExtra: 1 },
    boss:  { hp: 1.5, hit: 1.0 },
    swarmCopy: { hp: 0.35, hit: 0.5 },
  },

  combat: {
    dt: 0.05,
    maxTime: 24,
    fastAfter: 10,
    startGap: 6,          // steps between the sides at the start
    moveSpeed: 2,         // steps per second
    kiteEdge: 1.4,        // how far past the start lines a Kiting archer can step back
    ranges: { melee: 1, near: 4, far: 6 },
    minHit: 2,
    dodgeCap: 30,
    critCap: 50,
    berserkCap: 20,
    manaMax: 100,
    minSpd: 4,
  },
};
