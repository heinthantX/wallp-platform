package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

const (
	fontFileMaxBytes  = 10 * 1024 * 1024     // 10 MB
	metadataMaxBytes  = 32 * 1024 * 1024     // 32 MB
	fontFileReadLimit = fontFileMaxBytes + 1 // +1 to detect overflow
)

// permanentAllowHosts are always allowed regardless of config.
var permanentAllowHosts = []string{
	"fonts.gstatic.com",
	"fonts.google.com",
}

// googleFontAllowedURL returns an error if the URL should be blocked.
// configHost is the host extracted from the configured metadata/download URL (for httptest).
func googleFontAllowedURL(rawURL, configHost string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return apierr.New(http.StatusBadGateway, "disallowed_host", "invalid URL: "+rawURL)
	}
	host := u.Hostname()

	// Determine whether this host is the configured test host.
	isConfigHost := configHost != "" && host == configHost

	// Enforce https unless it's the configured (httptest) host.
	if u.Scheme != "https" && !isConfigHost {
		return apierr.New(http.StatusBadGateway, "disallowed_host",
			"font downloads must use HTTPS: "+rawURL)
	}

	// Always allow permanent allowlist.
	for _, allowed := range permanentAllowHosts {
		if host == allowed {
			return nil
		}
	}

	// Allow the configured test host.
	if isConfigHost {
		return nil
	}

	return apierr.New(http.StatusBadGateway, "disallowed_host",
		"host not in allowlist: "+host)
}

// googleHTTPClient re-checks the allowlist on every redirect hop (max 3).
func googleHTTPClient(configHost string) *http.Client {
	return &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 {
			return errors.New("too many redirects")
		}
		return googleFontAllowedURL(req.URL.String(), configHost)
	}}
}

// googleConfigHost is the configured (httptest) host exempt from the https
// and allowlist checks; never in production.
func (d *Deps) googleConfigHost() string {
	if d.Cfg.IsProd() {
		return ""
	}
	if h := extractHost(d.Cfg.GoogleFontsMetadataURL); h != "" {
		return h
	}
	return extractHost(d.Cfg.GoogleFontsDownloadURL)
}

// extractHost returns the hostname from a URL string, or "" on parse error.
func extractHost(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

type GoogleFontMetadataEntry struct {
	Family      string            `json:"family"`
	DisplayName string            `json:"displayName,omitempty"`
	Category    string            `json:"category"`
	Subsets     []string          `json:"subsets"`
	Variants    []string          `json:"variants"`
	Fonts       map[string]any    `json:"fonts,omitempty"`
	Files       map[string]string `json:"files,omitempty"`
	License     string            `json:"license,omitempty"`
}

type GoogleFontsMetadataResponse struct {
	FamilyMetadataList []GoogleFontMetadataEntry `json:"familyMetadataList"`
}

type GoogleFontSearchItem struct {
	Family   string   `json:"family"`
	Category string   `json:"category"`
	Subsets  []string `json:"subsets"`
	Variants []string `json:"variants"`
}

type SearchGoogleFontsInput struct {
	Q string `query:"q"`
}

type SearchGoogleFontsOutput struct {
	Body []GoogleFontSearchItem
}

type ImportGoogleFontInput struct {
	Body struct {
		Family   string   `json:"family"`
		Variants []string `json:"variants,omitempty" maxItems:"20"`
	}
}

type googleCache struct {
	mu        sync.RWMutex
	items     []GoogleFontMetadataEntry
	fetchedAt time.Time
}

var gCache googleCache

func fetchGoogleFontsMetadata(ctx context.Context, metaURL, configHost string) ([]GoogleFontMetadataEntry, error) {
	if metaURL == "" {
		metaURL = "https://fonts.google.com/metadata/fonts"
	}

	gCache.mu.RLock()
	if time.Since(gCache.fetchedAt) < 24*time.Hour && len(gCache.items) > 0 {
		res := gCache.items
		gCache.mu.RUnlock()
		return res, nil
	}
	gCache.mu.RUnlock()

	gCache.mu.Lock()
	defer gCache.mu.Unlock()
	if time.Since(gCache.fetchedAt) < 24*time.Hour && len(gCache.items) > 0 {
		return gCache.items, nil
	}

	if err := googleFontAllowedURL(metaURL, configHost); err != nil {
		return nil, err
	}
	client := googleHTTPClient(configHost)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, metaURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, apierr.New(http.StatusBadGateway, "google_fonts_error", "Google Fonts is unavailable right now")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, apierr.New(http.StatusBadGateway, "google_fonts_error", fmt.Sprintf("Google Fonts metadata returned status %d", resp.StatusCode))
	}

	// Limit metadata body to 32 MB.
	limited := io.LimitReader(resp.Body, metadataMaxBytes)
	bodyBytes, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}

	var respObj GoogleFontsMetadataResponse
	if err := json.Unmarshal(bodyBytes, &respObj); err == nil && len(respObj.FamilyMetadataList) > 0 {
		gCache.items = respObj.FamilyMetadataList
		gCache.fetchedAt = time.Now()
		return gCache.items, nil
	}

	var directList []GoogleFontMetadataEntry
	if err := json.Unmarshal(bodyBytes, &directList); err == nil {
		gCache.items = directList
		gCache.fetchedAt = time.Now()
		return gCache.items, nil
	}

	return nil, apierr.New(http.StatusBadGateway, "google_fonts_error", "Failed to parse Google Fonts metadata JSON")
}

