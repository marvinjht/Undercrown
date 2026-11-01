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
var _last_res = null            # the fight result on screen (a new result object = a new fight)
var _battle_n := 0
var watch_arena: Control        # the fight of the player you watch (separate from yours)
var watch_key := ""
var _target: VBoxContainer      # where screen sections are drawn: the stage, or the watch box
var log_box: VBoxContainer
var log_lines: Array = []
var timers: Array = []          # countdown labels: { label, ends (server ms), prefix, turn_start, turn_total }
var clock_label: Label
var clock_bar: ProgressBar
var bag_open := -1
var shown: Dictionary = {}
var _last_phase := ""
var _blood_seq := -1   # the last blood sale we showed a "+N gold" pop-up for

func _ready() -> void:
	Game.changed.connect(_on_changed)
	arena = preload("res://scripts/arena.gd").new()
	arena.finished.connect(func(): Game.battle_end(battle_key))
	arena.log_line.connect(_on_log)
	arena.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	get_viewport().size_changed.connect(func(): _place_watch(_watch_pos))   # a new window size or UI scale: keep it on screen
	watch_arena = preload("res://scripts/arena.gd").new()
	watch_arena.size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _on_changed(_what: String) -> void:
	if Game.status != "match" or Game.view.is_empty():
		arena.stop()
		watch_arena.stop()
		if is_instance_valid(watch_win):
			watch_win.queue_free()
		watch_win = null
		shown = {}
		battle_key = ""
		_last_res = null
		watch_key = ""
		return
	var V := Game.view
	_part("top", [V.get("top"), V.get("rooms")], _build_top)
	_part("left", [V.get("rivals"), V.get("rivalOrder"), V.get("me"), V.get("canWatch"), V.get("watching")], _build_left)
	_part("side", [V.get("bag"), V.get("gear"), V.get("me"), V.get("supply"), bag_open], _build_side)
	_part("stage", [V.get("screen"), V.get("me")], _build_stage)
	_part("watch", [V.get("watch")], _build_watch_win)
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
		# A new fight is a new result object (updates during a fight keep the same one, "$same" on the wire)
		if not is_same(b.res, _last_res):
			_last_res = b.res
			_battle_n += 1
			battle_key = "fight%d" % _battle_n
			log_lines.clear()
			_render_log()
			arena.play(b)
	else:
		# The server has moved on: stop, and take the fight off screen right away (never leave it frozen there)
		arena.stop()
		if arena.get_parent():
			arena.get_parent().remove_child(arena)

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
		var rem: float
		if tm.has("turn_start"):
			rem = max(0.0, float(tm.turn_total) / 1000.0 - (Game.now_ms() - Game.local_ms(float(tm.turn_start))) / 1000.0)
		else:
			rem = Game.secs_left(float(tm.ends))
		tm.label.text = "%s %ds" % [tm.prefix, int(ceil(rem))]
		if tm.get("bar") and is_instance_valid(tm.bar):
			tm.bar.value = rem

