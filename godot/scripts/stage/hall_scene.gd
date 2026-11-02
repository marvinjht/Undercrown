# The tournament (room 30): a big arena hall with stone stands full of people, banners, torches. The bracket hangs over
# the stands as cloth banners, one per match of the round, with the result once it's in. Players waiting for their
# match stand along the back; players knocked out lie at the sides with their place. Every match of a round runs at
# the same time (each player fights their own), so the stage shows yours: you on the left, your opponent walks in from
# the right, the face-off card, then the fight in this same hall. Out: you stay down and watch the rest from here.
# The winner gets a crown and sparks, everyone else gets up along the back and cheers; then the final panel (places,
# bracket, buttons) slides up.
extends "res://scripts/stage/pvp_room.gd"

const BACK_Y := 116.0                # where players wait, along the back
const SIDE_Y := 318.0                # where the knocked out lie

static func same_room(prev: String) -> bool:
	return prev in ["battle", "tournament"]

static func key_for(sc: Dictionary) -> String:
	var h = sc.get("hall")
	return "end" if h is Dictionary and _champion(h) != null else ""

static func overlay_for(sc: Dictionary) -> String:
	var h = sc.get("hall")
	return "panel" if h is Dictionary and _champion(h) != null else ""

static func _champion(h: Dictionary):
	for e in h.get("entrants", []):
		if e.get("champion", false):
			return e
	return null

var people := {}                     # entrant id -> StageHero (everyone but you and your opponent)
var flags: Array = []                # the bracket banners
var _sig := ""
var _done_after := false
var _ended := false
var opp_id := ""

func build(sc: Dictionary) -> void:
	decor(stage.world_node(), true)
	var h = sc.get("hall")
	var hall: Dictionary = h if h is Dictionary else {}
	if _champion(hall) != null:
		stage.hold_panel = true
	if stage.prev_phase == "battle" and str(stage.last_fight.get("kind", "")) == "tour":
		aftermath(func(_out):
			_done_after = true
			_people(Game.view.get("screen", {}), true), false)
	else:
		_done_after = true
	_show(sc)

func refresh(sc: Dictionary) -> void:
	_show(sc)

func _exit_tree() -> void:
	super._exit_tree()
	for f in flags:
		if is_instance_valid(f):
			f.queue_free()

func _show(sc: Dictionary) -> void:
	var h = sc.get("hall")
	var hall: Dictionary = h if h is Dictionary else {}
	var o = null
	var ends := 0.0
	var label := ""
	var bracket: Dictionary = {}
	for sec in sc.get("sections", []):
		match str(sec.get("kind", "")):
			"opponent": o = sec.get("opponent")
			"bracket": bracket = sec.get("bracket", {})
			"timer":
				label = str(sec.get("label", ""))
				ends = float(sec.get("ends", 0))
	_flags(bracket)
	var champ = _champion(hall)
	if champ != null:
		top_line("")
		_finale(hall)
		return
	if _done_after:
		_people(sc, false)
	var me_e := _me(hall)
	var out: bool = me_e.get("out", false) or bool(Game.view.get("out", false))
	if o is Dictionary and not out and _done_after:
		opp_in(o.get("look"), o.get("ghost", false))
		if not is_instance_valid(face):
			face_card(o)
	elif is_instance_valid(face):
		face.queue_free()
	var head := "Tournament, round %d" % int(hall.get("round", 1))
	if out:
		head = "You're out%s: watching the tournament" % (" (%s)" % me_e.place if me_e.get("place") else "")
	top_line(head + (": " + label if label != "" else ""), ends, sc.get("notes", []))

func _me(hall: Dictionary) -> Dictionary:
	for e in hall.get("entrants", []):
		if e.get("me", false):
			return e
	return {}

# Everyone in their place: you on the left (or down where you fell), waiting players along the back, the knocked out
# lying at the sides. Only moves people when something changed (someone was knocked out, a new opponent).
func _people(sc: Dictionary, walk: bool) -> void:
	var h = sc.get("hall")
	if not (h is Dictionary):
		return
	var opp_info = h.get("opp")
	var new_opp := ""
	if opp_info is Dictionary:
		new_opp = str(opp_info.get("id", "")) if not opp_info.get("ghost", false) else "ghost"
	var sig := JSON.stringify([h.get("entrants", []).map(func(e): return [e.id, e.out]), new_opp])
	if sig == _sig:
		return
	_sig = sig
	if new_opp != opp_id and is_instance_valid(opp) and new_opp == "":
		opp.queue_free()
	opp_id = new_opp
	var me_e := _me(h)
	var me_out: bool = me_e.get("out", false) or bool(Game.view.get("out", false))   # out in the tournament, or before it
	if not is_instance_valid(me):
		me = hero_at("me", ME if not me_out else Vector2(70, SIDE_Y), null)
		if me_out:
			fall(me, false, true)
	elif not me_out and walk:
		me.walk_to(ME, 220.0, 1.2)
		_face_later(me, true, 1.25)
	var back: Array = []
	var down: Array = []
	for e in h.get("entrants", []):
		if e.get("me", false) or str(e.id) == opp_id:
			continue
		(down if e.get("out", false) else back).append(e)
	for id in people.keys():
		if is_instance_valid(people[id]):
			people[id].queue_free()
	people.clear()
	for i in back.size():
		var e: Dictionary = back[i]
		var x := StageView.W / 2.0 + (i - (back.size() - 1) / 2.0) * 62.0
		var p := hero_at("p" + str(e.id), Vector2(x, BACK_Y), e.get("look"), x < StageView.W / 2.0)
		p.scale *= 0.85
		people[str(e.id)] = p
	for i in down.size():
		var e: Dictionary = down[i]
		var left := i % 2 == 0
		var x: float = (250.0 - (i / 2) * 70.0) if left else (StageView.W - 250.0 + (i / 2) * 70.0)
		var p := hero_at("p" + str(e.id), Vector2(clampf(x, 40, StageView.W - 40), SIDE_Y), e.get("look"), left)
		p.scale *= 0.85
		fall(p, false, true)
		people[str(e.id)] = p

