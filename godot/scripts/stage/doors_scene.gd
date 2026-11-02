# The doors: a corridor whose back wall holds one door per choice. Above each door a plaque says what it is; hover or
# focus shows the full card beside it. Click (or keys 1-3) selects: your hero walks to it and the card stays, with an
# Enter button. A second click, Enter, or the button goes through: the choice is sent at once, the door opens, the hero
# steps in, and the next room slides in as soon as the server has it (the animation never holds the clock).
extends Control

const FULL_FLOOR := false
static func use_full_floor(_prev: String) -> bool:
	return false
static func same_room(_prev: String) -> bool:
	return false
const DOOR_W := 96.0            # door sprites are 48x64, drawn at 2x
const DOOR_H := 128.0
var stage: StageView
var doors: Array = []           # [{ d, btn, x }]
var selected := -1
var hovered := -1
var gone := false               # the choice is sent
var card: PanelContainer
var hero: StageHero
var plaques: Array = []         # drawn unscaled over the stage (scaled text would blur), placed over each door

# Same doors = same room; anything else is a new room (a rebuild)
static func key_for(sc: Dictionary) -> String:
	var ids := []
	for sec in sc.get("sections", []):
		for d in sec.get("doors", []):
			ids.append(str(d.get("type", "")) + ":" + str(d.get("plaque", "")))
	return ",".join(ids)

static func doors_of(sc: Dictionary) -> Array:
	for sec in sc.get("sections", []):
		if sec.get("kind") == "doors":
			return sec.get("doors", [])
	return []

func build(sc: Dictionary) -> void:
	var world := stage.world_node()
	var list := doors_of(sc)
	var n := list.size()
	for i in n:
		var d: Dictionary = list[i]
		var x := StageView.W * float(i + 1) / float(n + 1)
		var b := TextureButton.new()
		b.texture_normal = Art.tex("res://art/doors/%s.png" % str(d.get("type", "fight")))
		if b.texture_normal == null:
			b.texture_normal = Art.tex("res://art/doors/fight.png")
		b.ignore_texture_size = true
		b.stretch_mode = TextureButton.STRETCH_SCALE
		b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		b.size = Vector2(DOOR_W, DOOR_H)
		b.position = Vector2(x - DOOR_W / 2.0, StageView.FLOOR_Y - DOOR_H)
		b.focus_mode = Control.FOCUS_ALL
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.tooltip_text = ""
		var idx := i
		b.pressed.connect(func(): _click(idx))
		b.mouse_entered.connect(func(): _hover(idx, true))
		b.mouse_exited.connect(func(): _hover(idx, false))
		b.focus_entered.connect(func(): _hover(idx, true))
		b.focus_exited.connect(func(): _hover(idx, false))
		world.add_child(b)
		var pl := _plaque(d, i)
		pl.modulate.a = 0.0   # shows once the room has slid in (it isn't part of the sliding world)
		pl.create_tween().tween_property(pl, "modulate:a", 1.0, 0.15).set_delay(StageView.SLIDE)
		stage.ui.add_child(pl)
		plaques.append(pl)
		doors.append({ "d": d, "btn": b, "x": x })
	relayout.call_deferred()
	hero = stage.spawn_hero("me", Vector2(28.0, StageView.HERO_Y))   # walks in from the left
	hero.walk_to(Vector2(StageView.W * 0.14, StageView.HERO_Y), 360.0, 0.4)

func refresh(_sc: Dictionary) -> void:
	_show_card()

func relayout() -> void:
	for i in plaques.size():
		var p: Control = plaques[i]
		if not is_instance_valid(p):
			continue
		p.reset_size()
		var at := stage.to_stage(Vector2(doors[i].x, StageView.FLOOR_Y - DOOR_H - 4.0))
		p.position = Vector2(at.x - p.size.x / 2.0, at.y - p.size.y)
	_show_card()

func _exit_tree() -> void:
	for p in plaques:
		if is_instance_valid(p):
			p.queue_free()

# The plaque over a door: its icon, a few words, and the threat skulls for fights
func _plaque(d: Dictionary, i: int) -> Control:
	var p := Kit.panel("Card")
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 3)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(Kit.label(str(i + 1), "Muted"))
	row.add_child(Kit.icon(Art.icon(str(d.get("icon", ""))), 16))
	row.add_child(Kit.label(str(d.get("plaque", d.get("title", ""))), "Heading"))
	v.add_child(row)
	var th = d.get("threat")
	if th is Dictionary:
		var sk := HBoxContainer.new()
		sk.add_theme_constant_override("separation", 1)
		sk.alignment = BoxContainer.ALIGNMENT_CENTER
		if th.get("estimate", false):
			sk.add_child(Kit.label("%s · %d%% win" % [th.level, int(th.winPct)], "", false, Art.GOLD))
		else:
			for k in 5:
				sk.add_child(Kit.icon(Art.icon("skull"), 12, Color.WHITE if k < int(th.get("skulls", 1)) else Color(1, 1, 1, 0.18)))
		v.add_child(sk)
	p.add_child(v)
	return p

