# Plunder on the stage: a treasure room with a long banquet table, the pile laid out on it in rows (weapons, armor,
# then bag items and relics), and every player still in standing around it (you in front). Each hero shows their place
# in the pick order; on a turn, that hero steps up to the table (a timer bar over a player's head), reaches out, and
# the item lifts off the table and flies to them ("Vex took Iron Helm of Fury"); a pass sends coins instead. A taken
# item's spot stays empty, so the table empties as the round goes.
#
# Everything comes from the screen present.js sends (phase "shop"): the pile is the cards section, the pick order is the
# list section (each row: id, look, pick, pass, now), the look phase is the review section, Pass is in the buttons. Who
# took what is found by comparing two screens (a row's pick appears, an item with that name leaves the pile).
#
# Hover any item for its full card. On your turn the stage zooms in a little and the items are yours to pick: click to
# select (the card stays with Take), click again or Enter to take; Pass is in the bar at the bottom. Tab (or List) opens
# the whole pile as cards over the stage; Esc or a click outside closes it. Picks are sent at once.
extends Control

const NO_BANNER := true
const FULL_FLOOR := true
const ITEM := 30.0                                   # item sprites on the table (world units)
const TABLE := Rect2(136, 124, 368, 144)             # the banquet table (184x72 art at 2x)
const ROW_Y := [144.0, 178.0, 212.0]                 # item rows on the table top
const ME_SEAT := Vector2(320, 314)
const SEATS := [Vector2(320, 90), Vector2(196, 90), Vector2(444, 90), Vector2(184, 314), Vector2(456, 314), Vector2(74, 196), Vector2(566, 196)]
const ZOOM := 1.14

static func use_full_floor(_prev: String) -> bool:
	return true

static func same_room(_prev: String) -> bool:
	return false

static func key_for(_sc: Dictionary) -> String:
	return ""

var stage: StageView
var heroes := {}           # id -> { node, seat, me, row, label, bar, glow }
var items := {}            # item id -> { c, item, pos, holder, btn, label, taken }
var order_ids: Array = []  # item ids in table order (keys 1-9)
var rows: Array = []       # the pick order as last seen
var laid := false
var my_turn := false
var reviewing := false
var review_ends := 0.0
var turn_start := 0.0
var turn_total := 20000.0
var now_id := ""
var notes: Array = []
var lede := ""
var pass_buttons: Array = []
var selected := ""
var hovered := ""
var card: Control
var status: PanelContainer
var toasts: VBoxContainer
var bar: PanelContainer
var list_ov: Control
var _row_w := 60.0
var _seat_n := 0

func build(sc: Dictionary) -> void:
	var world := stage.world_node()
	_prop(world, "chest_open", Vector2(110, 122))
	_prop(world, "goldpile", Vector2(540, 122))
	_prop(world, "banquet", TABLE.position + Vector2(TABLE.size.x / 2.0, TABLE.size.y))
	status = Kit.panel("")
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status.self_modulate = Color(1, 1, 1, 0.92)
	stage.ui.add_child(status)
	toasts = Kit.vbox(4)
	toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.ui.add_child(toasts)
	_apply(sc, true)
	Game.acted.connect(_on_act)

func refresh(sc: Dictionary) -> void:
	_apply(sc, false)

func relayout() -> void:
	_place_ui()

func _exit_tree() -> void:
	for n in [status, toasts, bar, card, list_ov]:
		if is_instance_valid(n):
			n.queue_free()
	for id in items:
		if is_instance_valid(items[id].get("label")):
			items[id].label.queue_free()
	for id in heroes:
		if is_instance_valid(heroes[id].get("label")):
			heroes[id].label.queue_free()
	if Game.acted.is_connected(_on_act):
		Game.acted.disconnect(_on_act)

func _prop(world: Control, name: String, bottom_center: Vector2) -> TextureRect:
	var t := Art.tex("res://art/props/%s.png" % name)
	var r := TextureRect.new()
	r.texture = t
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.size = t.get_size() * 2.0 if t else Vector2.ZERO
	r.position = bottom_center - Vector2(r.size.x / 2.0, r.size.y)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	world.add_child(r)
	return r

