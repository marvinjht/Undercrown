# All the art, as an autoload: Art.
# Everything is a PNG in res://art/ (see tools/pixelart.py for the placeholders). To use your own art, replace the
# file with one of the same name. Missing art falls back to a placeholder, so the game never breaks.
extends Node

const RARITY := { "grey": Color("#b5b0a6"), "green": Color("#72d064"), "rare": Color("#5aa8ff"), "legendary": Color("#f2c14a"),
	"artifact": Color("#ff5a48"), "potion": Color("#c9a0ff"), "relic": Color("#e0a85a") }
const TEXT := Color("#efe6d8")
const MUTED := Color("#a8998a")
const EMBER := Color("#e8903f")
const GOLD := Color("#f2c14a")
const UP := Color("#7fd26f")
const DOWN := Color("#e0705f")
const HP := Color("#6cc35f")
const BLOOD := Color("#c9473a")
const MANA := Color("#6f7dff")
const SHIELD := Color("#9fc4ff")
const MAGIC := Color("#7fb0ff")     # magic damage numbers are blue
const TONES := { "": TEXT, "up": UP, "down": DOWN, "affix": Color("#9fd38f"), "cost": DOWN, "legend": GOLD, "artifact": Color("#ff8a7a"),
	"stubborn": Color("#ffd34d"), "hint": MUTED, "warn": Color("#ffb36b"), "head": EMBER, "notice": TEXT, "side": MUTED, "relic": Color("#e0a85a") }

var _cache: Dictionary = {}

func tex(path: String) -> Texture2D:
	if _cache.has(path):
		return _cache[path]
	var t: Texture2D = null
	if ResourceLoader.exists(path):
		t = load(path)
	_cache[path] = t
	return t

func icon(key: String) -> Texture2D:
	if key == null or key == "":
		return tex("res://art/icons/skull.png")
	var t := tex("res://art/icons/%s.png" % key)
	return t if t else tex("res://art/icons/skull.png")

# A hero's body: by class look (warrior, mage...) or plain
func hero(look_name) -> Texture2D:
	if look_name is String and look_name != "":
		var t := tex("res://art/heroes/hero_%s.png" % look_name)
		if t:
			return t
	return tex("res://art/heroes/hero.png")

func weapon(weapon_type) -> Texture2D:
	if not (weapon_type is String) or weapon_type == "":
		return null
	return tex("res://art/weapons/%s.png" % str(weapon_type).replace("weapon_", ""))

# A monster by its sprite key (monster_rat) or id (rat)
func monster(key) -> Texture2D:
	var id := str(key).replace("monster_", "")
	var t := tex("res://art/monsters/%s.png" % id)
	return t if t else tex("res://art/monsters/slime.png")

func rarity_color(r) -> Color:
	return RARITY.get(str(r), TEXT)

func tone(t) -> Color:
	return TONES.get(str(t), TEXT)

# "#rrggbb" or a number (0xrrggbb) from the game
func color(v, fallback := Color.WHITE) -> Color:
	if v is String and v.begins_with("#"):
		return Color(v)
	if v is float or v is int:
		var n := int(v)
		return Color8((n >> 16) & 255, (n >> 8) & 255, n & 255)
	return fallback
