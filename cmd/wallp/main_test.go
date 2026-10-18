package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestImportCmd(t *testing.T) {
	mockCatalogDir := "/Users/heinthant/Development/wallp/wallp/assets/mock/catalog/v1"
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skip("mock catalog missing")
	}

	dbPath := filepath.Join(t.TempDir(), "test_cli.db")
	t.Setenv("DATABASE_URL", "file:"+dbPath)
	t.Setenv("STORAGE_DIR", filepath.Join(t.TempDir(), "storage"))
	t.Setenv("JWT_SECRET", "very-secret-test-jwt-key-with-over-32-characters!")

	// 1. Missing --dir flag returns error
	cmd := importCmd()
	cmd.SetArgs([]string{})
	if err := cmd.Execute(); err == nil {
		t.Fatal("expected error when --dir flag is missing")
	}

	// 2. Non-existent dir returns error
	cmd = importCmd()
	cmd.SetArgs([]string{"--dir", "/nonexistent/mock/dir"})
	if err := cmd.Execute(); err == nil {
		t.Fatal("expected error when --dir does not exist")
	}

	// 3. Valid import executes successfully
	var out bytes.Buffer
	cmd = importCmd()
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"--dir", mockCatalogDir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("importCmd failed on mock dir: %v", err)
	}
}

func TestSeedImportAndPublish(t *testing.T) {
	t.Setenv("DATABASE_URL", "file:"+filepath.Join(t.TempDir(), "seed.db"))
	storage := filepath.Join(t.TempDir(), "storage")
	t.Setenv("STORAGE_DIR", storage)
	t.Setenv("JWT_SECRET", "very-secret-test-jwt-key-with-over-32-characters!")

	imp := importCmd()
	imp.SetOut(&bytes.Buffer{})
	imp.SetArgs([]string{"--dir", "../../seed/catalog/v1"})
	if err := imp.Execute(); err != nil {
		t.Fatal(err)
	}

	d, err := deps(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	rep, err := d.CheckerFunc()(context.Background())
	d.DB.Close()
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Errors) != 0 {
		t.Fatalf("check errors: %+v", rep.Errors)
	}
	var codes []string
	for _, w := range rep.Warnings {
		codes = append(codes, w.Code)
	}
	sort.Strings(codes)
	want := "festival_few_dates festival_few_dates theme_no_preview theme_no_preview theme_no_preview theme_no_preview theme_no_preview"
	if got := strings.Join(codes, " "); got != want {
		t.Fatalf("warnings: %s", got)
	}

	pub := publishCmd()
	var out bytes.Buffer
	pub.SetOut(&out)
	pub.SetArgs([]string{"--notes", "seed", "--ack-warnings"})
	if err := pub.Execute(); err != nil {
		t.Fatalf("publish: %v", err)
	}

	dir := filepath.Join(storage, "catalog", "v1")
	mb, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var man struct {
		Catalog string `json:"catalog"`
	}
	if err := json.Unmarshal(mb, &man); err != nil {
		t.Fatal(err)
	}
	cb, err := os.ReadFile(filepath.Join(dir, man.Catalog))
	if err != nil {
		t.Fatal(err)
	}
	var cat struct {
		Themes []json.RawMessage `json:"themes"`
	}
	if err := json.Unmarshal(cb, &cat); err != nil {
		t.Fatal(err)
	}
	if len(cat.Themes) != 5 {
		t.Fatalf("want 5 themes, got %d", len(cat.Themes))
	}
	files, _ := filepath.Glob(filepath.Join(dir, "themes", "christmas-eve.*.json"))
	if len(files) != 1 {
		t.Fatalf("christmas-eve theme files: %v", files)
	}
	tb, _ := os.ReadFile(files[0])
	for _, hex := range []string{"#F03F5C", "#2C966B"} {
		if !strings.Contains(strings.ToUpper(string(tb)), hex) {
			t.Errorf("christmas-eve missing fixed accent %s", hex)
		}
	}
}
