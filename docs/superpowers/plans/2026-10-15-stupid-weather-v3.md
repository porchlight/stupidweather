# Stupid Weather v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v2's two-pass forecast with a single pass over a coarser grid, show only the next 12 hourly rows, and drop the Today tab.

**Architecture:** `forecastTimes()` yields 12 hourly points then 6-hourly out to 7 days (~38 points). `fetchForecast()` fetches all 7 layers per point in one `pool` pass, renders the hourly table as each point lands, and writes the cache once at the end. The Today tab and `aggregateToday` are deleted; the 7-Day tab keeps its hi/lo.

**Tech Stack:** Vanilla ES modules, no build step; assert-based `selfcheck.js` run with Node; WMS `GetFeatureInfo`. Only `logic.js` has unit coverage (via `selfcheck.js`); `app.js`/`index.html`/`sw.js` are verified with `node --check` plus the manual browser pass.

## Global Constraints
- No bundler, no new dependencies, no backend.
- One layer per `GetFeatureInfo`; one time per request; strip milliseconds from `TIME` (`time.replace(/\.\d+Z$/, 'Z')`).
- POP/precip coerce `null → 0`; every other layer keeps `null`; absent values render `–` (U+2013), never `0`.
- Exactly one `writeForecast()` per fetch — the cache must never hold a partial forecast.
- `FORECAST_VER = '3'`; `sw.js` `CACHE = 'stupid-weather-v4'`.
- Gates after every task: `node selfcheck.js` prints `selfcheck OK`; `node --check app.js logic.js selfcheck.js sw.js` exits 0.

---

### Task 1: Coarsen the forecast grid

**Files:**
- Modify: `logic.js:40-50` (`forecastTimes`)
- Modify: `selfcheck.js:9-13`

**Interfaces:**
- Consumes: nothing new.
- Produces: `forecastTimes(now = new Date())` → array of ISO strings. `start` = `now` floored to the UTC hour; 12 hourly points at `start+0h … start+11h`; then 6-hourly points from the first 6-hour boundary at or after `start+12h`, while `< start + 7d`. For `2026-10-14T17:30:00Z` this is exactly 38 points, last `2026-10-21T12:00:00.000Z`.

- [ ] **Step 1: Write the failing test**

Replace `selfcheck.js` lines 9-13 with:

