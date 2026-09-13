// Daily step totals must follow calendar days, including the two days a year
// when the clocks change and a day is 23 or 25 hours long. Adding 24 hours of
// milliseconds per day moved every later boundary to 01:00 (or 23:00), so steps
// were counted on the wrong day.
//
// The time zone (Europe/London) is set for the whole suite in
// jest.global-setup.cjs; test files cannot set it themselves.

import { createHealthData } from '../src';

jest.mock(
  'react-native',
  () => ({ Platform: { OS: 'android' }, NativeModules: {} }),
  { virtual: true }
);
jest.mock(
  'react-native-health-connect',
  () => ({
    initialize: jest.fn(() => Promise.resolve(true)),
    getGrantedPermissions: jest.fn(() =>
      Promise.resolve([{ accessType: 'read', recordType: 'Steps' }])
    ),
    aggregateRecord: jest.fn(() => Promise.resolve({ COUNT_TOTAL: 1000 })),
  }),
  { virtual: true }
);

const aggregateRecord = jest.requireMock<{ aggregateRecord: jest.Mock }>(
  'react-native-health-connect'
).aggregateRecord;

/** Local date and time, as someone in that time zone reads it. */
const local = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const windows = () =>
  aggregateRecord.mock.calls.map((call: unknown[]) => {
    const request = call[0] as {
      timeRangeFilter: { startTime: string; endTime: string };
    };
    return [
      local(request.timeRangeFilter.startTime),
      local(request.timeRangeFilter.endTime),
    ];
  });

const health = createHealthData();

beforeEach(() => {
  aggregateRecord.mockClear();
});

it('the time zone is really in effect for this file', () => {
  // 29 March 2026 is 23 hours long in London.
  expect(
    new Date(2026, 2, 30).getTime() - new Date(2026, 2, 29).getTime()
  ).toBe(23 * 60 * 60 * 1000);
});

it('keeps every day midnight to midnight when the clocks go forward', async () => {
  const result = await health.getDailySteps({
    start: new Date(2026, 2, 28),
    end: new Date(2026, 2, 31),
  });

  expect(windows()).toEqual([
    ['2026-03-28 00:00', '2026-03-29 00:00'],
    ['2026-03-29 00:00', '2026-03-30 00:00'],
    ['2026-03-30 00:00', '2026-03-31 00:00'],
  ]);
  expect(result.ok && result.value.map((d) => d.date)).toEqual([
    '2026-03-28',
    '2026-03-29',
    '2026-03-30',
  ]);
});

it('keeps every day midnight to midnight when the clocks go back', async () => {
  await health.getDailySteps({
    start: new Date(2026, 9, 24),
    end: new Date(2026, 9, 27),
  });

  expect(windows()).toEqual([
    ['2026-10-24 00:00', '2026-10-25 00:00'],
    ['2026-10-25 00:00', '2026-10-26 00:00'],
    ['2026-10-26 00:00', '2026-10-27 00:00'],
  ]);
});

it('ends the last day at the end of the range', async () => {
  await health.getDailySteps({
    start: new Date(2026, 2, 29),
    end: new Date(2026, 2, 30, 9, 30),
  });

  expect(windows()).toEqual([
    ['2026-03-29 00:00', '2026-03-30 00:00'],
    ['2026-03-30 00:00', '2026-03-30 09:30'],
  ]);
});
