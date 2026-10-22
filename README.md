# Stupid Weather

A small, dependency-free weather web app. Pick a city and get a 12-hour and
7-day forecast plus an animated precipitation/radar map. It installs as a PWA
and keeps forecasts for five recent locations cached for offline use.

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
- **7-Day** — seven local dates from GDPS model data. Each card expands into a
  morning/afternoon/evening/overnight breakdown, and every view shows a layers
  icon for how many clothes to wear.
- **Radar** — an animated loop of the last hour of radar frames, plus EC's
  extrapolated nowcast out to about the next 50 minutes.
- **Offline** — five recent forecasts are cached in `localStorage` and stay
  visible while refreshing; the shell is cached by a service worker.
- **Complete cards** — each hourly row and daily card stays a skeleton until all
  of its model requests have finished, including the samples needed for rainfall
  totals and Details. Cards appear individually with all available values ready;
  failed or unsupported fields display `–`. All cards use the same GDPS source;
  there is no realtime city forecast preview.
- **Active-tab priority** — opening 7-Day moves its pending requests ahead of
  Hourly, and switching back reverses that priority. Completed work is reused.
  Week cards use the first upcoming point and six-hour model samples rather than
  waiting for every hourly row; highs/lows are sampled estimates. Later hourly
  requests cannot change an already completed week card. Other forecast work
  continues in the background after the visible tab is ready.
- **Rainfall totals** — differences in cumulative model precipitation replace
  sparse one-hour sums. Rain is distributed evenly within each sampled model
  interval when it crosses a local day/period boundary, so totals are estimates.
  Today covers the remaining forecast hours; missing intervals display `–`.
- **Radar on demand** — Leaflet and radar images load when Radar opens, with four
  image downloads at a time. Hidden radar animation and superseded downloads stop.

## Data sources

| Data | Source |
| --- | --- |
| Forecast, wind, cloud, radar | [MSC GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/) WMS (`geo.weather.gc.ca`) |
| City search | [OpenStreetMap Nominatim](https://nominatim.org/) |
| Timezone lookup | [timeapi.io](https://timeapi.io/) |
| Basemap tiles | OpenStreetMap |

Forecast values come from Environment Canada's GDPS model. Layer times and model runs are
checked before requests, missing values stay unknown, and superseded forecasts
are cancelled. Model point requests are limited to six at a time.

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

When changing precached app files, bump `CACHE` in `sw.js`. The worker replaces
its old shell cache and claims open clients so installed copies receive updates.
