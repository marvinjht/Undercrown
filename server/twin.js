// A player's twin: their game, running on the server (stage 2).
//
// Every human in a server match gets one. It is the same game code the browser runs (src/game.js and src/mp.js,
// on top of the rules), so it plays exactly like the browser game used to, but here the server owns it:
//   - doors, monster fights, loot, gold, the merchant, the forge, level-ups, Plunder picks, potions and gear swaps
//     all happen in the twin; the player's browser can't change any of it.
//   - The room talks to the twin the way it used to talk to the player's browser (room, plunder, duels, tour...).
//   - The browser only sends button presses (act) and shows the state the twin sends back (state).
// See docs/PROTOCOL.md.
'use strict';
const { loadRules } = require('./rules');

// Button presses a browser may send, and the screen each one belongs to (null = any screen; the game checks the rest)
const ACTS = {
  chooseDoor: ['doors'], pickWeapon: ['armory'], takeItem: ['reward'], takeGold: ['reward'], takeSpoils: ['spoils'],
  mysteryAct: ['mystery'], chooseSpec: ['spec'], chooseTree: ['tree'], chooseGem: ['gem'], placeBet: ['wager'],
  forgeAct: ['forge'], leaveForge: ['forge'], startDuelFight: ['duelIntro'],
  useBag: null, sellBag: null, dyeItem: null, dyeClass: null, dyeCancel: null,
  playerShopPick: ['shop'], playerShopPass: ['shop'], shopBuy: ['merchant'], leaveMerchant: ['merchant'],
  seeEnding: ['dead'], markActive: null,
};
const MP_ACTS = { startWatching: 1, stopWatching: 1, sendSkipVote: 1 };
// What a paused twin (its player is away and a bot plays their hero) still hears
const PAUSED_OK = new Set(['players', 'kick', 'end', 'saved', 'watch', 'view', 'fight', 'snap', 'ping', 'bye']);
// Parts of the game state the browser rebuilds itself (or never needs)
const SKIP_S = new Set(['rng', 'rivals']);
const isHero = v => v && typeof v === 'object' && v.gear && typeof v.id === 'string' && /^h\d+$/.test(v.id);

// JSON for the wire: no random number generators or timers, and heroes inside anything else go as { $hero: id }
// (the browser points them back at its own copy, so "is this me?" checks keep working)
function enc(value, noRefs) {
  return JSON.stringify(value, function (k, v) {
    if (k === 'rng' || /timer$/i.test(k)) return undefined;
    if (!noRefs && v !== value && isHero(v)) return { $hero: v.id };
    if (v instanceof Set) return [...v];
    return v;
  });
}

