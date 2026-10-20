# Undercrown (v0.1)

v0.1 adds: relics (stackable build effects, max 3 copies, data/relics.js), 17 legendaries (one worn at a time, unique per match, data/legendaries.js), hybrids with capstone-weight mechanics (data/sets.js), rares with two affixes, a forge that previews Strengthen and adds one bonus per piece, per-item merchant stock, and the new layout.


Single-player prototype of a dungeon auto battler. You and 5 AI rivals each walk 29 rooms with 3 hearts,
then fight a last-one-standing tournament in room 30. Rooms follow a 10-room pattern that repeats:
5 = Plunder (a shared loot pile, free picks), 7 = merchant, 8 = boss (the first one also gives your heart gem), 10 = duel.
Every round is timed and ends as soon as everyone is ready; fights don't count against the clock.

v5 adds:
- The repeating room pattern, shown on the room counter with icons and tooltips.
- Gear for an empty slot equips itself; everything else lands in a 6-slot bag. Hold Equip to swap a bag item in (the old piece is destroyed) or discard it. Items have no sell value.
- Player fights go to the death; past 60 seconds both players lose a heart. Duel losers come back at full health.
- Monster fights that time out give half gold and XP and no items. Thieves steal but never run away.
- Stuns can't chain (3 seconds of stun immunity after each). Level-ups give small stat bumps.
- Shadow reworked around Cheap Shots; its capstone is 5 seconds of invisibility at the start of each fight.
- Heart of Stone: each hit deals 1 more than the last, up to 5.
- Build effects only roll where they fit the item's class. Treasure Hunter finds more class-tagged items.
- Sound effects made in code (src/sound.js), replaceable with files via assets/manifest.js.
- A skill tree screen and a left-to-right tournament bracket.

Earlier versions are kept in git as the tags `v1` to `v4`.

## Stats (all flat, even numbers)

- Health, Damage (per hit), Attack Speed (attacks per 10 seconds), Range (Melee 1 / Near 4 / Far 6 steps)
- Armor: subtracted from physical hits. Magic Resist: subtracted from magic hits (spells, wands, staffs, holy)
- Crit / Dodge / Stun: out of 100. Crits deal double damage plus Crit Damage
- Shield: soaks damage at the start of each fight. Bleed: damage per second for 3 seconds
- Mana fills per attack; at 100 you cast your spell

## Run it

Open `index.html` in a browser (needs internet once, to load Phaser and fonts from their CDNs).
No build step, no server. Scripts are plain `<script>` files on purpose, so double-clicking works.

## Folder layout

```
index.html          loads everything in order
styles.css          menu / HUD styling
data/               ALL the game content and balance numbers
  config.js         heal amounts, door odds, loot odds, monster scaling, combat rules, shop
  weapons.js        the 13 weapon types
  sets.js           class sets and hybrid archetypes
  gems.js           heart gems
  consumables.js    bag items (potions, antidote, buffs)
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
