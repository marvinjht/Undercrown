# The Stage: the center column, one persistent place for the whole match. Your hero lives here and walks from room
# to room; fights play on it (the arena has the same floor and torches); the room is tinted by the time of day.
#
# Each screen phase (view.screen.phase) maps to a stage scene in SCENES. A phase with no scene yet falls back to the
# card layout (today's screens), drawn over the stage. To add a scene: write a script like doors_scene.gd (build, refresh,
# key_for) and add it to SCENES.
#
# Layout: everything is drawn in a 640x360 "world" (the arena's size) scaled to the column's width; the wall continues
# above it and the floor below, so any column shape is filled.
class_name StageView
extends Control

const W := 640.0
const H := 360.0
const FLOOR_Y := 212.0       # where the back wall meets the floor (world units)
const HERO_Y := 236.0        # where heroes stand (their sprite's center)
const SLIDE := 0.35          # seconds to slide from one room to the next
const MIN_EXIT := 0.22       # an exit animation (door opening) shows at least this long, then gives way to the next room
const SCENES := {
	"doors": preload("res://scripts/stage/doors_scene.gd"),
	"battle": preload("res://scripts/stage/battle_scene.gd"),
}
const TINTS := { "Morning": Color(1.0, 0.97, 0.9), "Evening": Color(1.0, 0.83, 0.68), "Night": Color(0.64, 0.72, 1.0) }

var mv                         # the match view (arena, log, card sections)
var overlay: Control           # the card layout, for phases without a stage scene
var banner: PanelContainer
var ui: Control                # hover cards and anything else drawn unscaled over the stage
var layer: Control             # the current room
var scene: Control             # its scene (null: fallback)
var scene_key := ""
var tint := Color.WHITE
var actors := {}               # heroes on the stage by id ("me" for now; rivals later)
var exiting := false           # the hero is on the way out (door opening); the next room slides in when it arrives
var _exit_at := 0
var _pending = null            # a screen that arrived during the exit

func _ready() -> void:
	clip_contents = true
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_PASS
	ui = Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(ui)
	banner = Kit.panel("")
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.self_modulate = Color(1, 1, 1, 0.92)
	add_child(banner)
	resized.connect(_layout)

# The card layout (match_view's StageScroll) goes over the stage, behind the banner
func setup(match_view, scroll: Control) -> void:
	mv = match_view
	overlay = scroll
	scroll.get_parent().remove_child(scroll)
	add_child(scroll)
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.055, 0.043, 0.035, 0.86)
	bg.set_content_margin_all(12)
	scroll.add_theme_stylebox_override("panel", bg)
	move_child(scroll, 0)
	move_child(banner, get_child_count() - 1)
	move_child(ui, get_child_count() - 1)
	overlay.visible = false

# The screen changed. Returns true when a stage scene draws it (no card layout needed).
func present(sc: Dictionary) -> bool:
	tint = TINTS.get(str(Game.view.get("top", {}).get("dayPhase", "")), Color(0.86, 0.82, 0.8))
	var phase := str(sc.get("phase", ""))
	var S = SCENES.get(phase)
	var key := "%s|%s|%s" % [phase, Game.view.get("top", {}).get("room", 0), S.key_for(sc) if S else ""]
	if key == scene_key and is_instance_valid(layer):
		_banner(sc)
		if scene and scene.has_method("refresh"):
			scene.refresh(sc)
		layer.modulate = tint
		overlay.visible = S == null and not exiting
		return S != null
	scene_key = key
	if exiting:
		# The next room is ready: let the exit show for a moment (never longer than it has to), then slide on
		_pending = sc
		overlay.visible = false
		var left := MIN_EXIT - float(Time.get_ticks_msec() - _exit_at) / 1000.0
		if left > 0.0:
			get_tree().create_timer(left).timeout.connect(_after_exit)
		else:
			_after_exit()
		return S != null
	_enter(S, sc)
	return S != null

func _after_exit() -> void:
	if _pending == null:
		return
	var sc = _pending
	_pending = null
	exiting = false
	_enter(SCENES.get(str(sc.get("phase", ""))), sc)

# A scene asks to leave (the hero went through a door): the next room slides in as soon as the server sends it
func begin_exit() -> void:
	exiting = true
	_exit_at = Time.get_ticks_msec()

func _process(_d: float) -> void:
	# Safety: if the server never moves on (a refused choice), come back after a few seconds
	if exiting and _pending == null and Time.get_ticks_msec() - _exit_at > 4000:
		exiting = false
		scene_key = ""
		mv.shown.erase("stage")
		mv._on_changed("stage")

func _enter(S, sc: Dictionary) -> void:
	_banner(sc)
	for c in ui.get_children():
		c.queue_free()
	var old := layer
	layer = _new_layer(S != null and S.FULL_FLOOR)   # a fight's room is all floor, like the arena
	add_child(layer)
	move_child(layer, 0)
	actors = {}
	if S:
		scene = S.new()
		scene.stage = self
		layer.add_child(scene)
		scene.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		scene.mouse_filter = Control.MOUSE_FILTER_IGNORE
		scene.build(sc)
	else:
		scene = null
		spawn_hero("me", Vector2(W * 0.3, HERO_Y))   # an empty room: you stand in it while the cards are up
	layer.modulate = tint
	_layout()
	overlay.visible = false
	if old and is_instance_valid(old):
		var w := size.x
		layer.position.x = w
		var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(old, "position:x", -w, SLIDE)
		tw.tween_property(layer, "position:x", 0.0, SLIDE)
		tw.chain().tween_callback(func():
			if is_instance_valid(old):
				old.queue_free()
			_show_overlay(S == null))
	else:
		_show_overlay(S == null)

