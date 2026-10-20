# Card Details + Layers Icons + Radar Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim radar history to 1 hour, add a per-card "Details" disclosure on the 7-Day tab that expands into a morning/afternoon/evening/overnight breakdown, and add a clothing-layers emoji to hourly rows, 7-day cards, and period rows.

**Architecture:** Two new pure helpers in `logic.js` (`layerIcon`, `aggregatePeriods`) tested via `selfcheck.js`; `app.js` rendering gains a small `layersHtml` helper, a `layersHtml`-adorned hourly row / card temp line, and a native `<details>` block appended to each week card that `renderForecast` wires up from `aggregatePeriods(hours, loc.tz)`. No new dependencies, no JS for expansion (native `<details>`).

**Tech Stack:** Vanilla ES modules, no dependencies. Native `<details>/<summary>`. Data: existing GDPS grid hours (and citypage hours during first paint).

## Global Constraints

- No build step, no dependencies, no framework: plain ES modules with named exports only.
- No code comments unless a non-obvious decision needs recording; deliberate simplifications get a `// ponytail: <ceiling>, <upgrade path>` comment.
- `node selfcheck.js` is the only test command. It may import `logic.js` and read `index.html`/`manifest.webmanifest` — **never `app.js`** (it touches `document` at import time). Keep its output pristine.
- DOM-bound changes (hourly rows, week cards, details expansion, radar) cannot be unit-tested; hand-verify them in a browser in Task 6 and report results. Do not invent tests that assert nothing.
- Layers icons stack cumulatively: `>20 → 👕`, `11–20 → 👕🧶`, `0–10 → 👕🧶🧥`,
  `<0 → 👕🧶🧥🥶`, null → render nothing. Exactly 20 → two icons, exactly 10 →
  three, exactly 0 → three, −1 → all four. Icons concatenate into one string
  inside a single `.layers` span.
- Period buckets by **local** hour: Morning 06–12, Afternoon 12–18, Evening 18–24, Overnight 00–06. Periods with zero hours are omitted; dates with zero hours are absent from the map.
- Card layers icon uses `d.hi`; hourly rows use `h.temp`; period rows use their period's `hi`.
- No `FORECAST_VER` bump (periods computed at render, not cached). Service worker: `CACHE` is already `'stupid-weather-v15'` from the pending radar change in this working tree — if that change was committed separately in another session, bump to `'stupid-weather-v16'`; otherwise leave it.
- Do **not** commit — the human has not asked for commits.

---

### Task 1: Radar trim to 1 hour of history

**Files:**
- Modify: `app.js:404` (`refreshRadar`)

**Interfaces:**
- Consumes: `radarTimes(now, count, future)` from `logic.js` (already supports the `future` argument; no logic change).
- Produces: unchanged — frame list is 10 past + 9 future ISO strings.

- [ ] **Step 1: Change the frame counts**

In `refreshRadar`, replace:

```js
  const times = radarTimes(new Date(), 30, 9);
```

with:

```js
  const times = radarTimes(new Date(), 10, 9);
```

- [ ] **Step 2: Run the test suite**

Run: `node selfcheck.js`
Expected: `selfcheck OK` (existing `radarTimes` tests use explicit args and still pass).

Browser verification deferred to Task 6.

---

### Task 2: `layerIcon` in logic.js + tests

**Files:**
- Modify: `logic.js` (insert after `fmtHiLo`, ~line 112, next to the other temp formatters)
- Test: `selfcheck.js` (import line 3; new assertions before `console.log('selfcheck OK')`)

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `layerIcon(temp: number|null) -> string` — one to four emoji
  stacked cold-ward: `'👕' | '👕🧶' | '👕🧶🧥' | '👕🧶🧥🥶' | ''`.

- [ ] **Step 1: Write the failing tests**

Add `layerIcon` to the `selfcheck.js` import list on line 3. Append before `console.log('selfcheck OK')`:

