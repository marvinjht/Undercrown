# The match: top bar (room track, clock), players on the left, the current screen in the middle,
# your bag, gear and stats on the right. Everything comes from Game.view (described by the server) and is
# rebuilt only when its part changes. The fight (arena) keeps playing across redraws.
extends MarginContainer

@onready var top_bar: PanelContainer = %TopBar
@onready var left: VBoxContainer = %Left
@onready var stage: VBoxContainer = %Stage
@onready var side: VBoxContainer = %Side
@onready var stage_scroll: ScrollContainer = %StageScroll

var arena: Control
var battle_key := ""
var log_box: VBoxContainer
var log_lines: Array = []
var timers: Array = []          # countdown labels: { label, ends (server ms), prefix, turn_start, turn_total }
var clock_label: Label
var clock_bar: ProgressBar
var bag_open := -1
var shown: Dictionary = {}
var _last_phase := ""

func _ready() -> void:
	Game.changed.connect(_on_changed)
	arena = preload("res://scripts/arena.gd").new()
	arena.finished.connect(func(): Game.battle_end(battle_key))
	arena.log_line.connect(_on_log)
	arena.size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _on_changed(_what: String) -> void:
	if Game.status != "match" or Game.view.is_empty():
		arena.stop()
		shown = {}
		battle_key = ""
		return
	var V := Game.view
	_part("top", [V.get("top"), V.get("rooms")], _build_top)
	_part("left", [V.get("rivals"), V.get("rivalOrder"), V.get("me")], _build_left)
	_part("side", [V.get("bag"), V.get("gear"), V.get("me"), V.get("supply"), bag_open], _build_side)
	_part("stage", [V.get("screen"), V.get("me")], _build_stage)
	_check_battle()

func _part(name: String, deps: Array, build: Callable) -> void:
	var h := JSON.stringify(deps).hash()
	if shown.get(name) == h:
		return
	shown[name] = h
	build.call()

# ---------- The fight ----------
func _check_battle() -> void:
	var b = Game.s.get("battle")
	if str(Game.s.get("phase", "")) == "battle" and b is Dictionary and b.get("res") is Dictionary:
		var res: Dictionary = b.res
		var key := "%s|%s|%s" % [b.get("title", ""), res.get("duration", 0), (res.get("events", []) as Array).size()]
		if key != battle_key:
			battle_key = key
			log_lines.clear()
			_render_log()
			arena.play(b)
	else:
		arena.stop()

func _on_log(text: String) -> void:
	log_lines.append(text)
	if log_lines.size() > 6:
		log_lines = log_lines.slice(log_lines.size() - 6)
	_render_log()

func _render_log() -> void:
	if not is_instance_valid(log_box):
		return
	Kit.clear(log_box)
	for l in log_lines:
		log_box.add_child(Kit.label(l, "Muted"))

# ---------- Clocks ----------
func _process(_d: float) -> void:
	if not visible:
		return
	var V := Game.view
	if clock_label and V.get("clock") is Dictionary:
		var ends := float(V.clock.get("ends", 0))
		var left_s := Game.secs_left(ends)
		var total := float(V.clock.get("total", 45000)) / 1000.0
		clock_label.text = "—" if ends <= 0.0 else "%d:%02d" % [int(ceil(left_s)) / 60, int(ceil(left_s)) % 60]
		clock_bar.max_value = max(1.0, total)
		clock_bar.value = left_s if ends > 0.0 else 0.0
	for tm in timers:
		if not is_instance_valid(tm.label):
			continue
		if tm.has("turn_start"):
			var rem: float = max(0.0, float(tm.turn_total) / 1000.0 - (Game.now_ms() - Game.local_ms(float(tm.turn_start))) / 1000.0)
			tm.label.text = "%s %ds" % [tm.prefix, int(ceil(rem))]
		else:
			tm.label.text = "%s %ds" % [tm.prefix, int(ceil(Game.secs_left(float(tm.ends))))]

