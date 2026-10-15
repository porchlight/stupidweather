# Stupid Weather v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add temperature/condition/wind/gust columns, 12-hour and `Oct 15` date formatting, a multi-city picker, and fix the refresh TDZ crash in the existing vanilla-PWA.

**Architecture:** Two-pass fetch over the existing 88-slot GeoMet time grid: pass 1 (POP + precip, 176 req) renders all three tabs, pass 2 (5 new layers, 440 req) repaints Hourly on a 500 ms throttle and repaints Today/7-Day only when complete, because those aggregate across every slot. All pure display logic lives in `logic.js` where `selfcheck.js` can assert it; `app.js` stays DOM-only and is verified by `node --check` plus a manual browser pass.

**Tech Stack:** Vanilla ES modules (no build step), Leaflet 1.9.4 from CDN (the only dependency), Environment Canada GeoMet WMS, Nominatim, timeapi.io. Node is used only to run `selfcheck.js`.

## Global Constraints

- No build step, no bundler, no new dependencies. Leaflet 1.9.4 from unpkg is the only library.
- Working directory: `/home/clarke/code/html/stupidweather`, branch `main`.
- View with: `cd /home/clarke/code/html/stupidweather && python3 -m http.server 8000` → http://localhost:8000 (localhost is required for the service worker; internet is required for Leaflet/OSM/GeoMet).
- Tests: `node selfcheck.js` must print `selfcheck OK`. Syntax gate: `node --check app.js logic.js selfcheck.js` must exit 0.
- Every displayed time/date uses the selected location's IANA timezone through `Intl`, never the browser timezone.
- A missing value renders as `–` (U+2013 en dash), never as `0`.
- GeoMet WMS rules: one layer per `GetFeatureInfo` request; `TIME` sent without milliseconds (`time.replace(/\.\d+Z$/, 'Z')`); WMS 1.3.0 + `CRS=EPSG:4326` BBOX order is `minLat,minLon,maxLat,maxLon`.
- `REFRESH_MS` stays `12 * 60 * 1000`.
- Do not delete `.superpowers/sdd/`, review packages, reports, or plan/spec documents.
- `app.js` has no unit-test harness (it is DOM-bound). Pure logic belongs in `logic.js`; `app.js` tasks are gated by `node --check` plus the manual browser steps listed in the task.
- Condition thresholds: `tstorm >= 30` → `Thunderstorm`; else `cloud < 25` → `Sunny`, `cloud < 70` → `Partly cloudy`, else `Cloudy`; no data → `–`.

---

### Task 1: Display formatting (12-hour clock, `Oct 15` dates, bare period labels)

**Files:**
- Modify: `logic.js` (add `clockTime`, `dayLabel`, `weekLabel`; remove `weekdayName`)
- Modify: `app.js:1` (import list), `app.js:41-42` (status line), `app.js:158-164` (hourly cell), `app.js:171-175` (period labels), `app.js:178-185` (week cell), `app.js:253-254` (radar readout)
- Test: `selfcheck.js`

**Interfaces:**
- Consumes: existing `tzParts` and `dateKey` from `logic.js` (`tzParts` is used only until its call sites are converted in Step 5)
- Produces (later tasks rely on these exact signatures):
  - `clockTime(iso: string, tz: string, withMinutes?: boolean): string` → `'2 PM'` / `'2:32 PM'`
  - `dayLabel(iso: string, tz: string): string` → `'Oct 15'`
  - `weekLabel(key: string): string` → `'Oct 15 Thursday'` (takes a `YYYY-MM-DD` local date key, not an ISO instant)
  - Removes: `weekdayName(iso, tz)` — its only caller is `weekTable`, which moves to `weekLabel`
- `tzParts` is dropped from `app.js`'s import once all three call sites are converted

- [ ] **Step 1: Write the failing tests**

Append to `selfcheck.js` before the final `console.log('selfcheck OK');`:

```js
// clockTime: 12-hour labels in the location tz (Toronto = UTC-4 in October)
assert.equal(clockTime('2026-10-15T14:32:00Z', 'America/Toronto', true), '10:32 AM');
assert.equal(clockTime('2026-10-15T14:00:00Z', 'America/Toronto', false), '10 AM');
assert.equal(clockTime('2026-10-15T02:00:00Z', 'America/Toronto', false), '10 PM');

// dayLabel: month-name dates, taken from the location date not UTC
assert.equal(dayLabel('2026-10-15T14:32:00Z', 'America/Toronto'), 'Oct 15');
assert.equal(dayLabel('2026-10-15T02:00:00Z', 'America/Toronto'), 'Oct 14');

// weekLabel: takes an already-local date key, so it is timezone-independent
assert.equal(weekLabel('2026-10-15'), 'Oct 15 Thursday');
assert.equal(weekLabel('2026-10-19'), 'Oct 19 Monday');
```

