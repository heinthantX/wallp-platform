package apierr

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
)

// M2: 5xx bodies never carry the underlying error.
func TestServerErrorHasNoDetails(t *testing.T) {
	Install()
	e := huma.NewError(http.StatusInternalServerError, "unexpected error occurred", errors.New("pq: password for /var/db/secret failed")).(*Error)
	if e.Err.Message != "Something went wrong. Try again." || len(e.Err.Details) != 0 || strings.Contains(e.Err.Message, "secret") {
		t.Fatalf("leaked: %+v", e.Err)
	}
}
