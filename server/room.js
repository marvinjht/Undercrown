// One multiplayer room on the server. The server is the referee: it runs the room clock, the bots, Plunder,
// duel pairings and the tournament, and it runs every fight between players. Fights go out as finished results
// (every hit, cast and death with its timing), so every screen plays back exactly the same fight.
//
// Stage 2: each player's own dungeon run (doors, monster fights, loot, gold, level-ups) runs here too, in their twin
// (twin.js): the same game code their browser used to run. The room talks to twins the way it used to talk to browsers;
// browsers only send button presses (act) and show the state their twin sends (state).
// Message names match docs/PROTOCOL.md.
'use strict';
const { loadRules } = require('./rules');
const { Twin } = require('./twin');

const MAX = 8;          // seats in a room
const BOT_FILL = 6;     // bots fill empty seats up to this many players
const DROP_MS = 45000;  // a player silent this long in a match: a bot plays for them until they're back
const LOBBY_DROP_MS = 12000;
const now = () => Date.now();
// UC_FAST=1 (automated tests only): short Plunder reviews, tournament breaks and room clocks (rooms and twins alike)
function fastConfig(G) { if (process.env.UC_FAST === '1') { const C = G.CONFIG; C.shop.reviewSeconds = 1; C.tourBreakSeconds = 3; C.tourIntroExtra = 0; C.roundSeconds = 12; } }
const clone = o => JSON.parse(JSON.stringify(o));
// In a match, a player's browser only hears these from the room; everything else goes to their twin,
// which sends the browser its state
const CLIENT_OK = new Set(['lobby', 'start', 'rematch', 'end', 'kick', 'saved', 'ping', 'version', 'joinError']);
// Messages that only a twin may send for a player (their browser can't speak for their hero)
const TWIN_ONLY = new Set(['snap', 'ready', 'pick', 'duelLock', 'tourUse', 'tourDone', 'fight', 'view', 'watch', 'skipVote', 'duelGo']);

class Room {
  constructor(code, server) {
    this.code = code;
    this.server = server;
    this.G = loadRules();
    this.VERSION = this.G.VERSION;
    this.fast();
    const G = this.G;
    this.TINTS = [G.PLAYER_TINT, ...G.RIVALS.map(r => r.tint), 0xe07a9a, 0x9ad9c4];
    this.BOT_NAMES = G.RIVALS.map(r => r.name).concat(['Grist', 'Ulla', 'Fenn', 'Rook']);
    this.conns = new Map();   // cid -> socket
    this.seen = {};           // cid -> last time we heard from them
    this.lobby = { code, slots: Array(MAX).fill(null), hostCid: 'server', ownerCid: null, v: this.VERSION, started: false };
    this.players = []; this.heroes = {}; this.H = null;
    this.twins = new Map();   // cid -> Twin (each human's game, run here)
    this.createdAt = now(); this.emptySince = now();
  }
  get CFG() { return this.G.CONFIG; }
  fastConfig(G) { fastConfig(G); }
  // UC_FAST=1 (automated tests only): short Plunder reviews and tournament breaks
  fast() { fastConfig(this.G); }

  // ---------- Sending ----------
  // A player's browser hears only CLIENT_OK messages while their twin plays the match; the twin hears the rest
  toConn(cid, c, text, t) { if (!(this.twins.has(cid) && !CLIENT_OK.has(t))) c.send(text); }
  sendTo(cid, msg) {
    const text = JSON.stringify({ ...msg, from: 'server' });
    const c = this.conns.get(cid); if (c) this.toConn(cid, c, text, msg.t);
    const tw = this.twins.get(cid); if (tw && !CLIENT_OK.has(msg.t)) tw.deliver(text);
  }
  // To everyone in the room (the old host's "cast")
  cast(msg) {
    const text = JSON.stringify({ ...msg, from: 'server' });
    for (const [cid, c] of this.conns) this.toConn(cid, c, text, msg.t);
    for (const tw of this.twins.values()) tw.deliver(text);
  }
  // A player's message passed on to everyone else, as it was
  relay(fromCid, msg) {
    const text = JSON.stringify(msg);
    for (const [cid, c] of this.conns) if (cid !== fromCid) this.toConn(cid, c, text, msg.t);
    for (const [cid, tw] of this.twins) if (cid !== fromCid) tw.deliver(text);
  }
  // A twin's state for its player's browser
  toClient(cid, text) { const c = this.conns.get(cid); if (c) c.send(text); }

  // ---------- Connections ----------
  attach(cid, sock) {
    const old = this.conns.get(cid);
    if (old && old !== sock) { try { old.close(4000); } catch (e) { /* gone */ } }
    this.conns.set(cid, sock);
    this.seen[cid] = now();
    this.emptySince = 0;
    // Back after a drop: their seat is theirs again
    const back = this.players.find(p => p.cid === cid && p.bot && p.botWas && !p.kicked);
    if (back) {
      back.bot = false; back.botWas = null; this.heroes[back.slot].bot = false; this.heroes[back.slot].botWas = null;
      // Their twin carries on from the hero the bot left them
      const tw = this.twins.get(cid);
      if (tw) { tw.resume(this.heroWire(this.heroes[back.slot])); tw.backFromBot = true; }
      this.cast({ t: 'players', players: this.players });
    }
  }
  detach(cid, sock) {
    if (this.conns.get(cid) !== sock) return;
    this.conns.delete(cid);
    if (!this.conns.size) this.emptySince = now();
  }
  humanCids() { return this.lobby.slots.filter(Boolean).map(s => s.cid); }

