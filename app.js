import { REFRESH_MS, forecastTimes, forecastPriorities, forecastReadiness, skeletonCard, skeletonRow, precipitationHours, forecastView, pool, groupByDay, dayHeading, radarTimes, radarDelay, clockTime, weekLabel, conditionWord, conditionEmoji, isNight, windChill, layerIcon, fmtTemp, fmtKmh, fmtHiLo } from './logic.js';

let activeTab = 'hourly';
let paintActiveForecast = null;

export function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(el => { el.hidden = true; });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  const section = document.getElementById('tab-' + name);
  if (section) section.hidden = false;
  paintActiveForecast?.();
  window.scrollTo(0, 0);
  if (name === 'radar') window.dispatchEvent(new Event('radar-shown'));
  else stopRadar();
}

let currentLocation = null;

let refreshTimer = null;

let refreshSeq = 0;
let refreshController = null;
let selectionController = null;
let searchController = null;

let onLocationChange = async (loc) => {
  clearInterval(refreshTimer);
  refreshTimer = null;
  const selection = selectionController;
  await refreshAll(loc);
  if (currentLocation !== loc || selectionController !== selection) return;
  refreshTimer = setInterval(() => refreshAll(loc), REFRESH_MS);
};

export async function refreshAll(loc) {
  const status = document.getElementById('status');
  if (!loc) { status.textContent = 'Search a city to begin.'; return; }
  const seq = ++refreshSeq;
  paintActiveForecast = null;
  refreshController?.abort();
  const controller = refreshController = new AbortController();
  const { signal } = controller;
  const now = new Date();
  const cached = loadCachedForecast(loc.lat + ',' + loc.lon);
  let hours = cached?.hours || [];
  let updated = cached?.ts;
  const stale = !cached || Date.now() - cached.ts > REFRESH_MS;
  renderForecast(hours, loc, now, cached ? null : { hours: new Set(), days: new Set() });
  document.getElementById('lastUpdate').textContent = updated
    ? `Updated ${clockTime(new Date(updated).toISOString(), loc.tz)} local` : '';
  status.textContent = stale ? (cached ? 'Refreshing…' : 'Loading…') : '';
  if (radarVisible()) refreshRadar(loc);
  if (!stale) return;
  let readiness = cached ? null : { hours: new Set(), days: new Set() };
  let loading = true;
  let lastHourly = '';
  let lastPaint = 0;
  let paintTimer = null;
  const paint = () => {
    if (seq !== refreshSeq || signal.aborted) return;
    lastPaint = Date.now();
    const view = forecastView(hours, null, loc.tz, now);
    const signature = JSON.stringify([view.hours, readiness && [...readiness.hours]]);
    if (activeTab === 'hourly' && signature !== lastHourly) {
      renderHourly(view.hours, loc, readiness);
      lastHourly = signature;
    }
    if (activeTab === 'week') renderWeek(view, readiness);
    if (loading && (activeTab === 'hourly' || activeTab === 'week')) {
      const ready = readiness == null || (activeTab === 'week'
        ? view.days.every(d => readiness.days.has(d.date))
        : view.hours.every(h => readiness.hours.has(Date.parse(h.time))));
      status.textContent = ready ? '' : 'Loading…';
    }
  };
  paintActiveForecast = paint;
  const schedulePaint = () => {
    if (paintTimer || signal.aborted) return;
    paintTimer = setTimeout(() => { paintTimer = null; paint(); }, Math.max(0, 400 - (Date.now() - lastPaint)));
  };
  try {
    hours = await fetchForecast(loc, (loaded, completed) => {
      if (signal.aborted || seq !== refreshSeq || cached) return;
      hours = loaded;
      readiness = forecastReadiness(hours, completed, loc.tz);
      schedulePaint();
    }, signal, now);
    if (signal.aborted || seq !== refreshSeq) return;
    readiness = null;
    loading = false;
    clearTimeout(paintTimer);
    paintTimer = null;
    paint();
    updated = Date.now();
    writeForecast({ hours, ts: updated }, loc);
    document.getElementById('lastUpdate').textContent = `Updated ${clockTime(new Date(updated).toISOString(), loc.tz)} local`;
    status.textContent = '';
  } catch (err) {
    if (signal.aborted || seq !== refreshSeq) return;
    loading = false;
    clearTimeout(paintTimer);
    paintTimer = null;
    if (cached) { hours = cached.hours; readiness = null; }
    paint();
    status.textContent = cached ? 'Model update unavailable. Showing the last available forecast.' : 'Update failed: ' + err.message;
  } finally {
    clearTimeout(paintTimer);
  }
}

