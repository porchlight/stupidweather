# Progressive forecast views

The reverted `abd3dab` mixed loading changes with forecast changes: new rain
conditions and severity, fewer daily samples, cumulative precipitation with
strict coverage requirements, and metadata-dependent requests. These provide
code-level explanations for changed icons and missing values, although the
specific production failures cannot be established from the repository alone.

In particular, the reverted condition rule classified any positive precipitation
as Rain and ranked it above Cloudy. Its existing aggregation test expectation
changed from Cloudy to Rain. Selecting only six-hourly samples could also change
which condition wins and which temperatures are included. Metadata failures
returned null and then prevented all point requests for the affected layer;
daily precipitation was explicitly set to null unless coverage checks passed.
These behaviors were independent of progressive rendering.

Keep the current forecast times, WMS layers, request concurrency, cached data
shape, condition rules, daily aggregation, and period aggregation unchanged.
Chronological requests already serve the earliest hourly rows and complete
the earliest daily card first; no alternate sampling or queue is needed.

During loading, paint only the selected forecast view. Keep a callback so tab
switches immediately paint the latest available progress. Retain refreshSeq
guards. A daily card is ready only when every scheduled sample for its local
date has completed. Until then it remains a skeleton. Replace only completed
cards' skeleton nodes so expanded details survive later progress updates.
Use the actual scheduled date count, including existing partial boundary days.

Verify readiness and equality with final daily/period aggregates in selfcheck,
including local midnight, unusual offsets, DST, and the last partial day.
Verify DOM behavior in a browser: loading
one card at a time, tab switching, expanded details, and superseded refreshes.
Bump the service-worker shell cache for the changed JavaScript; forecast cache
version stays unchanged because stored data and calculations are unchanged.

Validation: `node selfcheck.js`, `node --check app.js`, and `git diff --check`
pass. Browser verification is pending: no browser is available through the
session's browser inventory. No dependencies or DOM tests were added.
