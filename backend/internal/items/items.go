package items

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/model"
)

var kebabRegex = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

type Kind struct {
	Name          string                                    // "festival", "theme"
	Plural        string                                    // "festivals", "themes"
	Path          string                                    // "/festivals", "/themes"
	Columns       func(data []byte) (map[string]any, error) // festival_id, sort, search + kind extras (style, engine, family…) extracted from data
	Validate      func(data []byte) []catalog.FieldError
	FilterColumns map[string]string // allowlisted kind-specific filter columns, e.g. "style": "style", "engine": "engine"
	DefaultSort   string            // "sort", "-updatedAt"
}

func festivalColumns(data []byte) (map[string]any, error) {
	var f catalog.Festival
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("invalid festival json: %w", err)
	}
	if f.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	for _, v := range f.Name {
		searchParts = append(searchParts, v)
	}
	searchParts = append(searchParts, f.Tags...)
	search := strings.ToLower(strings.Join(searchParts, " "))

	return map[string]any{
		"festival_id": (*string)(nil),
		"sort":        f.Sort,
		"search":      search,
	}, nil
}

func festivalValidate(data []byte) []catalog.FieldError {
	var f catalog.Festival
	if err := json.Unmarshal(data, &f); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return f.Validate()
}

var FestivalKind = &Kind{
	Name:          "festival",
	Plural:        "festivals",
	Path:          "/festivals",
	Columns:       festivalColumns,
	Validate:      festivalValidate,
	FilterColumns: map[string]string{},
	DefaultSort:   "sort",
}

func categoryColumns(data []byte) (map[string]any, error) {
	var c catalog.Category
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("invalid category json: %w", err)
	}
	if c.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	for _, v := range c.Name {
		searchParts = append(searchParts, v)
	}
	searchParts = append(searchParts, c.Tags...)
	search := strings.ToLower(strings.Join(searchParts, " "))

	return map[string]any{
		"festival_id": (*string)(nil),
		"sort":        c.Sort,
		"search":      search,
	}, nil
}

func categoryValidate(data []byte) []catalog.FieldError {
	var c catalog.Category
	if err := json.Unmarshal(data, &c); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return c.Validate()
}

var CategoryKind = &Kind{
	Name:          "category",
	Plural:        "categories",
	Path:          "/categories",
	Columns:       categoryColumns,
	Validate:      categoryValidate,
	FilterColumns: map[string]string{},
	DefaultSort:   "sort",
}

func themeColumns(data []byte) (map[string]any, error) {
	var t catalog.ThemeDetail
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("invalid theme json: %w", err)
	}
	if t.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	for _, v := range t.Name {
		searchParts = append(searchParts, v)
	}
	for _, v := range t.Subtitle {
		searchParts = append(searchParts, v)
	}
	searchParts = append(searchParts, t.Tags...)
	search := strings.ToLower(strings.Join(searchParts, " "))

	var festID *string
	if t.FestivalID != "" {
		festID = &t.FestivalID
	}

	return map[string]any{
		"festival_id": festID,
		"sort":        0,
		"search":      search,
		"style":       t.Style,
		"engine":      t.Scene.Engine,
	}, nil
}

func themeValidate(data []byte) []catalog.FieldError {
	var t catalog.ThemeDetail
	if err := json.Unmarshal(data, &t); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return t.Validate()
}

var ThemeKind = &Kind{
	Name:     "theme",
	Plural:   "themes",
	Path:     "/themes",
	Columns:  themeColumns,
	Validate: themeValidate,
	FilterColumns: map[string]string{
		"style":    "style",
		"engine":   "engine",
		"festival": "festival_id",
	},
	DefaultSort: "-updatedAt",
}

func wallpaperColumns(data []byte) (map[string]any, error) {
	var w catalog.Wallpaper
	if err := json.Unmarshal(data, &w); err != nil {
		return nil, fmt.Errorf("invalid wallpaper json: %w", err)
	}
	if w.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	for _, v := range w.Name {
		searchParts = append(searchParts, v)
	}
	searchParts = append(searchParts, w.Tags...)
	search := strings.ToLower(strings.Join(searchParts, " "))

	var festID *string
	if w.FestivalID != "" {
		festID = &w.FestivalID
	}

	return map[string]any{
		"festival_id": festID,
		"sort":        0,
		"search":      search,
		"kind":        w.Kind,
	}, nil
}

func wallpaperValidate(data []byte) []catalog.FieldError {
	var w catalog.Wallpaper
	if err := json.Unmarshal(data, &w); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return w.Validate()
}

var WallpaperKind = &Kind{
	Name:     "wallpaper",
	Plural:   "wallpapers",
	Path:     "/wallpapers",
	Columns:  wallpaperColumns,
	Validate: wallpaperValidate,
	FilterColumns: map[string]string{
		"kind":     "kind",
		"festival": "festival_id",
	},
	DefaultSort: "sort",
}

func fontColumns(data []byte) (map[string]any, error) {
	var f catalog.Font
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("invalid font json: %w", err)
	}
	if f.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	searchParts = append(searchParts, f.Family)
	searchParts = append(searchParts, f.Tags...)
	searchParts = append(searchParts, f.Scripts...)
	for _, v := range f.SampleText {
		searchParts = append(searchParts, v)
	}
	search := strings.ToLower(strings.Join(searchParts, " "))

	listed := true
	if f.Listed != nil {
		listed = *f.Listed
	}

	return map[string]any{
		"festival_id": (*string)(nil),
		"sort":        0,
		"search":      search,
		"family":      f.Family,
		"category":    f.Category,
		"listed":      listed,
	}, nil
}

func fontValidate(data []byte) []catalog.FieldError {
	var f catalog.Font
	if err := json.Unmarshal(data, &f); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return f.Validate()
}

var FontKind = &Kind{
	Name:     "font",
	Plural:   "fonts",
	Path:     "/fonts",
	Columns:  fontColumns,
	Validate: fontValidate,
	FilterColumns: map[string]string{
		"category": "category",
		"family":   "family",
	},
	DefaultSort: "sort",
}

