# Landing State + Sticky Nav — Design

Date: 2026-10-18
Status: approved

## Goal

First-time visitors (no selected location) get a full-screen purple welcome
state: title and search bar vertically centered, rainbow band at the bottom of
the viewport, tab nav hidden. After a city is chosen, the header animates up to
its normal size, revealing the app, and the tab nav becomes sticky.

## State model

One class on `body`:

- `body.landing` — set in `init()` when `restoreLocation()` returns nothing.
- Removed in `choosePlace()` after the location is set successfully.

That is the only JS state change. The restore path (returning users with a
saved location) never enters landing mode.

## Landing layout (`body.landing`)

- `body` background becomes solid `var(--purple)` with `background-image: none`
  (the paper design's radial gradients would otherwise still paint on top of
  the purple color). The header is already purple, so they merge seamlessly.
  Body switches back to the paper design when the class is removed (instant —
  the shrinking header reveals it).
- `header` gets `min-height: 100dvh` (`100vh` fallback), `display: flex`,
  `flex-direction: column`, `justify-content: center`, so the h1 + search form
  are vertically centered. Using `min-height` (not `height`) lets the header
  grow on cramped landscape phones.
- The rainbow band stays `header::after` at `bottom: 0` of the header — no
  `position: fixed`. Because the header fills the viewport in landing mode,
  the band naturally sits at the screen's bottom edge.
- `nav` is `display: none`.
- `#installBtn` stays as-is (absolute, top-right).
- The `#status` line stays visible: it is the only error feedback for a failed
  search (e.g. "Location not found") and doubles as the "Search a city to begin."
  hint.

## Transition (landing → app)

On `choosePlace()` success the class is removed and CSS does the rest:

- Base `header` gets `transition: min-height .5s ease`.
- As `min-height` animates from `100dvh` down to the natural header height,
  the flex-centered title/search ride upward with the header's bottom edge,
  the rainbow band travels up with it, and the paper body is revealed below.
- `prefers-reduced-motion: reduce` disables this transition, matching the
  existing reduced-motion block pattern in `styles.css`.

## Post-selection layout

Everything reverts to the current look. Additionally:

- `nav` becomes `position: sticky; top: 0` so it persists while scrolling the
  forecast.
- Sticky nav is transparent — no bar background, no rainbow edge (revised
  from the original paper-bar design). The three buttons themselves stick at
  `top: 0` over the scrolling content; inactive buttons have a white
  fill with the existing blue border, the active tab keeps its red fill.
  z-index above cards; the install modal sits in the top layer and is
  unaffected.

## Form label

`#locationForm label` is hidden unconditionally (`display: none`) — the
placeholder already names the field, and the form is visible in both states.
The input gains `aria-label="City"` so hiding the label doesn't hurt
accessibility.

## Files touched

| File | Change |
| --- | --- |
| `index.html` | Add `aria-label="City"` to `#locationInput`. |
| `styles.css` | Landing rules under `body.landing`, sticky nav, label hide, reduced-motion entry. |
| `app.js` | Toggle `body.landing` in `init()` and `choosePlace()`. |

No `logic.js` changes, no `FORECAST_VER` bump (no forecast data shape change).
`sw.js` CACHE bump required: the fetch handler is cache-first, so the CACHE
name must advance to evict v8 copies of the changed files even though the
precache list itself is unchanged.

## Testing

Pure DOM/CSS — not unit-testable under the repo's selfcheck constraints.
Verified by hand in a browser: fresh load without a saved location shows the
landing state; choosing a city animates the header up and reveals sticky nav;
reloading with a saved location skips landing entirely; reduced-motion skips
the animation.
