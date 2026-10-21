// Network transports for multiplayer rooms. Both do the same thing: everyone in a room hears every message
// anyone else sends (never their own). The game logic in src/mp.js doesn't care which one is used.
//   local:    BroadcastChannel, between tabs of the same browser (for testing on one machine)
//   supabase: Supabase Realtime broadcast, for real play over the internet (loads supabase-js on demand)
window.G = window.G || {};

(function (G) {
  const SUPABASE = {
    url: 'https://nlzkkrvnjagfzcrukdgl.supabase.co',
    key: 'sb_publishable_vXjVdjPqtc5MaR81_5KHsg_BY8GTGQ_',   // publishable: safe in browser code
    lib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js',
  };

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

  // ?net=local in the address forces tab-to-tab mode (testing); otherwise online
  function mode() {
    try { return new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'supabase'; } catch (e) { return 'supabase'; }
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
    mode, saveMatch,
    connect(code, onMessage) {
      return mode() === 'local' ? localTransport(code, onMessage) : supabaseTransport(code, onMessage);
    },
  };
})(window.G);
