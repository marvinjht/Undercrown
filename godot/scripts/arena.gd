# Plays back a fight the server already ran (s.battle.res): positions from its tracks, everything else from its
# events. It never decides anything. Same timing as the browser game: double speed after 10 seconds.
# Fighters are drawn from art/heroes, art/monsters and art/weapons. Damage numbers: physical in red,
# magic in blue, crits in gold, physical spells in orange, heals in green.
extends Control

signal finished
signal log_line(text: String)

const W := 640.0
const H := 360.0
const X0 := 150.0
const STEP := 60.0
const START_GAP := 6.0     # data/config.js combat.startGap
const FAST_AFTER := 10.0   # data/config.js combat.fastAfter
const LANES := [200.0, 132.0, 268.0, 166.0, 234.0, 110.0, 290.0]
const SPRITE_SCALE := 2.0  # placeholder sprites are 32 px; fights are drawn at 64

var res: Dictionary = {}
var visual: Dictionary = {}
var names: Dictionary = {}
var mirror := false
var t := 0.0
var idx := 0
var speed := 1.0
var done := false
var playing := false
var F: Dictionary = {}
var lane_i := 0
var ally_i := 0
var world: Node2D
var bars: Node2D
var events: Array = []
var ring: Dictionary = {}

class Bars extends Node2D:
	var arena
	func _process(_d: float) -> void:
		queue_redraw()
	func _draw() -> void:
		if arena == null:
			return
		for id in arena.F:
			var f: Dictionary = arena.F[id]
			if f.gone:
				continue
			var n: Node2D = f.node
			var w := 64.0
			var x: float = n.position.x - w / 2.0
			var y: float = f.y - 40.0 * f.sc
			if f.dead:
				continue
			draw_rect(Rect2(x - 1, y - 1, w + 2, 8), Color("#0d0b09", 0.85))
			var mine: bool = (f.side == "a") != arena.mirror
			draw_rect(Rect2(x, y, w * clamp(float(f.hp) / max(1.0, float(f.maxHp)), 0.0, 1.0), 6), Color("#6cc35f") if mine else Color("#c4473a"))
			var yy := y + 7.0
			if float(f.shield) > 0.0:
				draw_rect(Rect2(x, yy, w * min(1.0, float(f.shield) / max(1.0, float(f.maxShield))), 3), Color("#9fc4ff"))
				yy += 4.0
			if f.hasMana:
				draw_rect(Rect2(x - 1, yy - 1, w + 2, 5), Color("#0d0b09", 0.85))
				draw_rect(Rect2(x, yy, w * min(1.0, float(f.mana) / 100.0), 3), Color("#6f7dff"))
			# Heartlight beam
			if f.get("beam_to") and arena.F.has(f.beam_to):
				var o: Dictionary = arena.F[f.beam_to]
				if not o.dead and not f.dead:
					draw_line(n.position + Vector2(0, -8), o.node.position + Vector2(0, -8), Color("#d9ccff", 0.85), 2.0 + min(float(f.get("beam_power", 2)), 24.0) * 0.5)
		# Inferno's ring of fire closing in
		if not arena.ring.is_empty() and arena.t >= float(arena.ring.start):
			var p: float = min(1.0, (arena.t - float(arena.ring.start)) / max(0.01, float(arena.ring.closed) - float(arena.ring.start)))
			var L: float = X0 - 1.4 * STEP
			var R: float = X0 + (START_GAP + 1.4) * STEP
			var mid := (L + R) / 2.0
			var lo := L + p * (mid - L)
			var hi := R - p * (R - mid)
			draw_rect(Rect2(0, 70, lo, H - 140), Color("#ff6a1a", 0.22))
			draw_rect(Rect2(hi, 70, W - hi, H - 140), Color("#ff6a1a", 0.22))

func _ready() -> void:
	custom_minimum_size = Vector2(W, H)
	clip_contents = true
	resized.connect(_fit)