  // ---------- Lobby ----------
  join(cid, name) {
    const L = this.lobby;
    if (L.started) {
      // A player from this match reconnecting is fine; anyone else can't get in
      if (this.players.some(p => p.cid === cid)) return { ok: true };
      return { ok: false, reason: 'That match has already started.' };
    }
    if (!L.slots.some(s => s && s.cid === cid)) {
      const i = L.slots.findIndex(s => !s);
      if (i < 0) return { ok: false, reason: 'That room is full (8 players).' };
      L.slots[i] = { cid, name: String(name || 'Player').slice(0, 14) };
      if (!L.ownerCid) L.ownerCid = cid;
    }
    this.cast({ t: 'lobby', lobby: L });
    return { ok: true };
  }
  leave(cid) {
    const L = this.lobby;
    if (!L.started) {
      const i = L.slots.findIndex(s => s && s.cid === cid);
      if (i >= 0) {
        L.slots[i] = null;
        // Seats close up so the owner stays in seat 1
        L.slots = [...L.slots.filter(Boolean), ...Array(MAX).fill(null)].slice(0, MAX);
        if (L.ownerCid === cid) L.ownerCid = L.slots[0] ? L.slots[0].cid : null;
        this.cast({ t: 'lobby', lobby: L });
      }
    } else this.drop(cid);
  }

  // The owner presses Start: fill empty seats with bots
  start(cid) {
    const L = this.lobby, G = this.G;
    if (L.started || cid !== L.ownerCid) return;
    const used = new Set(L.slots.filter(Boolean).map(s => s.name));
    const botNames = this.BOT_NAMES.filter(n => !used.has(n));
    const humans = L.slots.filter(Boolean);
    const total = Math.max(BOT_FILL, humans.length);
    const players = [];
    for (let i = 0; i < total; i++) {
      const s = humans[i];
      players.push(s ? { slot: i, cid: s.cid, name: s.name, bot: false, tint: this.TINTS[i] }
        : { slot: i, cid: null, name: botNames.shift() || 'Bot ' + i, bot: true, tint: this.TINTS[i] });
    }
    L.started = true;
    this.cast({ t: 'lobby', lobby: L });
    const seed = G.newSeed();
    const startMsg = { t: 'start', seed, players };
    // Every human's game runs here from now on
    this.disposeTwins();
    for (const p of players) if (!p.bot) this.twins.set(p.cid, new Twin(this, p, { ...startMsg, from: 'server' }));
    this.cast(startMsg);
    this.startMatch(seed, players);
  }

  // Back to the lobby with everyone still here, same room code
  rematch(cid) {
    const L = this.lobby;
    if (cid !== L.ownerCid || !L.started || L.matched) return;   // a matchmade room: everyone finds a new match instead
    const H = this.H;
    if (H) { clearInterval(H.plunderTimer); clearTimeout(H.tourTimer); clearTimeout(H.duelTimer); }
    const here = this.players.filter(p => !p.bot && this.conns.has(p.cid));
    L.slots = Array(MAX).fill(null);
    here.forEach((p, i) => { L.slots[i] = { cid: p.cid, name: p.name }; });
    if (!here.some(p => p.cid === L.ownerCid)) L.ownerCid = here[0] ? here[0].cid : null;
    L.started = false; L.v = this.VERSION;
    this.disposeTwins();
    this.players = []; this.heroes = {}; this.H = null;
    this.G = loadRules();   // a fresh copy of the rules for the next match
    this.fast();
    this.cast({ t: 'rematch', lobby: L });
  }

  // ---------- Match ----------
  startMatch(seed, players) {
    const G = this.G;
    this.players = players;
    G.Dungeon.planBosses(seed);   // the same bosses the players' games plan from the same seed
    const rng = new G.RNG(seed);
    const heroes = {};
    for (const p of players) {
      const h = G.Hero.create({ name: p.name, tint: p.tint, isPlayer: false }, rng.fork());
      h.id = 'h' + p.slot; h.slot = p.slot; h.bot = p.bot;
      if (p.bot) h.rng = new G.RNG((seed + p.slot * 104729) >>> 0);
      heroes[p.slot] = h;
    }
    this.heroes = heroes;
    G.Supply.reset(Object.values(heroes));
    this.H = { seed, rng: new G.RNG((seed ^ 0x5bd1e995) >>> 0), room: 0, ready: {}, snaps: {},
      rec: { started: new Date().toISOString(), builds: {}, duels: [], tour: [], saved: false } };
    setTimeout(() => { if (this.H) this.startRoom(1); }, 300);
  }
  player(slot) { return this.players.find(p => p.slot === slot); }
  isBot(slot) { const p = this.player(slot); return !!(p && p.bot); }
  slotOf(cid) { const p = this.players.find(x => x.cid === cid); return p ? p.slot : -1; }
  heroWire(h) { const o = {}; for (const k in h) if (k !== 'rng') o[k] = h[k]; return clone(o); }
  allWire() { const o = {}; for (const p of this.players) o[p.slot] = this.heroWire(this.heroes[p.slot]); return o; }
  humansIn() { return this.players.filter(p => !p.bot && this.heroes[p.slot] && this.heroes[p.slot].alive); }

