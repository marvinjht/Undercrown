# The UI building blocks: every screen is made of these. Change how cards, buttons, bars and panels look here
# (layout), in theme/theme.tres (colors, frames, fonts) and in art/ (images).
# Everything takes the plain data the server describes (see src/present.js for the shapes).
class_name Kit
extends RefCounted

const CARD_W := 214
const CHARACTER_W := 440   # width of your character card (centered on the screen)
const TIP_W := 260         # width of an item's hover card

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

# Center a label's text across the width it's given
static func center(l: Label) -> Label:
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

static func line(ln) -> Label:   # { text, tone, short? }
	if ln is String:
		return label(ln, "", true)
	var tone := str(ln.get("tone", ""))
	var col: Color = Art.color(ln.color, Art.tone(tone)) if ln.get("color") else Art.tone(tone)   # color: "#rrggbb" wins over tone
	if ln.has("short"):
		return dual(str(ln.get("text", "")), str(ln.short), "Heading" if tone == "head" else "", true, col)
	var l := label(ln.get("text", ""), "Heading" if tone == "head" else "", true, col)
	return l

# ---------- Short and full texts ----------
# Long descriptions come with a short version: it shows by default, the full text while Shift is held.
# short == null: there is only one text. short == "": hidden unless Shift is held.
const HINT := "Hold Shift for details"

static func dual(full: String, short, variation := "", wrap := true, color = null) -> Label:
	if short == null:
		return label(full, variation, wrap, color)
	var l: Label = preload("res://scripts/ui/dual_label.gd").new()
	l.full = full
	l.short = str(short)
	l.text = full if Game.details else l.short
	l.visible = l.text != ""
	if variation != "":
		l.theme_type_variation = variation
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if color != null:
		l.add_theme_color_override("font_color", color)
	return l

# Does anything under this node have a full text that differs from its short one?
static func has_more(node: Node) -> bool:
	for c in node.find_children("*", "Label", true, false):
		if c.get_script() == preload("res://scripts/ui/dual_label.gd") and c.full != c.short:
			return true
	return false

# "Hold Shift for details", only while it isn't held
static func detail_hint() -> Label:
	var l := dual("", HINT, "Muted", true)
	l.add_theme_font_size_override("font_size", 10)
	return l

# A tooltip made of lines ({ text, tone, short? }), with the hint when there is more to show
static func lines_tip(lines: Array) -> Control:
	var p := panel("")
	p.custom_minimum_size = Vector2(TIP_W, 0)
	var v := vbox(3)
	for ln in lines:
		v.add_child(line(ln))
	if has_more(v):
		v.add_child(detail_hint())
	p.add_child(v)
	fit_width(p, TIP_W)
	return p

static func vbox(sep := 4) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return v

static func hbox(sep := 6) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h

static func flow(sep := 8, centered := false) -> HFlowContainer:
	var f := HFlowContainer.new()
	if centered:
		f.alignment = FlowContainer.ALIGNMENT_CENTER
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
	btn.set_meta("act", str(b.get("act", "")))
	btn.set_meta("args", b.get("args", []))
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

static func buttons(list: Array, centered := false) -> HFlowContainer:
	var f := flow(6, centered)
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
# rarity_frame: a clear frame and soft background in the item's rarity color (grey, green, blue, gold, red),
# plus its class icon in the bottom-right corner (the gear panel)
static func item_slot(item, size := 36, empty_icon := "", rarity_frame := false) -> PanelContainer:
	var p := preload("res://scripts/ui/tip_slot.gd").new()
	p.theme_type_variation = "Slot"
	p.custom_minimum_size = Vector2(size + 8, size + 8)
	if item is Dictionary:
		p.item = item
		p.tooltip_text = " "
		var ic := icon(Art.icon(str(item.get("icon", ""))), size)
		p.add_child(ic)
		p.self_modulate = Art.rarity_color(item.get("rarity", "")).lerp(Color.WHITE, 0.35)
		if rarity_frame:
			p.theme_type_variation = "SlotRarity"   # theme: white border on a faint white fill, tinted here to the rarity color
			p.self_modulate = Art.rarity_color(item.get("rarity", ""))
		if rarity_frame and item.get("set") is Dictionary:
			var ct := Art.class_icon(item.set.get("id", ""))
			if ct:
				var corner := icon(ct, 14)
				corner.anchor_left = 1.0
				corner.anchor_top = 1.0
				corner.anchor_right = 1.0
				corner.anchor_bottom = 1.0
				corner.offset_left = -12
				corner.offset_top = -12
				corner.offset_right = 2
				corner.offset_bottom = 2
				ic.add_child(corner)
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
		tags.add_child(class_tag(str(item.set.get("id", "")), str(item.set.name), Art.color(item.set.color)))
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
		v.add_child(dual(str(item.trait), item.get("traitShort"), "Muted", true))
	for ln in item.get("notes", []):
		v.add_child(line(ln))
	if item.get("compare") is Dictionary:
		v.add_child(label("Compared to " + str(item.compare.name), "Heading", true))
		for ln in item.compare.get("lines", []):
			v.add_child(line(ln))

