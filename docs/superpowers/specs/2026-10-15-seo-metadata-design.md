# SEO / metadata — design

## Goal

Make the page presentable when shared and installable as a PWA: proper title,
description, social card tags, a real favicon, and manifest icons. No
speculative SEO busywork.

## Explicitly NOT doing (with reasons)

- `<meta name="keywords">` — ignored by all major engines since ~2009.
- Legacy GEO tags (`geo.region`, `geo.position`, `geo.placename`) — deprecated
  and meaningless here: the app has no fixed location, users search at runtime.
  Social locale intent is covered by `og:locale`.
- `robots.txt` / `sitemap.xml` — single page, default crawl behavior is already
  correct.

## Changes

### `index.html` head

Add after the existing `<title>`:

- `<meta name="description">` — one sentence, plain language.
- `<meta name="theme-color" content="#6a4c93">` — matches the header band.
- Open Graph: `og:title`, `og:description`, `og:type=website`, `og:site_name`,
  `og:locale=en_US`, `og:image` (`icon.svg`, relative).
- Twitter: `twitter:card=summary`.
- `<link rel="icon" type="image/svg+xml" href="icon.svg">`.

`og:url` and `canonical` are omitted until a deployment domain exists — a
relative `og:image` carries a `<!-- ponytail: make absolute when the site has a
URL -->` note. `og:image` is the icon for now.

### `icon.svg` (new)

Purple rounded square (`#6a4c93`) with the `h1`-style chunky look: a yellow sun
(`#ffca3a`) peeking out behind a white cloud. Artwork stays inside the inner
~80% safe zone so it survives maskable cropping. Hand-written SVG, no raster
step.

### Icon rasterization

No rasterizer (`rsvg-convert`, ImageMagick, Inkscape) is available and none
will be installed for a favicon. So: SVG icon only — used as the browser
favicon and the manifest icon (`purpose: "any maskable"`). Skipped: PNG
192/512 and `apple-touch-icon`. Add them if/when a rasterizer or CI step
exists; iOS home-screen has no apple-touch-icon until then and falls back to a
page snapshot.

### `manifest.webmanifest`

- `icons`: one entry, `icon.svg`, `sizes: "any"`, `type: "image/svg+xml"`,
  `purpose: "any maskable"`.
- `theme_color`: `#222222` → `#6a4c93` (current value matches nothing in the
  app).
- `background_color`: `#ffffff` → `#fbfbfe` (the actual paper color).
- `lang` / `dir`: not needed on a manifest this size; skip.

### JSON-LD

One `WebApplication` block in `index.html`: `name`, `description`, `icon`
(`icon.svg`), `applicationCategory: "UtilitiesApplication"`, `offers` omitted
(free, no URL to point at). The only structured data that makes sense for an
app landing page.

## Testing

`selfcheck.js` gains a short section that reads `index.html` and
`manifest.webmanifest` with `node:fs` and asserts the tags above are present
(title, description, the six OG/Twitter tags, svg icon link, non-empty manifest
`icons`, `theme_color === '#6a4c93'`). It fails loudly if a tag is typo'd or
dropped. Plain `node --test`-free asserts, matching the existing selfcheck
style.
