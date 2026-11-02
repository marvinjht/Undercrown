# Testing aid: run with  -- --auto [--shots=DIR] [--server=URL]  and the client plays by itself
# (solo against bots), pressing the first enabled button of each screen and saving a screenshot of each new screen.
# Doors are picked the way a player does on the stage: a number key, then Enter. --size=1280x720 sets the window size.
extends Node

var shots_dir := ""
var seen: Dictionary = {}
var t := 0.0
var started := false
var shot_count := 0
var picking := false   # an item pick (keys, waits) is in progress

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shots="):
			shots_dir = a.substr(8)
		if a.begins_with("--size="):
			var wh := a.substr(7).split("x")
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_size(Vector2i(int(wh[0]), int(wh[1])))
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)

func _process(delta: float) -> void:
	if picking:
		return
	t += delta
	if "--title" in OS.get_cmdline_user_args():
		if t > 2.0 and not started:
			started = true
			_shot("title")
			get_tree().quit()
		return
	if not started:
		started = true
		var join := ""
		for a in OS.get_cmdline_user_args():
			if a.begins_with("--join="):
				join = a.substr(7)
		if join != "":
			Game.join_room(join, "Godot")
		else:
			Game.play_solo("Auto")
		return
	if t < 0.7:
		return
	t = 0.0
	if Game.status != "match" or Game.view.is_empty():
		print("auto: status ", Game.status, " ", Game.error)
		return
	var sc: Dictionary = Game.view.get("screen", {})
	var phase := str(sc.get("phase", ""))
	print("auto: room ", Game.s.get("room", 0), " ", phase)
	if (not seen.has(phase) or (phase == "tournament" and not seen.has("tour2") and Game.s.get("tourPhase") == "fight")) and shots_dir != "":
		if phase == "tournament" and seen.has(phase):
			seen["tour2"] = true
		seen[phase] = true
		await get_tree().create_timer(0.5).timeout
		_shot(phase)
	if phase == "battle" or phase == "waiting":
		return
	var btns: Array = []
	var best_door = null
	var best_threat := 99
	for sec in sc.get("sections", []):
		for d in sec.get("doors", []):
			var th := 0
			if d.get("threat") is Dictionary:
				th = int(d.threat.get("skulls", 3))
			if str(d.get("type", "")) in ["rest", "purify", "trainer", "vault", "trash", "armory"]:
				th = -1
			if th < best_threat:
				best_threat = th
				best_door = d
	if best_door:
		# On the stage: press the door's number, then Enter (what a player does with the keyboard)
		var mv = get_tree().root.find_child("Match", true, false)
		var scene = mv.stage_view.scene if mv and mv.stage_view else null
		if scene and scene.has_method("confirm"):
			if not scene.gone:
				_key(KEY_1 + int(best_door.get("i", 0)))
				await get_tree().create_timer(0.35).timeout
				if is_instance_valid(scene) and not scene.gone:
					_key(KEY_ENTER)
			return
		btns.append(best_door.button)
	for sec in sc.get("sections", []):
		for c in sec.get("cards", []):
			btns.append_array(c.get("buttons", []))
		btns.append_array(sec.get("buttons", []))
		if sec.get("tree") is Dictionary:
			for r in sec.tree.rows:
				for n in r.nodes:
					if n.get("button") is Dictionary:
						btns.append(n.button)
	for style in ["primary", "normal", "ghost"]:
		for b in btns:
			if b.get("enabled", false) and str(b.get("style", "")) == style and not str(b.act).begins_with("ui_"):
				if await _item_room_pick(b):
					return
				Game.act(str(b.act), b.get("args", []), b.get("mp", false))
				return

func _shot(name: String) -> void:
	shot_count += 1
	var img := get_viewport().get_texture().get_image()
	img.save_png("%s/%02d_%s.png" % [shots_dir, shot_count, name])

func _key(code: Key) -> void:
	for down in [true, false]:
		var k := InputEventKey.new()
		k.keycode = code
		k.pressed = down
		get_viewport().push_input(k)

# In an item room on the stage (armory, rewards, spoils): pick the item's number, then Enter, as a player would
func _item_room_pick(b: Dictionary) -> bool:
	picking = true
	var r: bool = await _item_room_pick2(b)
	picking = false
	return r

func _item_room_pick2(b: Dictionary) -> bool:
	var mv = get_tree().root.find_child("Match", true, false)
	var scene = mv.stage_view.scene if mv and mv.stage_view else null
	if scene == null or not ("entries" in scene) or scene.gone:
		return false
	for e in scene.entries:
		for x in e.c.get("buttons", []):
			if str(x.get("act")) == str(b.act) and str(x.get("args")) == str(b.get("args")):
				_key(KEY_1 + int(e.i))
				await get_tree().create_timer(0.3).timeout
				if is_instance_valid(scene) and not scene.gone:
					_key(KEY_ENTER)
				return true
	return false
