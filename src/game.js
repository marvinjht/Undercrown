// Single-player run state and actions. Every round is timed; it ends as soon as every player is
// ready (the AI rivals are always ready, so in single player that's as soon as you finish).
// When the clock hits zero, whatever is left is decided automatically, like a server would.
// Fights never count against the clock: the timer for the next choice starts when the fight ends.
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const render = () => G.UI.render();
  const now = () => Date.now();

  // What a hero looks like in fights and in the previews.
  // 4+ pieces of a class: that class's silhouette and color. 4 + 2: a trim ring in the second class's color.
  // 6 pieces: the full look (an aura in the class color).
  function visualFor(hero) {
    const st = G.Stats.sets(hero);
    return {
      look: st.look, trim: st.trim, full: st.full,
      weapon: hero.gear.weapon ? 'weapon_' + hero.gear.weapon.weaponType : null,
      tint: st.look ? G.CLASSES[st.look].tint : hero.tint,
    };
  }
  const say = (s, text) => { s.notice = [s.notice, text].filter(Boolean).join(' '); };

  const Game = {
    s: null,

    newRun() {
      const seed = G.newSeed();
      const rng = new G.RNG(seed);
      const player = G.Hero.create({ name: 'You', isPlayer: true, tint: G.PLAYER_TINT }, rng.fork());
      const rivals = G.RIVALS.map(r => G.Hero.create({ name: r.name, tint: r.tint }, rng.fork()));
      this.s = { seed, rng, player, rivals, room: 1, phase: 'doors', roundKind: 'room', roundEnds: 0, notice: null, bagMsg: null, log: [] };
      G.Supply.reset([player, ...rivals]);
      this.startRoom();
    },
    toTitle() { if (this.mp || (G.MP && G.MP.active)) G.MP.leave(true); this.mp = false; this.s = null; render(); },

    // ---------- Multiplayer (see src/mp.js) ----------
    mp: false,
    startMatch({ seed, player, rivals }) {
      this.mp = true;
      this.s = { seed, rng: new G.RNG(seed), player, rivals, room: 1, phase: 'waiting', roundKind: 'room', roundEnds: 0, notice: null, bagMsg: null, log: [] };
      G.Supply.reset([player, ...rivals]);
      render();
    },
    // The host says room n starts now
    mpRoom(n) {
      const s = this.s;
      s.room = n; s.bagMsg = null; s.specOptions = null;
      if (n > CFG().gemRoom) s.gemOptions = null;
      this.startRoom();
    },
    // Plunder state from the host
    mpPlunder(m) {
      const s = this.s;
      if (!s.player.alive || s.phase === 'battle') return;
      const S = CFG().shop, t = now();
      const turnSlot = m.order[m.turn];
      const picks = {};
      for (const k in m.picks) picks['h' + k] = m.picks[k];
      s.roundKind = 'shop'; s.phase = 'shop'; s.roundEnds = 0;
      s.shop = { table: m.table, order: m.order.map(sl => 'h' + sl), turn: m.turn, picks, mp: true,
        reviewUntil: t + m.reviewMs, reviewDone: m.reviewMs <= 0,
        turnStart: m.turnMs ? t - (S.turnSeconds * 1000 - m.turnMs) : t, msg: s.shopMsg || null, turnSlot };
      if (m.done && !s.shopEnded) { s.shopEnded = true; this.endShop(); return; }
      if (!m.done) s.shopEnded = false;
      render();
    },
    // Your duel pairing from the host (canonical sides; mirrored = you're side b)
    mpDuel(w, mirrored) {
      const s = this.s;
      s.duel = { pairs: [], w, mine: w ? G.MP.duelPair(w) : null, mirrored, goSent: false };
      if (!w) { s.roundKind = 'after'; this.nextStep(); return; }
      s.phase = 'duelIntro'; s.roundKind = 'duel';
      this.startTimer(CFG().duelIntroSeconds);
      render();
    },
    // Fight when both of you have gone in (a bot or ghost opponent is always ready)
    mpTryDuelFight() {
      const s = this.s, d = s.duel;
      if (!d || !d.w || s.phase !== 'duelIntro') return;
      const opp = d.mirrored ? d.w.a : d.w.b;
      const go = G.MP.duelGo && G.MP.duelGo[opp];
      if (d.w.ghostOf != null || G.MP.isBot(opp) || (go && go.room === s.room) || d.forced) { this.mpDuelFight(); return; }
      d.waitingFor = opp;
      clearTimeout(d.waitTimer);
      d.waitTimer = setTimeout(() => { if (this.s === s && s.phase === 'duelIntro' && s.duel === d) { d.forced = true; this.mpDuelFight(); } }, 15000);
      render();
    },
    mpDuelGoArrived(slot, room) {
      const s = this.s, d = s && s.duel;
      if (!d || !d.goSent || s.room !== room || d.waitingFor !== slot) return;
      clearTimeout(d.waitTimer);
      this.mpDuelFight();
    },
    // Tournament state from the host
    mpTour(T, phase, ms) {
      const s = this.s;
      if (s.phase === 'battle' && s.battle && s.battle.tour && !s.battle.done) { s.pendingTour = { T, phase, ms }; return; }
      s.tour = T; s.roundKind = 'tour'; s.tourPhase = phase;
      const round = T.rounds[T.rounds.length - 1];
      // Your result from the last round you fought
      for (let i = T.rounds.length - 1; i >= 0; i--) {
        const m = T.rounds[i].pairs.find(p => p.result && ((p.a && p.a.hero === s.player) || (!p.ghost && p.b && p.b.hero === s.player)));
        if (!m) continue;
        if ((s.tourNoticeRound || 0) < T.rounds[i].n) {
          s.tourNoticeRound = T.rounds[i].n;
          const meA = m.a.hero === s.player, opp = meA ? m.b : m.a, oppName = opp.ghost ? opp.name : opp.hero.name;
          const won = m.winner && m.winner.hero === s.player && !m.draw;
          const me = T.entrants.find(e => e.hero === s.player);
          s.notice = m.draw ? (m.suddenDeath ? 'A full minute and nobody fell. Sudden death: you both keep your last heart.' : `A full minute and nobody fell: you and ${oppName} both lose a heart.`)
            : won ? `You beat ${oppName}. You go on with ${me ? me.hp : '?'} health.` : m.ghost ? `The ${oppName} beat you. No heart lost.`
            : me && me.out ? `${oppName} took your last heart.` : `${oppName} won. You lose a heart (${s.player.hearts} left) and come back at full health.`;
        }
        break;
      }
      if (phase === 'fight') {
        if (s.fanfareRound !== round.n) { s.fanfareRound = round.n; if (G.Sound) G.Sound.play('fanfare', 1); }
        const mine = round.pairs.find(p => !p.result && ((p.a && p.a.hero === s.player) || (!p.ghost && p.b && p.b.hero === s.player)));
        const meE = T.entrants.find(e => e.hero === s.player);
        if (mine && meE && !meE.out) { this.mpTourBattle(mine); return; }
      }
      s.phase = 'tournament';
      if (phase === 'break') this.startTimer(ms / 1000); else s.roundEnds = 0;
      render();
    },
    mpTourBattle(m) {
      const s = this.s;
      const mirrored = !m.ghost && m.b.hero === s.player;
      const res = G.Tournament.pvp(m.a, m.b, null, m.seed);
      const nmB0 = m.ghost ? m.b.name : m.b.hero.name;
      G.MP.sendFight({ title: `Tournament: ${m.a.hero.name} vs ${nmB0}`, names: { a: m.a.hero.name, b0: nmB0 }, visual: { a: visualFor(m.a.hero), b0: m.ghost ? { ...visualFor(m.b.of), ghost: true } : visualFor(m.b.hero) } });
      const nameB = m.ghost ? m.b.name : m.b.hero.name;
      s.battle = {
        tour: true, match: m, res, mirror: mirrored,
        names: { a: mirrored ? m.a.hero.name : 'You', b0: mirrored ? 'You' : nameB },
        title: `Tournament round ${G.Tournament.currentRound(s.tour).n}: You vs ${mirrored ? m.a.hero.name : nameB}`,
        visual: { a: visualFor(m.a.hero), b0: m.ghost ? { ...visualFor(m.b.of), ghost: true } : visualFor(m.b.hero) }, done: false,
        onDone: () => {
          if (s.battle.done) return;
          s.battle.done = true;
          s.player.buffs = {};
          G.MP.sendTourDone();
          s.phase = 'tournament'; s.tourPhase = 'fight'; s.roundEnds = 0;
          s.notice = 'Waiting for the other fights to finish…';
          const p = s.pendingTour; s.pendingTour = null;
          if (p) this.mpTour(p.T, p.phase, p.ms); else render();
        },
      };
      s.phase = 'battle'; s.roundEnds = 0;
      render();
    },
    all() { return [this.s.player, ...this.s.rivals]; },

    // ---------- Timing ----------
    startTimer(seconds) { this.s.roundEnds = now() + seconds * 1000; this.s.roundTotal = seconds; },
    timeLeft() { const s = this.s; return s && s.roundEnds ? Math.max(0, (s.roundEnds - now()) / 1000) : null; },
    tick() {
      const s = this.s;
      if (!s) return;
      if (this.mp && (s.roundKind === 'shop' || s.roundKind === 'tour' || ['waiting', 'duelWait', 'mpEnded', 'dead', 'shop'].includes(s.phase))) {
        if (s.phase === 'shop' && s.shop && s.shop.reviewUntil && !s.shop.reviewDone && now() >= s.shop.reviewUntil) { s.shop.reviewDone = true; s.shop.turnStart = now(); G.UI.refreshShopPicks(); }
        return;
      }
      if (s.phase === 'shop') this.shopTick();
      if (!s.roundEnds || now() < s.roundEnds) return;
      s.roundEnds = 0;
      if (s.roundKind === 'tour') this.tourStep();
      else if (s.roundKind === 'shop') this.shopTimeUp();
      else this.timeUp();
    },

    // ---------- Hearts ----------
    // Vulture's Heart heals whenever a rival loses a heart
    heartsSnapshot() { return Object.fromEntries(this.all().map(h => [h.id, h.hearts])); },
    afterHeartLoss(before) {
      const s = this.s;
      for (const h of this.all()) {
        const lost = (before[h.id] || 0) - h.hearts;
        if (lost <= 0) continue;
        for (const v of this.all()) {
          if (v === h || !v.alive || v.gem !== 'vulture') continue;
          const got = G.Hero.vultureFeed(v, lost);
          if (v.isPlayer) say(s, `${h.name} lost a heart. Vulture’s Heart: +${CFG().vultureHeal * lost} max health${got ? `, healed ${got}` : ''}.`);
        }
      }
    },
    playerOut(text) {
      const s = this.s;
      s.phase = 'dead'; s.roundEnds = 0;
      s.notice = text;
      if (this.mp) G.MP.sendSnap();
      render();
    },

    // ---------- Rooms ----------
    startRoom() {
      const s = this.s, p = s.player;
      s.roundKind = 'room';
      const before = this.heartsSnapshot();
      const dmg = G.Dungeon.tickPoison(p, s.room);
      if (dmg) say(s, `Poison deals ${dmg} damage.`);
      if (!p.alive) { this.playerOut(`Poison took your last heart in room ${s.room}.`); return; }
      if (p.hearts < before[p.id]) say(s, 'Poison took a heart. You come back at full health, poison cleared.');
      const kind = G.Dungeon.roomKind(s.room);
      if (this.mp) {
        G.MP.sendSnap();
        // Shared rooms wait for the host: the Plunder pile, or your duel pairing
        if (kind === 'shop') { s.roundKind = 'shop'; s.phase = 'shop'; s.shop = null; s.shopMsg = null; s.shopEnded = false; s.roundEnds = 0; render(); return; }
        if (kind === 'duel') { s.roundKind = 'after'; s.gemDone = true; s.duelDone = true; s.phase = 'duelWait'; s.roundEnds = 0; render(); return; }
      }
      if (kind === 'shop') { this.startShop(); return; }
      if (kind === 'duel') { s.roundKind = 'after'; s.rivalsPlayedRoom = s.room; s.gemDone = true; this.startDuels(); return; }
      if (kind === 'merchant') { s.merchant = G.Dungeon.merchantStock(p, s.room, s.rng); s.phase = 'merchant'; this.startTimer(CFG().roundSeconds); render(); return; }
      s.doors = G.Dungeon.makeDoors(p, s.room, s.rng);
      for (const d of s.doors) if (d.monster && d.type !== 'wager') d.danger = G.Dungeon.danger(p, d, s.room);   // a wager's odds stay hidden
      s.phase = 'doors';
      this.startTimer(CFG().roundSeconds);
      render();
    },

    // Player finished: in single player everyone is ready, so the round ends now
    completeRoom(text) {
      if (text) say(this.s, text);
      this.endRound();
    },

    timeUp() {
      const s = this.s, p = s.player;
      let auto = null;
      switch (s.phase) {
        case 'doors': {
          const d = G.AI.chooseDoor(p, s.doors, s.room, p.rng);
          G.AI.autoBag(p, d);
          const before = this.heartsSnapshot();
          auto = `Time ran out, so the dungeon chose for you: ${G.Dungeon.doorInfo(d).title}. You ${G.AI.resolveDoor(p, d, s.room, s.rng)}.`;
          this.afterHeartLoss(before);
          break;
        }
        case 'armory': { const it = s.rng.pick(s.armory); G.Hero.equip(p, it); auto = `Time ran out. You grabbed the ${it.name}.`; break; }
        case 'reward': auto = `Time ran out. ${this.autoTakeToBag(s.offer.items, s.offer.gold)}`; break;
        case 'spoils': auto = `Time ran out. You ${G.AI.autoSpoils(p, s.spoils)}.`; break;
        case 'mystery':
          if (s.mystery.id === 'ambush') { this.startBattle({ type: 'fight', monster: G.Dungeon.monsterFor(s.room, 'fight', s.rng) }, 'fight'); return; }
          break;
        case 'wager': { const B = CFG().wager.bets.filter(b => p.gold >= b); s.wagerBet = B[0] || 0; s.notice = s.wagerBet ? `Time ran out. You bet ${s.wagerBet} gold.` : 'Time ran out. You fight with nothing on the line.'; this.startBattle(s.door, 'wager'); return; }
        case 'merchant': auto = 'Time ran out, so you left the merchant.'; break;
        case 'forge': auto = 'Time ran out, so you left the forge.'; break;
        case 'spec': { const id = G.AI.autoSpec(p, s.specOptions); s.notice = `Time ran out. You became a ${G.SPECS[id].name}.`; this.nextStep(); return; }
        case 'tree': { const n = G.AI.autoTree(p, s.treeLevel); s.notice = `Time ran out. You took ${n.name}.`; this.nextStep(); return; }
        case 'gem': { const id = G.AI.autoGem(p, s.gemOptions); s.notice = `Time ran out. You took the ${G.GEMS[id].name}.`; s.gemDone = true; this.nextStep(); return; }
        case 'duelIntro': this.startDuelFight(); return;
      }
      if (!p.alive) { this.playerOut(auto); return; }
      s.notice = auto;
      this.endRound();
    },

    // After the player's room: rivals play their room, then level-up picks, gem, duel, next room
    endRound() {
      const s = this.s;
      s.bagMsg = null;
      if (s.roundKind === 'room') {
        const before = this.heartsSnapshot();
        if (!this.mp) for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, s.room);   // in multiplayer the host runs the bots
        s.rivalsPlayedRoom = s.room;
        this.afterHeartLoss(before);
        s.gemDone = false; s.duelDone = false;
        s.roundKind = 'after';
      }
      this.nextStep();
    },
    // Walks through whatever comes after a room: spec/tree picks, heart gem, duel, then the next room
    nextStep() {
      const s = this.s, p = s.player;
      if (!p.alive) { this.playerOut(s.notice || `You ran out of hearts in room ${s.room}.`); return; }
      // The heart gem is part of the first boss round
      if (s.room === CFG().gemRoom && !p.gem && !s.gemDone) {
        s.phase = 'gem'; s.gemOptions = s.gemOptions || G.Dungeon.gemOptions(p, s.rng);
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      const pick = G.Hero.pendingPick(p);
      if (pick && G.Sound) G.Sound.play('levelup');
      if (pick && pick.kind === 'spec') {
        s.phase = 'spec'; s.specOptions = s.specOptions && s.specFor === p.level ? s.specOptions : G.Dungeon.specOptions(p, s.rng); s.specFor = p.level;
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      if (pick && pick.kind === 'tree') {
        s.phase = 'tree'; s.treeLevel = pick.level;
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      // Multiplayer: you're done with this room; the host starts the next one when everyone is
      if (this.mp) { s.phase = 'waiting'; s.roundEnds = 0; G.MP.sendReady(); render(); return; }
      s.room++;
      s.specOptions = null; s.gemOptions = s.room > CFG().gemRoom ? null : s.gemOptions;
      if (s.room > CFG().rooms) { this.startTournament(); return; }
      this.startRoom();
    },

    chooseDoor(i) {
      const s = this.s, d = s.doors[i], p = s.player;
      if (s.phase !== 'doors') return;
      s.notice = null;
      s.door = d;
      switch (d.type) {
        case 'armory': s.armory = G.Loot.armory(s.rng); s.phase = 'armory'; break;
        case 'fight': case 'elite': case 'boss': this.startBattle(d, d.type); return;
        case 'wager': s.phase = 'wager'; break;
        case 'trash': {
          const g = G.Dungeon.goldFor('trash', p, s.rng);
          p.gold += g;
          s.offer = { items: G.Loot.offer(p, s.room, 'trash', s.rng), gold: 0, title: 'Trash Pile', text: `You dig out ${g} gold. Anything else worth keeping?` };
          if (s.rng.chance(0.5)) s.offer.items.push(G.Items.rollConsumable(s.room, s.rng));
          s.phase = 'reward'; break;
        }
        case 'vault':
          s.offer = { items: G.Loot.offer(p, s.room, 'vault', s.rng), gold: CFG().gold.skipItemBase + 2 * Math.round(s.room / 2), title: 'Treasure Vault', text: 'A sealed vault, untouched for years. Take one.' };
          s.phase = 'reward'; break;
        case 'venom':
          p.poison += CFG().poison.venomStacks;
          s.offer = { items: G.Loot.offer(p, s.room, 'shrine', s.rng), gold: 0, title: 'Venom Cache', text: `The lid bites. You gain ${CFG().poison.venomStacks} poison (${p.poison} total). Take one item.` };
          s.phase = 'reward'; break;
        case 'purify': {
          const n = p.poison; p.poison = 0;
          const h = G.Hero.heal(p, CFG().poison.purifyHeal);
          this.completeRoom(n ? `The spring washes away ${n} poison${h ? ` and heals ${h}` : ''}.` : `Clean water${h ? `: +${h} health` : ''}. You weren't poisoned.`);
          return;
        }
        case 'rest': {
          const h = G.Hero.heal(p, CFG().restHeal);
          this.completeRoom(h > 0 ? `You rested by the fire and recovered ${h} health.` : 'You rested by the fire, but nothing came back.');
          return;
        }
        case 'trainer': {
          const lv = G.Hero.gainXp(p, CFG().xp.trainer);
          this.completeRoom(`The trainer drills you hard. +${CFG().xp.trainer} XP${lv.length ? `. You reached level ${p.level}!` : '.'}`);
          return;
        }
        case 'forge': s.forge = { strengthened: false, affixed: false, msg: null }; s.phase = 'forge'; break;
        case 'mystery': s.mystery = G.Dungeon.rollMystery(s.rng); s.phase = 'mystery'; break;
        case 'merchant': s.merchant = G.Dungeon.merchantStock(p, s.room, s.rng); s.phase = 'merchant'; break;
      }
      render();
    },

    pickWeapon(id) {
      const s = this.s, it = s.armory.find(x => x.id === id);
      G.Hero.equip(s.player, it);
      this.completeRoom(`You took the ${it.name}. The real run starts now.`);
    },

    // ---------- Fights ----------
    startBattle(door, kind) {
      const s = this.s, p = s.player;
      const foes = G.Dungeon.doorFoes(door, s.room);
      const res = G.simulateFight(G.Stats.compute(p, { buffs: true }), foes, G.Dungeon.fightOpts(p, s.rng.int(0, 1e9)));
      s.battle = {
        kind, door, res, title: G.Dungeon.monsterName(door.monster, kind === 'wager' ? 'fight' : kind, door.trait),
        visual: { a: visualFor(p) },
        done: false, onDone: () => this.battleDone(false),
      };
      if (this.mp) G.MP.sendFight({ title: `Room ${s.room}: ${s.battle.title}`, visual: s.battle.visual });
      s.phase = 'battle';
      s.notice = null;
      s.roundEnds = 0;                 // fights never eat into your pick time
      render();
    },

    battleDone(silent) {
      const s = this.s, b = s.battle, p = s.player;
      if (!b || b.done || b.tour || b.duel) return;
      b.done = true;
      const before = this.heartsSnapshot();
      const out = G.Dungeon.applyFight(p, b.res, s.room);
      this.afterHeartLoss(before);
      const notes = [];
      if (b.res.phoenixWin === 'a') notes.push('Phoenix Heart: you exploded, took them with you, and stood back up.');
      if (b.res.goldStolen) notes.push(`A thief escaped with ${b.res.goldStolen} gold.`);
      const bet = b.kind === 'wager' ? s.wagerBet || 0 : 0;
      if (out === 'dead') { p.gold = Math.max(0, p.gold - bet); this.playerOut(`${b.title} took your last heart in room ${s.room}.`); return; }
      if (out === 'heart') {
        p.gold = Math.max(0, p.gold - bet);
        this.completeRoom([...notes, `${b.title} took a heart. You have ${p.hearts} left and come back at full health, but get nothing from this room.${bet ? ` You lost your ${bet} gold bet.` : ''}`].join(' '));
        return;
      }
      const k = b.kind === 'wager' ? 'fight' : b.kind;
      const fullXp = CFG().xp[k] || CFG().xp.fight;
      const lv = G.Hero.gainXp(p, out === 'timeout' ? Math.round(fullXp / 2) : fullXp);
      const xpNote = `+${CFG().xp[k] || CFG().xp.fight} XP${lv.length ? ` (you reached level ${p.level})` : ''}`;
      if (out === 'timeout') {
        // Out of time: half the gold and XP, no items
        p.gold = Math.max(0, p.gold - bet);
        const halfXp = Math.round((CFG().xp[k] || CFG().xp.fight) / 2);
        const g = 2 * Math.round(G.Dungeon.goldFor(k, p, s.rng) / 4);
        p.gold += g;
        this.completeRoom([...notes, `Time ran out before either side fell. Half rewards: ${g} gold, +${halfXp} XP, no items.${bet ? ' The bet is lost.' : ''}`].join(' '));
        return;
      }
      if (bet) { p.gold += bet; notes.push(`You won the wager: +${bet} gold.`); }
      const gold = G.Dungeon.goldFor(k, p, s.rng);
      p.gold += gold;
      if (G.Dungeon.gearDrops(p, k, s.rng)) {
        s.offer = {
          items: G.Loot.offer(p, s.room, k, s.rng), gold: CFG().gold.skipItemBase + 2 * Math.round(s.room / 2),
          title: 'Victory', text: [...notes, `${b.title} is down. ${gold} gold, ${xpNote}. Gear dropped: choose one.`].join(' '),
        };
        s.phase = 'reward';
      } else {
        s.spoils = G.Dungeon.spoilsOptions(p, s.room, s.rng);
        s.spoilsText = [...notes, `${b.title} is down. ${gold} gold, ${xpNote}. No gear this time; pick your spoils.`].join(' ');
        s.phase = 'spoils';
      }
      this.startTimer(CFG().roundSeconds);    // the victory screen gets its own clock
      if (!silent) render();
    },

    // Gear for an empty slot is equipped right away; anything else goes into your bag
    takeItem(id) {
      const s = this.s, p = s.player;
      const it = s.offer.items.find(x => x.id === id);
      if (!it) return;
      const where = G.Hero.receive(p, it);
      if (!where) { s.bagMsg = 'Your bag is full. Equip or discard something to make space, or this item is lost.'; render(); return; }
      this.completeRoom(G.Hero.receivedText(it, where));
    },
    // When time runs out: the best item is taken if there's room, otherwise the gold
    autoTakeToBag(items, gold) {
      const p = this.s.player;
      const up = G.AI.bestUpgrade(p, items) || items.find(it => it.kind === 'consumable');
      if (up && G.Hero.canReceive(p, up)) return G.Hero.receivedText(up, G.Hero.receive(p, up));
      if (gold) { p.gold += gold; return `You took ${gold} gold.`; }
      return up ? 'Your bag was full, so the item was lost.' : 'You took nothing.';
    },
    takeGold() {
      const s = this.s;
      s.player.gold += s.offer.gold;
      this.completeRoom(s.offer.gold ? `Took ${s.offer.gold} gold.` : 'You left with nothing.');
    },
    takeSpoils(id) {
      const s = this.s, opt = s.spoils && s.spoils.find(o => o.id === id);
      if (!opt) return;
      const lvBefore = s.player.level;
      const txt = G.Dungeon.takeSpoils(s.player, opt);
      this.completeRoom(`You ${txt}.${s.player.level > lvBefore ? ` Level ${s.player.level}!` : ''}`);
    },

    // ---------- Wager ----------
    placeBet(amount) {
      const s = this.s, p = s.player;
      // No walking away: you bet what you can, or fight for nothing if you can't afford the smallest bet
      if (s.phase !== 'wager' || (amount && p.gold < amount)) return;
      if (!amount && p.gold >= CFG().wager.bets[0]) return;
      s.wagerBet = amount;
      this.startBattle(s.door, 'wager');
    },

    // ---------- Forge ----------
    forgeAct(kind, slot) {
      const s = this.s, p = s.player, f = s.forge, F = CFG().forge;
      const it = p.gear[slot];
      if (s.phase !== 'forge' || !it) return;
      if (kind === 'strengthen' && !f.strengthened && p.gold >= F.upgradeCost) {
        p.gold -= F.upgradeCost; G.Dungeon.forgeStrengthen(it); f.strengthened = true;
        f.msg = `The smith hammers your ${it.name} stronger.`;
      } else if (kind === 'affix' && !f.affixed && !it.affixed && p.gold >= F.affixCost) {
        p.gold -= F.affixCost; const r = G.Dungeon.forgeAffix(it, s.rng); f.affixed = true;
        f.msg = r ? `The smith adds a random affix to your ${it.name}: +${r.v} ${G.STAT_INFO[r.k].label}.` : '';
      }
      const max = G.Hero.maxHp(p); if (p.hp > max) p.hp = max;
      render();
    },
    leaveForge() { if (this.s.phase === 'forge') this.completeRoom(this.s.forge.strengthened || this.s.forge.affixed ? 'You leave the forge.' : 'You leave the forge empty-handed.'); },

    // ---------- Bag ----------
    useBag(i) {
      const s = this.s, p = s.player, it = p.bag[i];
      if (!it || s.phase === 'battle') return;
      const tourNow = s.roundKind === 'tour' && s.tour && !s.tour.champion;
      const lock = msg => { s.bagMsg = msg; render(); };
      // Player fights: use potions before the fight (duel card, tournament breaks), never during it
      if (this.mp) {
        if (s.phase === 'duelWait') return lock('Wait for your duel pairing.');
        if (s.phase === 'duelIntro' && s.duel && s.duel.goSent) return lock('You’ve gone in. The fight is about to start.');
        if (tourNow && (s.tourPhase === 'fight' || (this.timeLeft() != null && this.timeLeft() < 1))) return lock('Wait for the break between fights.');
      }
      const me = tourNow ? s.tour.entrants.find(e => e.hero === p) : null;
      if (tourNow && (!me || me.out)) return;
      if (it.kind === 'gear' && !G.Hero.canEquip(p, it)) { s.bagMsg = 'You already wear a legendary. Only one at a time.'; render(); return; }
      if (it.kind === 'gear') {
        // Equipping overwrites: what you were wearing is gone for good (no swapping back)
        p.bag.splice(i, 1);
        const old = G.Hero.equip(p, it);
        s.bagMsg = old ? `Equipped ${it.name}. ${old.name} is gone.` : `Equipped ${it.name}.`;
      } else if (me && G.CONSUMABLES[it.cid].heal) {
        // In the tournament, healing restores your tournament health
        const c = G.CONSUMABLES[it.cid];
        p.bag.splice(i, 1);
        const a = Math.min(me.maxHp - me.hp, G.Hero.healAmount(p, c.heal));
        me.hp += a;
        s.bagMsg = `${c.name}: +${a} health for your next fight.`;
      } else s.bagMsg = G.Dungeon.useItem(p, it);
      if (me && this.mp) G.MP.sendTourUse(me.hp);
      if (!this.mp && s.phase === 'duelIntro' && s.duel && s.duel.mine) {
        const side = s.duel.mine.a.hero === p ? s.duel.mine.a : s.duel.mine.b;
        if (side && !side.ghost) side.hp = p.hp;   // a potion on the duel card counts
      }
      if (s.phase === 'doors') for (const d of s.doors) if (d.monster && d.type !== 'wager') d.danger = G.Dungeon.danger(p, d, s.room);   // a wager's odds stay hidden
      render();
    },
    // Selling replaces discarding: anything in the bag can be turned into gold
    sellBag(i) {
      const s = this.s, p = s.player, it = p.bag[i];
      if (!it || s.phase === 'battle') return;
      const g = G.Dungeon.sellPrice(it);
      p.bag.splice(i, 1);
      p.gold += g;
      s.bagMsg = `Sold ${it.name} for ${g} gold.`;
      if (this.mp) G.MP.sendSnap();
      render();
    },

    // ---------- Mystery ----------
    mysteryAct(act) {
      const s = this.s, p = s.player;
      if (act === 'spring') this.completeRoom(`The water is cold and clean. +${G.Hero.heal(p, CFG().springHeal)} health.`);
      else if (act === 'cache') { const g = 2 * s.rng.int(10, 16); p.gold += g; this.completeRoom(`You pocket ${g} gold.`); }
      else if (act === 'shrine') {
        const cost = p.gem === 'stone' ? 1 : CFG().shrineCost;
        if (p.hp <= cost) return;
        p.hp -= cost;
        s.offer = { items: G.Loot.offer(p, s.room, 'shrine', s.rng), gold: 0, title: 'Blood Shrine', text: `The altar drinks ${cost} health. It offers these in return.` };
        s.phase = 'reward';
        render();
      } else if (act === 'ambush') this.startBattle({ type: 'fight', monster: G.Dungeon.monsterFor(s.room, 'fight', s.rng) }, 'fight');
      else if (act === 'leave') this.completeRoom('You left the shrine alone.');
    },

    // ---------- Level-up picks and heart gem ----------
    chooseSpec(id) {
      const s = this.s;
      if (s.phase !== 'spec') return;
      G.Hero.setSpec(s.player, id);
      s.notice = `You are now a ${G.SPECS[id].name}. Its skill tree opens at level 10.`;
      this.nextStep();
    },
    chooseTree(id) {
      const s = this.s;
      if (s.phase !== 'tree') return;
      const node = G.Stats.treeOptions(s.player.spec, s.treeLevel).find(n => n.id === id);
      if (!node) return;
      G.Hero.pickTree(s.player, s.treeLevel, id);
      s.notice = `${node.name}: ${node.desc}.`;
      this.nextStep();
    },
    chooseGem(id) {
      const s = this.s;
      if (s.phase !== 'gem') return;
      G.Hero.setGem(s.player, id);
      s.notice = `The ${G.GEMS[id].name} settles into your chest.`;
      s.gemDone = true;
      this.nextStep();
    },

    // ---------- Duels (after the bosses in rooms 10 and 20) ----------
    startDuels() {
      const s = this.s;
      s.duelDone = true;
      const field = this.all().filter(h => h.alive);
      const pairs = G.Duel.pairs(field, s.rng);
      const before = this.heartsSnapshot();
      s.duel = { pairs, mine: null };
      for (const p of pairs) {
        const mine = p.a.hero.isPlayer || (!p.ghost && p.b.hero.isPlayer);
        if (mine) { s.duel.mine = p; continue; }
        G.Duel.resolve(p, G.Duel.simulate(p, s.rng), s.room);
      }
      this.afterHeartLoss(before);
      if (!s.duel.mine) { this.nextStep(); return; }
      s.phase = 'duelIntro';
      s.roundKind = 'duel';
      this.startTimer(CFG().duelIntroSeconds);
      render();
    },
    startDuelFight() {
      const s = this.s, m = s.duel.mine;
      if (!m) return;
      if (this.mp) {
        if (!s.duel.goSent) { s.duel.goSent = true; s.roundEnds = 0; G.MP.sendDuelGo(); }
        this.mpTryDuelFight();
        return;
      }
      // Fight from the player's side so the player is always on the left
      const flip = !m.a.hero.isPlayer;
      const pair = flip ? { a: m.b, b: m.a } : m;
      const res = G.Duel.simulate(pair, s.rng);
      const oppName = pair.b.ghost ? pair.b.name : pair.b.hero.name;
      s.battle = {
        duel: true, res, title: `Duel: You vs ${oppName}`,
        visual: { a: visualFor(pair.a.hero), b0: pair.b.ghost ? { ...visualFor(pair.b.of), ghost: true } : visualFor(pair.b.hero) },
        done: false,
        onDone: () => {
          if (s.battle.done) return;
          s.battle.done = true;
          const before = this.heartsSnapshot();
          G.Duel.resolve(pair, res, s.room);
          this.afterHeartLoss(before);
          const won = res.winner === 'a';
          const X = CFG().xp;
          if (pair.ghost) s.notice = res.draw ? `Time ran out against the ${oppName}. No heart lost.` : won ? `You beat the ${oppName}. +${X.duelWin} XP.` : `The ${oppName} got the better of you. No heart lost. +${X.duelLoss} XP.`;
          else if (res.draw) s.notice = `A full minute and nobody fell: you and ${oppName} both lose a heart. You come back at full health (${s.player.hearts} left).`;
          else s.notice = won ? `You beat ${oppName}! +${CFG().duel.winGold} gold, +${X.duelWin} XP. Your health goes back to what it was.`
            : `${oppName} won the duel. You lose a heart (${s.player.hearts} left) and come back at full health. +${X.duelLoss} XP.`;
          s.duel.mine = null;
          s.roundKind = 'after';
          this.nextStep();
        },
      };
      s.phase = 'battle';
      s.roundEnds = 0;
      render();
    },

    mpDuelFight() {
      const s = this.s;
      if (s.phase !== 'duelIntro') return;
      // Rebuild the pairing from the latest heroes: both of you, as you went in
      s.duel.mine = G.MP.duelPair(s.duel.w);
      const m = s.duel.mine, mirrored = s.duel.mirrored;
      const res = G.Duel.simulate(m, s.rng);   // the host's seed: both players see the same fight
      const nmB = m.ghost ? m.b.name : m.b.hero.name;
      G.MP.sendFight({ title: `Duel: ${m.a.hero.name} vs ${nmB}`, names: { a: m.a.hero.name, b0: nmB }, visual: { a: visualFor(m.a.hero), b0: m.ghost ? { ...visualFor(m.b.of), ghost: true } : visualFor(m.b.hero) } });
      const nameB = m.ghost ? m.b.name : m.b.hero.name, oppName = mirrored ? m.a.hero.name : nameB;
      s.battle = {
        duel: true, res, mirror: mirrored, names: { a: mirrored ? m.a.hero.name : 'You', b0: mirrored ? 'You' : nameB },
        title: `Duel: You vs ${oppName}`,
        visual: { a: visualFor(m.a.hero), b0: m.ghost ? { ...visualFor(m.b.of), ghost: true } : visualFor(m.b.hero) },
        done: false,
        onDone: () => {
          if (s.battle.done) return;
          s.battle.done = true;
          G.Duel.resolve(m, res, s.room);
          const won = !res.draw && res.winner === (mirrored ? 'b' : 'a');
          const X = CFG().xp;
          if (m.ghost) s.notice = res.draw ? `Time ran out against the ${oppName}. No heart lost.` : won ? `You beat the ${oppName}. +${X.duelWin} XP.` : `The ${oppName} got the better of you. No heart lost. +${X.duelLoss} XP.`;
          else if (res.draw) s.notice = `A full minute and nobody fell: you and ${oppName} both lose a heart. You come back at full health (${s.player.hearts} left).`;
          else s.notice = won ? `You beat ${oppName}! +${CFG().duel.winGold} gold, +${X.duelWin} XP. Your health goes back to what it was.`
            : `${oppName} won the duel. You lose a heart (${s.player.hearts} left) and come back at full health. +${X.duelLoss} XP.`;
          s.duel.mine = null;
          s.roundKind = 'after';
          G.MP.sendSnap();
          this.nextStep();
        },
      };
      s.phase = 'battle';
      s.roundEnds = 0;
      render();
    },

    // ---------- Shop round ----------
    startShop() {
      const s = this.s;
      const alive = this.all().filter(h => h.alive);
      // weakest first: lowest health percentage picks first
      const pct = h => h.hp / G.Hero.maxHp(h);
      // fewer hearts pick first, then lower health percentage
      const order = alive.slice().sort((a, b) => a.hearts - b.hearts || pct(a) - pct(b) || G.Hero.power(a) - G.Hero.power(b));
      s.roundKind = 'shop';
      s.phase = 'shop';
      s.shop = {
        table: G.Loot.shopTable(s.room, alive.length + CFG().shop.extraTableItems, s.rng),
        order: order.map(h => h.id), turn: 0, reviewUntil: now() + CFG().shop.reviewSeconds * 1000, reviewDone: false,
        turnStart: now() + CFG().shop.reviewSeconds * 1000, picks: {},
        totalSeconds: CFG().shop.reviewSeconds + CFG().shop.turnSeconds * order.length, msg: null,
      };
      this.startTimer(s.shop.totalSeconds);
      render();
    },
    shopTurnHero() {
      const sh = this.s.shop;
      const id = sh.order[sh.turn];
      return id ? this.all().find(h => h.id === id) : null;
    },
    shopPick(hero, item) {
      const s = this.s, sh = s.shop;
      sh.table = sh.table.filter(x => x !== item);
      const pass = CFG().shop.passGold;
      if (item) G.AI.take(hero, item);
      else hero.gold += pass;
      sh.picks[hero.id] = item ? item.name : `passed (+${pass} gold)`;
      if (!hero.isPlayer) hero.lastText = item ? `picked ${item.name}` : `passed for ${pass} gold`;
      sh.turn++;
      sh.turnStart = now();
    },
    autoShopPick(hero) {
      const sh = this.s.shop;
      const up = G.AI.bestUpgrade(hero, sh.table);
      const pick = up || sh.table.find(it => it.kind === 'consumable' && !G.Hero.bagFull(hero)) || null;
      this.shopPick(hero, pick);
    },
    shopTick() {
      const s = this.s, sh = s.shop;
      if (!sh || sh.turn >= sh.order.length) return;
      if (now() < sh.reviewUntil) return;
      if (!sh.reviewDone) { sh.reviewDone = true; sh.turnStart = now(); G.UI.refreshShopPicks(); return; }
      const h = this.shopTurnHero();
      const waited = (now() - sh.turnStart) / 1000;
      if (!h.isPlayer && waited >= CFG().shop.aiPickDelay) { this.autoShopPick(h); this.shopAfterPick(); }
      else if (h.isPlayer && waited >= CFG().shop.turnSeconds) {
        this.shopPick(h, null);
        sh.msg = `Your turn ran out, so you passed and got ${CFG().shop.passGold} gold.`;
        this.shopAfterPick(true);
      }
    },
    shopAfterPick(full) {
      const sh = this.s.shop;
      if (sh.turn >= sh.order.length) { this.endShop(); return; }
      if (full) render(); else G.UI.refreshShopPicks();
    },
    playerShopPick(id) {
      const s = this.s, sh = s.shop;
      const h = this.shopTurnHero();
      if (!h || !h.isPlayer) return;
      const it = sh.table.find(x => x.id === id);
      if (!it) return;
      if (!G.Hero.canReceive(s.player, it)) return;
      if (this.mp) { if (!sh.sent) { sh.sent = true; G.MP.sendPick(id); } return; }
      sh.table = sh.table.filter(x => x !== it);
      sh.msg = G.Hero.receivedText(it, G.Hero.receive(s.player, it));
      sh.picks[h.id] = it.name; sh.turn++; sh.turnStart = Date.now();
      this.shopAfterPick(true);
    },
    playerShopPass() {
      const h = this.shopTurnHero();
      if (!h || !h.isPlayer || Date.now() < this.s.shop.reviewUntil) return;
      if (this.mp) { if (!this.s.shop.sent) { this.s.shop.sent = true; G.MP.sendPick(null); } return; }
      this.shopPick(h, null);
      this.s.shop.msg = `You passed and got ${CFG().shop.passGold} gold.`;
      this.shopAfterPick(true);
    },
    shopTimeUp() {
      const s = this.s, sh = s.shop;
      while (sh.turn < sh.order.length) { const h = this.shopTurnHero(); if (h.isPlayer) this.shopPick(h, null); else this.autoShopPick(h); }
      this.endShop();
    },
    endShop() {
      const s = this.s, sh = s.shop;
      s.roundEnds = 0;
      const mine = sh.picks[s.player.id];
      if (this.mp) G.MP.sendSnap();
      s.notice = `Plunder over. You ${mine && !mine.startsWith('passed') ? 'took ' + mine : mine || 'passed'}.`;
      s.roundKind = 'after';
      s.rivalsPlayedRoom = s.room;
      s.gemDone = true; s.duelDone = true;
      this.nextStep();
    },

    // ---------- Merchant door ----------
    leaveMerchant() {
      const s = this.s;
      if (s.phase !== 'merchant') return;
      this.completeRoom(s.merchant.bought.length ? 'You leave the merchant with your purchases.' : 'You leave the merchant.');
    },
    shopBuy(kind, id) {
      const s = this.s, m = s.merchant, p = s.player, S = CFG().shop;
      if (s.phase !== 'merchant' || !m) return;
      if (kind === 'gear') {
        const it = m.stock.find(x => x.id === id);
        const price = it && G.Dungeon.merchantPrice(p, m, it);
        if (!it || m.bought.includes(id) || p.gold < price) return;
        if (!G.Hero.canReceive(p, it)) { m.msg = 'Your bag is full. Equip or discard something first.'; render(); return; }
        p.gold -= price;
        if (price === 0) m.freeUsed = true;
        const where = G.Hero.receive(p, it);
        m.bought.push(id);
        m.msg = `${price === 0 ? 'Haggled for free.' : 'Bought.'} ${G.Hero.receivedText(it, where)}`;
      } else if (kind === 'cons') {
        const c = G.CONSUMABLES[id];
        const price = id === 'potion' ? S.potionCost : c.price;
        if (p.gold < price || G.Hero.bagFull(p)) return;
        if ((m.cstock[id] || 0) <= 0) return;
        p.gold -= price;
        m.cstock[id]--;
        p.bag.push(G.Items.consumable(id));
        m.msg = `Bought ${c.name}. It's in your bag.`;
      } else if (kind === 'restock') {
        const cost = S.restockCosts[m.restocks];
        if (cost == null || p.gold < cost) return;
        p.gold -= cost;
        m.restocks++;
        m.stock = G.Loot.offer(p, s.room, 'shop', s.rng, S.gearCount);
        m.bought = [];
        m.msg = 'Fresh stock on the table.';
      } else if (kind === 'blood') {
        // A gamble: always the same health, a random handful of gold
        const cost = p.gem === 'stone' ? 1 : S.bloodHealth;
        if (p.hp <= cost) return;
        const gold = s.rng.int(S.bloodGold[0], S.bloodGold[1]);
        p.hp -= cost; p.gold += gold;
        m.bloodPop = { gold, seq: (m.bloodPop ? m.bloodPop.seq : 0) + 1 };
        m.msg = `The merchant takes ${cost} health and hands you ${gold} gold.`;
      }
      render();
    },

    // ---------- Tournament ----------
    startTournament() {
      const s = this.s;
      const field = this.all().filter(h => h.alive);
      s.tour = G.Tournament.create(field, s.rng.fork());
      s.phase = 'tournament';
      s.roundKind = 'tour';
      // A longer first break to take in the field before the first round
      if (!s.tour.champion) this.startTimer(CFG().tourBreakSeconds + CFG().tourIntroExtra); else s.roundEnds = 0;
      render();
    },
    tourStep() {
      const s = this.s, T = s.tour;
      s.notice = null;
      const startRound = T.rounds.length;
      // A trumpet call when a new round begins
      const rn = G.Tournament.currentRound(T).n;
      if (s.fanfareRound !== rn) { s.fanfareRound = rn; if (G.Sound) G.Sound.play('fanfare', 1); }
      let m;
      while ((m = G.Tournament.nextMatch(T)) && T.rounds.length === startRound) {
        const mine = m.a.hero.isPlayer || (!m.ghost && m.b.hero.isPlayer);
        if (mine && !this.playerOutOfTour()) { this.tourBattle(m); return; }
        G.Tournament.resolve(T, m, G.Tournament.simulate(T, m));
      }
      if (!T.champion) this.startTimer(CFG().tourBreakSeconds);
      render();
    },
    playerOutOfTour() { const e = this.s.tour.entrants.find(x => x.hero.isPlayer); return !e || e.out; },
    tourBattle(m) {
      const s = this.s, T = s.tour;
      const flip = !m.a.hero.isPlayer;
      const pair = flip ? { a: m.b, b: m.a } : m;
      const res = G.Tournament.simulate(T, pair);
      const oppName = pair.b.ghost ? pair.b.name : pair.b.hero.name;
      s.battle = {
        tour: true, match: m, res, title: `Tournament round ${G.Tournament.currentRound(T).n}: You vs ${oppName}`,
        visual: { a: visualFor(pair.a.hero), b0: pair.b.ghost ? { ...visualFor(pair.b.of), ghost: true } : visualFor(pair.b.hero) }, done: false,
        onDone: () => {
          if (s.battle.done) return;
          s.battle.done = true;
          // Resolve from the match's own orientation
          const fixed = flip ? { ...res, winner: res.winner === 'a' ? 'b' : 'a', aHp: res.bHp, bHp: res.aHp,
            bloodrage: res.bloodrage ? { a: res.bloodrage.b, b: res.bloodrage.a } : null } : res;
          const won = res.winner === 'a' && !res.draw;
          G.Tournament.resolve(T, m, fixed);
          const me = T.entrants.find(e => e.hero.isPlayer);
          if (fixed.draw && !m.ghost) s.notice = m.suddenDeath ? `A full minute and nobody fell. Sudden death: you both keep your last heart and go again.` : `A full minute and nobody fell: you and ${oppName} both lose a heart and come back at full health.`;
          else if (m.ghost) s.notice = won ? `You beat the ${oppName}. You keep ${me.hp} health.` : `The ${oppName} beat you. No heart lost; you go on with ${me.hp} health.`;
          else if (won) s.notice = `You beat ${oppName}. You go into the next round with ${me.hp} health.${m.rageHeal ? ` Bloodrage: +${m.rageHeal}.` : ''}`;
          else s.notice = me.out ? `${oppName} took your last heart.` : `${oppName} won. You lose a heart (${s.player.hearts} left) and come back at full health.`;
          s.phase = 'tournament';
          if (!T.champion) this.startTimer(CFG().tourBreakSeconds);
          render();
        },
      };
      s.phase = 'battle';
      s.roundEnds = 0;
      render();
    },

    // When you're out: play the rest of the match without you
    seeEnding() {
      const s = this.s;
      if (!s.tour) {
        for (let room = s.room; room <= CFG().rooms; room++) {
          if (s.rivalsPlayedRoom !== room) for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, room);
          if (CFG().duelRooms.includes(room) && !(room === s.room && s.duelDone)) G.Duel.runAll(s.rivals, room, s.rng);
          if (room === CFG().gemRoom) for (const r of s.rivals) if (r.alive && !r.gem) G.AI.autoGem(r, G.Dungeon.gemOptions(r, r.rng));
        }
        const field = s.rivals.filter(h => h.alive);
        s.tour = field.length ? G.Tournament.create(field, s.rng.fork()) : null;
      }
      if (s.tour) G.Tournament.runAll(s.tour);
      s.phase = 'ending';
      s.roundEnds = 0;
      render();
    },
  };

  G.Game = Game;
  G.visualFor = visualFor;
})(window.G);