  // A player's hero as their game reports it. The server owns its bots.
  takeSnap(slot, wire) {
    if (!wire || !this.player(slot) || this.isBot(slot)) return;
    const G = this.G, old = this.heroes[slot];
    const h = clone(wire);
    h.isPlayer = false; h.slot = slot; h.id = 'h' + slot; h.bot = false;
    h.rng = (old && old.rng) || new G.RNG(((this.H ? this.H.seed : 1) ^ (slot * 2654435761)) >>> 0);
    this.heroes[slot] = h;
    G.Supply.reset(Object.values(this.heroes));
  }

  disposeTwins() { for (const tw of this.twins.values()) tw.dispose(); this.twins.clear(); }
  dispose() { const H = this.H; if (H) { clearInterval(H.plunderTimer); clearTimeout(H.tourTimer); clearTimeout(H.duelTimer); } this.disposeTwins(); }

  // ---------- Messages from players ----------
  // fromTwin: sent by the player's twin (their game, here). Their browser can only press buttons (act).
  onMessage(cid, m, fromTwin) {
    const tw = this.twins.get(cid);
    if (!fromTwin) {
      this.seen[cid] = now();
      if (tw && this.lobby.started) {
        if (m.t === 'act') { tw.act(m); return; }
        if (TWIN_ONLY.has(m.t)) return;
      }
    }
    const H = this.H;
    const mine = m.slot != null && m.slot === this.slotOf(cid);   // players only speak for their own seat
    switch (m.t) {
      case 'ping': break;
      case 'leave': case 'bye': this.leave(cid); this.relay(cid, { t: 'bye', cid, from: cid }); break;
      case 'startReq': this.start(cid); break;
      case 'rematchReq': this.rematch(cid); break;
      // Passed on to everyone else unchanged
      case 'watch': case 'view': case 'fight': this.relay(cid, m); break;
      case 'snap': if (!mine) break; this.takeSnap(m.slot, m.hero); this.relay(cid, m); if (H) { H.snaps[m.slot] = m.room; this.checkReady(); } break;
      case 'ready': if (!mine) break; this.takeSnap(m.slot, m.hero); this.relay(cid, m); if (H) this.onReady(m); break;
      case 'skipVote': if (mine) this.skipVote(m); break;
      case 'pick': if (mine) this.pick(m.slot, m.itemId); break;
      case 'duelLock': if (mine) this.duelLock(m); break;
      case 'tourUse': if (mine) this.tourUse(m); break;
      case 'tourDone': if (mine) this.tourDone(m.slot); break;
    }
  }

  // A player's connection came back mid-match: send them what they missed while it was down.
  // clientRoom: the room their game is in.
  catchUp(cid, clientRoom) {
    const H = this.H, slot = this.slotOf(cid);
    if (!H || slot < 0) return;
    const tw = this.twins.get(cid);
    if (tw) {
      // The twin never left: the browser just needs the whole state again. A twin a bot stood in for catches up
      // on the room it missed, like a browser used to.
      const wasBot = tw.backFromBot;
      if (wasBot) { tw.backFromBot = false; this.catchUpTwin(cid, slot); }
      setTimeout(() => tw.flush(true), wasBot ? 400 : 0);
      return;
    }
    this.sendTo(cid, { t: 'players', players: this.players });
    if (H.tour) {
      const left = Math.max(0, (H.tour.breakEnds || now()) - now());
      this.sendTo(cid, { t: 'tour', state: this.tourWire(H.tour.T), phase: H.tour.T.champion ? 'done' : H.tour.waiting ? 'fight' : H.plunder && !H.plunder.done && H.plunder.tour ? 'plunder' : 'break', ms: left, heroes: this.allWire() });
      if (H.plunder && !H.plunder.done && H.plunder.tour) this.plunderCast();
      return;
    }
    if (clientRoom == null || clientRoom < H.room) this.sendTo(cid, { t: 'room', n: H.room, heroes: this.allWire() });
    if (H.plunder && H.plunder.room === H.room) this.plunderCast();
    if (H.duels && H.duels.room === H.room) {
      this.sendTo(cid, { t: 'duels', room: H.room, pairs: H.duels.wire, heroes: this.allWire() });
      const sent = H.duels.sent && H.duels.sent[slot];
      if (sent) setTimeout(() => this.sendTo(cid, sent), 300);   // their fight already happened: here it is
    }
    this.readyInfo();
  }

  // A twin coming back from a bot: the room it's in now, and the shared part in progress
  catchUpTwin(cid, slot) {
    const H = this.H;
    this.sendTo(cid, { t: 'players', players: this.players });
    if (H.tour) {
      const left = Math.max(0, (H.tour.breakEnds || now()) - now());
      this.sendTo(cid, { t: 'tour', state: this.tourWire(H.tour.T), phase: H.tour.T.champion ? 'done' : H.tour.waiting ? 'fight' : H.plunder && !H.plunder.done && H.plunder.tour ? 'plunder' : 'break', ms: left, heroes: this.allWire() });
      if (H.plunder && !H.plunder.done && H.plunder.tour) this.plunderCast();
      return;
    }
    this.sendTo(cid, { t: 'room', n: H.room, heroes: this.allWire() });
    if (H.plunder && H.plunder.room === H.room) this.plunderCast();
    if (H.duels && H.duels.room === H.room) this.sendTo(cid, { t: 'duels', room: H.room, pairs: H.duels.wire, heroes: this.allWire() });
    this.readyInfo();
  }