# The bracket over the stands: one banner per match this round, the names and how it went
func _flags(bracket: Dictionary) -> void:
	for f in flags:
		if is_instance_valid(f):
			f.queue_free()
	flags.clear()
	var rounds: Array = bracket.get("rounds", [])
	if rounds.is_empty():
		return
	for m in rounds[rounds.size() - 1].get("matches", []):
		var p := PanelContainer.new()
		var st := StyleBoxFlat.new()
		st.bg_color = Color("#6a1a1c", 0.94) if m.get("mine", false) else Color("#3a1416", 0.9)
		st.border_color = Art.GOLD if m.get("mine", false) else Color("#8a6a2a")
		st.border_width_top = 3
		st.border_width_bottom = 1
		st.border_width_left = 1
		st.border_width_right = 1
		st.set_content_margin_all(5)
		p.add_theme_stylebox_override("panel", st)
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var v := Kit.vbox(0)
		for side in ["a", "b"]:
			var r: Dictionary = m.get(side, {})
			var won = r.get("won")
			var col: Color = Art.GOLD if won == true else (Art.MUTED if won == false else Art.TEXT)
			var l := Kit.label(str(r.get("name", "?")), "Muted", false, col)
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			v.add_child(l)
		var n := Kit.label(str(m.get("note", "")), "Muted", false, Color("#d8c8a8"))
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		n.add_theme_font_size_override("font_size", 9)
		v.add_child(n)
		p.add_child(v)
		stage.ui.add_child(p)
		flags.append(p)

func place_ui() -> void:
	super.place_ui()
	if flags.is_empty() or not is_instance_valid(stage):
		return
	var y := stage.to_stage(Vector2(0, 4)).y + (top.size.y + 6.0 if is_instance_valid(top) and top.visible else 0.0)
	var total := 0.0
	for f in flags:
		f.reset_size()
		total += f.size.x + 10.0
	var x := (stage.size.x - total + 10.0) / 2.0
	for f in flags:
		f.position = Vector2(x, max(y, 6.0))
		x += f.size.x + 10.0

# The end: the winner in the middle with a crown, everyone else up along the back, cheering; then the final panel
func _finale(hall: Dictionary) -> void:
	if _ended:
		return
	_ended = true
	if is_instance_valid(face):
		face.queue_free()
	for id in people.keys():
		if is_instance_valid(people[id]):
			people[id].queue_free()
	people.clear()
	if is_instance_valid(opp):
		opp.queue_free()
	if is_instance_valid(me):
		me.queue_free()
	var champ: Dictionary = _champion(hall)
	var in_it := false
	for e in hall.get("entrants", []):
		in_it = in_it or e.get("me", false)
	if not in_it:   # you were out before the tournament: you lie at the side and see it end
		var lying := hero_at("me", Vector2(70, SIDE_Y), null)
		lying.scale *= 0.85
		fall(lying, false, true)
	var others: Array = hall.get("entrants", []).filter(func(e): return not e.get("champion", false))
	var w := hero_at("me" if champ.get("me", false) else "p" + str(champ.id), Vector2(StageView.W / 2.0, 206), champ.get("look"))
	if champ.get("me", false):
		me = w
	w.scale *= 1.15
	for i in others.size():
		var e: Dictionary = others[i]
		var x: float = StageView.W / 2.0 + (i - (others.size() - 1) / 2.0) * 66.0
		var p := hero_at("me" if e.get("me", false) else "p" + str(e.id), Vector2(x, BACK_Y), e.get("look") if not e.get("me", false) else null, x < StageView.W / 2.0)
		p.scale *= 0.85
		people[str(e.id)] = p
		var tw := p.create_tween().set_loops()   # cheering: little jumps, out of step
		tw.tween_interval(randf_range(0.0, 0.4))
		tw.tween_property(p, "position:y", BACK_Y - 8.0, 0.16).set_ease(Tween.EASE_OUT)
		tw.tween_property(p, "position:y", BACK_Y, 0.16).set_ease(Tween.EASE_IN)
	later(0.5, func():
		crown(w)
		banner(("You win the tournament!" if champ.get("me", false) else "%s wins the tournament" % str(champ.get("name", ""))), "The last one with hearts."))
	later(2.8, func():
		if is_instance_valid(big):
			big.queue_free()
		stage.show_panel())
