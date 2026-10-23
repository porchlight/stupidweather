import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tzParts, dateKey, forecastTimes, aggregateWeek, groupByDay, dayHeading, pool, radarTimes, radarDelay, clockTime, dayLabel, weekLabel, conditionWord, conditionEmoji, isNight, windChill, fmtTemp, fmtKmh, fmtHiLo, layerIcon, skeletonCards, skeletonRows, ecConditionWord, citypageToForecast, aggregatePeriods } from './logic.js';

// tzParts converts UTC to the location tz (Toronto in Oct = UTC-4)
assert.deepEqual(tzParts('2026-10-15T02:00:00Z', 'America/Toronto'),
  { year: '2026', month: '10', day: '14', hour: '22', minute: '00' });
assert.equal(dateKey('2026-10-15T02:00:00Z', 'America/Toronto'), '2026-10-14');

// forecastTimes: 12 hourly points then 6-hourly out to 7 days, all on :00
const times = forecastTimes(new Date('2026-10-14T17:30:00Z'));
assert.equal(times.length, 38);
assert.equal(times[0], '2026-10-14T17:00:00.000Z');
assert.equal(times[11], '2026-10-15T04:00:00.000Z');
assert.equal(times[12], '2026-10-15T06:00:00.000Z');
assert.equal(times[times.length - 1], '2026-10-21T12:00:00.000Z');
assert.ok(times.every(t => t.endsWith(':00:00.000Z')));

// sample hours for the week aggregation (Toronto, EDT = UTC-4 in October)
const hours = [
  { time: '2026-10-14T14:00:00Z', pop: 20, precip: 1, temp: 18.2, wind: 3, gust: 6, cloud: 10, tstorm: 0 },  // 10:00 local
  { time: '2026-10-14T18:00:00Z', pop: 60, precip: 2, temp: 12.4, wind: 5, gust: 11, cloud: 90, tstorm: 0 }, // 14:00 local
  { time: '2026-10-15T01:00:00Z', pop: 5,  precip: 0, temp: 6.1,  wind: null, gust: null, cloud: null, tstorm: null } // 21:00 local
];

// aggregateWeek: group by local date, pop=max, precip=sum
const weekHours = [...hours, { time: '2026-10-15T14:00:00Z', pop: 30, precip: 4, temp: 15, wind: 8, gust: null, cloud: 45, tstorm: 40 }];
const week = aggregateWeek(weekHours, 'America/Toronto');
assert.deepEqual(week[0], { date: '2026-10-14', pop: 60, precip: 3, hi: 18.2, lo: 6.1, wind: 5, gust: 11, cond: 'Cloudy', feels: null });
assert.deepEqual(week[1], { date: '2026-10-15', pop: 30, precip: 4, hi: 15, lo: 15, wind: 8, gust: null, cond: 'Thunderstorm', feels: null });

// winter: sub-zero hours aggregate to snow; January dates/labels hold
const winter = aggregateWeek([
  { time: '2026-01-15T18:00:00Z', pop: 80, precip: 1.5, temp: -8, wind: 12, gust: 20, cloud: 100, tstorm: 0 }, // 13:00 EST
  { time: '2026-01-15T23:00:00Z', pop: 90, precip: 0.5, temp: -14, wind: 3, gust: 6, cloud: 100, tstorm: 0 }   // 18:00 EST
], 'America/Toronto');
assert.equal(winter[0].cond, 'Blizzard');
assert.equal(winter[0].hi, -8);
assert.equal(winter[0].lo, -14);
assert.equal(Math.round(winter[0].feels), -18); // wind chill at the day's high (-8°C, 12 m/s)
assert.equal(dateKey('2026-01-15T23:00:00Z', 'America/Toronto'), '2026-01-15');
assert.equal(weekLabel('2026-01-15'), 'Jan 15 Thursday');

