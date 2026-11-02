# The rooms with someone (or something) in them: the forge (Brannoc, the smith), the merchant (Quill), the wager (the
# dealer) and the mystery room (an object, by what present.js says the mystery is). The hero walks in from the left and
# stops in front of them; they say a short line. The room's panel (the screen's cards and buttons, exactly what present.js
# sends) slides up over the lower part of the stage at once: it is the card layout, drawn by match_view, and this scene
# only draws the room above it. Buying, forging and betting get a reaction (coins, a nod, a line, Brannoc hammering);
# leaving slides the panel down and the hero walks out to the right. Button presses go to the server at once
# (Game.acted tells us about them): the animations never cost clock time.
#
# NPC art: godot/art/npcs/<name>.png, frames of 48x64 side by side (drawn 2x). Frame 0 idle, 1 breathing/blinking;
# brannoc 2 frown, 3 hammer up, 4 hammer down; quill 2 frown. A mystery object's frame 1 is it glowing brighter.
extends Control

const PANEL := true
const FEET := 268.0            # where the NPCs stand (the hero's feet)
const EXIT_MIN := 0.45
const ROOMS := {
	"forge": {
		"npc": "brannoc", "name": "Brannoc, the smith", "x": 430.0, "stop": 270.0,
		"hello": ["Bring me steel and I'll make it sing.", "Hmph. Let's see what you've been swinging.", "Good iron's wasted on most heroes. Prove me wrong.", "Mind the sparks. And the prices.", "Don't touch the anvil. Tell me what you want."],
		"done": ["There. Better than new.", "Now that's steel.", "Hah! Feel that weight.", "Don't you dare dull it.", "Finest work in the dungeon. You're welcome."],
		"bye": ["Go on. Make it earn its keep.", "Bring it back in one piece.", "Hmph. Off with you, then."],
		"snub": ["Your gear, your funeral.", "Come back when you've got the gold.", "Wasting my fire."],
	},
	"merchant": {
		"npc": "quill", "name": "Quill, the merchant", "x": 360.0, "stop": 250.0,
		"hello": ["Everything has a price. Most of it is fair.", "Ah, a customer. Do come in.", "Fine goods for a fine hero. Mostly fine.", "Browse at your leisure. Buy at mine.", "Gold, my friend, is the only honest metal."],
		"done": ["An excellent choice.", "Pleasure doing business.", "Wise. Very wise.", "It suits you. Truly.", "Sold, to the hero with taste."],
		"blood": ["Still warm. Splendid.", "A fair trade, I assure you.", "Don't faint on the merchandise."],
		"restock": ["Let me see what else I have...", "For you? I have a back room."],
		"bye": ["Do come again.", "A pleasure, as always.", "Spend it wisely. Then come back."],
		"snub": ["Nothing? How... disappointing.", "Window shopping. Charming.", "My prices are fair. Your loss."],
	},
	"wager": {
		"npc": "dealer", "name": "The dealer", "x": 420.0, "stop": 290.0,
		"hello": ["Care to bet on yourself?", "The house always wins. Usually.", "Feeling lucky, hero?", "Dice don't lie. People do."],
		"done": ["Bold. I like bold.", "Heh heh. Let's see.", "Now we're playing.", "Your gold looks good on my table."],
		"snub": ["Nothing on the line? A coward's game.", "Free fights are for the poor."],
	},
	"mystery": {
		"npc": "", "name": "", "x": 400.0, "stop": 270.0,
		"shrine": ["The altar is warm. It wants blood.", "The runes pulse, slow as a heartbeat."],
		"spring": ["The water glows faintly. It smells clean.", "A spring, cold and still."],
		"cache": ["Someone didn't make it. Their pack did.", "A fallen adventurer's pack. It clinks."],
		"ambush": ["Something shifts on the ceiling...", "A thread glints above you."],
		"act_shrine": "The runes drink deep.", "act_spring": "Your wounds close.", "act_cache": "Gold!", "act_ambush": "It moves!",
	},
}
const GLOW := { "shrine": Color(1.0, 0.25, 0.2), "spring": Color(0.3, 0.75, 1.0), "cache": Color(1.0, 0.8, 0.3), "ambush": Color(1.0, 0.45, 0.15) }

static func use_full_floor(_prev: String) -> bool:
	return false

static func same_room(_prev: String) -> bool:
	return false

static func key_for(_sc: Dictionary) -> String:
	return ""

