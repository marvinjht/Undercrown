// The game, described for a screen (no HTML, no DOM): what every panel and screen shows and what each button does.
// The server sends this to clients that draw their own screens (the Godot client), so they need no rules code:
// every number and sentence comes from here, worked out by the same rules the game runs on.
//
// Shapes (all plain JSON):
//   Button   { label, act, args, enabled, style: 'primary'|'normal'|'ghost', hold, mp, note }
//            act = a game action the client sends as { t:'act', fn: act, args } (mp: true → an MP action),
//            or 'ui_…' for things the client does itself (ui_leave, ui_requeue, ui_rematch, ui_title).
//   Line     { text, tone }   tone: '', 'up', 'down', 'affix', 'cost', 'legend', 'artifact', 'stubborn', 'hint', 'warn', 'head'
//   Item     { id, kind, name, rarity, rarityName, color, icon, sub, set, lines, trait, notes, verdict, compare }
//   Card     { kind: 'item'|'text', item?, title?, sub?, color?, lines, buttons }
//   Section  { kind: 'cards'|'buttons'|'doors'|'list'|'bracket'|'places'|'tree'|'character'|'opponent'|'review'|'skip'|'timer', … }
window.G = window.G || {};

(function (G) {
  const CFG = () => G.CONFIG;
  const RANGE_NAMES = { melee: 'Melee', reach: 'Reach (2 steps)', near: 'Near range', far: 'Far range' };
  const RARITY_COLOR = { grey: '#b5b0a6', green: '#72d064', rare: '#5aa8ff', legendary: '#f2c14a', artifact: '#ff5a48', potion: '#c9a0ff', relic: '#e0a85a' };
  const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const btn = (label, act, args, o = {}) => ({ label, act, args: args || [], enabled: o.enabled !== false, style: o.style || 'normal', hold: !!o.hold, mp: !!o.mp, note: o.note || null });
  const line = (text, tone = '') => ({ text, tone });
  const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th');

  // ---------- Items ----------
  function weaponLine(item) {
    const W = item.slot === 'weapon' ? G.WEAPONS[item.weaponType] : null;
    if (!W) return null;
    const L = item.artifact ? G.ARTIFACTS[item.artifact].fx || {} : {};
    const range = L.meleeStaff ? 'melee' : W.range, type = L.physical ? 'phys' : W.type;
    return W.name + ' · ' + RANGE_NAMES[range] + ' · ' + (type === 'magic' ? 'Magic' : 'Physical');
  }
  const isStubborn = item => !!((item.artifact && G.ARTIFACTS[item.artifact].stubborn) || (item.slot === 'weapon' && G.WEAPONS[item.weaponType] && G.WEAPONS[item.weaponType].stubborn));
  const setInfo = c => (c ? { id: c, name: G.CLASSES[c].name, color: G.CLASSES[c].color } : null);

  function verdict(hero, item) {
    if (!hero || item.kind !== 'gear' || item.rarity === 'artifact') return item.kind === 'consumable' ? { tone: 'side', text: 'Bag item' } : null;
    const eq = hero.gear[item.slot];
    if (!eq) return { tone: 'up', text: 'Empty slot' };
    const diffs = G.Items.compare(item, eq);
    const same = (item.set || null) === (eq.set || null) && eq.rarity !== 'artifact';
    if (!diffs.length) return same ? { tone: 'side', text: 'Same stats' } : null;
    if (diffs.every(d => d.d > 0) && same) return { tone: 'up', text: 'Upgrade' };
    if (diffs.every(d => d.d < 0) && same) return { tone: 'down', text: 'Downgrade' };
    return null;
  }

  function relicView(rid, n, item) {
    const R = G.RELICS[rid], max = G.RELIC_MAX;
    const lines = [line(R.text(Math.max(1, Math.min(max, n || 1))) + '.')];
    if (item) lines.splice(0, 1, line(R.text(Math.min(max, n + 1)) + '.'));
    if (n >= max) lines.push(line('Maxed. It can’t drop for you again.', 'hint'));
    else lines.push(line(`${n ? 'Next copy' : 'More copies'}: ${R.text(Math.min(max, (n || 1) + 1))}.`, 'hint'), line(`Relics stack up to ${max} copies and never use bag space.`, 'hint'));
    return { id: item ? item.id : 'relic_' + rid, kind: 'relic', rid, name: R.name, rarity: 'relic', rarityName: 'Relic', color: R.color || RARITY_COLOR.relic,
      icon: 'relic_' + rid, sub: `Relic${n ? ` · you have ${n}/${max}` : ''}`, set: null, lines, trait: null, notes: [], verdict: { tone: 'relic', text: 'Relic' }, count: n || 0 };
  }

  // Everything about an item, for a card or a tooltip. hero: compare against what they wear.
  function itemView(item, hero) {
    if (!item) return null;
    if (item.kind === 'relic') return relicView(item.rid, hero ? G.Hero.relicCount(hero, item.rid) : 0, item);
    if (item.kind === 'consumable') {
      const c = G.CONSUMABLES[item.cid];
      return { id: item.id, kind: 'consumable', cid: item.cid, name: c.name, rarity: 'potion', rarityName: 'Bag item', color: RARITY_COLOR.potion, icon: item.iconKey,
        sub: 'Bag item', set: null, lines: [line(c.desc)], trait: null, notes: [], verdict: { tone: 'side', text: 'Bag item' } };
    }
    const R = G.RARITY[item.rarity], wl = weaponLine(item);
    const lines = [];
    const SL = G.Items.statLines(item);
    for (const l of SL.filter(l => !l.affix)) lines.push(line(l.text));
    const bonus = SL.filter(l => l.affix);
    if (bonus.length) { lines.push(line('Bonus', 'head')); for (const l of bonus) lines.push(line(l.text + (l.suffix ? ` (${l.suffix})` : ''), l.cost ? 'cost' : 'affix')); }
    const LA = G.legendAffix(item);
    if (LA) { lines.push(line('Legendary affix', 'head')); lines.push(line(`${LA.text} (${LA.name})`, 'legend')); }
    if (isStubborn(item)) lines.push(line('Stubborn: its stun ignores the stun limit', 'stubborn'));
    if (item.rarity === 'artifact') { lines.push(line('Artifact effect', 'head')); lines.push(line(G.ARTIFACTS[item.artifact].desc, 'artifact')); }
    const notes = [];
    if (item.rarity === 'artifact') notes.push(line('Artifact: you can wear only one. Fixed stats, one of a kind in this match.', 'hint'));
    if (item.affixed) notes.push(line('Forged: already has its added bonus.', 'hint'));
    if (hero && item.rarity === 'artifact' && !G.Hero.canEquip(hero, item)) {
      const w = G.Hero.wornArtifact(hero);
      notes.push(line(`You already wear an artifact (${w.name}). This one goes in your bag; equipping it from there sells ${w.name}.`, 'warn'));
    }
    let compare = null;
    if (hero) {
      const eq = hero.gear[item.slot];
      if (eq && eq.id !== item.id) {
        const diffs = G.Items.compare(item, eq);
        compare = { name: eq.name + (eq.rarity === 'artifact' ? ' (loses its artifact effect)' : ''), lines: diffs.length ? diffs.map(d => line(d.text, d.d > 0 ? 'up' : 'down')) : [line('Same stats')] };
      }
    }
    const trait = item.rarity === 'artifact' ? item.baseTrait || null : item.trait || null;
    return { id: item.id, kind: 'gear', slot: item.slot, name: item.name, rarity: item.rarity, rarityName: R.name, color: RARITY_COLOR[item.rarity] || '#ffffff',
      icon: item.iconKey, weaponType: item.weaponType || null,
      sub: `${R.name} ${wl || G.SLOT_NAMES[item.slot]}${item.rarity === 'artifact' ? '' : ' · Tier ' + item.tier}`,
      set: setInfo(item.set), lines, trait, notes, verdict: verdict(hero, item), compare };
  }

  // ---------- The hero ----------
  function buildLabel(hero) {
    const st = G.Stats.sets(hero);
    if (st.full) return `${G.CLASSES[st.look].name} · ${G.CLASSES[st.look].six.name}`;
    if (st.hybrid) return `${G.HYBRIDS[st.hybrid].name} (${st.counts[st.look]} ${G.CLASSES[st.look].name} + ${st.counts[st.trim]} ${G.CLASSES[st.trim].name})`;
    if (st.active.length) return st.active.map(a => `${G.CLASSES[a.cls].name} ${st.counts[a.cls]}`).join(' · ');
    return 'No set bonus yet';
  }
  function spellDesc(sp, s) { return G.spellDesc ? G.spellDesc(sp, s) : SPELL_TEXT(sp, s); }
  function SPELL_TEXT(sp, s) {
    const k = sp.kind;
    if (!k || k === 'damage') return `${sp.name}: ${sp.dmg} ${sp.phys ? 'physical' : 'magic'} damage to ${sp.aoe ? 'every enemy' : 'one enemy'}${sp.bleedMult ? `, and a bleed ${sp.bleedMult} times your Bleed` : ''}.`;
    if (k === 'deepCut') return `${sp.name}: your next ${sp.crits} attacks crit.`;
    if (k === 'feint') return `${sp.name}: the next attack aimed at you misses${s && s.fx && s.fx.riposte ? ' (and sets off Riposte)' : ''}.`;
    if (k === 'bash') return `${sp.name}: your next hit stuns for ${sp.stun} second${sp.stun === 1 ? '' : 's'} (Stubborn).`;
    if (k === 'cleave') return `${sp.name}: a full-damage swing at every enemy within reach.`;
    if (k === 'quake') return `${sp.name}: stuns every enemy within ${sp.reach} steps for ${sp.stun} second${sp.stun === 1 ? '' : 's'}${sp.limitDmg ? `; an enemy that can’t be stunned again yet takes ${sp.limitDmg} damage instead` : ''}.`;
    if (k === 'nextHeal') return `${sp.name}: your next hit heals you ${sp.heal}.`;
    if (k === 'rebuke') return `${sp.name}: your next hit lowers the target's Attack Speed by ${sp.spd} for ${sp.secs} seconds.`;
    if (k === 'retreat') return `${sp.name}: you hop ${sp.steps} step back.`;
    if (k === 'triple') return `${sp.name}: an arrow at up to ${sp.arrows} enemies, or one arrow for +${sp.single} when there's only one.`;
    return sp.name + '.';
  }

  // Stats in three columns (each cell: label, value, what it means, a cap note)
  function statCols(hero, ov) {
    const s = ov ? ov.s : G.Stats.compute(hero), hp = ov ? ov.hp : hero.hp, I = G.STAT_INFO, CB = CFG().combat;
    const cell = (label, value, tip, extra, cap) => ({ label, value: String(value), tip, extra: extra || null, cap: cap ? cap.text : null, capped: !!(cap && cap.at) });
    const hardCap = (raw, max) => ({ at: raw >= max, text: `Cap: ${max}. Yours: ${raw}${raw > max ? ` (${raw - max} over, wasted)` : raw === max ? ' (capped)' : ''}.` });
    const def = [cell('Health', `${hp}/${s.maxHp}`, 'Health carries from room to room. Healing is limited, so spend it wisely.'),
      cell('Armor', s.armor, I.armor.desc), cell('Magic Resist', s.ward, I.ward.desc),
      cell('Dodge', s.dodge, I.dodge.desc, '', hardCap(s.dodgeRaw != null ? s.dodgeRaw : s.dodge, CB.dodgeCap))];
    const off = [cell('Damage', s.dmg, I.dmg.desc, s.type === 'magic' ? 'Your weapon deals magic damage, so Magic Resist blocks it.' : 'Your weapon deals physical damage, so Armor blocks it.'),
      cell('Attack Speed', s.spd, I.spd.desc, `You attack every ${Math.round(100 / s.spd) / 10} seconds.`),
      cell('Crit', s.crit, I.crit.desc, `Your crits hit for ${s.dmg * 2 + s.critDmg}.`, hardCap(s.critRaw != null ? s.critRaw : s.crit, CB.critCap)),
      cell('Range', RANGE_NAMES[s.range].replace(' range', ''), 'Fights start 6 steps apart. Melee walks in first; the Longsword reaches 2 steps; Near shoots from 4 steps, Far from 6.')];
    const ext = [];
    if (s.critDmg) ext.push(cell('Crit Dmg', s.critDmg, I.critDmg.desc));
    for (const k of ['shield', 'holy', 'pierce', 'leech', 'bleed', 'stun']) if (s[k] > 0) ext.push(cell(I[k].label, s[k], I[k].desc));
    if (s.spell && s.manaGain > 0) ext.push(cell('Spell', !s.spell.kind || s.spell.kind === 'damage' ? `${s.spell.dmg}` : s.spell.name,
      `At 100 mana you cast ${spellDesc(s.spell, s)}${s.arcane ? ` Your Mage pieces add Arcane Blast: ${s.arcane.dmg} magic damage to every enemy.` : ''}`,
      `${s.manaGain} mana per attack${s.startMana ? `, start fights at ${s.startMana}` : ''}.`));
    return { defense: def, offense: off, extras: ext };
  }
  function tierRows(c, n) {
    const C = G.CLASSES[c];
    return [{ label: '2 pieces', text: C.two.desc, on: n >= 2 }, { label: '4 pieces', text: C.four.desc, on: n >= 4 }, { label: `6 pieces, ${C.six.name}`, text: C.six.desc, on: n >= 6 }];
  }
  function setBonus(hero) {
    const st = G.Stats.sets(hero);
    const rows = G.CLASS_ORDER.filter(c => st.counts[c]).sort((a, b) => st.counts[b] - st.counts[a]).map(c => {
      const n = st.counts[c], C = G.CLASSES[c];
      return { cls: c, name: C.name, color: C.color, n, next: n >= 6 ? 6 : n < 2 ? 2 : n < 4 ? 4 : 6,
        status: n >= 6 ? `${C.six.name} active` : n >= 4 ? '4-piece active' : n >= 2 ? '2-piece active' : 'no bonus yet', tiers: tierRows(c, n) };
    });
    const hybrid = st.hybrid ? { name: G.HYBRIDS[st.hybrid].name, text: G.HYBRIDS[st.hybrid].desc } : null;
    return { rows, hybrid };
  }
  // The set guide: every class and hybrid
  function setGuide(hero) {
    const st = G.Stats.sets(hero);
    return { classes: G.CLASS_ORDER.map(c => ({ cls: c, name: G.CLASSES[c].name, color: G.CLASSES[c].color, n: st.counts[c] || 0, tiers: tierRows(c, st.counts[c] || 0) })),
      hybrids: Object.keys(G.HYBRIDS).map(k => { const [a, b] = k.split('+'); return { name: G.HYBRIDS[k].name, pair: `${G.CLASSES[a].name} + ${G.CLASSES[b].name}`, text: G.HYBRIDS[k].desc, on: st.hybrid === k }; }) };
  }
  function buffList(p) { return Object.entries(p.buffs || {}).filter(([, v]) => v).map(([k, v]) => (k === 'fullMana' ? 'Full mana' : `+${v} ${G.STAT_INFO[k].label}`)); }
  function relicRow(p) {
    return G.RELIC_ORDER.filter(r => (p.relics || {})[r]).map(r => relicView(r, p.relics[r], null));
  }
  function look(hero) {
    const st = G.Stats.sets(hero);
    return { look: st.look || null, trim: st.trim || null, full: !!st.full, weapon: hero.gear.weapon ? hero.gear.weapon.weaponType : null,
      tint: st.look ? G.CLASSES[st.look].color : hex(hero.tint || 0x9fdcff) };
  }
  function meView(p) {
    const L = CFG().levels, need = p.level >= L.max ? 1 : G.Hero.xpToNext(p.level);
    const g = p.gem ? G.GEMS[p.gem] : null, S = p.spec ? G.SPECS[p.spec] : null;
    return { name: p.name, level: p.level, xp: p.xp, xpNeed: need, maxLevel: p.level >= L.max, hp: p.hp, maxHp: G.Hero.maxHp(p), hearts: p.hearts, maxHearts: CFG().hearts,
      gold: p.gold, poison: p.poison || 0, alive: !!p.alive, build: buildLabel(p), look: look(p),
      spec: S ? { name: S.name, role: S.role, desc: S.desc, nodes: G.Stats.treeFx(p).nodes.map(n => ({ name: n.name, desc: n.desc })) } : null,
      specHint: `Spec at level ${L.specLevel}`, gem: g ? { name: g.name, color: g.color, up: g.up, cost: g.cost } : null,
      buffs: buffList(p), relics: relicRow(p), stats: statCols(p), sets: setBonus(p) };
  }

  // ---------- Panels ----------
  function gearView(p) { return G.SLOTS.map(sl => ({ slot: sl, slotName: G.SLOT_NAMES[sl], item: itemView(p.gear[sl], null) })); }
  function bagView(s, p) {
    const size = CFG().bagSize, items = [];
    p.bag.forEach((it, i) => {
      const v = itemView(it, p), buttons = [];
      if (it.kind !== 'gear') buttons.push(btn('Use', 'useBag', [i], { style: 'primary' }));
      else {
        const gone = [p.gear[it.slot], G.Hero.artifactConflict(p, it)].filter(Boolean);
        if (!gone.length) buttons.push(btn('Equip', 'useBag', [i], { style: 'primary' }));
        else {
          const names = gone.map(o => o.name).join(' and '), gold = gone.reduce((a, o) => a + G.Dungeon.sellPrice(o), 0);
          const art = gone.find(o => o.rarity === 'artifact');
          const b = btn(art ? 'Replace artifact' : 'Hold to equip', 'useBag', [i], { style: 'primary', hold: true,
            note: `Replaces ${names}, which ${gone.length > 1 ? 'sell' : 'sells'} for ${gold} gold${gone.length > 1 || !p.gear[it.slot] ? ' (you can wear only one artifact)' : ''}` });
          if (art) b.confirm = `Your ${art.name} will be sold${gone.length > 1 ? `, along with ${gone.find(o => o !== art).name},` : ''} for ${gold} gold. You can't get it back.`;
          buttons.push(b);
        }
      }
      buttons.push(btn(`Sell +${G.Dungeon.sellPrice(it)}g`, 'sellBag', [i], { style: 'ghost' }));
      items.push({ i, item: v, buttons });
    });
    let dye = null;
    const d = s.dye;
    if (d && p.bag.some(x => x.id === d.id)) {
      const targets = [...G.SLOTS.map(sl => p.gear[sl]), ...p.bag].filter(it => it && it.kind === 'gear' && it.set);
      if (!d.item) dye = { title: 'Re-tag which piece?', buttons: targets.map(it => btn(`${it.name} (${G.CLASSES[it.set].name})`, 'dyeItem', [it.id], { style: 'ghost' })).concat([btn('Cancel', 'dyeCancel', [], { style: 'ghost' })]) };
      else {
        const it = targets.find(x => x.id === d.item);
        dye = { title: `${it ? it.name : ''}: new class?`, buttons: G.CLASS_ORDER.filter(c => !it || c !== it.set).map(c => btn(`${G.CLASSES[c].name} (${G.Supply.left(c)} left)`, 'dyeClass', [c], { enabled: G.Supply.left(c) > 0, style: 'ghost' })).concat([btn('Cancel', 'dyeCancel', [], { style: 'ghost' })]) };
      }
    }
    return { size, items, buffs: buffList(p), msg: s.bagMsg || null, dye, locked: s.phase === 'battle' };
  }
  function rivalsView(s, MP) {
    const ready = new Set(MP && MP.readyInfo && MP.readyInfo.room === s.room ? MP.readyInfo.ready : []);
    return s.rivals.map(r => {
      const sc = G.Stats.compute(r);
      return { slot: r.slot != null ? r.slot : null, id: r.id, name: r.name, bot: !!r.bot, botWas: r.botWas || null, level: r.level, hearts: r.hearts, hp: r.hp, maxHp: G.Hero.maxHp(r),
        alive: !!r.alive, diedRoom: r.diedRoom || null, spec: r.spec ? G.SPECS[r.spec].name : null, gem: r.gem ? G.GEMS[r.gem].name : null, build: buildLabel(r),
        tint: hex(r.tint || 0x9fdcff), gold: r.gold, ready: ready.has(r.slot), look: look(r),
        summary: `${sc.dmg} Damage, ${sc.spd} Attack Speed, ${sc.armor} Armor, ${sc.ward} Magic Resist, ${sc.dodge} Dodge${r.poison ? `, ${r.poison} poison` : ''}`,
        gear: G.SLOTS.map(sl => itemView(r.gear[sl], null)) };
    });
  }
  const ROOM_INFO = {
    armory: { name: 'The Armory', text: 'Pick one of three weapons.' },
    doors: { name: 'Two doors', text: 'Choose between two doors: fights, treasure, campfires and more.' },
    shop: { name: 'Plunder', text: 'A shared pile of loot, always with one relic. Free picks for everyone; fewer hearts and lower health pick first.' },
    merchant: { name: 'Merchant', text: 'Spend gold on gear, potions and buffs, or sell blood.' },
    boss: { name: 'Boss', text: 'A single sealed door with a boss behind it. Guaranteed rare item.' },
    duel: { name: 'Duel', text: 'Everyone is paired with a rival. The loser loses a heart.' },
    tournament: { name: 'Tournament', text: 'Everyone with hearts fights round after round. Last one standing wins.' },
  };
  function topView(s) {
    const C = CFG(), kinds = [];
    for (let r = 1; r <= C.tournamentRoom; r++) kinds.push(G.Dungeon.roomKind(r));   // room r is kinds[r - 1]; ROOM_INFO in view.rooms says what each kind is
    const kindNow = G.Dungeon.roomKind(Math.min(s.room, C.tournamentRoom)), ph = s.room <= C.rooms ? G.phaseOf(s.room) : null;
    let label = `Room ${s.room}`, small = `of ${C.tournamentRoom}${ph ? ' · ' + ph.name : ''}${kindNow !== 'doors' ? ' · ' + ROOM_INFO[kindNow].name : ''}`;
    if (s.room > C.rooms || s.roundKind === 'tour' || (s.tour && s.phase !== 'dead')) { label = 'Tournament'; small = ''; }
    else if (s.phase === 'spec' || s.phase === 'tree') { label = 'Level up'; small = `after room ${s.room}`; }
    else if (s.phase === 'gem') { label = 'Heart gem'; small = `after room ${s.room}`; }
    else if (s.phase === 'duelIntro' || (s.battle && s.battle.duel && s.phase === 'battle')) { label = 'Duel'; small = `after room ${s.room}`; }
    return { room: s.room, label, small, dayPhase: ph ? ph.name : null, kinds, gemRoom: C.gemRoom };
  }

  // ---------- Screens ----------
  const itemCard = (it, hero, buttons, extra) => ({ kind: 'item', item: itemView(it, hero), lines: extra || [], buttons });
  const textCard = (title, lines, buttons, o = {}) => ({ kind: 'text', title, sub: o.sub || null, color: o.color || null, icon: o.icon || null, lines: lines.map(l => (typeof l === 'string' ? line(l) : l)), buttons: buttons || [] });
  function takeLabel(p, it, verb = 'Take it') {
    if (it.kind === 'relic') return G.Hero.canReceive(p, it) ? { ok: true, text: `${verb} (relic)` } : { ok: false, text: 'Maxed' };
    if (it.kind === 'gear' && !G.Hero.canEquip(p, it)) return G.Hero.bagFull(p) ? { ok: false, text: 'Bag full' } : { ok: true, text: `${verb} (to bag)` };
    if (it.kind === 'gear' && !p.gear[it.slot]) return { ok: true, text: `${verb} and equip` };
    if (G.Hero.bagFull(p)) return { ok: false, text: 'Bag full' };
    return { ok: true, text: `${verb} (to bag)` };
  }
  const bagNote = full => (full ? line('Your bag is full. Gear for an empty slot still goes straight on you; for anything else, sell something from your bag first, or it’s lost.', 'warn')
    : line('Gear for an empty slot is equipped right away. Anything else goes into your bag, where you hold Equip to swap it in.', 'hint'));
  const nameOf = e => (e.ghost ? e.name : e.hero.isPlayer ? 'You' : e.hero.name);

  function doorsScreen(s, p) {
    const one = s.doors.length === 1, t = s.doors[0].type;
    const doors = s.doors.map((d, i) => {
      const info = G.Dungeon.doorInfo(d), dg = d.danger;
      return { i, type: d.type, icon: 'door_' + d.type, title: info.title, text: info.text, monster: d.monster ? d.monster.id : null,
        threat: dg ? (p.gem === 'janus' ? { estimate: true, level: dg.level, avgLoss: dg.avgLoss, winPct: dg.winPct } : { skulls: dg.skulls || 1 }) : null,
        button: btn(info.title, 'chooseDoor', [i], { style: 'primary' }) };
    });
    return { title: t === 'armory' ? 'Room 1: the Armory' : one ? 'A single door, sealed with iron' : 'Two doors',
      lede: t === 'armory' ? 'Grab a weapon. The real run starts in room 2.' : one ? 'No way around it. Win to continue.' : 'Pick one. Health carries from room to room, so spend it wisely. You can use bag items before you choose.',
      sections: [{ kind: 'doors', doors }, { kind: 'character' }] };
  }
  function screenFor(s, MP) {
    const p = s.player, C = CFG(), S = C.shop, mp = !!(MP && MP.inMatch && MP.inMatch());
    switch (s.phase) {
      case 'doors': return doorsScreen(s, p);
      case 'armory': return { title: 'The Armory', lede: 'Racks of old steel. Three weapons are yours to choose from. Uncommon and rare weapons later carry a class that fits them.',
        sections: [{ kind: 'cards', cards: s.armory.map(it => itemCard(it, p, [btn(`Take the ${G.WEAPONS[it.weaponType].name}`, 'pickWeapon', [it.id], { style: 'primary' })])) }] };
      case 'reward': {
        const o = s.offer;
        return { title: o.title, lede: o.text, notes: [bagNote(G.Hero.bagFull(p))],
          sections: [{ kind: 'cards', cards: o.items.map(it => { const L = takeLabel(p, it); return itemCard(it, p, [btn(L.text, 'takeItem', [it.id], { enabled: L.ok, style: 'primary' })]); }) },
            { kind: 'buttons', buttons: [btn(o.gold ? `Leave the items, take ${o.gold} gold` : 'Take nothing', 'takeGold', [], { style: 'ghost' })] }, { kind: 'character' }] };
      }
      case 'spoils': return { title: 'Victory', lede: s.spoilsText || '',
        sections: [{ kind: 'cards', cards: s.spoils.map(o => textCard(o.title, [o.text], [btn('Take it', 'takeSpoils', [o.id], { style: 'primary' })])) }, { kind: 'character' }] };
      case 'mystery': {
        const m = s.mystery, b = [];
        if (m.id === 'spring') b.push(btn(`Drink (+${C.springHeal} health)`, 'mysteryAct', ['spring'], { style: 'primary' }));
        if (m.id === 'cache') b.push(btn('Take the gold', 'mysteryAct', ['cache'], { style: 'primary' }));
        if (m.id === 'ambush') b.push(btn('Fight', 'mysteryAct', ['ambush'], { style: 'primary' }));
        if (m.id === 'shrine') { const cost = p.gem === 'stone' ? 1 : C.shrineCost; b.push(btn(`Offer ${cost} health for an uncommon or better item`, 'mysteryAct', ['shrine'], { enabled: p.hp > cost, style: 'primary' }), btn('Walk away', 'mysteryAct', ['leave'], { style: 'ghost' })); }
        return { title: m.title, lede: m.text, sections: [{ kind: 'buttons', buttons: b }] };
      }
      case 'wager': {
        const B = C.wager.bets, broke = p.gold < B[0];
        return { title: 'Wager', lede: 'A pit boss grins and pulls a curtain halfway: "Bet on yourself." You can\'t see what\'s behind it, and the door has shut, so this fight is happening. Win and you double your bet, plus the usual rewards. Lose and the bet is gone, along with a heart.',
          notes: broke ? [line(`You can't cover the smallest bet (${B[0]} gold).`, 'hint')] : [],
          sections: [{ kind: 'buttons', buttons: broke ? [btn('Fight with nothing on the line', 'placeBet', [0], { style: 'primary' })] : B.map(b => btn(`Bet ${b} gold`, 'placeBet', [b], { enabled: p.gold >= b, style: 'primary' })) }, { kind: 'character' }] };
      }
      case 'merchant': {
        const m = s.merchant, full = G.Hero.bagFull(p);
        const stock = m.stock.map(it => {
          const price = G.Dungeon.merchantPrice(p, m, it), sold = m.bought.includes(it.id), room = G.Hero.canReceive(p, it), where = it.kind === 'gear' && !p.gear[it.slot] ? ', equip' : '';
          return itemCard(it, p, [sold ? btn('Sold', 'shopBuy', ['gear', it.id], { enabled: false }) : btn(!room ? 'Bag full' : price === 0 ? `Take it free${where} (Haggler)` : `Buy for ${price} gold${where}`, 'shopBuy', ['gear', it.id], { enabled: p.gold >= price && room, style: 'primary' })]);
        });
        const cons = (id, price) => {
          const c = G.CONSUMABLES[id], left = m.cstock[id], out = left <= 0;
          return textCard(c.name, [c.desc, line(`${left} in stock.`, 'hint')], [btn(out ? 'Sold out' : full ? 'Bag full' : `${price} gold`, 'shopBuy', ['cons', id], { enabled: !out && !full && p.gold >= price, style: 'primary' })], { icon: 'potion_' + id, color: RARITY_COLOR.potion });
        };
        const potions = [cons('potion', S.potionCost), cons('antidote', G.CONSUMABLES.antidote.price)];
        if (m.cstock.tome != null) potions.push(cons('tome', G.CONSUMABLES.tome.price));
        for (const id of m.buffs) potions.push(cons(id, G.CONSUMABLES[id].price));
        const bloodCost = p.gem === 'stone' ? 1 : S.bloodHealth, bled = m.bled || 0, out = bled >= S.bloodMax, weak = p.hp <= bloodCost;
        potions.push(textCard('Sell blood', [`Lose ${bloodCost} health${p.gem === 'stone' ? ' (Heart of Stone)' : ''} for a random ${S.bloodGold[0]} to ${S.bloodGold[1]} gold.`, line(`${S.bloodMax - bled} of ${S.bloodMax} left this visit.`, 'hint')],
          [btn(out ? 'No more' : weak ? 'Too weak' : 'Bleed for gold', 'shopBuy', ['blood', null], { enabled: !out && !weak, style: 'primary' })], { icon: 'blood', color: '#c9473a' }));
        const rc = S.restockCosts[m.restocks];
        return { title: 'Merchant', lede: `A trader with a cart full of gear. You have ${p.gold} gold. Stay as long as the room timer allows, or leave when you're done.`,
          notes: m.msg ? [line(m.msg, 'notice')] : [], bloodPop: m.bloodPop || null,
          sections: [{ kind: 'cards', compact: true, cards: potions }, { kind: 'cards', cards: stock },
            { kind: 'buttons', buttons: [btn(rc == null ? 'No restocks left' : `Restock gear (${rc} gold, ${S.restockCosts.length - m.restocks} left)`, 'shopBuy', ['restock', null], { enabled: rc != null && p.gold >= rc, style: 'ghost' }), btn('Leave the merchant', 'leaveMerchant', [], { style: 'primary' })] }] };
      }
      case 'forge': {
        const f = s.forge, F = C.forge;
        const cards = G.SLOTS.filter(sl => p.gear[sl]).map(sl => {
          const it = p.gear[sl], gains = G.Dungeon.strengthenGains(it), done = !G.Dungeon.canStrengthen(it);
          const prev = done ? [line('Already strengthened.', 'hint')] : Object.keys(gains).map(k => line(`${G.STAT_INFO[k].label}: ${it.base[k]} → ${it.base[k] + gains[k]}`, 'up'));
          return itemCard(it, p, [btn(done ? 'Already strengthened' : `Strengthen (${F.upgradeCost})`, 'forgeAct', ['strengthen', sl], { enabled: !done && !f.strengthened && p.gold >= F.upgradeCost, style: 'primary' }),
            btn(it.affixed ? 'Already forged' : `Add a random affix (${F.affixCost})`, 'forgeAct', ['affix', sl], { enabled: !it.affixed && !f.affixed && p.gold >= F.affixCost, style: 'ghost' })], prev);
        });
        return { title: 'Forge', lede: `The smith can strengthen one item (its base stats grow by one tier; the card shows exactly how) and add one random affix to one item. Each piece can be strengthened once and take one added affix, ever. Artifacts too. You have ${p.gold} gold.`,
          notes: f.msg ? [line(f.msg, 'notice')] : [], sections: [{ kind: 'cards', cards }, { kind: 'buttons', buttons: [btn('Leave the forge', 'leaveForge', [], { style: 'primary' })] }] };
      }
      case 'spec': return { title: `Level ${C.levels.specLevel}: choose your specialization`, lede: 'Three random options. Each one has a skill tree: a choice at level 10, another at 15, and a capstone at 20.',
        sections: [{ kind: 'cards', cards: s.specOptions.map(id => {
          const Sp = G.SPECS[id], T = G.SPEC_TREES[id];
          return textCard(Sp.name, [Sp.desc, line(Sp.tip, 'affix'), line('Skill tree', 'head'), line(`Lv 10: ${T.t10[0].name} or ${T.t10[1].name}`), line(`Lv 15: ${T.t15[0].name} or ${T.t15[1].name}`), line(`Lv 20: ${T.t20.name}`)],
            [btn(`Become a ${Sp.name}`, 'chooseSpec', [id], { style: 'primary' })], { sub: Sp.role });
        }) }] };
      case 'tree': {
        const lv = s.treeLevel, Sp = G.SPECS[p.spec];
        return { title: `Level ${lv}: ${Sp.name} skill tree`, lede: lv === 20 ? 'Claim the capstone of your specialization.' : 'Choose a path. It’s permanent.', sections: [{ kind: 'tree', tree: treeView(p, lv) }] };
      }
      case 'gem': return { title: 'Choose a heart gem', lede: `${G.Dungeon.monsterFor(C.gemRoom, 'boss').name} drops three gems. Each one changes how you play for the rest of the run, for better and worse.`,
        sections: [{ kind: 'cards', cards: s.gemOptions.map(id => { const g = G.GEMS[id]; return textCard(g.name, [line('Upside', 'head'), line(g.up, 'up'), line('Cost', 'head'), line(g.cost, 'down')], [btn(`Take the ${g.name}`, 'chooseGem', [id], { style: 'primary' })], { color: g.color, icon: 'gem' }); }) }] };
      case 'shop': return shopScreen(s, p, S);
      case 'duelIntro': {
        const d = s.duel, m = d.mine;
        if (!m) return { title: 'Duel', lede: 'Waiting for your pairing…', sections: [] };
        const opp = m.a.hero && m.a.hero.isPlayer ? m.b : m.a;
        return { title: 'Duel', lede: `Everyone still in is paired up. ${opp.ghost ? `You're the odd one out, so you face a ghost: a half-strength copy of ${opp.of.name}. Losing to it still costs a heart.` : `You face ${opp.hero.name}. The loser loses a heart.`} Both of you fight at full health. Win and you go back to the health you had before; the loser comes back at full. Past one minute, both lose a heart.`,
          notes: [line('You can drink potions and elixirs now, before the fight. Not once it starts.', 'hint')],
          sections: [{ kind: 'opponent', opponent: opponentView(opp) },
            d.goSent ? { kind: 'timer', label: 'Locked in. The fight is starting…' } : { kind: 'timer', label: 'The fight starts for both of you in', ends: s.roundEnds || 0, buttons: [btn('Fight now', 'startDuelFight', [], { style: 'primary' })] }] };
      }
      case 'battle': {
        const b = s.battle;
        return { title: b.title, lede: b.duel || b.tour ? 'Player fights: every hit deals a quarter damage, and the fight goes to the death. Past one minute, both lose a heart.' : '',
          notes: [line(`Fights speed up to 2x after ${C.combat.fastAfter} seconds.${b.duel || b.tour ? '' : ` If time runs out (${C.combat.maxTime}s), you get half the gold and XP and no items.`}`, 'hint')],
          sections: [{ kind: 'arena' }] };
      }
      case 'waiting': return waitingScreen(s, p, MP);
      case 'duelWait': return { title: 'Duel', lede: 'Everyone is being paired up for a duel. The loser loses a heart.', sections: [{ kind: 'timer', label: 'Waiting for every player to arrive…' }] };
      case 'tournament': return tournamentScreen(s, p, MP);
      case 'dead': return { title: 'You\'re out of hearts', lede: (s.notice || 'The dungeon took your last heart.') + (mp ? ' Pick a player on the left to watch their game live. You\'ll see the tournament when it starts.' : ''),
        sections: [{ kind: 'buttons', buttons: [btn('Leave the match', 'ui_leave', [], { style: 'ghost' })] }] };
      case 'mpEnded': return { title: /inactivity/.test(s.notice || '') ? 'Removed for inactivity' : 'Match over', lede: s.notice || 'The connection to the room was lost.', sections: [{ kind: 'buttons', buttons: [btn('Back to the title', 'ui_title', [], { style: 'primary' })] }] };
      case 'ending': return { title: s.tour && s.tour.champion ? `${s.tour.champion.hero.name} won the tournament` : 'Nobody made it out', lede: '', sections: s.tour ? [{ kind: 'places', places: placesView(s.tour) }, { kind: 'bracket', bracket: bracketView(s.tour) }] : [] };
      default: return { title: '', lede: '', sections: [] };
    }
  }
  function treeView(p, pickLevel) {
    const T = G.SPEC_TREES[p.spec], picks = p.treePicks || {};
    const node = (n, lv, side) => {
      const taken = picks[lv] === n.id, other = picks[lv] && !taken, live = pickLevel === lv && !picks[lv];
      return { id: n.id, name: n.name, desc: n.desc, level: lv, side: lv === 20 ? 'Capstone' : side, state: taken ? 'taken' : other ? 'skipped' : live ? 'live' : 'locked',
        button: live ? btn(`Take ${n.name}`, 'chooseTree', [n.id], { style: 'primary' }) : null };
    };
    return { spec: { name: G.SPECS[p.spec].name, desc: G.SPECS[p.spec].desc }, rows: [
      { level: 10, nodes: [node(T.t10[0], 10, 'Left'), node(T.t10[1], 10, 'Right')] },
      { level: 15, nodes: [node(T.t15[0], 15, 'Left'), node(T.t15[1], 15, 'Right')] },
      { level: 20, nodes: [node(T.t20, 20)] }] };
  }
  function opponentView(opp) {
    const h = opp.ghost ? opp.of : opp.hero;
    const ov = opp.ghost ? { s: opp.s, hp: opp.hp } : opp.hp != null ? { s: G.Stats.compute(h), hp: opp.hp } : null;
    return { name: opp.ghost ? opp.name : h.name, ghost: !!opp.ghost, bot: !opp.ghost && !!h.bot, hearts: h.hearts, level: h.level, build: buildLabel(h),
      spec: h.spec ? G.SPECS[h.spec].name : 'No spec yet', gem: h.gem && !opp.ghost ? G.GEMS[h.gem].name : null, look: look(h), stats: statCols(h, ov), sets: setBonus(h) };
  }
  function shopScreen(s, p, S) {
    const sh = s.shop;
    if (!sh) return { title: 'Plunder', lede: 'The pile is being laid out. Everyone picks from it, weakest first.', sections: [{ kind: 'timer', label: 'Waiting for every player to arrive…' }] };
    const all = [p, ...s.rivals], byId = id => all.find(h => h.id === id);
    const turnId = sh.order[sh.turn], turnHero = byId(turnId), reviewing = Date.now() < sh.reviewUntil;
    const myNow = turnHero && turnHero.isPlayer && !reviewing, picked = !!sh.picks[p.id], full = G.Hero.bagFull(p);
    const order = sh.order.map((id, i) => {
      const h = byId(id), now = i === sh.turn && !reviewing;
      return { n: i + 1, name: h ? (h.isPlayer ? 'You' : h.name) : '?', me: !!(h && h.isPlayer), bot: !!(h && h.bot), hearts: h ? h.hearts : 0, hpPct: h ? Math.round(h.hp / G.Hero.maxHp(h) * 100) : 0,
        state: sh.picks[id] ? `took ${sh.picks[id]}` : now ? (h && h.isPlayer ? 'your turn' : 'picking…') : 'waiting', now };
    });
    const cards = sh.table.map(it => { const L = takeLabel(p, it, 'Take this'); return itemCard(it, p, [myNow ? btn(L.text, 'playerShopPick', [it.id], { enabled: L.ok, style: 'primary' }) : btn(picked ? 'Picked' : reviewing ? 'Picks start soon' : 'Wait for your turn', 'playerShopPick', [it.id], { enabled: false })]); });
    const sections = [];
    if (reviewing) sections.push({ kind: 'review', label: 'Look over the table. Picks start in', ends: sh.reviewUntil, total: (sh.reviewSecs || S.reviewSeconds) * 1000 });
    sections.push({ kind: 'list', title: 'Pick order', rows: order, turnStart: sh.turnStart, turnTotal: S.turnSeconds * 1000 });
    sections.push({ kind: 'cards', title: myNow ? 'The pile · your turn' : 'The pile', cards });
    if (myNow) sections.push({ kind: 'buttons', buttons: [btn(`Pass and take ${S.passGold} gold`, 'playerShopPass', [], { style: 'ghost', note: 'If your timer runs out, you pass.' })] });
    return { title: sh.tour ? 'Tournament Plunder' : 'Plunder',
      lede: (sh.tour ? 'A pile between rounds for everyone still in, a chance to change your build. ' : '') + `Everyone picks from one shared pile, weakest first: Treasure Hunters always go first, then fewer hearts, then lower health. Everyone gets ${S.reviewSeconds} seconds to look, then ${S.turnSeconds} seconds per turn. Pass to take ${S.passGold} gold instead.`,
      notes: [...((sh.msg || s.shopMsg) ? [line(sh.msg || s.shopMsg, 'notice')] : []), ...(myNow ? [bagNote(full)] : [])], sections };
  }
  function waitingScreen(s, p, MP) {
    const C = CFG();
    if (!MP || !MP.players) return { title: `Room ${s.room} done`, lede: '', sections: [{ kind: 'character' }] };
    const R = MP.readyInfo, ready = new Set(R && R.room === s.room ? R.ready : []);
    const rows = MP.players.map(pl => {
      const h = MP.heroes[pl.slot], st = !h || !h.alive ? 'out' : pl.bot ? 'bot' : ready.has(pl.slot) ? 'ready' : 'playing';
      return { name: pl.slot === MP.mySlot ? 'You' : pl.name, bot: !!pl.bot, state: st, label: { out: 'Out of hearts', bot: 'Bot (plays instantly)', ready: 'Ready', playing: 'Still playing' }[st] };
    });
    const humans = MP.players.filter(pl => !pl.bot && MP.heroes[pl.slot] && MP.heroes[pl.slot].alive);
    const slow = humans.filter(pl => !ready.has(pl.slot)), votes = new Set(R && R.room === s.room ? R.votes || [] : []), voted = votes.has(MP.mySlot);
    const sections = [{ kind: 'list', title: 'Players', rows }];
    if (MP.skipAllowed(s.room) && humans.length >= 3 && slow.length === 1 && ready.has(MP.mySlot) && !(R && R.skipped))
      sections.push({ kind: 'skip', text: `Waiting on ${slow[0].name}. Everyone else can vote to hurry them: their clock drops to ${C.skipHurrySeconds} seconds (${votes.size}/${humans.length - 1}).`,
        buttons: [btn(voted ? 'You voted' : 'Vote to skip', 'sendSkipVote', [], { enabled: !voted, mp: true, style: 'primary' })] });
    else if (R && R.skipped) sections.push({ kind: 'skip', text: `Skip vote passed. They have ${C.skipHurrySeconds} seconds left.`, buttons: [] });
    sections.push({ kind: 'character' });
    return { title: s.room >= C.rooms ? 'The dungeon is behind you' : `Room ${s.room} done`,
      lede: s.room >= C.rooms ? `The tournament starts once everyone gets through room ${C.rooms}.` : `Room ${s.room + 1} starts as soon as everyone is ready. You can use bag items and look over your gear while you wait.`, sections };
  }
  function bracketView(T) {
    const next = G.Tournament.nextMatch(T);
    const row = (e, won, p, i) => {
      if (e.ghost) return { name: e.name, ghost: true, won };
      const snap = p.snap && p.snap[i];
      return { name: nameOf(e), me: !!e.hero.isPlayer, bot: !!e.hero.bot, won, hearts: snap ? snap.hearts : e.hero.hearts,
        hp: p.result ? (won ? `${snap ? snap.hp : e.hp} hp left` : p.draw ? 'out of time' : snap && snap.out ? 'out' : 'lost') : `${e.hp} hp` };
    };
    const rounds = T.rounds.map(r => ({ n: r.n, matches: r.pairs.map(p => {
      const wa = p.result && !p.draw ? p.winner === p.a : null, mine = (p.a.hero && p.a.hero.isPlayer) || (!p.ghost && p.b.hero && p.b.hero.isPlayer);
      let note;
      if (p.result) {
        const li = p.lostHeart === p.a ? 0 : 1, wasOut = p.snap && p.snap[li] && p.snap[li].out, who = p.lostHeart && nameOf(p.lostHeart), verb = who === 'You' ? 'lose' : 'loses';
        note = p.draw ? (p.suddenDeath ? 'Out of time: sudden death' : 'Out of time: both lose a heart') : p.ghost ? 'Ghost fight' : p.lostHeart ? `${who} ${verb} a heart${wasOut ? (who === 'You' ? ' and are out' : ' and is out') : ''}` : '';
      } else note = p === next ? (mine ? 'Your fight is next' : 'Up next') : 'Waiting';
      return { a: row(p.a, wa, p, 0), b: row(p.b, wa === null ? null : !wa, p, 1), note, next: p === next, mine };
    }) }));
    const out = T.entrants.filter(e => e.out).sort((a, b) => a.place - b.place).map(e => `${e.hero.isPlayer ? 'You' : e.hero.name} (${ord(e.place)})`);
    return { rounds, champion: T.champion ? { name: T.champion.hero.isPlayer ? 'You' : T.champion.hero.name, hearts: T.champion.hero.hearts } : null, out };
  }
  const placesView = T => T.entrants.slice().sort((a, b) => a.place - b.place).map(e => ({ place: ord(e.place), name: e.hero.isPlayer ? 'You' : e.hero.name, me: !!e.hero.isPlayer }));
  function tournamentScreen(s, p, MP) {
    const T = s.tour, C = CFG();
    if (!T) return { title: 'The Tournament', lede: '', sections: [] };
    if (T.champion) {
      const won = T.champion.hero.isPlayer;
      const matched = MP && MP.lobby && MP.lobby.matched, owner = MP && MP.isOwner && MP.isOwner();
      const buttons = matched ? [btn('Find another match', 'ui_requeue', [], { style: 'primary' }), btn('Leave', 'ui_leave', [], { style: 'ghost' })]
        : owner ? [btn('Play again (same room)', 'ui_rematch', [], { style: 'primary' }), btn('Leave', 'ui_leave', [], { style: 'ghost' })] : [btn('Leave', 'ui_leave', [], { style: 'ghost' })];
      return { title: won ? 'You are the last one standing' : `${T.champion.hero.name} wins the tournament`,
        lede: T.entrants.length === 1 ? 'Everyone else ran out of hearts in the dungeon.' : won ? 'Thirty rooms, a tournament, and nobody could stop you.' : 'You made it to the end. Next time, the crown.',
        notes: MP && MP.saveStatus ? [line(`Match database: ${MP.saveStatus === 'saved' ? 'this match was saved.' : MP.saveStatus === 'saving' ? 'saving…' : MP.saveStatus}`, 'hint')] : [],
        sections: [{ kind: 'places', places: placesView(T) }, { kind: 'bracket', bracket: bracketView(T) }, ...(!matched && !owner ? [{ kind: 'timer', label: 'The host can start a rematch in this room.' }] : []), { kind: 'buttons', buttons }] };
    }
    const round = G.Tournament.currentRound(T);
    const m = round && round.pairs.find(x => !x.result && ((x.a.hero && x.a.hero.isPlayer) || (!x.ghost && x.b.hero && x.b.hero.isPlayer)));
    const opp = m ? (m.a.hero && m.a.hero.isPlayer ? m.b : m.a) : null, meE = T.entrants.find(e => e.hero.isPlayer);
    const sections = [];
    if (opp && meE && !meE.out) sections.push({ kind: 'opponent', opponent: opponentView(opp.ghost ? opp : { hero: opp.hero, hp: opp.hp }) });
    sections.push({ kind: 'bracket', bracket: bracketView(T) });
    sections.push(s.tourPhase === 'fight' ? { kind: 'timer', label: 'Fights in progress…' } : s.tourPhase === 'plunder' ? { kind: 'timer', label: 'Tournament Plunder in progress…' }
      : { kind: 'timer', label: m ? 'Your fight starts in' : 'Next fights start in', ends: s.roundEnds || 0 });
    return { title: 'The Tournament', lede: !meE || meE.out ? 'You\'re out, so you\'re watching.' : 'Last one with hearts wins. Each round everyone is paired up again and starts the fight at full health. Losers lose a heart, against a ghost too. Fights go to the death; past one minute, both lose a heart.', sections };
  }

  // ---------- Everything for one client ----------
  // s: the game state (G.Game.s), MP: the match (G.MP). Times are on this machine's clock (Date.now()).
  function view(s, MP) {
    if (!s || !s.player) return null;
    const p = s.player, sc = screenFor(s, MP);
    sc.phase = s.phase;
    sc.notice = s.notice && !['dead', 'shop', 'mpEnded'].includes(s.phase) ? s.notice : null;
    sc.notes = sc.notes || [];
    // rivals: by seat (each sent only when it changes); clock: the round timer (server time, ms)
    const rv = rivalsView(s, MP), rivals = {};
    rv.forEach((r, i) => { rivals[r.slot != null ? r.slot : 'r' + i] = r; });
    return { top: topView(s), clock: { ends: s.roundEnds || 0, total: (s.roundTotal || CFG().roundSeconds) * 1000 }, me: meView(p), gear: gearView(p), bag: bagView(s, p),
      rivals, rivalOrder: Object.keys(rivals), screen: sc, setGuide: setGuide(p), rooms: ROOM_INFO,
      tree: p.spec ? treeView(p, null) : null, supply: supplyView(s) };
  }
  function supplyView(s) {
    const counts = G.Supply.counts(), per = CFG().supplyPerClass;
    return { per, classes: G.CLASS_ORDER.map(c => ({ cls: c, name: G.CLASSES[c].name, color: G.CLASSES[c].color, left: counts[c] })) };
  }

  G.Present = { view, itemView, statCols, buildLabel, look };
})(window.G);
