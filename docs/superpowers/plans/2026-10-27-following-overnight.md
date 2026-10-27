# Following-night Details periods

Display Morning, Afternoon, Evening, Overnight in that order. Each calendar day’s Overnight details use 00:00–05:59 local time from the next calendar day, including DST transitions. Calendar-day headline totals stay unchanged. Omit unavailable periods at the forecast horizon.

Aggregate periods using the complete loaded forecast, including when rendering individual daily cards. Verify next-day boundaries, year rollover and both DST transitions in selfcheck.js, then inspect the Details dropdown in Firefox. Bump the service-worker shell cache; cached hour shape is unchanged.

Verification: selfcheck passes, including next-day boundaries, DST spring/fall nights and year rollover. Firefox shows Morning, Afternoon, Evening, Overnight in expanded Details. Removed the forecast/radar footer as requested and confirmed its absence in Firefox. Service-worker cache is v27.
