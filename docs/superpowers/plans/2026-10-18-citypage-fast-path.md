# Citypage Fast Path + Loading Speedups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the ~30s wait and 7-Day skeletons on location switches by painting both tabs in under a second from EC's `citypageweather-realtime` collection, keeping the GDPS grid as the source of truth, and making cached locations switch instantly.

**Architecture:** On a cache miss, `refreshAll` fires the existing 266-request GDPS grid fetch and, in parallel, one ~30KB citypage request (~150ms). If the citypage lands first, its 24 hourly entries and 12 forecast periods render both tabs immediately; grid results progressively replace the hourly rows and the final render replaces everything. Citypage data is never cached. A multi-slot `localStorage` cache (5 locations) makes switches back to a recent location instant. Radar now loads only after the forecast finishes so it stops competing for the browser's 6 HTTP/1.1 connections.

**Tech Stack:** Vanilla ES modules, no dependencies. Data: MSC GeoMet WMS (grid, unchanged) + MSC GeoMet-OGC-API `citypageweather-realtime` on `api.weather.gc.ca` (CORS `*`, verified live).

## Global Constraints

- No build step, no dependencies, no framework: plain ES modules with named exports only.
- No code comments unless a non-obvious decision needs recording; deliberate simplifications get a `// ponytail: <ceiling>, <upgrade path>` comment.
- `node selfcheck.js` is the only test command. It may import `logic.js` and read `index.html`/`manifest.webmanifest` — **never `app.js`** (it touches `document` at import time). Keep its output pristine.
- DOM-bound changes (rendering, refresh flow, radar) cannot be unit-tested; hand-verify them in a browser in Task 4 and report results. Do not invent tests that assert nothing.
- Cache schema changes: `FORECAST_VER` `'3'` → `'4'`. Service worker: `CACHE` `'stupid-weather-v13'` → `'stupid-weather-v14'` (ASSETS list unchanged).
- Do **not** commit — the human has not asked for commits.

---

## Design (spec)

**Problem.** First load / location switch issues ~266 WMS GetFeatureInfo requests (38 time slots × 7 layers). Browser HTTP/1.1 caps at ~6 connections per origin; 266 ÷ 6 × ~300ms ≈ 13s floor plus overhead → ~30s observed, with skeletons the whole time. Verified this session: shrinking the query raster does not reduce latency (per-request overhead dominates), WMS rejects multi-TIME queries, WCS has no time axis, `raster-drill` only accepts GeoMet-Climate layers, and `prognos-gdps-realtime` only carries AirTemp. The `pool` bump 4→6 is a **no-op**: each time slot already fans out 7 layers, so 4 slots × 7 = 28 requests are already queued on the 6-connection cap.

**Decision A — citypage fast path (new).** `citypageweather-realtime` returns one item (~30KB, ~134ms, CORS `*`) containing 24 hourly entries (`timestamp`, `condition.en`, `temperature.value.en`, `lop.value.en` POP %, `wind.speed/gust.value.en` km/h — gust key may be absent) and 12 `forecastGroup` periods (`period.textForecastName.en` like "Tonight"/"Monday"/"Monday night", `temperatures.temperature[].{class.en,value.en}`, `abbreviatedForecast.textSummary.en`, `winds.periods[]` with speed/gust — absent on later periods, gust may be 0, no POP/precip fields). Bbox ±0.4° around the location, `limit=1`; 0 features (rural) → fall back to today's behavior. `AbortSignal.timeout(5000)` so a hung citypage can never delay the grid result. The grid stays the truth: citypage paints are transient (replaced by grid data) and are never written to the cache.

- Hours: km/h → m/s (`/ 3.6`), `lop` → `pop`, `precip`/`cloud`/`tstorm` → `null`, `cond` from EC text via new `ecConditionWord`.
- Days: positional state machine over periods — a day period whose date already has a hi/lo advances the cursor (no weekday-name parsing); a night period ("Tonight" matches `/night/i`) sets that date's `lo`; day sets `hi`. `wind`/`gust` = max across the day's wind periods (km/h → m/s); `cond` = `worse()` of mapped period words; `pop` merged from hourly `lop` for matching dates; `feels = windChill(hi, day max wind)` — ponytail: grid uses the high-temp hour's own wind; the max-wind variant differs by a degree at most and the grid replaces it within seconds anyway.
- Render: hourly rows use `h.cond ?? conditionWord(...)`; POP/precip/week POP/precip get null guards (`–` display); `weekCards` takes a prebuilt days array (`renderForecast(hours, loc, { days })`).