# ---------- Top bar ----------
func _build_top() -> void:
	Kit.clear(top_bar)
	var top: Dictionary = Game.view.get("top", {})
	var rooms: Dictionary = Game.view.get("rooms", {})
	var h := Kit.hbox(16)
	var brand := Kit.hbox(8)
	var t := Kit.label("UNDERCROWN", "Title")
	brand.add_child(t)
	var snd := Button.new()
	snd.text = "Sound off" if not Sfx.muted else "Sound on"
	snd.theme_type_variation = "Ghost"
	snd.pressed.connect(func(): snd.text = "Sound on" if Sfx.toggle() else "Sound off")
	brand.add_child(snd)
	var leave := Button.new()
	leave.text = "Leave"
	leave.theme_type_variation = "Ghost"
	leave.pressed.connect(func():
		var d := ConfirmationDialog.new()
		d.dialog_text = "Leave the match? A bot plays your hero from here."
		add_child(d)
		d.confirmed.connect(Game.leave)
		d.popup_centered())
	brand.add_child(leave)
	h.add_child(brand)
	var mid := Kit.vbox(4)
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var pips := Kit.hbox(3)
	pips.alignment = BoxContainer.ALIGNMENT_CENTER
	var kinds: Array = top.get("kinds", [])
	var cur := int(top.get("room", 1))
	var special := { "shop": "door_shop", "merchant": "door_merchant", "boss": "door_boss", "duel": "door_fight", "tournament": "crown", "armory": "door_armory" }
	for i in kinds.size():
		var r := i + 1
		var k := str(kinds[i])
		var c: Control
		if special.has(k):
			c = Kit.icon(Art.icon(special[k]), 16)
		else:
			var cr := ColorRect.new()
			cr.custom_minimum_size = Vector2(8, 8)
			cr.color = Color("#6b5a4a")
			cr.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			c = cr
		c.modulate = Color(1, 1, 1, 0.35) if r < cur else (Color(1.6, 1.2, 0.8) if r == cur else Color.WHITE)
		if r == cur:
			c.custom_minimum_size = c.custom_minimum_size * 1.4
		var info: Dictionary = rooms.get(k, {})
		c.tooltip_text = "Room %d: %s\n%s" % [r, info.get("name", k), info.get("text", "")]
		c.mouse_filter = Control.MOUSE_FILTER_STOP
		pips.add_child(c)
	mid.add_child(pips)
	var rl := Kit.label("%s  %s" % [top.get("label", ""), top.get("small", "")], "Heading")
	rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid.add_child(rl)
	h.add_child(mid)
	var clock := Kit.vbox(2)
	clock.custom_minimum_size = Vector2(110, 0)
	clock_label = Kit.label("—", "Title")
	clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	clock_label.tooltip_text = "Round timer: every choice is timed for everyone and ends early once everyone is ready. Fights don’t count against it."
	clock_label.mouse_filter = Control.MOUSE_FILTER_STOP
	clock.add_child(clock_label)
	clock_bar = Kit.bar(0, 1, Art.EMBER, "", 4)
	clock.add_child(clock_bar)
	h.add_child(clock)
	top_bar.add_child(h)

