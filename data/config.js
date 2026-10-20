// Balance knobs for the whole game. Change numbers here; no code changes needed.
// All stats are flat whole numbers. Chance stats (Crit, Dodge, Stun) mean "out of 100".
window.G = window.G || {};

G.VERSION = '0.22';   // players in one room must all run the same version

G.CONFIG = {
  // A 10-room pattern that repeats: 5 = Plunder, 7 = merchant, 8 = boss, 10 = duel. Room 30 is the tournament.
  rooms: 29,               // dungeon rooms; the tournament is room 30. Room 1 is the Armory.
  tournamentRoom: 30,
  gemRoom: 8,              // heart gem pick is part of the first boss round
  duelRooms: [10, 20],     // everyone is paired up for a duel
  shopRooms: [5, 15, 25],  // Plunder rounds (shared pile, free picks, weakest first)
  merchantRooms: [7, 17, 27],
  bossRooms: { 8: 'boneKing', 18: 'gorehorn', 28: 'warden' },

  roundSeconds: 45,        // doors, rewards, spec picks... (fights don't count against it)
  tourBreakSeconds: 6,
  tourIntroExtra: 5,
  duelIntroSeconds: 5,     // the duel card shows this long before the fight starts (or press Fight)       // extra seconds before the first tournament round
  bagSize: 6,

  player: { baseHp: 100, baseCrit: 6 },

  hearts: 3,               // lose one when you die in the dungeon or lose a duel/tournament fight

  // Leveling: going from level N to N+1 costs xpBase + N XP
  levels: { max: 20, xpBase: 9, hpPerLevel: 4, specLevel: 5, treeLevels: [10, 15, 20],
    bump: 2 },            // every even level alternates +2 Damage (2, 6, 10...) and +2 Armor (4, 8, 12...)
  xp: { fight: 12, elite: 24, boss: 45, duelWin: 24, duelLoss: 12, trainer: 18, spoils: 18 },

  restHeal: 30,            // campfire (does not clear poison)
  springHeal: 20,          // mystery: healing spring
  shrineCost: 16,          // mystery: blood shrine
  arenaHealPct: 0.30,      // heal walking into the tournament (shown as a number)

  poison: { venomStacks: 10, purifyHeal: 10 },

  phoenix: { burst: 50, burn: 10, burnSeconds: 5, selfBurn: 1, standUp: 10 },
  stoneHp: 25,
  stoneCrack: 3,           // Heart of Stone: each hit deals 1 more than the last, up to this
  gaiaShield: 100,
  vultureHeal: 30,         // Vulture's Heart: heal this much and gain this much max health whenever a rival loses a heart

  // PvP (duels and the tournament): every hit deals half damage so fights last longer
  arena: { damageMult: 0.25, maxTime: 60 },   // past 60 seconds, both players lose a heart
  // Ghosts fill in when a duel or tournament round has an odd number of players
  ghost: { hpMult: 0.5, dmgMult: 0.5 },
  duel: { winGold: 20 },

  // Selling from your bag: gear by rarity; potions and elixirs for half their price
  sell: { grey: 4, green: 12, rare: 30, legendary: 60, consumablePct: 50 },

  shop: {
    reviewSeconds: 10,  // everyone looks over the table before picks start
    turnSeconds: 20,    // each player's turn to pick
    aiPickDelay: 1.4,
    passGold: 30,       // gold for passing on the free table (also what happens if your turn runs out)
    extraTableItems: 2,                   // free table = players + this
    // Everything below is the merchant door
    potionCost: 30, stock: [1, 3],   // a merchant has 1 to 3 of each potion and elixir
    gearCount: 4, restockCosts: [10, 30],  // two restocks per visit
    bloodHealth: 10, bloodGold: [5, 50],   // sell blood: lose this much health for a random amount of gold
    itemCost: { grey: 8, green: 44, rare: 90 }, itemCostPerRoom: { grey: 1, green: 2, rare: 2 },
  },

  // Door weights (out of the total). Trash Pile replaces Treasure; the Vault is rare.
  doorWeights: { fight: 46, elite: 16, trash: 8, vault: 4, rest: 10, mystery: 7, venom: 5, purify: 5, forge: 7, trainer: 7, wager: 6 },
  doorMinRoom: { fight: 2, elite: 4, trash: 3, vault: 6, rest: 4, mystery: 3, venom: 5, purify: 5, forge: 5, trainer: 3, wager: 6 },
  purifyWeightPoisoned: 18,

  wager: { bets: [20, 40], monsterMult: 1.25 },

  gold: { fight: [8, 12], elite: [16, 24], boss: [40, 50], trash: [8, 14], skipItemBase: 10, treasureHunterBonus: 4 },

  // Gear pacing: normal fights give gear 1 in 3 times (otherwise Spoils), elites and bosses always do
  gearChance: { fight: 33, lucky: 50 },
  spoils: { gold: 24, statDmg: 2, statHp: 8 },

  // Out of 100, how often a relic joins the reward choices (Plunder always has one)
  relicChance: { fight: 8, elite: 35, boss: 100, vault: 100 },
  // Legendaries: these bosses always offer one; elites past eliteFromRoom offer one this often (out of 100)
  legendary: { bossRooms: [18, 28], eliteFromRoom: 15, eliteChance: 10, tier: 6 },   // tier: weapon damage matches a rare of this tier
  forge: { upgradeCost: 40, affixCost: 50 },

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
    tagChance: { green: 45, rare: 65 },
    treasureHunterTag: 20,                // Treasure Hunter: this much more often   // out of 100: how often an item carries a class tag
    tradeoffChance: 50,                   // out of 100: an uncommon item's bonus is a trade-off
    setMatchChance: 70,                   // out of 100: a tag leans toward a class you already wear
  },

  // Shared set supply: pieces of each class in the whole match
  supplyPerClass: 12,

  monster: {
    hpBase: 54, hpGrowth: 1.094,
    hitBase: 7, hitGrowth: 1.076,
    elite: { hp: 1.35, hit: 1.15, packExtra: 1 },
    boss:  { hp: 1.6, hit: 1.1 },
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
    firstCritCap: 6,      // "your first attacks crit" effects add up to at most this many
    critStun: 2,          // a stun from a critical hit lasts this many seconds (normal stuns last 1)
    stunImmune: 3,        // after being stunned, you can't be stunned again for this many seconds
  },
};
