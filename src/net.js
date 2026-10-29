// Network transports for multiplayer rooms.
//   server:   the Undercrown game server (server/ folder). It hosts the room and runs every player fight, so
//             every screen sees the same thing. This is the default once SERVER_URL is set.
//   supabase: Supabase Realtime broadcast between players' games, with the room creator's game as the host
//             (the older way; ?net=p2p forces it).
//   local:    BroadcastChannel between tabs of one browser, host in a tab (testing; ?net=local).
// For supabase and local, everyone in a room hears every message anyone else sends (never their own).
// For server, the server decides who hears what (docs/PROTOCOL.md).
window.G = window.G || {};

(function (G) {
  const SUPABASE = {
    url: 'https://nlzkkrvnjagfzcrukdgl.supabase.co',
    key: 'sb_publishable_vXjVdjPqtc5MaR81_5KHsg_BY8GTGQ_',   // publishable: safe in browser code
    lib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js',
  };

  // The game server's address once it's online (for example 'https://undercrown.onrender.com'). Empty = no server yet.
  // ?server=<address> in the page address overrides it (testing), and a page served by the game server itself
  // always uses that server.
  const SERVER_URL = 'https://undercrown-e04u.onrender.com';

  function serverUrl() {
    try {
      const q = new URLSearchParams(location.search).get('server');
      if (q) return q.replace(/\/+$/, '');
      if (window.UNDERCROWN_SERVED) return location.origin;   // set by the server's own copy of the game
    } catch (e) { /* no location */ }
    return SERVER_URL.replace(/\/+$/, '');
  }
  const wsUrl = u => u.replace(/^http/, 'ws') + '/ws';

  // The game server over a WebSocket. If the connection drops, it reconnects and says hello again (onReconnect),
  // so a hiccup in the middle of a match doesn't lose your seat.
  function serverTransport(onMessage, onReconnect, onLost) {
    const url = wsUrl(serverUrl());
    return new Promise((resolve, reject) => {
      let ws = null, settled = false, closedByUs = false, tries = 0;
      const queue = [];
      const t = {
        kind: 'server',
        send(msg) { const s = JSON.stringify(msg); if (ws && ws.readyState === 1) ws.send(s); else queue.push(s); },
        close() { closedByUs = true; try { ws && ws.close(); } catch (e) { /* gone */ } },
        get raw() { return ws; },   // tests: drop the connection on purpose
      };
      const open = () => {
        ws = new WebSocket(url);
        ws.onopen = () => {
          const again = tries > 0; tries = 0;
          if (again && onReconnect) onReconnect();
          while (queue.length && ws.readyState === 1) ws.send(queue.shift());
          if (!settled) { settled = true; resolve(t); }
        };
        ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMessage(m); };
        ws.onclose = () => {
          if (closedByUs) return;
          if (!settled && tries >= 3) { settled = true; reject(new Error('Could not reach the game server. It may be waking up: wait half a minute and try again.')); return; }
          if (settled && tries > 40) { if (onLost) onLost(); return; }   // about 2 minutes of trying
          tries++;
          setTimeout(open, Math.min(4000, 500 * tries));
        };
      };
      open();
      // A sleeping free server can take up to a minute to wake up
      setTimeout(() => { if (!settled) { settled = true; reject(new Error('The game server didn’t answer in time. It may be waking up: try again in a moment.')); } }, 75000);
    });
  }
  // Nudge a sleeping server awake (the title screen calls this; harmless if it's already up)
  function wake() {
    const u = serverUrl();
    if (!u || mode() !== 'server') return Promise.resolve(false);
    return fetch(u + '/health', { cache: 'no-store' }).then(r => r.ok).catch(() => false);
  }

  // Tabs on one machine
  function localTransport(code, onMessage) {
    const ch = new BroadcastChannel('undercrown-' + code);
    ch.onmessage = e => onMessage(e.data);
    return Promise.resolve({ kind: 'local', send: msg => ch.postMessage(msg), close: () => ch.close() });
  }

  let libPromise = null;
  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SUPABASE.lib; s.async = true;
      s.onload = () => (window.supabase ? resolve(window.supabase) : reject(new Error('Supabase library did not load')));
      s.onerror = () => { libPromise = null; reject(new Error('Could not download the Supabase library')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  // Over the internet. Messages sent before the channel is ready wait in a queue.
  function supabaseTransport(code, onMessage) {
    return loadSupabase().then(lib => new Promise((resolve, reject) => {
      const client = lib.createClient(SUPABASE.url, SUPABASE.key, { realtime: { params: { eventsPerSecond: 40 } } });
      const ch = client.channel('undercrown-' + code, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'm' }, ({ payload }) => onMessage(payload));
      let ready = false, settled = false;
      const queue = [];
      const t = {
        kind: 'supabase',
        send(msg) {
          if (!ready) { queue.push(msg); return; }
          ch.send({ type: 'broadcast', event: 'm', payload: msg }).catch(err => console.warn('send failed', err));
        },
        close() { try { client.removeChannel(ch); } catch (e) { /* already gone */ } },
      };
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          ready = true;
          while (queue.length) t.send(queue.shift());
          if (!settled) { settled = true; resolve(t); }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true; reject(new Error('Could not connect to the room (' + status.toLowerCase().replace('_', ' ') + ')'));
        }
      });
      setTimeout(() => { if (!settled) { settled = true; reject(new Error('Connecting took too long')); } }, 15000);
    }));
  }

  // ?net=local forces tab-to-tab mode (testing), ?net=p2p the older player-hosted online rooms; otherwise the game
  // server when there is one
  function mode() {
    let q = null;
    try { q = new URLSearchParams(location.search).get('net'); } catch (e) { /* no location */ }
    if (q === 'local') return 'local';
    if (q === 'p2p') return 'supabase';
    return serverUrl() ? 'server' : 'supabase';
  }

  // Match database: one row per finished match (insert only; see tools/supabase-matches.sql)
  let dbClient = null;
  function saveMatch(row) {
    if (mode() === 'local') { (window.__savedMatches = window.__savedMatches || []).push(row); return Promise.resolve(); }   // testing
    return loadSupabase().then(lib => {
      dbClient = dbClient || lib.createClient(SUPABASE.url, SUPABASE.key, { auth: { persistSession: false } });
      return dbClient.from('matches').insert(row).then(({ error }) => { if (error) throw new Error(error.message); });
    });
  }

  G.Net = {
    mode, saveMatch, wake, serverUrl,
    connect(code, onMessage, hooks = {}) {
      const m = mode();
      return m === 'server' ? serverTransport(onMessage, hooks.onReconnect, hooks.onLost) : m === 'local' ? localTransport(code, onMessage) : supabaseTransport(code, onMessage);
    },
  };
})(window.G);
