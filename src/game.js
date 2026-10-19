// Single-player run state and actions. Every round is timed; it ends as soon as every player is
// ready (the AI rivals are always ready, so in single player that's as soon as you finish).
// When the clock hits zero, whatever is left is decided automatically, like a server would.
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const render = () => G.UI.render();
  const now = () => Date.now();

  // What a hero looks like in fights and in the door preview.
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

  const Game = {
    s: null,

    newRun() {
      const seed = G.newSeed();
      const rng = new G.RNG(seed);
      const player = G.Hero.create({ name: 'You', isPlayer: true, tint: G.PLAYER_TINT }, rng.fork());
      const rivals = G.RIVALS.map(r => G.Hero.create({ name: r.name, tint: r.tint }, rng.fork()));
      this.s = { seed, rng, player, rivals, room: 1, phase: 'doors', roundKind: 'room', roundEnds: 0, notice: null, bagMsg: null, log: [] };
      this.startRoom();
    },
    toTitle() { this.s = null; render(); },
    all() { return [this.s.player, ...this.s.rivals]; },

    // ---------- Timing ----------
    startTimer(seconds) { this.s.roundEnds = now() + seconds * 1000; },
    timeLeft() { const s = this.s; return s && s.roundEnds ? Math.max(0, (s.roundEnds - now()) / 1000) : null; },
    tick() {
      const s = this.s;
      if (!s) return;
      if (s.phase === 'shop') this.shopTick();
      if (!s.roundEnds || now() < s.roundEnds) return;
      s.roundEnds = 0;
      if (s.roundKind === 'tour') this.tourStep();
      else if (s.roundKind === 'shop') this.shopTimeUp();
      else this.timeUp();
    },

    // ---------- Rooms ----------
    startRoom() {
      const s = this.s, p = s.player;
      s.roundKind = 'room';
      const dmg = G.Dungeon.tickPoison(p, s.room);
      if (dmg) s.notice = [s.notice, `Poison deals ${dmg} damage.`].filter(Boolean).join(' ');
      if (!p.alive) { s.phase = 'dead'; s.notice = `Poison finished you off in room ${s.room}.`; s.roundEnds = 0; render(); return; }
      if (CFG().shopRooms.includes(s.room)) { this.startShop(); return; }
      s.doors = G.Dungeon.makeDoors(p, s.room, s.rng);
      for (const d of s.doors) if (d.monster) d.danger = G.Dungeon.danger(p, d, s.room);
      s.phase = 'doors';
      this.startTimer(CFG().roundSeconds);
      render();
    },

    // Player finished: in single player everyone is ready, so the round ends now
    completeRoom(text) {
      if (text) this.s.notice = text;
      this.endRound();
    },

    timeUp() {
      const s = this.s, p = s.player;
      let auto = null;
      switch (s.phase) {
        case 'doors': {
          const d = G.AI.chooseDoor(p, s.doors, s.room, p.rng);
          G.AI.autoBag(p, d);
          auto = `Time ran out, so the dungeon chose for you: ${G.Dungeon.doorInfo(d).title}. You ${G.AI.resolveDoor(p, d, s.room, s.rng)}.`;
          break;
        }
        case 'armory': { const it = s.rng.pick(s.armory); G.Hero.equip(p, it); auto = `Time ran out. You grabbed the ${it.name}.`; break; }
        case 'battle': {
          G.Arena.stop();
          this.battleDone(true);
          if (s.phase === 'reward') auto = `Time ran out. You ${G.AI.autoLoot(p, s.offer.items, s.room, s.offer.gold > 0)}.`;
          break;
        }
        case 'reward': auto = `Time ran out. You ${G.AI.autoLoot(p, s.offer.items, s.room, s.offer.gold > 0)}.`; break;
        case 'mystery':
          if (s.mystery.id === 'ambush') auto = 'Time ran out. You ' + G.AI.resolveDoor(p, { type: 'fight', monster: G.Dungeon.monsterFor(s.room, 'fight', s.rng) }, s.room, s.rng);
          break;
        case 'spec': { const id = G.AI.autoSpec(p, s.specOptions); auto = `Time ran out. You became a ${G.SPECS[id].name}.`; break; }
        case 'gem': { const id = G.AI.autoGem(p, s.gemOptions); auto = `Time ran out. You took the ${G.GEMS[id].name}.`; break; }
        case 'merchant': auto = 'Time ran out, so you left the merchant.'; break;
      }
      if (!p.alive) { s.phase = 'dead'; s.roundEnds = 0; s.notice = auto; render(); return; }
      s.notice = auto;
      this.endRound();
    },

    // Everyone else dies? Vulture's Heart heals to full.
    vultureCheck(before) {
      const s = this.s;
      const died = this.all().filter(h => before.includes(h.id) && !h.alive).length;
      if (!died) return;
      for (const h of this.all()) {
        if (h.alive && h.gem === 'vulture') {
          h.hp = G.Hero.maxHp(h);
          if (h.isPlayer) s.notice = [s.notice, 'A rival fell. Vulture’s Heart heals you to full.'].filter(Boolean).join(' ');
        }
      }
    },

    endRound() {
      const s = this.s;
      s.bagMsg = null;
      if (s.roundKind === 'room') {
        const before = this.all().filter(h => h.alive).map(h => h.id);
        for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, s.room);
        this.vultureCheck(before);
        if (s.room === CFG().specRoom && !s.player.spec) {
          s.roundKind = 'spec'; s.specOptions = G.Dungeon.specOptions(s.player, s.rng); s.phase = 'spec';
          this.startTimer(CFG().roundSeconds); render(); return;
        }
        if (s.room === CFG().gemRoom && !s.player.gem) {
          s.roundKind = 'gem'; s.gemOptions = G.Dungeon.gemOptions(s.player, s.rng); s.phase = 'gem';
          this.startTimer(CFG().roundSeconds); render(); return;
        }
      }
      if (s.roundKind === 'spec' && s.room === CFG().gemRoom && !s.player.gem) {
        s.roundKind = 'gem'; s.gemOptions = G.Dungeon.gemOptions(s.player, s.rng); s.phase = 'gem';
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      s.room++;
      if (s.room > CFG().rooms) { this.startTournament(); return; }
      this.startRoom();
    },

    chooseDoor(i) {
      const s = this.s, d = s.doors[i], p = s.player;
      if (s.phase !== 'doors') return;
      s.notice = null;
      switch (d.type) {
        case 'armory': s.armory = G.Loot.armory(s.rng); s.phase = 'armory'; break;
        case 'fight': case 'elite': case 'boss': this.startBattle(d.monster, d.type, d.type); return;
        case 'treasure':
          s.offer = { items: G.Loot.offer(p, s.room, 'treasure', s.rng), gold: CFG().gold.skipItemBase + 2 * Math.round(s.room / 2), title: 'Treasure', text: 'A chest, untouched. Take one item.' };
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

    startBattle(monster, kind, lootKind) {
      const s = this.s, p = s.player;
      const foes = G.Dungeon.buildEnemies(monster, s.room, kind);
      const res = G.simulateFight(G.Stats.compute(p, { buffs: true }), foes, G.Dungeon.fightOpts(p, s.rng.int(0, 1e9)));
      s.battle = {
        kind, lootKind, monster, res, title: G.Dungeon.monsterName(monster, kind),
        visual: { a: visualFor(p) },
        done: false, onDone: () => this.battleDone(false),
      };
      s.phase = 'battle';
      render();
    },

    battleDone(silent) {
      const s = this.s, b = s.battle, p = s.player;
      if (!b || b.done || b.tour) return;
      b.done = true;
      const out = G.Dungeon.applyFight(p, b.res, s.room);
      const notes = [];
      if (b.res.revived.a) notes.push('Phoenix Heart burned: you were reborn at full health and exploded.');
      if (b.res.goldStolen) notes.push(`A thief escaped with ${b.res.goldStolen} gold.`);
      if (out === 'dead') { s.phase = 'dead'; s.roundEnds = 0; if (!silent) render(); return; }
      if (out === 'timeout') { this.completeRoom([...notes, 'Neither side could finish it. No loot this time.'].join(' ')); return; }
      const gold = G.Dungeon.goldFor(b.kind === 'fight' ? 'fight' : b.kind, p, s.rng);
      p.gold += gold;
      s.offer = {
        items: G.Loot.offer(p, s.room, b.lootKind, s.rng), gold: CFG().gold.skipItemBase + 2 * Math.round(s.room / 2),
        title: 'Victory', text: [...notes, `${b.title} is down. You found ${gold} gold. Choose one.`].join(' '),
      };
      s.phase = 'reward';
      if (!silent) render();
    },

    // mode: 'equip' | 'bag'
    takeItem(id, mode) {
      const s = this.s, p = s.player;
      const it = s.offer.items.find(x => x.id === id);
      if (!it) return;
      if (it.kind === 'consumable' || mode === 'bag') {
        if (G.Hero.bagFull(p)) return;
        p.bag.push(it);
        this.completeRoom(`Put ${it.name} in your bag.`);
        return;
      }
      const old = G.Hero.equip(p, it);
      if (old) p.gold += CFG().salvage[old.rarity];
      this.completeRoom(old ? `Equipped ${it.name}. Scrapped ${old.name} for ${CFG().salvage[old.rarity]} gold.` : `Equipped ${it.name}.`);
    },
    takeGold() {
      const s = this.s;
      s.player.gold += s.offer.gold;
      this.completeRoom(s.offer.gold ? `Took ${s.offer.gold} gold.` : 'You left with nothing.');
    },

    // ---------- Bag ----------
    useBag(i) {
      const s = this.s, p = s.player, it = p.bag[i];
      if (!it || s.phase === 'battle') return;
      s.bagMsg = G.Dungeon.useItem(p, it);
      if (s.phase === 'doors') for (const d of s.doors) if (d.monster) d.danger = G.Dungeon.danger(p, d, s.room);
      render();
    },
    discardBag(i) {
      const s = this.s, p = s.player, it = p.bag[i];
      if (!it || s.phase === 'battle') return;
      p.bag.splice(i, 1);
      s.bagMsg = `Discarded ${it.name}.`;
      render();
    },

    // ---------- Mystery ----------
    mysteryAct(act) {
      const s = this.s, p = s.player;
      if (act === 'spring') this.completeRoom(`The water is cold and clean. +${G.Hero.heal(p, CFG().springHeal)} health.`);
      else if (act === 'cache') { const g = 2 * s.rng.int(10, 16); p.gold += g; this.completeRoom(`You pocket ${g} gold.`); }
      else if (act === 'shrine') {
        const cost = CFG().shrineCost;
        if (p.hp <= cost) return;
        p.hp -= cost;
        s.offer = { items: G.Loot.offer(p, s.room, 'shrine', s.rng), gold: 0, title: 'Blood Shrine', text: `The altar drinks ${cost} health. It offers these in return.` };
        s.phase = 'reward';
        render();
      } else if (act === 'ambush') this.startBattle(G.Dungeon.monsterFor(s.room, 'fight', s.rng), 'fight', 'fight');
      else if (act === 'leave') this.completeRoom('You left the shrine alone.');
    },

    chooseSpec(id) {
      const s = this.s;
      if (s.phase !== 'spec') return;
      G.Hero.setSpec(s.player, id);
      s.notice = `You are now a ${G.SPECS[id].name}.`;
      this.endRound();
    },
    chooseGem(id) {
      const s = this.s;
      if (s.phase !== 'gem') return;
      G.Hero.setGem(s.player, id);
      s.notice = `The ${G.GEMS[id].name} settles into your chest.`;
      this.endRound();
    },

    // ---------- Shared shop round ----------
    startShop() {
      const s = this.s;
      const alive = this.all().filter(h => h.alive);
      const order = alive.slice().sort((a, b) => a.hp - b.hp || G.Hero.power(a) - G.Hero.power(b));
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
      if (it.kind === 'consumable' && G.Hero.bagFull(s.player)) return;
      this.shopPick(h, it);
      sh.msg = `You took ${it.name}.`;
      this.shopAfterPick(true);
    },
    playerShopPass() {
      const h = this.shopTurnHero();
      if (!h || !h.isPlayer || Date.now() < this.s.shop.reviewUntil) return;
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
      s.notice = `Shop round over. You ${mine && !mine.startsWith('passed') ? 'took ' + mine : mine || 'passed'}.`;
      s.room++;
      this.startRoom();
    },

    // ---------- Merchant door ----------
    leaveMerchant() {
      const s = this.s;
      if (s.phase !== 'merchant') return;
      const n = s.merchant.bought.length + s.merchant.potions;
      this.completeRoom(n ? 'You leave the merchant with your purchases.' : 'You leave the merchant.');
    },
    shopBuy(kind, id) {
      const s = this.s, sh = s.merchant, p = s.player, S = CFG().shop;
      if (s.phase !== 'merchant' || !sh) return;
      if (kind === 'gear') {
        const it = sh.stock.find(x => x.id === id);
        const price = it && G.Dungeon.itemPrice(it);
        if (!it || sh.bought.includes(id) || p.gold < price) return;
        p.gold -= price;
        const old = G.Hero.equip(p, it);
        if (old) p.gold += CFG().salvage[old.rarity];
        sh.bought.push(id);
        sh.msg = `Bought and equipped ${it.name}.`;
      } else if (kind === 'cons') {
        const c = G.CONSUMABLES[id];
        const price = id === 'potion' ? S.potionCost : c.price;
        if (p.gold < price || G.Hero.bagFull(p)) return;
        if (id === 'potion' && sh.potions >= S.potionsPerShop) return;
        p.gold -= price;
        if (id === 'potion') sh.potions++;
        p.bag.push(G.Items.consumable(id));
        sh.msg = `Bought ${c.name}. It's in your bag.`;
      } else if (kind === 'restock') {
        if (p.gold < S.restockCost) return;
        p.gold -= S.restockCost;
        sh.stock = G.Loot.offer(p, s.room, 'shop', s.rng, S.gearCount);
        sh.bought = [];
        sh.msg = 'Fresh stock on the table.';
      } else if (kind === 'blood') {
        if (p.hp <= S.bloodCost[1]) return;
        const cost = 2 * s.rng.int(S.bloodCost[0] / 2, S.bloodCost[1] / 2);
        p.hp -= cost; p.gold += S.bloodGold;
        sh.msg = `The merchant takes ${cost} health and hands you ${S.bloodGold} gold.`;
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
      if (!s.tour.champion) this.startTimer(CFG().tourBreakSeconds); else s.roundEnds = 0;
      render();
    },
    tourStep() {
      const s = this.s, T = s.tour;
      s.notice = null;
      const startRound = T.rounds.length;
      let m;
      while ((m = G.Tournament.nextMatch(T)) && T.rounds.length === startRound) {
        if (m.a.hero.isPlayer || m.b.hero.isPlayer) { this.tourBattle(m); return; }
        G.Tournament.resolve(T, m, G.Tournament.simulate(T, m));
      }
      if (!T.champion) this.startTimer(CFG().tourBreakSeconds);
      render();
    },
    tourBattle(m) {
      const s = this.s, T = s.tour;
      const res = G.Tournament.simulate(T, m);
      s.battle = {
        tour: true, match: m, res, title: `${G.Tournament.currentRound(T).name}: ${m.a.hero.name} vs ${m.b.hero.name}`,
        visual: { a: visualFor(m.a.hero), b0: visualFor(m.b.hero) }, done: false,
        onDone: () => {
          if (s.battle.done) return;
          s.battle.done = true;
          G.Tournament.resolve(T, m, res);
          if (m.rageHeal && m.winner.hero.isPlayer) s.notice = `Bloodrage: your arena health rises by ${m.rageHeal} for your next match.`;
          s.phase = 'tournament';
          if (!T.champion) this.startTimer(CFG().tourBreakSeconds);
          render();
        },
      };
      s.phase = 'battle';
      render();
    },

    seeEnding() {
      const s = this.s;
      for (let room = s.room; room <= CFG().rooms; room++) {
        const before = this.all().filter(h => h.alive).map(h => h.id);
        for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, room);
        this.vultureCheck(before);
      }
      const field = s.rivals.filter(h => h.alive);
      s.tour = field.length ? G.Tournament.create(field, s.rng.fork()) : null;
      if (s.tour) G.Tournament.runAll(s.tour);
      s.phase = 'ending';
      render();
    },
  };

  G.Game = Game;
  G.visualFor = visualFor;
})(window.G);
