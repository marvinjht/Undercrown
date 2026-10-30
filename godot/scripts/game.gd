# The client's side of the game, as an autoload: Game.
# The game runs on the server (your "twin" there, see docs/PROTOCOL.md). This keeps what the server last said:
#   status   idle | connecting | queue | lobby | match | ended | error
#   view     every panel and screen, described by the server (src/present.js): titles, cards, buttons, stats...
#   s        the raw game state (the screens mostly use view; the arena uses s.battle)
# and sends your button presses back (act). Screens listen to `changed`.
extends Node

signal changed(what: String)

var status := "idle"
var error := ""
var cid := ""
var player_name := ""
var code := ""
var lobby: Dictionary = {}
var queue_info: Dictionary = {}
var players: Array = []
var my_slot := -1
var s: Dictionary = {}
var view: Dictionary = {}
var skew_ms := 0.0               # server clock minus this machine's clock
var server_version := ""
var want_solo := false
var end_reason := ""
var _beat := 0.0
var _active_room := -1
var _battle_done_key := ""
var _pending_open: Dictionary = {}

func _ready() -> void:
	Net.message.connect(_on_message)
	Net.opened.connect(_on_open)
	var cfg := ConfigFile.new()
	if cfg.load("user://settings.cfg") == OK:
		player_name = cfg.get_value("player", "name", "")

func save_name(n: String) -> void:
	player_name = n.strip_edges().left(14)
	var cfg := ConfigFile.new()
	cfg.load("user://settings.cfg")
	cfg.set_value("player", "name", player_name)
	cfg.save("user://settings.cfg")

func now_ms() -> float:
	return Time.get_unix_time_from_system() * 1000.0
# A time from the server, on this machine's clock
func local_ms(server_ms: float) -> float:
	return server_ms - skew_ms
# Seconds left until a server time (0 when it's passed or unset)
func secs_left(server_ms: float) -> float:
	if server_ms <= 0.0:
		return 0.0
	return max(0.0, (local_ms(server_ms) - now_ms()) / 1000.0)

# ---------- Starting ----------
func _hello(kind: String, extra := {}) -> void:
	cid = "g" + str(randi() % 100000000)
	status = "connecting"
	error = ""
	s = {}
	view = {}
	changed.emit("status")
	_pending_open = { "t": kind, "cid": cid, "name": player_name, "client": "godot" }
	_pending_open.merge(extra)
	# The server only takes clients on its own version: ask it which one it runs, then say hello
	Net.wake(func(ok, info):
		if not ok or typeof(info) != TYPE_DICTIONARY:
			status = "error"
			error = "Couldn't reach the game server. It may be waking up: try again in a moment."
			changed.emit("status")
			return
		server_version = str(info.get("version", ""))
		_pending_open["v"] = server_version
		Net.open()
		Net.send(_pending_open)
		if kind == "queue":
			status = "queue"
			changed.emit("status"))

func find_match(n: String) -> void:
	save_name(n)
	want_solo = false
	_hello("queue")
func create_room(n: String) -> void:
	save_name(n)
	want_solo = false
	_hello("create")
func join_room(room_code: String, n: String) -> void:
	save_name(n)
	want_solo = false
	code = room_code.strip_edges().to_upper()
	_hello("join", { "code": code })
# Play solo: a room of your own with bots, started at once
func play_solo(n: String) -> void:
	save_name(n)
	want_solo = true
	_hello("create")
func start_match() -> void:
	Net.send({ "t": "startReq", "from": cid })
func leave() -> void:
	if cid != "":
		Net.send({ "t": "bye", "cid": cid, "from": cid })
	Net.close()
	status = "idle"
	s = {}
	view = {}
	lobby = {}
	players = []
	my_slot = -1
	changed.emit("status")

# ---------- Button presses ----------
func act(fn: String, args: Array = [], mp := false) -> void:
	if fn.begins_with("ui_"):
		_ui_act(fn)
		return
	Net.send({ "t": "act", "fn": fn, "args": args, "mp": mp, "from": cid })

func _ui_act(fn: String) -> void:
	match fn:
		"ui_leave", "ui_title":
			leave()
		"ui_requeue":
			var n := player_name
			leave()
			find_match(n)
		"ui_rematch":
			Net.send({ "t": "rematchReq", "from": cid })

