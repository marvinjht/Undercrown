// Built-in placeholder art. Used for any key in assets/manifest.js that is null.
// Sprites are drawn with Phaser graphics; menu icons are small inline SVGs.
window.G = window.G || {};

(function (G) {
  // ---------- Menu icons (SVG, 24x24, drawn with currentColor) ----------
  const P = (d) => `<path d="${d}"/>`;
  const SVG = {
    weapon: P('M4 20L16 8M14 4l6 6M6 15l3 3'),
    helmet: P('M5 15a7 7 0 0 1 14 0v4h-4v-4H9v4H5z'),
    chest: P('M8 4L4 7l2 5 2-1v9h8v-9l2 1 2-5-4-3-2 2h-4z'),
    gloves: P('M8 21v-7L6 10V6h2v4M10 10V4h2v6M12 10V3.5h2V10M14 10V5h2v8l-2 8'),
    legs: P('M7 3h10l-1 18h-3l-1-11-1 11H8z'),
    boots: P('M9 3h5v10l6 3v5H5v-4l4-2z'),
    daggers: P('M4 20l9-9M13 11l4-6M9 20l9-9M18 11l2-6M3 17l4 4M8 17l4 4'),
    saber: P('M5 19c7-2 12-8 14-15M3 16l5 5M6 18l-2 2'),
    swordShield: P('M14 4l6 2v5c0 4-3 7-6 9-3-2-6-5-6-9V6zM3 21l7-7M2 18l4 4'),
    longsword: P('M5 19L20 4M8 13l3 3M3 21l3-3'),
    greatAxe: P('M5 21L17 6M13 3c4-1 8 3 7 7l-4-1-3-3z'),
    greatHammer: P('M4 21L14 11M11 6l5-4 6 6-4 5z'),
    mace: P('M5 19L14 10M14 10a4 4 0 1 0 5-5 4 4 0 0 0-5 5zM18 3l1 2M21 6l-2 1M12 6l2 1'),
    maceShield: P('M15 4l5 2v4c0 4-2 6-5 8-3-2-5-4-5-8V6zM3 21l6-6M9 15a3 3 0 1 0-1-4'),
    shortbow: P('M7 4c6 3 6 13 0 16M7 4v16M4 12h14l-3-2M18 12l-3 2'),
    longbow: P('M6 2c9 4 9 16 0 20M6 2v20M3 12h17l-3-2M20 12l-3 2'),
    wandFocus: P('M4 20l8-8M14 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM18 14a3 3 0 1 0 0 6 3 3 0 1 0 0-6'),
    staff: P('M6 21L17 6M17 6a3 3 0 1 0 2-3 3 3 0 0 0-2 3z'),
    potion: P('M10 3h4M10 3v5l-4 7a4 4 0 0 0 4 6h4a4 4 0 0 0 4-6l-4-7V3M8 14h8'),
    tome: P('M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6'),
    eye: P('M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z'),
    door_fight: P('M4 4l12 12M20 4L8 16M3 15l6 6M21 15l-6 6'),
    door_elite: P('M6 10a6 6 0 1 1 12 0v4l-2 2v3H8v-3l-2-2zM9 11h1M14 11h1M10 19v-2M14 19v-2'),
    door_boss: P('M3 18h18l-2-10-4 4-3-7-3 7-4-4z'),
    door_treasure: P('M3 10h18v10H3zM3 10l2-5h14l2 5M12 10v4'),
    door_rest: P('M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 1-8zM5 21l14-2M5 19l14 2'),
    door_merchant: P('M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v7h14v-7M10 20v-4h4v4'),
    door_trash: P('M5 8h14l-1.5 12h-11zM3 8h18M9 8V5h6v3M10 12v5M14 12v5'),
    door_vault: P('M4 5h16v14H4zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM12 9v-1M12 16v-1M8 12H7M17 12h-1'),
    door_forge: P('M4 14h12l4-4H8zM6 14v3h8v-3M10 17v3M7 20h6M15 4l-2 4M18 5l-3 3'),
    door_trainer: P('M4 12h3M17 12h3M7 8v8M17 8v8M7 12h10M4 9v6M20 9v6'),
    door_wager: P('M5 5h14v14H5zM9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01'),
    door_shop: P('M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM14.5 8.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2s1 1.7 2.5 2 2.5 1 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 5.5v13'),
    door_mystery: P('M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2.5M12 18h.01'),
    door_armory: P('M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11l8 0M12 3v4'),
    door_venom: P('M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11zM9 14l2 2 4-4'),
    door_purify: P('M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11zM8.5 15c1 2 2.5 2.5 4 2'),
    crown: P('M3 18h18M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z'),
    gem: P('M7 4h10l4 5-9 12L3 9zM3 9h18M9 4l3 5 3-5M12 9v12'),
    relic_knuckle: P('M6 9a3 3 0 1 1 4-3l4 4a3 3 0 1 1 3 4l-4 4a3 3 0 1 1-3-4z'),
    relic_snare: P('M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v4M12 18v4M2 12h4M18 12h4'),
    relic_spade: P('M12 2v12M8 14h8l-1 6h-6zM9 3h6'),
    relic_gauze: P('M4 8l12-4 4 4-12 12-4-4zM8 12l4 4M11 9l4 4M15 18c1 1 2 2 2 3'),
    relic_leeches: P('M7 5h10v3H7zM6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM9 13c1 2 2-1 3 1s2-1 3 1'),
    relic_rending: P('M15 3v9a5 5 0 1 1-6 5M12 3h6'),
    relic_primed: P('M10 21v-9l-1-5a1.5 1.5 0 0 1 3 0l1 4 1-6a1.5 1.5 0 0 1 3 0l-1 8 1 8M16 3l1-1'),
    relic_concuss: P('M12 3a2 2 0 0 1 2 2c3 1 4 4 4 8v3l2 2H4l2-2v-3c0-4 1-7 4-8a2 2 0 0 1 2-2zM10 20a2 2 0 0 0 4 0'),
    relic_counter: P('M4 18c4 0 8-2 10-6s5-7 7-8c0 4-2 9-6 12s-8 3-11 2zM11 14l-2-1'),
    relic_bastion: P('M5 4h14v7c0 5-3 8-7 10-4-2-7-5-7-10zM12 8v8M8 12h8'),
    relic_ratpaw: P('M6 20l5-6M11 14c0-3 1-5 3-6M14 8l1-4M14 8l3-2M14 8l3 1M11 14l4-1'),
    relic_tortoise: P('M3 15a9 7 0 0 1 18 0zM8 15l2-5h4l2 5M3 15l-1 3M21 15l1 3'),
    relic_journal: P('M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM9 3v18M12 8h4M12 11h4M13 16a1.5 1.5 0 1 0 0.01 0'),
  };
  const POTION_COLORS = { potion: '#d0473a', greater: '#ff6b5a', antidote: '#7fd67a', iron: '#b8b8c8', salve: '#8fb4ff', fury: '#ff9a3c', tonic: '#f2e28c', draught: '#b39cff' };

  function icon(key, cls = '') {
    const path = G.ASSETS.icons['icon_' + key];
    if (path) return `<img class="ico ${cls}" src="${path}" alt="">`;
    let style = '', k = key;
    if (key === 'potion_tome') { k = 'tome'; style = ' style="color:#e9c889"'; }
    else if (key.startsWith('potion_')) { k = 'potion'; style = ` style="color:${POTION_COLORS[key.slice(7)] || 'inherit'}"`; }
    const body = SVG[k] || P('M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16z');
    return `<svg class="ico ${cls}"${style} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  // ---------- Sprites (Phaser) ----------
  function bake(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
  const OUTLINE = 0x1a1410;

  // Heroes are drawn in light greys so each one can be tinted; class looks change the silhouette
  function heroBase(g) {
    g.fillStyle(0x000000, 0.25).fillEllipse(32, 36, 46, 40);
    g.fillStyle(0xd8d8d8).fillEllipse(32, 32, 34, 50);
    g.lineStyle(2, OUTLINE).strokeEllipse(32, 32, 34, 50);
  }
  function head(g, fill = 0xffffff) {
    g.fillStyle(fill).fillCircle(34, 32, 11);
    g.lineStyle(2, OUTLINE).strokeCircle(34, 32, 11);
    g.fillStyle(0x6b5a48).fillRect(41, 29, 4, 6);
  }
  const HERO_LOOKS = {
    hero: g => { heroBase(g); g.fillStyle(0xb8b8b8).fillCircle(32, 14, 6).fillCircle(32, 50, 6); head(g); },
    hero_warrior: g => {
      heroBase(g);
      g.fillStyle(0xa8a8a8).fillRect(20, 6, 22, 12).fillRect(20, 46, 22, 12);
      g.lineStyle(2, OUTLINE).strokeRect(20, 6, 22, 12).strokeRect(20, 46, 22, 12);
      head(g, 0xe8e8e8); g.lineStyle(3, 0x777777).lineBetween(26, 32, 45, 32);
    },
    hero_mage: g => {
      g.fillStyle(0x000000, 0.25).fillEllipse(32, 36, 50, 44);
      g.fillStyle(0xe2e2e2).fillTriangle(6, 32, 50, 6, 50, 58);
      g.lineStyle(2, OUTLINE).strokeTriangle(6, 32, 50, 6, 50, 58);
      g.fillStyle(0xffffff).fillCircle(36, 32, 10); g.lineStyle(2, OUTLINE).strokeCircle(36, 32, 10);
      g.fillStyle(0xf0f0f0).fillTriangle(26, 32, 44, 22, 44, 42);
    },
    hero_archer: g => {
      heroBase(g);
      g.lineStyle(3, 0x8a6a48).lineBetween(14, 12, 24, 22).lineBetween(12, 16, 22, 26).lineBetween(16, 9, 26, 19);
      g.fillStyle(0xcfcfcf).fillEllipse(30, 32, 26, 46); head(g);
    },
    hero_paladin: g => {
      heroBase(g);
      g.fillStyle(0xbdbdbd).fillCircle(32, 12, 8).fillCircle(32, 52, 8);
      g.lineStyle(2, OUTLINE).strokeCircle(32, 12, 8).strokeCircle(32, 52, 8);
      head(g); g.lineStyle(3, 0xd4af37).lineBetween(16, 26, 16, 38).lineBetween(11, 32, 21, 32);
    },
    hero_rogue: g => {
      g.fillStyle(0x000000, 0.25).fillEllipse(32, 36, 40, 36);
      g.fillStyle(0xc4c4c4).fillEllipse(32, 32, 28, 44); g.lineStyle(2, OUTLINE).strokeEllipse(32, 32, 28, 44);
      g.fillStyle(0x9a9a9a).fillCircle(32, 32, 13); g.lineStyle(2, OUTLINE).strokeCircle(32, 32, 13);
      g.fillStyle(0x2a2a2a).fillRect(36, 28, 9, 7);
    },
  };

  const WEAPON_DRAW = {
    daggers(g) { g.fillStyle(0x6b4a2f).fillRect(2, 20, 10, 5).fillRect(2, 39, 10, 5); g.fillStyle(0xcfd6dc).fillTriangle(12, 19, 12, 26, 34, 22.5).fillTriangle(12, 38, 12, 45, 34, 41.5); },
    saber(g) { g.fillStyle(0x6b4a2f).fillRect(2, 29, 10, 6); g.fillStyle(0xc9a54a).fillRect(11, 25, 3, 14); g.fillStyle(0xd7dee4).fillTriangle(14, 29, 14, 35, 52, 24); },
    swordShield(g) { g.fillStyle(0x6b4a2f).fillRect(2, 40, 8, 5); g.fillStyle(0xd7dee4).fillRect(10, 41, 30, 3); g.fillStyle(0x7a5536).fillEllipse(18, 22, 18, 30); g.lineStyle(3, 0xb38b3c).strokeEllipse(18, 22, 18, 30); },
    longsword(g) { g.fillStyle(0x6b4a2f).fillRect(0, 30, 12, 5); g.fillStyle(0xc9a54a).fillRect(12, 24, 4, 17); g.fillStyle(0xdfe5ea).fillRect(16, 30, 42, 5).fillTriangle(58, 30, 58, 35, 63, 32.5); },
    greatAxe(g) { g.fillStyle(0x6b4a2f).fillRect(0, 30, 50, 5); g.fillStyle(0xbfc6cc).fillTriangle(40, 32, 60, 12, 60, 52); g.lineStyle(2, OUTLINE).strokeTriangle(40, 32, 60, 12, 60, 52); },
    greatHammer(g) { g.fillStyle(0x6b4a2f).fillRect(0, 30, 46, 5); g.fillStyle(0x8e969c).fillRect(44, 14, 18, 37); g.lineStyle(2, OUTLINE).strokeRect(44, 14, 18, 37); },
    mace(g) { g.fillStyle(0x6b4a2f).fillRect(0, 30, 32, 5); g.fillStyle(0xd4af37).fillCircle(40, 32, 9); g.lineStyle(2, OUTLINE).strokeCircle(40, 32, 9); g.fillStyle(0xd4af37).fillTriangle(40, 18, 37, 24, 43, 24).fillTriangle(40, 46, 37, 40, 43, 40).fillTriangle(54, 32, 48, 29, 48, 35); },
    maceShield(g) { g.fillStyle(0x6b4a2f).fillRect(2, 40, 22, 4); g.fillStyle(0xd4af37).fillCircle(28, 42, 6); g.fillStyle(0xe8e0c8).fillEllipse(18, 20, 18, 28); g.lineStyle(3, 0xd4af37).strokeEllipse(18, 20, 18, 28).lineBetween(18, 10, 18, 30).lineBetween(11, 20, 25, 20); },
    shortbow(g) { g.lineStyle(4, 0x8a6a48).beginPath().arc(10, 32, 20, -1.2, 1.2).strokePath(); g.lineStyle(1, 0xe8e8e8).lineBetween(17, 13, 17, 51); },
    longbow(g) { g.lineStyle(4, 0x7a5a38).beginPath().arc(4, 32, 28, -1.25, 1.25).strokePath(); g.lineStyle(1, 0xe8e8e8).lineBetween(13, 6, 13, 58); },
    wandFocus(g) { g.fillStyle(0x5a3f2a).fillRect(0, 40, 30, 4); g.fillStyle(0xffb36b).fillCircle(32, 42, 4); g.fillStyle(0x8fd4ff, 0.8).fillCircle(20, 18, 9); g.lineStyle(2, 0xe8f6ff).strokeCircle(20, 18, 9); },
    staff(g) { g.fillStyle(0x5a3f2a).fillRect(0, 30, 54, 5); g.fillStyle(0xa18cff).fillCircle(56, 32, 7); g.fillStyle(0xd8ccff, 0.45).fillCircle(56, 32, 12); },
  };

  function blob(g, cx, cy, w, h, color, eyes = 0xffe9a8) {
    g.fillStyle(0x000000, 0.25).fillEllipse(cx + 2, cy + 4, w, h);
    g.fillStyle(color).fillEllipse(cx, cy, w, h);
    g.lineStyle(2, OUTLINE).strokeEllipse(cx, cy, w, h);
    g.fillStyle(eyes).fillCircle(cx + w * 0.22, cy - h * 0.14, 3).fillCircle(cx + w * 0.22, cy + h * 0.14, 3);
  }
  const MONSTER_DRAW = {
    rat: g => { g.lineStyle(3, 0x8a6f62).lineBetween(6, 32, 20, 32); blob(g, 34, 32, 34, 22, 0x7d6b5d, 0xff5a4a); },
    slime: g => { g.fillStyle(0x5cc77a, 0.3).fillCircle(32, 32, 26); blob(g, 32, 32, 42, 42, 0x4fae63, 0x10301a); },
    slimeElite: g => {
      g.fillStyle(0x2f7a8a, 0.3).fillCircle(32, 34, 26); blob(g, 32, 34, 42, 40, 0x24606e, 0xffe066);
      g.fillStyle(0xf2c14a).fillPoints([{ x: 8, y: 22 }, { x: 8, y: 46 }, { x: 18, y: 42 }, { x: 14, y: 34 }, { x: 18, y: 26 }], true);
      g.lineStyle(2, OUTLINE).strokePoints([{ x: 8, y: 22 }, { x: 8, y: 46 }, { x: 18, y: 42 }, { x: 14, y: 34 }, { x: 18, y: 26 }], true);
    },
    wolf: g => { g.fillStyle(0x6d6a66).fillTriangle(38, 20, 44, 12, 46, 24).fillTriangle(38, 44, 44, 52, 46, 40); g.lineStyle(3, 0x6d6a66).lineBetween(4, 32, 16, 32); blob(g, 32, 32, 40, 26, 0x8a8680, 0xffd23f); },
    skeleton: g => { blob(g, 32, 32, 32, 44, 0xe4dccb, 0x1b1410); g.lineStyle(2, 0x9c917f).lineBetween(26, 18, 26, 46).lineBetween(30, 16, 30, 48); },
    goblin: g => { g.fillStyle(0x5d8a3a).fillTriangle(30, 18, 22, 6, 36, 16).fillTriangle(30, 46, 22, 58, 36, 48); blob(g, 32, 32, 30, 36, 0x6e9e44, 0xffd23f); },
    thief: g => { g.fillStyle(0x8a6a2a).fillCircle(16, 46, 8); g.lineStyle(2, OUTLINE).strokeCircle(16, 46, 8); blob(g, 34, 30, 30, 36, 0x3e3a48, 0xf2e28c); g.fillStyle(0x24212a).fillRect(38, 26, 9, 8); },
    orc: g => { blob(g, 32, 32, 44, 54, 0x5a7f45, 0xffb03b); g.fillStyle(0xf2ead7).fillTriangle(48, 26, 54, 24, 50, 30).fillTriangle(48, 38, 54, 40, 50, 34); },
    golem: g => { g.fillStyle(0x000000, 0.25).fillEllipse(34, 36, 52, 52); g.fillStyle(0x8c8579).fillPoints([{ x: 10, y: 20 }, { x: 28, y: 6 }, { x: 52, y: 12 }, { x: 58, y: 34 }, { x: 46, y: 58 }, { x: 18, y: 54 }, { x: 6, y: 38 }], true); g.lineStyle(2, OUTLINE).strokePoints([{ x: 10, y: 20 }, { x: 28, y: 6 }, { x: 52, y: 12 }, { x: 58, y: 34 }, { x: 46, y: 58 }, { x: 18, y: 54 }, { x: 6, y: 38 }], true); g.fillStyle(0x7fe0ff).fillCircle(44, 26, 3).fillCircle(44, 40, 3); },
    wraith: g => { g.fillStyle(0x8e6fc9, 0.35).fillCircle(32, 32, 28); blob(g, 32, 32, 36, 40, 0x6a51a6, 0xc8f4ff); },
    troll: g => { blob(g, 32, 32, 52, 58, 0x6f7f72, 0xffe066); g.fillStyle(0x56645a).fillCircle(22, 14, 6).fillCircle(22, 50, 6); },
    ogre: g => { blob(g, 32, 32, 54, 58, 0x9a7a5a, 0xff7a3b); g.fillStyle(0x5b4636).fillRect(46, 20, 14, 24); },
    cultist: g => { g.fillStyle(0x5a1820).fillTriangle(10, 32, 46, 8, 46, 56); blob(g, 36, 32, 26, 30, 0x8c2a34, 0xff3040); },
    snake: g => { g.lineStyle(7, 0x4f7a3a).beginPath().moveTo(4, 40).lineTo(14, 28).lineTo(24, 40).lineTo(34, 30).strokePath(); blob(g, 42, 30, 20, 16, 0x5f9444, 0xffe066); g.lineStyle(2, 0xd04040).lineBetween(52, 30, 58, 30); },
    hydra: g => {
      g.lineStyle(6, 0x2f6a5a).lineBetween(14, 32, 40, 12).lineBetween(14, 32, 44, 32).lineBetween(14, 32, 40, 52);
      blob(g, 16, 32, 26, 34, 0x2f6a5a, 0x10301a);
      for (const y of [12, 32, 52]) { g.fillStyle(0x3f8a72).fillEllipse(46, y, 16, 12); g.lineStyle(2, OUTLINE).strokeEllipse(46, y, 16, 12); g.fillStyle(0xffe066).fillCircle(50, y - 2, 2); }
    },
    ghoul: g => { g.fillStyle(0x9ab8a0, 0.25).fillCircle(32, 32, 22); blob(g, 32, 32, 26, 32, 0x7a9682, 0xd8ff7a); g.lineStyle(2, 0x56685a).lineBetween(40, 22, 50, 18).lineBetween(40, 42, 50, 46); },
    yeti: g => { blob(g, 48, 48, 66, 74, 0xe8f2fa, 0x2f6fbf); g.fillStyle(0x9fc8e8).fillTriangle(20, 20, 12, 8, 30, 18).fillTriangle(20, 76, 12, 88, 30, 78); g.fillStyle(0xbfe4ff, 0.5).fillCircle(48, 48, 12); },
    wraithKing: g => {
      g.fillStyle(0x6a3fa0, 0.35).fillCircle(48, 48, 44); blob(g, 48, 48, 50, 64, 0x3e2a6a, 0x9ff4ff);
      g.fillStyle(0xd8b13a).fillTriangle(28, 30, 20, 20, 32, 26).fillTriangle(26, 48, 14, 48, 28, 42).fillTriangle(28, 66, 20, 76, 32, 70);
    },
    alphaWolf: g => { g.fillStyle(0x3e3c40).fillTriangle(60, 26, 70, 12, 72, 32).fillTriangle(60, 70, 70, 84, 72, 64); g.lineStyle(4, 0x3e3c40).lineBetween(4, 48, 22, 48); blob(g, 48, 48, 60, 40, 0x56535a, 0xff4a3a); g.lineStyle(2, 0xd0d0d0).lineBetween(40, 34, 50, 40).lineBetween(40, 62, 50, 56); },
    mire: g => { g.fillStyle(0x3a3020, 0.4).fillEllipse(48, 52, 90, 80); blob(g, 48, 48, 72, 70, 0x5a4a2e, 0xc8e05a); g.fillStyle(0x4a3c24).fillCircle(26, 26, 7).fillCircle(30, 72, 9).fillCircle(64, 20, 5); g.fillStyle(0x6a8a3a).fillCircle(56, 70, 4).fillCircle(22, 50, 3); },
    boneKing: g => { blob(g, 48, 48, 60, 72, 0xe9e0c8, 0xff3b30); g.fillStyle(0xd8b13a).fillTriangle(30, 30, 24, 18, 36, 28).fillTriangle(30, 48, 18, 48, 30, 42).fillTriangle(30, 66, 24, 78, 36, 68); },
    gorehorn: g => { blob(g, 48, 48, 66, 76, 0x7a3a2a, 0xffd23f); g.fillStyle(0xeee3c8).fillTriangle(66, 30, 90, 20, 70, 38).fillTriangle(66, 66, 90, 76, 70, 58); },
    warden: g => { g.fillStyle(0x3a4250).fillRect(14, 10, 64, 76); g.lineStyle(3, 0x9aa7b8).strokeRect(14, 10, 64, 76); blob(g, 50, 48, 48, 58, 0x5d6b80, 0x7fe0ff); },
  };

  function drawFloor(g) {
    g.fillStyle(0x2a231e).fillRect(0, 0, 64, 64);
    const shades = [0x2f2721, 0x2b241f, 0x332a23, 0x2d2620];
    let i = 0;
    for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) g.fillStyle(shades[i++ % 4]).fillRect(x + 1, y + 1, 30, 30);
    g.lineStyle(2, 0x1b1612).strokeRect(0, 0, 64, 64).lineBetween(32, 0, 32, 64).lineBetween(0, 32, 64, 32);
    g.fillStyle(0x3a3029).fillRect(8, 8, 3, 2).fillRect(44, 50, 4, 2).fillRect(50, 12, 2, 2);
  }

  function makeTextures(scene) {
    for (const k in HERO_LOOKS) bake(scene, k, 64, 64, HERO_LOOKS[k]);
    bake(scene, 'trim_ring', 64, 64, g => { g.lineStyle(4, 0xffffff).strokeCircle(32, 32, 27); });
    bake(scene, 'floor', 64, 64, drawFloor);
    for (const k in WEAPON_DRAW) bake(scene, 'weapon_' + k, 64, 64, WEAPON_DRAW[k]);
    for (const k in MONSTER_DRAW) { const big = !!G.BOSSES[k]; bake(scene, 'monster_' + k, big ? 96 : 64, big ? 96 : 64, MONSTER_DRAW[k]); }
    bake(scene, 'proj_arrow', 32, 8, g => { g.lineStyle(2, 0xe8d8b8).lineBetween(0, 4, 26, 4); g.fillStyle(0xdfe5ea).fillTriangle(24, 0, 24, 8, 32, 4); });
    bake(scene, 'proj_bolt', 20, 20, g => { g.fillStyle(0xffffff, 0.35).fillCircle(10, 10, 10); g.fillStyle(0xffffff).fillCircle(10, 10, 5); });
    bake(scene, 'fx_ring', 96, 96, g => { g.lineStyle(6, 0xffffff, 0.9).strokeCircle(48, 48, 40); g.fillStyle(0xffffff, 0.15).fillCircle(48, 48, 40); });
  }

  G.Art = { icon, makeTextures };
})(window.G);