  // ---------- Heartbeat and drops ----------
  tick() {
    const n = now(), L = this.lobby;
    if (!L.started) {
      let changed = false;
      L.slots.forEach((s, i) => { if (s && !this.conns.has(s.cid) && n - (this.seen[s.cid] || 0) > LOBBY_DROP_MS) { L.slots[i] = null; changed = true; } });
      if (changed) {
        L.slots = [...L.slots.filter(Boolean), ...Array(MAX).fill(null)].slice(0, MAX);
        if (!L.slots.some(s => s && s.cid === L.ownerCid)) L.ownerCid = L.slots[0] ? L.slots[0].cid : null;
        this.cast({ t: 'lobby', lobby: L });
      } else this.cast({ t: 'ping' });
      return;
    }
    this.cast({ t: 'ping' });
    for (const p of this.players) if (!p.bot && !this.conns.has(p.cid) && n - (this.seen[p.cid] || 0) > DROP_MS) this.drop(p.cid);
    // Safety net: a regular room nobody can finish (a lost message, a stuck game) moves on after a generous wait
    const H = this.H;
    if (H && H.room && !H.tour && H.roomAt && n - H.roomAt > (this.CFG.roundSeconds + 120) * 1000) {
      const stuck = this.humansIn().filter(p => !H.ready[p.slot]);
      if (stuck.length && this.skipAllowed(H.room)) { for (const p of stuck) H.ready[p.slot] = true; this.checkReady(); }
    }
  }
  // A player went quiet: a bot takes over their hero
  drop(cid) {
    const p = this.players.find(x => x.cid === cid);
    if (!p || p.bot || !this.H) return;
    const G = this.G, H = this.H;
    // Their twin stops; a bot plays the hero from where the twin left it
    const tw = this.twins.get(cid);
    if (tw) { const w = tw.heroWire(); if (w) this.takeSnap(p.slot, w); tw.pause(); }
    p.bot = true; p.botWas = p.name;
    const h = this.heroes[p.slot];
    h.bot = true; h.botWas = p.name;
    if (!h.rng) h.rng = new G.RNG((H.seed + p.slot * 104729) >>> 0);
    this.cast({ t: 'players', players: this.players });
    if (H.duels && H.duels.room === H.room && !H.duels.done[p.slot] && H.duels.locks) { H.duels.locks[p.slot] = true; this.fireDuels(H.duels, false); }
    if (H.tour && H.tour.waiting) { delete H.tour.waiting[p.slot]; this.tourMaybeResolve(); }
    this.checkReady();
    if (H.plunder) this.plunderTick();
  }
  kick(slot) {
    const p = this.player(slot);
    if (!p || p.bot) return;
    p.kicked = true;
    this.cast({ t: 'kick', slot });
    this.drop(p.cid);
  }

  // ---------- Rooms ----------
  startRoom(n) {
    const H = this.H, G = this.G;
    H.room = n; H.ready = {}; H.snaps = {}; H.plunder = null; H.duels = null; H.skip = null; H.roomAt = now();
    if (n === 11 || n === 21) H.rec.builds[n - 1] = this.allBuilds();   // everyone's build after rooms 10 and 20
    const kind = G.Dungeon.roomKind(n);
    // Bots in shared rooms take their poison now; their room is the shared event itself
    for (const p of this.players) {
      const b = this.heroes[p.slot];
      if (p.bot && b.alive && (kind === 'shop' || kind === 'duel')) G.Dungeon.tickPoison(b, n);
    }
    this.cast({ t: 'room', n, heroes: this.allWire() });
    if (kind === 'shop' || kind === 'duel') this.waitSnaps(n, () => (kind === 'shop' ? this.startPlunder() : this.startDuels()));
    this.readyInfo();
    setTimeout(() => this.checkReady(), 600);   // a room with no players left in it moves on by itself
  }
  // Wait (briefly) for every player's start-of-room snapshot so pairings use fresh health
  waitSnaps(n, then) {
    const H = this.H, t0 = now();
    const check = () => {
      if (this.H !== H || H.room !== n) return;
      const missing = this.humansIn().filter(p => H.snaps[p.slot] !== n);
      if (!missing.length || now() - t0 > 6000) then(); else setTimeout(check, 250);
    };
    setTimeout(check, 150);
  }
  onReady(m) {
    const H = this.H; if (m.room !== H.room) return;
    H.ready[m.slot] = true;
    // Two rooms in a row of the clock running out with nothing done: removed for inactivity
    H.afk = H.afk || {};
    if (m.afk) H.afk[m.slot] = (H.afk[m.slot] || 0) + 1; else if (!m.skipped) H.afk[m.slot] = 0;
    if (H.afk[m.slot] >= 2) { H.afk[m.slot] = 0; this.kick(m.slot); }
    this.readyInfo(); this.skipCheck(); this.checkReady();
  }
  readyInfo() {
    const H = this.H, S = H.skip && H.skip.room === H.room ? H.skip : null;
    this.cast({ t: 'readyInfo', room: H.room, ready: Object.keys(H.ready).map(Number), votes: S ? Object.keys(S.votes).map(Number) : [], skipped: !!(S && S.done) });
  }
  checkReady() {
    const H = this.H, G = this.G;
    if (!H || !H.room || H.ending || H.tour) return;
    // Shared rooms aren't over until the shared part is
    const kind = G.Dungeon.roomKind(H.room);
    if (kind === 'shop' && !(H.plunder && H.plunder.done && H.plunder.room === H.room)) return;
    if (kind === 'duel' && !(H.duels && H.duels.room === H.room)) return;
    if (this.humansIn().some(p => !H.ready[p.slot])) return;
    H.ending = true;
    setTimeout(() => { if (this.H !== H) return; H.ending = false; this.endRoom(); }, 400);
  }
  endRoom() {
    const H = this.H, G = this.G, n = H.room, kind = G.Dungeon.roomKind(n);
    for (const p of this.players) {
      const b = this.heroes[p.slot];
      if (!p.bot || !b.alive) continue;
      if (kind === 'shop' || kind === 'duel') G.AI.autoPicks(b, b.rng);
      else G.AI.aiRoom(b, n);
    }
    if (n >= this.CFG.rooms) { if (!H.tour) this.startTournament(); }
    else this.startRoom(n + 1);
  }

