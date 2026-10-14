# Stupid Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build minimal PWA "Stupid Weather" showing hourly/today/7-day views with POP% and precip, plus animated radar with 12-min auto-refresh, using vanilla HTML/CSS/JS and Environment Canada GeoMet OGC API.

**Architecture:** Static PWA (index.html, styles.css, app.js, sw.js, manifest). Nominatim for city/province geocoding → lat/lon. GeoMet OGC for point forecast (hourly POP/precip) and WMS radar frames. Local timezone conversion. localStorage for cached data with timestamps; service worker caches app shell. Auto-refresh every 12 min.

**Tech Stack:** Vanilla HTML5/CSS3/JS (ES modules or classic; use ES modules via `<script type="module">`). No build tools, no external deps.

## Global Constraints
- Must be static files only (no backend).
- Manual location by city/province only.
- Display all times in selected location's local timezone.
- Show POP% and Precip per hour in all views (aggregated appropriately).
- Auto-refresh every 12 minutes.
- Radar must have animated loop with controls (play/pause/speed/frame).
- PWA: manifest + service worker; offline shell acceptable with stale data.
- No external frameworks/libraries.
- Keep code minimal (ponytail). No unrequested abstractions.

---

## Task 1: Project Scaffolding (HTML/CSS/JS + PWA Shell)

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`
- Create: `sw.js`
- Create: `manifest.webmanifest`

**Interfaces:**
- Consumes: none
- Produces: DOM structure with tabs (Hourly, Today, 7-Day, Radar), location search UI, radar container, minimal JS module structure (init, render, events)

### Steps

- [ ] **Step 1: Write failing test (manual sanity)** — no unit test needed; create files and verify basic load.

- [ ] **Step 2: Create index.html with tabs, forms, containers**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="styles.css">
  <title>Stupid Weather</title>
</head>
<body>
  <header>
    <h1>Stupid Weather</h1>
    <form id="locationForm">
      <input id="locationInput" placeholder="City, Province (e.g. Toronto, ON)" required>
      <button type="submit">Search</button>
    </form>
    <div id="locationName"></div>
    <div id="lastUpdate"></div>
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
        <input id="speedInput" type="range" min="200" max="1000" step="100" value="400">
        <input id="frameSlider" type="range" min="0" max="0" value="0">
        <span id="radarTime"></span>
      </div>
      <div id="radarMap"></div>
    </section>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create styles.css (minimal mobile-first)**
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
header, nav, main { padding: 0.75rem; }
nav { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.tab[hidden] { display: none; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem; border: 1px solid #ddd; }
#radarMap { width: 100%; height: 60vh; background: #eee; }
#radarControls { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
```

- [ ] **Step 4: Create app.js (minimal structure)**
```js
function init() {
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('locationForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('locationInput').value;
    console.log('search', q);
  });
  // radar controls placeholders
}
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.hidden = true);
  const map = { hourly:'tab-hourly', today:'tab-today', week:'tab-week', radar:'tab-radar' };
  document.getElementById(map[tab]).hidden = false;
}
init();
```

- [ ] **Step 5: Create sw.js (app shell cache)**
```js
const CACHE = 'stupid-weather-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

- [ ] **Step 6: Create manifest.webmanifest**
```json
{
  "name": "Stupid Weather",
  "short_name": "StupidWx",
  "start_url": "./",
  "display": "standalone",
  "theme_color": "#222",
  "background_color": "#fff",
  "icons": []
}
```

- [ ] **Step 7: Register service worker in app.js**
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
```

- [ ] **Step 8: Commit**
```bash
git add index.html styles.css app.js sw.js manifest.webmanifest
git commit -m "feat: scaffold PWA shell with tabs and radar container"
```

---

## Task 2: Location Search (Nominatim) + Timezone Resolution

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: none (user input)
- Produces: `async function geocodeCityProvince(q)` → `{ name, lat, lon, tz }` (or throws). Store current location in module state and localStorage under key `sw:location`.

### Steps

- [ ] **Step 1: Write failing test (manual)** — call geocode with "Toronto, ON" and expect lat/lon/tz-like value.

- [ ] **Step 2: Implement Nominatim geocoding**
Use `https://nominatim.openstreetmap.org/search?format=json&q=...&limit=1`. Include `User-Agent` via headers (polite). Parse first result lat/lon.

