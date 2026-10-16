# Hourly List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-lay the Hourly tab out as a two-line, full-width list grouped by local day, keeping the same 12-hour window and data.

**Architecture:** Two pure, testable helpers (`groupByDay`, `dayHeading`) plus a skeleton builder (`skeletonRows`) go in `logic.js`. `app.js` swaps `hourlyCards` for `hourlyList` and points `showSkeleton` at `skeletonRows` for the Hourly tab only. `styles.css` gains list styling; the 7-Day cards and Radar are untouched.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Node's `node:assert/strict` via `node selfcheck.js` is the only automated check. CSS/DOM is verified by hand in a browser.

## Global Constraints

- No build step, no bundler, no npm install, no runtime dependencies — ever.
- Vanilla ES modules with named exports; no default exports.
- Two-space indent, single quotes, `export function`, template-literal HTML.
- No comments except `// ponytail: <ceiling>, <upgrade path>` for deliberate simplifications.
- `selfcheck.js` imports only `logic.js` (plus `node:fs`); it must print `selfcheck OK` and nothing else. It never imports `app.js`.
- Never render times from UTC directly — all display paths go through the `tz`-aware helpers in `logic.js`.
- `FORECAST_VER`, `sw.js`, `index.html`, and `manifest.webmanifest` are NOT touched by this work.
- The Hourly tab shows the next 12 hours; that window does not change.

---

### Task 1: `groupByDay` pure helper

**Files:**
- Modify: `logic.js` (add export near `aggregateWeek`)
- Test: `selfcheck.js`

**Interfaces:**
- Consumes: `dateKey(iso, tz)` from `logic.js` (already exists).
- Produces: `groupByDay(hours, tz) -> [{ date: string, hours: object[] }]` — hours bucketed by local date key, groups sorted by `date` ascending. `hours` entries are the forecast hour objects (`{ time, pop, precip, temp, wind, gust, cloud, tstorm }`).

- [ ] **Step 1: Write the failing test**

In `selfcheck.js`, add `groupByDay` to the `logic.js` import on line 3, then add this block after the existing `weekLabel` asserts (around line 91):

```js
// groupByDay: buckets by local date key across days, sorted ascending
// (the shared `hours` fixture all lands on Oct 14 local; add an Oct 15 local hour)
const grouped = groupByDay([{ time: '2026-10-15T14:00:00Z' }, hours[0], hours[1]], 'America/Toronto');
assert.equal(grouped.length, 2);
assert.equal(grouped[0].date, '2026-10-14');
assert.equal(grouped[0].hours.length, 2);
assert.equal(grouped[1].date, '2026-10-15');
assert.equal(grouped[1].hours.length, 1);
assert.equal(grouped[0].hours[0].time, '2026-10-14T14:00:00Z');
```

Note: the shared `hours` fixture's three entries are all on Oct 14 local (`2026-10-15T01:00:00Z` is 21:00 Oct 14 in Toronto), so passing `hours` directly cannot yield two groups. The array above adds one Oct-15-local hour, passed first, so the ascending sort is genuinely exercised.

- [ ] **Step 2: Run test to verify it fails**

Run: `node selfcheck.js`
Expected: fails with `SyntaxError: The requested module './logic.js' does not provide an export named 'groupByDay'`.

- [ ] **Step 3: Write minimal implementation**

Add to `logic.js` immediately after `aggregateWeek` (after line 112):

```js
export function groupByDay(hours, tz) {
  const map = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!map.has(key)) map.set(key, { date: key, hours: [] });
    map.get(key).hours.push(h);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`.

- [ ] **Step 5: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: add groupByDay helper for the hourly list"
```

---

### Task 2: `dayHeading` pure helper

**Files:**
- Modify: `logic.js` (add export after `groupByDay`)
- Test: `selfcheck.js`

**Interfaces:**
- Consumes: `dateKey(iso, tz)` from `logic.js`.
- Produces: `dayHeading(key, now, tz) -> string` — `'Today'`, `'Tomorrow'`, or a weekday + short date such as `'Sat, Oct 17'`. `key` is a local `'YYYY-MM-DD'` date key; `now` is a `Date`.

- [ ] **Step 1: Write the failing test**

Add `dayHeading` to the `logic.js` import on line 3 of `selfcheck.js`, then add after the `groupByDay` block from Task 1:

```js
// dayHeading: today/tomorrow by local date key, else weekday + short date
const now = new Date('2026-10-15T14:00:00Z'); // Toronto 10:00 Oct 15 (Oct 15 2026 is a Thursday)
assert.equal(dayHeading('2026-10-15', now, 'America/Toronto'), 'Today');
assert.equal(dayHeading('2026-10-16', now, 'America/Toronto'), 'Tomorrow');
assert.equal(dayHeading('2026-10-17', now, 'America/Toronto'), 'Sat, Oct 17');