func mapGoogleCategory(cat string, subsets []string) string {
	for _, s := range subsets {
		if strings.EqualFold(s, "myanmar") {
			return "myanmar"
		}
	}
	switch strings.ToUpper(cat) {
	case "DISPLAY":
		return "display"
	case "HANDWRITING":
		return "handwritten"
	default:
		return "clean"
	}
}

func mapGoogleSubsetsToScripts(subsets []string) []string {
	var scripts []string
	hasLatin := false
	hasMyanmar := false
	for _, s := range subsets {
		sLower := strings.ToLower(s)
		if strings.HasPrefix(sLower, "latin") && !hasLatin {
			scripts = append(scripts, "latin")
			hasLatin = true
		}
		if sLower == "myanmar" && !hasMyanmar {
			scripts = append(scripts, "myanmar")
			hasMyanmar = true
		}
	}
	if len(scripts) == 0 {
		scripts = []string{"latin"}
	}
	return scripts
}

func mapGoogleLicense(lic string) string {
	l := strings.ToLower(strings.TrimSpace(lic))
	switch {
	case l == "" || strings.Contains(l, "ofl") || strings.Contains(l, "open font"):
		return "OFL-1.1" // Google Fonts default when metadata omits license
	case strings.Contains(l, "apache"):
		return "Apache-2.0"
	default:
		return lic
	}
}

