# Loading Skeletons + SEO Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show skeleton placeholders in the Hourly/7-Day/radar sections while data loads, and add the metadata that actually matters (title, description, OG/Twitter tags, favicon, manifest icons, WebApplication JSON-LD).

**Architecture:** Skeletons are pure HTML strings produced by a new `skeletonCards(n)` in `logic.js`, dropped into the tab sections by `app.js` only when a section has no usable cache, and replaced by the existing `renderForecast`/`innerHTML` flow. One CSS shimmer animation, frozen under reduced motion. SEO is static `<head>` markup plus one hand-written `icon.svg` and manifest fixes.

**Tech Stack:** Vanilla ES modules, plain CSS, `node:assert` self-checks (`node selfcheck.js`). No new dependencies, no build step.

## Global Constraints

- No new dependencies; no build step (`package.json` has no scripts).
- Test command is `node selfcheck.js`; it prints `selfcheck OK` on success and throws on failure. Only `logic.js` is imported by it (plus `node:fs` reads of `index.html` / `manifest.webmanifest`). `app.js` must never be imported by `selfcheck.js` — it touches `document` at import time.
- No rasterizer (`rsvg-convert`, ImageMagick, Inkscape) is available, and none is to be installed. Icons are SVG only.
- Brand colors: `--purple #6a4c93`, `--yellow #ffca3a`, `--paper #fbfbfe`, `--on-bright #1a1a2e`.
- Skeleton placeholders appear only when a section has no data for the current location; background refreshes must not blank out existing cards.
- No comments in code unless the task below specifies one.

---

### Task 1: SEO metadata, icon, manifest

**Files:**
- Create: `icon.svg`
- Modify: `index.html` (head, lines 6-12)
- Modify: `manifest.webmanifest`
- Test: `selfcheck.js` (append at end, before the final `console.log`)

**Interfaces:**
- Consumes: nothing.
- Produces: `icon.svg` at the repo root, referenced by `index.html`, `manifest.webmanifest`, and the JSON-LD block.

- [ ] **Step 1: Write the failing test**

Append to `selfcheck.js`, immediately before the final `console.log('selfcheck OK');`, and add the `readFileSync` import at the top of the file:

```js
import { readFileSync } from 'node:fs';
```

```js
// index.html and manifest carry the metadata that matters for sharing/install
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('./manifest.webmanifest', import.meta.url), 'utf8'));
assert.match(html, /<title>Stupid Weather<\/title>/);
assert.match(html, /<meta name="description" content="[^"]+"/);
assert.match(html, /<meta property="og:title"/);
assert.match(html, /<meta property="og:description"/);
assert.match(html, /<meta property="og:type" content="website">/);
assert.match(html, /<meta property="og:image"/);
assert.match(html, /<meta name="twitter:card" content="summary">/);
assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="icon\.svg">/);
assert.equal(manifest.theme_color, '#6a4c93');
assert.ok(manifest.icons.length > 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node selfcheck.js`
Expected: FAIL — `AssertionError` on `<meta name="description" ...>` (the pattern match for description fails first).

- [ ] **Step 3: Create `icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Stupid Weather">
  <rect width="64" height="64" rx="12" fill="#6a4c93"/>
  <circle cx="43" cy="23" r="11" fill="#ffca3a"/>
  <circle cx="26" cy="40" r="11" fill="#ffffff"/>
  <circle cx="42" cy="38" r="13" fill="#ffffff"/>
  <rect x="15" y="38" width="34" height="15" rx="7.5" fill="#ffffff"/>
</svg>
```

- [ ] **Step 4: Add the head metadata to `index.html`**

Replace line 6 (`  <title>Stupid Weather</title>`) with:

```html
  <title>Stupid Weather</title>
  <meta name="description" content="Stupid Weather shows hourly and 7-day forecasts plus live radar for any city, with no accounts and no nonsense.">
  <meta name="theme-color" content="#6a4c93">
  <meta property="og:title" content="Stupid Weather">
  <meta property="og:description" content="Hourly and 7-day forecasts plus live radar for any city.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Stupid Weather">
  <meta property="og:locale" content="en_US">
  <!-- ponytail: make og:image absolute when the site has a URL -->
  <meta property="og:image" content="icon.svg">
  <meta name="twitter:card" content="summary">
  <link rel="icon" type="image/svg+xml" href="icon.svg">
```

