# The root: shows the title screens (title, queue, lobby) or the match, as Game.status says.
extends Control

@onready var title_view: Control = %Title
@onready var match_view: Control = %Match

func _ready() -> void:
	Game.changed.connect(_on_changed)
	_on_changed("status")
	if "--auto" in OS.get_cmdline_user_args() or "--title" in OS.get_cmdline_user_args():
		add_child(preload("res://scripts/autoplay.gd").new())

func _on_changed(_what: String) -> void:
	var in_match := Game.status == "match" and not Game.view.is_empty()
	match_view.visible = in_match
	title_view.visible = not in_match

func _input(event: InputEvent) -> void:
	if (event is InputEventMouseButton and event.pressed) or (event is InputEventKey and event.pressed):
		Game.mark_active()
