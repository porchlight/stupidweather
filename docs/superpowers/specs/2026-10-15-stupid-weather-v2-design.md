# Stupid Weather v2 - Design Document

Date: 2026-10-15
Status: Approved (endpoints verified)
Scope: Existing static PWA; additive changes only, no build step

## Goals
Six requested changes to the shipped v1:
1. 12-hour clock everywhere (all displayed times).
2. Dates rendered as `Oct 15` instead of `15/10` / `2026-10-15`.
3. Multi-city search: show several Nominatim results; picking one updates the active tab.
4. Fix `Update failed: can't access lexical declaration 'radarMap' before initialization` on refresh.
5. Drop the `(6-12)` hour hints from the Today period labels.
6. Show temperature (°C), condition (sunny / partly cloudy / cloudy / thunderstorm), wind and gust alongside POP and Precip — on all three forecast tabs.

## Data Source Additions (verified 2026-10-15)
Same endpoint as v1: `https://geo.weather.gc.ca/geomet`, WMS 1.3.0 `GetFeatureInfo`, one layer per request, `INFO_FORMAT=application/json`, `TIME` stripped of milliseconds.

| Layer | Unit | Verified |
|---|---|---|
| `GDPS_15km_AirTemp_2m` | °C | 24/24 arbitrary hourly slots |
| `GDPS_15km_WindSpeed_10m` | m/s | 24/24 |
| `GDPS_15km_WindGust_10m` | m/s | 15/24 — real data holes |
| `GDPS_15km_TotalCloudCover` | % | 24/24 |
| `GDPS-WEonG_15km_Thunderstorm-Prob` | % | 24/24; confirmed non-zero (São Paulo 42) |

Rejected:
- `GDPS-WEonG_15km_SkyState` — its `GetLegendGraphic` is a PNG; category codes are undecodable here, so condition is derived from cloud cover + thunderstorm probability instead.
- Shrinking `GetFeatureInfo` to `1×1`: the server 500s, and smaller windows are not materially faster — single samples landed in the 174–259 ms band across `3×3`, `11×11`, `51×51` and `101×101`. Latency is per-request overhead, not payload.

**Performance constraint:** GeoMet caps at roughly 18–21 requests/second regardless of concurrency (measured at 6/12/24 workers: 3.8 s / 3.7 s / 3.3 s for the same 70 requests). Request count therefore dominates:
- v1: 88 slots × 2 layers = 176 requests ≈ **10 s**
- v2: 88 slots × 7 layers = 616 requests ≈ **34 s**

This is why the fetch is split into two passes with progressive rendering (below) rather than one 34-second wait.

## Fetch Pipeline (Approach A, two passes)
`fetchForecast(loc, onProgress)` runs both passes over the same `forecastTimes()` array, each through the existing `pool(times, 6, …)`:

1. **Pass 1 — POP + precip** (176 req ≈ 10 s). Nulls coerced to `0` exactly as in v1. Writes cache, then renders **Hourly, Today and 7-Day**.
2. **Pass 2 — the five new layers** (440 req ≈ 24 s). Each completed slot merges into its hour object and triggers a render, throttled to one per 500 ms, plus a final render.

Rules:
- **Pass 2 renders the Hourly table only.** Today and 7-Day aggregate across all 88 slots, so repainting them mid-fetch would show a climbing, incorrect hi/lo. They paint once at the end of pass 1 and once at the end of pass 2 — always from a complete set of POP/precip, and finally from complete data everywhere.
- Missing values are stored as **`null`, never `0`** — a gust hole must not read as 0 km/h, and absent temperature must not read as 0 °C.
- **Cache schema version**: `sw:forecastVer = '2'`. A cache written by v1 has no `temp` key; it is treated as absent so the new columns do not stay blank for a full 12-minute cycle.
- **Failure split**: pass 1 all-null still throws `Forecast data unavailable`; pass 2 uses per-slot `.catch(() => null)`, so partial failure degrades to `–` cells and can never surface as `Update failed: …`.
- `pool()` is unchanged — the per-slot callback performs the throttled progress reporting.
- `#lastUpdate` is written after pass 2, so `Updated … local` always means complete data.

## Data Model
```json
{
  "location": { "name": "string", "lat": 0, "lon": 0, "tz": "America/Toronto" },
  "hours": [{
    "time": "ISO8601 UTC",
    "pop": 0, "precip": 0,
    "temp": 12.6, "wind": 4.5, "gust": null,
    "cloud": 92, "tstorm": 0
  }]
}
```
localStorage keys: `sw:location`, `sw:forecast`, `sw:forecastTs`, `sw:forecastKey`, `sw:forecastVer`.

## Rendering and Formatting
New pure helpers in `logic.js`, all self-checked:
- `clockTime(iso, tz, withMinutes)` → `2 PM` / `2:32 PM`. Called with `withMinutes = false` for the hourly table, `true` for the radar readout and the status line.
- `dayLabel(iso, tz)` → `Oct 15`
- `conditionWord(cloud, tstorm)` → the condition strings below
- km/h rounding stays beside them (`Math.round(m/s × 3.6)`)

