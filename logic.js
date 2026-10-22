export const REFRESH_MS = 12 * 60 * 1000;

const formatters = new Map();

function formatter(locale, options) {
  const key = JSON.stringify([locale, options]);
  if (!formatters.has(key)) {
    if (formatters.size >= 64) formatters.delete(formatters.keys().next().value);
    formatters.set(key, new Intl.DateTimeFormat(locale, options));
  }
  return formatters.get(key);
}

export function tzParts(iso, tz) {
  const fmt = formatter('en-CA', {
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
  const fmt = formatter('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(iso))) p[type] = value;
  return `${withMinutes ? `${p.hour}:${p.minute}` : p.hour} ${p.dayPeriod}`;
}

export function dayLabel(iso, tz) {
  return formatter('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(iso));
}

// key is a local 'YYYY-MM-DD' date key; formatting it in UTC keeps the calendar
// date exact for any timezone (the old noon-UTC proxy put UTC+13 a day ahead)
export function weekLabel(key) {
  const d = new Date(`${key}T00:00:00Z`);
  const date = formatter('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d);
  const weekday = formatter('en-CA', { timeZone: 'UTC', weekday: 'long' }).format(d);
  return `${date} ${weekday}`;
}

export function forecastTimes(now = new Date()) {
  const start = new Date(Math.ceil(now.getTime() / 3600e3) * 3600e3);
  const out = [];
  for (let i = 0; i < 12; i++) out.push(new Date(start.getTime() + i * 3600e3).toISOString());
  const H6 = 6 * 3600e3;
  const end = start.getTime() + 7 * 24 * 3600e3;
  let t = Math.ceil((start.getTime() + 12 * 3600e3) / H6) * H6;
  while (t <= Math.ceil(end / H6) * H6) { out.push(new Date(t).toISOString()); t += H6; }
  return out;
}

const SEVERITY = ['Clear', 'Sunny', 'Partly cloudy', 'Cloudy', 'Rain', 'Flurries', 'Thunderstorm', 'Blizzard'];

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
  else if (precip > 0) word = 'Rain';
  else if (cloud == null) word = '–';
  else if (cloud < 25) word = 'Sunny';
  else if (cloud < 70) word = 'Partly cloudy';
  else word = 'Cloudy';
  if (!night) return word;
  if (word === 'Sunny') return 'Clear';
  if (word === 'Partly cloudy') return 'Cloudy';
  return word;
}

export function ecConditionWord(text) {
  const s = (text || '').toLowerCase();
  if (!s) return null;
  if (s.includes('thunder')) return 'Thunderstorm';
  if (s.includes('blizzard')) return 'Blizzard';
  if (s.includes('flurr') || s.includes('snow')) return 'Flurries';
  if (/rain|shower|drizzle/.test(s)) return 'Rain';
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
  'Rain': '🌧️',
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
  return { pop: null, precip: null, hi: null, lo: null, wind: null, gust: null, cond: null, feels: null };
}

function addHour(stat, h) {
  if (h.pop != null) stat.pop = Math.max(stat.pop ?? 0, h.pop);
  if (h.precip != null) stat.precip = (stat.precip ?? 0) + h.precip;
  if (h.temp != null) {
    if (stat.hi == null || h.temp > stat.hi) {
      stat.hi = h.temp;
      stat.feels = windChill(h.temp, h.wind);
    }
    stat.lo = stat.lo == null ? h.temp : Math.min(stat.lo, h.temp);
  }
  if (h.wind != null) stat.wind = stat.wind == null ? h.wind : Math.max(stat.wind, h.wind);
  if (h.gust != null) stat.gust = stat.gust == null ? h.gust : Math.max(stat.gust, h.gust);
  const c = conditionWord(h.cloud, h.tstorm, h.temp, h.precipRate ?? h.precip, h.wind);
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
  const out = new Map();
  for (const h of hours) {
    const parts = tzParts(h.time, tz);
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    if (!out.has(key)) out.set(key, new Map());
    const period = PERIODS[Math.floor(Number(parts.hour) / 6)];
    const rows = out.get(key);
    if (!rows.has(period.key)) rows.set(period.key, { key: period.key, label: period.label, ...emptyStat() });
    addHour(rows.get(period.key), h);
  }
  return new Map([...out].map(([key, rows]) => [key, PERIODS.map(p => rows.get(p.key)).filter(Boolean)]));
}

export function precipitationHours(hours) {
  return hours.map((h, i) => {
    const prev = hours[i - 1];
    const dt = prev ? (Date.parse(h.time) - Date.parse(prev.time)) / 3600e3 : 0;
    const amount = prev?.precipTotal != null && h.precipTotal != null && h.precipTotal >= prev.precipTotal
      ? h.precipTotal - prev.precipTotal : null;
    return { ...h, precip: dt === 1 ? amount : null, precipRate: dt > 0 && amount != null ? amount / dt : null };
  });
}

export function precipitationTotals(hours, tz) {
  const out = new Map();
  // ponytail: split sparse model intervals at a constant rain rate; use finer model intervals for more exact local-day totals
  for (let i = 1; i < hours.length; i++) {
    const prev = hours[i - 1];
    const next = hours[i];
    const from = Date.parse(prev.time);
    const to = Date.parse(next.time);
    if (!(to > from)) continue;
    const amount = prev.precipTotal != null && next.precipTotal != null
      && next.precipTotal >= prev.precipTotal ? next.precipTotal - prev.precipTotal : null;
    for (let t = from; t < to;) {
      const end = Math.min(to, (Math.floor(t / 900e3) + 1) * 900e3);
      const p = tzParts(new Date((t + end) / 2).toISOString(), tz);
      const date = `${p.year}-${p.month}-${p.day}`;
      if (!out.has(date)) out.set(date, { total: 0, complete: true, from: t, to: end, periods: new Map() });
      const day = out.get(date);
      const key = PERIODS[Math.floor(Number(p.hour) / 6)].key;
      if (!day.periods.has(key)) day.periods.set(key, { total: 0, complete: true, from: t, to: end });
      const period = day.periods.get(key);
      day.to = end;
      period.to = end;
      if (amount == null) { day.complete = false; period.complete = false; }
      else {
        const part = amount * (end - t) / (to - from);
        day.total += part;
        period.total += part;
      }
      t = end;
    }
  }
  return out;
}

export function weekSampleIndices(hours) {
  return hours.flatMap((h, i) => i < 2 || new Date(h.time).getUTCHours() % 6 === 0 ? [i] : []);
}

export function forecastPriorities(hours, tz, tab) {
  const priorities = hours.map((_, i) => 1000 + i);
  if (tab !== 'week') return priorities.map((rank, i) => i <= 12 ? i : rank);
  const indices = weekSampleIndices(hours);
  const dates = indices.map(i => dateKey(hours[i].time, tz));
  [...new Set(dates)].forEach((date, rank) => {
    indices.forEach((index, i) => {
      if (dates[i] === date || dates[i - 1] === date || dates[i + 1] === date) {
        priorities[index] = Math.min(priorities[index], rank);
      }
    });
  });
  return priorities;
}

export function forecastReadiness(hours, completed, tz) {
  const readyHours = new Set();
  const readyDays = new Set();
  for (let i = 0; i < hours.length; i++) {
    if (completed.has(i) && (i === 0 || completed.has(i - 1))) readyHours.add(Date.parse(hours[i].time));
  }
  const indices = weekSampleIndices(hours);
  const dates = indices.map(i => dateKey(hours[i].time, tz));
  for (const date of new Set(dates)) {
    const ready = dates.every((key, i) => {
      const contributes = key === date || dates[i - 1] === date || dates[i + 1] === date;
      return !contributes || completed.has(indices[i]);
    });
    if (ready) readyDays.add(date);
  }
  return { hours: readyHours, days: readyDays };
}

export function forecastView(hours, city, tz, now = new Date()) {
  const slots = forecastTimes(now).slice(0, 12);
  const gridHours = new Map(hours.map(h => [Date.parse(h.time), h]));
  const cityHours = new Map((city?.hours || []).map(h => [Date.parse(h.time), h]));
  const merge = (fallback, primary) => {
    const result = { ...fallback };
    for (const [key, value] of Object.entries(primary || {})) {
      if (value != null) result[key] = value;
    }
    return result;
  };
  const visibleHours = slots.map(time => merge({ time, ...gridHours.get(Date.parse(time)) }, cityHours.get(Date.parse(time))));
  const weekHours = precipitationHours(weekSampleIndices(hours).map(i => hours[i]));
  const gridDays = new Map(aggregateWeek(weekHours, tz).map(d => [d.date, d]));
  const cityDays = new Map((city?.days || []).map(d => [d.date, d]));
  const totals = precipitationTotals(weekHours, tz);
  const periods = aggregatePeriods(weekHours, tz);
  const today = dateKey(now.toISOString(), tz);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const d = merge({ ...emptyStat(), ...gridDays.get(key), date: key }, cityDays.get(key));
    const total = totals.get(key);
    const fullStart = total && dateKey(new Date(total.from - 1).toISOString(), tz) !== key;
    const fullEnd = total && dateKey(new Date(total.to).toISOString(), tz) !== key;
    const remaining = key === today && total?.from <= now.getTime();
    d.precip = total?.complete && (fullStart || remaining) && fullEnd ? total.total : null;
    d.feels = windChill(d.hi, d.wind);
    const rows = periods.get(key) || [];
    periods.set(key, PERIODS.filter(p => rows.some(r => r.key === p.key)).map(p => {
      const row = { key: p.key, label: p.label, ...emptyStat(), ...rows.find(r => r.key === p.key) };
      const amount = total?.periods.get(p.key);
      const bucket = t => {
        const parts = tzParts(new Date(t).toISOString(), tz);
        return `${parts.year}-${parts.month}-${parts.day}:${Math.floor(Number(parts.hour) / 6)}`;
      };
      const id = `${key}:${Math.floor(p.from / 6)}`;
      const start = amount && bucket(amount.from - 1) !== id;
      const end = amount && bucket(amount.to) !== id;
      const current = amount?.from <= now.getTime() && amount?.to > now.getTime();
      row.precip = amount?.complete && (start || current) && end ? amount.total : null;
      return row;
    }));
    return d;
  });
  return { hours: visibleHours, days, periods };
}

export function nearestCity(features, loc) {
  const radians = x => x * Math.PI / 180;
  let closest = null;
  let best = 30;
  for (const feature of features) {
    const [lon, lat] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const a = Math.sin(radians(lat - loc.lat) / 2) ** 2
      + Math.cos(radians(loc.lat)) * Math.cos(radians(lat)) * Math.sin(radians(lon - loc.lon) / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    if (km < best) { best = km; closest = feature; }
  }
  return closest;
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

// ponytail: feels uses the day's max wind; use paired temperature/wind samples for a precise feels-like high
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
    const weekday = (p.period?.value?.en || name).match(/Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/i)?.[0];
    if (weekday) {
      while (formatter('en-US', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${cur}T00:00:00Z`)).toLowerCase() !== weekday.toLowerCase()) cur = nextKey(cur);
    }
    if (!night && !weekday) {
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

export function dayHeading(key, now, tz) {
  const todayKey = dateKey(now.toISOString(), tz);
  const t = new Date(`${todayKey}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  const tomorrowKey = t.toISOString().slice(0, 10);
  if (key === todayKey) return 'Today';
  if (key === tomorrowKey) return 'Tomorrow';
  return formatter('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
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

export async function pool(items, limit, fn, priority) {
  const out = new Array(items.length);
  const pending = items.map((_, i) => i);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (pending.length) {
      let next = 0;
      if (priority) {
        for (let i = 1; i < pending.length; i++) {
          if (priority(items[pending[i]], pending[i]) < priority(items[pending[next]], pending[next])) next = i;
        }
      }
      const [k] = pending.splice(next, 1);
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

export function skeletonCard() {
  return '<article class="card skeleton" aria-hidden="true">'
    + '<span class="sk sk-time"></span>'
    + '<span class="sk sk-emoji"></span>'
    + '<span class="sk sk-temp"></span>'
    + '<span class="sk sk-layers"></span>'
    + '<dl class="card-stats">'
    + '<div><span class="sk sk-line"></span></div>'.repeat(4)
    + '</dl></article>';
}

export function skeletonCards(n) {
  return `<div class="cards">${skeletonCard().repeat(n)}</div>`;
}

export function skeletonRow() {
  return '<article class="hour-row skeleton" aria-hidden="true">'
    + '<div class="hour-main"><span class="sk sk-time"></span></div>'
    + '<div class="hour-stats"><span class="sk sk-line"></span></div>'
    + '</article>';
}

export function skeletonRows(n) {
  return `<div class="hourly">${skeletonRow().repeat(n)}</div>`;
}