func toKebabCase(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash && b.Len() > 0 {
			b.WriteRune('-')
			lastDash = true
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

func parseFontWeight(v string) int {
	vLower := strings.ToLower(v)
	var digits strings.Builder
	for _, r := range vLower {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	if digits.Len() > 0 {
		if w, err := strconv.Atoi(digits.String()); err == nil && w >= 100 && w <= 900 {
			return w
		}
	}
	switch {
	case strings.Contains(vLower, "thin"):
		return 100
	case strings.Contains(vLower, "extra-light") || strings.Contains(vLower, "extralight"):
		return 200
	case strings.Contains(vLower, "light"):
		return 300
	case strings.Contains(vLower, "medium"):
		return 500
	case strings.Contains(vLower, "semi-bold") || strings.Contains(vLower, "semibold"):
		return 600
	case strings.Contains(vLower, "extra-bold") || strings.Contains(vLower, "extrabold"):
		return 800
	case strings.Contains(vLower, "black"):
		return 900
	case strings.Contains(vLower, "bold"):
		return 700
	default:
		return 400
	}
}

// downloadFontFile downloads a font file, enforcing:
// - URL allowlist (permanentAllowHosts + configHost)
// - https-only (unless configHost)
// - 10 MB body limit (+1 byte to detect overflow → 422 font_too_large)
// - 10 s timeout
func downloadFontFile(ctx context.Context, downloadBaseURL, family, variant string, entry GoogleFontMetadataEntry, configHost string) ([]byte, string, error) {
	client := googleHTTPClient(configHost)

	// 1. Check entry.Files map for direct file URL
	if len(entry.Files) > 0 {
		if fileURL, ok := entry.Files[variant]; ok && fileURL != "" {
			if err := googleFontAllowedURL(fileURL, configHost); err != nil {
				return nil, "", err
			}
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
			if err == nil {
				resp, err := client.Do(req)
				if err == nil && resp.StatusCode == http.StatusOK {
					defer resp.Body.Close()
					limited := io.LimitReader(resp.Body, fontFileReadLimit)
					data, err := io.ReadAll(limited)
					if err == nil && len(data) > 0 {
						if len(data) > fontFileMaxBytes {
							return nil, "", apierr.New(http.StatusUnprocessableEntity, "font_too_large", "Font file exceeds 10 MB limit")
						}
						ext := "ttf"
						if strings.HasSuffix(fileURL, ".otf") {
							ext = "otf"
						}
						return data, ext, nil
					}
				}
			}
		}
	}

	// 2. Try downloadBaseURL?family=... manifest or direct download
	if downloadBaseURL == "" {
		downloadBaseURL = "https://fonts.google.com/download/list"
	}
	if err := googleFontAllowedURL(downloadBaseURL, configHost); err != nil {
		return nil, "", err
	}
	reqURL := downloadBaseURL + "?family=" + url.QueryEscape(family)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", apierr.New(http.StatusBadGateway, "download_failed", "Google Fonts is unavailable right now")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", apierr.New(http.StatusBadGateway, "download_failed", fmt.Sprintf("Download service returned status %d", resp.StatusCode))
	}

	limited := io.LimitReader(resp.Body, fontFileReadLimit)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", err
	}
	if len(data) > fontFileMaxBytes {
		return nil, "", apierr.New(http.StatusUnprocessableEntity, "font_too_large", "Font file exceeds 10 MB limit")
	}

	// Check if the response is direct font binary
	if len(data) >= 4 && (bytes.Equal(data[:4], []byte{0x00, 0x01, 0x00, 0x00}) || string(data[:4]) == "true" || string(data[:4]) == "OTTO") {
		ext := "ttf"
		if string(data[:4]) == "OTTO" {
			ext = "otf"
		}
		return data, ext, nil
	}

	// Manifest JSON format. fonts.google.com prefixes it with an anti-XSSI `)]}'` line, keeps licence
	// text inline in manifest.files and puts the font URLs in manifest.fileRefs.
	data = bytes.TrimPrefix(bytes.TrimLeft(data, " \r\n"), []byte(")]}'"))
	type manifestFile struct {
		Filename string `json:"filename"`
		URL      string `json:"url"`
		Variant  string `json:"variant"`
	}
	var manifestObj struct {
		Manifest struct {
			Files    []manifestFile `json:"files"`
			FileRefs []manifestFile `json:"fileRefs"`
		} `json:"manifest"`
		Files []struct {
			Filename string `json:"filename"`
			URL      string `json:"url"`
			Variant  string `json:"variant"`
		} `json:"files"`
	}
	if err := json.Unmarshal(data, &manifestObj); err == nil {
		var files []manifestFile
		for _, list := range [][]manifestFile{manifestObj.Manifest.FileRefs, manifestObj.Manifest.Files} {
			for _, f := range list {
				if f.URL != "" && (strings.HasSuffix(f.Filename, ".ttf") || strings.HasSuffix(f.Filename, ".otf")) {
					files = append(files, f)
				}
			}
		}
		for _, f := range manifestObj.Files {
			files = append(files, manifestFile(f))
		}
		for _, f := range files {
			if strings.EqualFold(f.Variant, variant) || fontFileMatchesVariant(f.Filename, variant) || len(files) == 1 {
				targetURL := f.URL
				if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
					targetURL = downloadBaseURL + "/" + targetURL
				}
				if err := googleFontAllowedURL(targetURL, configHost); err != nil {
					return nil, "", err
				}
				reqF, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
				if err != nil {
					continue
				}
				respF, err := client.Do(reqF)
				if err != nil || respF.StatusCode != http.StatusOK {
					continue
				}
				defer respF.Body.Close()
				limitedF := io.LimitReader(respF.Body, fontFileReadLimit)
				fontBytes, err := io.ReadAll(limitedF)
				if err == nil && len(fontBytes) > 0 {
					if len(fontBytes) > fontFileMaxBytes {
						return nil, "", apierr.New(http.StatusUnprocessableEntity, "font_too_large", "Font file exceeds 10 MB limit")
					}
					ext := "ttf"
					if strings.HasSuffix(f.Filename, ".otf") {
						ext = "otf"
					}
					return fontBytes, ext, nil
				}
			}
		}
	}

	return nil, "", apierr.New(http.StatusBadGateway, "font_not_found", fmt.Sprintf("Could not find font file for family %q variant %q", family, variant))
}

