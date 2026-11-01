# A row whose tooltip is a list of lines ({ text, short? }), short by default and full while Shift is held
extends HBoxContainer

var lines: Array = []

func _make_custom_tooltip(_for_text: String) -> Object:
	if lines.is_empty():
		return null
	return Kit.lines_tip(lines)