// dayHeading: DST-safe (US spring-forward is 2026-03-08)
const dstStart = new Date('2026-03-08T05:00:00Z');
assert.equal(dayHeading('2026-03-08', dstStart, 'America/Toronto'), 'Today');
assert.equal(dayHeading('2026-03-09', dstStart, 'America/Toronto'), 'Tomorrow');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node selfcheck.js`
Expected: fails with `SyntaxError: The requested module './logic.js' does not provide an export named 'dayHeading'`.

- [ ] **Step 3: Write minimal implementation**

Add to `logic.js` immediately after `groupByDay`:

```js
export function dayHeading(key, now, tz) {
  const todayKey = dateKey(now.toISOString(), tz);
  const t = new Date(`${todayKey}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  const tomorrowKey = t.toISOString().slice(0, 10);
  if (key === todayKey) return 'Today';
  if (key === tomorrowKey) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(`${key}T00:00:00Z`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`.

- [ ] **Step 5: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: add dayHeading helper for the hourly list"
```

---

### Task 3: `skeletonRows` builder

**Files:**
- Modify: `logic.js` (add export after `skeletonCards`)
- Test: `selfcheck.js`

**Interfaces:**
- Produces: `skeletonRows(n) -> string` — `<div class="hourly">` containing `n` `<article class="hour-row skeleton" aria-hidden="true">`, each with a `.hour-main` line and a `.hour-stats` line holding `.sk` shimmer blocks.

- [ ] **Step 1: Write the failing test**

Add `skeletonRows` to the `logic.js` import on line 3 of `selfcheck.js`, then add after the existing `skeletonCards` asserts (around line 109):

```js
// skeletonRows: n list-row placeholders in the hourly wrapper
assert.ok(skeletonRows(3).startsWith('<div class="hourly">'));
assert.equal((skeletonRows(4).match(/hour-row/g) || []).length, 4);
assert.ok(skeletonRows(2).includes('aria-hidden="true"'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node selfcheck.js`
Expected: fails with `SyntaxError: The requested module './logic.js' does not provide an export named 'skeletonRows'`.

- [ ] **Step 3: Write minimal implementation**

Add to `logic.js` immediately after `skeletonCards` (end of file):

```js
export function skeletonRows(n) {
  const row = '<article class="hour-row skeleton" aria-hidden="true">'
    + '<div class="hour-main"><span class="sk sk-time"></span></div>'
    + '<div class="hour-stats"><span class="sk sk-line"></span></div>'
    + '</article>';
  return `<div class="hourly">${row.repeat(n)}</div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node selfcheck.js`
Expected: `selfcheck OK`.

- [ ] **Step 5: Commit**

```bash
git add logic.js selfcheck.js
git commit -m "feat: add skeletonRows list placeholder builder"
```

---

### Task 4: Wire the Hourly list into the app and style it

**Files:**
- Modify: `app.js` (import line 1; replace `hourlyCards`; `renderForecast`; `showSkeleton`)
- Modify: `styles.css` (append list styles)

**Interfaces:**
- Consumes: `groupByDay`, `dayHeading`, `skeletonRows` (Tasks 1–3), and the existing `clockTime`, `conditionWord`, `conditionEmoji`, `fmtTemp`, `fmtKmh`.
- Produces: `hourlyList(hours, loc) -> string` inside `app.js`; `#tab-hourly` renders grouped rows. No exported API changes.

- [ ] **Step 1: Update the `app.js` import**

Change line 1 so it imports the new helpers and drops now-unused `dayLabel` (it was only used by `hourlyCards`):

```js
import { REFRESH_MS, forecastTimes, pool, aggregateWeek, groupByDay, dayHeading, radarTimes, radarDelay, clockTime, weekLabel, conditionWord, conditionEmoji, fmtTemp, fmtKmh, fmtHiLo, skeletonCards, skeletonRows } from './logic.js';
```

- [ ] **Step 2: Replace `hourlyCards` with `hourlyList`**

Replace the whole `hourlyCards` function (currently `app.js:221-237`) with:

```js
function hourlyList(hours, loc) {
  const groups = groupByDay(hours.slice(0, 12), loc.tz);
  const now = new Date();
  const blocks = groups.map(g => {
    const head = `<h3 class="hour-head">${dayHeading(g.date, now, loc.tz)}</h3>`;
    const rows = g.hours.map(h => {
      const cond = conditionWord(h.cloud, h.tstorm, h.temp, h.precip, h.wind);
      return `<article class="hour-row">`
        + `<div class="hour-main">`
        + `<span class="hour-time">${clockTime(h.time, loc.tz, false)}</span>`
        + `<span class="hour-emoji">${conditionEmoji(cond)}</span>`
        + `<span class="hour-temp">${fmtTemp(h.temp)}</span>`
        + `<span class="hour-cond">${cond}</span>`
        + `</div>`
        + `<p class="hour-stats">`
        + `<span>POP ${Math.round(h.pop)}%</span>`
        + `<span>${h.precip.toFixed(1)} mm</span>`
        + `<span>wind ${fmtKmh(h.wind)} km/h</span>`
        + `<span>gust ${fmtKmh(h.gust)} km/h</span>`
        + `</p></article>`;
    }).join('');
    return head + rows;
  }).join('');
  return `<div class="hourly">${blocks}</div>`;
}
```

- [ ] **Step 3: Point `renderForecast` at the list**

In `renderForecast` (currently `app.js:263-267`), change the first line to call `hourlyList`:

```js
export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyList(hours, loc);
  if (opts.hourlyOnly) return;
  document.getElementById('tab-week').innerHTML = weekCards(hours, loc.tz) + '<p class="note">POP = daily max, precip = daily total.</p>';
}
```

- [ ] **Step 4: Use the list skeleton for the Hourly tab**

In `showSkeleton` (currently `app.js:259-262`), change the Hourly line:

```js
function showSkeleton() {
  document.getElementById('tab-hourly').innerHTML = skeletonRows(8);
  document.getElementById('tab-week').innerHTML = skeletonCards(7);
}
```

- [ ] **Step 5: Append the list styles to `styles.css`**

Add at the end of `styles.css`, before the final `@media (prefers-reduced-motion: reduce)` block:

```css
/* Hourly list */
.hourly { display: flex; flex-direction: column; gap: .5rem; margin: 1rem 0; }
.hour-head {
  margin: .75rem 0 .1rem;
  padding: .3rem .75rem;
  font-size: .8rem;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--purple);
  border-bottom: 2px dotted rgba(106, 76, 147, .4);
  border-left: 8px solid var(--blue);
}
.hour-head:first-child { margin-top: 0; }
.hour-row {
  padding: .7rem 1rem;
  background: #fff;
  border: 3px solid var(--purple);
  border-radius: 14px;
  box-shadow: 0 4px 0 rgba(106, 76, 147, .2);
}
.hour-row:nth-of-type(even) { background: #f6f2ff; }
.hour-main { display: flex; align-items: baseline; gap: .7rem; flex-wrap: wrap; }
.hour-time { font-weight: 800; min-width: 4.5rem; color: var(--purple); }
.hour-emoji { font-size: 1.5rem; line-height: 1; }
.hour-temp { font-family: 'Bungee', system-ui, sans-serif; font-size: 1.4rem; color: var(--purple); }
.hour-cond { padding: .1rem .6rem; font-size: .85rem; font-weight: 800; background: var(--yellow); color: var(--on-bright); border-radius: 999px; }
.hour-stats { display: flex; flex-wrap: wrap; margin: .45rem 0 0; font-size: .85rem; color: rgba(106, 76, 147, .85); }
.hour-stats span + span::before { content: "·"; margin: 0 .5rem; }
.hour-row.skeleton .sk-time { width: 4rem; height: .9rem; }
.hour-row.skeleton .sk-line { width: 12rem; height: .8rem; }
```

- [ ] **Step 6: Run the automated check**

Run: `node selfcheck.js`
Expected: `selfcheck OK`. (This does not exercise `app.js`; it confirms the Task 1–3 helpers still load and pass.)

- [ ] **Step 7: Verify in the browser**

Run: `python3 -m http.server 8000`, open `http://localhost:8000`, search a city, and confirm: the Hourly tab is a list of full-width two-line rows; rows group under `Today` / `Tomorrow` / weekday headings; each row shows time, emoji, temp, condition, then POP / precip / wind / gust; the 7-Day tab is still cards; Radar still works; switching tabs is unaffected. This is a manual check — report what you saw.

- [ ] **Step 8: Commit**

```bash
git add app.js styles.css
git commit -m "feat: render the hourly tab as a grouped list"
```

---

## Self-Review

**Spec coverage:**
- "Hourly as full-width list, grouped by day" → Tasks 3–4 (`groupByDay`, `hourlyList`, CSS).
- "Each row shows time + weather details" → Task 4 Step 2 (all four stats kept).
- "Today / Tomorrow then weekday+date headers" → Task 2 (`dayHeading`) + Task 4.
- "Skeleton for the list-shaped hourly tab" → Task 3 + Task 4 Step 4.
- "7-Day and Radar unchanged" → Task 4 only touches `#tab-hourly`, `hourlyCards`, `showSkeleton`; week uses `skeletonCards`/`weekCards`.
- "Tests for pure helpers; DOM hand-verified" → Tasks 1–3 tests; Task 4 Step 7.

**Placeholder scan:** No TBD/TODO; every step has full code and exact commands.

**Type consistency:** `groupByDay`, `dayHeading`, `skeletonRows`, `hourlyList` are named identically wherever referenced. `hourlyList` is internal to `app.js` (not exported), matching how `hourlyCards` was. `dayLabel` is dropped from the `app.js` import in Task 4 Step 1 because `hourlyList` no longer uses it; it stays exported from `logic.js` (still asserted in `selfcheck.js`).
