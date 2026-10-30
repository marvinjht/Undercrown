# Title, queue, lobby, errors: everything before a match (and after one ends).
extends MarginContainer

var _box: VBoxContainer
var _name: LineEdit
var _code: LineEdit
var _queue_label: Label
var _server_label: Label
var _shown := ""

func _ready() -> void:
	Game.changed.connect(func(_w): _build())
	_build()
	Net.wake(_woke)

func _process(_d: float) -> void:
	if _queue_label and Game.status == "queue":
		_queue_label.text = _queue_text()

func _build() -> void:
	var key := Game.status + "|" + str(Game.lobby.hash()) + "|" + Game.error + "|" + str(Game.queue_info.get("n", -1))
	if key == _shown:
		return
	_shown = key
	for c in get_children():
		c.queue_free()
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	_box = Kit.vbox(12)
	_box.custom_minimum_size = Vector2(min(760.0, get_viewport_rect().size.x - 48.0), 0)
	_box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	scroll.add_child(_box)
	_queue_label = null
	match Game.status:
		"connecting": _simple("Connecting…", "If the game server was asleep, this can take up to a minute.", [["Cancel", Game.leave]])
		"queue": _queue()
		"lobby": _lobby()
		"error": _simple("Couldn’t join", Game.error, [["Back", Game.leave]])
		"ended": _simple("Match over", Game.end_reason, [["Back to the title", Game.leave]])
		_: _title()

func _heading(eyebrow: String, title: String, text: String) -> void:
	_box.add_child(Kit.label(eyebrow, "Muted"))
	var t := Kit.label(title, "Title")
	t.add_theme_font_size_override("font_size", 44)
	_box.add_child(t)
	if text != "":
		_box.add_child(Kit.label(text, "", true))

func _btn(text: String, cb: Callable, style := "Primary") -> Button:
	var b := Button.new()
	b.text = text
	b.theme_type_variation = style
	b.pressed.connect(cb)
	return b

func _simple(title: String, text: String, actions: Array) -> void:
	_heading("UNDERCROWN", title, text)
	var row := Kit.hbox(8)
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
	var snd := _btn("Sound off" if not Sfx.muted else "Sound on", func(): pass, "Ghost")
	snd.pressed.connect(func(): snd.text = "Sound on" if Sfx.toggle() else "Sound off")
	v.add_child(snd)
	box.add_child(v)
	_box.add_child(box)

func _woke(ok, _info) -> void:
	if is_instance_valid(_server_label):
		_server_label.text = "Game server: online." if ok else "Game server: waking up (it sleeps when nobody is playing; this can take up to a minute)…"

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
	_queue_label = Kit.label(_queue_text(), "", true)
	_box.add_child(_queue_label)
	_box.add_child(Kit.label("Bots fill empty seats up to 6.", "Muted"))
	_box.add_child(_btn("Cancel", Game.leave, "Ghost"))

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
	var row2 := Kit.hbox(8)
	if owner:
		row2.add_child(_btn("Start the match", Game.start_match))
	else:
		row2.add_child(Kit.label("Waiting for the host to start…", "Muted"))
	row2.add_child(_btn("Leave", Game.leave, "Ghost"))
	_box.add_child(row2)
