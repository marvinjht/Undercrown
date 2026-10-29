// Undercrown game server.
//   - Serves the game itself (index.html and its files), so the page and the server are always the same version.
//   - /ws: the WebSocket every player's game connects to. Rooms live here; see room.js and docs/PROTOCOL.md.
//   - /health: a tiny "I'm awake" answer. The title screen calls it so a sleeping free-tier server starts waking up.
// No packages needed: node index.js (Node 18 or newer). PORT sets the port (Render sets it for you).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { attach } = require('./ws');
const { Room } = require('./room');
const { ROOT, loadRules } = require('./rules');

const PORT = +process.env.PORT || 8080;
const VERSION = loadRules().VERSION;
const SUPABASE = {   // the match database (insert only); the key is the public "publishable" one the browser uses too
  url: process.env.SUPABASE_URL || 'https://nlzkkrvnjagfzcrukdgl.supabase.co',
  key: process.env.SUPABASE_KEY || 'sb_publishable_vXjVdjPqtc5MaR81_5KHsg_BY8GTGQ_',
};
const SAVE = process.env.SAVE_MATCHES !== '0';   // SAVE_MATCHES=0 keeps matches in memory instead (testing)

const rooms = new Map();   // code -> Room
const savedLocally = [];

const server = {
  saveMatch(row) {
    if (!SAVE) { savedLocally.push(row); return Promise.resolve(); }
    return fetch(SUPABASE.url + '/rest/v1/matches', {
      method: 'POST',
      headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    }).then(r => { if (!r.ok) return r.text().then(t => { throw new Error(r.status + ' ' + t.slice(0, 200)); }); });
  },
};

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}

// ---------- Static files (the game) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };
const PUBLIC = ['index.html', 'styles.css', 'data/', 'src/', 'assets/', 'lib/'];
function serveFile(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const rel = path.normalize(p).replace(/^[/\\]+/, '');
  if (!PUBLIC.some(x => rel === x || (x.endsWith('/') && rel.startsWith(x)))) { res.writeHead(404); res.end('Not found'); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    // The server's own copy of the game talks to this server
    if (rel === 'index.html') data = Buffer.from(data.toString('utf8').replace('<head>', '<head>\n<script>window.UNDERCROWN_SERVED = 1;</script>'));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const httpServer = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');   // the itch.io build and the claude.ai page call /health from elsewhere
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, version: VERSION, rooms: rooms.size })); return; }
  if (url === '/debug/matches' && !SAVE) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(savedLocally)); return; }
  serveFile(req, res);
});

// ---------- Players' connections ----------
attach(httpServer, '/ws', sock => {
  let room = null, cid = null;
  const reply = msg => sock.send(JSON.stringify({ ...msg, from: 'server' }));
  sock.on('message', text => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!room) {
      // First message: create a room, join one, or come back to one after a dropped connection
      if (m.t !== 'create' && m.t !== 'join' && m.t !== 'rejoin') return;
      if (m.v !== VERSION) { reply({ t: 'version', cid: m.cid, v: VERSION }); return; }
      cid = String(m.cid || '').slice(0, 20);
      if (!cid) return;
      if (m.t === 'create') {
        room = new Room(newCode(), server); rooms.set(room.code, room);
      } else {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { reply({ t: 'joinError', cid, reason: `No room ${String(m.code || '').toUpperCase()} found. Check the code, or ask the host to create it again.` }); return; }
        room = r;
      }
      room.attach(cid, sock);
      const ok = m.t === 'rejoin' && room.lobby.started ? { ok: room.players.some(p => p.cid === cid), reason: 'That match has already started.' } : room.join(cid, m.name);
      if (!ok.ok) { reply({ t: 'joinError', cid, reason: ok.reason }); room.detach(cid, sock); room = null; return; }
      if (room.lobby.started) { reply({ t: 'lobby', lobby: room.lobby }); room.catchUp(cid, m.room); }   // back mid-match: whatever they missed
      return;
    }
    try { room.onMessage(cid, m); } catch (e) { console.error("message", m.t, e); }
  });
  sock.on('close', () => { if (room) room.detach(cid, sock); });
});

// Heartbeat: pings, dropped players, and rooms nobody has been in for a while
setInterval(() => {
  const n = Date.now();
  for (const [code, r] of rooms) {
    if (!r.conns.size && r.emptySince && n - r.emptySince > 10 * 60 * 1000) { r.dispose(); rooms.delete(code); continue; }
    try { r.tick(); } catch (e) { console.error('room', code, e); }
  }
}, 2500);

process.on('uncaughtException', e => console.error('uncaught', e));
httpServer.listen(PORT, () => console.log(`Undercrown server v${VERSION} on port ${PORT}`));
