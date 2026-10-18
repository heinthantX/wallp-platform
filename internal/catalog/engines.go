package catalog

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed engines.json
var EnginesJSON []byte

// EmbeddedEngines is the parsed representation of the embedded engines.json.
var EmbeddedEngines Engines

var engineIDSet map[string]struct{}

func init() {
	if err := json.Unmarshal(EnginesJSON, &EmbeddedEngines); err != nil {
		panic(fmt.Sprintf("internal/catalog: failed to unmarshal embedded engines.json: %v", err))
	}
	engineIDSet = make(map[string]struct{}, len(EmbeddedEngines.Engines))
	for _, e := range EmbeddedEngines.Engines {
		engineIDSet[e.ID] = struct{}{}
	}
}

// EventIcons is the allowlist of icon names that can be referenced as an eventIcon (theme-api §7.3).
var EventIcons = []string{
	"event",
	"nightlight_round",
	"card_giftcard_rounded",
	"water_drop_rounded",
	"light_mode_rounded",
	"celebration_rounded",
	"local_florist_rounded",
	"ac_unit_rounded",
	"star_rounded",
	"favorite_rounded",
	"music_note_rounded",
}

var eventIconSet = func() map[string]struct{} {
	m := make(map[string]struct{}, len(EventIcons))
	for _, icon := range EventIcons {
		m[icon] = struct{}{}
	}
	return m
}()

// IsValidEngine returns true if id is in the known engines list.
func IsValidEngine(id string) bool {
	_, ok := engineIDSet[id]
	return ok
}

// IsValidEventIcon returns true if name is in the EventIcons allowlist.
func IsValidEventIcon(name string) bool {
	_, ok := eventIconSet[name]
	return ok
}

// EngineIDs returns a slice of all engine IDs defined in the embedded engines.json.
func EngineIDs() []string {
	ids := make([]string, len(EmbeddedEngines.Engines))
	for i, e := range EmbeddedEngines.Engines {
		ids[i] = e.ID
	}
	return ids
}
