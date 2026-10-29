// Relics: things scavenged from the dungeon that you carry instead of wear. They sit in your relic row,
// never use bag space, and stack up to max copies; each copy strengthens the effect by a fixed step.
// fx(n) = the effect keys at n copies (read by stats.js and combat.js). text(n) = what n copies do.
window.G = window.G || {};

G.RELICS = {
  knuckle:  { name: 'Giant’s Knucklebone', color: '#d9c8a0', fx: n => ({ bigDmg: 15 * n }),
    text: n => `+${15 * n}% damage to bosses and elites` },
  snare:    { name: 'Poacher’s Snare',     color: '#b0a070', fx: n => ({ freshDmg: 20 * n }),
    text: n => `+${20 * n}% damage to enemies above 80% health` },
  spade:    { name: 'Gravedigger’s Spade', color: '#8e8778', fx: n => ({ lowDmg: 20 * n }),
    text: n => `+${20 * n}% damage to enemies below 30% health` },
  gauze:    { name: 'Bloody Gauze',        color: '#c8483c', fx: n => ({ gauze: 10 * n }),
    text: n => `2 seconds after you take damage, heal ${10 * n} (at most once every 3 seconds)` },
  leeches:  { name: 'Jar of Fat Leeches',  color: '#ff7a66', fx: n => ({ critHeal: 4 * n }),
    text: n => `Crits heal you ${4 * n}` },
  rending:  { name: 'Flayer’s Hook',       color: '#d0473a', fx: n => ({ bleedShred: 2 * n }),
    text: n => `Your bleed also lowers the target’s Armor by ${2 * n}` },
  primed:   { name: 'Witch’s Finger',      color: '#a996ff', fx: n => ({ openingSpell: 1, primedMana: 30 * (n - 1) }),
    text: n => `Your first spell goes off at the start of each fight${n > 1 ? `, then you start refilling from ${30 * (n - 1)} mana` : ''}` },
  concuss:  { name: 'Tolling Bell',        color: '#f0d27a', fx: n => ({ fourthStun: 5 - n }),
    text: n => `Every ${['', '4th', '3rd', '2nd'][n]} hit stuns (the stun limit still applies)` },
  counter:  { name: 'Fox Tail',            color: '#e0965a', fx: n => ({ afterDodge: 8 * n }),
    text: n => `After you dodge, your next hit deals +${8 * n}` },
  bastion:  { name: 'Rampart Sigil',       color: '#9fc4ff', fx: n => ({ shieldSpd: 2 * n }),
    text: n => `While your Shield holds, +${2 * n} Attack Speed` },
  ratpaw:   { name: 'Twitching Rat Paw',   color: '#c9a0a0', fx: n => ({ relicSpd: 2 * n }),
    text: n => `+${2 * n} Attack Speed (counts toward the Attack Speed cap)` },
  tortoise: { name: 'Tortoise Shell',      color: '#7fb07a', fx: n => ({ hpShieldPct: 5 * n }),
    text: n => `Start each fight with a Shield equal to ${5 * n}% of your max health` },
  salt:     { name: 'Grave Salt',          color: '#d8d2c4', fx: n => ({ leechCut: Math.min(4, n + 1) }),
    text: n => `Enemies you fight get ${Math.min(4, n + 1)} less Life on Hit (2 for the first copy, +1 for each more, up to 4)` },
  journal:  { name: 'Dead Man’s Journal',  color: '#c8b48a', fx: n => ({ xpBonus: 4 * n }),
    text: n => `Whenever you gain XP, gain ${4 * n} more` },
};
G.RELIC_ORDER = Object.keys(G.RELICS);
G.RELIC_MAX = 3;
