# Title, queue, lobby, errors: everything before a match (and after one ends).
extends MarginContainer

var _box: VBoxContainer
var _name: LineEdit
var _code: LineEdit
var _queue_label: Label
var _server_label: Label
var _shown := ""
var _wait_label: Label           # the waking-up animation
var _wait_icon: Control
var _t := 0.0

func _ready() -> void:
	Game.changed.connect(func(_w): _build())
	Net.wake_changed.connect(func(): _build(); _server_text())
	_build()
	Net.wake()   # as soon as the title opens, so the server is usually awake by the time you pick Play

func _process(d: float) -> void:
	_t += d
	if Game.status == "connecting":
		_build()   # shows the waking-up screen once the wait passes a second (it only rebuilds when that changes)
	if _queue_label and Game.status == "queue":
		_queue_label.text = _queue_text()
	if is_instance_valid(_wait_label):
		var dots := int(_t * 3.0) % 4
		_wait_label.text = "%s%s  %ds" % [".".repeat(dots), " ".repeat(3 - dots), int(Net.wake_elapsed())]   # plain dots: the pixel font has no other glyphs (the web build has no fallback font)
	if is_instance_valid(_wait_icon):
		_wait_icon.position.y = -absf(sin(_t * 4.0)) * 8.0
		_wait_icon.rotation = sin(_t * 2.0) * 0.15
	if Game.status == "idle" and Net.wake_state == "waking" and is_instance_valid(_server_label) and int(_t * 2.0) % 2 == 0:
		_server_text()

func _build() -> void:
	var waking: bool = Game.status == "connecting" and Net.wake_state == "waking" and Net.wake_elapsed() > 1.0   # no flash when it's awake
	var key := Game.status + "|" + str(Game.lobby.hash()) + "|" + Game.error + "|" + str(Game.queue_info.get("n", -1)) + "|" + str(waking)
	if key == _shown:
		return
	_shown = key
	for c in get_children():
		c.queue_free()
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	var mid := CenterContainer.new()   # keeps the column in the middle of the window at any width
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.use_top_left = false
	scroll.add_child(mid)
	_box = Kit.vbox(12)
	_box.custom_minimum_size = Vector2(min(760.0, get_viewport_rect().size.x - 48.0), 0)
	_box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	mid.add_child(_box)
	_queue_label = null
	_wait_label = null
	_wait_icon = null
	match Game.status:
		"connecting":
			if waking:
				_waking()
			else:
				_simple("Connecting…", "", [["Cancel", Game.leave]])
		"queue": _queue()
		"lobby": _lobby()
		"error":
			if Game.error_retry:
				_simple("Couldn’t reach the game server", Game.error, [["Try again", Game.retry], ["Back", Game.leave]])
			else:
				_simple("Couldn’t join", Game.error, [["Back", Game.leave]])
		"ended": _simple("Match over", Game.end_reason, [["Back to the title", Game.leave]])
		_:
			_title()
			if Net.wake_state == "idle":   # back on the title after Cancel: keep waking the server in the background
				Net.wake()

func _heading(eyebrow: String, title: String, text: String) -> void:
	_box.add_child(Kit.center(Kit.label(eyebrow, "Muted")))
	var t := Kit.center(Kit.label(title, "Title"))
	t.add_theme_font_size_override("font_size", 44)
	_box.add_child(t)
	if text != "":
		_box.add_child(Kit.center(Kit.label(text, "", true)))

func _btn(text: String, cb: Callable, style := "Primary") -> Button:
	var b := Button.new()
	b.text = text
	b.theme_type_variation = style
	b.pressed.connect(cb)
	return b

func _simple(title: String, text: String, actions: Array) -> void:
	_heading("UNDERCROWN", title, text)
	var row := Kit.hbox(8)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	for a in actions:
		row.add_child(_btn(a[0], a[1]))
	_box.add_child(row)