func _fit() -> void:
	if world:
		var k: float = min(size.x / W, size.y / H)
		world.scale = Vector2(k, k)
		world.position = Vector2((size.x - W * k) / 2.0, (size.y - H * k) / 2.0)

# Play a fight. b: s.battle ({ res, visual, names, mirror, ... })
func play(b: Dictionary) -> void:
	for c in get_children():
		c.queue_free()
	res = b.get("res", {}) if b.get("res") is Dictionary else {}
	visual = b.get("visual", {}) if b.get("visual") is Dictionary else {}
	names = b.get("names", {}) if b.get("names") is Dictionary else {}
	mirror = bool(b.get("mirror", false))
	events = res.get("events", [])
	t = 0.0; idx = 0; speed = 1.0; done = false; playing = true
	F = {}; lane_i = 0; ally_i = 0; ring = {}
	world = Node2D.new()
	add_child(world)
	var floor := TextureRect.new()
	floor.texture = Art.tex("res://art/ui/floor.png")
	floor.stretch_mode = TextureRect.STRETCH_TILE
	floor.size = Vector2(W / 2.0, H / 2.0)
	floor.scale = Vector2(2, 2)
	floor.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	world.add_child(floor)
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.18)
	shade.size = Vector2(W, H)
	world.add_child(shade)
	for p in [Vector2(46, 22), Vector2(W - 62, 22), Vector2(46, H - 66), Vector2(W - 62, H - 66)]:
		var tch := Sprite2D.new()
		tch.texture = Art.tex("res://art/ui/torch.png")
		tch.centered = false
		tch.position = p
		tch.scale = Vector2(2, 2)
		world.add_child(tch)
		var tw: Tween = tch.create_tween().set_loops()
		tw.tween_property(tch, "modulate", Color(1.2, 1.05, 0.9), 0.4 + randf() * 0.3)
		tw.tween_property(tch, "modulate", Color(0.85, 0.8, 0.75), 0.4 + randf() * 0.3)
	bars = Bars.new()
	bars.arena = self
	for m in res.get("fighters", []):
		if float(m.get("bornAt", 0)) == 0.0:
			_make(m)
	world.add_child(bars)
	_fit()

func stop() -> void:
	playing = false

func _vis(m: Dictionary) -> Dictionary:
	if m.get("hologram", false):
		var v: Dictionary = (visual.get(str(m.get("ownerId")), {}) as Dictionary).duplicate()
		v["tint"] = 0x7fd8e8
		v["weapon"] = m.get("weapon")
		v["ghost"] = false
		return v
	return visual.get(str(m.id), {}) if visual.get(str(m.id)) is Dictionary else {}

