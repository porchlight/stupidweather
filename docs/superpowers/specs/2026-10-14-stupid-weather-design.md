# Stupid Weather - Design Document

Date: 2026-10-14
Status: Approved (endpoints verified)
Scope: Single PWA (static files only)

## Goals
Build a minimal PWA "Stupid Weather" with:
- Tabs: Hourly, Today (morning/afternoon/night), 7-Day, Radar
- Location: manual by city/province (search)
- Timezone: local to selected location
- POP% and Precip per hour shown in all views (aggregated appropriately)
- Auto-refresh every 12 minutes
- Radar: animated loop with controls (play/pause/speed/frame)
- Deployable as static files (no backend required if possible)

## Data Source: Environment Canada GeoMet (verified)
Two services, both CORS-open (`Access-Control-Allow-Origin: *`):
- OGC API: `https://api.weather.gc.ca` (collections, features)
- WMS: `https://geo.weather.gc.ca/geomet` (gridded model + radar imagery)

Verified data paths:
- **POP% per hour**: WMS `GetFeatureInfo` on `GDPS-WEonG_15km_Precip-Prob` (value = percent). 15 km, hourly to ~72 h then 3-hourly to ~10 days.
- **Precip per hour (mm)**: WMS `GetFeatureInfo` on `GDPS_15km_Precip-Accum1h` (value = mm for that hour). Same time grid.
  - `GetFeatureInfo` is one layer per request (multiple layers unsupported), so 2 requests per timestamp. EPSG:4326 BBOX order is lat,lon (WMS 1.3.0). INFO_FORMAT=application/json.
  - The OGC API city forecast (`citypageweather-realtime`) has hourly POP (`lop`) but **no numeric precip amount**, so gridded WMS is required for mm.
- **Radar**: WMS `RADAR_1KM_RRAI` (rain); transparent PNG frames, last ~3 h at 6-minute steps (~30 frames). `RADAR_1KM_RSNO` for snow if wanted later.
- **Geocoding**: Nominatim `https://nominatim.openstreetmap.org/search` (city, province) → lat/lon.
- **Timezone**: `https://timeapi.io/api/TimeZone/coordinate?latitude=..&longitude=..` → IANA tz (e.g. America/Toronto).
- **Basemap**: none in GeoMet. Leaflet + OpenStreetMap raster tiles.
- **Times**: all API times are UTC; convert for display using the location's IANA tz.

Request-count note: model point data is one `GetFeatureInfo` per layer per timestamp (~2× timestamps per refresh). Cached for the 12-minute window.

## Architecture
- Static files only: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`
- Location search: geocode city/province → lat/lon. Nominatim (OpenStreetMap) is simple HTTP (no key) and CORS-friendly; acceptable for this scope.
- Data layer:
  - Geocoding: Nominatim `search` (by city, province)
  - Forecast: GeoMet WMS `GetFeatureInfo` (GDPS layers) for hourly POP (%) and precip (mm)
  - Radar: GeoMet WMS `RADAR_1KM_RRAI` time-enabled frames + Leaflet/OSM basemap
- State: in-memory + `localStorage` (persist last location, last data with timestamps). Auto-refresh every 12 min based on timestamp.
- PWA: web app manifest + service worker caching app shell. Data is stale-ok if offline.

## Location & Timezone
- Manual selection by city/province
- Use location TZ for all displayed times (not browser TZ)
- Store `location: { name, lat, lon, tz }`

## Views
### Hourly
Next ~24–48 hours. Columns: time (local), POP%, precip (mm/hr).

### Today
Aggregate hours into: morning (06:00–12:00), afternoon (12:00–18:00), night (18:00–06:00 next day). 
Aggregation:
- POP%: max in period (conservative/simple)
- Precip: total (mm) over period; also show rate context if desired (mm/hr average) — minimal: total + label

### 7-Day
Daily aggregates: POP% max, precip total per day.

### Radar
Leaflet map (OSM tiles) with a location marker. Radar frames from GeoMet WMS `RADAR_1KM_RRAI` as transparent image overlays over the map. Animated loop with controls: play/pause, speed, frame slider, last update time. Auto-refresh every 12 min also refreshes the frame set.

## Data Model (minimal)
```json
{
  "location": { "name": "string", "lat": 0, "lon": 0, "tz": "America/Toronto" },
  "hours": [{ "time": "ISO8601-in-tz-or-UTC", "pop": 0, "precip": 0 }],
  "periods": [{ "label": "morning|afternoon|night", "pop": 0, "precip": 0 }],
  "days": [{ "date": "YYYY-MM-DD", "pop": 0, "precip": 0 }]
}
```

## Non-Functional
- Offline shell (basic UI loads). Data stale-ok offline.
- Mobile-first, minimal CSS.
- No build step. One external library: Leaflet (single CDN CSS+JS) for the radar map only.

## Risks
- EC GeoMet endpoint/parameter changes; need defensive parsing.
- Radar/model timesteps move with the latest model run; handle "time outside valid hours" by skipping.
- Radar frame availability varies by region/time.
- TZ conversion edge cases (DST) handled via IANA tz lookup.

## Implementation Approach (recommended)
Vanilla HTML/CSS/JS (no build), plus Leaflet (CDN) for the radar map — shortest path that works, fits ponytail ladder.

## Testing
Trivial runtime checks: parse sanity, TZ conversion, aggregation sums. No test framework unless strictly needed.
