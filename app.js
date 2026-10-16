import { REFRESH_MS, forecastTimes, pool, aggregateWeek, groupByDay, dayHeading, radarTimes, radarDelay, clockTime, weekLabel, conditionWord, conditionEmoji, fmtTemp, fmtKmh, fmtHiLo, skeletonCards, skeletonRows } from './logic.js';

export function switchTab(name) {
  document.querySelectorAll('.tab').forEach(el => { el.hidden = true; });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  const section = document.getElementById('tab-' + name);
  if (section) section.hidden = false;
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
  status.textContent = '';
  const seq = ++refreshSeq;
  const key = loc.lat + ',' + loc.lon;
  let hours = loadCachedForecast();
  const empty = !hours || localStorage.getItem('sw:forecastKey') !== key;
  if (empty) showSkeleton();
  try {
    let offline = false;
    const radar = refreshRadar(loc);
    const paint = (hrs) => {
      if (seq !== refreshSeq) return;
      renderForecast(hrs, loc, { hourlyOnly: true });
    };
    try {
      if (!hours || forecastIsStale() || localStorage.getItem('sw:forecastKey') !== key) hours = await fetchForecast(loc, paint);
    } catch (e) {
      if (!hours) throw e;
      offline = true;
    }
    if (seq !== refreshSeq) return;
    renderForecast(hours, loc);
    await radar;
    if (seq !== refreshSeq) return;
    document.getElementById('lastUpdate').textContent = `Updated ${clockTime(new Date().toISOString(), loc.tz)} local${offline ? ' (offline)' : ''}`;
  } catch (err) {
    if (seq !== refreshSeq) return;
    status.textContent = 'Update failed: ' + err.message;
    if (empty) {
      document.getElementById('tab-hourly').innerHTML = '';
      document.getElementById('tab-week').innerHTML = '';
    }
    console.error(err);
  }
}

function init() {
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
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
  const restored = restoreLocation();
  if (restored) onLocationChange(restored);
  else document.getElementById('status').textContent = 'Search a city to begin.';
  switchTab('hourly');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    return currentLocation;
  } catch { return null; }
}

const WMS = 'https://geo.weather.gc.ca/geomet';
const LAYER_POP = 'GDPS-WEonG_15km_Precip-Prob';
const LAYER_PCP = 'GDPS_15km_Precip-Accum1h';
const LAYER_TEMP = 'GDPS_15km_AirTemp_2m';
const LAYER_WIND = 'GDPS_15km_WindSpeed_10m';
const LAYER_GUST = 'GDPS_15km_WindGust_10m';
const LAYER_CLOUD = 'GDPS_15km_TotalCloudCover';
const LAYER_TSTORM = 'GDPS-WEonG_15km_Thunderstorm-Prob';
const FORECAST_VER = '3';

async function pointValue(layer, lat, lon, time) {
  const d = 0.2;
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
    LAYERS: layer, QUERY_LAYERS: layer, CRS: 'EPSG:4326',
    BBOX: `${lat - d},${lon - d},${lat + d},${lon + d}`,
    WIDTH: '101', HEIGHT: '101', I: '50', J: '50',
    INFO_FORMAT: 'application/json', TIME: time.replace(/\.\d+Z$/, 'Z'), STYLES: ''
  });
  const res = await fetch(`${WMS}?${p}`);
  if (!res.ok) throw new Error('WMS ' + res.status);
  const json = await res.json();
  const f = json.features && json.features[0];
  return f && typeof f.properties.value === 'number' ? f.properties.value : null;
}

export async function fetchForecast(loc, onProgress) {
  const times = forecastTimes(new Date());
  const hours = new Array(times.length);
  let anyData = false;
  await pool(times, 4, async (time, i) => {
    const [pop, precip, temp, wind, gust, cloud, tstorm] = await Promise.all([
      pointValue(LAYER_POP, loc.lat, loc.lon, time),
      pointValue(LAYER_PCP, loc.lat, loc.lon, time),
      pointValue(LAYER_TEMP, loc.lat, loc.lon, time),
      pointValue(LAYER_WIND, loc.lat, loc.lon, time),
      pointValue(LAYER_GUST, loc.lat, loc.lon, time),
      pointValue(LAYER_CLOUD, loc.lat, loc.lon, time),
      pointValue(LAYER_TSTORM, loc.lat, loc.lon, time)
    ].map(p => p.catch(() => null)));
    if (pop != null || precip != null || temp != null || wind != null
        || gust != null || cloud != null || tstorm != null) anyData = true;
    hours[i] = { time, pop: pop ?? 0, precip: precip ?? 0, temp, wind, gust, cloud, tstorm };
    if (onProgress) onProgress(hours.filter(Boolean));
  });
  if (!anyData) throw new Error('Forecast data unavailable');
  writeForecast(hours, loc);
  return hours;
}

function writeForecast(hours, loc) {
  localStorage.setItem('sw:forecast', JSON.stringify(hours));
  localStorage.setItem('sw:forecastTs', String(Date.now()));
  localStorage.setItem('sw:forecastKey', loc.lat + ',' + loc.lon);
  localStorage.setItem('sw:forecastVer', FORECAST_VER);
}

export function forecastIsStale() {
  const ts = Number(localStorage.getItem('sw:forecastTs') || 0);
  return Date.now() - ts > REFRESH_MS;
}

function loadCachedForecast() {
  if (localStorage.getItem('sw:forecastVer') !== FORECAST_VER) return null;
  try { return JSON.parse(localStorage.getItem('sw:forecast') || 'null'); }
  catch { return null; }
}

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

function showSkeleton() {
  document.getElementById('tab-hourly').innerHTML = skeletonRows(8);
  document.getElementById('tab-week').innerHTML = skeletonCards(7);
}

export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyList(hours, loc);
  if (opts.hourlyOnly) return;
  document.getElementById('tab-week').innerHTML = weekCards(hours, loc.tz) + '<p class="note">POP = daily max, precip = daily total.</p>';
}

const RADAR_LAYER = 'RADAR_1KM_RRAI';
let radarMap = null;
let radarOverlay = null;
let radarMarker = null;
let radarFrames = [];
let radarBounds = null;
let radarIndex = 0;
let radarTimer = null;
let radarSeq = 0;
let radarMoveTimer = null;

function radarFrameUrl(time, bounds) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
    LAYERS: RADAR_LAYER, CRS: 'EPSG:4326',
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
  const times = radarTimes(new Date());
  const frames = await pool(times, 6, async (time) => {
    const url = radarFrameUrl(time, bounds);
    return { time, url };
  });
  if (seq !== refreshSeq || mine !== radarSeq) { mapEl.classList.remove('loading'); return; }
  await Promise.all(frames.map(f => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = f.url; })));
  if (seq !== refreshSeq || mine !== radarSeq) { mapEl.classList.remove('loading'); return; }
  radarFrames = frames;
  const slider = document.getElementById('frameSlider');
  slider.max = String(frames.length - 1);
  slider.value = '0';
  showFrame(frames.length - 1);
  mapEl.classList.remove('loading');
  playRadar();
}

// ponytail: refetches all ~30 full-map frames per pan (heavy on the live WMS); move to a viewport-driven L.tileLayer.wms if that bites
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