# ---------- Top bar ----------
func _build_top() -> void:
	Kit.clear(top_bar)
	var top: Dictionary = Game.view.get("top", {})
	var rooms: Dictionary = Game.view.get("rooms", {})
	# Three parts: brand (left) and clock (right) share the leftover width equally, so the room track is centered
	var h := Kit.hbox(16)
	var brand := Kit.hbox(8)
	brand.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var t := Kit.label("UNDERCROWN", "Title")
	brand.add_child(t)
	var snd := Button.new()
	snd.text = "Sound off" if not Sfx.muted else "Sound on"
	snd.theme_type_variation = "Ghost"
	snd.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	snd.pressed.connect(func(): snd.text = "Sound on" if Sfx.toggle() else "Sound off")
	brand.add_child(snd)
	var leave := Button.new()
	leave.text = "Leave"
	leave.theme_type_variation = "Ghost"
	leave.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	leave.pressed.connect(func():
		var d := ConfirmationDialog.new()
		d.dialog_text = "Leave the match? A bot plays your hero from here."
		add_child(d)
		d.confirmed.connect(Game.leave)
		d.popup_centered())
	brand.add_child(leave)
	var set_btn := Button.new()
	set_btn.text = "Settings"
	set_btn.theme_type_variation = "Ghost"
	set_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	set_btn.pressed.connect(func(): Settings.open(self))
	brand.add_child(set_btn)
	h.add_child(brand)
	# Room track: an icon for special rooms, a square for the rest. The current room is outlined
	# (theme: RoomCurrent), the others sit in RoomPip; finished rooms are dimmed.
	var mid := Kit.vbox(4)
	mid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var pips := Kit.hbox(4)
	pips.alignment = BoxContainer.ALIGNMENT_CENTER
	var kinds: Array = top.get("kinds", [])
	var cur := int(top.get("room", 1))
	var special := { "shop": "door_shop", "merchant": "door_merchant", "boss": "door_boss", "duel": "door_fight", "tournament": "crown", "armory": "door_armory" }
	for i in kinds.size():
		var r := i + 1
		var k := str(kinds[i])
		var c: Control
		if special.has(k):
			c = Kit.icon(Art.icon(special[k]), 24)
			if r == cur:
				c.modulate = Color(1.3, 1.15, 0.9)
		else:
			var cr := ColorRect.new()
			cr.custom_minimum_size = Vector2(12, 12)
			cr.color = Art.EMBER if r == cur else Color("#7a6855")
			c = cr
		c.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		c.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var pip := Kit.panel("RoomCurrent" if r == cur else "RoomPip")
		pip.custom_minimum_size = Vector2(0, 30)
		if r < cur:
			pip.modulate = Color(1, 1, 1, 0.3)
		var info: Dictionary = rooms.get(k, {})
		pip.tooltip_text = "Room %d: %s
%s" % [r, info.get("name", k), info.get("text", "")]
		pip.mouse_filter = Control.MOUSE_FILTER_STOP
		pip.add_child(c)
		pips.add_child(pip)
	mid.add_child(pips)
	var rl := Kit.center(Kit.label("%s  %s" % [top.get("label", ""), top.get("small", "")], "RoomLabel"))
	mid.add_child(rl)
	h.add_child(mid)
	# Clock: the time, with a short bar under it of the same width
	var right := Kit.hbox(0)
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.alignment = BoxContainer.ALIGNMENT_END
	var clock := VBoxContainer.new()
	clock.add_theme_constant_override("separation", 2)
	clock.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	clock_label = Kit.label("—", "Title")
	clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	clock_label.tooltip_text = "Round timer: every choice is timed for everyone and ends early once everyone is ready. Fights don’t count against it."
	clock_label.mouse_filter = Control.MOUSE_FILTER_STOP
	clock.add_child(clock_label)
	clock_bar = Kit.bar(0, 1, Art.EMBER, "", 4)
	clock.add_child(clock_bar)
	right.add_child(clock)
	h.add_child(right)
	top_bar.add_child(h)
	# Keep the clock (and its bar) as wide as "00:00" so it doesn't jump as the digits change
	var font := clock_label.get_theme_font("font")
	clock_label.custom_minimum_size.x = font.get_string_size("00:00", HORIZONTAL_ALIGNMENT_LEFT, -1, clock_label.get_theme_font_size("font_size")).x

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
		if V.get("canWatch", false) and not r.get("bot", false) and r.get("alive", false) and r.get("slot") != null:
			row.add_child(_eye(int(r.slot), V.get("watching") != null and int(V.watching) == int(r.slot)))
		cv.add_child(row)
		var tag := [r.get("spec", "")] if r.get("spec") else []
		if str(r.get("build", "")) != "No set bonus yet":
			tag.append(r.get("build", ""))
		if tag.size():
			cv.add_child(Kit.set_text(" · ".join(tag), Art.GOLD))
		if r.get("alive", false):
			cv.add_child(Kit.bar(float(r.get("hp", 0)), float(r.get("maxHp", 1)), Art.HP, "", 5))
		else:
			cv.add_child(Kit.label("Out of hearts%s" % ((" in room %d" % int(r.diedRoom)) if r.get("diedRoom") else ""), "", false, Art.BLOOD))
		var gear := Kit.hbox(2)
		for it in r.get("gear", []):
			gear.add_child(Kit.item_slot(it, 12))
		cv.add_child(gear)
		card.add_child(cv)
		var gem_line := ("\nHeart gem: %s%s" % [r.gem, (". " + str(r.gemShort)) if r.get("gemShort") else ""]) if r.get("gem") else ""
		card.tooltip_text = "%s\nLevel %d · %s · %d gold%s\n%s\n%s" % [r.get("name", ""), int(r.get("level", 1)), r.get("spec", "No spec yet") if r.get("spec") else "No spec yet", int(r.get("gold", 0)), gem_line, r.get("build", ""), r.get("summary", "")]
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
		yv.add_child(Kit.set_text(" · ".join(sub), Art.GOLD))
	you.add_child(yv)
	left.add_child(you)

