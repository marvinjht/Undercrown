// Top-down arena that plays back a fight from src/combat.js: positions from its tracks,
// everything else from its events. It never decides outcomes.
window.G = window.G || {};

(function (G) {
  const W = 640, H = 360;
  const FONT = '"Spline Sans Mono", ui-monospace, monospace';
  const X0 = 150, STEP = 60;                      // pixels: position 0 and 1 step (Kiting can step back past 0)
  const LANES = [200, 132, 268, 166, 234, 110, 290];
  const FX_COLORS = { 'Holy Burst': '#f0d27a', Heartlight: '#c9b8ff', Quakestep: '#e7c38a', Aegis: '#9fc4ff', Inferno: '#ff9a3c', Butcher: '#ff4a3a', Dawnwall: '#f0d27a', Sentinel: '#9fc4ff', Guillotine: '#ff3b2f', Volley: '#8fcf78' };

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
      // Each game carries its own fight: a game that was replaced before it finished booting can't
      // take the newer game's fight (that left an empty arena when the screen redrew twice quickly)
      const owner = this.arenaOwner = this.game.__owner || G.Arena;
      if (owner.game === this.game) owner._scene = this;
      const cfg = this.game.__cfg;
      this.game.__cfg = null;
      if (cfg && owner.game === this.game) this.begin(cfg);
    }

    track(o) { this.objs.push(o); return o; }

    makeFighter(m) {
      const vis = (this.cfg.visual && this.cfg.visual[m.id]) || {};
      const side = m.side;
      let texture = m.sprite || 'hero';
      if (!m.ally && (texture === 'hero' || side === 'a')) texture = vis.look ? 'hero_' + vis.look : 'hero';
      if (!this.textures.exists(texture)) texture = 'hero';
      const lane = side === 'a' ? (m.ally ? (this.allyIdx++ % 2 ? 262 : 138) : 200) : LANES[this.laneIdx++ % LANES.length];
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
      const faceRight = (side === 'a') !== !!this.cfg.mirror;
      cont.setScale(faceRight ? sc : -sc, sc);
      const label = (this.cfg.names && this.cfg.names[m.id]) || m.name;
      const name = this.track(this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '12px', color: '#ece3d6', stroke: '#15120f', strokeThickness: 4 }).setOrigin(0.5));
      const bar = this.track(this.add.graphics());
      const f = { id: m.id, side, m, cont, body, weapon, name, bar, sc, y: lane, dir: faceRight ? 1 : -1, lunge: 0, dy: 0,
        hp: m.hp, maxHp: m.maxHp, shield: m.shield, maxShield: Math.max(1, m.shield), mana: m.mana, hasMana: m.hasMana, dead: false, gone: false, tint };
      this.F[m.id] = f;
      this.placeFighter(f);
      return f;
    }

    begin(cfg) {
      for (const o of this.objs) o.destroy();
      this.objs = []; this.fxg = null; this.ring = null;
      this.tweens.killAll(); this.time.removeAllEvents();
      this.cameras.main.resetFX();
      this.cfg = cfg; this.t = 0; this.idx = 0; this.finished = false; this.speed = 1; this.lastNow = 0;
      this.F = {}; this.laneIdx = 0; this.allyIdx = 0;
      for (const m of cfg.result.fighters) if (m.bornAt === 0) this.makeFighter(m);
    }

    placeFighter(f) {
      let p = posAt(this.cfg.result.tracks[f.id], this.t);
      if (this.cfg.mirror) p = G.CONFIG.combat.startGap - p;   // you're side b: play it back from your side
      if (!f.gone) f.cont.x = X0 + p * STEP + f.lunge * f.dir;
      f.cont.y = f.y + f.dy;
      // Face the nearest enemy (a kiting archer that rolls past turns around)
      if (!f.dead && !f.gone) {
        let best = null, bd = Infinity;
        for (const id in this.F) { const o = this.F[id]; if (o.side === f.side || o.dead || o.gone) continue; const d = Math.abs(o.cont.x - f.cont.x); if (d < bd) { bd = d; best = o; } }
        if (best && Math.abs(best.cont.x - f.cont.x) > 4) {
          const dir = best.cont.x > f.cont.x ? 1 : -1;
          if (dir !== f.dir) { f.dir = dir; f.cont.scaleX = dir * Math.abs(f.cont.scaleY || f.sc); }
        }
      }
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

    // Smoke Bomb: a grey cloud that billows around the fighter and thins out over its duration
    smoke(f, dur) {
      const life = dur * 1000 / this.speed;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2, r = 14 + (i % 3) * 8;
        const c = this.add.circle(Math.cos(ang) * r, 4 + Math.sin(ang) * r * 0.7, 16 + (i % 3) * 5, i % 2 ? 0x8a8794 : 0xb6b3bd, 1).setAlpha(0);
        f.cont.add(c);
        this.tweens.add({ targets: c, alpha: 0.45, scale: 1.35, duration: 180 / this.speed, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: c, alpha: 0, scale: 1.9, x: c.x * 1.8, y: c.y - 14, delay: 180 / this.speed, duration: life - 180 / this.speed, ease: 'Sine.easeIn', onComplete: () => c.destroy() });
      }
      this.float(f, 'SMOKE BOMB', '#c9c6d2', 12);
    }

    // A line flashed between two fighters (Guillotine's pull)
    chain(a, b, color) {
      const g = this.track(this.add.graphics());
      g.lineStyle(3, color, 0.9).lineBetween(a.cont.x, a.cont.y, b.cont.x, b.cont.y);
      this.tweens.add({ targets: g, alpha: 0, duration: 380 / this.speed, onComplete: () => g.destroy() });
    }
    // Blood burst: Guillotine executions and Butcher pops
    blood(f, big) {
      const n = big ? 18 : 11;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, dist = (big ? 50 : 34) + Math.random() * 30;
        const d = this.track(this.add.circle(f.cont.x, f.cont.y - 6, 3 + Math.random() * (big ? 5 : 3), i % 3 ? 0xb3241a : 0x7a1410));
        this.tweens.add({ targets: d, x: f.cont.x + Math.cos(ang) * dist, y: f.cont.y - 6 + Math.sin(ang) * dist * 0.6 + 14, alpha: 0, duration: (big ? 700 : 500) / this.speed, ease: 'Cubic.easeOut', onComplete: () => d.destroy() });
      }
      if (big) {
        const pool = this.track(this.add.ellipse(f.cont.x, f.cont.y + 26, 10, 4, 0x7a1410, 0.8));
        this.tweens.add({ targets: pool, scaleX: 7, scaleY: 4, duration: 600 / this.speed, ease: 'Cubic.easeOut' });
        this.float(f, 'EXECUTED', '#ff3b2f', 22);
        this.cameras.main.shake(220 / this.speed, 0.01);
        this.cameras.main.flash(120 / this.speed, 120, 0, 0);
      }
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
      if (e.h) for (const id in e.h) { const f = F[id]; if (f) { [f.hp, f.shield, f.mana] = e.h[id]; if (e.h[id][3]) f.maxHp = e.h[id][3]; } }
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
          if (e.name === 'Night Lord') { this.blood(def, true); this.float(def, 'BLOOD BURST', '#ff4a3a', 15, 22); }
          const ring = this.track(this.add.image(def.cont.x, def.cont.y, 'fx_ring').setTint(0xff8a4c).setScale(0.2));
          this.tweens.add({ targets: ring, scale: 0.8, alpha: 0, duration: 380 / this.speed, onComplete: () => ring.destroy() });
          this.flash(def);
          this.float(def, String(e.amount), '#c9b8ff', 20);
          break;
        }
        case 'dodge': if (att && def) { if (att.m.range === 'melee' || att.m.range === 'reach') this.swing(att); this.float(def, 'DODGE', '#cfe8ff', 14); this.tweens.add({ targets: def, dy: -16, duration: 110 / this.speed, yoyo: true }); } break;
        case 'hidden': if (att && def) { this.swing(att); this.float(def, 'MISS', '#b9a7d9', 13); } break;
        case 'parry': if (def) this.float(def, 'PARRY', '#9fe3ff', 15); break;
        case 'heal': if (att) this.float(att, '+' + e.amount, '#7be07b', 14, -20 * att.dir); break;
        case 'bleed': if (def) this.float(def, String(e.amount), '#d0473a', 12, 18); break;
        case 'stun': if (def) this.float(def, e.secs > 1 ? 'STUNNED ' + e.secs + 's' : 'STUNNED', '#ffd34d', e.secs > 1 ? 15 : 13); break;
        case 'smoke': if (att) this.smoke(att, e.dur || 2); break;
        case 'double': if (att) this.float(att, e.twin ? 'TWIN STRIKE' : 'DOUBLE SHOT', '#8fcf78', 12); break;
        case 'stunblock': if (att) this.float(att, 'STEADFAST', '#ffd84a', 13); break;
        case 'critguard': if (att) this.float(att, 'GUARDED', '#ffd84a', 12); break;
        case 'sear': if (def) this.float(def, 'SEARED', '#ff9a3c', 12); break;
        case 'root': if (def) {
          // Exile's Banish: a violet hex circle under the target while it's rooted
          this.float(def, e.slam ? 'BANISHED' : 'ROOTED', '#c08cff', 15);
          const delay = (e.delay || 0) * 1000 / this.speed, life = (e.secs || 1) * 1000 / this.speed;
          const hex = this.add.graphics();
          hex.lineStyle(3, 0xb07cff, 0.95);
          const pts = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; pts.push({ x: Math.cos(a) * 30, y: Math.sin(a) * 12 + 22 }); }
          hex.strokePoints(pts, true);
          hex.lineStyle(1.5, 0xe2ccff, 0.8).strokeEllipse(0, 22, 44, 16);
          hex.fillStyle(0x8a5cff, 0.25).fillPoints(pts, true);
          hex.setAlpha(0);
          def.cont.addAt(hex, 0);
          this.tweens.add({ targets: hex, alpha: 1, delay, duration: 120 / this.speed });
          this.tweens.add({ targets: hex, alpha: 0.45, yoyo: true, repeat: -1, delay: delay + 120 / this.speed, duration: 220 / this.speed });
          this.time.delayedCall(delay + life, () => { if (hex.scene) hex.destroy(); });
        } break;
        case 'steal': if (att) this.float(att, `-${e.amount}g`, '#f2c14a', 13); break;
        case 'cheap_ready': break;
        case 'escape':
          if (att) {
            att.gone = true; this.float(att, `ESCAPED +${e.amount}g`, '#f2c14a', 13);
            this.tweens.add({ targets: [att.cont], x: W + 60, alpha: 0, duration: 600 / this.speed });
          }
          break;
        case 'revive': if (att) {
          this.float(att, e.hatch ? 'HATCHED' : 'REBORN', '#ff8a4c', 20); att.cont.setAlpha(1); att.cont.angle = 0; att.dead = false;
          if (att.egg) { att.egg = false; att.tint = att.tint0; this.tweens.add({ targets: att.cont, scaleY: att.sc, duration: 200 / this.speed }); }
          if (att.tint) att.body.setTint(att.tint); else att.body.clearTint();
        } break;
        case 'egg': if (att) {
          att.egg = true; att.tint0 = att.tint; att.tint = 0xffc070; att.body.setTint(0xffc070);
          this.float(att, 'EGG ' + e.secs + 's', '#ffc070', 18);
          this.tweens.add({ targets: att.cont, scaleY: att.sc * 0.8, duration: 200 / this.speed });
        } break;
        case 'poison': if (def) this.float(def, '+' + e.amount + ' POISON', '#8fdc5a', 12, -22); break;
        case 'chill': if (def) this.float(def, 'CHILL ' + e.stacks, '#a8dcff', 12); break;
        case 'freeze': if (def) { this.float(def, 'FROZEN', '#bfe8ff', 18); this.iceShard(def, e.secs || 2); } break;
        case 'mire': if (def) this.float(def, 'MIRED ' + e.stacks, '#a89a5a', 12); break;
        case 'raise': if (att) { this.float(att, 'RAISE DEAD', '#9ff4ff', 18); this.cameras.main.shake(160 / this.speed, 0.004); } break;
        case 'burst': if (att) {
          const ring = this.track(this.add.image(att.cont.x, att.cont.y, 'fx_ring').setTint(0xff7a2c).setScale(0.3));
          this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 650 / this.speed, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
          this.cameras.main.shake(220 / this.speed, 0.008);
        } break;
        case 'burn': if (def) this.float(def, String(e.amount), e.poison ? '#8fdc5a' : '#ff9a3c', 13, -18); break;
        case 'mark': if (def) { this.float(def, 'MARKED', '#c06cff', 15); def.body.setTint(0xc8a0ff); this.time.delayedCall(3000 / this.speed, () => { if (def.body.active && !def.dead) { if (def.tint) def.body.setTint(def.tint); else def.body.clearTint(); } }); } break;
        case 'bash': if (def) { this.float(def, 'SHIELD BASH', '#f0d27a', 14); this.cameras.main.shake(80 / this.speed, 0.003); } break;
        case 'palburst': if (att) { this.float(att, 'HOLY BURST', '#f0d27a', 16); const r = this.track(this.add.image(att.cont.x, att.cont.y, 'fx_ring').setTint(0xf0d27a).setScale(0.3)); this.tweens.add({ targets: r, scale: 2.4, alpha: 0, duration: 520 / this.speed, onComplete: () => r.destroy() }); } break;
        case 'kite': if (att) this.float(att, 'KITE', '#8fcf78', 12); break;
        case 'thorns': if (def) this.float(def, String(e.amount), '#c9a26b', 12, 14); break;
        case 'undying': if (att) this.float(att, 'UNDYING', '#ff5b4a', 16); break;
        case 'stealth_on': if (att) { this.tweens.add({ targets: att.cont, alpha: 0.22, duration: 160 / this.speed }); if (e.label) this.float(att, e.label === 'Night Lord' ? 'NIGHT LORD' : e.label === 'Fade' ? 'FADE' : 'VANISH', '#b9a7d9', 14); } break;
        case 'stealth_off': if (att) this.tweens.add({ targets: att.cont, alpha: 1, duration: 160 / this.speed }); break;
        case 'death':
          if (def) { def.dead = true; def.body.setTint(0x555555); this.tweens.add({ targets: def.cont, alpha: 0.35, angle: def.dir * 80, duration: 450 / this.speed }); }
          break;
        case 'timeout': { const a = F.a; if (a) this.float(a, 'TIME', '#ece3d6', 16); break; }
        // ---------- v0.1: hybrids and artifacts ----------
        case 'fxhit': if (def) { this.flash(def); this.float(def, String(e.amount), FX_COLORS[e.name] || '#ffb36b', 15, 14); } break;
        case 'beam': if (att && def) { att.beamTo = def; att.beamPower = e.power; } break;
        case 'stomp': if (att) {
          const ring = this.track(this.add.image(att.cont.x, att.cont.y + 20, 'fx_ring').setTint(0xc9a26b).setScale(0.3, 0.12));
          this.tweens.add({ targets: ring, scaleX: 3.4, scaleY: 1.2, alpha: 0, duration: 520 / this.speed, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
          this.cameras.main.shake(160 / this.speed, 0.006); this.float(att, 'STOMP', '#e7c38a', 14);
        } break;
        case 'pulse': if (att) {
          const ring = this.track(this.add.image(att.cont.x, att.cont.y, 'fx_ring').setTint(0x9fc4ff).setScale(0.4).setAlpha(0.8));
          this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 450 / this.speed, onComplete: () => ring.destroy() });
        } break;
        case 'frenzy': if (att) this.float(att, 'FRENZY', '#8fcf78', 13); break;
        case 'firering': this.ring = { start: e.start, closed: e.closed }; break;
        case 'shove': if (def) this.float(def, 'SHOVED', '#d9c7a6', 12); break;
        case 'pull': if (att && def) { this.float(def, 'PULLED', '#e0645a', 14); this.chain(att, def, 0xb8b0a6); } break;
        case 'knock': if (def) this.float(def, e.slam ? 'WALL SLAM' : 'KNOCKBACK', e.slam ? '#ffd34d' : '#cfe8ff', e.slam ? 15 : 12); if (e.slam) this.cameras.main.shake(120 / this.speed, 0.005); break;
        case 'blink': if (att) {
          const puff = this.track(this.add.image(att.cont.x, att.cont.y, 'fx_ring').setTint(0x8e9ab8).setScale(0.6).setAlpha(0.8));
          this.tweens.add({ targets: puff, scale: 0.1, alpha: 0, duration: 260 / this.speed, onComplete: () => puff.destroy() });
          this.float(att, 'BLINK', '#c8a2ff', 14);
        } break;
        case 'execute': if (def) this.blood(def, true); break;
        case 'pop': if (def) { this.blood(def, false); this.float(def, 'BUTCHERED', '#ff4a3a', 16); } break;
        case 'block': if (att) this.float(att, 'BLOCKED', '#f0d27a', 15); break;
        case 'drain': if (def && e.amount) this.float(def, `−${e.amount} MAX`, '#9b7bff', 11, -16); break;
        case 'penance': if (att) this.float(att, 'PENANCE', '#f0d27a', 14); break;
        case 'sunder': if (def) this.float(def, 'SUNDERED', '#a996ff', 13); break;
        case 'hex': if (def) this.float(def, 'HEX ' + e.stacks, '#c08cff', 12); break;
        case 'shrug': if (att) this.float(att, 'UNBOUND +' + e.amount, '#f0d27a', 13); break;
        case 'sentinel': if (att) { this.float(att, 'SHIELD BURST', '#9fc4ff', 14); this.cameras.main.shake(100 / this.speed, 0.004); } break;
        case 'shieldup': if (att) this.float(att, 'SHIELD +' + e.amount, '#9fc4ff', 12); break;
      }
      if (this.cfg.onEvent) this.cfg.onEvent(e);
    }

    // Sound for an event: weapon sounds for heroes, claws and thuds for monsters, spells by name
    playSfx(e, att, def) {
      if (this.arenaOwner && this.arenaOwner.muted) return;   // the watch window plays silently
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
        case 'stealth_on': case 'smoke': S.play('stealth'); break;
        case 'stomp': S.play('thud'); break;
        case 'pulse': S.play('shield', 0.3); break;
        case 'blink': S.play('cheap'); break;
        case 'execute': S.play('explode'); S.play('death', 0.1); break;
        case 'pop': S.play('chop'); break;
        case 'block': S.play('clang'); break;
        case 'knock': S.play(e.slam ? 'thud' : 'dodge'); break;
        case 'pull': case 'shove': S.play('kite'); break;
        case 'sunder': case 'hex': S.play('arcane', 0.3); break;
        case 'frenzy': S.play('double', 0.3); break;
        case 'sentinel': S.play('shield'); break;
        case 'beam': S.play('zap', 0.9); break;
        case 'fxhit': if (e.name === 'Inferno') S.play('bleed', 0.4); break;
        case 'double': S.play('double'); break;
        case 'kite': S.play('kite'); break;
        case 'burst': S.play('explode'); break;
        case 'revive': S.play('revive'); break;
        case 'egg': S.play('shield'); break;
        case 'freeze': S.play('stun'); break;
        case 'raise': S.play('arcane', 0.4); break;
        case 'undying': S.play('revive'); break;
        case 'death': S.play('death', 0.12); break;
        case 'bleed': case 'burn': S.play('bleed', 0.3); break;
        case 'steal': S.play('coin', 0.2); break;
      }
    }

    drawBar(f) {
      if (f.gone) { f.bar.clear(); f.name.setVisible(false); return; }
      // An enemy on the hero's lane (1v1 fights) shows its name and bar below, so labels never overlap
      const below = ((f.side === 'b') !== !!this.cfg.mirror) && f.y === 200;
      const w = 64, h = 6, x = f.cont.x - w / 2, y = below ? f.y + 34 * f.sc + 14 : f.y - 42 * f.sc;
      f.bar.clear();
      if (f.dead) { f.name.setPosition(f.cont.x, below ? y + 12 : y - 10).setAlpha(0.4); return; }
      f.bar.fillStyle(0x0d0b09, 0.85).fillRect(x - 1, y - 1, w + 2, h + 2);
      f.bar.fillStyle((f.side === 'a') !== !!this.cfg.mirror ? 0x6cc35f : 0xc4473a).fillRect(x, y, w * Math.max(0, f.hp / f.maxHp), h);
      let yy = y + h + 1;
      if (f.shield > 0) { f.bar.fillStyle(0x9fc4ff).fillRect(x, yy, w * Math.min(1, f.shield / f.maxShield), 3); yy += 4; }
      if (f.hasMana) { f.bar.fillStyle(0x0d0b09, 0.85).fillRect(x - 1, yy - 1, w + 2, 5); f.bar.fillStyle(0x6f7dff).fillRect(x, yy, w * Math.min(1, f.mana / 100), 3); }
      f.name.setPosition(f.cont.x, below ? yy + 12 : y - 10);
    }

    update(_, delta) {
      if (!this.cfg || this.finished) return;
      if (this.t >= G.CONFIG.combat.fastAfter && this.speed !== 2) { this.speed = 2; if (this.arenaOwner && this.arenaOwner.onSpeed) this.arenaOwner.onSpeed(2); }
      const nowMs = performance.now();
      const d = this.lastNow ? Math.min(250, nowMs - this.lastNow) : delta;
      this.lastNow = nowMs;
      this.t += (d / 1000) * this.speed;
      const E = this.cfg.result.events;
      while (this.idx < E.length && E[this.idx].t <= this.t) { this.apply(E[this.idx]); this.idx++; }
      for (const id in this.F) { const f = this.F[id]; this.placeFighter(f); this.drawBar(f); }
      this.drawEffects();
      const end = E.length ? E[E.length - 1].t : 0;
      if (this.idx >= E.length && this.t > end + 1.1) this.finish();
    }

    // Continuous effects: the Heartlight beam and the Inferno fire ring
    drawEffects() {
      if (!this.fxg) this.fxg = this.track(this.add.graphics().setDepth(5));
      const g = this.fxg; g.clear();
      for (const id in this.F) {
        const f = this.F[id];
        if (!f.beamTo || f.dead || f.beamTo.dead || f.gone) continue;
        const w = 2 + Math.min(f.beamPower || 2, 24) * 0.5, x1 = f.cont.x, y1 = f.cont.y - 8, x2 = f.beamTo.cont.x, y2 = f.beamTo.cont.y - 8;
        const flick = 0.75 + Math.random() * 0.25;
        g.lineStyle(w + 6, 0xa996ff, 0.18 * flick).lineBetween(x1, y1, x2, y2);
        g.lineStyle(w, 0xd9ccff, 0.85 * flick).lineBetween(x1, y1, x2, y2);
        g.fillStyle(0xffffff, 0.8).fillCircle(x2, y2, w * 0.9);
      }
      if (this.ring && this.t >= this.ring.start) {
        const p = Math.min(1, (this.t - this.ring.start) / (this.ring.closed - this.ring.start));
        const L = X0 + -G.CONFIG.combat.kiteEdge * STEP, R = X0 + (G.CONFIG.combat.startGap + G.CONFIG.combat.kiteEdge) * STEP, mid = (L + R) / 2;
        const lo = L + p * (mid - L), hi = R - p * (R - mid);
        for (const [a, b] of [[0, lo], [hi, W]]) {
          if (b - a <= 0) continue;
          g.fillStyle(0xff6a1a, 0.22).fillRect(a, 70, b - a, H - 140);
          for (let i = 0; i < 7; i++) {
            const x = (i % 2 ? b : a) + (i % 2 ? -1 : 1) * Math.random() * 10, y = 80 + i * 32 + Math.random() * 8;
            if (x < a - 1 || x > b + 1) continue;
            g.fillStyle(i % 3 ? 0xff9a3c : 0xffd27a, 0.7).fillTriangle(x - 7, y + 14, x + 7, y + 14, x, y - 8 - Math.random() * 10);
          }
          g.lineStyle(3, 0xffb347, 0.8).lineBetween(a === 0 ? b : a, 70, a === 0 ? b : a, H - 70);
        }
      }
    }

    // Frost Yeti: an ice shard closes around the frozen fighter, then shatters
    iceShard(f, secs) {
      const x = f.cont.x, y = f.cont.y, g = this.track(this.add.graphics().setDepth(f.cont.depth + 1));
      const spikes = [[-26, 22, -14, -34, -2, 22], [-10, 24, 4, -46, 16, 24], [6, 22, 22, -30, 30, 22], [-30, 20, -34, -8, -16, 20], [18, 20, 36, -10, 32, 20]];
      g.fillStyle(0xbfe8ff, 0.55); g.lineStyle(2, 0xeaf8ff, 0.95);
      for (const [x1, y1, x2, y2, x3, y3] of spikes) { g.fillTriangle(x1, y1, x2, y2, x3, y3); g.strokeTriangle(x1, y1, x2, y2, x3, y3); }
      g.fillStyle(0x9fdcff, 0.28).fillEllipse(0, 4, 70, 56);
      g.lineStyle(1, 0xffffff, 0.8).lineBetween(-8, -20, -4, 10).lineBetween(14, -14, 10, 8);
      g.setPosition(x, y).setScale(0.2).setAlpha(0);
      if (f.body) f.body.setTint(0x9fdcff);
      this.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 160 / this.speed, ease: 'Back.easeOut' });
      this.time.delayedCall(secs * 1000 / this.speed, () => {
        if (!g.active) return;
        if (f.body && f.body.active && !f.dead) { if (f.tint) f.body.setTint(f.tint); else f.body.clearTint(); }
        for (let i = 0; i < 6; i++) {
          const sh = this.track(this.add.triangle(x, y, 0, 8, 4, -8, 8, 8, 0xd8f2ff).setDepth(g.depth));
          const ang = i / 6 * Math.PI * 2;
          this.tweens.add({ targets: sh, x: x + Math.cos(ang) * 40, y: y + Math.sin(ang) * 30, angle: 180, alpha: 0, duration: 380 / this.speed, onComplete: () => sh.destroy() });
        }
        g.destroy();
      });
    }

    // Stop playing (the fight screen went away)
    halt() {
      for (const o of this.objs) o.destroy();
      this.objs = []; this.fxg = null; this.ring = null; this.cfg = null; this.F = {};
      this.tweens.killAll(); this.time.removeAllEvents();
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
      const owner = this.game.__owner;
      owner._scene = this;
      if (owner._vis) this.draw(owner._vis);
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
  // Each preview is its own small canvas game: one for you, one for the rival on the duel screen
  function makePreview() {
    return {
      game: null, _scene: null, _vis: null,
      mount(el, vis) {
        this._vis = vis;
        if (!this.game) {
          this.game = new Phaser.Game({ type: Phaser.WEBGL, parent: el, width: PW, height: PH, transparent: true,
            scale: { mode: Phaser.Scale.NONE }, scene: [PreviewScene], banner: false, audio: { noAudio: true } });
          this.game.__owner = this;
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
  }
  G.Preview = makePreview();
  G.RivalPreview = makePreview();

  // A fresh arena game for every fight (a canvas moved around the page could go black until you scrolled).
  // Its WebGL context is released right away when the fight ends, so they never pile up: too many open
  // contexts made the browser drop the oldest one, which was the character portrait.
  function makeArena(opts = {}) {
    return {
      game: null, _scene: null, _pending: null, onSpeed: null, muted: !!opts.muted,
      start(el, cfg) {
        this.stop();
        this._pending = cfg;
        this.game = new Phaser.Game({
          type: Phaser.AUTO, parent: el, width: W, height: H, backgroundColor: '#15120f',
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
          scene: [ArenaScene], banner: false, audio: { noAudio: true },
        });
        this.game.__owner = this;
        this.game.__cfg = cfg;
      },
      stop() {
        const g = this.game;
        this._scene = null; this._pending = null; this.game = null;
        if (!g) return;
        const gl = g.renderer && g.renderer.gl;
        const canvas = g.canvas;
        g.destroy(true);
        setTimeout(() => {
          try { const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* already gone */ }
          if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        }, 50);
      },
    };
  }
  G.Arena = makeArena();
  // A second arena for the watch window, so watching never touches your own fight
  G.WatchArena = makeArena({ muted: true });
})(window.G);
