# Thirty Doors (prototype)

Single-player prototype of a dungeon auto battler. You and 5 AI rivals each walk 30 rooms.
Room 1 is the Armory (pick 1 of 3 random weapons); from room 2 you pick one of two doors per
room. Every round lasts 30 seconds for everyone; anything undecided at zero is decided for you.
Health never refills on its own. After room 5 you pick a specialization. Survivors heal 30% of
max health and fight a seeded tournament bracket.

## Stats (all flat, even numbers)

- Health, Damage (per hit), Speed (attacks per 10 seconds)
- Armor: subtracted from every hit you take (a hit always does at least 2)
- Crit / Dodge / Stun: out of 100. Crits deal double damage plus Crit Damage
- Shield: soaks damage at the start of each fight. Bleed: damage per second for 3 seconds
- Life on Hit: flat heal each hit (only on legendary weapons, or from Bloodthirst)

Fights play at 1x, then 2x after 10 seconds. There is no skip.

## Run it

Open `index.html` in a browser (needs internet once, to load Phaser and fonts from their CDNs).
No build step, no server. Scripts are plain `<script>` files on purpose, so double-clicking works.

## Folder layout

```
index.html          loads everything in order
styles.css          menu / HUD styling
data/               ALL the game content and balance numbers
  config.js         heal amounts, door odds, loot odds, monster scaling, combat rules
  weapons.js        the 6 weapon types
  armor.js          gear slots, bonus stats, rarities, stat descriptions (used in tooltips)
  specs.js          the 6 specializations
  monsters.js       monsters, bosses, rival names
assets/
  manifest.js       every art key -> null (placeholder) or a path to your PNG
src/
  rng.js            seeded random numbers
  stats.js          gear + spec -> combat stats; hero state
  items.js          item generation, loot drops and the drop cadence
  combat.js         the fight simulation (pure logic, returns an event timeline)
  dungeon.js        doors, rooms, events, and the AI rivals
  tournament.js     seeding, byes, bracket
  placeholders.js   built-in placeholder art
  arena.js          Phaser scene that animates a fight timeline
  game.js           single-player run state and actions
  ui.js             screens, panels, tooltips
tools/balance.js    headless balance test: `node tools/balance.js 500`
```

## Swapping in your own art

1. Put a PNG in `assets/` (sizes are listed at the top of `assets/manifest.js`).
2. In `assets/manifest.js`, change that key from `null` to the path, e.g.
   `monster_rat: 'assets/rat.png'`.
3. Reload. Any key left as `null` keeps the placeholder.

## How loot "cadence" works (src/items.js)

- Rarity odds climb in a straight line from room 1 (92% common) to room 30. No legendaries
  before room 8 except from bosses.
- Item stats step up every 4 rooms (a "tier"), so new drops are clearly better than old ones.
- Drops go to slots where they'd be a real upgrade when possible, which cuts down on sidegrades.
- Bad-luck protection: every roll that isn't legendary adds a little to the legendary
  odds, and it resets when you get one. Same for uncommon. Long dry streaks become rare.
- Drops lean toward empty or outdated slots, so you don't get five helmets in a row.
- Floors: elites always drop uncommon or better; bosses always drop one legendary.

All of these numbers live in `data/config.js` under `loot`.

## Ready for multiplayer later

- Fights are fully decided by `src/combat.js` from two stat blocks and a seed. The arena only
  plays the result back, so a server can run every fight and all players watch the same thing.
- Nothing in `src/` except `arena.js`, `ui.js`, `game.js` and `placeholders.js` touches the page,
  so the rules can run on a server (e.g. a Supabase Edge Function) unchanged.