# ---------- Players (left) ----------
func _build_left() -> void:
	Kit.clear(left)
	var V := Game.view
	var rivals: Dictionary = V.get("rivals", {})
	var order: Array = V.get("rivalOrder", [])
	var p := Kit.panel("")
	var v := Kit.vbox(6)
	var alive := 0
	for k in order:
		if rivals.get(k, {}).get("alive", false):
			alive += 1
	var head := Kit.hbox(6)
	var hl := Kit.label("Players", "Heading")
	hl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(hl)
	head.add_child(Kit.label("%d in" % alive, "Muted"))
	v.add_child(head)
	for k in order:
		var r: Dictionary = rivals.get(k, {})
		if r.is_empty():
			continue
		var card := Kit.panel("Card")
		var cv := Kit.vbox(2)
		var row := Kit.hbox(4)
		var dot := ColorRect.new()
		dot.color = Art.color(r.get("tint"), Color.WHITE)
		dot.custom_minimum_size = Vector2(6, 6)
		dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(dot)
		var nm := Kit.label(r.get("name", ""), "", false, Art.TEXT if r.get("alive", false) else Art.MUTED)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		nm.clip_text = true
		row.add_child(nm)
		if r.get("bot", false):
			row.add_child(Kit.chip("BOT", Art.MUTED, "%s left the match, so a bot is playing their hero." % r.botWas if r.get("botWas") else "An empty seat, played by the computer."))
		row.add_child(Kit.label("Lv %d" % int(r.get("level", 1)), "Muted"))
		row.add_child(Kit.hearts(int(r.get("hearts", 0)), 3, 10))
		cv.add_child(row)
		var tag := [r.get("spec", "")] if r.get("spec") else []
		if str(r.get("build", "")) != "No set bonus yet":
			tag.append(r.get("build", ""))
		if tag.size():
			cv.add_child(Kit.label(" · ".join(tag), "", true, Art.GOLD))
		if r.get("alive", false):
			cv.add_child(Kit.bar(float(r.get("hp", 0)), float(r.get("maxHp", 1)), Art.HP, "", 5))
		else:
			cv.add_child(Kit.label("Out of hearts%s" % ((" in room %d" % int(r.diedRoom)) if r.get("diedRoom") else ""), "", false, Art.BLOOD))
		var gear := Kit.hbox(2)
		for it in r.get("gear", []):
			gear.add_child(Kit.item_slot(it, 12))
		cv.add_child(gear)
		card.add_child(cv)
		card.tooltip_text = "%s\nLevel %d · %s · %d gold\n%s\n%s" % [r.get("name", ""), int(r.get("level", 1)), r.get("spec", "No spec yet") if r.get("spec") else "No spec yet", int(r.get("gold", 0)), r.get("build", ""), r.get("summary", "")]
		v.add_child(card)
	p.add_child(v)
	left.add_child(p)
	# You
	var me: Dictionary = V.get("me", {})
	var you := Kit.panel("")
	var yv := Kit.vbox(4)
	var yr := Kit.hbox(6)
	var yl := Kit.label("You", "Heading")
	yl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	yr.add_child(yl)
	yr.add_child(Kit.label("Lv %d" % int(me.get("level", 1)), "Heading"))
	yv.add_child(yr)
	yv.add_child(Kit.vitals(me))
	var gold := Kit.hbox(4)
	gold.add_child(Kit.icon(Art.icon("coin"), 14))
	gold.add_child(Kit.label(str(int(me.get("gold", 0))), "", false, Art.GOLD))
	yv.add_child(gold)
	var sub := []
	if me.get("spec") is Dictionary:
		sub.append(me.spec.name)
	if str(me.get("build", "")) != "No set bonus yet":
		sub.append(me.get("build", ""))
	if sub.size():
		yv.add_child(Kit.label(" · ".join(sub), "", true, Art.GOLD))
	you.add_child(yv)
	left.add_child(you)

# ---------- Bag, gear, stats (right) ----------
func _section(title: String, right_text := "") -> VBoxContainer:
	var p := Kit.panel("")
	var v := Kit.vbox(5)
	var h := Kit.hbox(6)
	var t := Kit.label(title, "Heading")
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(t)
	if right_text != "":
		h.add_child(Kit.label(right_text, "Muted"))
	v.add_child(h)
	p.add_child(v)
	side.add_child(p)
	return v

