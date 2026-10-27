import { REFRESH_MS, openMeteoToForecast, forecastDayProgress, pool, aggregateWeek, aggregatePeriods, groupByDay, dayHeading, radarTimes, radarDelay, clockTime, weekLabel, conditionWord, conditionEmoji, isNight, windChill, layerIcon, fmtTemp, fmtKmh, fmtHiLo, skeletonCards, skeletonRows } from './logic.js';

let activeTab = 'hourly';
let paintLoadingView = null;

export function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(el => { el.hidden = true; });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  const section = document.getElementById('tab-' + name);
  if (section) section.hidden = false;
  paintLoadingView?.();
  window.scrollTo(0, 0);
  if (name === 'radar') window.dispatchEvent(new Event('radar-shown'));
}

let currentLocation = null;

let refreshTimer = null;

let refreshSeq = 0;

let onLocationChange = async (loc) => {
  clearInterval(refreshTimer);
  refreshTimer = null;
  await refreshAll(loc);
  if (currentLocation !== loc) return;
  refreshTimer = setInterval(() => refreshAll(loc), REFRESH_MS);
};

export async function refreshAll(loc) {
  const status = document.getElementById('status');
  if (!loc) { status.textContent = 'Search a city to begin.'; return; }
  const seq = ++refreshSeq;
  paintLoadingView = null;
  const key = loc.lat + ',' + loc.lon;
  let cached = loadCachedForecast(key);
  let hours = cached ? cached.hours : null;
  const stale = !cached || Date.now() - cached.ts > REFRESH_MS;
  if (stale) {
    showSkeleton();
    status.textContent = 'Loading…';
  }
  let paintTimer = null;
  try {
    let offline = false;
    if (stale) {
      let lastPaint = 0;
      let progress = [];
      let times = [];
      const paint = () => {
        if (seq !== refreshSeq) return;
        clearTimeout(paintTimer);
        paintTimer = null;
        lastPaint = Date.now();
        if (activeTab === 'hourly' && progress.length) renderHourly(progress, loc);
        if (activeTab === 'week') renderWeekProgress(progress, times, loc);
      };
      paintLoadingView = paint;
      const res = await fetchForecast(loc, (loaded, scheduled) => {
        if (seq !== refreshSeq) return;
        progress = loaded;
        times = scheduled;
        if (paintTimer === null) {
          paintTimer = setTimeout(paint, Math.max(0, 400 - (Date.now() - lastPaint)));
        }
      }).then(h => ({ hours: h }), e => ({ err: e }));
      if (seq !== refreshSeq) return;
      clearTimeout(paintTimer);
      paintTimer = null;
      paintLoadingView = null;
      if (res.err) {
        if (!hours) throw res.err;
        offline = true;
      } else {
        hours = res.hours;
        cached = loadCachedForecast(key);
      }
    }
    status.textContent = '';
    if (stale && !offline) {
      renderHourly(hours, loc);
      renderWeekProgress(hours, hours.map(h => h.time), loc);
      document.getElementById('tab-week').insertAdjacentHTML('beforeend', '<p class="note">POP = daily max, precip = daily total.</p>');
    } else {
      renderForecast(hours, loc);
    }
    document.getElementById('lastUpdate').textContent = `Updated ${clockTime(new Date(cached.ts).toISOString(), loc.tz)} local${offline ? ' (offline)' : ''}`;
    await refreshRadar(loc);
  } catch (err) {
    if (seq !== refreshSeq) return;
    paintLoadingView = null;
    status.textContent = 'Update failed: ' + err.message;
    if (!hours) {
      document.getElementById('tab-hourly').innerHTML = '';
      document.getElementById('tab-week').innerHTML = '';
    }
    console.error(err);
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
      renderResults(await searchPlaces(q));
      status.textContent = '';
    } catch (err) {
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
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.update().catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }).catch(() => {});
}