var stage: StageView
var phase := ""
var R: Dictionary
var npc: Sprite2D
var npc_y := 0.0
var hero: StageHero
var bubble: Control
var gone := false
var bought := false            # bought, forged or bet something here (leaving gets a "bye", not a frown)
var mystery := ""
var _t := 0.0
var _blink_at := 2.0
var _pose := -1                # a frame held for a moment (frown, hammer); -1: idle
var _pose_until := 0.0
var _busy := false             # hammering
var _spark_t := 0.0
var _flame: Control

func build(sc: Dictionary) -> void:
	phase = str(sc.get("phase", ""))
	R = ROOMS.get(phase, ROOMS.mystery)
	mystery = str(sc.get("mystery", "shrine")) if phase == "mystery" else ""
	var world := stage.world_node()
	call("_room_" + phase, world, true)
	var tex := Art.tex("res://art/npcs/%s.png" % (R.npc if R.npc != "" else "mystery_" + mystery))
	if tex == null:   # missing art: a placeholder so the room still works
		tex = Art.tex("res://art/npcs/mystery_shrine.png")
	npc = Sprite2D.new()
	npc.texture = tex
	npc.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	npc.hframes = max(1, int(round(tex.get_width() / (tex.get_height() * 0.75))))   # frames are 3:4 (48x64)
	npc.scale = Vector2(2, 2)
	npc_y = FEET - tex.get_height()
	npc.position = Vector2(R.x, npc_y)
	world.add_child(npc)
	call("_room_" + phase, world, false)
	hero = stage.spawn_hero("me", Vector2(-30.0, StageView.HERO_Y))
	hero.walk_to(Vector2(R.stop, StageView.HERO_Y), 360.0, 0.8)
	get_tree().create_timer(0.55).timeout.connect(func():
		if not gone:
			say(_pick(R.get(mystery, []) if mystery != "" else R.hello)))
	Game.acted.connect(_on_act)

func refresh(_sc: Dictionary) -> void:
	pass

func relayout() -> void:
	_place_bubble()

func _exit_tree() -> void:
	if is_instance_valid(bubble):
		bubble.queue_free()
	if Game.acted.is_connected(_on_act):
		Game.acted.disconnect(_on_act)

func _pick(a: Array) -> String:
	return str(a[randi() % a.size()]) if a.size() else ""

# ---------- The rooms (back: behind the NPC; front: in front of it) ----------
func _prop(world: Control, name: String, at: Vector2, scale := 2.0) -> TextureRect:   # at: bottom center
	var t := Art.tex("res://art/props/%s.png" % name)
	var r := TextureRect.new()
	r.texture = t
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.size = t.get_size() * scale
	r.position = at - Vector2(r.size.x / 2.0, r.size.y)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	world.add_child(r)
	return r

func _glow(world: Control, at: Vector2, radius: float, col: Color, pulse := true) -> TextureRect:
	var g := TextureRect.new()
	g.texture = Art.tex("res://art/ui/glow.png")
	g.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	g.size = Vector2(radius, radius) * 2.0
	g.position = at - Vector2(radius, radius)
	g.modulate = col
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	g.material = m
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	world.add_child(g)
	if pulse:
		var tw := g.create_tween().set_loops()
		tw.tween_property(g, "modulate:a", col.a * 0.55, 0.5 + randf() * 0.4).set_trans(Tween.TRANS_SINE)
		tw.tween_property(g, "modulate:a", col.a, 0.5 + randf() * 0.4).set_trans(Tween.TRANS_SINE)
	return g

func _room_forge(world: Control, back: bool) -> void:
	if back:   # tools on the wall, the furnace glowing behind the smith
		_prop(world, "tools", Vector2(300, 160))
		_prop(world, "furnace", Vector2(530, 220))
		_glow(world, Vector2(530, 182), 70.0, Color(1.0, 0.5, 0.15, 0.8))
	else:      # the anvil in front of him (his hammer lands on it)
		_prop(world, "anvil", Vector2(372, 280))

func _room_merchant(world: Control, back: bool) -> void:
	if not back:   # his counter beside him, wares on top
		_prop(world, "counter", Vector2(500, 274))

func _room_wager(world: Control, back: bool) -> void:
	if back:
		return
	_prop(world, "table", Vector2(R.x, 282))
	_prop(world, "candle", Vector2(R.x + 32, 238))
	var dark := ColorRect.new()   # a dim corner: everything darker but the candle's light
	dark.color = Color(0.02, 0.01, 0.03, 0.55)
	dark.position = Vector2(-600, -400)
	dark.size = Vector2(StageView.W + 1200, StageView.H + 800)
	dark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dark.z_index = 6
	world.add_child(dark)
	var g := _glow(world, Vector2(R.x + 32, 206), 120.0, Color(1.0, 0.6, 0.25, 0.55))
	g.z_index = 7
	g.pivot_offset = g.size / 2.0
	_flame = g

