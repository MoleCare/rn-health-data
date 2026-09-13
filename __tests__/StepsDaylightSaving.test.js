/* eslint-env jest, node */

// Daily step totals must follow calendar days, including the two days a year
// when the clocks change and a day is 23 or 25 hours long. Adding 24 hours of
// milliseconds per day moved every later boundary to 01:00 (or 23:00), so steps
// were counted on the wrong day.
//
// The time zone (Europe/London) is set for the whole suite in
// jest.global-setup.js.

const mockPlatform = {OS: 'android'};
jest.mock('react-native', () => ({Platform: mockPlatform, NativeModules: {}}));
jest.mock(
  'react-native-health-connect',
  () => ({aggregateRecord: jest.fn(async () => ({COUNT_TOTAL: 1000}))}),
  {virtual: true},
);

const {HealthDataService} = require('../src/HealthDataService');
const healthConnect = require('react-native-health-connect');

/** Local date and time, as someone in that time zone reads it. */
const local = iso => {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const windows = () =>
  healthConnect.aggregateRecord.mock.calls.map(([request]) => [
    local(request.timeRangeFilter.startTime),
    local(request.timeRangeFilter.endTime),
  ]);

beforeEach(() => jest.clearAllMocks());

it('the time zone is really in effect for this file', () => {
  // 29 March 2026 is 23 hours long in London.
  expect(new Date(2026, 2, 30) - new Date(2026, 2, 29)).toBe(23 * 60 * 60 * 1000);
});

it('keeps every day midnight to midnight when the clocks go forward', async () => {
  const days = await new HealthDataService().getStepsData(
    new Date(2026, 2, 28),
    new Date(2026, 2, 31),
  );

  expect(windows()).toEqual([
    ['2026-03-28 00:00', '2026-03-29 00:00'],
    ['2026-03-29 00:00', '2026-03-30 00:00'],
    ['2026-03-30 00:00', '2026-03-31 00:00'],
  ]);
  expect(days.map(d => local(d.startDate))).toEqual([
    '2026-03-28 00:00',
    '2026-03-29 00:00',
    '2026-03-30 00:00',
  ]);
});

it('keeps every day midnight to midnight when the clocks go back', async () => {
  await new HealthDataService().getStepsData(
    new Date(2026, 9, 24),
    new Date(2026, 9, 27),
  );

  expect(windows()).toEqual([
    ['2026-10-24 00:00', '2026-10-25 00:00'],
    ['2026-10-25 00:00', '2026-10-26 00:00'],
    ['2026-10-26 00:00', '2026-10-27 00:00'],
  ]);
});

it('ends the last day at the end of the range', async () => {
  await new HealthDataService().getStepsData(
    new Date(2026, 2, 29),
    new Date(2026, 2, 30, 9, 30),
  );

  expect(windows()).toEqual([
    ['2026-03-29 00:00', '2026-03-30 00:00'],
    ['2026-03-30 00:00', '2026-03-30 09:30'],
  ]);
});
