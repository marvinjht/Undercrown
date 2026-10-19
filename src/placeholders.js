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
    door_fight: P('M4 4l12 12M20 4L8 16M3 15l6 6M21 15l-6 6'),
    door_elite: P('M6 10a6 6 0 1 1 12 0v4l-2 2v3H8v-3l-2-2zM9 11h1M14 11h1M10 19v-2M14 19v-2'),
    door_boss: P('M3 18h18l-2-10-4 4-3-7-3 7-4-4z'),
    door_treasure: P('M3 10h18v10H3zM3 10l2-5h14l2 5M12 10v4'),
    door_rest: P('M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 1-8zM5 21l14-2M5 19l14 2'),
    door_shop: P('M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM14.5 8.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2s1 1.7 2.5 2 2.5 1 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 5.5v13'),
    door_armory: P('M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11l8 0M12 3v4'),
    door_mystery: P('M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2.5M12 18h.01'),
  };

  function icon(key, cls = '') {
    const path = G.ASSETS.icons['icon_' + key];
    if (path) return `<img class="ico ${cls}" src="${path}" alt="">`;
    const body = SVG[key] || P('M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16z');
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  // ---------- Sprites (Phaser) ----------
  function gfx(scene) { return scene.make.graphics({ x: 0, y: 0, add: false }); }
  function bake(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) return;
    const g = gfx(scene);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  const OUTLINE = 0x1a1410;

  function drawHero(g) {
    // Light grey so each hero can be tinted a color
    g.fillStyle(0x000000, 0.25).fillEllipse(32, 36, 46, 40);
    g.fillStyle(0xd8d8d8).fillEllipse(32, 32, 34, 50);           // shoulders
    g.lineStyle(2, OUTLINE).strokeEllipse(32, 32, 34, 50);
    g.fillStyle(0xb8b8b8).fillCircle(32, 14, 6).fillCircle(32, 50, 6); // pauldrons
    g.fillStyle(0xffffff).fillCircle(34, 32, 11);                 // head
    g.lineStyle(2, OUTLINE).strokeCircle(34, 32, 11);
    g.fillStyle(0x6b5a48).fillRect(41, 29, 4, 6);                  // facing marker
  }

  const WEAPON_DRAW = {
    daggers(g) {
      g.fillStyle(0x6b4a2f).fillRect(2, 20, 10, 5).fillRect(2, 39, 10, 5);
      g.fillStyle(0xcfd6dc).fillTriangle(12, 19, 12, 26, 34, 22.5).fillTriangle(12, 38, 12, 45, 34, 41.5);
    },
    saber(g) {
      g.fillStyle(0x6b4a2f).fillRect(2, 29, 10, 6);
      g.fillStyle(0xc9a54a).fillRect(11, 25, 3, 14);
      g.fillStyle(0xd7dee4).fillTriangle(14, 29, 14, 35, 52, 24);
    },
    swordShield(g) {
      g.fillStyle(0x6b4a2f).fillRect(2, 40, 8, 5);
      g.fillStyle(0xd7dee4).fillRect(10, 41, 30, 3);
      g.fillStyle(0x7a5536).fillEllipse(18, 22, 18, 30);
      g.lineStyle(3, 0xb38b3c).strokeEllipse(18, 22, 18, 30);
    },
    longsword(g) {
      g.fillStyle(0x6b4a2f).fillRect(0, 30, 12, 5);
      g.fillStyle(0xc9a54a).fillRect(12, 24, 4, 17);
      g.fillStyle(0xdfe5ea).fillRect(16, 30, 42, 5).fillTriangle(58, 30, 58, 35, 63, 32.5);
    },
    greatAxe(g) {
      g.fillStyle(0x6b4a2f).fillRect(0, 30, 50, 5);
      g.fillStyle(0xbfc6cc).fillTriangle(40, 32, 60, 12, 60, 52);
      g.lineStyle(2, OUTLINE).strokeTriangle(40, 32, 60, 12, 60, 52);
    },
    greatHammer(g) {
      g.fillStyle(0x6b4a2f).fillRect(0, 30, 46, 5);
      g.fillStyle(0x8e969c).fillRect(44, 14, 18, 37);
      g.lineStyle(2, OUTLINE).strokeRect(44, 14, 18, 37);
    },
  };

  // Monsters: base color + body drawing
  function blob(g, cx, cy, w, h, color, eyes = 0xffe9a8) {
    g.fillStyle(0x000000, 0.25).fillEllipse(cx + 2, cy + 4, w, h);
    g.fillStyle(color).fillEllipse(cx, cy, w, h);
    g.lineStyle(2, OUTLINE).strokeEllipse(cx, cy, w, h);
    g.fillStyle(eyes).fillCircle(cx + w * 0.22, cy - h * 0.14, 3).fillCircle(cx + w * 0.22, cy + h * 0.14, 3);
  }
  const MONSTER_DRAW = {
    rat: g => { g.lineStyle(3, 0x8a6f62).lineBetween(6, 32, 20, 32); blob(g, 34, 32, 34, 22, 0x7d6b5d, 0xff5a4a); },
    slime: g => { g.fillStyle(0x5cc77a, 0.3).fillCircle(32, 32, 26); blob(g, 32, 32, 42, 42, 0x4fae63, 0x10301a); },
    skeleton: g => { blob(g, 32, 32, 32, 44, 0xe4dccb, 0x1b1410); g.lineStyle(2, 0x9c917f).lineBetween(26, 18, 26, 46).lineBetween(30, 16, 30, 48); },
    goblin: g => { g.fillStyle(0x5d8a3a).fillTriangle(30, 18, 22, 6, 36, 16).fillTriangle(30, 46, 22, 58, 36, 48); blob(g, 32, 32, 30, 36, 0x6e9e44, 0xffd23f); },
    orc: g => { blob(g, 32, 32, 44, 54, 0x5a7f45, 0xffb03b); g.fillStyle(0xf2ead7).fillTriangle(48, 26, 54, 24, 50, 30).fillTriangle(48, 38, 54, 40, 50, 34); },
    wraith: g => { g.fillStyle(0x8e6fc9, 0.35).fillCircle(32, 32, 28); blob(g, 32, 32, 36, 40, 0x6a51a6, 0xc8f4ff); },
    troll: g => { blob(g, 32, 32, 52, 58, 0x6f7f72, 0xffe066); g.fillStyle(0x56645a).fillCircle(22, 14, 6).fillCircle(22, 50, 6); },
    ogre: g => { blob(g, 32, 32, 54, 58, 0x9a7a5a, 0xff7a3b); g.fillStyle(0x5b4636).fillRect(46, 20, 14, 24); },
    cultist: g => { g.fillStyle(0x5a1820).fillTriangle(10, 32, 46, 8, 46, 56); blob(g, 36, 32, 26, 30, 0x8c2a34, 0xff3040); },
    boneKing: g => { blob(g, 48, 48, 60, 72, 0xe9e0c8, 0xff3b30); g.fillStyle(0xd8b13a).fillTriangle(30, 30, 24, 18, 36, 28).fillTriangle(30, 48, 18, 48, 30, 42).fillTriangle(30, 66, 24, 78, 36, 68); },
    gorehorn: g => { blob(g, 48, 48, 66, 76, 0x7a3a2a, 0xffd23f); g.fillStyle(0xeee3c8).fillTriangle(66, 30, 90, 20, 70, 38).fillTriangle(66, 66, 90, 76, 70, 58); },
    warden: g => { g.fillStyle(0x3a4250).fillRect(14, 10, 64, 76); g.lineStyle(3, 0x9aa7b8).strokeRect(14, 10, 64, 76); blob(g, 50, 48, 48, 58, 0x5d6b80, 0x7fe0ff); },
  };

  function drawFloor(g) {
    g.fillStyle(0x2a231e).fillRect(0, 0, 64, 64);
    const shades = [0x2f2721, 0x2b241f, 0x332a23, 0x2d2620];
    let i = 0;
    for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) {
      g.fillStyle(shades[i++ % 4]).fillRect(x + 1, y + 1, 30, 30);
    }
    g.lineStyle(2, 0x1b1612).strokeRect(0, 0, 64, 64).lineBetween(32, 0, 32, 64).lineBetween(0, 32, 64, 32);
    g.fillStyle(0x3a3029).fillRect(8, 8, 3, 2).fillRect(44, 50, 4, 2).fillRect(50, 12, 2, 2);
  }

  function makeTextures(scene) {
    bake(scene, 'hero', 64, 64, drawHero);
    bake(scene, 'floor', 64, 64, drawFloor);
    for (const k in WEAPON_DRAW) bake(scene, 'weapon_' + k, 64, 64, WEAPON_DRAW[k]);
    for (const k in MONSTER_DRAW) {
      const big = !!G.BOSSES[k];
      bake(scene, 'monster_' + k, big ? 96 : 64, big ? 96 : 64, MONSTER_DRAW[k]);
    }
  }

  G.Art = { icon, makeTextures };
})(window.G);