# The eye next to a player: watch their game live (only once you're out)
func _eye(slot: int, on: bool) -> Button:
	var b := Button.new()
	b.icon = Art.icon("eye")
	b.expand_icon = false
	b.theme_type_variation = "Primary" if on else "Ghost"
	b.tooltip_text = "Stop watching" if on else "Watch their game live"
	b.custom_minimum_size = Vector2(22, 18)
	b.pressed.connect(func(): Game.act("stopWatching" if on else "startWatching", [] if on else [slot], true))
	return b

# ---------- Bag, gear, stats (right) ----------
func _section(title: String, right_text := "") -> VBoxContainer:
	var p := Kit.panel("")
	var v := Kit.vbox(5)
	var h: HBoxContainer = preload("res://scripts/ui/tip_row.gd").new()   # a plain row; its tooltip can be a list of lines
	h.add_theme_constant_override("separation", 6)
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
	var bv := _section("Bag")
	var bh: HBoxContainer = bv.get_child(0)
	bh.add_child(Kit.icon(Art.icon("coin"), 14))
	bh.add_child(Kit.label(str(int(me.get("gold", 0))), "", false, Art.GOLD))
	bh.add_child(Kit.label("· %d/%d" % [items.size(), int(bag.get("size", 6))], "Muted"))
	bh.lines = [{ "text": "New gear goes straight onto an empty slot; anything else lands here. Click an item to use, equip or sell it." }]
	bh.tooltip_text = " "
	bh.mouse_filter = Control.MOUSE_FILTER_STOP
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
		cell.add_child(Kit.item_slot(g.get("item"), 32, str(g.get("slot", "")), true))
		var nl := Kit.label(g.get("slotName", ""), "Muted")   # the item's name and details are in the slot's hover card
		nl.clip_text = true
		nl.custom_minimum_size = Vector2(80, 0)
		cell.add_child(nl)
		gg.add_child(cell)
	gv.add_child(gg)
	# Relics
	var relics: Array = me.get("relics", [])
	var rv := _section("Relics", str(relics.size()) if relics.size() else "")
	if relics.is_empty():
		rv.add_child(Kit.label("No relics yet. They drop at Plunder, from elites and bosses, and in vaults.", "Muted", true))
	if relics.size():
		var rf := Kit.flow(4)
		for r in relics:
			rf.add_child(Kit.item_slot(r, 22))   # hover: name, copies and what it does
		rv.add_child(rf)
	# Stats
	var chips := []
	if me.get("spec") is Dictionary:
		chips.append(me.spec.name)
	if me.get("gem") is Dictionary:
		chips.append(me.gem.name)
	var sv := _section("Stats", " · ".join(chips))
	var tip := []
	if me.get("spec") is Dictionary:
		tip.append({ "text": str(me.spec.name), "color": Art.GOLD.to_html(false) })
		tip.append({ "text": str(me.spec.desc), "short": str(me.spec.get("short", me.spec.desc)) })
		for n in me.spec.get("nodes", []):
			tip.append({ "text": str(n.name) + ": " + str(n.desc), "tone": "hint", "short": str(n.name) + ": " + str(n.get("short", n.desc)) })
	if me.get("gem") is Dictionary:
		var full := "Upside: " + str(me.gem.up) + " Cost: " + str(me.gem.cost)
		tip.append({ "text": str(me.gem.name), "color": str(me.gem.get("color", "#f2c14a")) })
		tip.append({ "text": full, "short": str(me.gem.short) if me.gem.get("short") else full })
	if tip.size():
		var head: Control = sv.get_child(0)
		head.lines = tip
		head.tooltip_text = " "
		head.mouse_filter = Control.MOUSE_FILTER_STOP
	var sc := Kit.stat_cols(me.get("stats", {}))
	sv.add_child(sc)
	sv.add_child(Kit.set_rows(me.get("sets", {}), true))
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
		var nm := Kit.class_tag(str(c.get("cls", "")), str(c.name), Art.color(c.color))
		nm.custom_minimum_size = Vector2(84, 0)
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
		var head := Kit.class_tag(str(c.get("cls", "")), str(c.name), Art.color(c.color), 14)
		head.add_child(Kit.label("%d/6 worn" % int(c.n), "Muted"))
		v.add_child(head)
		for t in c.get("tiers", []):
			v.add_child(Kit.tier_line(t))
	v.add_child(Kit.spacer(4))
	v.add_child(Kit.label("Hybrids (4 of one + 2 of another)", "Heading"))
	for hy in g.get("hybrids", []):
		var head := Kit.hybrid_tag(str(hy.get("key", "")), str(hy.name), 14)
		head.add_child(Kit.label(str(hy.pair) + ("  · active" if hy.on else ""), "Muted"))
		v.add_child(head)
		v.add_child(Kit.label(str(hy.text), "" if hy.on else "Muted", true, Art.UP if hy.on else null))
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
	if arena.get_parent():   # the fight keeps playing across redraws
		arena.get_parent().remove_child(arena)
	Kit.clear(stage)
	_target = stage
	timers = timers.filter(func(tm): return is_instance_valid(tm.label) and is_instance_valid(watch_win) and watch_win.is_ancestor_of(tm.label))
	if sc.get("notice"):
		var np := Kit.panel("Card")
		np.add_child(Kit.center(Kit.label(sc.notice, "", true, Art.GOLD)))
		stage.add_child(np)
	if sc.get("title"):
		stage.add_child(Kit.center(Kit.label(sc.title, "Title", true)))
	if sc.get("lede"):
		stage.add_child(Kit.center(Kit.label(sc.lede, "", true)))
	for n in sc.get("notes", []):
		stage.add_child(Kit.center(Kit.line(n)))
	for sec in sc.get("sections", []):
		_section_view(sec)
	await get_tree().process_frame
	stage_scroll.scroll_vertical = keep_scroll
	_blood_pop(sc)