Also change line 2 of `selfcheck.js` to import the new names:

```js
import { tzParts, dateKey, forecastTimes, aggregateToday, aggregateWeek, pool, radarTimes, clockTime, dayLabel, weekLabel } from './logic.js';
```

- [ ] **Step 2: Run to verify it fails**

Run: `node selfcheck.js`
Expected: FAIL — `SyntaxError: The requested module './logic.js' does not provide an export named 'clockTime'`

- [ ] **Step 3: Add the helpers to `logic.js`**

Add these to `logic.js` after `dateKey`, and delete the now-unused `weekdayName` function above them (its only caller is `weekTable`, which moves to `weekLabel` in Step 5):

```js
export function clockTime(iso, tz, withMinutes = true) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(iso))) p[type] = value;
  return `${withMinutes ? `${p.hour}:${p.minute}` : p.hour} ${p.dayPeriod}`;
}

export function dayLabel(iso, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(iso));
}

// key is a local 'YYYY-MM-DD' date key; formatting it in UTC keeps the calendar
// date exact for any timezone (the old noon-UTC proxy put UTC+13 a day ahead)
export function weekLabel(key) {
  const d = new Date(`${key}T00:00:00Z`);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d);
  const weekday = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'long' }).format(d);
  return `${date} ${weekday}`;
}
```

Build the strings via `formatToParts` rather than `format()` so the AM/PM separator stays a plain space — some ICU builds emit U+202F there, which would break exact-match assertions.

- [ ] **Step 4: Run to verify it passes**

Run: `node selfcheck.js`
Expected: PASS — prints `selfcheck OK` (the pre-existing assertions must still pass; `weekdayName` is not imported here)

- [ ] **Step 5: Apply the formats in `app.js`**

Import list (`app.js:1`) — `weekdayName` is dropped (no longer called) and the three new helpers added; `tzParts` is dropped at the end of this step once its last call site is converted:

```js
import { REFRESH_MS, forecastTimes, pool, aggregateToday, aggregateWeek, dateKey, radarTimes, clockTime, dayLabel, weekLabel } from './logic.js';
```

Status line — replace `app.js:41-42`:

```js
    const p = tzParts(new Date().toISOString(), loc.tz);
    document.getElementById('lastUpdate').textContent = `Updated ${p.hour}:${p.minute} local${offline ? ' (offline)' : ''}`;
```

with:

```js
    document.getElementById('lastUpdate').textContent = `Updated ${clockTime(new Date().toISOString(), loc.tz)} local${offline ? ' (offline)' : ''}`;
```

Hourly time cell — replace `app.js:159-163`:

```js
  const rows = hours.slice(0, 48).map(h => {
    const p = tzParts(h.time, tz);
    return `<tr><td>${p.day}/${p.month} ${p.hour}:00</td><td>${Math.round(h.pop)}%</td><td>${h.precip.toFixed(1)}</td></tr>`;
  }).join('');
```

with:

```js
  const rows = hours.slice(0, 48).map(h => {
    return `<tr><td>${dayLabel(h.time, tz)}, ${clockTime(h.time, tz, false)}</td><td>${Math.round(h.pop)}%</td><td>${h.precip.toFixed(1)}</td></tr>`;
  }).join('');
```

Period labels — in `todayTable` (`app.js:172-174`) drop the hour hints:

```js
    + row('Morning (6–12)', per.morning)
    + row('Afternoon (12–18)', per.afternoon)
    + row('Night (18–6)', per.night)
```

becomes:

```js
    + row('Morning', per.morning)
    + row('Afternoon', per.afternoon)
    + row('Night', per.night)
```

Week cell — replace `app.js:180-183`:

```js
  const rows = days.map(d => {
    const iso = d.date + 'T12:00:00Z';
    return `<tr><td>${d.date} ${weekdayName(iso, tz)}</td><td>${Math.round(d.pop)}%</td><td>${d.precip.toFixed(1)}</td></tr>`;
  }).join('');
```

with:

```js
  const rows = days.map(d => {
    return `<tr><td>${weekLabel(d.date)}</td><td>${Math.round(d.pop)}%</td><td>${d.precip.toFixed(1)}</td></tr>`;
  }).join('');
```

Radar readout — replace `app.js:253-254`:

```js
  const p = tzParts(f.time, currentLocation?.tz || 'UTC');
  document.getElementById('radarTime').textContent = `${p.hour}:${p.minute}`;
```

with:

```js
  document.getElementById('radarTime').textContent = clockTime(f.time, currentLocation?.tz || 'UTC');
```

`tzParts` is deliberately absent from that import: the three call sites converted in this step (`app.js:41`, `app.js:160`, `app.js:253`) are its only uses in `app.js`. Apply the import edit together with all four replacements above so no step leaves a dangling reference. `selfcheck.js` keeps its own `tzParts` import — it still tests that helper.

