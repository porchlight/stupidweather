# Complete cards and original styling

Supersedes the progressive field filling and layout changes in the earlier
forecast performance design, following the user's feedback.

Restore styles.css exactly to its original state, including original fonts,
spacing, flex layouts and optional-field markup. Keep an original skeleton in
each hourly/daily position until all requests contributing to that card have
settled. For daily cards this includes adjacent cumulative precipitation samples
needed for totals. Publish each completed card once, with its Details ready;
unsupported or failed fields are final unknowns, not indefinitely pending data.

Use GDPS for every card, as before. Remove the realtime city API from the app
fetch/render flow entirely; no preview or mixing of forecast sources. Preserve
cached forecasts during refresh, bounded requests, cancellation, radar loading,
and the weather-data corrections. Bump the shell cache for installed clients.

Verify readiness dependencies in selfcheck.js and rendering in a browser.

## Verification

`node selfcheck.js` passes, including readiness checks for preceding and closing
precipitation samples. Syntax and diff checks pass. styles.css matches HEAD
exactly. In Firefox, verified the original compact hourly appearance and the
7-Day view showing six completed GDPS cards while the seventh remained a
skeleton and the status still read Loading. No city API is called by app.js.
