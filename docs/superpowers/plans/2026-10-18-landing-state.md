# Landing State + Sticky Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-time visitors get a full-screen purple landing state (centered title + search, rainbow band at the screen bottom, no tab nav); choosing a city animates the header up to its normal size and reveals a sticky tab nav.

**Architecture:** A `body.landing` class, toggled by `app.js` when no location is selected, drives all landing styling in `styles.css`. The landing header is a flex-centered `min-height: 100dvh` block, so the existing `header::after` rainbow band sits at the screen's bottom edge without `position: fixed`; removing the class animates `min-height` back down. The tab nav becomes a full-bleed sticky paper bar with a 6px rainbow bottom edge once visible.

**Tech Stack:** Plain HTML/CSS/ES modules. No dependencies, no build step.

## Global Constraints

- No build step, no bundler, no framework, no runtime/npm dependencies.
- `node selfcheck.js` must print `selfcheck OK` after every task; it imports only `logic.js` and must never import `app.js`.
- DOM/CSS behavior is verified by hand in a browser (`python3 -m http.server 8000`), not unit-tested.
- No code comments unless a non-obvious decision needs recording (existing `// ponytail:` style).
- Style: two-space indent, single quotes, `export function`, template-literal HTML.
- Conventional-commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- Spec: `docs/superpowers/specs/2026-10-18-landing-state-design.md`.

---

### Task 1: Landing state (markup, CSS, JS toggle)

**Files:**
- Modify: `index.html:45` (input aria-label)
- Modify: `styles.css:16-26` (body landing rules), `styles.css:78-82` (label hide), plus new `body.landing` block
- Modify: `app.js:87-90` (`init` else-branch), `app.js:132-133` (`choosePlace`)

**Interfaces:**
- Consumes: existing `restoreLocation()` (returns saved loc or null) and `choosePlace(place)` in `app.js`.
- Produces: `body.landing` class present iff no location is selected. Task 2 styles depend on this class and on the unchanged `header::after` band.

- [ ] **Step 1: Add `aria-label` to the location input in `index.html`**

Replace the input line inside `#locationForm`:

```html
      <input id="locationInput" placeholder="e.g. London, Ontario" aria-label="City" required>
```

- [ ] **Step 2: Hide the form label in `styles.css`**

Replace the existing rule (currently `align-self` / `color` / `font-weight`):

```css
#locationForm label {
  display: none;
}
```

- [ ] **Step 3: Add landing rules to `styles.css`**

Insert directly after the existing `body { ... }` rule:

```css
body.landing {
  background-color: var(--purple);
  background-image: none;
}

body.landing header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
}

body.landing nav,
body.landing main {
  display: none;
}
```

(`min-height: 100vh` is the fallback line for browsers without `dvh`; `main` is hidden so its empty padding cannot create a scrollbar.)

- [ ] **Step 4: Toggle the class in `app.js`**

In `init()`, replace the restored/no-restored block:

```js
  const restored = restoreLocation();
  if (restored) onLocationChange(restored);
  else {
    document.body.classList.add('landing');
    document.getElementById('status').textContent = 'Search a city to begin.';
  }
```

In `choosePlace()`, add the class removal immediately after the location is resolved:

```js
    currentLocation = await selectPlace(place);
    document.body.classList.remove('landing');
```

- [ ] **Step 5: Run the selfcheck**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 6: Verify in a browser**

Run: `python3 -m http.server 8000` and open `http://localhost:8000` in a fresh tab with devtools → Application → Local Storage cleared for the origin.

Check:
- Full purple screen, "Stupid Weather" + search bar vertically centered, rainbow band along the bottom edge of the viewport, no Hourly/7-Day/Radar buttons, no "City" label, no scrollbar.
- Submitting a search shows results inside the purple screen; a failed search (e.g. `zzzzqqq`) shows the error in `#status`.
- Selecting a result loads the forecast and the app view appears (header shrinks to normal, nav visible — animation itself is Task 2). Reload: the landing state is skipped (saved location).

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: full-screen purple landing state until a city is chosen"
```

---

### Task 2: Landing-exit animation, sticky nav, SW cache bump

**Files:**
- Modify: `styles.css:44-50` (header transition), `styles.css:158-166` (nav sticky), reduced-motion block near `styles.css:502`
- Modify: `sw.js:1` (CACHE v8 → v9)

**Interfaces:**
- Consumes: `body.landing` class and its CSS from Task 1; existing `header::after` rainbow gradient (reused for the nav edge).
- Produces: nothing new for other code — pure presentation.

- [ ] **Step 1: Add the header transition in `styles.css`**

In the existing `header` rule, add:

```css
  transition: min-height .5s ease;
```

(The landing rule's `min-height: 100dvh` animates down to the natural height when `body.landing` is removed; the flex-centered content and the `::after` band ride upward with the header's bottom edge.)

- [ ] **Step 2: Make the nav a sticky full-bleed bar in `styles.css`**

Replace the existing `nav` rule:

```css
nav {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  gap: .6rem;
  flex-wrap: wrap;
  justify-content: center;
  padding: 1rem 1rem .55rem;
  background: var(--paper);
}

nav::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  background: repeating-linear-gradient(90deg,
      var(--red) 0 40px, var(--yellow) 40px 80px, var(--green) 80px 120px,
      var(--blue) 120px 160px, var(--purple) 160px 200px);
}
```

(The old `max-width: 960px; margin-inline: auto;` are dropped so the bar and its rainbow edge are full-bleed; buttons stay centered by `justify-content`. `z-index: 1000` clears Leaflet's control/tooltip layers.)

- [ ] **Step 3: Respect reduced motion in `styles.css`**

Add to the existing `@media (prefers-reduced-motion: reduce)` block that already contains `button { transition: none; }`:

```css
  header {
    transition: none;
  }
```

- [ ] **Step 4: Bump the service-worker cache in `sw.js`**

```js
const CACHE = 'stupid-weather-v9';
```

- [ ] **Step 5: Run the selfcheck**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

- [ ] **Step 6: Verify in a browser**

Hard-reload the page from Task 1's verification (or clear storage again for the landing path).

Check:
- Landing → select a city: the purple header (with title/search and the rainbow band at its bottom) smoothly animates upward over ~0.5s into the normal compact header, revealing the paper page; the nav (previously hidden) appears below as the header shrinks.
- With a forecast loaded: scroll down — the Hourly/7-Day/Radar bar stays pinned to the top of the viewport, solid paper background with the 6px rainbow edge at its bottom; cards scroll under it.
- Radar tab: map still sizes correctly with the sticky nav above it.
- DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: the landing-exit animation is instant.
- `sw.js` served with v9; no console errors.

- [ ] **Step 7: Commit**

```bash
git add styles.css sw.js
git commit -m "feat: animate landing exit and make tab nav sticky; bump SW cache to v9"
```
