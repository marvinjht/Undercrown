// Items that go in the 3-slot bag. Used between fights (tap → Use).
// heal = health restored, cure = clears poison, buff = stats added to your next fight only.
// weight = how often it rolls; ramp = the weight climbs to ramp.weight by ramp.room (from minRoom).
window.G = window.G || {};

G.CONSUMABLES = {
  potion:  { name: 'Health Potion',         heal: 30,  price: 25, weight: 30, desc: 'Heal 30.' },
  greater: { name: 'Greater Health Potion', heal: 60,  price: 54, weight: 12, minRoom: 15, desc: 'Heal 60.' },
  antidote:{ name: 'Antidote',              cure: true, price: 20, weight: 18, desc: 'Clear all poison.' },
  iron:    { name: 'Elixir of Iron',        buff: { armor: 6 }, price: 24, weight: 9, desc: '+6 Armor next fight.' },
  salve:   { name: 'Ward Salve',            buff: { ward: 6 },  price: 24, weight: 9, desc: '+6 Magic Resist next fight.' },
  fury:    { name: 'Elixir of Fury',        buff: { dmg: 6 },   price: 24, weight: 9, desc: '+6 Damage next fight.' },
  tonic:   { name: 'Swift Tonic',           buff: { spd: 4 },   price: 24, weight: 9, desc: '+4 Attack Speed next fight.' },
  tome:    { name: 'Tome of Knowledge',     xp: 15, price: 45, weight: 10, desc: 'Gain 15 XP.' },
  dye:     { name: 'Turncoat’s Dye',        dye: true, price: 50, weight: 2.5, minRoom: 10, ramp: { weight: 13, room: 25 },
    desc: 'Change the class tag on one piece of your gear, artifacts included.' },   // weight grows from 2.5 at room 10 to 13 at room 25 (about 2% → 10% of rolls)
  draught: { name: 'Arcane Draught',        buff: { fullMana: 1 }, price: 24, weight: 6, desc: 'Start next fight at full mana (needs a spell).' },
};
G.BUFF_IDS = ['iron', 'salve', 'fury', 'tonic', 'draught'];