Then add the JSON-LD block just before the closing `</head>` (line 13):

```html
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Stupid Weather",
      "description": "Hourly and 7-day forecasts plus live radar for any city.",
      "icon": "icon.svg",
      "applicationCategory": "UtilitiesApplication"
    }
  </script>
```

- [ ] **Step 5: Fix `manifest.webmanifest`**

Replace the whole file with:

```json
{
  "name": "Stupid Weather",
  "short_name": "StupidWx",
  "start_url": "./",
  "display": "standalone",
  "theme_color": "#6a4c93",
  "background_color": "#fbfbfe",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node selfcheck.js`
Expected: PASS — prints `selfcheck OK`.

- [ ] **Step 7: Commit**

```bash
git add icon.svg index.html manifest.webmanifest selfcheck.js
git commit -m "feat: add favicon, OG/Twitter metadata and manifest icons"
```

---

### Task 2: `skeletonCards(n)` in logic.js

**Files:**
- Modify: `logic.js` (append a new export at the end)
- Test: `selfcheck.js` (append after the metadata block from Task 1)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function skeletonCards(n)` returning a string shaped `<div class="cards">…</div>` containing `n` `<article class="card skeleton" aria-hidden="true">` elements. Consumed by `app.js` in Task 3.

- [ ] **Step 1: Write the failing test**

Append to `selfcheck.js`, before the final `console.log`, and add `skeletonCards` to the existing `./logic.js` import on line 2:

```js
// skeletonCards: n placeholder cards inside the standard cards wrapper
assert.ok(skeletonCards(3).startsWith('<div class="cards">'));
assert.equal((skeletonCards(3).match(/card skeleton/g) || []).length, 3);
assert.equal((skeletonCards(12).match(/card skeleton/g) || []).length, 12);
assert.equal((skeletonCards(3).match(/class="sk /g) || []).length, 24);
```

(24 = 4 slots + 4 stat lines per card, times 3 cards.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node selfcheck.js`
Expected: FAIL — `SyntaxError: The requested module './logic.js' does not provide an export named 'skeletonCards'`.

- [ ] **Step 3: Implement `skeletonCards` in `logic.js`**

Append at the end of `logic.js`:

```js
export function skeletonCards(n) {
  const card = '<article class="card skeleton" aria-hidden="true">'
    + '<span class="sk sk-time"></span>'
    + '<span class="sk sk-emoji"></span>'
    + '<span class="sk sk-temp"></span>'
    + '<span class="sk sk-cond"></span>'
    + '<dl class="card-stats">'
    + '<div><span class="sk sk-line"></span></div>'.repeat(4)
    + '</dl></article>';
  return `<div class="cards">${card.repeat(n)}</div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node selfcheck.js`
Expected: PASS — prints `selfcheck OK`.

- [ ] **Step 5: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: add skeletonCards placeholder markup builder"
```

---

### Task 3: Show skeletons in the Hourly and 7-Day tabs

**Files:**
- Modify: `app.js` (import line 1; `refreshAll` lines 27-57; new `showSkeleton` near `renderForecast` at line 252)
- Modify: `styles.css` (append `.sk` rules and reduced-motion rule)
- Test: manual browser check (no DOM test harness exists; `app.js` cannot be imported by `selfcheck.js`)

**Interfaces:**
- Consumes: `skeletonCards(n)` from `logic.js` (Task 2).
- Produces: `function showSkeleton()` (module-local, not exported).

- [ ] **Step 1: Add the import in `app.js`**

In the import list on line 1, add `skeletonCards` (keep the existing one-line import style):

```js
import { REFRESH_MS, forecastTimes, pool, aggregateWeek, radarTimes, radarDelay, clockTime, dayLabel, weekLabel, conditionWord, conditionEmoji, fmtTemp, fmtKmh, fmtHiLo, skeletonCards } from './logic.js';
```

- [ ] **Step 2: Add the CSS shimmer in `styles.css`**

Append after the `.note` rule (line 148), before the `/* Radar */` section:

```css
/* Loading skeletons */
.card.skeleton .card-stats > div { background: transparent; }
.sk {
  display: block;
  border-radius: 999px;
  background-color: #e6e2ef;
  background-image: linear-gradient(90deg, #e6e2ef 0%, #f4f1fa 50%, #e6e2ef 100%);
  background-size: 200% 100%;
  animation: sk-sweep 1.4s linear infinite;
}
.sk-time { width: 70%; height: .9rem; margin: .1rem auto .35rem; }
.sk-emoji { width: 2.2rem; height: 2.2rem; margin: .3rem auto; border-radius: 50%; }
.sk-temp { width: 55%; height: 1.9rem; margin: .2rem auto .5rem; }
.sk-cond { width: 45%; height: 1.1rem; margin: 0 auto .7rem; }
.sk-line { width: 80%; height: .8rem; margin: .2rem auto; }
@keyframes sk-sweep {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
```

- [ ] **Step 3: Freeze the shimmer under reduced motion**

Replace the existing reduced-motion block at `styles.css:161-164` with:

```css
@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
  button:hover, button:focus-visible { transform: none; }
  .sk { animation: none; background-image: none; }
}
```

- [ ] **Step 4: Add `showSkeleton` in `app.js`**

Add immediately before `export function renderForecast` (line 252):

```js
function showSkeleton() {
  document.getElementById('tab-hourly').innerHTML = skeletonCards(12);
  document.getElementById('tab-week').innerHTML = skeletonCards(7);
}
```

- [ ] **Step 5: Call it from `refreshAll` when there is no data for this location**

In `refreshAll`, replace the block from line 31 to line 36:

```js
  const seq = ++refreshSeq;
  try {
    const key = loc.lat + ',' + loc.lon;
    let hours = loadCachedForecast();
    let offline = false;
    const radar = refreshRadar(loc);
```

with:

```js
  const seq = ++refreshSeq;
  const key = loc.lat + ',' + loc.lon;
  let hours = loadCachedForecast();
  const empty = !hours || localStorage.getItem('sw:forecastKey') !== key;
  if (empty) showSkeleton();
  try {
    let offline = false;
    const radar = refreshRadar(loc);
```

- [ ] **Step 6: Clear the skeletons when the fetch fails with nothing to show**

In `refreshAll`, replace the catch block (lines 52-56):

```js
  } catch (err) {
    if (seq !== refreshSeq) return;
    status.textContent = 'Update failed: ' + err.message;
    console.error(err);
  }
```

with:

```js
  } catch (err) {
    if (seq !== refreshSeq) return;
    status.textContent = 'Update failed: ' + err.message;
    if (empty) {
      document.getElementById('tab-hourly').innerHTML = '';
      document.getElementById('tab-week').innerHTML = '';
    }
    console.error(err);
  }
```

- [ ] **Step 7: Verify (automated)**

Run: `node selfcheck.js`
Expected: PASS — prints `selfcheck OK` (confirms the `skeletonCards` import contract still holds).

- [ ] **Step 8: Verify (browser, empty state)**

Serve the folder and open it with devtools set to throttle "Slow 3G":

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`, search a city, and confirm: both the Hourly and 7-Day tabs show shimmering ghost cards while the forecast streams in; the Hourly tab's real cards replace the skeleton progressively; the 7-Day skeleton stays until the fetch finishes; the radar tab is unaffected. Then reload the page (cache is now warm) and confirm **no** skeleton flash — the cached cards appear immediately.

- [ ] **Step 9: Commit**

```bash
git add app.js styles.css
git commit -m "feat: show skeleton cards while the forecast loads"
```

---

### Task 4: Loading state on the radar map

**Files:**
- Modify: `app.js` (`refreshRadar`, lines 292-315)
- Modify: `styles.css` (append after the `#radarMap` rule at line 155)
- Test: manual browser check

**Interfaces:**
- Consumes: the `sk-sweep` keyframes from Task 3.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the overlay CSS**

Append after the `#radarMap { … }` rule at `styles.css:155`:

```css
#radarMap { position: relative; }
#radarMap.loading::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
  border-radius: 14px;
  background-image: linear-gradient(100deg,
    rgba(251, 251, 254, .55) 30%, rgba(251, 251, 254, .15) 50%, rgba(251, 251, 254, .55) 70%);
  background-size: 200% 100%;
  animation: sk-sweep 1.6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  #radarMap.loading::after { animation: none; background-image: none; background-color: rgba(251, 251, 254, .3); }
}
```

- [ ] **Step 2: Toggle the class in `refreshRadar`**

In `app.js`, in `refreshRadar`, replace lines 299-306:

```js
  const bounds = radarMap.getBounds();
  radarBounds = bounds;
  const times = radarTimes(new Date());
  const frames = await pool(times, 6, async (time) => {
    const url = radarFrameUrl(time, bounds);
    return { time, url };
  });
  if (seq !== refreshSeq) return;
```

with:

```js
  const bounds = radarMap.getBounds();
  radarBounds = bounds;
  const mapEl = document.getElementById('radarMap');
  mapEl.classList.add('loading');
  const times = radarTimes(new Date());
  const frames = await pool(times, 6, async (time) => {
    const url = radarFrameUrl(time, bounds);
    return { time, url };
  });
  if (seq !== refreshSeq) { mapEl.classList.remove('loading'); return; }
```

- [ ] **Step 3: Clear the class on the second early return and on success**

Replace lines 307-314:

```js
  await Promise.all(frames.map(f => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = f.url; })));
  if (seq !== refreshSeq) return;
  radarFrames = frames;
  const slider = document.getElementById('frameSlider');
  slider.max = String(frames.length - 1);
  slider.value = '0';
  showFrame(frames.length - 1);
  playRadar();
```

with:

```js
  await Promise.all(frames.map(f => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = f.url; })));
  if (seq !== refreshSeq) { mapEl.classList.remove('loading'); return; }
  radarFrames = frames;
  const slider = document.getElementById('frameSlider');
  slider.max = String(frames.length - 1);
  slider.value = '0';
  showFrame(frames.length - 1);
  mapEl.classList.remove('loading');
  playRadar();
```

- [ ] **Step 4: Verify (automated)**

Run: `node selfcheck.js`
Expected: PASS — prints `selfcheck OK`.

- [ ] **Step 5: Verify (browser)**

With the server from Task 3 running, open `http://localhost:8000/`, switch to the **Radar** tab, and confirm the map shows a faint sweeping overlay until the first radar frame appears, then the overlay is gone and playback starts. Switch tabs away and back, and back to Hourly, to confirm the overlay never sticks.

- [ ] **Step 6: Commit**

```bash
git add app.js styles.css
git commit -m "feat: show a loading overlay on the radar map"
```

---

## Self-Review

- **Spec coverage:**
  - Skeleton cards in Hourly + 7-Day → Tasks 2, 3. ✓
  - Only when empty (no usable cache / location change) → Task 3 Step 5 (`empty` includes the key mismatch; staleness alone keeps the old cards). ✓
  - Radar loading state → Task 4. ✓
  - Reduced motion → Task 3 Step 3, Task 4 Step 1. ✓
  - `icon.svg`, head metadata, manifest fixes, JSON-LD → Task 1. ✓
  - No keywords/GEO/robots/sitemap, SVG-only icons (no rasterizer) → encoded as Global Constraints; no task adds them. ✓
  - One runnable check per spec → Task 1 (metadata presence) and Task 2 (`skeletonCards`) extend `selfcheck.js`; Tasks 3-4 are DOM glue verified in the browser as the specs specify. ✓
- **Placeholder scan:** no TBD/TODO; every code step shows the literal code. The one `ponytail:` comment is part of Task 1's specified markup, not a placeholder. ✓
- **Type consistency:** `skeletonCards(n)` is defined in Task 2 with that exact name and consumed in Task 3; the CSS class names `sk-time/sk-emoji/sk-temp/sk-cond/sk-line`, `card skeleton`, `loading`, and the `sk-sweep` keyframes match between tasks 2, 3, and 4. The self-check count of 24 `class="sk ` occurrences matches Task 2's markup (8 per card × 3). ✓
