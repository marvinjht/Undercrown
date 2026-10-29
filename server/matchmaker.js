// Matchmaking (stage 3): "Find a match" puts a player in one shared queue. The server starts a match when
//   - the queue reaches CONFIG.matchmaking.maxPlayers (8): right away, or
//   - 2 or more have waited waitSeconds since the second one joined: everyone queued goes in, or
//   - one player has waited soloWaitSeconds alone: they start with bots.
// Bots fill seats up to 6, as in any room. The match is an ordinary room (room.js), marked matched.
'use strict';
const now = () => Date.now();

class Matchmaker {
  // makeRoom(): a new room (registered with the server); cfg(): the matchmaking numbers
  constructor(makeRoom, cfg) {
    this.q = [];            // [{ cid, name, sock, bind, at }]
    this.groupAt = 0;       // when the queue reached 2 players
    this.makeRoom = makeRoom; this.cfg = cfg;
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { console.error('matchmaker', e); } }, 1000);
  }
  has(cid) { return this.q.some(e => e.cid === cid); }
  add(cid, name, sock, bind) {
    this.q = this.q.filter(e => e.cid !== cid);
    this.q.push({ cid, name: String(name || 'Player').slice(0, 14), sock, bind, at: now() });
    this.tick();
  }
  remove(cid) {
    const before = this.q.length;
    this.q = this.q.filter(e => e.cid !== cid);
    if (this.q.length !== before) { if (this.q.length < 2) this.groupAt = 0; this.cast(); }
  }
  // Time left before the queue starts a match (ms), or null
  left() {
    const C = this.cfg(), n = now(), q = this.q;
    if (!q.length) return null;
    if (q.length >= 2) return Math.max(0, this.groupAt + C.waitSeconds * 1000 - n);
    return Math.max(0, q[0].at + C.soloWaitSeconds * 1000 - n);
  }
  tick() {
    const C = this.cfg(), q = this.q;
    if (q.length >= 2 && !this.groupAt) this.groupAt = now();
    if (q.length < 2) this.groupAt = 0;
    if (q.length >= C.maxPlayers) { this.launch(q.splice(0, C.maxPlayers)); return this.tick(); }
    if (q.length && this.left() <= 0) { this.launch(q.splice(0, q.length)); this.groupAt = 0; }
    this.cast();
  }
  cast() {
    const ms = this.left(), text = JSON.stringify({ t: 'queue', n: this.q.length, ms, max: this.cfg().maxPlayers, from: 'server' });
    for (const e of this.q) { try { e.sock.send(text); } catch (err) { /* gone */ } }
  }
  // A match for this group: a new room, everyone seated, started at once
  launch(group) {
    const room = this.makeRoom();
    room.lobby.matched = true;
    for (const e of group) { e.bind(room); room.attach(e.cid, e.sock); room.join(e.cid, e.name); }
    room.start(group[0].cid);
  }
  dispose() { clearInterval(this.timer); }
}

module.exports = { Matchmaker };