func _make(m: Dictionary) -> Dictionary:
	var v := _vis(m)
	var side := str(m.side)
	var sprite := str(m.get("sprite", "hero")) if m.get("sprite") != null else "hero"
	var is_hero: bool = m.get("hologram", false) or (not m.get("ally", false) and (sprite == "hero" or side == "a"))
	var node := Node2D.new()
	var body := Sprite2D.new()
	body.texture = Art.hero(v.get("look")) if is_hero else Art.monster(sprite)
	body.flip_h = not is_hero     # monster art faces left; everything here starts facing right
	body.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	node.add_child(body)
	var tint_v = v.get("tint") if v.get("tint") != null else m.get("tint")
	var tint := Color.WHITE
	if tint_v != null and (not is_hero or not v.get("look") or m.get("hologram", false)):
		tint = Art.color(tint_v, Color.WHITE)
	body.modulate = tint
	if v.get("ghost", false):
		node.modulate = Color(1, 1, 1, 0.5)
	var weapon: Sprite2D = null
	var wkey = v.get("weapon") if v.get("weapon") else m.get("weapon")
	if is_hero and wkey:
		var wt := Art.weapon(str(wkey))
		if wt:
			weapon = Sprite2D.new()
			weapon.texture = wt
			weapon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			weapon.offset = Vector2(12, 0)
			weapon.position = Vector2(4, 4)
			node.add_child(weapon)
	var lane: float
	if side == "a":
		lane = (262.0 if ally_i % 2 else 138.0) if m.get("ally", false) else 200.0
		if m.get("ally", false):
			ally_i += 1
	else:
		lane = LANES[lane_i % LANES.size()]
		lane_i += 1
	var big := 0
	for x in res.get("fighters", []):
		if str(x.side) == "b" and float(x.get("bornAt", 0)) == 0.0:
			big += 1
	var sc: float = float(m.get("scale", 1.0)) * (0.8 if side == "b" and big > 2 else 1.0) * SPRITE_SCALE
	var face_right: bool = (side == "a") != mirror
	node.scale = Vector2(sc if face_right else -sc, sc)
	world.add_child(node)
	var nm := Label.new()
	nm.text = str(names.get(str(m.id), m.get("name", "")))
	nm.add_theme_constant_override("outline_size", 4)
	nm.add_theme_color_override("font_outline_color", Color("#15120f"))
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nm.size = Vector2(140, 14)
	world.add_child(nm)
	var f := { "id": str(m.id), "side": side, "m": m, "node": node, "body": body, "weapon": weapon, "name": nm, "sc": sc / SPRITE_SCALE, "y": lane,
		"dir": 1.0 if face_right else -1.0, "lunge": 0.0, "dy": 0.0, "hp": float(m.get("hp", 0)), "maxHp": float(m.get("maxHp", 1)),
		"shield": float(m.get("shield", 0)), "maxShield": max(1.0, float(m.get("shield", 0))), "mana": float(m.get("mana", 0)),
		"hasMana": bool(m.get("hasMana", false)), "dead": false, "gone": false, "tint": tint, "flash": 0.0 }
	F[str(m.id)] = f
	if m.get("hologram", false):
		var tw: Tween = node.create_tween().set_loops()
		tw.tween_property(node, "modulate:a", 0.62, 0.26)
		tw.tween_property(node, "modulate:a", 0.32, 0.26)
	_place(f)
	return f

func _pos_at(track: Array, tt: float) -> float:
	if track.is_empty():
		return 0.0
	if tt <= float(track[0][0]):
		return float(track[0][1])
	var lo := 0
	var hi := track.size() - 1
	if tt >= float(track[hi][0]):
		return float(track[hi][1])
	while hi - lo > 1:
		var mid := (lo + hi) >> 1
		if float(track[mid][0]) <= tt:
			lo = mid
		else:
			hi = mid
	var t0 := float(track[lo][0]); var p0 := float(track[lo][1]); var t1 := float(track[hi][0]); var p1 := float(track[hi][1])
	return p0 + (p1 - p0) * ((tt - t0) / max(0.000001, t1 - t0))

func _place(f: Dictionary) -> void:
	var p := _pos_at(res.get("tracks", {}).get(f.id, []), t)
	if mirror:
		p = START_GAP - p
	var n: Node2D = f.node
	if not f.gone:
		n.position.x = X0 + p * STEP + f.lunge * f.dir
	n.position.y = f.y + f.dy
	if not f.dead and not f.gone:
		var best = null
		var bd := INF
		for id in F:
			var o: Dictionary = F[id]
			if o.side == f.side or o.dead or o.gone:
				continue
			var d: float = abs(o.node.position.x - n.position.x)
			if d < bd:
				bd = d
				best = o
		if best and abs(best.node.position.x - n.position.x) > 4.0:
			var dir := 1.0 if best.node.position.x > n.position.x else -1.0
			if dir != f.dir:
				f.dir = dir
				n.scale.x = dir * abs(n.scale.y)
	f.name.position = Vector2(n.position.x - 70, f.y - 40.0 * f.sc - 16)
	f.name.visible = not f.gone
	if f.flash > 0.0:
		f.body.modulate = Color(3, 3, 3)
	elif f.dead:
		f.body.modulate = Color(0.35, 0.35, 0.35)
	else:
		f.body.modulate = f.tint

