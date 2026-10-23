// Loads the game rules (the same files the browser runs) into a fresh, private copy.
// Each room gets its own copy, because a few rules keep match-wide state (the bosses for the match, the set supply).
// These files never touch the screen, so they run the same here as in the browser (and tools/balance.js).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['data/config.js', 'data/weapons.js', 'data/armor.js', 'data/relics.js', 'data/artifacts.js', 'data/sets.js', 'data/gems.js',
  'data/consumables.js', 'data/specs.js', 'data/monsters.js',
  'src/rng.js', 'src/stats.js', 'src/items.js', 'src/combat.js', 'src/dungeon.js', 'src/tournament.js'];

let scripts = null;
function compile() {
  scripts = FILES.map(f => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
}

function loadRules() {
  if (!scripts) compile();
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of scripts) s.runInContext(ctx);
  ctx.G.uidPrefix = 'sv';   // item ids the server makes (Plunder tables) never clash with players' own
  return ctx.G;
}

module.exports = { loadRules, ROOT };