  // ---------- Skip votes (regular rooms only, 3+ players still in) ----------
  skipAllowed(room) { const k = this.G.Dungeon.roomKind(room); return k !== 'shop' && k !== 'duel' && k !== 'tournament'; }
  skipVote(m) {
    const H = this.H;
    if (!H || m.room !== H.room || !this.skipAllowed(H.room) || !H.ready[m.slot]) return;
    H.skip = H.skip && H.skip.room === H.room ? H.skip : { room: H.room, votes: {}, done: false };
    H.skip.votes[m.slot] = true;
    this.readyInfo(); this.skipCheck();
  }
  skipCheck() {
    const H = this.H, S = H && H.skip;
    if (!S || S.done || S.room !== H.room) return;
    const humans = this.humansIn(), waiting = humans.filter(p => !H.ready[p.slot]);
    const votes = humans.filter(p => S.votes[p.slot] && H.ready[p.slot]).length;
    if (humans.length >= 3 && waiting.length === 1 && votes >= humans.length - 1 && votes > 0) {
      S.done = true;
      this.cast({ t: 'skip', room: H.room, slot: waiting[0].slot });
      this.readyInfo();
    }
  }

  // ---------- Plunder ----------
  startPlunder() {
    const H = this.H, G = this.G;
    const alive = this.players.map(p => this.heroes[p.slot]).filter(h => h.alive);
    const pct = h => h.hp / G.Hero.maxHp(h);
    const th = h => (h.spec === 'treasureHunter' ? 0 : 1);   // Treasure Hunters always pick first
    const order = alive.slice().sort((a, b) => th(a) - th(b) || a.hearts - b.hearts || pct(a) - pct(b) || G.Hero.power(a) - G.Hero.power(b)).map(h => h.slot);
    const S = this.CFG.shop;
    H.plunder = { room: H.room, table: G.Loot.shopTable(H.room, alive.length + S.extraTableItems, H.rng), order, turn: 0, picks: {},
      reviewEnds: now() + S.reviewSeconds * 1000, turnEnds: 0, seq: 0, last: null, done: false };
    this.plunderCast();
    clearInterval(H.plunderTimer);
    H.plunderTimer = setInterval(() => this.plunderTick(), 250);
  }
  plunderCast() {
    const P = this.H.plunder, n = now();
    this.cast({ t: 'plunder', room: P.room, tour: P.tour || 0, table: P.table, order: P.order, turn: P.turn, picks: P.picks, seq: P.seq, last: P.last, done: P.done,
      reviewMs: Math.max(0, P.reviewEnds - n), turnMs: P.turnEnds ? Math.max(0, P.turnEnds - n) : 0 });
  }
  plunderTick() {
    const H = this.H, P = H && H.plunder, G = this.G;
    if (!P || P.done) return;
    const n = now(), S = this.CFG.shop;
    if (n < P.reviewEnds) return;
    if (P.turn >= P.order.length) { this.plunderFinish(); return; }
    const slot = P.order[P.turn], hero = this.heroes[slot];
    if (!P.turnEnds) { P.turnEnds = n + (this.isBot(slot) ? S.aiPickDelay : S.turnSeconds) * 1000; this.plunderCast(); return; }
    if (this.isBot(slot) || !hero.alive) {
      if (n >= P.turnEnds) {
        const up = G.AI.bestUpgrade(hero, P.table);
        const pick = up || P.table.find(it => it.kind === 'consumable' && !G.Hero.bagFull(hero)) || null;
        if (pick) G.AI.take(hero, pick); else hero.gold += S.passGold;
        this.plunderApply(slot, pick);
      }
    } else if (n >= P.turnEnds) this.plunderApply(slot, null);   // a player's turn ran out: pass
  }
  pick(slot, itemId) {
    const P = this.H && this.H.plunder;
    if (!P || P.done || now() < P.reviewEnds || P.order[P.turn] !== slot) return;
    const it = itemId ? P.table.find(x => x.id === itemId) : null;
    if (itemId && !it) return;
    this.plunderApply(slot, it);
  }
  plunderApply(slot, item) {
    const P = this.H.plunder;
    if (item) P.table = P.table.filter(x => x.id !== item.id);
    P.picks[slot] = item ? item.name : `passed (+${this.CFG.shop.passGold} gold)`;
    P.last = { slot, item: item || null, pass: !item, seq: ++P.seq };
    P.turn++; P.turnEnds = 0;
    if (P.turn >= P.order.length) { this.plunderFinish(); return; }
    this.plunderCast();
  }
  plunderFinish() {
    const H = this.H, P = H.plunder;
    clearInterval(H.plunderTimer);
    P.done = true;
    this.plunderCast();
    if (P.tour) { setTimeout(() => { if (this.H === H) this.tourBreak(this.CFG.tourBreakSeconds); }, 600); return; }
    this.checkReady();
  }

