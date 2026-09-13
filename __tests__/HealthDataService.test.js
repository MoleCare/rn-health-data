/* eslint-env jest, node */

// The numbers the app shows come from here, so these pin the units and field
// names of the two health libraries (react-native-health 1.19 on iOS,
// react-native-health-connect 3.5 on Android):
// - Health Connect energy is {inKilocalories}, volume is {inLiters}; there is no `.value`.
// - HealthKit workout duration is in seconds.
// - Sleep counts only time asleep, and overlapping samples once.
// - Health Connect totals come from aggregateRecord, which removes duplicates.

const mockPlatform = {OS: 'android'};
const mockHealthKit = {
  isAvailable: jest.fn(),
  getAnchoredWorkouts: jest.fn(),
  getSleepSamples: jest.fn(),
};

jest.mock('react-native', () => ({
  Platform: mockPlatform,
  NativeModules: {AppleHealthKit: mockHealthKit},
}));

jest.mock(
  'react-native-health-connect',
  () => ({
    readRecords: jest.fn(),
    aggregateRecord: jest.fn(),
  }),
  {virtual: true},
);

// require, not import: an import is hoisted above the mock objects above, and
// the react-native mock would read them before they exist.
const {HealthDataService, mergedDurationMs} = require('../src/HealthDataService');

const healthConnect = require('react-native-health-connect');

const at = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// HealthKit native methods take (options, callback).
const answers = value => (options, callback) => callback(null, value);

describe('mergedDurationMs', () => {
  it('counts overlapping intervals once', () => {
    const hour = 60 * 60 * 1000;
    expect(
      mergedDurationMs([
        {start: at('01:00'), end: at('03:00')},
        {start: at('02:00'), end: at('04:00')},
        {start: at('05:00'), end: at('06:00')},
      ]),
    ).toBe(4 * hour);
  });

  it('ignores empty and backwards intervals', () => {
    expect(
      mergedDurationMs([
        {start: at('03:00'), end: at('03:00')},
        {start: at('04:00'), end: at('02:00')},
        {start: 'not a date', end: at('02:00')},
      ]),
    ).toBe(0);
  });
});

describe('Android (Health Connect)', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'android';
    service = new HealthDataService();
  });

  it("today's steps are Health Connect's de-duplicated total", async () => {
    healthConnect.aggregateRecord.mockResolvedValue({COUNT_TOTAL: 8421});

    await expect(service.getTodaySteps()).resolves.toBe(8421);
    expect(healthConnect.aggregateRecord).toHaveBeenCalledWith(
      expect.objectContaining({recordType: 'Steps'}),
    );
    expect(healthConnect.readRecords).not.toHaveBeenCalled();
  });

  it('water intake reads VOLUME_TOTAL.inLiters (it used to be always empty)', async () => {
    healthConnect.aggregateRecord.mockResolvedValue({
      VOLUME_TOTAL: {inLiters: 1.75, inMilliliters: 1750, inFluidOuncesUs: 59.2},
    });
    await expect(service.getTodayWaterIntake()).resolves.toBe(1.75);

    healthConnect.aggregateRecord.mockResolvedValue({VOLUME_TOTAL: {inLiters: 0}});
    await expect(service.getTodayWaterIntake()).resolves.toBeNull();
  });

  it('active energy reads energy.inKilocalories (it used to be always 0)', async () => {
    healthConnect.readRecords.mockResolvedValue({
      records: [
        {startTime: at('08:00'), endTime: at('09:00'), energy: {inKilocalories: 312.5}},
      ],
    });

    const [entry] = await service.getActiveEnergyBurned(new Date(at('00:00')), new Date());
    expect(entry.value).toBe(312.5);
  });

  it('follows every page of records', async () => {
    healthConnect.readRecords
      .mockResolvedValueOnce({
        records: [{startTime: at('07:00'), endTime: at('07:30'), exerciseType: 56}],
        pageToken: 'next',
      })
      .mockResolvedValueOnce({
        records: [{startTime: at('18:00'), endTime: at('18:20'), exerciseType: 56}],
      });

    const workouts = await service.getWorkouts(new Date(at('00:00')), new Date());

    expect(workouts).toHaveLength(2);
    expect(healthConnect.readRecords).toHaveBeenCalledTimes(2);
    expect(healthConnect.readRecords.mock.calls[1][1].pageToken).toBe('next');
  });

  it('sleep counts asleep stages only, and overlapping sessions once', async () => {
    healthConnect.readRecords.mockResolvedValue({
      records: [
        {
          startTime: at('00:00'),
          endTime: at('07:00'),
          stages: [
            {startTime: at('00:00'), endTime: at('00:30'), stage: 1}, // awake
            {startTime: at('00:30'), endTime: at('02:30'), stage: 4}, // light
            {startTime: at('02:30'), endTime: at('04:30'), stage: 5}, // deep
            {startTime: at('04:30'), endTime: at('05:00'), stage: 3}, // out of bed
            {startTime: at('05:00'), endTime: at('06:00'), stage: 6}, // REM
          ],
        },
        // A second app recorded the same hour without stages: counted once.
        {startTime: at('05:00'), endTime: at('06:00')},
      ],
    });

    await expect(service.getLastNightSleepHours()).resolves.toBe(5);
  });
});

describe('iOS (HealthKit)', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'ios';
    service = new HealthDataService();
  });

  it('outdoor minutes convert HealthKit seconds (they used to be 60x too high)', async () => {
    mockHealthKit.getAnchoredWorkouts.mockImplementation(
      answers({
        data: [
          {activityName: 'Running', duration: 1800, start: at('07:00'), end: at('07:30')},
          {activityName: 'Yoga', duration: 3600, start: at('08:00'), end: at('09:00')},
        ],
      }),
    );

    await expect(service.getTodayOutdoorWorkoutMinutes()).resolves.toBe(30);
  });

  it('sleep leaves out time in bed and awake, and merges overlapping stages', async () => {
    mockHealthKit.getSleepSamples.mockImplementation(
      answers([
        {value: 'INBED', startDate: at('23:00'), endDate: at('07:00')},
        {value: 'ASLEEP', startDate: at('00:00'), endDate: at('03:00')},
        {value: 'CORE', startDate: at('02:00'), endDate: at('04:00')},
        {value: 'AWAKE', startDate: at('04:00'), endDate: at('04:30')},
        {value: 'REM', startDate: at('04:30'), endDate: at('05:30')},
      ]),
    );

    await expect(service.getLastNightSleepHours()).resolves.toBe(5);
  });
});