**Decision B — multi-location cache.** Single `sw:forecast` slot becomes `sw:forecasts` = `{"lat,lon": {ts, hours}}`, capped at 5 entries (oldest evicted), versioned by `sw:forecastVer = '4'`. `loadCachedForecast(key)` returns `{ts, hours} | null`; staleness = `!cached || Date.now() - cached.ts > REFRESH_MS`. `forecastIsStale` is deleted (only consumer is `refreshAll`).

**Decision C — radar deferral.** `refreshRadar` moves from the top of `refreshAll` (parallel with the grid) to after the final render and `Updated` text. Hidden-radar behavior is unchanged (it already early-returns on zero map size); the win is when the radar tab is open or frames exist during a refresh.

**Skipped:** citypage as a permanent replacement (would lose precip mm/cloud/tstorm/POP-on-week-cards); caching citypage data; pool bump; all the dead-ended collections above; `period.value.en` weekday cross-checks (positional pairing suffices).

---

### Task 1: logic.js — citypage parsing (`ecConditionWord`, `citypageToForecast`) + tests

**Files:**
- Modify: `logic.js` (insert `ecConditionWord` after `conditionWord` ~line 77; insert `citypageToForecast` + `citypageDays` after `aggregateWeek` ~line 145)
- Test: `selfcheck.js` (import line 3; new assertions before `console.log`)

**Interfaces:**
- Consumes: existing `dateKey`, `worse`, `windChill` from `logic.js`.
- Produces:
  - `ecConditionWord(text: string|null) -> string|null` — EC text → app condition word ('Sunny'|'Clear'|'Partly cloudy'|'Cloudy'|'Thunderstorm'|'Flurries'|'Blizzard'), `null` for empty/missing.
  - `citypageToForecast(props: object, tz: string, now?: Date) -> { hours: Hour[], days: Day[] }` where `Hour = {time, pop, precip, temp, wind, gust, cloud, tstorm, cond}` (m/s, `precip`/`cloud`/`tstorm` null) and `Day = {date, pop, precip, hi, lo, wind, gust, cond, feels}` (same shape `aggregateWeek` produces; `pop`/`precip` may be null).

- [ ] **Step 1: Write the failing tests** — add to `selfcheck.js` import line: `ecConditionWord, citypageToForecast`. Append before `console.log('selfcheck OK')`:

