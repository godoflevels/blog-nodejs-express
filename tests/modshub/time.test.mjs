import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wallParts, fromWall, toOffsetIso, parseOffsetIso, moveToDate, moveToWall, monthMatrix, weekDays,
  startOfWeek, addDays, isValidZone,
} from '../../client/modshub/core/time.js';

test('wall clock round trip keeps date and time in the post timezone', () => {
  for (const zone of ['Europe/Moscow', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC']) {
    const made = fromWall('2026-10-20', '23:30', zone);
    assert.equal(made.adjusted, false, zone);
    const back = wallParts(made.iso, zone);
    assert.equal(back.date, '2026-10-20', zone);
    assert.equal(back.time, '23:30', zone);
  }
});

test('offset ISO matches the brief example and parses back to the same instant', () => {
  const instant = parseOffsetIso('2026-10-20T18:00:00+03:00').iso;
  assert.equal(instant, '2026-10-20T15:00:00.000Z');
  assert.equal(toOffsetIso(instant, 'Europe/Moscow'), '2026-10-20T18:00:00+03:00');
  assert.equal(toOffsetIso(instant, 'Asia/Kolkata'), '2026-10-20T20:30:00+05:30');
  assert.equal(toOffsetIso(instant, 'UTC'), '2026-10-20T15:00:00Z');
});

test('the same instant shows different wall dates in different zones, without drifting', () => {
  const instant = fromWall('2026-10-20', '23:30', 'America/Los_Angeles').iso; // 06:30Z next day
  assert.equal(wallParts(instant, 'America/Los_Angeles').date, '2026-10-20');
  assert.equal(wallParts(instant, 'Europe/Berlin').date, '2026-10-21');
  assert.equal(parseOffsetIso(toOffsetIso(instant, 'America/Los_Angeles')).iso, instant);
});

test('moving a post to another day keeps its wall time across DST changes', () => {
  // Europe/Berlin leaves DST on 2026-10-25.
  const before = fromWall('2026-10-24', '09:00', 'Europe/Berlin').iso;
  const moved = moveToDate(before, 'Europe/Berlin', '2026-10-26');
  const parts = wallParts(moved, 'Europe/Berlin');
  assert.equal(parts.date, '2026-10-26');
  assert.equal(parts.time, '09:00');
  assert.equal(moveToWall(before, 'Europe/Berlin', '2026-10-24', '17:45'), fromWall('2026-10-24', '17:45', 'Europe/Berlin').iso);
});

test('a wall time that does not exist (DST gap) is flagged as adjusted', () => {
  // 2026-03-29 02:30 does not exist in Europe/Berlin.
  const res = fromWall('2026-03-29', '02:30', 'Europe/Berlin');
  assert.equal(res.adjusted, true);
});

test('calendar grid helpers', () => {
  assert.equal(startOfWeek('2026-10-15', 1), '2026-10-12');
  assert.equal(startOfWeek('2026-10-15', 0), '2026-10-11');
  assert.deepEqual(weekDays('2026-10-15', 1)[6], '2026-10-18');
  const grid = monthMatrix('2026-10-15', 1);
  assert.equal(grid.length, 6);
  assert.ok(grid.every((row) => row.length === 7));
  assert.equal(grid[0][0].date, '2026-09-28');
  assert.equal(grid.flat().filter((c) => c.inMonth).length, 31);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('timezone validation', () => {
  assert.equal(isValidZone('Europe/Moscow'), true);
  assert.equal(isValidZone('Mars/Olympus'), false);
});