  // ---------- Duels (rooms 10 and 20) ----------
  startDuels() {
    const H = this.H, G = this.G;
    const field = this.players.map(p => this.heroes[p.slot]).filter(h => h.alive);
    const pairs = G.Duel.pairs(field, H.rng);
    const wire = pairs.map(p => ({ a: p.a.hero.slot, b: p.ghost ? null : p.b.hero.slot, ghostOf: p.ghost ? p.b.of.slot : null, seed: H.rng.int(0, 1e9) }));
    H.duels = { room: H.room, wire, done: {}, locks: {} };
    this.cast({ t: 'duels', room: H.room, pairs: wire, heroes: this.allWire() });
    // Bot-only fights are settled right away. Fights with a player start when every player in them has
    // locked in after the 5-second card (or when the card has been over a while): the server runs the fight
    // and sends the finished result to everyone.
    for (const w of wire) if (this.isBot(w.a) && (w.b == null || this.isBot(w.b))) this.fireDuel(w);
    clearTimeout(H.duelTimer);
    const D = H.duels;
    H.duelTimer = setTimeout(() => { if (H.duels === D) this.fireDuels(D, true); }, (this.CFG.duelIntroSeconds + 2.5) * 1000);
    this.checkReady();
  }
  duelLock(m) {
    const H = this.H;
    if (!H || !H.duels || H.duels.room !== m.room) return;
    this.takeSnap(m.slot, m.hero);
    H.duels.locks[m.slot] = true;
    this.fireDuels(H.duels, false);
  }
  // Start every duel whose players have all locked in (force: whoever hasn't answered goes in as last seen)
  fireDuels(D, force) {
    for (const w of D.wire) {
      if (D.done[w.a]) continue;
      const humans = [w.a, w.b].filter(sl => sl != null && !this.isBot(sl));
      if (!force && !humans.every(sl => D.locks[sl])) continue;
      this.fireDuel(w);
    }
  }
  fireDuel(w) {
    const H = this.H, G = this.G, D = H.duels;
    D.done[w.a] = true; if (w.b != null) D.done[w.b] = true;
    const pair = this.duelPair(w);
    const spec = G.Tournament.pvpSpec(pair.a, pair.b);
    const res = G.Tournament.pvpFrom(spec, w.seed);
    this.recFight('duels', { room: H.room, a: w.a, b: w.b, ghostOf: w.ghostOf }, res, spec);
    // The server settles its bots' side now. Each player's game settles their own side from this same result
    // (their hero still lives in their game until stage 2; duelPair gave the server a throwaway copy of it).
    if ([pair.a, pair.b].some(e => e && e.hero && !e.ghost && this.isBot(e.hero.slot))) G.Duel.resolve(pair, res, H.room);
    const humans = [w.a, w.b].filter(sl => sl != null && !this.isBot(sl));
    if (humans.length) {
      const msg = { t: 'duelFight', room: D.room, w, spec, res: this.slim(res) };
      D.sent = D.sent || {};
      for (const sl of humans) D.sent[sl] = msg;   // kept for anyone whose connection drops before it arrives
      this.cast(msg);
    }
    this.checkReady();
  }
  // A duel pair from the current heroes, at full health (duels are fought at full health)
  duelPair(w) {
    const G = this.G, heroes = this.heroes;
    const side = sl => {
      const h = heroes[sl];
      const e = { hero: h, hp: G.Hero.maxHp(h) };
      if (!this.isBot(sl)) { e.hero = clone(this.heroWire(h)); e.hero.rng = h.rng; }   // a throwaway copy: the player's game settles the real one
      return e;
    };
    const a = side(w.a);
    const b = w.ghostOf != null ? G.Tournament.ghostOf(heroes[w.ghostOf]) : side(w.b);
    return { a, b, ghost: w.ghostOf != null, seed: w.seed };
  }