function setLocationActive(active) {
  document.getElementById('locationForm').hidden = active;
  document.getElementById('changeLocation').hidden = !active;
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || navigator.standalone === true;
}

function init() {
  if (isInstalled()) document.getElementById('installBtn').hidden = true;
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('changeLocation').addEventListener('click', () => {
    setLocationActive(false);
    document.getElementById('locationInput').focus();
  });
  document.getElementById('locationForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = document.getElementById('locationInput').value.trim();
    if (!q) return;
    const status = document.getElementById('status');
    status.textContent = 'Searching…';
    try {
      searchController?.abort();
      const controller = searchController = new AbortController();
      const results = await searchPlaces(q, controller.signal);
      if (controller.signal.aborted) return;
      renderResults(results);
      status.textContent = '';
    } catch (err) {
      if (err.name === 'AbortError') return;
      renderResults([]);
      status.textContent = err.message;
    }
  });
  const installModal = document.getElementById('installModal');
  document.getElementById('installBtn').addEventListener('click', () => installModal.showModal());
  document.getElementById('installClose').addEventListener('click', () => installModal.close());
  installModal.addEventListener('click', e => { if (e.target === installModal) installModal.close(); });
  const restored = restoreLocation();
  if (restored) onLocationChange(restored);
  else {
    document.body.classList.add('landing');
    document.getElementById('status').textContent = 'Search a city to begin.';
  }
  switchTab('hourly');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.update().catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }).catch(() => {});
}

async function request(url, signal, timeout = 12000) {
  return fetch(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeout)]) });
}

export async function searchPlaces(query, signal) {
  const search = new URLSearchParams({ format: 'json', limit: '5', q: query });
  const res = await request('https://nominatim.openstreetmap.org/search?' + search, signal);
  if (!res.ok) throw new Error('Geocoding failed');
  const json = await res.json();
  if (!json.length) throw new Error('Location not found');
  return json.map(r => ({ lat: Number(r.lat), lon: Number(r.lon), name: r.display_name }));
}

export async function selectPlace(place, signal) {
  const tres = await request(`https://timeapi.io/api/TimeZone/coordinate?latitude=${place.lat}&longitude=${place.lon}`, signal);
  const tjson = await tres.json().catch(() => null);
  if (!tres.ok || !tjson || !tjson.timeZone) throw new Error('Timezone lookup failed');
  return { name: place.name, lat: place.lat, lon: place.lon, tz: tjson.timeZone };
}

function renderResults(list) {
  const box = document.getElementById('results');
  box.innerHTML = '';
  box.hidden = !list.length;
  for (const place of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = place.name;
    btn.addEventListener('click', () => choosePlace(place));
    box.appendChild(btn);
  }
}

async function choosePlace(place) {
  refreshController?.abort();
  refreshSeq++;
  clearInterval(refreshTimer);
  refreshTimer = null;
  selectionController?.abort();
  searchController?.abort();
  const controller = selectionController = new AbortController();
  const status = document.getElementById('status');
  status.textContent = 'Loading…';
  try {
    const loc = await selectPlace(place, controller.signal);
    if (controller.signal.aborted) return;
    currentLocation = loc;
    stopRadar();
    radarFrames = [];
    radarLocation = null;
    radarOverlay?.setUrl('');
    document.body.classList.remove('landing');
    setLocationActive(true);
    try { localStorage.setItem('sw:location', JSON.stringify(currentLocation)); } catch {}
    document.getElementById('locationName').textContent = currentLocation.name;
    const box = document.getElementById('results');
    box.innerHTML = '';
    box.hidden = true;
    document.getElementById('locationInput').value = '';
    status.textContent = '';
    await onLocationChange(currentLocation);
  } catch (err) {
    if (controller.signal.aborted) return;
    status.textContent = err.message;
    if (currentLocation) refreshTimer = setInterval(() => refreshAll(currentLocation), REFRESH_MS);
  }
}

