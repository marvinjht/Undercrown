# The duel room (rooms 10 and 20). You walk in and wait on the left, facing right ("Waiting for your opponent") while
# everyone is paired up (duelWait). Your opponent walks in from the right in their real gear (a ghost fades in), and
# the face-off card shows them beside you while the countdown runs (duelIntro). The fight plays right here: the
# battle scene takes over the same room without a cut. After it, the waiting screen comes back to this room: the
# aftermath plays (pvp_room.gd), then the waiting panel (who's still playing, the skip vote) comes up under it.
extends "res://scripts/stage/pvp_room.gd"

static func same_room(prev: String) -> bool:
	return prev in ["duelWait", "duelIntro", "battle"]

static func overlay_for(sc: Dictionary) -> String:
	return "panel" if str(sc.get("phase", "")) == "waiting" else ""

# The waiting screen right after your duel stays in the duel room
static func claims(st) -> bool:
	var L: Dictionary = st.last_fight
	return str(L.get("kind", "")) == "duel" and int(L.get("room", -1)) == int(Game.view.get("top", {}).get("room", 0)) and st.phase_now in ["battle", "waiting"]

var phase := ""

func build(sc: Dictionary) -> void:
	phase = str(sc.get("phase", ""))
	decor(stage.world_node(), false)
	if phase == "waiting":
		stage.hold_panel = true
		aftermath(func(_out): stage.show_panel())
		top_line("")
		return
	walk_in_me(stage.prev_phase not in ["duelWait", "duelIntro"])
	_show(sc)

func refresh(sc: Dictionary) -> void:
	if phase != "waiting":
		_show(sc)

func _show(sc: Dictionary) -> void:
	var o = null
	var ends := 0.0
	var label := ""
	for sec in sc.get("sections", []):
		match str(sec.get("kind", "")):
			"opponent": o = sec.get("opponent")
			"timer":
				label = str(sec.get("label", ""))
				ends = float(sec.get("ends", 0))
	if o is Dictionary:
		opp_in(o.get("look"), o.get("ghost", false))
		if not is_instance_valid(face):
			face_card(o)
		top_line("Duel: " + label, ends, sc.get("notes", []))
	else:
		top_line("Duel: waiting for your opponent")