func _room_mystery(world: Control, back: bool) -> void:
	if back:   # lit from above: a soft pool of light on the object
		_glow(world, Vector2(R.x, 200), 110.0, Color(GLOW.get(mystery, Color.WHITE), 0.6))
		var beam := ColorRect.new()
		beam.color = Color(1, 0.95, 0.8, 0.06)
		beam.position = Vector2(R.x - 60, -40)
		beam.size = Vector2(120, 310)
		beam.mouse_filter = Control.MOUSE_FILTER_IGNORE
		world.add_child(beam)

# ---------- Idle: breathing and blinking; the forge throws sparks ----------
func _process(delta: float) -> void:
	_t += delta
	if not is_instance_valid(npc):
		return
	if _pose >= 0 and _t < _pose_until:
		npc.frame = min(_pose, npc.hframes - 1)
	elif not _busy:
		_pose = -1
		if mystery != "":
			npc.frame = int(_t * 1.6) % npc.hframes   # the object pulses
		else:
			if _t > _blink_at + 0.22:
				_blink_at = _t + randf_range(2.0, 3.6)
			npc.frame = 1 if _t > _blink_at and npc.hframes > 1 else 0
	if phase == "forge":
		_spark_t -= delta
		if _spark_t <= 0.0:
			_spark_t = randf_range(0.25, 0.6)
			_sparks(Vector2(530 + randf_range(-10, 10), 176), 2, Vector2(0, -1))
	if _flame:
		_flame.scale = Vector2.ONE * (1.0 + sin(_t * 9.0) * 0.03 + sin(_t * 23.0) * 0.02)

func _hold(frame: int, secs: float) -> void:
	_pose = frame
	_pose_until = _t + secs

# ---------- Speech ----------
func say(text: String, secs := 2.8) -> void:
	if text == "":
		return
	if is_instance_valid(bubble):
		bubble.queue_free()
	var p := PanelContainer.new()
	var st := StyleBoxFlat.new()
	var person: bool = R.npc != ""
	st.bg_color = Color("#efe4cc") if person else Color(0.05, 0.04, 0.06, 0.88)
	st.border_color = Color("#3a2a1c") if person else Color(GLOW.get(mystery, Color.WHITE), 0.7)
	st.set_border_width_all(2)
	st.set_corner_radius_all(8)
	st.set_content_margin_all(8)
	st.content_margin_top = 5
	st.content_margin_bottom = 6
	p.add_theme_stylebox_override("panel", st)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := Kit.vbox(0)
	if person:
		var nm := Kit.label(R.name, "Muted", false, Color("#8a5a1a"))
		v.add_child(nm)
	var l := Kit.label(("\"%s\"" % text) if person else text, "", true, Color("#20160e") if person else Color("#e8dcc8"))
	l.custom_minimum_size.x = min(230.0, max(120.0, Kit.label(text).get_minimum_size().x + 12.0))
	v.add_child(l)
	p.add_child(v)
	stage.ui.add_child(p)
	bubble = p
	_place_bubble()
	p.modulate.a = 0.0
	var tw := p.create_tween()
	tw.tween_property(p, "modulate:a", 1.0, 0.12)
	tw.tween_interval(secs)
	tw.tween_property(p, "modulate:a", 0.0, 0.3)
	tw.tween_callback(p.queue_free)

func _place_bubble() -> void:
	if not is_instance_valid(bubble) or not is_instance_valid(npc):
		return
	bubble.reset_size()
	var head := stage.to_stage(Vector2(R.x - 20.0, npc_y - npc.texture.get_height() + 6.0))   # over the NPC's head, toward the hero
	var at := head - Vector2(bubble.size.x * 0.7, bubble.size.y)
	at.x = clampf(at.x, 6.0, max(6.0, stage.size.x - bubble.size.x - 6.0))
	at.y = max(6.0, at.y)
	bubble.position = at