static func item_tip(item: Dictionary) -> Control:
	var p := panel("")
	p.custom_minimum_size = Vector2(TIP_W, 0)
	var v := vbox(3)
	item_body(item, v)
	if has_more(v):
		v.add_child(detail_hint())
	p.add_child(v)
	fit_width(p, TIP_W)
	return p

# Wrapped text only knows its height once it knows its width. Containers work that out a frame later, which is
# too late for a tooltip (it sizes itself once, from the first guess, leaving a tall empty box). This hands every
# wrapped label its real width up front, so boxes are exactly as tall as their text.
static func fit_width(c: Control, w: float) -> void:
	if c is Label or c is RichTextLabel:
		if c.autowrap_mode != TextServer.AUTOWRAP_OFF:
			c.size = Vector2(w, c.size.y)
		return
	if c is PanelContainer:
		var sb := c.get_theme_stylebox("panel")
		if sb:
			w -= sb.get_minimum_size().x
	var kids: Array = c.get_children().filter(func(k): return k is Control and k.visible)
	if c is HBoxContainer:
		var fixed: float = c.get_theme_constant("separation") * maxi(0, kids.size() - 1)
		var grow := []
		for k in kids:
			if k.size_flags_horizontal & Control.SIZE_EXPAND:
				grow.append(k)
			else:
				fixed += k.get_combined_minimum_size().x
		for k in kids:
			fit_width(k, (w - fixed) / max(1, grow.size()) if k in grow else k.get_combined_minimum_size().x)
		return
	if c is BoxContainer or c is PanelContainer or c is MarginContainer:
		for k in kids:
			fit_width(k, w)

# A card on a screen: { kind: 'item'|'text', item?, title?, sub?, color?, icon?, lines, buttons }
static func card(c: Dictionary, width := CARD_W) -> PanelContainer:
	var p := panel("Card")
	p.custom_minimum_size = Vector2(width, 0)
	p.size_flags_vertical = Control.SIZE_SHRINK_BEGIN   # in a row of cards, don't stretch to the tallest one
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
	if has_more(v):
		v.add_child(detail_hint())
	card_buttons(v, c.get("buttons", []))
	p.add_child(v)
	fit_width(p, width)
	return p

# A card's buttons, pushed to the bottom (when a grid row makes the card taller than its text)
static func card_buttons(v: VBoxContainer, bs: Array) -> void:
	var push := spacer(2)
	push.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(push)
	for b in bs:
		var btn := button(b)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_child(btn)

# ---------- Compact item card ----------
# Every item on a screen, the same way: name, type line, up to 3 key stats (with the change vs what you wear),
# what the screen adds (a forge preview...), the verdict tag, then the buttons. Hover shows the full item;
# Shift shows its full text.
const CARD_STATS := 3

static func item_card(c: Dictionary, width := CARD_W) -> PanelContainer:
	var it: Dictionary = c.get("item", {})
	var p: PanelContainer = preload("res://scripts/ui/tip_slot.gd").new()
	p.theme_type_variation = "Card"
	p.item = it
	p.tooltip_text = " "
	p.custom_minimum_size = Vector2(width, 0)
	var v := vbox(3)
	var nm := label(it.get("name", ""), "", false, Art.color(it.get("color"), Art.TEXT))
	nm.clip_text = true
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	v.add_child(nm)
	var tr := hbox(4)
	var ic := icon(Art.icon(str(it.get("icon", ""))), 20)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tr.add_child(ic)
	var ty := label(it.get("type", it.get("sub", "")), "Muted")
	ty.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ty.clip_text = true
	ty.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	tr.add_child(ty)
	if it.get("set") is Dictionary and Art.class_icon(it.set.get("id", "")):
		var ci := icon(Art.class_icon(it.set.id), 12)
		ci.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		tr.add_child(ci)
	v.add_child(tr)
	var rows := []
	if it.get("stats") is Array and (it.stats as Array).size():
		for st in it.stats:
			rows.append(stat_row(st))
	else:   # bag items and relics: their (short) description
		for ln in it.get("lines", []):
			if ln is Dictionary and str(ln.get("tone", "")) in ["hint", "head"]:
				continue
			rows.append(line(ln))
			break
	for i in mini(rows.size(), CARD_STATS):
		v.add_child(rows[i])
	if rows.size() > CARD_STATS:
		v.add_child(label("+%d more" % (rows.size() - CARD_STATS), "Muted"))
	for ln in c.get("lines", []):   # what the screen adds
		v.add_child(line(ln))
	if it.get("verdict") is Dictionary:
		v.add_child(label(str(it.verdict.get("text", "")), "", false, Art.tone(it.verdict.get("tone", ""))))
	card_buttons(v, c.get("buttons", []))
	p.add_child(v)
	fit_width(p, width)
	return p