func _build_side() -> void:
	Kit.clear(side)
	var V := Game.view
	var me: Dictionary = V.get("me", {})
	var bag: Dictionary = V.get("bag", {})
	var items: Array = bag.get("items", [])
	# Bag
	var bv := _section("Bag", "%d gold · %d/%d" % [int(me.get("gold", 0)), items.size(), int(bag.get("size", 6))])
	bv.add_child(Kit.label("New gear goes straight onto an empty slot; anything else lands here. Click an item to use, equip or sell it.", "Muted", true))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	for i in int(bag.get("size", 6)):
		if i < items.size():
			var e: Dictionary = items[i]
			var slot := Kit.item_slot(e.item, 36)
			var idx := i
			slot.gui_input.connect(func(ev):
				if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
					bag_open = -1 if bag_open == idx else idx
					_on_changed("bag"))
			if bag_open == i:
				slot.modulate = Color(1.3, 1.2, 1.0)
			grid.add_child(slot)
		else:
			grid.add_child(Kit.item_slot(null, 36, ""))
	bv.add_child(grid)
	if bag_open >= 0 and bag_open < items.size():
		var e: Dictionary = items[bag_open]
		bv.add_child(Kit.label(e.item.get("name", ""), "", true, Art.color(e.item.get("color"), Art.TEXT)))
		if bag.get("locked", false):
			bv.add_child(Kit.label("Can’t use bag items during a fight.", "Muted", true))
		else:
			for b in e.get("buttons", []):
				var btn := Kit.button(b)
				btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				btn.pressed.connect(func(): bag_open = -1)
				bv.add_child(btn)
				if b.get("note"):
					bv.add_child(Kit.label(b.note, "Muted", true))
	elif bag_open >= items.size():
		bag_open = -1
	if (bag.get("buffs", []) as Array).size():
		bv.add_child(Kit.label("Next fight: " + ", ".join(bag.buffs), "", true, Color("#9fd38f")))
	if bag.get("msg"):
		bv.add_child(Kit.label(bag.msg, "", true, Art.GOLD))
	if bag.get("dye") is Dictionary:
		bv.add_child(Kit.label(bag.dye.title, "Heading", true))
		for b in bag.dye.get("buttons", []):
			bv.add_child(Kit.button(b))
	# Gear
	var gv := _section("Gear")
	var gg := GridContainer.new()
	gg.columns = 3
	gg.add_theme_constant_override("h_separation", 6)
	gg.add_theme_constant_override("v_separation", 4)
	for g in V.get("gear", []):
		var cell := Kit.vbox(1)
		cell.custom_minimum_size = Vector2(80, 0)
		cell.add_child(Kit.item_slot(g.get("item"), 32, str(g.get("slot", ""))))
		var it = g.get("item")
		var nl := Kit.label(it.name if it is Dictionary else g.get("slotName", ""), "Muted")
		nl.clip_text = true
		nl.custom_minimum_size = Vector2(80, 0)
		cell.add_child(nl)
		gg.add_child(cell)
	gv.add_child(gg)
	# Stats
	var chips := []
	if me.get("spec") is Dictionary:
		chips.append(me.spec.name)
	if me.get("gem") is Dictionary:
		chips.append(me.gem.name)
	var sv := _section("Stats", " · ".join(chips))
	if me.get("spec") is Dictionary:
		var tip := [str(me.spec.name) + ": " + str(me.spec.desc)]
		for n in me.spec.get("nodes", []):
			tip.append(str(n.name) + ": " + str(n.desc))
		sv.get_child(0).tooltip_text = "\n".join(tip) + ("\n" + str(me.gem.name) + ". Upside: " + str(me.gem.up) + " Cost: " + str(me.gem.cost) if me.get("gem") is Dictionary else "")
		sv.get_child(0).mouse_filter = Control.MOUSE_FILTER_STOP
	var sc := Kit.stat_cols(me.get("stats", {}))
	sv.add_child(sc)
	sv.add_child(Kit.set_rows(me.get("sets", {})))
	var guide := Button.new()
	guide.text = "Set guide"
	guide.theme_type_variation = "Ghost"
	guide.pressed.connect(_set_guide)
	sv.add_child(guide)
	# Set supply
	var sup: Dictionary = V.get("supply", {})
	var spv := _section("Set supply", "of %d each" % int(sup.get("per", 12)))
	for c in sup.get("classes", []):
		var row := Kit.hbox(6)
		var nm := Kit.label(c.name, "", false, Art.color(c.color))
		nm.custom_minimum_size = Vector2(70, 0)
		row.add_child(nm)
		row.add_child(Kit.bar(float(c.left), float(sup.get("per", 12)), Art.color(c.color), "%d left" % int(c.left), 10))
		spv.add_child(row)

func _set_guide() -> void:
	var g: Dictionary = Game.view.get("setGuide", {})
	var d := AcceptDialog.new()
	d.title = "Set guide"
	var sc := ScrollContainer.new()
	sc.custom_minimum_size = Vector2(620, 420)
	var v := Kit.vbox(6)
	v.custom_minimum_size = Vector2(600, 0)
	v.add_child(Kit.label("Gear with a class tag counts toward that class. All 6 slots count, weapon included. 2 pieces give a small bonus; 4 add a bigger one; 6 add the capstone (bonuses stack). Wearing 4 of one class and 2 of another unlocks that pair's hybrid instead of a capstone.", "", true))
	for c in g.get("classes", []):
		v.add_child(Kit.label("%s  %d/6 worn" % [c.name, int(c.n)], "Heading", false, Art.color(c.color)))
		for t in c.get("tiers", []):
			v.add_child(Kit.label(("✓ " if t.on else "· ") + str(t.label) + ": " + str(t.text), "", true, Art.UP if t.on else Art.TEXT))
	v.add_child(Kit.label("Hybrids (4 of one + 2 of another)", "Heading"))
	for hy in g.get("hybrids", []):
		v.add_child(Kit.label("%s (%s): %s" % [hy.name, hy.pair, hy.text], "", true, Art.UP if hy.on else Art.TEXT))
	sc.add_child(v)
	d.add_child(sc)
	add_child(d)
	d.confirmed.connect(d.queue_free)
	d.close_requested.connect(d.queue_free)
	d.popup_centered()

