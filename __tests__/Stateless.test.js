/* eslint-env jest, node */

// No module state and no shared instance: each service is created by the app
// with its own options, and one service's settings never reach another.

const mockPlatform = {OS: 'android'};
const mockHealthKit = {
  isAvailable: jest.fn(),
  getAnchoredWorkouts: jest.fn(),
};

jest.mock('react-native', () => ({
  Platform: mockPlatform,
  NativeModules: {AppleHealthKit: mockHealthKit},
}));

jest.mock(
  'react-native-health-connect',
  () => ({
    getSdkStatus: jest.fn(),
    readRecords: jest.fn(),
    aggregateRecord: jest.fn(),
  }),
  {virtual: true},
);

// require, not import: see HealthDataService.test.js.
const api = require('../src');
const {HealthDataService} = api;
const healthConnect = require('react-native-health-connect');

const answers = value => (options, callback) => callback(null, value);

const midnightDaysAgo = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'android';
});

describe('the public API', () => {
  it('has no shared instance and no global configuration', () => {
    expect(api.default).toBeUndefined();
    expect(api.configure).toBeUndefined();
    expect(api.getConfig).toBeUndefined();
    expect(api.resetConfig).toBeUndefined();
  });

  it('freezes its defaults', () => {
    // Object.isFrozen(undefined) is true, so check the object exists first.
    expect(api.DEFAULT_OPTIONS).toMatchObject({
      sleepWindowStartHour: 18,
      sleepWindowEndHour: 12,
      summaryDays: 7,
    });
    expect(Object.isFrozen(api.DEFAULT_OPTIONS)).toBe(true);
    expect(Object.isFrozen(api.DEFAULT_OUTDOOR_ACTIVITIES_IOS)).toBe(true);
    expect(Object.isFrozen(api.DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID)).toBe(true);
    expect(Object.isFrozen(api.HEALTH_DATA_TYPES)).toBe(true);
  });

  it('has no module-level variables in its source', () => {
    const fs = require('fs');
    const path = require('path');
    const srcDir = path.join(__dirname, '..', 'src');
    for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
      expect([file, /^(let|var)\s/m.test(source)]).toEqual([file, false]);
    }
  });
});

describe('options belong to one service', () => {
  it('two services classify the same workout by their own lists', async () => {
    mockPlatform.OS = 'ios';
    mockHealthKit.getAnchoredWorkouts.mockImplementation(
      answers({data: [{activityName: 'Yoga', duration: 600, start: 'a', end: 'b'}]}),
    );

    const withYoga = new HealthDataService({outdoorActivitiesIos: ['Yoga']});
    const plain = new HealthDataService();

    expect((await withYoga.getWorkouts(new Date(), new Date()))[0].isOutdoor).toBe(true);
    expect((await plain.getWorkouts(new Date(), new Date()))[0].isOutdoor).toBe(false);
  });

  it('copies the options, so changing them afterwards changes nothing', async () => {
    mockPlatform.OS = 'ios';
    mockHealthKit.getAnchoredWorkouts.mockImplementation(
      answers({data: [{activityName: 'Yoga', duration: 600, start: 'a', end: 'b'}]}),
    );
    const list = ['Running'];
    const service = new HealthDataService({outdoorActivitiesIos: list});

    list.push('Yoga');

    expect((await service.getWorkouts(new Date(), new Date()))[0].isOutdoor).toBe(false);
    expect(Object.isFrozen(service.options)).toBe(true);
    expect(Object.isFrozen(service.options.outdoorActivitiesIos)).toBe(true);
  });

  it('refuses a mistyped or invalid option instead of ignoring it', () => {
    expect(() => new HealthDataService({outdoorActivities: []})).toThrow(/outdoorActivities/);
    expect(() => new HealthDataService({sleepWindowStartHour: 24})).toThrow(TypeError);
    expect(() => new HealthDataService({summaryDays: 0})).toThrow(TypeError);
    expect(() => new HealthDataService({outdoorExerciseTypesAndroid: ['56']})).toThrow(TypeError);
  });

  it('reads last night in the window the app chose', async () => {
    healthConnect.readRecords.mockResolvedValue({records: []});

    await new HealthDataService({sleepWindowStartHour: 20, sleepWindowEndHour: 10}).getLastNightSleepHours();

    const {startTime, endTime} = healthConnect.readRecords.mock.calls[0][1].timeRangeFilter;
    const yesterday20 = midnightDaysAgo(1);
    yesterday20.setHours(20);
    const today10 = midnightDaysAgo(0);
    today10.setHours(10);
    expect(startTime).toBe(yesterday20.toISOString());
    expect(endTime).toBe(today10.toISOString());
  });

  it('summarises the number of days the app chose', async () => {
    healthConnect.readRecords.mockResolvedValue({records: []});
    healthConnect.aggregateRecord.mockResolvedValue({COUNT_TOTAL: 0});

    await new HealthDataService({summaryDays: 3}).getWeeklyOutdoorSummary();

    const {startTime} = healthConnect.readRecords.mock.calls[0][1].timeRangeFilter;
    expect(startTime).toBe(midnightDaysAgo(3).toISOString());
  });
});

describe('nothing cached', () => {
  it('asks the platform whether health data is available every time', async () => {
    // Health Connect can be installed while the app runs; a cached "no" hid
    // it until the app restarted.
    healthConnect.getSdkStatus.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    const service = new HealthDataService();

    await expect(service.isAvailable()).resolves.toBe(false);
    await expect(service.isAvailable()).resolves.toBe(true);
    expect(healthConnect.getSdkStatus).toHaveBeenCalledTimes(2);
  });
});
