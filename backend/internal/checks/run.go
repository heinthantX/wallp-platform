// Package checks runs the pre-publish checks of dashboard doc §6 over the
// release candidate set (published items plus approved ones that are due).
package checks

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"maps"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/uptrace/bun"
	_ "golang.org/x/image/webp"

	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/generator"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

const (
	levelError   = "error"
	levelWarning = "warning"
	levelInfo    = "info"

	minTextContrast   = 4.5
	minAccentContrast = 3.0
	minTileSize       = 256
	minAppIconSize    = 192
)

var (
	shaRe    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	formatRe = regexp.MustCompile(`^[a-z0-9]{1,10}$`)
)

// Run checks the release candidate set as of now.
func Run(ctx context.Context, db bun.IDB, storageDir string) (Report, error) {
	return RunAt(ctx, db, storageDir, time.Now())
}

// RunAt is Run with an explicit clock, for tests.
func RunAt(ctx context.Context, db bun.IDB, storageDir string, now time.Time) (Report, error) {
	r := &runner{
		storageDir:  storageDir,
		now:         now,
		rep:         Report{Errors: []Issue{}, Warnings: []Issue{}, Infos: []Issue{}},
		fonts:       map[string]catalog.Font{},
		wallpapers:  map[string]catalog.Wallpaper{},
		bannerTitle: map[string]string{},
	}
	if err := r.load(ctx, db); err != nil {
		return Report{}, err
	}
	r.refs()
	for _, f := range r.festivals {
		r.festival(f)
	}
	for _, t := range r.themes {
		r.theme(t)
	}
	for _, w := range r.wallpapers {
		r.scene(items.WallpaperKind.Name, w.ID, "scene", w.Scene, w.MinAppVersion)
	}
	if err := r.assets(ctx, db); err != nil {
		return Report{}, err
	}
	r.size()
	return r.rep, nil
}

type runner struct {
	storageDir string
	now        time.Time
	rep        Report

	cat         catalog.Catalog
	festivals   []catalog.Festival
	themes      []catalog.ThemeDetail
	fonts       map[string]catalog.Font
	wallpapers  map[string]catalog.Wallpaper
	assetRefs   []assetRef
	bannerTitle map[string]string // banner id -> title colour, for banners with an image
}

func (r *runner) add(level, code, kind, id, field, format string, args ...any) {
	is := Issue{Code: code, Level: level, Message: fmt.Sprintf(format, args...), ItemType: kind, ItemID: id, Field: field}
	switch level {
	case levelError:
		r.rep.Errors = append(r.rep.Errors, is)
	case levelWarning:
		r.rep.Warnings = append(r.rep.Warnings, is)
	default:
		r.rep.Infos = append(r.rep.Infos, is)
	}
}

type cand struct {
	kind *items.Kind
	id   string
	data []byte
}

// candidates mirrors what releases.Publish ships, so nothing goes out unchecked:
// approved rows and scheduled rows whose time has come use their current data, every
// unarchived festival ships, and any other unarchived row with published data keeps it.
// Times are compared at millisecond precision, as SQLite and Postgres round differently.
func candidates(k *items.Kind, rows []model.Item, now time.Time) []cand {
	var out []cand
	for _, it := range rows {
		if it.Status == model.StatusArchived {
			continue
		}
		due := it.Status == model.StatusScheduled && it.ScheduledAt != nil &&
			!it.ScheduledAt.Truncate(time.Millisecond).After(now.Truncate(time.Millisecond))
		var data []byte
		switch {
		case it.Status == model.StatusApproved || due || k == items.FestivalKind:
			data = []byte(it.Data)
		case len(it.PublishedData) > 0:
			data = it.PublishedData
		default:
			continue
		}
		out = append(out, cand{kind: k, id: it.ID, data: data})
	}
	return out
}