// windChill: 2001 JAG/TI formula, EC reference points (-15°C/20km/h = -24, -20°C/30km/h = -33)
assert.equal(Math.round(windChill(-15, 20 / 3.6)), -24);
assert.equal(Math.round(windChill(-20, 30 / 3.6)), -33);
// undefined outside its domain: warm, calm, or missing inputs
assert.equal(windChill(15, 10), null);
assert.notEqual(windChill(10, 10), null);      // 10°C is still in domain
assert.equal(windChill(-5, 4.8 / 3.6), null);  // exactly 4.8 km/h is not above the threshold
assert.equal(windChill(-5, 1), null);           // 3.6 km/h calm
assert.equal(windChill(null, 5), null);
assert.equal(windChill(-5, null), null);

// conditionWord: thresholds at their boundaries, thunderstorm wins
assert.equal(conditionWord(92, 0), 'Cloudy');
assert.equal(conditionWord(70, 0), 'Cloudy');
assert.equal(conditionWord(69, 0), 'Partly cloudy');
assert.equal(conditionWord(25, 0), 'Partly cloudy');
assert.equal(conditionWord(24, 0), 'Sunny');
assert.equal(conditionWord(50, 30), 'Thunderstorm');
assert.equal(conditionWord(50, 29), 'Partly cloudy');
assert.equal(conditionWord(null, 40), 'Thunderstorm');
assert.equal(conditionWord(null, null), '–');

// conditionWord: sub-zero precip is snow; heavy rate + strong wind makes a blizzard
assert.equal(conditionWord(10, 0, -5, 0.5, 3), 'Flurries');
assert.equal(conditionWord(10, 0, 0, 0.5, 0), 'Flurries');
assert.equal(conditionWord(10, 0, -5, 1.5, 12), 'Blizzard');
assert.equal(conditionWord(10, 0, -5, 1, 11), 'Blizzard');
assert.equal(conditionWord(10, 0, -5, 1.5, 5), 'Flurries');
assert.equal(conditionWord(10, 0, -5, 0.9, 12), 'Flurries');
assert.equal(conditionWord(10, 40, -5, 0.5, 3), 'Flurries');
assert.equal(conditionWord(10, 40, -5, 1.5, 12), 'Blizzard');
assert.equal(conditionWord(10, 0, -5, 0, 12), 'Sunny');
assert.equal(conditionWord(10, 0, 5, 1.5, 12), 'Sunny');

// conditionEmoji: one emoji per condition, empty string when unknown
assert.equal(conditionEmoji('Sunny'), '☀️');
assert.equal(conditionEmoji('Partly cloudy'), '⛅');
assert.equal(conditionEmoji('Cloudy'), '☁️');
assert.equal(conditionEmoji('Thunderstorm'), '⛈️');
assert.equal(conditionEmoji('Flurries'), '🌨️');
assert.equal(conditionEmoji('Blizzard'), '❄️');
assert.equal(conditionEmoji('–'), '');
assert.equal(conditionEmoji(undefined), '');

// isNight: local hour <7 or >=19 is night (Toronto EDT = UTC-4 in October)
assert.equal(isNight('2026-10-15T02:00:00Z', 'America/Toronto'), true);  // 22:00 local
assert.equal(isNight('2026-10-15T14:00:00Z', 'America/Toronto'), false); // 10:00 local
assert.equal(isNight('2026-10-15T10:00:00Z', 'America/Toronto'), true);  // 06:00 local
assert.equal(isNight('2026-10-15T11:00:00Z', 'America/Toronto'), false); // 07:00 local
assert.equal(isNight('2026-10-15T22:59:00Z', 'America/Toronto'), false); // 18:59 local
assert.equal(isNight('2026-10-15T23:00:00Z', 'America/Toronto'), true);  // 19:00 local

