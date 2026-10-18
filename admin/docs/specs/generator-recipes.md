# Generator recipes

Admin list and editor for generator recipes at `/generator/recipes`. Backend contract: `docs/specs/theme-generator.md` in the backend repo.

## Architecture
- Pages: list and editor. Editor has a form tab and a JSON tab, a live six-option preview grid on the right, and a hue wheel with draggable hue ranges.
- Calls `GET|POST /admin/v1/generator/recipes`, `GET|PATCH|DELETE /admin/v1/generator/recipes/{id}`, `POST /admin/v1/generator/recipes/{id}/preview`.
- Recipe fields: festivalIds, tags, moods, hueRanges, chroma, accentHues, motifs, particles, layerTemplates, fontTags, eventIcon, nameWords, keywords, costBudget (default 200).
- Four seed recipes (halloween, christmas, thingyan, default) are inserted by migration and editable like any other.

## Core Flows
- List shows name, festivals, enabled state. Create opens a blank editor.
- Editing a field refreshes the six-option preview (debounced) by calling the preview endpoint.
- Dragging a hue range on the wheel updates the numeric range fields and the other way round.
- Save persists the recipe. Disabled recipes are not chosen as the default for a festival.
- The wizard receives recipes through the generate call (`recipeId`).

## Edge Cases
- Hue ranges may wrap past 360; the editor accepts that and shows the wrapped arc.
- Invalid JSON in the JSON tab shows an inline error and blocks switching back to the form.
- Missing required fields return 422 with the field path, shown next to the input.
- Delete requires admin; designers see the button disabled with the reason.

## Autonomous UX Polish
- Skeleton preview grid while the preview request runs, so the layout holds.
- Hue wheel drag is keyboard-accessible with arrow keys.
- Preview result cards animate in; reduced-motion disables it.
- Form and JSON tabs stay in sync when switching.
