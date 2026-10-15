import assert from 'node:assert/strict';
import { tzParts, dateKey, forecastTimes, aggregateWeek, pool, radarTimes, radarDelay, clockTime, dayLabel, weekLabel, conditionWord, conditionEmoji, fmtTemp, fmtKmh, fmtHiLo } from './logic.js';

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
assert.deepEqual(week[0], { date: '2026-10-14', pop: 60, precip: 3, hi: 18.2, lo: 6.1, wind: 5, gust: 11, cond: 'Cloudy' });
assert.deepEqual(week[1], { date: '2026-10-15', pop: 30, precip: 4, hi: 15, lo: 15, wind: 8, gust: null, cond: 'Thunderstorm' });

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

// conditionEmoji: one emoji per condition, empty string when unknown
assert.equal(conditionEmoji('Sunny'), '☀️');
assert.equal(conditionEmoji('Partly cloudy'), '⛅');
assert.equal(conditionEmoji('Cloudy'), '☁️');
assert.equal(conditionEmoji('Thunderstorm'), '⛈️');
assert.equal(conditionEmoji('–'), '');
assert.equal(conditionEmoji(undefined), '');

// unit and label helpers: null renders as an en dash, 0 is a real value
assert.equal(fmtTemp(12.6), '13°');
assert.equal(fmtTemp(null), '–');
assert.equal(fmtTemp(undefined), '–');
assert.equal(fmtKmh(3.7509854), '14');
assert.equal(fmtKmh(0), '0');
assert.equal(fmtKmh(null), '–');
assert.equal(fmtHiLo(14.2, 6.1), '14°/6°');
assert.equal(fmtHiLo(null, 6.1), '–');
assert.equal(fmtHiLo(14.2, null), '–');

// pool preserves order
const out = await pool([1, 2, 3, 4], 2, async n => n * 10);
assert.deepEqual(out, [10, 20, 30, 40]);

// pool passes the index as the second argument (hours[i] alignment)
const idx = await pool([10, 20, 30], 2, async (n, i) => i);
assert.deepEqual(idx, [0, 1, 2]);

// radarTimes: 6-min steps ending at the floor of now, oldest->newest
const rt = radarTimes(new Date('2026-10-14T17:59:00Z'), 3);
assert.deepEqual(rt, ['2026-10-14T17:42:00.000Z', '2026-10-14T17:48:00.000Z', '2026-10-14T17:54:00.000Z']);

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

console.log('selfcheck OK');
