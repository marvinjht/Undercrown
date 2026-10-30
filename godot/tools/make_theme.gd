# Builds theme/theme.tres from the pixel frames in art/ui/. Run once (or after changing art/ui):
#   godot --headless --path godot --script res://tools/make_theme.gd
# After that, theme.tres is yours: open it in Godot's theme editor and change anything.
extends SceneTree

const FONT_SIZE := 11
const TITLE_SIZE := 22

func box(path: String, margin := 8.0, content := 8.0) -> StyleBoxTexture:
	var b := StyleBoxTexture.new()
	b.texture = load(path)
	b.texture_margin_left = margin; b.texture_margin_right = margin
	b.texture_margin_top = margin; b.texture_margin_bottom = margin
	b.content_margin_left = content + 2; b.content_margin_right = content + 2
	b.content_margin_top = content; b.content_margin_bottom = content
	return b

func flat(bg: Color, border := Color(0, 0, 0, 0), bw := 0) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = border
	b.set_border_width_all(bw)
	b.content_margin_left = 6; b.content_margin_right = 6; b.content_margin_top = 4; b.content_margin_bottom = 4
	return b

func _init() -> void:
	var t := Theme.new()
	var font: Font = load("res://fonts/DepartureMono-Regular.otf")
	t.default_font = font
	t.default_font_size = FONT_SIZE
	var text := Color("#efe6d8"); var muted := Color("#a8998a"); var ember := Color("#e8903f"); var gold := Color("#f2c14a")
	# Panels
	t.set_stylebox("panel", "PanelContainer", box("res://art/ui/panel.png"))
	t.set_stylebox("panel", "Panel", box("res://art/ui/panel.png"))
	t.set_type_variation("Card", "PanelContainer")
	t.set_stylebox("panel", "Card", box("res://art/ui/card.png", 8, 6))
	t.set_type_variation("Slot", "PanelContainer")
	t.set_stylebox("panel", "Slot", box("res://art/ui/button_ghost.png", 8, 2))
	# Buttons
	for kind in ["Button", "Primary", "Ghost"]:
		if kind != "Button":
			t.set_type_variation(kind, "Button")
		var normal := "res://art/ui/button_ghost.png" if kind == "Ghost" else "res://art/ui/button.png"
		t.set_stylebox("normal", kind, box(normal, 8, 5))
		t.set_stylebox("hover", kind, box("res://art/ui/button_hover.png", 8, 5))
		t.set_stylebox("pressed", kind, box("res://art/ui/button_pressed.png", 8, 5))
		t.set_stylebox("disabled", kind, box("res://art/ui/button_disabled.png", 8, 5))
		t.set_stylebox("focus", kind, StyleBoxEmpty.new())
		t.set_color("font_color", kind, gold if kind == "Primary" else text)
		t.set_color("font_hover_color", kind, Color.WHITE)
		t.set_color("font_pressed_color", kind, ember)
		t.set_color("font_disabled_color", kind, Color("#6b6158"))
	# Text
	t.set_color("font_color", "Label", text)
	t.set_color("font_outline_color", "Label", Color("#15120f"))
	t.set_type_variation("Title", "Label")
	t.set_font_size("font_size", "Title", TITLE_SIZE)
	t.set_color("font_color", "Title", gold)
	t.set_type_variation("Heading", "Label")
	t.set_color("font_color", "Heading", ember)
	t.set_type_variation("Muted", "Label")
	t.set_color("font_color", "Muted", muted)
	t.set_color("default_color", "RichTextLabel", text)
	t.set_font_size("normal_font_size", "RichTextLabel", FONT_SIZE)
	# Tooltips
	t.set_stylebox("panel", "TooltipPanel", box("res://art/ui/panel.png", 8, 8))
	t.set_color("font_color", "TooltipLabel", text)
	# Inputs and bars
	t.set_stylebox("normal", "LineEdit", flat(Color("#120e0c"), Color("#4d3f33"), 2))
	t.set_stylebox("focus", "LineEdit", flat(Color("#120e0c"), ember, 2))
	t.set_color("font_color", "LineEdit", text)
	t.set_stylebox("background", "ProgressBar", flat(Color("#0d0b09"), Color("#3d322a"), 1))
	t.set_stylebox("fill", "ProgressBar", flat(Color("#6cc35f")))
	t.set_color("font_color", "ProgressBar", text)
	t.set_stylebox("panel", "ScrollContainer", StyleBoxEmpty.new())
	var err := ResourceSaver.save(t, "res://theme/theme.tres")
	print("theme saved: ", err)
	quit()