| Where | v1 | v2 |
|---|---|---|
| Hourly time cell | `15/10 14:00` | `Oct 15, 2 PM` |
| 7-Day day cell | `2026-10-15 Monday` | `Oct 15 Monday` |
| Today period cell | `Morning (6–12)` | `Morning` |
| Radar readout | `14:32` | `2:32 PM` |
| Status line | `Updated 14:32 local` | `Updated 2:32 PM local` |

Columns on all three forecast tabs, new ones **appended** so the headline POP/Precip keep their position:

`Time | POP | Precip (mm) | Temp | Condition | Wind (km/h) | Gust (km/h)`

Cell rendering:
- Temp: `Math.round(°C)` + `°`
- Wind/gust: `Math.round(m/s × 3.6)` — conversion happens at render time; the cache keeps source m/s so thresholds and units live in one place.
- Condition: `conditionWord(cloud, tstorm)` → `tstorm ≥ 30` → `Thunderstorm`; else `cloud < 25` → `Sunny`, `cloud < 70` → `Partly cloudy`, `cloud ≥ 70` → `Cloudy`.
- **Any absent value renders `–`, never `0`.**

## Aggregation
`aggregateToday` and `aggregateWeek` keep POP = period/day max and precip = period/day sum, and additionally:
- Temp: **hi/lo** over the period, nulls skipped, `–` when no values.
- Wind and gust: **max**, nulls skipped, `–` when no values.
- Condition: **worst** present, severity order `Thunderstorm > Cloudy > Partly cloudy > Sunny`; `–` when none present.

## City Picker
Split today's `geocode()` (which takes `limit=1` and resolves the timezone inline) into:
- `searchPlaces(query)` → Nominatim `limit=5`, returns `[{lat, lon, name}]`, **no timezone lookup**.
- `selectPlace(place)` → timezone lookup via timeapi, then the existing `setLocation` tail: persist `sw:location`, set `#locationName`, call `onLocationChange`.

Markup: one `<div id="results">` immediately after `</form>`, empty and hidden by default. Each result is a `<button type="button">` labelled `display_name` — real buttons so the list is keyboard-reachable. Submitting replaces any open list; selecting clears the list and input and re-renders whichever tab is active. Always show the list, even for a single hit — no single-result branch. Error strings unchanged: `Location not found`, `Geocoding failed`, `Timezone lookup failed`.

## Refresh Bug Fix
Root cause: `init()` is invoked at `app.js:63`, before the top-level `let radarMap` (`app.js:194`) and `const WMS` (`app.js:109`) have been initialised. On refresh the 12-minute cache is fresh, so `refreshAll` reaches `refreshRadar → initRadar → if (radarMap)` with no intervening `await`, hitting the temporal dead zone; the error is swallowed by `refreshAll`'s catch and shown as `Update failed: …`. A cold load works only because `await fetchForecast` yields and lets the module finish evaluating.

Fix: **move `init();` to the end of `app.js`.** One move clears every top-level binding, not just the one that threw. Moving only the radar declarations would leave `WMS` in the same trap, and deferring via `DOMContentLoaded` would hide the ordering bug rather than fix it.

## CSS
Add `.tab { overflow-x: auto; }`. `table { width: 100% }` plus a new `Partly cloudy` column can otherwise push the table past the viewport on narrow screens.

## Service Worker
`sw.js` serves from a fixed cache name (`stupid-weather-v2`) with no revalidation, so an unchanged name would pin every existing client to the old app forever. Bump `CACHE` to **`stupid-weather-v3`**; the existing `activate` handler deletes the old cache.

## Verification
- `node selfcheck.js` gains assertions for `clockTime`, `dayLabel`, `conditionWord`, km/h conversion, and the extended aggregators — including all-null inputs resolving to `–` rather than `0`.
- `node --check app.js logic.js`.
- Manual pass at `http://localhost:8000`:
  - 12-hour times in hourly, radar and status line
  - `Oct 15` in hourly and 7-Day, bare `Morning`/`Afternoon`/`Night`
  - five Nominatim results, keyboard-selectable, selection retargets the active tab
  - POP/precip appear first, then temperature/condition/wind/gust fill in; Today and 7-Day only change at the end
  - **TDZ regression**: reload the page within 12 minutes of a prior load, so the forecast cache is fresh — this is the exact condition that previously produced `Update failed: …`
  - `node selfcheck.js` → `selfcheck OK`

## Out of Scope
- Radar behaviour, controls and framing are untouched (including the inverted speed slider noted in the v1 review).
- Manifest icons, marker repositioning on location change, and the other deferred v1 minors remain deferred.
- No bundler, no new dependencies, no backend.
