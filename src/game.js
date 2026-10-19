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
    toTitle() { this.s = null; render(); },
    all() { return [this.s.player, ...this.s.rivals]; },

    // ---------- Timing ----------
    startTimer(seconds) { this.s.roundEnds = now() + seconds * 1000; this.s.roundTotal = seconds; },
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
          const got = G.Hero.heal(v, CFG().vultureHeal * lost);
          if (v.isPlayer && got) say(s, `${h.name} lost a heart. Vulture’s Heart heals you ${got}.`);
        }
      }
    },
    playerOut(text) {
      const s = this.s;
      s.phase = 'dead'; s.roundEnds = 0;
      s.notice = text;
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
      if (CFG().shopRooms.includes(s.room)) { this.startShop(); return; }
      s.doors = G.Dungeon.makeDoors(p, s.room, s.rng);
      for (const d of s.doors) if (d.monster) d.danger = G.Dungeon.danger(p, d, s.room);
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
        case 'reward': auto = `Time ran out. You ${G.AI.autoLoot(p, s.offer.items, s.room, s.offer.gold > 0)}.`; break;
        case 'spoils': auto = `Time ran out. You ${G.AI.autoSpoils(p, s.spoils)}.`; break;
        case 'mystery':
          if (s.mystery.id === 'ambush') { this.startBattle({ type: 'fight', monster: G.Dungeon.monsterFor(s.room, 'fight', s.rng) }, 'fight'); return; }
          break;
        case 'wager': auto = 'Time ran out. You walked away from the wager.'; break;
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
        for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, s.room);
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
      const pick = G.Hero.pendingPick(p);
      if (pick && pick.kind === 'spec') {
        s.phase = 'spec'; s.specOptions = s.specOptions && s.specFor === p.level ? s.specOptions : G.Dungeon.specOptions(p, s.rng); s.specFor = p.level;
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      if (pick && pick.kind === 'tree') {
        s.phase = 'tree'; s.treeLevel = pick.level;
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      if (s.room === CFG().gemRoom && !p.gem && !s.gemDone) {
        s.phase = 'gem'; s.gemOptions = s.gemOptions || G.Dungeon.gemOptions(p, s.rng);
        this.startTimer(CFG().roundSeconds); render(); return;
      }
      if (CFG().duelRooms.includes(s.room) && !s.duelDone) { this.startDuels(); return; }
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
        case 'forge': s.forge = { strengthened: false, rerolled: false, msg: null }; s.phase = 'forge'; break;
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
      const lv = G.Hero.gainXp(p, CFG().xp[k] || CFG().xp.fight);
      const xpNote = `+${CFG().xp[k] || CFG().xp.fight} XP${lv.length ? ` (you reached level ${p.level})` : ''}`;
      if (out === 'timeout') {
        p.gold = Math.max(0, p.gold - bet);
        this.completeRoom([...notes, `Neither side could finish it. ${xpNote}, no loot this time.${bet ? ` The bet is lost.` : ''}`].join(' '));
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
      if (s.phase !== 'wager' || (amount && p.gold < amount)) return;
      if (!amount) { this.completeRoom('You walked away from the wager.'); return; }
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
      } else if (kind === 'reroll' && !f.rerolled && p.gold >= F.rerollCost && it.rarity !== 'grey') {
        p.gold -= F.rerollCost; G.Dungeon.forgeReroll(it, s.rng); f.rerolled = true;
        f.msg = `New bonus: ${it.name}.`;
      }
      const max = G.Hero.maxHp(p); if (p.hp > max) p.hp = max;
      render();
    },
    leaveForge() { if (this.s.phase === 'forge') this.completeRoom(this.s.forge.strengthened || this.s.forge.rerolled ? 'You leave the forge.' : 'You leave the forge empty-handed.'); },

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
      this.startTimer(8);
      render();
    },
    startDuelFight() {
      const s = this.s, m = s.duel.mine;
      if (!m) return;
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
          if (pair.ghost) s.notice = won ? `You beat the ${oppName}. +${X.duelWin} XP.` : `The ${oppName} got the better of you. No heart lost. +${X.duelLoss} XP.`;
          else s.notice = won ? `You beat ${oppName}! +${CFG().duel.winGold} gold, +${X.duelWin} XP. Your health goes back to what it was.`
            : `${oppName} won the duel. You lose a heart (${s.player.hearts} left). +${X.duelLoss} XP. Your health goes back to what it was.`;
          s.duel.mine = null;
          s.roundKind = 'after';
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
      const order = alive.slice().sort((a, b) => pct(a) - pct(b) || G.Hero.power(a) - G.Hero.power(b));
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
        p.gold -= price;
        if (price === 0) m.freeUsed = true;
        const old = G.Hero.equip(p, it);
        if (old) p.gold += CFG().salvage[old.rarity];
        m.bought.push(id);
        m.msg = price === 0 ? `Haggled ${it.name} for free and equipped it.` : `Bought and equipped ${it.name}.`;
      } else if (kind === 'cons') {
        const c = G.CONSUMABLES[id];
        const price = id === 'potion' ? S.potionCost : c.price;
        if (p.gold < price || G.Hero.bagFull(p)) return;
        if (id === 'potion' && m.potions <= 0) return;
        p.gold -= price;
        if (id === 'potion') m.potions--;
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
        if (p.hp <= S.bloodCost[1] && p.gem !== 'stone') return;
        if (p.gem === 'stone' && p.hp <= 1) return;
        const cost = p.gem === 'stone' ? 1 : 2 * s.rng.int(S.bloodCost[0] / 2, S.bloodCost[1] / 2);
        p.hp -= cost; p.gold += S.bloodGold;
        m.msg = `The merchant takes ${cost} health and hands you ${S.bloodGold} gold.`;
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
          G.Tournament.resolve(T, m, fixed);
          const me = T.entrants.find(e => e.hero.isPlayer);
          const won = res.winner === 'a';
          if (m.ghost) s.notice = won ? `You beat the ${oppName}. You keep ${me.hp} health.` : `The ${oppName} beat you. No heart lost; you go on with ${me.hp} health.`;
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