- [ ] **Step 6: Syntax check both modules**

Run: `node --check app.js && node --check logic.js && node --check selfcheck.js`
Expected: no output, exit 0

- [ ] **Step 7: Verify in the browser**

Run: `cd /home/clarke/code/html/stupidweather && python3 -m http.server 8000`, open http://localhost:8000

Expected: Hourly time cells read `Oct 15, 3 PM` style (date + 12-hour, no `:00`); 7-Day reads `Oct 15 Thursday`; Today rows read `Morning` / `Afternoon` / `Night` with no parentheses; the Radar tab readout and the `Updated … local` line are both 12-hour. Check a location whose local date differs from UTC (search `Auckland`) — the 7-Day dates must match the rows, not sit a day ahead.

- [ ] **Step 8: Commit**

```bash
git add logic.js app.js selfcheck.js
git commit -m "feat: use 12-hour clocks and Oct D date labels"
```

---

### Task 2: Condition, unit helpers, and extended aggregation

**Files:**
- Modify: `logic.js` (add `conditionWord`, `fmtTemp`, `fmtKmh`, `fmtHiLo`; extend `aggregateToday`, `aggregateWeek`)
- Test: `selfcheck.js`

**Interfaces:**
- Consumes: nothing new (uses existing `hourOf`, `dateKey`)
- Produces (Task 3 relies on these exact signatures):
  - `conditionWord(cloud: number|null, tstorm: number|null): string`
  - `fmtTemp(t: number|null): string` → `'13°'` / `'–'`
  - `fmtKmh(ms: number|null): string` → `'14'` / `'–'`
  - `fmtHiLo(hi: number|null, lo: number|null): string` → `'14°/6°'` / `'–'`
  - `aggregateToday(hours, tz)` now returns `{ morning|afternoon|night: { pop, precip, hi, lo, wind, gust, cond } }`
  - `aggregateWeek(hours, tz)` now returns `[{ date, pop, precip, hi, lo, wind, gust, cond }]`
  - `hi`/`lo`/`wind`/`gust` stay in source units (°C and m/s); `cond` is a severity word or `null`. Every one of these is `null` when the period has no usable data, and `null` renders as `–`.

- [ ] **Step 1: Write the failing tests**

Replace the existing `aggregateToday` and `aggregateWeek` test blocks in `selfcheck.js` (their `deepEqual` expectations gain the new keys) and extend the import from Task 1:

```js
import { tzParts, dateKey, forecastTimes, aggregateToday, aggregateWeek, pool, radarTimes, clockTime, dayLabel, weekLabel, conditionWord, fmtTemp, fmtKmh, fmtHiLo } from './logic.js';
```

Replace the block starting `// aggregateToday: windows by local hour` through the `week[1]` assertion with:

```js
// aggregateToday: windows by local hour (Toronto, EDT = UTC-4 in October)
const hours = [
  { time: '2026-10-14T14:00:00Z', pop: 20, precip: 1, temp: 18.2, wind: 3, gust: 6, cloud: 10, tstorm: 0 },  // 10:00 local -> morning
  { time: '2026-10-14T18:00:00Z', pop: 60, precip: 2, temp: 12.4, wind: 5, gust: 11, cloud: 90, tstorm: 0 }, // 14:00 local -> afternoon
  { time: '2026-10-15T01:00:00Z', pop: 5,  precip: 0, temp: 6.1,  wind: null, gust: null, cloud: null, tstorm: null }, // 21:00 local -> night
];
const per = aggregateToday(hours, 'America/Toronto');
assert.deepEqual(per.morning, { pop: 20, precip: 1, hi: 18.2, lo: 18.2, wind: 3, gust: 6, cond: 'Sunny' });
assert.deepEqual(per.afternoon, { pop: 60, precip: 2, hi: 12.4, lo: 12.4, wind: 5, gust: 11, cond: 'Cloudy' });
assert.deepEqual(per.night, { pop: 5, precip: 0, hi: 6.1, lo: 6.1, wind: null, gust: null, cond: null });

// a period with no hours at all keeps POP/precip at 0 and leaves the rest null
const empty = aggregateToday([], 'America/Toronto');
assert.deepEqual(empty.morning, { pop: 0, precip: 0, hi: null, lo: null, wind: null, gust: null, cond: null });

// aggregateWeek: group by local date, pop=max, precip=sum
const weekHours = [...hours, { time: '2026-10-15T14:00:00Z', pop: 30, precip: 4, temp: 15, wind: 8, gust: null, cloud: 45, tstorm: 40 }];
const week = aggregateWeek(weekHours, 'America/Toronto');
assert.deepEqual(week[0], { date: '2026-10-14', pop: 60, precip: 3, hi: 18.2, lo: 6.1, wind: 5, gust: 11, cond: 'Cloudy' });
assert.deepEqual(week[1], { date: '2026-10-15', pop: 30, precip: 4, hi: 15, lo: 15, wind: 8, gust: null, cond: 'Thunderstorm' });

// conditionWord: thresholds at their boundaries, thunderstorm wins
assert.equal(conditionWord(92, 0), 'Cloudy');
assert.equal(conditionWord(70, 0), 'Cloudy');
assert.equal(conditionWord(69, 0), 'Partly cloudy');
assert.equal(conditionWord(25, 0), 'Partly cloudy');
assert.equal(conditionWord(24, 0), 'Sunny');
assert.equal(conditionWord(50, 30), 'Thunderstorm');
assert.equal(conditionWord(50, 29), 'Partly cloudy');
assert.equal(conditionWord(null, 40), 'Thunderstorm');
assert.equal(conditionWord(null, null), '–');

// unit and label helpers: null renders as an en dash, 0 is a real value
assert.equal(fmtTemp(12.6), '13°');
assert.equal(fmtTemp(null), '–');
assert.equal(fmtTemp(undefined), '–');
assert.equal(fmtKmh(3.7509854), '14');
assert.equal(fmtKmh(0), '0');
assert.equal(fmtKmh(null), '–');
assert.equal(fmtHiLo(14.2, 6.1), '14°/6°');
assert.equal(fmtHiLo(null, 6.1), '–');
assert.equal(fmtHiLo(14.2, null), '–');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node selfcheck.js`
Expected: FAIL — `does not provide an export named 'conditionWord'`

