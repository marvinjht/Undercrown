# Undercrown: Godot client

This is Undercrown as a Godot 4 game. The game itself (every rule, fight, drop and number) runs on the game server,
exactly as for the browser version. This client:

- connects to the server and sends your button presses,
- draws every screen from what the server describes (titles, cards, item details, buttons),
- plays back fights the server already ran, with pixel art and sound.

Because the rules never run here, balance changes in the wiki and `data/` never need a Godot change. A new screen or
item text from the server shows up here by itself.

## Open it

1. Install Godot 4.3 or newer (the standard version, not .NET).
2. In Godot's Project Manager: Import → pick `godot/project.godot`.
3. Press Play (F5). Pick **Play solo** to start a match with five bots.

It talks to the live server (`https://undercrown-e04u.onrender.com`). The free server sleeps when unused; the first
connection can take up to a minute. Browser players and Godot players can be in the same room.

To use a local server instead: run `node server/index.js` in the main folder, then in Godot set
Project → Project Settings → Run → Main Run Args... or run from a terminal:
`godot --path godot -- --server=http://localhost:8080`

## Make it yours

| What | Where |
| --- | --- |
| Colors, frames, fonts, button looks | `theme/theme.tres`: double-click it in Godot to open the theme editor. Variations: **Card**, **Slot** (panels), **Primary**, **Ghost** (buttons), **Title**, **Heading**, **Muted** (labels). |
| Pixel art | `art/`: every image is a PNG. Replace one with your own of the same name. Any size works (they're scaled), but keep the subject centered. |
| Heroes | `art/heroes/hero.png` (no set), `hero_warrior.png`, `hero_mage.png`, `hero_archer.png`, `hero_paladin.png`, `hero_rogue.png` (4+ pieces of that class). Facing **right**. |
| Monsters | `art/monsters/<id>.png` (rat, slime, wolf, … bosses: boneKing, yeti, …). Facing **left**. |
| Weapons | `art/weapons/<weaponType>.png`, handle on the left, pointing right (drawn in the hero's hand). |
| Icons | `art/icons/`: gear slots, weapon types, potions (`potion_*`), relics (`relic_*`), doors (`door_*`), coin, heart, skull, crown, eye. |
| Panels and buttons | `art/ui/panel.png`, `card.png`, `button*.png` (9-slice frames, 8 px borders), `floor.png` (arena floor tile), `torch.png`. |
| Sounds | `sfx/<name>.wav`: replace with your own `.wav` or `.ogg` of the same name. `scripts/sfx.gd` lists which sound plays for which weapon and spell. |
| Font | `fonts/DepartureMono-Regular.otf` (pixel font, SIL Open Font License). Change it in the theme. |
| Layout | `scenes/main.tscn`: the top bar and the three columns (players, screen, bag/gear/stats). Move or resize them in the editor. |
| How cards, bars and panels are built | `scripts/ui/kit.gd` |
| The screens | `scripts/ui/match_view.gd` (match), `scripts/ui/title_view.gd` (title, queue, lobby) |
| Fights | `scripts/arena.gd` (movement, attacks, floating numbers, effects) |

The placeholder art is drawn by `../tools/pixelart.py` (run `python3 tools/pixelart.py` from the main folder to
redraw it; it overwrites `art/`). After changing `art/ui`, rebuild the theme with
`godot --headless --path godot --script res://tools/make_theme.gd` (this overwrites your theme edits, so only do it
before you start customizing the theme).

## How it works

| File | Job |
| --- | --- |
| `scripts/net.gd` (autoload **Net**) | The WebSocket to the server; reconnects if it drops |
| `scripts/game.gd` (autoload **Game**) | What the server last said (`Game.view`, `Game.s`), and your button presses (`Game.act`) |
| `scripts/sfx.gd` (autoload **Sfx**) | Sounds |
| `scripts/art.gd` (autoload **Art**) | Loads art by name, colors for rarities and text |
| `scripts/autoplay.gd` | Testing: `godot --path godot -- --auto` plays by itself |

`Game.view` is the whole screen described as data (see `src/present.js` in the main folder and
`docs/PROTOCOL.md`): `top` (room track), `clock`, `me` (your hero: stats, sets, relics), `gear`, `bag`, `rivals`,
`supply`, `setGuide`, and `screen` (title, text and sections: doors, cards, buttons, lists, bracket, the arena...).
Every button carries the action to send. The fight to play is `Game.s.battle.res`.

Not in this client yet: watching other players' games live, and the skill tree pop-up (your spec shows in the stats
panel's tooltip).

## Export

Project → Export → add a preset (Windows, macOS, Linux or Web), then Export Project. Godot asks you to download its
export templates the first time.