# ---------- A new screen: who's here, what's left, whose turn ----------
func _apply(sc: Dictionary, first: bool) -> void:
	var cards: Array = []
	var new_rows: Array = []
	var list_sec: Dictionary = {}
	reviewing = false
	pass_buttons = []
	for sec in sc.get("sections", []):
		match str(sec.get("kind", "")):
			"cards": cards = sec.get("cards", [])
			"list":
				list_sec = sec
				new_rows = sec.get("rows", [])
			"review":
				reviewing = true
				review_ends = float(sec.get("ends", 0))
			"buttons": pass_buttons.append_array(sec.get("buttons", []))
	notes = sc.get("notes", [])
	lede = str(sc.get("lede", ""))
	turn_start = float(list_sec.get("turnStart", 0))
	turn_total = float(list_sec.get("turnTotal", 20000))
	# Heroes around the table
	for r in new_rows:
		var id := str(r.get("id", r.get("name", "")))
		if not heroes.has(id):
			_add_hero(id, r)
		heroes[id].row = r
		_hero_label(heroes[id])
	# The pile
	if not laid and cards.size():
		_lay(cards)
	var live := {}
	for c in cards:
		var it = c.get("item")
		if it is Dictionary:
			live[str(it.get("id", ""))] = true
			if items.has(str(it.id)):
				items[str(it.id)].c = c
				items[str(it.id)].item = it
	# Who took what (a row's pick appeared since the last screen)
	if not first:
		var old := {}
		for r in rows:
			old[str(r.get("id", ""))] = r
		for r in new_rows:
			var id := str(r.get("id", ""))
			var was: Dictionary = old.get(id, {})
			if (r.get("pick") or r.get("pass", false)) and not (was.get("pick") or was.get("pass", false)):
				_picked(id, r, live)
	# Anything else gone from the pile (an update we missed): just fade it out
	for iid in items:
		if not items[iid].taken and not live.has(iid) and laid:
			_vanish(iid)
	rows = new_rows
	# Whose turn
	var turn := ""
	var mine := false
	for r in new_rows:
		if r.get("now", false):
			turn = str(r.get("id", ""))
			mine = r.get("me", false)
	if turn != now_id:
		if now_id != "" and heroes.has(now_id) and not _has_pick(now_id):
			_go_back(now_id, 0.0)
		now_id = turn
		if turn != "" and heroes.has(turn):
			_step_up(turn)
	if mine != my_turn:
		my_turn = mine
		stage.set_zoom(ZOOM if mine else 1.0, Vector2(StageView.W / 2.0, TABLE.get_center().y + 30.0))
		if not mine:
			selected = ""
	_action_bar()
	_status()
	_show_card()
	if is_instance_valid(list_ov):
		_open_list()
	_place_ui.call_deferred()

func _has_pick(id: String) -> bool:
	for r in rows:
		if str(r.get("id", "")) == id:
			return r.get("pick") != null or r.get("pass", false)
	return false

func _add_hero(id: String, r: Dictionary) -> void:
	var me: bool = r.get("me", false)
	var seat: Vector2 = ME_SEAT if me else SEATS[min(_seat_n, SEATS.size() - 1)]
	if not me:
		_seat_n += 1
	var world := stage.world_node()
	var glow: TextureRect = null
	if me:   # you: a warm light at your feet
		glow = TextureRect.new()
		glow.texture = Art.tex("res://art/ui/glow.png")
		glow.modulate = Color(1.0, 0.82, 0.35, 0.45)
		glow.size = Vector2(90, 34)
		glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		world.add_child(glow)
	var lk = r.get("look")
	var h := stage.spawn_hero(id, seat, lk if lk is Dictionary else null)
	h.face(seat.x <= StageView.W / 2.0)
	if me:
		h.modulate = Color(1.12, 1.1, 1.05)
	var lab := Kit.vbox(0)
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.ui.add_child(lab)
	heroes[id] = { "node": h, "seat": seat, "me": me, "row": r, "label": lab, "bar": null, "glow": glow }

