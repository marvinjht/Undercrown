# The base of every room where you pick an item (armory, rewards, spoils...). Items are shown in the room, each with a
# label under it (name in its rarity color, class icon). Hover or focus shows the full card beside it; click or keys 1-9
# select (the hero walks over and the card stays pinned with its buttons); a second click or Enter takes it. Taking
# sends the choice at once: the item flies to the hero (or to your bag), and the hero walks out to the right while the
# next room comes in. The screen's other buttons (take gold, take nothing...) sit in an action bar at the bottom.
#
# A room script extends this and decides where things go: spots(n) and dress(entry) (props under the items).
extends Control

const FULL_FLOOR := false
static func use_full_floor(_prev: String) -> bool:
	return false
static func same_room(_prev: String) -> bool:
	return false
const ITEM_PX := 48.0             # item sprites: 16 px icons drawn 3x (world units)
const ROW_MAX := 5                # items per row; more go on a second row
const EXIT_MIN := 0.45            # taking: the item flies and the hero starts walking before the next room slides in
var stage: StageView
var entries: Array = []           # [{ c (the card), item, holder, btn, label, pos, base_y, glint }]
var selected := -1
var hovered := -1
var gone := false
var card: Control
var hero: StageHero
var bar: PanelContainer
var _t := 0.0
var _n := 0                       # how many items (labels are as wide as the gap between two of them)

static func key_for(sc: Dictionary) -> String:
	var ids := []
	for c in cards_of(sc):
		ids.append(str(c.get("item", {}).get("id", c.get("title", ""))) if c.get("item") is Dictionary else str(c.get("title", "")))
	return ",".join(ids)

static func cards_of(sc: Dictionary) -> Array:
	for sec in sc.get("sections", []):
		if sec.get("kind") == "cards":
			return sec.get("cards", [])
	return []

static func bar_buttons(sc: Dictionary) -> Array:
	var out := []
	for sec in sc.get("sections", []):
		if sec.get("kind") == "buttons":
			out.append_array(sec.get("buttons", []))
	return out

# ---------- For room scripts ----------
# Where the items go (world coordinates of each item's center), up to two rows
func spots(n: int) -> Array:
	var out := []
	var rows := 1 if n <= ROW_MAX else 2
	var per := int(ceil(float(n) / rows))
	for i in n:
		var r := i / per
		var k := i % per
		var m: int = min(per, n - r * per)
		out.append(Vector2(StageView.W * float(k + 1) / float(m + 1), row_y(r, rows)))
	return out

func row_y(r: int, _rows: int) -> float:
	return StageView.FLOOR_Y - 40.0 + r * 112.0   # the front row stands well in front (tall props don't hide the back row's names)

func dress(_e: Dictionary) -> void:   # props under an item
	pass

func place_hero() -> void:
	hero = stage.spawn_hero("me", Vector2(28.0, StageView.HERO_Y))
	hero.walk_to(Vector2(StageView.W * 0.08, StageView.HERO_Y + 40.0), 360.0, 0.4)

# ---------- Building ----------
func build(sc: Dictionary) -> void:
	var cards := cards_of(sc)
	_n = cards.size()
	var at := spots(cards.size())
	var world := stage.world_node()
	for i in cards.size():
		var c: Dictionary = cards[i]
		var it = c.get("item")
		var e := { "c": c, "item": it if it is Dictionary else null, "pos": at[i], "i": i }
		dress(e)
		var holder := Control.new()   # bobs; holds the glow and the item
		holder.position = at[i] - Vector2(ITEM_PX, ITEM_PX) / 2.0
		holder.size = Vector2(ITEM_PX, ITEM_PX)
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		world.add_child(holder)
		if e.item and str(e.item.get("rarity", "")) == "artifact":   # artifacts glow red
			var g := TextureRect.new()
			g.texture = Art.tex("res://art/ui/glow.png")
			g.modulate = Color(1, 0.25, 0.15, 0.9)
			g.size = Vector2(ITEM_PX * 1.9, ITEM_PX * 1.9)
			g.position = -Vector2(ITEM_PX * 0.45, ITEM_PX * 0.45)
			g.mouse_filter = Control.MOUSE_FILTER_IGNORE
			holder.add_child(g)
			var tw := g.create_tween().set_loops()
			tw.tween_property(g, "modulate:a", 0.35, 0.8).set_trans(Tween.TRANS_SINE)
			tw.tween_property(g, "modulate:a", 0.95, 0.8).set_trans(Tween.TRANS_SINE)
		var b := TextureButton.new()
		b.texture_normal = Art.icon(str(e.item.get("icon", "")) if e.item else str(c.get("icon", "gem")))
		b.ignore_texture_size = true
		b.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
		b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		b.size = Vector2(ITEM_PX, ITEM_PX)
		b.focus_mode = Control.FOCUS_ALL
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.pressed.connect(func(): _click(i))
		b.mouse_entered.connect(func(): _hover(i, true))
		b.mouse_exited.connect(func(): _hover(i, false))
		b.focus_entered.connect(func(): _hover(i, true))
		b.focus_exited.connect(func(): _hover(i, false))
		holder.add_child(b)
		e["holder"] = holder
		e["btn"] = b
		e["base_y"] = holder.position.y
		e["glint"] = { "rare": 0.5, "legendary": 1.0, "artifact": 1.0, "green": 0.25 }.get(str(e.item.get("rarity", "")) if e.item else "", 0.15)
		var lab := _label(e)
		lab.modulate.a = 0.0
		lab.create_tween().tween_property(lab, "modulate:a", 1.0, 0.15).set_delay(StageView.SLIDE)
		stage.ui.add_child(lab)
		e["label"] = lab
		entries.append(e)
	_action_bar(sc)
	place_hero()
	relayout.call_deferred()