func _show_overlay(on: bool) -> void:
	overlay.visible = on and not exiting
	if overlay.visible:
		overlay.modulate.a = 0.0
		create_tween().tween_property(overlay, "modulate:a", 1.0, 0.15)

# ---------- Rooms ----------
# A room: the backdrop (wall and floor, extended to fill the column) and a 640x360 world, scaled to the width
func _new_layer(full_floor: bool) -> Control:
	var l := Control.new()
	l.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var wall := TextureRect.new()
	wall.name = "Wall"
	wall.texture = Art.tex("res://art/ui/wall.png") if not full_floor else Art.tex("res://art/ui/floor.png")
	wall.stretch_mode = TextureRect.STRETCH_TILE
	wall.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	wall.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_child(wall)
	var floor_r := TextureRect.new()
	floor_r.name = "Floor"
	floor_r.texture = Art.tex("res://art/ui/floor.png")
	floor_r.stretch_mode = TextureRect.STRETCH_TILE
	floor_r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	floor_r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_child(floor_r)
	var edge := ColorRect.new()
	edge.name = "Edge"
	edge.color = Color("#120c0a")
	edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	edge.visible = not full_floor
	l.add_child(edge)
	var world := Control.new()
	world.name = "World"
	world.size = Vector2(W, H)
	world.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_child(world)
	if not full_floor:
		for x in [40.0, W - 56.0]:
			var tch := Sprite2D.new()
			tch.texture = Art.tex("res://art/ui/torch.png")
			tch.centered = false
			tch.position = Vector2(x, 110)
			tch.scale = Vector2(2, 2)
			world.add_child(tch)
			var tw := tch.create_tween().set_loops()
			tw.tween_property(tch, "modulate", Color(1.2, 1.05, 0.9), 0.4 + randf() * 0.3)
			tw.tween_property(tch, "modulate", Color(0.85, 0.8, 0.75), 0.4 + randf() * 0.3)
	var actors_node := Node2D.new()
	actors_node.name = "Actors"
	actors_node.z_index = 5
	world.add_child(actors_node)
	l.resized.connect(func(): _fit_layer(l))
	return l

# The world's scale: as wide as the column, unless that makes it too tall to fit
func k_scale() -> float:
	return max(0.5, min(size.x / W, max(size.y, 100.0) / (H * 0.9)))

# Centered across; the floor line sits at about 62% of the height (less empty floor below, room for the banner above)
func world_origin() -> Vector2:
	var k := k_scale()
	var y := size.y * 0.62 - FLOOR_Y * k
	y = clampf(y, size.y - H * k, 0.0) if size.y < H * k else clampf(y, 0.0, size.y - H * k)
	return Vector2((size.x - W * k) / 2.0, y)

func _fit_layer(l: Control) -> void:
	if not is_instance_valid(l):
		return
	var k := k_scale()
	var o := world_origin()
	var world: Control = l.get_node("World")
	world.scale = Vector2(k, k)
	world.position = o
	var tile := 2.0 * k
	var floor_at := o.y + FLOOR_Y * k
	var wall: TextureRect = l.get_node("Wall")
	wall.scale = Vector2(tile, tile)
	wall.position = Vector2.ZERO
	wall.size = Vector2(size.x / tile + 1.0, floor_at / tile + 1.0)
	var fl: TextureRect = l.get_node("Floor")
	fl.scale = Vector2(tile, tile)
	fl.position = Vector2(0, floor_at)
	fl.size = Vector2(size.x / tile + 1.0, (size.y - floor_at) / tile + 1.0)
	var edge: ColorRect = l.get_node("Edge")
	edge.position = Vector2(0, floor_at - 3.0 * k)
	edge.size = Vector2(size.x, 3.0 * k)

func _layout() -> void:
	if is_instance_valid(layer):
		_fit_layer(layer)
	banner.reset_size()
	banner.position = Vector2((size.x - banner.size.x) / 2.0, 8.0)
	if scene and scene.has_method("relayout"):
		scene.relayout()

func world_node() -> Control:
	return layer.get_node("World") if is_instance_valid(layer) else null

# World coordinates -> this control's coordinates (for cards drawn next to things in the room)
func to_stage(p: Vector2) -> Vector2:
	return world_origin() + p * k_scale()

# ---------- Heroes ----------
func spawn_hero(id: String, at: Vector2, look = null) -> StageHero:
	var lk: Dictionary = look if look is Dictionary else Game.view.get("me", {}).get("look", {})
	var h := StageHero.new().setup(lk)
	h.position = at
	world_node().get_node("Actors").add_child(h)
	actors[id] = h
	return h

# ---------- The banner: the screen's title and lede, short, at the top ----------
func _banner(sc: Dictionary) -> void:
	Kit.clear(banner)
	var v := Kit.vbox(2)
	v.custom_minimum_size = Vector2(min(size.x * 0.7, 760.0), 0)
	if sc.get("notice"):
		v.add_child(Kit.center(Kit.label(sc.notice, "", true, Art.GOLD)))
	if sc.get("title"):
		v.add_child(Kit.center(Kit.label(sc.title, "Heading", true)))
	if sc.get("lede"):
		v.add_child(Kit.center(Kit.label(sc.lede, "Muted", true)))
	if scene_has_stage(sc):
		for n in sc.get("notes", []):
			v.add_child(Kit.center(Kit.line(n)))
	banner.add_child(v)
	banner.visible = v.get_child_count() > 0 and scene_has_stage(sc)
	Kit.fit_width(banner, v.custom_minimum_size.x + 24.0)
	_layout.call_deferred()

func scene_has_stage(sc: Dictionary) -> bool:
	return SCENES.has(str(sc.get("phase", "")))
