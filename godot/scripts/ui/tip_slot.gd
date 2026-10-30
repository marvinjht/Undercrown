# A slot that shows an item's full card as its tooltip (gear, bag, relics, rivals' gear)
extends PanelContainer

var item: Dictionary = {}

func _make_custom_tooltip(_for_text: String) -> Object:
	if item.is_empty():
		return null
	return Kit.item_tip(item)
