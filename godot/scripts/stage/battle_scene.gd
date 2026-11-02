# The fight, on the stage: the match view's arena (it plays the server's result) fills the room. Same floor and
# torches as the arena always had, so walking through a door into a fight is one continuous place.
extends Control

const FULL_FLOOR := true
static func use_full_floor(_prev: String) -> bool:
	return true
# A duel or tournament fight plays in the room you met in (no cut)
static func same_room(prev: String) -> bool:
	var b = Game.s.get("battle")
	return b is Dictionary and (b.get("duel", false) or b.get("tour", false)) and prev in ["duelWait", "duelIntro", "tournament"]
var stage: StageView
var log_panel: PanelContainer

static func key_for(_sc: Dictionary) -> String:
	return str(Game.s.get("battle", {}).get("title", "")) if Game.s.get("battle") is Dictionary else ""

func build(_sc: Dictionary) -> void:
	var me: Dictionary = Game.view.get("me", {})   # what you have now; after the fight the loot room shows what you got
	stage.pre_battle = { "gold": me.get("gold", 0), "xp": me.get("xp", 0), "level": me.get("level", 1), "xpNeed": me.get("xpNeed", 0) }
	# What the room needs to know afterwards: who won, and your hearts before (the aftermath shows what was lost)
	var b = Game.s.get("battle")
	var kind := "fight"
	if b is Dictionary:
		kind = "tour" if b.get("tour", false) else "duel" if b.get("duel", false) else "fight"
		var mir: bool = b.get("mirror", false)
		var r: Dictionary = b.get("res", {}) if b.get("res") is Dictionary else {}
		var vis: Dictionary = b.get("visual", {}) if b.get("visual") is Dictionary else {}
		stage.last_fight = { "kind": kind, "mirror": mir, "draw": r.get("draw", false), "won": not r.get("draw", false) and str(r.get("winner", "")) == ("b" if mir else "a"),
			"room": int(Game.view.get("top", {}).get("room", 0)), "hearts": int(me.get("hearts", 0)), "opp": vis.get("a") if mir else vis.get("b0") }
	if kind != "fight":
		pvp_decor(stage.world_node(), kind == "tour")
	var a: Control = stage.mv.arena
	if a.get_parent():
		a.get_parent().remove_child(a)
	add_child(a)
	a.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	a.bare = true   # the stage's own floor and torches; fighters stand exactly where the stage puts people
	a.fit_stage = stage
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

func pvp_decor(world: Control, hall: bool) -> void:
	preload("res://scripts/stage/pvp_room.gd").decor(world, hall)

# A duel or tournament fight ends with a short tail (the arena plays on a second after the last blow) before the
# server moves on. The aftermath starts in it, never holding anything up: the loser is down; if you won you walk off
# to the right; if you lost a heart breaks over you and the winner walks off to the left, past you (a ghost fades).
# The room that comes next carries on from there (pvp_room.gd aftermath), or is simply the next room.
var _tail := false
func _tail_check() -> void:
	var L: Dictionary = stage.last_fight
	var a = stage.mv.arena
	if _tail or L.is_empty() or str(L.get("kind", "")) == "fight" or not a or not a.playing or a.idx < a.events.size():
		return
	_tail = true
	L["tail"] = true
	var mine := "b" if L.get("mirror", false) else "a"
	var me_f: Dictionary = {}
	var op_f: Dictionary = {}
	for id in a.F:
		var f: Dictionary = a.F[id]
		if f.m.get("ally", false) or f.m.get("hologram", false):
			continue
		if str(f.side) == mine:
			me_f = f
		elif op_f.is_empty():
			op_f = f
	if me_f.is_empty() or op_f.is_empty():
		return
	var P = preload("res://scripts/stage/pvp_room.gd")
	var my_pos: Vector2 = me_f.node.position
	if L.get("won", false):
		later(0.3, func(): _walk_off(me_f, true, false))
	else:
		later(0.15, func(): P.heart_fx(stage, my_pos))
		if not L.get("draw", false):
			if int(L.get("hearts", 2)) <= 1:
				P.blood_fx(stage, my_pos)
			var ov = L.get("opp")
			var ghost: bool = ov is Dictionary and ov.get("ghost", false)
			later(0.4, func(): _walk_off(op_f, false, ghost))

func _walk_off(f: Dictionary, right: bool, fade: bool) -> void:
	var n: Node2D = f.node
	if not is_instance_valid(n) or f.dead:
		return
	f.gone = true   # the arena stops placing it; it walks out on its own
	f.name.visible = false
	if fade:
		n.create_tween().tween_property(n, "modulate:a", 0.0, 0.5)
		return
	n.scale.x = absf(n.scale.x) * (1.0 if right else -1.0)
	var tw := n.create_tween()
	tw.tween_property(n, "position:x", StageView.W + 50.0 if right else -50.0, 1.6)

# The log sits in the bottom left corner, whatever its size
func _process(_d: float) -> void:
	_tail_check()
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

# Run f after t seconds, unless this room is gone by then
func later(t: float, f: Callable) -> void:
	var tw := create_tween()
	tw.tween_interval(max(0.01, t))
	tw.tween_callback(f)
