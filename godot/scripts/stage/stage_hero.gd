# A hero standing on the stage: the same sprite and weapon as in fights (32 px art drawn at 2x), facing right.
# It walks (with a little bob), and later steps can add more of these: a rival walking in from the right, heroes lying
# down after losing a fight and getting back up. The stage keeps them by id (StageView.actors).
class_name StageHero
extends Node2D

const SCALE := 2.0
var body: Sprite2D
var weapon: Sprite2D
var _walk: Tween
var _bob := 0.0
var walking := false

# look: { look, tint, weapon } as present.js sends it (view.me.look)
func setup(look: Dictionary, facing_right := true) -> StageHero:
	body = Sprite2D.new()
	body.texture = Art.hero(look.get("look"))
	body.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if not look.get("look"):
		body.modulate = Art.color(look.get("tint"), Color.WHITE).lerp(Color.WHITE, 0.3)
	add_child(body)
	var wt := Art.weapon(look.get("weapon"))   # no weapon (Fists): nothing in hand
	if wt:
		weapon = Sprite2D.new()
		weapon.texture = wt
		weapon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		weapon.offset = Vector2(12, 0)
		weapon.position = Vector2(4, 4)
		add_child(weapon)
	scale = Vector2(SCALE if facing_right else -SCALE, SCALE)
	return self

func face(right: bool) -> void:
	scale.x = absf(scale.x) * (1.0 if right else -1.0)

# Walk to a point at a steady pace (world px a second); returns the tween (await .finished to follow it)
func walk_to(to: Vector2, speed := 360.0, max_time := 0.8) -> Tween:
	if _walk and _walk.is_valid():
		_walk.kill()
	var d := position.distance_to(to)
	if d < 1.0:
		walking = false
		return null
	face(to.x >= position.x)
	walking = true
	_walk = create_tween()
	_walk.tween_property(self, "position", to, min(max_time, d / speed))
	_walk.finished.connect(func(): walking = false; body.position.y = 0.0)
	return _walk

func _process(delta: float) -> void:
	if walking:
		_bob += delta * 14.0
		body.position.y = -absf(sin(_bob)) * 1.5
		if weapon:
			weapon.position.y = 4.0 + body.position.y
