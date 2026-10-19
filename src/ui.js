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
  let supplyOpen = false;

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
  function heartsRow(n, cls = '') {
    const max = CFG().hearts;
    let out = '';
    for (let i = 0; i < Math.max(max, n); i++) out += `<i class="${i < n ? 'on' : ''}"></i>`;
    return `<span class="hearts ${cls}" role="img" aria-label="${n} of ${max} hearts">${out}</span>`;
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

  // Base stats, then each bonus, trade-off and build effect on its own line
  function statList(item, cls) {
    const lines = G.Items.statLines(item);
    const base = lines.filter(l => !l.affix).map(l => `<li>${esc(l.text)}</li>`).join('');
    const bonus = lines.filter(l => l.affix);
    let extra = bonus.length ? `<li class="affix-h">Bonus</li>${bonus.map(l => `<li class="affix ${l.cost ? 'cost' : ''}">${esc(l.text)} <small>${esc(l.suffix)}</small></li>`).join('')}` : '';
    const E = G.Items.effectText(item);
    if (E) extra += `<li class="affix-h">Build effect</li><li class="effect"><b>${esc(E.name)}:</b> ${esc(E.desc)}</li>`;
    return `<ul class="${cls}">${base}${extra}</ul>`;
  }

  function itemTip(item, hero) {
    if (item.kind === 'consumable') return consumableTip(item);
    const R = G.RARITY[item.rarity];
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
    const set = item.set ? `<p class="tt-extra">Counts toward the ${G.CLASSES[item.set].name} set.</p>` : '';
    return `<div class="tt-title r-${item.rarity}">${esc(item.name)}</div>
      <div class="tt-sub">${R.name} ${W ? W.name + ' · ' + RANGE_NAMES[W.range] + ' · ' + (W.type === 'magic' ? 'Magic' : 'Physical') : G.SLOT_NAMES[item.slot]} · Tier ${item.tier}</div>
      ${statList(item, 'tt-stats')}
      ${item.trait ? `<div class="tt-trait">${esc(item.trait)}</div>` : ''}${set}${cmp}`;
  }

  // Only label an item when every change points the same way
  function verdict(hero, item) {
    if (item.kind === 'consumable') return { cls: 'side', text: 'Bag item' };
    const eq = hero.gear[item.slot];
    if (!eq) return { cls: 'up', text: 'Empty slot' };
    const diffs = G.Items.compare(item, eq);
    const sameEffect = (item.effect || null) === (eq.effect || null) && (item.set || null) === (eq.set || null);
    if (!diffs.length) return sameEffect ? { cls: 'side', text: 'Same stats' } : null;
    if (diffs.every(d => d.d > 0) && (sameEffect || !eq.effect)) return { cls: 'up', text: 'Upgrade' };
    if (diffs.every(d => d.d < 0) && (sameEffect || !item.effect)) return { cls: 'down', text: 'Downgrade' };
    return null;
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
          <span class="tags">${setChip(item.set)}${v ? `<span class="verdict ${v.cls}">${v.text}</span>` : ''}</span></div>
      </div>
      ${statList(item, 'stat-list')}
      ${item.trait ? `<p class="trait">${esc(item.trait)}</p>` : ''}
      ${eq ? `<div class="cmp"><span>Compared to ${esc(eq.name)}${eq.effect && eq.effect !== item.effect ? ` (loses ${esc(G.EFFECTS[eq.effect].name)})` : ''}</span><ul>${diffs.map(d => `<li class="${d.d > 0 ? 'up' : 'down'}">${esc(d.text)}</li>`).join('')}</ul></div>` : ''}
      <div class="btns">${btns}</div>
    </article>`;
  }

  // ---------- Stats in columns ----------
  function statCols(hero, compact) {
    const s = G.Stats.compute(hero);
    const I = G.STAT_INFO;
    const cell = (label, val, info, extra = '') =>
      `<li ${tip(`<div class="tt-title">${label}</div><p>${esc(info)}</p>${extra ? `<p class="tt-extra">${extra}</p>` : ''}`)}><span>${label}</span><b>${val}</b></li>`;
    const def = [
      cell('Health', `${hero.hp}/${s.maxHp}`, 'Health carries from room to room. Healing is limited, so spend it wisely.'),
      cell('Armor', s.armor, I.armor.desc), cell('Ward', s.ward, I.ward.desc), cell('Dodge', s.dodge, I.dodge.desc),
    ];
    const off = [
      cell('Damage', s.dmg, I.dmg.desc, s.type === 'magic' ? 'Your weapon deals magic damage, so Ward blocks it.' : 'Your weapon deals physical damage, so Armor blocks it.'),
      cell('Speed', s.spd, I.spd.desc, `You attack every ${Math.round(100 / s.spd) / 10} seconds.`),
      cell('Crit', s.crit, I.crit.desc, `Your crits hit for ${s.dmg * 2 + s.critDmg}.`),
      cell('Range', RANGE_NAMES[s.range].replace(' range', ''), 'Fights start 6 steps apart. Melee walks in first; Near shoots from 4 steps, Far from 6.'),
    ];
    const ext = [];
    if (s.critDmg) ext.push(cell('Crit Dmg', s.critDmg, I.critDmg.desc));
    for (const k of ['shield', 'holy', 'pierce', 'leech', 'bleed', 'stun']) if (s[k] > 0) ext.push(cell(I[k].label, s[k], I[k].desc));
    if (s.spell && s.manaGain > 0) ext.push(cell('Spell', `${s.spell.dmg}`, `At 100 mana you cast ${s.spell.name}: ${s.spell.dmg} magic damage to ${s.spell.aoe ? 'every enemy' : 'one enemy'}.`, `${s.manaGain} mana per attack${s.startMana ? `, start fights at ${s.startMana}` : ''}.`));
    return `<div class="statcols ${compact ? 'compact' : ''}">
      <div><h4>Defense</h4><ul>${def.join('')}</ul></div>
      <div><h4>Offense</h4><ul>${off.join('')}</ul></div>
      ${ext.length ? `<div><h4>Extras</h4><ul>${ext.join('')}</ul></div>` : ''}</div>`;
  }

  function buildLabel(hero) {
    const st = G.Stats.sets(hero);
    if (st.full) return `${G.CLASSES[st.look].name} · ${G.CLASSES[st.look].six.name}`;
    if (st.hybrid) return `${G.HYBRIDS[st.hybrid].name} (${st.counts[st.look]} ${G.CLASSES[st.look].name} + ${st.counts[st.trim]} ${G.CLASSES[st.trim].name})`;
    if (st.active.length) return st.active.map(a => `${G.CLASSES[a.cls].name} ${st.counts[a.cls]}`).join(' · ');
    return 'No set bonus yet';
  }

  // Your character (drawn like in fights) with its stats in columns. Used under the doors and on victory screens.
  function characterBlock(p) {
    const st = G.Stats.sets(p);
    const col = st.look ? G.CLASSES[st.look].color : '#9fdcff';
    const spec = p.spec ? G.SPECS[p.spec].name : `Spec at level ${CFG().levels.specLevel}`;
    return `<div class="charblock" style="--pv:${col}">
      <div class="pv-left"><div id="preview-slot" class="preview-slot" aria-hidden="true"></div>
        <div class="pv-info"><b>You</b><span>${esc(buildLabel(p))}</span><small>Level ${p.level} · ${esc(spec)}${p.gem ? ' · ' + esc(G.GEMS[p.gem].name) : ''}</small></div></div>
      ${statCols(p)}</div>`;
  }

  // ---------- Side panels ----------
  function gearPanel(hero) {
    return `<section class="panel"><h3>Gear</h3><div class="gear-grid">${G.SLOTS.map(slot => {
      const it = hero.gear[slot];
      if (!it) return `<div class="slot empty" ${tip(`<div class="tt-title">${G.SLOT_NAMES[slot]}</div><div class="tt-sub">Empty. Loot leans toward empty slots.</div>`)}>
        <span class="ico-wrap">${G.Art.icon(slot)}</span><small>${G.SLOT_NAMES[slot]}</small></div>`;
      return `<div class="slot r-${it.rarity}" ${tip(itemTip(it))}><span class="ico-wrap r-${it.rarity}">${G.Art.icon(it.iconKey)}</span><small>${esc(it.name)}</small>${it.set ? `<i class="set-dot" style="--set:${G.CLASSES[it.set].color}"></i>` : ''}${it.effect ? '<i class="fx-dot"></i>' : ''}</div>`;
    }).join('')}</div></section>`;
  }

  function supplyBlock(st) {
    const counts = G.Supply.counts(), per = CFG().supplyPerClass;
    const bars = G.CLASS_ORDER.map(c => `<i style="--set:${G.CLASSES[c].color};--fill:${Math.round(counts[c] / per * 100)}%" title="${G.CLASSES[c].name}: ${counts[c]} of ${per} left"></i>`).join('');
    let detail = '';
    if (supplyOpen) {
      const heroes = G.Game.all().filter(h => h.alive);
      detail = `<table class="supply-table"><thead><tr><th>Class</th><th>Left</th>${heroes.map(h => `<th title="${esc(h.name)}">${esc(h.isPlayer ? 'You' : h.name.split(' ').pop().slice(0, 3))}</th>`).join('')}</tr></thead><tbody>${
        G.CLASS_ORDER.map(c => `<tr><td style="color:${G.CLASSES[c].color}">${G.CLASSES[c].name}</td><td><b>${counts[c]}</b>/${per}</td>${heroes.map(h => `<td>${G.Supply.held(c, h) || ''}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <p class="hint">Every match has ${per} pieces of each class, shared by everyone. When a class runs low, its pieces stop dropping until someone lets one go.</p>`;
    }
    return `<div class="supply"><button class="supply-row" data-act="supply" aria-expanded="${supplyOpen}"><span>Set supply</span><span class="supply-bars">${bars}</span><span class="chev">${supplyOpen ? 'Hide' : 'Show'}</span></button>${detail}</div>`;
  }

  function setsPanel(hero) {
    const st = G.Stats.sets(hero);
    const counts = G.Supply.counts();
    const rows = G.CLASS_ORDER.map(c => {
      const n = st.counts[c] || 0;
      const C = G.CLASSES[c];
      const act = st.active.find(a => a.cls === c);
      return `<li class="${act ? 'on' : n ? '' : 'off'}" ${tip(`<div class="tt-title">${C.name} set</div><p><b>2 pieces:</b> ${esc(C.two.desc)}.</p><p><b>4 pieces:</b> ${esc(C.four.desc)}. Your color and look change.</p><p><b>6 pieces, ${esc(C.six.name)}:</b> ${esc(C.six.desc)}.</p><p class="tt-extra">All 6 slots count, weapon included. A single piece gives nothing. ${counts[c]} of ${CFG().supplyPerClass} pieces are left in this match.</p>`)}>
        <span class="set-name" style="--set:${C.color}">${C.name}</span>
        <span class="pips5">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i < n ? 'f' : ''} ${i === 1 || i === 3 ? 'mark' : ''}" style="--set:${C.color}"></i>`).join('')}</span>
        <b>${n}/6</b></li>`;
    }).join('');
    const hy = st.hybrid ? G.HYBRIDS[st.hybrid] : null;
    let hyRow;
    if (st.full) { const C = G.CLASSES[st.look]; hyRow = `<p class="hybrid on">${esc(C.six.name)}: ${esc(C.six.desc)}</p>`; }
    else if (hy) hyRow = `<p class="hybrid on">${esc(hy.name)}: ${esc(hy.desc)}</p>`;
    else hyRow = `<p class="hybrid" ${tip('<div class="tt-title">Hybrid archetypes</div><p>Wear 4 pieces of one class and 2 of another to unlock that pair’s hybrid bonus, like Battle Mage (Warrior + Mage). 6 of one class gives its capstone instead.</p>')}>4 of one class + 2 of another unlocks a hybrid.</p>`;
    return `<section class="panel"><h3>Sets</h3><ul class="sets">${rows}</ul>${hyRow}${supplyBlock(st)}</section>`;
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

  function specChip(hero) {
    if (!hero.spec) return `<span class="chip muted" ${tip(`<div class="tt-title">No specialization yet</div><p>You choose one at level ${CFG().levels.specLevel}, then make skill tree picks at levels ${CFG().levels.treeLevels.join(', ')}.</p>`)}>Spec at level ${CFG().levels.specLevel}</span>`;
    const S = G.SPECS[hero.spec];
    const nodes = G.Stats.treeFx(hero).nodes;
    return `<span class="chip" ${tip(`<div class="tt-title">${S.name} <small>${S.role}</small></div><p>${esc(S.desc)}</p>${nodes.map(n => `<p><b>${esc(n.name)}:</b> ${esc(n.desc)}.</p>`).join('')}`)}>${S.name}${nodes.length ? ' ' + nodes.length + '/3' : ''}</span>`;
  }
  function gemChip(hero) {
    if (!hero.gem) return '';
    const g = G.GEMS[hero.gem];
    return `<span class="chip gem" style="--gem:${g.color}" ${tip(`<div class="tt-title">${esc(g.name)}</div><p><b>Upside:</b> ${esc(g.up)}</p><p><b>Cost:</b> ${esc(g.cost)}</p>`)}>${esc(g.name)}</span>`;
  }

  function statsPanel(hero) {
    return `<section class="panel"><h3>Stats <span class="chips">${specChip(hero)}${gemChip(hero)}</span></h3>${statCols(hero, true)}</section>`;
  }

  function rivalTip(r) {
    const s = G.Stats.compute(r);
    return `<div class="tt-title">${esc(r.name)}</div>
      <div class="tt-sub">Level ${r.level} · ${r.spec ? G.SPECS[r.spec].name : 'No spec yet'}${r.gem ? ' · ' + G.GEMS[r.gem].name : ''} · ${r.gold} gold</div>
      <p class="tt-extra">${esc(buildLabel(r))}</p>
      <p class="tt-extra">${s.dmg} Damage, ${s.spd} Speed, ${s.armor} Armor, ${s.ward} Ward, ${s.dodge} Dodge${r.poison ? `, ${r.poison} poison` : ''}</p>
      ${r.lastText ? `<p>Last room: ${esc(r.lastText)}.</p>` : ''}<p class="tt-extra">Hover their gear squares to see each item.</p>`;
  }

  function rivalsPanel(st) {
    const rows = st.rivals.map(r => {
      const max = G.Hero.maxHp(r);
      const col = '#' + r.tint.toString(16).padStart(6, '0');
      const tag = buildLabel(r);
      const gear = G.SLOTS.map(sl => {
        const it = r.gear[sl];
        return it ? `<i class="r-${it.rarity} ${it.set ? 'tagged' : ''}" style="${it.set ? `--set:${G.CLASSES[it.set].color}` : ''}" ${tip(itemTip(it))}></i>` : `<i class="none" ${tip(`<div class="tt-title">${G.SLOT_NAMES[sl]}</div><div class="tt-sub">Empty</div>`)}></i>`;
      }).join('');
      return `<li class="rival ${r.alive ? '' : 'dead'}">
        <span class="dot" style="background:${col}"></span>
        <div class="rv-main"><div class="rv-top" ${tip(rivalTip(r))}><b>${esc(r.name)}</b><span class="lv">Lv ${r.level}</span>${heartsRow(r.hearts, 'sm')}
          <span class="rv-wpn">${r.gear.weapon ? G.Art.icon(r.gear.weapon.weaponType) : ''}</span></div>
          <div class="rv-spec">${esc([r.spec ? G.SPECS[r.spec].name : '', tag === 'No set bonus yet' ? '' : tag].filter(Boolean).join(' · '))}</div>
          ${r.alive ? hpBar(r.hp, max, 'thin', 'rv-' + r.id) : `<div class="fell">Out of hearts${r.diedRoom ? ` in room ${r.diedRoom}` : ''}</div>`}
          <div class="rarity-dots">${gear}<span>${r.alive ? esc(r.lastAction || '') : ''}</span></div>
        </div></li>`;
    }).join('');
    const alive = st.rivals.filter(r => r.alive).length;
    return `<section class="panel"><h3>Rivals <span class="chip muted">${alive} in</span></h3><ul class="rivals">${rows}</ul></section>`;
  }

  function topbar(st) {
    const p = st.player, max = G.Hero.maxHp(p);
    const pips = [];
    for (let r = 1; r <= CFG().rooms; r++) {
      const cls = r < st.room ? 'done' : r === st.room ? 'now' : '';
      pips.push(`<i class="${cls} ${CFG().bossRooms[r] ? 'boss' : ''} ${CFG().shopRooms.includes(r) ? 'shop' : ''} ${CFG().duelRooms.includes(r) ? 'duel' : ''}"></i>`);
    }
    let roomLabel = `Room ${st.room} <small>of ${CFG().rooms}${st.room === 1 ? ' · the Armory' : ''}</small>`;
    if (st.room > CFG().rooms) roomLabel = 'Tournament';
    else if (st.phase === 'spec' || st.phase === 'tree') roomLabel = `Level up <small>after room ${st.room}</small>`;
    else if (st.phase === 'gem') roomLabel = `Heart gem <small>after room ${st.room}</small>`;
    else if (st.phase === 'duelIntro' || (st.battle && st.battle.duel && st.phase === 'battle')) roomLabel = `Duel <small>after room ${st.room}</small>`;
    else if (st.roundKind === 'shop') roomLabel = `Room ${st.room} <small>· Shop round</small>`;
    const poison = p.poison ? `<span class="poison" ${tip(`<div class="tt-title">Poison ${p.poison}</div><p>You lose ${p.poison} health at the start of every room. Only an Antidote or a Purifying Spring clears it; campfires don't.</p>`)}>Poison ${p.poison}</span>` : '';
    const L = CFG().levels;
    const need = p.level >= L.max ? 1 : G.Hero.xpToNext(p.level);
    const xpPct = p.level >= L.max ? 100 : Math.round(p.xp / need * 100);
    return `<header class="top">
      <div class="brand">Thirty Doors</div>
      <div class="track"><div class="room-label">${roomLabel}</div><div class="pips" aria-hidden="true">${pips.join('')}</div></div>
      <div class="clock" id="clock" ${tip('<div class="tt-title">Round timer</div><p>Every choice is timed for everyone and ends early once everyone is ready. Fights don’t count against it. Anything you haven’t decided at zero is decided for you.</p>')}><b id="clock-num">${timerText()}</b><i><span id="clock-bar" style="width:${timerPct()}%"></span></i></div>
      <div class="vitals">
        <div class="lvl" ${tip(`<div class="tt-title">Level ${p.level}</div><p>${p.level >= L.max ? 'Max level.' : `${p.xp} of ${need} XP to level ${p.level + 1}.`} Every fight gives XP. Spec at level ${L.specLevel}; skill tree picks at ${L.treeLevels.join(', ')}. Each level gives +${L.hpPerLevel} max Health.</p>`)}><b>Lv ${p.level}</b><i><span style="width:${xpPct}%"></span></i></div>
        ${heartsRow(p.hearts)}
        ${hpBar(p.hp, max, '', 'player-top')}${poison}
        <div class="gold" ${tip('<div class="tt-title">Gold</div><p>Spend it at Merchants, the Forge and Wagers. Passing at a shop round also gives gold.</p>')}><span class="coin"></span>${p.gold}</div></div>
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
    return Math.max(0, Math.min(100, (t / (st.roundTotal || CFG().roundSeconds)) * 100));
  }

  // ---------- Stage screens ----------
  const DANGER_TIP = '<div class="tt-title">Danger</div><p>An estimate from a few practice fights against these enemies with your current gear, health and bag buffs.</p>';

  function doorsScreen(st) {
    const doors = st.doors.map((d, i) => {
      const info = G.Dungeon.doorInfo(d);
      const dg = d.danger ? `<span class="danger d-${d.danger.level.toLowerCase()}" ${tip(DANGER_TIP + `<p class="tt-extra">Average health lost: ${d.danger.avgLoss}</p>`)}>${d.danger.level} danger · ~${d.danger.avgLoss} dmg</span>` : '';
      const icon = 'door_' + d.type;
      return `<div class="door door-${d.type}">
        <button class="door-btn" data-act="door" data-i="${i}">
          <span class="door-arch">${G.Art.icon(icon, 'big')}</span>
          <span class="door-title">${info.title}</span>
          <span class="door-text">${esc(info.text)}</span>
        </button>${dg}</div>`;
    }).join('');
    const one = st.doors.length === 1;
    const t = st.doors[0].type;
    return `<section class="screen">
      <h2>${t === 'armory' ? 'Room 1: the Armory' : one ? 'A single door, sealed with iron' : 'Two doors'}</h2>
      <p class="lede">${t === 'armory' ? 'Grab a weapon. The real run starts in room 2.' : one ? 'No way around it. Win to continue.' : 'Pick one. Health carries from room to room, so spend it wisely. You can use bag items before you choose.'}</p>
      <div class="doors ${one ? 'one' : ''}">${doors}</div>
      ${characterBlock(st.player)}
    </section>`;
  }

  function battleScreen(st) {
    const b = st.battle;
    return `<section class="screen battle">
      <h2>${esc(b.title)}</h2>
      ${b.duel || b.tour ? '<p class="lede">Player fights: every hit deals a quarter damage, so fights last longer.</p>' : ''}
      <div id="arena-slot" class="arena-slot"></div>
      <div class="battle-bar"><span class="speed-tag" id="speed-tag">1x speed</span><small>Fights speed up to 2x after ${CFG().combat.fastAfter} seconds. The round timer waits for the fight.</small></div>
      <ol id="battle-log" class="log" aria-live="polite"></ol>
    </section>`;
  }

  function armoryScreen(st) {
    const p = st.player;
    const cards = st.armory.map(it => itemCard(it, p, `<button data-act="weapon" data-id="${it.id}">Take the ${esc(G.WEAPONS[it.weaponType].name)}</button>`)).join('');
    return `<section class="screen"><h2>The Armory</h2>
      <p class="lede">Racks of old steel. Three weapons are yours to choose from. Uncommon and rare weapons later carry a class that fits them.</p>
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
      ${characterBlock(p)}
    </section>`;
  }

  function spoilsScreen(st) {
    const cards = st.spoils.map(o => `<article class="card spoil"><div class="spec-head"><b>${esc(o.title)}</b></div><p>${esc(o.text)}</p>
      <button data-act="spoils" data-id="${o.id}">Take it</button></article>`).join('');
    return `<section class="screen"><h2>Victory</h2><p class="lede">${esc(st.spoilsText)}</p>
      <div class="cards three">${cards}</div>${characterBlock(st.player)}</section>`;
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
      const state = sh.picks[id] ? `took ${esc(sh.picks[id])}` : now ? `<b id="turn-num">${turnLeft()}s</b> ${h.isPlayer ? 'to pick' : 'picking…'}` : 'waiting';
      const bar = now ? `<i class="turnbar ${h.isPlayer ? 'mine' : ''}"><span id="turn-bar" style="width:${turnPct()}%"></span></i>` : '';
      return `<li class="${now ? 'now' : ''} ${h.isPlayer ? 'me' : ''}"><span>${i + 1}</span><b>${esc(h.name)}</b><small>${Math.round(h.hp / G.Hero.maxHp(h) * 100)}% health</small><em>${state}</em>${bar}</li>`;
    }).join('');
    const myNow = myTurn && !reviewing;
    const table = sh.table.map(it => itemCard(it, p, myNow
      ? `<button data-act="shop-pick" data-id="${it.id}" ${it.kind === 'consumable' && full ? 'disabled' : ''}>${it.kind === 'consumable' && full ? 'Bag full' : 'Take this'}</button>`
      : `<button disabled>${picked ? 'Picked' : reviewing ? 'Picks start soon' : 'Wait for your turn'}</button>`)).join('');
    const review = reviewing ? `<div class="review"><span>Look over the table. Picks start in <b id="review-num">${reviewLeft()}s</b></span><i class="turnbar"><span id="review-bar" style="width:${reviewPct()}%"></span></i></div>` : '';
    return `${review}<h3 class="sub">Pick order</h3>
      <ol class="pick-order">${order}</ol>
      <h3 class="sub">Free table ${myNow ? '<span class="chip">Your turn</span>' : ''}</h3>
      ${myNow ? `<div class="pass-row"><button class="ghost" data-act="shop-pass">Pass and take ${CFG().shop.passGold} gold</button><small>If your timer runs out, you pass.</small></div>` : ''}
      <div class="cards">${table || '<p class="hint">The table is empty.</p>'}</div>`;
  }

  // Rival picks only refresh this part, so clicks and tooltips aren't lost to a re-render
  function refreshShopPicks() {
    const st = G.Game.s, el = document.getElementById('shop-picks');
    if (!st || st.phase !== 'shop' || !el) return render();
    el.innerHTML = shopPicks(st);
  }

  function shopScreen(st) {
    const sh = st.shop, S = CFG().shop;
    return `<section class="screen shop">
      <h2>Shop round</h2>
      <p class="lede">Free picks go weakest first: the lowest health percentage picks first. Everyone gets ${S.reviewSeconds} seconds to look, then ${S.turnSeconds} seconds per turn. Pass to take ${S.passGold} gold instead.</p>
      ${sh.msg ? `<p class="notice">${esc(sh.msg)}</p>` : ''}
      <div id="shop-picks">${shopPicks(st)}</div></section>`;
  }

  function merchantScreen(st) {
    const m = st.merchant, p = st.player, S = CFG().shop;
    const full = G.Hero.bagFull(p);
    const stock = m.stock.map(it => {
      const price = G.Dungeon.merchantPrice(p, m, it), sold = m.bought.includes(it.id);
      return itemCard(it, p, sold ? '<button disabled>Sold</button>' : `<button data-act="shop-buy" data-kind="gear" data-id="${it.id}" ${p.gold < price ? 'disabled' : ''}>${price === 0 ? 'Take it free (Haggler)' : `Buy for ${price} gold`}</button>`);
    }).join('');
    const consRow = (id, price, note, disabled, label) => {
      const c = G.CONSUMABLES[id];
      return `<div class="potion card"><span class="ico-wrap">${G.Art.icon('potion_' + id)}</span><div><b>${esc(c.name)}</b><small>${esc(c.desc)}${note ? ' ' + note : ''}</small></div>
        <button data-act="shop-buy" data-kind="cons" data-id="${id}" ${disabled || p.gold < price || full ? 'disabled' : ''}>${disabled ? label || 'Sold out' : full ? 'Bag full' : `${price} gold`}</button></div>`;
    };
    const restockCost = S.restockCosts[m.restocks];
    const bloodNote = p.gem === 'stone' ? 'Lose 1 health (Heart of Stone)' : `Lose ${S.bloodCost[0]} to ${S.bloodCost[1]} health`;
    const tooWeak = p.gem === 'stone' ? p.hp <= 1 : p.hp <= S.bloodCost[1];
    return `<section class="screen shop">
      <h2>Merchant</h2>
      <p class="lede">A trader with a cart full of gear. You have ${p.gold} gold. Stay as long as the room timer allows, or leave when you're done.</p>
      ${m.msg ? `<p class="notice">${esc(m.msg)}</p>` : ''}
      <div class="shop-row">
        ${consRow('potion', S.potionCost, `${m.potions} in stock.`, m.potions <= 0)}
        ${consRow('antidote', G.CONSUMABLES.antidote.price, '', false)}
        ${m.buffs.map(id => consRow(id, G.CONSUMABLES[id].price, '', false)).join('')}
        <div class="potion card"><span class="flask blood"></span><div><b>Sell blood</b><small>${bloodNote}, gain ${S.bloodGold} gold.</small></div>
          <button data-act="shop-buy" data-kind="blood" ${tooWeak ? 'disabled' : ''}>${tooWeak ? 'Too weak' : `Bleed for ${S.bloodGold}`}</button></div>
      </div>
      <div class="cards">${stock}</div>
      <div class="row-actions">
        <button class="ghost" data-act="shop-buy" data-kind="restock" ${restockCost == null || p.gold < restockCost ? 'disabled' : ''}>${restockCost == null ? 'No restocks left' : `Restock gear (${restockCost} gold, ${S.restockCosts.length - m.restocks} left)`}</button>
        <button data-act="merchant-leave">Leave the merchant</button>
      </div></section>`;
  }

  function forgeScreen(st) {
    const f = st.forge, p = st.player, F = CFG().forge;
    const cards = G.SLOTS.filter(sl => p.gear[sl]).map(sl => {
      const it = p.gear[sl];
      return itemCard(it, p, `<button data-act="forge" data-kind="strengthen" data-slot="${sl}" ${f.strengthened || p.gold < F.upgradeCost ? 'disabled' : ''}>Strengthen (${F.upgradeCost})</button>
        <button class="ghost" data-act="forge" data-kind="reroll" data-slot="${sl}" ${f.rerolled || p.gold < F.rerollCost || it.rarity === 'grey' ? 'disabled' : ''}>${it.rarity === 'grey' ? 'No bonus to reroll' : `Reroll bonus (${F.rerollCost})`}</button>`);
    }).join('');
    return `<section class="screen"><h2>Forge</h2>
      <p class="lede">The smith can strengthen one item (its base stats grow by one tier) and reroll one item's bonus. You have ${p.gold} gold.</p>
      ${f.msg ? `<p class="notice">${esc(f.msg)}</p>` : ''}
      <div class="cards">${cards}</div>
      <div class="row-actions"><button data-act="forge-leave">Leave the forge</button></div></section>`;
  }

  function wagerScreen(st) {
    const p = st.player, d = st.door, B = CFG().wager.bets;
    const dg = G.Dungeon.danger(p, d, st.room);
    return `<section class="screen"><h2>Wager</h2>
      <p class="lede">A pit boss grins: "${esc(G.Dungeon.monsterName(d.monster, 'fight'))}, a tough one. Bet on yourself." Win and you double your bet, plus the usual rewards. Lose and the bet is gone, along with a heart.</p>
      <p><span class="danger d-${dg.level.toLowerCase()}">${dg.level} danger · ~${dg.avgLoss} dmg</span></p>
      <div class="row-actions">${B.map(b => `<button data-act="bet" data-v="${b}" ${p.gold < b ? 'disabled' : ''}>Bet ${b} gold</button>`).join('')}
        <button class="ghost" data-act="bet" data-v="0">Walk away</button></div></section>`;
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
      const cost = p.gem === 'stone' ? 1 : CFG().shrineCost;
      acts = `<button data-act="mystery" data-v="shrine" ${p.hp <= cost ? 'disabled' : ''}>Offer ${cost} health for an uncommon or better item</button>
        <button class="ghost" data-act="mystery" data-v="leave">Walk away</button>`;
    }
    return `<section class="screen"><h2>${esc(m.title)}</h2><p class="lede">${esc(m.text)}</p><div class="row-actions">${acts}</div></section>`;
  }

  function specScreen(st) {
    const cards = st.specOptions.map(id => {
      const S = G.SPECS[id], T = G.SPEC_TREES[id];
      return `<article class="card spec"><div class="spec-head"><b>${S.name}</b><small>${S.role}</small></div>
        <p>${esc(S.desc)}</p><p class="trait">${esc(S.tip)}</p>
        <p class="tree-peek"><small>Level 10: ${esc(T.t10.map(n => n.name).join(' or '))} · Level 15: ${esc(T.t15.map(n => n.name).join(' or '))} · Level 20: ${esc(T.t20.name)}</small></p>
        <button data-act="spec" data-id="${id}">Become a ${S.name}</button></article>`;
    }).join('');
    return `<section class="screen"><h2>Level ${CFG().levels.specLevel}: choose your specialization</h2>
      <p class="lede">Three random options. Each one has a skill tree: a choice at level 10, another at 15, and a capstone at 20.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  function treeScreen(st) {
    const p = st.player, lv = st.treeLevel, S = G.SPECS[p.spec];
    const opts = G.Stats.treeOptions(p.spec, lv);
    const cards = opts.map((n, i) => `<article class="card spec"><div class="spec-head"><b>${esc(n.name)}</b><small>${lv === 20 ? 'Capstone' : i === 0 ? 'Left' : 'Right'}</small></div>
      <p>${esc(n.desc)}.</p><button data-act="tree" data-id="${n.id}">${lv === 20 ? 'Claim it' : 'Take this path'}</button></article>`).join('');
    const taken = G.Stats.treeFx(p).nodes.map(n => n.name).join(', ');
    return `<section class="screen"><h2>Level ${lv}: ${esc(S.name)} skill tree</h2>
      <p class="lede">${lv === 20 ? 'The capstone of your specialization.' : 'Pick a path. You can’t change it later.'}${taken ? ` So far: ${esc(taken)}.` : ''}</p>
      <div class="cards ${opts.length === 1 ? 'one' : ''}">${cards}</div></section>`;
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

  function nameOf(e) { return e.ghost ? e.name : e.hero.isPlayer ? 'You' : e.hero.name; }
  function duelIntroScreen(st) {
    const d = st.duel, m = d.mine;
    const others = d.pairs.filter(p => p !== m).map(p => {
      if (!p.result) return `<li>${esc(nameOf(p.a))} <small>vs</small> ${esc(nameOf(p.b))}</li>`;
      return `<li><b>${esc(nameOf(p.winner))}</b> <small>beat</small> ${esc(nameOf(p.winner === p.a ? p.b : p.a))}</li>`;
    }).join('');
    const opp = m.a.hero && m.a.hero.isPlayer ? m.b : m.a;
    return `<section class="screen"><h2>Duel</h2>
      <p class="lede">Everyone still in is paired up. ${opp.ghost ? `You're the odd one out, so you face a ghost: a half-strength copy of ${esc(opp.of.name)}. Losing to it costs no heart.` : `You face <b>${esc(opp.hero.name)}</b>. The loser loses a heart.`} You fight at your current health, and it goes back to what it was afterward.</p>
      ${others ? `<div class="round"><h4>Other duels</h4><ul>${others}</ul></div>` : ''}
      <div class="row-actions"><button data-act="duel-go">Fight</button></div>
      <p class="waiting">Starts in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b></p></section>`;
  }

  function deadScreen(st) {
    return `<section class="screen end"><h2>You're out of hearts</h2>
      <p class="lede">${esc(st.notice || 'The dungeon took your last heart.')} In a full game you'd be spectating now.</p>
      <div class="row-actions"><button data-act="ending">See how the match ended</button><button class="ghost" data-act="title">Try again</button></div></section>`;
  }

  // Standings: every player's hearts and health, this round's pairings, past results
  function standings(T) {
    const rows = T.entrants.slice().sort((a, b) => (a.out - b.out) || (b.hero.hearts - a.hero.hearts) || (b.hp - a.hp)).map(e => {
      const build = buildLabel(e.hero);
      return `<tr class="${e.hero.isPlayer ? 'me' : ''} ${e.out ? 'out' : ''}"><td>${esc(e.hero.isPlayer ? 'You' : e.hero.name)}</td><td>${heartsRow(e.hero.hearts, 'sm')}</td>
        <td>${e.out ? `<small>${ord(e.place)}</small>` : `<b>${e.hp}</b> <small>/ ${e.maxHp}</small>`}</td><td><small>${esc(build)}</small></td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="tour"><thead><tr><th>Player</th><th>Hearts</th><th>Health</th><th>Build</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const ord = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

  function roundsList(T) {
    if (!T.rounds.length) return '';
    const next = G.Tournament.nextMatch(T);
    return `<div class="bracket">${T.rounds.slice().reverse().map(r => `<div class="b-col"><h4>Round ${r.n}</h4><div class="b-list">${r.pairs.map(p => {
      const row = (e, won) => `<div class="b-row ${e.ghost ? 'ghost' : ''} ${!e.ghost && e.hero.isPlayer ? 'me' : ''} ${won === true ? 'won' : won === false ? 'lost' : ''}"><b>${esc(nameOf(e))}</b></div>`;
      const wa = p.result ? p.winner === p.a : null;
      const mine = (p.a.hero && p.a.hero.isPlayer) || (!p.ghost && p.b.hero.isPlayer);
      const note = p.result ? (p.ghost ? 'Ghost fight: no heart at stake' : p.lostHeart ? `${esc(nameOf(p.lostHeart))} loses a heart${p.lostHeart.out ? ' and is out' : ''}` : '') : p === next ? (mine ? 'Your fight is next' : 'Up next') : 'Waiting';
      return `<div class="b-match ${p === next ? 'next' : ''}">${row(p.a, wa === null ? null : wa)}<div class="b-vs">vs</div>${row(p.b, wa === null ? null : !wa)}<div class="b-note">${note}</div></div>`;
    }).join('')}</div></div>`).join('')}</div>`;
  }

  function placements(T) {
    const sorted = T.entrants.slice().sort((a, b) => a.place - b.place);
    return `<ol class="places">${sorted.map(e => `<li class="${e.hero.isPlayer ? 'me' : ''}"><span>${ord(e.place)}</span>${esc(e.hero.isPlayer ? 'You' : e.hero.name)}</li>`).join('')}</ol>`;
  }

  function tournamentScreen(st) {
    const T = st.tour;
    if (T.champion) {
      const won = T.champion.hero.isPlayer;
      return `<section class="screen end"><h2>${won ? 'You are the last one standing' : `${esc(T.champion.hero.name)} wins the tournament`}</h2>
        <p class="lede">${T.entrants.length === 1 ? 'Everyone else ran out of hearts in the dungeon.' : won ? 'Thirty rooms, a tournament, and nobody could stop you.' : 'You made it to the end. Next time, the crown.'}</p>
        ${placements(T)}${roundsList(T)}
        <div class="row-actions"><button data-act="title">Play again</button></div></section>`;
    }
    const m = G.Tournament.nextMatch(T);
    const mine = m && ((m.a.hero && m.a.hero.isPlayer) || (!m.ghost && m.b.hero.isPlayer));
    return `<section class="screen"><h2>The Tournament</h2>
      <p class="lede">Last one with hearts wins. Each round everyone is paired up again. Winners keep the health they finish with; losers lose a heart and come back at full health. Every hit deals a quarter damage.</p>
      ${standings(T)}
      ${roundsList(T)}
      <p class="waiting">${mine ? 'Your fight starts' : 'Next fights start'} in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b></p></section>`;
  }

  function endingScreen(st) {
    const T = st.tour;
    const fallen = [st.player, ...st.rivals].filter(r => !r.alive).sort((a, b) => (b.diedRoom || 0) - (a.diedRoom || 0))
      .map(r => `<li>${esc(r.name)} <small>ran out of hearts in room ${r.diedRoom}</small></li>`).join('');
    return `<section class="screen end"><h2>${T && T.champion ? `${esc(T.champion.hero.name)} won the tournament` : 'Nobody made it out'}</h2>
      ${T ? placements(T) + roundsList(T) : '<p class="lede">The dungeon claimed every warrior.</p>'}
      ${fallen ? `<div class="round"><h4>Out in the dungeon</h4><ul>${fallen}</ul></div>` : ''}
      <div class="row-actions"><button data-act="title">Play again</button></div></section>`;
  }

  function titleScreen() {
    return `<div class="title-screen">
      <header class="hero-head"><div class="eyebrow">Prototype v4 · single player</div><h1>Thirty Doors</h1>
        <p>Six warriors. Thirty rooms each. Three hearts. Health carries from room to room and healing is limited, so spend it wisely. Build an archetype, fight your rivals along the way, and be the last one standing.</p></header>
      <ul class="rules">
        <li><b>Hearts</b>Dying or losing a duel costs a heart. You come back at full health. Lose all three and you're out.</li>
        <li><b>Class sets</b>Some gear carries a class, and every match has a limited supply. 2, 4 or 6 pieces, or 4 + 2 for a hybrid.</li>
        <li><b>Levels</b>Fights give XP. Pick a spec at level ${CFG().levels.specLevel}, then skill tree choices at ${CFG().levels.treeLevels.join(', ')}.</li>
        <li><b>Duels</b>After the bosses in rooms ${CFG().duelRooms.join(' and ')}, everyone fights a rival.</li>
        <li><b>Shops</b>Rooms ${CFG().shopRooms.join(', ')}: free picks, weakest first. Merchants, the Forge and Wagers take gold.</li>
        <li><b>The tournament</b>After room 30, everyone with hearts fights round after round until one is left.</li>
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
    if (!st) { app.innerHTML = titleScreen(); G.Preview.park(); window.scrollTo(0, 0); return; }
    if (st.phase === 'battle') bagOpen = -1;
    const screens = { doors: doorsScreen, battle: battleScreen, armory: armoryScreen, reward: rewardScreen, spoils: spoilsScreen, shop: shopScreen,
      merchant: merchantScreen, forge: forgeScreen, wager: wagerScreen, mystery: mysteryScreen, spec: specScreen, tree: treeScreen, gem: gemScreen,
      duelIntro: duelIntroScreen, dead: deadScreen, tournament: tournamentScreen, ending: endingScreen };
    const prevPhase = app.dataset.phase;
    const notice = st.notice && !['dead', 'shop'].includes(st.phase) ? `<p class="notice">${esc(st.notice)}</p>` : '';
    app.innerHTML = `<div class="shell">${topbar(st)}<div class="cols"><aside class="left">${rivalsPanel(st)}</aside><main class="stage">${notice}${screens[st.phase](st)}</main>
      <aside class="side">${bagPanel(st)}${statsPanel(st.player)}${gearPanel(st.player)}${setsPanel(st.player)}</aside></div></div>`;
    if (st.phase !== prevPhase) window.scrollTo(0, 0);
    app.dataset.phase = st.phase;
    if (st.phase === 'battle') startBattleView(st);
    const pv = document.getElementById('preview-slot');
    if (pv) G.Preview.mount(pv, G.visualFor(st.player)); else G.Preview.park();
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
      case 'burn': return `${subj(e.tgt)} ${verb(e.tgt, 'burn', 'burns')} for ${e.amount}`;
      case 'thorns': return `${subj(e.tgt)} ${verb(e.tgt, 'take', 'takes')} ${e.amount} back`;
      case 'dodge': return `${subj(e.tgt)} ${verb(e.tgt, 'dodge', 'dodges')}`;
      case 'hidden': return `${subj(e.src)} ${verb(e.src, 'swing', 'swings')} at shadows`;
      case 'parry': return `${subj(e.tgt)} ${verb(e.tgt, 'parry', 'parries')}`;
      case 'stun': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} stunned`;
      case 'heal': return `${subj(e.src)} ${verb(e.src, 'heal', 'heals')} ${e.amount}${e.label ? ` (${e.label})` : ''}`;
      case 'stealth_on': return `${subj(e.src)} ${verb(e.src, 'vanish', 'vanishes')}${e.label ? ' (Vanish)' : ''}`;
      case 'kite': return `${subj(e.src)} ${verb(e.src, 'step', 'steps')} back (Kiting)`;
      case 'burst': return `${subj(e.src)} ${verb(e.src, 'explode', 'explodes')} in flame`;
      case 'undying': return `${subj(e.src)} ${verb(e.src, 'refuse', 'refuses')} to fall (Undying Rage)`;
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

  // Small message over an element that fades out (never re-renders, so a running fight keeps going)
  function toast(el, text) {
    const host = el.closest('.bag-slot') || el.parentNode;
    const old = host.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('span');
    t.className = 'toast'; t.textContent = text; t.setAttribute('role', 'status');
    host.appendChild(t);
    setTimeout(() => t.remove(), 1500);
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
      case 'spoils': Gm.takeSpoils(el.dataset.id); break;
      case 'mystery': Gm.mysteryAct(el.dataset.v); break;
      case 'spec': Gm.chooseSpec(el.dataset.id); break;
      case 'tree': Gm.chooseTree(el.dataset.id); break;
      case 'gem': Gm.chooseGem(el.dataset.id); break;
      case 'bet': Gm.placeBet(+el.dataset.v); break;
      case 'forge': Gm.forgeAct(el.dataset.kind, el.dataset.slot); break;
      case 'forge-leave': Gm.leaveForge(); break;
      case 'duel-go': Gm.startDuelFight(); break;
      case 'supply': supplyOpen = !supplyOpen; if (G.Game.s && G.Game.s.phase === 'battle') { const sp = el.closest('.panel'); if (sp) sp.outerHTML = setsPanel(G.Game.s.player); } else render(); break;
      case 'bag-menu':
        if (G.Game.s && G.Game.s.phase === 'battle') { toast(el, 'Can’t use during combat!'); break; }
        bagOpen = bagOpen === +el.dataset.i ? -1 : +el.dataset.i; render(); break;
      case 'bag-use': Gm.useBag(+el.dataset.i); break;
      case 'bag-drop': Gm.discardBag(+el.dataset.i); break;
      case 'shop-pick': Gm.playerShopPick(el.dataset.id); break;
      case 'shop-buy': Gm.shopBuy(el.dataset.kind, el.dataset.id); break;
      case 'shop-pass': Gm.playerShopPass(); break;
      case 'merchant-leave': Gm.leaveMerchant(); break;
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
