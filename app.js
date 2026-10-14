import { REFRESH_MS } from './logic.js';

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