# Over each hero: their place in the pick order and name, their hearts, and on a player's turn the timer bar
func _hero_label(H: Dictionary) -> void:
	var lab: VBoxContainer = H.label
	Kit.clear(lab)
	var r: Dictionary = H.row
	var top := Kit.hbox(3)
	top.alignment = BoxContainer.ALIGNMENT_CENTER
	var now: bool = r.get("now", false)
	top.add_child(Kit.label("%d" % int(r.get("n", 0)), "Heading", false, Art.GOLD if now else Art.MUTED))
	var nm := Kit.label(str(r.get("name", "")), "Heading" if H.me else "", false, Art.GOLD if H.me else Art.TEXT)
	top.add_child(nm)
	lab.add_child(top)
	var hearts := Kit.hearts(int(r.get("hearts", 0)), 3, 9)
	hearts.alignment = BoxContainer.ALIGNMENT_CENTER
	lab.add_child(hearts)
	H.bar = null
	if now and not r.get("bot", false):
		var b := Kit.bar(1.0, 1.0, Art.EMBER, "", 5)
		b.custom_minimum_size = Vector2(64, 5)
		lab.add_child(b)
		H.bar = b
	elif now:
		lab.add_child(Kit.center(Kit.label("picking...", "Muted")))
	elif r.get("pick") or r.get("pass", false):
		var t := Kit.label("passed" if r.get("pass", false) else "took one", "Muted")
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lab.add_child(t)
	lab.reset_size()

# ---------- The pile on the table ----------
func _cat(it: Dictionary) -> int:
	var k := str(it.get("kind", ""))
	if k == "consumable" or k == "relic":
		return 2
	return 0 if str(it.get("slot", "")) == "weapon" else 1

func _lay(cards: Array) -> void:
	laid = true
	var by := [[], [], []]
	for c in cards:
		var it = c.get("item")
		if it is Dictionary:
			by[_cat(it)].append(c)
	var used := by.filter(func(a): return a.size() > 0)
	var most := 1
	for a in used:
		most = max(most, a.size())
	_row_w = min(66.0, (TABLE.size.x - 24.0) / float(most))
	var world := stage.world_node()
	for ri in used.size():
		var row: Array = used[ri]
		var y: float = ({ 1: [178.0], 2: [158.0, 200.0] } as Dictionary).get(used.size(), ROW_Y)[ri]
		for k in row.size():
			var c: Dictionary = row[k]
			var it: Dictionary = c.item
			var id := str(it.get("id", ""))
			var pos := Vector2(StageView.W / 2.0 + (k - (row.size() - 1) / 2.0) * _row_w, y)
			var holder := Control.new()
			holder.position = pos - Vector2(ITEM, ITEM) / 2.0
			holder.size = Vector2(ITEM, ITEM)
			holder.pivot_offset = holder.size / 2.0
			holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
			world.add_child(holder)
			var g := TextureRect.new()   # a soft glow in its rarity color (artifacts glow red)
			g.texture = Art.tex("res://art/ui/glow.png")
			var art: bool = str(it.get("rarity", "")) == "artifact"
			var col: Color = Color(1, 0.25, 0.15) if art else Art.color(it.get("color"), Art.TEXT)
			g.modulate = Color(col, 0.75 if art else 0.45)
			g.size = Vector2(ITEM, ITEM) * 1.9
			g.position = -Vector2(ITEM, ITEM) * 0.45
			g.mouse_filter = Control.MOUSE_FILTER_IGNORE
			holder.add_child(g)
			if art:
				var tw := g.create_tween().set_loops()
				tw.tween_property(g, "modulate:a", 0.35, 0.8).set_trans(Tween.TRANS_SINE)
				tw.tween_property(g, "modulate:a", 0.9, 0.8).set_trans(Tween.TRANS_SINE)
			var b := TextureButton.new()
			b.texture_normal = Art.icon(str(it.get("icon", "")))
			b.ignore_texture_size = true
			b.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
			b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			b.size = Vector2(ITEM, ITEM)
			b.focus_mode = Control.FOCUS_NONE
			b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
			b.pressed.connect(func(): _click(id))
			b.mouse_entered.connect(func(): hovered = id; _show_card())
			b.mouse_exited.connect(func():
				if hovered == id:
					hovered = ""
				_show_card())
			holder.add_child(b)
			var lab := _item_label(it)
			stage.ui.add_child(lab)
			items[id] = { "c": c, "item": it, "pos": pos, "holder": holder, "btn": b, "label": lab, "taken": false }
			order_ids.append(id)

