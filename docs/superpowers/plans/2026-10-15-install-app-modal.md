# Install-as-app Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Install app" button to the header that opens a modal explaining how to add the site to the home screen on iPhone (Safari) and Android (Chrome).

**Architecture:** A real `<dialog>` element driven by `showModal()`, giving the backdrop, Esc-to-close, and focus trapping natively. The button is absolutely positioned in the existing `position: relative` header. Pure DOM work in `app.js`; no new modules, no logic helpers, no dependencies.

**Tech Stack:** Vanilla ES modules, native `<dialog>`, plain CSS. No build step, no bundler, no runtime dependencies.

## Global Constraints

- No build step, no bundler, no `npm install`, no runtime dependencies.
- Vanilla ES modules with named exports; two-space indent, single quotes, template-literal HTML.
- No comments except a `// ponytail: <ceiling>, <upgrade path>` marker for a deliberate simplification.
- `selfcheck.js` imports only `logic.js` (plus `node:fs`) and must print exactly `selfcheck OK` with no stray warnings. Never import `app.js` from it.
- `sw.js` carries the precache `ASSETS` list and a `CACHE` version. `index.html`, `styles.css`, and `app.js` are precached, so changing them requires bumping `CACHE` (v7 → v8). No `ASSETS` list change (no new files).
- No `FORECAST_VER` change (the cached forecast shape is untouched).
- No `beforeinstallprompt`, no OS detection, no "already installed" detection.
- Do not add ARIA or other attributes to the decorative `.skeleton` markup. This feature adds real interactive UI, which is exempt.

---

### Task 1: Install button and modal (markup + behavior)

**Files:**
- Modify: `index.html` (header button; `<dialog>` at the end of `<body>`)
- Modify: `app.js` (wire open/close inside `init()`)

**Interfaces:**
- Produces: DOM ids `installBtn`, `installModal`, `installClose` — Task 2 styles these exact ids.

- [ ] **Step 1: Add the button to the header**

In `index.html`, the `<header>` opens on line 40. Insert the button as its first child, so the header reads:

```html
  <header>
    <button id="installBtn" type="button" aria-haspopup="dialog">Install app</button>
    <h1>Stupid Weather</h1>
```

- [ ] **Step 2: Add the dialog markup**

In `index.html`, insert the dialog at the end of `<body>`, immediately before the Leaflet `<script>` (currently line 71, `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`):

```html
  <dialog id="installModal" aria-labelledby="installTitle">
    <h2 id="installTitle">Add Stupid Weather to your home screen</h2>
    <p>Install it like an app — no app store needed.</p>
    <section>
      <h3>iPhone (Safari)</h3>
      <ol>
        <li>Tap the <strong>Share</strong> button.</li>
        <li>Choose <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>.</li>
      </ol>
    </section>
    <section>
      <h3>Android (Chrome)</h3>
      <ol>
        <li>Open the <strong>three-dot menu</strong>.</li>
        <li>Choose <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</li>
        <li>Confirm <strong>Install</strong>.</li>
      </ol>
    </section>
    <button id="installClose" type="button">Close</button>
  </dialog>
```

- [ ] **Step 3: Wire open/close in `app.js`**

In `app.js`, inside `init()` (opens line 65), insert these lines after the `locationForm` submit-handler block (which ends at line 82) and before `const restored = restoreLocation();` (line 83):

```js
  const installModal = document.getElementById('installModal');
  document.getElementById('installBtn').addEventListener('click', () => installModal.showModal());
  document.getElementById('installClose').addEventListener('click', () => installModal.close());
  installModal.addEventListener('click', e => { if (e.target === installModal) installModal.close(); });
```

- [ ] **Step 4: Run the automated check**

Run: `node selfcheck.js`
Expected: `selfcheck OK` (unchanged — this task adds no testable logic).

- [ ] **Step 5: Verify the modal behavior in a browser (harness)**

Save the following as `/home/clarke/.local/share/stupidweather-verify/modal-check.mjs`:

```js
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8000'], { cwd: '/home/clarke/code/html/stupidweather', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });

const opened = await page.evaluate(() => {
  document.getElementById('installBtn').click();
  const d = document.getElementById('installModal');
  return { open: d.open, sections: [...d.querySelectorAll('h3')].map(h => h.textContent) };
});
const closed = await page.evaluate(() => {
  document.getElementById('installClose').click();
  return document.getElementById('installModal').open;
});
await page.evaluate(() => document.getElementById('installModal').showModal());
await page.keyboard.press('Escape');
const afterEsc = await page.evaluate(() => document.getElementById('installModal').open);

console.log(JSON.stringify({ opened, closed, afterEsc, errors }));
await browser.close();
server.kill();
if (!opened.open || opened.sections.length !== 2 || closed !== false || afterEsc !== false || errors.length) {
  throw new Error('install modal check FAILED');
}
console.log('modal check OK');
```