# ---------- Spectating ----------
# A small window you can drag around and close: the game of the player you watch, live (their screen, untouchable,
# or their fight in its own arena). It stays open while you play your own rooms.
const WATCH_W := 560.0
var watch_win: PanelContainer
var _watch_pos := Vector2(-1, -1)
var _drag_off = null

func _build_watch_win() -> void:
	var W = Game.view.get("watch")
	if not (W is Dictionary):
		if watch_arena.get_parent():
			watch_arena.get_parent().remove_child(watch_arena)
		if is_instance_valid(watch_win):
			watch_win.queue_free()
		watch_win = null
		if watch_key != "":
			watch_key = ""
			watch_arena.stop()
		return
	if not is_instance_valid(watch_win):
		watch_win = Kit.panel("")
		watch_win.top_level = true
		add_child(watch_win)
		if _watch_pos.x < 0:
			var vr := get_viewport_rect().size
			_watch_pos = Vector2(vr.x - WATCH_W - 330, vr.y - 470)
	if watch_arena.get_parent():
		watch_arena.get_parent().remove_child(watch_arena)
	timers = timers.filter(func(tm): return is_instance_valid(tm.label) and not watch_win.is_ancestor_of(tm.label))
	Kit.clear(watch_win)
	var v := Kit.vbox(6)
	v.custom_minimum_size = Vector2(WATCH_W, 0)
	var head := Kit.hbox(8)   # the title bar: drag it to move the window
	head.mouse_filter = Control.MOUSE_FILTER_STOP
	head.mouse_default_cursor_shape = Control.CURSOR_MOVE
	head.gui_input.connect(_drag_watch)
	head.add_child(Kit.icon(Art.icon("eye"), 16))
	head.add_child(Kit.label("Watching " + str(W.get("name", "")), "Heading"))
	var st := Kit.label(str(W.get("status", "")), "Muted")
	st.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	st.clip_text = true
	head.add_child(st)
	var close := Button.new()
	close.text = "✕"
	close.theme_type_variation = "Ghost"
	close.tooltip_text = "Stop watching"
	close.pressed.connect(func(): Game.act("stopWatching", [], true))
	head.add_child(close)
	v.add_child(head)
	var f = W.get("fight")
	if f is Dictionary:
		v.add_child(Kit.center(Kit.label(str(f.get("title", "Fight")), "Heading")))
		if str(f.get("key", "")) != watch_key:
			watch_key = str(f.get("key", ""))
			watch_arena.play(f)
		v.add_child(watch_arena)
		watch_arena.custom_minimum_size = Vector2(WATCH_W, WATCH_W * 9.0 / 16.0)
	else:
		if watch_key != "":
			watch_key = ""
			watch_arena.stop()
		var sc = W.get("screen")
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(WATCH_W, 340)
		var body := Kit.vbox(6)
		scroll.add_child(body)
		if sc is Dictionary:
			if sc.get("notice"):
				body.add_child(Kit.center(Kit.label(sc.notice, "", true, Art.GOLD)))
			if sc.get("title"):
				body.add_child(Kit.center(Kit.label(sc.title, "Heading", true)))
			if sc.get("lede"):
				body.add_child(Kit.center(Kit.label(sc.lede, "", true)))
			for n in sc.get("notes", []):
				body.add_child(Kit.center(Kit.line(n)))
			var outer := _target
			_target = body
			for sec in sc.get("sections", []):
				_section_view(sec)
			_target = outer
		else:
			body.add_child(Kit.center(Kit.label("Connecting to their game…", "Muted")))
		v.add_child(scroll)
	watch_win.add_child(v)
	watch_win.reset_size()
	_place_watch(_watch_pos)

