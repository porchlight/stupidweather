# Stupid Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal PWA "Stupid Weather" showing hourly/today/7-day views of POP% and precipitation, plus an animated Leaflet radar, from Environment Canada GeoMet, with 12-minute auto-refresh.

**Architecture:** Static files, no build. `logic.js` holds pure, testable helpers; `app.js` holds fetch + render + UI. Data comes from GeoMet WMS `GetFeatureInfo` (GDPS model layers) for POP and precip, Nominatim for geocoding, timeapi.io for the location timezone, and GeoMet WMS radar frames over a Leaflet/OSM map. App shell cached by a service worker; data cached in `localStorage` for 12 minutes.

**Tech Stack:** Vanilla HTML5/CSS3/ES modules (browser, no bundler). Node only to run the self-check. Leaflet from CDN (radar map only).

## Global Constraints
- Static files only; no backend, no build step.
- Manual location by city/province only (Nominatim).
- All times shown in the selected location's IANA timezone (via `Intl.DateTimeFormat`), never the browser's.
- POP% and precip shown in all three forecast views; POP = period max, precip = period sum.
- Auto-refresh every 12 minutes (12 * 60 * 1000 ms).
- Radar = animated loop with play/pause, speed, and frame-seek controls.
- Times from GeoMet are UTC; request times are UTC ISO strings ending in `Z`.
- Verified endpoints (do not substitute without checking): WMS base `https://geo.weather.gc.ca/geomet`; POP layer `GDPS-WEonG_15km_Precip-Prob` (%); precip layer `GDPS_15km_Precip-Accum1h` (mm); radar layer `RADAR_1KM_RRAI`; OGC API base `https://api.weather.gc.ca`; geocoding `https://nominatim.openstreetmap.org/search`; timezone `https://timeapi.io/api/TimeZone/coordinate`.
- GeoMet `GetFeatureInfo` supports ONE layer per request; EPSG:4326 BBOX is `minLat,minLon,maxLat,maxLon` (WMS 1.3.0).
- Leaflet is the only external library.

---

### Task 1: Scaffold the PWA shell

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`
- Create: `logic.js`
- Create: `sw.js`
- Create: `manifest.webmanifest`
- Create: `package.json`

**Interfaces:**
- Consumes: none
- Produces: the DOM ids used by every later task — `#locationForm`, `#locationInput`, `#locationName`, `#lastUpdate`, nav buttons `data-tab` ∈ {hourly,today,week,radar}, `#tab-hourly`, `#tab-today`, `#tab-week`, `#tab-radar`, `#radarControls`, `#playBtn`, `#pauseBtn`, `#speedInput`, `#frameSlider`, `#radarTime`, `#radarMap`. Plus `switchTab(name)` and Leaflet loaded globally as `L`.

- [ ] **Step 1: Create `package.json`** (lets Node run the ES-module self-check in Task 2)

```json
{ "name": "stupid-weather", "private": true, "type": "module" }
```

