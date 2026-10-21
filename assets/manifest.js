// ASSET MANIFEST
// Every piece of art the game uses has a key here.
//   null           -> the game draws built-in placeholder art
//   'assets/x.png' -> the game loads your image instead
// To swap in your own art: drop a PNG into the assets folder and put its path next to the key.
// Recommended sizes (transparent PNG):
//   hero_*, monster_*  : 64x64, top-down, facing RIGHT (bosses can be 96x96)
//   weapon_*           : 64x64, handle on the LEFT edge, pointing RIGHT
//   proj_*             : arrow 32x8, bolt 20x20 (drawn pointing right)
//   floor              : 64x64, seamless tile
//   icon_*             : 64x64 (menus, tooltips, gear panel, bag)
window.G = window.G || {};

G.ASSETS = {
  sprites: {
    // Hero looks: plain, and one per class (used once you wear 3+ pieces of that class)
    hero: null, hero_warrior: null, hero_mage: null, hero_archer: null, hero_paladin: null, hero_rogue: null,
    trim_ring: null,   // ring tinted with your hybrid partner class's color
    floor: null,

    weapon_daggers: null, weapon_saber: null, weapon_swordShield: null, weapon_longsword: null,
    weapon_greatAxe: null, weapon_greatHammer: null, weapon_mace: null, weapon_maceShield: null,
    weapon_shortbow: null, weapon_longbow: null, weapon_wandFocus: null, weapon_staff: null,

    proj_arrow: null, proj_bolt: null, fx_ring: null,

    monster_rat: null, monster_slime: null, monster_slimeElite: null, monster_wolf: null, monster_skeleton: null, monster_goblin: null,
    monster_thief: null, monster_orc: null, monster_golem: null, monster_wraith: null, monster_troll: null,
    monster_ogre: null, monster_cultist: null,
    monster_boneKing: null, monster_gorehorn: null, monster_warden: null,
    monster_snake: null, monster_skeletonArcher: null, monster_hydra: null, monster_ghoul: null,
    monster_yeti: null, monster_wraithKing: null, monster_alphaWolf: null, monster_mire: null,
  },

  icons: {
    icon_weapon: null, icon_helmet: null, icon_chest: null, icon_gloves: null, icon_legs: null, icon_boots: null,

    icon_daggers: null, icon_saber: null, icon_swordShield: null, icon_longsword: null, icon_greatAxe: null,
    icon_greatHammer: null, icon_mace: null, icon_maceShield: null, icon_shortbow: null, icon_longbow: null,
    icon_wandFocus: null, icon_staff: null,

    icon_potion_potion: null, icon_potion_greater: null, icon_potion_antidote: null, icon_potion_iron: null,
    icon_potion_salve: null, icon_potion_fury: null, icon_potion_tonic: null, icon_potion_draught: null,
    icon_gem: null,

    icon_door_fight: null, icon_door_elite: null, icon_door_boss: null, icon_door_treasure: null,
    icon_door_rest: null, icon_door_shop: null, icon_door_mystery: null, icon_door_armory: null,
    icon_door_venom: null, icon_door_purify: null, icon_door_merchant: null, icon_door_trash: null, icon_door_vault: null, icon_door_forge: null, icon_door_trainer: null, icon_door_wager: null,
  },

  // Sound effects: null = the built-in sound made in code (src/sound.js). Put a file path (e.g. 'assets/sfx/thud.mp3') to use your own.
  sounds: {
    slash: null, chop: null, thud: null, clang: null, bow: null, zap: null, claw: null, hurt: null, crit: null,
    firebolt: null, meteor: null, arcane: null, heal: null, shield: null, dodge: null, parry: null, stun: null,
    cheap: null, stealth: null, double: null, kite: null, bleed: null, explode: null, revive: null, death: null,
    levelup: null, coin: null, heart: null,
  },
};
