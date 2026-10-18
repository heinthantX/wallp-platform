package migrations

import (
	"context"
	"time"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/model"
)

var up0003 = `create table generator_recipes (
  id text primary key,
  name text not null,
  festival_id text,
  data {json} not null,
  enabled boolean not null default true,
  created_by text not null,
  updated_by text not null,
  created_at {ts} not null,
  updated_at {ts} not null
);
create index generator_recipes_festival_idx on generator_recipes (festival_id);
create index generator_recipes_enabled_idx on generator_recipes (enabled);
create table generator_feedback (
  id {serial_pk},
  user_id text,
  festival_id text,
  mood text not null default '',
  recipe_id text,
  seed bigint not null default 0,
  palette {json} not null,
  hue double precision not null default 0,
  action text not null,
  at {ts} not null
);
create index generator_feedback_festival_mood_idx on generator_feedback (festival_id, mood);
create index generator_feedback_at_idx on generator_feedback (at)`

var down0003 = `drop table if exists generator_feedback;
drop table if exists generator_recipes`

var seedHalloween = `{
  "id": "halloween",
  "name": "Halloween",
  "festivalIds": ["halloween"],
  "tags": ["halloween", "spooky"],
  "moods": ["classic", "cozy", "minimal", "cute"],
  "hueRanges": [[20, 50], [270, 310]],
  "chroma": {"min": 0.05, "max": 0.20},
  "accentHues": "complementary",
  "motifs": [{"shape": "circle", "preset": "moon", "glow": true}],
  "particles": [{"effect": "bats", "countRange": [30, 90]}],
  "fontTags": {"display": ["halloween", "spooky"], "body": ["clean"], "labels": ["display"]},
  "eventIcon": "nightlight_round",
  "nameWords": {"en": ["Spooky", "Shadow", "Night", "Eerie", "Twilight", "Crypt"]},
  "keywords": {"en": ["halloween", "spooky", "bats", "ghost", "pumpkin"], "my": ["ဟယ်လိုဝင်း", "သရဲ"]},
  "costBudget": 200
}`

var seedChristmas = `{
  "id": "christmas",
  "name": "Christmas",
  "festivalIds": ["christmas"],
  "tags": ["christmas", "winter", "holiday"],
  "moods": ["classic", "cozy", "minimal", "cute"],
  "hueRanges": [[345, 25], [120, 160]],
  "chroma": {"min": 0.04, "max": 0.18},
  "accentHues": "complementary",
  "motifs": [{"shape": "circle", "preset": "star", "glow": true}],
  "particles": [{"effect": "snow", "countRange": [40, 100]}],
  "fontTags": {"display": ["classic", "festive"], "body": ["clean"], "labels": ["display"]},
  "eventIcon": "ac_unit_rounded",
  "nameWords": {"en": ["Festive", "Cozy", "Frost", "Hearth", "Ember", "Carol"]},
  "keywords": {"en": ["christmas", "winter", "holiday", "snow", "frost"], "my": ["ခရစ္စမတ်", "နှင်း"]},
  "costBudget": 200
}`

var seedThingyan = `{
  "id": "thingyan",
  "name": "Thingyan",
  "festivalIds": ["thingyan"],
  "tags": ["thingyan", "water", "myanmar"],
  "moods": ["classic", "cozy", "minimal", "cute"],
  "hueRanges": [[190, 230], [50, 80]],
  "chroma": {"min": 0.06, "max": 0.22},
  "accentHues": "analogous",
  "motifs": [{"shape": "circle", "preset": "sun", "glow": true}],
  "particles": [{"effect": "drops", "countRange": [40, 90]}],
  "fontTags": {"display": ["rounded", "cute"], "body": ["myanmar", "clean"], "labels": ["display"]},
  "eventIcon": "water_drop_rounded",
  "nameWords": {"en": ["Splash", "Breeze", "Padauk", "Cascade", "Droplet", "Joy"]},
  "keywords": {"en": ["thingyan", "water", "splash", "padauk", "summer"], "my": ["သင်္ကြန်", "ရေ", "ပိတောက်"]},
  "costBudget": 200
}`

var seedDefault = `{
  "id": "default",
  "name": "Default",
  "festivalIds": [],
  "tags": ["default", "layers"],
  "moods": ["classic", "cozy", "minimal", "cute"],
  "hueRanges": [[0, 360]],
  "chroma": {"min": 0.02, "max": 0.16},
  "accentHues": "complementary",
  "motifs": [{"shape": "circle", "preset": "moon", "glow": true}],
  "particles": [{"effect": "stars", "countRange": [30, 80]}],
  "fontTags": {"display": ["display"], "body": ["clean"], "labels": ["clean"]},
  "eventIcon": "celebration_rounded",
  "nameWords": {"en": ["Simplicity", "Still", "Clarity", "Essence", "Zenith", "Breeze"]},
  "keywords": {"en": ["default", "stars", "glow"], "my": ["ရိုးရှင်း"]},
  "costBudget": 200
}`

func strPtr(s string) *string {
	return &s
}

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		if err := exec(ctx, db, up0003); err != nil {
			return err
		}

		now := time.Now().UTC()
		seedRows := []model.GeneratorRecipe{
			{
				ID:         "halloween",
				Name:       "Halloween",
				FestivalID: strPtr("halloween"),
				Data:       model.JSON(seedHalloween),
				Enabled:    true,
				CreatedBy:  "system",
				UpdatedBy:  "system",
				CreatedAt:  now,
				UpdatedAt:  now,
			},
			{
				ID:         "christmas",
				Name:       "Christmas",
				FestivalID: strPtr("christmas"),
				Data:       model.JSON(seedChristmas),
				Enabled:    true,
				CreatedBy:  "system",
				UpdatedBy:  "system",
				CreatedAt:  now,
				UpdatedAt:  now,
			},
			{
				ID:         "thingyan",
				Name:       "Thingyan",
				FestivalID: strPtr("thingyan"),
				Data:       model.JSON(seedThingyan),
				Enabled:    true,
				CreatedBy:  "system",
				UpdatedBy:  "system",
				CreatedAt:  now,
				UpdatedAt:  now,
			},
			{
				ID:         "default",
				Name:       "Default",
				FestivalID: nil,
				Data:       model.JSON(seedDefault),
				Enabled:    true,
				CreatedBy:  "system",
				UpdatedBy:  "system",
				CreatedAt:  now,
				UpdatedAt:  now,
			},
		}

		_, err := db.NewInsert().Model(&seedRows).Exec(ctx)
		return err
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, down0003)
	})
}