- [ ] **Step 3: Implement the helpers in `logic.js`**

Add above `aggregateToday`:

```js
const SEVERITY = ['Sunny', 'Partly cloudy', 'Cloudy', 'Thunderstorm'];

export function conditionWord(cloud, tstorm) {
  if (tstorm != null && tstorm >= 30) return 'Thunderstorm';
  if (cloud == null) return '–';
  if (cloud < 25) return 'Sunny';
  if (cloud < 70) return 'Partly cloudy';
  return 'Cloudy';
}

export function fmtTemp(t) { return t == null ? '–' : `${Math.round(t)}°`; }

export function fmtKmh(ms) { return ms == null ? '–' : `${Math.round(ms * 3.6)}`; }

export function fmtHiLo(hi, lo) {
  if (hi == null || lo == null) return '–';
  return `${Math.round(hi)}°/${Math.round(lo)}°`;
}

function worse(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a;
}

function emptyStat() {
  return { pop: 0, precip: 0, hi: null, lo: null, wind: null, gust: null, cond: null };
}

function addHour(stat, h) {
  stat.pop = Math.max(stat.pop, h.pop ?? 0);
  stat.precip += h.precip ?? 0;
  if (h.temp != null) {
    stat.hi = stat.hi == null ? h.temp : Math.max(stat.hi, h.temp);
    stat.lo = stat.lo == null ? h.temp : Math.min(stat.lo, h.temp);
  }
  if (h.wind != null) stat.wind = stat.wind == null ? h.wind : Math.max(stat.wind, h.wind);
  if (h.gust != null) stat.gust = stat.gust == null ? h.gust : Math.max(stat.gust, h.gust);
  const c = conditionWord(h.cloud, h.tstorm);
  if (c !== '–') stat.cond = worse(stat.cond, c);
}
```

`fmtKmh` must test for `null` **before** rounding — `Math.round(null)` is `0`, which would turn a missing gust into a confident `0`.

- [ ] **Step 4: Rewire both aggregators**

Replace `aggregateToday` entirely:

```js
export function aggregateToday(hours, tz) {
  const buckets = { morning: [], afternoon: [], night: [] };
  for (const h of hours) {
    const hr = hourOf(h.time, tz);
    if (hr >= 6 && hr < 12) buckets.morning.push(h);
    else if (hr >= 12 && hr < 18) buckets.afternoon.push(h);
    else buckets.night.push(h);
  }
  const agg = list => { const s = emptyStat(); for (const h of list) addHour(s, h); return s; };
  return { morning: agg(buckets.morning), afternoon: agg(buckets.afternoon), night: agg(buckets.night) };
}
```

Replace `aggregateWeek` entirely:

```js
export function aggregateWeek(hours, tz) {
  const map = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!map.has(key)) map.set(key, { ...emptyStat(), date: key });
    addHour(map.get(key), h);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

POP = period max and precip = period sum are unchanged; `addHour` only extends them.

- [ ] **Step 5: Run to verify it passes**

Run: `node selfcheck.js`
Expected: PASS — prints `selfcheck OK`, including the rewritten `aggregateToday`/`aggregateWeek` assertions from Step 1

- [ ] **Step 6: Syntax check**

Run: `node --check logic.js && node --check selfcheck.js`
Expected: no output, exit 0

- [ ] **Step 7: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: add condition, units and extended period aggregation"
```

---

