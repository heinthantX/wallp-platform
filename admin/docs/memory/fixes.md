## client.ts: server URL setting ignored
Root cause: baseUrl captured at module load, before the persisted store hydrated. Fix: placeholder origin rewritten in `onRequest`.

## client.ts: 401 retry failed
Root cause: retry reused an already-consumed Request body. Fix: keep a clone per request (WeakMap).

## Login redirect ignored basePath
Redirect must include basePath (GitHub Pages subpath); covered by a test.

## framer-motion transition type fails TS
Root cause: agy-written UI kit used `{type: "spring"}` without `as const`, so the string widened and was not assignable to AnimationGeneratorType. Fix: add `as const` to the transition object.

## jsdom has no canvas
Root cause: component tests hit `HTMLCanvasElement.getContext` and `matchMedia`, which jsdom does not implement. Fix: `src/test/setup.ts` mocks both.

## Lesson
agy-written code needs diff review; it produced all three bugs above (and elsewhere deleted a security guard).