```js
// ecConditionWord: EC text summaries map onto the app's condition vocabulary
assert.equal(ecConditionWord('Sunny'), 'Sunny');
assert.equal(ecConditionWord('Mainly sunny'), 'Sunny');
assert.equal(ecConditionWord('Clear'), 'Clear');
assert.equal(ecConditionWord('A few clouds'), 'Partly cloudy');
assert.equal(ecConditionWord('Partly cloudy'), 'Partly cloudy');
assert.equal(ecConditionWord('Cloudy'), 'Cloudy');
assert.equal(ecConditionWord('Chance of showers'), 'Cloudy');
assert.equal(ecConditionWord('Thunderstorms'), 'Thunderstorm');
assert.equal(ecConditionWord('Flurries'), 'Flurries');
assert.equal(ecConditionWord('Blowing snow'), 'Flurries');
assert.equal(ecConditionWord('Blizzard'), 'Blizzard');
assert.equal(ecConditionWord(''), null);
assert.equal(ecConditionWord(null), null);

// citypageToForecast: field paths mirror the live collection (probed 2026-10-18)
const cpProps = {
  hourlyForecastGroup: { hourlyForecasts: [
    { timestamp: '2026-10-18T21:00:00Z', condition: { en: 'Clear' }, temperature: { value: { en: 11 } },
      lop: { value: { en: 0 } }, wind: { speed: { value: { en: 20 } }, gust: { value: { en: 40 } } } },
    { timestamp: '2026-10-19T03:00:00Z', condition: { en: 'Cloudy' }, temperature: { value: { en: 7 } },
      lop: { value: { en: 60 } }, wind: { speed: { value: { en: 15 } } } },
    { timestamp: '2026-10-19T15:00:00Z', condition: { en: 'Sunny' }, temperature: { value: { en: 17 } },
      lop: { value: { en: 20 } }, wind: { speed: { value: { en: 10 } }, gust: { value: { en: 0 } } } }
  ]},
  forecastGroup: { forecasts: [
    { period: { textForecastName: { en: 'Tonight' } },
      temperatures: { temperature: [{ class: { en: 'low' }, value: { en: 5 } }] },
      winds: { periods: [{ speed: { value: { en: 20 } }, gust: { value: { en: 40 } } }] },
      abbreviatedForecast: { textSummary: { en: 'Clear' } } },
    { period: { textForecastName: { en: 'Monday' } },
      temperatures: { temperature: [{ class: { en: 'high' }, value: { en: 19 } }] },
      winds: { periods: [{ speed: { value: { en: 15 } }, gust: { value: { en: 0 } } }] },
      abbreviatedForecast: { textSummary: { en: 'Sunny' } } },
    { period: { textForecastName: { en: 'Monday night' } },
      temperatures: { temperature: [{ class: { en: 'low' }, value: { en: 5 } }] },
      winds: { periods: [{ speed: { value: { en: 5 } }, gust: { value: { en: 0 } } }] },
      abbreviatedForecast: { textSummary: { en: 'A few clouds' } } },
    { period: { textForecastName: { en: 'Tuesday' } },
      temperatures: { temperature: [{ class: { en: 'high' }, value: { en: 17 } }] },
      abbreviatedForecast: { textSummary: { en: 'Sunny' } } }
  ]}
};
const cp = citypageToForecast(cpProps, 'America/Toronto', new Date('2026-10-18T20:00:00Z')); // Sun 16:00 local

assert.equal(cp.hours.length, 3);
assert.deepEqual(cp.hours[0], { time: '2026-10-18T21:00:00Z', pop: 0, precip: null, temp: 11,
  wind: 20 / 3.6, gust: 40 / 3.6, cloud: null, tstorm: null, cond: 'Clear' });
assert.equal(cp.hours[1].gust, null);   // gust key absent from EC hourly data
assert.equal(cp.hours[1].cond, 'Cloudy');
assert.equal(cp.hours[2].gust, 0);      // gust 0 is a value, not missing data

// Tonight -> today's low; day periods advance the cursor; night pairs with its day
assert.equal(cp.days.length, 3);
assert.deepEqual(cp.days[0], { date: '2026-10-18', pop: 60, precip: null, hi: null, lo: 5,
  wind: 20 / 3.6, gust: 40 / 3.6, cond: 'Clear', feels: null });
assert.deepEqual(cp.days[1], { date: '2026-10-19', pop: 20, precip: null, hi: 19, lo: 5,
  wind: 15 / 3.6, gust: 0, cond: 'Partly cloudy', feels: null });
assert.deepEqual(cp.days[2], { date: '2026-10-20', pop: null, precip: null, hi: 17, lo: null,
  wind: null, gust: null, cond: 'Sunny', feels: null });

// daytime issue: a leading day period lands on today without advancing
const cp2 = citypageToForecast({
  forecastGroup: { forecasts: [
    { period: { textForecastName: { en: 'Sunday' } },
      temperatures: { temperature: [{ class: { en: 'high' }, value: { en: 14 } }] },
      abbreviatedForecast: { textSummary: { en: 'Sunny' } } },
    { period: { textForecastName: { en: 'Sunday night' } },
      temperatures: { temperature: [{ class: { en: 'low' }, value: { en: 3 } }] },
      abbreviatedForecast: { textSummary: { en: 'Clear' } } }
  ]}
}, 'America/Toronto', new Date('2026-10-18T15:00:00Z'));
assert.deepEqual(cp2.days, [{ date: '2026-10-18', pop: null, precip: null, hi: 14, lo: 3,
  wind: null, gust: null, cond: 'Sunny', feels: null }]);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node selfcheck.js`
Expected: throws `ReferenceError: ecConditionWord is not defined` (or import error).

- [ ] **Step 3: Implement in `logic.js`** — insert after `conditionWord` (line 77):