# ---------- Choosing ----------
func _hover(i: int, on: bool) -> void:
	hovered = i if on else (-1 if hovered == i else hovered)
	_show_card()

func _click(i: int) -> void:
	if gone:
		return
	if selected == i:
		confirm()
		return
	select(i)

func select(i: int) -> void:
	if gone or i < 0 or i >= doors.size():
		return
	selected = i
	doors[i].btn.grab_focus()
	hero.walk_to(Vector2(doors[i].x - 44.0, StageView.HERO_Y))
	_show_card()

func confirm() -> void:
	if gone or selected < 0:
		return
	gone = true
	var D: Dictionary = doors[selected]
	var b: Dictionary = D.d.get("button", {})
	Game.act(str(b.get("act", "chooseDoor")), b.get("args", [selected]), bool(b.get("mp", false)))   # at once: the room starts now
	stage.begin_exit()
	_show_card()
	# The door opens and the hero steps through (the next room slides in as soon as it's here)
	D.btn.texture_normal = Art.tex("res://art/doors/open.png")
	var tw := hero.create_tween()
	tw.tween_property(hero, "position", Vector2(D.x - 30.0, StageView.HERO_Y), 0.12)
	tw.tween_property(hero, "position", Vector2(D.x, StageView.FLOOR_Y - 26.0), 0.16)
	tw.parallel().tween_property(hero, "modulate:a", 0.0, 0.16)

func _unhandled_input(ev: InputEvent) -> void:
	if gone or not is_visible_in_tree() or not (ev is InputEventKey) or not ev.pressed or ev.echo:
		return
	if ev.keycode >= KEY_1 and ev.keycode <= KEY_9:
		select(ev.keycode - KEY_1)
		get_viewport().set_input_as_handled()
	elif ev.keycode == KEY_ENTER or ev.keycode == KEY_KP_ENTER:
		if selected < 0 and doors.size() == 1:
			select(0)
		confirm()
		get_viewport().set_input_as_handled()

# ---------- The card beside a door: the full text present.js sends (hover, focus, or pinned when selected) ----------
func _show_card() -> void:
	if is_instance_valid(card):
		card.queue_free()
	card = null
	var i := selected if selected >= 0 else hovered
	if gone or i < 0 or i >= doors.size():
		return
	var d: Dictionary = doors[i].d
	card = Kit.panel("Card")
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var v := Kit.vbox(4)
	v.custom_minimum_size = Vector2(250, 0)
	var head := Kit.hbox(6)
	head.add_child(Kit.icon(Art.icon(str(d.get("icon", ""))), 28))
	head.add_child(Kit.label(str(d.get("title", "")), "Heading", true))
	v.add_child(head)
	v.add_child(Kit.dual(str(d.get("text", "")), d.get("short"), "", true))
	var th = d.get("threat")
	if th is Dictionary:
		if th.get("estimate", false):
			v.add_child(Kit.label("%s · ~%d dmg · %d%% win" % [th.level, int(th.avgLoss), int(th.winPct)], "", true, Art.GOLD))
		else:
			var sk := Kit.hbox(2)
			for k in 5:
				sk.add_child(Kit.icon(Art.icon("skull"), 14, Color.WHITE if k < int(th.get("skulls", 1)) else Color(1, 1, 1, 0.18)))
			sk.add_child(Kit.label(" threat", "Muted"))
			v.add_child(sk)
	if d.get("short"):
		v.add_child(Kit.detail_hint())
	if i == selected:
		var b: Dictionary = (d.get("button", {}) as Dictionary).duplicate()
		var enter := Button.new()
		enter.text = "Enter  (Enter)"
		enter.theme_type_variation = "Primary"
		enter.disabled = not b.get("enabled", true)
		enter.pressed.connect(confirm)
		v.add_child(enter)
		v.add_child(Kit.label("Or click the door again.", "Muted", true))
	else:
		v.add_child(Kit.label("Click or press %d to choose." % (i + 1), "Muted", true))
	card.add_child(v)
	Kit.fit_width(card, 250.0 + 20.0)
	stage.ui.add_child(card)
	card.reset_size()
	# Beside the door: to its right, or its left when there's no room
	var at := stage.to_stage(Vector2(doors[i].x + DOOR_W / 2.0 + 6.0, StageView.FLOOR_Y - DOOR_H))
	if at.x + card.size.x > stage.size.x - 6.0:
		at = stage.to_stage(Vector2(doors[i].x - DOOR_W / 2.0 - 6.0, StageView.FLOOR_Y - DOOR_H)) - Vector2(card.size.x, 0)
	at.x = clampf(at.x, 6.0, max(6.0, stage.size.x - card.size.x - 6.0))
	at.y = clampf(at.y, 6.0, max(6.0, stage.size.y - card.size.y - 6.0))
	card.position = at
