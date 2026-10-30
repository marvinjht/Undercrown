# The UI building blocks: every screen is made of these. Change how cards, buttons, bars and panels look here
# (layout), in theme/theme.tres (colors, frames, fonts) and in art/ (images).
# Everything takes the plain data the server describes (see src/present.js for the shapes).
class_name Kit
extends RefCounted

const CARD_W := 214

# ---------- Text ----------
static func label(text, variation := "", wrap := false, color = null) -> Label:
	var l := Label.new()
	l.text = str(text)
	if variation != "":
		l.theme_type_variation = variation
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if color != null:
		l.add_theme_color_override("font_color", color)
	return l

static func line(ln) -> Label:   # { text, tone }
	if ln is String:
		return label(ln, "", true)
	var tone := str(ln.get("tone", ""))
	var l := label(ln.get("text", ""), "Heading" if tone == "head" else "", true, Art.tone(tone))
	return l

static func vbox(sep := 4) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return v

static func hbox(sep := 6) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h

static func flow(sep := 8) -> HFlowContainer:
	var f := HFlowContainer.new()
	f.add_theme_constant_override("h_separation", sep)
	f.add_theme_constant_override("v_separation", sep)
	f.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return f

static func panel(variation := "") -> PanelContainer:
	var p := PanelContainer.new()
	if variation != "":
		p.theme_type_variation = variation
	return p

static func spacer(h := 6) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	return c

static func icon(tex: Texture2D, size := 32, tint := Color.WHITE) -> TextureRect:
	var t := TextureRect.new()
	t.texture = tex
	t.custom_minimum_size = Vector2(size, size)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	t.modulate = tint
	return t

static func clear(node: Node) -> void:
	for c in node.get_children():
		node.remove_child(c)
		c.queue_free()

# ---------- Buttons ----------
# b: { label, act, args, enabled, style, hold, mp, note, confirm }
static func button(b: Dictionary) -> Button:
	var btn: Button
	if b.get("hold", false) and not b.get("confirm"):
		btn = preload("res://scripts/ui/hold_button.gd").new()
	else:
		btn = Button.new()
	btn.text = str(b.get("label", ""))
	btn.disabled = not b.get("enabled", true)
	var st := str(b.get("style", "normal"))
	btn.theme_type_variation = "Primary" if st == "primary" else ("Ghost" if st == "ghost" else "")
	if b.get("note"):
		btn.tooltip_text = str(b.note)
	if btn.has_signal("held"):
		btn.connect("held", func(): press(b))
	else:
		btn.pressed.connect(func(): press(b))
	return btn

static func press(b: Dictionary) -> void:
	if b.get("confirm"):
		var d := ConfirmationDialog.new()
		d.dialog_text = str(b.confirm)
		d.ok_button_text = "Confirm: replace it"
		d.title = "Are you sure?"
		Engine.get_main_loop().root.add_child(d)
		d.confirmed.connect(func(): Game.act(str(b.act), b.get("args", []), b.get("mp", false)); d.queue_free())
		d.canceled.connect(func(): d.queue_free())
		d.popup_centered()
		return
	Game.act(str(b.act), b.get("args", []), b.get("mp", false))

static func buttons(list: Array) -> HFlowContainer:
	var f := flow(6)
	for b in list:
		f.add_child(button(b))
	return f

# ---------- Bars and hearts ----------
static func bar(value: float, maxv: float, color: Color, text := "", h := 12) -> ProgressBar:
	var p := ProgressBar.new()
	p.max_value = max(1.0, maxv)
	p.value = clamp(value, 0.0, p.max_value)
	p.show_percentage = false
	p.custom_minimum_size = Vector2(0, h)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	p.add_theme_stylebox_override("fill", fill)
	if text != "":
		var l := label(text)
		l.add_theme_font_size_override("font_size", 11)
		l.add_theme_constant_override("outline_size", 4)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		l.set_anchors_preset(Control.PRESET_FULL_RECT)
		p.add_child(l)
	return p

static func hearts(n: int, maxn := 3, size := 14) -> HBoxContainer:
	var h := hbox(1)
	for i in max(maxn, n):
		h.add_child(icon(Art.icon("heart" if i < n else "heart_empty"), size))
	return h

static func chip(text: String, color: Color, tip := "") -> Label:
	var l := label(text, "", false, color)
	if tip != "":
		l.tooltip_text = tip
		l.mouse_filter = Control.MOUSE_FILTER_STOP
	return l

# ---------- Items ----------
# A slot with an item icon; hover shows the item's full card
static func item_slot(item, size := 36, empty_icon := "") -> PanelContainer:
	var p := preload("res://scripts/ui/tip_slot.gd").new()
	p.theme_type_variation = "Slot"
	p.custom_minimum_size = Vector2(size + 8, size + 8)
	if item is Dictionary:
		p.item = item
		p.tooltip_text = " "
		var ic := icon(Art.icon(str(item.get("icon", ""))), size)
		p.add_child(ic)
		p.self_modulate = Art.rarity_color(item.get("rarity", "")).lerp(Color.WHITE, 0.35)
	elif empty_icon != "":
		p.add_child(icon(Art.icon(empty_icon), size, Color(1, 1, 1, 0.25)))
	return p

