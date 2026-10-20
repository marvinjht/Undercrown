// Sound effects, made in code with the Web Audio API so there are no files to manage.
// To use real sounds instead, put a file path in G.ASSETS.sounds (assets/manifest.js) under the same name.
window.G = window.G || {};

(function (G) {
  let ctx = null, master = null, noiseBuf = null;
  const last = {};
  let muted = false;
  try { muted = localStorage.getItem('td-muted') === '1'; } catch (e) { /* storage blocked: default on */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // ---------- Building blocks ----------
  function env(g, t0, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone({ type = 'sine', f0, f1, dur = 0.15, vol = 0.4, delay = 0, a = 0.005 }) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, a, vol, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise({ dur = 0.15, vol = 0.4, delay = 0, type = 'bandpass', f0 = 1200, f1, q = 1, a = 0.004 }) {
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t0);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); env(g, t0, a, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }

  // A brass-like note: two detuned saws through a lowpass that opens on the attack, with a little vibrato
  function brass(f, delay, dur, vol = 0.12) {
    const t0 = ctx.currentTime + delay;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2;
    fl.frequency.setValueAtTime(f * 1.5, t0); fl.frequency.exponentialRampToValueAtTime(f * 6, t0 + 0.06); fl.frequency.exponentialRampToValueAtTime(f * 3, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
    g.gain.setValueAtTime(vol, t0 + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = f * 0.006; lfo.connect(lg);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t0); o.detune.value = det;
      lg.connect(o.frequency); o.connect(fl); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    fl.connect(g); g.connect(master);
  }

  // ---------- The sounds ----------
  const SFX = {
    slash:  () => { noise({ f0: 2600, f1: 900, q: 0.8, dur: 0.12, vol: 0.35 }); tone({ type: 'triangle', f0: 1400, f1: 700, dur: 0.06, vol: 0.06, delay: 0.05 }); },
    chop:   () => { noise({ f0: 1400, f1: 400, q: 0.9, dur: 0.16, vol: 0.4 }); tone({ type: 'square', f0: 160, f1: 80, dur: 0.1, vol: 0.12, delay: 0.06 }); },
    thud:   () => { tone({ type: 'sine', f0: 140, f1: 45, dur: 0.22, vol: 0.6 }); noise({ type: 'lowpass', f0: 500, dur: 0.12, vol: 0.35 }); },
    clang:  () => { tone({ type: 'triangle', f0: 920, dur: 0.25, vol: 0.12 }); tone({ type: 'triangle', f0: 1380, dur: 0.18, vol: 0.08 }); noise({ f0: 3000, q: 2, dur: 0.06, vol: 0.2 }); },
    bow:    () => { tone({ type: 'triangle', f0: 220, f1: 140, dur: 0.12, vol: 0.25 }); noise({ type: 'highpass', f0: 2500, dur: 0.14, vol: 0.12, delay: 0.03 }); },
    zap:    () => { tone({ type: 'sawtooth', f0: 900, f1: 1800, dur: 0.09, vol: 0.08 }); tone({ type: 'sine', f0: 600, f1: 1200, dur: 0.12, vol: 0.12 }); },
    claw:   () => { noise({ f0: 1800, f1: 700, q: 1.2, dur: 0.09, vol: 0.22 }); },
    hurt:   () => { tone({ type: 'sine', f0: 110, f1: 60, dur: 0.12, vol: 0.35 }); },
    crit:   () => { tone({ type: 'square', f0: 1200, f1: 1600, dur: 0.07, vol: 0.06 }); tone({ type: 'sine', f0: 180, f1: 60, dur: 0.18, vol: 0.4 }); },
    firebolt: () => { noise({ type: 'lowpass', f0: 600, f1: 2400, dur: 0.3, vol: 0.4 }); tone({ type: 'sawtooth', f0: 220, f1: 440, dur: 0.25, vol: 0.06 }); },
    meteor: () => { noise({ type: 'lowpass', f0: 3000, f1: 200, dur: 0.6, vol: 0.5, a: 0.02 }); tone({ type: 'sine', f0: 90, f1: 30, dur: 0.7, vol: 0.6, delay: 0.25 }); },
    arcane: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.25, vol: 0.09, delay: i * 0.04 })); noise({ f0: 4000, q: 4, dur: 0.3, vol: 0.06 }); },
    heal:   () => { tone({ type: 'sine', f0: 880, dur: 0.16, vol: 0.07 }); tone({ type: 'sine', f0: 1320, dur: 0.2, vol: 0.05, delay: 0.05 }); },
    shield: () => { tone({ type: 'triangle', f0: 400, f1: 300, dur: 0.12, vol: 0.12 }); noise({ f0: 900, q: 3, dur: 0.08, vol: 0.12 }); },
    dodge:  () => { noise({ type: 'highpass', f0: 1500, f1: 4000, dur: 0.12, vol: 0.12 }); },
    parry:  () => { SFX.clang(); },
    stun:   () => { tone({ type: 'square', f0: 660, f1: 330, dur: 0.12, vol: 0.06 }); tone({ type: 'square', f0: 990, f1: 495, dur: 0.12, vol: 0.04, delay: 0.08 }); },
    cheap:  () => { noise({ f0: 3000, f1: 1500, q: 2, dur: 0.06, vol: 0.22 }); tone({ type: 'triangle', f0: 300, f1: 1200, dur: 0.1, vol: 0.1 }); },
    stealth: () => { noise({ type: 'lowpass', f0: 1500, f1: 200, dur: 0.4, vol: 0.12, a: 0.05 }); },
    double: () => { SFX.bow(); setTimeout(() => ctx && SFX.bow(), 70); },
    kite:   () => { noise({ type: 'bandpass', f0: 800, f1: 300, dur: 0.15, vol: 0.12 }); },
    bleed:  () => { tone({ type: 'sine', f0: 300, f1: 200, dur: 0.06, vol: 0.05 }); },
    explode: () => { noise({ type: 'lowpass', f0: 2000, f1: 80, dur: 0.9, vol: 0.7, a: 0.01 }); tone({ type: 'sine', f0: 70, f1: 25, dur: 0.9, vol: 0.7 }); },
    revive: () => { [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.1, delay: i * 0.07 })); },
    death:  () => { tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.45, vol: 0.12 }); noise({ type: 'lowpass', f0: 600, f1: 100, dur: 0.35, vol: 0.2 }); },
    levelup: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: i === 4 ? 0.6 : 0.18, vol: 0.14, delay: i * 0.09 })); tone({ type: 'sine', f0: 1568, dur: 0.6, vol: 0.06, delay: 0.45 }); },
    coin:   () => { tone({ type: 'square', f0: 988, dur: 0.06, vol: 0.05 }); tone({ type: 'square', f0: 1319, dur: 0.18, vol: 0.05, delay: 0.06 }); },
    // Tournament round: a short gladiator trumpet call (G C E G, then a held high C)
    fanfare: () => {
      const n = [[392, 0, 0.16], [523, 0.17, 0.16], [659, 0.34, 0.16], [784, 0.51, 0.3], [659, 0.83, 0.14], [784, 0.98, 0.14], [1047, 1.13, 0.75]];
      for (const [f, d, l] of n) { brass(f, d, l); brass(f / 2, d, l, 0.06); }
      noise({ type: 'lowpass', f0: 300, dur: 0.5, vol: 0.25, delay: 1.13 });
      tone({ type: 'sine', f0: 70, f1: 45, dur: 0.6, vol: 0.4, delay: 1.13 });
    },
    heart:  () => { tone({ type: 'sine', f0: 160, f1: 60, dur: 0.5, vol: 0.4 }); tone({ type: 'sine', f0: 120, f1: 50, dur: 0.5, vol: 0.3, delay: 0.25 }); },
  };

  // Which sound each weapon makes when it hits
  const WEAPON_SFX = {
    daggers: 'slash', saber: 'slash', longsword: 'slash', swordShield: 'clang',
    greatAxe: 'chop', greatHammer: 'thud', mace: 'thud', maceShield: 'thud',
    shortbow: 'bow', longbow: 'bow', wandFocus: 'zap', staff: 'zap',
  };
  const SPELL_SFX = { Firebolt: 'firebolt', Meteor: 'meteor', 'Arcane Blast': 'arcane' };

  const files = {};
  function playFile(name, path) {
    try {
      const a = files[name] || (files[name] = new Audio(path));
      const c = a.cloneNode(); c.volume = 0.6; c.play().catch(() => {});
    } catch (e) { /* ignore */ }
  }

  G.Sound = {
    WEAPON_SFX, SPELL_SFX,
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('td-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (!muted) { ensure(); this.play('coin'); }
      return muted;
    },
    unlock() { if (!muted) ensure(); },
    // gap: the same sound won't repeat faster than this (keeps fast fights from turning into noise)
    play(name, gap = 0.06) {
      if (muted || !SFX[name]) return;
      const path = G.ASSETS && G.ASSETS.sounds && G.ASSETS.sounds[name];
      const now = performance.now() / 1000;
      if (last[name] && now - last[name] < gap) return;
      last[name] = now;
      if (path) { playFile(name, path); return; }
      if (!ensure()) return;
      try { SFX[name](); } catch (e) { /* audio hiccups never break the game */ }
    },
  };
})(window.G);
