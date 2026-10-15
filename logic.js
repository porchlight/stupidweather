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
  const hourlyHours = 48;
  for (let i = 0; i <= hourlyHours; i++) out.push(new Date(start.getTime() + i * 3600e3).toISOString());
  const H3 = 3 * 3600e3;
  const end = start.getTime() + 7 * 24 * 3600e3;
  let t = Math.ceil((start.getTime() + (hourlyHours + 3) * 3600e3) / H3) * H3;
  while (t < end) { out.push(new Date(t).toISOString()); t += H3; }
  return out;
}

function hourOf(iso, tz) { return Number(tzParts(iso, tz).hour); }

export function aggregateToday(hours, tz) {
  const buckets = { morning: [], afternoon: [], night: [] };
  for (const h of hours) {
    const hr = hourOf(h.time, tz);
    if (hr >= 6 && hr < 12) buckets.morning.push(h);
    else if (hr >= 12 && hr < 18) buckets.afternoon.push(h);
    else buckets.night.push(h);
  }
  const agg = list => ({
    pop: list.length ? Math.max(...list.map(h => h.pop ?? 0)) : 0,
    precip: list.reduce((s, h) => s + (h.precip ?? 0), 0)
  });
  return { morning: agg(buckets.morning), afternoon: agg(buckets.afternoon), night: agg(buckets.night) };
}

export function aggregateWeek(hours, tz) {
  const map = new Map();
  for (const h of hours) {
    const key = dateKey(h.time, tz);
    if (!map.has(key)) map.set(key, { date: key, pop: 0, precip: 0 });
    const day = map.get(key);
    day.pop = Math.max(day.pop, h.pop ?? 0);
    day.precip += h.precip ?? 0;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function radarTimes(now = new Date(), count = 30) {
  const step = 6 * 60 * 1000;
  const end = Math.floor(now.getTime() / step) * step;
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(new Date(end - i * step).toISOString());
  return out;
}

export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
