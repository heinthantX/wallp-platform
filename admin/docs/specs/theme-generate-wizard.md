# Theme generate wizard

Admin page `/themes/generate/` that turns inputs into a saved theme using the backend's deterministic generator. No AI calls.

## Architecture
- Page: `src/app/(app)/themes/generate/page.tsx`.
- Components: `src/components/generator/*` (stepper, option cards, swatches, check chips, photo drop zone, breed grid).
- State helpers: `src/lib/generator/history.ts` (per-slot undo and redo), `src/lib/generator/locks.ts` (swatch lock state).
- API: `src/lib/api/hooks/useGenerate.ts` calls the generate, interpret, from-image, breed and feedback endpoints using generated types.
- Backend contract: `docs/specs/theme-generator.md` in the backend repo.

## Core Flows
- Step 1, inputs: festival, mood, base colour, engine, recipe, description, seed, learn-bias switch.
- Description is interpreted live (debounced) through the interpret endpoint. Matched terms show as chips the user can remove.
- Photo drop zone (drag, drop, paste): extracted swatches appear; clicking a swatch sets the base colour.
- Step 2, options: six option cards from one generate call. Each shows its checks. Amber chips for `similar_to`, `cvd_accents_close` and `scene_cost`. Lock icon per swatch; Shuffle respects locks.
- Breed: select two options, or two existing themes from the list (`?breed=a,b`), to open a breed grid of children.
- Step 3, use: "Use this theme" posts the chosen `data` with `generatedFrom`, then opens the theme. Use sends an `accepted` feedback event; Shuffle sends `shuffled` for the replaced slot.
- Shuffle regenerates one slot with `count=1` and a new seed.
- More like this sends the option palette as `around`.
- Prefill: query params fill step 1, so the editor's "Regenerate from saved inputs" link works.

## Edge Cases
- Locks are kept exactly. An impossible lock shows the backend's failed check message.
- Generation failure keeps the previous six options on screen.
- `no_fonts` links to `/settings/import/`.
- Learn-bias switch controls only sampling: off means generation ignores feedback history. Feedback telemetry still posts.

## Autonomous UX Polish
- Animated stepper, reduced-motion aware.
- Slot-level skeletons so one reshuffle does not shift the layout.
- Keys: `1-6` select, `R` reshuffle, `B` breed, `Esc` back.
- Undo `Cmd+Z`, redo `Shift+Cmd+Z` per slot.
- `Cmd+K` has "Generate theme"; the Themes header has a "Generate" button.
- Theme editor shows a "Generated" badge when `generatedFrom` is set.
- Reducer tests cover lock and undo state.
