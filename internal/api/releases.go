package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/checks"
	"github.com/heinthant/wallp-backend/internal/model"
	"github.com/heinthant/wallp-backend/internal/releases"
)

// CheckerFunc is the pre-publish check, or one that finds nothing when unset.
func (d *Deps) CheckerFunc() releases.Checker {
	if d.Checker != nil {
		return d.Checker
	}
	return func(context.Context) (checks.Report, error) { return checks.Report{}, nil }
}

type ReleaseView struct {
	Version       string          `json:"version"`
	Status        string          `json:"status"`
	Current       bool            `json:"current"`
	Notes         string          `json:"notes"`
	Summary       json.RawMessage `json:"summary" doc:"What changed, e.g. {\"text\":\"+2 themes, 1 banner edited\"}"`
	Manifest      json.RawMessage `json:"manifest"`
	CatalogSHA256 string          `json:"catalogSha256"`
	CreatedBy     string          `json:"createdBy"`
	PublishedAt   time.Time       `json:"publishedAt"`
}

func toReleaseView(r *model.Release) ReleaseView {
	return ReleaseView{Version: r.Version, Status: r.Status, Current: r.Current, Notes: r.Notes,
		Summary: json.RawMessage(r.Changes), Manifest: json.RawMessage(r.Manifest), CatalogSHA256: r.CatalogSHA256,
		CreatedBy: r.PublishedBy, PublishedAt: r.PublishedAt}
}

type ListReleasesInput struct{ ListParams }
type ListReleasesOutput struct{ Body Page[ReleaseView] }

type PublishInput struct {
	Body struct {
		Notes       string `json:"notes,omitempty" maxLength:"2000"`
		AckWarnings bool   `json:"ackWarnings,omitempty" doc:"Set after reviewing the check warnings"`
	} `required:"false"`
}
type ReleaseOutput struct{ Body ReleaseView }

type ReleaseVersionInput struct {
	Version string `path:"version" pattern:"^\\d{4}-\\d{2}-\\d{2}\\.\\d+$"`
}

var releaseSorts = map[string]string{"publishedAt": "published_at", "version": "version"}

func registerReleases(h huma.API, d *Deps) {
	tags := []string{"Releases"}

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "list-releases", Method: http.MethodGet,
		Path: adminPrefix + "/releases", Summary: "Release history", Tags: tags}),
		func(ctx context.Context, in *ListReleasesInput) (*ListReleasesOutput, error) {
			var rows []model.Release
			q, err := paginate(d.DB.NewSelect().Model(&rows), in.ListParams, releaseSorts, "-publishedAt")
			if err != nil {
				return nil, err
			}
			total, err := q.ScanAndCount(ctx)
			if err != nil {
				return nil, err
			}
			out := &ListReleasesOutput{Body: Page[ReleaseView]{Items: []ReleaseView{}, Total: int(total), Page: in.Page, PerPage: in.PerPage}}
			for i := range rows {
				out.Body.Items = append(out.Body.Items, toReleaseView(&rows[i]))
			}
			return out, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "get-release", Method: http.MethodGet,
		Path: adminPrefix + "/releases/{version}", Summary: "One release with its manifest", Tags: tags}),
		func(ctx context.Context, in *ReleaseVersionInput) (*ReleaseOutput, error) {
			var r model.Release
			err := d.DB.NewSelect().Model(&r).Where("target = ?", model.TargetLive).Where("version = ?", in.Version).Scan(ctx)
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Release")
			}
			if err != nil {
				return nil, err
			}
			return &ReleaseOutput{Body: toReleaseView(&r)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "publish-release", Method: http.MethodPost,
		Path: adminPrefix + "/releases", Summary: "Publish a release",
		Description: "Runs the checks (422 checks_failed on errors, 409 warnings_need_ack unless ackWarnings), then writes the theme files, the catalog and the manifest. 409 publish_in_progress if another publish is running.",
		Tags:        tags, DefaultStatus: http.StatusCreated}, model.RoleAdmin, model.RoleReviewer),
		func(ctx context.Context, in *PublishInput) (*ReleaseOutput, error) {
			actor := "system"
			if me := auth.From(ctx); me != nil {
				actor = me.Name
			}
			r, err := releases.Publish(ctx, d.DB, d.Cfg.StorageDir, actor, in.Body.Notes, d.CheckerFunc(), in.Body.AckWarnings)
			if err != nil {
				return nil, err
			}
			return &ReleaseOutput{Body: toReleaseView(r)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "rollback-release", Method: http.MethodPost,
		Path: adminPrefix + "/releases/{version}/rollback", Summary: "Make an earlier release live again",
		Description: "Rewrites manifest.json from that release. Items keep their current state.", Tags: tags}, model.RoleAdmin),
		func(ctx context.Context, in *ReleaseVersionInput) (*ReleaseOutput, error) {
			r, err := releases.Rollback(ctx, d.DB, d.Cfg.StorageDir, in.Version)
			if err != nil {
				return nil, err
			}
			return &ReleaseOutput{Body: toReleaseView(r)}, nil
		})
}
