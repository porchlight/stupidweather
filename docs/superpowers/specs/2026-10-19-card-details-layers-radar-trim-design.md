# Design: card Details breakdown, layers icons, radar trim

Date: 2026-10-19
Status: approved (design presented inline; user confirmed "looks good")

## Goals

1. Trim the radar loop's past window from 3 hours to 1 hour.
2. Add a per-card "Details" disclosure on the 7-Day tab that expands into a
   morning / afternoon / evening / overnight breakdown of that day.
3. Add a clothing-layers icon to hourly rows and 7-day cards.

## 1. Radar trim

`refreshRadar` in `app.js` requests `radarTimes(new Date(), 10, 9)` instead of
`radarTimes(new Date(), 30, 9)`: 10 past frames (1 hour at 6-minute steps) plus
the existing 9 nowcast frames. No other radar change; `radarTimes` already
supports the `future` argument and selfcheck covers it.

## 2. Period breakdown ("Details" link)

### Data — `aggregatePeriods(hours, tz)` in `logic.js`

Revives the idea of the removed `aggregateToday` (commit `7a50b47`), but
4-way, keyed by date, and reusing the existing private `addHour` aggregator
(POP max, precip sum, hi/lo, wind/gust max, worst condition).

- Buckets by **local** hour (`tzParts`), matching the old convention:
  | Period | Local hours |
  | --- | --- |
  | Morning | 06–12 |
  | Afternoon | 12–18 |
  | Evening | 18–24 |
  | Overnight | 00–06 |
- Returns a `Map<dateKey, Array<{key, label, ...stat}>>` in fixed order
  morning → afternoon → evening → overnight.
- A period with **zero hours is omitted**. A date with zero hours never
  appears in the map.

Coverage expectations:

- Grid data: future days have 6-hourly points at fixed UTC offsets, which land
  exactly one sample in each 6-hour local bucket regardless of timezone, so
  every full day gets all four rows (a 23/25-hour DST day may get 0 or 2 in a
  bucket — `addHour` tolerates this naturally).
- Today's card (partial day): only periods already passed/current appear.
- Citypage first paint: its hourly data covers ~24h, so only today (and maybe
  tomorrow's early hours) get rows; grid data replaces it within seconds.

### Rendering — `weekCards(days, periods)` in `app.js`

Signature gains the periods map. For each day that has at least one period:
append

```html
<details class="card-details">
  <summary>Details</summary>
  …rows…
</details>
```

Days without periods (citypage future days, before grid lands) get **no
Details link at all** — a link that expands to nothing is worse than no link.

Each row shows: period label, condition emoji, hi/lo, POP %, precip mm,
wind km/h, gust km/h, layers icon (from that period's **hi**). Native
`<details>` = zero JS; small CSS addition to style `summary` as a link-like
affordance and lay the rows out compactly (they live inside the alternating
card colors, so use card-internal styling, not the hourly-row style).

`renderForecast` computes `periods = aggregatePeriods(hours, loc.tz)` once and
passes it through to `weekCards` alongside `days`
(`opts.days || aggregateWeek(hours, loc.tz)`).

## 3. Layers icon — `layerIcon(temp)` in `logic.js`

Pure function, stacked icons only (no number): the colder it gets, the more
icons pile up.

| Condition | Icons |
| --- | --- |
| temp > 20 | 👕 t-shirt alone |
| 10 < temp ≤ 20 | 👕🧶 t-shirt + sweater |
| 0 ≤ temp ≤ 10 | 👕🧶🧥 + light coat |
| temp < 0 | 👕🧶🧥🥶 all four (parka) |
| null/undefined | `''` (render nothing) |

Icons concatenate into one string (`'👕🧶🧥'`), rendered inside a single
`.layers` span.

Boundary choices (user's ranges overlap at 10): exactly 10 → three icons
(in "0–10"), exactly 20 → two icons (in "10–20"), exactly 0 → three icons
("below 0" is the four-icon trigger).

Placement:

- **Hourly rows**: inline after the hour's temperature (uses `h.temp`).
- **7-Day cards**: appended to the hi/lo line (uses `d.hi` — the day's high,
  per user decision; period rows use their own period's `hi`).

## Testing

`selfcheck.js` additions (logic only; DOM is hand-verified):

- `layerIcon`: 21 → 👕, 20 → 👕🧶, 11 → 👕🧶, 10 → 👕🧶🧥, 0 → 👕🧶🧥,
  −1 → 👕🧶🧥🥶, null → ''.
- `aggregatePeriods`: fixture hours with one hour in each bucket → four
  periods in order with correct labels/stats; bucket-edge hours (06:00 →
  morning, 12:00 → afternoon, 18:00 → evening, 00:00 → overnight); hours on a
  date with only some periods → missing periods absent from the array; no
  hours for a date → date absent from the map.

## Caching / versioning

- `app.js` and `logic.js` are service-worker precache assets → bump `sw.js`
  `CACHE` (v15 if shipped together with the pending radar change, else v16).
- **No `FORECAST_VER` bump**: periods are computed at render time from the
  already-cached hours; the stored shape does not change.

## Out of scope

- No changes to hourly rendering structure beyond the inline icon.
- No collapse-state persistence; native `details` state is fine per render.
- No layers icon in the radar tab, status line, or notifications.