func (r *runner) load(ctx context.Context, db bun.IDB) error {
	var all []cand
	var fest []model.Festival
	var th []model.Theme
	var wp []model.Wallpaper
	var fo []model.Font
	var ip []model.IconPack
	var ba []model.Banner
	for _, q := range []struct {
		dst  any
		kind *items.Kind
		item func() []model.Item
	}{
		{&fest, items.FestivalKind, func() []model.Item { return pick(fest, func(x model.Festival) model.Item { return x.Item }) }},
		{&th, items.ThemeKind, func() []model.Item { return pick(th, func(x model.Theme) model.Item { return x.Item }) }},
		{&wp, items.WallpaperKind, func() []model.Item { return pick(wp, func(x model.Wallpaper) model.Item { return x.Item }) }},
		{&fo, items.FontKind, func() []model.Item { return pick(fo, func(x model.Font) model.Item { return x.Item }) }},
		{&ip, items.IconPackKind, func() []model.Item { return pick(ip, func(x model.IconPack) model.Item { return x.Item }) }},
		{&ba, items.BannerKind, func() []model.Item { return pick(ba, func(x model.Banner) model.Item { return x.Item }) }},
	} {
		if err := db.NewSelect().Model(q.dst).Where("status <> ?", model.StatusArchived).Order("id").Scan(ctx); err != nil {
			return fmt.Errorf("checks: load %s: %w", q.kind.Plural, err)
		}
		all = append(all, candidates(q.kind, q.item(), r.now)...)
	}

	var ss model.StoreSettings
	if err := db.NewSelect().Model(&ss).Where("id = ?", 1).Scan(ctx); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("checks: load store settings: %w", err)
	}
	_ = json.Unmarshal(ss.AccentPresets, &r.cat.AccentPresets)
	_ = json.Unmarshal(ss.SearchSuggestions, &r.cat.SearchSuggestions)

	for _, c := range all {
		r.item(c)
	}
	r.cat.CatalogVersion = "check"
	sort.SliceStable(r.cat.Festivals, func(i, j int) bool { return r.cat.Festivals[i].Sort < r.cat.Festivals[j].Sort })
	return nil
}

func pick[T any](rows []T, f func(T) model.Item) []model.Item {
	out := make([]model.Item, len(rows))
	for i, x := range rows {
		out[i] = f(x)
	}
	return out
}

// classify maps a schema FieldError to a check code.
func classify(kind string, fe catalog.FieldError) string {
	switch fe.Code {
	case "invalid_engine":
		return "engine_unknown"
	case "invalid_event_icon":
		return "event_icon_unknown"
	case "invalid_license":
		return "font_license"
	case "token_not_allowed":
		return "scene_tokens"
	case "accent_not_found":
		return "variant_accent_missing"
	case "duplicate_id":
		return "duplicate_id"
	case "invalid_date_range":
		return "banner_time_order"
	case "invalid_enum":
		return "value_out_of_list"
	case "invalid_range":
		if strings.Contains(fe.Field, "params.layers[") {
			return "scene_limits"
		}
	case "invalid_package":
		return "icon_app_bad_package"
	case "required":
		if kind == items.IconPackKind.Name && fe.Field == "background" {
			return "icon_pack_no_background"
		}
	}
	return "schema_invalid"
}

// item validates one candidate and files it into the in-memory catalog.
func (r *runner) item(c cand) {
	kind := c.kind.Name
	var doc struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(c.data, &doc)
	if doc.ID != c.id {
		r.add(levelError, "id_changed", kind, c.id, "id", "Id is %q but the item was published as %q; ids are permanent", doc.ID, c.id)
	}
	for _, fe := range c.kind.Validate(c.data) {
		r.add(levelError, classify(kind, fe), kind, c.id, fe.Field, "%s", fe.Message)
	}

	var err error
	switch c.kind {
	case items.FestivalKind:
		var v catalog.Festival
		if err = json.Unmarshal(c.data, &v); err == nil {
			r.festivals = append(r.festivals, v)
			r.cat.Festivals = append(r.cat.Festivals, v)
		}
	case items.ThemeKind:
		var v catalog.ThemeDetail
		if err = json.Unmarshal(c.data, &v); err == nil {
			r.themes = append(r.themes, v)
			r.cat.Themes = append(r.cat.Themes, v.Summary())
		}
	case items.WallpaperKind:
		var v catalog.Wallpaper
		if err = json.Unmarshal(c.data, &v); err == nil {
			r.wallpapers[v.ID] = v
			r.cat.Wallpapers = append(r.cat.Wallpapers, v)
			if v.Image != nil {
				for i, s := range v.Image.Sizes {
					r.assetRefs = append(r.assetRefs, assetRef{kind, v.ID, fmt.Sprintf("image.sizes[%d].asset", i), s.Asset})
				}
			}
		}
	case items.FontKind:
		var v catalog.Font
		if err = json.Unmarshal(c.data, &v); err == nil {
			r.fonts[v.ID] = v
			r.cat.Fonts = append(r.cat.Fonts, v)
			for i, f := range v.Files {
				r.assetRefs = append(r.assetRefs, assetRef{kind, v.ID, fmt.Sprintf("files[%d].asset", i), f.Asset})
			}
		}
	case items.IconPackKind:
		var v catalog.IconPack
		if err = json.Unmarshal(c.data, &v); err == nil {
			r.cat.IconPacks = append(r.cat.IconPacks, v)
			if v.Background != nil {
				r.assetRefs = append(r.assetRefs, assetRef{kind, v.ID, "background", *v.Background})
			}
			owner := map[string]string{} // sha256 -> first package using it
			for _, pkg := range slices.Sorted(maps.Keys(v.Apps)) {
				a := v.Apps[pkg]
				r.assetRefs = append(r.assetRefs, assetRef{kind, v.ID, "apps." + pkg, a})
				if first, dup := owner[a.SHA256]; dup {
					r.add(levelWarning, "icon_app_duplicate", kind, v.ID, "apps."+pkg, "%s uses the same image as %s", pkg, first)
				} else {
					owner[a.SHA256] = pkg
				}
			}
		}
	case items.BannerKind:
		var v catalog.Banner
		if err = json.Unmarshal(c.data, &v); err == nil {
			r.cat.Banners = append(r.cat.Banners, v)
			if v.Look.Image != nil {
				r.assetRefs = append(r.assetRefs, assetRef{kind, v.ID, "look.image", *v.Look.Image})
				r.bannerTitle[v.ID] = v.Look.TitleColor
			}
		}
	}
	if err != nil {
		r.add(levelError, "schema_invalid", kind, c.id, "", "Cannot read %s %q: %v", kind, c.id, err)
	}
}