func registerGoogleFonts(h huma.API, d *Deps, fontsStore *items.Store) {
	fontTags := []string{"Fonts"}

	// --- Search Google Fonts ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "search-google-fonts",
		Method:      http.MethodGet,
		Path:        adminPrefix + "/fonts/google",
		Summary:     "Search Google Fonts metadata",
		Tags:        fontTags,
	}), func(ctx context.Context, in *SearchGoogleFontsInput) (*SearchGoogleFontsOutput, error) {
		metaList, err := fetchGoogleFontsMetadata(ctx, d.Cfg.GoogleFontsMetadataURL, d.googleConfigHost())
		if err != nil {
			return nil, err
		}

		qLower := strings.ToLower(strings.TrimSpace(in.Q))
		var out []GoogleFontSearchItem

		for _, item := range metaList {
			if qLower != "" && !strings.Contains(strings.ToLower(item.Family), qLower) {
				continue
			}
			variants := item.Variants
			if len(variants) == 0 && len(item.Fonts) > 0 {
				for k := range item.Fonts {
					variants = append(variants, k)
				}
			}
			if len(variants) == 0 {
				variants = []string{"regular"}
			}

			out = append(out, GoogleFontSearchItem{
				Family:   item.Family,
				Category: mapGoogleCategory(item.Category, item.Subsets),
				Subsets:  item.Subsets,
				Variants: variants,
			})
		}

		if out == nil {
			out = []GoogleFontSearchItem{}
		}

		return &SearchGoogleFontsOutput{Body: out}, nil
	})

	// --- Import Google Font ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "import-google-font",
		Method:        http.MethodPost,
		Path:          adminPrefix + "/fonts/google/import",
		Summary:       "Import a Google Font into the catalog",
		Tags:          fontTags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *ImportGoogleFontInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		actor := "system"
		if me != nil {
			actor = me.Name
		}

		family := strings.TrimSpace(in.Body.Family)
		if family == "" {
			return nil, apierr.Invalid("family", "Family is required")
		}

		metaList, err := fetchGoogleFontsMetadata(ctx, d.Cfg.GoogleFontsMetadataURL, d.googleConfigHost())
		if err != nil {
			return nil, err
		}

		var matched *GoogleFontMetadataEntry
		for i := range metaList {
			if strings.EqualFold(metaList[i].Family, family) {
				matched = &metaList[i]
				break
			}
		}
		if matched == nil {
			return nil, apierr.NotFound("Google Font " + family)
		}

		category := mapGoogleCategory(matched.Category, matched.Subsets)
		scripts := mapGoogleSubsetsToScripts(matched.Subsets)
		license := mapGoogleLicense(matched.License)

		// Validate license eagerly (upload path: license must be OFL-1.1 or Apache-2.0).
		if license != "OFL-1.1" && license != "Apache-2.0" {
			return nil, apierr.Invalid("license", "license must be OFL-1.1 or Apache-2.0")
		}

		var variants []string
		seenV := map[string]bool{}
		for _, v := range in.Body.Variants {
			if !seenV[v] {
				seenV[v] = true
				variants = append(variants, v)
			}
		}
		if len(variants) == 0 {
			variants = []string{"regular"}
		}

		configHost := d.googleConfigHost()

		var fontFiles []catalog.FontFile

		for _, v := range variants {
			data, ext, err := downloadFontFile(ctx, d.Cfg.GoogleFontsDownloadURL, matched.Family, v, *matched, configHost)
			if err != nil {
				return nil, err
			}

			hVal := sha256.Sum256(data)
			shaHex := hex.EncodeToString(hVal[:])

			// Store file on disk
			if _, err := assets.StoreAsset(d.Cfg.StorageDir, shaHex, ext, data); err != nil {
				return nil, err
			}

			// Store row in assets table if not exists
			now := time.Now().UTC().Truncate(time.Millisecond)
			err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
				var existing model.Asset
				err := tx.NewSelect().Model(&existing).Where("sha256 = ?", shaHex).Scan(ctx)
				if errors.Is(err, sql.ErrNoRows) {
					newAsset := &model.Asset{
						SHA256:    shaHex,
						Format:    ext,
						Mime:      items.MimeForFormat(ext),
						Bytes:     int64(len(data)),
						Width:     0,
						Height:    0,
						CreatedBy: actor,
						CreatedAt: now,
					}
					if _, err := tx.NewInsert().Model(newAsset).Exec(ctx); err != nil {
						return err
					}
					return audit.Record(ctx, tx, "import", "asset", shaHex, nil, newAsset)
				}
				return err
			})
			if err != nil {
				return nil, err
			}

			w := parseFontWeight(v)
			style := "normal"
			if strings.Contains(strings.ToLower(v), "italic") || strings.HasSuffix(strings.ToLower(v), "i") {
				style = "italic"
			}

			fontFiles = append(fontFiles, catalog.FontFile{
				Weight: &w,
				Style:  &style,
				Asset: catalog.Asset{
					URL:    fmt.Sprintf("assets/%s.%s", shaHex, ext),
					SHA256: shaHex,
					Bytes:  int64(len(data)),
					Format: ext,
				},
			})
		}

		fontID := toKebabCase(matched.Family)
		listed := true

		fontObj := catalog.Font{
			ID:       fontID,
			Family:   matched.Family,
			Category: category,
			Scripts:  scripts,
			License:  license,
			Files:    fontFiles,
			Listed:   &listed,
		}

		fontJSON, err := json.Marshal(fontObj)
		if err != nil {
			return nil, err
		}

		res, err := fontsStore.Create(ctx, fontJSON, actor)
		if err != nil {
			return nil, err
		}

		return &ItemOutput{Body: *res}, nil
	})
}

// ResetGoogleFontsCache clears the metadata cache (used by tests).
func ResetGoogleFontsCache() {
	gCache.mu.Lock()
	gCache.items = nil
	gCache.fetchedAt = time.Time{}
	gCache.mu.Unlock()
}

// fontFileMatchesVariant maps a Google variant ("regular", "italic", "700", "700italic") to the style
// suffix in a static font file name, e.g. Lobster-Regular.ttf, Inter-BoldItalic.ttf.
func fontFileMatchesVariant(filename, variant string) bool {
	names := map[int]string{100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
		600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}
	v := strings.ToLower(variant)
	italic := strings.HasSuffix(v, "italic")
	style := names[parseFontWeight(v)]
	if italic {
		if style == "Regular" {
			style = ""
		}
		style += "Italic"
	}
	base := strings.TrimSuffix(strings.TrimSuffix(filename, ".ttf"), ".otf")
	return strings.HasSuffix(base, "-"+style)
}
