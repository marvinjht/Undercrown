# Sound effects, as an autoload: Sfx.play("slash").
# Every sound is a file in res://sfx/<name>.wav (rendered from the browser game's own sounds).
# Replace any of them with your own sound of the same name (.wav or .ogg).
extends Node

const DIR := "res://sfx/"
var muted := false
var volume_db := -4.0
var _streams: Dictionary = {}
var _last: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []

func _ready() -> void:
	var cfg := ConfigFile.new()
	if cfg.load("user://settings.cfg") == OK:
		muted = cfg.get_value("sound", "muted", false)
	for i in 12:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)

func _stream(sound: String) -> AudioStream:
	if _streams.has(sound):
		return _streams[sound]
	var st: AudioStream = null
	for ext in [".ogg", ".wav"]:
		if ResourceLoader.exists(DIR + sound + ext):
			st = load(DIR + sound + ext)
			break
	_streams[sound] = st
	return st

# gap: the same sound won't repeat faster than this (keeps fast fights from turning into noise)
func play(sound: String, gap := 0.06) -> void:
	if muted or sound == "":
		return
	var now := Time.get_ticks_msec() / 1000.0
	if _last.has(sound) and now - _last[sound] < gap:
		return
	_last[sound] = now
	var st := _stream(sound)
	if st == null:
		return
	for p in _players:
		if not p.playing:
			p.stream = st
			p.volume_db = volume_db
			p.play()
			return

func toggle() -> bool:
	muted = not muted
	var cfg := ConfigFile.new()
	cfg.load("user://settings.cfg")
	cfg.set_value("sound", "muted", muted)
	cfg.save("user://settings.cfg")
	if not muted:
		play("coin")
	return muted

# Which sound each weapon makes when it hits, and each spell when it's cast (same as the browser game)
const WEAPON := { "daggers": "slash", "saber": "slash", "longsword": "slash", "swordShield": "clang", "greatAxe": "chop", "greatHammer": "thud",
	"mace": "thud", "maceShield": "thud", "shortbow": "bow", "longbow": "bow", "wandFocus": "zap", "staff": "zap" }
const SPELL := { "Firebolt": "firebolt", "Meteor": "meteor", "Arcane Blast": "arcane", "Deep Cut": "deepcut", "Feint": "feint", "Shield Bash": "bashready",
	"Cleave": "cleave", "Decimate": "decimate", "Quake": "quake", "Dawnbringer": "dawn", "Rebuke": "rebuke", "Retreat": "retreat", "Triple Shot": "triple" }
