package api

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

type HealthOutput struct {
	Body struct {
		Status   string `json:"status" example:"ok"`
		Database string `json:"database" example:"pg"`
	}
}

func registerHealth(h huma.API, d *Deps) {
	huma.Register(h, huma.Operation{OperationID: "health", Method: http.MethodGet, Path: "/healthz",
		Summary: "Liveness and database check", Tags: []string{"System"}},
		func(ctx context.Context, _ *struct{}) (*HealthOutput, error) {
			if err := d.DB.PingContext(ctx); err != nil {
				return nil, huma.Error503ServiceUnavailable("database unreachable")
			}
			out := &HealthOutput{}
			out.Body.Status, out.Body.Database = "ok", d.DB.Dialect().Name().String()
			return out, nil
		})
}