# The full item card (tooltips and screens). extra_lines/buttons: what a screen adds under it.
static func item_body(item: Dictionary, v: VBoxContainer) -> void:
	var head := hbox(6)
	head.add_child(icon(Art.icon(str(item.get("icon", ""))), 32))
	var nm := vbox(0)
	nm.add_child(label(item.get("name", ""), "", true, Art.color(item.get("color"), Art.TEXT)))
	nm.add_child(label(item.get("sub", ""), "Muted", true))
	var tags := hbox(6)
	if item.get("set") is Dictionary:
		tags.add_child(chip(item.set.name, Art.color(item.set.color)))
	if item.get("verdict") is Dictionary:
		var vt: Dictionary = item.verdict
		tags.add_child(chip(str(vt.text), Art.tone(vt.get("tone", ""))))
	if tags.get_child_count():
		nm.add_child(tags)
	head.add_child(nm)
	v.add_child(head)
	for ln in item.get("lines", []):
		v.add_child(line(ln))
	if item.get("trait"):
		v.add_child(label(item.trait, "Muted", true))
	for ln in item.get("notes", []):
		v.add_child(line(ln))
	if item.get("compare") is Dictionary:
		v.add_child(label("Compared to " + str(item.compare.name), "Heading", true))
		for ln in item.compare.get("lines", []):
			v.add_child(line(ln))

static func item_tip(item: Dictionary) -> Control:
	var p := panel("")
	p.custom_minimum_size = Vector2(250, 0)
	var v := vbox(3)
	item_body(item, v)
	p.add_child(v)
	return p

# A card on a screen: { kind: 'item'|'text', item?, title?, sub?, color?, icon?, lines, buttons }
static func card(c: Dictionary, width := CARD_W) -> PanelContainer:
	var p := panel("Card")
	p.custom_minimum_size = Vector2(width, 0)
	var v := vbox(4)
	if c.get("kind") == "item" and c.get("item") is Dictionary:
		item_body(c.item, v)
	else:
		var head := hbox(6)
		if c.get("icon"):
			head.add_child(icon(Art.icon(str(c.icon)), 28))
		var nm := vbox(0)
		nm.add_child(label(c.get("title", ""), "Heading", true, Art.color(c.get("color"), Art.GOLD) if c.get("color") else null))
		if c.get("sub"):
			nm.add_child(label(c.sub, "Muted", true))
		head.add_child(nm)
		v.add_child(head)
	for ln in c.get("lines", []):
		v.add_child(line(ln))
	var bs: Array = c.get("buttons", [])
	if bs.size():
		v.add_child(spacer(2))
		for b in bs:
			var btn := button(b)
			btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			v.add_child(btn)
	p.add_child(v)
	return p

# ---------- Stats ----------
# stats: { defense: [cell], offense: [cell], extras: [cell] }   cell: { label, value, tip, extra, cap, capped }
static func stat_cols(stats: Dictionary) -> HFlowContainer:
	var h := flow(14)
	for col in [["Defense", "defense"], ["Offense", "offense"], ["Extras", "extras"]]:
		var cells: Array = stats.get(col[1], [])
		if cells.is_empty():
			continue
		var v := vbox(1)
		v.custom_minimum_size = Vector2(118, 0)
		v.add_child(label(col[0].to_upper(), "Muted"))
		for c in cells:
			var row := hbox(4)
			var l := label(c.label)
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var val := label(c.value, "", false, Art.GOLD if c.get("capped") else Art.TEXT)
			row.add_child(l)
			row.add_child(val)
			row.tooltip_text = "\n".join([str(c.get("tip", "")), str(c.get("extra", "") if c.get("extra") else ""), str(c.get("cap", "") if c.get("cap") else "")]).strip_edges()
			row.mouse_filter = Control.MOUSE_FILTER_STOP
			v.add_child(row)
		h.add_child(v)
	return h

static func set_rows(sets: Dictionary) -> VBoxContainer:
	var v := vbox(2)
	v.add_child(label("SET BONUSES", "Muted"))
	var rows: Array = sets.get("rows", [])
	if rows.is_empty():
		v.add_child(label("No set pieces yet. Items with a class tag count toward that set.", "Muted", true))
	for r in rows:
		var row := hbox(6)
		row.add_child(chip(str(r.name), Art.color(r.color)))
		row.add_child(label("%d/%d" % [int(r.n), int(r.next)]))
		row.add_child(label(str(r.status), "Muted"))
		var tip := []
		for t in r.get("tiers", []):
			tip.append(("✓ " if t.on else "· ") + str(t.label) + ": " + str(t.text))
		row.tooltip_text = "\n".join(tip)
		row.mouse_filter = Control.MOUSE_FILTER_STOP
		v.add_child(row)
	if sets.get("hybrid") is Dictionary:
		var hy := label("%s (hybrid active)" % sets.hybrid.name, "", true, Art.GOLD)
		hy.tooltip_text = str(sets.hybrid.text)
		hy.mouse_filter = Control.MOUSE_FILTER_STOP
		v.add_child(hy)
	return v