function restoreLocation() {
  try {
    const saved = localStorage.getItem('sw:location');
    if (!saved) return null;
    const loc = JSON.parse(saved);
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) || typeof loc.name !== 'string' || typeof loc.tz !== 'string') return null;
    new Intl.DateTimeFormat('en', { timeZone: loc.tz }).format();
    currentLocation = loc;
    document.getElementById('locationName').textContent = currentLocation.name;
    setLocationActive(true);
    return currentLocation;
  } catch { return null; }
}

const WMS = 'https://geo.weather.gc.ca/geomet';
const LAYER_POP = 'GDPS-WEonG_15km_Precip-Prob';
const LAYER_PCP = 'GDPS_15km_Precip-Accum';
const LAYER_TEMP = 'GDPS_15km_AirTemp_2m';
const LAYER_WIND = 'GDPS_15km_WindSpeed_10m';
const LAYER_GUST = 'GDPS_15km_WindGust_10m';
const LAYER_CLOUD = 'GDPS_15km_TotalCloudCover';
const LAYER_TSTORM = 'GDPS-WEonG_15km_Thunderstorm-Prob';
const FORECAST_VER = '6';
const FORECAST_LAYERS = [LAYER_POP, LAYER_PCP, LAYER_TEMP, LAYER_WIND, LAYER_GUST, LAYER_CLOUD, LAYER_TSTORM];
let metadataCache = null;

async function layerMetadata() {
  if (metadataCache && Date.now() - metadataCache.ts < REFRESH_MS) return metadataCache.promise;
  const promise = pool(FORECAST_LAYERS, 4, async layer => {
    try {
      const p = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetCapabilities', layer });
      const res = await request(`${WMS}?${p}`, null, 8000);
      if (!res.ok) return null;
      const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
      const node = [...xml.getElementsByTagName('Layer')].find(el => [...el.children].some(c => c.localName === 'Name' && c.textContent === layer));
      const dimensions = [...(node?.children || [])].filter(c => c.localName === 'Dimension');
      const time = dimensions.find(d => d.getAttribute('name') === 'time');
      const run = dimensions.find(d => d.getAttribute('name') === 'reference_time')?.getAttribute('default');
      if (!time || !run) return null;
      const times = new Set();
      for (const value of time.textContent.split(',')) {
        if (!value.includes('/')) {
          const t = Date.parse(value);
          if (Number.isFinite(t)) times.add(t);
          continue;
        }
        const [from, to, step] = value.split('/');
        const match = step.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
        const ms = match && (Number(match[1] || 0) * 3600e3 + Number(match[2] || 0) * 60e3);
        if (ms) for (let t = Date.parse(from); t <= Date.parse(to); t += ms) times.add(t);
      }
      return { times, run };
    } catch { return null; }
  });
  metadataCache = { ts: Date.now(), promise };
  return promise;
}

