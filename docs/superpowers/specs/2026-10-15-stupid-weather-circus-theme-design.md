# Stupid Weather — Circus Theme

Date: 2026-10-15
Status: approved (design), pending implementation

## Goal

Restyle the app into a bold **big-top circus** aesthetic: fun display fonts, a
complementary red/gold/cream/navy/teal palette, weather **tables turned into
cards**, a centered layout, and full responsiveness — playful and "dumb" but
still usable.

## Non-goals

- No build step, no new JS dependencies. Leaflet stays on its CDN; fonts come
  from a Google Fonts `<link>`.
- No data or behavior changes. All 7 weather fields are retained; missing values
  still render as `–` (U+2013).
- No theme toggle, no animation library, no SVG icon set (emoji instead).
- No motion chaos (no marquee, no autoplay wobble).

## Palette (playful rainbow)

```
--red     #ff595e   nav active tab, header stripes
--yellow  #ffca3a   buttons, condition pill, chips, accents
--green   #8ac926   chips, accents
--blue    #1982c4   borders, stripes
--purple  #6a4c93   ink, header band, card borders
--on-bright #1a1a2e text on bright backgrounds (near-black)
--paper   #fbfbfe   page background
```

Because every accent is bright, it fails AA *as text on white*. So only
purple is used as ink (6.85:1 on white); red/yellow/green are only ever
backgrounds carrying near-black text (≥5.5:1). Verified pairs: white on
purple 6.85, dark on yellow 11.18, dark on red 5.56, dark on green 8.50,
purple on white 6.85.

## Typography

- Headings, nav, card titles: **Bungee** (bold circus-signage).
- Body / numbers: **Nunito** (rounded, friendly, readable).
- Loaded via one Google Fonts `<link>` with `display=swap`; fallback
  `system-ui, sans-serif`.

## Layout & components

### Page shell
- Centered `.wrap`, `max-width` ~960px, `margin: 0 auto`; header and nav
  centered. Circus-striped band behind the header.

### Navigation
- Chunky pill buttons; active tab filled red/gold.

### Weather cards (Hourly tab + 7-Day tab)
- Container `.cards`: responsive grid
  `repeat(auto-fill, minmax(220px, 1fr))`.
- Each card: title (day/time, or weekday), large temp, condition + emoji, then a
  labeled stat grid (**POP, Precip, Wind, Gust**).
- Card style: cream fill, thick navy border, red/gold top stripe, rounded
  corners, chunky shadow, small alternating tilt.
- Hourly shows the first 12 points. The 7-Day caption
  ("POP = daily max, precip = daily total.") becomes a fun styled note.

### Condition emoji
- `conditionEmoji(cond)`: `Sunny ☀️`, `Partly cloudy ⛅`, `Cloudy ☁️`,
  `Thunderstorm ⛈️`, otherwise nothing. Pure helper in `logic.js`.

### Search results
- Styled as card-like buttons.

### Radar tab
- Themed Play/Pause buttons and sliders, and a circus border around the map
  container. Map tiles themselves are unchanged (Leaflet-rendered).

## Responsive

- Grid collapses to a single column on narrow screens; radar map height scales
  with viewport. No horizontal page scroll at 360 / 768 / 1280 px.

## Accessibility

- Keep `role="status"` messaging and visible focus outlines on all controls.
- Honor `prefers-reduced-motion` for the button hover wobble.

## Implementation notes

- `hourlyTable` / `weekTable` in `app.js` are rewritten to emit card markup
  instead of `<table>` rows (names may become `hourlyCards` / `weekCards`).
- `conditionEmoji` added to `logic.js` with a `selfcheck.js` assertion.
- `styles.css` is replaced wholesale.

## Verification

- `node selfcheck.js` → `selfcheck OK`; `node --check` on all JS exits 0.
- Manual: cards render with emoji; layout at 360/768/1280 px with no horizontal
  scroll; focus is visible; radar controls themed; missing values still `–`.