### Task 3: Temperature, condition, wind and gust columns

**Files:**
- Modify: `app.js:158-191` (the three table builders)
- Modify: `styles.css` (one line)

**Interfaces:**
- Consumes: `clockTime`, `dayLabel`, `weekLabel` (Task 1); `conditionWord`, `fmtTemp`, `fmtKmh`, `fmtHiLo` (Task 2); `h.temp/wind/gust/cloud/tstorm` fields (added by Task 4, absent until then)
- Produces: the three `<table>` documents with seven columns; `renderForecast(hours, loc, opts?)` signature is unchanged in this task and extended in Task 4

Until Task 4 lands, `h.temp` and friends are `undefined`, so the new cells correctly render `–` — that is the expected state to verify below.

- [ ] **Step 1: Replace `hourlyTable`**

```js
function hourlyTable(hours, tz) {
  const rows = hours.slice(0, 48).map(h => {
    return `<tr><td>${dayLabel(h.time, tz)}, ${clockTime(h.time, tz, false)}</td>`
      + `<td>${Math.round(h.pop)}%</td><td>${h.precip.toFixed(1)}</td>`
      + `<td>${fmtTemp(h.temp)}</td><td>${conditionWord(h.cloud, h.tstorm)}</td>`
      + `<td>${fmtKmh(h.wind)}</td><td>${fmtKmh(h.gust)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Time</th><th>POP</th><th>Precip (mm)</th><th>Temp</th><th>Condition</th><th>Wind (km/h)</th><th>Gust (km/h)</th></tr></thead><tbody>${rows}</tbody></table>`;
}
```

- [ ] **Step 2: Replace `todayTable`**

```js
function todayTable(hours, tz) {
  const today = dateKey(new Date().toISOString(), tz);
  const todays = hours.filter(h => dateKey(h.time, tz) === today);
  const per = aggregateToday(todays, tz);
  const row = (label, v) => `<tr><td>${label}</td><td>${Math.round(v.pop)}%</td><td>${v.precip.toFixed(1)}</td>`
    + `<td>${fmtHiLo(v.hi, v.lo)}</td><td>${v.cond ?? '–'}</td>`
    + `<td>${fmtKmh(v.wind)}</td><td>${fmtKmh(v.gust)}</td></tr>`;
  return `<table><thead><tr><th>Period</th><th>POP</th><th>Precip (mm)</th><th>Temp</th><th>Condition</th><th>Wind (km/h)</th><th>Gust (km/h)</th></tr></thead><tbody>`
    + row('Morning', per.morning)
    + row('Afternoon', per.afternoon)
    + row('Night', per.night)
    + `</tbody></table>`;
}
```

Note the Temp cell on Today/7-Day is `hi/lo` (`fmtHiLo`), while Hourly is a single value (`fmtTemp`).

- [ ] **Step 3: Replace `weekTable`**

```js
function weekTable(hours, tz) {
  const days = aggregateWeek(hours, tz);
  const rows = days.map(d => {
    return `<tr><td>${weekLabel(d.date)}</td><td>${Math.round(d.pop)}%</td><td>${d.precip.toFixed(1)}</td>`
      + `<td>${fmtHiLo(d.hi, d.lo)}</td><td>${d.cond ?? '–'}</td>`
      + `<td>${fmtKmh(d.wind)}</td><td>${fmtKmh(d.gust)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Day</th><th>POP</th><th>Precip (mm)</th><th>Temp</th><th>Condition</th><th>Wind (km/h)</th><th>Gust (km/h)</th></tr></thead><tbody>${rows}</tbody></table>`;
}
```

- [ ] **Step 4: Extend the `app.js` import**

Add `conditionWord, fmtTemp, fmtKmh, fmtHiLo` to the import list on line 1:

```js
import { REFRESH_MS, forecastTimes, pool, aggregateToday, aggregateWeek, dateKey, radarTimes, clockTime, dayLabel, weekLabel, conditionWord, fmtTemp, fmtKmh, fmtHiLo } from './logic.js';
```

- [ ] **Step 5: Add horizontal scrolling to `styles.css`**

Append after the existing `table` rule:

```css
.tab { overflow-x: auto; }
```

`table { width: 100% }` plus a `Partly cloudy` cell can otherwise push the table past the viewport on narrow screens.

- [ ] **Step 6: Verify**

Run: `node --check app.js && node selfcheck.js`
Expected: exit 0, prints `selfcheck OK`

Then at http://localhost:8000 confirm all three forecast tabs show seven columns in the order `Time/Period/Day | POP | Precip (mm) | Temp | Condition | Wind (km/h) | Gust (km/h)`, and that every new cell reads `–` (no `0`s) while the data pipeline from Task 4 is still absent.

- [ ] **Step 7: Commit**

```bash
git add app.js styles.css
git commit -m "feat: show temperature, condition, wind and gust columns"
```

---

### Task 4: Two-pass fetch with progressive rendering

**Files:**
- Modify: `app.js:109-156` (layer constants, `fetchForecast`, cache helpers)
- Modify: `app.js:25-47` (`refreshAll`)
- Modify: `app.js:187-191` (`renderForecast`)

**Interfaces:**
- Consumes: `pool(times, limit, fn)` already passes `(item, index)` as `fn`'s arguments; `pointValue(layer, lat, lon, time)` returns `number | null` and throws on HTTP failure
- Produces:
  - `fetchForecast(loc: {lat, lon}, onProgress?: (hours, hourlyOnly: boolean) => void): Promise<hour[]>`
  - `renderForecast(hours, loc, opts?: { hourlyOnly?: boolean }): void`
  - hour objects gain `temp, wind, gust, cloud, tstorm`, each `number | null`
  - localStorage: `sw:forecastVer === '2'`
  - `loadCachedForecast()` returns `null` for any cache written before this task

- [ ] **Step 1: Add the layer constants**

After the existing two layer constants at `app.js:110-111`:

```js
const LAYER_TEMP = 'GDPS_15km_AirTemp_2m';
const LAYER_WIND = 'GDPS_15km_WindSpeed_10m';
const LAYER_GUST = 'GDPS_15km_WindGust_10m';
const LAYER_CLOUD = 'GDPS_15km_TotalCloudCover';
const LAYER_TSTORM = 'GDPS-WEonG_15km_Thunderstorm-Prob';
const FORECAST_VER = '2';
```

- [ ] **Step 2: Replace `fetchForecast`**

```js
export async function fetchForecast(loc, onProgress) {
  const times = forecastTimes(new Date());

  const base = await pool(times, 6, async time => {
    const [pop, precip] = await Promise.all([
      pointValue(LAYER_POP, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_PCP, loc.lat, loc.lon, time).catch(() => null)
    ]);
    return { time, pop, precip };
  });
  if (base.every(h => h.pop === null && h.precip === null)) {
    throw new Error('Forecast data unavailable');
  }

  const hours = base.map(h => ({
    time: h.time, pop: h.pop ?? 0, precip: h.precip ?? 0,
    temp: null, wind: null, gust: null, cloud: null, tstorm: null
  }));
  writeForecast(hours, loc);
  if (onProgress) onProgress(hours, false);

  await pool(times, 6, async (time, i) => {
    const [temp, wind, gust, cloud, tstorm] = await Promise.all([
      pointValue(LAYER_TEMP, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_WIND, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_GUST, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_CLOUD, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_TSTORM, loc.lat, loc.lon, time).catch(() => null)
    ]);
    Object.assign(hours[i], { temp, wind, gust, cloud, tstorm });
    if (onProgress) onProgress(hours, true);
  });

  writeForecast(hours, loc);
  if (onProgress) onProgress(hours, false);
  return hours;
}

function writeForecast(hours, loc) {
  localStorage.setItem('sw:forecast', JSON.stringify(hours));
  localStorage.setItem('sw:forecastTs', String(Date.now()));
  localStorage.setItem('sw:forecastKey', loc.lat + ',' + loc.lon);
  localStorage.setItem('sw:forecastVer', FORECAST_VER);
}
```

`pool` preserves input order and passes the index, so `hours[i]` lines up with `times[i]` — the pass-2 slots mutate the same objects pass 1 already rendered. The cache is written after pass 1 so an interrupted pass 2 still leaves usable POP/precip behind, then rewritten at the end so the 12-minute staleness clock starts from completed data.

- [ ] **Step 3: Reject stale v1 caches**

Replace `loadCachedForecast` (`app.js:153-156`):

```js
function loadCachedForecast() {
  if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) return null;
  try { return JSON.parse(localStorage.getItem('sw:forecast') || 'null'); }
  catch { return null; }
}
```

Without this, a cache written by v1 has no `temp` key and the new columns stay blank for a full 12-minute cycle.

- [ ] **Step 4: Extend `renderForecast`**

Replace `app.js:187-191`:

```js
export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyTable(hours, loc.tz);
  if (opts.hourlyOnly) return;
  document.getElementById('tab-today').innerHTML = todayTable(hours, loc.tz) + '<p>POP = period max, precip = period total.</p>';
  document.getElementById('tab-week').innerHTML = weekTable(hours, loc.tz) + '<p>POP = daily max, precip = daily total.</p>';
}
```

Today and 7-Day aggregate across all 88 slots, so they are only ever repainted with a complete set of data.

- [ ] **Step 5: Wire throttled progressive painting into `refreshAll`**

Replace `app.js:29-39`:

```js
    const key = loc.lat + ',' + loc.lon;
    let hours = loadCachedForecast();
    let offline = false;
    let lastPaint = 0;
    const paint = (hrs, hourlyOnly) => {
      const now = Date.now();
      if (hourlyOnly && now - lastPaint < 500) return;
      lastPaint = now;
      renderForecast(hrs, loc, { hourlyOnly });
    };
    try {
      if (!hours || forecastIsStale() || localStorage.getItem('sw:forecastKey') !== key) hours = await fetchForecast(loc, paint);
    } catch (e) {
      if (!hours) throw e;
      offline = true;
    }
    renderForecast(hours, loc);
```

The throttle drops intermediate Hourly repaints but never a final one (`hourlyOnly === false` always paints). The unconditional `renderForecast` after the `try` still runs when the cache was fresh and no fetch happened.

- [ ] **Step 6: Verify**

Run: `node --check app.js && node selfcheck.js`
Expected: exit 0, prints `selfcheck OK`

At http://localhost:8000 (hard-reload once so `sw:forecastVer` is written):

1. DevTools → Network: the first burst is POP+precip only (~176 requests), and all three tabs are populated with real POP/Precip while Temp/Condition/Wind/Gust still read `–`.
2. A second burst of the five new layers then fills the Hourly columns in waves; Today and 7-Day do not change until the burst finishes, at which point their Temp/Condition/Wind/Gust appear all at once.
3. DevTools → Application → Local Storage shows `sw:forecastVer` = `2`, and hour objects containing `temp`/`wind`/`gust`/`cloud`/`tstorm` with `null` where GeoMet had no data (check `gust` — it legitimately has holes).
4. Reload the page: the cached data repaints immediately with all columns present.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: fetch forecast in two passes with progressive rendering"
```

---

### Task 5: Multi-city location picker

**Files:**
- Modify: `app.js:49-107` (replace `geocode`/`setLocation`, extend the form handler)
- Modify: `index.html:14-18` (results container)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `onLocationChange`, `currentLocation`, `restoreLocation` (unchanged)
- Produces:
  - `searchPlaces(query: string): Promise<{lat:number, lon:number, name:string}[]>` — Nominatim `limit=5`, no timezone lookup
  - `selectPlace(place): Promise<{name, lat, lon, tz}>` — timezone lookup only
  - `renderResults(list): void`, `choosePlace(place): Promise<void>`
  - New element `#results` immediately after `</form>`
- `geocode()` and the old `setLocation()` are removed; nothing outside `app.js` references them

- [ ] **Step 1: Replace `geocode` and `setLocation` in `app.js`**

Delete both functions (lines 69-97) and insert their replacements:

```js
export async function searchPlaces(query) {
  const search = new URLSearchParams({ format: 'json', limit: '5', q: query });
  const res = await fetch('https://nominatim.openstreetmap.org/search?' + search, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Geocoding failed');
  const json = await res.json();
  if (!json.length) throw new Error('Location not found');
  return json.map(r => ({ lat: Number(r.lat), lon: Number(r.lon), name: r.display_name }));
}

export async function selectPlace(place) {
  const tres = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${place.lat}&longitude=${place.lon}`);
  const tjson = await tres.json().catch(() => null);
  if (!tres.ok || !tjson || !tjson.timeZone) throw new Error('Timezone lookup failed');
  return { name: place.name, lat: place.lat, lon: place.lon, tz: tjson.timeZone };
}