- [ ] **Step 2: Create `index.html`** (Leaflet CSS/JS from CDN; tabs; radar controls)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stupid Weather</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Stupid Weather</h1>
    <form id="locationForm">
      <input id="locationInput" placeholder="City, Province (e.g. Toronto, Ontario)" required>
      <button type="submit">Search</button>
    </form>
    <div id="locationName"></div>
    <div id="lastUpdate"></div>
    <div id="status" role="status"></div>
  </header>
  <nav>
    <button data-tab="hourly">Hourly</button>
    <button data-tab="today">Today</button>
    <button data-tab="week">7-Day</button>
    <button data-tab="radar">Radar</button>
  </nav>
  <main>
    <section id="tab-hourly" class="tab"></section>
    <section id="tab-today" class="tab" hidden></section>
    <section id="tab-week" class="tab" hidden></section>
    <section id="tab-radar" class="tab" hidden>
      <div id="radarControls">
        <button id="playBtn">Play</button>
        <button id="pauseBtn">Pause</button>
        <label>Speed <input id="speedInput" type="range" min="200" max="1200" step="100" value="500"></label>
        <input id="frameSlider" type="range" min="0" max="0" value="0">
        <span id="radarTime"></span>
      </div>
      <div id="radarMap"></div>
    </section>
  </main>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `styles.css`** (mobile-first, minimal)

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
header, nav, main { padding: .75rem; }
nav { display: flex; gap: .5rem; flex-wrap: wrap; }
nav button.active { font-weight: 700; text-decoration: underline; }
.tab[hidden] { display: none; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .4rem .5rem; border: 1px solid #ddd; text-align: right; }
th:first-child, td:first-child { text-align: left; }
#radarMap { width: 100%; height: 65vh; background: #e8e8e8; }
#radarControls { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-bottom: .5rem; }
#status { color: #a00; font-size: .9rem; }
```

- [ ] **Step 4: Create empty-ish `logic.js` and `app.js` with tab switching**

`logic.js`:

```js
export const REFRESH_MS = 12 * 60 * 1000;
```

`app.js`:

```js
import { REFRESH_MS } from './logic.js';

export function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => { el.hidden = true; });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  const section = document.getElementById('tab-' + name);
  if (section) section.hidden = false;
  if (name === 'radar') window.dispatchEvent(new Event('radar-shown'));
}

function init() {
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  switchTab('hourly');
}
init();
```

- [ ] **Step 5: Create `manifest.webmanifest`**

```json
{
  "name": "Stupid Weather",
  "short_name": "StupidWx",
  "start_url": "./",
  "display": "standalone",
  "theme_color": "#222222",
  "background_color": "#ffffff",
  "icons": []
}
```

- [ ] **Step 6: Create `sw.js`** (app-shell cache; network-first for GeoMet is unnecessary since data is in localStorage)

```js
const CACHE = 'stupid-weather-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './logic.js', './manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

- [ ] **Step 7: Register the service worker** — append to `app.js` after `init()`:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
```

- [ ] **Step 8: Verify** — serve and open (Leaflet must load, tabs switch).

Run: `python3 -m http.server 8080`
Expected: page loads at http://localhost:8080, clicking tabs toggles `hidden`, no console errors.

- [ ] **Step 9: Commit**

```bash
git add index.html styles.css app.js logic.js sw.js manifest.webmanifest package.json
git commit -m "feat: scaffold PWA shell with tabs and radar container"
```

---

### Task 2: Pure helpers + self-check (TDD)

**Files:**
- Modify: `logic.js`
- Create: `selfcheck.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (exported from `logic.js`, used by all later tasks):
  - `tzParts(iso, tz) -> { year, month, day, hour, minute }` (strings, `hour` in 00–23)
  - `dateKey(iso, tz) -> "YYYY-MM-DD"`
  - `weekdayName(iso, tz) -> "Monday"`
  - `forecastTimes(now: Date) -> string[]` (UTC ISO, hourly for 48 h then 3-hourly to 7 days)
  - `aggregateToday(hours, tz) -> { morning, afternoon, night }` each `{ pop, precip }` (missing → 0)
  - `aggregateWeek(hours, tz) -> [{ date, pop, precip }]` sorted by date
  - `pool(items, limit, fn) -> Promise<any[]>`
  - `REFRESH_MS`

- [ ] **Step 1: Write the failing self-check**

`selfcheck.js`:

```js
import assert from 'node:assert/strict';
import { tzParts, dateKey, forecastTimes, aggregateToday, aggregateWeek, pool } from './logic.js';

// tzParts converts UTC to the location tz (Toronto in Oct = UTC-4)
assert.deepEqual(tzParts('2026-10-15T02:00:00Z', 'America/Toronto'),
  { year: '2026', month: '10', day: '14', hour: '22', minute: '00' });
assert.equal(dateKey('2026-10-15T02:00:00Z', 'America/Toronto'), '2026-10-14');

// forecastTimes: 49 hourly points then 3-hourly, all on :00
const times = forecastTimes(new Date('2026-10-14T17:30:00Z'));
assert.equal(times[0], '2026-10-14T17:00:00.000Z');
assert.equal(times[48], '2026-10-16T17:00:00.000Z');
assert.ok(times.every(t => t.endsWith(':00:00.000Z')));

// aggregateToday: windows by local hour (Toronto)
const hours = [
  { time: '2026-10-14T14:00:00Z', pop: 20, precip: 1 }, // 10:00 local -> morning
  { time: '2026-10-14T18:00:00Z', pop: 60, precip: 2 }, // 14:00 local -> afternoon
  { time: '2026-10-15T01:00:00Z', pop: 5,  precip: 0 }, // 21:00 local -> night
];
const per = aggregateToday(hours, 'America/Toronto');
assert.deepEqual(per.morning, { pop: 20, precip: 1 });
assert.deepEqual(per.afternoon, { pop: 60, precip: 2 });
assert.deepEqual(per.night, { pop: 5, precip: 0 });

// aggregateWeek: group by local date, pop=max, precip=sum
const week = aggregateWeek(hours, 'America/Toronto');
assert.deepEqual(week[0], { date: '2026-10-14', pop: 60, precip: 3 });
assert.deepEqual(week[1], { date: '2026-10-15', pop: 5, precip: 0 });

// pool preserves order
const out = await pool([1, 2, 3, 4], 2, async n => n * 10);
assert.deepEqual(out, [10, 20, 30, 40]);

console.log('selfcheck OK');
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node selfcheck.js`
Expected: FAIL — `SyntaxError`/`TypeError` because exports don't exist yet.

- [ ] **Step 3: Implement the helpers in `logic.js`** (replace the file)

```js
export const REFRESH_MS = 12 * 60 * 1000;

export function tzParts(iso, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const out = {};
  for (const { type, value } of fmt.formatToParts(new Date(iso))) out[type] = value;
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

export function dateKey(iso, tz) {
  const p = tzParts(iso, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function weekdayName(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, weekday: 'long' }).format(new Date(iso));
}

export function forecastTimes(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const out = [];
  const hourlyHours = 48;
  for (let i = 0; i <= hourlyHours; i++) out.push(new Date(start.getTime() + i * 3600e3).toISOString());
  const end = start.getTime() + 7 * 24 * 3600e3;
  let t = start.getTime() + (hourlyHours + 3) * 3600e3;
  while (t < end) { out.push(new Date(t).toISOString()); t += 3 * 3600e3; }
  return out;
}

function hourOf(iso, tz) { return Number(tzParts(iso, tz).hour); }

export function aggregateToday(hours, tz) {
  const buckets = { morning: [], afternoon: [], night: [] };
  for (const h of hours) {
    const hr = hourOf(h.time, tz);
    if (hr >= 6 && hr < 12) buckets.morning.push(h);
    else if (hr >= 12 && hr < 18) buckets.afternoon.push(h);
    else buckets.night.push(h);
  }
  const agg = list => ({
    pop: list.length ? Math.max(...list.map(h => h.pop ?? 0)) : 0,
    precip: list.reduce((s, h) => s + (h.precip ?? 0), 0)
  });
  return { morning: agg(buckets.morning), afternoon: agg(buckets.afternoon), night: agg(buckets.night) };
}

export function aggregateWeek(hours, tz) {
  const map = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!map.has(key)) map.set(key, { date: key, pop: 0, precip: 0 });
    const day = map.get(key);
    day.pop = Math.max(day.pop, h.pop ?? 0);
    day.precip += h.precip ?? 0;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
```