  // ---------- Tournament (room 30) ----------
  startTournament() {
    const H = this.H, G = this.G;
    const field = this.players.map(p => this.heroes[p.slot]).filter(h => h.alive);
    H.rec.builds[30] = this.allBuilds();
    const T = G.Tournament.create(field, H.rng.fork());
    H.tour = { T, waiting: null };
    this.tourBreak(this.CFG.tourBreakSeconds + this.CFG.tourIntroExtra);
  }
  // A player drank a potion (or used an item) in a tournament break: their health and buffs go into the next fight
  tourUse(m) {
    const H = this.H;
    if (!H || !H.tour || H.tour.waiting) return;
    const e = H.tour.T.entrants.find(x => x.hero.slot === m.slot);
    if (!e) return;
    e.hp = Math.max(1, Math.min(e.maxHp, m.hp));
    if (m.hero) { this.takeSnap(m.slot, m.hero); this.freshen(e); }
    const left = Math.max(0, (H.tour.breakEnds || now()) - now());
    this.cast({ t: 'tour', state: this.tourWire(H.tour.T), phase: 'break', ms: left, heroes: this.allWire() });
  }
  tourBreak(secs) {
    const H = this.H, T = H.tour.T;
    H.tour.breakEnds = now() + secs * 1000;
    if (T.champion) { this.cast({ t: 'tour', state: this.tourWire(T), phase: 'done' }); this.saveMatch(T); return; }
    this.cast({ t: 'tour', state: this.tourWire(T), phase: 'break', ms: secs * 1000, heroes: this.allWire() });
    clearTimeout(H.tourTimer);
    H.tourTimer = setTimeout(() => { if (this.H === H) this.tourFight(); }, secs * 1000);
  }
  // A round starts: the server runs every fight now and sends the results; players watch theirs, then it settles the round
  tourFight() {
    const H = this.H, G = this.G, T = H.tour.T;
    const round = G.Tournament.currentRound(T);
    for (const m of round.pairs) if (m.seed == null) m.seed = H.rng.int(0, 1e9);
    H.tour.waiting = {};
    let longest = 0;
    for (const m of round.pairs) {
      // Wait for the connected players in this round to finish watching their fight (or the timer below)
      for (const e of [m.a, m.b]) {
        if (!e || !e.hero || e.ghost || this.isBot(e.hero.slot) || !e.hero.alive) continue;
        const p = this.player(e.hero.slot);
        if (p && this.conns.has(p.cid)) H.tour.waiting[e.hero.slot] = true;
      }
      this.freshen(m.a); if (!m.ghost) this.freshen(m.b);
      m._spec = G.Tournament.pvpSpec(m.a, m.b);   // frozen: every screen plays exactly this
      m._res = G.Tournament.pvpFrom(m._spec, m.seed);
      longest = Math.max(longest, Math.min(m._res.duration, 10) + Math.max(0, m._res.duration - 10) / 2);
    }
    this.cast({ t: 'tour', state: this.tourWire(T), phase: 'fight', heroes: this.allWire() });
    clearTimeout(H.tourTimer);
    H.tourTimer = setTimeout(() => { if (this.H !== H) return; H.tour.waiting = {}; this.tourMaybeResolve(); }, (longest + 12) * 1000);
  }
  // A player's latest gear, bag and buffs onto their tournament entry (hearts stay the server's)
  freshen(e) {
    if (!e || !e.hero || e.ghost || this.isBot(e.hero.slot)) return;
    const h = this.heroes[e.hero.slot];
    if (!h || h === e.hero) return;
    for (const k of ['gear', 'bag', 'relics', 'buffs', 'level', 'xp', 'bonus', 'gold', 'spec', 'treePicks', 'gem']) if (h[k] !== undefined) e.hero[k] = clone(h[k]);
  }
  tourDone(slot) { const H = this.H; if (H && H.tour && H.tour.waiting) { delete H.tour.waiting[slot]; this.tourMaybeResolve(); } }
  tourMaybeResolve() {
    const H = this.H, G = this.G, W = H.tour.waiting;
    if (!W || Object.keys(W).length) return;
    H.tour.waiting = null;
    clearTimeout(H.tourTimer);
    const T = H.tour.T, round = G.Tournament.currentRound(T);
    for (const m of round.pairs.slice()) {
      if (m.result) continue;
      const res = m._res || G.Tournament.simulate(T, m);
      this.recFight('tour', { round: round.n, a: m.a.hero.slot, b: m.ghost ? null : m.b.hero.slot, ghostOf: m.ghost ? m.b.of.slot : null }, res, m._spec);
      G.Tournament.resolve(T, m, res);
    }
    // Tournament hearts are the server's: keep the heroes in step with their entries
    for (const e of T.entrants) { const h = this.heroes[e.hero.slot]; if (h && h !== e.hero) { h.hearts = e.hero.hearts; h.alive = e.hero.hearts > 0; } }
    // A Plunder between rounds (not after the final)
    if (T.champion || G.Tournament.alive(T).length < 2) { this.tourBreak(this.CFG.tourBreakSeconds); return; }
    this.cast({ t: 'tour', state: this.tourWire(T), phase: 'plunder', heroes: this.allWire() });
    this.startTourPlunder(round.n);
  }
  startTourPlunder(n) {
    const H = this.H, G = this.G, T = H.tour.T;
    const ents = T.entrants.filter(e => !e.out);
    const th = e => (e.hero.spec === 'treasureHunter' ? 0 : 1);
    const order = ents.slice().sort((a, b) => th(a) - th(b) || a.hero.hearts - b.hero.hearts || a.hp / a.maxHp - b.hp / b.maxHp).map(e => e.hero.slot);
    const S = this.CFG.shop;
    H.plunder = { room: H.room, tour: n, table: G.Loot.shopTable(30, ents.length + 1, H.rng, { tome: true }), order, turn: 0, picks: {},
      reviewEnds: now() + S.tourReviewSeconds * 1000, turnEnds: 0, seq: 0, last: null, done: false };
    this.plunderCast();
    clearInterval(H.plunderTimer);
    H.plunderTimer = setInterval(() => this.plunderTick(), 250);
  }
  // The tournament on the wire: seats instead of hero objects. Fights that haven't been settled carry their
  // frozen inputs (spec) and the finished result (res), so nobody's game has to run them.
  tourWire(T) {
    const slotOf = e => (e && e.hero ? e.hero.slot : null);
    return {
      entrants: T.entrants.map(e => ({ slot: e.hero.slot, hp: e.hp, maxHp: e.maxHp, out: e.out, place: e.place, before: e.before, heal: e.heal, hearts: e.hero.hearts })),
      rounds: T.rounds.map(r => ({ n: r.n, pairs: r.pairs.map(m => ({
        a: slotOf(m.a), b: m.ghost ? null : slotOf(m.b), ghostOf: m.ghost ? m.b.of.slot : null, seed: m.seed,
        result: m.result ? { winner: m.result.winner, draw: !!m.result.draw, aHp: m.result.aHp, bHp: m.result.bHp, duration: m.result.duration } : null,
        winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : null, draw: !!m.draw, suddenDeath: !!m.suddenDeath, rageHeal: m.rageHeal || 0,
        lostHearts: (m.lostHearts || []).map(slotOf), snap: m.snap || null,
        spec: !m.result && m._spec ? m._spec : null, res: !m.result && m._res ? this.slim(m._res) : null,
      })) })),
      champion: T.champion ? T.champion.hero.slot : null,
    };
  }
  // A fight result as it travels: everything the arena needs to play it back and the game needs to settle it
  slim(res) { return clone(res); }