function renderResults(list) {
  const box = document.getElementById('results');
  box.innerHTML = '';
  box.hidden = !list.length;
  for (const place of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = place.name;
    btn.addEventListener('click', () => choosePlace(place));
    box.appendChild(btn);
  }
}

async function choosePlace(place) {
  const status = document.getElementById('status');
  status.textContent = 'Loading…';
  try {
    currentLocation = await selectPlace(place);
    localStorage.setItem('sw:location', JSON.stringify(currentLocation));
    document.getElementById('locationName').textContent = currentLocation.name;
    const box = document.getElementById('results');
    box.innerHTML = '';
    box.hidden = true;
    document.getElementById('locationInput').value = '';
    status.textContent = '';
    await onLocationChange(currentLocation);
  } catch (err) {
    status.textContent = err.message;
    console.error(err);
  }
}
```

The timezone lookup is deliberately deferred to `selectPlace` so a search costs exactly one Nominatim request.

- [ ] **Step 2: Replace the form submit handler**

In `init()` (`app.js:53-57`) replace:

```js
  document.getElementById('locationForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('locationInput').value.trim();
    if (q) setLocation(q);
  });
```

with:

```js
  document.getElementById('locationForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = document.getElementById('locationInput').value.trim();
    if (!q) return;
    const status = document.getElementById('status');
    status.textContent = 'Searching…';
    try {
      renderResults(await searchPlaces(q));
      status.textContent = '';
    } catch (err) {
      renderResults([]);
      status.textContent = err.message;
    }
  });
