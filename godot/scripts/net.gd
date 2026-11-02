# The connection to the game server (a WebSocket), as an autoload: Net.
# Sends and receives JSON messages (docs/PROTOCOL.md). If the connection drops in a match, it reconnects
# and Game says hello again (rejoin), so a hiccup never loses your seat.
extends Node

signal message(msg: Dictionary)
signal opened
signal closed

# The game server. Override with the command line: --server=http://localhost:8080
const DEFAULT_SERVER := "https://undercrown-e04u.onrender.com"
var server_url := DEFAULT_SERVER

var ws: WebSocketPeer = null
var _state := WebSocketPeer.STATE_CLOSED
var _queue: Array[String] = []
var _want_open := false
var _retry_at := 0.0
var _tries := 0

func _ready() -> void:
	for a in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if a.begins_with("--server="):
			server_url = a.substr(9).rstrip("/")

func ws_url() -> String:
	return server_url.replace("https://", "wss://").replace("http://", "ws://") + "/ws"

# Open the connection (does nothing if it's already open or opening)
func open() -> void:
	_want_open = true
	if ws and (_state == WebSocketPeer.STATE_OPEN or _state == WebSocketPeer.STATE_CONNECTING):
		return
	ws = WebSocketPeer.new()
	ws.inbound_buffer_size = 4 * 1024 * 1024
	ws.max_queued_packets = 4096
	var err := ws.connect_to_url(ws_url())
	if err != OK:
		push_warning("WebSocket connect failed: %s" % err)
	_state = WebSocketPeer.STATE_CONNECTING

func close() -> void:
	_want_open = false
	_queue.clear()
	if ws:
		ws.close()
	ws = null
	_state = WebSocketPeer.STATE_CLOSED

func is_open() -> bool:
	return ws != null and _state == WebSocketPeer.STATE_OPEN

func send(msg: Dictionary) -> void:
	var text := JSON.stringify(msg)
	if is_open():
		ws.send_text(text)
	else:
		_queue.append(text)

func _process(_delta: float) -> void:
	if ws == null:
		if _want_open and Time.get_ticks_msec() / 1000.0 >= _retry_at and _retry_at > 0.0:
			_retry_at = 0.0
			open()
		return
	ws.poll()
	var st := ws.get_ready_state()
	if st != _state:
		var was := _state
		_state = st
		if st == WebSocketPeer.STATE_OPEN:
			_tries = 0
			opened.emit()
			while _queue.size() > 0 and is_open():
				ws.send_text(_queue.pop_front())
		elif st == WebSocketPeer.STATE_CLOSED:
			ws = null
			closed.emit()
			if _want_open:
				_tries += 1
				_retry_at = Time.get_ticks_msec() / 1000.0 + min(4.0, 0.5 * _tries)
			return
	while ws and ws.get_available_packet_count() > 0:
		var text := ws.get_packet().get_string_from_utf8()
		var m = JSON.parse_string(text)
		if typeof(m) == TYPE_DICTIONARY:
			message.emit(m)

# ---------- Waking the server ----------
# A free Render server sleeps when nobody plays and takes a minute or more to wake. wake() keeps asking /health
# every few seconds for up to WAKE_LIMIT seconds; everyone who asked meanwhile gets the one answer: cb(ok, info),
# info being the /health answer ({ ok, version, ... }). The title screen starts it as soon as it opens, so the server
# is usually awake by the time the player picks Play. Each call asks again, so the version is always fresh.
signal wake_changed
const WAKE_LIMIT := 90.0      # seconds before giving up
const WAKE_TRY := 12.0        # one request's timeout (a waking server may hold a request a while before answering)
const WAKE_GAP := 3.0         # seconds between tries
var wake_state := "idle"      # idle, waking, awake, failed
var wake_info = null
var _wake_t0 := 0
var _wake_gen := 0
var _wake_cbs: Array[Callable] = []

func wake(cb := Callable()) -> void:
	if cb.is_valid():
		_wake_cbs.append(cb)
	if wake_state == "waking":
		return
	wake_state = "waking"
	_wake_t0 = Time.get_ticks_msec()
	_wake_gen += 1
	wake_changed.emit()
	_wake_try(_wake_gen)

# Seconds since this wake-up started
func wake_elapsed() -> float:
	return float(Time.get_ticks_msec() - _wake_t0) / 1000.0

# Stop waiting (Cancel): nobody gets an answer, the next wake() starts over
func cancel_wake() -> void:
	_wake_gen += 1
	_wake_cbs.clear()
	if wake_state == "waking":
		wake_state = "idle"
		wake_changed.emit()

func _wake_try(gen: int) -> void:
	if gen != _wake_gen:
		return
	var h := HTTPRequest.new()
	add_child(h)
	h.timeout = clampf(WAKE_LIMIT - wake_elapsed(), 2.0, WAKE_TRY)
	h.request_completed.connect(func(result, code, _headers, body):
		h.queue_free()
		var info = JSON.parse_string(body.get_string_from_utf8()) if result == HTTPRequest.RESULT_SUCCESS and code == 200 else null
		_wake_result(gen, info))
	if h.request(server_url + "/health") != OK:
		h.queue_free()
		_wake_result(gen, null)

func _wake_result(gen: int, info) -> void:
	if gen != _wake_gen:
		return   # cancelled, or a newer wake-up took over
	if info is Dictionary:
		wake_state = "awake"
		wake_info = info
		_wake_done(true, info)
	elif wake_elapsed() >= WAKE_LIMIT - 0.5:
		wake_state = "failed"
		_wake_done(false, null)
	else:   # asleep, booting (502/503), or no answer yet: ask again in a moment
		get_tree().create_timer(WAKE_GAP).timeout.connect(func(): _wake_try(gen))

func _wake_done(ok: bool, info) -> void:
	var cbs := _wake_cbs.duplicate()
	_wake_cbs.clear()
	wake_changed.emit()
	for c in cbs:
		if c.is_valid():
			c.call(ok, info)