var collIndexRe = regexp.MustCompile(`^(\w+)\[(\d+)\]`)

// refs runs Catalog.Validate and files each finding under the item it names.
func (r *runner) refs() {
	for _, fe := range r.cat.Validate() {
		kind, id := "", ""
		if m := collIndexRe.FindStringSubmatch(fe.Field); m != nil {
			i, _ := strconv.Atoi(m[2])
			switch m[1] {
			case "festivals":
				kind, id = items.FestivalKind.Name, r.cat.Festivals[i].ID
			case "themes":
				kind, id = items.ThemeKind.Name, r.cat.Themes[i].ID
			case "wallpapers":
				kind, id = items.WallpaperKind.Name, r.cat.Wallpapers[i].ID
			case "fonts":
				kind, id = items.FontKind.Name, r.cat.Fonts[i].ID
			case "iconPacks":
				kind, id = items.IconPackKind.Name, r.cat.IconPacks[i].ID
			case "banners":
				kind, id = items.BannerKind.Name, r.cat.Banners[i].ID
			}
		}
		code := fe.Code
		if code == "ref_missing" && strings.HasSuffix(fe.Field, "action.id") {
			code = "banner_target_missing"
		}
		r.add(levelError, code, kind, id, fe.Field, "%s", fe.Message)
	}
}

// --- colour helpers ---

func ratio(a, b string) (float64, bool) {
	v, err := generator.ContrastRatio(a, b)
	return v, err == nil
}

// fmtRatio floors to one decimal so "4.46" is never shown as "4.5:1, needs 4.5:1".
func fmtRatio(v float64) string { return fmt.Sprintf("%.1f", math.Floor(v*10)/10) }

func hasMyanmar(l catalog.Localized) bool {
	for _, s := range l {
		for _, c := range s {
			if (c >= 0x1000 && c <= 0x109F) || (c >= 0xA9E0 && c <= 0xA9FF) || (c >= 0xAA60 && c <= 0xAA7F) {
				return true
			}
		}
	}
	return false
}

func (r *runner) fontCoversMyanmar(id string) bool {
	f, ok := r.fonts[id]
	if !ok {
		return true // a missing font is reported as ref_missing
	}
	return slices.Contains(f.Scripts, "myanmar") || f.FallbackFor["my"] != ""
}

func en(l catalog.Localized, fallback string) string {
	if s := l["en"]; s != "" {
		return s
	}
	return fallback
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func verLess(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x < y
		}
	}
	return false
}

// --- per-kind checks ---

func (r *runner) scene(kind, id, field string, s *catalog.Scene, minApp *string) {
	if s == nil {
		return
	}
	for _, e := range catalog.EmbeddedEngines.Engines {
		if e.ID == s.Engine && minApp != nil && verLess(*minApp, e.SinceApp) {
			r.add(levelError, "min_app_version_low", kind, id, strings.TrimPrefix(field+".", ".")+"minAppVersion",
				"Engine %s needs app %s but minAppVersion is %s", e.ID, e.SinceApp, *minApp)
		}
	}
	for i, l := range s.Params.Layers {
		if l.Image != nil {
			r.assetRefs = append(r.assetRefs, assetRef{kind, id, fmt.Sprintf("%s.params.layers[%d].image", field, i), *l.Image})
		}
	}
}

