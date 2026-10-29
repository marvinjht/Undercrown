// Server matches (stage 2): your game runs on the server, in your "twin" (server/twin.js). This page only
//   - sends your button presses to it (act), and
//   - shows the state it sends back (state): the same G.Game.s and G.MP fields the screens always read.
// So nothing you change in your browser can change your hero. Single player and player-hosted rooms don't use this.
window.G = window.G || {};

(function (G) {
  // Button presses that go to the server instead of running here
  const ACTIONS = ['chooseDoor', 'pickWeapon', 'takeItem', 'takeGold', 'takeSpoils', 'mysteryAct', 'chooseSpec', 'chooseTree', 'chooseGem',
    'placeBet', 'forgeAct', 'leaveForge', 'startDuelFight', 'useBag', 'sellBag', 'dyeItem', 'dyeClass', 'dyeCancel',
    'playerShopPick', 'playerShopPass', 'shopBuy', 'leaveMerchant', 'seeEnding', 'markActive'];
  // Things the room used to tell this page's game; the twin handles them now
  const SILENT = ['mpRoom', 'mpPlunder', 'mpDuel', 'mpTryDuelFight', 'mpDuelGoArrived', 'mpTour', 'mpTourBattle', 'mpDuelFight', 'forceSkip'];
  // Messages this page's MP would have sent for your hero: the twin sends them now
  const MP_SILENT = ['sendSnap', 'sendReady', 'sendPick', 'sendDuelLock', 'sendDuelGo', 'sendTourUse', 'sendTourDone', 'sendFight', 'sendView'];

  const isRef = v => v && typeof v === 'object' && typeof v.$hero === 'string' && Object.keys(v).length === 1;

  const Remote = {
    on: false, saved: null, skew: 0,

    // A server match starts: from here, G.Game only mirrors the twin
    begin() {
      if (this.on) return;
      const Game = G.Game, MP = G.MP;
      this.on = true; this.saved = { game: {}, mp: {} };
      for (const k of ACTIONS) { this.saved.game[k] = Game[k]; Game[k] = (...args) => this.act(k, args); }
      for (const k of SILENT) { this.saved.game[k] = Game[k]; Game[k] = () => {}; }
      this.saved.game.tick = Game.tick;
      Game.tick = () => {   // the clock lives on the server; only flip the Plunder review here so the screen keeps up
        const s = Game.s;
        if (s && s.phase === 'shop' && s.shop && s.shop.reviewUntil && !s.shop.reviewDone && Date.now() >= s.shop.reviewUntil) { s.shop.reviewDone = true; s.shop.turnStart = Date.now(); G.UI.refreshShopPicks(); }
      };
      for (const k of MP_SILENT) { this.saved.mp[k] = MP[k]; MP[k] = () => {}; }
      for (const k of ['startWatching', 'stopWatching', 'sendSkipVote']) this.saved.mp[k] = MP[k];
      MP.startWatching = slot => { if (!MP.inMatch() || slot === MP.mySlot) return MP.stopWatching(); MP.watching = slot; this.act('startWatching', [slot], true); G.UI.watchChanged(); };
      MP.stopWatching = silent => { if (MP.watching == null) return; MP.watching = null; this.act('stopWatching', [true], true); if (!silent) G.UI.watchChanged(); };
      MP.sendSkipVote = () => this.act('sendSkipVote', [], true);
      this.first = true;
    },
    // Back to the lobby or the title: G.Game is the local game again
    end() {
      if (!this.on) return;
      const Game = G.Game, MP = G.MP;
      for (const k in this.saved.game) Game[k] = this.saved.game[k];
      for (const k in this.saved.mp) MP[k] = this.saved.mp[k];
      this.on = false; this.saved = null;
    },

    act(fn, args, mp) {
      const MP = G.MP;
      if (!MP.t) return;
      if (fn === 'markActive') { const s = G.Game.s, r = s && s.room; if (this.activeRoom === r) return; this.activeRoom = r; }   // once a room is enough
      MP.send({ t: 'act', fn, args: args || [], mp: !!mp });
    },

    // The twin's state (only what changed, or everything when full)
    onState(m) {
      const Game = G.Game, MP = G.MP;
      this.skew = Date.now() - m.now;
      if (m.full || this.first || !Game.s) { Game.s = { player: {} }; MP.heroes = {}; this.first = false; }
      const s = Game.s, prevPhase = s.phase;
      // Heroes come field by field (only what changed); $gone lists fields that went away
      const patch = (h, p) => { if (!p) return h; for (const f of p.$gone || []) delete h[f]; for (const f in p) if (f !== '$gone') h[f] = p[f]; return h; };
      // Everyone else's heroes first (the state points at them)
      MP.heroes = MP.heroes || {};
      for (const sl in m.heroes) { const old = MP.heroes[sl]; MP.heroes[sl] = patch(old && old !== s.player ? old : {}, m.heroes[sl]); }
      patch(s.player, m.me);
      for (const k in m.mp) {
        if (k === 'watchers') { MP.watchers = {}; for (const sl in m.mp.watchers) MP.watchers[sl] = new Set(m.mp.watchers[sl]); }
        else if (k === 'views' || k === 'lastFight') MP[k] = Object.assign(m.full || !MP[k] ? {} : MP[k], m.mp[k]);   // only the players that changed
        else MP[k] = m.mp[k];
      }
      if (m.s.battle && m.s.battle.res === '$same') m.s.battle.res = s.battle ? s.battle.res : null;   // the fight we already have
      for (const k in m.s) s[k] = m.s[k];
      for (const k of m.del || []) delete s[k];
      MP.heroes[MP.mySlot] = s.player;
      s.rivals = (MP.players || []).filter(p => p.slot !== MP.mySlot).map(p => MP.heroes[p.slot]).filter(Boolean);
      // Heroes arrive as { $hero: id }: point them at our copies
      const heroOf = id => (id === s.player.id ? s.player : MP.heroes[+String(id).slice(1)] || null);
      const fix = (v, depth) => {
        if (!v || typeof v !== 'object' || depth > 12) return v;
        if (isRef(v)) return heroOf(v.$hero);
        for (const k of Object.keys(v)) {
          if (k === 'events' || k === 'tracks' || k === 'player') continue;
          const x = v[k];
          if (x && typeof x === 'object') { const y = fix(x, depth + 1); if (y !== x) v[k] = y; }
        }
        return v;
      };
      for (const k in m.s) if (k !== 'player') s[k] = fix(s[k], 0);
      // Server times to this page's clock
      const sk = this.skew;
      if ('roundEnds' in m.s && s.roundEnds) s.roundEnds += sk;
      if (m.s.shop && s.shop) { if (s.shop.reviewUntil) s.shop.reviewUntil += sk; if (s.shop.turnStart) s.shop.turnStart += sk; }
      if (m.s.goldPop && s.goldPop) s.goldPop.at += sk;
      if ('fanfarePlayed' in m.s && s.fanfarePlayed) s.fanfareAt = performance.now();
      // A fight to play: when it's over here, tell the server
      if (m.s.battle && s.battle) { const b = s.battle; b.onDone = () => { if (!b._ended) { b._ended = true; this.act('battleEnd', []); } }; }
      if (G.Supply && s.player.gear) G.Supply.reset([s.player, ...s.rivals]);
      for (const [name, vol] of m.sounds || []) if (G.Sound) G.Sound.play(name, vol);
      // Redraw. A fight that's playing keeps playing.
      if (prevPhase === 'battle' && s.phase === 'battle' && !m.s.battle) G.UI.update();
      else G.UI.render();
    },
  };
  G.Remote = Remote;
})(window.G);
