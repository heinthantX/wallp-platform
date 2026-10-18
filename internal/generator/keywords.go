package generator

import (
	_ "embed"
	"encoding/json"
	"sort"
	"strings"
	"unicode/utf8"
)

//go:embed keywords.json
var embeddedKeywordsJSON []byte

var embeddedKeywordEntries []KeywordEntry

func init() {
	if err := json.Unmarshal(embeddedKeywordsJSON, &embeddedKeywordEntries); err != nil {
		panic("failed to unmarshal embedded keywords.json: " + err.Error())
	}
}

// WordList contains English and Myanmar words for a keyword entry.
type WordList struct {
	EN []string `json:"en,omitempty"`
	MY []string `json:"my,omitempty"`
}

// KeywordEntry defines an entry mapping words to generator parameters.
type KeywordEntry struct {
	Words     WordList    `json:"words"`
	Mood      string      `json:"mood,omitempty"`
	HueRange  *[2]float64 `json:"hueRange,omitempty"`
	Chroma    *Range      `json:"chroma,omitempty"`
	Particles *string     `json:"particles,omitempty"`
	Motif     *string     `json:"motif,omitempty"`
	Tags      []string    `json:"tags,omitempty"`
}

// Interpretation represents extracted theme parameters from a description.
type Interpretation struct {
	Mood      string       `json:"mood,omitempty"`
	HueRanges [][2]float64 `json:"hueRanges,omitempty"`
	Particles []string     `json:"particles,omitempty"`
	Motifs    []string     `json:"motifs,omitempty"`
	Tags      []string     `json:"tags,omitempty"`
	Matched   []string     `json:"matched"`
}

type matchCandidate struct {
	word  string
	entry KeywordEntry
}

// Interpret analyzes a text description and returns inferred generator attributes.
// Matching is case-insensitive, supports Myanmar substring matching,
// evaluates longest match first, and merges extra keyword entries on top of embedded ones.
func Interpret(description string, extra []KeywordEntry) Interpretation {
	res := Interpretation{
		HueRanges: [][2]float64{},
		Particles: []string{},
		Motifs:    []string{},
		Tags:      []string{},
		Matched:   []string{},
	}

	trimmedDesc := strings.TrimSpace(description)
	if trimmedDesc == "" {
		return res
	}
	descLower := strings.ToLower(trimmedDesc)

	// Combine extra first so they take precedence over embedded keywords
	var allEntries []KeywordEntry
	allEntries = append(allEntries, extra...)
	allEntries = append(allEntries, embeddedKeywordEntries...)

	var candidates []matchCandidate
	seenWords := make(map[string]bool)

	for _, entry := range allEntries {
		for _, w := range entry.Words.EN {
			wTrim := strings.TrimSpace(w)
			wLower := strings.ToLower(wTrim)
			if wLower != "" && !seenWords[wLower] {
				seenWords[wLower] = true
				candidates = append(candidates, matchCandidate{word: wTrim, entry: entry})
			}
		}
		for _, w := range entry.Words.MY {
			wTrim := strings.TrimSpace(w)
			wLower := strings.ToLower(wTrim)
			if wLower != "" && !seenWords[wLower] {
				seenWords[wLower] = true
				candidates = append(candidates, matchCandidate{word: wTrim, entry: entry})
			}
		}
	}

	// Longest match first (in rune count)
	sort.SliceStable(candidates, func(i, j int) bool {
		li := utf8.RuneCountInString(candidates[i].word)
		lj := utf8.RuneCountInString(candidates[j].word)
		if li != lj {
			return li > lj
		}
		return candidates[i].word < candidates[j].word
	})

	tagSet := make(map[string]bool)
	particleSet := make(map[string]bool)
	motifSet := make(map[string]bool)
	matchedSet := make(map[string]bool)

	for _, cand := range candidates {
		candLower := strings.ToLower(cand.word)
		if strings.Contains(descLower, candLower) {
			if !matchedSet[cand.word] {
				matchedSet[cand.word] = true
				res.Matched = append(res.Matched, cand.word)

				if res.Mood == "" && cand.entry.Mood != "" {
					res.Mood = cand.entry.Mood
				}

				if cand.entry.HueRange != nil {
					res.HueRanges = append(res.HueRanges, *cand.entry.HueRange)
				}

				if cand.entry.Particles != nil && *cand.entry.Particles != "" {
					p := *cand.entry.Particles
					if !particleSet[p] {
						particleSet[p] = true
						res.Particles = append(res.Particles, p)
					}
				}

				if cand.entry.Motif != nil && *cand.entry.Motif != "" {
					m := *cand.entry.Motif
					if !motifSet[m] {
						motifSet[m] = true
						res.Motifs = append(res.Motifs, m)
					}
				}

				for _, t := range cand.entry.Tags {
					tLow := strings.ToLower(t)
					if !tagSet[tLow] {
						tagSet[tLow] = true
						res.Tags = append(res.Tags, t)
					}
				}
			}
		}
	}

	return res
}
