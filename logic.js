export const REFRESH_MS = 12 * 60 * 1000;

export function tzParts(iso, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const out = {};
  for (const { type, value } of fmt.formatToParts(new Date(iso))) out[type] = value;
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

export function dateKey(iso, tz) {
  const p = tzParts(iso, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function clockTime(iso, tz, withMinutes = true) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(iso))) p[type] = value;
  return `${withMinutes ? `${p.hour}:${p.minute}` : p.hour} ${p.dayPeriod}`;
}

export function dayLabel(iso, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(iso));
}

// key is a local 'YYYY-MM-DD' date key; formatting it in UTC keeps the calendar
// date exact for any timezone (the old noon-UTC proxy put UTC+13 a day ahead)
export function weekLabel(key) {
  const d = new Date(`${key}T00:00:00Z`);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d);
  const weekday = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'long' }).format(d);
  return `${date} ${weekday}`;
}

export function forecastTimes(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const out = [];
  for (let i = 0; i < 12; i++) out.push(new Date(start.getTime() + i * 3600e3).toISOString());
  const H6 = 6 * 3600e3;
  const end = start.getTime() + 7 * 24 * 3600e3;
  let t = Math.ceil((start.getTime() + 12 * 3600e3) / H6) * H6;
  while (t < end) { out.push(new Date(t).toISOString()); t += H6; }
  return out;
}

const SEVERITY = ['Sunny', 'Partly cloudy', 'Cloudy', 'Flurries', 'Thunderstorm', 'Blizzard'];

// ponytail: fixed 7-19 local window; NOAA sunrise/sunset math if polar/edge latitudes matter
export function isNight(iso, tz) {
  const h = Number(tzParts(iso, tz).hour);
  return h < 7 || h >= 19;
}

const SNOW_TEMP = 0;        // °C at/below which precipitation falls as snow
const BLIZZARD_PRECIP = 1;  // mm/h water equivalent
const BLIZZARD_WIND = 11;   // m/s ≈ 40 km/h

export function conditionWord(cloud, tstorm, temp, precip, wind, night = false) {
  let word = '–';
  if (temp != null && temp <= SNOW_TEMP && precip > 0) {
    if (precip >= BLIZZARD_PRECIP && wind != null && wind >= BLIZZARD_WIND) word = 'Blizzard';
    else word = 'Flurries';
  } else if (tstorm != null && tstorm >= 30) word = 'Thunderstorm';
  else if (cloud == null) word = '–';
  else if (cloud < 25) word = 'Sunny';
  else if (cloud < 70) word = 'Partly cloudy';
  else word = 'Cloudy';
  if (!night) return word;
  if (word === 'Sunny') return 'Clear';
  if (word === 'Partly cloudy') return 'Cloudy';
  return word;
}

const CONDITION_EMOJI = {
  'Sunny': '☀️',
  'Clear': '🌙',
  'Partly cloudy': '⛅',
  'Cloudy': '☁️',
  'Thunderstorm': '⛈️',
  'Flurries': '🌨️',
  'Blizzard': '❄️'
};

export function conditionEmoji(cond) {
  return CONDITION_EMOJI[cond] || '';
}

export function fmtTemp(t) { return t == null ? '–' : `${Math.round(t)}°`; }

export function fmtKmh(ms) { return ms == null ? '–' : `${Math.round(ms * 3.6)}`; }

export function fmtHiLo(hi, lo) {
  if (hi == null || lo == null) return '–';
  return `${Math.round(hi)}°/${Math.round(lo)}°`;
}

// 2001 JAG/TI wind chill (EC/NWS): defined for T <= 10°C and wind > 4.8 km/h, null otherwise
export function windChill(temp, windMs) {
  if (temp == null || windMs == null || temp > 10) return null;
  const v = windMs * 3.6;
  if (v <= 4.8) return null;
  const v016 = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * temp - 11.37 * v016 + 0.3965 * temp * v016;
}

function worse(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a;
}

function emptyStat() {
  return { pop: 0, precip: 0, hi: null, lo: null, wind: null, gust: null, cond: null, feels: null };
}

function addHour(stat, h) {
  stat.pop = Math.max(stat.pop, h.pop ?? 0);
  stat.precip += h.precip ?? 0;
  if (h.temp != null) {
    stat.hi = stat.hi == null ? h.temp : Math.max(stat.hi, h.temp);
    stat.lo = stat.lo == null ? h.temp : Math.min(stat.lo, h.temp);
  }
  if (h.wind != null) stat.wind = stat.wind == null ? h.wind : Math.max(stat.wind, h.wind);
  if (h.gust != null) stat.gust = stat.gust == null ? h.gust : Math.max(stat.gust, h.gust);
  const wc = windChill(h.temp, h.wind);
  if (wc != null && (stat.feels == null || wc < stat.feels)) stat.feels = wc;
  const c = conditionWord(h.cloud, h.tstorm, h.temp, h.precip, h.wind);
  if (c !== '–') stat.cond = worse(stat.cond, c);
}

export function aggregateWeek(hours, tz) {
  const map = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!map.has(key)) map.set(key, { ...emptyStat(), date: key });
    addHour(map.get(key), h);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function groupByDay(hours, tz) {
  const map = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!map.has(key)) map.set(key, { date: key, hours: [] });
    map.get(key).hours.push(h);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

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

export function radarTimes(now = new Date(), count = 30) {
  const step = 6 * 60 * 1000;
  const end = Math.floor(now.getTime() / step) * step;
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(new Date(end - i * step).toISOString());
  return out;
}

// speedInput is labelled "Speed": higher slider = faster, so map it to an inverse frame delay (ms)
export function radarDelay(value, min, max) {
  return Number(max) + Number(min) - Number(value);
}

export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export function skeletonCards(n) {
  const card = '<article class="card skeleton" aria-hidden="true">'
    + '<span class="sk sk-time"></span>'
    + '<span class="sk sk-emoji"></span>'
    + '<span class="sk sk-temp"></span>'
    + '<span class="sk sk-cond"></span>'
    + '<dl class="card-stats">'
    + '<div><span class="sk sk-line"></span></div>'.repeat(4)
    + '</dl></article>';
  return `<div class="cards">${card.repeat(n)}</div>`;
}

export function skeletonRows(n) {
  const row = '<article class="hour-row skeleton" aria-hidden="true">'
    + '<div class="hour-main"><span class="sk sk-time"></span></div>'
    + '<div class="hour-stats"><span class="sk sk-line"></span></div>'
    + '</article>';
  return `<div class="hourly">${row.repeat(n)}</div>`;
}
