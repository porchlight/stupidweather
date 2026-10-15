import assert from 'node:assert/strict';
import { tzParts, dateKey, forecastTimes, aggregateToday, aggregateWeek, pool, radarTimes, clockTime, dayLabel, weekLabel } from './logic.js';

// tzParts converts UTC to the location tz (Toronto in Oct = UTC-4)
assert.deepEqual(tzParts('2026-10-15T02:00:00Z', 'America/Toronto'),
  { year: '2026', month: '10', day: '14', hour: '22', minute: '00' });
assert.equal(dateKey('2026-10-15T02:00:00Z', 'America/Toronto'), '2026-10-14');

// forecastTimes: 49 hourly points then 3-hourly, all on :00
const times = forecastTimes(new Date('2026-10-14T17:30:00Z'));
assert.equal(times[0], '2026-10-14T17:00:00.000Z');
assert.equal(times[48], '2026-10-16T17:00:00.000Z');
assert.ok(times.every(t => t.endsWith(':00:00.000Z')));

// aggregateToday: windows by local hour (Toronto, EDT = UTC-4 in October)
const hours = [
  { time: '2026-10-14T14:00:00Z', pop: 20, precip: 1 }, // 10:00 local 10-14 -> morning
  { time: '2026-10-14T18:00:00Z', pop: 60, precip: 2 }, // 14:00 local 10-14 -> afternoon
  { time: '2026-10-15T01:00:00Z', pop: 5,  precip: 0 }, // 21:00 local 10-14 -> night
];
const per = aggregateToday(hours, 'America/Toronto');
assert.deepEqual(per.morning, { pop: 20, precip: 1 });
assert.deepEqual(per.afternoon, { pop: 60, precip: 2 });
assert.deepEqual(per.night, { pop: 5, precip: 0 });

// aggregateWeek: group by local date, pop=max, precip=sum (crosses midnight UTC)
const weekHours = [...hours, { time: '2026-10-15T14:00:00Z', pop: 30, precip: 4 }]; // 10:00 local 10-15
const week = aggregateWeek(weekHours, 'America/Toronto');
assert.deepEqual(week[0], { date: '2026-10-14', pop: 60, precip: 3 });
assert.deepEqual(week[1], { date: '2026-10-15', pop: 30, precip: 4 });

// pool preserves order
const out = await pool([1, 2, 3, 4], 2, async n => n * 10);
assert.deepEqual(out, [10, 20, 30, 40]);

// radarTimes: 6-min steps ending at the floor of now, oldest->newest
const rt = radarTimes(new Date('2026-10-14T17:59:00Z'), 3);
assert.deepEqual(rt, ['2026-10-14T17:42:00.000Z', '2026-10-14T17:48:00.000Z', '2026-10-14T17:54:00.000Z']);

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