# ---------- The current screen (middle) ----------
func _build_stage() -> void:
	var sc: Dictionary = Game.view.get("screen", {})
	var phase := str(sc.get("phase", ""))
	var keep_scroll := stage_scroll.scroll_vertical if phase == _last_phase else 0
	_last_phase = phase
	if arena.get_parent():
		arena.get_parent().remove_child(arena)
	Kit.clear(stage)
	timers = timers.filter(func(tm): return false)
	if sc.get("notice"):
		var np := Kit.panel("Card")
		np.add_child(Kit.label(sc.notice, "", true, Art.GOLD))
		stage.add_child(np)
	if sc.get("title"):
		stage.add_child(Kit.label(sc.title, "Title", true))
	if sc.get("lede"):
		stage.add_child(Kit.label(sc.lede, "", true))
	for n in sc.get("notes", []):
		stage.add_child(Kit.line(n))
	for sec in sc.get("sections", []):
		_section_view(sec)
	await get_tree().process_frame
	stage_scroll.scroll_vertical = keep_scroll

func _countdown(prefix: String, ends: float) -> Label:
	var l := Kit.label(prefix, "Heading")
	timers.append({ "label": l, "ends": ends, "prefix": prefix })
	return l

func _section_view(sec: Dictionary) -> void:
	var kind := str(sec.get("kind", ""))
	if sec.get("title"):
		stage.add_child(Kit.label(sec.title, "Heading"))
	match kind:
		"doors":
			var f := Kit.flow(10)
			for d in sec.get("doors", []):
				var p := Kit.panel("Card")
				p.custom_minimum_size = Vector2(250, 0)
				var v := Kit.vbox(6)
				var ic := Kit.icon(Art.icon(str(d.get("icon", ""))), 72)
				v.add_child(ic)
				v.add_child(Kit.label(d.get("title", ""), "Heading", true))
				v.add_child(Kit.label(d.get("text", ""), "", true))
				var th = d.get("threat")
				if th is Dictionary:
					if th.get("estimate", false):
						v.add_child(Kit.label("%s · ~%d dmg · %d%% win" % [th.level, int(th.avgLoss), int(th.winPct)], "", true, Art.GOLD))
					else:
						var sk := Kit.hbox(2)
						sk.tooltip_text = "Threat: how dangerous this fight looks for you right now, from 1 skull (easy) to 5 (you may well lose)."
						sk.mouse_filter = Control.MOUSE_FILTER_STOP
						for i in 5:
							sk.add_child(Kit.icon(Art.icon("skull"), 14, Color.WHITE if i < int(th.get("skulls", 1)) else Color(1, 1, 1, 0.18)))
						v.add_child(sk)
				var b: Dictionary = d.get("button", {}).duplicate()
				b["label"] = "Enter"
				var btn := Kit.button(b)
				btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				v.add_child(btn)
				p.add_child(v)
				f.add_child(p)
			stage.add_child(f)
		"cards":
			var f := Kit.flow(8)
			for c in sec.get("cards", []):
				f.add_child(Kit.card(c, 190 if sec.get("compact", false) else Kit.CARD_W))
			stage.add_child(f)
		"buttons":
			stage.add_child(Kit.buttons(sec.get("buttons", [])))
		"list":
			var v := Kit.vbox(3)
			for r in sec.get("rows", []):
				var row := Kit.hbox(8)
				if r.has("n"):
					row.add_child(Kit.label("%d." % int(r.n), "Muted"))
					row.add_child(Kit.label(r.name + ("  BOT" if r.get("bot", false) else ""), "Heading" if r.get("me", false) else ""))
					row.add_child(Kit.hearts(int(r.get("hearts", 0)), 3, 10))
					row.add_child(Kit.label("%d%%" % int(r.get("hpPct", 0)), "Muted"))
					if r.get("now", false) and sec.get("turnStart"):
						var l := Kit.label("", "Heading")
						timers.append({ "label": l, "turn_start": float(sec.turnStart), "turn_total": float(sec.get("turnTotal", 20000)), "prefix": str(r.state) })
						row.add_child(l)
					else:
						row.add_child(Kit.label(str(r.get("state", "")), "", false, Art.GOLD if r.get("now", false) else Art.MUTED))
				else:
					var col := { "ready": Art.UP, "playing": Art.GOLD, "bot": Art.MUTED, "out": Art.BLOOD }
					row.add_child(Kit.label(r.get("name", ""), "Heading"))
					row.add_child(Kit.label(r.get("label", ""), "", false, col.get(str(r.get("state", "")), Art.TEXT)))
				v.add_child(row)
			stage.add_child(v)
		"review":
			stage.add_child(_countdown(str(sec.get("label", "")), float(sec.get("ends", 0))))
		"timer":
			if float(sec.get("ends", 0)) > 0.0:
				stage.add_child(_countdown(str(sec.get("label", "")), float(sec.ends)))
			else:
				stage.add_child(Kit.label(sec.get("label", ""), "Heading", true))
			if (sec.get("buttons", []) as Array).size():
				stage.add_child(Kit.buttons(sec.buttons))
		"skip":
			var p := Kit.panel("Card")
			var v := Kit.vbox(6)
			v.add_child(Kit.label(sec.get("text", ""), "", true))
			v.add_child(Kit.buttons(sec.get("buttons", [])))
			p.add_child(v)
			stage.add_child(p)
		"tree":
			var tr: Dictionary = sec.get("tree", {})
			for row in tr.get("rows", []):
				stage.add_child(Kit.label("Level %d" % int(row.level), "Muted"))
				var f := Kit.flow(8)
				for n in row.get("nodes", []):
					var st := str(n.get("state", ""))
					var c := { "kind": "text", "title": str(n.name), "sub": str(n.side) + ("  · chosen" if st == "taken" else "  · not taken" if st == "skipped" else ""),
						"lines": [{ "text": n.desc, "tone": "" }], "buttons": [n.button] if n.get("button") is Dictionary else [] }
					var card := Kit.card(c, 250)
					if st == "skipped" or st == "locked":
						card.modulate = Color(1, 1, 1, 0.6)
					f.add_child(card)
				stage.add_child(f)
		"character":
			stage.add_child(Kit.character(Game.view.get("me", {})))
		"opponent":
			stage.add_child(Kit.opponent(sec.get("opponent", {})))
		"places":
			var v := Kit.vbox(2)
			for pl in sec.get("places", []):
				v.add_child(Kit.label("%s  %s" % [pl.place, pl.name], "Heading" if pl.get("me", false) else "", false, Art.GOLD if str(pl.place) == "1st" else null))
			stage.add_child(v)
		"bracket":
			stage.add_child(_bracket(sec.get("bracket", {})))
		"arena":
			stage.add_child(arena)
			log_box = Kit.vbox(1)
			stage.add_child(log_box)
			_render_log()