# "+20 Health ▲10": a stat with its change against the item you wear (green up, red down)
static func stat_row(st: Dictionary) -> HBoxContainer:
	var h := hbox(5)
	var col: Color = Art.MUTED if st.get("lost", false) else (Art.tone("cost") if st.get("cost", false) else (Art.tone("affix") if st.get("affix", false) else Art.TEXT))
	h.add_child(label(str(st.get("text", "")), "", false, col))
	var d = st.get("delta")
	if d != null and int(d) != 0:
		var a := label(("▲%d" if int(d) > 0 else "▼%d") % absi(int(d)), "", false, Art.UP if int(d) > 0 else Art.DOWN)
		a.add_theme_font_size_override("font_size", 10)
		a.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(a)
	return h

# ---------- Classes and hybrids ----------
# A class name with its icon on the left
static func class_tag(cls: String, name: String, color: Color, size := 12) -> HBoxContainer:
	var h := hbox(3)
	var t := Art.class_icon(cls)
	if t:
		var ic := icon(t, size)
		ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(ic)
	h.add_child(label(name, "", false, color))
	return h

static func hybrid_tag(key: String, name: String, size := 12) -> HBoxContainer:
	var h := hbox(3)
	var t := Art.hybrid_icon(key)
	if t:
		var ic := icon(t, size)
		ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(ic)
	h.add_child(label(name, "", false, Art.hybrid_color(key)))
	return h

# Class and hybrid display names -> their icon, from the set guide the server sends
static func set_names() -> Dictionary:
	var out := {}
	var g: Dictionary = Game.view.get("setGuide", {})
	for c in g.get("classes", []):
		out[str(c.name)] = Art.class_icon(c.get("cls", ""))
	for hy in g.get("hybrids", []):
		if hy.get("key"):
			out[str(hy.name)] = Art.hybrid_icon(hy.key)
	return out

# A line of text (like a build: "Warrior 2 · Mage 2", "Templar (4 Paladin + 2 Mage)") where each class or hybrid
# name gets its icon on the left. Built as a wrapping row of words, so an icon, its name and a count after it
# ("Paladin 2") always stay together on one line.
static func set_text(text: String, color: Color, centered := false, size := 12) -> HFlowContainer:
	var f := HFlowContainer.new()
	f.add_theme_constant_override("h_separation", 0)
	f.add_theme_constant_override("v_separation", 0)
	f.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	f.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if centered:
		f.alignment = FlowContainer.ALIGNMENT_CENTER
	var words := func(t: String):   # plain words, keeping the text's own spacing (wraps only at spaces)
		var parts := t.split(" ")
		for k in parts.size():
			var w: String = parts[k] + (" " if k < parts.size() - 1 else "")
			if w != "":
				f.add_child(label(w, "", false, color))
	var names := set_names()
	var count := RegEx.create_from_string("^ [0-9]+")   # a count right after the name
	var i := 0
	while i < text.length():
		var at := -1
		var hit := ""
		for n in names:   # the earliest name wins; at the same spot the longer one ("Arcane Archer" over "Archer")
			var p := text.find(n, i)
			if p >= 0 and (at < 0 or p < at or (p == at and n.length() > hit.length())):
				at = p
				hit = n
		if at < 0:
			words.call(text.substr(i))
			break
		words.call(text.substr(i, at - i))
		var shown := hit
		i = at + hit.length()
		var m := count.search(text.substr(i))
		if m:
			shown += m.get_string()
			i += m.get_string().length()
		var unit := hbox(3)
		if names[hit]:
			var ic := icon(names[hit], size)
			ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			unit.add_child(ic)
		unit.add_child(label(shown, "", false, color))
		f.add_child(unit)
	return f

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

