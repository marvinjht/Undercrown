// Balance knobs for the whole game. Change numbers here; no code changes needed.
// All stats are flat whole numbers. Chance stats (Crit, Dodge, Stun) mean "out of 100".
window.G = window.G || {};

G.VERSION = '0.43';   // players in one room must all run the same version

G.CONFIG = {
  // A 10-room pattern that repeats: 5 = Plunder, 7 = merchant, 8 = boss, 10 = duel. Room 30 is the tournament.
  rooms: 29,               // dungeon rooms; the tournament is room 30. Room 1 is the Armory.
  tournamentRoom: 30,
  gemRoom: 8,              // heart gem pick is part of the first boss round
  duelRooms: [10, 20],     // everyone is paired up for a duel
  shopRooms: [5, 15, 25],  // Plunder rounds (shared pile, free picks, weakest first)
  merchantRooms: [7, 17, 27],
  bossRooms: { 8: 1, 18: 2, 28: 3 },   // which boss comes is drawn from G.BOSSES at the start of each match (same for everyone)

  roundSeconds: 45,        // doors, rewards, spec picks... (fights don't count against it)
  tourBreakSeconds: 6,
  skipHurrySeconds: 10,    // a passed skip vote cuts the slow player's clock to this (needs 3+ players still in)
  tourIntroExtra: 5,
  duelIntroSeconds: 5,     // the duel card shows this long before the fight starts (or press Fight)       // extra seconds before the first tournament round
  bagSize: 6,

  player: { baseHp: 100, baseCrit: 6 },

  hearts: 3,               // lose one when you die in the dungeon or lose a duel/tournament fight

  // Leveling: going from level N to N+1 costs xpBase + N XP
  levels: { max: 20, xpBase: 9, hpPerLevel: 4, specLevel: 5, treeLevels: [10, 15, 20],
    bump: 2 },            // every even level alternates +2 Damage (2, 6, 10...) and +2 Armor (4, 8, 12...)
  xp: { fight: 12, elite: 24, boss: 45, duelWin: 24, duelLoss: 12, trainer: 15, spoils: 18, tome: 15 },

  restHeal: 30,            // campfire (does not clear poison)
  springHeal: 20,          // mystery: healing spring
  shrineCost: 16,          // mystery: blood shrine
  arenaHealPct: 0.30,      // heal walking into the tournament (shown as a number)

  poison: { venomStacks: 10, purifyHeal: 10, purifyCleanHeal: 20, fightCap: 25 },   // purifyCleanHeal: the spring's heal when you weren't poisoned;   // fightCap: most poison you can pick up in one fight

  phoenix: { burst: 100, burn: 20, burnSeconds: 5, selfBurn: 2, standUp: 25, eggSeconds: 5, eggHpPct: 50 },   // explode, burn them, hide in an egg
  janus: { lag: 5, mult: 0.5, xpMult: 0.5 },   // Janus's Eye: the hologram is you from this many rooms ago, at this much of everything
  stoneHp: 25,
  stoneGrace: 5,           // Heart of Stone: hits deal 1 for this many seconds, at most 2 for the same again, then at most stoneCrack
  stoneCrack: 3,
  stoneSlow: 3,            // Heart of Stone: enemies attack with this much less Attack Speed
  devilTaken: 1.5,         // Devil's Tooth: damage taken multiplier
  pureBlood: { hp: 50, dmg: 2, heal: 50 },           // Heart of Stone: each hit deals 1 more than the last, up to this
  gaiaShield: 100,
  vultureHeal: 30,         // Vulture's Heart: heal this much whenever a rival loses a heart...
  vultureMax: 10,          // ...and gain this much max health
  gaiaRegen: 5,            // Gaia's Embrace: heal per second while a Shield holds (ignores its no-healing rule)

  // PvP (duels and the tournament): every hit deals half damage so fights last longer
  arena: { damageMult: 0.25, maxTime: 60 },   // past 60 seconds, both players lose a heart
  // Ghosts fill in when a duel or tournament round has an odd number of players
  ghost: { hpMult: 0.5, dmgMult: 0.5 },
  duel: { winGold: 20 },

  // Selling from your bag: gear by rarity; potions and elixirs for half their price
  sell: { grey: 4, green: 12, rare: 30, legendary: 45, artifact: 60, consumablePct: 50 },

  shop: {
    reviewSeconds: 5,   // everyone looks over the table before picks start
    tourReviewSeconds: 3,   // the same, for the Tournament Plunder between rounds
    turnSeconds: 20,    // each player's turn to pick
    aiPickDelay: 1.4,
    passGold: 30,       // gold for passing on the free table (also what happens if your turn runs out)
    extraTableItems: 2,                   // free table = players + this
    // Everything below is the merchant door
    potionCost: 30, stock: [1, 3],   // a merchant has 1 to 3 of each potion and elixir
    gearCount: 4, restockCosts: [10, 30],  // two restocks per visit
    bloodHealth: 15, bloodGold: [5, 40], bloodMax: 3,   // sell blood: lose this much health for a random amount of gold, at most bloodMax times per visit
    itemCost: { grey: 8, green: 44, rare: 90 }, itemCostPerRoom: { grey: 1, green: 2, rare: 2 },
  },

  // Door weights (out of the total). Trash Pile replaces Treasure; the Vault is rare.
  doorWeights: { fight: 46, elite: 16, trash: 8, vault: 4, rest: 10, mystery: 7, venom: 5, purify: 5, forge: 7, trainer: 7, wager: 6 },
  doorMinRoom: { fight: 2, elite: 4, trash: 3, vault: 6, rest: 4, mystery: 3, venom: 5, purify: 5, forge: 5, trainer: 3, wager: 6 },
  purifyWeightPoisoned: 18,

  // Wager: the door never says what's behind it. Out of 100: jesterChance = a Jester (it explodes for jesterBlast when hit; no XP or gold,
  // the bet is lost), bossChance = a boss (a win pays bossPayout times the bet), then eliteChance of the rest = an elite
  wager: { bets: [20, 40], monsterMult: 1.25, eliteChance: 33, jesterChance: 20, bossChance: 10, bossPayout: 3, jesterBlast: 20 },

  gold: { fight: [8, 12], elite: [16, 24], boss: [40, 50], trash: [8, 14], skipItemBase: 10, treasureHunterBonus: 4 },

  // Gear pacing: normal fights give gear 1 in 3 times (otherwise Spoils), elites and bosses always do
  gearChance: { fight: 33, lucky: 50 },
  spoils: { gold: 24, statDmg: 2, statHp: 8, mix: { gear: 50, bag: 30, relic: 20 } },   // mix: what Spoils of war turns out to be (out of 100), when it isn't an artifact

  // Out of 100, how often a relic joins the reward choices (Plunder always has one)
  relicChance: { fight: 8, elite: 35, boss: 100, vault: 100 },
  // Artifacts: these bosses always offer one; elites past eliteFromRoom offer one this often (out of 100)
  artifact: { bossRooms: [18, 28], eliteFromRoom: 15, eliteChance: 10, tier: 6,
    spoilsEarly: 1, spoilsLateRoom: 20, spoilsLate: 5, spoilsLatePerRoom: 0.5,   // Spoils of war: 1% to be an artifact before room 20, then 5% + 0.5% per room past it
    eventChance: { vault: 2, shrine: 1 } },   // vaults, venom caches and blood shrines: a very rare artifact (out of 100)   // tier: weapon damage matches a rare of this tier
  // Legendary tier: a normal gear drop turns Legendary this often (out of 100). Never before fromRoom;
  // early% from there, late% from lateRoom on; elites and bosses roll eliteMult times as often. Treasure Hunters count 6 rooms deeper.
  legendary: { fromRoom: 12, early: 2, lateRoom: 20, late: 5, eliteMult: 2 },
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
    tagChance: { green: 45, rare: 65, legendary: 75 },
    treasureHunterTag: 20,                // Treasure Hunter: this much more often   // out of 100: how often an item carries a class tag
    tradeoffChance: 50,                   // out of 100: an uncommon item's bonus is a trade-off
    setMatchChance: 70,                   // out of 100: a tag leans toward a class you already wear
  },

  // Shared set supply: pieces of each class in the whole match
  supplyPerClass: 12,

  monster: {
    hpBase: 56, hpGrowth: 1.097,
    hitBase: 7, hitGrowth: 1.085,
    elite: { hp: 1.35, hit: 1.15, packExtra: 1 },
    boss:  { hp: 1.6, hit: 1.1 },
    swarmCopy: { hp: 0.35, hit: 0.5 },
    // Each phase's monsters get these on top (their pools differ in toughness, and weapons now cast spells)
    phase: { morning: { hp: 1.1, hit: 1.1 }, evening: { hp: 1.35, hit: 1.3 }, night: { hp: 1.15, hit: 1.15 } },
  },

  combat: {
    dt: 0.05,
    maxTime: 24,
    fastAfter: 10,
    startGap: 6,          // steps between the sides at the start
    moveSpeed: 2,         // steps per second
    kiteEdge: 1.4,        // how far past the start lines a Kiting archer can step back
    ranges: { melee: 1, reach: 2, near: 4, far: 6 },
    minHit: 2,
    dodgeCap: 30,
    critCap: 50,
    berserkCap: 20,
    manaMax: 100,
    minSpd: 4,
    spdSoftCap: 10,       // bonus Attack Speed above the weapon's: full value up to this, half past it
    firstCritCap: 6,      // "your first attacks crit" effects add up to at most this many
    critStun: 2,          // a stun from a critical hit lasts this many seconds (normal stuns last 1)
    stunImmune: 3,        // after being stunned, you can't be stunned again for this many seconds
  },
};
