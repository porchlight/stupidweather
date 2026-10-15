import { REFRESH_MS, forecastTimes, pool, aggregateToday, aggregateWeek, dateKey, radarTimes, clockTime, dayLabel, weekLabel, conditionWord, fmtTemp, fmtKmh, fmtHiLo } from './logic.js';

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
  try {
    const key = loc.lat + ',' + loc.lon;
    let hours = loadCachedForecast();
    let offline = false;
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
    await refreshRadar(loc);
    if (seq !== refreshSeq) return;
    document.getElementById('lastUpdate').textContent = `Updated ${clockTime(new Date().toISOString(), loc.tz)} local${offline ? ' (offline)' : ''}`;
  } catch (err) {
    if (seq !== refreshSeq) return;
    status.textContent = 'Update failed: ' + err.message;
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
  await pool(times, 5, async (time, i) => {
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

function hourlyTable(hours, tz) {
  const rows = hours.slice(0, 12).map(h => {
    return `<tr><td>${dayLabel(h.time, tz)}, ${clockTime(h.time, tz, false)}</td>`
      + `<td>${Math.round(h.pop)}%</td><td>${h.precip.toFixed(1)}</td>`
      + `<td>${fmtTemp(h.temp)}</td><td>${conditionWord(h.cloud, h.tstorm)}</td>`
      + `<td>${fmtKmh(h.wind)}</td><td>${fmtKmh(h.gust)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Time</th><th>POP</th><th>Precip (mm)</th><th>Temp</th><th>Condition</th><th>Wind (km/h)</th><th>Gust (km/h)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function todayTable(hours, tz) {
  const today = dateKey(new Date().toISOString(), tz);
  const todays = hours.filter(h => dateKey(h.time, tz) === today);
  const per = aggregateToday(todays, tz);
  const row = (label, v) => `<tr><td>${label}</td><td>${Math.round(v.pop)}%</td><td>${v.precip.toFixed(1)}</td>`
    + `<td>${fmtHiLo(v.hi, v.lo)}</td><td>${v.cond ?? '–'}</td>`
    + `<td>${fmtKmh(v.wind)}</td><td>${fmtKmh(v.gust)}</td></tr>`;
  return `<table><thead><tr><th>Period</th><th>POP</th><th>Precip (mm)</th><th>Temp</th><th>Condition</th><th>Wind (km/h)</th><th>Gust (km/h)</th></tr></thead><tbody>`
    + row('Morning', per.morning)
    + row('Afternoon', per.afternoon)
    + row('Night', per.night)
    + `</tbody></table>`;
}

function weekTable(hours, tz) {
  const days = aggregateWeek(hours, tz);
  const rows = days.map(d => {
    return `<tr><td>${weekLabel(d.date)}</td><td>${Math.round(d.pop)}%</td><td>${d.precip.toFixed(1)}</td>`
      + `<td>${fmtHiLo(d.hi, d.lo)}</td><td>${d.cond ?? '–'}</td>`
      + `<td>${fmtKmh(d.wind)}</td><td>${fmtKmh(d.gust)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Day</th><th>POP</th><th>Precip (mm)</th><th>Temp</th><th>Condition</th><th>Wind (km/h)</th><th>Gust (km/h)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderForecast(hours, loc, opts = {}) {
  document.getElementById('tab-hourly').innerHTML = hourlyTable(hours, loc.tz);
  if (opts.hourlyOnly) return;
  document.getElementById('tab-today').innerHTML = todayTable(hours, loc.tz) + '<p>POP = period max, precip = period total.</p>';
  document.getElementById('tab-week').innerHTML = weekTable(hours, loc.tz) + '<p>POP = daily max, precip = daily total.</p>';
}

const RADAR_LAYER = 'RADAR_1KM_RRAI';
let radarMap = null;
let radarOverlay = null;
let radarFrames = [];
let radarBounds = null;
let radarIndex = 0;
let radarTimer = null;

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
  L.circleMarker([loc.lat, loc.lon], { radius: 5 }).addTo(radarMap);
  document.getElementById('playBtn').addEventListener('click', playRadar);
  document.getElementById('pauseBtn').addEventListener('click', pauseRadar);
  document.getElementById('speedInput').addEventListener('input', () => { if (radarTimer) { pauseRadar(); playRadar(); } });
  document.getElementById('frameSlider').addEventListener('input', e => { pauseRadar(); showFrame(Number(e.target.value)); });
}

export async function refreshRadar(loc) {
  if (typeof L === 'undefined') return;
  initRadar(loc);
  radarMap.setView([loc.lat, loc.lon]);
  if (radarMap.getSize().x === 0) { radarFrames = []; return; }
  const bounds = radarMap.getBounds();
  radarBounds = bounds;
  const times = radarTimes(new Date());
  radarFrames = await pool(times, 6, async (time) => {
    const url = radarFrameUrl(time, bounds);
    return { time, url };
  });
  await Promise.all(radarFrames.map(f => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = f.url; })));
  const slider = document.getElementById('frameSlider');
  slider.max = String(radarFrames.length - 1);
  slider.value = '0';
  showFrame(radarFrames.length - 1);
  playRadar();
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
  const speed = Number(document.getElementById('speedInput').value);
  radarTimer = setInterval(() => {
    if (radarIndex >= radarFrames.length - 1) radarIndex = -1;
    showFrame(radarIndex + 1);
  }, speed);
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
