package catalog

// Summary returns a ThemeSummary constructed from a ThemeDetail per theme-api §4.4.
// The summary includes the full theme minus accents, variants, fonts, clock, labels,
// eventIcon, and wallpaperIds, plus accent (first accent), displayFont (fonts.display),
// and variantSwatches ([palette.background] + each variant's background override when variants >= 2).
func (t ThemeDetail) Summary() ThemeSummary {
	var accent Accent
	if len(t.Accents) > 0 {
		accent = t.Accents[0]
	}

	var variantSwatches []string
	if len(t.Variants) >= 2 {
		variantSwatches = make([]string, 0, len(t.Variants))
		for _, v := range t.Variants {
			bg := t.Palette.Background
			if v.Palette != nil && v.Palette.Background != nil && *v.Palette.Background != "" {
				bg = *v.Palette.Background
			}
			variantSwatches = append(variantSwatches, bg)
		}
	}

	isLive := IsLive(t.Scene)
	if t.IsLive != nil {
		isLive = *t.IsLive
	}

	return ThemeSummary{
		ID:              t.ID,
		Rev:             t.Rev,
		FestivalID:      t.FestivalID,
		CategoryIDs:     t.CategoryIDs,
		Name:            t.Name,
		Subtitle:        t.Subtitle,
		Style:           t.Style,
		Tags:            t.Tags,
		IsLive:          &isLive,
		PublishedAt:     t.PublishedAt,
		Popularity:      t.Popularity,
		MinAppVersion:   t.MinAppVersion,
		Scene:           t.Scene,
		Palette:         t.Palette,
		Accent:          accent,
		DisplayFont:     t.Fonts.Display,
		VariantSwatches: variantSwatches,
		IconPackID:      t.IconPackID,
		DownloadBytes:   t.DownloadBytes,
		PreviewImage:    t.PreviewImage,
	}
}

// Summary constructs a ThemeSummary from a ThemeDetail.
func Summary(t ThemeDetail) ThemeSummary {
	return t.Summary()
}
