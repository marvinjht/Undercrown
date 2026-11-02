# Rewards and spoils after a fight: no new room. The loot lies where the monster fell, in the same fight room, with
# gold coins popping out; the gold and XP you got anyway float up as "+12 gold" / "+15 XP" and fly to your character
# panel. Picking works like any item room. (A reward from a vault or a trash pile, with no fight before, gets a room.)
extends "res://scripts/stage/item_room.gd"

var drop := Vector2(StageView.W * 0.62, 230.0)   # where the loot lies (where the monster fell)
var hero_at := Vector2(StageView.W * 0.22, StageView.HERO_Y + 20.0)

static func use_full_floor(prev: String) -> bool:
	return prev == "battle"

static func same_room(prev: String) -> bool:
	return prev == "battle"

func build(sc: Dictionary) -> void:
	var a = stage.mv.arena
	var from_fight: bool = stage.prev_phase == "battle"
	if from_fight and a and a.F.size():
		for id in a.F:   # the fallen monster's spot (any fallen foe; the last one standing if none)
			var f: Dictionary = a.F[id]
			if str(f.side) == "b" and is_instance_valid(f.node):
				drop = f.node.position
				if f.dead:
					break
		drop = Vector2(clampf(drop.x, 140.0, StageView.W - 140.0), clampf(drop.y, 170.0, 260.0))
		for id in a.F:   # where your hero stood when the fight ended
			var f: Dictionary = a.F[id]
			if str(f.side) == "a" and not f.m.get("ally", false) and not f.m.get("hologram", false) and is_instance_valid(f.node):
				hero_at = f.node.position
				break
		# Keep the loot clear of the hero (a melee fight ends with the monster right next to you)
		drop.x = clampf(max(drop.x, hero_at.x + 160.0), 150.0, StageView.W - 110.0)
		if drop.x - hero_at.x < 160.0:
			hero_at.x = drop.x - 160.0
	super.build(sc)
	if from_fight:
		_coins()
		_gains()

# The loot spreads out on the floor around the drop (two rows when there's a lot)
func spots(n: int) -> Array:
	var out := []
	var rows := 1 if n <= 4 else 2
	var per := int(ceil(float(n) / rows))
	var gap := 118.0
	for i in n:
		var r := i / per
		var k := i % per
		var m: int = min(per, n - r * per)
		var x: float = drop.x + (k - (m - 1) / 2.0) * gap
		out.append(Vector2(clampf(x, 60.0, StageView.W - 60.0), drop.y + 10.0 + r * 82.0 - (40.0 if rows == 2 else 0.0)))
	# Nothing lies on the hero: shift the loot right if there's room, else the hero steps back
	var left := StageView.W
	var right := 0.0
	for p in out:
		left = min(left, p.x)
		right = max(right, p.x)
	var need := hero_at.x + 100.0 - left
	if need > 0.0:
		var shift: float = min(need, StageView.W - 60.0 - right)
		for k in out.size():
			out[k].x += shift
		hero_at.x = max(30.0, min(hero_at.x, left + shift - 100.0))
	return out

func dress(e: Dictionary) -> void:   # a soft shadow under each item on the floor
	var s := TextureRect.new()
	s.texture = Art.tex("res://art/ui/glow.png")
	s.modulate = Color(0, 0, 0, 0.55)
	s.size = Vector2(ITEM_PX * 1.3, ITEM_PX * 0.5)
	s.position = e.pos + Vector2(-ITEM_PX * 0.65, ITEM_PX * 0.3)
	s.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.world_node().add_child(s)

func place_hero() -> void:
	hero = stage.spawn_hero("me", hero_at)
	if stage.prev_phase != "battle":
		hero.position = Vector2(28.0, StageView.HERO_Y + 20.0)
		hero.walk_to(Vector2(StageView.W * 0.12, StageView.HERO_Y + 20.0), 360.0, 0.4)

# Gold coins pop out of the drop and fade
func _coins() -> void:
	var world := stage.world_node()
	for k in 7:
		var c := TextureRect.new()
		c.texture = Art.icon("coin")
		c.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		c.size = Vector2(16, 16)
		c.position = drop - Vector2(8, 8)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		world.add_child(c)
		var to := drop + Vector2(randf_range(-70, 70), randf_range(10, 40))
		var up := drop + Vector2((to.x - drop.x) / 2.0, -randf_range(40, 70))
		var tw := c.create_tween()
		tw.tween_method(func(t: float): c.position = (1 - t) * (1 - t) * drop + 2 * (1 - t) * t * up + t * t * to - Vector2(8, 8), 0.0, 1.0, 0.45).set_delay(k * 0.03)
		tw.tween_property(c, "modulate:a", 0.0, 0.5).set_delay(0.3)
		tw.tween_callback(c.queue_free)

# What you got anyway (gold and XP) floats up from the drop and flies to your character panel
func _gains() -> void:
	var pre: Dictionary = stage.pre_battle
	var me: Dictionary = Game.view.get("me", {})
	if pre.is_empty():
		return
	var gold := int(me.get("gold", 0)) - int(pre.get("gold", 0))
	var xp := int(me.get("xp", 0)) - int(pre.get("xp", 0))
	if int(me.get("level", 1)) > int(pre.get("level", 1)):   # leveled up: the XP to the next level, plus what's past it
		xp = int(pre.get("xpNeed", 0)) - int(pre.get("xp", 0)) + int(me.get("xp", 0))
	var bits := []
	if gold > 0:
		bits.append(["+%d gold" % gold, Art.GOLD])
	if xp > 0:
		bits.append(["+%d XP" % xp, Color("#a996ff")])
	var panel: Control = stage.mv.char_panel
	for k in bits.size():
		var l := Kit.label(bits[k][0], "Heading", false, bits[k][1])
		l.add_theme_font_size_override("font_size", 16)
		l.add_theme_constant_override("outline_size", 4)
		l.top_level = true
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stage.mv.add_child(l)
		l.reset_size()
		var start := stage.get_global_rect().position + stage.to_stage(drop) - l.size / 2.0 + Vector2(0, k * 22.0)
		l.global_position = start
		var tw := l.create_tween()
		tw.tween_property(l, "global_position:y", start.y - 46.0, 0.45).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD).set_delay(k * 0.12)
		if is_instance_valid(panel):
			var to := panel.get_global_rect().position + Vector2(panel.size.x / 2.0 - l.size.x / 2.0, panel.size.y * 0.72)
			tw.tween_property(l, "global_position", to, 0.5).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD).set_delay(0.35)
		tw.tween_property(l, "modulate:a", 0.0, 0.2)
		tw.tween_callback(l.queue_free)