func (r *runner) festival(f catalog.Festival) {
	k := items.FestivalKind.Name
	if c, ok := ratio(f.Look.Muted, f.Look.Background); ok && c < minTextContrast {
		r.add(levelError, "festival_look_contrast", k, f.ID, "look.muted", "Muted text on %s background is %s:1, needs %.1f:1", en(f.Name, f.ID), fmtRatio(c), minTextContrast)
	}
	if c, ok := ratio(f.Look.Brand, f.Look.Background); ok && c < minAccentContrast {
		r.add(levelError, "festival_look_contrast", k, f.ID, "look.brand", "Brand colour on %s background is %s:1, needs %.1f:1", en(f.Name, f.ID), fmtRatio(c), minAccentContrast)
	}
	// Button labels: light text on a dark brand, dark text on a light one (Flutter's brightness rule).
	if lum, err := generator.LuminanceFromHex(f.Look.Brand); err == nil {
		label, which := "#FFFFFF", "light"
		if (lum+0.05)*(lum+0.05) > 0.15 {
			label, which = "#000000", "dark"
		}
		if c, _ := ratio(f.Look.Brand, label); c < minTextContrast {
			r.add(levelError, "festival_look_contrast", k, f.ID, "look.brand", "Button labels (%s text) on %s brand colour are %s:1, need %.1f:1", which, en(f.Name, f.ID), fmtRatio(c), minTextContrast)
		}
	}
	if hasMyanmar(f.Name) && !r.fontCoversMyanmar(f.Look.DisplayFont) {
		r.add(levelError, "myanmar_glyphs_missing", k, f.ID, "look.displayFont", "Font %q has no Myanmar letters and no Myanmar fallback, but the name of %s uses them", f.Look.DisplayFont, en(f.Name, f.ID))
	}
	if f.FallbackDate == nil {
		future := 0
		for _, o := range f.Occurrences {
			if d, err := time.Parse("2006-01-02", o); err == nil && !d.Before(r.now.UTC().Truncate(24*time.Hour)) {
				future++
			}
		}
		if future < 2 {
			r.add(levelWarning, "festival_few_dates", k, f.ID, "occurrences", "%s has %d future dates, add at least 2", en(f.Name, f.ID), future)
		}
	}
}

type look struct {
	name, prefix string
	pal          catalog.Palette
	accent       catalog.Accent
}

