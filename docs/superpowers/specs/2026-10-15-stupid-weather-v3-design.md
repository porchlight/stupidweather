# Stupid Weather v3 - Design Document

Date: 2026-10-15
Status: Approved (endpoints re-verified)
Scope: Existing static PWA; simplify the v2 forecast pipeline, no build step

## Goals
1. Fetch the forecast in **one pass** instead of two (removes the partial-cache window and the two-pass/`onProgress` machinery).
2. Hourly tab shows only the **next 12 hours**.
3. Coarsen the tail to **6-hourly** so the whole 7-day horizon can load in one pass.
4. **Remove the Today tab** entirely (its hi/lo and per-period detail are redundant: hi/lo lives in 7-Day, hours live in Hourly).

Net effect: simpler code, no partial cache, and roughly half the requests of v2.

## Why one pass, and why fewer points
GeoMet WMS `GetFeatureInfo` returns **one layer at one time per request**. Verified constraints (2026-10-15):
- Passing a comma-separated `TIME` list is rejected (`ServiceException NoMatch`). One time per request only.
- PROGNOS point forecasts exist (`prognos-*-realtime`) but only **air temperature** is post-processed — it cannot replace the wind/POP/precip/cloud/tstorm layers.
- WCS and OGC-API-Coverages can return a bbox over a time **interval** in one request, but only in GeoTIFF/GRIB/NetCDF, which needs a decoder this no-build PWA will not carry.

So the load time is `points × layers ÷ ~20 req/s`, and the only lever is the point count. v2:

| | v2 | v3 |
|---|---|---|
| passes | 2 | **1** |
| points | 88 (49 hourly + 3-hourly tail) | **~38** (12 hourly + 6-hourly tail) |
| requests | 616 ≈ 34 s | **~266 ≈ 13 s** |

A single pass changes *when* things paint, not the total. To keep first paint fast, the fetch still renders **per time-slot**: each slot's 7 layers arrive together, its hourly row is drawn immediately, so rows stream in top-to-bottom and the first row appears in well under a second. The **one** `writeForecast` happens only after the whole pass, so the cache never holds a partially-filled forecast.

## Time Grid
`forecastTimes(now = new Date())`:
- `start` = `now` floored to the UTC hour (unchanged).
- Hourly points at `start + 0h … start + 11h` (**12 points**).
- Then 6-hourly points, first aligned up to a 6-hour boundary at or after `start + 12h`, stepping 6 h while `< start + 168h` (~26 points, varies by clock hour).

`radarTimes` and `pool` are unchanged.

## Fetch Pipeline (single pass)
`fetchForecast(loc, onProgress)` becomes one `pool(times, N, …)` (suggested `N = 5`):

```
pool(times, 5, async (time, i) => {
  const [pop, precip, temp, wind, gust, cloud, tstorm] = await Promise.all([
    pointValue(LAYER_POP, …), pointValue(LAYER_PCP, …), pointValue(LAYER_TEMP, …),
    pointValue(LAYER_WIND, …), pointValue(LAYER_GUST, …), pointValue(LAYER_CLOUD, …),
    pointValue(LAYER_TSTORM, …)
  ].map(p => p.catch(() => null)));
  hours[i] = { time, pop: pop ?? 0, precip: precip ?? 0, temp, wind, gust, cloud, tstorm };
  onProgress?.(hours);
});
```

Rules:
- **POP and precip coerce `null → 0`** (zero is a real, meaningful value for "no precipitation"); every other layer keeps `null` (a gust hole must not read as 0 km/h).
- `pointValue` is unchanged (one layer per request, milliseconds stripped from `TIME`).
- **Failure**: if every point came back all-`null` (total outage), throw `Forecast data unavailable`. Per-layer `.catch(() => null)` means a partial outage degrades to `–` cells and never surfaces as `Update failed: …`.
- **One cache write** at the end: `writeForecast(hours, loc)`.
- `onProgress(hours)` is called after each slot (from inside the pool callback) purely to draw the hourly table; there is **no throttle** — 38 rows are cheap to repaint. The Week table is painted once, at the end, by `refreshAll`, so its daily hi/lo never climbs mid-fetch.

## Rendering
- **Hourly** (`hourlyTable`): `hours.slice(0, 12)` (was `slice(0, 48)`). Same seven columns.
- **7-Day** (`weekTable`): unchanged — `aggregateWeek` over all ~38 points, `fmtHiLo` per day.
- **Today**: removed. Delete `todayTable`, the `#tab-today` section, the nav button, the `aggregateToday` call, and the `aggregateToday`/`dateKey` imports in `app.js`.
- `renderForecast(hours, loc, opts)` keeps its `{ hourlyOnly }` opt: progress passes `hourlyOnly: true` (Hourly only), the final render draws both.

## Removed To Keep It Lean
- `logic.js`: `aggregateToday`, `hourOf` (only used by `aggregateToday`). `aggregateWeek`, `emptyStat`, `addHour`, `worse`, `SEVERITY`, `dateKey` stay (`dateKey` is still used by `aggregateWeek`).
- `app.js`: the pass-1/pass-2 split, the base→hours merge, the 500 ms throttle, the `lastPaint` variable.
- `index.html`: `data-tab="today"` button and `#tab-today` section.

## Cache and Service Worker
- `FORECAST_VER` → **`'3'`**. The grid changed, so any `'2'` cache loads as `null` and refetches; `loadCachedForecast` already rejects a non-matching version.
- `sw.js` `CACHE` → **`stupid-weather-v4`** (index.html changed). The `activate` handler already deletes the old cache.

## Verification
- `node selfcheck.js` → `selfcheck OK`: update `forecastTimes` assertions (12 leading hourly points, then 6 h spacing, last `< start + 168 h`), drop the `aggregateToday` block, keep `aggregateWeek` (incl. all-null → `–`).
- `node --check app.js logic.js selfcheck.js sw.js`.
- Manual pass at `http://localhost:8000`:
  - Hourly shows exactly 12 rows and they stream in top-to-bottom; first row appears in <1 s.
  - No Today tab. 7-Day shows 7 days with `Oct 15` + `14°/6°` cells.
  - `sw:forecastVer === '3'` in Local Storage; `sw:forecast` holds ~38 hours.
  - Kill the network mid-load → cells show `–`, no `Update failed:`; a total outage shows `Forecast data unavailable`.
  - Cache Storage holds only `stupid-weather-v4`.

## Out of Scope
- Radar behaviour, controls and framing are untouched (including the inverted speed slider noted in the v1 review).
- The seven forecast layers, their units, the condition thresholds and the multi-city picker are unchanged.
- Manifest icons, marker repositioning on location change, and the other deferred v1 minors remain deferred.
- No bundler, no new dependencies, no backend.