# ---------- Reactions ----------
func _on_act(fn: String, args: Array) -> void:
	if gone or not is_visible_in_tree():
		return
	var what := str(args[0]) if args.size() else ""
	match fn:
		"shopBuy":
			if what == "blood":
				say(_pick(R.get("blood", [])))
				_nod()
			elif what == "restock":
				_coins(hero.position, npc.position)
				say(_pick(R.get("restock", [])))
			else:
				bought = true
				_coins(hero.position, npc.position)
				_nod()
				say(_pick(R.done))
		"forgeAct":
			bought = true
			_coins(hero.position, npc.position + Vector2(0, 30))
			_hammer()
		"leaveMerchant", "leaveForge":
			if bought:
				say(_pick(R.bye), 1.2)
				_nod()
			else:
				say(_pick(R.snub), 1.2)
				_hold(2, 1.5)
			_leave(0.6)
		"placeBet":
			if int(args[0]) > 0:
				_coins(hero.position, Vector2(R.x - 10, 232))
				say(_pick(R.done), 1.2)
			else:
				say(_pick(R.snub), 1.2)
			Sfx.play("haha")
			_leave(0.6)
		"mysteryAct":
			if what != "leave":
				say(str(R.get("act_" + mystery, "")), 1.2)
				match mystery:
					"cache": _coins(npc.position + Vector2(0, 40), hero.position); Sfx.play("coin")
					"spring": Sfx.play("heal")
					"shrine": Sfx.play("bleed")
					"ambush": Sfx.play("hurt")
				npc.modulate = Color(1.6, 1.6, 1.6)
				npc.create_tween().tween_property(npc, "modulate", Color.WHITE, 0.4)
			_leave(0.6 if what != "leave" else EXIT_MIN)

func _nod() -> void:
	var tw := npc.create_tween()
	for k in 2:
		tw.tween_property(npc, "position:y", npc_y + 3.0, 0.08)
		tw.tween_property(npc, "position:y", npc_y, 0.1)

# Brannoc swings: up, down on the anvil (clang, sparks), twice; then a line
func _hammer() -> void:
	if _busy:
		return
	_busy = true
	var tw := create_tween()
	for k in 2:
		tw.tween_callback(func(): npc.frame = min(3, npc.hframes - 1))
		tw.tween_interval(0.16)
		tw.tween_callback(func():
			npc.frame = min(4, npc.hframes - 1)
			Sfx.play("clang", 0.0)
			_sparks(Vector2(R.x - 44, 240), 12, Vector2(-0.3, -1)))
		tw.tween_interval(0.2)
	tw.tween_callback(func():
		_busy = false
		say(_pick(R.done)))

# Little sparks thrown up from a point (world coordinates), falling back with gravity
func _sparks(at: Vector2, n: int, dir: Vector2) -> void:
	var world := stage.world_node()
	if not world:
		return
	for k in n:
		var s := ColorRect.new()
		s.color = [Color("#ffe08a"), Color("#ffb03a"), Color("#ff7a1a")][k % 3]
		s.size = Vector2(2, 2)
		s.position = at
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		s.z_index = 8
		world.add_child(s)
		var v := (dir.normalized() * randf_range(40, 90)).rotated(randf_range(-0.9, 0.9))
		var life := randf_range(0.35, 0.7)
		var tw := s.create_tween().set_parallel(true)
		tw.tween_method(func(t: float): s.position = at + v * t + Vector2(0, 160.0) * t * t, 0.0, life, life)
		tw.tween_property(s, "modulate:a", 0.0, life).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(s.queue_free)

# Coins fly from one point to another (world coordinates) in a little arc
func _coins(from: Vector2, to: Vector2) -> void:
	var world := stage.world_node()
	if not world:
		return
	Sfx.play("coin")
	for k in 5:
		var c := TextureRect.new()
		c.texture = Art.icon("coin")
		c.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		c.size = Vector2(14, 14)
		c.position = from - Vector2(7, 7)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		c.z_index = 8
		world.add_child(c)
		var up := (from + to) / 2.0 - Vector2(0, randf_range(50, 80))
		var end := to + Vector2(randf_range(-10, 10), randf_range(-8, 8))
		var tw := c.create_tween()
		tw.tween_method(func(t: float): c.position = (1 - t) * (1 - t) * from + 2 * (1 - t) * t * up + t * t * end - Vector2(7, 7), 0.0, 1.0, 0.4).set_delay(k * 0.05)
		tw.tween_property(c, "modulate:a", 0.0, 0.12)
		tw.tween_callback(c.queue_free)

# ---------- Leaving: the panel slides down, the hero walks out to the right ----------
func _leave(min_time := EXIT_MIN) -> void:
	gone = true
	stage.drop_panel()
	stage.begin_exit(min_time)
	if hero:
		get_tree().create_timer(0.15).timeout.connect(func():
			if is_instance_valid(hero):
				hero.walk_to(Vector2(StageView.W + 40.0, hero.position.y), 520.0, 0.9))