```js
// layerIcon: cumulative clothing stack by temperature (boundary: 20 = two icons, 10 = three, 0 = three)
assert.equal(layerIcon(21), '👕');
assert.equal(layerIcon(20), '👕🧶');
assert.equal(layerIcon(11), '👕🧶');
assert.equal(layerIcon(10), '👕🧶🧥');
assert.equal(layerIcon(0), '👕🧶🧥');
assert.equal(layerIcon(-1), '👕🧶🧥🥶');
assert.equal(layerIcon(null), '');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node selfcheck.js`
Expected: FAIL with `ReferenceError: layerIcon is not defined` (or import error).

- [ ] **Step 3: Write the implementation**

In `logic.js`, after `fmtHiLo`:

```js
export function layerIcon(temp) {
  if (temp == null) return '';
  if (temp > 20) return '👕';
  if (temp > 10) return '👕🧶';
  if (temp >= 0) return '👕🧶🧥';
  return '👕🧶🧥🥶';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

---

### Task 3: `aggregatePeriods` in logic.js + tests

**Files:**
- Modify: `logic.js` (insert after `aggregateWeek`, ~line 157)
- Test: `selfcheck.js` (import line 3; new assertions before `console.log('selfcheck OK')`)

**Interfaces:**
- Consumes: existing module-private `emptyStat()`, `addHour(stat, h)`, and exported `dateKey`, `tzParts` from `logic.js`.
- Produces: `aggregatePeriods(hours: Hour[], tz: string) -> Map<string, PeriodStat[]>` where `PeriodStat = { key: 'morning'|'afternoon'|'evening'|'overnight', label: 'Morning'|'Afternoon'|'Evening'|'Overnight', pop, precip, hi, lo, wind, gust, cond, feels }`. Rows per date are ordered morning → afternoon → evening → overnight; periods with no hours are omitted; dates with no hours are absent. `Hour = {time, pop, precip, temp, wind, gust, cloud, tstorm}` (same shape `aggregateWeek` consumes).

- [ ] **Step 1: Write the failing tests**

Add `aggregatePeriods` to the `selfcheck.js` import list on line 3. Append before `console.log('selfcheck OK')`:

```js
// aggregatePeriods: 4 local-hour buckets (Toronto Oct = UTC-4), empty buckets omitted,
// dates absent without hours; temps >10 keep feels null so deepEqual stays exact
const periodHours = [
  { time: '2026-10-14T04:00:00Z', pop: 5, precip: 0, temp: 11, wind: 4, gust: null, cloud: null, tstorm: null },   // 00:00 local -> overnight
  { time: '2026-10-14T10:00:00Z', pop: 20, precip: 1, temp: 13, wind: 3, gust: 6, cloud: 10, tstorm: 0 },        // 06:00 local -> morning (edge)
  { time: '2026-10-14T16:00:00Z', pop: 60, precip: 2, temp: 22, wind: 5, gust: 11, cloud: 90, tstorm: 0 },       // 12:00 local -> afternoon (edge)
  { time: '2026-10-14T22:00:00Z', pop: 10, precip: 0.5, temp: 15, wind: 6, gust: 9, cloud: 40, tstorm: 0 },      // 18:00 local -> evening (edge)
  { time: '2026-10-15T16:00:00Z', pop: 30, precip: 4, temp: 14, wind: 8, gust: null, cloud: 45, tstorm: 40 }     // 12:00 local Oct 15 -> lone afternoon
];
const periods = aggregatePeriods(periodHours, 'America/Toronto');
assert.equal(periods.size, 2);
assert.deepEqual(periods.get('2026-10-14').map(p => p.key),
  ['morning', 'afternoon', 'evening', 'overnight']);
assert.deepEqual(periods.get('2026-10-14')[0],
  { key: 'morning', label: 'Morning', pop: 20, precip: 1, hi: 13, lo: 13, wind: 3, gust: 6, cond: 'Sunny', feels: null });
assert.deepEqual(periods.get('2026-10-14')[2],
  { key: 'evening', label: 'Evening', pop: 10, precip: 0.5, hi: 15, lo: 15, wind: 6, gust: 9, cond: 'Partly cloudy', feels: null });
assert.deepEqual(periods.get('2026-10-15'),
  [{ key: 'afternoon', label: 'Afternoon', pop: 30, precip: 4, hi: 14, lo: 14, wind: 8, gust: null, cond: 'Thunderstorm', feels: null }]);