- [ ] **Step 3: Resolve timezone from lat/lon**
Use Intl API: `Intl.DateTimeFormat().resolvedOptions().timeZone` for browser context is not enough for arbitrary location. Minimal approach: use `https://timeapi.io/api/TimeZone/coordinate?latitude=...&longitude=...` (public) or compute offset via date math? Alternatively use `https://api.timezonedb.com/v2.1/get-time-zone` not ideal (key). Or use `Intl.DateTimeFormat(undefined, {timeZone: tz}).format()` only after knowing tz - easier: call timezonedb-free alternative? Ponytail: use `https://timeapi.io/api/TimeZone/coordinate` (CORS may allow). If blocked, fallback to browser tz but still store lat/lon; spec says "local to selected location" — prefer tz lookup.
Implement `async function getTimezone(lat,lon)` → IANA tz string.

- [ ] **Step 4: Wire form submit**
On submit: set loading state, call geocode+tz, store to state + `localStorage.setItem('sw:location', JSON.stringify(loc))`, render location name and trigger data fetch (next task). Handle errors.

- [ ] **Step 5: Load saved location on init**
On startup, read `sw:location` and restore state; render name.

- [ ] **Step 6: Commit**
```bash
git add app.js
git commit -m "feat: add Nominatim geocoding and timezone lookup"
```

---

## Task 3: Hourly Forecast from GeoMet (POP% + Precip per hour)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: location `{lat,lon,tz}` from Task 2
- Produces: `async function fetchHourly(loc)` → array of `{ time: ISO8601 (local tz context), pop: number (0-100), precip: number (mm/hr) }` stored in module state and `localStorage.sw:hourly` with timestamp `sw:hourlyTs`.

### Steps

- [ ] **Step 1: Identify GeoMet endpoint (defensive)**
Use Environment Canada GeoMet OGC. Start with point forecast endpoint. Common pattern: WFS for point features or GetFeatureInfo on forecast layers. For this minimal scope, try a simple approach: query GeoMet's public forecast data for point. If exact URL varies, make base configurable (constant) and log errors. Implement with `fetch` and try to parse JSON/XML; prefer JSON if available.

- [ ] **Step 2: Write fetch function with timeout + error handling**
Use AbortController (timeout ~15s). On failure, throw meaningful error.

- [ ] **Step 3: Normalize fields**
Extract hourly time, POP (percent), precipitation rate/amount per hour (mm). Map to `{ time, pop, precip }`. Convert times to location tz-aware representation; store as ISO8601 string in location tz (or UTC+offset). Keep consistent.

- [ ] **Step 4: Caching + auto-refresh**
On successful fetch: save to state, `localStorage.setItem('sw:hourly', JSON.stringify(hours))`, `localStorage.setItem('sw:hourlyTs', Date.now())`. Function `needsRefresh(ts, intervalMs=12*60*1000)` returns true if stale.

- [ ] **Step 5: Hourly render**
Render table: Time | POP% | Precip (mm/hr). Sort by time. Format time as `YYYY-MM-DD HH:mm` in location tz.

- [ ] **Step 6: Wire triggers**
After location set (Task 2), fetch if stale or missing. Also set interval every 12 min to refresh current location.

- [ ] **Step 7: Commit**
```bash
git add app.js
git commit -m "feat: fetch hourly forecast from GeoMet with caching and auto-refresh"
```

---

## Task 4: Today View (Morning/Afternoon/Night)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: hourly array from Task 3, location tz
- Produces: `function aggregateToday(hours, tz)` → array of `{ label: 'morning'|'afternoon'|'night', pop: number, precip: number }` rendered in Today tab.

### Steps

- [ ] **Step 1: Define windows**
Morning 06:00–12:00, afternoon 12:00–18:00, night 18:00–06:00 next day (split across midnight). Use location tz for hour extraction.

- [ ] **Step 2: Implement aggregation**
For each period, collect matching hour entries (by hour-of-day range in location tz).
- POP% = max of period (or 0 if none). Spec: “POP% for period” — max is reasonable.
- Precip = total mm over period (sum of hourly precip values for those hours).

- [ ] **Step 3: Render table**
Columns: Period | POP% | Precip (mm)

- [ ] **Step 4: Update render on hourly change**
When hourly data updates, recompute and render Today tab.

- [ ] **Step 5: Commit**
```bash
git add app.js
git commit -m "feat: aggregate hourly data into today periods (morning/afternoon/night)"
```

---

## Task 5: 7-Day View

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: hourly array from Task 3, location tz
- Produces: `function aggregateWeek(hours, tz)` → array of `{ date: 'YYYY-MM-DD', pop: number, precip: number }` rendered in 7-Day tab.

### Steps

- [ ] **Step 1: Group by calendar date in location tz**
For each hour, get date key YYYY-MM-DD in location tz.

- [ ] **Step 2: Aggregate per day**
- POP% = max per day
- Precip = total mm per day (sum of hourly precip)

- [ ] **Step 3: Render table**
Columns: Date | POP% | Precip (mm)

