# The end of a run: out of hearts (dead), the ending, a match that's over (mpEnded). Everything those screens show
# (the placement, the buttons...) comes up as a panel over the darkened stage, with your hero still visible behind it:
# fallen and bloody, or crowned. Straight after the fight that took your last heart, the fall plays first (where you
# stood in that fight) and a banner says how far you got.
extends "res://scripts/stage/pvp_room.gd"

static func same_room(prev: String) -> bool:
	return prev == "battle"

static func overlay_for(_sc: Dictionary) -> String:
	return "panel"

func build(sc: Dictionary) -> void:
	var phase := str(sc.get("phase", ""))
	var room := int(Game.s.get("room", Game.view.get("top", {}).get("room", 0)))
	var h = sc.get("hall")
	var champ = null
	if h is Dictionary:
		for e in h.get("entrants", []):
			if e.get("champion", false):
				champ = e
	if str(stage.last_fight.get("kind", "")) == "duel" or str(stage.last_fight.get("kind", "")) == "tour":
		decor(stage.world_node(), str(stage.last_fight.kind) == "tour")
	stage.hold_panel = true
	if phase == "dead" and stage.prev_phase == "battle":
		aftermath(func(_out):
			banner("You made it to room %d" % room, _how(room))
			later(1.4, func():
				if is_instance_valid(big):
					big.queue_free()
				stage.show_panel()), false)
		return
	if champ is Dictionary and champ.get("me", false):   # you won it all
		me = hero_at("me", Vector2(StageView.W / 2.0, 200), null)
		crown(me)
	elif phase == "mpEnded":
		me = hero_at("me", Vector2(StageView.W / 2.0, 200), null)
	else:   # down for good
		me = hero_at("me", Vector2(StageView.W / 2.0, 200), null)
		fall(me, true, true)
	dim()
	later(0.3, func(): stage.show_panel())

func _how(room: int) -> String:
	if room >= 30:
		return "All the way to the tournament."
	if room >= 20:
		return "Past both duels."
	if room >= 10:
		return "Past the first duel."
	return "The dungeon got you early."

func refresh(_sc: Dictionary) -> void:
	pass
