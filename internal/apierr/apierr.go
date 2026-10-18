// Package apierr gives every error response one shape (dashboard doc §7):
//
//	{ "error": { "code": "contrast_too_low", "message": "…", "field": "palette.text" } }
package apierr

import (
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
)

type Detail struct {
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
}

type ErrorBody struct {
	Code    string   `json:"code" example:"not_found"`
	Message string   `json:"message" example:"Theme not found"`
	Field   string   `json:"field,omitempty" example:"palette.text"`
	Details []Detail `json:"details,omitempty"`
}

type Error struct {
	status int
	Err    ErrorBody `json:"error"`
}

func (e *Error) Error() string  { return e.Err.Message }
func (e *Error) GetStatus() int { return e.status }

// New makes an error with an explicit machine-readable code.
func New(status int, code, msg string) *Error {
	return &Error{status: status, Err: ErrorBody{Code: code, Message: msg}}
}

// WithField points the error at a form input.
func (e *Error) WithField(f string) *Error { e.Err.Field = f; return e }

func NotFound(what string) *Error { return New(http.StatusNotFound, "not_found", what+" not found") }
func Forbidden(msg string) *Error { return New(http.StatusForbidden, "forbidden", msg) }
func Conflict(code, msg string) *Error {
	return New(http.StatusConflict, code, msg)
}
func Invalid(field, msg string) *Error {
	return New(http.StatusUnprocessableEntity, "invalid", msg).WithField(field)
}
func Unauthorized(msg string) *Error {
	return New(http.StatusUnauthorized, "unauthorized", msg)
}

var codes = map[int]string{
	http.StatusBadRequest:            "bad_request",
	http.StatusUnauthorized:          "unauthorized",
	http.StatusForbidden:             "forbidden",
	http.StatusNotFound:              "not_found",
	http.StatusMethodNotAllowed:      "method_not_allowed",
	http.StatusConflict:              "conflict",
	http.StatusRequestEntityTooLarge: "too_large",
	http.StatusUnprocessableEntity:   "validation_failed",
	http.StatusTooManyRequests:       "rate_limited",
	http.StatusInternalServerError:   "internal",
}

// Install replaces Huma's default error type, so validation and framework
// errors use the same shape as ours.
func Install() {
	huma.NewError = func(status int, msg string, errs ...error) huma.StatusError {
		e := &Error{status: status, Err: ErrorBody{Code: codes[status], Message: msg}}
		if e.Err.Code == "" {
			e.Err.Code = strings.ToLower(strings.ReplaceAll(http.StatusText(status), " ", "_"))
		}
		for _, err := range errs {
			var d huma.ErrorDetailer
			if errors.As(err, &d) {
				ed := d.ErrorDetail()
				e.Err.Details = append(e.Err.Details, Detail{Field: cleanField(ed.Location), Message: ed.Message})
			} else if err != nil {
				e.Err.Details = append(e.Err.Details, Detail{Message: err.Error()})
			}
		}
		if len(e.Err.Details) > 0 {
			e.Err.Field = e.Err.Details[0].Field
			if status == http.StatusUnprocessableEntity && e.Err.Details[0].Message != "" {
				e.Err.Message = e.Err.Details[0].Message
			}
		}
		return e
	}
}

func cleanField(loc string) string {
	return strings.TrimPrefix(loc, "body.")
}