func refresh(sc: Dictionary) -> void:
	# Labels and buttons can change (bag full, an item taken by someone else...): keep the room, refresh the bar and card
	var cards := cards_of(sc)
	for i in min(cards.size(), entries.size()):
		entries[i].c = cards[i]
		if cards[i].get("item") is Dictionary:
			entries[i].item = cards[i].item
	if not gone:
		_action_bar(sc)
	_show_card()

func relayout() -> void:
	for e in entries:
		var lab: Control = e.label
		if not is_instance_valid(lab):
			continue
		lab.reset_size()
		var at := stage.to_stage(e.pos + Vector2(0, ITEM_PX / 2.0 + 4.0))
		lab.position = Vector2(at.x - lab.size.x / 2.0, at.y)
	if is_instance_valid(bar):
		bar.reset_size()
		bar.position = Vector2((stage.size.x - bar.size.x) / 2.0, stage.size.y - bar.size.y - 10.0)
	_show_card()

func _exit_tree() -> void:
	for e in entries:
		if is_instance_valid(e.get("label")):
			e.label.queue_free()
	if is_instance_valid(bar):
		bar.queue_free()
	if is_instance_valid(card):
		card.queue_free()

# Under each item: its name in its rarity color, its class icon; a bag item or a spoils choice just its name
func _label(e: Dictionary) -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 3)
	row.add_child(Kit.label(str(e.i + 1), "Muted"))
	var nm_text := str(e.item.get("name", "")) if e.item else str(e.c.get("title", ""))
	var col: Color = Art.color(e.item.get("color"), Art.TEXT) if e.item else Art.GOLD
	var nm := Kit.label(nm_text, "", false, col)
	var natural := nm.get_minimum_size().x   # measure before clipping (a clipped label measures 0)
	nm.clip_text = true
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nm.custom_minimum_size.x = min(natural, _label_w())
	row.add_child(nm)
	if e.item and e.item.get("set") is Dictionary and Art.class_icon(e.item.set.get("id", "")):
		row.add_child(Kit.icon(Art.class_icon(e.item.set.id), 12))
	v.add_child(row)
	if not e.item and e.c.get("lines"):   # spoils: what it gives, in a few words
		var first = e.c.lines[0]
		var t := Kit.label(str(first.get("text", first)) if first is Dictionary else str(first), "Muted")
		var tw := t.get_minimum_size().x
		t.clip_text = true
		t.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		t.custom_minimum_size.x = min(tw, _label_w())
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(t)
	return v

# A label may be as wide as the gap between two items (so neighbours never overlap)
func _label_w() -> float:
	var per: int = min(ROW_MAX, max(1, _n if _n <= ROW_MAX else int(ceil(_n / 2.0))))
	return max(80.0, StageView.W / float(per + 1) * stage.k_scale() - 10.0)

# The other buttons of the screen, in a bar at the bottom of the stage
func _action_bar(sc: Dictionary) -> void:
	if is_instance_valid(bar):
		bar.queue_free()
	var bs := bar_buttons(sc)
	if bs.is_empty():
		bar = null
		return
	bar = Kit.panel("")
	var row := Kit.hbox(8)
	for b in bs:
		var btn := Kit.button(b)
		btn.pressed.connect(_leave)
		row.add_child(btn)
	bar.add_child(row)
	stage.ui.add_child(bar)

# ---------- Idle: items bob a little and glint (rarer items glint more) ----------
func _process(delta: float) -> void:
	_t += delta
	for e in entries:
		if not is_instance_valid(e.get("holder")) or e.get("taken", false):
			continue
		e.holder.position.y = e.base_y + sin(_t * 2.2 + e.i * 1.3) * 2.0
		var g: float = e.glint * pow(max(0.0, sin(_t * (1.0 + e.glint * 1.5) + e.i * 2.1)), 12.0)
		e.btn.modulate = Color(1.0 + g * 0.8, 1.0 + g * 0.8, 1.0 + g * 0.6)

# ---------- Choosing ----------
func _hover(i: int, on: bool) -> void:
	hovered = i if on else (-1 if hovered == i else hovered)
	_show_card()

func _click(i: int) -> void:
	if gone:
		return
	if selected == i:
		confirm()
		return
	select(i)

