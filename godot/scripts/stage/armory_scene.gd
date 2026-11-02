# The armory: your choices on display in the room. Weapons hang on a rack, armor stands on a mannequin, bag items sit
# on a shelf, relics rest on a pedestal. Everything else (picking, cards, taking) is the item room's.
extends "res://scripts/stage/item_room.gd"

const PROPS := { "weapon": ["rack", Vector2(40, 48)], "armor": ["stand", Vector2(32, 56)], "consumable": ["shelf", Vector2(40, 32)], "relic": ["pedestal", Vector2(28, 28)] }

func dress(e: Dictionary) -> void:
	var it = e.item
	var kind := "consumable"
	if it is Dictionary:
		kind = "relic" if str(it.get("kind", "")) == "relic" else "consumable" if str(it.get("kind", "")) == "consumable" else "weapon" if str(it.get("slot", "")) == "weapon" else "armor"
	var p: Array = PROPS[kind]
	var sz: Vector2 = p[1] * 2.0
	var r := TextureRect.new()
	r.texture = Art.tex("res://art/props/%s.png" % p[0])
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.size = sz
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Standing on the floor under the item (the item hangs on the rack, sits on the shelf, rests on the pedestal)
	var foot: float = e.pos.y + ITEM_PX / 2.0 + (22.0 if kind == "weapon" else 14.0 if kind == "armor" else 30.0 if kind == "relic" else 10.0)
	r.position = Vector2(e.pos.x - sz.x / 2.0, foot - sz.y)
	stage.world_node().add_child(r)
