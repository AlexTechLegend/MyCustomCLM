import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MaintenanceWindow } from '../types.js';
import { resolveNthWindowBeforeExpiry } from './windows.js';

function wedWindow(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: 'win_test',
    name: 'Wed 02:00 UTC',
    weekday: 3, // Wednesday
    startTime: '02:00',
    endTime: '04:00',
    timezone: 'UTC',
    recurrence: 'weekly',
    blackoutRanges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolveNthWindowBeforeExpiry', () => {
  it('returns the 2nd Wednesday before a Friday expiry', () => {
    // 2026-10-16 is a Friday. Wednesdays before: Oct 14, Oct 7, Sep 30…
    const notAfter = '2026-10-16T12:00:00.000Z';
    const win = wedWindow();
    const first = resolveNthWindowBeforeExpiry(notAfter, win, { nthWindowBeforeExpiry: 1 });
    const second = resolveNthWindowBeforeExpiry(notAfter, win, { nthWindowBeforeExpiry: 2 });
    assert.ok(first);
    assert.ok(second);
    assert.equal(first!.toISOString().slice(0, 10), '2026-10-14');
    assert.equal(second!.toISOString().slice(0, 10), '2026-10-07');
    assert.equal(first!.getUTCHours(), 2);
  });

  it('skips blackout ranges and takes the next eligible window', () => {
    const notAfter = '2026-10-16T12:00:00.000Z';
    const win = wedWindow({
      blackoutRanges: [{ start: '2026-10-13T00:00:00.000Z', end: '2026-10-15T23:59:59.000Z', reason: 'freeze' }],
    });
    // 1st Wednesday (Oct 14) is blacked out → Oct 7 becomes the 1st eligible.
    const first = resolveNthWindowBeforeExpiry(notAfter, win, { nthWindowBeforeExpiry: 1 });
    assert.ok(first);
    assert.equal(first!.toISOString().slice(0, 10), '2026-10-07');
  });

  it('honours Nth after blackouts (2nd eligible is Sep 30 when Oct 14 is blacked out)', () => {
    const notAfter = '2026-10-16T12:00:00.000Z';
    const win = wedWindow({
      blackoutRanges: [{ start: '2026-10-13T00:00:00.000Z', end: '2026-10-15T23:59:59.000Z' }],
    });
    const second = resolveNthWindowBeforeExpiry(notAfter, win, { nthWindowBeforeExpiry: 2 });
    assert.ok(second);
    assert.equal(second!.toISOString().slice(0, 10), '2026-09-30');
  });

  it('returns null when every candidate before expiry is blacked out', () => {
    const notAfter = '2026-10-16T12:00:00.000Z';
    const win = wedWindow({
      blackoutRanges: [{ start: '2020-01-01T00:00:00.000Z', end: '2030-01-01T00:00:00.000Z', reason: 'forever' }],
    });
    const first = resolveNthWindowBeforeExpiry(notAfter, win, { nthWindowBeforeExpiry: 1 });
    assert.equal(first, null);
  });
});

