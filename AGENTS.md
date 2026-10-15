# AGENTS.md

Guidance for agents working in this repo.

## Project

Stupid Weather: a dependency-free weather web app. Plain ES modules served as
static files — **no build step, no bundler, no framework, no runtime
dependencies**. Do not add one (`npm install`, a test framework, TypeScript,
etc.) unless the human explicitly asks.

`README.md` covers what the app does, how to run it, and the data sources.

## Commands

```sh
node selfcheck.js   # the test suite; prints "selfcheck OK" or throws
python3 -m http.server 8000   # run the app
```

There is no `npm test` script and no lint config. `node selfcheck.js` is the
only automated check.

## Testing constraints — read before touching tests

- `selfcheck.js` imports only `logic.js` (plus `node:fs` to read `index.html`
  and `manifest.webmanifest`). **Never import `app.js` from it**: `app.js`
  touches `document` at import time and will throw under Node.
- Anything DOM-bound in `app.js` (rendering, tab switching, radar) therefore
  cannot be unit-tested here. It is verified in a browser by hand. When you
  change it, say so in your report rather than inventing a test that asserts
  nothing.
- Keep test output pristine — no stray warnings.

## File responsibilities

| File | Owns |
| --- | --- |
| `logic.js` | Pure helpers (time/formatting/caching math). Anything testable belongs here. |
| `app.js` | DOM + network + Leaflet. Import from `logic.js`, don't duplicate it. |
| `selfcheck.js` | Assertions over `logic.js` and static file contents. |
| `styles.css` | All styling. |
| `index.html` | Markup and metadata. |
| `sw.js` | Service worker precache list and cache-first strategy. |

## Code conventions

- **No comments** unless a non-obvious decision needs recording. When a
  deliberate simplification has a known ceiling, mark it with a
  `// ponytail: <ceiling>, <upgrade path>` comment rather than leaving it
  silent.
- Vanilla ES modules with named exports; no default exports.
- Prefer the smallest working change. No speculative abstractions, no config
  for values that never change, no scaffolding "for later". (YAGNI.)
- Follow the existing style: `export function`, template-literal HTML,
  two-space indent, single quotes.
- Don't add ARIA or other attributes to the skeleton markup — the `.skeleton`
  cards are intentionally `aria-hidden="true"`.

## Version / cache bumps — easy to forget

- **`logic.js`: `AGENTS`-visible shape changes to cached forecast data?** The
  forecast cache is versioned by `FORECAST_VER` in `app.js`. If the shape of a
  stored hour or its fields changes, bump it, or old cached data will render
  wrong.
- **`sw.js`: changed the precache list?** Update the `ASSETS` array, and bump
  the `CACHE` version when the change must actually evict old entries. Every
  precached URL must exist in the repo.
- Bumping `FORECAST_VER` alone does not require a service-worker bump.

## Gotchas

- **Timezone**: never render times from UTC directly. All display paths go
  through `clockTime` / `dayLabel` / `weekLabel` in `logic.js`, which take the
  location's IANA timezone.
- **`refreshSeq`**: `refreshAll` guards every render against a newer refresh
  with a sequence number. Preserve that guard when adding rendering.
- **The forecast fetch** issues many parallel WMS point requests via `pool()`
  (limited concurrency, order preserved by index). Don't replace it with an
  unbounded `Promise.all`.
- **Radar** only loads once the map has a non-zero size; it re-fetches on the
  `radar-shown` event. Keep the `.loading` class cleared on every exit path.
- These are live third-party services; failures are expected. Fail with a
  message in `#status`, don't throw into the void.

## Docs workflow

Design specs and plans live under `docs/superpowers/specs/` and
`docs/superpowers/plans/`, named `YYYY-MM-DD-<topic>-*.md`. Add one before
starting a non-trivial feature.

## Commits

Conventional-commit prefixes, matching the existing history: `feat:`, `fix:`,
`docs:`, `refactor:`, `chore:`. One logical change per commit. Do not commit
unless the human asks.