```js
export function ecConditionWord(text) {
  const s = (text || '').toLowerCase();
  if (!s) return null;
  if (s.includes('thunder')) return 'Thunderstorm';
  if (s.includes('blizzard')) return 'Blizzard';
  if (s.includes('flurr') || s.includes('snow')) return 'Flurries';
  if (s.includes('sunny')) return 'Sunny';
  if (s.includes('clear')) return 'Clear';
  if (s.includes('few') || s.includes('partly')) return 'Partly cloudy';
  return 'Cloudy';
}
```

Insert after `aggregateWeek` (line 145):

```js
export function citypageToForecast(props, tz, now = new Date()) {
  const hours = (props.hourlyForecastGroup?.hourlyForecasts || []).map(h => ({
    time: h.timestamp,
    pop: h.lop?.value?.en ?? null,
    precip: null,
    temp: h.temperature?.value?.en ?? null,
    wind: h.wind?.speed?.value?.en != null ? h.wind.speed.value.en / 3.6 : null,
    gust: h.wind?.gust?.value?.en != null ? h.wind.gust.value.en / 3.6 : null,
    cloud: null,
    tstorm: null,
    cond: ecConditionWord(h.condition?.en)
  }));
  const days = citypageDays(props.forecastGroup?.forecasts || [], tz, now);
  for (const h of hours) {
    const d = days.find(x => x.date === dateKey(h.time, tz));
    if (d && h.pop != null) d.pop = Math.max(d.pop ?? 0, h.pop);
  }
  return { hours, days };
}

// ponytail: days pair positionally (day advances, night fills), not by weekday name;
// feels uses the day's max wind instead of the high-temp hour's wind — grid data
// replaces this within seconds, so the degree of precision isn't worth parsing
function citypageDays(periods, tz, now) {
  const out = new Map();
  let cur = dateKey(now.toISOString(), tz);
  const day = k => {
    if (!out.has(k)) out.set(k, { date: k, pop: null, precip: null, hi: null, lo: null, wind: null, gust: null, cond: null, feels: null });
    return out.get(k);
  };
  const nextKey = k => {
    const t = new Date(`${k}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  for (const p of periods) {
    const name = p.period?.textForecastName?.en || '';
    const night = /night/i.test(name);
    if (!night) {
      const d = day(cur);
      if (d.hi != null || d.lo != null) cur = nextKey(cur);
    }
    const d = day(cur);
    const temps = p.temperatures?.temperature || [];
    const hi = temps.find(t => t.class?.en === 'high')?.value?.en;
    const lo = temps.find(t => t.class?.en === 'low')?.value?.en;
    if (night) { if (lo != null) d.lo = lo; }
    else if (hi != null) d.hi = hi;
    for (const w of p.winds?.periods || []) {
      const sp = w.speed?.value?.en;
      const gu = w.gust?.value?.en;
      if (sp != null) d.wind = d.wind == null ? sp / 3.6 : Math.max(d.wind, sp / 3.6);
      if (gu != null) d.gust = d.gust == null ? gu / 3.6 : Math.max(d.gust, gu / 3.6);
    }
    const c = ecConditionWord(p.abbreviatedForecast?.textSummary?.en);
    if (c) d.cond = worse(d.cond, c);
  }
  for (const d of out.values()) d.feels = windChill(d.hi, d.wind);
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 5: No commit** (per Global Constraints).

---

### Task 2: app.js — rendering accepts citypage-shaped data

**Files:**
- Modify: `app.js` — `hourlyList` (lines 247-276), `weekCards` (lines 278-298), `renderForecast` (lines 305-309)

**Interfaces:**
- Consumes: `Hour.cond` (optional, from Task 1), `Day.pop`/`Day.precip` possibly null.
- Produces: `weekCards(days: Day[]) -> string` (was `weekCards(hours, tz)`); `renderForecast(hours, loc, opts)` where `opts.days` optionally supplies the aggregated week. Grid-only call sites (`hourlyOnly` progress, plain final render) are unchanged in behavior because `opts.days` defaults to `aggregateWeek(hours, loc.tz)`.

- [ ] **Step 1: Hourly rows prefer an explicit `cond` and guard null POP/precip** — in `hourlyList`, replace line 254:

```js
      const cond = h.cond ?? conditionWord(h.cloud, h.tstorm, h.temp, h.precip, h.wind, night);
```

Replace lines 267-268:

```js
        + `<span>POP ${h.pop == null ? '–' : Math.round(h.pop) + '%'}</span>`
        + `<span>${h.precip == null ? '–' : h.precip.toFixed(1)} mm</span>`
```

