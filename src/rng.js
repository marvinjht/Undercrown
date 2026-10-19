// Seeded random numbers, so a run can be replayed from its seed (needed later for multiplayer).
window.G = window.G || {};

(function (G) {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class RNG {
    constructor(seed) { this.seed = seed >>> 0; this.next = mulberry32(this.seed); }
    float() { return this.next(); }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    // entries: [[value, weight], ...]
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) return entries[0][0];
      let r = this.next() * total;
      for (const [v, w] of entries) {
        if (w <= 0) continue;
        r -= w;
        if (r < 0) return v;
      }
      return entries[entries.length - 1][0];
    }
    fork() { return new RNG(Math.floor(this.next() * 4294967296)); }
  }

  G.RNG = RNG;
  G.newSeed = () => Math.floor(Math.random() * 4294967296);
  let uid = 0;
  G.uid = (p = 'id') => p + '_' + (++uid).toString(36);
})(window.G);