func _title() -> void:
	_heading("UNDERCROWN · GODOT CLIENT", "Undercrown", "Six warriors. Thirty rooms each. Three hearts. Health carries from room to room and healing is limited, so spend it wisely. Build an archetype, fight your rivals along the way, and be the last one standing.")
	var rules := [["Hearts", "Dying or losing a duel costs a heart. You come back at full health. Lose all three and you're out."],
		["Class sets", "Some gear carries a class, and every match has a limited supply. 2, 4 or 6 pieces, or 4 + 2 for a hybrid."],
		["Every 10 rooms", "Room 5 is a Plunder (a shared loot pile), 7 a merchant, 8 a boss, and 10 a duel against a rival. Room 30 is the tournament."],
		["The tournament", "After room 30, everyone with hearts fights round after round until one is left."]]
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for r in rules:
		var p := Kit.panel("Card")
		p.custom_minimum_size = Vector2(360, 0)
		var v := Kit.vbox(2)
		v.add_child(Kit.label(r[0], "Heading"))
		v.add_child(Kit.label(r[1], "", true))
		p.add_child(v)
		grid.add_child(p)
	_box.add_child(grid)
	var box := Kit.panel("")
	var v := Kit.vbox(8)
	v.add_child(Kit.label("Play", "Heading"))
	v.add_child(Kit.label("Your name", "Muted"))
	_name = LineEdit.new()
	_name.text = Game.player_name
	_name.placeholder_text = "Your name"
	_name.max_length = 14
	v.add_child(_name)
	var row := Kit.hbox(8)
	row.add_child(_btn("Find a match", _find))
	row.add_child(_btn("Play solo", _solo, ""))
	row.add_child(Kit.label("Bots:", "Muted"))
	row.add_child(_level_pick())
	v.add_child(row)
	v.add_child(Kit.label("Find a match plays with whoever is online now. Play solo: you and five bots. Or with friends:", "Muted", true))
	var row2 := Kit.hbox(8)
	row2.add_child(_btn("Create a room", _create, ""))
	_code = LineEdit.new()
	_code.placeholder_text = "ROOM CODE"
	_code.max_length = 5
	_code.custom_minimum_size = Vector2(110, 0)
	row2.add_child(_code)
	row2.add_child(_btn("Join", _join, ""))
	v.add_child(row2)
	_server_label = Kit.label("Game server: checking…", "Muted", true)
	v.add_child(_server_label)
	_server_text()
	var snd := _btn("Sound off" if not Sfx.muted else "Sound on", func(): pass, "Ghost")
	snd.pressed.connect(func(): snd.text = "Sound on" if Sfx.toggle() else "Sound off")
	var opts := Kit.hbox(8)
	snd.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	opts.add_child(snd)
	var set_btn := _btn("Settings", func(): Settings.open(self), "Ghost")
	set_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	opts.add_child(set_btn)
	v.add_child(opts)
	box.add_child(v)
	_box.add_child(box)

# Bot difficulty: Easy, Medium, Hard (solo and rooms you own; Find a match always plays Medium)
const LEVELS := [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]
func _level_pick() -> OptionButton:
	var o := OptionButton.new()
	for i in LEVELS.size():
		o.add_item(LEVELS[i][1], i)
		if LEVELS[i][0] == Game.bot_level:
			o.select(i)
	o.tooltip_text = "How well the bots play: their door choices, picks and upgrades. Find a match always plays Medium."
	o.item_selected.connect(func(i): Game.set_bot_level(LEVELS[i][0]))
	return o

func _level_name(level: String) -> String:
	for l in LEVELS:
		if l[0] == level:
			return l[1]
	return level

# The line under the Play buttons: is the server awake?
func _server_text() -> void:
	if not is_instance_valid(_server_label):
		return
	match Net.wake_state:
		"awake": _server_label.text = "Game server: online."
		"failed": _server_label.text = "Game server: not answering. Pressing Play tries again."
		"waking": _server_label.text = "Game server: waking up (it sleeps when nobody plays; this can take up to a minute)%s %ds" % [".".repeat(1 + int(_t * 2.0) % 3), int(Net.wake_elapsed())]
		_: _server_label.text = "Game server: checking…"

