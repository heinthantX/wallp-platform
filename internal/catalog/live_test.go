package catalog_test

import (
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func TestIsLive(t *testing.T) {
	// Built-in engines are always live
	for _, engine := range []string{"halloween", "christmas", "thingyan"} {
		scene := catalog.Scene{Engine: engine}
		if !catalog.IsLive(scene) {
			t.Errorf("expected engine %s to be live", engine)
		}
	}

	floatMotion := "float"
	noneMotion := "none"
	speedHalf := 0.5
	speedZero := 0.0

	tests := []struct {
		name     string
		scene    catalog.Scene
		expected bool
	}{
		{
			name: "layers with moving shape is live",
			scene: catalog.Scene{
				Engine: "layers",
				Params: catalog.SceneParams{
					Layers: []catalog.Layer{
						{Type: "gradient"},
						{Type: "shape", Motion: &floatMotion},
					},
				},
			},
			expected: true,
		},
		{
			name: "layers with particles (default speed) is live",
			scene: catalog.Scene{
				Engine: "layers",
				Params: catalog.SceneParams{
					Layers: []catalog.Layer{
						{Type: "gradient"},
						{Type: "particles"},
					},
				},
			},
			expected: true,
		},
		{
			name: "layers with particles speed > 0 is live",
			scene: catalog.Scene{
				Engine: "layers",
				Params: catalog.SceneParams{
					Layers: []catalog.Layer{
						{Type: "particles", Speed: &speedHalf},
					},
				},
			},
			expected: true,
		},
		{
			name: "layers with still shape and zero speed particles is not live",
			scene: catalog.Scene{
				Engine: "layers",
				Params: catalog.SceneParams{
					Layers: []catalog.Layer{
						{Type: "shape", Motion: &noneMotion},
						{Type: "particles", Speed: &speedZero},
					},
				},
			},
			expected: false,
		},
		{
			name: "layers with only static gradient and image is not live",
			scene: catalog.Scene{
				Engine: "layers",
				Params: catalog.SceneParams{
					Layers: []catalog.Layer{
						{Type: "gradient"},
						{Type: "image"},
					},
				},
			},
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := catalog.IsLive(tc.scene)
			if got != tc.expected {
				t.Errorf("IsLive() = %v; want %v", got, tc.expected)
			}
		})
	}
}
