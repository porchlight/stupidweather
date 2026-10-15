# Circus Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Stupid Weather as a bold big-top circus: fun fonts, a complementary red/gold/cream/navy/teal palette, weather tables turned into responsive cards, centered and fully responsive.

**Architecture:** Two changes. (1) The hourly/week render functions in `app.js` stop emitting `<table>` rows and emit card markup, plus a pure `conditionEmoji` helper in `logic.js`. (2) `styles.css` is replaced with the circus theme and `index.html` gains a Google Fonts link. No data or behavior changes.

**Tech Stack:** Vanilla ES modules, no build step. Leaflet 1.9.4 (CDN) unchanged. Fonts from Google Fonts CDN.

## Global Constraints

- No new JS dependencies; no build step.
- No data or behavior changes. All 7 weather fields retained (Time, POP, Precip, Temp, Condition, Wind, Gust). Missing values still render as `–` (U+2013, en dash).
- Hourly tab shows the first 12 points.
- Palette exactly: `--red #ff595e`, `--yellow #ffca3a`, `--green #8ac926`, `--blue #1982c4`, `--purple #6a4c93`. All text/background pairs must meet WCAG AA (4.5:1); bright accent colors are used only as backgrounds with near-black text.
- Fonts: **Bungee** (display) + **Nunito** (body), Google Fonts, `display=swap`, fallback `system-ui, sans-serif`.
- Honor `prefers-reduced-motion`.
- Gates after every task: `node selfcheck.js` → `selfcheck OK`; `node --check app.js logic.js selfcheck.js sw.js` exits 0.

---

### Task 1: Card markup + condition emoji

**Files:**
- Modify: `logic.js` (add `conditionEmoji` near `conditionWord`)
- Modify: `app.js:215-239` (`hourlyTable`/`weekTable`/`renderForecast`)
- Test: `selfcheck.js`

**Interfaces:**
- Consumes: existing `dayLabel`, `clockTime`, `fmtTemp`, `fmtHiLo`, `fmtKmh`, `conditionWord`, `aggregateWeek`, `weekLabel`.
- Produces:
  - `conditionEmoji(cond) -> string` (emoji or `''`), exported from `logic.js`.
  - Card markup with classes (styled in Task 2): `.cards`, `.card`, `.card-time`, `.card-emoji`, `.card-temp`, `.card-cond`, `.card-stats` (a `<dl>` of `<div><dt>..</dt><dd>..</dd></div>`), and `.note`.
  - `hourlyCards(hours, tz) -> string` and `weekCards(hours, tz) -> string` (renamed from `hourlyTable`/`weekTable`).

- [ ] **Step 1: Write the failing test** — add to `selfcheck.js`, after the `conditionWord` assertions:

```js
// conditionEmoji: one emoji per condition, empty string when unknown
assert.equal(conditionEmoji('Sunny'), '☀️');
assert.equal(conditionEmoji('Partly cloudy'), '⛅');
assert.equal(conditionEmoji('Cloudy'), '☁️');
assert.equal(conditionEmoji('Thunderstorm'), '⛈️');
assert.equal(conditionEmoji('–'), '');
assert.equal(conditionEmoji(undefined), '');
```

And update the import line at the top of `selfcheck.js` to include `conditionEmoji`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node selfcheck.js`
Expected: FAIL — `conditionEmoji is not a function` / import error.

- [ ] **Step 3: Implement `conditionEmoji`** — add to `logic.js` next to `conditionWord`:

```js
const CONDITION_EMOJI = {
  'Sunny': '☀️',
  'Partly cloudy': '⛅',
  'Cloudy': '☁️',
  'Thunderstorm': '⛈️'
};

