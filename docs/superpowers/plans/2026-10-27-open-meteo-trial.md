# Open-Meteo forecast trial

Replace forecast WMS point queries with one Open-Meteo default-model forecast request for 168 hours, requesting temperature, precipitation probability and amount, wind, gusts, cloud cover and weather codes. Keep Environment Canada radar and the static, dependency-free app.

Normalize UNIX UTC timestamps and m/s wind values in a pure helper. Map WMO codes to condition labels, preserve missing values, and use those labels in daily/period aggregation. Retain the existing local-time rendering, refresh sequence guards, error reporting and offline fallback. Bump forecast and service-worker caches and add visible attribution. Daily totals use every hourly point; the first/last local days can be partial, as with the existing rolling horizon.

Verify normalization, code mapping, missing/invalid responses and aggregation in selfcheck.js. Fetch a live response and inspect hourly, daily details and radar in a browser. Update README sources. No commit.

## Verification

- `node selfcheck.js`: passes, with normalization, missing/invalid data, WMO code families, units and aggregation checks.
- `node --check app.js` and `git diff --check`: pass.
- Live Barrie-area API response: 168 hourly points, UNIX UTC times, Celsius, mm, percent and m/s as requested.
- Firefox: selected Barrie through search, verified 12 hourly rows, local-time night label, daily cards and expanded morning/afternoon/evening details. Radar map still opens from its tab.
