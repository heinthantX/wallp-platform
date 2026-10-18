package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// JSON is raw JSON stored as jsonb on Postgres and text on SQLite.
// It keeps the bytes as written, so exported items match what was saved.
type JSON json.RawMessage

func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSON) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = JSON(v)
	default:
		return fmt.Errorf("model.JSON: cannot scan %T", src)
	}
	return nil
}

func (j JSON) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSON) UnmarshalJSON(b []byte) error {
	*j = append((*j)[:0], b...)
	return nil
}

// MustJSON marshals v; for values that always marshal (maps, structs).
func MustJSON(v any) JSON {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
