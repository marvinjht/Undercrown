# Display settings: display mode, window size and UI scale, saved in user://settings.cfg.
# main.gd adds this node at startup; Settings.open(parent) shows the Settings window (title screen and top bar).
#
# Sharpness: the layout is designed at 1920x1080. "Auto (sharp)" scales it by whole numbers only (1x up to 1440p,
# 2x at 4K...), so pixel art and the pixel font land exactly on screen pixels. Textures use nearest filtering, the
# font has no antialiasing, and 2D drawing snaps to whole pixels, so other scales stay crisp too (just less even).
class_name Settings
extends Node

const PATH := "user://settings.cfg"
const BASE := Vector2(1920, 1080)
const MODES := [["windowed", "Windowed"], ["fullscreen", "Fullscreen"], ["borderless", "Borderless fullscreen"]]
const SIZES := [["maximized", "Maximized"], ["1280x720", "1280 x 720"], ["1920x1080", "1920 x 1080"], ["2560x1440", "2560 x 1440"], ["3840x2160", "3840 x 2160"]]
const SCALES := [["auto", "Auto (sharp)"], ["fit", "Fit window"], ["0.75", "75%"], ["1", "100%"], ["1.25", "125%"], ["1.5", "150%"], ["2", "200%"], ["3", "300%"]]

static var me: Settings
var display := "windowed"
var window_size := "maximized"
var ui_scale := "auto"

func _ready() -> void:
	me = self
	_load()
	var vp := get_viewport()
	vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	vp.snap_2d_transforms_to_pixel = true
	vp.snap_2d_vertices_to_pixel = true
	get_window().size_changed.connect(_apply_scale)
	if not ("--auto" in OS.get_cmdline_user_args()):   # the self-test keeps its own window
		_apply_window()
	_apply_scale()

func _load() -> void:
	var cf := ConfigFile.new()
	if cf.load(PATH) != OK:
		return
	display = str(cf.get_value("display", "mode", display))
	window_size = str(cf.get_value("display", "size", window_size))
	ui_scale = str(cf.get_value("display", "ui_scale", ui_scale))

func save() -> void:
	var cf := ConfigFile.new()
	cf.load(PATH)   # the same file holds your name and sound setting (game.gd, sfx.gd): keep them
	cf.set_value("display", "mode", display)
	cf.set_value("display", "size", window_size)
	cf.set_value("display", "ui_scale", ui_scale)
	cf.save(PATH)

# Display mode and window size
func _apply_window() -> void:
	match display:
		"fullscreen":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
		"borderless":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)   # a borderless window covering the screen
		_:
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
			if window_size == "maximized":
				DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_MAXIMIZED)
			else:
				DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
				var p := window_size.split("x")
				var want := Vector2i(int(p[0]), int(p[1]))
				var usable := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
				want = Vector2i(mini(want.x, usable.size.x), mini(want.y, usable.size.y))
				DisplayServer.window_set_size(want)
				DisplayServer.window_set_position(usable.position + (usable.size - want) / 2)
	_apply_scale.call_deferred()

# How big the interface is drawn: the content size is set so that the stretch scale is exactly the one wanted
func scale_now() -> float:
	var ws := Vector2(get_window().size)
	var fit: float = min(ws.x / BASE.x, ws.y / BASE.y)
	match ui_scale:
		"auto":
			return floorf(fit + 0.001) if fit >= 1.0 else fit   # whole numbers when there is room for them
		"fit":
			return fit
		_:
			return float(ui_scale)

func _apply_scale() -> void:
	var win := get_window()
	var s: float = max(0.5, scale_now())
	win.content_scale_size = Vector2i(Vector2(win.size) / s)

func set_display(v: String) -> void:
	display = v
	save()
	_apply_window()

func set_window_size(v: String) -> void:
	window_size = v
	save()
	_apply_window()

func set_ui_scale(v: String) -> void:
	ui_scale = v
	save()
	_apply_scale()

# ---------- The Settings window ----------
static func open(parent: Node) -> void:
	if me == null:
		return
	var d := AcceptDialog.new()
	d.title = "Settings"
	d.ok_button_text = "Done"
	var g := GridContainer.new()
	g.columns = 2
	g.add_theme_constant_override("h_separation", 12)
	g.add_theme_constant_override("v_separation", 8)
	var size_pick := _pick(SIZES, me.window_size, func(v): me.set_window_size(v))
	size_pick.disabled = me.display != "windowed"
	g.add_child(Kit.label("Display mode"))
	g.add_child(_pick(MODES, me.display, func(v):
		me.set_display(v)
		size_pick.disabled = v != "windowed"))
	g.add_child(Kit.label("Window size"))
	g.add_child(size_pick)
	g.add_child(Kit.label("UI scale"))
	g.add_child(_pick(SCALES, me.ui_scale, func(v): me.set_ui_scale(v)))
	var v := Kit.vbox(10)
	v.add_child(g)
	v.add_child(Kit.label("Auto (sharp) scales by whole numbers, so pixel art and text stay crisp. Other sizes fit more exactly but are a little less even.", "Muted", true))
	v.custom_minimum_size = Vector2(420, 0)
	Kit.fit_width(v, 420)   # so the wrapped note doesn't make the window as tall as the screen
	d.add_child(v)
	parent.add_child(d)
	d.confirmed.connect(d.queue_free)
	d.canceled.connect(d.queue_free)
	d.popup_centered()

static func _pick(options: Array, current: String, on_pick: Callable) -> OptionButton:
	var o := OptionButton.new()
	for i in options.size():
		o.add_item(options[i][1], i)
		if options[i][0] == current:
			o.select(i)
	o.custom_minimum_size = Vector2(220, 0)
	o.item_selected.connect(func(i): on_pick.call(options[i][0]))
	return o