func select(i: int) -> void:
	if gone or i < 0 or i >= entries.size():
		return
	selected = i
	entries[i].btn.grab_focus()
	hero.walk_to(Vector2(entries[i].pos.x - 84.0, StageView.HERO_Y + 40.0))   # beside it, clear of its name
	_show_card()

func _first_button(e: Dictionary) -> Dictionary:
	for b in e.c.get("buttons", []):
		if b.get("enabled", true):
			return b
	return {}

func confirm() -> void:
	if gone or selected < 0:
		return
	var e: Dictionary = entries[selected]
	var b := _first_button(e)
	if b.is_empty():
		return
	gone = true
	Kit.press(b)   # at once: the next room starts now
	_take_anim(e, str(b.get("label", "")))
	_leave()

# The item flies to the hero, or to the bag panel when it goes in the bag
func _take_anim(e: Dictionary, label: String) -> void:
	e["taken"] = true
	if is_instance_valid(e.label):
		e.label.queue_free()
	var to_bag: bool = label.find("to bag") >= 0 or (e.item != null and str(e.item.get("kind", "")) == "consumable")
	var h: Control = e.holder
	if to_bag and stage.mv.side.get_child_count():
		var target: Control = stage.mv.side.get_child(0)   # the Bag panel
		var fly := TextureRect.new()
		fly.texture = e.btn.texture_normal
		fly.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		fly.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		fly.size = h.get_global_rect().size
		fly.top_level = true
		fly.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stage.mv.add_child(fly)
		fly.global_position = h.get_global_rect().position
		h.visible = false
		var tw := fly.create_tween().set_parallel(true)
		tw.tween_property(fly, "global_position", target.get_global_rect().get_center() - fly.size / 4.0, 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_property(fly, "size", fly.size / 2.0, 0.35)
		tw.chain().tween_callback(fly.queue_free)
	else:
		var tw := h.create_tween().set_parallel(true)
		tw.tween_property(h, "position", hero.position - Vector2(ITEM_PX, ITEM_PX) / 4.0, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_property(h, "scale", Vector2(0.4, 0.4), 0.22)
		tw.tween_property(h, "modulate:a", 0.0, 0.22)

# Done here: the hero walks out to the right; the next room slides in as soon as it's ready
func _leave() -> void:
	gone = true
	_show_card()
	if is_instance_valid(bar):
		bar.queue_free()
	stage.begin_exit(EXIT_MIN)
	if hero:
		hero.walk_to(Vector2(StageView.W + 40.0, hero.position.y), 520.0, 0.9)

func _unhandled_input(ev: InputEvent) -> void:
	if gone or not is_visible_in_tree() or not (ev is InputEventKey) or not ev.pressed or ev.echo:
		return
	if ev.keycode >= KEY_1 and ev.keycode <= KEY_9 and ev.keycode - KEY_1 < entries.size():
		select(ev.keycode - KEY_1)
		get_viewport().set_input_as_handled()
	elif ev.keycode == KEY_ENTER or ev.keycode == KEY_KP_ENTER:
		if selected >= 0:
			confirm()
			get_viewport().set_input_as_handled()

# ---------- The card beside an item: the full card (stats, affixes, set, sell value, the compare); pinned with buttons ----------
func _show_card() -> void:
	if is_instance_valid(card):
		card.queue_free()
	card = null
	var i := selected if selected >= 0 else hovered
	if gone or i < 0 or i >= entries.size():
		return
	var e: Dictionary = entries[i]
	if e.item:
		card = Kit.item_tip(e.item)
	else:
		card = Kit.card({ "kind": "text", "title": e.c.get("title", ""), "icon": e.c.get("icon"), "lines": e.c.get("lines", []), "buttons": [] }, 250)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	if i == selected:
		var v: VBoxContainer = card.get_child(0)
		for b in e.c.get("buttons", []):
			var btn := Kit.button(b)
			btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			btn.pressed.connect(func():
				if not gone:
					gone = true
					_take_anim(e, str(b.get("label", "")))
					_leave())
			v.add_child(btn)
		v.add_child(Kit.label("Or click it again, or press Enter.", "Muted", true))
	else:
		card.get_child(0).add_child(Kit.label("Click or press %d to choose." % (i + 1), "Muted", true))
	Kit.fit_width(card, 270.0)
	stage.ui.add_child(card)
	card.reset_size()
	var at := stage.to_stage(e.pos + Vector2(ITEM_PX / 2.0 + 10.0, -ITEM_PX))
	if at.x + card.size.x > stage.size.x - 6.0:
		at = stage.to_stage(e.pos - Vector2(ITEM_PX / 2.0 + 10.0, ITEM_PX)) - Vector2(card.size.x, 0)
	at.x = clampf(at.x, 6.0, max(6.0, stage.size.x - card.size.x - 6.0))
	at.y = clampf(at.y, 6.0, max(6.0, stage.size.y - card.size.y - 6.0))
	card.position = at