func _item_label(it: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 2)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var nm := Kit.label(str(it.get("name", "")), "Muted", false, Art.color(it.get("color"), Art.TEXT))
	var natural := nm.get_minimum_size().x
	nm.clip_text = true
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nm.set_meta("natural", natural)
	row.add_child(nm)
	if it.get("set") is Dictionary and Art.class_icon(it.set.get("id", "")):
		row.add_child(Kit.icon(Art.class_icon(it.set.id), 10))
	return row

func _vanish(iid: String) -> void:
	var e: Dictionary = items[iid]
	e.taken = true
	if is_instance_valid(e.label):
		e.label.queue_free()
	var tw: Tween = e.holder.create_tween()
	tw.tween_property(e.holder, "modulate:a", 0.0, 0.25)
	if selected == iid:
		selected = ""
	if hovered == iid:
		hovered = ""

# ---------- Turns ----------
func _step_pos(id: String) -> Vector2:
	var s: Vector2 = heroes[id].seat
	if heroes[id].me:
		return s + Vector2(0, -36)
	if s.y < 150.0:
		return s + Vector2(0, 26)
	if s.y > 280.0:
		return s + Vector2(0, -36)
	return s + Vector2(40 if s.x < StageView.W / 2.0 else -40, 0)

func _step_up(id: String) -> void:
	var h: StageHero = heroes[id].node
	h.walk_to(_step_pos(id), 200.0, 0.35)
	_face_table(id)

func _face_table(id: String) -> void:
	var h: StageHero = heroes[id].node
	h.get_tree().create_timer(0.4).timeout.connect(func():
		if is_instance_valid(h):
			h.face(heroes[id].seat.x <= StageView.W / 2.0))

func _go_back(id: String, delay: float) -> void:
	var h: StageHero = heroes[id].node
	var back := func():
		if is_instance_valid(h):
			h.walk_to(heroes[id].seat, 160.0, 0.4)
			_face_table(id)
	if delay > 0.0:
		get_tree().create_timer(delay).timeout.connect(back)
	else:
		back.call()

# Someone picked: the item lifts off the table and flies to them, or coins fly to them for a pass; then they walk back
func _picked(id: String, r: Dictionary, live: Dictionary) -> void:
	if not heroes.has(id):
		return
	var who: String = "You" if r.get("me", false) else str(r.get("name", ""))
	if r.get("pass", false):
		if not heroes[id].get("anim_done", false):
			_coins(id)
		_toast("%s passed for gold." % who, Art.GOLD)
	else:
		var name := str(r.pick)
		var iid := ""
		for k in items:   # the item with that name that just left the pile (yours may already be on its way)
			if str(items[k].item.get("name", "")) == name and not live.has(k):
				if iid == "" or not items[k].taken:
					iid = k
		var col: Color = Art.color(items[iid].item.get("color"), Art.TEXT) if iid != "" else Art.TEXT
		if iid != "" and not items[iid].taken:
			_take(iid, id)
		_toast("%s took %s" % [who, name], col)
	heroes[id].erase("anim_done")
	_go_back(id, 0.5)

