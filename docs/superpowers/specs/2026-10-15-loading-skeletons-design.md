# Loading skeletons — design

## Problem

On first load (no cached forecast) the Hourly and 7-Day tabs sit empty while
`fetchForecast` streams WMS point values (`app.js:173`), and the radar map is a
blank box while tiles and frames load. No feedback that anything is happening.

## Scope

Skeleton placeholders for the Hourly tab, the 7-Day tab, and the radar map.
Shown **only when a section has no data yet** — background refreshes keep
showing the existing cards, no flash of placeholders.

## Design

### Skeleton cards (Hourly + 7-Day)

- New pure function `skeletonCards(n)` in `logic.js` returning the same
  `<div class="cards">…</div>` shape as `hourlyCards`/`weekCards`: `n`
  `<article class="card skeleton">` with the same slots (time, emoji, temp,
  condition pill, 4 stat tiles), each slot a `<span class="sk">` block.
- `app.js` calls it with 12 (hourly) / 7 (week) into both tab sections when
  `refreshAll` starts a fetch with no usable cache. Usable means:
  `loadCachedForecast()` returned hours **and** `sw:forecastKey` matches the
  current location. A location change (stale-key mismatch) counts as empty.
- Real data replaces skeletons the same way it does today: `renderForecast`
  overwrites `innerHTML`. The week skeleton naturally persists until the final
  render — that is the intent.
- On fetch failure with no data: clear both skeleton sections; the existing
  `#status` error text is the user feedback (unchanged behavior).

### Radar

- `#radarMap` gets a `.loading` class at the start of `refreshRadar` and loses
  it once frames are shown (all early-return and error paths clear it too).
- `#radarMap.loading::after` draws a dimmed shimmer overlay; Leaflet keeps
  rendering underneath. Removed on first frame display.

### CSS

- `.sk`: rounded block filled with a linear-gradient shimmer sweeping via one
  `@keyframes shimmer` (background-position animation), tuned to the card
  colors (purple-tinted grey on the paper background).
- Under `prefers-reduced-motion: reduce`, freeze the shimmer to a static tint
  (added to the existing block at `styles.css:161`).

## Not doing

- No skeleton for the search dropdown or `#status` (text feedback already
  exists for both).
- No spinner library, no new dependencies, no JS-driven animation.

## Testing

- `selfcheck.js` gains one assert: `skeletonCards(3)` contains 3 `card
  skeleton` articles and is wrapped in `cards` (pure string check, matches the
  existing logic.js-only selfcheck pattern).