# Waiting for a sleeping server: a little animation, how long so far, and Cancel
func _waking() -> void:
	_heading("UNDERCROWN", "Waking up", "Waking up the game server, this can take up to a minute...")
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(48, 56)
	holder.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var ic := Kit.icon(Art.icon("crown"), 40)
	ic.pivot_offset = Vector2(20, 20)
	ic.position = Vector2(4, 8)
	holder.add_child(ic)
	_wait_icon = ic
	_box.add_child(holder)
	_wait_label = Kit.label("", "Heading", false, Art.GOLD)
	_box.add_child(Kit.center(_wait_label))
	var note := Kit.label("The free server sleeps when nobody is playing. It keeps trying for up to %d seconds." % int(Net.WAKE_LIMIT), "Muted", true)
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_box.add_child(note)
	var cancel := _btn("Cancel", Game.leave, "Ghost")
	cancel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_box.add_child(cancel)

func _find() -> void:
	if _ok_name():
		Game.find_match(_name.text)
func _solo() -> void:
	if _ok_name():
		Game.play_solo(_name.text)
func _create() -> void:
	if _ok_name():
		Game.create_room(_name.text)
func _join() -> void:
	if _ok_name() and _code.text.strip_edges() != "":
		Game.join_room(_code.text, _name.text)

func _ok_name() -> bool:
	if _name.text.strip_edges() == "":
		_name.placeholder_text = "Enter your name first"
		_name.grab_focus()
		return false
	return true

func _queue_text() -> String:
	var q := Game.queue_info
	if q.is_empty():
		return "Joining the queue…"
	var n := int(q.get("n", 1))
	var secs := -1
	if q.get("ms") != null:
		secs = int(ceil(max(0.0, float(q.ms) - (Game.now_ms() - float(q.at))) / 1000.0))
	var who := "You’re the only one looking right now." if n <= 1 else "%d players are looking for a match." % n
	var when := ""
	if secs >= 0:
		when = (" The match starts in %ds, or as soon as %d are in." % [secs, int(q.get("max", 8))]) if n >= 2 else (" If nobody else turns up, you start with bots in %ds." % secs)
	return who + when

func _queue() -> void:
	_heading("UNDERCROWN", "Finding a match…", "")
	_queue_label = Kit.center(Kit.label(_queue_text(), "", true))
	_box.add_child(_queue_label)
	_box.add_child(Kit.center(Kit.label("Bots fill empty seats up to 6.", "Muted")))
	var cancel := _btn("Cancel", Game.leave, "Ghost")
	cancel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_box.add_child(cancel)

func _lobby() -> void:
	var L := Game.lobby
	var owner: bool = L.get("ownerCid") == Game.cid
	_heading("ROOM CODE", str(L.get("code", "")), "Share this code with your friends. Up to 8 players. Bots fill empty seats up to 6; seats 7 and 8 are for real players only.")
	var slots: Array = L.get("slots", [])
	var humans := 0
	for sl in slots:
		if sl is Dictionary:
			humans += 1
	for i in 8:
		var sl = slots[i] if i < slots.size() else null
		var row := Kit.hbox(8)
		row.add_child(Kit.label(str(i + 1), "Muted"))
		if sl is Dictionary:
			row.add_child(Kit.label(sl.name + ("  (you)" if sl.cid == Game.cid else "") + ("  · host" if i == 0 else ""), "Heading" if sl.cid == Game.cid else ""))
		elif i < 6 and i >= humans:
			row.add_child(Kit.label("Bot · fills this seat if nobody joins", "Muted"))
		else:
			row.add_child(Kit.label("Open · players only", "Muted"))
		_box.add_child(row)
	var bots := Kit.hbox(8)
	bots.alignment = BoxContainer.ALIGNMENT_CENTER
	bots.add_child(Kit.label("Bot difficulty:", "Muted"))
	if owner and not L.get("matched", false):
		var pick := _level_pick()
		for i in LEVELS.size():   # the room's level, as the server has it
			if LEVELS[i][0] == str(L.get("botLevel", "medium")):
				pick.select(i)
		bots.add_child(pick)
	else:
		bots.add_child(Kit.label(_level_name(str(L.get("botLevel", "medium"))), "Heading"))
	_box.add_child(bots)
	var row2 := Kit.hbox(8)
	if owner:
		row2.add_child(_btn("Start the match", Game.start_match))
	else:
		row2.add_child(Kit.label("Waiting for the host to start…", "Muted"))
	row2.add_child(_btn("Leave", Game.leave, "Ghost"))
	_box.add_child(row2)
