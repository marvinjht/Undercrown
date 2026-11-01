# A label with two texts: the short one by default, the full one while Shift is held (Game.details).
# An empty text hides the label in that mode. Switches in place, so open tooltips update without moving the mouse.
extends Label

var full := ""
var short := ""

func _ready() -> void:
	Game.details_changed.connect(_refresh)
	_refresh()

func _refresh() -> void:
	text = full if Game.details else short
	visible = text != ""
	_fit_window()

# Inside a tooltip, resize the tooltip to the new text once the layout has caught up
func _fit_window() -> void:
	var w := get_window()
	if w == null or w == get_tree().root or not (w is Popup):
		return
	await get_tree().process_frame
	await get_tree().process_frame
	if is_instance_valid(w) and w.visible:
		w.reset_size()