func _drag_watch(ev: InputEvent) -> void:
	if ev is InputEventMouseButton and ev.button_index == MOUSE_BUTTON_LEFT:
		_drag_off = (watch_win.position - ev.global_position) if ev.pressed else null
	elif ev is InputEventMouseMotion and _drag_off != null:
		_place_watch(ev.global_position + _drag_off)

# Keep the window on screen
func _place_watch(at: Vector2) -> void:
	if not is_instance_valid(watch_win):
		return
	var vr := get_viewport_rect().size
	var sz := watch_win.size
	_watch_pos = Vector2(clampf(at.x, 0.0, max(0.0, vr.x - sz.x)), clampf(at.y, 0.0, max(0.0, vr.y - sz.y)))
	watch_win.position = _watch_pos

# Merchant: a "+N gold" that floats up from the sell-blood button and fades, once per sale (bloodPop.seq)
func _blood_pop(sc: Dictionary) -> void:
	var bp = sc.get("bloodPop")
	if not (bp is Dictionary) or int(bp.get("seq", 0)) == _blood_seq:
		return
	_blood_seq = int(bp.get("seq", 0))
	var at := Vector2(stage.get_global_rect().get_center().x, stage.get_global_rect().position.y + 120)
	for b in stage.find_children("*", "Button", true, false):
		var args: Array = b.get_meta("args", [])
		if str(b.get_meta("act", "")) == "shopBuy" and args.size() and str(args[0]) == "blood":
			at = b.get_global_rect().get_center() + Vector2(0, -18)
	var l := Kit.label("+%d gold" % int(bp.get("gold", 0)), "Heading", false, Art.GOLD)
	l.add_theme_font_size_override("font_size", 16)
	l.add_theme_constant_override("outline_size", 4)
	l.top_level = true
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(l)
	l.reset_size()
	l.global_position = at - l.size / 2
	var tw := create_tween().set_parallel(true)
	tw.tween_property(l, "global_position:y", l.global_position.y - 44, 1.1).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(l, "modulate:a", 0.0, 1.1).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(l.queue_free)

