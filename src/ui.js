// All menus, panels and tooltips (plain HTML on top of the game).
window.G = window.G || {};

(function (G) {
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CFG = () => G.CONFIG;
  const tips = {}; let tipSeq = 0;
  const tip = (html) => { const id = 't' + (++tipSeq); tips[id] = html; return `data-tip="${id}" tabindex="0"`; };

  // ---------- Small builders ----------
  function hpBar(hp, max, cls = '') {
    const p = Math.max(0, Math.min(1, hp / max));
    return `<div class="hpbar ${cls}" role="img" aria-label="Health ${hp} of ${max}"><i style="width:${p * 100}%"></i><span>${hp} / ${max}</span></div>`;
  }

  function itemTip(item, hero) {
    const R = G.RARITY[item.rarity];
    const lines = G.Items.statLines(item).map(l => `<li>${esc(l.text)}</li>`).join('');
    let cmp = '';
    if (hero) {
      const eq = hero.gear[item.slot];
      if (eq && eq.id !== item.id) {
        const diffs = G.Items.compare(item, eq);
        cmp = `<div class="tt-cmp"><div class="tt-cmp-h">Compared to your ${esc(eq.name)}</div><ul>${
          diffs.map(d => `<li class="${d.d > 0 ? 'up' : 'down'}">${esc(d.text)}</li>`).join('') || '<li>Same stats</li>'}</ul></div>`;
      }
    }
    return `<div class="tt-title r-${item.rarity}">${esc(item.name)}</div>
      <div class="tt-sub">${R.name} ${item.slot === 'weapon' ? G.WEAPONS[item.weaponType].name : G.SLOT_NAMES[item.slot]} · Tier ${item.tier}</div>
      <ul class="tt-stats">${lines}</ul>
      ${item.trait ? `<div class="tt-trait">${esc(item.trait)}</div>` : ''}${cmp}`;
  }

  function verdict(hero, item) {
    const eq = hero.gear[item.slot];
    if (!eq) return { cls: 'up', text: 'New slot' };
    const now = G.Hero.power(hero), w = G.Hero.powerWith(hero, item);
    const d = Math.round(w) - Math.round(now);
    if (d > 0) return { cls: 'up', text: `Upgrade +${d} Power` };
    if (d < 0) return { cls: 'down', text: `Downgrade ${d} Power` };
    return { cls: 'side', text: 'Sidegrade' };
  }

  function itemCard(item, hero, btn) {
    const v = verdict(hero, item);
    const eq = hero.gear[item.slot];
    const diffs = eq ? G.Items.compare(item, eq) : [];
    return `<article class="card item r-${item.rarity}">
      <div class="item-head">
        <span class="ico-wrap r-${item.rarity}">${G.Art.icon(item.iconKey)}</span>
        <div class="item-name"><b class="r-${item.rarity}">${esc(item.name)}</b>
          <small>${G.RARITY[item.rarity].name} ${item.slot === 'weapon' ? esc(G.WEAPONS[item.weaponType].name) : G.SLOT_NAMES[item.slot]}</small></div>
        <span class="verdict ${v.cls}">${v.text}</span>
      </div>
      <ul class="stat-list">${G.Items.statLines(item).map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>
      ${item.trait ? `<p class="trait">${esc(item.trait)}</p>` : ''}
      ${eq ? `<div class="cmp"><span>Replaces ${esc(eq.name)}</span><ul>${diffs.map(d => `<li class="${d.d > 0 ? 'up' : 'down'}">${esc(d.text)}</li>`).join('')}</ul></div>` : ''}
      ${btn}
    </article>`;
  }

  // ---------- Side panels ----------
  function gearPanel(hero) {
    return `<section class="panel"><h3>Gear</h3><div class="gear-grid">${G.SLOTS.map(slot => {
      const it = hero.gear[slot];
      if (!it) return `<div class="slot empty" ${tip(`<div class="tt-title">${G.SLOT_NAMES[slot]}</div><div class="tt-sub">Empty. Loot leans toward empty slots.</div>`)}>
        <span class="ico-wrap">${G.Art.icon(slot)}</span><small>${G.SLOT_NAMES[slot]}</small></div>`;
      return `<div class="slot r-${it.rarity}" ${tip(itemTip(it))}><span class="ico-wrap r-${it.rarity}">${G.Art.icon(it.iconKey)}</span><small>${esc(it.name)}</small></div>`;
    }).join('')}</div></section>`;
  }

  function statRows(hero) {
    const s = G.Stats.compute(hero);
    const I = G.STAT_INFO;
    const row = (label, val, info, extra = '') =>
      `<li ${tip(`<div class="tt-title">${label}</div><p>${esc(info)}</p>${extra ? `<p class="tt-extra">${extra}</p>` : ''}`)}><span>${label}</span><b>${val}</b></li>`;
    const rows = [
      row('Health', `${hero.hp} / ${s.maxHp}`, 'Your health carries from room to room. It only comes back from campfires, potions, springs and Life on Hit. At 0 you are out.'),
      row('Damage', s.dmg, I.dmg.desc),
      row('Speed', s.spd, I.spd.desc, `You attack every ${Math.round(100 / s.spd) / 10} seconds.`),
      row('Armor', s.armor, I.armor.desc),
      row('Crit', s.crit, I.crit.desc, `Your crits hit for ${s.dmg * 2 + s.critDmg}.`),
    ];
    if (s.critDmg) rows.push(row('Crit Damage', s.critDmg, I.critDmg.desc));
    rows.push(row('Dodge', s.dodge, I.dodge.desc));
    for (const k of ['shield', 'leech', 'bleed', 'stun']) if (s[k] > 0) rows.push(row(I[k].label, s[k], I[k].desc));
    rows.push(row('Power', Math.round(G.Stats.power(s)), 'A rough single number for how strong your build is, combining offense and defense. Use it to size up rivals.'));
    return rows.join('');
  }

  function specChip(hero) {
    if (!hero.spec) return `<span class="chip muted" ${tip(`<div class="tt-title">No specialization yet</div><p>You choose one after room ${CFG().specRoom}.</p>`)}>Spec at room ${CFG().specRoom}</span>`;
    const S = G.SPECS[hero.spec];
    return `<span class="chip" ${tip(`<div class="tt-title">${S.name} <small>${S.role}</small></div><p>${esc(S.desc)}</p>`)}>${S.name}</span>`;
  }

  function statsPanel(hero) {
    return `<section class="panel"><h3>Stats ${specChip(hero)}</h3><ul class="stats">${statRows(hero)}</ul></section>`;
  }

  function rivalTip(r) {
    const s = G.Stats.compute(r);
    const gear = G.SLOTS.map(slot => r.gear[slot] ? `<li class="r-${r.gear[slot].rarity}">${esc(r.gear[slot].name)}</li>` : '').join('');
    return `<div class="tt-title">${esc(r.name)}</div>
      <div class="tt-sub">${r.spec ? G.SPECS[r.spec].name : 'No spec yet'} · Power ${Math.round(G.Stats.power(s))} · ${r.gold} gold</div>
      <ul class="tt-stats">${gear}</ul>
      <p class="tt-extra">${s.dmg} Damage, ${s.spd} Speed, ${s.armor} Armor, ${s.dodge} Dodge, ${s.crit} Crit</p>`;
  }

  function rivalsPanel(st) {
    const rows = st.rivals.map(r => {
      const max = G.Hero.maxHp(r);
      const col = '#' + r.tint.toString(16).padStart(6, '0');
      return `<li class="rival ${r.alive ? '' : 'dead'}" ${tip(rivalTip(r))}>
        <span class="dot" style="background:${col}"></span>
        <div class="rv-main"><div class="rv-top"><b>${esc(r.name)}</b><span class="rv-spec">${r.spec ? G.SPECS[r.spec].name : ''}</span>
          <span class="rv-wpn">${r.gear.weapon ? G.Art.icon(r.gear.weapon.weaponType) : ''}</span></div>
          ${r.alive ? hpBar(r.hp, max, 'thin') : `<div class="fell">Fell in room ${r.diedRoom}</div>`}
          <div class="rarity-dots">${G.SLOTS.map(sl => `<i class="${r.gear[sl] ? 'r-' + r.gear[sl].rarity : 'none'}"></i>`).join('')}<span>${r.alive ? esc(r.lastAction || '') : ''}</span></div>
        </div></li>`;
    }).join('');
    const alive = st.rivals.filter(r => r.alive).length;
    return `<section class="panel"><h3>Rivals <span class="chip muted">${alive} alive</span></h3><ul class="rivals">${rows}</ul></section>`;
  }

  function topbar(st) {
    const p = st.player, max = G.Hero.maxHp(p);
    const pips = [];
    for (let r = 1; r <= CFG().rooms; r++) {
      const cls = r < st.room ? 'done' : r === st.room ? 'now' : '';
      pips.push(`<i class="${cls} ${CFG().bossRooms[r] ? 'boss' : ''} ${r === CFG().specRoom ? 'spec' : ''}"></i>`);
    }
    const roomLabel = st.room > CFG().rooms ? 'Tournament' : st.roundKind === 'spec' ? `Specialization <small>after room ${st.room}</small>` : `Room ${st.room} <small>of ${CFG().rooms}${st.room === 1 ? ' \u00b7 the Armory' : ''}</small>`;
    return `<header class="top">
      <div class="brand">Thirty Doors</div>
      <div class="track"><div class="room-label">${roomLabel}</div><div class="pips" aria-hidden="true">${pips.join('')}</div></div>
      <div class="clock" id="clock" ${tip('<div class="tt-title">Round timer</div><p>Every round lasts 30 seconds for everyone. Anything you haven\u2019t decided when it hits zero is decided for you.</p>')}><b id="clock-num">${timerText()}</b><i><span id="clock-bar" style="width:${timerPct()}%"></span></i></div>
      <div class="vitals">${hpBar(p.hp, max)}<div class="gold" ${tip('<div class="tt-title">Gold</div><p>Spend it at merchants on potions and gear.</p>')}><span class="coin"></span>${p.gold}</div></div>
    </header>`;
  }

  function timerText() {
    const t = G.Game.timeLeft();
    return t == null || !G.Game.s.roundEnds ? '\u2014' : `0:${String(Math.ceil(t)).padStart(2, '0')}`;
  }
  function timerPct() {
    const st = G.Game.s, t = G.Game.timeLeft();
    if (!st || !st.roundEnds || t == null) return 0;
    const total = st.roundKind === 'tour' ? CFG().tourBreakSeconds : CFG().roundSeconds;
    return Math.max(0, Math.min(100, (t / total) * 100));
  }

  // ---------- Stage screens ----------
  const DANGER_TIP = '<div class="tt-title">Danger</div><p>An estimate from a few practice fights against this monster with your current gear and health.</p>';

  function doorsScreen(st) {
    const doors = st.doors.map((d, i) => {
      const info = G.Dungeon.doorInfo(d);
      const dg = d.danger ? `<span class="danger d-${d.danger.level.toLowerCase()}" ${tip(DANGER_TIP + `<p class="tt-extra">Average health lost: ${d.danger.avgLoss}</p>`)}>${d.danger.level} danger · ~${d.danger.avgLoss} dmg</span>` : '';
      return `<div class="door door-${d.type}">
        <button class="door-btn" data-act="door" data-i="${i}">
          <span class="door-arch">${G.Art.icon('door_' + d.type, 'big')}</span>
          <span class="door-title">${info.title}</span>
          <span class="door-text">${esc(info.text)}</span>
        </button>${dg}</div>`;
    }).join('');
    const boss = st.doors.length === 1;
    return `<section class="screen">
      ${st.notice ? `<p class="notice">${esc(st.notice)}</p>` : ''}
      <h2>${boss ? 'A single door, sealed with iron' : 'Two doors'}</h2>
      <p class="lede">${boss ? 'No way around it. Win to continue.' : 'Pick one. Your health does not refill between rooms.'}</p>
      <div class="doors ${boss ? 'one' : ''}">${doors}</div>
    </section>`;
  }

  function battleScreen(st) {
    const b = st.battle;
    return `<section class="screen battle">
      <h2>${esc(b.title)}</h2>
      <div id="arena-slot" class="arena-slot"></div>
      <div class="battle-bar"><span class="speed-tag" id="speed-tag">1x speed</span><small>Fights speed up to 2x after ${CFG().combat.fastAfter} seconds.</small></div>
      <ol id="battle-log" class="log" aria-live="polite"></ol>
    </section>`;
  }

  function armoryScreen(st) {
    const p = st.player;
    const cards = st.armory.map(it => itemCard(it, p, `<button data-act="weapon" data-id="${it.id}">Take the ${esc(G.WEAPONS[it.weaponType].name)}</button>`)).join('');
    return `<section class="screen"><h2>The Armory</h2>
      <p class="lede">Racks of old steel. Every warrior gets three to choose from. Pick the one you want to build around.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  function waitScreen(st) {
    const what = st.roundKind === 'spec' ? 'Specialization chosen' : st.room === 1 ? 'Armed and ready' : 'Room cleared';
    return `<section class="screen wait"><h2>${what}</h2>
      ${st.lastText ? `<p class="lede">${esc(st.lastText)}</p>` : ''}
      <p class="waiting">Waiting for the other warriors. Next round in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b></p></section>`;
  }

  function rewardScreen(st) {
    const o = st.offer, p = st.player;
    const cards = o.items.map(it => itemCard(it, p, `<button data-act="take" data-id="${it.id}">Equip</button>`)).join('');
    return `<section class="screen">
      <h2>${esc(o.title)}</h2><p class="lede">${esc(o.text)}</p>
      <div class="cards">${cards}</div>
      <div class="row-actions">${o.gold ? `<button class="ghost" data-act="gold">Leave the items, take ${o.gold} gold</button>` : `<button class="ghost" data-act="gold">Take nothing</button>`}</div>
    </section>`;
  }

  function shopScreen(st) {
    const p = st.player, S = CFG().shop;
    const full = p.hp >= G.Hero.maxHp(p);
    const used = st.shop.potions >= S.potionsPerVisit;
    const cards = st.shop.items.map(it => {
      const price = G.Dungeon.itemPrice(it), sold = st.shop.bought.includes(it.id);
      return itemCard(it, p, sold ? '<button disabled>Sold</button>' :
        `<button data-act="buy" data-id="${it.id}" ${p.gold < price ? 'disabled' : ''}>Buy for ${price} gold</button>`);
    }).join('');
    return `<section class="screen"><h2>Merchant</h2>
      <p class="lede">A hooded trader with a lantern and a very heavy pack. He also buys blood.</p>
      ${st.shop.msg ? `<p class="notice">${esc(st.shop.msg)}</p>` : ''}
      <div class="shop-row">
        <div class="potion card"><span class="flask"></span><div><b>Health potion</b><small>Restores ${S.potionHeal} health. One per visit.</small></div>
          <button data-act="potion" ${p.gold < S.potionCost || full || used ? 'disabled' : ''}>${used ? 'Bought' : full ? 'At full health' : `Buy for ${S.potionCost} gold`}</button></div>
        <div class="potion card"><span class="flask blood"></span><div><b>Sell blood</b><small>Lose ${S.bloodCost[0]} to ${S.bloodCost[1]} health, gain ${S.bloodGold} gold. As often as you dare.</small></div>
          <button data-act="blood" ${p.hp <= S.bloodCost[1] ? 'disabled' : ''}>${p.hp <= S.bloodCost[1] ? 'Too weak' : `Bleed for ${S.bloodGold} gold`}</button></div>
      </div>
      <div class="cards">${cards}</div>
      <div class="row-actions"><button class="ghost" data-act="leave">Leave the shop</button></div></section>`;
  }

  function mysteryScreen(st) {
    const m = st.mystery, p = st.player;
    let acts = '';
    if (m.id === 'spring') acts = `<button data-act="mystery" data-v="spring">Drink (+${CFG().springHeal} health)</button>`;
    if (m.id === 'cache') acts = `<button data-act="mystery" data-v="cache">Take the gold</button>`;
    if (m.id === 'ambush') acts = `<button data-act="mystery" data-v="ambush">Fight</button>`;
    if (m.id === 'shrine') {
      const cost = CFG().shrineCost;
      acts = `<button data-act="mystery" data-v="shrine" ${p.hp <= cost ? 'disabled' : ''}>Offer ${cost} health for an uncommon or better item</button>
        <button class="ghost" data-act="mystery" data-v="leave">Walk away</button>`;
    }
    return `<section class="screen"><h2>${esc(m.title)}</h2><p class="lede">${esc(m.text)}</p><div class="row-actions">${acts}</div></section>`;
  }

  function specScreen(st) {
    const cards = st.specOptions.map(id => {
      const S = G.SPECS[id];
      return `<article class="card spec"><div class="spec-head"><b>${S.name}</b><small>${S.role}</small></div>
        <p>${esc(S.desc)}</p><p class="trait">${esc(S.tip)}</p>
        <button data-act="spec" data-id="${id}">Become a ${S.name}</button></article>`;
    }).join('');
    return `<section class="screen"><h2>Choose your specialization</h2>
      <p class="lede">This defines your build for the rest of the run. Rivals are choosing theirs too.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  function deadScreen(st) {
    const killer = st.notice || `${st.battle ? st.battle.title : 'The dungeon'} ended your run.`;
    return `<section class="screen end"><h2>You fell in room ${st.player.diedRoom}</h2>
      <p class="lede">${esc(killer)} In a full game you'd be spectating now.</p>
      <div class="row-actions"><button data-act="ending">See how the run ended</button><button class="ghost" data-act="title">Try again</button></div></section>`;
  }

  function tourTable(T) {
    return `<div class="table-wrap"><table class="tour"><thead><tr><th>Seed</th><th>Warrior</th><th>Spec</th><th>Health</th><th>Arena health</th></tr></thead><tbody>${
      T.entrants.map(e => `<tr class="${e.hero.isPlayer ? 'me' : ''}"><td>${e.seed}</td><td>${esc(e.hero.name)}</td><td>${e.hero.spec ? G.SPECS[e.hero.spec].name : '—'}</td>
        <td>${e.before}</td><td><b>${e.entryHp}</b> <small>/ ${e.maxHp} (+${e.heal})</small></td></tr>`).join('')}</tbody></table></div>`;
  }

  function roundsList(T) {
    return T.rounds.map(r => `<div class="round"><h4>${r.name}</h4><ul>
      ${r.byes.map(e => `<li class="bye">${esc(e.hero.name)} <small>waits (bye)</small></li>`).join('')}
      ${r.matches.map(m => {
        if (!m.result) return `<li>${esc(m.a.hero.name)} <small>vs</small> ${esc(m.b.hero.name)}</li>`;
        const left = m.winner === m.a ? m.result.aHp : m.result.bHp;
        const lose = m.winner === m.a ? m.b : m.a;
        return `<li><b>${esc(m.winner.hero.name)}</b> <small>beat</small> ${esc(lose.hero.name)} <small>(${left} health left${m.result.timeout ? ', on time' : ''})</small></li>`;
      }).join('')}</ul></div>`).join('');
  }

  function placements(T) {
    const sorted = T.entrants.slice().sort((a, b) => a.place - b.place);
    const ord = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
    return `<ol class="places">${sorted.map(e => `<li class="${e.hero.isPlayer ? 'me' : ''}"><span>${ord(e.place)}</span>${esc(e.hero.name)}</li>`).join('')}</ol>`;
  }

  function tournamentScreen(st) {
    const T = st.tour;
    if (T.champion) {
      const won = T.champion.hero.isPlayer;
      return `<section class="screen end"><h2>${won ? 'You are the strongest warrior in the dungeon' : `${esc(T.champion.hero.name)} wins the tournament`}</h2>
        <p class="lede">${T.entrants.length === 1 ? 'Everyone else fell in the dungeon. Last one standing.' : won ? 'Thirty rooms, and nobody could stop you.' : 'You made it through the dungeon. Next time, the arena.'}</p>
        ${placements(T)}${roundsList(T)}
        <div class="row-actions"><button data-act="title">Play again</button></div></section>`;
    }
    const m = G.Tournament.nextMatch(T);
    const mine = m && (m.a.hero.isPlayer || m.b.hero.isPlayer);
    return `<section class="screen"><h2>The Tournament</h2>
      <p class="lede">Everyone enters with the health they left the dungeon with, plus the heal shown below. Every match starts at that arena health. Top seeds get byes.</p>
      ${tourTable(T)}${roundsList(T)}
      <p class="waiting">${mine ? 'Your match starts' : 'Next matches start'} in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b></p></section>`;
  }

  function endingScreen(st) {
    const T = st.tour;
    const fallen = [st.player, ...st.rivals].filter(r => !r.alive).sort((a, b) => b.diedRoom - a.diedRoom)
      .map(r => `<li>${esc(r.name)} <small>fell in room ${r.diedRoom}</small></li>`).join('');
    return `<section class="screen end"><h2>${T ? `${esc(T.champion.hero.name)} won the tournament` : 'Nobody made it out'}</h2>
      ${T ? placements(T) + roundsList(T) : '<p class="lede">The dungeon claimed every warrior.</p>'}
      ${fallen ? `<div class="round"><h4>Fell in the dungeon</h4><ul>${fallen}</ul></div>` : ''}
      <div class="row-actions"><button data-act="title">Play again</button></div></section>`;
  }

  function titleScreen() {
    return `<div class="title-screen">
      <header class="hero-head"><div class="eyebrow">Prototype · single player</div><h1>Thirty Doors</h1>
        <p>Six warriors. Thirty rooms each. Two doors at every step. Your health never refills on its own, and at the end, the survivors fight for the crown.</p></header>
      <ul class="rules">
        <li><b>The Armory</b>Room 1: everyone picks one of three random weapons.</li>
        <li><b>30-second rounds</b>Pick one of two doors each room. Fights, treasure, campfires, merchants, unknowns. The clock waits for no one.</li>
        <li><b>No free healing</b>Health carries over. Hit zero and you're out.</li>
        <li><b>Room ${CFG().specRoom}</b>Choose a specialization that defines your build.</li>
        <li><b>The tournament</b>Survivors heal ${Math.round(CFG().arenaHealPct * 100)}% and fight a bracket. Best health gets a bye.</li>
      </ul>
      <div class="row-actions"><button class="enter" data-act="start">Enter the dungeon</button></div>
    </div>`;
  }

  // ---------- Render ----------
  function render() {
    hideTip();
    for (const k in tips) delete tips[k];
    const app = $('#app'), st = G.Game.s;
    if (!st || st.phase !== 'battle') G.Arena.stop();
    if (!st) { app.innerHTML = titleScreen(); window.scrollTo(0, 0); return; }
    const screens = { doors: doorsScreen, battle: battleScreen, armory: armoryScreen, wait: waitScreen, reward: rewardScreen, shop: shopScreen,
      mystery: mysteryScreen, spec: specScreen, dead: deadScreen, tournament: tournamentScreen, ending: endingScreen };
    const prevPhase = app.dataset.phase;
    const notice = st.notice && st.phase !== 'dead' ? `<p class="notice">${esc(st.notice)}</p>` : '';
    app.innerHTML = `<div class="shell">${topbar(st)}<div class="cols"><main class="stage">${notice}${screens[st.phase](st)}</main>
      <aside class="side">${gearPanel(st.player)}${statsPanel(st.player)}${rivalsPanel(st)}</aside></div></div>`;
    app.dataset.phase = st.phase;
    if (st.phase !== prevPhase) window.scrollTo(0, 0);
    if (st.phase === 'battle') startBattleView(st);
  }

  // Updates only the clock each tick, never the whole screen (a re-render would cut off a running fight)
  function tickClock() {
    G.Game.tick();
    const left = G.Game.timeLeft();
    const n = document.getElementById('clock-num'); if (n) n.textContent = timerText();
    const b = document.getElementById('clock-bar'); if (b) b.style.width = timerPct() + '%';
    const w = document.getElementById('wait-num'); if (w) w.textContent = Math.ceil(left || 0) + 's';
    const c = document.getElementById('clock');
    if (c) c.classList.toggle('low', !!(G.Game.s && G.Game.s.roundEnds) && left <= 5);
  }

  function logLine(e, b) {
    const subj = k => (k === 'a' ? b.left.name : b.right.name);
    const obj = k => { const n = subj(k); return n === 'You' ? 'you' : n; };
    const verb = (k, v, vs) => (subj(k) === 'You' ? v : vs);
    switch (e.type) {
      case 'hit': return `${subj(e.src)} ${e.counter ? verb(e.src, 'counter', 'counters') : verb(e.src, 'hit', 'hits')} ${obj(e.tgt)} for ${e.amount}${e.crit ? ' (crit)' : ''}${e.absorbed ? ` (shield took ${e.absorbed})` : ''}`;
      case 'bleed': return `${subj(e.tgt)} ${verb(e.tgt, 'bleed', 'bleeds')} for ${e.amount}`;
      case 'dodge': return `${subj(e.tgt)} ${verb(e.tgt, 'dodge', 'dodges')}`;
      case 'hidden': return `${subj(e.src)} ${verb(e.src, 'swing', 'swings')} at shadows`;
      case 'parry': return `${subj(e.tgt)} ${verb(e.tgt, 'parry', 'parries')}`;
      case 'stun': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} stunned`;
      case 'heal': return `${subj(e.src)} ${verb(e.src, 'heal', 'heals')} ${e.amount}`;
      case 'stealth_on': return `${subj(e.src)} ${verb(e.src, 'vanish', 'vanishes')}`;
      case 'death': return `${subj(e.tgt)} ${verb(e.tgt, 'fall', 'falls')}`;
      case 'timeout': return 'Time runs out';
      default: return null;
    }
  }

  function startBattleView(st) {
    const b = st.battle, slot = document.getElementById('arena-slot');
    const lines = [];
    G.Arena.onSpeed = n => { const t = document.getElementById('speed-tag'); if (t) { t.textContent = n + 'x speed'; t.classList.add('fast'); } };
    G.Arena.start(slot, {
      left: b.left, right: b.right, result: b.res,
      onEvent: e => {
        const l = logLine(e, b);
        if (!l) return;
        lines.push(l);
        const ol = document.getElementById('battle-log');
        if (ol) ol.innerHTML = lines.slice(-6).map(x => `<li>${esc(x)}</li>`).join('');
      },
      onDone: () => setTimeout(() => { if (G.Game.s && G.Game.s.battle === b) b.onDone(); }, 300),
    });
  }

  // ---------- Input ----------
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act, Gm = G.Game;
    switch (a) {
      case 'start': Gm.newRun(); break;
      case 'door': Gm.chooseDoor(+el.dataset.i); break;
      case 'weapon': Gm.pickWeapon(el.dataset.id); break;
      case 'take': Gm.takeItem(el.dataset.id); break;
      case 'gold': Gm.takeGold(); break;
      case 'potion': Gm.buyPotion(); break;
      case 'blood': Gm.bleedForGold(); break;
      case 'buy': Gm.buyItem(el.dataset.id); break;
      case 'leave': Gm.leaveShop(); break;
      case 'mystery': Gm.mysteryAct(el.dataset.v); break;
      case 'spec': Gm.chooseSpec(el.dataset.id); break;
      case 'ending': Gm.seeEnding(); break;
      case 'title': Gm.toTitle(); break;
    }
  }

  // ---------- Tooltips (hover on desktop, tap on phones) ----------
  let tipOwner = null;
  function showTip(el) {
    const html = tips[el.dataset.tip];
    if (!html) return;
    const t = $('#tooltip');
    t.innerHTML = html;
    t.hidden = false;
    tipOwner = el;
    const r = el.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = Math.min(vw - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
    let y = r.bottom + 8;
    if (y + th > vh - 8) y = Math.max(8, r.top - th - 8);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { const t = $('#tooltip'); if (t) t.hidden = true; tipOwner = null; }

  function bindTips() {
    document.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch') return;
      const el = e.target.closest('[data-tip]');
      if (el && el !== tipOwner) showTip(el);
    });
    document.addEventListener('pointerout', e => {
      if (e.pointerType === 'touch') return;
      const el = e.target.closest('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) hideTip();
    });
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const el = e.target.closest('[data-tip]');
      if (el) { if (tipOwner === el) hideTip(); else showTip(el); }
      else if (!e.target.closest('#tooltip')) hideTip();
    });
    document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
    document.addEventListener('focusout', () => hideTip());
    window.addEventListener('scroll', hideTip, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  }

  function init() {
    document.addEventListener('click', onClick);
    bindTips();
    render();
    setInterval(tickClock, 200);
  }

  G.UI = { render, init };
})(window.G);