async function pointValue(layer, loc, time, metadata, signal) {
  if (!metadata?.times.has(Date.parse(time))) return null;
  const d = 0.2;
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
    LAYERS: layer, QUERY_LAYERS: layer, CRS: 'EPSG:4326',
    BBOX: `${loc.lat - d},${loc.lon - d},${loc.lat + d},${loc.lon + d}`,
    WIDTH: '101', HEIGHT: '101', I: '50', J: '50',
    INFO_FORMAT: 'application/json', TIME: time.replace(/\.\d+Z$/, 'Z'),
    DIM_REFERENCE_TIME: metadata.run, STYLES: ''
  });
  const res = await request(`${WMS}?${p}`, signal, 8000);
  if (!res.ok) throw new Error('WMS ' + res.status);
  const json = await res.json();
  const value = json.features?.[0]?.properties?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function fetchForecast(loc, onProgress, signal, now = new Date()) {
  const slots = forecastTimes(now);
  const times = [new Date(Date.parse(slots[0]) - 3600e3).toISOString(), ...slots];
  const metadata = await layerMetadata();
  signal?.throwIfAborted();
  const hours = times.map(time => ({ time, pop: null, precip: null, precipTotal: null, temp: null, wind: null, gust: null, cloud: null, tstorm: null }));
  const fields = ['pop', 'precipTotal', 'temp', 'wind', 'gust', 'cloud', 'tstorm'];
  const tasks = times.flatMap((time, i) => fields.flatMap((field, j) => i === 0 && j !== 1 ? [] : [{ time, i, field, j }]));
  const priorities = {
    hourly: forecastPriorities(hours, loc.tz, 'hourly'),
    week: forecastPriorities(hours, loc.tz, 'week')
  };
  const done = times.map(() => 0);
  await pool(tasks, 6, async ({ time, i, field, j }) => {
    signal?.throwIfAborted();
    try { hours[i][field] = await pointValue(FORECAST_LAYERS[j], loc, time, metadata[j], signal); }
    catch { signal?.throwIfAborted(); }
    done[i]++;
    if (done[i] === (i === 0 ? 1 : fields.length) && onProgress) {
      const completed = new Set(done.flatMap((count, k) => count === (k === 0 ? 1 : fields.length) ? [k] : []));
      onProgress(precipitationHours(hours), completed);
    }
  }, task => priorities[activeTab === 'week' ? 'week' : 'hourly'][task.i]);
  signal?.throwIfAborted();
  if (!hours.some(h => h.temp != null)) throw new Error('Forecast data unavailable');
  return precipitationHours(hours);
}


function writeForecast(entry, loc) {
  try {
    let all = {};
    try { all = JSON.parse(localStorage.getItem('sw:forecasts') || '{}'); } catch {}
    if (!all || typeof all !== 'object' || Array.isArray(all) || localStorage.getItem('sw:forecastVer') !== FORECAST_VER) all = {};
    all[loc.lat + ',' + loc.lon] = entry;
    const keys = Object.keys(all).sort((a, b) => all[b].ts - all[a].ts);
    for (const k of keys.slice(5)) delete all[k];
    localStorage.setItem('sw:forecastVer', FORECAST_VER);
    localStorage.setItem('sw:forecasts', JSON.stringify(all));
  } catch {}
}

function loadCachedForecast(key) {
  try {
    if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) return null;
    const entry = JSON.parse(localStorage.getItem('sw:forecasts') || '{}')?.[key];
    return entry && Number.isFinite(entry.ts) && Array.isArray(entry.hours) ? entry : null;
  } catch { return null; }
}

function layersHtml(temp) {
  const icon = layerIcon(temp);
  return icon ? `<span class="layers">${icon}</span>` : '';
}

function hourlyList(hours, loc, readiness) {
  const groups = groupByDay(hours.slice(0, 12), loc.tz);
  const now = new Date();
  const blocks = groups.map(g => {
    const head = `<h3 class="hour-head">${dayHeading(g.date, now, loc.tz)}</h3>`;
    const rows = g.hours.map(h => {
      if (readiness && !readiness.hours.has(Date.parse(h.time))) return skeletonRow();
      const night = isNight(h.time, loc.tz);
      const cond = h.cond ?? conditionWord(h.cloud, h.tstorm, h.temp, h.precipRate ?? h.precip, h.wind, night);
      const feels = windChill(h.temp, h.wind);
      const feelsHtml = feels != null && Math.round(feels) !== Math.round(h.temp)
        ? `<span class="hour-feels">Feels like: ${fmtTemp(feels)}</span>` : '';
      return `<article class="hour-row">`
        + `<div class="hour-main">`
        + `<span class="hour-time">${clockTime(h.time, loc.tz, false)}</span>`
        + `<span class="hour-emoji">${conditionEmoji(cond)}</span>`
        + `<span class="hour-temp">${fmtTemp(h.temp)}</span>`
        + feelsHtml
        + `<span class="hour-cond">${cond}</span>`
        + `</div>`
        + `<p class="hour-stats">`
        + `<span>POP ${h.pop == null ? '–' : Math.round(h.pop) + '%'}</span>`
        + `<span>${h.precip == null ? '–' : h.precip.toFixed(1)} mm</span>`
        + `<span>wind ${fmtKmh(h.wind)} km/h</span>`
        + `<span>gust ${fmtKmh(h.gust)} km/h</span>`
        + `</p>`
        + layersHtml(h.temp)
        + `</article>`;
    }).join('');
    return head + rows;
  }).join('');
  return `<div class="hourly">${blocks}</div>`;
}