Run: `cd /home/clarke/.local/share/stupidweather-verify && LD_LIBRARY_PATH=$PWD/libs/root/usr/lib/x86_64-linux-gnu node modal-check.mjs`
Expected: prints a JSON line then `modal check OK` (button opens the dialog, two platform sections, Close and Esc both dismiss it, no console/page errors).

- [ ] **Step 6: Commit**

```bash
git add index.html app.js
git commit -m "feat: add install-as-app button and modal"
```

---

### Task 2: Style the button and modal, bump the service-worker cache

**Files:**
- Modify: `styles.css` (append at end)
- Modify: `sw.js` (bump `CACHE`)

**Interfaces:**
- Consumes: ids `installBtn`, `installModal`, `installClose` from Task 1.

- [ ] **Step 1: Append the styles**

Add at the **very end** of `styles.css` (after the final `@media (prefers-reduced-motion: reduce)` block, currently ending line 232):

```css
/* Install button + modal */
#installBtn { position: absolute; top: .75rem; right: .75rem; padding: .4rem .85rem; font-size: .9rem; }
#installModal {
  width: min(30rem, 92vw);
  padding: 1.25rem 1.5rem 1.5rem;
  color: var(--ink);
  background: #fff;
  border: 4px solid var(--purple);
  border-radius: 18px;
  box-shadow: 0 8px 0 rgba(106, 76, 147, .25);
}
#installModal::backdrop { background: rgba(26, 26, 46, .55); }
#installModal h2 { margin: 0 0 .35rem; font-size: 1.15rem; color: var(--purple); }
#installModal h3 { margin: 1rem 0 .25rem; color: var(--purple); }
#installModal ol { margin: 0; padding-left: 1.3rem; }
#installModal li { margin: .2rem 0; }
#installClose { margin-top: 1.1rem; }
```

- [ ] **Step 2: Bump the service-worker cache version**

In `sw.js`, change line 1:

```js
const CACHE = 'stupid-weather-v8';
```

- [ ] **Step 3: Run the automated check**

Run: `node selfcheck.js`
Expected: `selfcheck OK`.

- [ ] **Step 4: Verify styling in a browser (harness)**

Save the following as `/home/clarke/.local/share/stupidweather-verify/style-check.mjs`:

```js
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8000'], { cwd: '/home/clarke/code/html/stupidweather', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1200 } })).newPage();
await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(() => {
  document.getElementById('installBtn').click();
  const cs = getComputedStyle;
  const btn = cs(document.getElementById('installBtn'));
  const d = cs(document.getElementById('installModal'));
  const bd = cs(document.getElementById('installModal'), '::backdrop');
  return {
    btnPos: btn.position, btnTop: btn.top, btnRight: btn.right,
    modalBg: d.backgroundColor, modalBorder: d.borderTopColor, modalRadius: d.borderRadius,
    backdrop: bd.backgroundColor,
  };
});
await page.screenshot({ path: 'shots/install-modal.png' });
console.log(JSON.stringify(r));
await browser.close();
server.kill();
if (r.btnPos !== 'absolute' || r.modalBg !== 'rgb(255, 255, 255)' || !r.btnRight || r.backdrop === 'rgba(0, 0, 0, 0)') {
  throw new Error('install modal style check FAILED');
}
console.log('style check OK');
```

Run: `cd /home/clarke/.local/share/stupidweather-verify && LD_LIBRARY_PATH=$PWD/libs/root/usr/lib/x86_64-linux-gnu node style-check.mjs`
Expected: a JSON line then `style check OK` — `btnPos:"absolute"`, `modalBg:"rgb(255, 255, 255)"`, `modalBorder:"rgb(106, 76, 147)"`, a non-transparent `backdrop`; and `shots/install-modal.png` is written for the human to eyeball.

- [ ] **Step 5: Commit**

```bash
git add styles.css sw.js
git commit -m "style: install-modal button and dialog; bump SW cache to v8"
```

---

## Self-Review

**Spec coverage:**
- "Install button top-right of header" → Task 1 Step 1 + Task 2 Step 1 (`#installBtn` absolute top/right).
- "Modal over the page" → Task 1 Step 2 (`<dialog>` + `showModal()`), Task 2 `::backdrop`.
- "iPhone and Android instructions, both always" → Task 1 Step 2 (two `<section>`s with `<h3>`s).
- "Instructional only, no native prompt / detection" → Global Constraints; no code added for it.
- "Esc / Close / backdrop dismiss" → Task 1 Step 3 + verification Step 5.
- "sw cache bump" → Task 2 Step 2.
- "No new files/deps, selfcheck unchanged" → file lists; Task 1/2 selfcheck steps.

**Placeholder scan:** No TBD/TODO; every step has exact code or an exact command.

**Type consistency:** ids `installBtn` / `installModal` / `installClose` are spelled identically in markup, `app.js`, CSS, and the check scripts. No `logic.js` symbols involved.

**Testability note:** This is DOM/CSS-only; there is no unit-testable logic, so `selfcheck.js` is intentionally unchanged. The harness (Playwright) supplies the objective behavioral check; a human still confirms the visual result via `shots/install-modal.png`.
