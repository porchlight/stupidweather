# Stupid Weather

A small, dependency-free weather web app. Pick a city and get a 12-hour and
7-day forecast plus an animated precipitation/radar map. It installs as a PWA
and keeps the last forecast cached for offline use.

No build step, no framework, no `npm install` — plain ES modules served as
static files.

## Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Serve it over HTTP rather than opening `index.html` directly — the app is an
ES module and the service worker needs an HTTP origin.

## Features

- **Search any city** — geocoded via OpenStreetMap's Nominatim, with the
  timezone looked up so all times render in the location's local time.
- **Hourly** — the next 12 hours: temperature, condition, POP, precipitation,
  wind and gusts.
- **7-Day** — daily highs/lows and totals aggregated from the hourly
  points; each card expands into a morning/afternoon/evening/overnight
  breakdown, and every view shows a layers icon for how many clothes to wear.
- **Radar** — an animated loop of the last hour of radar frames, plus EC's
  extrapolated nowcast out to about the next 50 minutes.
- **Offline** — the last forecast is cached in `localStorage`; the shell is
  cached by a service worker.
- **Loading states** — skeleton cards while the forecast loads, and a
  loading overlay on the radar map.

## Data sources

| Data | Source |
| --- | --- |
| Forecast, wind, cloud, conditions | [Open-Meteo](https://open-meteo.com/en/docs) default-model forecast API (`api.open-meteo.com`) |
| Radar | [MSC GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/) WMS (`geo.weather.gc.ca`) |
| City search | [OpenStreetMap Nominatim](https://nominatim.org/) |
| Timezone lookup | [timeapi.io](https://timeapi.io/) |
| Basemap tiles | OpenStreetMap |

One Open-Meteo request returns 168 hourly points for both forecast views.
Conditions use WMO weather codes rather than a separate thunderstorm probability.
Daily totals include all available hours; the first and last local days can be partial.
Radar frames come from the Canadian radar network, so radar coverage is Canada only.

## Project layout

| File | Responsibility |
| --- | --- |
| `index.html` | Markup, head metadata, OG/Twitter cards, JSON-LD |
| `styles.css` | All styling, including the card and skeleton styles |
| `app.js` | DOM, network calls, rendering, radar map, tab switching |
| `logic.js` | Pure functions: time formatting, aggregation, pooling, labels |
| `selfcheck.js` | The test suite (`node selfcheck.js`) |
| `sw.js` | Service worker: precache the app shell, cache-first fetches |
| `manifest.webmanifest`, `icon.svg` | PWA metadata and icon |
| `docs/superpowers/` | Design specs and implementation plans |

## Testing

```sh
node selfcheck.js
```

Prints `selfcheck OK` or throws on the first failure. See `AGENTS.md` for what
can and cannot be tested this way.