func _take(iid: String, id: String) -> void:
	var e: Dictionary = items[iid]
	e.taken = true
	if is_instance_valid(e.label):
		e.label.queue_free()
	if selected == iid:
		selected = ""
	if hovered == iid:
		hovered = ""
	_show_card()
	var h: StageHero = heroes[id].node
	var reach := h.position.lerp(e.pos, 0.12)
	var ht := h.create_tween()
	ht.tween_property(h, "position", reach, 0.1)
	ht.tween_property(h, "position", h.position, 0.12)
	var hd: Control = e.holder
	var tw := hd.create_tween()
	tw.tween_property(hd, "position:y", hd.position.y - 10.0, 0.1).set_ease(Tween.EASE_OUT)
	tw.tween_property(hd, "position", h.position - hd.size / 2.0 + Vector2(0, -4), 0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(hd, "scale", Vector2(0.5, 0.5), 0.3)
	tw.tween_property(hd, "modulate:a", 0.0, 0.1)
	Sfx.play("coin")

func _coins(id: String) -> void:
	var world := stage.world_node()
	var to: Vector2 = heroes[id].node.position
	var from := TABLE.get_center() + Vector2(0, -20)
	Sfx.play("coin")
	for k in 6:
		var c := TextureRect.new()
		c.texture = Art.icon("coin")
		c.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		c.size = Vector2(14, 14)
		c.position = from - Vector2(7, 7)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		c.z_index = 8
		world.add_child(c)
		var up := (from + to) / 2.0 - Vector2(0, randf_range(40, 70))
		var end := to + Vector2(randf_range(-10, 10), randf_range(-8, 8))
		var tw := c.create_tween()
		tw.tween_method(func(t: float): c.position = (1 - t) * (1 - t) * from + 2 * (1 - t) * t * up + t * t * end - Vector2(7, 7), 0.0, 1.0, 0.4).set_delay(k * 0.05)
		tw.tween_property(c, "modulate:a", 0.0, 0.12)
		tw.tween_callback(c.queue_free)

# Your own pick or pass shows at once (it's sent at once); the next screen just confirms it
func _on_act(fn: String, args: Array) -> void:
	if not is_visible_in_tree():
		return
	var me := _me_id()
	if me == "":
		return
	if fn == "playerShopPick" and args.size() and items.has(str(args[0])) and not items[str(args[0])].taken:
		_take(str(args[0]), me)
		_close_list()
	elif fn == "playerShopPass":
		_coins(me)
		heroes[me]["anim_done"] = true
		_close_list()
	else:
		return
	var last := true   # the last pick ends the Plunder at once: let this one show before the next room comes in
	for r in rows:
		if not r.get("me", false) and not (r.get("pick") or r.get("pass", false)):
			last = false
	if last:
		stage.begin_exit(0.7)
	my_turn = false
	selected = ""
	stage.set_zoom(1.0, stage.zoom_at)
	_action_bar(true)
	_show_card()

func _me_id() -> String:
	for id in heroes:
		if heroes[id].me:
			return id
	return ""

# ---------- Choosing ----------
func _click(id: String) -> void:
	if not items.has(id) or items[id].taken:
		return
	if my_turn and selected == id:
		confirm()
		return
	selected = "" if selected == id else id
	_show_card()

func _take_button(e: Dictionary) -> Dictionary:
	for b in e.c.get("buttons", []):
		if b.get("enabled", true) and str(b.get("act", "")) == "playerShopPick":
			return b
	return {}

func confirm() -> void:
	if not my_turn or selected == "" or not items.has(selected):
		return
	var b := _take_button(items[selected])
	if not b.is_empty():
		Kit.press(b)   # at once; the animation follows (Game.acted)

func _input(ev: InputEvent) -> void:
	if not is_visible_in_tree() or not (ev is InputEventKey) or not ev.pressed or ev.echo:
		return
	if get_viewport().gui_get_focus_owner() is LineEdit:
		return
	match ev.keycode:
		KEY_TAB:
			if is_instance_valid(list_ov):
				_close_list()
			else:
				_open_list()
			get_viewport().set_input_as_handled()
		KEY_ESCAPE:
			if is_instance_valid(list_ov):
				_close_list()
				get_viewport().set_input_as_handled()
			elif selected != "":
				selected = ""
				_show_card()
				get_viewport().set_input_as_handled()
		KEY_ENTER, KEY_KP_ENTER:
			if my_turn and selected != "" and not is_instance_valid(list_ov):
				confirm()
				get_viewport().set_input_as_handled()
		_:
			var i: int = ev.keycode - KEY_1
			if my_turn and i >= 0 and i < 9 and not is_instance_valid(list_ov):
				var left := order_ids.filter(func(k): return not items[k].taken)
				if i < left.size():
					_click(left[i])
					get_viewport().set_input_as_handled()

# The full card beside an item (hover anytime; pinned with Take when you selected it on your turn)
func _show_card() -> void:
	if is_instance_valid(card):
		card.queue_free()
	card = null
	var id := selected if selected != "" else hovered
	if id == "" or not items.has(id) or items[id].taken or is_instance_valid(list_ov):
		return
	var e: Dictionary = items[id]
	card = Kit.item_tip(e.item)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var v: VBoxContainer = card.get_child(0)
	if my_turn and id == selected:
		var b := _take_button(e)
		if not b.is_empty():
			var btn := Kit.button(b)
			btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			v.add_child(btn)
			v.add_child(Kit.label("Or click it again, or press Enter.", "Muted", true))
		else:
			for x in e.c.get("buttons", []):   # can't take it (bag full...): say why
				v.add_child(Kit.label(str(x.get("label", "")), "Muted", true))
	elif my_turn:
		v.add_child(Kit.label("Click to choose.", "Muted", true))
	Kit.fit_width(card, 270.0)
	stage.ui.add_child(card)
	_place_card()

func _place_card() -> void:
	var id := selected if selected != "" else hovered
	if not is_instance_valid(card) or not items.has(id):
		return
	card.reset_size()
	var p: Vector2 = items[id].pos
	var at := stage.to_stage(p + Vector2(ITEM / 2.0 + 8.0, -ITEM))
	if at.x + card.size.x > stage.size.x - 6.0:
		at = stage.to_stage(p - Vector2(ITEM / 2.0 + 8.0, ITEM)) - Vector2(card.size.x, 0)
	at.x = clampf(at.x, 6.0, max(6.0, stage.size.x - card.size.x - 6.0))
	at.y = clampf(at.y, 6.0, max(6.0, stage.size.y - card.size.y - 6.0))
	card.position = at

# ---------- The bar at the bottom (List; on your turn, Pass) and the line at the top ----------
func _action_bar(picked := false) -> void:
	if is_instance_valid(bar):
		bar.queue_free()
	bar = Kit.panel("")
	var row := Kit.hbox(8)
	if my_turn and not picked:
		for b in pass_buttons:
			row.add_child(Kit.button(b))
	var lb := Kit.button({ "label": "List (Tab)", "style": "ghost" })
	lb.pressed.connect(_open_list)
	row.add_child(lb)
	bar.add_child(row)
	bar.visible = not is_instance_valid(list_ov)
	stage.ui.add_child(bar)

func _status() -> void:
	Kit.clear(status)
	var v := Kit.vbox(2)
	if notes.size():
		v.custom_minimum_size.x = min(stage.size.x * 0.7, 520.0)
	var l := Kit.label("", "Heading", false, Art.GOLD)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.name = "Line"
	v.add_child(l)
	for n in notes:
		v.add_child(Kit.center(Kit.line(n)))
	status.add_child(v)
	_status_line()

func _status_line() -> void:
	if not is_instance_valid(status) or status.get_child_count() == 0:
		return
	var l: Label = status.get_child(0).get_node_or_null("Line")
	if not l:
		return
	var t := ""
	if not laid:
		t = "Plunder: the pile is being laid out..."
	elif reviewing:
		t = "Plunder: look over the pile. Picks start in %ds" % int(ceil(Game.secs_left(review_ends)))
	elif my_turn:
		t = "Your turn: pick one, or pass for gold (%ds)" % int(ceil(_turn_left()))
	elif now_id != "" and heroes.has(now_id) and heroes[now_id].me:
		t = "Plunder: your pick is in"
	elif now_id != "" and heroes.has(now_id):
		t = "Plunder: %s is picking" % str(heroes[now_id].row.get("name", ""))
	else:
		t = "Plunder"
	if l.text != t:
		l.text = t

func _turn_left() -> float:
	if turn_start <= 0.0:
		return turn_total / 1000.0
	return max(0.0, turn_total / 1000.0 - (Game.now_ms() - Game.local_ms(turn_start)) / 1000.0)

func _toast(text: String, col: Color) -> void:
	var p := Kit.panel("")
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := Kit.label(text, "Heading", false, col)
	p.add_child(l)
	toasts.add_child(p)
	p.modulate.a = 0.0
	var tw := p.create_tween()
	tw.tween_property(p, "modulate:a", 1.0, 0.12)
	tw.tween_interval(2.2)
	tw.tween_property(p, "modulate:a", 0.0, 0.4)
	tw.tween_callback(p.queue_free)

# ---------- Every frame: labels follow the heroes (and the zoom); timers count down ----------
func _process(_d: float) -> void:
	_place_ui()
	_status_line()
	if now_id != "" and heroes.has(now_id) and is_instance_valid(heroes[now_id].get("bar")):
		var b: ProgressBar = heroes[now_id].bar
		b.max_value = turn_total / 1000.0
		b.value = _turn_left()

func _place_ui() -> void:
	if not is_instance_valid(stage):
		return
	var k := stage.k_scale()
	for id in heroes:
		var H: Dictionary = heroes[id]
		var h: StageHero = H.node
		if not is_instance_valid(h):
			continue
		if is_instance_valid(H.label):
			H.label.reset_size()
			var at := stage.to_stage(h.position + Vector2(0, -36))
			H.label.position = Vector2(at.x - H.label.size.x / 2.0, at.y - H.label.size.y)
		if H.glow:
			H.glow.position = h.position + Vector2(-45, 18)
	for iid in items:
		var e: Dictionary = items[iid]
		if e.taken or not is_instance_valid(e.label):
			continue
		var nm: Label = e.label.get_child(0)
		nm.custom_minimum_size.x = min(float(nm.get_meta("natural", 60.0)), max(30.0, _row_w * k - 14.0))
		e.label.reset_size()
		var at := stage.to_stage(e.pos + Vector2(0, ITEM / 2.0 - 2.0))
		e.label.position = Vector2(at.x - e.label.size.x / 2.0, at.y)
	if is_instance_valid(status):
		status.reset_size()
		status.position = Vector2((stage.size.x - status.size.x) / 2.0, 8.0)
	if is_instance_valid(toasts):
		toasts.reset_size()
		toasts.position = Vector2((stage.size.x - toasts.size.x) / 2.0, 14.0 + (status.size.y if is_instance_valid(status) else 0.0))
	if is_instance_valid(bar):
		bar.reset_size()
		bar.position = Vector2((stage.size.x - bar.size.x) / 2.0, stage.size.y - bar.size.y - 10.0)
	_place_card()

# ---------- The list: the whole pile as cards over the stage (Tab) ----------
func _open_list() -> void:
	if is_instance_valid(list_ov):
		list_ov.queue_free()
	var ov := ColorRect.new()
	ov.color = Color(0.03, 0.02, 0.02, 0.66)
	ov.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ov.mouse_filter = Control.MOUSE_FILTER_STOP
	ov.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			_close_list())
	var sc := ScrollContainer.new()
	sc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sc.offset_left = 16
	sc.offset_right = -16
	sc.offset_top = 16
	sc.offset_bottom = -16
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sc.mouse_filter = Control.MOUSE_FILTER_PASS
	ov.add_child(sc)
	var v := Kit.vbox(8)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.mouse_filter = Control.MOUSE_FILTER_PASS
	sc.add_child(v)
	var left := order_ids.filter(func(k): return not items[k].taken)
	v.add_child(Kit.center(Kit.label("The pile: %d left%s" % [left.size(), " · your turn" if my_turn else ""], "Heading", false, Art.GOLD)))
	var hint := Kit.label("Esc, Tab or a click outside the cards closes this.", "Muted", true)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(hint)
	var grid: GridContainer = preload("res://scripts/ui/card_grid.gd").new()
	grid.cell_w = 190
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	grid.mouse_filter = Control.MOUSE_FILTER_PASS
	for iid in left:
		var c: Dictionary = items[iid].c.duplicate()
		if not my_turn:
			c["buttons"] = []
		var cd: PanelContainer = Kit.item_card(c, 190)
		cd.size_flags_vertical = Control.SIZE_FILL
		cd.mouse_filter = Control.MOUSE_FILTER_STOP
		grid.add_child(cd)
	v.add_child(grid)
	if lede != "":
		var ld := Kit.label(lede, "Muted", true)
		ld.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(ld)
	stage.ui.add_child(ov)
	list_ov = ov
	_room_ui(false)
	_show_card()

func _close_list() -> void:
	if is_instance_valid(list_ov):
		list_ov.queue_free()
	list_ov = null
	_room_ui(true)

# The room's own labels, line and bar hide while the list is open (the room itself stays visible behind it)
func _room_ui(on: bool) -> void:
	for n in [status, toasts, bar]:
		if is_instance_valid(n):
			n.visible = on
	for id in heroes:
		if is_instance_valid(heroes[id].get("label")):
			heroes[id].label.visible = on
	for iid in items:
		if is_instance_valid(items[iid].get("label")):
			items[iid].label.visible = on