function weekCards(days, periods, readiness) {
  const cards = days.map(d => {
    if (readiness && !readiness.days.has(d.date)) return skeletonCard();
    const cond = d.cond ?? '–';
    const feelsHtml = d.feels != null && Math.round(d.feels) !== Math.round(d.hi)
      ? `<div class="card-feels">Feels like: ${fmtTemp(d.feels)}</div>` : '';
    const rows = periods.get(d.date);
    const detailsHtml = rows && rows.length
      ? `<details class="card-details"><summary>Details</summary>`
        + rows.map(p => `<div class="period-row">`
          + `<div class="period-head">`
          + `<span class="period-name">${p.label}</span>`
          + `<span>${p.cond ? conditionEmoji(p.cond) : '–'}</span>`
          + `<span>${fmtHiLo(p.hi, p.lo)}</span>`
          + `</div>`
          + `<div class="period-stats">`
          + `<span>POP ${p.pop == null ? '–' : Math.round(p.pop) + '%'}</span>`
          + `<span>${p.precip == null ? '–' : p.precip.toFixed(1)} mm</span>`
          + `<span>wind ${fmtKmh(p.wind)} km/h</span>`
          + `<span>gust ${fmtKmh(p.gust)} km/h</span>`
          + `</div>`
          + layersHtml(p.hi)
          + `</div>`).join('')
        + `</details>`
      : '';
    return `<article class="card">`
      + `<h3 class="card-time">${weekLabel(d.date)}</h3>`
      + `<div class="card-emoji">${conditionEmoji(cond)}</div>`
      + `<div class="card-temp">${fmtHiLo(d.hi, d.lo)}</div>`
      + feelsHtml
      + `<div class="card-layers">${layersHtml(d.hi)}</div>`
      + `<dl class="card-stats">`
      + `<div><dt>POP</dt><dd>${d.pop == null ? '–' : Math.round(d.pop) + '%'}</dd></div>`
      + `<div><dt>Precip (mm)</dt><dd>${d.precip == null ? '–' : d.precip.toFixed(1)}</dd></div>`
      + `<div><dt>Wind (km/h)</dt><dd>${fmtKmh(d.wind)}</dd></div>`
      + `<div><dt>Gust (km/h)</dt><dd>${fmtKmh(d.gust)}</dd></div>`
      + `</dl>`
      + detailsHtml
      + `</article>`;
  }).join('');
  return `<div class="cards">${cards}</div>`;
}

function updateMarkup(element, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const patch = (target, source) => {
    for (let i = 0; i < source.childNodes.length; i++) {
      const next = source.childNodes[i];
      const old = target.childNodes[i];
      if (!old) { target.appendChild(next.cloneNode(true)); continue; }
      if (old.nodeType !== next.nodeType || old.nodeName !== next.nodeName) {
        old.replaceWith(next.cloneNode(true));
      } else if (next.nodeType === Node.TEXT_NODE) {
        if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
      } else if (next.nodeType === Node.ELEMENT_NODE) {
        for (const attr of [...old.attributes]) {
          if (attr.name === 'open' && old.tagName === 'DETAILS') continue;
          if (!next.hasAttribute(attr.name)) old.removeAttribute(attr.name);
        }
        for (const attr of [...next.attributes]) {
          if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
        }
        patch(old, next);
      }
    }
    while (target.childNodes.length > source.childNodes.length) target.lastChild.remove();
  };
  patch(element, template.content);
}