```

- [ ] **Step 3: Add the container to `index.html`**

Immediately after `</form>` (line 17), before `#locationName`:

```html
      <div id="results" hidden></div>
```

- [ ] **Step 4: Style the picker in `styles.css`**

```css
#results { display: flex; flex-direction: column; gap: .25rem; margin-top: .4rem; }
#results[hidden] { display: none; }
#results button { font: inherit; text-align: left; padding: .35rem .5rem; border: 1px solid #ddd; background: #f7f7f7; cursor: pointer; }
#results button:hover, #results button:focus { background: #eef; }
```

`#results[hidden] { display: none }` is required — an author `display: flex` overrides the `hidden` attribute's default styling.

- [ ] **Step 5: Verify**

Run: `node --check app.js && node selfcheck.js`
Expected: exit 0, prints `selfcheck OK`

At http://localhost:8000:
1. Search `Toronto` — up to five clickable full `display_name` rows appear under the box, and no forecast request fires until one is clicked (Network tab shows a single Nominatim request).
2. Tab to a result with the keyboard and press Enter — the list and input clear, `#locationName` updates, and the active tab repaints for the new location.
3. Search `Springfield` — several distinct results appear, each selecting to a different forecast.
4. Search `zzzznotacity` — status shows `Location not found` and the list is empty.
5. Reload — the previously chosen location is restored by `restoreLocation()` exactly as before.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html styles.css
git commit -m "feat: multi-city location search"
```

---

### Task 6: Fix the refresh TDZ crash

**Files:**
- Modify: `app.js:63` (the `init();` call)

**Interfaces:**
- Consumes: `init()` (declaration at `app.js:49-62`), `refreshRadar`, `initRadar`, `WMS`, `LAYER_*`
- Produces: no interface change — this is purely an invocation-order fix

Root cause: `init()` runs at line 63, before `let radarMap` (line 194) and `const WMS` (line 109) are initialised. On refresh the forecast cache is under 12 minutes old, so `refreshAll` reaches `refreshRadar → initRadar → if (radarMap)` with no intervening `await`, hitting the temporal dead zone. The `ReferenceError` is swallowed by `refreshAll`'s `catch` and surfaced as `Update failed: can't access lexical declaration 'radarMap' before initialization`. A cold load only works because `await fetchForecast` yields long enough for module evaluation to finish.