func _process(delta: float) -> void:
	if not playing or done:
		return
	if t >= FAST_AFTER:
		speed = 2.0
	var d: float = min(0.25, delta)
	t += d * speed
	while idx < events.size() and float(events[idx].t) <= t:
		_apply(events[idx])
		idx += 1
	for id in F:
		var f: Dictionary = F[id]
		if f.flash > 0.0:
			f.flash -= d
		_place(f)
	var end_t := float(events[events.size() - 1].t) if events.size() else 0.0
	if idx >= events.size() and t > end_t + 1.1:
		done = true
		finished.emit()

# ---------- Effects ----------
func _float(f: Dictionary, text: String, color: Color, size := 16, dx := 0.0) -> void:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_constant_override("outline_size", 5)
	l.add_theme_color_override("font_outline_color", Color("#15120f"))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size = Vector2(160, 24)
	l.position = Vector2(f.node.position.x - 80 + dx + randf_range(-10, 10), f.y - 34.0 * f.sc - 12)
	world.add_child(l)
	var tw: Tween = l.create_tween().set_parallel()
	tw.tween_property(l, "position:y", l.position.y - 40, 0.9 / speed).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(l, "modulate:a", 0.0, 0.9 / speed)
	tw.chain().tween_callback(l.queue_free)

func _swing(f: Dictionary) -> void:
	var tw: Tween = create_tween()
	tw.tween_method(func(v): f.lunge = v, 0.0, 18.0, 0.12 / speed)
	tw.tween_method(func(v): f.lunge = v, 18.0, 0.0, 0.12 / speed)
	if f.weapon:
		var w: Sprite2D = f.weapon
		var tw2: Tween = w.create_tween()
		w.rotation = -0.9
		tw2.tween_property(w, "rotation", 0.5, 0.12 / speed)
		tw2.tween_property(w, "rotation", 0.0, 0.12 / speed)

func _shoot(att: Dictionary, def: Dictionary, magic: bool) -> void:
	var p := ColorRect.new()
	p.color = Color("#b39cff") if magic else Color("#e6dccb")
	p.size = Vector2(10, 10) if magic else Vector2(16, 3)
	p.pivot_offset = p.size / 2.0
	var a: Vector2 = att.node.position + Vector2(20 * att.dir, -4)
	var b: Vector2 = def.node.position + Vector2(0, -4)
	p.position = a - p.size / 2.0
	p.rotation = (b - a).angle()
	world.add_child(p)
	var tw: Tween = p.create_tween()
	tw.tween_property(p, "position", b - p.size / 2.0, 0.16 / speed)
	tw.tween_callback(p.queue_free)

func _ring(f: Dictionary, color: Color, to_scale := 1.0, dur := 0.4) -> void:
	var r := Line2D.new()
	r.width = 3
	r.default_color = color
	for i in 25:
		var a := TAU * i / 24.0
		r.add_point(Vector2(cos(a) * 30, sin(a) * 30))
	r.position = f.node.position
	r.scale = Vector2(0.3, 0.3)
	world.add_child(r)
	var tw: Tween = r.create_tween().set_parallel()
	tw.tween_property(r, "scale", Vector2(to_scale, to_scale), dur / speed)
	tw.tween_property(r, "modulate:a", 0.0, dur / speed)
	tw.chain().tween_callback(r.queue_free)

func _shake(strength := 4.0, dur := 0.15) -> void:
	var tw: Tween = world.create_tween()
	var base := world.position
	for i in 4:
		tw.tween_property(world, "position", base + Vector2(randf_range(-strength, strength), randf_range(-strength, strength)), dur / 4.0 / speed)
	tw.tween_property(world, "position", base, 0.03)

