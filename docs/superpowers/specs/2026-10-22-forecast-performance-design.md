# Fast, stable forecasts

The city-preview and styling decisions below are superseded by
[complete-card loading](2026-10-22-complete-card-loading-design.md). The current
app uses GDPS alone and reveals completed cards with the original styling.

Keep the existing dependency-free UI and visual style. New locations should show
useful forecasts quickly without replacing one forecast source with another after
first paint.

- Fetch the nearest suitable Canadian city forecast alongside the bounded grid
  fetch. Keep city values as the headline forecast for the refresh; grid values
  fill missing fields and provide period details. Never swap populated city values
  for grid estimates. If the grid wins the race, do not introduce a late city swap.
- Render seven local dates and twelve hourly slots consistently. Reserve space for
  optional feels-like/clothing fields and details. Patch existing DOM nodes so
  open details, focus, and scroll survive enrichment. Mark missing values with an
  en dash. Keep cached data visible during background refresh.
- Abort superseded searches, selections, and forecasts; bound request duration and
  actual network concurrency. Discover layer availability once per refresh window
  and avoid unsupported times. Pin requests to the discovered model run.
- Use cumulative precipitation differences for daily and period totals, rather
  than summing sparse one-hour samples. Only publish totals when interval coverage
  is complete; today's total covers the remaining forecast window. Preserve nulls.
- Load Leaflet and map images only on Radar, bound image downloads, cancel stale
  work, pause hidden animation, and clear loading state on all exit paths.
- Reuse Intl formatters, fix rain conditions, refresh the shell cache version and
  claim updated clients. Cache schema changes invalidate older forecast entries.

Validation: node selfcheck.js for pure logic, syntax checks, live EC schema/layer
probes, and browser checks when a browser is available. Do not import app.js in
selfcheck or pretend Node assertions verify DOM behavior.

## Verification

- `node selfcheck.js` passes: city headline preservation, stable seven dates and
  twelve hourly slots, four detail periods, nearest-city selection, missing
  values, cumulative totals, incomplete coverage, fractional-hour timezones,
  a 25-hour DST day, rain conditions, and bounded pool concurrency.
- Syntax checks pass for app.js, logic.js, and sw.js; precached files exist.
- Manually checked in Firefox: Toronto and Ottawa forecasts, Ottawa city data
  visible while the model was still loading, Details kept open with focus intact
  through completion, cached reload, lazy radar loading/animation, and cards at
  320px viewport width. New York completed through the model-only fallback.
  Header space is reserved for the completion timestamp.
- Initial layout contains the eventual data slots with en dashes, rather than
  differently shaped skeletons. Precipitation intervals crossing local boundaries
  use disclosed constant-rate interpolation; incomplete days remain unknown.
