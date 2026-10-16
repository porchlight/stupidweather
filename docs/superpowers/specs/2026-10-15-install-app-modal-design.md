# Install-as-app modal — design

## Problem

Stupid Weather is a PWA (`manifest.webmanifest` with `display: standalone`, plus
a service worker), so it can be added to a phone's home screen and run
full-screen. Nothing in the UI tells a visitor that, or how to do it. There is
no "install" affordance.

## Scope

Add a single **Install app** button to the top-right of the header, and a modal
it opens that explains, in plain steps, how to add the site to the home screen
on **iPhone (Safari)** and **Android (Chrome)**. Instructions only — no native
install prompt, no device sniffing. The button and modal are the only additions;
nothing else in the app changes.

## Design

### Markup (`index.html`)

- A button in the header, top-right: `<button id="installBtn" type="button">`,
  labelled "Install app". It is real interactive UI (not the decorative
  `.skeleton` markup the no-ARIA rule covers), so it gets `aria-haspopup="dialog"`
  and has an accessible name.
- A native `<dialog id="installModal" aria-labelledby="installTitle">`
  containing:
  - `<h2 id="installTitle">` a title (e.g. "Add Stupid Weather to your home
    screen"), and a one-line lead.
  - Two labelled sections, always both, in this order:
    - **iPhone (Safari):** tap the Share button → *Add to Home Screen* → *Add*.
    - **Android (Chrome):** open the ⋮ menu → *Add to Home screen* / *Install
      app* → confirm *Install*.
  - A **Close** button.

Using a real `<dialog>`: `showModal()` supplies the backdrop, Esc-to-close,
focus trapping, and top-layer stacking natively.

### Styling (`styles.css`)

- `#installBtn`: absolutely positioned in the header's top-right corner
  (`position: absolute` within the existing `position: relative` header). A small
  pill button in the existing palette; legible on the purple band; reuses the
  existing `button` styling where sensible.
- `#installModal`: styled to the app's chunky look — white card, purple border,
  rounded corners, readable at phone width. Two sections stacked; platform
  headings distinguishable.
- `#installModal::backdrop`: dims the page behind.

### Behavior (`app.js`)

- `installBtn` click → `installModal.showModal()`.
- **Close** button click → `installModal.close()`.
- Esc closes natively.
- Backdrop click closes via the standard pattern: on the dialog's `click`,
  `if (e.target === installModal) installModal.close()`.
- No `logic.js` helpers: there is no pure, testable logic, so nothing is added
  to `selfcheck.js`.

### Service worker (`sw.js`)

`index.html`, `styles.css`, and `app.js` are all in the precache `ASSETS` list,
and the fetch handler is cache-first. Without a bump, existing users keep the old
cached files and never see the button. Bump `CACHE` from `stupid-weather-v7` to
`stupid-weather-v8` so the new entries are fetched and the old cache is evicted.
No `ASSETS` list change (no new files).

## Not doing

- No native `beforeinstallprompt` integration.
- No OS detection / conditional ordering.
- No "already installed" detection or hiding.
- No new files, dependencies, or build step.
- No `FORECAST_VER` change (cached forecast shape is untouched).

## Testing

- No unit-testable logic (pure DOM), so `selfcheck.js` is unchanged and must
  keep printing `selfcheck OK`.
- Verified by hand with the browser harness
  (`/home/clarke/.local/share/stupidweather-verify`): the button renders in the
  header top-right; clicking it opens the modal over the page; both platform
  sections are present; Esc, the Close button, and a backdrop click all dismiss
  it; no console errors.