func _nm(f) -> String:
	if f == null:
		return "?"
	return str(names.get(f.id, f.m.get("name", "?")))

# ---------- Events ----------
func _apply(e: Dictionary) -> void:
	var type := str(e.get("type", ""))
	if type == "spawn":
		for m in res.get("fighters", []):
			if str(m.id) == str(e.get("src")) and not F.has(str(m.id)):
				var nf := _make(m)
				nf.node.scale = Vector2(0.1, 0.1)
				var tw: Tween = nf.node.create_tween()
				tw.tween_property(nf.node, "scale", Vector2(nf.dir * nf.sc * SPRITE_SCALE, nf.sc * SPRITE_SCALE), 0.22 / speed)
				world.move_child(bars, -1)
	if e.get("h") is Dictionary:
		for id in e.h:
			if F.has(id):
				var hv: Array = e.h[id]
				F[id].hp = float(hv[0]); F[id].shield = float(hv[1]); F[id].mana = float(hv[2])
				if hv.size() > 3 and hv[3]:
					F[id].maxHp = float(hv[3])
	var att = F.get(str(e.get("src", "")))
	var def = F.get(str(e.get("tgt", "")))
	_sfx(type, e, att, def)
	var amount := int(e.get("amount", 0))
	match type:
		"hit":
			if att == null or def == null:
				return
			if not e.get("cleave", false):
				if e.get("ranged", false):
					_shoot(att, def, str(e.get("kind", "")) == "magic")
				else:
					_swing(att)
			def.flash = 0.07
			var magic: bool = str(att.m.get("type", "")) == "magic" or str(e.get("kind", "")) == "magic"
			if amount > 0:
				_float(def, str(amount) + ("!" if e.get("crit", false) else ""), Color("#ffd34d") if e.get("crit", false) else (Art.MAGIC if magic else Color("#ff7a66")), 22 if e.get("crit", false) else 16)
			if e.get("absorbed"):
				_float(def, "SHIELD %d" % int(e.absorbed), Art.SHIELD, 11, 26 * def.dir)
			if e.get("counter", false):
				_float(att, "COUNTER", Color("#9fe3ff"), 11)
			log_line.emit("%s %s %s for %d%s" % [_nm(att), "crits" if e.get("crit", false) else "hits", _nm(def), amount, " (blocked %d)" % int(e.absorbed) if e.get("absorbed") else ""])
		"cast":
			if att == null:
				return
			_float(att, ("ECHO" if e.get("echo", false) else str(e.get("name", "")).to_upper()), Color("#c9b8ff"), 13)
			_ring(att, Color("#a18cff"), 1.2)
			log_line.emit("%s casts %s" % [_nm(att), e.get("name", "")])
		"spellhit":
			if def == null:
				return
			_ring(def, Color("#ff8a4c"), 0.9, 0.38)
			def.flash = 0.07
			_float(def, str(amount), Color("#ffb36b") if e.get("phys", false) else Art.MAGIC, 18)
			log_line.emit("%s hits %s for %d" % [e.get("name", "Spell"), _nm(def), amount])
		"dodge":
			if att and def:
				if str(att.m.get("range", "")) in ["melee", "reach"]:
					_swing(att)
				_float(def, "DODGE", Color("#cfe8ff"), 13)
				var tw: Tween = create_tween()
				tw.tween_method(func(v): def.dy = v, 0.0, -16.0, 0.11 / speed)
				tw.tween_method(func(v): def.dy = v, -16.0, 0.0, 0.11 / speed)
				log_line.emit("%s dodges" % _nm(def))
		"hidden":
			if att and def:
				_swing(att); _float(def, "MISS", Color("#b9a7d9"), 12)
		"parry":
			if def: _float(def, "PARRY", Color("#9fe3ff"), 14)
		"heal":
			if att:
				_float(att, "+%d" % amount, Color("#7be07b"), 13, -20 * att.dir)
				log_line.emit("%s heals %d" % [_nm(att), amount])
		"bleed":
			if def: _float(def, str(amount), Color("#d0473a"), 11, 18)
		"burn":
			if def: _float(def, str(amount), Color("#8fdc5a") if e.get("poison", false) else Color("#ff9a3c"), 12, -18)
		"stun":
			if def:
				var secs := int(e.get("secs", 1))
				_float(def, "STUNNED %ds" % secs if secs > 1 else "STUNNED", Color("#ffd34d"), 13)
				log_line.emit("%s is stunned" % _nm(def))
		"death":
			if def:
				def.dead = true
				var tw: Tween = def.node.create_tween().set_parallel()
				tw.tween_property(def.node, "modulate:a", 0.35, 0.45 / speed)
				tw.tween_property(def.node, "rotation", deg_to_rad(80) * def.dir, 0.45 / speed)
				log_line.emit("%s falls" % _nm(def))
		"escape":
			if att:
				att.gone = true
				_float(att, "ESCAPED +%dg" % amount, Art.GOLD, 12)
				var tw: Tween = att.node.create_tween().set_parallel()
				tw.tween_property(att.node, "position:x", W + 60, 0.6 / speed)
				tw.tween_property(att.node, "modulate:a", 0.0, 0.6 / speed)
		"revive":
			if att:
				att.dead = false
				att.node.modulate.a = 1.0
				att.node.rotation = 0
				_float(att, "HATCHED" if e.get("hatch", false) else "REBORN", Color("#ff8a4c"), 18)
		"egg":
			if att: _float(att, "EGG %ds" % int(e.get("secs", 5)), Color("#ffc070"), 16)
		"burst":
			if att: _ring(att, Color("#ff7a2c"), 3.2, 0.65); _shake(6)
		"stealth_on":
			if att: att.node.create_tween().tween_property(att.node, "modulate:a", 0.22, 0.16 / speed)
		"stealth_off":
			if att: att.node.create_tween().tween_property(att.node, "modulate:a", 1.0, 0.16 / speed)
		"fxhit":
			if def:
				def.flash = 0.07
				_float(def, str(amount), Color("#ffb36b"), 14, 14)
		"beam":
			if att and def:
				att["beam_to"] = def.id
				att["beam_power"] = e.get("power", 2)
		"firering":
			ring = { "start": e.get("start", 0), "closed": e.get("closed", 1) }
		"stomp":
			if att: _ring(att, Color("#c9a26b"), 3.0, 0.5); _shake(5); _float(att, "STOMP", Color("#e7c38a"), 13)
		"pulse":
			if att: _ring(att, Color("#9fc4ff"), 2.2, 0.45)
		"palburst":
			if att: _ring(att, Color("#f0d27a"), 2.4, 0.5); _float(att, "HOLY BURST", Color("#f0d27a"), 14)
		"execute":
			if def: _float(def, "EXECUTED", Color("#ff3b2f"), 20); _shake(7)
		"jester":
			if def:
				def.flash = 0.07
				_float(def, str(amount), Color("#ff7a66"), 18, 10)
			var at = att if att else def
			if at:
				_float(at, "HA HA HA!", Art.GOLD, 16); _ring(at, Color("#ff6a3d"), 2.6, 0.48)
			_shake(6)
		"timeout":
			if F.has("a"): _float(F.a, "TIME", Art.TEXT, 14)
		"raise":
			if att: _float(att, "RAISE DEAD", Color("#9ff4ff"), 16); _shake(3)
		"freeze":
			if def: _float(def, "FROZEN", Color("#bfe8ff"), 16)
		_:
			var simple := { "smoke": ["SMOKE BOMB", "#c9c6d2", true], "double": ["DOUBLE SHOT", "#8fcf78", true], "slowed": ["SLOWED", "#a9c6e0", false],
				"stunblock": ["STEADFAST", "#ffd84a", true], "critguard": ["GUARDED", "#ffd84a", true], "sear": ["SEARED", "#ff9a3c", false],
				"exilemark": ["MARKED", "#c08cff", false], "root": ["ROOTED", "#c08cff", false], "steal": ["STOLEN", "#f2c14a", true],
				"poison": ["POISON", "#8fdc5a", false], "chill": ["CHILL", "#a8dcff", false], "mire": ["MIRED", "#a89a5a", false],
				"mark": ["MARKED", "#c06cff", false], "bash": ["SHIELD BASH", "#f0d27a", false], "kite": ["KITE", "#8fcf78", true],
				"thorns": ["THORNS", "#c9a26b", false], "undying": ["UNDYING", "#ff5b4a", true], "frenzy": ["FRENZY", "#8fcf78", true],
				"shove": ["SHOVED", "#d9c7a6", false], "pull": ["PULLED", "#e0645a", false], "knock": ["KNOCKBACK", "#cfe8ff", false],
				"blink": ["BLINK", "#c8a2ff", true], "pop": ["BUTCHERED", "#ff4a3a", false], "block": ["BLOCKED", "#f0d27a", true],
				"penance": ["PENANCE", "#f0d27a", true], "sunder": ["SUNDERED", "#a996ff", false], "hex": ["HEX", "#c08cff", false],
				"shrug": ["UNBOUND", "#f0d27a", true], "sentinel": ["SHIELD BURST", "#9fc4ff", true], "shieldup": ["SHIELD", "#9fc4ff", true] }
			if simple.has(type):
				var spec: Array = simple[type]
				var who = att if spec[2] else def
				if who:
					_float(who, spec[0], Color(spec[1]), 12)