class Twin {
  constructor(room, player, startMsg) {
    this.room = room; this.cid = player.cid; this.slot = player.slot;
    this.timers = new Set(); this.dead = false; this.paused = false;
    this.sounds = []; this.renderFlag = false; this.flushT = null;
    this.sent = { s: {}, mp: {}, heroes: {}, me: {} };
    const T = this;
    const guard = fn => (...a) => { if (!T.dead) T.safe(() => fn(...a)); };
    const globals = {
      setTimeout: (f, ms, ...a) => { const h = setTimeout(() => { T.timers.delete(h); guard(f)(...a); }, ms); T.timers.add(h); return h; },
      clearTimeout: h => { clearTimeout(h); T.timers.delete(h); },
      setInterval: (f, ms) => { const h = setInterval(guard(f), ms); T.timers.add(h); return h; },
      clearInterval: h => { clearInterval(h); T.timers.delete(h); },
      performance: { now: () => Date.now() },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, visibilityState: 'visible' },
      addEventListener() {},
      location: { search: '', origin: '' },
    };
    const G = this.G = loadRules(['src/mp.js', 'src/game.js'], globals);
    if (room.fastConfig) room.fastConfig(G);
    // The screen is the player's browser: anything that would redraw it sends them the new state instead
    G.UI = {
      render: () => { T.renderFlag = true; T.changed(); if (G.Game.mp) G.MP.sendView(); },
      update: () => T.changed(), refreshShopPicks: () => T.changed(), watchChanged: () => T.changed(),
      refreshWatchPop: () => T.changed(), playSpectate: () => T.changed(), watchBadge: () => T.changed(),
    };
    G.Sound = { play: (name, vol) => { T.sounds.push([name, vol]); }, unlock() {}, toggle() {} };
    const MP = G.MP;
    MP.serverMode = true; MP.cid = this.cid; MP.name = player.name; MP.code = room.code;
    MP.lobby = JSON.parse(JSON.stringify(room.lobby));
    MP.t = { kind: 'server', send: msg => T.toRoom(msg), close() {} };
    MP.onMessage(JSON.parse(JSON.stringify(startMsg)));   // makes the heroes and starts the game, exactly as a browser would
    // The browser's clock tick (round timers, Plunder review) runs here now
    this.beat = setInterval(() => { if (!T.dead && !T.paused) T.safe(() => G.Game.tick()); }, 250);
  }

  safe(fn) { try { fn(); } catch (e) { console.error(`twin ${this.room.code}/${this.slot}:`, e && e.stack || e); } }

  // ---------- Room <-> twin ----------
  // A message from the room, as the browser used to get it
  deliver(text) {
    if (this.dead) return;
    const m = typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(text));
    if (this.paused && !PAUSED_OK.has(m.t)) return;
    setImmediate(() => { if (!this.dead) this.safe(() => this.G.MP.onMessage(m)); });
  }
  // What the game sends (snap, ready, pick, duelLock, tourUse, tourDone, fight, view, watch, skipVote)
  toRoom(msg) {
    if (this.dead || this.paused) return;
    const m = JSON.parse(JSON.stringify(msg));
    setImmediate(() => { if (!this.dead) this.safe(() => this.room.onMessage(this.cid, m, true)); });
  }

  // ---------- Browser -> twin ----------
  act(m) {
    if (this.dead || this.paused) return;
    const G = this.G, s = G.Game.s;
    if (!s) return;
    // Only plain short values: indexes, ids, slot and class names
    const okArg = a => a === null || typeof a === 'boolean' || (typeof a === 'number' && Number.isFinite(a) && Math.abs(a) < 1e6)
      || (typeof a === 'string' && /^[\w.:-]{0,48}$/.test(a) && !['__proto__', 'constructor', 'prototype'].includes(a));
    if (typeof m.fn !== 'string' || (m.args != null && (!Array.isArray(m.args) || m.args.length > 3 || !m.args.every(okArg)))) return;
    const args = m.args || [];
    this.safe(() => {
      if (m.fn === 'battleEnd') { const b = s.battle; if (b && !b.done && typeof b.onDone === 'function') b.onDone(); return; }
      if (m.mp) { if (MP_ACTS[m.fn]) G.MP[m.fn](...args); return; }
      if (!Object.prototype.hasOwnProperty.call(ACTS, m.fn)) return;
      const phases = ACTS[m.fn];
      if (phases && !phases.includes(s.phase)) return;
      G.Game[m.fn](...args);
    });
    this.changed();
  }

  // ---------- Twin -> browser ----------
  changed() {
    if (this.dead || this.flushT) return;
    this.flushT = setTimeout(() => { this.flushT = null; this.safe(() => this.flush(false)); }, 30);
  }
  // Only what changed since the last send (full: everything, after a reconnect)
  flush(full) {
    if (this.dead) return;
    const G = this.G, s = G.Game.s, MP = G.MP;
    if (!s) return;
    if (full) { this.sent = { s: {}, mp: {}, heroes: {}, me: {} }; this.lastRes = null; }
    const parts = [], del = [];
    const S = [];
    // A hero, field by field: only the fields that changed (and the ones that went away)
    const heroPatch = (h, sent, skip) => {
      const ch = [], gone = [];
      for (const f of Object.keys(h)) {
        if (f === 'rng' || (skip && skip[f])) continue;
        const j = enc(h[f]);
        if (j === undefined) continue;
        if (sent[f] !== j) { sent[f] = j; ch.push(JSON.stringify(f) + ':' + j); }
      }
      for (const f of Object.keys(sent)) if (!(f in h)) { gone.push(f); delete sent[f]; }
      return ch.length || gone.length ? '{' + ch.concat(gone.length ? ['"$gone":' + JSON.stringify(gone)] : []).join(',') + '}' : null;
    };
    const me = heroPatch(s.player, this.sent.me, s.player.gem === 'janus' ? null : { past: 1 });   // build history: only Janus's Eye uses it
    for (const k of Object.keys(s)) {
      if (k === 'player' || SKIP_S.has(k) || typeof s[k] === 'function') continue;
      const v = s[k];
      // A fight's result goes once; when the fight object changes later (it ends), the browser keeps the result it has
      if (k === 'battle' && v && v.res) {
        const same = enc({ ...v, res: '$same' }), fresh = v.res !== this.lastRes;
        if (!fresh && this.sent.s.battle === same) continue;
        S.push('"battle":' + (fresh ? enc(v) : same));
        this.lastRes = v.res; this.sent.s.battle = same;
        continue;
      }
      const j = enc(v);
      if (j === undefined) continue;
      if (this.sent.s[k] !== j) { this.sent.s[k] = j; S.push(JSON.stringify(k) + ':' + j); }
    }
    for (const k of Object.keys(this.sent.s)) if (!(k in s)) { del.push(k); delete this.sent.s[k]; }
    const M = [];
    const mpv = { players: MP.players, mySlot: MP.mySlot, readyInfo: MP.readyInfo, saveStatus: MP.saveStatus || null, views: MP.views,
      lastFight: MP.lastFight, lastTourWire: MP.lastTourWire || null, watchers: Object.fromEntries(Object.entries(MP.watchers || {}).map(([k, v]) => [k, [...v]])) };
    // Fights and screens of other players: only the players whose entry changed
    const PER = { views: 1, lastFight: 1 };
    for (const k in mpv) {
      if (PER[k]) {
        const o = mpv[k] || {}, sent = this.sent.mp[k] = this.sent.mp[k] || {}, ch = [];
        for (const sl in o) { const j = enc(o[sl], true); if (sent[sl] !== j) { sent[sl] = j; ch.push(JSON.stringify(sl) + ':' + j); } }
        if (ch.length) M.push(JSON.stringify(k) + ':{' + ch.join(',') + '}');
        continue;
      }
      const j = enc(mpv[k] === undefined ? null : mpv[k], true); if (this.sent.mp[k] !== j) { this.sent.mp[k] = j; M.push(JSON.stringify(k) + ':' + j); }
    }
    // Everyone else's heroes (without their build history: only their own Janus's Eye needs it)
    const Hs = [];
    for (const sl in MP.heroes) {
      if (+sl === MP.mySlot) continue;
      const sent = this.sent.heroes[sl] = this.sent.heroes[sl] || {};
      const pj = heroPatch(MP.heroes[sl], sent, { past: 1 });
      if (pj) Hs.push(JSON.stringify(sl) + ':' + pj);
    }
    if (!full && !me && !S.length && !del.length && !M.length && !Hs.length && !this.sounds.length) return;
    parts.push('"t":"state"', '"from":"server"', '"now":' + Date.now(), '"full":' + !!full, '"render":' + this.renderFlag,
      '"me":' + (me || 'null'), '"s":{' + S.join(',') + '}', '"del":' + JSON.stringify(del), '"mp":{' + M.join(',') + '}', '"heroes":{' + Hs.join(',') + '}',
      '"sounds":' + JSON.stringify(this.sounds));
    this.sounds = []; this.renderFlag = false;
    this.room.toClient(this.cid, '{' + parts.join(',') + '}');
  }

  // ---------- Away and back ----------
  // The player's own hero, as the room keeps it
  heroWire() { const h = this.G.Game.s && this.G.Game.s.player; if (!h) return null; const o = {}; for (const k in h) if (k !== 'rng') o[k] = h[k]; return JSON.parse(JSON.stringify(o)); }
  // They went quiet: a bot plays their hero (on the room's copy) until they're back
  pause() { this.paused = true; }
  // Back: carry on with the hero the bot left them
  resume(wire) {
    const G = this.G, s = G.Game.s;
    this.paused = false;
    if (!s || !wire) return;
    const h = s.player, rng = h.rng;
    for (const k of Object.keys(h)) delete h[k];
    Object.assign(h, JSON.parse(JSON.stringify(wire)), { rng, isPlayer: true, bot: false, botWas: null });
    G.MP.heroes[G.MP.mySlot] = h;
    clearTimeout(s.duel && s.duel.waitTimer);
    s.battle = null; s.duel = null; s.shop = null; s.shopPending = false; s.dye = null; s.roundEnds = 0;
    s.phase = h.alive ? 'waiting' : 'dead';
    s.notice = 'You’re back. A bot played your hero while you were away.';
    this.changed();
  }
  dispose() {
    this.dead = true;
    clearInterval(this.beat); clearTimeout(this.flushT);
    for (const h of this.timers) { clearTimeout(h); clearInterval(h); }
    this.timers.clear();
  }
}

module.exports = { Twin };