func iconPackColumns(data []byte) (map[string]any, error) {
	var p catalog.IconPack
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("invalid icon pack json: %w", err)
	}
	if p.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	for _, v := range p.Name {
		searchParts = append(searchParts, v)
	}
	for _, v := range p.Style {
		searchParts = append(searchParts, v)
	}
	searchParts = append(searchParts, p.Kind)
	search := strings.ToLower(strings.Join(searchParts, " "))

	var festID *string
	if p.FestivalID != "" {
		festID = &p.FestivalID
	}

	return map[string]any{
		"festival_id": festID,
		"sort":        0,
		"search":      search,
		"kind":        p.Kind,
	}, nil
}

func iconPackValidate(data []byte) []catalog.FieldError {
	var p catalog.IconPack
	if err := json.Unmarshal(data, &p); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return p.Validate()
}

var IconPackKind = &Kind{
	Name:     "icon_pack",
	Plural:   "icon_packs",
	Path:     "/icon-packs",
	Columns:  iconPackColumns,
	Validate: iconPackValidate,
	FilterColumns: map[string]string{
		"kind":     "kind",
		"festival": "festival_id",
	},
	DefaultSort: "sort",
}

func bannerColumns(data []byte) (map[string]any, error) {
	var bn catalog.Banner
	if err := json.Unmarshal(data, &bn); err != nil {
		return nil, fmt.Errorf("invalid banner json: %w", err)
	}
	if bn.ID == "" {
		return nil, errors.New("missing id")
	}
	var searchParts []string
	for _, v := range bn.Title {
		searchParts = append(searchParts, v)
	}
	for _, v := range bn.Subtitle {
		searchParts = append(searchParts, v)
	}
	for _, v := range bn.Tag {
		searchParts = append(searchParts, v)
	}
	for _, v := range bn.CTA {
		searchParts = append(searchParts, v)
	}
	search := strings.ToLower(strings.Join(searchParts, " "))

	var startsAt *time.Time
	if bn.StartsAt != nil && *bn.StartsAt != "" {
		if t, err := time.Parse(time.RFC3339Nano, *bn.StartsAt); err == nil {
			startsAt = &t
		} else if t, err := time.Parse(time.RFC3339, *bn.StartsAt); err == nil {
			startsAt = &t
		}
	}
	var endsAt *time.Time
	if bn.EndsAt != nil && *bn.EndsAt != "" {
		if t, err := time.Parse(time.RFC3339Nano, *bn.EndsAt); err == nil {
			endsAt = &t
		} else if t, err := time.Parse(time.RFC3339, *bn.EndsAt); err == nil {
			endsAt = &t
		}
	}

	return map[string]any{
		"festival_id": (*string)(nil),
		"sort":        bn.Sort,
		"search":      search,
		"starts_at":   startsAt,
		"ends_at":     endsAt,
	}, nil
}

func bannerValidate(data []byte) []catalog.FieldError {
	var bn catalog.Banner
	if err := json.Unmarshal(data, &bn); err != nil {
		return []catalog.FieldError{{Field: "data", Code: "invalid_json", Message: err.Error()}}
	}
	return bn.Validate()
}

var BannerKind = &Kind{
	Name:          "banner",
	Plural:        "banners",
	Path:          "/banners",
	Columns:       bannerColumns,
	Validate:      bannerValidate,
	FilterColumns: map[string]string{},
	DefaultSort:   "sort",
}

var Kinds = map[string]*Kind{
	"festival":   FestivalKind,
	"festivals":  FestivalKind,
	"category":   CategoryKind,
	"categories": CategoryKind,
	"theme":      ThemeKind,
	"themes":     ThemeKind,
	"wallpaper":  WallpaperKind,
	"wallpapers": WallpaperKind,
	"font":       FontKind,
	"fonts":      FontKind,
	"icon_pack":  IconPackKind,
	"icon_packs": IconPackKind,
	"icon-pack":  IconPackKind,
	"icon-packs": IconPackKind,
	"banner":     BannerKind,
	"banners":    BannerKind,
}

func ValidateKind(kindName string, data []byte) ([]catalog.FieldError, error) {
	if k, ok := Kinds[kindName]; ok {
		return k.Validate(data), nil
	}
	return nil, apierr.NotFound("Kind " + kindName)
}

var SortableColumns = map[string]string{
	"sort":      "sort",
	"name":      "search",
	"updatedAt": "updated_at",
	"createdAt": "created_at",
	"status":    "status",
}

var baseColumns = []string{
	"id",
	"status",
	"festival_id",
	"sort",
	"search",
	"data",
	"published_data",
	"rev",
	"published_hash",
	"first_published",
	"scheduled_at",
	"created_by",
	"updated_by",
	"created_at",
	"updated_at",
}

type ItemRow struct {
	ID             string     `bun:"id,pk"`
	Status         string     `bun:"status,notnull"`
	FestivalID     *string    `bun:"festival_id,nullzero"`
	Sort           int        `bun:"sort,notnull"`
	Search         string     `bun:"search,notnull"`
	Data           model.JSON `bun:"data,notnull"`
	PublishedData  model.JSON `bun:"published_data"`
	Rev            int        `bun:"rev,notnull"`
	PublishedHash  string     `bun:"published_hash,notnull"`
	FirstPublished *time.Time `bun:"first_published,nullzero"`
	ScheduledAt    *time.Time `bun:"scheduled_at,nullzero"`
	CreatedBy      string     `bun:"created_by,notnull"`
	UpdatedBy      string     `bun:"updated_by,notnull"`
	CreatedAt      time.Time  `bun:"created_at,notnull"`
	UpdatedAt      time.Time  `bun:"updated_at,notnull"`
	GeneratedFrom  model.JSON `bun:"generated_from,nullzero"`
}

type ItemView struct {
	ID                    string               `json:"id"`
	Status                string               `json:"status"`
	FestivalID            *string              `json:"festivalId"`
	Sort                  int                  `json:"sort"`
	Data                  model.JSON           `json:"data"`
	Rev                   int                  `json:"rev"`
	FirstPublishedAt      *time.Time           `json:"firstPublishedAt"`
	ScheduledAt           *time.Time           `json:"scheduledAt"`
	CreatedBy             string               `json:"createdBy"`
	UpdatedBy             string               `json:"updatedBy"`
	CreatedAt             time.Time            `json:"createdAt"`
	UpdatedAt             time.Time            `json:"updatedAt"`
	HasUnpublishedChanges bool                 `json:"hasUnpublishedChanges"`
	Validation            []catalog.FieldError `json:"validation"`
	GeneratedFrom         model.JSON           `json:"generatedFrom,omitempty"`
}

