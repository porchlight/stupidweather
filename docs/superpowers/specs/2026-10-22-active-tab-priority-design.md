# Prioritize the visible forecast

Use the original styling, a single GDPS source, and complete-card reveals. The
active tab controls the pending request queue. Switching tabs reprioritizes work
not yet started, retaining completed results and the six in-flight requests.
The pool stays bounded and preserves result indices.

Hourly prioritizes the baseline and next twelve hourly records. Week prioritizes
one complete local day at a time, using the first upcoming sample plus UTC
six-hour model samples and the baseline/closing samples needed for rain totals.
This removes the dependency on fetching every hourly row before showing today.
The weekly view always uses this same sample set, so later hourly completion
cannot alter an already published day card. Sparse-model highs/lows remain sample
estimates, as in the existing later forecast days.

Render only the active forecast view during progress. Switching tabs immediately
paints already completed records and changes pending request priorities. Finish
remaining work in the background for quick subsequent switches. Hide the forecast
loading message when the visible tab is ready. Keep cancellation and timeout
behavior, caches, radar on demand, and no realtime city previews.

Test dynamic queue ordering, bounded concurrency, stable result ordering, day
request dependencies, sparse-view independence, and fractional local timezones
in selfcheck.js. Check actual switching/rendering manually in the browser.

## Verification

- `node selfcheck.js`: passes, including a running queue switching Hourly -> Week
  -> Hourly, preserved result ordering, no duplicate work, bounded concurrency,
  weekly readiness without dense hourly completion, fractional-offset dates, and
  identical weekly values before/after the remaining hourly samples finish.
- Representative Toronto case at 10:30 local: first-day dependencies drop from
  92 potential field requests to 29, before layer-availability skips. This is a
  request-count comparison, not a measured end-to-end speed guarantee.
- Firefox: selected uncached Edmonton, switched immediately to 7-Day, confirmed
  model cards rendered, then switched back to Hourly and reused completed data.
  Dynamic network queue ordering is covered by the pure scheduler test; browser
  checks cover the DOM-bound switch/render behavior.
- Syntax checks and `git diff --check` pass. styles.css still matches HEAD.