export async function searchPlaces(query) {
  const search = new URLSearchParams({ format: 'json', limit: '5', q: query });
  const res = await fetch('https://nominatim.openstreetmap.org/search?' + search, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Geocoding failed');
  const json = await res.json();
  if (!json.length) throw new Error('Location not found');
  return json.map(r => ({ lat: Number(r.lat), lon: Number(r.lon), name: r.display_name }));
}

export async function selectPlace(place) {
  const tres = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${place.lat}&longitude=${place.lon}`);
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
  const status = document.getElementById('status');
  status.textContent = 'Loading…';
  try {
    currentLocation = await selectPlace(place);
    document.body.classList.remove('landing');
    setLocationActive(true);
    localStorage.setItem('sw:location', JSON.stringify(currentLocation));
    document.getElementById('locationName').textContent = currentLocation.name;
    const box = document.getElementById('results');
    box.innerHTML = '';
    box.hidden = true;
    document.getElementById('locationInput').value = '';
    status.textContent = '';
    await onLocationChange(currentLocation);
  } catch (err) {
    status.textContent = err.message;
    console.error(err);
  }
}

function restoreLocation() {
  const saved = localStorage.getItem('sw:location');
  if (!saved) return null;
  try {
    currentLocation = JSON.parse(saved);
    document.getElementById('locationName').textContent = currentLocation.name;
    setLocationActive(true);
    return currentLocation;
  } catch { return null; }
}

const WMS = 'https://geo.weather.gc.ca/geomet';
const FORECAST_VER = '5';

export async function fetchForecast(loc, onProgress) {
  const p = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon,
    hourly: 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,cloud_cover,weather_code',
    forecast_hours: '168', timezone: 'GMT', timeformat: 'unixtime',
    temperature_unit: 'celsius', wind_speed_unit: 'ms', precipitation_unit: 'mm'
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!res.ok) throw new Error('Open-Meteo ' + res.status);
  const hours = openMeteoToForecast(await res.json());
  if (onProgress) onProgress(hours, hours.map(h => h.time));
  writeForecast(hours, loc);
  return hours;
}

function writeForecast(hours, loc) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem('sw:forecasts') || '{}'); } catch {}
  if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) all = {};
  all[loc.lat + ',' + loc.lon] = { ts: Date.now(), hours };
  const keys = Object.keys(all);
  if (keys.length > 5) {
    keys.sort((a, b) => all[a].ts - all[b].ts);
    for (const k of keys.slice(0, keys.length - 5)) delete all[k];
  }
  localStorage.setItem('sw:forecastVer', FORECAST_VER);
  localStorage.setItem('sw:forecasts', JSON.stringify(all));
}

function loadCachedForecast(key) {
  if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) return null;
  try {
    const entry = JSON.parse(localStorage.getItem('sw:forecasts') || '{}')[key];
    return entry && entry.hours ? entry : null;
  } catch { return null; }
}

function layersHtml(temp) {
  const icon = layerIcon(temp);
  return icon ? `<span class="layers">${icon}</span>` : '';
}

function hourlyList(hours, loc) {
  const groups = groupByDay(hours.slice(0, 12), loc.tz);
  const now = new Date();
  const blocks = groups.map(g => {
    const head = `<h3 class="hour-head">${dayHeading(g.date, now, loc.tz)}</h3>`;
    const rows = g.hours.map(h => {
      const night = isNight(h.time, loc.tz);
      const base = h.cond ?? conditionWord(h.cloud, h.tstorm, h.temp, h.precip, h.wind, night);
      const cond = base === 'Sunny' && night ? 'Clear' : base;
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

function weekCard(d, periods) {
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
        + `<span>POP ${Math.round(p.pop)}%</span>`
        + `<span>${p.precip.toFixed(1)} mm</span>`
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
}

function weekCards(days, periods) {
  return `<div class="cards">${days.map(d => weekCard(d, periods)).join('')}</div>`;
}

function showSkeleton() {
  document.getElementById('tab-hourly').innerHTML = skeletonRows(12);
  document.getElementById('tab-week').innerHTML = skeletonCards(8);
}

function renderHourly(hours, loc) {
  document.getElementById('tab-hourly').innerHTML = hourlyList(hours, loc);
}

function renderWeekProgress(hours, times, loc) {
  const groups = forecastDayProgress(hours, times, loc.tz);
  const section = document.getElementById('tab-week');
  if (section.querySelector('.cards')?.children.length !== groups.length) {
    section.innerHTML = skeletonCards(groups.length);
  }
  const cards = section.querySelector('.cards');
  groups.forEach((g, i) => {
    if (!g.hours || !cards.children[i].classList.contains('skeleton')) return;
    const day = aggregateWeek(g.hours, loc.tz);
    const periods = aggregatePeriods(g.hours, loc.tz);
    cards.children[i].outerHTML = weekCard(day[0], periods);
  });
}

export function renderForecast(hours, loc) {
  renderHourly(hours, loc);
  const days = aggregateWeek(hours, loc.tz);
  const periods = aggregatePeriods(hours, loc.tz);
  document.getElementById('tab-week').innerHTML = weekCards(days, periods) + '<p class="note">POP = daily max, precip = daily total.</p>';
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

export async function refreshRadar(loc, opts = {}) {
  if (typeof L === 'undefined') return;
  const seq = refreshSeq;
  const mine = ++radarSeq;
  initRadar(loc);
  if (opts.recenter !== false) {
    radarMap.setView([loc.lat, loc.lon]);
    if (radarMarker) radarMarker.setLatLng([loc.lat, loc.lon]);
  }
  if (radarMap.getSize().x === 0) { radarFrames = []; return; }
  const bounds = radarMap.getBounds();
  radarBounds = bounds;
  const mapEl = document.getElementById('radarMap');
  mapEl.classList.add('loading');
  const times = radarTimes(new Date(), 10, 9);
  const frames = await pool(times, 6, async (time) => {
    const future = Date.parse(time) > Date.now();
    const url = radarFrameUrl(time, bounds, future ? RADAR_FORECAST_LAYER : RADAR_LAYER);
    return { time, url };
  });
  if (seq !== refreshSeq || mine !== radarSeq) { mapEl.classList.remove('loading'); return; }
  const loaded = await Promise.all(frames.map(f => new Promise(r => {
    const i = new Image();
    i.onload = () => r(f);
    i.onerror = () => r(null);
    i.src = f.url;
  })));
  if (seq !== refreshSeq || mine !== radarSeq) { mapEl.classList.remove('loading'); return; }
  const kept = loaded.filter(Boolean);
  radarFrames = kept.length ? kept : frames;
  const slider = document.getElementById('frameSlider');
  slider.max = String(radarFrames.length - 1);
  slider.value = '0';
  showFrame(radarFrames.length - 1);
  mapEl.classList.remove('loading');
  playRadar();
}

// ponytail: refetches all ~39 full-map frames per pan (heavy on the live WMS); move to a viewport-driven L.tileLayer.wms if that bites
function onRadarMove() {
  clearTimeout(radarMoveTimer);
  radarMoveTimer = setTimeout(() => {
    if (!currentLocation) return;
    if (radarBounds && radarMap.getBounds().equals(radarBounds)) return;
    refreshRadar(currentLocation, { recenter: false });
  }, 400);
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
  if (radarTimer || radarFrames.length < 2) return;
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
  if (!radarMap) return;
  setTimeout(() => {
    radarMap.invalidateSize();
    if (!radarFrames.length && currentLocation) refreshRadar(currentLocation);
  }, 0);
});
window.addEventListener('resize', () => { if (radarMap) radarMap.invalidateSize(); });
init();