- [ ] **Step 2: `weekCards` takes a days array and guards null POP/precip** — replace lines 278-279 and 291-292:

```js
function weekCards(days) {
  const cards = days.map(d => {
```

```js
      + `<div><dt>POP</dt><dd>${d.pop == null ? '–' : Math.round(d.pop) + '%'}</dd></div>`
      + `<div><dt>Precip (mm)</dt><dd>${d.precip == null ? '–' : d.precip.toFixed(1)}</dd></div>`
```

- [ ] **Step 3: `renderForecast` accepts prebuilt days** — replace line 308:

```js
  const days = opts.days || aggregateWeek(hours, loc.tz);
  document.getElementById('tab-week').innerHTML = weekCards(days) + '<p class="note">POP = daily max, precip = daily total.</p>';
```

- [ ] **Step 4: Run the suite**

Run: `node selfcheck.js`
Expected: `selfcheck OK` (logic untouched; this task is DOM-bound and is browser-verified in Task 4 — do not add a test that asserts nothing).

- [ ] **Step 5: No commit.**

---

### Task 3: app.js — citypage fast path, multi-location cache, radar deferral

**Files:**
- Modify: `app.js` — import line 1; constants near line 179-187; new `fetchCitypage` after `fetchForecast`; `writeForecast`/`forecastIsStale`/`loadCachedForecast` (lines 229-245); `refreshAll` (lines 27-63)

**Interfaces:**
- Consumes: `citypageToForecast(props, tz)` from Task 1; `renderForecast(hours, loc, { days })` from Task 2.
- Produces:
  - `fetchCitypage(loc) -> Promise<{hours: Hour[], days: Day[]}>` — throws on HTTP error, no feature, or 5s timeout.
  - `loadCachedForecast(key: string) -> {ts: number, hours: Hour[]} | null`
  - `writeForecast(hours, loc)` — upserts into `sw:forecasts` map (cap 5, oldest-ts evicted), sets `sw:forecastVer = '4'`.
  - `refreshAll(loc)` flow: skeleton (only if uncached) → grid fetch starts → citypage fast paint (only if uncached and grid hasn't painted) → final render → `Updated` → radar.

- [ ] **Step 1: Import the new helper** — line 1, add `citypageToForecast` to the `./logic.js` import list.

- [ ] **Step 2: Add the citypage endpoint + fetcher** — after the `WMS` const (line 179):

```js
const CITYPAGE = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items';
```

after `fetchForecast` (line 227):

```js
async function fetchCitypage(loc) {
  const d = 0.4;
  const p = new URLSearchParams({
    bbox: `${loc.lon - d},${loc.lat - d},${loc.lon + d},${loc.lat + d}`,
    limit: '1', f: 'json'
  });
  const res = await fetch(`${CITYPAGE}?${p}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('city page ' + res.status);
  const json = await res.json();
  const f = json.features && json.features[0];
  if (!f) throw new Error('no city page nearby');
  return citypageToForecast(f.properties, loc.tz);
}
```

- [ ] **Step 3: Replace the cache layer** — change line 187 to `const FORECAST_VER = '4';`. Replace lines 229-245 (`writeForecast`, `forecastIsStale`, `loadCachedForecast`) with:

```js
function writeForecast(hours, loc) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem('sw:forecasts') || '{}'); } catch {}
  if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) all = {};
  all[loc.lat + ',' + loc.lon] = { ts: Date.now(), hours };
  const keys = Object.keys(all);
  if (keys.length > 5) {
    keys.sort((a, b) => all[a].ts - all[b].ts);
    for (const k of keys.slice(0, keys.length - 5)) delete all[k];
  }
  localStorage.setItem('sw:forecastVer', FORECAST_VER);
  localStorage.setItem('sw:forecasts', JSON.stringify(all));
}

