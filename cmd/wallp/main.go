// Command wallp runs the API server and admin tasks.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/config"
	"github.com/heinthant/wallp-backend/internal/db"
	"github.com/heinthant/wallp-backend/internal/model"
	"github.com/heinthant/wallp-backend/internal/server"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, nil)))
	root := &cobra.Command{Use: "wallp", Short: "wallp API server and admin tasks", SilenceUsage: true}
	root.AddCommand(serveCmd(), migrateCmd(), userCmd(), openapiCmd(), importCmd())
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func deps(ctx context.Context, migrate bool) (*api.Deps, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	bdb, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if migrate {
		if err := db.Migrate(ctx, bdb); err != nil {
			return nil, fmt.Errorf("migrate: %w", err)
		}
	}
	return &api.Deps{Cfg: cfg, DB: bdb, Auth: &auth.Service{DB: bdb, Secret: []byte(cfg.JWTSecret),
		AccessTTL: cfg.AccessTokenTTL, RefreshTTL: cfg.RefreshTokenTTL, Issuer: cfg.TOTPIssuer}}, nil
}

func serveCmd() *cobra.Command {
	return &cobra.Command{Use: "serve", Short: "Run the HTTP server (applies migrations first)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			d, err := deps(ctx, true)
			if err != nil {
				return err
			}
			defer d.DB.Close()
			handler, _ := server.New(d)
			srv := &http.Server{Addr: d.Cfg.HTTPAddr, Handler: handler, ReadHeaderTimeout: 10 * time.Second}
			go func() {
				<-ctx.Done()
				sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				_ = srv.Shutdown(sctx)
			}()
			slog.Info("listening", "addr", d.Cfg.HTTPAddr, "db", d.DB.Dialect().Name().String())
			if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				return err
			}
			return nil
		}}
}

func migrateCmd() *cobra.Command {
	c := &cobra.Command{Use: "migrate", Short: "Database migrations"}
	c.AddCommand(&cobra.Command{Use: "up", RunE: func(cmd *cobra.Command, _ []string) error {
		_, err := deps(cmd.Context(), true)
		return err
	}}, &cobra.Command{Use: "down", Short: "Undo the last migration group", RunE: func(cmd *cobra.Command, _ []string) error {
		d, err := deps(cmd.Context(), false)
		if err != nil {
			return err
		}
		return db.Rollback(cmd.Context(), d.DB)
	}})
	return c
}

func userCmd() *cobra.Command {
	c := &cobra.Command{Use: "user", Short: "Dashboard users"}
	var email, name, role string
	create := &cobra.Command{Use: "create", Short: "Create a dashboard user (password read from stdin or prompt)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			d, err := deps(cmd.Context(), true)
			if err != nil {
				return err
			}
			pw, err := readPassword()
			if err != nil {
				return err
			}
			u, err := api.CreateAdminUser(cmd.Context(), d.DB, email, name, pw, role)
			if err != nil {
				return err
			}
			fmt.Printf("created %s (%s)\n", u.Email, u.Role)
			return nil
		}}
	create.Flags().StringVar(&email, "email", "", "email (required)")
	create.Flags().StringVar(&name, "name", "Admin", "display name")
	create.Flags().StringVar(&role, "role", model.RoleAdmin, "admin|designer|reviewer|viewer")
	_ = create.MarkFlagRequired("email")
	c.AddCommand(create)
	return c
}

func readPassword() (string, error) {
	if term.IsTerminal(int(os.Stdin.Fd())) {
		fmt.Fprint(os.Stderr, "Password: ")
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		return string(b), err
	}
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func openapiCmd() *cobra.Command {
	return &cobra.Command{Use: "openapi", Short: "Print the OpenAPI 3.1 spec as JSON",
		RunE: func(cmd *cobra.Command, _ []string) error {
			os.Setenv("DATABASE_URL", "file::memory:")
			gin.SetMode(gin.ReleaseMode)
			d, err := deps(cmd.Context(), false)
			if err != nil {
				return err
			}
			_, h := server.New(d)
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(h.OpenAPI())
		}}
}

func importCmd() *cobra.Command {
	var dir string
	c := &cobra.Command{
		Use:   "import",
		Short: "Import catalog and themes from a directory",
		RunE: func(cmd *cobra.Command, _ []string) error {
			d, err := deps(cmd.Context(), true)
			if err != nil {
				return err
			}
			defer d.DB.Close()
			res, err := api.RunImportDir(cmd.Context(), d, dir, "cli")
			if err != nil {
				return err
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(res)
		},
	}
	c.Flags().StringVar(&dir, "dir", "", "path to catalog directory (required)")
	_ = c.MarkFlagRequired("dir")
	return c
}
