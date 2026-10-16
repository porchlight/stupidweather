# Hourly list view — design

## Problem

The Hourly tab renders `hourlyCards` as a responsive grid of tilted weather
cards (`app.js`), one card per hour. Scanning 12 hours across a wrapping grid
is awkward, and the cards give no sense of which day each hour belongs to.

## Scope

The **Hourly tab only**. Re-lay it out as a full-width list: one two-line row
per hour, grouped under a per-day heading. The 7-Day tab keeps its cards, and
Radar is untouched. Same 12-hour window, same data fields.

## Design

### Pure logic (`logic.js`)

Two new testable helpers:

- `groupByDay(hours, tz)` → `[{ date, hours }]`, hours bucketed by
  `dateKey(h.time, tz)`, groups sorted by `date` ascending.
- `dayHeading(key, now, tz)` → `"Today"`, `"Tomorrow"`, or a weekday + short
  date like `"Fri, Oct 17"` (formatted in UTC from the local date key, the way
  `weekLabel` does). "Tomorrow" is derived by advancing the *local date key* one
  calendar day, not by adding 24h, so it is DST-safe.

### Rendering (`app.js`)

- Replace `hourlyCards` with `hourlyList(hours, loc)`: take `hours.slice(0, 12)`,
  `groupByDay` them, and emit inside a `<div class="hourly">` wrapper, per group:
  - a `<h3 class="hour-head">` day heading, then
  - an `<article class="hour-row">` per hour with two lines:
    - `.hour-main`: `10 AM` · emoji · `14°` · `Partly cloudy`
    - `.hour-stats`: `POP 20%` · `1.2 mm` · `wind 12 km/h` · `gust 20 km/h`
- `renderForecast` calls `hourlyList` for `#tab-hourly`; `weekCards` unchanged.
- `showSkeleton` uses a new `logic.js` builder `skeletonRows(n)` for the Hourly
  tab: `<div class="hourly">` containing `n` `.hour-row` placeholders with the
  same two-line `.sk` slots, keeping `skeletonCards(7)` for 7-Day.

### Styling (`styles.css`)

Keeps the existing palette, drops the card tilt for rows:

- `.hour-head`: full-width uppercase band, purple text, dotted underline, small
  rainbow left accent.
- `.hour-row`: white rounded strip, 3px purple border, subtle bottom shadow,
  left-aligned text, alternating tint on even rows (no rotation).
- `.hour-main`: single line, aligned baseline — time, emoji, temp, condition.
- `.hour-stats`: smaller muted-purple line, `·` separators drawn in CSS between
  spans, wrapping on narrow screens.
- `skeletonRows`: reuse `.sk` shimmer blocks sized to the row lines.

## Not doing

- No table markup, no framework, no new dependencies.
- No change to the 7-Day cards, the 12-hour window, or the fetch/render data flow.
- No sticky day headers (plain bands).

## Testing

- `selfcheck.js` gains asserts for: `groupByDay` (buckets by local date, sorted),
  `dayHeading` (`Today` / `Tomorrow` / weekday-date for a third day), and
  `skeletonRows` (n rows in the expected wrapper). Existing `skeletonCards`
  asserts stay.
- The rendered layout is CSS/DOM-bound and verified by hand in a browser; it is
  not unit-tested (per the repo's selfcheck constraint).
