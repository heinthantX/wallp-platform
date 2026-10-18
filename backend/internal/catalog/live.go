package catalog

// IsLive determines whether a scene is live (animated) per theme-api §4.9.
// Scenes on built-in engines (halloween, christmas, thingyan) always count as live.
// Layers scenes are live if they contain at least one moving shape or particles with speed > 0.
func IsLive(scene Scene) bool {
	if scene.Engine != "layers" {
		return true
	}
	for _, l := range scene.Params.Layers {
		switch l.Type {
		case "shape":
			if l.Motion != nil && *l.Motion != "" && *l.Motion != "none" {
				return true
			}
		case "particles":
			// Default speed is 0.5 if omitted, which is > 0.
			if l.Speed == nil || *l.Speed > 0 {
				return true
			}
		}
	}
	return false
}
