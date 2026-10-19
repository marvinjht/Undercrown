// Top-down arena that plays back a fight from src/combat.js: positions from its tracks,
// everything else from its events. It never decides outcomes.
window.G = window.G || {};

(function (G) {
  const W = 640, H = 360;
  const FONT = '"Spline Sans Mono", ui-monospace, monospace';
  const X0 = 150, STEP = 60;                      // pixels: position 0 and 1 step (Kiting can step back past 0)
  const LANES = [200, 132, 268, 166, 234, 110, 290];

  function posAt(track, t) {
    if (!track || !track.length) return 0;
    if (t <= track[0][0]) return track[0][1];
    let lo = 0, hi = track.length - 1;
    if (t >= track[hi][0]) return track[hi][1];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track[mid][0] <= t) lo = mid; else hi = mid; }
    const [t0, p0] = track[lo], [t1, p1] = track[hi];
    return p0 + (p1 - p0) * ((t - t0) / Math.max(1e-6, t1 - t0));
  }

  class ArenaScene extends Phaser.Scene {
    constructor() { super('arena'); }

    preload() {
      const S = G.ASSETS.sprites;
      for (const k in S) if (S[k]) this.load.image(k, S[k]);
      this.load.on('loaderror', f => console.warn('Could not load asset, using placeholder:', f.key));
    }

    create() {
      G.Art.makeTextures(this);
      this.add.tileSprite(W / 2, H / 2, W, H, 'floor');
      const v = this.add.graphics();
      for (let i = 0; i < 6; i++) {
        v.fillStyle(0x000000, 0.09);
        v.fillRect(0, 0, W, 10 + i * 8).fillRect(0, H - 10 - i * 8, W, 10 + i * 8);
        v.fillRect(0, 0, 14 + i * 10, H).fillRect(W - 14 - i * 10, 0, 14 + i * 10, H);
      }
      [[60, 40], [W - 60, 40], [60, H - 40], [W - 60, H - 40]].forEach(([x, y]) => {
        const glow = this.add.circle(x, y, 26, 0xff9a3c, 0.12);
        this.add.circle(x, y, 5, 0xffc46b);
        this.tweens.add({ targets: glow, alpha: 0.05, scale: 1.25, duration: 600 + Math.random() * 400, yoyo: true, repeat: -1 });
      });
      this.objs = [];
      G.Arena._scene = this;
      if (G.Arena._pending) { const p = G.Arena._pending; G.Arena._pending = null; this.begin(p); }
    }

    track(o) { this.objs.push(o); return o; }

    makeFighter(m) {
      const vis = (this.cfg.visual && this.cfg.visual[m.id]) || {};
      const side = m.side;
      let texture = m.sprite || 'hero';
      if (texture === 'hero' || side === 'a') texture = vis.look ? 'hero_' + vis.look : 'hero';
      if (!this.textures.exists(texture)) texture = 'hero';
      const lane = side === 'a' ? 200 : LANES[this.laneIdx++ % LANES.length];
      const body = this.add.image(0, 0, texture);
      const tint = vis.tint != null ? vis.tint : m.tint;
      if (tint) body.setTint(tint);
      if (vis.ghost) body.setAlpha(0.5);
      const parts = [body];
      if (vis.trim && G.CLASSES[vis.trim]) parts.unshift(this.add.image(0, 0, 'trim_ring').setTint(G.CLASSES[vis.trim].tint).setAlpha(0.9));
      if (vis.full && vis.look && G.CLASSES[vis.look]) {
        const aura = this.add.image(0, 0, 'fx_ring').setTint(G.CLASSES[vis.look].tint).setScale(0.78).setAlpha(0.55);
        parts.unshift(aura);
        this.tweens.add({ targets: aura, scale: 0.9, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
      }
      let weapon = null;
      const wkey = vis.weapon || m.weapon;
      if (wkey && this.textures.exists(wkey)) { weapon = this.add.image(10, 10, wkey).setOrigin(0.1, 0.5); parts.push(weapon); }
      const cont = this.track(this.add.container(X0, lane, parts));
      const sc = (m.scale || 1) * (side === 'b' && this.cfg.result.fighters.filter(f => f.side === 'b' && f.bornAt === 0).length > 2 ? 0.8 : 1);
      cont.setScale(side === 'a' ? sc : -sc, sc);
      const name = this.track(this.add.text(0, 0, m.name, { fontFamily: FONT, fontSize: '12px', color: '#ece3d6', stroke: '#15120f', strokeThickness: 4 }).setOrigin(0.5));
      const bar = this.track(this.add.graphics());
      const f = { id: m.id, side, m, cont, body, weapon, name, bar, sc, y: lane, dir: side === 'a' ? 1 : -1, lunge: 0, dy: 0,
        hp: m.hp, maxHp: m.maxHp, shield: m.shield, maxShield: Math.max(1, m.shield), mana: m.mana, hasMana: m.hasMana, dead: false, gone: false, tint };
      this.F[m.id] = f;
      this.placeFighter(f);
      return f;
    }

    begin(cfg) {
      for (const o of this.objs) o.destroy();
      this.objs = [];
      this.cfg = cfg; this.t = 0; this.idx = 0; this.finished = false; this.speed = 1; this.lastNow = 0;
      this.F = {}; this.laneIdx = 0;
      for (const m of cfg.result.fighters) if (m.bornAt === 0) this.makeFighter(m);
    }

    placeFighter(f) {
      const p = posAt(this.cfg.result.tracks[f.id], this.t);
      if (!f.gone) f.cont.x = X0 + p * STEP + f.lunge * f.dir;
      f.cont.y = f.y + f.dy;
    }

    float(f, str, color, size = 18, dx = 0) {
      const tx = this.track(this.add.text(f.cont.x + dx + (Math.random() * 20 - 10), f.y - 30 * f.sc, str, {
        fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#15120f', strokeThickness: 4,
      }).setOrigin(0.5));
      this.tweens.add({ targets: tx, y: tx.y - 40, alpha: 0, duration: 900 / this.speed, ease: 'Cubic.easeOut', onComplete: () => tx.destroy() });
    }

    swing(f) {
      const d = 120 / this.speed;
      this.tweens.add({ targets: f, lunge: 18, duration: d, yoyo: true, ease: 'Quad.easeOut' });
      if (f.weapon) {
        f.weapon.rotation = -0.9;
        this.tweens.add({ targets: f.weapon, rotation: 0.5, duration: d, yoyo: true, ease: 'Quad.easeOut', onComplete: () => { if (f.weapon.active) f.weapon.rotation = 0; } });
      }
    }

    shoot(att, def, kind) {
      const tex = kind === 'magic' ? 'proj_bolt' : 'proj_arrow';
      const p = this.track(this.add.image(att.cont.x + 20 * att.dir, att.cont.y, tex));
      if (kind === 'magic') p.setTint(0xb39cff);
      p.rotation = Math.atan2(def.cont.y - att.cont.y, def.cont.x - att.cont.x);
      this.tweens.add({ targets: p, x: def.cont.x, y: def.cont.y, duration: 160 / this.speed, onComplete: () => p.destroy() });
    }

    flash(f) {
      f.body.setTintFill(0xffffff);
      this.time.delayedCall(70 / this.speed, () => {
        if (!f.body.active) return;
        f.body.clearTint();
        if (f.dead) f.body.setTint(0x555555); else if (f.tint) f.body.setTint(f.tint);
      });
    }

    apply(e) {
      const F = this.F;
      if (e.type === 'spawn') {
        const m = this.cfg.result.fighters.find(x => x.id === e.src);
        if (m && !F[m.id]) {
          const f = this.makeFighter(m);
          f.cont.setScale(0.1);
          this.tweens.add({ targets: f.cont, scaleX: -f.sc, scaleY: f.sc, duration: 220 / this.speed, ease: 'Back.easeOut' });
        }
      }
      if (e.h) for (const id in e.h) { const f = F[id]; if (f) { [f.hp, f.shield, f.mana] = e.h[id]; } }
      const att = F[e.src], def = F[e.tgt];
      this.playSfx(e, att, def);
      switch (e.type) {
        case 'hit':
          if (!att || !def) break;
          if (!e.cleave) { if (e.ranged) this.shoot(att, def, e.kind); else this.swing(att); }
          this.flash(def);
          if (e.amount > 0) this.float(def, e.crit ? e.amount + '!' : String(e.amount), e.crit ? '#ffd34d' : '#ff7a66', e.crit ? 24 : 17);
          if (e.absorbed) this.float(def, 'SHIELD ' + e.absorbed, '#9fc4ff', 12, 26 * def.dir);
          if (e.counter) this.float(att, 'COUNTER', '#9fe3ff', 12);
          if (e.cheap) this.float(att, 'CHEAP SHOT', '#c8a2ff', 12);
          break;
        case 'cast': {
          if (!att) break;
          this.float(att, e.echo ? 'ECHO' : e.name.toUpperCase(), '#c9b8ff', e.echo ? 13 : 15);
          const ring = this.track(this.add.image(att.cont.x, att.cont.y, 'fx_ring').setTint(0xa18cff).setScale(0.3).setAlpha(0.9));
          this.tweens.add({ targets: ring, scale: 0.9, alpha: 0, duration: 400 / this.speed, onComplete: () => ring.destroy() });
          break;
        }
        case 'spellhit': {
          if (!def) break;
          const ring = this.track(this.add.image(def.cont.x, def.cont.y, 'fx_ring').setTint(0xff8a4c).setScale(0.2));
          this.tweens.add({ targets: ring, scale: 0.8, alpha: 0, duration: 380 / this.speed, onComplete: () => ring.destroy() });
          this.flash(def);
          this.float(def, String(e.amount), '#c9b8ff', 20);
          break;
        }
        case 'dodge': if (att && def) { if (att.m.range === 'melee') this.swing(att); this.float(def, 'DODGE', '#cfe8ff', 14); this.tweens.add({ targets: def, dy: -16, duration: 110 / this.speed, yoyo: true }); } break;
        case 'hidden': if (att && def) { this.swing(att); this.float(def, 'MISS', '#b9a7d9', 13); } break;
        case 'parry': if (def) this.float(def, 'PARRY', '#9fe3ff', 15); break;
        case 'heal': if (att) this.float(att, '+' + e.amount, '#7be07b', 14, -20 * att.dir); break;
        case 'bleed': if (def) this.float(def, String(e.amount), '#d0473a', 12, 18); break;
        case 'stun': if (def) this.float(def, 'STUNNED', '#ffd34d', 13); break;
        case 'double': if (att) this.float(att, 'DOUBLE SHOT', '#8fcf78', 12); break;
        case 'steal': if (att) this.float(att, `-${e.amount}g`, '#f2c14a', 13); break;
        case 'cheap_ready': break;
        case 'escape':
          if (att) {
            att.gone = true; this.float(att, `ESCAPED +${e.amount}g`, '#f2c14a', 13);
            this.tweens.add({ targets: [att.cont], x: W + 60, alpha: 0, duration: 600 / this.speed });
          }
          break;
        case 'revive': if (att) { this.float(att, 'REBORN', '#ff8a4c', 20); att.cont.setAlpha(1); att.cont.angle = 0; att.dead = false; if (att.tint) att.body.setTint(att.tint); else att.body.clearTint(); } break;
        case 'burst': if (att) {
          const ring = this.track(this.add.image(att.cont.x, att.cont.y, 'fx_ring').setTint(0xff7a2c).setScale(0.3));
          this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 650 / this.speed, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
          this.cameras.main.shake(220 / this.speed, 0.008);
        } break;
        case 'burn': if (def) this.float(def, String(e.amount), '#ff9a3c', 13, -18); break;
        case 'kite': if (att) this.float(att, 'KITE', '#8fcf78', 12); break;
        case 'thorns': if (def) this.float(def, String(e.amount), '#c9a26b', 12, 14); break;
        case 'undying': if (att) this.float(att, 'UNDYING', '#ff5b4a', 16); break;
        case 'stealth_on': if (att) { this.tweens.add({ targets: att.cont, alpha: 0.22, duration: 160 / this.speed }); if (e.label) this.float(att, e.label === 'Night Lord' ? 'NIGHT LORD' : 'VANISH', '#b9a7d9', 14); } break;
        case 'stealth_off': if (att) this.tweens.add({ targets: att.cont, alpha: 1, duration: 160 / this.speed }); break;
        case 'death':
          if (def) { def.dead = true; def.body.setTint(0x555555); this.tweens.add({ targets: def.cont, alpha: 0.35, angle: def.dir * 80, duration: 450 / this.speed }); }
          break;
        case 'timeout': { const a = F.a; if (a) this.float(a, 'TIME', '#ece3d6', 16); break; }
      }
      if (this.cfg.onEvent) this.cfg.onEvent(e);
    }

    // Sound for an event: weapon sounds for heroes, claws and thuds for monsters, spells by name
    playSfx(e, att, def) {
      const S = G.Sound;
      if (!S) return;
      const weaponOf = f => { const v = (this.cfg.visual && this.cfg.visual[f.id]) || {}; const w = v.weapon || f.m.weapon; return w ? w.replace('weapon_', '') : null; };
      switch (e.type) {
        case 'hit': {
          if (!att) break;
          const w = weaponOf(att);
          S.play(e.cleave ? 'chop' : w ? S.WEAPON_SFX[w] || 'slash' : 'claw');
          if (e.crit) S.play('crit', 0.1);
          if (e.cheap) S.play('cheap');
          if (e.absorbed && !e.amount) S.play('shield', 0.12);
          if (def && def.id === 'a' && !e.crit) S.play('hurt', 0.12);
          break;
        }
        case 'cast': S.play(e.echo ? 'arcane' : S.SPELL_SFX[e.name] || 'arcane', 0.2); break;
        case 'heal': S.play('heal', 0.25); break;
        case 'dodge': S.play('dodge'); break;
        case 'parry': S.play('parry'); break;
        case 'stun': S.play('stun'); break;
        case 'stealth_on': S.play('stealth'); break;
        case 'double': S.play('double'); break;
        case 'kite': S.play('kite'); break;
        case 'burst': S.play('explode'); break;
        case 'revive': S.play('revive'); break;
        case 'undying': S.play('revive'); break;
        case 'death': S.play('death', 0.12); break;
        case 'bleed': case 'burn': S.play('bleed', 0.3); break;
        case 'steal': S.play('coin', 0.2); break;
      }
    }

    drawBar(f) {
      if (f.gone) { f.bar.clear(); f.name.setVisible(false); return; }
      // An enemy on the hero's lane (1v1 fights) shows its name and bar below, so labels never overlap
      const below = f.side === 'b' && f.y === 200;
      const w = 64, h = 6, x = f.cont.x - w / 2, y = below ? f.y + 34 * f.sc + 14 : f.y - 42 * f.sc;
      f.bar.clear();
      if (f.dead) { f.name.setPosition(f.cont.x, below ? y + 12 : y - 10).setAlpha(0.4); return; }
      f.bar.fillStyle(0x0d0b09, 0.85).fillRect(x - 1, y - 1, w + 2, h + 2);
      f.bar.fillStyle(f.side === 'a' ? 0x6cc35f : 0xc4473a).fillRect(x, y, w * Math.max(0, f.hp / f.maxHp), h);
      let yy = y + h + 1;
      if (f.shield > 0) { f.bar.fillStyle(0x9fc4ff).fillRect(x, yy, w * Math.min(1, f.shield / f.maxShield), 3); yy += 4; }
      if (f.hasMana) { f.bar.fillStyle(0x0d0b09, 0.85).fillRect(x - 1, yy - 1, w + 2, 5); f.bar.fillStyle(0x6f7dff).fillRect(x, yy, w * Math.min(1, f.mana / 100), 3); }
      f.name.setPosition(f.cont.x, below ? yy + 12 : y - 10);
    }

    update(_, delta) {
      if (!this.cfg || this.finished) return;
      if (this.t >= G.CONFIG.combat.fastAfter && this.speed !== 2) { this.speed = 2; if (G.Arena.onSpeed) G.Arena.onSpeed(2); }
      const nowMs = performance.now();
      const d = this.lastNow ? Math.min(250, nowMs - this.lastNow) : delta;
      this.lastNow = nowMs;
      this.t += (d / 1000) * this.speed;
      const E = this.cfg.result.events;
      while (this.idx < E.length && E[this.idx].t <= this.t) { this.apply(E[this.idx]); this.idx++; }
      for (const id in this.F) { const f = this.F[id]; this.placeFighter(f); this.drawBar(f); }
      const end = E.length ? E[E.length - 1].t : 0;
      if (this.idx >= E.length && this.t > end + 1.1) this.finish();
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      if (this.cfg.onDone) this.cfg.onDone();
    }
  }

  // ---------- Door preview: one small canvas game that lives for the whole session ----------
  // Each render moves its canvas into the new preview slot and redraws the hero.
  const PW = 220, PH = 150;
  class PreviewScene extends Phaser.Scene {
    constructor() { super('preview'); }
    preload() { const S = G.ASSETS.sprites; for (const k in S) if (S[k]) this.load.image(k, S[k]); }
    create() {
      G.Art.makeTextures(this);
      this.add.ellipse(PW / 2, PH / 2 + 34, 120, 26, 0x000000, 0.35);
      this.holder = null;
      G.Preview._scene = this;
      if (G.Preview._vis) this.draw(G.Preview._vis);
    }
    draw(vis) {
      if (this.holder) this.holder.destroy();
      const parts = [];
      if (vis.full && vis.look) {
        const aura = this.add.image(0, 0, 'fx_ring').setTint(G.CLASSES[vis.look].tint).setScale(0.8).setAlpha(0.55);
        parts.push(aura);
        this.tweens.add({ targets: aura, scale: 0.92, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
      }
      if (vis.trim && G.CLASSES[vis.trim]) parts.push(this.add.image(0, 0, 'trim_ring').setTint(G.CLASSES[vis.trim].tint).setAlpha(0.9));
      let tex = vis.look ? 'hero_' + vis.look : 'hero';
      if (!this.textures.exists(tex)) tex = 'hero';
      const body = this.add.image(0, 0, tex);
      if (vis.tint != null) body.setTint(vis.tint);
      parts.push(body);
      if (vis.weapon && this.textures.exists(vis.weapon)) parts.push(this.add.image(10, 10, vis.weapon).setOrigin(0.1, 0.5));
      this.holder = this.add.container(PW / 2 - 8, PH / 2, parts).setScale(1.6);
      this.tweens.add({ targets: this.holder, y: PH / 2 - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
  G.Preview = {
    game: null, _scene: null, _vis: null,
    mount(el, vis) {
      this._vis = vis;
      if (!this.game) {
        this.game = new Phaser.Game({ type: Phaser.WEBGL, parent: el, width: PW, height: PH, transparent: true,
          scale: { mode: Phaser.Scale.NONE }, scene: [PreviewScene], banner: false, audio: { noAudio: true } });
        return;
      }
      if (this.game.canvas && this.game.canvas.parentNode !== el) el.appendChild(this.game.canvas);
      if (this._scene) this._scene.draw(vis);
    },
    // Keep the canvas out of the page when no preview slot is showing
    park() {
      if (this.game && this.game.canvas && this.game.canvas.parentNode) this.game.canvas.parentNode.removeChild(this.game.canvas);
    },
  };

  // A fresh Phaser game is built for every fight and thrown away after it.
  G.Arena = {
    game: null, _scene: null, _pending: null, onSpeed: null,
    start(el, cfg) {
      this.stop();
      this._pending = cfg;
      this.game = new Phaser.Game({
        type: Phaser.AUTO, parent: el, width: W, height: H, backgroundColor: '#15120f',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
        scene: [ArenaScene], banner: false, audio: { noAudio: true },
      });
    },
    stop() {
      if (this.game) { this.game.destroy(true); this.game = null; }
      this._scene = null; this._pending = null;
    },
  };
})(window.G);