function renderHourly(hours, loc, readiness) {
  updateMarkup(document.getElementById('tab-hourly'), hourlyList(hours, loc, readiness));
}

function renderWeek(view, readiness) {
  updateMarkup(document.getElementById('tab-week'), weekCards(view.days, view.periods, readiness)
    + `<p class="note">POP = sampled max. Precip totals are estimated between model times; today covers the remaining hours.</p>`);
}

export function renderForecast(hours, loc, now = new Date(), readiness = null) {
  const view = forecastView(hours, null, loc.tz, now);
  renderHourly(view.hours, loc, readiness);
  renderWeek(view, readiness);
}

const RADAR_LAYER = 'RADAR_1KM_RRAI';
// EC rejects multi-layer requests; dBZ nowcast covers rain and snow, so future
// frames come from the extrapolation layer and past frames from the composite
const RADAR_FORECAST_LAYER = 'Radar_1km_dBZ-Extrapolation';
let radarMap = null;
let radarOverlay = null;
let radarMarker = null;
let radarFrames = [];
let radarBounds = null;
let radarIndex = 0;
let radarTimer = null;
let radarSeq = 0;
let radarMoveTimer = null;

function radarFrameUrl(time, bounds, layer = RADAR_LAYER) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
    LAYERS: layer, CRS: 'EPSG:4326',
    BBOX: `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`,
    WIDTH: '1024', HEIGHT: '1024', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    TIME: time.replace(/\.\d+Z$/, 'Z'), STYLES: ''
  });
  return `${WMS}?${p}`;
}

function radarVisible() {
  return !document.getElementById('tab-radar').hidden && !document.hidden;
}

let leafletPromise = null;
let radarController = null;
let radarLocation = null;
let radarLoadedAt = 0;
let radarPendingBounds = null;

function loadLeaflet() {
  if (typeof L !== 'undefined') return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    const timeout = setTimeout(() => finish(new Error('Radar library timed out')), 12000);
    let loaded = 0;
    const finish = error => {
      if (!error && ++loaded < 2) return;
      clearTimeout(timeout);
      css.onload = script.onload = css.onerror = script.onerror = null;
      if (error) { css.remove(); script.remove(); leafletPromise = null; reject(error); }
      else resolve();
    };
    css.onload = script.onload = () => finish();
    css.onerror = script.onerror = () => finish(new Error('Radar library unavailable'));
    document.head.append(css, script);
  });
  return leafletPromise;
}

export function initRadar(loc) {
  if (radarMap) return;
  radarMap = L.map('radarMap').setView([loc.lat, loc.lon], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap'
  }).addTo(radarMap);
  radarOverlay = L.imageOverlay('', radarMap.getBounds(), { opacity: 0.8, interactive: false }).addTo(radarMap);
  radarMarker = L.circleMarker([loc.lat, loc.lon], { radius: 5 }).addTo(radarMap);
  radarMap.on('moveend', onRadarMove);
  document.getElementById('playBtn').addEventListener('click', playRadar);
  document.getElementById('pauseBtn').addEventListener('click', pauseRadar);
  document.getElementById('speedInput').addEventListener('input', () => { if (radarTimer) { pauseRadar(); playRadar(); } });
  document.getElementById('frameSlider').addEventListener('input', e => { pauseRadar(); showFrame(Number(e.target.value)); });
}

function loadRadarFrame(frame, signal) {
  return new Promise(resolve => {
    const img = new Image();
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      img.onload = img.onerror = null;
      if (!value) img.src = '';
      resolve(value);
    };
    const abort = () => finish(null);
    const timeout = setTimeout(abort, 12000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    img.onload = () => finish(frame);
    img.onerror = abort;
    img.src = frame.url;
  });
}