func _bracket(b: Dictionary) -> Control:
	var sc := ScrollContainer.new()
	sc.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sc.custom_minimum_size = Vector2(0, 220)
	var h := Kit.hbox(10)
	for r in b.get("rounds", []):
		var col := Kit.vbox(6)
		col.custom_minimum_size = Vector2(180, 0)
		col.add_child(Kit.label("Round %d" % int(r.n), "Heading"))
		for m in r.get("matches", []):
			var p := Kit.panel("Card")
			var v := Kit.vbox(1)
			for side_key in ["a", "b"]:
				var e: Dictionary = m.get(side_key, {})
				var row := Kit.hbox(4)
				var won = e.get("won")
				var nm := Kit.label(e.get("name", ""), "Heading" if e.get("me", false) else "", false, Art.GOLD if won == true else (Art.MUTED if won == false else Art.TEXT))
				nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				row.add_child(nm)
				if e.get("ghost", false):
					row.add_child(Kit.label("ghost", "Muted"))
				else:
					row.add_child(Kit.hearts(int(e.get("hearts", 0)), 3, 9))
					row.add_child(Kit.label(str(e.get("hp", "")), "Muted"))
				v.add_child(row)
				if side_key == "a":
					v.add_child(Kit.label("vs", "Muted"))
			v.add_child(Kit.label(m.get("note", ""), "", true, Art.EMBER if m.get("next", false) else Art.MUTED))
			p.add_child(v)
			col.add_child(p)
		h.add_child(col)
	if b.get("champion") is Dictionary:
		var col := Kit.vbox(6)
		col.add_child(Kit.label("Champion", "Heading"))
		var p := Kit.panel("Card")
		var row := Kit.hbox(6)
		row.add_child(Kit.icon(Art.icon("crown"), 18))
		row.add_child(Kit.label(b.champion.name, "Heading", false, Art.GOLD))
		row.add_child(Kit.hearts(int(b.champion.get("hearts", 0)), 3, 10))
		p.add_child(row)
		col.add_child(p)
		h.add_child(col)
	sc.add_child(h)
	var v := Kit.vbox(4)
	v.add_child(sc)
	if (b.get("out", []) as Array).size():
		v.add_child(Kit.label("Out: " + ", ".join(b.out), "Muted", true))
	return v
