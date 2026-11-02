# The base of the rooms where players meet (the duel room, the tournament hall, the end of a run). Everyone stands
# where the arena puts fighters, so a fight starts and ends right where they stood: you on the left at ME, facing right;
# your opponent comes from the right to OPP. Helpers for what happens around a fight: walking in (a ghost fades in),
# the face-off card, falling (bloody when it was the last heart), a heart breaking, getting up, walking off, the crown,
# the dimming and the big banner.
extends Control

const FULL_FLOOR := true
const NO_BANNER := true
const ME := Vector2(150, 200)        # arena.gd: X0, lane 200
const OPP := Vector2(510, 200)       # arena.gd: X0 + START_GAP * STEP

static func use_full_floor(_prev: String) -> bool:
	return true

static func key_for(_sc: Dictionary) -> String:
	return ""

var stage: StageView
var me: StageHero
var opp: StageHero
var opp_ghost := false
var top: PanelContainer
var face: Control                    # the face-off card
var big: Control                     # the big banner
var dim_rect: ColorRect
var _top_ends := 0.0
var _top_text := ""
var _t := 0.0
var _crowned: StageHero
var _crown: TextureRect

# ---------- The room ----------
# The duel room: banners on both sides. The hall: stone stands full of people along the back, banners.
static func decor(world: Control, hall: bool) -> void:
	if hall:
		var st := TextureRect.new()
		st.texture = Art.tex("res://art/props/stands.png")
		st.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		st.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		st.size = Vector2(StageView.W + 40, 88)
		st.position = Vector2(-20, -4)
		st.mouse_filter = Control.MOUSE_FILTER_IGNORE
		world.add_child(st)
	for x in ([40.0, 120.0, 520.0, 600.0] if hall else [90.0, 550.0]):
		var b := TextureRect.new()
		b.texture = Art.tex("res://art/props/banner.png")
		b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		b.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		b.size = Vector2(32, 88)
		b.position = Vector2(x - 16, 92 if hall else 70)
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		world.add_child(b)

func _exit_tree() -> void:
	for n in [top, face, big]:
		if is_instance_valid(n):
			n.queue_free()

# ---------- People ----------
func hero_at(id: String, at: Vector2, look, right := true) -> StageHero:
	var h := stage.spawn_hero(id, at, look if look is Dictionary else null)
	h.face(right)
	return h

func walk_in_me(from_left: bool) -> void:
	me = hero_at("me", ME if not from_left else Vector2(-40, ME.y), null)
	if from_left:
		me.walk_to(ME, 300.0, 0.7)
		_face_later(me, true, 0.72)

# The opponent walks in from the right (a ghost or copy fades in instead); they stop facing you
func opp_in(look, ghost: bool, walk := true) -> void:
	opp_ghost = ghost
	if is_instance_valid(opp):
		return
	opp = hero_at("opp", OPP if (ghost or not walk) else Vector2(StageView.W + 40, OPP.y), look, false)
	if ghost:
		opp.modulate = Color(0.75, 0.85, 1.0, 0.0)
		opp.create_tween().tween_property(opp, "modulate:a", 0.55, 0.6)
	elif walk:
		opp.walk_to(OPP, 300.0, 0.8)
		_face_later(opp, false, 0.82)

func _face_later(h: StageHero, right: bool, after: float) -> void:
	later(after, func():
		if is_instance_valid(h):
			h.face(right))

# Falling: a quick topple (away from the other fighter) and grey; bloody when it was the last heart
func fall(h: StageHero, bloody := false, quick := false) -> void:
	if not is_instance_valid(h):
		return
	var dir := -1.0 if h.scale.x > 0 else 1.0
	var tw := h.create_tween().set_parallel(true)
	tw.tween_property(h, "rotation", deg_to_rad(80) * dir, 0.05 if quick else 0.4)
	tw.tween_property(h, "modulate", Color(0.45, 0.42, 0.42, h.modulate.a), 0.05 if quick else 0.4)
	if bloody:
		blood_fx(stage, h.position, not quick)

func get_up(h: StageHero) -> void:
	if not is_instance_valid(h):
		return
	var tw := h.create_tween().set_parallel(true)
	tw.tween_property(h, "rotation", 0.0, 0.35)
	tw.tween_property(h, "modulate", Color(1, 1, 1, h.modulate.a), 0.35)