function loadCachedForecast(key) {
  if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) return null;
  try {
    const entry = JSON.parse(localStorage.getItem('sw:forecasts') || '{}')[key];
    return entry && entry.hours ? entry : null;
  } catch { return null; }
}
```

- [ ] **Step 4: Rewrite `refreshAll`** — replace lines 27-63 with:

```js
export async function refreshAll(loc) {
  const status = document.getElementById('status');
  if (!loc) { status.textContent = 'Search a city to begin.'; return; }
  status.textContent = '';
  const seq = ++refreshSeq;
  const key = loc.lat + ',' + loc.lon;
  const cached = loadCachedForecast(key);
  let hours = cached ? cached.hours : null;
  let cityDays = null;
  if (!hours) showSkeleton();
  try {
    let offline = false;
    let cityPainted = false;
    let gridPainted = false;
    const paint = (hrs) => {
      if (seq !== refreshSeq) return;
      if (cityPainted && hrs.length < 12) return;
      gridPainted = true;
      renderForecast(hrs, loc, { hourlyOnly: true });
    };
    const grid = (!cached || Date.now() - cached.ts > REFRESH_MS)
      ? fetchForecast(loc, paint).then(h => ({ hours: h }), e => ({ err: e }))
      : Promise.resolve({ hours });
    if (!hours) {
      try {
        const cp = await fetchCitypage(loc);
        if (seq !== refreshSeq) return;
        if (!gridPainted) {
          cityPainted = true;
          hours = cp.hours;
          cityDays = cp.days;
          renderForecast(hours, loc, { days: cityDays });
        }
      } catch { /* no city page for this location */ }
    }
    const res = await grid;
    if (seq !== refreshSeq) return;
    if (res.err) {
      if (!hours) throw res.err;
      offline = true;
    } else {
      hours = res.hours;
      cityDays = null;
    }
    renderForecast(hours, loc, cityDays ? { days: cityDays } : {});
    document.getElementById('lastUpdate').textContent = `Updated ${clockTime(new Date().toISOString(), loc.tz)} local${offline ? ' (offline)' : ''}`;
    await refreshRadar(loc);
  } catch (err) {
    if (seq !== refreshSeq) return;
    status.textContent = 'Update failed: ' + err.message;
    if (!hours) {
      document.getElementById('tab-hourly').innerHTML = '';
      document.getElementById('tab-week').innerHTML = '';
    }
    console.error(err);
  }
}
```

Notes for the reviewer: the old `const radar = refreshRadar(loc)` at the top and `await radar` before the `Updated` line are gone — radar now runs once, after `Updated`. The old `empty` flag is replaced by `!hours` in the catch so a citypage-painted view survives a grid failure. The grid promise gets its handlers immediately (`.then(..., e => ({err: e}))`) so a rejection during the citypage wait can't surface as an unhandled rejection. `forecastIsStale` and the `sw:forecast*` single-slot keys are no longer referenced (old keys may linger in localStorage; harmless).

- [ ] **Step 5: Run the suite**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 6: No commit.**

---

### Task 4: Bookkeeping + browser verification

**Files:**
- Modify: `README.md` (data sources table, lines 36-41), `sw.js` (line 1)

**Interfaces:** none (docs/cache version only).

- [ ] **Step 1: README data-source row** — add to the table after the Forecast row:

```markdown
| Instant first paint (city locations) | MSC GeoMet-OGC-API `citypageweather-realtime` (`api.weather.gc.ca`) |
```

- [ ] **Step 2: Bump the service-worker cache** — `sw.js` line 1 → `const CACHE = 'stupid-weather-v14';`

- [ ] **Step 3: Run the suite**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 4: Browser verification** — run `python3 -m http.server 8000`, open `http://localhost:8000/`, and check each item (report results; these paths are not unit-testable):

1. **City fast path:** clear site data, search a city (e.g. Toronto) → both tabs fill within ~1s with citypage data (hourly POP/temps/conditions; week hi/lo cards), then the grid data streams in and the final render settles; `Updated … local` appears; no console errors.
2. **Progressive grid:** hourly rows stream in top-to-bottom (not a frozen citypage forever — the final render must show grid-derived week cards with `Precip (mm)` numbers).
3. **Radar:** switch to Radar → map and frames load after the forecast, `.loading` overlay clears; radar works when opened mid-refresh.
4. **Cache switch:** pick a second location, then switch back to the first → renders immediately from cache (no skeletons, near-instant `Updated`).
5. **Rural fallback:** search a spot with no city page (e.g. a remote park) → skeleton → grid result, no `Update failed`.
6. **Offline:** DevTools offline, reload → shell loads, last forecast renders with `(offline)`.
7. `node selfcheck.js` still prints exactly `selfcheck OK` (no stray warnings).
