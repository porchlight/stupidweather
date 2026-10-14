import { REFRESH_MS, forecastTimes, pool, aggregateToday, aggregateWeek, tzParts, weekdayName } from './logic.js';

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
let onLocationChange = () => {};

function init() {
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('locationForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('locationInput').value.trim();
    if (q) setLocation(q);
  });
  const restored = restoreLocation();
  if (restored) onLocationChange(restored);
  switchTab('hourly');
}
init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

async function geocode(query) {
  const search = new URLSearchParams({ format: 'json', limit: '1', q: query });
  const sres = await fetch('https://nominatim.openstreetmap.org/search?' + search, {
    headers: { 'Accept': 'application/json' }
  });
  if (!sres.ok) throw new Error('Geocoding failed');
  const sjson = await sres.json();
  if (!sjson.length) throw new Error('Location not found');
  const { lat, lon, display_name } = sjson[0];
  const tres = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`);
  const tjson = await tres.json();
  return { name: display_name, lat: Number(lat), lon: Number(lon), tz: tjson.timeZone };
}

async function setLocation(query) {
  const status = document.getElementById('status');
  status.textContent = 'Searching…';
  try {
    currentLocation = await geocode(query);
    localStorage.setItem('sw:location', JSON.stringify(currentLocation));
    document.getElementById('locationName').textContent = currentLocation.name;
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

export async function fetchForecast(loc) {
  const times = forecastTimes(new Date());
  const hours = await pool(times, 6, async (time) => {
    const [pop, precip] = await Promise.all([
      pointValue(LAYER_POP, loc.lat, loc.lon, time).catch(() => null),
      pointValue(LAYER_PCP, loc.lat, loc.lon, time).catch(() => null)
    ]);
    return { time, pop: pop ?? 0, precip: precip ?? 0 };
  });
  localStorage.setItem('sw:forecast', JSON.stringify(hours));
  localStorage.setItem('sw:forecastTs', String(Date.now()));
  return hours;
}

export function forecastIsStale() {
  const ts = Number(localStorage.getItem('sw:forecastTs') || 0);
  return Date.now() - ts > REFRESH_MS;
}

function loadCachedForecast() {
  try { return JSON.parse(localStorage.getItem('sw:forecast') || 'null'); }
  catch { return null; }
}

function hourlyTable(hours, tz) {
  const rows = hours.slice(0, 48).map(h => {
    const p = tzParts(h.time, tz);
    return `<tr><td>${p.day}/${p.month} ${p.hour}:00</td><td>${Math.round(h.pop)}%</td><td>${h.precip.toFixed(1)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Time</th><th>POP</th><th>Precip (mm)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function todayTable(hours, tz) {
  const per = aggregateToday(hours, tz);
  const row = (label, v) => `<tr><td>${label}</td><td>${Math.round(v.pop)}%</td><td>${v.precip.toFixed(1)}</td></tr>`;
  return `<table><thead><tr><th>Period</th><th>POP</th><th>Precip (mm)</th></tr></thead><tbody>`
    + row('Morning (6–12)', per.morning)
    + row('Afternoon (12–18)', per.afternoon)
    + row('Night (18–6)', per.night)
    + `</tbody></table>`;
}

function weekTable(hours, tz) {
  const days = aggregateWeek(hours, tz);
  const rows = days.map(d => {
    const iso = d.date + 'T12:00:00Z';
    return `<tr><td>${d.date} ${weekdayName(iso, tz)}</td><td>${Math.round(d.pop)}%</td><td>${d.precip.toFixed(1)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Day</th><th>POP</th><th>Precip (mm)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderForecast(hours, loc) {
  document.getElementById('tab-hourly').innerHTML = hourlyTable(hours, loc.tz);
  document.getElementById('tab-today').innerHTML = todayTable(hours, loc.tz) + '<p>POP = period max, precip = period total.</p>';
  document.getElementById('tab-week').innerHTML = weekTable(hours, loc.tz) + '<p>POP = daily max, precip = daily total.</p>';
}