```js
// forecastTimes: 12 hourly points then 6-hourly out to 7 days, all on :00
const times = forecastTimes(new Date('2026-10-14T17:30:00Z'));
assert.equal(times.length, 38);
assert.equal(times[0], '2026-10-14T17:00:00.000Z');
assert.equal(times[11], '2026-10-15T04:00:00.000Z');
assert.equal(times[12], '2026-10-15T06:00:00.000Z');
assert.equal(times[times.length - 1], '2026-10-21T12:00:00.000Z');
assert.ok(times.every(t => t.endsWith(':00:00.000Z')));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node selfcheck.js`
Expected: FAIL — assertion error, actual length 88 (v2's grid) instead of 38.

- [ ] **Step 3: Write the minimal implementation**

Replace `logic.js` `forecastTimes` with:

```js
export function forecastTimes(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const out = [];
  for (let i = 0; i < 12; i++) out.push(new Date(start.getTime() + i * 3600e3).toISOString());
  const H6 = 6 * 3600e3;
  const end = start.getTime() + 7 * 24 * 3600e3;
  let t = Math.ceil((start.getTime() + 12 * 3600e3) / H6) * H6;
  while (t < end) { out.push(new Date(t).toISOString()); t += H6; }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 5: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: coarsen forecast grid to 12 hourly + 6-hourly points"
```

---

### Task 2: Single-pass fetch, 12 hourly rows, cache version bump

**Files:**
- Modify: `app.js` — `FORECAST_VER` (line 158), the `paint` closure in `refreshAll` (~lines 36-43), `fetchForecast` (~lines 176-212), `hourlyTable`'s slice (~line 233)

Locate edits by the named symbols; line numbers by a symbol can shift as earlier steps in this task add or remove lines.

**Interfaces:**
- Consumes: `forecastTimes` from Task 1 (12 hourly + 6-hourly points).
- Produces: `fetchForecast(loc, onProgress)` — one `pool(times, 5, …)` pass; assigns `hours[i] = { time, pop, precip, temp, wind, gust, cloud, tstorm }` (POP/precip `?? 0`, rest may be `null`); calls `onProgress(hours.filter(Boolean))` after each point; throws `Forecast data unavailable` only if every layer of every point was `null`; calls `writeForecast(hours, loc)` exactly once, at the end. `FORECAST_VER = '3'`.

- [ ] **Step 1: Bump the cache schema version**

In `app.js`, change line 158:

```js
const FORECAST_VER = '3';
```

- [ ] **Step 2: Show the next 12 hourly rows**

In `app.js` `hourlyTable`, change line 233's slice:

```js
  const rows = hours.slice(0, 12).map(h => {
```

- [ ] **Step 3: Drop the render throttle**

In `app.js` `refreshAll`, remove `let lastPaint = 0;` and replace the `paint` closure (currently lines 37-43) with:

```js
    const paint = (hrs) => {
      if (seq !== refreshSeq) return;
      renderForecast(hrs, loc, { hourlyOnly: true });
    };
```

Leave the call site `hours = await fetchForecast(loc, paint);` unchanged.

- [ ] **Step 4: Replace the two-pass fetch with one pass**

Replace the whole `fetchForecast` function (`app.js:176-212`) with:

```js
export async function fetchForecast(loc, onProgress) {
  const times = forecastTimes(new Date());
  const hours = new Array(times.length);
  let anyData = false;
  await pool(times, 5, async (time, i) => {
    const [pop, precip, temp, wind, gust, cloud, tstorm] = await Promise.all([
      pointValue(LAYER_POP, loc.lat, loc.lon, time),
      pointValue(LAYER_PCP, loc.lat, loc.lon, time),
      pointValue(LAYER_TEMP, loc.lat, loc.lon, time),
      pointValue(LAYER_WIND, loc.lat, loc.lon, time),
      pointValue(LAYER_GUST, loc.lat, loc.lon, time),
      pointValue(LAYER_CLOUD, loc.lat, loc.lon, time),
      pointValue(LAYER_TSTORM, loc.lat, loc.lon, time)
    ].map(p => p.catch(() => null)));
    if (pop != null || precip != null || temp != null || wind != null
        || gust != null || cloud != null || tstorm != null) anyData = true;
    hours[i] = { time, pop: pop ?? 0, precip: precip ?? 0, temp, wind, gust, cloud, tstorm };
    if (onProgress) onProgress(hours.filter(Boolean));
  });
  if (!anyData) throw new Error('Forecast data unavailable');
  writeForecast(hours, loc);
  return hours;
}
```

- [ ] **Step 5: Verify syntax and self-checks**

Run: `node --check app.js && node --check logic.js && node selfcheck.js`
Expected: no output from the two `--check`s; `selfcheck OK` from the last.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: fetch forecast in a single pass and show 12 hourly rows"
```

---

### Task 3: Remove the Today tab

**Files:**
- Modify: `logic.js` — delete the `hourOf` helper and the `aggregateToday` function
- Modify: `app.js` — imports, delete `todayTable`, edit `renderForecast`
- Modify: `index.html` — the `data-tab="today"` nav button and the `#tab-today` section
- Modify: `sw.js` — the `CACHE` constant
- Modify: `selfcheck.js` — the import line and the `aggregateToday` assertion block

Note: Tasks 1–2 shifted line numbers in `logic.js`, `app.js` and `selfcheck.js`. Locate edits by the named symbols/comments below, not by line number.

**Interfaces:**
- Consumes: nothing new.
- Produces: no `aggregateToday`, no `hourOf`, no `#tab-today`, no `todayTable`; `renderForecast(hours, loc, opts)` renders hourly always, plus week unless `opts.hourlyOnly`. `CACHE = 'stupid-weather-v4'`.

- [ ] **Step 1: Delete the aggregator and its helper**

In `logic.js`:
- Delete the `hourOf` line: `function hourOf(iso, tz) { return Number(tzParts(iso, tz).hour); }`
- Delete the whole `aggregateToday` function (the `export function aggregateToday(hours, tz) { … }` block).
- Leave `aggregateWeek` (it still uses `dateKey`, `emptyStat`, `addHour`, `worse`, `SEVERITY`) untouched.

- [ ] **Step 2: Update the selfcheck**

In `selfcheck.js`, remove `aggregateToday` from the import list: delete that name from the `import { … } from './logic.js';` line.

Replace the `aggregateToday` assertion block — the comment `// aggregateToday: windows by local hour …`, the `const hours = [ … ];` array, the `const per = …` line, and the three `per.*` assertions, plus the `// a period with no hours at all …` comment, the `const empty = …` line and its assertion — with just the `hours` array (it feeds the week test):

```js
// sample hours for the week aggregation (Toronto, EDT = UTC-4 in October)
const hours = [
  { time: '2026-10-14T14:00:00Z', pop: 20, precip: 1, temp: 18.2, wind: 3, gust: 6, cloud: 10, tstorm: 0 },  // 10:00 local
  { time: '2026-10-14T18:00:00Z', pop: 60, precip: 2, temp: 12.4, wind: 5, gust: 11, cloud: 90, tstorm: 0 }, // 14:00 local
  { time: '2026-10-15T01:00:00Z', pop: 5,  precip: 0, temp: 6.1,  wind: null, gust: null, cloud: null, tstorm: null } // 21:00 local
];
```

Run: `node selfcheck.js`
Expected: `selfcheck OK` (the `aggregateWeek` block that follows must still pass).

- [ ] **Step 3: Delete the Today rendering from app.js**

- Line 1: remove `aggregateToday` and `dateKey` from the import:

```js
import { REFRESH_MS, forecastTimes, pool, aggregateWeek, radarTimes, clockTime, dayLabel, weekLabel, conditionWord, fmtTemp, fmtKmh, fmtHiLo } from './logic.js';
```

- Delete the entire `todayTable` function.
- Replace `renderForecast` with:

```js
export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyTable(hours, loc.tz);
  if (opts.hourlyOnly) return;
  document.getElementById('tab-week').innerHTML = weekTable(hours, loc.tz) + '<p>POP = daily max, precip = daily total.</p>';
}
```

- [ ] **Step 4: Remove the Today tab markup**

In `index.html`:
- Delete the nav button line: `<button data-tab="today">Today</button>`
- Delete the section line: `<section id="tab-today" class="tab" hidden></section>`

- [ ] **Step 5: Bump the service-worker cache**

In `sw.js`, change line 1:

```js
const CACHE = 'stupid-weather-v4';
```

- [ ] **Step 6: Verify nothing stale remains and gates pass**

Run: `grep -rn "today\|aggregateToday\|hourOf" app.js logic.js index.html selfcheck.js`
Expected: no output (case-insensitive matches like `Today` in copy are gone too).

Run: `node --check app.js && node --check logic.js && node --check selfcheck.js && node --check sw.js && node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 7: Commit**

```bash
git add logic.js app.js index.html sw.js selfcheck.js
git commit -m "refactor: remove the Today tab and its aggregator"
```

---

## Manual Verification (after all tasks)

Run `python3 -m http.server 8000` in the repo root and open `http://localhost:8000`:
- Hourly shows exactly 12 rows and they stream in top-to-bottom; first row appears in <1 s.
- No Today tab; 7-Day shows 7 days with `Oct 15` labels and `14°/6°` cells.
- Local Storage: `sw:forecastVer` === `'3'`; `sw:forecast` holds ~38 hours.
- DevTools → Cache Storage: only `stupid-weather-v4`.
- Search and pick a city (e.g. `Springfield`) → forecast refetches for the new coordinates.