- [ ] **Step 4: Run the self-check until it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 5: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: add pure time/aggregation helpers with self-check"
```

---

### Task 3: Location search (geocoding) + timezone

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: DOM ids from Task 1.
- Produces: `async function geocode(query) -> { name, lat, lon, tz }`; module-level `let currentLocation = null`; persists to `localStorage` key `sw:location`; calls `onLocationChange(loc)` (provided by Task 6; a no-op stub until then).

- [ ] **Step 1: Add geocoding + timezone + persistence to `app.js`** (append; keep existing code)

```js
async function geocode(query) {
  const search = new URLSearchParams({ format: 'json', limit: '1', q: query });
  const sres = await fetch('https://nominatim.openstreetmap.org/search?' + search, {
    headers: { 'Accept': 'application/json' }
  });
  if (!sres.ok) throw new Error('Geocoding failed');
  const sjson = await sres.json();
  if (!sjson.length) throw new Error('Location not found');
  const { lat, lon, display_name } = sjson[0];
  const tres = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`);
  const tjson = await tres.json();
  return { name: display_name, lat: Number(lat), lon: Number(lon), tz: tjson.timeZone };
}

let currentLocation = null;
let onLocationChange = () => {};

async function setLocation(query) {
  const status = document.getElementById('status');
  status.textContent = 'Searching…';
  try {
    currentLocation = await geocode(query);
    localStorage.setItem('sw:location', JSON.stringify(currentLocation));
    document.getElementById('locationName').textContent = currentLocation.name;
    status.textContent = '';
    await onLocationChange(currentLocation);
  } catch (err) {
    status.textContent = err.message;
    console.error(err);
  }
}

function restoreLocation() {
  const saved = localStorage.getItem('sw:location');
  if (!saved) return null;
  try {
    currentLocation = JSON.parse(saved);
    document.getElementById('locationName').textContent = currentLocation.name;
    return currentLocation;
  } catch { return null; }
}
```

- [ ] **Step 2: Wire the form and restore-on-start** — add to `init()` in `app.js`:

```js
  document.getElementById('locationForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('locationInput').value.trim();
    if (q) setLocation(q);
  });
  const restored = restoreLocation();
  if (restored) onLocationChange(restored);
```

- [ ] **Step 3: Verify** — with the server running, search "Toronto, Ontario".

Expected: `#locationName` shows the full display name; a network panel shows the Nominatim and timeapi.io calls, both 200; `localStorage['sw:location']` holds `{name,lat,lon,tz:"America/Toronto"}`.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add city/province geocoding and timezone lookup"
```

---

### Task 4: Forecast data layer (POP + precip via GeoMet WMS)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `forecastTimes`, `pool` from `logic.js`; `currentLocation` from Task 3.
- Produces: `async function fetchForecast(loc) -> [{ time, pop, precip }]`; cache keys `sw:forecast` and `sw:forecastTs`; `function forecastIsStale() -> boolean`.

- [ ] **Step 1: Add the WMS point query + fetch/cache to `app.js`**

```js
import { REFRESH_MS, forecastTimes, pool } from './logic.js';

const WMS = 'https://geo.weather.gc.ca/geomet';
const LAYER_POP = 'GDPS-WEonG_15km_Precip-Prob';
const LAYER_PCP = 'GDPS_15km_Precip-Accum1h';

async function pointValue(layer, lat, lon, time) {
  const d = 0.2;
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
    LAYERS: layer, QUERY_LAYERS: layer, CRS: 'EPSG:4326',
    BBOX: `${lat - d},${lon - d},${lat + d},${lon + d}`,
    WIDTH: '101', HEIGHT: '101', I: '50', J: '50',
    INFO_FORMAT: 'application/json', TIME: time, STYLES: ''
  });
  const res = await fetch(`${WMS}?${p}`);
  if (!res.ok) throw new Error('WMS ' + res.status);
  const json = await res.json();
  const f = json.features && json.features[0];
  return f && typeof f.properties.value === 'number' ? f.properties.value : null;
}

export async function fetchForecast(loc) {
  const times = forecastTimes(new Date());
  const hours = await pool(times, 6, async (time) => {
    const [pop, precip] = await Promise.all([
      pointValue(LAYER_POP, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_PCP, loc.lat, loc.lon, time).catch(() => null)
    ]);
    return { time, pop: pop ?? 0, precip: precip ?? 0 };
  });
  localStorage.setItem('sw:forecast', JSON.stringify(hours));
  localStorage.setItem('sw:forecastTs', String(Date.now()));
  return hours;
}

export function forecastIsStale() {
  const ts = Number(localStorage.getItem('sw:forecastTs') || 0);
  return Date.now() - ts > REFRESH_MS;
}