func _sfx(type: String, e: Dictionary, att, def) -> void:
	match type:
		"hit":
			if att == null:
				return
			var vis := _vis(att.m)
			var w = vis.get("weapon") if vis.get("weapon") else att.m.get("weapon")
			var key := str(w).replace("weapon_", "") if w else ""
			Sfx.play("chop" if e.get("cleave", false) else (Sfx.WEAPON.get(key, "slash") if key != "" else "claw"))
			if e.get("crit", false): Sfx.play("crit", 0.1)
			if e.get("cheap", false): Sfx.play("cheap")
			if e.get("absorbed") and int(e.get("amount", 0)) == 0: Sfx.play("shield", 0.12)
			if def and def.id == "a" and not e.get("crit", false): Sfx.play("hurt", 0.12)
		"cast": Sfx.play("arcane" if e.get("echo", false) else Sfx.SPELL.get(str(e.get("name", "")), "arcane"), 0.2)
		"heal": Sfx.play("heal", 0.25)
		"dodge": Sfx.play("dodge")
		"parry": Sfx.play("parry")
		"stun", "freeze": Sfx.play("stun")
		"stealth_on", "smoke": Sfx.play("stealth")
		"stomp": Sfx.play("thud")
		"pulse", "egg", "sentinel": Sfx.play("shield", 0.3)
		"blink": Sfx.play("cheap")
		"execute": Sfx.play("explode"); Sfx.play("death", 0.1)
		"pop": Sfx.play("chop")
		"block": Sfx.play("clang")
		"knock": Sfx.play("thud" if e.get("slam", false) else "dodge")
		"pull", "shove", "kite": Sfx.play("kite")
		"sunder", "hex": Sfx.play("arcane", 0.3)
		"frenzy", "double": Sfx.play("double", 0.3)
		"beam": Sfx.play("zap", 0.9)
		"burst": Sfx.play("explode")
		"revive", "undying": Sfx.play("revive")
		"raise": Sfx.play("arcane", 0.4)
		"death": Sfx.play("death", 0.12)
		"jester": Sfx.play("explode"); Sfx.play("haha")
		"bleed", "burn": Sfx.play("bleed", 0.3)
		"steal": Sfx.play("coin", 0.2)
