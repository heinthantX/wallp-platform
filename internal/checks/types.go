package checks

// Issue is one finding of a pre-publish check.
type Issue struct {
	Code     string `json:"code"`
	Level    string `json:"level"`
	Message  string `json:"message"`
	ItemType string `json:"itemType,omitempty"`
	ItemID   string `json:"itemId,omitempty"`
	Field    string `json:"field,omitempty"`
}

// Report groups issues by level. Errors block publishing; warnings need an acknowledgement.
type Report struct {
	Errors   []Issue `json:"errors"`
	Warnings []Issue `json:"warnings"`
	Infos    []Issue `json:"infos"`
}