func calcHasUnpublishedChanges(status string, data, publishedData model.JSON) bool {
	if len(publishedData) == 0 {
		return false
	}
	if status != model.StatusPublished {
		return true
	}
	return !jsonEqual(data, publishedData)
}

func jsonEqual(a, b []byte) bool {
	if len(a) == 0 && len(b) == 0 {
		return true
	}
	if len(a) == 0 || len(b) == 0 {
		return false
	}
	var va, vb any
	if err := json.Unmarshal(a, &va); err != nil {
		return false
	}
	if err := json.Unmarshal(b, &vb); err != nil {
		return false
	}
	return reflect.DeepEqual(va, vb)
}

func (k *Kind) ToView(row *ItemRow) ItemView {
	validation := k.Validate(row.Data)
	if validation == nil {
		validation = []catalog.FieldError{}
	}
	var gf model.JSON
	if len(row.GeneratedFrom) > 0 && string(row.GeneratedFrom) != "null" {
		gf = row.GeneratedFrom
	}
	return ItemView{
		ID:                    row.ID,
		Status:                row.Status,
		FestivalID:            row.FestivalID,
		Sort:                  row.Sort,
		Data:                  row.Data,
		Rev:                   row.Rev,
		FirstPublishedAt:      row.FirstPublished,
		ScheduledAt:           row.ScheduledAt,
		CreatedBy:             row.CreatedBy,
		UpdatedBy:             row.UpdatedBy,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
		HasUnpublishedChanges: calcHasUnpublishedChanges(row.Status, row.Data, row.PublishedData),
		Validation:            validation,
		GeneratedFrom:         gf,
	}
}

type Store struct {
	db   *bun.DB
	kind *Kind
}

func NewStore(db *bun.DB, kind *Kind) *Store {
	return &Store{db: db, kind: kind}
}

func (s *Store) Kind() *Kind {
	return s.kind
}

func (s *Store) getRow(ctx context.Context, idb bun.IDB, id string) (*ItemRow, error) {
	var row ItemRow
	q := idb.NewSelect().
		Table(s.kind.Plural).
		Where("id = ?", id)
	for _, col := range baseColumns {
		q = q.Column(col)
	}
	if s.kind.Name == "theme" {
		q = q.Column("generated_from")
	}
	if err := q.Scan(ctx, &row); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apierr.NotFound(s.kind.Name)
		}
		return nil, err
	}
	return &row, nil
}

func (s *Store) Get(ctx context.Context, id string) (*ItemView, error) {
	row, err := s.getRow(ctx, s.db, id)
	if err != nil {
		return nil, err
	}
	v := s.kind.ToView(row)
	return &v, nil
}

type ListFilter struct {
	Page       int
	PerPage    int
	Sort       string
	Q          string
	Status     string
	FestivalID string
	Generated  *bool
	Extras     map[string]string
}

type Page[T any] struct {
	Items   []T `json:"items"`
	Total   int `json:"total"`
	Page    int `json:"page"`
	PerPage int `json:"perPage"`
}

func (s *Store) List(ctx context.Context, f ListFilter) (*Page[ItemView], error) {
	var rows []ItemRow
	q := s.db.NewSelect().Table(s.kind.Plural)
	for _, col := range baseColumns {
		q = q.Column(col)
	}
	if s.kind.Name == "theme" {
		q = q.Column("generated_from")
	}

	if f.Q != "" {
		pat := likeContains(f.Q)
		q = q.Where("LOWER(?) LIKE ? ESCAPE '\\'", bun.Ident("search"), pat)
	}

	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}

	if f.FestivalID != "" {
		q = q.Where("festival_id = ?", f.FestivalID)
	}

	if f.Generated != nil && s.kind.Name == "theme" {
		if *f.Generated {
			q = q.Where("generated_from IS NOT NULL")
		} else {
			q = q.Where("generated_from IS NULL")
		}
	}

	for k, v := range f.Extras {
		if dbCol, ok := s.kind.FilterColumns[k]; ok && v != "" {
			q = q.Where("? = ?", bun.Ident(dbCol), v)
		}
	}

	// Apply sort
	sortBy := f.Sort
	if sortBy == "" {
		sortBy = s.kind.DefaultSort
	}
	desc := strings.HasPrefix(sortBy, "-")
	colName := strings.TrimPrefix(sortBy, "-")
	dbCol, ok := SortableColumns[colName]
	if !ok {
		return nil, apierr.Invalid("sort", "Can't sort by "+colName)
	}
	dir := "ASC"
	if desc {
		dir = "DESC"
	}

	page := f.Page
	if page < 1 {
		page = 1
	}
	perPage := f.PerPage
	if perPage < 1 {
		perPage = 50
	}

	q = q.OrderExpr("? "+dir, bun.Ident(dbCol)).
		Limit(int64(perPage)).
		Offset(int64((page - 1) * perPage))

	total, err := q.ScanAndCount(ctx, &rows)
	if err != nil {
		return nil, err
	}

	items := make([]ItemView, len(rows))
	for i := range rows {
		items[i] = s.kind.ToView(&rows[i])
	}

	return &Page[ItemView]{
		Items:   items,
		Total:   int(total),
		Page:    page,
		PerPage: perPage,
	}, nil
}

type CreateOptions struct {
	Data          []byte
	CreatorName   string
	GeneratedFrom model.JSON
}

func (s *Store) Create(ctx context.Context, data []byte, creatorName string) (*ItemView, error) {
	return s.CreateWithOptions(ctx, CreateOptions{
		Data:        data,
		CreatorName: creatorName,
	})
}