// no hours at all -> empty map
assert.equal(aggregatePeriods([], 'America/Toronto').size, 0);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node selfcheck.js`
Expected: FAIL with `ReferenceError: aggregatePeriods is not defined`.

- [ ] **Step 3: Write the implementation**

In `logic.js`, after `aggregateWeek`:

```js
const PERIODS = [
  { key: 'morning', label: 'Morning', from: 6, to: 12 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 18 },
  { key: 'evening', label: 'Evening', from: 18, to: 24 },
  { key: 'overnight', label: 'Overnight', from: 0, to: 6 }
];

export function aggregatePeriods(hours, tz) {
  const byDay = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(h);
  }
  const out = new Map();
  for (const [key, dayHours] of byDay) {
    const rows = [];
    for (const p of PERIODS) {
      const inPeriod = dayHours.filter(h => {
        const hr = Number(tzParts(h.time, tz).hour);
        return hr >= p.from && hr < p.to;
      });
      if (!inPeriod.length) continue;
      const stat = emptyStat();
      for (const h of inPeriod) addHour(stat, h);
      rows.push({ key: p.key, label: p.label, ...stat });
    }
    out.set(key, rows);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node selfcheck.js`
Expected: `selfcheck OK`

---

### Task 4: Layers icons in hourly rows and week cards (app.js)

**Files:**
- Modify: `app.js` line 1 (import), `hourlyList` (~line 297-310), `weekCards` (~line 317-333)

**Interfaces:**
- Consumes: `layerIcon(temp)` from Task 2.
- Produces (module-private, reused by Task 5): `layersHtml(temp: number|null) -> string` — `''` or `<span class="layers">…</span>`.

- [ ] **Step 1: Add the import**

On `app.js` line 1, add `layerIcon` to the import list from `./logic.js`.

- [ ] **Step 2: Add the shared helper**

Above `hourlyList` (or above `weekCards`), add:

```js
function layersHtml(temp) {
  const icon = layerIcon(temp);
  return icon ? `<span class="layers">${icon}</span>` : '';
}
```

- [ ] **Step 3: Add the icon to hourly rows**

In `hourlyList`, replace the temp line inside the row template:

```js
        + `<span class="hour-temp">${fmtTemp(h.temp)}</span>`
```

with:

```js
        + `<span class="hour-temp">${fmtTemp(h.temp)}</span>`
        + layersHtml(h.temp)
```

- [ ] **Step 4: Add the icon to the card hi/lo line**

In `weekCards`, replace:

```js
      + `<div class="card-temp">${fmtHiLo(d.hi, d.lo)}</div>`
```

with:

```js
      + `<div class="card-temp">${fmtHiLo(d.hi, d.lo)}${layersHtml(d.hi)}</div>`
```

- [ ] **Step 5: Run the test suite (no DOM tests exist — sanity only)**

Run: `node selfcheck.js && node --check app.js`
Expected: `selfcheck OK`, no syntax errors. Browser verification in Task 6.

---

### Task 5: Details expansion on week cards + styles

**Files:**
- Modify: `app.js` `renderForecast` (~line 343), `weekCards` (~line 317)
- Modify: `styles.css` (append near the card styles, after `.card-stats` block ~line 345)

**Interfaces:**
- Consumes: `aggregatePeriods(hours, tz)` from Task 3; `layersHtml(temp)` from Task 4; existing `conditionEmoji`, `fmtHiLo`, `fmtKmh` from `logic.js`.
- Produces: `weekCards(days, periods)` — second parameter is the `Map` from `aggregatePeriods`.

- [ ] **Step 1: Wire periods through `renderForecast`**

Replace `renderForecast` with:

```js
export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyList(hours, loc);
  if (opts.hourlyOnly) return;
  const days = opts.days || aggregateWeek(hours, loc.tz);
  const periods = aggregatePeriods(hours, loc.tz);
  document.getElementById('tab-week').innerHTML = weekCards(days, periods) + '<p class="note">POP = daily max, precip = daily total.</p>';
}
```

Add `aggregatePeriods` to the `app.js` line-1 import list.

- [ ] **Step 2: Extend `weekCards` signature and build the details block**

Change the signature to `function weekCards(days, periods)`. Inside the `days.map`, after the `feelsHtml` line, add:

```js
    const rows = periods.get(d.date);
    const detailsHtml = rows && rows.length
      ? `<details class="card-details"><summary>Details</summary>`
        + rows.map(p => `<div class="period-row">`
          + `<span class="period-name">${p.label}</span>`
          + `<span>${conditionEmoji(p.cond)}</span>`
          + `<span>${fmtHiLo(p.hi, p.lo)}</span>`
          + layersHtml(p.hi)
          + `<span>POP ${Math.round(p.pop)}%</span>`
          + `<span>${p.precip.toFixed(1)} mm</span>`
          + `<span>wind ${fmtKmh(p.wind)} km/h</span>`
          + `<span>gust ${fmtKmh(p.gust)} km/h</span>`
          + `</div>`).join('')
        + `</details>`
      : '';