// conditionWord: night swaps clear-sky words only, snow/storm words stand
assert.equal(conditionWord(10, 0, 15, 0, 2, true), 'Clear');
assert.equal(conditionWord(10, 0, 15, 0, 2, false), 'Sunny');
assert.equal(conditionWord(10, 0, 15, 0, 2), 'Sunny');
assert.equal(conditionWord(40, 0, 15, 0, 2, true), 'Cloudy');
assert.equal(conditionWord(40, 0, 15, 0, 2, false), 'Partly cloudy');
assert.equal(conditionWord(90, 0, 15, 0, 2, true), 'Cloudy');
assert.equal(conditionWord(10, 0, -5, 0.5, 3, true), 'Flurries');
assert.equal(conditionWord(10, 0, -5, 1.5, 12, true), 'Blizzard');
assert.equal(conditionWord(50, 30, 15, 0, 2, true), 'Thunderstorm');
assert.equal(conditionWord(null, null, null, 0, null, true), '–');

// conditionEmoji: one emoji per word; cloudy nights just use the cloud
assert.equal(conditionEmoji('Clear'), '🌙');
assert.equal(conditionEmoji('Cloudy'), '☁️');
assert.equal(conditionEmoji('Sunny'), '☀️');

// unit and label helpers: null renders as an en dash, 0 is a real value
assert.equal(fmtTemp(12.6), '13°');
assert.equal(fmtTemp(-5), '-5°');
assert.equal(fmtTemp(-12.6), '-13°');
assert.equal(fmtTemp(-0.4), '0°');
assert.equal(fmtTemp(null), '–');
assert.equal(fmtTemp(undefined), '–');
assert.equal(fmtKmh(3.7509854), '14');
assert.equal(fmtKmh(0), '0');
assert.equal(fmtKmh(null), '–');
assert.equal(fmtHiLo(14.2, 6.1), '14°/6°');
assert.equal(fmtHiLo(-3.4, -11.6), '-3°/-12°');
assert.equal(fmtHiLo(null, 6.1), '–');
assert.equal(fmtHiLo(14.2, null), '–');

// pool preserves order
const out = await pool([1, 2, 3, 4], 2, async n => n * 10);
assert.deepEqual(out, [10, 20, 30, 40]);

// pool passes the index as the second argument (hours[i] alignment)
const idx = await pool([10, 20, 30], 2, async (n, i) => i);
assert.deepEqual(idx, [0, 1, 2]);

// radarTimes: 6-min steps ending at the floor of now, oldest->newest; optional future frames
const rt = radarTimes(new Date('2026-10-14T17:59:00Z'), 3);
assert.deepEqual(rt, ['2026-10-14T17:42:00.000Z', '2026-10-14T17:48:00.000Z', '2026-10-14T17:54:00.000Z']);
const rtf = radarTimes(new Date('2026-10-14T17:59:00Z'), 2, 2);
assert.deepEqual(rtf, ['2026-10-14T17:48:00.000Z', '2026-10-14T17:54:00.000Z', '2026-10-14T18:00:00.000Z', '2026-10-14T18:06:00.000Z']);

// radarDelay: slider max = fastest (smallest delay), slider min = slowest
assert.equal(radarDelay('1200', '200', '1200'), 200);
assert.equal(radarDelay('200', '200', '1200'), 1200);
assert.equal(radarDelay('900', '200', '1200'), 500);

// clockTime: 12-hour labels in the location tz (Toronto = UTC-4 in October)
assert.equal(clockTime('2026-10-15T14:32:00Z', 'America/Toronto', true), '10:32 AM');
assert.equal(clockTime('2026-10-15T14:00:00Z', 'America/Toronto', false), '10 AM');
assert.equal(clockTime('2026-10-15T02:00:00Z', 'America/Toronto', false), '10 PM');

// dayLabel: month-name dates, taken from the location date not UTC
assert.equal(dayLabel('2026-10-15T14:32:00Z', 'America/Toronto'), 'Oct 15');
assert.equal(dayLabel('2026-10-15T02:00:00Z', 'America/Toronto'), 'Oct 14');