# Any input during a match: you're at the keyboard (once a room is enough)
func mark_active() -> void:
	if status != "match":
		return
	var r := int(s.get("room", -1))
	if r == _active_room:
		return
	_active_room = r
	act("markActive")

# The fight on screen finished playing
func battle_end(key: String) -> void:
	if key == _battle_done_key:
		return
	_battle_done_key = key
	act("battleEnd")

# ---------- Messages ----------
func _on_open() -> void:
	# Back after a dropped connection: say who we are again
	if status == "match" or status == "lobby" or status == "ended":
		Net.send({ "t": "rejoin", "cid": cid, "code": code, "name": player_name, "v": server_version, "room": s.get("room", null), "client": "godot", "from": cid })
	elif status == "queue" and not _pending_open.is_empty():
		Net.send(_pending_open)

func _process(delta: float) -> void:
	_beat += delta
	if _beat > 2.5:
		_beat = 0.0
		if Net.is_open() and cid != "":
			Net.send({ "t": "ping", "cid": cid, "from": cid })

func _on_message(m: Dictionary) -> void:
	match str(m.get("t", "")):
		"queue":
			if status == "queue":
				queue_info = m
				queue_info["at"] = now_ms()
				changed.emit("status")
		"lobby":
			lobby = m.get("lobby", {})
			if lobby.get("code"):
				code = lobby.code
			if status == "match":
				return
			var mine := false
			for sl in lobby.get("slots", []):
				if sl is Dictionary and sl.get("cid") == cid:
					mine = true
			if status in ["connecting", "queue"]:
				if mine:
					status = "lobby"
				elif lobby.get("started", false):
					status = "error"
					error = "That match has already started."
			elif status == "lobby" and not mine:
				status = "error"
				error = "You were removed from the room."
			if status == "lobby" and want_solo and lobby.get("ownerCid") == cid and not lobby.get("started", false):
				want_solo = false
				start_match()
			changed.emit("status")
		"start":
			players = m.get("players", [])
			for p in players:
				if p.get("cid") == cid:
					my_slot = int(p.slot)
			status = "match"
			s = {}
			view = {}
			_active_room = -1
			changed.emit("status")
		"state":
			_on_state(m)
		"version":
			status = "error"
			error = "This client and the game server are on different versions (server: %s)." % m.get("v", "?")
			changed.emit("status")
		"joinError":
			if m.get("cid") == cid:
				status = "error"
				error = str(m.get("reason", "Couldn't join."))
				changed.emit("status")
		"rematch":
			lobby = m.get("lobby", {})
			s = {}
			view = {}
			status = "lobby"
			changed.emit("status")
		"end", "kick":
			if m.get("t") == "kick" and int(m.get("slot", -2)) != my_slot:
				return
			status = "ended"
			end_reason = str(m.get("reason", "You’ve been removed from the match for inactivity: the clock ran out on you two rooms in a row."))
			changed.emit("status")

# Only what changed comes in; merge it
func _on_state(m: Dictionary) -> void:
	skew_ms = float(m.get("now", now_ms())) - now_ms()
	if m.get("full", false) or s.is_empty():
		s = {}
		view = {}
	var ms: Dictionary = m.get("s", {})
	if ms.has("battle") and ms.battle is Dictionary and str(ms.battle.get("res", "")) == "$same" and s.has("battle"):
		ms.battle["res"] = s.battle.get("res")
	for k in ms:
		s[k] = ms[k]
	for k in m.get("del", []):
		s.erase(k)
	var mv: Dictionary = m.get("view", {})
	var parts: Array = []
	for k in mv:
		if k == "rivals":
			var r: Dictionary = view.get("rivals", {})
			r.merge(mv.rivals, true)
			view["rivals"] = r
		else:
			view[k] = mv[k]
		parts.append(k)
	for snd in m.get("sounds", []):
		if snd is Array and snd.size() > 0:
			Sfx.play(str(snd[0]))
	if parts.size() > 0 or ms.size() > 0:
		changed.emit("state:" + ",".join(parts) + ("|battle" if ms.has("battle") else ""))
