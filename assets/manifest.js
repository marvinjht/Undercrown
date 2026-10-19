// ASSET MANIFEST
// Every piece of art the game uses has a key here.
//   null           -> the game draws built-in placeholder art
//   'assets/x.png' -> the game loads your image instead
// To swap in your own art: drop a PNG into the assets folder and put its path next to the key.
// Recommended sizes (transparent PNG):
//   hero, monster_*  : 64x64, top-down, facing RIGHT (bosses can be 96x96)
//   weapon_*         : 64x64, handle on the LEFT edge, blade pointing RIGHT
//   floor            : 64x64, seamless tile
//   icon_*           : 64x64 (shown in menus, tooltips and the gear panel)
window.G = window.G || {};

G.ASSETS = {
  sprites: {
    hero: null,
    floor: null,

    weapon_daggers: null,
    weapon_saber: null,
    weapon_swordShield: null,
    weapon_longsword: null,
    weapon_greatAxe: null,
    weapon_greatHammer: null,

    monster_rat: null,
    monster_slime: null,
    monster_skeleton: null,
    monster_goblin: null,
    monster_orc: null,
    monster_wraith: null,
    monster_troll: null,
    monster_ogre: null,
    monster_cultist: null,
    monster_boneKing: null,
    monster_gorehorn: null,
    monster_warden: null,
  },

  icons: {
    icon_weapon: null,
    icon_helmet: null,
    icon_chest: null,
    icon_gloves: null,
    icon_legs: null,
    icon_boots: null,

    icon_daggers: null,
    icon_saber: null,
    icon_swordShield: null,
    icon_longsword: null,
    icon_greatAxe: null,
    icon_greatHammer: null,

    icon_door_fight: null,
    icon_door_elite: null,
    icon_door_boss: null,
    icon_door_treasure: null,
    icon_door_rest: null,
    icon_door_shop: null,
    icon_door_mystery: null,
    icon_door_armory: null,
  },
};