// weekLabel: takes an already-local date key, so it is timezone-independent
assert.equal(weekLabel('2026-10-15'), 'Oct 15 Thursday');
assert.equal(weekLabel('2026-10-19'), 'Oct 19 Monday');

// groupByDay: buckets by local date key across days, sorted ascending
// (the shared `hours` fixture all lands on Oct 14 local; add an Oct 15 local hour)
const grouped = groupByDay([{ time: '2026-10-15T14:00:00Z' }, hours[0], hours[1]], 'America/Toronto');
assert.equal(grouped.length, 2);
assert.equal(grouped[0].date, '2026-10-14');
assert.equal(grouped[0].hours.length, 2);
assert.equal(grouped[1].date, '2026-10-15');
assert.equal(grouped[1].hours.length, 1);
assert.equal(grouped[0].hours[0].time, '2026-10-14T14:00:00Z');

// dayHeading: today/tomorrow by local date key, else weekday + short date
const now = new Date('2026-10-15T14:00:00Z'); // Toronto 10:00 Oct 15 (Oct 15 2026 is a Thursday)
assert.equal(dayHeading('2026-10-15', now, 'America/Toronto'), 'Today');
assert.equal(dayHeading('2026-10-16', now, 'America/Toronto'), 'Tomorrow');
assert.equal(dayHeading('2026-10-17', now, 'America/Toronto'), 'Sat, Oct 17');

// dayHeading: DST-safe (US spring-forward is 2026-03-08)
const dstStart = new Date('2026-03-08T05:00:00Z');
assert.equal(dayHeading('2026-03-08', dstStart, 'America/Toronto'), 'Today');
assert.equal(dayHeading('2026-03-09', dstStart, 'America/Toronto'), 'Tomorrow');

// index.html and manifest carry the metadata that matters for sharing/install
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('./manifest.webmanifest', import.meta.url), 'utf8'));
assert.match(html, /<title>Stupid Weather<\/title>/);
assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);
assert.match(html, /<meta property="og:title"/);
assert.match(html, /<meta property="og:description"/);
assert.match(html, /<meta property="og:type" content="website">/);
assert.match(html, /<meta property="og:image"/);
assert.match(html, /<meta name="twitter:card" content="summary">/);
assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="icon\.svg">/);
assert.equal(manifest.theme_color, '#6a4c93');
assert.ok(manifest.icons.length > 0);

