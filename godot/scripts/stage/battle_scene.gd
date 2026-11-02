# The fight, on the stage: the match view's arena (it plays the server's result) fills the room. Same floor and
# torches as the arena always had, so walking through a door into a fight is one continuous place.
extends Control

const FULL_FLOOR := true
static func use_full_floor(_prev: String) -> bool:
	return true
static func same_room(_prev: String) -> bool:
	return false
var stage: StageView
var log_panel: PanelContainer

static func key_for(_sc: Dictionary) -> String:
	return str(Game.s.get("battle", {}).get("title", "")) if Game.s.get("battle") is Dictionary else ""

func build(_sc: Dictionary) -> void:
	var me: Dictionary = Game.view.get("me", {})   # what you have now; after the fight the loot room shows what you got
	stage.pre_battle = { "gold": me.get("gold", 0), "xp": me.get("xp", 0), "level": me.get("level", 1), "xpNeed": me.get("xpNeed", 0) }
	var a: Control = stage.mv.arena
	if a.get_parent():
		a.get_parent().remove_child(a)
	add_child(a)
	a.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	a.modulate = stage.tint
	# The fight's log, small, bottom left
	log_panel = Kit.panel("")
	log_panel.self_modulate = Color(1, 1, 1, 0.85)
	log_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var lb := Kit.vbox(1)
	lb.custom_minimum_size = Vector2(280, 0)
	log_panel.add_child(lb)
	add_child(log_panel)
	stage.mv.log_box = lb
	stage.mv._render_log()

# The log sits in the bottom left corner, whatever its size
func _process(_d: float) -> void:
	if log_panel:
		log_panel.reset_size()
		log_panel.position = Vector2(10, size.y - log_panel.size.y - 10)
		log_panel.visible = log_panel.get_child(0).get_child_count() > 0

# The match view rebuilds the screen now and then (the arena keeps playing): put the arena back if it was taken
func refresh(_sc: Dictionary) -> void:
	var a: Control = stage.mv.arena
	if a.get_parent() != self:
		if a.get_parent():
			a.get_parent().remove_child(a)
		add_child(a)
		move_child(a, 0)
		a.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	a.modulate = stage.tint