# compact: one line per class (icon, name, pieces); hover it for the tiers, active ones highlighted
static func set_rows(sets: Dictionary, compact := false) -> VBoxContainer:
	var v := vbox(2)
	v.add_child(label("SET BONUSES", "Muted"))
	var rows: Array = sets.get("rows", [])
	if rows.is_empty():
		v.add_child(label("No set pieces yet. Items with a class tag count toward that set.", "Muted", true))
	for r in rows:
		if compact:
			var crow: HBoxContainer = preload("res://scripts/ui/tip_row.gd").new()
			crow.add_theme_constant_override("separation", 6)
			crow.add_child(class_tag(str(r.get("cls", "")), str(r.name), Art.color(r.color)))
			crow.add_child(label("%d/%d" % [int(r.n), int(r.next)]))
			var tl := [{ "text": "%s · %d worn · %s" % [r.name, int(r.n), r.status], "color": str(r.color) }]
			for t in r.get("tiers", []):
				tl.append({ "text": ("✓ " if t.get("on", false) else "· ") + str(t.get("label", "")) + ": " + str(t.get("text", "")), "tone": "up" if t.get("on", false) else "hint" })
			crow.lines = tl
			crow.tooltip_text = " "
			crow.mouse_filter = Control.MOUSE_FILTER_STOP
			v.add_child(crow)
			continue
		var row := hbox(6)
		row.add_child(class_tag(str(r.get("cls", "")), str(r.name), Art.color(r.color)))
		row.add_child(label("%d/%d" % [int(r.n), int(r.next)]))
		row.add_child(label(str(r.status), "Muted"))
		v.add_child(row)
		for t in r.get("tiers", []):
			v.add_child(tier_line(t))
	if sets.get("hybrid") is Dictionary:
		var key := ""
		for hy in Game.view.get("setGuide", {}).get("hybrids", []):
			if str(hy.name) == str(sets.hybrid.name):
				key = str(hy.get("key", ""))
		var hrow: HBoxContainer = preload("res://scripts/ui/tip_row.gd").new()
		hrow.add_theme_constant_override("separation", 6)
		hrow.add_child(hybrid_tag(key, str(sets.hybrid.name)))
		hrow.add_child(label("hybrid active", "Muted"))
		v.add_child(hrow)
		if compact:
			hrow.lines = [{ "text": str(sets.hybrid.name) + " (hybrid)", "color": Art.hybrid_color(key).to_html(false) }, { "text": str(sets.hybrid.text), "tone": "up" }]
			hrow.tooltip_text = " "
			hrow.mouse_filter = Control.MOUSE_FILTER_STOP
		else:
			v.add_child(label(str(sets.hybrid.text), "", true, Art.UP))
	return v

# One set tier: active ones in full color, the rest greyed out
static func tier_line(t: Dictionary) -> Label:
	var on: bool = t.get("on", false)
	return label(("✓ " if on else "· ") + str(t.get("label", "")) + ": " + str(t.get("text", "")), "" if on else "Muted", true, Art.UP if on else null)

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

# Your character, centered: level, picture, name, build and spec, hearts, health and XP.
# Stats, sets and relics live in the right-hand panel. (Doors, rewards, spoils, wager and waiting screens.)
static func character(me: Dictionary) -> PanelContainer:
	var p := panel("Card")
	p.custom_minimum_size = Vector2(CHARACTER_W, 0)
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var v := vbox(4)
	v.add_child(center(label("Lv %d" % int(me.get("level", 1)), "Heading")))
	var pic := hero_preview(me.get("look", {}), 4)
	pic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	v.add_child(pic)
	v.add_child(center(label("You", "Heading")))
	v.add_child(set_text(str(me.get("build", "")), Art.GOLD, true))
	var sub := []
	if me.get("spec") is Dictionary:
		sub.append(me.spec.name)
	else:
		sub.append(str(me.get("specHint", "")))
	if me.get("gem") is Dictionary:
		sub.append(me.gem.name)
	v.add_child(center(label(" · ".join(sub), "Muted", true)))
	v.add_child(vitals(me, true))
	p.add_child(v)
	return p

static func vitals(me: Dictionary, centered := false) -> VBoxContainer:
	var v := vbox(3)
	var top := hbox(6)
	if centered:
		top.alignment = BoxContainer.ALIGNMENT_CENTER
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
	left.add_child(set_text(str(o.get("build", "")), Art.GOLD))
	left.add_child(label("Level %d · %s%s" % [int(o.get("level", 1)), o.get("spec", ""), (" · " + str(o.gem)) if o.get("gem") else ""], "Muted", true))
	h.add_child(left)
	var right := vbox(8)
	right.add_child(stat_cols(o.get("stats", {})))
	right.add_child(set_rows(o.get("sets", {})))
	h.add_child(right)
	p.add_child(h)
	return p
