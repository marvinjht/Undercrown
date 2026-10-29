// Multiplayer with friends through a room code.
//
// With the game server (G.Net.mode() === 'server', the default once it's online): the server is the host. It runs
// the room clock, the bots, Plunder, duel pairings and the tournament, and it runs every fight between players and
// sends the finished result, so every screen plays back the same fight (server/room.js, docs/PROTOCOL.md).
// Everyone's isHost is false; the room's creator is its owner (ownerCid) and gets the Start and Play again buttons.
//
// Without it (?net=p2p or ?net=local), the room creator's game is the host:
// Who decides what:
//   Every player runs their own dungeon: doors, fights, loot, picks. Their browser is the authority on their hero.
//   The host (whoever made the room) also runs: the bots, the room clock (a new room starts when everyone is
//   ready), the Plunder pile and pick order, duel pairings and seeds, and the whole tournament.
// Heroes travel as snapshots, so everyone sees everyone's gear, health and hearts. Fights between players use a
// seed from the host and the same snapshots, so both screens play the exact same fight.
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const MAX = 8;        // seats in a room
  const BOT_FILL = 6;   // bots fill empty seats up to this many players
  const now = () => Date.now();
  const TINTS = [G.PLAYER_TINT, ...G.RIVALS.map(r => r.tint), 0xe07a9a, 0x9ad9c4];
  const BOT_NAMES = G.RIVALS.map(r => r.name).concat(['Grist', 'Ulla', 'Fenn', 'Rook']);
  const update = () => G.UI && G.UI.update && G.UI.update();

  // ---------- Hero snapshots ----------
  function heroWire(h) {
    const o = {};
    for (const k in h) if (k !== 'rng') o[k] = h[k];
    return JSON.parse(JSON.stringify(o));
  }
  function heroFromWire(w, seed) {
    const h = JSON.parse(JSON.stringify(w));
    h.isPlayer = false;
    h.rng = new G.RNG(((seed || 1) ^ (h.slot * 2654435761)) >>> 0);
    return h;
  }
  const code6 = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; };

  const MP = {
    status: 'idle',           // idle | connecting | lobby | match | ended | error
    error: null, t: null, cid: null, name: '', code: '', isHost: false, mySlot: -1,
    lobby: null,              // { slots: [{cid, name} | null], hostCid }
    seen: {},                 // cid -> last time we heard from them
    players: [],              // match: [{ slot, cid, name, bot, botWas, tint }]
    heroes: {},               // match: slot -> hero object (own hero is the live one)
    readyInfo: null,
    H: null,                  // host-only state

    get active() { return this.status !== 'idle'; },
    inMatch() { return this.status === 'match'; },

    // ---------- Connecting ----------
    async create(name) { return this._open(G.Net.mode() === 'server' ? 'NEW' : code6(), name, true); },
    async join(code, name) { return this._open(String(code || '').trim().toUpperCase(), name, false); },
    async _open(code, name, host) {
      if (!code) { this.status = 'error'; this.error = 'Enter a room code.'; update(); return; }
      this.leave(true);
      this.serverMode = G.Net.mode() === 'server';
      this.status = 'connecting'; this.error = null; this.code = this.serverMode && host ? '' : code; this.isHost = host && !this.serverMode; this.wantsHost = host;
      this.name = (name || '').trim().slice(0, 14) || (host ? 'Host' : 'Player');
      try { localStorage.setItem('uc-name', this.name); } catch (e) { /* ignore */ }
      this.cid = 'c' + Math.random().toString(36).slice(2, 9);
      update();
      try {
        this.t = await G.Net.connect(code, msg => this.onMessage(msg), {
          // The connection to the server dropped and came back: say who we are again
          onReconnect: () => { if (this.t && this.status !== 'ended') this.t.send({ t: 'rejoin', cid: this.cid, code: this.code, name: this.name, v: G.VERSION, room: G.Game.s ? G.Game.s.room : null, from: this.cid }); },
          onLost: () => { if (this.status !== 'ended' && this.status !== 'idle') this.end('Lost the connection to the game server.'); },
        });
      } catch (e) {
        this.status = 'error'; this.error = e.message || 'Could not connect.'; update(); return;
      }
      if (this.serverMode) {
        // The server makes the room (and its code) or puts us in one; its lobby message tells us which
        this.send(host ? { t: 'create', cid: this.cid, name: this.name, v: G.VERSION } : { t: 'join', code, cid: this.cid, name: this.name, v: G.VERSION });
      } else if (host) {
        this.lobby = { slots: [{ cid: this.cid, name: this.name }, ...Array(MAX - 1).fill(null)], hostCid: this.cid, v: G.VERSION };
        this.status = 'lobby';
        this.send({ t: 'lobby', lobby: this.lobby });
      } else {
        // Keep knocking until the host answers
        let tries = 0;
        const knock = () => {
          if (this.status !== 'connecting') return;
          if (tries++ > 12) { this.status = 'error'; this.error = `No room ${code} found. Check the code, or ask the host to create it again.`; update(); return; }
          this.send({ t: 'hello', cid: this.cid, name: this.name, v: G.VERSION });
          setTimeout(knock, 1000);
        };
        knock();
      }
      this.startHeartbeat();
      update();
    },
    leave(silent) {
      if (this.t) { try { this.send({ t: 'bye', cid: this.cid }); this.t.close(); } catch (e) { /* ignore */ } }
      clearInterval(this._beat);
      if (G.Remote) G.Remote.end();
      this.remote = false;
      this.t = null; this.status = 'idle'; this.lobby = null; this.H = null; this.players = []; this.heroes = {}; this.mySlot = -1;
      G.uidPrefix = '';
      if (G.Game.mp) { G.Game.mp = false; G.Game.s = null; }
      if (!silent) update();
    },
    send(msg) { if (this.t) { msg.from = this.cid; this.t.send(msg); } },
    // The room's creator: Start and Play again (the host in player-hosted rooms, the owner on the server)
    isOwner() { return this.serverMode ? !!(this.lobby && this.lobby.ownerCid === this.cid) : this.isHost; },
    // Host: send to everyone, including itself
    cast(msg) { this.send(msg); this.onMessage({ ...msg, from: this.cid }); },

    startHeartbeat() {
      clearInterval(this._beat);
      this._beat = setInterval(() => {
        if (!this.t) return;
        this.send({ t: 'ping', cid: this.cid });
        if (this.watchers[this.mySlot] && this.watchers[this.mySlot].size) this.sendView(true);
        const n = now();
        if (this.isHost) this.hostCheckDrops(n);
        // Background tabs send less often, so only give up on a host that's been silent a long time
        else if (this.lobby && this.seen[this.lobby.hostCid] && n - this.seen[this.lobby.hostCid] > 90000 && this.status !== 'ended') {
          this.end('The host left, so the match is over.');
        }
      }, 2500);
    },

    // ---------- Messages ----------
    onMessage(m) {
      if (!m || !m.t) return;
      if (m.from) this.seen[m.from] = now();
      // A player the host handed to a bot is back: give them their seat again
      if (this.H && m.from && m.from !== this.cid) {
        const back = this.players.find(p => p.cid === m.from && p.bot && p.botWas && !p.kicked);
        if (back) { back.bot = false; back.botWas = null; this.cast({ t: 'players', players: this.players }); }
      }
      // A server match: your game runs on the server and sends its state; the room's own messages went to it
      if (this.remote && this.status === 'match') {
        if (m.t === 'state') { G.Remote.onState(m); return; }
        if (!['lobby', 'rematch', 'end', 'kick', 'saved', 'ping', 'version', 'joinError'].includes(m.t)) return;
      }
      const H = this.H;
      switch (m.t) {
        case 'hello': if (this.isHost) this.hostHello(m); break;
        case 'bye': {
          const gone = this.players.find(p => p.cid === m.cid);
          if (gone) for (const k in this.watchers) this.watchers[k].delete(gone.slot);
          if (this.isHost) this.hostBye(m.cid);
          break;
        }
        case 'ping': break;
        case 'version':
          if (m.cid === this.cid && this.status === 'connecting') {
            this.status = 'error';
            this.error = this.serverMode ? `The game server is on version ${m.v} and this page is on ${G.VERSION}. Refresh the page (or download the latest build), then try again.`
              : `The host is on version ${m.v} and you're on ${G.VERSION}. Both of you refresh the game page, then try again.`;
            update();
          }
          break;
        case 'joinError': if (m.cid === this.cid && this.status === 'connecting') { this.status = 'error'; this.error = m.reason; update(); } break;
        case 'saved': this.saveStatus = m.status; update(); break;
        case 'rematch': this.onRematch(m); break;
        case 'duelGo': this.onDuelGo(m); break;
        case 'duelLock': if (this.isHost) this.onDuelLock(m); break;
        case 'duelFight': this.onDuelFight(m); break;
        case 'tourUse': if (H) this.hostTourUse(m); else if (m.hero) this.takeSnap(m.slot, m.hero); break;
        case 'fight': this.onFight(m); break;
        case 'watch': this.onWatch(m); break;
        case 'view': this.onView(m); break;
        case 'lobby':
          if (this.isHost && m.from !== this.cid) break;
          this.lobby = m.lobby; this.seen[m.lobby.hostCid] = now();
          if (m.lobby.code) this.code = m.lobby.code;
          if (this.serverMode && this.status === 'match') break;   // a reconnect mid-match: nothing to change
          if (this.status === 'connecting') {
            if (m.lobby.slots.some(s => s && s.cid === this.cid)) this.status = 'lobby';
            else if (m.lobby.started) { this.status = 'error'; this.error = 'That match has already started.'; }
            else if (m.lobby.slots.every(Boolean)) { this.status = 'error'; this.error = 'That room is full (8 players).'; }
          } else if (this.status === 'lobby' && !m.lobby.slots.some(s => s && s.cid === this.cid)) {
            this.status = 'error'; this.error = 'You were removed from the room.';
          }
          update(); break;
        case 'start': this.startMatch(m); break;
        case 'players': this.players = m.players; this.applyBots(); update(); break;
        case 'snap': this.onSnap(m); if (H) this.hostSnap(m); break;
        case 'ready': this.onSnap(m); if (H) this.hostReady(m); break;
        case 'readyInfo': this.readyInfo = m; if (G.Game.s && G.Game.s.phase === 'waiting') update(); break;
        case 'room': this.onRoom(m); break;
        case 'plunder': this.onPlunder(m); break;
        case 'pick': if (H) this.hostPick(m.slot, m.itemId); break;
        case 'duels': this.onDuels(m); break;
        case 'tour': this.onTour(m); break;
        case 'tourDone': if (H) this.hostTourDone(m.slot); break;
        case 'skipVote': if (H) this.hostSkipVote(m); break;
        case 'skip': if (m.slot === this.mySlot && G.Game.s) G.Game.forceSkip(m.room); break;
        case 'kick': if (m.slot === this.mySlot) this.end('You’ve been removed from the match for inactivity: the clock ran out on you two rounds in a row.'); break;
        case 'end': this.end(m.reason); break;
      }
    },

    end(reason) {
      this.status = 'ended';
      clearInterval(this._beat);
      if (this.t) { try { this.t.close(); } catch (e) { /* ignore */ } this.t = null; }
      const s = G.Game.s;
      if (s) { s.phase = 'mpEnded'; s.notice = reason; s.roundEnds = 0; }
      update();
    },

    // ---------- Lobby (host) ----------
    hostHello(m) {
      const L = this.lobby;
      if (!L) return;
      if (m.v !== G.VERSION) { this.send({ t: 'version', cid: m.cid, v: G.VERSION }); return; }
      if (L.started) { this.send({ t: 'lobby', lobby: { ...L, started: true } }); return; }
      if (!L.slots.some(s => s && s.cid === m.cid)) {
        const i = L.slots.findIndex(s => !s);
        if (i >= 0) L.slots[i] = { cid: m.cid, name: (m.name || 'Player').slice(0, 14) };
      }
      this.cast({ t: 'lobby', lobby: L });
    },
    hostBye(cid) {
      const L = this.lobby;
      if (!L) return;
      if (!L.started) {
        const i = L.slots.findIndex(s => s && s.cid === cid);
        if (i > 0) { L.slots[i] = null; this.cast({ t: 'lobby', lobby: L }); }
      } else this.hostDrop(cid);
    },
    hostCheckDrops(n) {
      const L = this.lobby;
      if (!L) return;
      if (!L.started) {
        let changed = false;
        L.slots.forEach((s, i) => { if (i > 0 && s && this.seen[s.cid] && n - this.seen[s.cid] > 12000) { L.slots[i] = null; changed = true; } });
        if (changed) this.cast({ t: 'lobby', lobby: L });
        else this.send({ t: 'lobby', lobby: L });   // late joiners and refreshers stay in sync
        return;
      }
      // Quiet for a long while (closed the tab, lost connection): a bot plays for them until they're back
      for (const p of this.players) if (!p.bot && p.cid !== this.cid && this.seen[p.cid] && n - this.seen[p.cid] > 45000) this.hostDrop(p.cid);
    },

    // Host presses Start: fill empty seats with bots
    hostStart() {
      if (this.serverMode) { if (this.isOwner()) this.send({ t: 'startReq' }); return; }
      if (!this.isHost || !this.lobby || this.lobby.started) return;
      const L = this.lobby;
      const used = new Set(L.slots.filter(Boolean).map(s => s.name));
      const botNames = BOT_NAMES.filter(n => !used.has(n));
      // Bots fill the table up to 6. Seats 7 and 8 only ever hold real players.
      const humans = L.slots.filter(Boolean);
      const total = Math.max(BOT_FILL, humans.length);
      const players = [];
      for (let i = 0; i < total; i++) {
        const s = humans[i];
        players.push(s ? { slot: i, cid: s.cid, name: s.name, bot: false, tint: TINTS[i] }
          : { slot: i, cid: null, name: botNames.shift() || 'Bot ' + i, bot: true, tint: TINTS[i] });
      }
      L.started = true;
      this.send({ t: 'lobby', lobby: L });
      this.cast({ t: 'start', seed: G.newSeed(), players });
    },

    // Back to the lobby with everyone still here, same room code
    hostRematch() {
      if (this.serverMode) { if (this.isOwner()) this.send({ t: 'rematchReq' }); return; }
      if (!this.isHost || !this.lobby) return;
      const L = this.lobby, n = now();
      const here = this.players.filter(p => !p.bot && (p.cid === this.cid || (this.seen[p.cid] && n - this.seen[p.cid] < 15000)));
      L.slots = Array(MAX).fill(null);
      here.forEach((p, i) => { L.slots[i] = { cid: p.cid, name: p.name }; });
      L.started = false; L.v = G.VERSION;
      this.cast({ t: 'rematch', lobby: L });
    },
    onRematch(m) {
      const H = this.H;
      if (H) { clearInterval(H.plunderTimer); clearTimeout(H.tourTimer); clearTimeout(H.duelTimer); }
      this.H = null; this.players = []; this.heroes = {}; this.mySlot = -1; this.readyInfo = null; this.duelGo = {};
      this.watching = null; this.watchers = {}; this.views = {}; this.lastFight = {};
      this.lobby = m.lobby;
      if (G.Remote) G.Remote.end();
      this.remote = false;
      this.status = m.lobby.slots.some(s => s && s.cid === this.cid) ? 'lobby' : 'idle';
      G.uidPrefix = '';
      G.Game.mp = false; G.Game.s = null;
      if (G.Arena) G.Arena.stop();
      update();
    },

    // ---------- Match setup (everyone) ----------
    startMatch(m) {
      const me = m.players.find(p => p.cid === this.cid);
      if (!me) { this.status = 'error'; this.error = 'The match started without you.'; update(); return; }
      this.status = 'match';
      this.players = m.players;
      this.mySlot = me.slot;
      G.uidPrefix = 's' + me.slot;
      const rng = new G.RNG(m.seed);
      const heroes = {};
      for (const p of m.players) {
        const h = G.Hero.create({ name: p.name, tint: p.tint, isPlayer: p.slot === me.slot }, rng.fork());
        h.id = 'h' + p.slot; h.slot = p.slot; h.bot = p.bot;
        heroes[p.slot] = h;
      }
      // Own randomness (doors, loot) is private to each player
      heroes[me.slot].rng = new G.RNG((m.seed ^ (me.slot + 1) * 0x9e3779b1) >>> 0);
      this.heroes = heroes;
      G.Game.startMatch({ seed: (m.seed + me.slot * 7919) >>> 0, matchSeed: m.seed, player: heroes[me.slot], rivals: m.players.filter(p => p.slot !== me.slot).map(p => heroes[p.slot]) });
      // On the game server your game runs there (stage 2): this page shows it and sends your choices.
      // (The server's own copy of this code, your twin, has no G.Remote and plays the game for real.)
      if (this.serverMode && G.Remote) { this.remote = true; G.Remote.begin(); }
      if (this.isHost) {
        this.H = { seed: m.seed, rng: new G.RNG((m.seed ^ 0x5bd1e995) >>> 0), room: 0, ready: {}, snaps: {},
          rec: { started: new Date().toISOString(), builds: {}, duels: [], tour: [], saved: false } };   // the match database record
        for (const p of m.players) if (p.bot) heroes[p.slot].rng = new G.RNG((m.seed + p.slot * 104729) >>> 0);
        setTimeout(() => this.hostStartRoom(1), 300);
      }
    },
    player(slot) { return this.players.find(p => p.slot === slot); },
    isBot(slot) { const p = this.player(slot); return !!(p && p.bot); },
    // Keep the game's rival list pointing at the latest hero objects
    syncRivals() {
      const s = G.Game.s;
      if (!s) return;
      s.rivals = this.players.filter(p => p.slot !== this.mySlot).map(p => this.heroes[p.slot]);
      G.Supply.reset([s.player, ...s.rivals]);
    },
    applyBots() {
      for (const p of this.players) { const h = this.heroes[p.slot]; if (h) { h.bot = p.bot; h.botWas = p.botWas || null; } }
    },

    // A snapshot from another player (or the host's bots). Never overwrites your own hero.
    takeSnap(slot, wire) {
      if (slot === this.mySlot || !wire) return;
      const old = this.heroes[slot];
      if (this.isHost && this.isBot(slot) && old) return;   // the host owns its bots
      const h = heroFromWire(wire, this.H ? this.H.seed : 1);
      h.bot = this.isBot(slot);
      if (old && old.rng) h.rng = old.rng;
      // Vulture's Heart: a rival lost a heart
      const me = this.heroes[this.mySlot];
      if (old && me && me.alive && me.gem === 'vulture' && h.hearts < old.hearts) {
        const n = old.hearts - h.hearts, got = G.Hero.vultureFeed(me, n);
        const s = G.Game.s;
        if (s) s.notice = [s.notice, `${h.name} lost a heart. Vulture’s Heart: +${CFG().vultureMax * n} max health${got ? `, healed ${got}` : ''}.`].filter(Boolean).join(' ');
      }
      this.heroes[slot] = h;
      this.syncRivals();
    },
    onSnap(m) { this.takeSnap(m.slot, m.hero); if (G.Game.s && m.slot !== this.mySlot) update(); },
    mySnapWire() { const me = this.heroes[this.mySlot]; if (G.Game.s) me.room = G.Game.s.room; return heroWire(me); },
    sendSnap() { if (!this.inMatch()) return; const msg = { t: 'snap', slot: this.mySlot, room: G.Game.s.room, hero: this.mySnapWire() }; this.isHost ? this.cast(msg) : this.send(msg); },
    sendReady() {
      if (!this.inMatch()) return;
      const s = G.Game.s, room = s.room;
      // Away from the keyboard: the clock ran out this room and you did nothing (a skip vote doesn't count)
      const afk = s.timedOutRoom === room && s.actedRoom !== room && s.skipRoom !== room;
      const msg = { t: 'ready', slot: this.mySlot, room, hero: this.mySnapWire(), afk, skipped: s.skipRoom === room };
      this.isHost ? this.cast(msg) : this.send(msg);
    },
    // ---------- Skip votes and inactivity ----------
    // Regular rooms only (not Plunder, duels or the tournament)
    skipAllowed(room) { const k = G.Dungeon.roomKind(room); return k !== 'shop' && k !== 'duel' && k !== 'tournament'; },
    sendSkipVote() {
      const msg = { t: 'skipVote', slot: this.mySlot, room: G.Game.s.room };
      this.isHost ? this.hostSkipVote(msg) : this.send(msg);
    },
    hostSkipVote(m) {
      const H = this.H;
      if (!H || m.room !== H.room || !this.skipAllowed(H.room) || !H.ready[m.slot]) return;
      H.skip = H.skip && H.skip.room === H.room ? H.skip : { room: H.room, votes: {}, done: false };
      H.skip.votes[m.slot] = true;
      this.hostReadyInfo();
      this.hostSkipCheck();
    },
    hostSkipCheck() {
      const H = this.H, S = H && H.skip;
      if (!S || S.done || S.room !== H.room) return;
      const humans = this.humansIn(), waiting = humans.filter(p => !H.ready[p.slot]);
      const votes = humans.filter(p => S.votes[p.slot] && H.ready[p.slot]).length;
      if (humans.length >= 3 && waiting.length === 1 && votes >= humans.length - 1 && votes > 0) {   // never with only 2 players left
        S.done = true;
        this.cast({ t: 'skip', room: H.room, slot: waiting[0].slot });
        this.hostReadyInfo();
      }
    },
    hostKick(slot) {
      const p = this.player(slot);
      if (!p || p.bot) return;
      p.kicked = true;
      this.cast({ t: 'kick', slot });
      this.hostDrop(p.cid);
    },

    // ---------- Rooms ----------
    onRoom(m) {
      if (!this.isHost) for (const slot in m.heroes) this.takeSnap(+slot, m.heroes[slot]);
      this.readyInfo = null;
      const s = G.Game.s;
      if (!s) return;
      if (!s.player.alive) { s.room = m.n; update(); return; }   // spectating
      if (this.serverMode && s.room === m.n && s.phase !== 'waiting') return;   // a catch-up after a reconnect: already in this room
      G.Game.mpRoom(m.n);
    },
    allWire() { const o = {}; for (const p of this.players) o[p.slot] = heroWire(this.heroes[p.slot]); return o; },
    humansIn() { return this.players.filter(p => !p.bot && this.heroes[p.slot] && this.heroes[p.slot].alive); },

    hostStartRoom(n) {
      const H = this.H;
      H.room = n; H.ready = {}; H.snaps = {}; H.plunder = null; H.duels = null; H.skip = null;
      if (H.rec && (n === 11 || n === 21)) H.rec.builds[n - 1] = this.allBuilds();   // everyone's build after rooms 10 and 20
      const kind = G.Dungeon.roomKind(n);
      // Bots in shared rooms take their poison now; their room is the shared event itself
      for (const p of this.players) {
        const b = this.heroes[p.slot];
        if (p.bot && b.alive && (kind === 'shop' || kind === 'duel')) G.Dungeon.tickPoison(b, n);
      }
      this.cast({ t: 'room', n, heroes: this.allWire() });
      if (kind === 'shop' || kind === 'duel') this.hostWaitSnaps(n, () => (kind === 'shop' ? this.hostStartPlunder() : this.hostStartDuels()));
      this.hostReadyInfo();
      setTimeout(() => this.hostCheckReady(), 600);   // a room with no players left in it moves on by itself
    },
    // Wait (briefly) for every player's start-of-room snapshot so pairings use fresh health
    hostWaitSnaps(n, then) {
      const H = this.H, t0 = now();
      const check = () => {
        if (H.room !== n) return;
        const missing = this.humansIn().filter(p => p.slot !== this.mySlot && H.snaps[p.slot] !== n);
        if (!missing.length || now() - t0 > 6000) then(); else setTimeout(check, 250);
      };
      setTimeout(check, 150);
    },
    hostSnap(m) { if (this.H) this.H.snaps[m.slot] = m.room; this.hostCheckReady(); },
    hostReady(m) {
      const H = this.H; if (!H || m.room !== H.room) return;
      H.ready[m.slot] = true;
      // Two rooms in a row of the clock running out with nothing done: removed for inactivity
      H.afk = H.afk || {};
      if (m.afk) H.afk[m.slot] = (H.afk[m.slot] || 0) + 1; else if (!m.skipped) H.afk[m.slot] = 0;
      if (H.afk[m.slot] >= 2 && m.slot !== this.mySlot) { H.afk[m.slot] = 0; this.hostKick(m.slot); }
      this.hostReadyInfo(); this.hostSkipCheck(); this.hostCheckReady();
    },
    hostReadyInfo() {
      const H = this.H, S = H.skip && H.skip.room === H.room ? H.skip : null;
      this.cast({ t: 'readyInfo', room: H.room, ready: Object.keys(H.ready).map(Number), votes: S ? Object.keys(S.votes).map(Number) : [], skipped: S && S.done });
    },
    hostCheckReady() {
      const H = this.H;
      if (!H || !H.room || H.ending || H.tour) return;
      // Shared rooms aren't over until the shared part is
      const kind = G.Dungeon.roomKind(H.room);
      if (kind === 'shop' && !(H.plunder && H.plunder.done && H.plunder.room === H.room)) return;
      if (kind === 'duel' && !(H.duels && H.duels.room === H.room)) return;
      const waiting = this.humansIn().filter(p => !H.ready[p.slot]);
      if (waiting.length) return;
      H.ending = true;
      setTimeout(() => { H.ending = false; this.hostEndRoom(); }, 400);
    },
    hostEndRoom() {
      const H = this.H, n = H.room, kind = G.Dungeon.roomKind(n);
      for (const p of this.players) {
        const b = this.heroes[p.slot];
        if (!p.bot || !b.alive) continue;
        if (kind === 'shop' || kind === 'duel') G.AI.autoPicks(b, b.rng);
        else G.AI.aiRoom(b, n);
      }
      if (n >= CFG().rooms) { if (!H.tour) this.hostStartTournament(); }
      else this.hostStartRoom(n + 1);
    },

    // A player went quiet: a bot takes over their hero
    hostDrop(cid) {
      const p = this.players.find(x => x.cid === cid);
      if (!p || p.bot) return;
      p.bot = true; p.botWas = p.name;
      const h = this.heroes[p.slot];
      h.bot = true; h.botWas = p.name;
      if (!h.rng) h.rng = new G.RNG((this.H.seed + p.slot * 104729) >>> 0);
      this.cast({ t: 'players', players: this.players });
      const H = this.H;
      if (H.duels && H.duels.room === H.room && !H.duels.done[p.slot] && H.duels.locks) {
        H.duels.locks[p.slot] = true;
        this.hostFireDuels(H.duels, false);
      }
      if (H.tour && H.tour.waiting) { delete H.tour.waiting[p.slot]; this.hostTourMaybeResolve(); }
      this.hostCheckReady();
      if (H.plunder) this.hostPlunderTick();
    },

    // ---------- Plunder ----------
    hostStartPlunder() {
      const H = this.H;
      const alive = this.players.map(p => this.heroes[p.slot]).filter(h => h.alive);
      const pct = h => h.hp / G.Hero.maxHp(h);
      const th = h => (h.spec === 'treasureHunter' ? 0 : 1);   // Treasure Hunters always pick first
      const order = alive.slice().sort((a, b) => th(a) - th(b) || a.hearts - b.hearts || pct(a) - pct(b) || G.Hero.power(a) - G.Hero.power(b)).map(h => h.slot);
      const S = CFG().shop;
      H.plunder = { room: H.room, table: G.Loot.shopTable(H.room, alive.length + S.extraTableItems, H.rng), order, turn: 0, picks: {},
        reviewEnds: now() + S.reviewSeconds * 1000, turnEnds: 0, seq: 0, last: null, done: false };
      this.hostPlunderCast();
      clearInterval(H.plunderTimer);
      H.plunderTimer = setInterval(() => this.hostPlunderTick(), 250);
    },
    hostPlunderCast() {
      const P = this.H.plunder, n = now();
      this.cast({ t: 'plunder', room: P.room, tour: P.tour || 0, table: P.table, order: P.order, turn: P.turn, picks: P.picks, seq: P.seq, last: P.last, done: P.done,
        reviewMs: Math.max(0, P.reviewEnds - n), turnMs: P.turnEnds ? Math.max(0, P.turnEnds - n) : 0 });
    },
    hostPlunderTick() {
      const H = this.H, P = H && H.plunder;
      if (!P || P.done) return;
      const n = now(), S = CFG().shop;
      if (n < P.reviewEnds) return;
      if (P.turn >= P.order.length) { this.hostPlunderFinish(); return; }
      const slot = P.order[P.turn], hero = this.heroes[slot];
      if (!P.turnEnds) { P.turnEnds = n + (this.isBot(slot) ? S.aiPickDelay : S.turnSeconds) * 1000; this.hostPlunderCast(); return; }
      if (this.isBot(slot) || !hero.alive) {
        if (n >= P.turnEnds) {
          const up = G.AI.bestUpgrade(hero, P.table);
          const pick = up || P.table.find(it => it.kind === 'consumable' && !G.Hero.bagFull(hero)) || null;
          if (pick) G.AI.take(hero, pick); else hero.gold += S.passGold;
          this.hostPlunderApply(slot, pick);
        }
      } else if (n >= P.turnEnds) this.hostPlunderApply(slot, null);   // a player's turn ran out: pass
    },
    hostPick(slot, itemId) {
      const P = this.H && this.H.plunder;
      if (!P || P.done || now() < P.reviewEnds || P.order[P.turn] !== slot) return;
      const it = itemId ? P.table.find(x => x.id === itemId) : null;
      if (itemId && !it) return;
      this.hostPlunderApply(slot, it);
    },
    hostPlunderApply(slot, item) {
      const P = this.H.plunder;
      if (item) P.table = P.table.filter(x => x.id !== item.id);
      P.picks[slot] = item ? item.name : `passed (+${CFG().shop.passGold} gold)`;
      P.last = { slot, item: item || null, pass: !item, seq: ++P.seq };
      P.turn++; P.turnEnds = 0;
      if (P.turn >= P.order.length) { this.hostPlunderFinish(); return; }
      this.hostPlunderCast();
    },
    hostPlunderFinish() {
      const H = this.H, P = H.plunder;
      clearInterval(H.plunderTimer);
      P.done = true;
      this.hostPlunderCast();
      if (P.tour) { setTimeout(() => this.hostTourBreak(CFG().tourBreakSeconds), 600); return; }
      this.hostCheckReady();
    },
    // Everyone: show the pile; apply your own pick when the host confirms it
    onPlunder(m) {
      const s = G.Game.s;
      if (!s || (m.tour ? !s.tour : s.room !== m.room)) return;
      const key = m.room + ':' + (m.tour || 0) + ':' + (m.last && m.last.seq);
      if (m.last && m.last.slot === this.mySlot && !(s.plunderApplied || {})[key]) {
        (s.plunderApplied = s.plunderApplied || {})[key] = true;
        const p = s.player;
        if (m.last.pass) { p.gold += CFG().shop.passGold; s.shopMsg = `You passed and got ${CFG().shop.passGold} gold.`; }
        else { s.shopMsg = G.Hero.receivedText(m.last.item, G.Hero.receive(p, m.last.item)); }
        this.sendSnap();
      }
      G.Game.mpPlunder(m);
    },
    sendPick(itemId) {
      const msg = { t: 'pick', slot: this.mySlot, itemId: itemId || null };
      if (this.isHost) this.hostPick(msg.slot, msg.itemId); else this.send(msg);
    },

    // ---------- Duels ----------
    hostStartDuels() {
      const H = this.H;
      const field = this.players.map(p => this.heroes[p.slot]).filter(h => h.alive);
      const pairs = G.Duel.pairs(field, H.rng);
      const wire = pairs.map(p => ({ a: p.a.hero.slot, b: p.ghost ? null : p.b.hero.slot, ghostOf: p.ghost ? p.b.of.slot : null, seed: H.rng.int(0, 1e9) }));
      H.duels = { room: H.room, wire, done: {} };
      this.duelGo = {};
      this.cast({ t: 'duels', room: H.room, pairs: wire, heroes: this.allWire() });
      // Bot-only fights are settled right away. Fights with a player start when the shared 5-second card ends:
      // each player's game locks in their hero, the host freezes both sides and sends that one fight to everyone.
      for (const w of wire) if (this.isBot(w.a) && (w.b == null || this.isBot(w.b))) this.hostResolveDuel(w);
      clearTimeout(H.duelTimer);
      const D = H.duels;
      D.locks = {};
      H.duelTimer = setTimeout(() => { if (H.duels === D) this.hostFireDuels(D, true); }, (CFG().duelIntroSeconds + 2.5) * 1000);
      this.hostCheckReady();
    },
    // Start every duel whose players have all locked in (force: whoever hasn't answered goes in as last seen)
    hostFireDuels(D, force) {
      for (const w of D.wire) {
        if (D.done[w.a]) continue;
        const humans = [w.a, w.b].filter(sl => sl != null && !this.isBot(sl));
        if (!force && !humans.every(sl => D.locks[sl])) continue;
        D.done[w.a] = true; if (w.b != null) D.done[w.b] = true;
        const pair = this.duelPair(w);
        const spec = G.Tournament.pvpSpec(pair.a, pair.b);
        this.recFight('duels', { room: this.H.room, a: w.a, b: w.b, ghostOf: w.ghostOf }, G.Tournament.pvpFrom(spec, w.seed), spec);
        // The host settles the bots' side; each player's own game settles theirs from the same fight
        if (w.a !== this.mySlot && w.b !== this.mySlot && (this.isBot(w.a) || (w.b != null && this.isBot(w.b)))) G.Duel.resolve(pair, G.Tournament.pvpFrom(spec, w.seed), this.H.room);
        this.cast({ t: 'duelFight', room: D.room, w, spec });
      }
    },
    sendDuelLock() {
      const msg = { t: 'duelLock', slot: this.mySlot, room: G.Game.s.room, hero: this.mySnapWire() };
      this.isHost ? this.onDuelLock(msg) : this.send(msg);
    },
    onDuelLock(m) {
      const H = this.H;
      if (!H || !H.duels || H.duels.room !== m.room) return;
      if (m.slot !== this.mySlot) this.takeSnap(m.slot, m.hero);
      H.duels.locks[m.slot] = true;
      this.hostFireDuels(H.duels, false);
    },
    onDuelFight(m) {
      const s = G.Game.s;
      if (!s || s.room !== m.room) return;
      if (m.w.a === this.mySlot || m.w.b === this.mySlot) G.Game.mpDuelFight(m.spec, m.w, m.res || null);
    },
    hostResolveDuelsFor(slot) {
      for (const w of this.H.duels.wire) if ((w.a === slot || w.b === slot) && !this.H.duels.done[w.a]) this.hostResolveDuel(w);
    },
    hostResolveDuel(w) {
      const H = this.H;
      H.duels.done[w.a] = true; if (w.b != null) H.duels.done[w.b] = true;
      const pair = this.duelPair(w);
      const res = G.Duel.simulate(pair, H.rng);
      this.recFight('duels', { room: H.room, a: w.a, b: w.b, ghostOf: w.ghostOf }, res, null);
      G.Duel.resolve(pair, res, H.room);
    },
    // Build a duel pair from the wire, with fight-start health
    duelPair(w, heroes) {
      heroes = heroes || this.heroes;
      const A = heroes[w.a];
      const a = { hero: A, hp: G.Hero.maxHp(A) };   // duels are fought at full health
      let b;
      if (w.ghostOf != null) b = G.Tournament.ghostOf(heroes[w.ghostOf]);
      else { const B = heroes[w.b]; b = { hero: B, hp: G.Hero.maxHp(B) }; }
      return { a, b, ghost: w.ghostOf != null, seed: w.seed };
    },
    onDuels(m) {
      if (!this.isHost) for (const slot in m.heroes) this.takeSnap(+slot, m.heroes[slot]);
      const s = G.Game.s;
      if (!s || s.room !== m.room) return;
      if (!s.player.alive) { update(); return; }
      if (this.serverMode && s.duel && s.duel.room === m.room && s.phase !== 'waiting') return;   // already have these pairings
      const w = m.pairs.find(p => p.a === this.mySlot || p.b === this.mySlot);
      G.Game.mpDuel(w || null, !!w && w.b === this.mySlot);
    },
    // "I'm going in": your hero as it enters the duel (after any potions on the duel card)
    sendDuelGo() {
      const msg = { t: 'duelGo', slot: this.mySlot, room: G.Game.s.room, hero: this.mySnapWire() };
      this.isHost ? this.cast(msg) : this.send(msg);
    },
    onDuelGo(m) {
      this.duelGo = this.duelGo || {};
      this.duelGo[m.slot] = { room: m.room };
      if (m.slot !== this.mySlot) {
        if (this.isHost && this.isBot(m.slot)) { /* the host's own bot copy is the real one */ } else this.takeSnap(m.slot, m.hero);
      }
      const H = this.H;
      if (H && H.duels && H.duels.room === m.room) {
        const w = H.duels.wire.find(p => p.a === m.slot || p.b === m.slot);
        const other = w && (w.a === m.slot ? w.b : w.a);
        if (w && !H.duels.done[w.a] && other != null && this.isBot(other) && m.slot !== this.mySlot) this.hostResolveDuel(w);
      }
      G.Game.mpDuelGoArrived(m.slot, m.room);
    },

    // ---------- Tournament ----------
    hostStartTournament() {
      const H = this.H;
      const field = this.players.map(p => this.heroes[p.slot]).filter(h => h.alive);
      if (H.rec) H.rec.builds[30] = this.allBuilds();
      const T = G.Tournament.create(field, H.rng.fork());
      H.tour = { T, waiting: null };
      this.hostTourBreak(CFG().tourBreakSeconds + CFG().tourIntroExtra);
    },
    // A player drank a potion during a tournament break: their health and buffs go into the next fight
    hostTourUse(m) {
      const H = this.H;
      if (!H.tour || H.tour.waiting) return;
      const e = H.tour.T.entrants.find(x => x.hero.slot === m.slot);
      if (!e) return;
      e.hp = Math.max(1, Math.min(e.maxHp, m.hp));
      if (m.slot !== this.mySlot) { e.hero.buffs = m.hero.buffs || {}; e.hero.bag = m.hero.bag || []; }
      const left = Math.max(0, (H.tour.breakEnds || now()) - now());
      this.cast({ t: 'tour', state: this.tourWire(H.tour.T), phase: 'break', ms: left, heroes: this.allWire() });
    },
    sendTourUse(hp) {
      const msg = { t: 'tourUse', slot: this.mySlot, hp, hero: this.mySnapWire() };
      this.isHost ? this.hostTourUse(msg) : this.send(msg);
    },
    hostTourBreak(secs) {
      const H = this.H, T = H.tour.T;
      H.tour.breakEnds = now() + secs * 1000;
      if (T.champion) { this.cast({ t: 'tour', state: this.tourWire(T), phase: 'done' }); this.hostSaveMatch(T); return; }
      this.cast({ t: 'tour', state: this.tourWire(T), phase: 'break', ms: secs * 1000, heroes: this.allWire() });
      clearTimeout(H.tourTimer);
      H.tourTimer = setTimeout(() => this.hostTourFight(), secs * 1000);
    },
    // A round starts: seeds go out, players watch their fight, then the host settles the whole round
    hostTourFight() {
      const H = this.H, T = H.tour.T;
      const round = G.Tournament.currentRound(T);
      for (const m of round.pairs) if (m.seed == null) m.seed = H.rng.int(0, 1e9);
      H.tour.waiting = {};
      let longest = 0;
      for (const m of round.pairs) {
        for (const e of [m.a, m.b]) if (e && e.hero && !this.isBot(e.hero.slot) && e.hero.alive) H.tour.waiting[e.hero.slot] = true;
        this.hostFreshen(m.a); if (!m.ghost) this.hostFreshen(m.b);
        m._spec = G.Tournament.pvpSpec(m.a, m.b);   // frozen: every screen plays exactly this
        const res = G.Tournament.pvpFrom(m._spec, m.seed); m._res = res;
        longest = Math.max(longest, Math.min(res.duration, 10) + Math.max(0, res.duration - 10) / 2);
      }
      this.cast({ t: 'tour', state: this.tourWire(T), phase: 'fight', heroes: this.allWire() });
      clearTimeout(H.tourTimer);
      H.tourTimer = setTimeout(() => { H.tour.waiting = {}; this.hostTourMaybeResolve(); }, (longest + 12) * 1000);
    },
    // A player's latest gear, bag and buffs onto their tournament entry (hearts stay the host's)
    hostFreshen(e) {
      if (!e || !e.hero || this.isBot(e.hero.slot) || e.hero.slot === this.mySlot) return;
      const h = this.heroes[e.hero.slot];
      if (!h || h === e.hero) return;
      for (const k of ['gear', 'bag', 'relics', 'buffs', 'level', 'xp', 'bonus', 'gold', 'spec', 'treePicks', 'gem']) if (h[k] !== undefined) e.hero[k] = JSON.parse(JSON.stringify(h[k]));
    },
    hostTourDone(slot) { const H = this.H; if (H && H.tour && H.tour.waiting) { delete H.tour.waiting[slot]; this.hostTourMaybeResolve(); } },
    hostTourMaybeResolve() {
      const H = this.H, W = H.tour.waiting;
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
      // A Plunder between rounds (not after the final)
      if (T.champion || G.Tournament.alive(T).length < 2) { this.hostTourBreak(CFG().tourBreakSeconds); return; }
      this.cast({ t: 'tour', state: this.tourWire(T), phase: 'plunder', heroes: this.allWire() });
      this.hostStartTourPlunder(round.n);
    },
    hostStartTourPlunder(n) {
      const H = this.H, T = H.tour.T;
      const ents = T.entrants.filter(e => !e.out);
      const th = e => (e.hero.spec === 'treasureHunter' ? 0 : 1);
      const order = ents.slice().sort((a, b) => th(a) - th(b) || a.hero.hearts - b.hero.hearts || a.hp / a.maxHp - b.hp / b.maxHp).map(e => e.hero.slot);
      const S = CFG().shop;
      H.plunder = { room: H.room, tour: n, table: G.Loot.shopTable(30, ents.length + 1, H.rng, { tome: true }), order, turn: 0, picks: {},
        reviewEnds: now() + S.tourReviewSeconds * 1000, turnEnds: 0, seq: 0, last: null, done: false };
      this.hostPlunderCast();
      clearInterval(H.plunderTimer);
      H.plunderTimer = setInterval(() => this.hostPlunderTick(), 250);
    },
    // The tournament on the wire: slots instead of hero objects
    tourWire(T) {
      const slotOf = e => (e && e.hero ? e.hero.slot : null);
      return {
        entrants: T.entrants.map(e => ({ slot: e.hero.slot, hp: e.hp, maxHp: e.maxHp, out: e.out, place: e.place, before: e.before, heal: e.heal, hearts: e.hero.hearts })),
        rounds: T.rounds.map(r => ({ n: r.n, pairs: r.pairs.map(m => ({
          a: slotOf(m.a), b: m.ghost ? null : slotOf(m.b), ghostOf: m.ghost ? m.b.of.slot : null, seed: m.seed,
          result: m.result ? { winner: m.result.winner, draw: !!m.result.draw, aHp: m.result.aHp, bHp: m.result.bHp, duration: m.result.duration } : null,
          winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : null, draw: !!m.draw, suddenDeath: !!m.suddenDeath, rageHeal: m.rageHeal || 0,
          lostHearts: (m.lostHearts || []).map(slotOf), snap: m.snap || null, spec: !m.result && m._spec ? m._spec : null,
        })) })),
        champion: T.champion ? T.champion.hero.slot : null,
      };
    },
    tourFromWire(w, heroes) {
      heroes = heroes || this.heroes;
      const ent = {};
      const entrants = w.entrants.map(e => (ent[e.slot] = { hero: heroes[e.slot], hp: e.hp, maxHp: e.maxHp, out: e.out, place: e.place, before: e.before, heal: e.heal, power: 0 }));
      const rounds = w.rounds.map(r => ({ n: r.n, pairs: r.pairs.map(p => {
        const a = ent[p.a], b = p.ghostOf != null ? G.Tournament.ghostOf(heroes[p.ghostOf]) : ent[p.b];
        const m = { a, b, ghost: p.ghostOf != null, seed: p.seed, result: p.result, draw: p.draw, suddenDeath: p.suddenDeath, rageHeal: p.rageHeal, snap: p.snap, spec: p.spec || null, res: p.res || null };
        m.winner = p.winner === 'a' ? a : p.winner === 'b' ? b : null;
        m.lostHearts = (p.lostHearts || []).map(sl => ent[sl]).filter(Boolean);
        m.lostHeart = m.lostHearts[0] || null;
        return m;
      }) }));
      return { entrants, rounds, champion: w.champion != null ? ent[w.champion] : null, lastOpp: {}, mp: true };
    },
    onTour(m) {
      if (m.heroes && !this.isHost) for (const slot in m.heroes) this.takeSnap(+slot, m.heroes[slot]);
      const s = G.Game.s;
      if (!s) return;
      // Hearts in the tournament come from the host, for everyone
      for (const e of m.state.entrants) {
        const h = this.heroes[e.slot];
        if (!h || (this.isHost && e.slot !== this.mySlot)) continue;
        h.hearts = e.hearts; if (e.hearts <= 0) h.alive = false;
      }
      this.lastTourWire = m.state;
      G.Game.mpTour(this.tourFromWire(m.state), m.phase, m.ms || 0);
    },
    // ---------- Match database ----------
    // One record per match, saved by the host when the tournament ends (see tools/supabase-matches.sql)
    buildOf(h) {
      if (!h) return null;
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
    },
    allBuilds() { const o = {}; for (const p of this.players) o[p.slot] = this.buildOf(this.heroes[p.slot]); return o; },
    recFight(kind, who, res, spec) {
      const R = this.H && this.H.rec;
      if (!R || !res) return;
      const st = x => x && { maxHp: x.maxHp, dmg: x.dmg, spd: x.spd, armor: x.armor, ward: x.ward, crit: x.crit, dodge: x.dodge, shield: x.shield, spec: x.spec, gem: x.gem, artifact: x.artifact, weaponType: x.weaponType };
      R[kind].push({ ...who, winner: res.draw ? 'draw' : res.winner, duration: res.duration,
        aHp: spec ? spec.aHp : null, bHp: spec ? spec.b.hp : null, aStats: spec ? st(spec.sa) : null, bStats: spec ? st(spec.b.s) : null });
    },
    hostSaveMatch(T) {
      const H = this.H, R = H && H.rec;
      if (!R || R.saved) return;
      R.saved = true;
      // Final builds: tournament entrants as they fought, everyone else as last seen
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
        version: G.VERSION, started: R.started, ended: new Date().toISOString(),
        players: this.players.map(p => ({ slot: p.slot, name: p.botWas || p.name, bot: !!p.bot && !p.botWas, droppedOrKicked: !!p.botWas, kicked: !!p.kicked })),
        bosses: [8, 18, 28].map(r => { const b = G.Dungeon.monsterFor(r, 'boss'); return b ? b.id : null; }),
        champion: T.champion ? { slot: T.champion.hero.slot, name: T.champion.hero.name } : null,
        builds: { ...R.builds, final: finals }, duels: R.duels, tournament: R.tour,
      };
      const row = { version: G.VERSION, room_code: this.code, players: humans.length, bots: this.players.length - humans.length,
        champion: data.champion ? data.champion.name : null, data };
      this.saveStatus = 'saving';
      G.Net.saveMatch(row).then(() => { this.saveStatus = 'saved'; update(); }).catch(err => { this.saveStatus = 'failed: ' + (err && err.message || err); console.warn('Match not saved', err); update(); });
    },

    // ---------- Live spectating ----------
    // Click the eye next to a player: you see their game as they see it, live, without being able to touch it.
    // The watched player's game sends its screen state (only while someone watches); fights replay from their inputs.
    watching: null, watchers: {}, views: {},
    startWatching(slot) {
      if (!this.inMatch() || slot === this.mySlot) return this.stopWatching();
      this.watching = slot;
      const msg = { t: 'watch', slot: this.mySlot, target: slot };
      this.send(msg); this.onWatch({ ...msg }, true);
      G.UI.watchChanged();
    },
    stopWatching(silent) {
      if (this.watching == null) return;
      this.watching = null;
      const msg = { t: 'watch', slot: this.mySlot, target: null };
      this.send(msg); this.onWatch({ ...msg }, true);
      if (!silent) G.UI.watchChanged();
    },
    onWatch(m, silent) {
      for (const k in this.watchers) this.watchers[k].delete(m.slot);
      if (m.target != null) (this.watchers[m.target] = this.watchers[m.target] || new Set()).add(m.slot);
      if (m.target === this.mySlot) this.sendView(true);
      if (silent) return;
      if (G.UI.watchBadge && document.getElementById('watch-badge')) G.UI.watchBadge(); else if (G.Game.s && G.Game.s.phase !== 'battle') update();
    },
    watchedBy() { return [...(this.watchers[this.mySlot] || [])].map(sl => this.player(sl)).filter(Boolean); },
    // Your screen, for whoever is watching you
    viewState() {
      const s = G.Game.s, n = now(), st = {};
      for (const k of ['phase', 'room', 'roundKind', 'notice', 'bagMsg', 'doors', 'door', 'offer', 'spoils', 'spoilsText', 'armory', 'merchant', 'forge',
        'mystery', 'wagerBet', 'specOptions', 'treeLevel', 'gemOptions', 'shopMsg', 'tourPhase', 'roundTotal']) if (s[k] !== undefined) st[k] = s[k];
      st.roundMs = s.roundEnds ? Math.max(0, s.roundEnds - n) : 0;
      if (s.shop) st.shop = { ...s.shop, reviewMs: s.shop.reviewUntil - n, turnMs: n - s.shop.turnStart };
      if (s.duel) st.duel = { w: s.duel.w, mirrored: s.duel.mirrored, goSent: s.duel.goSent, pairs: [] };
      if (s.battle) st.battle = { title: s.battle.title, kind: s.battle.kind, duel: !!s.battle.duel, tour: !!s.battle.tour, done: !!s.battle.done };
      st.player = heroWire(s.player);
      return JSON.parse(JSON.stringify(st));
    },
    sendView(force) {
      if (!this.inMatch() || !G.Game.s || !(this.watchers[this.mySlot] && this.watchers[this.mySlot].size)) return;
      const t = now();
      if (!force && this._viewAt && t - this._viewAt < 250) { clearTimeout(this._viewTimer); this._viewTimer = setTimeout(() => this.sendView(true), 260); return; }
      this._viewAt = t;
      this.send({ t: 'view', slot: this.mySlot, state: this.viewState() });
    },
    onView(m) {
      this.views[m.slot] = { state: m.state, at: now() };
      if (this.watching === m.slot && G.UI.refreshWatchPop) G.UI.refreshWatchPop();
    },

    // ---------- Spectating ----------
    // Every fight you play is sent out as its exact inputs; anyone watching you replays it.
    watch: null, lastFight: {},
    // meta.res: a finished fight from the server (player fights); watchers play it back as it is
    sendFight(meta) {
      if (!this.inMatch() || (!meta.res && !G._lastArgs)) return;
      const me = this.heroes[this.mySlot];
      this.send({ t: 'fight', slot: this.mySlot, room: G.Game.s.room, ...(meta.res ? { res: meta.res } : { args: JSON.parse(JSON.stringify(G._lastArgs)) }), at: now(),
        title: meta.title, names: meta.names || { a: me.name }, visual: meta.visual, mirror: !!meta.mirror });
    },
    onFight(m) {
      this.lastFight[m.slot] = m;
      if (this.watch === m.slot && G.UI.playSpectate) G.UI.playSpectate(m);
      if (this.watching === m.slot && G.UI.refreshWatchPop) G.UI.refreshWatchPop();
    },
    sendTourDone() { const msg = { t: 'tourDone', slot: this.mySlot }; if (this.isHost) this.hostTourDone(this.mySlot); else this.send(msg); },
  };

  G.MP = MP;
  window.addEventListener('beforeunload', () => { if (MP.t) MP.send({ t: 'bye', cid: MP.cid }); });
  // Coming back to the tab: say hello right away (background tabs ping less often)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && MP.t) MP.send({ t: 'ping', cid: MP.cid }); });
})(window.G);