export async function refreshRadar(loc, opts = {}) {
  if (!radarVisible()) return;
  radarController?.abort();
  const controller = radarController = new AbortController();
  const { signal } = controller;
  const mine = ++radarSeq;
  const mapEl = document.getElementById('radarMap');
  mapEl.classList.add('loading');
  pauseRadar();
  try {
    await loadLeaflet();
    if (signal.aborted || !radarVisible() || currentLocation !== loc) return;
    initRadar(loc);
    radarMap.invalidateSize();
    if (opts.recenter !== false) {
      radarMap.setView([loc.lat, loc.lon]);
      radarMarker.setLatLng([loc.lat, loc.lon]);
    }
    if (!radarMap.getSize().x || !radarMap.getSize().y) return;
    const bounds = radarMap.getBounds();
    radarPendingBounds = bounds;
    const frames = radarTimes(new Date(), 10, 9).map(time => ({
      time, url: radarFrameUrl(time, bounds, Date.parse(time) > Date.now() ? RADAR_FORECAST_LAYER : RADAR_LAYER)
    }));
    const loaded = await pool(frames, 4, frame => signal.aborted ? null : loadRadarFrame(frame, signal));
    if (signal.aborted || mine !== radarSeq || !radarVisible()) return;
    const kept = loaded.filter(Boolean);
    if (!kept.length) throw new Error('Radar images unavailable');
    radarFrames = kept;
    radarBounds = bounds;
    radarLocation = loc;
    radarLoadedAt = Date.now();
    document.getElementById('frameSlider').max = String(kept.length - 1);
    showFrame(Math.max(0, kept.findLastIndex(f => Date.parse(f.time) <= Date.now())));
    playRadar();
  } catch (err) {
    if (!signal.aborted && mine === radarSeq) document.getElementById('status').textContent = err.message;
  } finally {
    if (mine === radarSeq) {
      radarPendingBounds = null;
      mapEl.classList.remove('loading');
    }
  }
}

// ponytail: each pan loads 19 full-map images; use viewport-driven WMS tiles if radar traffic grows
function onRadarMove() {
  clearTimeout(radarMoveTimer);
  radarMoveTimer = setTimeout(() => {
    if (!currentLocation || !radarVisible()) return;
    const bounds = radarPendingBounds || radarBounds;
    if (bounds && radarMap.getBounds().equals(bounds)) return;
    refreshRadar(currentLocation, { recenter: false });
  }, 400);
}

function stopRadar() {
  pauseRadar();
  clearTimeout(radarMoveTimer);
  radarController?.abort();
  radarPendingBounds = null;
  document.getElementById('radarMap').classList.remove('loading');
}

function showFrame(i) {
  radarIndex = Math.max(0, Math.min(i, radarFrames.length - 1));
  const f = radarFrames[radarIndex];
  if (!f) return;
  radarOverlay.setBounds(radarBounds || radarMap.getBounds());
  radarOverlay.setUrl(f.url);
  document.getElementById('frameSlider').value = String(radarIndex);
  document.getElementById('radarTime').textContent = clockTime(f.time, currentLocation?.tz || 'UTC');
}

function playRadar() {
  if (!radarVisible() || radarTimer || radarFrames.length < 2) return;
  const el = document.getElementById('speedInput');
  radarTimer = setInterval(() => {
    if (radarIndex >= radarFrames.length - 1) radarIndex = -1;
    showFrame(radarIndex + 1);
  }, radarDelay(el.value, el.min, el.max));
}

function pauseRadar() {
  clearInterval(radarTimer);
  radarTimer = null;
}

window.addEventListener('radar-shown', () => {
  if (!currentLocation) return;
  radarMap?.invalidateSize();
  if (radarFrames.length && radarLocation === currentLocation && radarBounds?.equals(radarMap.getBounds()) && Date.now() - radarLoadedAt < REFRESH_MS) playRadar();
  else refreshRadar(currentLocation);
});
window.addEventListener('resize', () => { if (radarMap && radarVisible()) radarMap.invalidateSize(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopRadar();
  else if (radarVisible() && currentLocation) window.dispatchEvent(new Event('radar-shown'));
});
init();