function loadCachedForecast() {
  try { return JSON.parse(localStorage.getItem('sw:forecast') || 'null'); }
  catch { return null; }
}
```

- [ ] **Step 2: Verify** — after setting a location, in the console:

```js
const { fetchForecast } = await import('./app.js');
await fetchForecast(JSON.parse(localStorage['sw:location']));
```

Expected: resolves to ~90 `{time, pop, precip}` entries; pop in 0–100, precip small non-negative numbers; `localStorage['sw:forecast']` populated. Times are UTC ISO.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: fetch hourly POP and precip from GeoMet WMS with caching"
```

---

### Task 5: Forecast views (Hourly, Today, 7-Day)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `aggregateToday`, `aggregateWeek`, `tzParts`, `weekdayName` from `logic.js`; the fetched `hours`.
- Produces: `renderForecast(hours, loc)` that fills `#tab-hourly`, `#tab-today`, `#tab-week`.

- [ ] **Step 1: Add renderers to `app.js`**

```js
import { aggregateToday, aggregateWeek, tzParts, weekdayName } from './logic.js';

function hourlyTable(hours, tz) {
  const rows = hours.slice(0, 48).map(h => {
    const p = tzParts(h.time, tz);
    return `<tr><td>${p.day}/${p.month} ${p.hour}:00</td><td>${Math.round(h.pop)}%</td><td>${h.precip.toFixed(1)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Time</th><th>POP</th><th>Precip (mm)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function todayTable(hours, tz) {
  const per = aggregateToday(hours, tz);
  const row = (label, v) => `<tr><td>${label}</td><td>${Math.round(v.pop)}%</td><td>${v.precip.toFixed(1)}</td></tr>`;
  return `<table><thead><tr><th>Period</th><th>POP</th><th>Precip (mm)</th></tr></thead><tbody>`
    + row('Morning (6–12)', per.morning)
    + row('Afternoon (12–18)', per.afternoon)
    + row('Night (18–6)', per.night)
    + `</tbody></table>`;
}

function weekTable(hours, tz) {
  const days = aggregateWeek(hours, tz);
  const rows = days.map(d => {
    const iso = d.date + 'T12:00:00Z';
    return `<tr><td>${d.date} ${weekdayName(iso, tz)}</td><td>${Math.round(d.pop)}%</td><td>${d.precip.toFixed(1)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Day</th><th>POP</th><th>Precip (mm)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderForecast(hours, loc) {
  document.getElementById('tab-hourly').innerHTML = hourlyTable(hours, loc.tz);
  document.getElementById('tab-today').innerHTML = todayTable(hours, loc.tz) + '<p>POP = period max, precip = period total.</p>';
  document.getElementById('tab-week').innerHTML = weekTable(hours, loc.tz) + '<p>POP = daily max, precip = daily total.</p>';
}
```

- [ ] **Step 2: Verify** — set a location, then in the console:

```js
const app = await import('./app.js');
app.renderForecast(JSON.parse(localStorage['sw:forecast']), JSON.parse(localStorage['sw:location']));
```

Expected: Hourly tab lists 48 rows with local times; Today tab shows three periods; 7-Day shows ~7 dated rows. All local times match the location tz (spot-check one against a UTC value).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: render hourly, today, and 7-day forecast views"
```

---

### Task 6: Radar view (Leaflet + GeoMet frames + controls)

**Files:**
- Modify: `app.js`
- Modify: `logic.js` (add `radarTimes`)
- Modify: `selfcheck.js` (cover `radarTimes`)

**Interfaces:**
- Consumes: `pool` from `logic.js`; Leaflet global `L`; `#radarMap`, `#radarControls` DOM.
- Produces: `initRadar()` (builds the map once), `refreshRadar(loc)` (rebuilds frames), and playback controls wiring.

- [ ] **Step 1: Add `radarTimes` to `logic.js`**

```js
export function radarTimes(now = new Date(), count = 30) {
  const step = 6 * 60 * 1000;
  const end = Math.floor(now.getTime() / step) * step;
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(new Date(end - i * step).toISOString());
  return out;
}
```

- [ ] **Step 2: Extend `selfcheck.js`** — add before the final `console.log`:

```js
import { radarTimes } from './logic.js';
const rt = radarTimes(new Date('2026-10-14T17:59:00Z'), 3);
assert.deepEqual(rt, ['2026-10-14T17:48:00.000Z', '2026-10-14T17:54:00.000Z', '2026-10-14T18:00:00.000Z']);
```
(Add `radarTimes` to the existing import line instead of a new import if you prefer.)

- [ ] **Step 3: Run the self-check**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 4: Add radar code to `app.js`**

```js
import { radarTimes } from './logic.js';

const RADAR_LAYER = 'RADAR_1KM_RRAI';
let radarMap = null;
let radarOverlay = null;
let radarFrames = [];
let radarIndex = 0;
let radarTimer = null;

function radarFrameUrl(time, bounds) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
    LAYERS: RADAR_LAYER, CRS: 'EPSG:4326',
    BBOX: `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`,
    WIDTH: '1024', HEIGHT: '1024', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    TIME: time, STYLES: ''
  });
  return `${WMS}?${p}`;
}

export function initRadar(loc) {
  if (radarMap) return;
  radarMap = L.map('radarMap').setView([loc.lat, loc.lon], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap'
  }).addTo(radarMap);
  radarOverlay = L.imageOverlay('', radarMap.getBounds(), { opacity: 0.8, interactive: false }).addTo(radarMap);
  L.circleMarker([loc.lat, loc.lon], { radius: 5 }).addTo(radarMap);
  document.getElementById('playBtn').addEventListener('click', playRadar);
  document.getElementById('pauseBtn').addEventListener('click', pauseRadar);
  document.getElementById('speedInput').addEventListener('input', () => { if (radarTimer) { pauseRadar(); playRadar(); } });
  document.getElementById('frameSlider').addEventListener('input', e => { pauseRadar(); showFrame(Number(e.target.value)); });
}

export async function refreshRadar(loc) {
  initRadar(loc);
  radarMap.setView([loc.lat, loc.lon]);
  const bounds = radarMap.getBounds();
  const times = radarTimes(new Date());
  radarFrames = await pool(times, 6, async (time) => {
    const url = radarFrameUrl(time, bounds);
    return { time, url };
  });
  // Preload so playback doesn't flicker
  await Promise.all(radarFrames.map(f => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = f.url; })));
  const slider = document.getElementById('frameSlider');
  slider.max = String(radarFrames.length - 1);
  slider.value = '0';
  showFrame(radarFrames.length - 1);
  playRadar();
}

function showFrame(i) {
  radarIndex = Math.max(0, Math.min(i, radarFrames.length - 1));
  const f = radarFrames[radarIndex];
  if (!f) return;
  radarOverlay.setBounds(radarMap.getBounds());
  radarOverlay.setUrl(f.url);
  document.getElementById('frameSlider').value = String(radarIndex);
  const p = tzParts(f.time, currentLocation?.tz || 'UTC');
  document.getElementById('radarTime').textContent = `${p.hour}:${p.minute}`;
}

function playRadar() {
  if (radarTimer || radarFrames.length < 2) return;
  const speed = Number(document.getElementById('speedInput').value);
  radarTimer = setInterval(() => {
    if (radarIndex >= radarFrames.length - 1) radarIndex = -1;
    showFrame(radarIndex + 1);
  }, speed);
}

function pauseRadar() {
  clearInterval(radarTimer);
  radarTimer = null;
}
```

- [ ] **Step 5: Verify** — set a location, open the Radar tab.

Expected: OSM map centered on the location with a marker; radar overlay animates through ~30 frames; Play/Pause/Speed/seek work; timestamp updates. Frames outside the radar's valid window may 404 — acceptable (the loop skips them visually as blank frames).

- [ ] **Step 6: Commit**

```bash
git add app.js logic.js selfcheck.js
git commit -m "feat: Leaflet radar view with animated GeoMet frames and controls"
```

---

### Task 7: Refresh orchestration + status

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `onLocationChange(loc)` (real implementation), `refreshAll()`, a 12-minute interval, and the `#lastUpdate` timestamp.

- [ ] **Step 1: Implement `onLocationChange` + `refreshAll` + interval in `app.js`** (replace the `onLocationChange` stub)

```js
let refreshTimer = null;

onLocationChange = async (loc) => {
  await refreshAll(loc);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refreshAll(loc), REFRESH_MS);
};

export async function refreshAll(loc) {
  const status = document.getElementById('status');
  status.textContent = '';
  try {
    let hours = loadCachedForecast();
    if (!hours || forecastIsStale()) hours = await fetchForecast(loc);
    renderForecast(hours, loc);
    await refreshRadar(loc);
    const p = tzParts(new Date().toISOString(), loc.tz);
    document.getElementById('lastUpdate').textContent = `Updated ${p.hour}:${p.minute} local`;
  } catch (err) {
    status.textContent = 'Update failed: ' + err.message;
    console.error(err);
  }
}
```

- [ ] **Step 2: Handle the radar-tab-resize edge** — append to `app.js`:

```js
window.addEventListener('radar-shown', () => { if (radarMap) setTimeout(() => radarMap.invalidateSize(), 0); });
window.addEventListener('resize', () => { if (radarMap) radarMap.invalidateSize(); });
```

- [ ] **Step 3: Verify** — full flow: load page, search a city, switch tabs.

Expected: Hourly/Today/7-Day populate; Radar animates; "Updated HH:MM local" appears. Reload → restores last location and shows cached data immediately (fresh fetch within 12 min is skipped). Check that `sw:forecastTs` is recent.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: orchestrate 12-minute auto-refresh, status, and radar lifecycle"
```

---

### Task 8: Polish, empty states, and PWA verification

**Files:**
- Modify: `app.js`, `styles.css`, `sw.js` if needed.

**Interfaces:**
- Consumes: all.
- Produces: final app; no new exported names.

- [ ] **Step 1: Empty state** — at the top of `refreshAll`, guard:

```js
  if (!loc) { document.getElementById('status').textContent = 'Search a city to begin.'; return; }
```

- [ ] **Step 2: Offline behaviour** — ensure `loadCachedForecast()` renders even when fetches fail: in `refreshAll`, if `fetchForecast` throws and a cache exists, use the cache and note staleness in `#lastUpdate` (append " (offline)").

```js
    let hours = loadCachedForecast();
    try {
      if (!hours || forecastIsStale()) hours = await fetchForecast(loc);
    } catch (e) {
      if (!hours) throw e;
      document.getElementById('lastUpdate').textContent += ' (offline)';
    }
    renderForecast(hours, loc);
```

- [ ] **Step 3: Bump the SW cache** if any shell asset changed:

```js
const CACHE = 'stupid-weather-v2';
```

- [ ] **Step 4: Manual verification checklist** (record results)
- Search city/province → location name and data appear.
- Hourly shows 48 rows of time/POP/precip, times in the location's local tz.
- Today shows morning/afternoon/night; 7-Day shows per-day rows.
- Radar tab: map + marker, animated loop, play/pause/speed/seek all work.
- DevTools → Application: manifest parsed, service worker active, `sw:forecast` cached.
- Go offline, reload: shell loads and cached forecast renders (radar blank).

- [ ] **Step 5: Run the self-check one last time**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: empty states, offline fallback, and PWA polish"
```

---

## Self-Review Notes
- Spec coverage: Hourly/Today/7-Day all show POP + precip (Tasks 5); local tz everywhere (Task 2 helpers + `Intl`); 12-min refresh (Task 7); radar animated loop with controls (Task 6); manual city/province search (Task 3); static PWA with SW + manifest (Tasks 1, 8).
- Endpoints are the verified ones (Task 4/6 constants); POP from `GDPS-WEonG_15km_Precip-Prob`, precip from `GDPS_15km_Precip-Accum1h`, radar `RADAR_1KM_RRAI`.
- Interfaces chain: Task 2 exports are imported by Tasks 4–6 with matching names (`forecastTimes`, `aggregateToday`, `aggregateWeek`, `tzParts`, `weekdayName`, `pool`, `radarTimes`, `REFRESH_MS`).
- Request-count tradeoff documented in the spec; `pool(…, 6)` caps concurrency.