func (r *runner) theme(t catalog.ThemeDetail) {
	k := items.ThemeKind.Name
	name := en(t.Name, t.ID)
	r.scene(k, t.ID, "scene", &t.Scene, t.MinAppVersion)
	if t.PreviewImage != nil {
		r.assetRefs = append(r.assetRefs, assetRef{k, t.ID, "previewImage", *t.PreviewImage})
	} else {
		r.add(levelWarning, "theme_no_preview", k, t.ID, "previewImage", "%s has no preview image", name)
	}

	accentByID := map[string]catalog.Accent{}
	var first catalog.Accent
	for i, a := range t.Accents {
		accentByID[a.ID] = a
		if i == 0 {
			first = a
		}
	}
	looks := []look{{name: name, pal: t.Palette, accent: first}}
	for i, v := range t.Variants {
		p := t.Palette
		if o := v.Palette; o != nil {
			set := func(dst *string, src *string) {
				if src != nil && *src != "" {
					*dst = *src
				}
			}
			set(&p.Background, o.Background)
			set(&p.Deep, o.Deep)
			set(&p.Surface, o.Surface)
			set(&p.Text, o.Text)
			set(&p.TextMuted, o.TextMuted)
		}
		a := first
		if v.AccentID != nil {
			if x, ok := accentByID[*v.AccentID]; ok {
				a = x
			}
		}
		looks = append(looks, look{name: en(v.Name, v.ID), prefix: fmt.Sprintf("variants[%d].", i), pal: p, accent: a})
	}

	labelColour := "#FFFFFF"
	if t.Labels != nil && t.Labels.Color != nil && *t.Labels.Color != "" {
		labelColour = *t.Labels.Color
	}
	for _, l := range looks {
		if c, ok := ratio(l.pal.Text, l.pal.Background); ok && c < minTextContrast {
			r.add(levelError, "contrast_too_low", k, t.ID, l.prefix+"palette.text", "Clock and text colour on %s background is %s:1, needs %.1f:1", l.name, fmtRatio(c), minTextContrast)
		}
		if c, ok := ratio(l.pal.TextMuted, l.pal.Background); ok && c < minTextContrast {
			r.add(levelWarning, "text_muted_low", k, t.ID, l.prefix+"palette.textMuted", "Muted text on %s background is %s:1, needs %.1f:1", l.name, fmtRatio(c), minTextContrast)
		}
		if c, ok := ratio(labelColour, l.pal.Background); ok && c < minTextContrast {
			r.add(levelWarning, "labels_contrast", k, t.ID, "labels.color", "App name colour on %s background is %s:1, needs %.1f:1", l.name, fmtRatio(c), minTextContrast)
		}
	}
	for _, id := range t.WallpaperIDs {
		if w, ok := r.wallpapers[id]; ok && w.Image != nil {
			if c, ok := ratio(labelColour, w.Image.Dominant); ok && c < minTextContrast {
				r.add(levelWarning, "labels_contrast", k, t.ID, "labels.color", "App name colour on wallpaper %s is %s:1, needs %.1f:1", en(w.Name, w.ID), fmtRatio(c), minTextContrast)
			}
		}
	}
	for i, a := range t.Accents {
		for j, stop := range a.Colors {
			worst, worstName := math.Inf(1), ""
			for _, l := range looks {
				if c, ok := ratio(stop, l.pal.Background); ok && c < worst {
					worst, worstName = c, l.name
				}
			}
			if worst < minAccentContrast {
				r.add(levelError, "accent_contrast_low", k, t.ID, fmt.Sprintf("accents[%d].colors[%d]", i, j), "Accent %s colour %d on %s background is %s:1, needs %.1f:1", en(a.Name, a.ID), j+1, worstName, fmtRatio(worst), minAccentContrast)
			}
		}
	}

	// Fonts.
	for _, f := range []struct{ field, id string }{{"fonts.display", t.Fonts.Display}, {"fonts.body", t.Fonts.Body}, {"fonts.labels", t.Fonts.Labels}} {
		if _, ok := r.fonts[f.id]; !ok {
			r.add(levelError, "ref_missing", k, t.ID, f.field, "font %q does not exist in the catalog", f.id)
		}
	}
	if hasMyanmar(t.Name) || hasMyanmar(t.Subtitle) {
		if !r.fontCoversMyanmar(t.Fonts.Display) {
			r.add(levelError, "myanmar_glyphs_missing", k, t.ID, "fonts.display", "Display font %q has no Myanmar letters and no Myanmar fallback, but the name or subtitle of %s uses them", t.Fonts.Display, name)
		}
	}
	if !r.fontCoversMyanmar(t.Fonts.Labels) {
		r.add(levelError, "myanmar_glyphs_missing", k, t.ID, "fonts.labels", "App name font %q has no Myanmar letters and no Myanmar fallback", t.Fonts.Labels)
	}
	for _, f := range []struct{ field, id string }{{"fonts.display", t.Fonts.Display}, {"fonts.labels", t.Fonts.Labels}} {
		if x, ok := r.fonts[f.id]; ok && x.Listed != nil && !*x.Listed {
			r.add(levelInfo, "font_unlisted", k, t.ID, f.field, "Font %q is not listed in the Fonts screen; %s still draws with it", f.id, name)
		}
	}
	for i, id := range t.WallpaperIDs {
		if _, ok := r.wallpapers[id]; !ok {
			r.add(levelError, "ref_missing", k, t.ID, fmt.Sprintf("wallpaperIds[%d]", i), "wallpaper %q does not exist in the catalog", id)
		}
	}
}

// --- assets ---

type assetRef struct {
	kind, id, field string
	a               catalog.Asset
}