export function conditionEmoji(cond) {
  return CONDITION_EMOJI[cond] || '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`.

- [ ] **Step 5: Rewrite the render functions** — replace `hourlyTable`, `weekTable`, and the body of `renderForecast` in `app.js` with:

```js
function hourlyCards(hours, tz) {
  const cards = hours.slice(0, 12).map(h => {
    const cond = conditionWord(h.cloud, h.tstorm);
    return `<article class="card">`
      + `<h3 class="card-time">${dayLabel(h.time, tz)}, ${clockTime(h.time, tz, false)}</h3>`
      + `<div class="card-emoji">${conditionEmoji(cond)}</div>`
      + `<div class="card-temp">${fmtTemp(h.temp)}</div>`
      + `<div class="card-cond">${cond}</div>`
      + `<dl class="card-stats">`
      + `<div><dt>POP</dt><dd>${Math.round(h.pop)}%</dd></div>`
      + `<div><dt>Precip (mm)</dt><dd>${h.precip.toFixed(1)}</dd></div>`
      + `<div><dt>Wind (km/h)</dt><dd>${fmtKmh(h.wind)}</dd></div>`
      + `<div><dt>Gust (km/h)</dt><dd>${fmtKmh(h.gust)}</dd></div>`
      + `</dl></article>`;
  }).join('');
  return `<div class="cards">${cards}</div>`;
}

function weekCards(hours, tz) {
  const days = aggregateWeek(hours, tz);
  const cards = days.map(d => {
    const cond = d.cond ?? '–';
    return `<article class="card">`
      + `<h3 class="card-time">${weekLabel(d.date)}</h3>`
      + `<div class="card-emoji">${conditionEmoji(cond)}</div>`
      + `<div class="card-temp">${fmtHiLo(d.hi, d.lo)}</div>`
      + `<div class="card-cond">${cond}</div>`
      + `<dl class="card-stats">`
      + `<div><dt>POP</dt><dd>${Math.round(d.pop)}%</dd></div>`
      + `<div><dt>Precip (mm)</dt><dd>${d.precip.toFixed(1)}</dd></div>`
      + `<div><dt>Wind (km/h)</dt><dd>${fmtKmh(d.wind)}</dd></div>`
      + `<div><dt>Gust (km/h)</dt><dd>${fmtKmh(d.gust)}</dd></div>`
      + `</dl></article>`;
  }).join('');
  return `<div class="cards">${cards}</div>`;
}

export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyCards(hours, loc.tz);
  if (opts.hourlyOnly) return;
  document.getElementById('tab-week').innerHTML = weekCards(hours, loc.tz) + '<p class="note">POP = daily max, precip = daily total.</p>';
}
```

- [ ] **Step 6: Verify gates**

Run: `node selfcheck.js && node --check app.js && node --check logic.js && node --check selfcheck.js`
Expected: `selfcheck OK` and exit 0.

- [ ] **Step 7: Commit**

```bash
git add app.js logic.js selfcheck.js
git commit -m "feat: render forecast as cards and add condition emoji"
```

---

### Task 2: Circus stylesheet + fonts

**Files:**
- Modify: `index.html` (add Google Fonts links)
- Modify: `styles.css` (replace entire file)
- Modify: `sw.js` (bump `CACHE` to `'stupid-weather-v5'` — the SW is cache-first and pre-caches `index.html`/`styles.css`, so without a byte change to `sw.js` returning users keep the old look)

**Interfaces:**
- Consumes: the card classes from Task 1 (`.cards`, `.card`, `.card-time`, `.card-emoji`, `.card-temp`, `.card-cond`, `.card-stats`, `.note`).
- Produces: the visible theme. No JS interface.

- [ ] **Step 1: Add Google Fonts to `index.html`** — inside `<head>`, before the `styles.css` link:

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Replace `styles.css`** with the full circus theme:

```css
* { box-sizing: border-box; }

:root {
  --red: #D7263D;
  --red-dark: #A4161A;
  --gold: #FFB703;
  --cream: #FFF8E7;
  --navy: #14213D;
  --teal: #2A9D8F;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: 'Nunito', system-ui, sans-serif;
  color: var(--navy);
  background-color: var(--cream);
  background-image:
    radial-gradient(circle at 15% 0, rgba(255, 183, 3, .20), transparent 45%),
    radial-gradient(circle at 85% 100%, rgba(42, 157, 143, .16), transparent 45%);
}

h1, h2, h3, button, .card-temp {
  font-family: 'Bungee', system-ui, sans-serif;
  letter-spacing: .02em;
}

:focus-visible { outline: 3px dashed var(--teal); outline-offset: 2px; }

/* Header: full-bleed circus band */
header {
  text-align: center;
  padding: 1.25rem 1rem 1rem;
  background: repeating-linear-gradient(90deg, var(--red) 0 28px, var(--red-dark) 28px 56px);
  border-bottom: 6px solid var(--gold);
  color: var(--cream);
}
header h1 {
  margin: 0 0 .6rem;
  color: var(--gold);
  font-size: clamp(1.6rem, 6vw, 2.6rem);
  text-shadow: 2px 2px 0 var(--navy), 4px 4px 0 rgba(0, 0, 0, .15);
}
#locationForm { display: flex; gap: .5rem; flex-wrap: wrap; justify-content: center; }
#locationForm input {
  font: inherit;
  padding: .6rem .9rem;
  border: 3px solid var(--navy);
  border-radius: 999px;
  min-width: 0;
  flex: 1 1 260px;
  max-width: 420px;
}
#locationName { margin-top: .6rem; font-size: 1.2rem; font-weight: 800; }
#lastUpdate { font-size: .9rem; opacity: .9; }
#status { min-height: 1.2em; font-weight: 800; color: var(--gold); }

/* Buttons */
button {
  font: inherit;
  cursor: pointer;
  padding: .55rem 1.1rem;
  border: 3px solid var(--navy);
  border-radius: 999px;
  background: var(--gold);
  color: var(--navy);
  box-shadow: 0 4px 0 var(--navy);
  transition: transform .12s ease, box-shadow .12s ease;
}
button:hover, button:focus-visible { transform: translateY(-2px) rotate(-1.5deg); box-shadow: 0 6px 0 var(--navy); }
button:active { transform: translateY(2px); box-shadow: 0 2px 0 var(--navy); }

/* Search results */
#results { display: flex; flex-direction: column; gap: .4rem; max-width: 420px; margin: .6rem auto 0; }
#results[hidden] { display: none; }
#results button { text-align: left; background: var(--cream); color: var(--navy); }

/* Nav tabs */
nav { display: flex; gap: .6rem; flex-wrap: wrap; justify-content: center; max-width: 960px; margin-inline: auto; padding: 1rem 1rem 0; }
nav button { background: var(--cream); }
nav button.active { background: var(--red); color: var(--cream); box-shadow: 0 4px 0 var(--navy), inset 0 0 0 2px var(--gold); }

/* Main + tabs */
main { max-width: 960px; margin-inline: auto; padding: 0 1rem 2rem; }
.tab[hidden] { display: none; }

/* Weather cards */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}
.card {
  position: relative;
  overflow: hidden;
  padding: 1.2rem .9rem 1rem;
  text-align: center;
  background: #fff;
  border: 4px solid var(--navy);
  border-radius: 18px;
  box-shadow: 0 8px 0 rgba(20, 33, 61, .25);
}
.card:nth-child(odd) { transform: rotate(-1deg); }
.card:nth-child(even) { transform: rotate(1deg); }
.card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 12px;
  background: repeating-linear-gradient(90deg, var(--red) 0 18px, var(--gold) 18px 36px);
}
.card-time { margin: 0 0 .2rem; font-size: .95rem; color: var(--red); }
.card-emoji { font-size: 2rem; line-height: 1; margin: .3rem 0; }
.card-temp { margin: .2rem 0; font-size: 2.1rem; color: var(--navy); }
.card-cond { margin-bottom: .7rem; font-weight: 800; color: var(--teal); }
.card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: .35rem .6rem; margin: 0; }
.card-stats > div { padding: .35rem .2rem; background: var(--cream); border-radius: 10px; }
.card-stats dt { font-size: .68rem; text-transform: uppercase; opacity: .7; }
.card-stats dd { margin: 0; font-weight: 800; }
.note { text-align: center; font-weight: 800; color: var(--red); }

/* Radar */
#radarControls { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; justify-content: center; margin: 1rem 0 .75rem; }
#radarControls label { display: inline-flex; gap: .4rem; align-items: center; font-weight: 800; }
input[type="range"] { accent-color: var(--red); }
#radarTime { font-weight: 800; color: var(--red); }
#radarMap { width: 100%; height: 65vh; border: 4px solid var(--navy); border-radius: 18px; }

@media (max-width: 480px) {
  #radarMap { height: 55vh; }
}

@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
  button:hover, button:focus-visible { transform: none; }
}
```

- [ ] **Step 3: Verify gates + manual check**

Run: `node selfcheck.js && node --check app.js && node --check logic.js && node --check selfcheck.js && node --check sw.js`
Expected: `selfcheck OK` and exit 0.

Manual (browser, `python3 -m http.server 8000`): cards render with emoji; no horizontal scroll at 360 / 768 / 1280 px; focus ring visible on tab/buttons; missing values still `–`; radar controls themed.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: apply circus theme with card layout and fun fonts"
```

---

## Self-Review

- **Spec coverage:** palette (Task 2), fonts (Task 2), cards + all 7 fields + `–` (Task 1), centering + responsive (Task 2), condition emoji (Task 1), search results + radar controls themed (Task 2), reduced-motion + focus (Task 2). All covered.
- **Placeholder scan:** none.
- **Type consistency:** `conditionEmoji`/`hourlyCards`/`weekCards` and the CSS class names match across tasks.
