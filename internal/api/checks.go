package api

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/checks"
	"github.com/heinthant/wallp-backend/internal/model"
)

type CheckReleaseOutput struct {
	Body checks.Report
}

func registerChecks(h huma.API, d *Deps) {
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "check-release",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/releases/check",
		Summary:     "Run every pre-publish check",
		Description: "Checks the release candidate set (published items plus approved items whose schedule is due). Errors block publishing; warnings need an acknowledgement.",
		Tags:        []string{"Releases"},
	}, model.RoleReviewer), func(ctx context.Context, _ *struct{}) (*CheckReleaseOutput, error) {
		rep, err := checks.Run(ctx, d.DB, d.Cfg.StorageDir)
		if err != nil {
			return nil, err
		}
		return &CheckReleaseOutput{Body: rep}, nil
	})
}
