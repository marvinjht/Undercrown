// All menus, panels and tooltips (plain HTML on top of the game).
window.G = window.G || {};

(function (G) {
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CFG = () => G.CONFIG;
  const tips = {}; let tipSeq = 0;
  const tip = (html) => { const id = 't' + (++tipSeq); tips[id] = html; return `data-tip="${id}" tabindex="0"`; };
  const RANGE_NAMES = { melee: 'Melee', reach: 'Reach (2 steps)', near: 'Near range', far: 'Far range' };
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

  // Weapon line: type · range · damage type (legendaries can change range or damage type, e.g. Inferno)
  function weaponLine(item) {
    const W = item.slot === 'weapon' ? G.WEAPONS[item.weaponType] : null;
    if (!W) return null;
    const L = item.legendary ? G.LEGENDARIES[item.legendary].fx || {} : {};
    const range = L.meleeStaff ? 'melee' : W.range, type = L.physical ? 'phys' : W.type;
    return W.name + ' · ' + RANGE_NAMES[range] + ' · ' + (type === 'magic' ? 'Magic' : 'Physical');
  }
  // Stubborn: the item has a stun that ignores the stun limit
  const isStubborn = item => !!((item.legendary && G.LEGENDARIES[item.legendary].stubborn) || (item.slot === 'weapon' && G.WEAPONS[item.weaponType] && G.WEAPONS[item.weaponType].stubborn));

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
    if (isStubborn(item)) extra += `<li class="affix stubborn">Stubborn <small>its stun ignores the stun limit</small></li>`;
    if (item.rarity === 'legendary') extra += `<li class="affix-h legend-h">Legendary effect</li><li class="effect legend">${esc(G.LEGENDARIES[item.legendary].desc)}</li>`;
    return `<ul class="${cls}">${base}${extra}</ul>`;
  }

  function itemTip(item, hero) {
    if (item.kind === 'consumable') return consumableTip(item);
    if (item.kind === 'relic') return relicTip(item.rid, hero ? G.Hero.relicCount(hero, item.rid) : 0);
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
    const wl = weaponLine(item);
    return `<div class="tt-title r-${item.rarity}">${esc(item.name)}</div>
      <div class="tt-sub">${R.name} ${wl || G.SLOT_NAMES[item.slot]} ${item.rarity === 'legendary' ? '' : ' · Tier ' + item.tier}</div>
      ${item.set ? `<div class="tt-tags">${setChip(item.set)}</div>` : ''}
      ${statList(item, 'tt-stats')}
      ${item.rarity === 'legendary' ? (item.baseTrait ? `<div class="tt-trait">${esc(item.baseTrait)}</div>` : '') : item.trait ? `<div class="tt-trait">${esc(item.trait)}</div>` : ''}
      ${item.rarity === 'legendary' ? '<p class="tt-extra">Legendary: you can wear only one. Fixed stats, one of a kind in this match.</p>' : ''}${item.affixed ? '<p class="tt-extra">Forged: already has its added bonus.</p>' : ''}${cmp}`;
  }

  // Only label an item when every change points the same way
  function verdict(hero, item) {
    if (item.kind === 'consumable') return { cls: 'side', text: 'Bag item' };
    if (item.kind === 'relic') return null;
    if (item.rarity === 'legendary') return null;
    const eq = hero.gear[item.slot];
    if (!eq) return { cls: 'up', text: 'Empty slot' };
    const diffs = G.Items.compare(item, eq);
    const same = (item.set || null) === (eq.set || null) && eq.rarity !== 'legendary';
    if (!diffs.length) return same ? { cls: 'side', text: 'Same stats' } : null;
    if (diffs.every(d => d.d > 0) && same) return { cls: 'up', text: 'Upgrade' };
    if (diffs.every(d => d.d < 0) && same) return { cls: 'down', text: 'Downgrade' };
    return null;
  }

  function itemCard(item, hero, btns) {
    if (item.kind === 'relic') {
      const R = G.RELICS[item.rid], n = G.Hero.relicCount(hero, item.rid), max = n >= G.RELIC_MAX;
      return `<article class="card item relic-card" style="--rel:${R.color}">
        <div class="item-head"><span class="ico-wrap">${G.Art.icon(item.iconKey)}</span>
          <div class="item-name"><b>${esc(R.name)}</b><small>Relic${n ? ` · you have ${n}/${G.RELIC_MAX}` : ''}</small><span class="tags"><span class="verdict relic-tag">Relic</span></span></div></div>
        <p class="trait">${esc(R.text(Math.min(G.RELIC_MAX, n + 1)))}.</p>
        <p class="hint">${max ? 'You have this relic maxed.' : n ? `Stacks with yours (now: ${esc(R.text(n))}).` : 'Goes to your relic row. Never uses bag space.'}</p>
        <div class="btns">${btns}</div></article>`;
    }
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
    const wl = weaponLine(item);
    return `<article class="card item r-${item.rarity}">
      <div class="item-head">
        <span class="ico-wrap r-${item.rarity}">${G.Art.icon(item.iconKey)}</span>
        <div class="item-name"><b class="r-${item.rarity}">${esc(item.name)}</b>
          <small>${G.RARITY[item.rarity].name} ${wl ? esc(wl) : G.SLOT_NAMES[item.slot]}</small>
          <span class="tags">${setChip(item.set)}${v ? `<span class="verdict ${v.cls}">${v.text}</span>` : ''}</span></div>
      </div>
      ${statList(item, 'stat-list')}
      ${item.trait && item.rarity !== 'legendary' ? `<p class="trait">${esc(item.trait)}</p>` : ''}
      ${item.rarity === 'legendary' && !G.Hero.canEquip(hero, item) ? `<p class="warn">You already wear a legendary (${esc(G.Hero.wornLegendary(hero).name)}). This one can only go in your bag.</p>` : ''}
      ${eq ? `<div class="cmp"><span>Compared to ${esc(eq.name)}${eq.rarity === 'legendary' ? ' (loses its legendary effect)' : ''}</span><ul>${diffs.map(d => `<li class="${d.d > 0 ? 'up' : 'down'}">${esc(d.text)}</li>`).join('')}</ul></div>` : ''}
      <div class="btns">${btns}</div>
    </article>`;
  }

  // ---------- Stats in columns ----------
  // ov: { s, hp } to show stats other than the hero's own (a ghost's halved copy)
  function statCols(hero, compact, ov) {
    const s = ov ? ov.s : G.Stats.compute(hero);
    const hp = ov ? ov.hp : hero.hp;
    const I = G.STAT_INFO;
    const CB = CFG().combat;
    const cell = (label, val, info, extra = '', cap = null) =>
      `<li ${tip(`<div class="tt-title">${label}</div><p>${esc(info)}</p>${extra ? `<p class="tt-extra">${extra}</p>` : ''}${cap ? `<p class="tt-cap ${cap.at ? 'at' : ''}">${cap.text}</p>` : ''}`)} class="${cap && cap.at ? 'capped' : ''}"><span>${label}</span><b>${val}</b></li>`;
    // Hard caps: show the cap, your value, and whether you're at it
    const hardCap = (raw, max) => ({ at: raw >= max, text: `Cap: ${max}. Yours: ${raw}${raw > max ? ` (${raw - max} over, wasted)` : raw === max ? ' (capped)' : ''}.` });
    const bonusSpd = (s.spdUncapped || s.spd) - (s.spdBase || s.spd);
    const spdCap = { at: bonusSpd >= CB.spdSoftCap, text: `Cap: bonus Attack Speed above your weapon's ${s.spdBase} counts in full up to +${CB.spdSoftCap}, then half. Yours: +${Math.max(0, bonusSpd)}${bonusSpd > CB.spdSoftCap ? ` (past the cap; ${bonusSpd - CB.spdSoftCap} counts as ${Math.floor((bonusSpd - CB.spdSoftCap) / 2)})` : bonusSpd === CB.spdSoftCap ? ' (at the cap)' : ''}.` };
    const def = [
      cell('Health', `${hp}/${s.maxHp}`, 'Health carries from room to room. Healing is limited, so spend it wisely.'),
      cell('Armor', s.armor, I.armor.desc), cell('Magic Resist', s.ward, I.ward.desc), cell('Dodge', s.dodge, I.dodge.desc, '', hardCap(s.dodgeRaw != null ? s.dodgeRaw : s.dodge, CB.dodgeCap)),
    ];
    const off = [
      cell('Damage', s.dmg, I.dmg.desc, s.type === 'magic' ? 'Your weapon deals magic damage, so Magic Resist blocks it.' : 'Your weapon deals physical damage, so Armor blocks it.',
        s.spec === 'berserker' ? { at: false, text: `Cap: Berserker's missing-health bonus adds at most +${(s.fx && s.fx.berserkCap) || CB.berserkCap} Damage.` } : null),
      cell('Attack Speed', s.spd, I.spd.desc, `You attack every ${Math.round(100 / s.spd) / 10} seconds.`, ov ? null : spdCap),
      cell('Crit', s.crit, I.crit.desc, `Your crits hit for ${s.dmg * 2 + s.critDmg}.`, hardCap(s.critRaw != null ? s.critRaw : s.crit, CB.critCap)),
      cell('Range', RANGE_NAMES[s.range].replace(' range', ''), 'Fights start 6 steps apart. Melee walks in first; the Longsword reaches 2 steps; Near shoots from 4 steps, Far from 6.'),
    ];
    const ext = [];
    if (s.critDmg) ext.push(cell('Crit Dmg', s.critDmg, I.critDmg.desc));
    for (const k of ['shield', 'holy', 'pierce', 'leech', 'bleed', 'stun']) if (s[k] > 0) ext.push(cell(I[k].label, s[k], I[k].desc, '',
      k === 'stun' ? { at: false, text: `Stun limit: after a stun, the target can't be stunned again for ${CB.stunImmune} seconds. Stubborn stuns ignore it.` } : null));
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
      <div class="pv-left"><div class="pv-top">${levelBadge(p)}</div><div class="pv-mid"><div id="preview-slot" class="preview-slot" aria-hidden="true"></div>
        <div class="pv-info"><b>You</b><span>${esc(buildLabel(p))}</span><small>${p.spec ? `<button class="linkish" data-act="spec-tree" title="See the skill tree">${esc(spec)}</button>` : esc(spec)}${p.gem ? ' · ' + esc(G.GEMS[p.gem].name) : ''}</small></div></div>
        ${vitalsRow(p, 'player-block')}</div>
      <div class="pv-right">${statCols(p)}${setBonus(p)}</div>
      ${relicRow(p)}</div>`;
  }


  // ---------- Side panels ----------
  function gearPanel(hero) {
    return `<section class="panel"><h3>Gear</h3><div class="gear-grid">${G.SLOTS.map(slot => {
      const it = hero.gear[slot];
      if (!it) return `<div class="slot empty" ${tip(`<div class="tt-title">${G.SLOT_NAMES[slot]}</div><div class="tt-sub">Empty. Loot leans toward empty slots.</div>`)}>
        <span class="ico-wrap">${G.Art.icon(slot)}</span><small>${G.SLOT_NAMES[slot]}</small></div>`;
      return `<div class="slot r-${it.rarity}" ${tip(itemTip(it))}><span class="ico-wrap r-${it.rarity}">${G.Art.icon(it.iconKey)}</span><small>${esc(it.name)}</small>${it.set ? `<i class="set-dot" style="--set:${G.CLASSES[it.set].color}"></i>` : ''}${it.rarity === 'legendary' ? '<i class="fx-dot legend"></i>' : ''}</div>`;
    }).join('')}</div></section>`;
  }

  function supplyBlock() {
    const counts = G.Supply.counts(), per = CFG().supplyPerClass;
    const bars = G.CLASS_ORDER.map(c => `<i style="--set:${G.CLASSES[c].color};--fill:${Math.round(counts[c] / per * 100)}%" title="${G.CLASSES[c].name}: ${counts[c]} of ${per} left"></i>`).join('');
    let detail = '';
    if (supplyOpen) {
      const heroes = G.Game.all().filter(h => h.alive);
      detail = `<table class="supply-table"><thead><tr><th>Class</th><th>Left</th>${heroes.map(h => `<th title="${esc(h.name)}">${esc(h.isPlayer ? 'You' : h.name.split(' ').pop().slice(0, 3))}</th>`).join('')}</tr></thead><tbody>${
        G.CLASS_ORDER.map(c => { return `<tr><td style="color:${G.CLASSES[c].color}">${G.CLASSES[c].name}</td><td><b>${counts[c]}</b>/${per}</td>${heroes.map(h => { const n = G.Supply.held(c, h); return `<td>${n || ''}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table>
        <p class="hint">Every match has ${per} pieces of each class, shared by everyone. When a class runs low, its pieces stop dropping until someone lets one go. Legendaries count toward your set but don’t use up the supply.</p>`;
    }
    return `<div class="supply"><button class="supply-row" data-act="supply" aria-expanded="${supplyOpen}"><span>Set supply</span><span class="supply-bars">${bars}</span><span class="chev">${supplyOpen ? 'Hide' : 'Show'}</span></button>${detail}</div>`;
  }

  // ---------- Relics ----------
  function relicTip(rid, n) {
    const R = G.RELICS[rid], max = G.RELIC_MAX;
    return `<div class="tt-title" style="color:${R.color}">${esc(R.name)} <small>relic${n ? ` · ${n}/${max}` : ''}</small></div>
      ${n ? `<p class="tier on">${esc(R.text(n))}.</p>` : `<p>${esc(R.text(1))}.</p>`}
      ${n >= max ? '<p class="tt-extra">Maxed. It can’t drop for you again.</p>' : `<p class="tier off"><b>${n ? 'Next copy' : 'More copies'}:</b> ${esc(R.text(Math.min(max, (n || 1) + 1)))}.</p><p class="tt-extra">Relics stack up to ${max} copies and never use bag space.</p>`}`;
  }
  // Always shown under your stats (and under the arena in fights)
  function relicRow(p) {
    const ids = G.RELIC_ORDER.filter(r => (p.relics || {})[r]);
    const chips = ids.map(r => {
      const n = p.relics[r], R = G.RELICS[r], max = n >= G.RELIC_MAX;
      return `<li class="relic ${max ? 'maxed' : ''}" style="--rel:${R.color}" ${tip(relicTip(r, n))}><span class="ico-wrap">${G.Art.icon('relic_' + r)}</span><b>${esc(R.name)}</b><small>${max ? 'MAX' : '×' + n}</small></li>`;
    }).join('');
    return `<div class="relic-row"><h4>Relics</h4>${ids.length ? `<ul>${chips}</ul>` : '<p class="hint">No relics yet. They drop at Plunder, from elites and bosses, and in vaults.</p>'}</div>`;
  }

  // ---------- Set bonuses ----------
  // Which tiers are switched on right now for a class with n pieces (the 4-piece bonus replaces the 2-piece one)
  function tierOn(n) { return { two: n >= 2 && n < 4, four: n >= 4, six: n >= 6 }; }
  const nextAt = n => (n < 2 ? 2 : n < 4 ? 4 : 6);

  function classTiers(c, n) {
    const C = G.CLASSES[c], on = tierOn(n);
    const row = (k, label, text) => `<p class="tier ${on[k] ? 'on' : 'off'}"><b>${label}:</b> ${esc(text)}.${on[k] ? ' <span class="tier-tag">Active</span>' : ''}</p>`;
    return row('two', '2 pieces', C.two.desc) + row('four', '4 pieces', C.four.desc + '. Your color and look change') + row('six', `6 pieces, ${C.six.name}`, C.six.desc);
  }
  function setTip(hero, c) {
    const st = G.Stats.sets(hero), n = st.counts[c] || 0, C = G.CLASSES[c];
    const left = G.Supply.counts()[c];
    return `<div class="tt-title" style="color:${C.color}">${C.name} set <small>${n} of 6 worn</small></div>${classTiers(c, n)}
      <p class="tt-extra">The 4-piece bonus replaces the 2-piece one. All 6 slots count, weapon included. ${left} of ${CFG().supplyPerClass} ${C.name} pieces are left in this match.</p>`;
  }
  function hybridTip(key, active) {
    const h = G.HYBRIDS[key], [a, b] = key.split('+');
    return `<div class="tt-title">${esc(h.name)} <small>hybrid</small></div><p class="tier ${active ? 'on' : 'off'}">${esc(h.desc)}.${active ? ' <span class="tier-tag">Active</span>' : ''}</p>
      <p class="tt-extra">4 pieces of ${G.CLASSES[a].name} and 2 of ${G.CLASSES[b].name}, or the other way round.</p>`;
  }

  // Only the classes you're wearing, each with progress toward its next bonus. Hover for the tiers, ? for every set.
  function setBonus(hero, guide = true) {
    const st = G.Stats.sets(hero);
    const worn = G.CLASS_ORDER.filter(c => st.counts[c]).sort((a, b) => st.counts[b] - st.counts[a]);
    const rows = worn.map(c => {
      const n = st.counts[c], C = G.CLASSES[c], on = tierOn(n);
      const status = on.six ? `${C.six.name} active` : on.four ? '4-piece active' : on.two ? '2-piece active' : 'no bonus yet';
      return `<li class="${on.two || on.four ? 'on' : ''}" ${tip(setTip(hero, c))}>
        <span class="set-name" style="--set:${C.color}">${C.name}</span>
        <b>${n}/${n >= 6 ? 6 : nextAt(n)}</b><small>${status}</small></li>`;
    });
    if (st.hybrid) {
      const h = G.HYBRIDS[st.hybrid];
      rows.push(`<li class="on hy" ${tip(hybridTip(st.hybrid, true))}><span class="set-name hy">${esc(h.name)}</span><b>4+2</b><small>hybrid active</small></li>`);
    }
    return `<div class="setbonus"><div class="sb-head"><h4>Set bonuses</h4>${guide ? '<button class="qmark" data-act="set-guide" aria-label="All sets and hybrids" title="All sets and hybrids">?</button>' : ''}</div>
      ${rows.length ? `<ul class="sets">${rows.join('')}</ul>` : '<p class="hint">No set pieces yet. Items with a class tag count toward that set.</p>'}</div>`;
  }

  // The full reference: every class and hybrid, with what you have switched on highlighted
  function setGuideHTML(hero) {
    const st = G.Stats.sets(hero);
    const classes = G.CLASS_ORDER.map(c => {
      const C = G.CLASSES[c], n = st.counts[c] || 0;
      return `<div class="sg-class" style="--set:${C.color}"><h4>${C.name} <small>${n}/6 worn</small></h4>${classTiers(c, n)}</div>`;
    }).join('');
    const hy = Object.keys(G.HYBRIDS).map(k => {
      const h = G.HYBRIDS[k], [a, b] = k.split('+'), on = st.hybrid === k;
      return `<li class="tier ${on ? 'on' : 'off'}"><b>${esc(h.name)}</b> <small>${G.CLASSES[a].name} + ${G.CLASSES[b].name}</small><br>${esc(h.desc)}.${on ? ' <span class="tier-tag">Active</span>' : ''}</li>`;
    }).join('');
    return `<div class="sg-card" role="dialog" aria-modal="true" aria-label="Set guide">
      <div class="sg-top"><h3>Set guide</h3><button class="ghost" data-act="set-guide-close">Close</button></div>
      <p class="lede">Gear with a class tag counts toward that class. All 6 slots count, weapon included. 2 pieces give a small bonus; 4 replace it with a bigger one and change your look; 6 add the capstone. Wearing 4 of one class and 2 of another unlocks that pair's hybrid instead of a capstone. A single piece gives nothing. Every match shares ${CFG().supplyPerClass} pieces of each class.</p>
      <div class="sg-grid">${classes}</div>
      <h4 class="sg-h">Hybrids (4 of one + 2 of another)</h4><ul class="sg-hy">${hy}</ul></div>`;
  }
  function openSetGuide() {
    closeSetGuide();
    const el = document.createElement('div');
    el.id = 'set-guide'; el.className = 'sg-back';
    el.innerHTML = setGuideHTML(G.Game.s.player);
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-act="set-guide-close"]')) closeSetGuide(); });
    const b = el.querySelector('button'); if (b) b.focus();
  }
  function closeSetGuide() { const el = document.getElementById('set-guide'); if (el) el.remove(); }
  // Your specialization's skill tree, in a pop-up
  function openSpecTree() {
    const p = G.Game.s && G.Game.s.player;
    if (!p || !p.spec) return;
    closeSetGuide();
    const S = G.SPECS[p.spec];
    const el = document.createElement('div');
    el.id = 'set-guide'; el.className = 'sg-back';
    el.innerHTML = `<div class="sg-card" role="dialog" aria-modal="true" aria-label="${esc(S.name)} skill tree">
      <div class="sg-top"><h3>${esc(S.name)} skill tree</h3><button class="ghost" data-act="set-guide-close">Close</button></div>
      <p class="lede">${esc(S.desc)} Picks at levels ${CFG().levels.treeLevels.join(', ')}; you're level ${p.level}.</p>
      ${treeGraph(p.spec, p.treePicks, null)}</div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-act="set-guide-close"]')) closeSetGuide(); });
    const b = el.querySelector('button'); if (b) b.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSetGuide(); });

  function supplyPanel() {
    return `<section class="panel supply-panel">${supplyBlock()}</section>`;
  }

  // Equipping over a worn piece destroys it, so it takes a press and hold. An empty slot is a plain click.
  function bagUseBtn(p, it, i) {
    if (it.kind !== 'gear') return `<button data-act="bag-use" data-i="${i}">Use</button>`;
    if (!G.Hero.canEquip(p, it)) return `<button disabled>Equip locked</button><small class="hold-note">You already wear a legendary</small>`;
    const eq = p.gear[it.slot];
    if (!eq) return `<button data-act="bag-use" data-i="${i}">Equip</button>`;
    return `<button class="hold" data-hold="bag-use" data-i="${i}" aria-label="Press and hold to equip, replacing ${esc(eq.name)}"><span class="hold-fill"></span><span class="hold-label">Hold to equip</span></button><small class="hold-note">Replaces ${esc(eq.name)}, which sells for ${G.Dungeon.sellPrice(eq)} gold</small>`;
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
        ${open ? `<div class="bag-menu">${bagUseBtn(p, it, i)}<button class="ghost" data-act="bag-sell" data-i="${i}">Sell +${G.Dungeon.sellPrice(it)}g</button></div>` : ''}
      </div>`);
    }
    const buffs = Object.entries(p.buffs || {}).filter(([, v]) => v).map(([k, v]) => k === 'fullMana' ? 'Full mana' : `+${v} ${G.STAT_INFO[k].label}`);
    return `<section class="panel"><h3>Bag <span class="bag-head-r">${goldChip(p)}<span class="chip ${p.bag.length >= size ? 'full' : 'muted'}">${p.bag.length}/${size}</span></span></h3>
      <p class="hint bag-hint">New gear goes straight onto an empty slot; anything else lands here. To swap gear in, click it and hold Equip (the old piece sells automatically), or sell it for gold.</p>
      <div class="bag">${slots.join('')}</div>
      ${buffs.length ? `<p class="buffs">Next fight: ${buffs.join(', ')}</p>` : ''}
      ${st.bagMsg ? `<p class="bag-msg">${esc(st.bagMsg)}</p>` : ''}${dyePicker(st)}</section>`;
  }
  // Turncoat's Dye: pick a piece, then its new class
  function dyePicker(st) {
    const d = st.dye;
    if (!d || st.watchingView || !st.player.bag.some(x => x.id === d.id)) return '';
    if (!d.item) {
      const list = G.Game.dyeTargets();
      return `<div class="dye-pick"><b>Re-tag which piece?</b>${list.length ? list.map(it => `<button class="ghost" data-act="dye-item" data-id="${it.id}"><i class="set-dot" style="--set:${G.CLASSES[it.set].color}"></i>${esc(it.name)} <small>${G.CLASSES[it.set].name}</small></button>`).join('')
        : '<p class="hint">None of your gear has a class tag yet.</p>'}<button class="ghost" data-act="dye-cancel">Cancel</button></div>`;
    }
    const it = G.Game.dyeTargets().find(x => x.id === d.item);
    return `<div class="dye-pick"><b>${esc(it ? it.name : '')}: new class?</b>${G.CLASS_ORDER.filter(c => !it || c !== it.set).map(c => {
      const left = G.Supply.left(c);
      return `<button class="ghost" data-act="dye-class" data-cls="${c}" ${left > 0 ? '' : 'disabled'} style="--set:${G.CLASSES[c].color}"><i class="set-dot" style="--set:${G.CLASSES[c].color}"></i>${G.CLASSES[c].name} <small>${left} left</small></button>`;
    }).join('')}<button class="ghost" data-act="dye-cancel">Cancel</button></div>`;
  }

  function specChip(hero) {
    if (!hero.spec) return `<span class="chip muted" ${tip(`<div class="tt-title">No specialization yet</div><p>You choose one at level ${CFG().levels.specLevel}, then make skill tree picks at levels ${CFG().levels.treeLevels.join(', ')}.</p>`)}>Spec at level ${CFG().levels.specLevel}</span>`;
    const S = G.SPECS[hero.spec];
    const nodes = G.Stats.treeFx(hero).nodes;
    return `<button class="chip chip-btn" data-act="spec-tree" ${tip(`<div class="tt-title">${S.name} <small>${S.role}</small></div><p>${esc(S.desc)}</p>${nodes.map(n => `<p><b>${esc(n.name)}:</b> ${esc(n.desc)}.</p>`).join('')}<p class="tt-extra">Click to see the whole skill tree.</p>`)}>${S.name}${nodes.length ? ' ' + nodes.length + '/3' : ''}</button>`;
  }
  function gemChip(hero) {
    if (!hero.gem) return '';
    const g = G.GEMS[hero.gem];
    return `<span class="chip gem" style="--gem:${g.color}" ${tip(`<div class="tt-title">${esc(g.name)}</div><p><b>Upside:</b> ${esc(g.up)}</p><p><b>Cost:</b> ${esc(g.cost)}</p>`)}>${esc(g.name)}</span>`;
  }

  function statsPanel(hero) {
    return `<section class="panel stats-panel"><h3>Stats <span class="chips">${specChip(hero)}${gemChip(hero)}</span></h3>${statCols(hero, true)}${setBonus(hero)}</section>`;
  }

  function rivalTip(r) {
    const s = G.Stats.compute(r);
    return `<div class="tt-title">${esc(r.name)}</div>
      <div class="tt-sub">Level ${r.level} · ${r.spec ? G.SPECS[r.spec].name : 'No spec yet'}${r.gem ? ' · ' + G.GEMS[r.gem].name : ''} · ${r.gold} gold</div>
      <p class="tt-extra">${esc(buildLabel(r))}</p>
      <p class="tt-extra">${s.dmg} Damage, ${s.spd} Attack Speed, ${s.armor} Armor, ${s.ward} Magic Resist, ${s.dodge} Dodge${r.poison ? `, ${r.poison} poison` : ''}</p>
      ${r.lastText ? `<p>Last room: ${esc(r.lastText)}.</p>` : ''}<p class="tt-extra">Hover their gear squares to see each item.</p>`;
  }

  // Bots carry a label everywhere; a bot that took over a player who left says so
  function botTag(h) {
    if (!h || !h.bot) return '';
    return `<span class="bot-tag" ${tip(`<div class="tt-title">Bot</div><p>${h.botWas ? `${esc(h.botWas)} left the match, so a bot is playing their hero.` : 'An empty seat, played by the computer.'}</p>`)}>BOT</span>`;
  }
  // The eye: watch this player's game live (multiplayer, real players only)
  function eyeBtn(r) {
    if (!G.Game.mp || !G.MP.inMatch() || r.bot || !r.alive || r.slot == null || r.slot === G.MP.mySlot || st_isWatchingView()) return '';
    const on = G.MP.watching === r.slot;
    return `<button class="eye-btn ${on ? 'on' : ''}" data-act="${on ? 'watch-stop' : 'watch'}" data-slot="${r.slot}" aria-label="${on ? 'Stop watching' : 'Watch'} ${esc(r.name)}" title="${on ? 'Stop watching' : 'Watch their game live'}">${G.Art.icon('eye')}</button>`;
  }
  // Watching live is for players who are out of the match (or out of the tournament)
  function iAmOut() {
    const s = G.Game.s;
    if (!s) return false;
    if (!s.player.alive) return true;
    const e = s.tour && s.tour.entrants && s.tour.entrants.find(x => x.hero === s.player);
    return !!(e && e.out);
  }
  function st_isWatchingView() { return !!(G.Game.s && G.Game.s.watchingView); }
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
        <div class="rv-main"><div class="rv-top" ${tip(rivalTip(r))}><b>${esc(r.name)}</b>${botTag(r)}${eyeBtn(r)}<span class="lv">Lv ${r.level}</span>${heartsRow(r.hearts, 'sm')}</div>
          <div class="rv-spec">${esc([r.spec ? G.SPECS[r.spec].name : '', tag === 'No set bonus yet' ? '' : tag].filter(Boolean).join(' · '))}</div>
          ${r.alive ? hpBar(r.hp, max, 'thin', 'rv-' + r.id) : `<div class="fell">Out of hearts${r.diedRoom ? ` in room ${r.diedRoom}` : ''}</div>`}
          <div class="rarity-dots">${gear}</div>
        </div></li>`;
    }).join('');
    const alive = st.rivals.filter(r => r.alive).length;
    return `<section class="panel"><h3>${G.Game.mp ? 'Players' : 'Rivals'} <span class="chip muted">${alive} in</span></h3><ul class="rivals">${rows}</ul></section>`;
  }

  // Top bar: the dungeon only. Name and sound on the left, the room track in the middle, the clock on the right.
  function topbar(st) {
    const pips = [];
    for (let r = 1; r <= CFG().tournamentRoom; r++) {
      const kind = G.Dungeon.roomKind(r);
      const cls = r < st.room ? 'done' : r === st.room ? 'now' : '';
      const info = ROOM_INFO[kind];
      const extra = kind === 'boss' && r === CFG().gemRoom ? ' Then you choose your heart gem.' : '';
      pips.push(`<i class="pip k-${kind} ${cls}" ${tip(`<div class="tt-title">Room ${r}: ${info.name}</div><p>${info.text}${extra}</p>`)}>${info.icon ? G.Art.icon(info.icon) : ''}</i>`);
    }
    const kindNow = G.Dungeon.roomKind(Math.min(st.room, CFG().tournamentRoom));
    let roomLabel = `Room ${st.room} <small>of ${CFG().tournamentRoom}${kindNow !== 'doors' ? ' · ' + ROOM_INFO[kindNow].name : ''}</small>`;
    if (st.room > CFG().rooms) roomLabel = 'Tournament';
    else if (st.phase === 'spec' || st.phase === 'tree') roomLabel = `Level up <small>after room ${st.room}</small>`;
    else if (st.phase === 'gem') roomLabel = `Heart gem <small>after room ${st.room}</small>`;
    else if (st.phase === 'duelIntro' || (st.battle && st.battle.duel && st.phase === 'battle')) roomLabel = `Duel <small>after room ${st.room}</small>`;
    return `<header class="top">
      <div class="brand">Undercrown <button class="sound-btn" data-act="sound" aria-label="${G.Sound && G.Sound.muted ? 'Turn sound on' : 'Turn sound off'}" title="Sound">${G.Sound && G.Sound.muted ? 'Sound off' : 'Sound on'}</button></div>
      <div class="track"><div class="pips" aria-hidden="true">${pips.join('')}</div><div class="room-label">${roomLabel}</div></div>
      <div class="clock" id="clock" ${tip('<div class="tt-title">Round timer</div><p>Every choice is timed for everyone and ends early once everyone is ready. Fights don’t count against it. Anything you haven’t decided at zero is decided for you.</p>')}><b id="clock-num">${timerText()}</b><i><span id="clock-bar" style="width:${timerPct()}%"></span></i></div>
    </header>`;
  }

  // Your hearts, health, poison and gold: under your character, and on your own card in the players column
  function vitalsRow(p, key, withGold = false) {
    const max = G.Hero.maxHp(p);
    const poison = p.poison ? `<span class="poison" ${tip(`<div class="tt-title">Poison ${p.poison}</div><p>You lose ${p.poison} health at the start of every room. Only an Antidote or a Purifying Spring clears it; campfires don't.</p>`)}>Poison ${p.poison}</span>` : '';
    return `<div class="vitals">${heartsRow(p.hearts)}<div class="hp-xp">${hpBar(p.hp, max, '', key)}${xpBar(p)}</div>${elixirIcon(p)}${poison}
      ${withGold ? goldChip(p) : ''}</div>`;
  }
  // A potion icon next to your health: lit when an elixir is waiting for your next fight, dim when not
  function elixirIcon(p) {
    const b = p.buffs || {};
    const parts = Object.entries(b).filter(([, v]) => v).map(([k, v]) => k === 'fullMana' ? 'Full mana' : `+${v} ${G.STAT_INFO[k].label}`);
    const body = parts.length
      ? `<div class="tt-title">Elixirs ready</div><p>${esc(parts.join(', '))}. They last your next fight.</p>`
      : '<div class="tt-title">No elixir active</div><p>Elixirs from the Merchant add stats to your next fight.</p>';
    return `<span class="elixir ${parts.length ? 'on' : ''}" ${tip(body)}>${G.Art.icon('potion_iron')}</span>`;
  }
  // Elixirs waiting for your next fight (or active in this one)
  function buffChips(p, active) {
    const b = p.buffs || {};
    const parts = Object.entries(b).filter(([, v]) => v).map(([k, v]) => k === 'fullMana' ? 'Full mana' : `+${v} ${G.STAT_INFO[k].label}`);
    if (!parts.length) return '';
    return `<span class="buff-chip ${active ? 'active' : ''}" ${tip(`<div class="tt-title">${active ? 'Active this fight' : 'Ready for your next fight'}</div><p>${esc(parts.join(', '))}. Elixirs last one fight.</p>`)}>${G.Art.icon('potion_iron')}${esc(parts.join(', '))}</span>`;
  }
  function goldChip(p) {
    const gp = p.isPlayer && G.Game.s && G.Game.s.goldPop, fresh = gp && Date.now() - gp.at < 1500;
    return `<div class="gold" ${tip('<div class="tt-title">Gold</div><p>Spend it at Merchants, the Forge and Wagers. Passing at a Plunder also gives gold. Equipping over a piece sells the old one.</p>')}><span class="coin"></span>${p.gold}${fresh ? `<span class="gold-pop" style="animation-delay:-${Date.now() - gp.at}ms">+${gp.amount}</span>` : ''}</div>`;
  }
  function xpInfo(p) {
    const L = CFG().levels;
    const need = p.level >= L.max ? 1 : G.Hero.xpToNext(p.level);
    return { L, need, pct: p.level >= L.max ? 100 : Math.round(p.xp / need * 100) };
  }
  // The XP bar, right under the health bar
  function xpBar(p) {
    const { L, need, pct } = xpInfo(p);
    return `<div class="xpbar" ${tip(`<div class="tt-title">Level ${p.level}</div><p>${p.level >= L.max ? 'Max level.' : `${p.xp} of ${need} XP to level ${p.level + 1}.`} Every fight gives XP. Spec at level ${L.specLevel}; skill tree picks at ${L.treeLevels.join(', ')}. Each level gives +${L.hpPerLevel} max Health.</p>`)}><i style="width:${pct}%"></i><span>${p.level >= L.max ? 'Max level' : `XP ${p.xp} / ${need}`}</span></div>`;
  }

  function levelBadge(p) {
    return `<div class="lvl"><b>Lv ${p.level}</b></div>`;
  }


  // Your own card in the players column, set apart from the rivals
  function youPanel(st) {
    const p = st.player;
    return `<section class="panel you-card"><div class="you-top"><span class="dot" style="background:#9fdcff"></span><b>You</b>${levelBadge(p)}</div>
      ${vitalsRow(p, 'you-card', true)}
      <div class="rv-spec">${esc([p.spec ? G.SPECS[p.spec].name : '', buildLabel(p) === 'No set bonus yet' ? '' : buildLabel(p)].filter(Boolean).join(' · '))}</div></section>`;
  }

  // What each kind of room is, for the room counter's tooltips
  const ROOM_INFO = {
    armory: { name: 'The Armory', icon: null, text: 'Pick one of three weapons.' },
    doors: { name: 'Two doors', icon: null, text: 'Choose between two doors: fights, treasure, campfires and more.' },
    shop: { name: 'Plunder', icon: 'door_shop', text: 'A shared pile of loot, always with one relic. Free picks for everyone; fewer hearts and lower health pick first.' },
    merchant: { name: 'Merchant', icon: 'door_merchant', text: 'Spend gold on gear, potions and buffs, or sell blood.' },
    boss: { name: 'Boss', icon: 'door_boss', text: 'A single sealed door with a boss behind it. Guaranteed rare item.' },
    duel: { name: 'Duel', icon: 'door_fight', text: 'Everyone is paired with a rival. The loser loses a heart.' },
    tournament: { name: 'Tournament', icon: 'crown', text: 'Everyone with hearts fights round after round. Last one standing wins.' },
  };

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
      ${b.duel || b.tour ? '<p class="lede">Player fights: every hit deals a quarter damage, and the fight goes to the death. Past one minute, both lose a heart.</p>' : ''}
      <div id="arena-slot" class="arena-slot"></div>
      <div class="battle-bar"><span class="speed-tag" id="speed-tag">1x speed</span><small>Fights speed up to 2x after ${CFG().combat.fastAfter} seconds. The round timer waits for the fight.${b.duel || b.tour ? '' : ` If time runs out (${CFG().combat.maxTime}s), you get half the gold and XP and no items.`}</small></div>
      ${buffChips(st.player, true) ? `<div class="active-buffs">${buffChips(st.player, true)}</div>` : ''}
      <ol id="battle-log" class="log" aria-live="polite"></ol>
      ${b.duel || b.tour ? '' : relicRow(st.player)}
    </section>`;
  }

  function armoryScreen(st) {
    const p = st.player;
    const cards = st.armory.map(it => itemCard(it, p, `<button data-act="weapon" data-id="${it.id}">Take the ${esc(G.WEAPONS[it.weaponType].name)}</button>`)).join('');
    return `<section class="screen"><h2>The Armory</h2>
      <p class="lede">Racks of old steel. Three weapons are yours to choose from. Uncommon and rare weapons later carry a class that fits them.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  // What a Take button says: empty slot = it goes on you; otherwise into the bag (or not at all if the bag is full)
  function takeLabel(p, it, verb = 'Take it') {
    if (it.kind === 'relic') return G.Hero.canReceive(p, it) ? { ok: true, text: `${verb} (relic)` } : { ok: false, text: 'Maxed' };
    if (it.kind === 'gear' && !G.Hero.canEquip(p, it)) return G.Hero.bagFull(p) ? { ok: false, text: 'Bag full' } : { ok: true, text: `${verb} (to bag)` };
    if (it.kind === 'gear' && !p.gear[it.slot]) return { ok: true, text: `${verb} and equip` };
    if (G.Hero.bagFull(p)) return { ok: false, text: 'Bag full' };
    return { ok: true, text: `${verb} (to bag)` };
  }
  const bagNote = full => full
    ? '<p class="warn">Your bag is full. Gear for an empty slot still goes straight on you; for anything else, discard something from your bag first, or it’s lost.</p>'
    : '<p class="hint">Gear for an empty slot is equipped right away. Anything else goes into your bag, where you hold Equip to swap it in.</p>';

  function rewardScreen(st) {
    const o = st.offer, p = st.player, full = G.Hero.bagFull(p);
    const cards = o.items.map(it => { const L = takeLabel(p, it); return itemCard(it, p, `<button data-act="take" data-id="${it.id}" ${L.ok ? '' : 'disabled'}>${L.text}</button>`); }).join('');
    return `<section class="screen">
      <h2>${esc(o.title)}</h2><p class="lede">${esc(o.text)}</p>
      ${bagNote(full)}
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
      return `<li class="${now ? 'now' : ''} ${h.isPlayer ? 'me' : ''}"><span>${i + 1}</span><b>${esc(h.isPlayer ? 'You' : h.name)}${botTag(h)}</b><small>${heartsRow(h.hearts, 'sm')} ${Math.round(h.hp / G.Hero.maxHp(h) * 100)}%</small><em>${state}</em>${bar}</li>`;
    }).join('');
    const myNow = myTurn && !reviewing;
    const table = sh.table.map(it => { const L = takeLabel(p, it, 'Take this'); return itemCard(it, p, myNow
      ? `<button data-act="shop-pick" data-id="${it.id}" ${L.ok ? '' : 'disabled'}>${L.text}</button>`
      : `<button disabled>${picked ? 'Picked' : reviewing ? 'Picks start soon' : 'Wait for your turn'}</button>`); }).join('');
    const review = reviewing ? `<div class="review"><span>Look over the table. Picks start in <b id="review-num">${reviewLeft()}s</b></span><i class="turnbar"><span id="review-bar" style="width:${reviewPct()}%"></span></i></div>` : '';
    return `${review}<h3 class="sub">Pick order</h3>
      <ol class="pick-order">${order}</ol>
      <h3 class="sub">The pile ${myNow ? '<span class="chip">Your turn</span>' : ''}</h3>
      ${myNow ? bagNote(full) : ''}
      <div class="cards">${table || '<p class="hint">The table is empty.</p>'}</div>
      ${myNow ? `<div class="pass-row bottom"><button data-act="shop-pass">Pass and take ${CFG().shop.passGold} gold</button><small>If your timer runs out, you pass.</small></div>` : ''}`;
  }

  // Rival picks only refresh this part, so clicks and tooltips aren't lost to a re-render
  function refreshShopPicks() {
    const st = G.Game.s, el = document.getElementById('shop-picks');
    if (!st || st.phase !== 'shop' || !el) return render();
    el.innerHTML = shopPicks(st);
  }

  function shopScreen(st) {
    const sh = st.shop, S = CFG().shop;
    if (!sh) return `<section class="screen shop"><h2>Plunder</h2><p class="lede">The host is laying out the pile. Everyone picks from it, weakest first.</p><p class="waiting">Waiting for every player to arrive…</p></section>`;
    return `<section class="screen shop">
      <h2>${sh.tour ? 'Tournament Plunder' : 'Plunder'}</h2>
      ${sh.tour ? '<p class="lede">A pile between rounds for everyone still in, a chance to change your build. Your tournament health stays as it is; potions you take can be drunk in the break.</p>' : ''}
      <p class="lede">Everyone picks from one shared pile, weakest first: Treasure Hunters always go first, then fewer hearts, then lower health. Everyone gets ${S.reviewSeconds} seconds to look, then ${S.turnSeconds} seconds per turn. Pass to take ${S.passGold} gold instead.</p>
      ${(sh.msg || st.shopMsg) ? `<p class="notice">${esc(sh.msg || st.shopMsg)}</p>` : ''}
      <div id="shop-picks">${shopPicks(st)}</div></section>`;
  }

  function merchantScreen(st) {
    const m = st.merchant, p = st.player, S = CFG().shop;
    const full = G.Hero.bagFull(p);
    const stock = m.stock.map(it => {
      const price = G.Dungeon.merchantPrice(p, m, it), sold = m.bought.includes(it.id);
      const room = G.Hero.canReceive(p, it), where = it.kind === 'gear' && !p.gear[it.slot] ? ', equip' : '';
      return itemCard(it, p, sold ? '<button disabled>Sold</button>' : `<button data-act="shop-buy" data-kind="gear" data-id="${it.id}" ${p.gold < price || !room ? 'disabled' : ''}>${!room ? 'Bag full' : price === 0 ? `Take it free${where} (Haggler)` : `Buy for ${price} gold${where}`}</button>`);
    }).join('');
    const consRow = (id, price, note, disabled, label) => {
      const c = G.CONSUMABLES[id];
      return `<div class="potion card"><span class="ico-wrap">${G.Art.icon('potion_' + id)}</span><div><b>${esc(c.name)}</b><small>${esc(c.desc)}${note ? ' ' + note : ''}</small></div>
        <button data-act="shop-buy" data-kind="cons" data-id="${id}" ${disabled || p.gold < price || full ? 'disabled' : ''}>${disabled ? label || 'Sold out' : full ? 'Bag full' : `${price} gold`}</button></div>`;
    };
    const restockCost = S.restockCosts[m.restocks];
    const bloodCost = p.gem === 'stone' ? 1 : S.bloodHealth;
    const bloodNote = `Lose ${bloodCost} health${p.gem === 'stone' ? ' (Heart of Stone)' : ''}`;
    const tooWeak = p.hp <= bloodCost, bledOut = (m.bled || 0) >= S.bloodMax, bloodLeft = S.bloodMax - (m.bled || 0);
    const pop = m.bloodPop && m.bloodPop.seq !== m.bloodShown ? m.bloodPop : null;
    if (pop) m.bloodShown = pop.seq;
    return `<section class="screen shop">
      <h2>Merchant</h2>
      <p class="lede">A trader with a cart full of gear. You have ${p.gold} gold. Stay as long as the room timer allows, or leave when you're done.</p>
      ${m.msg ? `<p class="notice">${esc(m.msg)}</p>` : ''}
      <div class="shop-row">
        ${consRow('potion', S.potionCost, `${m.cstock.potion} in stock.`, m.cstock.potion <= 0)}
        ${consRow('antidote', G.CONSUMABLES.antidote.price, `${m.cstock.antidote} in stock.`, m.cstock.antidote <= 0)}
        ${m.cstock.tome != null ? consRow('tome', G.CONSUMABLES.tome.price, `${m.cstock.tome} in stock.`, m.cstock.tome <= 0) : ''}
        ${m.buffs.map(id => consRow(id, G.CONSUMABLES[id].price, `${m.cstock[id]} in stock.`, m.cstock[id] <= 0)).join('')}
        <div class="potion card blood-card"><span class="flask blood"></span><div><b>Sell blood</b><small>${bloodNote} for a random ${S.bloodGold[0]} to ${S.bloodGold[1]} gold. ${bloodLeft} of ${S.bloodMax} left this visit.</small></div>
          <button data-act="shop-buy" data-kind="blood" ${tooWeak || bledOut ? 'disabled' : ''}>${bledOut ? 'No more' : tooWeak ? 'Too weak' : 'Bleed for gold'}</button>${pop ? `<span class="gold-pop ${pop.gold >= 30 ? 'big' : ''}">+${pop.gold} gold</span>` : ''}</div>
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
      const gains = G.Dungeon.strengthenGains(it);
      const preview = Object.keys(gains).map(k => `<li class="up">${esc(G.STAT_INFO[k].label)}: ${it.base[k]} → ${it.base[k] + gains[k]}</li>`).join('');
      const done = !G.Dungeon.canStrengthen(it);
      return itemCard(it, p, `<div class="forge-opt"><ul class="forge-preview">${done ? '<li>Already strengthened.</li>' : preview}</ul>
          <button data-act="forge" data-kind="strengthen" data-slot="${sl}" ${done || f.strengthened || p.gold < F.upgradeCost ? 'disabled' : ''}>${done ? 'Already strengthened' : `Strengthen (${F.upgradeCost})`}</button></div>
        <button class="ghost" data-act="forge" data-kind="affix" data-slot="${sl}" ${it.affixed || f.affixed || p.gold < F.affixCost ? 'disabled' : ''}>${it.affixed ? 'Already forged' : `Add a random affix (${F.affixCost})`}</button>`);
    }).join('');
    return `<section class="screen"><h2>Forge</h2>
      <p class="lede">The smith can strengthen one item (its base stats grow by one tier; the card shows exactly how) and add one random affix to one item. Each piece can be strengthened once and take one added affix, ever. Legendaries too. You have ${p.gold} gold.</p>
      ${f.msg ? `<p class="notice">${esc(f.msg)}</p>` : ''}
      <div class="cards">${cards}</div>
      <div class="row-actions"><button data-act="forge-leave">Leave the forge</button></div></section>`;
  }


  function wagerScreen(st) {
    const p = st.player, d = st.door, B = CFG().wager.bets;
    const broke = p.gold < B[0];
    return `<section class="screen"><h2>Wager</h2>
      <p class="lede">A pit boss grins: "${esc(G.Dungeon.monsterName(d.monster, 'fight'))}. Bet on yourself." The door has shut behind you, so this fight is happening. Win and you double your bet, plus the usual rewards. Lose and the bet is gone, along with a heart.</p>
      <div class="row-actions">${broke ? `<button data-act="bet" data-v="0">Fight with nothing on the line</button><small>You can't cover the smallest bet (${B[0]} gold).</small>`
        : B.map(b => `<button data-act="bet" data-v="${b}" ${p.gold < b ? 'disabled' : ''}>Bet ${b} gold</button>`).join('')}</div>
      ${characterBlock(p)}</section>`;
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

  // A skill tree node you can hover (or tap) to read
  const mt = (n, lv, cls = '') => `<i class="${cls}" ${tip(`<div class="tt-title">${esc(n.name)} <small>level ${lv}${lv === 20 ? ' capstone' : ', pick one of two'}</small></div><p>${esc(n.desc)}.</p>`)}>${esc(n.name)}</i>`;
  function specScreen(st) {
    const cards = st.specOptions.map(id => {
      const S = G.SPECS[id], T = G.SPEC_TREES[id];
      return `<article class="card spec"><div class="spec-head"><b>${S.name}</b><small>${S.role}</small></div>
        <p>${esc(S.desc)}</p><p class="trait">${esc(S.tip)}</p>
        <div class="mini-tree"><span>Lv 10</span>${mt(T.t10[0], 10)}${mt(T.t10[1], 10)}<span>Lv 15</span>${mt(T.t15[0], 15)}${mt(T.t15[1], 15)}<span>Lv 20</span>${mt(T.t20, 20, 'cap')}</div>
        <button data-act="spec" data-id="${id}">Become a ${S.name}</button></article>`;
    }).join('');
    return `<section class="screen levelup"><h2>Level ${CFG().levels.specLevel}: choose your specialization</h2>
      <p class="lede">Three random options. Each one has a skill tree: a choice at level 10, another at 15, and a capstone at 20.</p>
      <div class="cards three">${cards}</div></section>`;
  }

  // The skill tree drawn as a tree: spec at the top, two paths at 10 and 15, the capstone at 20
  function treeGraph(spec, picks, pickLevel) {
    const T = G.SPEC_TREES[spec], S = G.SPECS[spec];
    const node = (n, lv, side) => {
      const taken = picks[lv] === n.id, other = picks[lv] && !taken;
      const live = pickLevel === lv && !picks[lv];
      const cls = taken ? 'taken' : other ? 'skipped' : live ? 'live' : 'locked';
      const inner = `<b>${esc(n.name)}</b><small>${esc(n.desc)}</small>`;
      return live ? `<button class="tnode ${cls}" data-act="tree" data-id="${n.id}" aria-label="${esc(n.name)}"><em>${lv === 20 ? 'Capstone' : side}</em>${inner}</button>`
        : `<div class="tnode ${cls}"><em>${taken ? 'Chosen' : other ? 'Not taken' : lv === 20 ? 'Capstone' : side}</em>${inner}</div>`;
    };
    return `<div class="tree">
      <div class="trow"><span class="tlv">Lv 5</span><div class="tnode taken root"><em>Specialization</em><b>${esc(S.name)}</b><small>${esc(S.desc)}</small></div></div>
      <div class="tlink two"></div>
      <div class="trow"><span class="tlv">Lv 10</span>${node(T.t10[0], 10, 'Left')}${node(T.t10[1], 10, 'Right')}</div>
      <div class="tlink two"></div>
      <div class="trow"><span class="tlv">Lv 15</span>${node(T.t15[0], 15, 'Left')}${node(T.t15[1], 15, 'Right')}</div>
      <div class="tlink one"></div>
      <div class="trow"><span class="tlv">Lv 20</span>${node(T.t20, 20)}</div>
    </div>`;
  }

  function treeScreen(st) {
    const p = st.player, lv = st.treeLevel, S = G.SPECS[p.spec];
    return `<section class="screen levelup"><h2>Level ${lv}: ${esc(S.name)} skill tree</h2>
      <p class="lede">${lv === 20 ? 'Claim the capstone of your specialization.' : 'Choose a path. It’s permanent.'}</p>
      ${treeGraph(p.spec, p.treePicks, lv)}</section>`;
  }

  function gemScreen(st) {
    const cards = st.gemOptions.map(id => {
      const g = G.GEMS[id];
      return `<article class="card spec gemcard" style="--gem:${g.color}"><div class="spec-head"><span class="gem-ico">${G.Art.icon('gem')}</span><b>${esc(g.name)}</b></div>
        <p><span class="up">Upside</span> ${esc(g.up)}</p><p><span class="down">Cost</span> ${esc(g.cost)}</p>
        <button data-act="gem" data-id="${id}">Take the ${esc(g.name)}</button></article>`;
    }).join('');
    return `<section class="screen"><h2>Choose a heart gem</h2>
      <p class="lede">${esc(G.Dungeon.monsterFor(CFG().gemRoom, 'boss').name)} drops three gems. Each one changes how you play for the rest of the run, for better and worse.</p>
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
      ${rivalBlock(opp)}
      <p class="lede">Everyone still in is paired up. ${opp.ghost ? `You're the odd one out, so you face a ghost: a half-strength copy of ${esc(opp.of.name)}. Losing to it still costs a heart.` : `You face <b>${esc(opp.hero.name)}</b>. The loser loses a heart.`} You fight at your current health and keep what you finish with; the loser comes back at full. Past one minute, both lose a heart.</p>
      ${others ? `<div class="round"><h4>Other duels</h4><ul>${others}</ul></div>` : ''}
      <p class="hint">You can drink potions and elixirs now, before the fight. Not once it starts.</p>
      ${d.goSent ? `<p class="waiting">Locked in. The fight is starting…</p>`
        : `<p class="waiting">The fight starts for both of you in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b></p>`}</section>`;
  }

  // Your next tournament opponent (null when you're not fighting next)
  function tourOpponent(st) {
    const T = st.tour;
    if (!T || T.champion) return null;
    const round = G.Tournament.currentRound(T);
    const m = round && round.pairs.find(p => !p.result && ((p.a.hero && p.a.hero.isPlayer) || (!p.ghost && p.b.hero && p.b.hero.isPlayer)));
    if (!m) return null;
    return m.a.hero && m.a.hero.isPlayer ? m.b : m.a;
  }
  // The rival you're about to fight, drawn and laid out like your own character block
  function rivalBlock(opp) {
    const h = opp.ghost ? opp.of : opp.hero;
    const st = G.Stats.sets(h);
    const col = st.look ? G.CLASSES[st.look].color : '#' + (h.tint || 0x9fdcff).toString(16).padStart(6, '0');
    const name = opp.ghost ? opp.name : h.name;
    const spec = h.spec ? G.SPECS[h.spec].name : 'No spec yet';
    const ov = opp.ghost ? { s: opp.s, hp: opp.hp } : opp.hp != null ? { s: G.Stats.compute(h), hp: opp.hp } : null;
    return `<div class="charblock rival-block ${opp.ghost ? 'ghosted' : ''}" style="--pv:${col}">
      <div class="pv-left"><div class="vs-tag">Your opponent</div><div id="rival-slot" class="preview-slot" aria-hidden="true"></div>
        <div class="pv-info"><b>${esc(name)}</b>${opp.ghost ? '' : botTag(h)}${opp.ghost ? '' : heartsRow(h.hearts, 'sm')}<span>${esc(buildLabel(h))}</span><small>Level ${h.level} · ${esc(spec)}${h.gem && !opp.ghost ? ' · ' + esc(G.GEMS[h.gem].name) : ''}</small></div></div>
      <div class="pv-right">${statCols(h, false, ov)}${setBonus(h, false)}</div></div>`;
  }

  // Multiplayer: done with your room, waiting for the others
  function waitingScreen(st) {
    const R = G.MP.readyInfo, ready = new Set(R && R.room === st.room ? R.ready : []);
    const rows = G.MP.players.map(p => {
      const h = G.MP.heroes[p.slot];
      const state = !h || !h.alive ? 'out' : p.bot ? 'bot' : ready.has(p.slot) ? 'ready' : 'playing';
      const label = { out: 'Out of hearts', bot: 'Bot (plays instantly)', ready: 'Ready', playing: 'Still playing' }[state];
      return `<li class="w-${state}"><b>${esc(p.slot === G.MP.mySlot ? 'You' : p.name)}</b>${p.bot ? botTag(h) : ''}<span>${label}</span></li>`;
    }).join('');
    // Vote to skip: when everyone but one player is done, the rest can end that player's turn
    const humans = G.MP.players.filter(p => !p.bot && G.MP.heroes[p.slot] && G.MP.heroes[p.slot].alive);
    const slow = humans.filter(p => !ready.has(p.slot)), votes = new Set(R && R.room === st.room ? R.votes || [] : []);
    const needed = humans.length - 1, voted = votes.has(G.MP.mySlot);
    const skip = G.MP.skipAllowed(st.room) && slow.length === 1 && ready.has(G.MP.mySlot) && !(R && R.skipped)
      ? `<div class="skip-vote"><span>Waiting on <b>${esc(slow[0].name)}</b>. Everyone else can vote to skip the rest of their turn (${votes.size}/${needed}).</span>
        <button class="${voted ? 'ghost' : ''}" data-act="skip-vote" ${voted ? 'disabled' : ''}>${voted ? 'You voted' : 'Vote to skip'}</button></div>`
      : R && R.skipped ? '<p class="hint">Skip vote passed. Their turn is being finished for them.</p>' : '';
    return `<section class="screen"><h2>${st.room >= CFG().rooms ? 'The dungeon is behind you' : `Room ${st.room} done`}</h2>
      <p class="lede">${st.room >= CFG().rooms ? 'The tournament starts once everyone gets through room ' + CFG().rooms + '.' : `Room ${st.room + 1} starts as soon as everyone is ready. You can use bag items and look over your gear while you wait.`}</p>
      <ul class="wait-list">${rows}</ul>${skip}
      ${characterBlock(st.player)}</section>`;
  }
  function duelWaitScreen() {
    return `<section class="screen"><h2>Duel</h2><p class="lede">Everyone is being paired up for a duel. The loser loses a heart.</p><p class="waiting">Waiting for every player to arrive…</p></section>`;
  }
  function mpEndedScreen(st) {
    return `<section class="screen end"><h2>${/inactivity/.test(st.notice || '') ? 'Removed for inactivity' : 'Match over'}</h2><p class="lede">${esc(st.notice || 'The connection to the room was lost.')}</p>
      <div class="row-actions"><button data-act="title">Back to the title</button></div></section>`;
  }

  // ---------- Spectating (multiplayer, once you're out) ----------
  let specPlaying = false;
  function spectatePanel(st) {
    const M = G.MP;
    const live = M.players.filter(p => !p.bot && p.slot !== M.mySlot && M.heroes[p.slot] && M.heroes[p.slot].alive);
    if (M.watch != null && !live.some(p => p.slot === M.watch)) M.watch = null;
    if (M.watch == null && live.length) M.watch = live[0].slot;
    const tabs = live.map(p => `<button class="${p.slot === M.watch ? '' : 'ghost'}" data-act="spectate" data-slot="${p.slot}">${esc(p.name)}</button>`).join('');
    if (!live.length) return '<p class="hint">No players left to watch. Bots play their rooms instantly; you’ll see the tournament when it starts.</p>';
    const f = M.lastFight[M.watch], h = M.heroes[M.watch];
    return `<div class="spectate"><div class="spec-head"><h3>Watching</h3><div class="spec-tabs">${tabs}</div></div>
      <p class="spec-status" id="spec-title">${esc(h.name)}: room ${h.room || '?'}${f ? ` · ${esc(f.title)}` : ''} · ${h.hp}/${G.Hero.maxHp(h)} health, ${h.hearts} ${h.hearts === 1 ? 'heart' : 'hearts'}</p>
      ${f ? '<div id="spec-arena" class="arena-slot"></div><ol id="spec-log" class="log"></ol>' : `<p class="waiting">Waiting for ${esc(h.name)}’s next fight…</p>`}</div>`;
  }
  // Tournament: watch any fight of the current round (every screen can replay it from the host's seed)
  function tourSpectatePanel(st) {
    const round = G.Tournament.currentRound(st.tour);
    const ms = round ? round.pairs.filter(p => !p.result && p.seed != null) : [];
    if (!ms.length) return '';
    const M = G.MP;
    M.tourWatch = tourWatchIndex(ms);
    const tabs = ms.map((p, i) => `<button class="${i === M.tourWatch ? '' : 'ghost'}" data-act="tour-watch" data-seed="${p.seed}">${esc(nameOf(p.a))} vs ${esc(nameOf(p.b))}</button>`).join('');
    return `<div class="spectate"><div class="spec-head"><h3>Watch a fight</h3><div class="spec-tabs">${tabs}</div></div>
      <div id="spec-arena" class="arena-slot" data-tour="1"></div><ol id="spec-log" class="log"></ol></div>`;
  }
  // Which tournament fight the watch box shows: the one you picked, else one you're not in
  function tourWatchIndex(ms) {
    const M = G.MP;
    let i = ms.findIndex(p => p.seed === M.tourWatchSeed);
    if (i < 0) {
      const mine = p => (p.a && p.a.hero && p.a.hero.isPlayer) || (p.b && p.b.hero && p.b.hero.isPlayer);
      i = Math.max(0, ms.findIndex(p => !mine(p)));
      M.tourWatchSeed = ms[i] ? ms[i].seed : null;
    }
    return i;
  }
  function playTourMatch() {
    const st = G.Game.s, round = G.Tournament.currentRound(st.tour);
    const ms = round ? round.pairs.filter(p => !p.result && p.seed != null) : [];
    const m = ms[tourWatchIndex(ms)];
    if (!m || m.seed == null) return;   // seeds arrive when the round's fights start
    const nmA = m.a.hero.isPlayer ? 'You' : m.a.hero.name, nmB = m.ghost ? m.b.name : m.b.hero.isPlayer ? 'You' : m.b.hero.name;
    if (m.spec) G.Tournament.pvpFrom(m.spec, m.seed); else G.Tournament.pvp(m.a, m.b, null, m.seed);
    playSpectate({ args: G._lastArgs, names: { a: nmA, b0: nmB }, title: `${nmA} vs ${nmB}`, slot: -1,
      visual: { a: G.visualFor(m.a.hero), b0: m.ghost ? { ...G.visualFor(m.b.of), ghost: true } : G.visualFor(m.b.hero) } });
  }
  function playSpectate(m) {
    const el = document.getElementById('spec-arena');
    const st = G.Game.s;
    if (!el || !st || st.phase === 'battle') { if (st && st.phase !== 'battle') render(); return; }
    const res = G.simulateFight(...m.args);
    const b = { res, names: m.names };
    const lines = [];
    const t = document.getElementById('spec-title'), h = G.MP.heroes[m.slot];
    if (t && h) t.textContent = `${h.name}: ${m.title}`;
    specPlaying = true;
    G.Arena.start(el, { result: res, visual: m.visual, names: m.names, mirror: false,
      onEvent: e => { const l = logLine(e, b); if (!l) return; lines.push(l); const ol = document.getElementById('spec-log'); if (ol) ol.innerHTML = lines.slice(-5).map(x => `<li>${esc(x)}</li>`).join(''); },
      onDone: () => { specPlaying = false; } });
  }

  function deadScreen(st) {
    if (G.Game.mp) return `<section class="screen end"><h2>You're out of hearts</h2>
      <p class="lede">${esc(st.notice || 'The dungeon took your last heart.')} Click the eye next to any player on the left to watch their game live. You'll see the tournament when it starts.</p>
      <div class="row-actions"><button class="ghost" data-act="mp-leave">Leave the match</button></div></section>`;
    return `<section class="screen end"><h2>You're out of hearts</h2>
      <p class="lede">${esc(st.notice || 'The dungeon took your last heart.')} In a full game you'd be spectating now.</p>
      <div class="row-actions"><button data-act="ending">See how the match ended</button><button class="ghost" data-act="title">Try again</button></div></section>`;
  }

  const ord = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

  // Tournament bracket: rounds from left to right, each fight showing both players' hearts and health
  function roundsList(T) {
    if (!T.rounds.length) return '';
    const next = G.Tournament.nextMatch(T);
    const row = (e, won, p, i) => {
      if (e.ghost) return `<div class="b-row ghost ${won === true ? 'won' : won === false ? 'lost' : ''}"><b>${esc(e.name)}</b><span class="b-meta"><small>ghost</small></span></div>`;
      const snap = p.snap && p.snap[i];
      const hearts = snap ? snap.hearts : e.hero.hearts;
      const hp = p.result ? (won ? `${snap ? snap.hp : e.hp} hp left` : p.draw ? 'out of time' : snap && snap.out ? 'out' : 'lost') : `${e.hp} hp`;
      return `<div class="b-row ${e.hero.isPlayer ? 'me' : ''} ${won === true ? 'won' : won === false ? 'lost' : ''}"><b>${esc(nameOf(e))}${e.hero ? botTag(e.hero) : ''}</b>
        <span class="b-meta">${heartsRow(hearts, 'sm')}<small>${hp}</small></span></div>`;
    };
    const cols = T.rounds.map((r, ri) => `<div class="b-col ${ri ? 'linked' : ''}"><h4>Round ${r.n}</h4><div class="b-list">${r.pairs.map(p => {
      const wa = p.result && !p.draw ? p.winner === p.a : null;
      const mine = (p.a.hero && p.a.hero.isPlayer) || (!p.ghost && p.b.hero && p.b.hero.isPlayer);
      let note = '';
      if (p.result) {
        const li = p.lostHeart === p.a ? 0 : 1, wasOut = p.snap && p.snap[li] && p.snap[li].out;
        const who = p.lostHeart && nameOf(p.lostHeart), verb = who === 'You' ? 'lose' : 'loses';
        note = p.draw ? (p.suddenDeath ? 'Out of time: sudden death' : 'Out of time: both lose a heart') : p.ghost ? 'Ghost fight' : p.lostHeart ? `${esc(who)} ${verb} a heart${wasOut ? (who === 'You' ? ' and are out' : ' and is out') : ''}` : '';
      }
      else note = p === next ? (mine ? 'Your fight is next' : 'Up next') : 'Waiting';
      return `<div class="b-match ${p === next ? 'next' : ''} ${mine ? 'mine' : ''}">${row(p.a, wa === null ? null : wa, p, 0)}<div class="b-vs">vs</div>${row(p.b, wa === null ? null : !wa, p, 1)}<div class="b-note">${note}</div></div>`;
    }).join('')}</div></div>`).join('');
    const champ = T.champion ? `<div class="b-col linked champ"><h4>Champion</h4><div class="b-list"><div class="b-match won"><div class="b-row ${T.champion.hero.isPlayer ? 'me' : ''} won"><b>${esc(T.champion.hero.isPlayer ? 'You' : T.champion.hero.name)}</b><span class="b-meta">${heartsRow(T.champion.hero.hearts, 'sm')}</span></div></div></div></div>` : '';
    const out = T.entrants.filter(e => e.out).sort((a, b) => a.place - b.place);
    const outRow = out.length ? `<p class="b-out">Out: ${out.map(e => `${esc(e.hero.isPlayer ? 'You' : e.hero.name)} <small>(${ord(e.place)})</small>`).join(', ')}</p>` : '';
    return `<div class="bracket" role="list" aria-label="Tournament bracket">${cols}${champ}</div>${outRow}`;
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
        ${G.Game.mp && G.MP.isHost && G.MP.saveStatus ? `<p class="hint save-status">Match database: ${G.MP.saveStatus === 'saved' ? 'this match was saved.' : G.MP.saveStatus === 'saving' ? 'saving…' : esc(G.MP.saveStatus)}</p>` : ''}
        <div class="row-actions">${G.Game.mp ? (G.MP.isHost ? '<button class="enter" data-act="mp-rematch">Play again (same room)</button><button class="ghost" data-act="mp-leave">Leave</button>'
          : '<p class="waiting">The host can start a rematch in this room.</p><button class="ghost" data-act="mp-leave">Leave</button>') : '<button class="enter" data-act="title">Play again</button>'}</div></section>`;
    }
    const m = G.Tournament.nextMatch(T);
    const mine = m && ((m.a.hero && m.a.hero.isPlayer) || (!m.ghost && m.b.hero.isPlayer));
    const opp = tourOpponent(st);
    const meE = T.entrants.find(e => e.hero.isPlayer);
    if (G.Game.mp && (!meE || meE.out)) return tourWatchScreen(st, T);
    const watchTop = st.tourPhase === 'fight' && G.Game.mp;
    return `<section class="screen"><h2>The Tournament</h2>
      ${watchTop ? `<p class="waiting">Fights in progress…</p>${tourSpectatePanel(st)}` : ''}
      ${opp ? rivalBlock(opp.ghost ? opp : { hero: opp.hero, hp: opp.hp }) : ''}
      <p class="lede">Last one with hearts wins. Each round everyone is paired up again and starts the fight at full health. Losers lose a heart, against a ghost too. Fights go to the death; past one minute, both lose a heart.</p>
      ${roundsList(T)}
      ${watchTop ? '' : st.tourPhase === 'fight' ? '<p class="waiting">Fights in progress…</p>' : `<p class="waiting">${mine ? 'Your fight starts' : 'Next fights start'} in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b></p>`}</section>`;
  }

  // Out of the tournament: pick a player still in and watch their view live; the bracket sits below
  function tourWatchScreen(st, T) {
    const M = G.MP, live = T.entrants.filter(e => !e.out && e.hero);
    if (M.tourView == null || !live.some(e => e.hero.slot === M.tourView)) M.tourView = (live.find(e => !e.hero.bot) || live[0] || { hero: {} }).hero.slot;
    const sel = live.find(e => e.hero.slot === M.tourView);
    const tabs = live.map(e => `<button class="${e === sel ? '' : 'ghost'}" data-act="tour-view" data-slot="${e.hero.slot}">${esc(e.hero.name)}${e.hero.bot ? ' <small>bot</small>' : ''}</button>`).join('');
    let body = '';
    if (sel && !sel.hero.bot) {
      body = '<div id="watch-dock" class="watch-dock"></div>';
      if (M.watching !== sel.hero.slot) setTimeout(() => { if (M.tourView === sel.hero.slot && M.watching !== sel.hero.slot) M.startWatching(sel.hero.slot); }, 0);
    } else {
      // Bots have no screen to show: their fight of this round, when it's on
      const round = G.Tournament.currentRound(T);
      const pair = round && round.pairs.find(p => !p.result && p.seed != null && ((p.a.hero && p.a.hero.slot === M.tourView) || (!p.ghost && p.b.hero && p.b.hero.slot === M.tourView)));
      if (M.watching != null) setTimeout(() => { if (M.watching != null && document.getElementById('watch-dock') == null) M.stopWatching(); }, 0);
      if (pair && st.tourPhase === 'fight') { M.tourWatchSeed = pair.seed; body = tourSpectatePanel(st); }
      else body = `<div class="spectate"><p class="waiting">${sel ? esc(sel.hero.name) + ' is a bot: you’ll see their next fight here.' : 'No one left to watch.'}</p></div>`;
    }
    const next = st.tourPhase === 'fight' ? 'Fights in progress…' : st.tourPhase === 'plunder' ? 'Tournament Plunder in progress…' : `Next fights start in <b id="wait-num">${Math.ceil(G.Game.timeLeft() || 0)}s</b>`;
    return `<section class="screen"><h2>The Tournament</h2>
      <p class="lede">You're out, so you're watching. Pick a player to see their view live.</p>
      <div class="spec-tabs tour-view-tabs">${tabs}</div>
      ${body}
      <p class="waiting">${next}</p>
      ${roundsList(T)}</section>`;
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

  // ---------- Multiplayer lobby ----------
  function savedName() { try { return localStorage.getItem('uc-name') || ''; } catch (e) { return ''; } }
  function lobbyScreen() {
    const M = G.MP;
    if (M.status === 'connecting') return `<div class="title-screen lobby"><h2>Connecting…</h2><p class="lede">${M.isHost ? 'Opening your room.' : `Looking for room ${esc(M.code)}.`}</p>
      <div class="row-actions"><button class="ghost" data-act="mp-leave">Cancel</button></div></div>`;
    if (M.status === 'error') return `<div class="title-screen lobby"><h2>Couldn’t join</h2><p class="warn">${esc(M.error || 'Something went wrong.')}</p>
      <div class="row-actions"><button data-act="mp-leave">Back</button></div></div>`;
    const L = M.lobby || { slots: [] };
    const isHost = M.isHost;
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const s = L.slots[i];
      // Bots fill up to 6 seats; seats 7 and 8 stay open for real players
      const humans = L.slots.filter(Boolean).length, botSeat = i < 6 && i >= humans;
      slots.push(s ? `<li class="${s.cid === M.cid ? 'me' : ''}"><span class="seat">${i + 1}</span><b>${esc(s.name)}</b>${i === 0 ? '<span class="chip">Host</span>' : ''}${s.cid === M.cid ? '<small>you</small>' : ''}</li>`
        : botSeat ? `<li class="empty"><span class="seat">${i + 1}</span><b>Bot</b><span class="bot-tag">BOT</span><small>fills this seat if nobody joins</small></li>`
        : `<li class="empty open"><span class="seat">${i + 1}</span><b>Open</b><small>players only, no bots</small></li>`);
    }
    const link = location.origin && location.origin !== 'null' ? `${location.href.split('#')[0].split('?')[0]}?room=${M.code}${G.Net.mode() === 'local' ? '&net=local' : ''}` : '';
    return `<div class="title-screen lobby">
      <header class="hero-head"><div class="eyebrow">Room code</div><h1 class="room-code">${esc(M.code)}</h1>
        <p>Share this code with your friends. Up to 8 players. Bots fill empty seats up to 6; seats 7 and 8 are for real players only.</p></header>
      ${link ? `<div class="row-actions"><button class="ghost" data-act="mp-copy" data-link="${esc(link)}">Copy invite link</button></div>` : ''}
      <ul class="seats">${slots.join('')}</ul>
      <div class="row-actions">${isHost ? '<button class="enter" data-act="mp-start">Start the match</button>' : '<p class="waiting">Waiting for the host to start…</p>'}
        <button class="ghost" data-act="mp-leave">Leave</button></div>
      ${G.Net.mode() === 'local' ? '<p class="hint">Test mode: players are other tabs in this browser.</p>' : ''}
    </div>`;
  }

  function titleScreen() {
    return `<div class="title-screen">
      <header class="hero-head"><div class="eyebrow">Undercrown v${G.VERSION}</div><h1>Undercrown</h1>
        <p>Six warriors. Thirty rooms each. Three hearts. Health carries from room to room and healing is limited, so spend it wisely. Build an archetype, fight your rivals along the way, and be the last one standing.</p></header>
      <ul class="rules">
        <li><b>Hearts</b>Dying or losing a duel costs a heart. You come back at full health. Lose all three and you're out.</li>
        <li><b>Class sets</b>Some gear carries a class, and every match has a limited supply. 2, 4 or 6 pieces, or 4 + 2 for a hybrid.</li>
        <li><b>Levels</b>Fights give XP. Pick a spec at level ${CFG().levels.specLevel}, then skill tree choices at ${CFG().levels.treeLevels.join(', ')}.</li>
        <li><b>Every 10 rooms</b>Room 5 is a Plunder (a shared loot pile), 7 a merchant, 8 a boss, and 10 a duel against a rival. Room 30 is the tournament.</li>
        <li><b>Gear and your bag</b>New gear goes straight onto an empty slot. Anything else lands in your 6-slot bag; hold Equip to swap it in (the old piece sells automatically), or sell it.</li>
        <li><b>The tournament</b>After room 30, everyone with hearts fights round after round until one is left.</li>
      </ul>
      <div class="row-actions"><button class="enter" data-act="start">Play solo</button></div>
      <section class="mp-box">
        <h3>Play with friends</h3>
        <label class="field"><span>Your name</span><input id="mp-name" maxlength="14" value="${esc(savedName())}" placeholder="Your name" autocomplete="nickname"></label>
        <div class="mp-actions">
          <button data-act="mp-create">Create a room</button>
          <span class="or">or</span>
          <label class="field code"><span>Room code</span><input id="mp-code" maxlength="5" value="${esc(roomFromUrl())}" placeholder="ABCDE" autocapitalize="characters" autocomplete="off"></label>
          <button data-act="mp-join">Join</button>
        </div>
        <p class="hint">Up to 8 players. Bots (labeled BOT) fill empty seats up to 6.</p>
      </section>
    </div>`;
  }

  function roomFromUrl() { try { return (new URLSearchParams(location.search).get('room') || '').toUpperCase(); } catch (e) { return ''; } }

  // A light refresh for network updates: never restarts a fight that's playing
  function update() {
    const st = G.Game.s;
    if (st && (st.phase === 'battle' || (specPlaying && document.getElementById('spec-arena')))) {
      const left = document.querySelector('.cols > aside.left');
      if (left) { left.innerHTML = rivalsPanel(st) + youPanel(st); }
      return;
    }
    const a = document.activeElement;
    if (!st && a && a.tagName === 'INPUT') return;   // don't wipe what someone is typing
    render();
  }

  // ---------- Render ----------
  function render() {
    hideTip();
    for (const k in tips) delete tips[k];
    const app = $('#app'), st = G.Game.s;
    if (!st || st.phase !== 'battle') G.Arena.stop();
    if (!st) { app.innerHTML = G.MP.active ? lobbyScreen() : titleScreen(); G.Preview.park(); G.RivalPreview.park(); renderWatchPop(); if (!G.MP.active) window.scrollTo(0, 0); return; }
    if (st.phase === 'battle') bagOpen = -1;
    const screens = { doors: doorsScreen, battle: battleScreen, armory: armoryScreen, reward: rewardScreen, spoils: spoilsScreen, shop: shopScreen,
      merchant: merchantScreen, forge: forgeScreen, wager: wagerScreen, mystery: mysteryScreen, spec: specScreen, tree: treeScreen, gem: gemScreen,
      duelIntro: duelIntroScreen, dead: deadScreen, tournament: tournamentScreen, ending: endingScreen,
      waiting: waitingScreen, duelWait: duelWaitScreen, mpEnded: mpEndedScreen };
    const prevPhase = app.dataset.phase;
    const notice = st.notice && !['dead', 'shop', 'mpEnded'].includes(st.phase) ? `<p class="notice">${esc(st.notice)}</p>` : '';
    app.innerHTML = `<div class="shell">${topbar(st)}<div class="cols"><aside class="left">${rivalsPanel(st)}${youPanel(st)}</aside><main class="stage">${watchBadgeHTML()}${notice}${screens[st.phase](st)}</main>
      <aside class="side">${bagPanel(st)}${gearPanel(st.player)}${statsPanel(st.player)}${supplyPanel()}</aside></div></div>`;
    if (st.phase !== prevPhase) window.scrollTo(0, 0);
    app.dataset.phase = st.phase;
    if (st.phase === 'battle') startBattleView(st);
    const pv = document.getElementById('preview-slot');
    if (pv) G.Preview.mount(pv, G.visualFor(st.player)); else G.Preview.park();
    const rv = document.getElementById('rival-slot');
    const rOpp = st.phase === 'tournament' ? tourOpponent(st) : st.duel && st.duel.mine ? (st.duel.mine.a.hero && st.duel.mine.a.hero.isPlayer ? st.duel.mine.b : st.duel.mine.a) : null;
    if (rv && rOpp) G.RivalPreview.mount(rv, G.visualFor(rOpp.ghost ? rOpp.of : rOpp.hero));
    else G.RivalPreview.park();
    // Spectating: replay the watched player's latest fight
    specPlaying = false;
    const sa = document.getElementById('spec-arena');
    if (sa && sa.dataset.tour) playTourMatch();
    else if (sa && G.MP.watch != null && G.MP.lastFight[G.MP.watch]) playSpectate(G.MP.lastFight[G.MP.watch]);
    if (G.Game.mp) G.MP.sendView();
    renderWatchPop();
  }

  // ---------- Live spectating: their game, drawn with the same screens, untouchable ----------
  let watchVst = null, watchFightKey = null;
  function watchState() {
    const M = G.MP, v = M.views[M.watching];
    if (!v) return null;
    const w = v.state, at = v.at;
    const p = JSON.parse(JSON.stringify(w.player));
    p.isPlayer = true;
    const heroes = { ...M.heroes, [M.watching]: p };
    const vst = { ...w, player: p, rivals: M.players.filter(x => x.slot !== M.watching).map(x => M.heroes[x.slot]).filter(Boolean), watchingView: true };
    vst.roundEnds = w.roundMs ? at + w.roundMs : 0;
    if (w.shop) vst.shop = { ...w.shop, reviewUntil: at + w.shop.reviewMs, turnStart: at - w.shop.turnMs, sent: true };
    if (w.duel && w.duel.w) vst.duel = { ...w.duel, mine: M.duelPair(w.duel.w, heroes) };
    if (M.lastTourWire) vst.tour = M.tourFromWire(M.lastTourWire, heroes);
    if (w.battle) vst.battle = { ...w.battle };
    return vst;
  }
  // Draw with someone else's state in place of yours, then put yours back
  function asWatched(vst, fn) {
    const real = G.Game.s, me = real && real.player;
    G.Game.s = vst; if (me) me.isPlayer = false;
    try { return fn(); } finally { G.Game.s = real; if (me) me.isPlayer = true; }
  }
  // A pop-up window over your own game: their screen, live, untouchable. Their fights play in a second,
  // separate arena so your own game (and its arena) never gets interrupted.
  const WATCH_SCREENS = () => ({ doors: doorsScreen, armory: armoryScreen, reward: rewardScreen, spoils: spoilsScreen, shop: shopScreen,
    merchant: merchantScreen, forge: forgeScreen, wager: wagerScreen, mystery: mysteryScreen, spec: specScreen, tree: treeScreen, gem: gemScreen,
    duelIntro: duelIntroScreen, dead: deadScreen, tournament: tournamentScreen, ending: endingScreen,
    waiting: waitingScreen, duelWait: duelWaitScreen, mpEnded: mpEndedScreen });
  let popAt = 0;
  function renderWatchPop() {
    const M = G.MP;
    let pop = document.getElementById('watch-pop');
    const over = G.Game.s && G.Game.s.tour && G.Game.s.tour.champion;   // the match is decided: nothing left to watch
    if (!G.Game.mp || !G.Game.s || M.watching == null || over) {
      if (pop) pop.remove();
      if (watchFightKey != null || G.WatchArena.game) { watchFightKey = null; G.WatchArena.stop(); }
      watchVst = null;
      return;
    }
    // Docked into the tournament watch area when it's on screen, otherwise a floating window
    const dock = document.getElementById('watch-dock'), parent = dock || document.body;
    if (pop && pop.parentNode !== parent) { pop.remove(); pop = null; }
    if (!pop) {
      watchFightKey = null; G.WatchArena.stop();
      pop = document.createElement('div');
      pop.id = 'watch-pop'; pop.className = 'watch-pop' + (dock ? ' docked' : '');
      pop.innerHTML = `<div class="wp-box" role="dialog" aria-modal="false"><div class="wp-head"></div>
        <div class="wp-fight" hidden><p class="wp-ftitle"></p><div class="wp-arena arena-slot"></div><ol class="log wp-log"></ol></div>
        <div class="wp-screen" inert></div></div>`;
      if (!dock) { placePop(pop); dragPop(pop); }
      parent.appendChild(pop);
    }
    refreshWatchPop();
  }
  // The floating window remembers where you dragged it
  let popPos = null;
  try { popPos = JSON.parse(localStorage.getItem('uc-watch-pos') || 'null'); } catch (e) { popPos = null; }
  function placePop(pop) {
    if (!popPos) return;
    const x = Math.max(0, Math.min(window.innerWidth - 160, popPos.x)), y = Math.max(0, Math.min(window.innerHeight - 60, popPos.y));
    Object.assign(pop.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
  }
  function dragPop(pop) {
    let d = null;
    pop.addEventListener('pointerdown', e => {
      const head = e.target.closest('.wp-head');
      if (!head || e.target.closest('button')) return;
      const r = pop.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      head.setPointerCapture(e.pointerId); e.preventDefault();
    });
    pop.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      popPos = { x: e.clientX - d.dx, y: e.clientY - d.dy };
      placePop(pop);
    });
    const end = e => { if (!d || e.pointerId !== d.id) return; d = null; try { localStorage.setItem('uc-watch-pos', JSON.stringify(popPos)); } catch (er) { /* ignore */ } };
    pop.addEventListener('pointerup', end); pop.addEventListener('pointercancel', end);
  }
  function refreshWatchPop() {
    const pop = document.getElementById('watch-pop'), M = G.MP;
    if (!pop || M.watching == null) return;
    popAt = Date.now();
    const vst = watchState(), who = M.player(M.watching), h = M.heroes[M.watching];
    watchVst = vst;
    const mine = G.Game.timeLeft();
    const status = vst ? `room ${vst.room || '?'}${vst.player ? ` · ${vst.player.hp}/${G.Hero.maxHp(vst.player)} health · ${vst.player.hearts} ${vst.player.hearts === 1 ? 'heart' : 'hearts'}` : ''}` : 'connecting…';
    pop.querySelector('.wp-head').innerHTML = `${G.Art.icon('eye')}<span><b>${esc(who ? who.name : h ? h.name : '?')}</b> <small>${esc(status)}</small></span>
      ${mine != null && G.Game.s.phase !== 'battle' ? `<span class="wp-mine">Your timer <b>${Math.ceil(mine)}s</b></span>` : ''}
      ${pop.classList.contains('docked') ? '' : '<button class="ghost" data-act="watch-stop">Close</button>'}`;
    const fightEl = pop.querySelector('.wp-fight'), scr = pop.querySelector('.wp-screen');
    const f = M.lastFight[M.watching];
    if (vst && vst.phase === 'battle' && f) {
      fightEl.hidden = false; scr.hidden = true;
      if (watchFightKey !== f.at) {
        watchFightKey = f.at;
        pop.querySelector('.wp-ftitle').textContent = f.title || (vst.battle && vst.battle.title) || 'Fight';
        const res = G.simulateFight(...f.args), b = { res, names: f.names }, lines = [], ol = pop.querySelector('.wp-log');
        ol.innerHTML = '';
        G.WatchArena.start(pop.querySelector('.wp-arena'), { result: res, visual: f.visual, names: f.names, mirror: !!f.mirror,
          onEvent: e => { const l = logLine(e, b); if (!l) return; lines.push(l); ol.innerHTML = lines.slice(-4).map(x => `<li>${esc(x)}</li>`).join(''); } });
      }
      return;
    }
    // Not fighting: their screen, as they see it
    fightEl.hidden = true; scr.hidden = false;
    if (watchFightKey != null) { watchFightKey = null; G.WatchArena.stop(); }
    if (!vst) { scr.innerHTML = '<p class="waiting">Connecting to their game…</p>'; return; }
    const screens = WATCH_SCREENS();
    const html = asWatched(vst, () => {
      const notice = vst.notice && !['dead', 'shop', 'mpEnded'].includes(vst.phase) ? `<p class="notice">${esc(vst.notice)}</p>` : '';
      const body = vst.phase === 'battle' ? '<p class="waiting">Their fight is starting…</p>' : screens[vst.phase] ? screens[vst.phase](vst) : '';
      return notice + body;
    });
    // ids belong to your own screen; the copy in here drops them
    scr.innerHTML = html.replace(/\sid="[^"]*"/g, '');
  }
  // Who is watching you: a small eye near the middle of the screen
  function watchBadgeHTML() {
    if (!G.Game.mp) return '';
    const ws = G.MP.watchedBy();
    return ws.length ? `<div id="watch-badge" class="watch-badge" title="Watching your game">${G.Art.icon('eye')}<span>${esc(ws.map(p => p.name).join(', '))} ${ws.length === 1 ? 'is' : 'are'} watching</span></div>` : '<div id="watch-badge"></div>';
  }
  function watchBadge() {
    const el = document.getElementById('watch-badge');
    if (el) el.outerHTML = watchBadgeHTML();
  }

  // Updates only clocks each tick, never the whole screen (a re-render would cut off a running fight)
  function tickClock() {
    G.Game.tick();
    tickClockBody();
    if (G.MP.watching != null && document.getElementById('watch-pop') && Date.now() - popAt > 1000) refreshWatchPop();
  }
  function tickClockBody() {
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
    const nm = id => { if (b.names && b.names[id]) return b.names[id]; const m = metas.find(x => x.id === id); return m ? m.name : '?'; };
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
      case 'stun': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} stunned${e.secs > 1 ? ` for ${e.secs} seconds (critical)` : ''}`;
      case 'smoke': return `${subj(e.src)} ${verb(e.src, 'throw', 'throws')} a smoke bomb`;
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
      case 'fxhit': return e.name === 'Heartlight' ? null : `${e.name} hits ${obj(e.tgt)} for ${e.amount}`;
      case 'stomp': return `${subj(e.src)} ${verb(e.src, 'stomp', 'stomps')} (Quakestep)`;
      case 'frenzy': return `${subj(e.src)} ${verb(e.src, 'fire', 'fires')} faster (Hummingbird)`;
      case 'firering': return `Fire starts closing in (Inferno)`;
      case 'shove': return `${subj(e.src)} ${verb(e.src, 'shove', 'shoves')} ${obj(e.tgt)} back (Ranger)`;
      case 'pull': return `${subj(e.src)} ${verb(e.src, 'drag', 'drags')} ${obj(e.tgt)} in (Guillotine)`;
      case 'knock': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} knocked back${e.slam ? ' into the wall' : ''} (Gale)`;
      case 'blink': return `${subj(e.src)} ${verb(e.src, 'blink', 'blinks')} behind ${obj(e.tgt)} (Blinkfang)`;
      case 'execute': return `${subj(e.src)} ${verb(e.src, 'execute', 'executes')} ${obj(e.tgt)} (Guillotine)`;
      case 'pop': return `${subj(e.tgt)} ${verb(e.tgt, 'burst', 'bursts')} open (Butcher)`;
      case 'block': return `${subj(e.src)} ${verb(e.src, 'block', 'blocks')} the hit (Dawnwall)`;
      case 'penance': return `${subj(e.src)} ${verb(e.src, 'release', 'releases')} ${e.amount} penance${e.heal ? ` and ${verb(e.src, 'heal', 'heals')} ${e.heal}` : ''}`;
      case 'sunder': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} sundered`;
      case 'hex': return `${subj(e.tgt)} ${verb(e.tgt, 'are', 'is')} hexed (${e.stacks})`;
      case 'shrug': return `${subj(e.src)} ${verb(e.src, 'shrug', 'shrugs')} it off: +${e.amount} Damage (Unbound)`;
      case 'sentinel': return `${subj(e.src)} ${verb(e.src, 'break', 'breaks')} shield in a holy burst (Sentinel)`;
      case 'shieldup': return `${subj(e.src)} ${verb(e.src, 'gain', 'gains')} Shield ${e.amount}`;
      case 'drain': return null;
      case 'beam': return e.power <= 2 ? `${subj(e.src)} ${verb(e.src, 'lock', 'locks')} a beam onto ${obj(e.tgt)} (Heartlight)` : null;
      default: return null;
    }
  }

  function startBattleView(st) {
    const b = st.battle, slot = document.getElementById('arena-slot');
    const lines = [];
    G.Arena.onSpeed = n => { const t = document.getElementById('speed-tag'); if (t) { t.textContent = n + 'x speed'; t.classList.add('fast'); } };
    G.Arena.start(slot, {
      result: b.res, visual: b.visual, mirror: !!b.mirror, names: b.names || null,
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
    if (G.Sound) G.Sound.unlock();
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act, Gm = G.Game;
    if (a !== 'bag-menu') bagOpen = -1;
    switch (a) {
      case 'start': Gm.newRun(); break;
      case 'mp-create': { const n = ($('#mp-name') || {}).value || ''; if (!n.trim()) { toast(el, 'Enter your name first'); break; } G.MP.create(n); break; }
      case 'mp-join': { const n = ($('#mp-name') || {}).value || '', c = ($('#mp-code') || {}).value || ''; if (!n.trim()) { toast(el, 'Enter your name first'); break; } if (!c.trim()) { toast(el, 'Enter the room code'); break; } G.MP.join(c, n); break; }
      case 'mp-start': G.MP.hostStart(); break;
      case 'mp-rematch': G.MP.hostRematch(); break;
      case 'spectate': G.MP.watch = +el.dataset.slot; render(); break;
      case 'tour-watch': G.MP.tourWatchSeed = +el.dataset.seed; render(); break;
      case 'tour-view': G.MP.tourView = +el.dataset.slot; render(); break;
      case 'watch': G.MP.tourView = +el.dataset.slot; G.MP.startWatching(+el.dataset.slot); break;
      case 'watch-stop': G.MP.stopWatching(); break;
      case 'mp-leave': G.MP.leave(); Gm.s = null; render(); break;
      case 'mp-copy': { const l = el.dataset.link; try { navigator.clipboard.writeText(l); toast(el, 'Link copied'); } catch (e) { toast(el, l); } break; }
      case 'door': Gm.chooseDoor(+el.dataset.i); break;
      case 'weapon': Gm.pickWeapon(el.dataset.id); break;
      case 'take': Gm.takeItem(el.dataset.id); break;
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
      case 'set-guide': openSetGuide(); break;
      case 'supply': supplyOpen = !supplyOpen; if (G.Game.s && G.Game.s.phase === 'battle') { const sp = el.closest('.panel'); if (sp) sp.outerHTML = supplyPanel(); } else render(); break;
      case 'bag-menu':
        if (G.Game.s && G.Game.s.phase === 'battle') { toast(el, 'Can’t use during combat!'); break; }
        bagOpen = bagOpen === +el.dataset.i ? -1 : +el.dataset.i; render(); break;
      case 'bag-use': Gm.useBag(+el.dataset.i); break;
      case 'bag-sell': Gm.sellBag(+el.dataset.i); break;
      case 'dye-item': Gm.dyeItem(el.dataset.id); break;
      case 'dye-class': Gm.dyeClass(el.dataset.cls); break;
      case 'dye-cancel': Gm.dyeCancel(); break;
      case 'skip-vote': G.MP.sendSkipVote(); break;
      case 'spec-tree': openSpecTree(); break;
      case 'shop-pick': Gm.playerShopPick(el.dataset.id); break;
      case 'shop-buy': Gm.shopBuy(el.dataset.kind, el.dataset.id); break;
      case 'shop-pass': Gm.playerShopPass(); break;
      case 'merchant-leave': Gm.leaveMerchant(); break;
      case 'ending': Gm.seeEnding(); break;
      case 'title': Gm.toTitle(); break;
      case 'sound': { const m = G.Sound.toggle(); el.textContent = m ? 'Sound off' : 'Sound on'; break; }
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideTip(); if (G.MP.watching != null && document.getElementById('watch-pop')) G.MP.stopWatching(); } });
  }

  function init() {
    document.addEventListener('click', onClick);
    // Any click or key press counts as being at the keyboard (the inactivity check)
    document.addEventListener('pointerdown', () => { if (G.Game.mp) G.Game.markActive(); }, true);
    document.addEventListener('keydown', () => { if (G.Game.mp) G.Game.markActive(); }, true);
    // Press and hold: equipping over worn gear
    const HOLD_MS = 800;
    let hold = null;
    const startHold = el => {
      cancelHold();
      el.classList.add('holding');
      el.style.setProperty('--hold', HOLD_MS + 'ms');
      hold = { el, timer: setTimeout(() => { const i = +el.dataset.i; hold = null; bagOpen = -1; G.Game.useBag(i); G.Sound && G.Sound.play('clang'); }, HOLD_MS) };
    };
    const cancelHold = () => { if (!hold) return; clearTimeout(hold.timer); hold.el.classList.remove('holding'); hold = null; };
    document.addEventListener('pointerdown', e => { const el = e.target.closest('[data-hold]'); if (el) { e.preventDefault(); startHold(el); } });
    document.addEventListener('pointerup', cancelHold);
    document.addEventListener('pointercancel', cancelHold);
    document.addEventListener('pointerout', e => { if (hold && e.target.closest('[data-hold]') === hold.el && !hold.el.contains(e.relatedTarget)) cancelHold(); });
    document.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { const el = e.target.closest && e.target.closest('[data-hold]'); if (el) { e.preventDefault(); startHold(el); } } });
    document.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') cancelHold(); });
    document.addEventListener('contextmenu', e => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
    bindTips();
    render();
    setInterval(tickClock, 200);
  }

  // Watching changed: redraw the eyes on the left and the watch window, without touching your own screen
  function watchChanged() {
    const st = G.Game.s, left = document.querySelector('.cols > aside.left');
    if (st && left) left.innerHTML = rivalsPanel(st) + youPanel(st);
    renderWatchPop();
  }
  G.UI = { render, init, refreshShopPicks, update, playSpectate, watchBadge, watchChanged, refreshWatchPop, itemTip, statCols };   // itemTip, statCols: also used by tests
})(window.G);