- [ ] **Step 1: Move the call**

Delete `init();` from line 63 and append it as the final statement of `app.js` (after the `window.addEventListener('resize', …)` block):

```js
init();
```

One move clears every top-level binding. Moving only the radar declarations would leave `WMS` in the same trap, and deferring via `DOMContentLoaded` would hide the ordering bug rather than fix it.

- [ ] **Step 2: Syntax check**

Run: `node --check app.js`
Expected: no output, exit 0

- [ ] **Step 3: Verify the regression**

At http://localhost:8000:
1. Load the page once (this populates `sw:forecast`, `sw:forecastTs`, `sw:forecastKey`, `sw:forecastVer`).
2. **Reload within 12 minutes** — the cache is fresh, which is exactly the condition that used to throw.
3. Expected: `#status` stays empty (or shows `Search a city to begin.` on a first-ever visit); it must **not** show `Update failed: …`.
4. Confirm in the console that no `ReferenceError` is thrown.

Also confirm a stale-cache load still works: in DevTools → Application → Local Storage, delete `sw:forecastTs` and reload — the forecast refetches without error.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "fix: initialise app after all module bindings"
```

---

### Task 7: Bump the service worker cache

**Files:**
- Modify: `sw.js:1`

**Interfaces:**
- Consumes: existing `activate` handler, which already deletes every cache whose name is not `CACHE`
- Produces: `CACHE === 'stupid-weather-v3'`

`sw.js` serves the app shell cache-first with no revalidation, so leaving the name at `stupid-weather-v2` would pin every existing client to the pre-v2 assets forever. This task must run last, once every other asset has changed.

- [ ] **Step 1: Bump the constant**

```js
const CACHE = 'stupid-weather-v3';
```

- [ ] **Step 2: Verify**

Run: `node --check sw.js`
Expected: no output, exit 0

At http://localhost:8000, hard-reload once, then DevTools → Application → Cache Storage: only `stupid-weather-v3` remains and `stupid-weather-v2` has been deleted. Reload again and confirm the page still loads its shell and `node selfcheck.js` still prints `selfcheck OK`.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore: bump service worker cache to v3"
```

---

## Final verification (all tasks complete)

```bash
cd /home/clarke/code/html/stupidweather
node selfcheck.js && node --check app.js && node --check logic.js && node --check selfcheck.js && node --check sw.js
git log --oneline -7
git status --short
```

Expected: `selfcheck OK`, all `--check` silent, seven new commits, clean working tree.

Then the full manual pass at http://localhost:8000 covering every `## Verification` bullet in `docs/superpowers/specs/2026-10-15-stupid-weather-v2-design.md`.