// skeletonCards: n placeholder cards inside the standard cards wrapper
assert.ok(skeletonCards(3).startsWith('<div class="cards">'));
assert.equal((skeletonCards(3).match(/card skeleton/g) || []).length, 3);
assert.equal((skeletonCards(12).match(/card skeleton/g) || []).length, 12);
assert.equal((skeletonCards(3).match(/class="sk /g) || []).length, 24);

// skeletonRows: n list-row placeholders in the hourly wrapper
assert.ok(skeletonRows(3).startsWith('<div class="hourly">'));
assert.equal((skeletonRows(4).match(/hour-row/g) || []).length, 4);
assert.ok(skeletonRows(2).includes('aria-hidden="true"'));

// ecConditionWord: EC text summaries map onto the app's condition vocabulary
assert.equal(ecConditionWord('Sunny'), 'Sunny');
assert.equal(ecConditionWord('Mainly sunny'), 'Sunny');
assert.equal(ecConditionWord('Clear'), 'Clear');
assert.equal(ecConditionWord('A few clouds'), 'Partly cloudy');
assert.equal(ecConditionWord('Partly cloudy'), 'Partly cloudy');
assert.equal(ecConditionWord('Cloudy'), 'Cloudy');
assert.equal(ecConditionWord('Chance of showers'), 'Cloudy');
assert.equal(ecConditionWord('Thunderstorms'), 'Thunderstorm');
assert.equal(ecConditionWord('Flurries'), 'Flurries');
assert.equal(ecConditionWord('Blowing snow'), 'Flurries');
assert.equal(ecConditionWord('Blizzard'), 'Blizzard');
assert.equal(ecConditionWord(''), null);
assert.equal(ecConditionWord(null), null);

// citypageToForecast: field paths mirror the live collection (probed 2026-10-18)
const cpProps = {
  hourlyForecastGroup: { hourlyForecasts: [
    { timestamp: '2026-10-18T21:00:00Z', condition: { en: 'Clear' }, temperature: { value: { en: 11 } },
      lop: { value: { en: 0 } }, wind: { speed: { value: { en: 20 } }, gust: { value: { en: 40 } } } },
    { timestamp: '2026-10-19T03:00:00Z', condition: { en: 'Cloudy' }, temperature: { value: { en: 7 } },
      lop: { value: { en: 60 } }, wind: { speed: { value: { en: 15 } } } },
    { timestamp: '2026-10-19T15:00:00Z', condition: { en: 'Sunny' }, temperature: { value: { en: 17 } },
      lop: { value: { en: 20 } }, wind: { speed: { value: { en: 10 } }, gust: { value: { en: 0 } } } }
  ]},
  forecastGroup: { forecasts: [
    { period: { textForecastName: { en: 'Tonight' } },
      temperatures: { temperature: [{ class: { en: 'low' }, value: { en: 5 } }] },
      winds: { periods: [{ speed: { value: { en: 20 } }, gust: { value: { en: 40 } } }] },
      abbreviatedForecast: { textSummary: { en: 'Clear' } } },
    { period: { textForecastName: { en: 'Monday' } },
      temperatures: { temperature: [{ class: { en: 'high' }, value: { en: 19 } }] },
      winds: { periods: [{ speed: { value: { en: 15 } }, gust: { value: { en: 0 } } }] },
      abbreviatedForecast: { textSummary: { en: 'Sunny' } } },
    { period: { textForecastName: { en: 'Monday night' } },
      temperatures: { temperature: [{ class: { en: 'low' }, value: { en: 5 } }] },
      winds: { periods: [{ speed: { value: { en: 5 } }, gust: { value: { en: 0 } } }] },
      abbreviatedForecast: { textSummary: { en: 'A few clouds' } } },
    { period: { textForecastName: { en: 'Tuesday' } },
      temperatures: { temperature: [{ class: { en: 'high' }, value: { en: 17 } }] },
      abbreviatedForecast: { textSummary: { en: 'Sunny' } } }
  ]}
};
const cp = citypageToForecast(cpProps, 'America/Toronto', new Date('2026-10-18T20:00:00Z')); // Sun 16:00 local

assert.equal(cp.hours.length, 3);
assert.deepEqual(cp.hours[0], { time: '2026-10-18T21:00:00Z', pop: 0, precip: null, temp: 11,
  wind: 20 / 3.6, gust: 40 / 3.6, cloud: null, tstorm: null, cond: 'Clear' });
assert.equal(cp.hours[1].gust, null);   // gust key absent from EC hourly data
assert.equal(cp.hours[1].cond, 'Cloudy');
assert.equal(cp.hours[2].gust, 0);      // gust 0 is a value, not missing data

// Tonight -> today's low; day periods advance the cursor; night pairs with its day
assert.equal(cp.days.length, 3);
assert.deepEqual(cp.days[0], { date: '2026-10-18', pop: 60, precip: null, hi: null, lo: 5,
  wind: 20 / 3.6, gust: 40 / 3.6, cond: 'Clear', feels: null });
assert.deepEqual(cp.days[1], { date: '2026-10-19', pop: 20, precip: null, hi: 19, lo: 5,
  wind: 15 / 3.6, gust: 0, cond: 'Partly cloudy', feels: null });
assert.deepEqual(cp.days[2], { date: '2026-10-20', pop: null, precip: null, hi: 17, lo: null,
  wind: null, gust: null, cond: 'Sunny', feels: null });

// daytime issue: a leading day period lands on today without advancing
const cp2 = citypageToForecast({
  forecastGroup: { forecasts: [
    { period: { textForecastName: { en: 'Sunday' } },
      temperatures: { temperature: [{ class: { en: 'high' }, value: { en: 14 } }] },
      abbreviatedForecast: { textSummary: { en: 'Sunny' } } },
    { period: { textForecastName: { en: 'Sunday night' } },
      temperatures: { temperature: [{ class: { en: 'low' }, value: { en: 3 } }] },
      abbreviatedForecast: { textSummary: { en: 'Clear' } } }
  ]}
}, 'America/Toronto', new Date('2026-10-18T15:00:00Z'));
assert.deepEqual(cp2.days, [{ date: '2026-10-18', pop: null, precip: null, hi: 14, lo: 3,
  wind: null, gust: null, cond: 'Sunny', feels: null }]);

// layerIcon: cumulative clothing stack by temperature (boundary: 20 = two icons, 10 = three, 0 = three)
assert.equal(layerIcon(21), '👕');
assert.equal(layerIcon(20), '👕🧶');
assert.equal(layerIcon(11), '👕🧶');
assert.equal(layerIcon(10), '👕🧶🧥');
assert.equal(layerIcon(0), '👕🧶🧥');
assert.equal(layerIcon(-1), '👕🧶🧥🥶');
assert.equal(layerIcon(null), '');

// aggregatePeriods: 4 local-hour buckets (Toronto Oct = UTC-4), empty buckets omitted,
// dates absent without hours; temps >10 keep feels null so deepEqual stays exact
const periodHours = [
  { time: '2026-10-14T04:00:00Z', pop: 5, precip: 0, temp: 11, wind: 4, gust: null, cloud: null, tstorm: null },   // 00:00 local -> overnight
  { time: '2026-10-14T10:00:00Z', pop: 20, precip: 1, temp: 13, wind: 3, gust: 6, cloud: 10, tstorm: 0 },        // 06:00 local -> morning (edge)
  { time: '2026-10-14T16:00:00Z', pop: 60, precip: 2, temp: 22, wind: 5, gust: 11, cloud: 90, tstorm: 0 },       // 12:00 local -> afternoon (edge)
  { time: '2026-10-14T22:00:00Z', pop: 10, precip: 0.5, temp: 15, wind: 6, gust: 9, cloud: 40, tstorm: 0 },      // 18:00 local -> evening (edge)
  { time: '2026-10-15T16:00:00Z', pop: 30, precip: 4, temp: 14, wind: 8, gust: null, cloud: 45, tstorm: 40 }     // 12:00 local Oct 15 -> lone afternoon
];
const periods = aggregatePeriods(periodHours, 'America/Toronto');
assert.equal(periods.size, 2);
assert.deepEqual(periods.get('2026-10-14').map(p => p.key),
  ['overnight', 'morning', 'afternoon', 'evening']);
assert.deepEqual(periods.get('2026-10-14')[1],
  { key: 'morning', label: 'Morning', pop: 20, precip: 1, hi: 13, lo: 13, wind: 3, gust: 6, cond: 'Sunny', feels: null });
assert.deepEqual(periods.get('2026-10-14')[3],
  { key: 'evening', label: 'Evening', pop: 10, precip: 0.5, hi: 15, lo: 15, wind: 6, gust: 9, cond: 'Partly cloudy', feels: null });
assert.deepEqual(periods.get('2026-10-15'),
  [{ key: 'afternoon', label: 'Afternoon', pop: 30, precip: 4, hi: 14, lo: 14, wind: 8, gust: null, cond: 'Thunderstorm', feels: null }]);
// no hours at all -> empty map
assert.equal(aggregatePeriods([], 'America/Toronto').size, 0);

console.log('selfcheck OK');