  // ---------- Match database ----------
  buildOf(h) {
    if (!h) return null;
    const G = this.G;
    const st = G.Stats.sets(h), s = G.Stats.compute(h);
    const item = it => it && { name: it.name, rarity: it.rarity, set: it.set || null, artifact: it.artifact || null, tier: it.tier || null,
      weaponType: it.weaponType || null, forged: it.forged || 0, affixes: it.affixes || [], tradeoff: it.tradeoff ? it.tradeoff.id : null };
    const gear = {};
    for (const sl of G.SLOTS) gear[sl] = item(h.gear[sl]);
    const lg = G.SLOTS.map(sl => h.gear[sl]).find(it => it && it.artifact);
    return { slot: h.slot, name: h.name, bot: !!this.isBot(h.slot), botWas: h.botWas || null, alive: !!h.alive, hearts: h.hearts, level: h.level, gold: h.gold,
      spec: h.spec || null, tree: h.treePicks || {}, gem: h.gem || null, weapon: h.gear.weapon ? h.gear.weapon.weaponType : null, artifact: lg ? lg.artifact : null,
      sets: st.counts, hybrid: st.hybrid, look: st.look, full: st.full, relics: h.relics || {}, gear, poison: h.poison || 0, diedRoom: h.diedRoom || null,
      heartLog: h.heartLog || [], stats: { maxHp: s.maxHp, dmg: s.dmg, spd: s.spd, armor: s.armor, ward: s.ward, crit: s.crit, critDmg: s.critDmg, dodge: s.dodge,
        shield: s.shield, holy: s.holy, pierce: s.pierce, leech: s.leech, bleed: s.bleed, stun: s.stun, range: s.range, type: s.type } };
  }
  allBuilds() { const o = {}; for (const p of this.players) o[p.slot] = this.buildOf(this.heroes[p.slot]); return o; }
  recFight(kind, who, res, spec) {
    const R = this.H && this.H.rec;
    if (!R || !res) return;
    const st = x => x && { maxHp: x.maxHp, dmg: x.dmg, spd: x.spd, armor: x.armor, ward: x.ward, crit: x.crit, dodge: x.dodge, shield: x.shield, spec: x.spec, gem: x.gem, artifact: x.artifact, weaponType: x.weaponType };
    R[kind].push({ ...who, winner: res.draw ? 'draw' : res.winner, duration: res.duration,
      aHp: spec ? spec.aHp : null, bHp: spec ? spec.b.hp : null, aStats: spec ? st(spec.sa) : null, bStats: spec ? st(spec.b.s) : null });
  }
  saveMatch(T) {
    const H = this.H, R = H && H.rec, G = this.G;
    if (!R || R.saved) return;
    R.saved = true;
    const finals = this.allBuilds();
    for (const e of T.entrants) {
      const b = this.buildOf(e.hero); if (!b) continue;
      b.place = e.place; b.alive = true;
      const seen = finals[e.hero.slot];
      b.heartLog = [...((seen && seen.heartLog) || []).filter(x => x.room < 30), ...(e.hero.heartLog || []).filter(x => x.room >= 30)];
      finals[e.hero.slot] = b;
    }
    const humans = this.players.filter(p => !p.bot || p.botWas);
    const data = {
      version: this.VERSION, started: R.started, ended: new Date().toISOString(), server: true,
      players: this.players.map(p => ({ slot: p.slot, name: p.botWas || p.name, bot: !!p.bot && !p.botWas, droppedOrKicked: !!p.botWas, kicked: !!p.kicked })),
      bosses: [8, 18, 28].map(r => { const b = G.Dungeon.monsterFor(r, 'boss'); return b ? b.id : null; }),
      champion: T.champion ? { slot: T.champion.hero.slot, name: T.champion.hero.name } : null,
      builds: { ...R.builds, final: finals }, duels: R.duels, tournament: R.tour,
    };
    const row = { version: this.VERSION, room_code: this.code, players: humans.length, bots: this.players.length - humans.length,
      champion: data.champion ? data.champion.name : null, data };
    this.cast({ t: 'saved', status: 'saving' });
    this.server.saveMatch(row)
      .then(() => this.cast({ t: 'saved', status: 'saved' }))
      .catch(err => { console.warn('Match not saved:', err && err.message); this.cast({ t: 'saved', status: 'failed: ' + (err && err.message || err) }); });
  }
}

module.exports = { Room, fastConfig };
