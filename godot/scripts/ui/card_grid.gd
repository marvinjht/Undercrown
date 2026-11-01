# A grid of same-width cards: as many columns as the space allows, centered. A grid row is as tall as its tallest
# card, so every card in a row has the same height (cards push their buttons to the bottom).
extends GridContainer

var cell_w := 214.0
var _watching: Control = null

# Follow the parent's width only while on screen (the screen is rebuilt often; old grids are thrown away)
func _enter_tree() -> void:
	_watching = get_parent() as Control
	if _watching and not _watching.resized.is_connected(_fit):
		_watching.resized.connect(_fit)
	_fit()

func _exit_tree() -> void:
	if is_instance_valid(_watching) and _watching.resized.is_connected(_fit):
		_watching.resized.disconnect(_fit)
	_watching = null

func _fit() -> void:
	var p := get_parent() as Control
	if p == null:
		return
	var sep := float(get_theme_constant("h_separation"))
	var w: float = p.size.x
	if w <= 0.0:
		return
	columns = clampi(int((w + sep) / (cell_w + sep)), 1, max(1, get_child_count()))
