// Relics: build effects you collect instead of wearing. They sit in your relic row, never use bag space,
// and stack up to max copies; each copy strengthens the effect by a fixed step.
// fx(n) = the effect keys at n copies (read by stats.js and combat.js). text(n) = what n copies do.
window.G = window.G || {};

G.RELICS = {
  warlord:  { name: 'Warlord',      color: '#e0645a', fx: n => ({ perWarriorDmg: n + 1 }),
    text: n => `+${n + 1} Damage for each Warrior piece you wear` },
  hawkeye:  { name: 'Hawkeye',      color: '#86d873', fx: n => ({ perArcherPierce: n }),
    text: n => `+${n} Pierce for each Archer piece you wear` },
  rending:  { name: 'Rending',      color: '#d0473a', fx: n => ({ bleedShred: 2 * n }),
    text: n => `Your bleed also lowers the target’s Armor by ${2 * n}` },
  bloodied: { name: 'Bloodied',     color: '#ff7a66', fx: n => ({ critHeal: 4 * n }),
    text: n => `Crits heal you ${4 * n}` },
  primed:   { name: 'Primed',       color: '#a996ff', fx: n => ({ openingSpell: 1, primedMana: 30 * (n - 1) }),
    text: n => `Your first spell goes off at the start of each fight${n > 1 ? `, then you start refilling from ${30 * (n - 1)} mana` : ''}` },
  concuss:  { name: 'Concussive',   color: '#f0d27a', fx: n => ({ fourthStun: 5 - n }),
    text: n => `Every ${['', '4th', '3rd', '2nd'][n]} hit stuns (the stun limit still applies)` },
  counter:  { name: 'Counterpoise', color: '#8e9ab8', fx: n => ({ afterDodge: 8 * n }),
    text: n => `After you dodge, your next hit deals +${8 * n}` },
  bastion:  { name: 'Bastion',      color: '#9fc4ff', fx: n => ({ shieldSpd: 2 * n }),
    text: n => `While your Shield holds, +${2 * n} Attack Speed` },
};
G.RELIC_ORDER = Object.keys(G.RELICS);
G.RELIC_MAX = 3;