func _countdown(prefix: String, ends: float) -> Label:
	var l := Kit.center(Kit.label(prefix, "Heading"))
	timers.append({ "label": l, "ends": ends, "prefix": prefix })
	return l

# A timer bar that empties as time runs out (same look as the round timer); total in seconds
func _timer_bar(total: float) -> ProgressBar:
	var bar := Kit.bar(total, total, Art.EMBER, "", 6)
	bar.custom_minimum_size = Vector2(320, 6)
	bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return bar

func _section_view(sec: Dictionary) -> void:
	var kind := str(sec.get("kind", ""))
	if sec.get("title"):
		_target.add_child(Kit.center(Kit.label(sec.title, "Heading")))
	match kind:
		"doors":
			var f := Kit.flow(10, true)
			for d in sec.get("doors", []):
				var p := Kit.panel("Card")
				p.custom_minimum_size = Vector2(250, 0)
				var v := Kit.vbox(6)
				var ic := Kit.icon(Art.icon(str(d.get("icon", ""))), 72)
				v.add_child(ic)
				v.add_child(Kit.label(d.get("title", ""), "Heading", true))
				v.add_child(Kit.dual(str(d.get("text", "")), d.get("short"), "", true))
				if d.get("short"):
					v.add_child(Kit.detail_hint())
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
			_target.add_child(f)
		"cards":
			# Same-width cards in a centered grid; every card in a row matches the tallest one
			var w := 190 if sec.get("compact", false) else Kit.CARD_W
			var grid: GridContainer = preload("res://scripts/ui/card_grid.gd").new()
			grid.cell_w = w
			grid.add_theme_constant_override("h_separation", 8)
			grid.add_theme_constant_override("v_separation", 8)
			grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			for c in sec.get("cards", []):
				var card: PanelContainer = Kit.item_card(c, w) if c.get("kind") == "item" and c.get("item") is Dictionary else Kit.card(c, w)
				card.size_flags_vertical = Control.SIZE_FILL
				grid.add_child(card)
			_target.add_child(grid)
		"buttons":
			_target.add_child(Kit.buttons(sec.get("buttons", []), true))
		"list":
			var v := Kit.vbox(3)
			v.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			var turn_bar: ProgressBar = null
			for r in sec.get("rows", []):
				var row := Kit.hbox(8)
				if r.has("n"):
					row.add_child(Kit.label("%d." % int(r.n), "Muted"))
					row.add_child(Kit.label(r.name + ("  BOT" if r.get("bot", false) else ""), "Heading" if r.get("me", false) else ""))
					row.add_child(Kit.hearts(int(r.get("hearts", 0)), 3, 10))
					row.add_child(Kit.label("%d%%" % int(r.get("hpPct", 0)), "Muted"))
					if r.get("now", false) and sec.get("turnStart"):
						var l := Kit.label("", "Heading")
						var tm := { "label": l, "turn_start": float(sec.turnStart), "turn_total": float(sec.get("turnTotal", 20000)), "prefix": str(r.state) }
						if r.get("me", false):   # a bar for your own turn only
							turn_bar = _timer_bar(float(sec.get("turnTotal", 20000)) / 1000.0)
							tm["bar"] = turn_bar
						timers.append(tm)
						row.add_child(l)
					else:
						row.add_child(Kit.label(str(r.get("state", "")), "", false, Art.GOLD if r.get("now", false) else Art.MUTED))
				else:
					var col := { "ready": Art.UP, "playing": Art.GOLD, "bot": Art.MUTED, "out": Art.BLOOD }
					row.add_child(Kit.label(r.get("name", ""), "Heading"))
					row.add_child(Kit.label(r.get("label", ""), "", false, col.get(str(r.get("state", "")), Art.TEXT)))
				v.add_child(row)
			_target.add_child(v)
			if turn_bar:   # the pick in progress, as a bar under the list
				_target.add_child(turn_bar)
		"review":
			_target.add_child(_countdown(str(sec.get("label", "")), float(sec.get("ends", 0))))
			var rb := _timer_bar(float(sec.get("total", 5000)) / 1000.0)
			timers[timers.size() - 1]["bar"] = rb
			_target.add_child(rb)
		"timer":
			if float(sec.get("ends", 0)) > 0.0:
				_target.add_child(_countdown(str(sec.get("label", "")), float(sec.ends)))
			else:
				_target.add_child(Kit.center(Kit.label(sec.get("label", ""), "Heading", true)))
			if (sec.get("buttons", []) as Array).size():
				_target.add_child(Kit.buttons(sec.buttons, true))
		"skip":
			var p := Kit.panel("Card")
			var v := Kit.vbox(6)
			v.add_child(Kit.center(Kit.label(sec.get("text", ""), "", true)))
			v.add_child(Kit.buttons(sec.get("buttons", []), true))
			p.add_child(v)
			_target.add_child(p)
		"tree":
			var tr: Dictionary = sec.get("tree", {})
			for row in tr.get("rows", []):
				_target.add_child(Kit.center(Kit.label("Level %d" % int(row.level), "Muted")))
				var f := Kit.flow(8, true)
				for n in row.get("nodes", []):
					var st := str(n.get("state", ""))
					var c := { "kind": "text", "title": str(n.name), "sub": str(n.side) + ("  · chosen" if st == "taken" else "  · not taken" if st == "skipped" else ""),
						"lines": [{ "text": n.desc, "tone": "", "short": n.get("short", n.desc) }], "buttons": [n.button] if n.get("button") is Dictionary else [] }
					var card := Kit.card(c, 250)
					if st == "skipped" or st == "locked":
						card.modulate = Color(1, 1, 1, 0.6)
					f.add_child(card)
				_target.add_child(f)
		"character":
			_target.add_child(Kit.character(Game.view.get("me", {})))
		"opponent":
			_target.add_child(Kit.opponent(sec.get("opponent", {})))
		"places":
			var v := Kit.vbox(2)
			v.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			for pl in sec.get("places", []):
				v.add_child(Kit.label("%s  %s" % [pl.place, pl.name], "Heading" if pl.get("me", false) else "", false, Art.GOLD if str(pl.place) == "1st" else null))
			_target.add_child(v)
		"bracket":
			_target.add_child(_bracket(sec.get("bracket", {})))
		"arena":
			_target.add_child(arena)
			log_box = Kit.vbox(1)
			_target.add_child(log_box)
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
	var mid := CenterContainer.new()   # keeps the bracket centered when it's narrower than the screen
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.add_child(h)
	sc.add_child(mid)
	var v := Kit.vbox(4)
	v.add_child(sc)
	if (b.get("out", []) as Array).size():
		v.add_child(Kit.label("Out: " + ", ".join(b.out), "Muted", true))
	return v