func (s *Store) CreateWithOptions(ctx context.Context, opts CreateOptions) (*ItemView, error) {
	if !json.Valid(opts.Data) {
		return nil, apierr.Invalid("data", "Invalid JSON")
	}

	var rawMap map[string]any
	if err := json.Unmarshal(opts.Data, &rawMap); err != nil {
		return nil, apierr.Invalid("data", "Invalid JSON object")
	}

	idVal, _ := rawMap["id"].(string)
	idVal = strings.TrimSpace(idVal)
	if idVal == "" {
		return nil, apierr.Invalid("id", "Item ID is required")
	}
	if !kebabRegex.MatchString(idVal) {
		return nil, apierr.Invalid("id", "ID must be kebab-case")
	}

	extracted, err := s.kind.Columns(opts.Data)
	if err != nil {
		return nil, apierr.Invalid("data", err.Error())
	}

	var outView ItemView
	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		count, err := tx.NewSelect().Table(s.kind.Plural).Where("id = ?", idVal).Count(ctx)
		if err != nil {
			return err
		}
		if count > 0 {
			return apierr.Conflict("id_taken", fmt.Sprintf("An item with ID '%s' already exists", idVal)).WithField("id")
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		row := ItemRow{
			ID:             idVal,
			Status:         model.StatusDraft,
			FestivalID:     extracted["festival_id"].(*string),
			Sort:           extracted["sort"].(int),
			Search:         extracted["search"].(string),
			Data:           opts.Data,
			PublishedData:  nil,
			Rev:            0,
			PublishedHash:  "",
			FirstPublished: nil,
			ScheduledAt:    nil,
			CreatedBy:      opts.CreatorName,
			UpdatedBy:      opts.CreatorName,
			CreatedAt:      now,
			UpdatedAt:      now,
			GeneratedFrom:  opts.GeneratedFrom,
		}

		cols := []string{
			"id", "status", "festival_id", "sort", "search", "data", "published_data",
			"rev", "published_hash", "first_published", "scheduled_at", "created_by",
			"updated_by", "created_at", "updated_at",
		}
		vals := []any{
			row.ID, row.Status, row.FestivalID, row.Sort, row.Search, row.Data, row.PublishedData,
			row.Rev, row.PublishedHash, row.FirstPublished, row.ScheduledAt, row.CreatedBy,
			row.UpdatedBy, row.CreatedAt, row.UpdatedAt,
		}

		if s.kind.Name == "theme" && len(opts.GeneratedFrom) > 0 {
			cols = append(cols, "generated_from")
			vals = append(vals, opts.GeneratedFrom)
		}

		for kcol, kval := range extracted {
			if !safeIdent.MatchString(kcol) {
				return fmt.Errorf("items: unsafe column name %q", kcol)
			}
			if kcol != "festival_id" && kcol != "sort" && kcol != "search" {
				cols = append(cols, kcol)
				vals = append(vals, kval)
			}
		}

		placeholders := strings.Repeat("?, ", len(cols)-1) + "?"
		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", s.kind.Plural, strings.Join(cols, ", "), placeholders)
		if _, err := tx.ExecContext(ctx, query, vals...); err != nil {
			return err
		}

		outView = s.kind.ToView(&row)
		return audit.Record(ctx, tx, "create", s.kind.Name, row.ID, nil, outView)
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

type UpdateOptions struct {
	Data            []byte
	ClientUpdatedAt *time.Time
	UpdaterName     string
	GeneratedFrom   model.JSON
}

func (s *Store) Update(ctx context.Context, id string, data []byte, clientUpdatedAt *time.Time, updaterName string) (*ItemView, error) {
	return s.UpdateWithOptions(ctx, id, UpdateOptions{
		Data:            data,
		ClientUpdatedAt: clientUpdatedAt,
		UpdaterName:     updaterName,
	})
}

func (s *Store) UpdateWithOptions(ctx context.Context, id string, opts UpdateOptions) (*ItemView, error) {
	if !json.Valid(opts.Data) {
		return nil, apierr.Invalid("data", "Invalid JSON")
	}

	var rawMap map[string]any
	if err := json.Unmarshal(opts.Data, &rawMap); err != nil {
		return nil, apierr.Invalid("data", "Invalid JSON object")
	}

	newID, _ := rawMap["id"].(string)
	newID = strings.TrimSpace(newID)
	if newID != "" && newID != id {
		return nil, apierr.New(http.StatusUnprocessableEntity, "id_fixed", "Item ID cannot be changed").WithField("id")
	}

	extracted, err := s.kind.Columns(opts.Data)
	if err != nil {
		return nil, apierr.Invalid("data", err.Error())
	}

	var outView ItemView
	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, err := s.getRow(ctx, tx, id)
		if err != nil {
			return err
		}

		if opts.ClientUpdatedAt != nil {
			if isStale(existing.UpdatedAt, *opts.ClientUpdatedAt) {
				return apierr.Conflict("edit_conflict", "Item was modified by someone else")
			}
		}

		newStatus := existing.Status
		scheduledAt := existing.ScheduledAt
		if existing.Status == model.StatusApproved ||
			existing.Status == model.StatusScheduled ||
			existing.Status == model.StatusPublished ||
			existing.Status == model.StatusInReview {
			newStatus = model.StatusDraft
			scheduledAt = nil
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		if !now.After(existing.UpdatedAt) {
			now = existing.UpdatedAt.Add(time.Millisecond)
		}

		newGeneratedFrom := existing.GeneratedFrom
		if s.kind.Name == "theme" && opts.GeneratedFrom != nil {
			newGeneratedFrom = opts.GeneratedFrom
		}

		updated := ItemRow{
			ID:             existing.ID,
			Status:         newStatus,
			FestivalID:     extracted["festival_id"].(*string),
			Sort:           extracted["sort"].(int),
			Search:         extracted["search"].(string),
			Data:           opts.Data,
			PublishedData:  existing.PublishedData,
			Rev:            existing.Rev,
			PublishedHash:  existing.PublishedHash,
			FirstPublished: existing.FirstPublished,
			ScheduledAt:    scheduledAt,
			CreatedBy:      existing.CreatedBy,
			UpdatedBy:      opts.UpdaterName,
			CreatedAt:      existing.CreatedAt,
			UpdatedAt:      now,
			GeneratedFrom:  newGeneratedFrom,
		}

		setCols := []string{
			"status", "festival_id", "sort", "search", "data", "scheduled_at",
			"updated_by", "updated_at",
		}
		setVals := []any{
			updated.Status, updated.FestivalID, updated.Sort, updated.Search, updated.Data,
			updated.ScheduledAt, updated.UpdatedBy, updated.UpdatedAt,
		}

		if s.kind.Name == "theme" && opts.GeneratedFrom != nil {
			setCols = append(setCols, "generated_from")
			setVals = append(setVals, opts.GeneratedFrom)
		}

		for kcol, kval := range extracted {
			if !safeIdent.MatchString(kcol) {
				return fmt.Errorf("items: unsafe column name %q", kcol)
			}
			if kcol != "festival_id" && kcol != "sort" && kcol != "search" {
				setCols = append(setCols, kcol)
				setVals = append(setVals, kval)
			}
		}

		var setParts []string
		for _, col := range setCols {
			setParts = append(setParts, fmt.Sprintf("%s = ?", col))
		}
		setVals = append(setVals, existing.ID)

		query := fmt.Sprintf("UPDATE %s SET %s WHERE id = ?", s.kind.Plural, strings.Join(setParts, ", "))
		if _, err := tx.ExecContext(ctx, query, setVals...); err != nil {
			return err
		}

		beforeView := s.kind.ToView(existing)
		outView = s.kind.ToView(&updated)
		return audit.Record(ctx, tx, "update", s.kind.Name, existing.ID, beforeView, outView)
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

func (s *Store) Duplicate(ctx context.Context, id string, creatorName string) (*ItemView, error) {
	var outView ItemView
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, err := s.getRow(ctx, tx, id)
		if err != nil {
			return err
		}

		newID, err := nextDuplicateID(ctx, tx, s.kind.Plural, id)
		if err != nil {
			return err
		}

		var dataMap map[string]any
		if err := json.Unmarshal(existing.Data, &dataMap); err != nil {
			return err
		}
		dataMap["id"] = newID
		if nameMap, ok := dataMap["name"].(map[string]any); ok {
			for lang, val := range nameMap {
				nameMap[lang] = fmt.Sprintf("%v (copy)", val)
			}
			dataMap["name"] = nameMap
		}
		if titleMap, ok := dataMap["title"].(map[string]any); ok {
			for lang, val := range titleMap {
				titleMap[lang] = fmt.Sprintf("%v (copy)", val)
			}
			dataMap["title"] = titleMap
		}
		if fam, ok := dataMap["family"].(string); ok && fam != "" {
			dataMap["family"] = fmt.Sprintf("%s (copy)", fam)
		}
		newData, err := json.Marshal(dataMap)
		if err != nil {
			return err
		}

		extracted, err := s.kind.Columns(newData)
		if err != nil {
			return apierr.Invalid("data", err.Error())
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		row := ItemRow{
			ID:             newID,
			Status:         model.StatusDraft,
			FestivalID:     extracted["festival_id"].(*string),
			Sort:           extracted["sort"].(int),
			Search:         extracted["search"].(string),
			Data:           newData,
			PublishedData:  nil,
			Rev:            0,
			PublishedHash:  "",
			FirstPublished: nil,
			ScheduledAt:    nil,
			CreatedBy:      creatorName,
			UpdatedBy:      creatorName,
			CreatedAt:      now,
			UpdatedAt:      now,
			GeneratedFrom:  existing.GeneratedFrom,
		}

		cols := []string{
			"id", "status", "festival_id", "sort", "search", "data", "published_data",
			"rev", "published_hash", "first_published", "scheduled_at", "created_by",
			"updated_by", "created_at", "updated_at",
		}
		vals := []any{
			row.ID, row.Status, row.FestivalID, row.Sort, row.Search, row.Data, row.PublishedData,
			row.Rev, row.PublishedHash, row.FirstPublished, row.ScheduledAt, row.CreatedBy,
			row.UpdatedBy, row.CreatedAt, row.UpdatedAt,
		}

		if s.kind.Name == "theme" && len(existing.GeneratedFrom) > 0 {
			cols = append(cols, "generated_from")
			vals = append(vals, existing.GeneratedFrom)
		}

		for kcol, kval := range extracted {
			if !safeIdent.MatchString(kcol) {
				return fmt.Errorf("items: unsafe column name %q", kcol)
			}
			if kcol != "festival_id" && kcol != "sort" && kcol != "search" {
				cols = append(cols, kcol)
				vals = append(vals, kval)
			}
		}

		placeholders := strings.Repeat("?, ", len(cols)-1) + "?"
		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", s.kind.Plural, strings.Join(cols, ", "), placeholders)
		if _, err := tx.ExecContext(ctx, query, vals...); err != nil {
			return err
		}

		outView = s.kind.ToView(&row)
		return audit.Record(ctx, tx, "duplicate", s.kind.Name, newID, nil, outView)
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

func (s *Store) ImportItem(ctx context.Context, tx bun.Tx, data []byte, rev int, firstPublished *time.Time, actor string) (*ItemView, error) {
	return s.ImportItemAs(ctx, tx, data, rev, firstPublished, actor, model.StatusPublished)
}

// ImportItemAs imports an item with the given status. A non-published status (from an
// export bundle) keeps whatever was published before and never publishes the new data.
func (s *Store) ImportItemAs(ctx context.Context, tx bun.Tx, data []byte, rev int, firstPublished *time.Time, actor string, status string) (*ItemView, error) {
	if !json.Valid(data) {
		return nil, apierr.Invalid("data", "Invalid JSON")
	}

	var rawMap map[string]any
	if err := json.Unmarshal(data, &rawMap); err != nil {
		return nil, apierr.Invalid("data", "Invalid JSON object")
	}

	idVal, _ := rawMap["id"].(string)
	idVal = strings.TrimSpace(idVal)
	if idVal == "" {
		return nil, apierr.Invalid("id", "Item ID is required")
	}
	if !kebabRegex.MatchString(idVal) {
		return nil, apierr.Invalid("id", "ID must be kebab-case")
	}

	extracted, err := s.kind.Columns(data)
	if err != nil {
		return nil, apierr.Invalid("data", err.Error())
	}

	h := sha256.Sum256(data)
	pubHash := hex.EncodeToString(h[:])

	existing, err := s.getRow(ctx, tx, idVal)
	if err != nil {
		var apErr *apierr.Error
		if errors.As(err, &apErr) && apErr.GetStatus() == http.StatusNotFound {
			existing = nil
		} else {
			return nil, err
		}
	}

	now := time.Now().UTC().Truncate(time.Millisecond)

	fp := firstPublished
	if existing != nil && existing.FirstPublished != nil {
		fp = existing.FirstPublished
	} else if fp == nil {
		fp = &now
	}

	createdBy := actor
	createdAt := now
	var genFrom model.JSON
	if existing != nil {
		createdBy = existing.CreatedBy
		createdAt = existing.CreatedAt
		genFrom = existing.GeneratedFrom
	}

	row := ItemRow{
		ID:             idVal,
		Status:         model.StatusPublished,
		FestivalID:     extracted["festival_id"].(*string),
		Sort:           extracted["sort"].(int),
		Search:         extracted["search"].(string),
		Data:           data,
		PublishedData:  data,
		Rev:            rev,
		PublishedHash:  pubHash,
		FirstPublished: fp,
		ScheduledAt:    nil,
		CreatedBy:      createdBy,
		UpdatedBy:      actor,
		CreatedAt:      createdAt,
		UpdatedAt:      now,
		GeneratedFrom:  genFrom,
	}
	if status == model.StatusDraft || status == model.StatusInReview || status == model.StatusApproved {
		row.Status = status
		if existing != nil {
			row.PublishedData, row.PublishedHash, row.FirstPublished, row.Rev = existing.PublishedData, existing.PublishedHash, existing.FirstPublished, existing.Rev
		} else {
			row.PublishedData, row.PublishedHash, row.FirstPublished = nil, "", nil
		}
	}

	var outView ItemView
	if existing == nil {
		cols := []string{
			"id", "status", "festival_id", "sort", "search", "data", "published_data",
			"rev", "published_hash", "first_published", "scheduled_at", "created_by",
			"updated_by", "created_at", "updated_at",
		}
		vals := []any{
			row.ID, row.Status, row.FestivalID, row.Sort, row.Search, row.Data, row.PublishedData,
			row.Rev, row.PublishedHash, row.FirstPublished, row.ScheduledAt, row.CreatedBy,
			row.UpdatedBy, row.CreatedAt, row.UpdatedAt,
		}

		if s.kind.Name == "theme" && len(genFrom) > 0 {
			cols = append(cols, "generated_from")
			vals = append(vals, genFrom)
		}

		for kcol, kval := range extracted {
			if !safeIdent.MatchString(kcol) {
				return nil, fmt.Errorf("items: unsafe column name %q", kcol)
			}
			if kcol != "festival_id" && kcol != "sort" && kcol != "search" {
				cols = append(cols, kcol)
				vals = append(vals, kval)
			}
		}

		placeholders := strings.Repeat("?, ", len(cols)-1) + "?"
		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", s.kind.Plural, strings.Join(cols, ", "), placeholders)
		if _, err := tx.ExecContext(ctx, query, vals...); err != nil {
			return nil, err
		}

		outView = s.kind.ToView(&row)
		if err := audit.Record(ctx, tx, "import", s.kind.Name, row.ID, nil, outView); err != nil {
			return nil, err
		}
	} else {
		setCols := []string{
			"status", "festival_id", "sort", "search", "data", "published_data",
			"rev", "published_hash", "first_published", "scheduled_at", "updated_by", "updated_at",
		}
		setVals := []any{
			row.Status, row.FestivalID, row.Sort, row.Search, row.Data, row.PublishedData,
			row.Rev, row.PublishedHash, row.FirstPublished, row.ScheduledAt, row.UpdatedBy, row.UpdatedAt,
		}

		for kcol, kval := range extracted {
			if !safeIdent.MatchString(kcol) {
				return nil, fmt.Errorf("items: unsafe column name %q", kcol)
			}
			if kcol != "festival_id" && kcol != "sort" && kcol != "search" {
				setCols = append(setCols, kcol)
				setVals = append(setVals, kval)
			}
		}

		var setParts []string
		for _, col := range setCols {
			setParts = append(setParts, fmt.Sprintf("%s = ?", col))
		}
		setVals = append(setVals, existing.ID)

		query := fmt.Sprintf("UPDATE %s SET %s WHERE id = ?", s.kind.Plural, strings.Join(setParts, ", "))
		if _, err := tx.ExecContext(ctx, query, setVals...); err != nil {
			return nil, err
		}

		beforeView := s.kind.ToView(existing)
		outView = s.kind.ToView(&row)
		if err := audit.Record(ctx, tx, "import", s.kind.Name, existing.ID, beforeView, outView); err != nil {
			return nil, err
		}
	}

	return &outView, nil
}

func ImportStoreSettings(ctx context.Context, tx bun.Tx, accentPresets, searchSuggestions []byte, actor string) error {
	now := time.Now().UTC().Truncate(time.Millisecond)
	var existing model.StoreSettings
	err := tx.NewSelect().Model(&existing).Where("id = 1").Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		newSS := &model.StoreSettings{
			ID:                1,
			AccentPresets:     accentPresets,
			SearchSuggestions: searchSuggestions,
			UpdatedAt:         now,
		}
		if _, err := tx.NewInsert().Model(newSS).Exec(ctx); err != nil {
			return err
		}
		return audit.Record(ctx, tx, "import", "store_settings", "1", nil, newSS)
	} else if err != nil {
		return err
	}

	newSS := model.StoreSettings{
		ID:                1,
		AccentPresets:     accentPresets,
		SearchSuggestions: searchSuggestions,
		UpdatedAt:         now,
	}
	if _, err := tx.NewUpdate().Model(&newSS).Where("id = 1").Exec(ctx); err != nil {
		return err
	}
	return audit.Record(ctx, tx, "import", "store_settings", "1", existing, newSS)
}

func ImportAsset(ctx context.Context, tx bun.Tx, sha256Hex, format, mime string, byteCount int64, actor string) error {
	now := time.Now().UTC().Truncate(time.Millisecond)
	var existing model.Asset
	err := tx.NewSelect().Model(&existing).Where("sha256 = ?", sha256Hex).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		newAsset := &model.Asset{
			SHA256:    sha256Hex,
			Format:    format,
			Mime:      mime,
			Bytes:     byteCount,
			Width:     0,
			Height:    0,
			CreatedBy: actor,
			CreatedAt: now,
		}
		if _, err := tx.NewInsert().Model(newAsset).Exec(ctx); err != nil {
			return err
		}
		return audit.Record(ctx, tx, "import", "asset", sha256Hex, nil, newAsset)
	} else if err != nil {
		return err
	}
	return nil
}

type AssetFile struct {
	Name  string
	Bytes []byte
}

func MimeForFormat(format string) string {
	switch strings.ToLower(format) {
	case "ttf":
		return "font/ttf"
	case "otf":
		return "font/otf"
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	case "svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

func VerifyAndCopyAssets(ctx context.Context, tx bun.Tx, storageDir string, assetFiles []AssetFile, actor string) (created, skipped []string, err error) {
	if len(assetFiles) == 0 {
		return nil, nil, nil
	}

	type verifiedAsset struct {
		file      AssetFile
		sha256Hex string
		format    string
		mime      string
		destPath  string
	}

	destAssetsDir := filepath.Join(storageDir, "assets")
	verified := make([]verifiedAsset, 0, len(assetFiles))

	// 1. Verify sha256 of every asset first before writing anything.
	for _, a := range assetFiles {
		h := sha256.Sum256(a.Bytes)
		hashStr := hex.EncodeToString(h[:])

		if len(a.Bytes) > assets.MaxAssetSize {
			return nil, nil, apierr.Invalid("assets", "Asset "+filepath.Base(a.Name)+" is larger than 10 MB")
		}
		// The type comes from the content, never from the uploaded name.
		format, mime, err := assets.Sniff(a.Bytes)
		if err != nil {
			// Unknown types are skipped, not fatal; references to them fail checks at publish.
			skipped = append(skipped, filepath.Base(a.Name))
			continue
		}
		stem := strings.TrimSuffix(a.Name, filepath.Ext(a.Name))

		if len(stem) == 64 {
			if !strings.EqualFold(stem, hashStr) {
				return nil, nil, fmt.Errorf("asset sha256 mismatch: file %s has sha256 %s, expected %s", a.Name, hashStr, stem)
			}
		}

		destPath := filepath.Join(destAssetsDir, hashStr+"."+format)

		verified = append(verified, verifiedAsset{
			file:      a,
			sha256Hex: hashStr,
			format:    format,
			mime:      mime,
			destPath:  destPath,
		})
	}

	// 2. All verified. Ensure destination directory exists.
	if err := os.MkdirAll(destAssetsDir, 0755); err != nil {
		return nil, nil, fmt.Errorf("create storage assets dir: %w", err)
	}

	// 3. Copy files, tracking newly created files so we can clean them up on failure.
	var createdFiles []string
	for _, va := range verified {
		if _, err := os.Stat(va.destPath); os.IsNotExist(err) {
			if err := os.WriteFile(va.destPath, va.file.Bytes, 0644); err != nil {
				for _, f := range createdFiles {
					_ = os.Remove(f)
				}
				return nil, nil, fmt.Errorf("write asset file %s: %w", va.destPath, err)
			}
			createdFiles = append(createdFiles, va.destPath)
		}
	}

	// 4. Insert rows into assets table.
	for _, va := range verified {
		if err := ImportAsset(ctx, tx, va.sha256Hex, va.format, va.mime, int64(len(va.file.Bytes)), actor); err != nil {
			for _, f := range createdFiles {
				_ = os.Remove(f)
			}
			return nil, nil, err
		}
	}

	return createdFiles, skipped, nil
}

func (s *Store) Transition(ctx context.Context, id, action string, note *string, callerName, callerRole string) (*ItemView, error) {
	var outView ItemView
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, err := s.getRow(ctx, tx, id)
		if err != nil {
			return err
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		if !now.After(existing.UpdatedAt) {
			now = existing.UpdatedAt.Add(time.Millisecond)
		}

		switch action {
		case "request":
			// Designer+
			if existing.Status != model.StatusDraft {
				return apierr.Conflict("invalid_state", "Item must be in draft to request review")
			}
			valErrors := s.kind.Validate(existing.Data)
			if len(valErrors) > 0 {
				return makeInvalidItemError(valErrors)
			}

			existing.Status = model.StatusInReview
			existing.UpdatedBy = callerName
			existing.UpdatedAt = now

			if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
				existing.Status, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
				return err
			}
			outView = s.kind.ToView(existing)
			return audit.Record(ctx, tx, "review_request", s.kind.Name, existing.ID, s.kind.ToView(existing), outView)

		case "approve":
			// Reviewer+
			if callerRole != model.RoleReviewer && callerRole != model.RoleAdmin {
				return apierr.Forbidden("Your role (" + callerRole + ") can't do this. Needed: admin or reviewer")
			}
			canApprove := existing.Status == model.StatusInReview || (existing.Status == model.StatusDraft && callerRole == model.RoleAdmin)
			if !canApprove {
				return apierr.Conflict("invalid_state", "Item must be in review to approve")
			}
			valErrors := s.kind.Validate(existing.Data)
			if len(valErrors) > 0 {
				return makeInvalidItemError(valErrors)
			}

			existing.Status = model.StatusApproved
			existing.UpdatedBy = callerName
			existing.UpdatedAt = now

			if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
				existing.Status, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
				return err
			}
			outView = s.kind.ToView(existing)
			return audit.Record(ctx, tx, "review_approve", s.kind.Name, existing.ID, s.kind.ToView(existing), outView)

		case "reject":
			// Reviewer+
			if callerRole != model.RoleReviewer && callerRole != model.RoleAdmin {
				return apierr.Forbidden("Your role (" + callerRole + ") can't do this. Needed: admin or reviewer")
			}
			if existing.Status != model.StatusInReview {
				return apierr.Conflict("invalid_state", "Item must be in review to reject")
			}

			existing.Status = model.StatusDraft
			existing.UpdatedBy = callerName
			existing.UpdatedAt = now

			if note != nil && s.kind.Name == "theme" {
				if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, review_note = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
					existing.Status, *note, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
					return err
				}
			} else {
				if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
					existing.Status, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
					return err
				}
			}
			outView = s.kind.ToView(existing)
			return audit.Record(ctx, tx, "review_reject", s.kind.Name, existing.ID, s.kind.ToView(existing), outView)

		default:
			return apierr.Invalid("action", "Invalid action "+action)
		}
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

func (s *Store) Schedule(ctx context.Context, id string, at *time.Time, callerName string) (*ItemView, error) {
	var outView ItemView
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, err := s.getRow(ctx, tx, id)
		if err != nil {
			return err
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		if !now.After(existing.UpdatedAt) {
			now = existing.UpdatedAt.Add(time.Millisecond)
		}

		if at != nil {
			if !at.After(time.Now()) {
				return apierr.Invalid("at", "Scheduled time must be in the future")
			}
			if existing.Status != model.StatusApproved && existing.Status != model.StatusScheduled {
				return apierr.Invalid("status", "Item must be approved to schedule")
			}
			existing.Status = model.StatusScheduled
			existing.ScheduledAt = at
		} else {
			if existing.Status != model.StatusScheduled {
				return apierr.Invalid("status", "Item is not scheduled")
			}
			existing.Status = model.StatusApproved
			existing.ScheduledAt = nil
		}

		existing.UpdatedBy = callerName
		existing.UpdatedAt = now

		if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, scheduled_at = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
			existing.Status, existing.ScheduledAt, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
			return err
		}

		beforeView := s.kind.ToView(existing)
		outView = s.kind.ToView(existing)
		return audit.Record(ctx, tx, "schedule", s.kind.Name, existing.ID, beforeView, outView)
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

func (s *Store) Archive(ctx context.Context, id string, callerName string) (*ItemView, error) {
	var outView ItemView
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, err := s.getRow(ctx, tx, id)
		if err != nil {
			return err
		}

		beforeView := s.kind.ToView(existing)
		if existing.Status == model.StatusArchived {
			outView = beforeView
			return nil
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		if !now.After(existing.UpdatedAt) {
			now = existing.UpdatedAt.Add(time.Millisecond)
		}

		existing.Status = model.StatusArchived
		existing.UpdatedBy = callerName
		existing.UpdatedAt = now

		if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
			existing.Status, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
			return err
		}

		outView = s.kind.ToView(existing)
		return audit.Record(ctx, tx, "archive", s.kind.Name, existing.ID, beforeView, outView)
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

func (s *Store) Restore(ctx context.Context, id string, callerName string) (*ItemView, error) {
	var outView ItemView
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, err := s.getRow(ctx, tx, id)
		if err != nil {
			return err
		}

		if existing.Status != model.StatusArchived {
			return apierr.Invalid("status", "Item is not archived")
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		if !now.After(existing.UpdatedAt) {
			now = existing.UpdatedAt.Add(time.Millisecond)
		}

		beforeView := s.kind.ToView(existing)
		existing.Status = model.StatusDraft
		existing.UpdatedBy = callerName
		existing.UpdatedAt = now

		if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
			existing.Status, existing.UpdatedBy, existing.UpdatedAt, existing.ID); err != nil {
			return err
		}

		outView = s.kind.ToView(existing)
		return audit.Record(ctx, tx, "restore", s.kind.Name, existing.ID, beforeView, outView)
	})
	if err != nil {
		return nil, err
	}
	return &outView, nil
}

func (s *Store) Reorder(ctx context.Context, ids []string, updaterName string) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		now := time.Now().UTC().Truncate(time.Millisecond)
		for i, id := range ids {
			sortVal := i * 10

			existing, err := s.getRow(ctx, tx, id)
			if err != nil {
				return err
			}

			// Update sort inside data JSON
			var dataMap map[string]any
			if err := json.Unmarshal(existing.Data, &dataMap); err == nil {
				dataMap["sort"] = sortVal
				if b, err := json.Marshal(dataMap); err == nil {
					existing.Data = b
				}
			}

			if _, err := tx.ExecContext(ctx,
				fmt.Sprintf("UPDATE %s SET sort = ?, data = ?, updated_by = ?, updated_at = ? WHERE id = ?", s.kind.Plural),
				sortVal, existing.Data, updaterName, now, id); err != nil {
				return err
			}
		}
		return audit.Record(ctx, tx, "reorder", s.kind.Name, s.kind.Plural, nil, ids)
	})
}

func nextDuplicateID(ctx context.Context, idb bun.IDB, table, baseID string) (string, error) {
	candidate := baseID + "-copy"
	count, err := idb.NewSelect().Table(table).Where("id = ?", candidate).Count(ctx)
	if err != nil {
		return "", err
	}
	if count == 0 {
		return candidate, nil
	}
	for n := 2; ; n++ {
		candidate = fmt.Sprintf("%s-copy-%d", baseID, n)
		count, err = idb.NewSelect().Table(table).Where("id = ?", candidate).Count(ctx)
		if err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
}

func makeInvalidItemError(errs []catalog.FieldError) *apierr.Error {
	e := apierr.New(http.StatusUnprocessableEntity, "invalid_item", "Item has validation errors")
	for _, fe := range errs {
		e.Err.Details = append(e.Err.Details, apierr.Detail{
			Field:   fe.Field,
			Message: fe.Message,
		})
	}
	if len(errs) > 0 {
		e.Err.Field = errs[0].Field
	}
	return e
}

// isStale compares at millisecond precision: updated_at is stored truncated
// to ms, and both DBs round-trip that exactly.
func isStale(current, client time.Time) bool {
	return !current.Truncate(time.Millisecond).Equal(client.Truncate(time.Millisecond))
}

// safeIdent guards column names that are joined into SQL. They come from
// Kind.Columns (written in code); this stops a future Kind from leaking
// data-derived names into a query.
var safeIdent = regexp.MustCompile(`^[a-z_]+$`)

func likeContains(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(strings.ToLower(s)) + "%"
}
