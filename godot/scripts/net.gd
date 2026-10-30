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

# Wake a sleeping free server (the title screen calls this). Calls back with true when it answers.
func wake(cb: Callable) -> void:
	var h := HTTPRequest.new()
	add_child(h)
	h.timeout = 20.0
	h.request_completed.connect(func(result, code, _headers, body):
		h.queue_free()
		var ok: bool = result == HTTPRequest.RESULT_SUCCESS and code == 200
		var info = JSON.parse_string(body.get_string_from_utf8()) if ok else null
		cb.call(ok, info))
	h.request(server_url + "/health")
