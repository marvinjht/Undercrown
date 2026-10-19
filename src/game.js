// Single-player run state and actions. Every round lasts CONFIG.roundSeconds for everyone;
// when time runs out, whatever is left is decided automatically (like a server would).
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const render = () => G.UI.render();
  const now = () => Date.now();

  const Game = {
    s: null,

    newRun() {
      const seed = G.newSeed();
      const rng = new G.RNG(seed);
      const player = G.Hero.create({ name: 'You', isPlayer: true, tint: G.PLAYER_TINT }, rng.fork());
      const rivals = G.RIVALS.map(r => G.Hero.create({ name: r.name, tint: r.tint }, rng.fork()));
      this.s = { seed, rng, player, rivals, room: 1, phase: 'doors', roundKind: 'room', roundEnds: 0, notice: null, lastText: '' };
      this.startRoom();
    },

    toTitle() { this.s = null; render(); },

    // ---------- Round timing ----------
    startTimer(seconds) { this.s.roundEnds = now() + seconds * 1000; },
    timeLeft() { const s = this.s; return s && s.roundEnds ? Math.max(0, (s.roundEnds - now()) / 1000) : null; },
    tick() {
      const s = this.s;
      if (!s || !s.roundEnds || now() < s.roundEnds) return;
      s.roundEnds = 0;
      if (s.roundKind === 'tour') this.tourStep();
      else this.timeUp();
    },

    startRoom() {
      const s = this.s;
      s.roundKind = 'room';
      s.doors = G.Dungeon.makeDoors(s.player, s.room, s.rng);
      for (const d of s.doors) if (d.monster) d.danger = G.Dungeon.danger(s.player, d, s.room);
      s.phase = 'doors';
      this.startTimer(CFG().roundSeconds);
      render();
    },

    // Player finished the room early: wait for the clock like everyone else
    completeRoom(text) {
      const s = this.s;
      if (text) s.lastText = text;
      s.phase = 'wait';
      render();
    },

    // Time ran out: decide whatever the player hasn't
    timeUp() {
      const s = this.s, p = s.player;
      let auto = null;
      switch (s.phase) {
        case 'doors': {
          const d = G.AI.chooseDoor(p, s.doors, s.room, p.rng);
          auto = `Time ran out, so the dungeon chose for you: ${G.Dungeon.doorInfo(d).title}. You ${G.AI.resolveDoor(p, d, s.room, s.rng)}.`;
          break;
        }
        case 'armory': {
          const it = s.rng.pick(s.armory);
          G.Hero.equip(p, it);
          auto = `Time ran out. You grabbed the ${it.name}.`;
          break;
        }
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
        case 'spec': {
          const id = G.AI.autoSpec(p, s.specOptions);
          auto = `Time ran out. You became a ${G.SPECS[id].name}.`;
          break;
        }
      }
      if (!p.alive) { s.phase = 'dead'; s.roundEnds = 0; s.notice = auto; render(); return; }
      s.notice = auto;
      this.endRound();
    },

    endRound() {
      const s = this.s;
      if (s.roundKind === 'room') {
        for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, s.room);
        if (s.room === CFG().specRoom && !s.player.spec) {
          s.roundKind = 'spec';
          s.specOptions = G.Dungeon.specOptions(s.player, s.rng);
          s.phase = 'spec';
          this.startTimer(CFG().roundSeconds);
          render();
          return;
        }
      }
      s.room++;
      if (s.room > CFG().rooms) { this.startTournament(); return; }
      this.startRoom();
    },

    // ---------- Room actions ----------
    chooseDoor(i) {
      const s = this.s, d = s.doors[i], p = s.player;
      if (s.phase !== 'doors') return;
      s.door = d; s.notice = null;
      switch (d.type) {
        case 'armory':
          s.armory = G.Loot.armory(s.rng);
          s.phase = 'armory'; break;
        case 'fight': case 'elite': case 'boss':
          this.startBattle(d.monster, d.type, d.type); return;
        case 'treasure':
          s.offer = { items: G.Loot.offer(p, s.room, 'treasure', s.rng), gold: CFG().gold.skipItemBase + 2 * Math.round(s.room / 2), title: 'Treasure', text: 'A chest, untouched. Take one item.' };
          s.phase = 'reward'; break;
        case 'rest': {
          const healed = G.Hero.heal(p, CFG().restHeal);
          this.completeRoom(healed > 0 ? `You rested by the fire and recovered ${healed} health.` : 'You rested by the fire. You were already at full health.');
          return;
        }
        case 'shop':
          s.shop = { items: G.Loot.offer(p, s.room, 'shop', s.rng, 2), bought: [], potions: 0, msg: null };
          s.phase = 'shop'; break;
        case 'mystery':
          s.mystery = G.Dungeon.rollMystery(s.rng);
          s.phase = 'mystery'; break;
      }
      render();
    },

    pickWeapon(id) {
      const s = this.s, it = s.armory.find(x => x.id === id);
      G.Hero.equip(s.player, it);
      this.completeRoom(`You took the ${it.name}. The real run starts next room.`);
    },

    startBattle(monster, kind, lootKind) {
      const s = this.s;
      const ms = G.Dungeon.monsterStats(monster, s.room, kind);
      const ps = G.Stats.compute(s.player);
      const res = G.simulateFight(ps, ms, { seed: s.rng.int(0, 1e9), aHp: s.player.hp });
      s.battle = {
        kind, lootKind, monster, res, title: G.Dungeon.monsterName(monster, kind),
        left: { name: 'You', texture: 'hero', weapon: 'weapon_' + ps.weaponType, tint: G.PLAYER_TINT, hp: s.player.hp, maxHp: ps.maxHp, shield: ps.shield },
        right: { name: G.Dungeon.monsterName(monster, kind), texture: 'monster_' + monster.id, tint: kind === 'elite' ? 0xffb8a8 : null,
          hp: ms.maxHp, maxHp: ms.maxHp, shield: 0, scale: kind === 'elite' ? 1.15 : 1 },
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
      if (out === 'dead') { s.phase = 'dead'; s.roundEnds = 0; if (!silent) render(); return; }
      if (out === 'timeout') {
        s.phase = 'wait';
        s.lastText = 'Neither of you could finish it. The monster slinks away. No loot this time.';
        if (!silent) render();
        return;
      }
      const gold = G.Dungeon.goldFor(b.kind === 'fight' ? 'fight' : b.kind, p, s.rng);
      p.gold += gold;
      s.offer = {
        items: G.Loot.offer(p, s.room, b.lootKind, s.rng), gold: CFG().gold.skipItemBase + 2 * Math.round(s.room / 2),
        title: 'Victory', text: `${b.title} is down. You found ${gold} gold. Choose one item.`,
      };
      s.phase = 'reward';
      if (!silent) render();
    },

    takeItem(id) {
      const s = this.s;
      const it = s.offer.items.find(x => x.id === id);
      const old = G.Hero.equip(s.player, it);
      if (old) s.player.gold += CFG().salvage[old.rarity];
      this.completeRoom(old ? `Equipped ${it.name}. Scrapped ${old.name} for ${CFG().salvage[old.rarity]} gold.` : `Equipped ${it.name}.`);
    },
    takeGold() {
      const s = this.s;
      s.player.gold += s.offer.gold;
      this.completeRoom(s.offer.gold ? `Took ${s.offer.gold} gold.` : 'You left with nothing.');
    },

    // ---------- Shop ----------
    buyPotion() {
      const s = this.s, S = CFG().shop;
      if (s.player.gold < S.potionCost || s.shop.potions >= S.potionsPerVisit) return;
      s.player.gold -= S.potionCost;
      s.shop.potions++;
      s.shop.msg = `Drank a potion: +${G.Hero.heal(s.player, S.potionHeal)} health.`;
      render();
    },
    bleedForGold() {
      const s = this.s, S = CFG().shop;
      if (s.player.hp <= S.bloodCost[1]) return;
      const cost = 2 * s.rng.int(S.bloodCost[0] / 2, S.bloodCost[1] / 2);
      s.player.hp -= cost;
      s.player.gold += S.bloodGold;
      s.shop.msg = `The merchant takes ${cost} health and hands you ${S.bloodGold} gold.`;
      render();
    },
    buyItem(id) {
      const s = this.s, it = s.shop.items.find(x => x.id === id);
      const price = G.Dungeon.itemPrice(it);
      if (!it || s.player.gold < price || s.shop.bought.includes(id)) return;
      s.player.gold -= price;
      const old = G.Hero.equip(s.player, it);
      if (old) s.player.gold += CFG().salvage[old.rarity];
      s.shop.bought.push(id);
      s.shop.msg = `Bought and equipped ${it.name}.`;
      render();
    },
    leaveShop() { this.completeRoom(this.s.shop.msg || 'You left the merchant.'); },

    // ---------- Mystery events ----------
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
      s.lastText = `You are now a ${G.SPECS[id].name}.`;
      s.phase = 'wait';
      render();
    },

    // ---------- Tournament (runs on its own clock) ----------
    startTournament() {
      const s = this.s;
      const field = [s.player, ...s.rivals].filter(h => h.alive);
      s.tour = G.Tournament.create(field, s.rng.fork());
      s.phase = 'tournament';
      s.roundKind = 'tour';
      if (!s.tour.champion) this.startTimer(CFG().tourBreakSeconds); else s.roundEnds = 0;
      render();
    },
    // Resolve AI matches until the player's match is up or the round changes
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
      const def = e => {
        const st = G.Stats.compute(e.hero);
        return { name: e.hero.name, texture: 'hero', weapon: 'weapon_' + st.weaponType, tint: e.hero.tint, hp: e.entryHp, maxHp: e.maxHp, shield: st.shield };
      };
      s.battle = {
        tour: true, match: m, res, title: `${G.Tournament.currentRound(T).name}: ${m.a.hero.name} vs ${m.b.hero.name}`,
        left: def(m.a), right: def(m.b), done: false,
        onDone: () => {
          if (s.battle.done) return;
          s.battle.done = true;
          G.Tournament.resolve(T, m, res);
          s.phase = 'tournament';
          if (!T.champion) this.startTimer(CFG().tourBreakSeconds);
          render();
        },
      };
      s.phase = 'battle';
      render();
    },

    // After the player dies: finish the run for everyone else
    seeEnding() {
      const s = this.s;
      for (let room = s.room; room <= CFG().rooms; room++) for (const r of s.rivals) if (r.alive) G.AI.aiRoom(r, room);
      const field = s.rivals.filter(h => h.alive);
      s.tour = field.length ? G.Tournament.create(field, s.rng.fork()) : null;
      if (s.tour) G.Tournament.runAll(s.tour);
      s.phase = 'ending';
      render();
    },
  };

  G.Game = Game;
})(window.G);
