package main

import (
	"bytes"
	"os"
	"path/filepath"
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
