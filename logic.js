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

const SEVERITY = ['Clear', 'Sunny', 'Partly cloudy', 'Cloudy', 'Fog', 'Drizzle', 'Rain', 'Freezing rain', 'Flurries', 'Thunderstorm', 'Blizzard'];

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

export function weatherCodeWord(code) {
  if (code === 0 || code === 1) return 'Sunny';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57, 66, 67].includes(code)) return 'Freezing rain';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Flurries';
  if ([95, 96, 97, 99].includes(code)) return 'Thunderstorm';
  return null;
}

export function openMeteoToForecast(data) {
  const h = data?.hourly;
  const fields = ['temperature_2m', 'precipitation_probability', 'precipitation',
    'wind_speed_10m', 'wind_gusts_10m', 'cloud_cover', 'weather_code'];
  if (!Array.isArray(h?.time) || !h.time.length
      || !h.time.every(t => Number.isFinite(t) && Math.abs(t) < 8.64e12)
      || !fields.every(f => Array.isArray(h[f]) && h[f].length === h.time.length
        && h[f].every(v => v === null || Number.isFinite(v)))
      || !h.temperature_2m.some(Number.isFinite)) {
    throw new Error('Forecast data unavailable');
  }
  return h.time.map((t, i) => ({
    time: new Date(t * 1000).toISOString(),
    pop: h.precipitation_probability[i],
    precip: h.precipitation[i],
    temp: h.temperature_2m[i],
    wind: h.wind_speed_10m[i],
    gust: h.wind_gusts_10m[i],
    cloud: h.cloud_cover[i],
    tstorm: null,
    cond: weatherCodeWord(h.weather_code[i])
  }));
}

export function ecConditionWord(text) {
  const s = (text || '').toLowerCase();
  if (!s) return null;
  if (s.includes('thunder')) return 'Thunderstorm';
  if (s.includes('blizzard')) return 'Blizzard';
  if (s.includes('flurr') || s.includes('snow')) return 'Flurries';
  if (s.includes('sunny')) return 'Sunny';
  if (s.includes('clear')) return 'Clear';
  if (s.includes('few') || s.includes('partly')) return 'Partly cloudy';
  return 'Cloudy';
}

const CONDITION_EMOJI = {
  'Sunny': '☀️',
  'Clear': '🌙',
  'Partly cloudy': '⛅',
  'Cloudy': '☁️',
  'Fog': '🌫️',
  'Drizzle': '🌦️',
  'Rain': '🌧️',
  'Freezing rain': '🌧️',
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

export function layerIcon(temp) {
  if (temp == null) return '';
  if (temp > 20) return '👕';
  if (temp > 10) return '👕🧶';
  if (temp >= 0) return '👕🧶🧥';
  return '👕🧶🧥🥶';
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
    if (stat.hi == null || h.temp > stat.hi) {
      stat.hi = h.temp;
      stat.feels = windChill(h.temp, h.wind);
    }
    stat.lo = stat.lo == null ? h.temp : Math.min(stat.lo, h.temp);
  }
  if (h.wind != null) stat.wind = stat.wind == null ? h.wind : Math.max(stat.wind, h.wind);
  if (h.gust != null) stat.gust = stat.gust == null ? h.gust : Math.max(stat.gust, h.gust);
  const c = h.cond ?? conditionWord(h.cloud, h.tstorm, h.temp, h.precip, h.wind);
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

const PERIODS = [
  { key: 'overnight', label: 'Overnight', from: 0, to: 6 },
  { key: 'morning', label: 'Morning', from: 6, to: 12 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 18 },
  { key: 'evening', label: 'Evening', from: 18, to: 24 }
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

export function citypageToForecast(props, tz, now = new Date()) {
  const hours = (props.hourlyForecastGroup?.hourlyForecasts || []).map(h => ({
    time: h.timestamp,
    pop: h.lop?.value?.en ?? null,
    precip: null,
    temp: h.temperature?.value?.en ?? null,
    wind: h.wind?.speed?.value?.en != null ? h.wind.speed.value.en / 3.6 : null,
    gust: h.wind?.gust?.value?.en != null ? h.wind.gust.value.en / 3.6 : null,
    cloud: null,
    tstorm: null,
    cond: ecConditionWord(h.condition?.en)
  }));
  const days = citypageDays(props.forecastGroup?.forecasts || [], tz, now);
  for (const h of hours) {
    const d = days.find(x => x.date === dateKey(h.time, tz));
    if (d && h.pop != null) d.pop = Math.max(d.pop ?? 0, h.pop);
  }
  return { hours, days };
}

// ponytail: days pair positionally (day advances, night fills), not by weekday name;
// feels uses the day's max wind instead of the high-temp hour's wind — grid data
// replaces this within seconds, so the degree of precision isn't worth parsing
function citypageDays(periods, tz, now) {
  const out = new Map();
  let cur = dateKey(now.toISOString(), tz);
  const day = k => {
    if (!out.has(k)) out.set(k, { date: k, pop: null, precip: null, hi: null, lo: null, wind: null, gust: null, cond: null, feels: null });
    return out.get(k);
  };
  const nextKey = k => {
    const t = new Date(`${k}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  for (const p of periods) {
    const name = p.period?.textForecastName?.en || '';
    const night = /night/i.test(name);
    if (!night) {
      const d = day(cur);
      if (d.hi != null || d.lo != null) cur = nextKey(cur);
    }
    const d = day(cur);
    const temps = p.temperatures?.temperature || [];
    const hi = temps.find(t => t.class?.en === 'high')?.value?.en;
    const lo = temps.find(t => t.class?.en === 'low')?.value?.en;
    if (night) { if (lo != null) d.lo = lo; }
    else if (hi != null) d.hi = hi;
    for (const w of p.winds?.periods || []) {
      const sp = w.speed?.value?.en;
      const gu = w.gust?.value?.en;
      if (sp != null) d.wind = d.wind == null ? sp / 3.6 : Math.max(d.wind, sp / 3.6);
      if (gu != null) d.gust = d.gust == null ? gu / 3.6 : Math.max(d.gust, gu / 3.6);
    }
    const c = ecConditionWord(p.abbreviatedForecast?.textSummary?.en);
    if (c) d.cond = worse(d.cond, c);
  }
  for (const d of out.values()) d.feels = windChill(d.hi, d.wind);
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
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

export function forecastDayProgress(hours, times, tz) {
  const loaded = new Map(hours.map(h => [h.time, h]));
  return groupByDay(times.map(time => ({ time })), tz).map(g => ({
    date: g.date,
    hours: g.hours.every(h => loaded.has(h.time)) ? g.hours.map(h => loaded.get(h.time)) : null
  }));
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

export function radarTimes(now = new Date(), count = 30, future = 0) {
  const step = 6 * 60 * 1000;
  const end = Math.floor(now.getTime() / step) * step;
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(new Date(end - i * step).toISOString());
  for (let i = 1; i <= future; i++) out.push(new Date(end + i * step).toISOString());
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
    + '<span class="sk sk-layers"></span>'
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
