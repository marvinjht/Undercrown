// Loads the game rules (the same files the browser runs) into a fresh, private copy.
// Each room gets its own copy, because a few rules keep match-wide state (the bosses for the match, the set supply).
// These files never touch the screen, so they run the same here as in the browser (and tools/balance.js).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['data/config.js', 'data/weapons.js', 'data/armor.js', 'data/relics.js', 'data/artifacts.js', 'data/sets.js', 'data/gems.js',
  'data/consumables.js', 'data/specs.js', 'data/monsters.js',
  'src/rng.js', 'src/stats.js', 'src/items.js', 'src/combat.js', 'src/dungeon.js', 'src/tournament.js'];

const compiled = {};
const script = f => compiled[f] || (compiled[f] = new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));

// extra: more game files to load after the rules (a player's twin also runs src/mp.js and src/game.js);
// globals: what those files expect from a browser (timers, a do-nothing document...)
function loadRules(extra, globals) {
  const ctx = { console, Math, Date, JSON, ...(globals || {}) };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES.concat(extra || [])) script(f).runInContext(ctx);
  ctx.G.uidPrefix = 'sv';   // item ids the server makes (Plunder tables) never clash with players' own
  return ctx.G;
}

module.exports = { loadRules, ROOT };
