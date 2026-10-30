# A button you press and hold to confirm (equipping over a worn piece sells it)
extends Button

signal held

const HOLD_SECS := 0.6
var _t := -1.0

func _ready() -> void:
	button_down.connect(func(): _t = 0.0)
	button_up.connect(func(): _t = -1.0; queue_redraw())
	mouse_exited.connect(func(): _t = -1.0; queue_redraw())

func _process(delta: float) -> void:
	if _t < 0.0 or disabled:
		return
	_t += delta
	queue_redraw()
	if _t >= HOLD_SECS:
		_t = -1.0
		queue_redraw()
		held.emit()

func _draw() -> void:
	if _t > 0.0:
		draw_rect(Rect2(Vector2(4, size.y - 6), Vector2((size.x - 8) * min(1.0, _t / HOLD_SECS), 3)), Color("#e8903f"))