func (r *runner) assets(ctx context.Context, db bun.IDB) error {
	var shas []string
	for _, ref := range r.assetRefs {
		if shaRe.MatchString(ref.a.SHA256) {
			shas = append(shas, ref.a.SHA256)
		}
	}
	rows := map[string]model.Asset{}
	if len(shas) > 0 {
		var list []model.Asset
		if err := db.NewSelect().Model(&list).Where("sha256 IN (?)", bun.In(shas)).Scan(ctx); err != nil {
			return fmt.Errorf("checks: load assets: %w", err)
		}
		for _, a := range list {
			rows[a.SHA256] = a
		}
	}
	verified := map[string]string{} // path -> actual sha256 ("" = unreadable)
	dims := map[string][2]int{}     // path -> decoded width, height
	for _, ref := range r.assetRefs {
		a := ref.a
		if !shaRe.MatchString(a.SHA256) || !formatRe.MatchString(a.Format) {
			continue // schema_invalid already covers a malformed reference
		}
		row, inDB := rows[a.SHA256]
		path := filepath.Join(r.storageDir, "assets", a.SHA256+"."+a.Format)
		got, seen := verified[path]
		var size int
		if !seen {
			if b, err := os.ReadFile(path); err == nil {
				sum := sha256.Sum256(b)
				got = hex.EncodeToString(sum[:])
				size = len(b)
				if cfg, _, err := image.DecodeConfig(bytes.NewReader(b)); err == nil {
					dims[path] = [2]int{cfg.Width, cfg.Height}
				}
			}
			verified[path] = got
		}
		if got == "" || !inDB {
			r.add(levelError, "asset_missing", ref.kind, ref.id, ref.field, "Asset %s.%s is not in storage", a.SHA256[:12], a.Format)
			continue
		}
		if got != a.SHA256 {
			r.add(levelError, "asset_sha_mismatch", ref.kind, ref.id, ref.field, "Asset file %s.%s hashes to %s", a.SHA256[:12], a.Format, got[:12])
			continue
		}
		if size == 0 {
			if st, err := os.Stat(path); err == nil {
				size = int(st.Size())
			}
		}
		switch {
		case size > 10<<20:
			r.add(levelError, "asset_over_10mb", ref.kind, ref.id, ref.field, "Asset is %.1f MB; the app rejects files over 10 MB", float64(size)/(1<<20))
		case size > 1<<20:
			r.add(levelWarning, "asset_over_1mb", ref.kind, ref.id, ref.field, "Asset is %.1f MB; over 1 MB slows downloads", float64(size)/(1<<20))
		}
		if ref.kind == items.IconPackKind.Name && strings.HasPrefix(ref.field, "apps.") {
			w, h := row.Width, row.Height
			if d, ok := dims[path]; ok {
				w, h = d[0], d[1]
			}
			switch {
			case math.Abs(float64(w-h)) > 0.01*float64(max(w, h)):
				r.add(levelError, "icon_app_not_square", ref.kind, ref.id, ref.field, "App icon is %d x %d px; it must be square", w, h)
			case w < minAppIconSize:
				r.add(levelError, "icon_app_too_small", ref.kind, ref.id, ref.field, "App icon is %d px; it must be at least %d px", w, minAppIconSize)
			}
		}
		if ref.kind == items.BannerKind.Name && ref.field == "look.image" {
			// ponytail: the image's dominant colour stands in for the area under the title.
			if c, ok := ratio(r.bannerTitle[ref.id], row.Dominant); ok && c < minAccentContrast {
				r.add(levelWarning, "banner_image_contrast", ref.kind, ref.id, ref.field, "The title on this image is %s:1, needs %.1f:1", fmtRatio(c), minAccentContrast)
			}
		}
		if ref.kind == items.IconPackKind.Name && ref.field == "background" {
			w, h := row.Width, row.Height
			if d, ok := dims[path]; ok {
				w, h = d[0], d[1] // imports do not fill the row's size columns
			}
			if w != h || w < minTileSize {
				r.add(levelError, "icon_tile_size", ref.kind, ref.id, ref.field, "Background tile is %d x %d px; it must be square and at least %d px", w, h, minTileSize)
			}
			// ponytail: the tile's dominant colour stands in for its middle; sample the centre pixels if that proves too coarse.
			if c, ok := ratio("#FFFFFF", row.Dominant); ok && c < minAccentContrast {
				r.add(levelWarning, "icon_logo_contrast", ref.kind, ref.id, ref.field, "A white logo on this tile is %s:1, needs %.1f:1", fmtRatio(c), minAccentContrast)
			}
		}
	}
	return nil
}

func (r *runner) size() {
	b, err := json.Marshal(r.cat)
	if err != nil {
		return
	}
	switch n := len(b); {
	case n > 2<<20:
		r.add(levelError, "catalog_over_2mb", "", "", "", "Catalog is %.2f MB; over 2 MB cannot be published", float64(n)/(1<<20))
	case n > 1<<20:
		r.add(levelWarning, "catalog_over_1mb", "", "", "", "Catalog is %.2f MB; over 1 MB slows the app's refresh", float64(n)/(1<<20))
	}
}
