# Undercrown: notes for Claude Code

Undercrown is a multiplayer dungeon auto battler (up to 8 players, bots fill to 6): a 29-room dungeon run, then a
tournament in room 30. The owner, Marv, designs it and edits balance numbers; keep explanations plain and short.

## Layout

- `data/` all balance numbers and content (weapons, armor, relics, artifacts, sets, gems, consumables, specs, monsters,
  `config.js`). Most balance changes are an edit here and nothing else.
- `src/` the game rules (`stats.js`, `items.js`, `combat.js`, `dungeon.js`, `tournament.js`), the game flow
  (`game.js`, `mp.js`), the display model for clients (`present.js`), and the browser UI (`ui.js`, `arena.js`, ...).
- `server/` the game server (Node, no packages). Every online match runs here: each player's game runs in a "twin"
  (`twin.js`); browsers and Godot only send button presses and show state. `matchmaker.js` = Find a match.
  Deployed on Render from `main` (render.yaml); `https://undercrown-e04u.onrender.com/health` shows the live version.
- `godot/` the Godot 4 client (see `godot/README.md`). It never runs rules: it draws `state.view` from
  `src/present.js`. Art in `godot/art/` (placeholders from `tools/pixelart.py`), sounds in `godot/sfx/`.
- `docs/PROTOCOL.md` every message between clients and the server. Keep it current when messages change.
- `tools/balance.js` (difficulty) and `tools/meta.js` (win rates by spec, gem, weapon, artifact).

## Rules of thumb

- Bump `G.VERSION` in `data/config.js` for every release. Server and browser must match; Godot reads the server's.
- A new screen or text the Godot client should show belongs in `src/present.js` (server side), not in Godot code.
- Never trust the client: actions go through `server/twin.js` (`ACTS` lists what a client may call, per screen).
- Keep the browser version working; it shares the server.

## Checks before pushing

- `node tools/balance.js 300` after balance changes: "Reached room 30 without losing a heart" should be about 60%.
- `node tools/meta.js 1000` for win-rate changes (slow; run in the background).
- Server smoke test: `PORT=8080 SAVE_MATCHES=0 UC_FAST=1 node server/index.js`, then play a match in the browser at
  http://localhost:8080 or in Godot with `godot --path godot -- --server=http://localhost:8080`.
- Godot self-test: `godot --path godot -- --auto --server=http://localhost:8080` plays a solo match by itself
  (add `--shots=<folder>` to save a screenshot of each new screen).

Pushing to `main` redeploys the server on Render within a few minutes.
