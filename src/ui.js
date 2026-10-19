// All menus, panels and tooltips (plain HTML on top of the game).
window.G = window.G || {};

(function (G) {
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CFG = () => G.CONFIG;
  const tips = {}; let tipSeq = 0;
  const tip = (html) => { const id = 't' + (++tipSeq); tips[id] = html; return `data-tip="${id}" tabindex="0"`; };
  const RANGE_NAMES = { melee: 'Melee', near: 'Near range', far: 'Far range' };
  let bagOpen = -1;

  // ---------- Health bars with a preview of what just changed ----------
  const lastHp = {};
  function hpBar(hp, max, cls = '', key = null) {
    const p = v => Math.max(0, Math.min(100, (v / max) * 100));
    let ghost = '';
    if (key) {
      const prev = lastHp[key];
      if (prev != null && prev !== hp) {
        ghost = prev > hp
          ? `<i class="ghost dmg" style="left:${p(hp)}%;width:${p(prev) - p(hp)}%"></i>`
          : `<i class="ghost heal" style="left:${p(prev)}%;width:${p(hp) - p(prev)}%"></i>`;
      }
      lastHp[key] = hp;
    }
    return `<div class="hpbar ${cls}" role="img" aria-label="Health ${hp} of ${max}"><i class="fill" style="width:${p(hp)}%"></i>${ghost}<span>${hp} / ${max}</span></div>`;
  }

  // ---------- Items ----------
  function setChip(cls) {
    if (!cls) return '';
    const C = G.CLASSES[cls];
    return `<span class="set-chip" style="--set:${C.color}">${C.name}</span>`;
  }

  function consumableTip(item) {
    const c = G.CONSUMABLES[item.cid];
    return `<div class="tt-title">${esc(c.name)}</div><p>${esc(c.desc)}</p><p class="tt-extra">Goes in your bag. Tap it there to use or discard.</p>`;
  }

  function itemTip(item, hero) {
    if (item.kind === 'consumable') return consumableTip(item);
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
    const W = item.slot === 'weapon' ? G.WEAPONS[item.weaponType] : null;
    const set = item.set ? `<p class="tt-extra">${G.CLASSES[item.set].name} set piece. 3 pieces: ${esc(G.CLASSES[item.set].three.desc)}.</p>` : '';
    return `<div class="tt-title r-${item.rarity}">${esc(item.name)}</div>
      <div class="tt-sub">${R.name} ${W ? W.name + ' · ' + RANGE_NAMES[W.range] + ' · ' + (W.type === 'magic' ? 'Magic' : 'Physical') : G.SLOT_NAMES[item.slot]} · Tier ${item.tier}</div>
      <ul class="tt-stats">${lines}</ul>
      ${item.trait ? `<div class="tt-trait">${esc(item.trait)}</div>` : ''}${set}${cmp}`;
  }

  function verdict(hero, item) {
    if (item.kind === 'consumable') return { cls: 'side', text: 'Bag item' };
    const eq = hero.gear[item.slot];
    if (!eq) return { cls: 'up', text: 'New slot' };
    const now = G.Hero.power(hero), w = G.Hero.powerWith(hero, item);
    const d = Math.round(w) - Math.round(now);
    if (d > 0) return { cls: 'up', text: `Upgrade +${d} Power` };
    if (d < 0) return { cls: 'down', text: `Downgrade ${d} Power` };
    return { cls: 'side', text: 'Sidegrade' };
  }

  function itemCard(item, hero, btns) {
    if (item.kind === 'consumable') {
      const c = G.CONSUMABLES[item.cid];
      return `<article class="card item consumable">
        <div class="item-head"><span class="ico-wrap">${G.Art.icon(item.iconKey)}</span>
          <div class="item-name"><b>${esc(c.name)}</b><small>Bag item</small></div></div>
        <p class="trait">${esc(c.desc)}</p>${btns}</article>`;
    }
    const v = verdict(hero, item);
    const eq = hero.gear[item.slot];
    const diffs = eq ? G.Items.compare(item, eq) : [];
    const W = item.slot === 'weapon' ? G.WEAPONS[item.weaponType] : null;
    return `<article class="card item r-${item.rarity}">
      <div class="item-head">
        <span class="ico-wrap r-${item.rarity}">${G.Art.icon(item.iconKey)}</span>
        <div class="item-name"><b class="r-${item.rarity}">${esc(item.name)}</b>
          <small>${G.RARITY[item.rarity].name} ${W ? esc(W.name) + ' · ' + RANGE_NAMES[W.range] + ' · ' + (W.type === 'magic' ? 'Magic' : 'Physical') : G.SLOT_NAMES[item.slot]}</small>
          <span class="tags">${setChip(item.set)}<span class="verdict ${v.cls}">${v.text}</span></span></div>
      </div>
      <ul class="stat-list">${G.Items.statLines(item).map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>
      ${item.trait ? `<p class="trait">${esc(item.trait)}</p>` : ''}
      ${eq ? `<div class="cmp"><span>Replaces ${esc(eq.name)}</span><ul>${diffs.map(d => `<li class="${d.d > 0 ? 'up' : 'down'}">${esc(d.text)}</li>`).join('')}</ul></div>` : ''}
      <div class="btns">${btns}</div>
    </article>`;
  }

  // ---------- Side panels ----------
  function gearPanel(hero) {
    return `<section class="panel"><h3>Gear</h3><div class="gear-grid">${G.SLOTS.map(slot => {
      const it = hero.gear[slot];
      if (!it) return `<div class="slot empty" ${tip(`<div class="tt-title">${G.SLOT_NAMES[slot]}</div><div class="tt-sub">Empty. Loot leans toward empty slots.</div>`)}>
        <span class="ico-wrap">${G.Art.icon(slot)}</span><small>${G.SLOT_NAMES[slot]}</small></div>`;
      return `<div class="slot r-${it.rarity}" ${tip(itemTip(it))}><span class="ico-wrap r-${it.rarity}">${G.Art.icon(it.iconKey)}</span><small>${esc(it.name)}</small>${it.set ? `<i class="set-dot" style="--set:${G.CLASSES[it.set].color}"></i>` : ''}</div>`;
    }).join('')}</div></section>`;
  }

  function setsPanel(hero) {
    const st = G.Stats.sets(hero);
    const rows = G.CLASS_ORDER.map(c => {
      const n = st.counts[c] || 0;
      const C = G.CLASSES[c];
      const act = st.active.find(a => a.cls === c);
      return `<li class="${act ? 'on' : n ? '' : 'off'}" ${tip(`<div class="tt-title">${C.name} set</div><p><b>3 pieces:</b> ${esc(C.three.desc)}.</p><p><b>5 pieces:</b> ${esc(C.five.desc)}.</p>`)}>
        <span class="set-name" style="--set:${C.color}">${C.name}</span>
        <span class="pips5">${[0, 1, 2, 3, 4].map(i => `<i class="${i < n ? 'f' : ''} ${i === 2 || i === 4 ? 'mark' : ''}"></i>`).join('')}</span>
        <b>${n}/5</b></li>`;
    }).join('');
    const hy = st.hybrid ? G.HYBRIDS[st.hybrid] : null;
    const hyRow = hy ? `<p class="hybrid on" ${tip(`<div class="tt-title">${hy.name}</div><p>${esc(hy.desc)}.</p>`)}>${esc(hy.name)}: ${esc(hy.desc)}</p>`
      : `<p class="hybrid" ${tip('<div class="tt-title">Hybrid archetypes</div><p>Wear 3 pieces of one class and 2 of another to unlock a hybrid bonus, like Battle Mage (Warrior + Mage).</p>')}>3 of one class + 2 of another unlocks a hybrid.</p>`;
    return `<section class="panel"><h3>Sets</h3><ul class="sets">${rows}</ul>${hyRow}</section>`;
  }

  function bagPanel(st) {
    const p = st.player, size = CFG().bagSize;
    const slots = [];
    for (let i = 0; i < size; i++) {
      const it = p.bag[i];
      if (!it) { slots.push(`<div class="bag-slot empty"><small>Empty</small></div>`); continue; }
      const open = bagOpen === i && st.phase !== 'battle';
      slots.push(`<div class="bag-slot ${open ? 'open' : ''}">
        <button class="bag-item" data-act="bag-menu" data-i="${i}" ${tip(itemTip(it, p))} aria-label="${esc(it.name)}">
          <span class="ico-wrap ${it.kind === 'gear' ? 'r-' + it.rarity : ''}">${G.Art.icon(it.iconKey)}</span><small>${esc(it.name)}</small></button>
        ${open ? `<div class="bag-menu"><button data-act="bag-use" data-i="${i}">${it.kind === 'gear' ? 'Equip' : 'Use'}</button><button class="ghost" data-act="bag-drop" data-i="${i}">Discard</button></div>` : ''}
      </div>`);
    }
    const buffs = Object.entries(p.buffs || {}).filter(([, v]) => v).map(([k, v]) => k === 'fullMana' ? 'Full mana' : `+${v} ${G.STAT_INFO[k].label}`);
    return `<section class="panel"><h3>Bag <span class="chip muted">${p.bag.length}/${size}</span></h3>
      <div class="bag">${slots.join('')}</div>
      ${buffs.length ? `<p class="buffs">Next fight: ${buffs.join(', ')}</p>` : ''}
      ${st.bagMsg ? `<p class="bag-msg">${esc(st.bagMsg)}</p>` : ''}</section>`;
  }

  function statRows(hero) {
    const s = G.Stats.compute(hero);
    const I = G.STAT_INFO;
    const row = (label, val, info, extra = '') =>
      `<li ${tip(`<div class="tt-title">${label}</div><p>${esc(info)}</p>${extra ? `<p class="tt-extra">${extra}</p>` : ''}`)}><span>${label}</span><b>${val}</b></li>`;
    const rows = [
      row('Health', `${hero.hp} / ${s.maxHp}`, 'Your health carries from room to room. It only comes back from campfires, potions, springs and Life on Hit. At 0 you are out.'),
      row('Damage', s.dmg, I.dmg.desc, s.type === 'magic' ? 'Your weapon deals magic damage, so Ward blocks it.' : 'Your weapon deals physical damage, so Armor blocks it.'),
      row('Speed', s.spd, I.spd.desc, `You attack every ${Math.round(100 / s.spd) / 10} seconds.`),
      row('Range', RANGE_NAMES[s.range], 'Fights start 6 steps apart. Melee walks in first; Near shoots from 4 steps, Far from 6.'),
      row('Armor', s.armor, I.armor.desc),
      row('Ward', s.ward, I.ward.desc),
      row('Crit', s.crit, I.crit.desc, `Your crits hit for ${s.dmg * 2 + s.critDmg}.`),
    ];
    if (s.critDmg) rows.push(row('Crit Damage', s.critDmg, I.critDmg.desc));
    rows.push(row('Dodge', s.dodge, I.dodge.desc));
    for (const k of ['shield', 'holy', 'pierce', 'leech', 'bleed', 'stun']) if (s[k] > 0) rows.push(row(I[k].label, s[k], I[k].desc));
    if (s.spell && s.manaGain > 0) rows.push(row('Spell', `${s.spell.name} ${s.spell.dmg}`, `At 100 mana you cast ${s.spell.name}: ${s.spell.dmg} magic damage to ${s.spell.aoe ? 'every enemy' : 'one enemy'}.`, `${s.manaGain} mana per attack${s.startMana ? `, start fights at ${s.startMana}` : ''}.`));
    rows.push(row('Power', Math.round(G.Stats.power(s)), 'A rough single number for how strong your build is, combining offense and defense. Use it to size up rivals.'));
    return rows.join('');
  }

  function specChip(hero) {
    if (!hero.spec) return `<span class="chip muted" ${tip(`<div class="tt-title">No specialization yet</div><p>You choose one after room ${CFG().specRoom}.</p>`)}>Spec after room ${CFG().specRoom}</span>`;
    const S = G.SPECS[hero.spec];
    return `<span class="chip" ${tip(`<div class="tt-title">${S.name} <small>${S.role}</small></div><p>${esc(S.desc)}</p>`)}>${S.name}</span>`;
  }
  function gemChip(hero) {
    if (!hero.gem) return '';
    const g = G.GEMS[hero.gem];
    return `<span class="chip gem" style="--gem:${g.color}" ${tip(`<div class="tt-title">${esc(g.name)}</div><p><b>Upside:</b> ${esc(g.up)}</p><p><b>Cost:</b> ${esc(g.cost)}</p>${hero.gem === 'phoenix' ? `<p class="tt-extra">${hero.phoenixUsed ? 'Already used.' : 'Revive still available.'}</p>` : ''}`)}>${esc(g.name)}</span>`;
  }

  function statsPanel(hero) {
    return `<section class="panel"><h3>Stats <span class="chips">${specChip(hero)}${gemChip(hero)}</span></h3><ul class="stats">${statRows(hero)}</ul></section>`;
  }

  function rivalTip(r) {
    const s = G.Stats.compute(r);
    const st = G.Stats.sets(r);
    const gear = G.SLOTS.map(slot => r.gear[slot] ? `<li class="r-${r.gear[slot].rarity}">${esc(r.gear[slot].name)}${r.gear[slot].set ? ' (' + G.CLASSES[r.gear[slot].set].name + ')' : ''}</li>` : '').join('');
    const sets = st.active.map(a => `${G.CLASSES[a.cls].name} ${a.tier === 'five' ? 5 : 3}`).concat(st.hybrid ? [G.HYBRIDS[st.hybrid].name] : []).join(', ');
    return `<div class="tt-title">${esc(r.name)}</div>
      <div class="tt-sub">${r.spec ? G.SPECS[r.spec].name : 'No spec yet'}${r.gem ? ' · ' + G.GEMS[r.gem].name : ''} · Power ${Math.round(G.Stats.power(s))} · ${r.gold} gold</div>
      <ul class="tt-stats">${gear}</ul>
      ${sets ? `<p class="tt-extra">Sets: ${esc(sets)}</p>` : ''}
      <p class="tt-extra">${s.dmg} Damage, ${s.spd} Speed, ${s.armor} Armor, ${s.ward} Ward, ${s.dodge} Dodge${r.poison ? `, ${r.poison} poison` : ''}</p>
      ${r.lastText ? `<p>Last room: ${esc(r.lastText)}.</p>` : ''}`;
  }

  function rivalsPanel(st) {
    const rows = st.rivals.map(r => {
      const max = G.Hero.maxHp(r);
      const col = '#' + r.tint.toString(16).padStart(6, '0');
      const sets = G.Stats.sets(r);
      const tag = sets.hybrid ? G.HYBRIDS[sets.hybrid].name : sets.main ? G.CLASSES[sets.main].name : '';
      return `<li class="rival ${r.alive ? '' : 'dead'}" ${tip(rivalTip(r))}>
        <span class="dot" style="background:${col}"></span>
        <div class="rv-main"><div class="rv-top"><b>${esc(r.name)}</b><span class="rv-spec">${[r.spec ? G.SPECS[r.spec].name : '', tag].filter(Boolean).join(' · ')}</span>
          <span class="rv-wpn">${r.gear.weapon ? G.Art.icon(r.gear.weapon.weaponType) : ''}</span></div>
          ${r.alive ? hpBar(r.hp, max, 'thin', 'rv-' + r.id) : `<div class="fell">Fell in room ${r.diedRoom}</div>`}
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
      pips.push(`<i class="${cls} ${CFG().bossRooms[r] ? 'boss' : ''} ${CFG().shopRooms.includes(r) ? 'shop' : ''} ${r === CFG().specRoom || r === CFG().gemRoom ? 'spec' : ''}"></i>`);
    }
    let roomLabel = `Room ${st.room} <small>of ${CFG().rooms}${st.room === 1 ? ' · the Armory' : ''}</small>`;
    if (st.room > CFG().rooms) roomLabel = 'Tournament';
    else if (st.roundKind === 'spec') roomLabel = `Specialization <small>after room ${st.room}</small>`;
    else if (st.roundKind === 'gem') roomLabel = `Heart gem <small>after room ${st.room}</small>`;
    else if (st.roundKind === 'shop') roomLabel = `Room ${st.room} <small>· Shared shop</small>`;
    const poison = p.poison ? `<span class="poison" ${tip(`<div class="tt-title">Poison ${p.poison}</div><p>You lose ${p.poison} health at the start of every room. Only an Antidote or a Purifying Spring clears it; campfires don't.</p>`)}>Poison ${p.poison}</span>` : '';
    return `<header class="top">
      <div class="brand">Thirty Doors</div>
      <div class="track"><div class="room-label">${roomLabel}</div><div class="pips" aria-hidden="true">${pips.join('')}</div></div>
      <div class="clock" id="clock" ${tip('<div class="tt-title">Round timer</div><p>Every round is timed for everyone and ends early once everyone is ready. Anything you haven’t decided at zero is decided for you.</p>')}><b id="clock-num">${timerText()}</b><i><span id="clock-bar" style="width:${timerPct()}%"></span></i></div>
      <div class="vitals">${hpBar(p.hp, max, '', 'player-top')}${poison}<div class="gold" ${tip('<div class="tt-title">Gold</div><p>Spend it at the shared shop on rooms 8, 16 and 24.</p>')}><span class="coin"></span>${p.gold}</div></div>
    </header>`;
  }

  function timerText() {
    const t = G.Game.timeLeft();
    if (t == null || !G.Game.s.roundEnds) return '—';
    const sec = Math.ceil(t);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function timerPct() {
    const st = G.Game.s, t = G.Game.timeLeft();
    if (!st || !st.roundEnds || t == null) return 0;
    const total = st.roundKind === 'tour' ? CFG().tourBreakSeconds : st.roundKind === 'shop' ? (st.shop && st.shop.lastCall ? CFG().shop.lastCall : st.shop.totalSeconds) : CFG().roundSeconds;
    return Math.max(0, Math.min(100, (t / total) * 100));
  }

  // ---------- Stage screens ----------
  const DANGER_TIP = '<div class="tt-title">Danger</div><p>An estimate from a few practice fights against these enemies with your current gear, health and bag buffs.</p>';

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
    const one = st.doors.length === 1;
    const t = st.doors[0].type;
    return `<section class="screen">
      <h2>${t === 'armory' ? 'Room 1: the Armory' : one ? 'A single door, sealed with iron' : 'Two doors'}</h2>
      <p class="lede">${t === 'armory' ? 'Grab a weapon. The real run starts in room 2.' : one ? 'No way around it. Win to continue.' : 'Pick one. Your health does not refill between rooms. You can use bag items before you choose.'}</p>
      <div class="doors ${one ? 'one' : ''}">${doors}</div>
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
      <p class="lede">Racks of old steel. Three weapons are yours to choose from. Any weapon works with any armor set later.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  function rewardScreen(st) {
    const o = st.offer, p = st.player, full = G.Hero.bagFull(p);
    const cards = o.items.map(it => {
      if (it.kind === 'consumable') return itemCard(it, p, `<button data-act="take" data-id="${it.id}" data-mode="bag" ${full ? 'disabled' : ''}>${full ? 'Bag full' : 'Put in bag'}</button>`);
      return itemCard(it, p, `<button data-act="take" data-id="${it.id}" data-mode="equip">Equip</button><button class="ghost" data-act="take" data-id="${it.id}" data-mode="bag" ${full ? 'disabled' : ''}>${full ? 'Bag full' : 'Keep in bag'}</button>`);
    }).join('');
    return `<section class="screen">
      <h2>${esc(o.title)}</h2><p class="lede">${esc(o.text)}</p>
      ${full ? '<p class="hint">Your bag is full. Discard something from it to keep a new item there.</p>' : ''}
      <div class="cards">${cards}</div>
      <div class="row-actions">${o.gold ? `<button class="ghost" data-act="gold">Leave the items, take ${o.gold} gold</button>` : `<button class="ghost" data-act="gold">Take nothing</button>`}</div>
    </section>`;
  }

  function shopPicks(st) {
    const sh = st.shop, p = st.player;
    const all = G.Game.all();
    const byId = id => all.find(h => h.id === id);
    const turnHero = G.Game.shopTurnHero();
    const myTurn = turnHero && turnHero.isPlayer;
    const picked = !!sh.picks[p.id];
    const full = G.Hero.bagFull(p);
    const reviewing = Date.now() < sh.reviewUntil;
    const order = sh.order.map((id, i) => {
      const h = byId(id);
      const now = i === sh.turn && !reviewing;
      const state = sh.picks[id] ? `took ${esc(sh.picks[id])}` : now ? `<b id="turn-num">${turnLeft()}s</b> ${h.isPlayer ? 'to pick' : 'picking\u2026'}` : 'waiting';
      const bar = now ? `<i class="turnbar ${h.isPlayer ? 'mine' : ''}"><span id="turn-bar" style="width:${turnPct()}%"></span></i>` : '';
      return `<li class="${now ? 'now' : ''} ${h.isPlayer ? 'me' : ''}"><span>${i + 1}</span><b>${esc(h.name)}</b><small>${h.hp} health</small><em>${state}</em>${bar}</li>`;
    }).join('');
    const myNow = myTurn && !reviewing;
    const table = sh.table.map(it => itemCard(it, p, myNow
      ? `<button data-act="shop-pick" data-id="${it.id}" ${it.kind === 'consumable' && full ? 'disabled' : ''}>${it.kind === 'consumable' && full ? 'Bag full' : 'Take this'}</button>`
      : `<button disabled>${picked ? 'Picked' : reviewing ? 'Picks start soon' : 'Wait for your turn'}</button>`)).join('');
    const review = reviewing ? `<div class="review"><span>Look over the table. Picks start in <b id="review-num">${reviewLeft()}s</b></span><i class="turnbar"><span id="review-bar" style="width:${reviewPct()}%"></span></i></div>` : '';
    return `${review}<h3 class="sub">Pick order</h3>
      <ol class="pick-order">${order}</ol>
      <h3 class="sub">Free table ${myNow ? '<span class="chip">Your turn</span>' : ''}</h3>
      <div class="cards">${table || '<p class="hint">The table is empty.</p>'}</div>`;
  }

  // Rival picks only refresh this part, so clicks in the merchant aren't lost to a re-render
  function refreshShopPicks() {
    const st = G.Game.s, el = document.getElementById('shop-picks');
    if (!st || st.phase !== 'shop' || !el) return render();
    el.innerHTML = shopPicks(st);
    const r = document.getElementById('shop-ready');
    if (r && st.shop.ready) r.textContent = st.shop.turn >= st.shop.order.length ? 'Ready' : 'Ready \u2014 waiting for picks';
  }

  function shopScreen(st) {
    const sh = st.shop, p = st.player, S = CFG().shop;
    const full = G.Hero.bagFull(p);
    const stock = sh.stock.map(it => {
      const price = G.Dungeon.itemPrice(it), sold = sh.bought.includes(it.id);
      return itemCard(it, p, sold ? '<button disabled>Sold</button>' : `<button data-act="shop-buy" data-kind="gear" data-id="${it.id}" ${p.gold < price ? 'disabled' : ''}>Buy for ${price} gold</button>`);
    }).join('');
    const potUsed = sh.potions >= S.potionsPerShop;
    const consRow = (id, price, note, disabled) => {
      const c = G.CONSUMABLES[id];
      return `<div class="potion card"><span class="ico-wrap">${G.Art.icon('potion_' + id)}</span><div><b>${esc(c.name)}</b><small>${esc(c.desc)}${note ? ' ' + note : ''}</small></div>
        <button data-act="shop-buy" data-kind="cons" data-id="${id}" ${disabled || p.gold < price || full ? 'disabled' : ''}>${disabled ? 'Bought' : full ? 'Bag full' : `${price} gold`}</button></div>`;
    };
    const allPicked = sh.turn >= sh.order.length;
    return `<section class="screen shop">
      <h2>Shared shop</h2>
      <p class="lede">Free picks go weakest first: lowest health picks first. Everyone gets ${S.reviewSeconds} seconds to look, then ${S.turnSeconds} seconds per turn. The merchant is open the whole round${sh.lastCall ? ' — last call!' : '.'}</p>
      ${sh.msg ? `<p class="notice">${esc(sh.msg)}</p>` : ''}
      <div id="shop-picks">${shopPicks(st)}</div>
      <h3 class="sub">Merchant</h3>
      <div class="shop-row">
        ${consRow('potion', S.potionCost, 'One per shop round.', potUsed)}
        ${consRow('antidote', G.CONSUMABLES.antidote.price, '', false)}
        ${sh.buffs.map(id => consRow(id, G.CONSUMABLES[id].price, '', false)).join('')}
        <div class="potion card"><span class="flask blood"></span><div><b>Sell blood</b><small>Lose ${S.bloodCost[0]} to ${S.bloodCost[1]} health, gain ${S.bloodGold} gold.</small></div>
          <button data-act="shop-buy" data-kind="blood" ${p.hp <= S.bloodCost[1] ? 'disabled' : ''}>${p.hp <= S.bloodCost[1] ? 'Too weak' : `Bleed for ${S.bloodGold}`}</button></div>
      </div>
      <div class="cards">${stock}</div>
      <div class="row-actions">
        <button class="ghost" data-act="shop-buy" data-kind="restock" ${p.gold < S.restockCost ? 'disabled' : ''}>Restock gear (${S.restockCost} gold)</button>
        <button id="shop-ready" data-act="shop-ready" ${sh.ready ? 'disabled' : ''}>${sh.ready ? (allPicked ? 'Ready' : 'Ready — waiting for picks') : 'I’m ready'}</button>
      </div></section>`;
  }
  function turnRaw() {
    const sh = G.Game.s && G.Game.s.shop;
    if (!sh) return 0;
    return Math.max(0, CFG().shop.turnSeconds - Math.max(0, Date.now() - sh.turnStart) / 1000);
  }
  const turnLeft = () => Math.ceil(turnRaw());
  const turnPct = () => (turnRaw() / CFG().shop.turnSeconds) * 100;
  function reviewRaw() { const sh = G.Game.s && G.Game.s.shop; return sh ? Math.max(0, (sh.reviewUntil - Date.now()) / 1000) : 0; }
  const reviewLeft = () => Math.ceil(reviewRaw());
  const reviewPct = () => (reviewRaw() / CFG().shop.reviewSeconds) * 100;

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
      <p class="lede">Three random options, no matter what you hold. Rivals are choosing theirs too.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  function gemScreen(st) {
    const cards = st.gemOptions.map(id => {
      const g = G.GEMS[id];
      return `<article class="card spec gemcard" style="--gem:${g.color}"><div class="spec-head"><span class="gem-ico">${G.Art.icon('gem')}</span><b>${esc(g.name)}</b></div>
        <p><span class="up">Upside</span> ${esc(g.up)}</p><p><span class="down">Cost</span> ${esc(g.cost)}</p>
        <button data-act="gem" data-id="${id}">Take the ${esc(g.name)}</button></article>`;
    }).join('');
    return `<section class="screen"><h2>Choose a heart gem</h2>
      <p class="lede">The Bone King drops three gems. Each one changes how you play for the rest of the run, for better and worse.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  function deadScreen(st) {
    const killer = st.notice || `${st.battle ? st.battle.title : 'The dungeon'} ended your run.`;
    return `<section class="screen end"><h2>You fell in room ${st.player.diedRoom}</h2>
      <p class="lede">${esc(killer)} In a full game you'd be spectating now.</p>
      <div class="row-actions"><button data-act="ending">See how the run ended</button><button class="ghost" data-act="title">Try again</button></div></section>`;
  }

  function tourTable(T) {
    return `<div class="table-wrap"><table class="tour"><thead><tr><th>Seed</th><th>Warrior</th><th>Build</th><th>Health</th><th>Arena health</th></tr></thead><tbody>${
      T.entrants.map(e => {
        const st = G.Stats.sets(e.hero);
        const build = [e.hero.spec ? G.SPECS[e.hero.spec].name : '', st.hybrid ? G.HYBRIDS[st.hybrid].name : st.main ? G.CLASSES[st.main].name : '', e.hero.gem ? G.GEMS[e.hero.gem].name : ''].filter(Boolean).join(' · ') || '—';
        return `<tr class="${e.hero.isPlayer ? 'me' : ''}"><td>${e.seed}</td><td>${esc(e.hero.name)}</td><td>${esc(build)}</td>
          <td>${e.before}</td><td><b>${e.entryHp}</b> <small>/ ${e.maxHp} (+${e.heal})</small></td></tr>`;
      }).join('')}</tbody></table></div>`;
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
      <p class="lede">Everyone enters with the health they left the dungeon with, plus the heal shown below (heart gems can change it). Every match starts at that arena health. Top seeds get byes.</p>
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
      <header class="hero-head"><div class="eyebrow">Prototype v2 · single player</div><h1>Thirty Doors</h1>
        <p>Six warriors. Thirty rooms each. Your health never refills on its own. Build an archetype from armor sets, pick a heart gem, and the survivors fight for the crown.</p></header>
      <ul class="rules">
        <li><b>The Armory</b>Room 1: pick one of three random weapons. Swords, bows, wands, maces and more.</li>
        <li><b>Class sets</b>Uncommon armor carries a class. 3 pieces for a bonus, 5 for the full set, 3 + 2 for a hybrid like Battle Mage.</li>
        <li><b>Build moments</b>Specialization after room ${CFG().specRoom}, heart gem after room ${CFG().gemRoom}.</li>
        <li><b>Shared shop</b>Rooms ${CFG().shopRooms.join(', ')}: free picks weakest first, plus the merchant.</li>
        <li><b>Poison</b>Ticks every room. Only Antidotes and Purifying Springs clear it.</li>
        <li><b>The tournament</b>Survivors heal and fight a bracket. Best health gets a bye.</li>
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
    if (st.phase === 'battle') bagOpen = -1;
    const screens = { doors: doorsScreen, battle: battleScreen, armory: armoryScreen, reward: rewardScreen, shop: shopScreen,
      mystery: mysteryScreen, spec: specScreen, gem: gemScreen, dead: deadScreen, tournament: tournamentScreen, ending: endingScreen };
    const prevPhase = app.dataset.phase;
    const notice = st.notice && !['dead', 'shop'].includes(st.phase) ? `<p class="notice">${esc(st.notice)}</p>` : '';
    app.innerHTML = `<div class="shell">${topbar(st)}<div class="cols"><main class="stage">${notice}${screens[st.phase](st)}</main>
      <aside class="side">${bagPanel(st)}${gearPanel(st.player)}${setsPanel(st.player)}${statsPanel(st.player)}${rivalsPanel(st)}</aside></div></div>`;
    if (st.phase !== prevPhase) window.scrollTo(0, 0);
    app.dataset.phase = st.phase;
    if (st.phase === 'battle') startBattleView(st);
  }

  // Updates only clocks each tick, never the whole screen (a re-render would cut off a running fight)
  function tickClock() {
    G.Game.tick();
    const left = G.Game.timeLeft();
    const n = document.getElementById('clock-num'); if (n) n.textContent = timerText();
    const b = document.getElementById('clock-bar'); if (b) b.style.width = timerPct() + '%';
    const w = document.getElementById('wait-num'); if (w) w.textContent = Math.ceil(left || 0) + 's';
    const tn = document.getElementById('turn-num'); if (tn) tn.textContent = turnLeft() + 's';
    const tb = document.getElementById('turn-bar'); if (tb) { tb.style.width = turnPct() + '%'; tb.parentNode.classList.toggle('low', turnRaw() <= 5); }
    const rn = document.getElementById('review-num'); if (rn) rn.textContent = reviewLeft() + 's';
    const rb = document.getElementById('review-bar'); if (rb) rb.style.width = reviewPct() + '%';
    const c = document.getElementById('clock');
    if (c) c.classList.toggle('low', !!(G.Game.s && G.Game.s.roundEnds) && left <= 5);
  }

  function logLine(e, b) {
    const metas = b.res.fighters;
    const nm = id => { const m = metas.find(x => x.id === id); return m ? m.name : '?'; };
    const subj = id => nm(id);
    const obj = id => { const n = nm(id); return n === 'You' ? 'you' : n; };
    const verb = (id, v, vs) => (nm(id) === 'You' ? v : vs);
    switch (e.type) {
      case 'hit': return `${subj(e.src)} ${e.counter ? verb(e.src, 'counter', 'counters') : e.cleave ? verb(e.src, 'cleave', 'cleaves') : verb(e.src, 'hit', 'hits')} ${obj(e.tgt)} for ${e.amount}${e.crit ? ' (crit)' : ''}${e.absorbed ? ` (shield took ${e.absorbed})` : ''}`;
      case 'cast': return `${subj(e.src)} ${verb(e.src, 'cast', 'casts')} ${e.name}`;
      case 'spellhit': return `${e.name} hits ${obj(e.tgt)} for ${e.amount}`;
      case 'bleed': return `${subj(e.tgt)} ${verb(e.tgt, 'bleed', 'bleeds')} for ${e.amount}`;
      case 'dodge': return `${subj(e.tgt)} ${verb(e.tgt, 'dodge', 'dodges')}`;
      case 'hidden': return `${subj(e.src)} ${verb(e.src, 'swing', 'swings')} at shadows`;
      case 'parry': return `${subj(e.tgt)} ${verb(e.tgt, 'parry', 'parries')}`;
      case 'stun': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} stunned`;
      case 'heal': return `${subj(e.src)} ${verb(e.src, 'heal', 'heals')} ${e.amount}${e.label ? ` (${e.label})` : ''}`;
      case 'stealth_on': return `${subj(e.src)} ${verb(e.src, 'vanish', 'vanishes')}`;
      case 'spawn': return `${subj(e.src)} splits off`;
      case 'escape': return `${subj(e.src)} escapes with ${e.amount} gold`;
      case 'revive': return `${subj(e.src)} ${verb(e.src, 'rise', 'rises')} from the ashes`;
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
      result: b.res, visual: b.visual,
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
    if (a !== 'bag-menu') bagOpen = -1;
    switch (a) {
      case 'start': Gm.newRun(); break;
      case 'door': Gm.chooseDoor(+el.dataset.i); break;
      case 'weapon': Gm.pickWeapon(el.dataset.id); break;
      case 'take': Gm.takeItem(el.dataset.id, el.dataset.mode); break;
      case 'gold': Gm.takeGold(); break;
      case 'mystery': Gm.mysteryAct(el.dataset.v); break;
      case 'spec': Gm.chooseSpec(el.dataset.id); break;
      case 'gem': Gm.chooseGem(el.dataset.id); break;
      case 'bag-menu': bagOpen = bagOpen === +el.dataset.i ? -1 : +el.dataset.i; render(); break;
      case 'bag-use': Gm.useBag(+el.dataset.i); break;
      case 'bag-drop': Gm.discardBag(+el.dataset.i); break;
      case 'shop-pick': Gm.playerShopPick(el.dataset.id); break;
      case 'shop-buy': Gm.shopBuy(el.dataset.kind, el.dataset.id); break;
      case 'shop-ready': Gm.shopReady(); break;
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
    const x = Math.min(vw - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
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
      if (el && !el.matches('button')) { if (tipOwner === el) hideTip(); else showTip(el); }
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

  G.UI = { render, init, refreshShopPicks };
})(window.G);