```

And append it to the card template, after the closing `</dl>` and before `</article>`:

```js
      + `</dl>`
      + detailsHtml
      + `</article>`;
```

(The exact current template ends `+ `</dl></article>`;` — split it so `detailsHtml` sits between.)

- [ ] **Step 3: Add the styles**

Append to `styles.css` (card styles section):

```css
.layers {
  margin-left: .3rem;
}

.card-details {
  margin-top: .7rem;
  text-align: left;
}

.card-details summary {
  cursor: pointer;
  font-weight: 800;
  color: var(--purple);
}

.period-row {
  display: flex;
  flex-wrap: wrap;
  gap: .1rem .7rem;
  padding: .35rem 0;
  border-top: 1px solid rgba(106, 76, 147, .25);
  font-size: .85rem;
}

.period-name {
  font-weight: 800;
}
```

- [ ] **Step 4: Run the test suite**

Run: `node selfcheck.js && node --check app.js`
Expected: `selfcheck OK`, no syntax errors. Browser verification in Task 6.

---

### Task 6: README, service-worker check, full verification

**Files:**
- Modify: `README.md` (feature bullets ~lines 25-32)
- Verify: `sw.js` (`CACHE` value)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: nothing new.

- [ ] **Step 1: Update README**

Replace the radar bullet:

```markdown
- **Radar** — an animated loop of the last three hours of radar frames, plus
  EC's extrapolated nowcast out to about the next 50 minutes.
```

with:

```markdown
- **Radar** — an animated loop of the last hour of radar frames, plus EC's
  extrapolated nowcast out to about the next 50 minutes.
```

Extend the 7-Day bullet (`- **7-Day** — daily highs/lows and totals aggregated from the hourly/6-hourly points.`) to:

```markdown
- **7-Day** — daily highs/lows and totals aggregated from the hourly/6-hourly
  points; each card expands into a morning/afternoon/evening/overnight
  breakdown, and every view shows a layers icon for how many clothes to wear.
```

- [ ] **Step 2: Confirm the service worker version**

Run: `grep CACHE sw.js`

Expected: `const CACHE = 'stupid-weather-v15';` — correct as long as the radar change from this same working tree ships with this work. If that radar change was committed separately (check `git log --oneline -5 sw.js`), change to `'stupid-weather-v16'`.

- [ ] **Step 3: Run the full suite**

Run: `node selfcheck.js && node --check app.js && node --check logic.js`
Expected: `selfcheck OK`, no syntax errors.

- [ ] **Step 4: Hand-verify in a browser (report to the human — do not skip)**

Run: `python3 -m http.server 8000`, open `http://localhost:8000`, and check:

1. **Layers on hourly rows**: each row's temperature has the right emoji (warm day → 👕/🧶; cold → 🧥/🥶).
2. **Layers on cards**: the hi/lo line ends with the day's icon.
3. **Details link**: every full day card ends with a "Details" link; clicking expands four rows (Morning/Afternoon/Evening/Overnight) each with emoji, hi/lo, layers icon, POP, precip, wind, gust. Today's card shows only the periods that have hours.
4. **No-details cards**: during the brief citypage first paint, future days have no Details link (grid data adds them within seconds).
5. **Radar trim**: slider spans ~19 frames (10 past + up to 9 future); loop starts ~1 hour back and ends ~50 min in the future.
6. **Console**: no errors; `selfcheck OK` still prints clean.

Report the results of this checklist to the human.
