package catalog_test

import (
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func ptr[T any](v T) *T {
	return &v
}

func baseValidFestival() catalog.Festival {
	return catalog.Festival{
		ID:   "halloween",
		Name: catalog.Localized{"en": "Halloween"},
		Kind: "festival",
		Sort: 10,
		Occurrences: []string{
			"2027-10-31",
			"2028-10-31",
		},
		Look: catalog.FestivalLook{
			Background:  "#120A1C",
			Surface:     "#1E122E",
			Surface2:    "#2A1A40",
			Outline:     "#3D285C",
			Nav:         "#160C24",
			Muted:       "#B8A8D0",
			Brand:       "#FF7A1A",
			DisplayFont: "creepster",
		},
	}
}

func baseValidTheme() catalog.ThemeDetail {
	return catalog.ThemeDetail{
		ID:          "halloween-night",
		Rev:         1,
		FestivalID:  "halloween",
		Name:        catalog.Localized{"en": "Haunted Moon"},
		Style:       "classic",
		PublishedAt: "2026-06-17T14:00:00Z",
		Scene: catalog.Scene{
			Engine: "halloween",
			Params: catalog.SceneParams{},
		},
		Palette: catalog.Palette{
			Background: "#160C24",
			Deep:       "#0A0510",
			Surface:    "#2A1640",
			Text:       "#F5EEF8",
			TextMuted:  "#A898B8",
		},
		Accents: []catalog.Accent{
			{
				ID:     "pumpkin",
				Name:   catalog.Localized{"en": "Pumpkin"},
				Type:   "solid",
				Colors: []string{"#FF7A1A"},
			},
		},
		Fonts: catalog.ThemeFonts{
			Display: "creepster",
			Body:    "space-grotesk",
			Labels:  "creepster",
		},
		Clock:      catalog.Clock{UseAccent: false},
		IconPackID: "spooky-glow",
	}
}

func baseValidWallpaper() catalog.Wallpaper {
	return catalog.Wallpaper{
		ID:          "harvest-moon",
		FestivalID:  "halloween",
		Name:        catalog.Localized{"en": "Harvest Moon"},
		Kind:        "scene",
		PublishedAt: "2026-06-17T14:00:00Z",
		Scene: &catalog.Scene{
			Engine: "halloween",
			Params: catalog.SceneParams{},
		},
	}
}

func baseValidFont() catalog.Font {
	return catalog.Font{
		ID:       "creepster",
		Family:   "Creepster",
		Category: "display",
		Scripts:  []string{"latin"},
		License:  "OFL-1.1",
		Files: []catalog.FontFile{
			{
				Asset: catalog.Asset{
					URL:    "assets/402aeb734586c74aecd3dbdc454589b1fb12e2e1c71f782fd019ae68066d9f44.ttf",
					SHA256: "402aeb734586c74aecd3dbdc454589b1fb12e2e1c71f782fd019ae68066d9f44",
					Bytes:  62724,
					Format: "ttf",
				},
			},
		},
	}
}

func baseValidIconPack() catalog.IconPack {
	painter := "halloween"
	return catalog.IconPack{
		ID:          "spooky-glow",
		FestivalID:  "halloween",
		Name:        catalog.Localized{"en": "Spooky Glow"},
		Style:       catalog.Localized{"en": "Neon outline"},
		Kind:        "painted",
		Painter:     &painter,
		Shape:       "squircle",
		Glyph:       "#FF7A1A",
		Ring:        "#FF7A1A",
		PublishedAt: "2026-06-17T14:00:00Z",
	}
}

func baseValidBanner() catalog.Banner {
	themeID := "halloween-night"
	return catalog.Banner{
		ID:       "halloween-2026",
		Title:    catalog.Localized{"en": "Halloween Night"},
		Subtitle: catalog.Localized{"en": "Wallpaper, icons and clock"},
		Tag:      catalog.Localized{"en": "THEME"},
		CTA:      catalog.Localized{"en": "Get theme"},
		Action: catalog.BannerAction{
			Type: "theme",
			ID:   &themeID,
		},
		Look: catalog.BannerLook{
			Background: "#120A1C",
			Accent:     "#FF7A1A",
			TitleColor: "#F5EEF8",
			Font:       "creepster",
		},
		Sort: 10,
	}
}

func baseValidAsset() catalog.Asset {
	return catalog.Asset{
		URL:    "assets/402aeb734586c74aecd3dbdc454589b1fb12e2e1c71f782fd019ae68066d9f44.png",
		SHA256: "402aeb734586c74aecd3dbdc454589b1fb12e2e1c71f782fd019ae68066d9f44",
		Bytes:  1024,
		Format: "png",
	}
}

func TestNegativeValidationRules(t *testing.T) {
	tests := []struct {
		name          string
		validate      func() []catalog.FieldError
		expectedField string
		expectedCode  string
	}{
		// 1. Color rule
		{
			name: "colour must match ^#[0-9A-Fa-f]{6}$",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Look.Background = "bad-color"
				return f.Validate()
			},
			expectedField: "look.background",
			expectedCode:  "invalid_color",
		},
		// 2. ID kebab-case rule
		{
			name: "id must be lowercase kebab-case",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.ID = "Halloween_Night"
				return f.Validate()
			},
			expectedField: "id",
			expectedCode:  "invalid_id",
		},
		// 3. Localized en required rule
		{
			name: "localized text requires English",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Name = catalog.Localized{"my": "သင်္ကြန်"}
				return f.Validate()
			},
			expectedField: "name.en",
			expectedCode:  "required",
		},
		// 4. Dates YYYY-MM-DD real calendar dates
		{
			name: "dates must be real calendar dates",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Occurrences = []string{"2027-02-31"}
				return f.Validate()
			},
			expectedField: "occurrences[0]",
			expectedCode:  "invalid_date",
		},
		// 5. Strictly increasing occurrences
		{
			name: "occurrences must be strictly increasing",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Occurrences = []string{"2027-10-31", "2027-10-30"}
				return f.Validate()
			},
			expectedField: "occurrences[1]",
			expectedCode:  "dates_not_increasing",
		},
		// 6. FallbackDate not Feb 29
		{
			name: "fallbackDate not Feb 29",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.FallbackDate = &catalog.FallbackDate{Month: 2, Day: 29}
				return f.Validate()
			},
			expectedField: "fallbackDate",
			expectedCode:  "invalid_fallback_date",
		},
		// 7. DurationDays >= 1
		{
			name: "durationDays must be at least 1",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.DurationDays = ptr(0)
				return f.Validate()
			},
			expectedField: "durationDays",
			expectedCode:  "invalid_range",
		},
		// 8. Unit enum day|night
		{
			name: "unit must be day or night",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Unit = ptr("week")
				return f.Validate()
			},
			expectedField: "unit",
			expectedCode:  "invalid_enum",
		},
		// 9. Festival kind enum festival|collection
		{
			name: "festival kind must be festival or collection",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Kind = "party"
				return f.Validate()
			},
			expectedField: "kind",
			expectedCode:  "invalid_enum",
		},
		// 10. Dated festival needs occurrences or fallbackDate
		{
			name: "dated festival needs occurrences or fallbackDate",
			validate: func() []catalog.FieldError {
				f := baseValidFestival()
				f.Occurrences = nil
				f.FallbackDate = nil
				return f.Validate()
			},
			expectedField: "occurrences",
			expectedCode:  "required",
		},
		// 11. Accents >= 1
		{
			name: "theme needs at least one accent",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Accents = []catalog.Accent{}
				return th.Validate()
			},
			expectedField: "accents",
			expectedCode:  "invalid_accents",
		},
		// 12. Accents unique ids
		{
			name: "accent ids must be unique",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Accents = append(th.Accents, catalog.Accent{
					ID:     "pumpkin",
					Name:   catalog.Localized{"en": "Pumpkin Duplicate"},
					Type:   "solid",
					Colors: []string{"#FF7A1A"},
				})
				return th.Validate()
			},
			expectedField: "accents[1].id",
			expectedCode:  "duplicate_id",
		},
		// 13. Solid accent exactly 1 colour
		{
			name: "solid accent must have 1 colour",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Accents[0].Colors = []string{"#FF7A1A", "#000000"}
				return th.Validate()
			},
			expectedField: "accents[0].colors",
			expectedCode:  "invalid_solid_accent",
		},
		// 14. Solid accent no angle
		{
			name: "solid accent must not have angle",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Accents[0].Angle = ptr(90)
				return th.Validate()
			},
			expectedField: "accents[0].angle",
			expectedCode:  "invalid_solid_accent",
		},
		// 15. Gradient accent 2-3 colours
		{
			name: "gradient accent requires 2-3 colours",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Accents[0].Type = "gradient"
				th.Accents[0].Colors = []string{"#FF7A1A"}
				return th.Validate()
			},
			expectedField: "accents[0].colors",
			expectedCode:  "invalid_gradient_accent",
		},
		// 16. Gradient accent angle 0-359
		{
			name: "gradient accent angle 0-359",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Accents[0].Type = "gradient"
				th.Accents[0].Colors = []string{"#FF7A1A", "#000000"}
				th.Accents[0].Angle = ptr(400)
				return th.Validate()
			},
			expectedField: "accents[0].angle",
			expectedCode:  "invalid_gradient_accent",
		},
		// 17. Variants unique ids
		{
			name: "variant ids must be unique",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Variants = []catalog.Variant{
					{ID: "night", Name: catalog.Localized{"en": "Night"}},
					{ID: "night", Name: catalog.Localized{"en": "Night 2"}},
				}
				return th.Validate()
			},
			expectedField: "variants[1].id",
			expectedCode:  "duplicate_id",
		},
		// 18. Variant accentId exists in theme accents
		{
			name: "variant accentId must exist in theme accents",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Variants = []catalog.Variant{
					{ID: "sunset", Name: catalog.Localized{"en": "Sunset"}, AccentID: ptr("missing-accent")},
				}
				return th.Validate()
			},
			expectedField: "variants[0].accentId",
			expectedCode:  "accent_not_found",
		},
		// 19. Theme style enum
		{
			name: "theme style enum classic|cozy|minimal|cute",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Style = "retro"
				return th.Validate()
			},
			expectedField: "style",
			expectedCode:  "invalid_enum",
		},
		// 20. PublishedAt ISO 8601 UTC with Z
		{
			name: "publishedAt must be UTC with Z",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.PublishedAt = "2026-06-17T14:00:00+02:00"
				return th.Validate()
			},
			expectedField: "publishedAt",
			expectedCode:  "invalid_time",
		},
		// 21. EventIcon in allowlist
		{
			name: "eventIcon in allowlist",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.EventIcon = ptr("rocket")
				return th.Validate()
			},
			expectedField: "eventIcon",
			expectedCode:  "invalid_event_icon",
		},
		// 22. Engine in engines list
		{
			name: "engine in engines list",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Scene.Engine = "unreal"
				return th.Validate()
			},
			expectedField: "scene.engine",
			expectedCode:  "invalid_engine",
		},
		// 23. Tokens allowed only in themes, not wallpapers
		{
			name: "tokens not allowed in wallpapers",
			validate: func() []catalog.FieldError {
				w := baseValidWallpaper()
				w.Scene = &catalog.Scene{
					Engine: "layers",
					Params: catalog.SceneParams{
						Layers: []catalog.Layer{
							{
								Type:   "shape",
								Shape:  ptr("circle"),
								X:      ptr(0.5),
								Y:      ptr(0.5),
								Width:  ptr(1.0),
								Color:  ptr("@accent"),
								Motion: ptr("none"),
							},
						},
					},
				}
				return w.Validate()
			},
			expectedField: "scene.params.layers[0].color",
			expectedCode:  "token_not_allowed",
		},
		// 24. Layer count 1-150
		{
			name: "layer particle count 1-150",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Scene = catalog.Scene{
					Engine: "layers",
					Params: catalog.SceneParams{
						Layers: []catalog.Layer{
							{
								Type:   "particles",
								Effect: ptr("snow"),
								Count:  ptr(200),
								Color:  ptr("#FFFFFF"),
							},
						},
					},
				}
				return th.Validate()
			},
			expectedField: "scene.params.layers[0].count",
			expectedCode:  "invalid_range",
		},
		// 25. Layer shape x -0.5 to 1.5
		{
			name: "layer shape x must be -0.5 to 1.5",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Scene = catalog.Scene{
					Engine: "layers",
					Params: catalog.SceneParams{
						Layers: []catalog.Layer{
							{
								Type:  "shape",
								Shape: ptr("circle"),
								X:     ptr(2.0),
								Y:     ptr(0.5),
								Width: ptr(1.0),
								Color: ptr("#FFFFFF"),
							},
						},
					},
				}
				return th.Validate()
			},
			expectedField: "scene.params.layers[0].x",
			expectedCode:  "invalid_range",
		},
		// 26. Layer shape width (0, 3]
		{
			name: "layer shape width must be > 0 and <= 3",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Scene = catalog.Scene{
					Engine: "layers",
					Params: catalog.SceneParams{
						Layers: []catalog.Layer{
							{
								Type:  "shape",
								Shape: ptr("circle"),
								X:     ptr(0.5),
								Y:     ptr(0.5),
								Width: ptr(0.0),
								Color: ptr("#FFFFFF"),
							},
						},
					},
				}
				return th.Validate()
			},
			expectedField: "scene.params.layers[0].width",
			expectedCode:  "invalid_range",
		},
		// 27. Layer shape polygon points >= 3
		{
			name: "polygon needs at least 3 points",
			validate: func() []catalog.FieldError {
				th := baseValidTheme()
				th.Scene = catalog.Scene{
					Engine: "layers",
					Params: catalog.SceneParams{
						Layers: []catalog.Layer{
							{
								Type:   "shape",
								Shape:  ptr("polygon"),
								X:      ptr(0.5),
								Y:      ptr(0.5),
								Width:  ptr(1.0),
								Color:  ptr("#FFFFFF"),
								Points: [][]float64{{0.5, 0.0}, {1.0, 1.0}},
							},
						},
					},
				}
				return th.Validate()
			},
			expectedField: "scene.params.layers[0].points",
			expectedCode:  "invalid_range",
		},
		// 28. Font license OFL-1.1|Apache-2.0
		{
			name: "font license must be OFL-1.1 or Apache-2.0",
			validate: func() []catalog.FieldError {
				fn := baseValidFont()
				fn.License = "GPL-3.0"
				return fn.Validate()
			},
			expectedField: "license",
			expectedCode:  "invalid_license",
		},
		// 29. Font files ttf/otf only
		{
			name: "font files must be ttf or otf",
			validate: func() []catalog.FieldError {
				fn := baseValidFont()
				fn.Files[0].Asset.Format = "woff2"
				return fn.Validate()
			},
			expectedField: "files[0].asset.format",
			expectedCode:  "invalid_font_format",
		},
		// 30. Font weight 100-900
		{
			name: "font weight must be 100-900",
			validate: func() []catalog.FieldError {
				fn := baseValidFont()
				fn.Files[0].Weight = ptr(50)
				return fn.Validate()
			},
			expectedField: "files[0].weight",
			expectedCode:  "invalid_range",
		},
		// 31. Font maxWeight >= weight
		{
			name: "font maxWeight must be at least weight",
			validate: func() []catalog.FieldError {
				fn := baseValidFont()
				fn.Files[0].Weight = ptr(400)
				fn.Files[0].MaxWeight = ptr(300)
				return fn.Validate()
			},
			expectedField: "files[0].maxWeight",
			expectedCode:  "invalid_range",
		},
		// 32. Icon pack painted requires painter
		{
			name: "painted icon pack requires painter",
			validate: func() []catalog.FieldError {
				p := baseValidIconPack()
				p.Painter = nil
				return p.Validate()
			},
			expectedField: "painter",
			expectedCode:  "required",
		},
		// 33. Icon pack images requires background
		{
			name: "images icon pack requires background",
			validate: func() []catalog.FieldError {
				p := baseValidIconPack()
				p.Kind = "images"
				p.Background = nil
				return p.Validate()
			},
			expectedField: "background",
			expectedCode:  "required",
		},
		// 34. Banner action url must be https
		{
			name: "banner action url must be https",
			validate: func() []catalog.FieldError {
				b := baseValidBanner()
				b.Action = catalog.BannerAction{
					Type: "url",
					URL:  ptr("http://insecure.com"),
				}
				return b.Validate()
			},
			expectedField: "action.url",
			expectedCode:  "invalid_url",
		},
		// 35. Banner endsAt must be after startsAt
		{
			name: "banner endsAt must be after startsAt",
			validate: func() []catalog.FieldError {
				b := baseValidBanner()
				b.StartsAt = ptr("2026-12-01T00:00:00Z")
				b.EndsAt = ptr("2026-11-01T00:00:00Z")
				return b.Validate()
			},
			expectedField: "endsAt",
			expectedCode:  "invalid_date_range",
		},
		// 36. Asset url matches assets/<sha256>.<format>
		{
			name: "asset url must match assets/<sha256>.<format>",
			validate: func() []catalog.FieldError {
				a := baseValidAsset()
				a.URL = "assets/other.png"
				return a.Validate()
			},
			expectedField: "url",
			expectedCode:  "invalid_asset_url",
		},
		// 37. Asset bytes <= 10 MB
		{
			name: "asset bytes must be <= 10 MB",
			validate: func() []catalog.FieldError {
				a := baseValidAsset()
				a.Bytes = 11 * 1024 * 1024
				return a.Validate()
			},
			expectedField: "bytes",
			expectedCode:  "invalid_range",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			errs := tc.validate()
			var found *catalog.FieldError
			for _, err := range errs {
				if err.Field == tc.expectedField && err.Code == tc.expectedCode {
					found = &err
					break
				}
			}
			if found == nil {
				t.Fatalf("expected error on Field %q with Code %q, but got errors: %v", tc.expectedField, tc.expectedCode, errs)
			}
		})
	}
}
