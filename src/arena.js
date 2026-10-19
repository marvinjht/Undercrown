// Top-down arena that plays back a fight timeline from src/combat.js.
// It never decides outcomes; it only animates the events it's given.
window.G = window.G || {};

(function (G) {
  const W = 640, H = 360;
  const FONT = '"Spline Sans Mono", ui-monospace, monospace';

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
      // torches
      this.torches = [[60, 40], [W - 60, 40], [60, H - 40], [W - 60, H - 40]].map(([x, y]) => {
        const glow = this.add.circle(x, y, 26, 0xff9a3c, 0.12);
        this.add.circle(x, y, 5, 0xffc46b);
        this.tweens.add({ targets: glow, alpha: 0.05, scale: 1.25, duration: 600 + Math.random() * 400, yoyo: true, repeat: -1 });
        return glow;
      });
      this.objs = [];
      G.Arena._scene = this;
      if (G.Arena._pending) { const p = G.Arena._pending; G.Arena._pending = null; this.begin(p); }
    }

    clear() { for (const o of this.objs) o.destroy(); this.objs = []; }
    track(o) { this.objs.push(o); return o; }

    makeFighter(def, side) {
      const startX = side === 'a' ? 90 : W - 90;
      const y = 200;
      const body = this.add.image(0, 0, def.texture);
      if (def.tint) body.setTint(def.tint);
      const parts = [body];
      let weapon = null;
      if (def.weapon) { weapon = this.add.image(10, 10, def.weapon).setOrigin(0.1, 0.5); parts.push(weapon); }
      const cont = this.track(this.add.container(startX, y, parts));
      const sc = def.scale || 1;
      cont.setScale(side === 'a' ? sc : -sc, sc);
      const name = this.track(this.add.text(startX, y - 54 * sc, def.name, {
        fontFamily: FONT, fontSize: '13px', color: '#ece3d6', stroke: '#15120f', strokeThickness: 4,
      }).setOrigin(0.5));
      const bar = this.track(this.add.graphics());
      return {
        side, def, cont, body, weapon, name, bar, sc,
        hp: def.hp, maxHp: def.maxHp, shield: def.shield || 0, maxShield: def.shield || 0, startX, homeX: side === 'a' ? W / 2 - 62 - 10 * sc : W / 2 + 62 + 10 * sc,
        y, dir: side === 'a' ? 1 : -1, lunge: 0, dy: 0, dead: false,
      };
    }

    begin(cfg) {
      this.clear();
      this.cfg = cfg;
      this.t = 0; this.idx = 0; this.finished = false;
      this.speed = 1;
      this.F = { a: this.makeFighter(cfg.left, 'a'), b: this.makeFighter(cfg.right, 'b') };
    }

    float(f, str, color, size = 18, dx = 0) {
      const tx = this.track(this.add.text(f.cont.x + dx + (Math.random() * 20 - 10), f.y - 30 * f.sc, str, {
        fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#15120f', strokeThickness: 4,
      }).setOrigin(0.5));
      this.tweens.add({ targets: tx, y: tx.y - 40, alpha: 0, duration: 900 / this.speed, ease: 'Cubic.easeOut', onComplete: () => tx.destroy() });
    }

    swing(f) {
      const d = 120 / this.speed;
      this.tweens.add({ targets: f, lunge: 22, duration: d, yoyo: true, ease: 'Quad.easeOut' });
      if (f.weapon) {
        f.weapon.rotation = -0.9;
        this.tweens.add({ targets: f.weapon, rotation: 0.5, duration: d, yoyo: true, ease: 'Quad.easeOut', onComplete: () => { f.weapon.rotation = 0; } });
      }
    }

    flash(f) {
      f.body.setTintFill(0xffffff);
      this.time.delayedCall(70 / this.speed, () => {
        if (!f.body.active) return;
        f.body.clearTint();
        if (f.def.tint) f.body.setTint(f.def.tint);
        if (f.dead) f.body.setTint(0x555555);
      });
    }

    apply(e) {
      const F = this.F;
      if (e.hp) { F.a.hp = e.hp.a; F.b.hp = e.hp.b; }
      if (e.sh) { F.a.shield = e.sh.a; F.b.shield = e.sh.b; }
      const att = F[e.src], def = F[e.tgt];
      switch (e.type) {
        case 'hit':
          if (!e.counter) this.swing(att); else { this.swing(att); this.float(att, 'COUNTER', '#9fe3ff', 13, 0); }
          this.flash(def);
          if (e.amount > 0) this.float(def, e.crit ? e.amount + '!' : String(e.amount), e.crit ? '#ffd34d' : '#ff7a66', e.crit ? 26 : 18);
          if (e.absorbed) this.float(def, 'SHIELD ' + e.absorbed, '#9fc4ff', 13, 26 * def.dir);
          break;
        case 'dodge':
          this.swing(att); this.float(def, 'DODGE', '#cfe8ff', 15);
          this.tweens.add({ targets: def, dy: -18, duration: 110 / this.speed, yoyo: true });
          break;
        case 'hidden': this.swing(att); this.float(def, 'MISS', '#b9a7d9', 14); break;
        case 'parry': this.swing(att); this.float(def, 'PARRY', '#9fe3ff', 16); break;
        case 'heal': this.float(att, '+' + e.amount, '#7be07b', 14, -20 * att.dir); break;
        case 'bleed': this.float(def, String(e.amount), '#d0473a', 13, 18); break;
        case 'stun': this.float(def, 'STUNNED', '#ffd34d', 14); break;
        case 'stealth_on': this.tweens.add({ targets: att.cont, alpha: 0.22, duration: 160 / this.speed }); break;
        case 'stealth_off': this.tweens.add({ targets: att.cont, alpha: 1, duration: 160 / this.speed }); break;
        case 'death':
          def.dead = true;
          def.body.setTint(0x555555);
          this.tweens.add({ targets: def.cont, alpha: 0.45, angle: def.dir * 80, duration: 500 / this.speed });
          break;
        case 'timeout':
          this.float(F.a, 'TIME', '#ece3d6', 16); break;
      }
      if (this.cfg.onEvent) this.cfg.onEvent(e);
    }

    drawBar(f) {
      const w = 70, h = 7, x = f.cont.x - w / 2, y = f.y - 44 * f.sc;
      const pct = Math.max(0, f.hp / f.maxHp);
      f.bar.clear();
      f.bar.fillStyle(0x0d0b09, 0.85).fillRect(x - 1, y - 1, w + 2, h + 2);
      f.bar.fillStyle(f.side === 'a' ? 0x6cc35f : 0xc4473a).fillRect(x, y, w * pct, h);
      if (f.maxShield > 0 && f.shield > 0) f.bar.fillStyle(0x9fc4ff).fillRect(x, y + h + 1, w * (f.shield / f.maxShield), 3);
      f.name.setPosition(f.cont.x, y - 11);
    }

    update(_, delta) {
      if (!this.cfg || this.finished) return;
      const fast = this.t >= G.CONFIG.combat.fastAfter;
      if (fast && this.speed !== 2) { this.speed = 2; if (G.Arena.onSpeed) G.Arena.onSpeed(2); }
      // Use the wall clock, not Phaser's smoothed delta, so slow frames don't stretch the fight
      const nowMs = performance.now();
      const d = this.lastNow ? Math.min(250, nowMs - this.lastNow) : delta;
      this.lastNow = nowMs;
      this.t += (d / 1000) * this.speed;
      const E = this.cfg.result.events;
      const eng = G.CONFIG.combat.engageDelay;
      const p = Math.min(1, this.t / eng), ease = 1 - Math.pow(1 - p, 2);
      for (const f of [this.F.a, this.F.b]) {
        f.cont.x = f.startX + (f.homeX - f.startX) * ease + f.lunge * f.dir;
        f.cont.y = f.y + f.dy;
      }
      while (this.idx < E.length && E[this.idx].t <= this.t) { this.apply(E[this.idx]); this.idx++; }
      this.drawBar(this.F.a); this.drawBar(this.F.b);
      const end = E.length ? E[E.length - 1].t : 0;
      if (this.idx >= E.length && this.t > end + 1.1) this.finish();
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      const cb = this.cfg.onDone;
      if (cb) cb();
    }

  }

  // A fresh Phaser game is built for every fight and thrown away after it.
  // (Reusing one game across screens left its canvas sized 0x0 after the first fight.)
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
