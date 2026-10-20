# AI creation (optional) and per-app icon packs

AI is optional (user, 2026-10-19). Every provider sits behind its own env key; with zero keys the dashboard is fully functional. This supersedes theme-generator.md "Zero AI/API cost: no LLM anywhere (locked 2026-10-18)": the generator itself stays deterministic, and AI only adds optional fillers on top.

Source: 2-runner design panel (opus, sonnet), synthesized 2026-10-19.

## Locked rules
- No key means no AI call. Any AI endpoint without its key returns **501** `ai_not_configured` naming the missing env keys. The admin hides or disables AI buttons and shows that reason.
- An LLM never picks final hex. Mood words or seeds go through the OKLCH nudger and checks.
- Prompts ask for the app's **purpose** as a festive object ("a map pin with a holly sprig"), never its logo. Redrawing the Maps, WhatsApp or Instagram logo is a trademark problem on any provider, AI or human.
- Send providers only theme descriptions, never user data (free tiers may log or train on prompts).

## Provider facts (searched 2026-10-19)
| Provider | Free tier | Licensing / data | Sources |
|---|---|---|---|
| OpenRouter `:free` (text only) | 20 req/min; 50 req/day, or 1,000/day after a lifetime $10 top-up; account-wide; resets 00:00 UTC; a negative balance returns 402 even on free models. Free list churns weekly (19 models on Oct 5, 15 on Oct 14), so discover via `GET /api/v1/models` with `pricing.prompt == "0"` or the `openrouter/free` router; never hard-code an id. **Unverified, check official page** | Per upstream model; free providers may log prompts | https://openrouter.ai/docs/api-reference/limits (official), https://www.truefoundry.com/es/blog/openrouter-rate-limits-your-free-tier-depends-on-what-youve-already-paid, https://pinggy.io/blog/free_ai_model_apis_unlimited_tokens_openrouter/, https://openrouter.ai/blog/tutorials/free-llm-apis-compared/ |
| Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell` | 10,000 Neurons/day, resets 00:00 UTC, fails past the cap with no Paid plan. 4.80 N per 512² tile + 9.60 N per step. Estimate: about 170 images/day at 1024² and 4 steps, about 330/day at 512² | Outputs are Customer Content, not used for training. Model is Apache-2.0 per secondary sources only: **unverified, check the model card** | https://developers.cloudflare.com/workers-ai/platform/pricing/, https://developers.cloudflare.com/workers-ai/platform/data-usage/, https://morphic.com/ai-glossary/flux1-schnell |
| Gemini API | Text: free Flash and Flash-Lite with low, shifting caps. **Images are paid only**: free image quota was cut to 0 on Dec 7 2025. **Unverified, check official page** | Free-tier prompts may train Google models (except EU, CH, UK) | https://discuss.ai.google.dev/t/gemini-api-rate-limits-free-tier/125968, https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026, https://agentdeals.dev/gemini-api-pricing-changes |
| Pollinations.ai (keyless) | About 1 req/15 s for anonymous use | No primary ToS found; output rights unknown | https://toolfreebie.com/?p=333 |

Read limits from official docs when wiring a provider. Never hard-code them in logic.

## Options
- **A. Prompt kit + bulk importer.** The dashboard builds a copy-paste brief from the pack's own data (palette hex, 1024x1024, 66% safe area, edge-to-edge background, no text or logos, one line per app named by package). The user pastes it into any image site they already use, then drops the files back; the importer maps filenames to packages. Zero backend AI.
- **B. OpenRouter free text.** A description goes in; `{names{en,my}, subtitle, tags[], moodWords[]}` comes out. `moodWords` feed the existing `Interpret` as chips.
- **C. Cloudflare Workers AI images.** Server-side flux-schnell from the same brief as A, stored through `POST /admin/v1/assets`.
- **D. Procedural licensed glyphs (no AI).** A per-app-category glyph from Material Symbols (Apache-2.0), Lucide (ISC) or Tabler (MIT) on the pack tile and palette. Rendered either by an admin `<canvas>` with upload, or by the server (merges opus D and sonnet D/F).
- **E. One-shot sprite sheet, auto-sliced.** Generate a 4x4 grid in one go for a consistent style, then slice it with `image.SubImage`.
- **F. Gemini text.** Same as B behind `GEMINI_API_KEY`. Better Burmese, but there is a data-use caveat and no free images.
- **G. Pollinations keyless images.** Rejected: legal and uptime unknown.
- **H. Hybrid ladder.** A is the spine. D, C, B and F are later "fillers" that produce the same files into the same importer.

## Score matrix (1-5, 5 = best; effort 5 = trivial tonight)
| | Cost @0 keys | Free limits | Quality | Latency | Legal | Effort tonight | No-AI fallback |
|---|---|---|---|---|---|---|---|
| A prompt kit + import | 5 | 4 | 4 | 2 | 3 | 4 | 5 |
| B OpenRouter text | 5 | 2 | 3 | 3 | 4 | 3 | 5 |
| C CF Workers AI image | 5 | 3 | 3 | 4 | 3 | 2 | 5 |
| D licensed glyphs | 5 | 5 | 2 | 5 | 5 | 3 | 5 |
| E sprite sheet | 5 | 5 | 3 | 3 | 4 | 2 | 4 |
| F Gemini text | 5 | 3 | 4 | 4 | 3 | 3 | 5 |
| G Pollinations | 4 | 2 | 3 | 2 | 1 | 4 | 5 |
| H hybrid (A tonight) | 5 | 4 | 4 | 2 | 3 | 4 | 5 |

Where the runners disagreed:
- A quality 4 (sonnet), not 5: a 60-image run drifts in style. The frontier-model ceiling does not fix consistency.
- A legal 3 (sonnet), not 4: each site has its own terms (the Ideogram free tier makes images public; Midjourney requires a paid plan for commercial use).
- C limits 3 (sonnet), not 4: opus's 250/day assumed 512² tiles; at 1024² it is about 170.
- C legal 3 (sonnet): the Apache-2.0 claim is secondary only.
- D effort 3 (opus), not 2: vendoring an icon font or SVG set is a data file, not 60 hand-drawn paths.
- B latency 3 (opus), not 4: 2 to 10 s with retries on churned models.

## Winner: H, with only A built tonight (confirmed)
Both runners chose the hybrid with A first. Confirmed: A is the only option that is free, works with 0 keys and has a high quality ceiling, and every later filler plugs into the same importer.
- Overturned: sonnet's "F glyph fallback tonight". The locked fallback chain (per-app image, then pack tile + logo, then painted, then app icon) already covers missing apps, so glyphs add nothing tonight. D moves to deferred.
- Overturned: sonnet's `POST /admin/v1/icon-packs/{id}/import`. Files upload through the existing `POST /admin/v1/assets`, which already handles dedupe, sniffing and caps. P6 owns the import UI.

## Built: P7 part A (wallp-loop-2, 2026-10-19; never needs a key)
Shipped: status endpoint, 501 helper, admin prompt kit, disabled AI placeholders. No provider client exists yet.
1. **Backend `GET /admin/v1/ai/status`** (`internal/api/ai.go`), `auth.Admin(op)` so any role incl. viewer. Booleans plus env key names, never values:
   `{"anyConfigured":false,"providers":[{"id":"openrouter","kind":"text","configured":false,"envKeys":[...]}, cloudflare (image), gemini (text)]}`.
   `configured` is true only when every listed key is non-empty. Table test: no env, one key, partial Cloudflare pair.
2. **501 helper `aiNotConfigured(provider)`**, defined, unused until a provider ships. Uses the standard apierr shape (supersedes the flat body sketched earlier): 501 `{error:{code:"ai_not_configured",message,details:[{field:<each missing env key>}]}}`. Later: provider quota error maps to 429 `ai_quota_exhausted` with `resetAt`.
3. **Admin prompt kit, pure admin (no endpoint)**: `src/lib/prompt-kit.ts`, UI in `src/components/ai/*`. A "Copy prompt kit" button on the icon pack editor and the theme editor (toast on copy). The admin already holds the pack and theme data, so a backend round trip adds nothing.
   - Inputs: pack name, `style`, `tile`/`glyph`/`ring` hex plus the theme accents, and selected apps from the P6 common-app list (default: the missing ones).
   - Output: plain text, a preamble plus one line per app:
     > Icon set, {pack name}, {style} style. One square 1024x1024 PNG per subject. Flat illustration, same light from top-left, same line weight, palette: background {tile}, main {glyph}, detail {accent}. Subject centred inside the middle 66%, background fills edge to edge, no border, no rounded corners, no text, no watermark, no brand logos: draw the app's purpose, not its logo. Save each file under the given name.
     > `com.google.android.apps.maps.png`: a map pin with a holly sprig
   - Tips under the button: approve the first icon, then reuse it as a style reference (chat tools: "match the previous image"; Midjourney: `--sref <url> --ar 1:1`; Ideogram: style-reference upload).
4. **AI buttons** ("Suggest names", "Generate icons") are disabled placeholders with no handler until a provider lands. The disabled reason is exposed accessibly (tooltip plus aria text), e.g. "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN to enable".
5. **Env keys documented** in `.env.example` (names only, empty values) and in `docs/api/admin.md`.

Out of P7: any provider client, model discovery, and the glyph filler.

## Per-app icon pack flow (P6, built; UI in specs/admin-editor-ux.md)
**Data:** `IconPack.apps`: an optional map of Android package name to `Asset`, with `json:"apps,omitempty"`, so old clients ignore it. An optional `appsFallbackStyle` string sets the fallback style. A pack can be partial. No migration. Built check codes are in specs/catalog-format.md; fallback order is in docs/api/app-client.md.

**Backend checks**, per image at the trust boundary, as stable warning/error codes:
- `not_square`: not square within 1%.
- `too_small`: under 192 px.
- `too_large`: over 1 MB.
- `duplicate`: the same sha256 is already mapped to another package in this pack.
- `bad_package`: the key fails `^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$`.
- An `unknown_package` warning (amber, not an error) when the key is valid but not on the common list.
- At most 200 keys. Failures are listed, never silently dropped.

**Common-app list** (about 60, one TS constant `{pkg, label, subject, aliases[], tier, region?}` in the admin):
- Tier 1 (core): Phone `com.google.android.dialer`, Messages `com.google.android.apps.messaging`, Camera, Photos `com.google.android.apps.photos`, Chrome `com.android.chrome`, Gmail `com.google.android.gm`, Maps `com.google.android.apps.maps`, YouTube `com.google.android.youtube`, Play Store `com.android.vending`, Settings `com.android.settings`, Clock, Calendar, WhatsApp `com.whatsapp`, Messenger `com.facebook.orca`, Facebook `com.facebook.katana`, Instagram `com.instagram.android`, TikTok `com.zhiliaoapp.musically`, Telegram `org.telegram.messenger`, Viber `com.viber.voip`, Spotify `com.spotify.music`.
- Tier 2: Contacts, Calculator, Files, Drive, Keep, Meet, Translate, YouTube Music, Netflix, X, Snapchat, Discord, Reddit, LinkedIn, Pinterest, Zoom, Teams, Outlook, ChatGPT, Gemini.
- Tier 3, with `region:"mm"` sorted first: KBZPay, Wave Money, CB Pay, MPT, Grab `com.grabtaxi.passenger`, Shopee, Lazada, Viu, Duolingo, Firefox, Brave.
- OEM variants go in the alias table: `com.samsung.android.dialer`, `com.sec.android.app.camera`, `com.miui.gallery`.
- Runners disagreed on some ids (KBZPay `com.kbzbank.kpaycustomer` vs `com.kbzbank.kbzpay`; camera `com.android.camera` vs `camera2`). Verify every id once against the Play Store `?id=` URL before locking the list.

**Sprite-sheet import (built, admin-only, no AI; realises option E):** one image of white glyphs on a dark solid background, default 8 columns, cells in COMMON_APPS order (51 apps, Phone to Brave). The grid is auto-detected with a fixed-grid fallback, the background becomes alpha, and each cell is uploaded as a 192x192 white PNG to `apps[pkg]` via `POST /admin/v1/assets`. Backend validation no longer requires `background` for kind "images" (background may be null, tile "").

**Admin "Per-app icons" tab** (images packs only):
- A phone-mock grid with a 4x5 home screen per page. Each slot shows the pack image, or the fallback render greyed out.
- A header reads "42 / 60 · 18 missing", with an expandable missing list and "Copy kit for missing only" (from P7).
- Bulk drop zone: multi-file input plus drag-and-drop, up to 4 parallel uploads to `POST /admin/v1/assets`, a skeleton per row, and Retry on failure.
- Mapping table: thumbnail, package, a source chip (`exact` / `alias` / `manual`), and a select for unmatched rows. A second file for the same package replaces the first ("replaced" chip).

**Filename resolve order**:
- Matching is case-insensitive, strips the extension (png/webp/jpg), and strips `@2x` and `-1024` style suffixes.
- Order: (1) the stem equals a package id, (2) the stem matches an alias, (3) unmatched, which keeps the row with a select and the nearest suggestion. No silent fuzzy assignment.
- Alias examples: `maps`, `whatsapp`/`wa`, `youtube`/`yt`, `chrome`, `gmail`, `photos`, `playstore`, `phone`, `messages`, `camera`, `settings`, `clock`, `calc`, `tiktok`, `x`/`twitter`, `ig`/`insta`, `fb`, `messenger`, `kbzpay`.

**App render fallback** (app side, later; theme-api 4.7):
1. Per-app image, clipped to the user's shape with `ring`.
2. Pack tile + the app's logo.
3. Painted style.
4. The stock app icon.
- A failed download falls through to step 2, so one broken file never blanks the home screen.

**Trademark:** the tab, the kit and each list row ask for the app's purpose ("draw a chat bubble with snow"), never its logo. `subject` in the list holds that purpose text.

## Env keys (all optional, independent)
- `OPENROUTER_API_KEY`, plus `OPENROUTER_MODEL` (optional override; default is discovery or `openrouter/free`)
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_TOKEN` (chosen over sonnet's `CF_*` because they are explicit and do not collide with a DNS token)
- `GEMINI_API_KEY` (text only)

## Deferred, in order
1. D glyph filler: "Fill N missing with simple icons". About 30 min, no keys, and it writes into `apps` like an upload.
2. C `POST /admin/v1/ai/images {prompt, count, seed, size}` with `auth.Admin(op, model.RoleDesigner)`. It returns asset rows into the same mapping table and records the provider and prompt in the asset `source` for takedown. Add `ai_jobs` only if fan-out needs progress tracking.
3. B or F `POST /admin/v1/ai/suggest {description}` with `auth.Admin(op, model.RoleDesigner, model.RoleReviewer)`, returning names, subtitle, tags and mood words that become `Interpret` chips. Include a 15 s timeout, a cache by input hash, and 402/429 handling.
4. (E sprite-sheet slicer: built client-side in the admin, see above.)
5. A provenance field on assets (`origin: upload|glyph|ai`, provider, prompt) for later takedown.

## Open questions for the user
- Should `/ai/status` be visible to viewers, or only to designers and up?
- KBZPay, Wave, CB Pay and MPT package ids: can you confirm them from a real device?
- Can a pack publish with gaps (amber `pack_incomplete` warning), or must Tier 1 be complete first?
- When B lands, which provider for Burmese names: OpenRouter (free, weaker `my`) or Gemini (better, but free prompts may train)?
