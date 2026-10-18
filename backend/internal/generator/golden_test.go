package generator

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func goldenChristmasCozyInput() Input {
	in := baseInput()
	in.FestivalID = "christmas"
	in.FestivalName = catalog.Localized{"en": "Christmas"}
	in.FestivalTags = []string{"christmas", "winter", "holiday"}
	in.Mood = "cozy"
	in.Engine = "christmas"
	in.Seed = 12345
	return in
}

func goldenHalloweenClassicInput() Input {
	in := baseInput()
	in.FestivalID = "halloween"
	in.FestivalName = catalog.Localized{"en": "Halloween"}
	in.FestivalTags = []string{"halloween", "spooky"}
	in.Mood = "classic"
	in.Engine = "halloween"
	in.Seed = 7
	return in
}

func goldenThingyanCuteInput() Input {
	in := baseInput()
	in.FestivalID = "thingyan"
	in.FestivalName = catalog.Localized{"en": "Thingyan"}
	in.FestivalTags = []string{"thingyan", "water"}
	in.Mood = "cute"
	in.Engine = "thingyan"
	in.Seed = 99
	return in
}

func TestGoldenEquality(t *testing.T) {
	cases := []struct {
		name     string
		filename string
		input    Input
	}{
		{
			name:     "christmas cozy 12345",
			filename: "golden_christmas_cozy_12345.json",
			input:    goldenChristmasCozyInput(),
		},
		{
			name:     "halloween classic 7",
			filename: "golden_halloween_classic_7.json",
			input:    goldenHalloweenClassicInput(),
		},
		{
			name:     "thingyan cute 99",
			filename: "golden_thingyan_cute_99.json",
			input:    goldenThingyanCuteInput(),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			opts, err := Generate(tc.input, 6)
			if err != nil {
				t.Fatalf("Generate failed: %v", err)
			}

			gotBytes, err := json.MarshalIndent(opts, "", "  ")
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}
			gotBytes = append(gotBytes, '\n')

			path := filepath.Join("testdata", tc.filename)
			goldenBytes, err := os.ReadFile(path)
			if os.IsNotExist(err) {
				if err := os.MkdirAll("testdata", 0755); err != nil {
					t.Fatalf("mkdir testdata failed: %v", err)
				}
				if err := os.WriteFile(path, gotBytes, 0644); err != nil {
					t.Fatalf("write golden file %s failed: %v", path, err)
				}
				t.Logf("wrote golden file %s", path)
				return
			}
			if err != nil {
				t.Fatalf("read golden file %s failed: %v", path, err)
			}

			if !bytes.Equal(gotBytes, goldenBytes) {
				t.Fatalf("output differed from golden file %s", path)
			}
		})
	}
}