static func relic_row(relics: Array) -> Control:
	var v := vbox(2)
	v.add_child(label("RELICS", "Muted"))
	if relics.is_empty():
		v.add_child(label("No relics yet. They drop at Plunder, from elites and bosses, and in vaults.", "Muted", true))
		return v
	var f := flow(6)
	for r in relics:
		var s := item_slot(r, 22)
		f.add_child(s)
	v.add_child(f)
	return v

# A hero drawn like in fights: class look, tint, weapon in hand
static func hero_preview(look: Dictionary, scale := 3) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(32 * scale, 32 * scale)
	var body := icon(Art.hero(look.get("look")), 32 * scale)
	if not look.get("look"):
		body.modulate = Art.color(look.get("tint"), Color.WHITE).lerp(Color.WHITE, 0.3)
	c.add_child(body)
	var w := Art.weapon(look.get("weapon"))
	if w:
		var wi := icon(w, 32 * scale)
		wi.position = Vector2(8 * scale, 6 * scale)
		c.add_child(wi)
	return c

# Your character: picture, vitals, stats, sets and relics (under the doors, on most screens)
static func character(me: Dictionary) -> PanelContainer:
	var p := panel("Card")
	var h := hbox(14)
	var left := vbox(4)
	left.custom_minimum_size = Vector2(150, 0)
	left.add_child(label("Lv %d" % int(me.get("level", 1)), "Heading"))
	left.add_child(hero_preview(me.get("look", {}), 3))
	left.add_child(label("You", "Heading"))
	left.add_child(label(me.get("build", ""), "", true, Art.GOLD))
	var sub := []
	if me.get("spec") is Dictionary:
		sub.append(me.spec.name)
	else:
		sub.append(str(me.get("specHint", "")))
	if me.get("gem") is Dictionary:
		sub.append(me.gem.name)
	left.add_child(label(" · ".join(sub), "Muted", true))
	left.add_child(vitals(me))
	h.add_child(left)
	var right := vbox(8)
	right.add_child(stat_cols(me.get("stats", {})))
	right.add_child(set_rows(me.get("sets", {})))
	right.add_child(relic_row(me.get("relics", [])))
	h.add_child(right)
	p.add_child(h)
	return p

static func vitals(me: Dictionary) -> VBoxContainer:
	var v := vbox(3)
	var top := hbox(6)
	top.add_child(hearts(int(me.get("hearts", 0)), int(me.get("maxHearts", 3))))
	if int(me.get("poison", 0)) > 0:
		top.add_child(chip("Poison %d" % int(me.poison), Color("#8fdc5a"), "You lose this much health at the start of every room until cured."))
	v.add_child(top)
	v.add_child(bar(float(me.get("hp", 0)), float(me.get("maxHp", 1)), Art.HP, "%d / %d" % [int(me.get("hp", 0)), int(me.get("maxHp", 1))], 14))
	var xpt := "Max level" if me.get("maxLevel", false) else "XP %d / %d" % [int(me.get("xp", 0)), int(me.get("xpNeed", 1))]
	v.add_child(bar(float(me.get("xp", 0)), float(me.get("xpNeed", 1)), Color("#8a6aff"), xpt, 10))
	return v

# The rival you're about to fight
static func opponent(o: Dictionary) -> PanelContainer:
	var p := panel("Card")
	var h := hbox(14)
	var left := vbox(4)
	left.custom_minimum_size = Vector2(150, 0)
	left.add_child(label("YOUR OPPONENT", "Muted"))
	var pv := hero_preview(o.get("look", {}), 3)
	if o.get("ghost", false):
		pv.modulate = Color(1, 1, 1, 0.5)
	left.add_child(pv)
	left.add_child(label(o.get("name", ""), "Heading", true))
	if not o.get("ghost", false):
		left.add_child(hearts(int(o.get("hearts", 0))))
	left.add_child(label(o.get("build", ""), "", true, Art.GOLD))
	left.add_child(label("Level %d · %s%s" % [int(o.get("level", 1)), o.get("spec", ""), (" · " + str(o.gem)) if o.get("gem") else ""], "Muted", true))
	h.add_child(left)
	var right := vbox(8)
	right.add_child(stat_cols(o.get("stats", {})))
	right.add_child(set_rows(o.get("sets", {})))
	h.add_child(right)
	p.add_child(h)
	return p