func walk_off(h: StageHero, right: bool) -> void:
	if not is_instance_valid(h):
		return
	if opp_ghost and h == opp:   # a ghost fades away
		h.create_tween().tween_property(h, "modulate:a", 0.0, 0.5)
		return
	h.walk_to(Vector2(StageView.W + 50.0 if right else -50.0, h.position.y), 260.0, 2.0)

# One heart breaks above a hero's head
func heart_break(h: StageHero) -> void:
	if is_instance_valid(h):
		heart_fx(stage, h.position)

static func heart_fx(st: StageView, world_pos: Vector2) -> void:
	var at := st.to_stage(world_pos + Vector2(0, -50))
	var ic := TextureRect.new()
	ic.texture = Art.icon("heart")
	ic.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.size = Vector2(30, 30)
	ic.pivot_offset = ic.size / 2.0
	ic.position = at - ic.size / 2.0
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	st.ui.add_child(ic)
	ic.scale = Vector2(0.2, 0.2)
	var tw := ic.create_tween()
	tw.tween_property(ic, "scale", Vector2(1.2, 1.2), 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(0.25)
	tw.tween_callback(func():
		ic.texture = Art.icon("heart_empty")
		ic.modulate = Color(1.6, 0.5, 0.5)
		Sfx.play("heart"))
	tw.tween_property(ic, "rotation", 0.25, 0.05)
	tw.tween_property(ic, "rotation", -0.25, 0.08)
	tw.tween_property(ic, "rotation", 0.0, 0.05)
	tw.tween_interval(0.5)
	tw.tween_property(ic, "modulate:a", 0.0, 0.5)
	tw.tween_callback(ic.queue_free)

# A pool of blood spreading under someone who went down for good
static func blood_fx(st: StageView, world_pos: Vector2, slow := true) -> void:
	var w := st.world_node()
	if not w:
		return
	var bl := TextureRect.new()
	bl.texture = Art.tex("res://art/ui/glow.png")
	bl.modulate = Color(0.55, 0.02, 0.02, 0.0 if slow else 0.9)
	bl.size = Vector2(20, 8) if slow else Vector2(84, 26)
	bl.position = world_pos + (Vector2(-10, 20) if slow else Vector2(-42, 12))
	bl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	w.add_child(bl)
	if slow:
		var bt := bl.create_tween().set_parallel(true)
		bt.tween_property(bl, "modulate:a", 0.9, 0.6).set_delay(0.3)
		bt.tween_property(bl, "size", Vector2(84, 26), 1.4).set_delay(0.3).set_ease(Tween.EASE_OUT)
		bt.tween_property(bl, "position", world_pos + Vector2(-42, 12), 1.4).set_delay(0.3).set_ease(Tween.EASE_OUT)

# A crown over the winner's head, sparks around them
func crown(h: StageHero) -> void:
	_crowned = h
	_crown = TextureRect.new()
	_crown.texture = Art.icon("crown")
	_crown.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_crown.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_crown.size = Vector2(52, 52)
	_crown.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.ui.add_child(_crown)
	_crown.modulate.a = 0.0
	_crown.create_tween().tween_property(_crown, "modulate:a", 1.0, 0.4)
	Sfx.play("fanfare")

func _sparks_at(at: Vector2) -> void:
	var world := stage.world_node()
	if not world:
		return
	for k in 3:
		var s := ColorRect.new()
		s.color = [Color("#ffe08a"), Color("#ffffff"), Color("#ff9ad0"), Color("#8ad8ff")][randi() % 4]
		s.size = Vector2(3, 3)
		s.position = at + Vector2(randf_range(-40, 40), randf_range(-60, -20))
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		s.z_index = 8
		world.add_child(s)
		var v := Vector2(randf_range(-30, 30), randf_range(-60, -20))
		var tw := s.create_tween().set_parallel(true)
		tw.tween_method(func(t: float): s.position = s.position + v * 0.016 + Vector2(0, 70.0) * t * 0.016, 0.0, 1.0, 1.0)
		tw.tween_property(s, "modulate:a", 0.0, 1.0)
		tw.chain().tween_callback(s.queue_free)

# The room darkens a little (people stay bright)
func dim(to := 0.38) -> void:
	if is_instance_valid(dim_rect):
		return
	dim_rect = ColorRect.new()
	dim_rect.color = Color(0, 0, 0, 0)
	dim_rect.position = Vector2(-800, -600)
	dim_rect.size = Vector2(StageView.W + 1600, StageView.H + 1200)
	dim_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dim_rect.z_index = 4
	stage.world_node().add_child(dim_rect)
	dim_rect.create_tween().tween_property(dim_rect, "color:a", to, 0.6)

# A big banner in the middle of the stage (how far you got, the winner)
func banner(title: String, sub := "") -> void:
	if is_instance_valid(big):
		big.queue_free()
	var p := Kit.panel("")
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := Kit.vbox(2)
	v.add_child(Kit.center(Kit.label(title, "Title", false, Art.GOLD)))
	if sub != "":
		v.add_child(Kit.center(Kit.label(sub, "Muted", true)))
	p.add_child(v)
	stage.ui.add_child(p)
	big = p
	p.modulate.a = 0.0
	p.create_tween().tween_property(p, "modulate:a", 1.0, 0.3)

# ---------- The line at the top (with a countdown) ----------
func top_line(text: String, ends := 0.0, notes: Array = []) -> void:
	if not is_instance_valid(top):
		top = Kit.panel("")
		top.mouse_filter = Control.MOUSE_FILTER_IGNORE
		top.self_modulate = Color(1, 1, 1, 0.92)
		stage.ui.add_child(top)
	Kit.clear(top)
	var v := Kit.vbox(2)
	if notes.size():
		v.custom_minimum_size.x = min(stage.size.x * 0.7, 520.0)
	var l := Kit.label(text, "Heading", false, Art.GOLD)
	l.name = "Line"
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	for n in notes:
		v.add_child(Kit.center(Kit.line(n)))
	top.add_child(v)
	top.visible = text != ""
	_top_text = text
	_top_ends = ends
	_tick_top()

func _tick_top() -> void:
	if not is_instance_valid(top) or top.get_child_count() == 0:
		return
	var l: Label = top.get_child(0).get_node_or_null("Line")
	if l:
		l.text = _top_text + (" %ds" % int(ceil(Game.secs_left(_top_ends))) if _top_ends > 0.0 else "")

# ---------- The face-off card: everything present.js sends about them, their gear to hover ----------
func face_card(o: Dictionary) -> void:
	if is_instance_valid(face):
		face.queue_free()
	var c: PanelContainer = Kit.opponent(o)
	var gear: Array = o.get("gear", [])
	if gear.size():
		var row := Kit.hbox(3)
		for it in gear:
			if it is Dictionary:
				row.add_child(Kit.item_slot(it, 22, "", true))
		var right: Control = c.get_child(0).get_child(1)
		right.add_child(Kit.label("Gear (hover for the card)", "Muted"))
		right.add_child(row)
	stage.ui.add_child(c)
	face = c
	face.modulate.a = 0.0
	face.create_tween().tween_property(face, "modulate:a", 1.0, 0.25).set_delay(0.5)

func _process(delta: float) -> void:
	_t += delta
	_tick_top()
	place_ui()
	if is_instance_valid(_crowned) and int(_t * 10.0) % 2 == 0:
		_sparks_at(_crowned.position)

func relayout() -> void:
	place_ui()

func place_ui() -> void:
	if not is_instance_valid(stage):
		return
	if is_instance_valid(top):
		top.reset_size()
		top.position = Vector2((stage.size.x - top.size.x) / 2.0, 8.0)
	if is_instance_valid(face):
		face.reset_size()
		var a := stage.to_stage(OPP + Vector2(-46, 0))   # beside the opponent, between the two of you
		var x := a.x - face.size.x
		var y := a.y - face.size.y / 2.0
		face.position = Vector2(clampf(x, 6.0, max(6.0, stage.size.x - face.size.x - 6.0)), clampf(y, 6.0 + (top.size.y + 8.0 if is_instance_valid(top) and top.visible else 0.0), max(6.0, stage.size.y - face.size.y - 6.0)))
	if is_instance_valid(big):
		big.reset_size()
		big.position = Vector2((stage.size.x - big.size.x) / 2.0, stage.size.y * 0.18)
	if is_instance_valid(_crown) and is_instance_valid(_crowned):
		var c := stage.to_stage(_crowned.position + Vector2(0, -52 + sin(_t * 3.0) * 2.0))
		_crown.position = c - _crown.size / 2.0

# ---------- After a fight on this spot (stage.last_fight) ----------
# Puts the two fighters where the fight left them, then plays what happens: the loser falls; you walk off to the right
# past them, or (you lost) a heart breaks over you, the winner walks off to the left and you get up and leave; or that
# was your last heart: you stay down, bloody, the room dims. done(out) is called when it's over.
func aftermath(done: Callable, leave := true) -> void:
	var L := stage.last_fight
	var a = stage.mv.arena
	var my_at := ME
	var op_at := OPP
	var my_side := "b" if L.get("mirror", false) else "a"
	if a and a.F.size():
		for id in a.F:
			var f: Dictionary = a.F[id]
			if f.m.get("ally", false) or f.m.get("hologram", false) or not is_instance_valid(f.node):
				continue
			if str(f.side) == my_side:
				my_at = f.node.position
			elif str(f.side) != my_side and op_at == OPP:
				op_at = f.node.position
	my_at = Vector2(clampf(my_at.x, 40, StageView.W - 40), clampf(my_at.y, 120, 300))
	op_at = Vector2(clampf(op_at.x, 40, StageView.W - 40), clampf(op_at.y, 120, 300))
	var hearts_now := int(Game.view.get("me", {}).get("hearts", 0))
	var lost_heart: bool = hearts_now < int(L.get("hearts", hearts_now))
	var out: bool = hearts_now <= 0 or bool(Game.view.get("out", false))
	me = hero_at("me", my_at, null, op_at.x >= my_at.x)
	var ov = L.get("opp")
	if L.get("kind", "") != "fight":
		opp_ghost = ov is Dictionary and ov.get("ghost", false)
		opp = hero_at("opp", op_at, ov, op_at.x < my_at.x)
		if opp_ghost:
			opp.modulate = Color(0.75, 0.85, 1.0, 0.55)
	var won: bool = L.get("won", false)
	var draw: bool = L.get("draw", false)
	if L.get("tail", false):   # the fight's tail already showed the start: carry on from there
		if won:
			me.visible = false   # you already walked off
			fall(opp, false, true)
			later(0.3, func(): done.call(false))
		elif out:
			fall(me, true, true)
			if opp:
				opp.visible = false
			dim()
			later(0.4, func(): done.call(true))
		else:
			if opp:
				opp.visible = false   # the winner already left
			if not draw:
				fall(me, false, true)
				later(0.5, func(): get_up(me))
			if leave:
				later(0.9, func(): walk_off(me, true))
			later(1.2, func(): done.call(false))
		return
	if won:   # they're down; you walk off past them
		fall(opp, false, true)
		if leave:
			later(0.6, func(): walk_off(me, true))
		later(1.6, func(): done.call(false))
	elif out:   # your last heart: you stay down, bloody; the room dims
		fall(me, true, true)
		if opp:
			later(0.9, func(): walk_off(opp, false))
		later(0.7, func(): dim())
		later(1.0, func(): done.call(true))
	elif lost_heart or draw:   # a heart breaks over you; the winner leaves to the left, past you; you get up and go
		if not draw:
			fall(me, false, true)
		later(0.25, func(): heart_break(me))
		later(0.9, func(): walk_off(opp, false))
		if not draw:
			later(1.9, func(): get_up(me))
		if leave:
			later(2.3, func(): walk_off(me, true))
		later(2.6, func(): done.call(false))
	else:   # nobody lost a heart (a ghost fight that ran out of time)
		if leave:
			later(0.4, func(): walk_off(me, true))
		walk_off(opp, false)
		later(1.2, func(): done.call(false))

# Run f after t seconds, unless this room is gone by then
func later(t: float, f: Callable) -> void:
	var tw := create_tween()
	tw.tween_interval(max(0.01, t))
	tw.tween_callback(f)
