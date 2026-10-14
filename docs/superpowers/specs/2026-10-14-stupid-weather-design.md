# Stupid Weather - Design Document

Date: 2026-10-14
Status: Draft (awaiting user review)
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

## Data Source: Environment Canada GeoMet OGC API
Environment Canada GeoMet (https://geomet-dev.ec.gc.ca/ or production endpoints) provides OGC services (WMS/WMTS/WFS). 
- Forecast data (hourly): need point-based forecast for POP and precipitation amounts. Use OGC point query (WFS/GetFeatureInfo) where available; fallback to gridded data if needed.
- Radar: precipitation radar composites via WMS; retrieve time series of frames for animation.
- Timezone: API typically returns UTC; convert to selected location TZ.
- CORS: public endpoints may allow direct browser calls. If CORS blocks, document lightweight proxy option (out of scope for static-only). Start with direct fetch.

## Architecture
- Static files only: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`
- Location search: geocode city/province → lat/lon. Nominatim (OpenStreetMap) is simple HTTP (no key) and CORS-friendly; acceptable for this scope.
- Data layer:
  - Geocoding: Nominatim `search` (by city, province)
  - Forecast: GeoMet OGC API point query to get hourly POP (%) and precip (mm) for next ~48h
  - Radar: GeoMet WMS time-enabled layer; collect frames for recent period
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
Map container. Fetch radar frames from GeoMet WMS (time series). Animated loop with controls: play/pause, speed, frame slider, last update time. Auto-refresh every 12 min also refreshes frame set.

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
- No external frameworks/libraries.

## Risks
- EC GeoMet endpoint/parameter changes; need defensive parsing.
- CORS: may block direct calls; if so, proxy needed (out of scope). Try direct first.
- Radar frame availability varies by region/time.
- TZ conversion edge cases (DST).

## Implementation Approach (recommended)
Vanilla HTML/CSS/JS (no build) — shortest path, matches “stupid”, fits ponytail ladder.

## Testing
Trivial runtime checks: parse sanity, TZ conversion, aggregation sums. No test framework unless strictly needed.