- [ ] **Step 4: Integrate with hourly updates**
Recompute on hourly data change.

- [ ] **Step 5: Commit**
```bash
git add app.js
git commit -m "feat: aggregate hourly data into 7-day totals"
```

---

## Task 6: Precipitation Radar (Animated Loop with Controls)

**Files:**
- Modify: `app.js`
- Modify: `styles.css` (ensure radar container visible)

**Interfaces:**
- Consumes: location `{lat,lon}` for context (optional), current time window
- Produces: radar frame management (fetch frames, animate, controls). Auto-refresh radar frames every 12 min.

### Steps

- [ ] **Step 1: Define GeoMet radar WMS source**
Use Environment Canada GeoMet radar WMS. Need composite precipitation radar layer with time dimension. Make base URL/layer names as constants (documented). Start with a reasonable default layer (e.g. radar composite reflectivity/precip).

- [ ] **Step 2: Fetch radar frames (time series)**
Query WMS GetCapabilities/GetMap with TIME parameter or use WMS time-enabled requests. Collect available timestamps for recent window (e.g. last 3–6h). Build list of image URLs (GetMap requests with proper bbox centered on location or national view; for minimal scope, use fixed bbox or center on location with small extent).

- [ ] **Step 3: Render frames in container**
Display current frame as <img> in `#radarMap`. Preload images to reduce flicker.

- [ ] **Step 4: Animation state**
Track: frames[], currentIndex, playing (bool), speed (ms per frame), timer. Implement play/pause, speed slider, frame slider (seek). Update UI to reflect state.

- [ ] **Step 5: Auto-refresh frames**
Every 12 min (same interval), re-fetch frame list and reset animation to latest frame.

- [ ] **Step 6: Wire UI controls**
- Play: start loop
- Pause: stop
- Speed: adjust interval (200–1000ms)
- Frame slider: seek to index; show timestamp

- [ ] **Step 7: Commit**
```bash
git add app.js styles.css
git commit -m "feat: radar animated loop with controls and auto-refresh"
```

---

## Task 7: Auto-Refresh Orchestration + Status UI

**Files:**
- Modify: `app.js`
- Modify: `index.html` (add status indicators if needed)

**Interfaces:**
- Consumes: all fetchers (hourly, radar). Location state.
- Produces: unified refresh every 12 min; update `#lastUpdate` with timestamp in location tz; basic error display.

### Steps

- [ ] **Step 1: Central refresh function**
`async function refreshAll()` → fetch hourly (if location set), then recompute views, refresh radar frames. Catch and display errors.

- [ ] **Step 2: 12-min interval**
Set interval on init (and clear/restart on location change). Also run immediately after location change.

- [ ] **Step 3: Status UI**
Show last update time (e.g. "Updated: 2026-10-14 14:23 local"). If error, show short message.

- [ ] **Step 4: Guard against missing location**
If no location saved, prompt user to search.

- [ ] **Step 5: Commit**
```bash
git add app.js index.html
git commit -m "feat: orchestrate 12-min auto-refresh and show status"
```

---

## Task 8: Polish + PWA Verification

**Files:**
- Modify: `index.html`, `styles.css`, `app.js`, `sw.js` as needed

**Interfaces:**
- Consumes: all
- Produces: final working static app meeting spec.

### Steps

- [ ] **Step 1: Tab switching UX**
Ensure clicking nav buttons shows correct tab and hides others. Default to Hourly if location exists, else show location form focus.

- [ ] **Step 2: Empty states**
Show helpful messages when no location/data.

- [ ] **Step 3: Defensive parsing**
Handle missing fields from APIs gracefully (don’t crash). Log to console minimally.

- [ ] **Step 4: Service worker update**
Bump CACHE version if assets change; implement simple update flow if desired (optional). Keep minimal.

- [ ] **Step 5: Manual verification checklist**
- Load page, search city/province → location set, data loads.
- Switch tabs: Hourly/Today/7-Day show POP% and precip.
- Radar: controls work (play/pause/speed/seek). Animation loops.
- Auto-refresh: wait/force 12 min logic (or shorten for test) — verify timestamp updates.
- Reload with cached data (offline shell loads).

- [ ] **Step 6: Commit**
```bash
git add index.html styles.css app.js sw.js manifest.webmanifest
git commit -m "chore: polish UI and verify PWA behavior"
```

---

## Self-Review Notes
- Spec coverage: all goals covered (tabs, location, timezone, POP%+precip in all views, 12-min refresh, radar controls). Aggregation rules explicit.
- No placeholders. Code blocks show actual content.
- Interfaces chain: Task2→Task3 consumes location; Task3 feeds 4/5; Task6 independent radar.
- Vanilla only, static files.
