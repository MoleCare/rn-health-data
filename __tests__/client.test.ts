import * as fs from 'node:fs';
import * as path from 'node:path';

import * as api from '../src';
import * as healthConnectLoader from '../src/healthConnect';
import {
  DEFAULT_OPTIONS,
  HEALTH_DATA_TYPES,
  createHealthData,
  type HealthDataOptions,
  type HealthResult,
} from '../src';

jest.mock(
  'react-native',
  () => ({ Platform: { OS: 'android' }, NativeModules: {} }),
  { virtual: true }
);
jest.mock(
  'react-native-health-connect',
  () => ({
    getSdkStatus: jest.fn(),
    initialize: jest.fn(),
    requestPermission: jest.fn(),
    getGrantedPermissions: jest.fn(),
    readRecords: jest.fn(),
    aggregateRecord: jest.fn(),
  }),
  { virtual: true }
);

const rn = jest.requireMock<{
  Platform: { OS: string };
  NativeModules: Record<string, unknown>;
}>('react-native');
const hc = jest.requireMock<Record<string, jest.Mock>>(
  'react-native-health-connect'
);
const mock = (name: string): jest.Mock => {
  const fn = hc[name];
  if (!fn) throw new Error(`no mock ${name}`);
  return fn;
};

// Wednesday 10 June 2026, 21:00 local time (the suite runs in Europe/London).
const NOW = new Date(2026, 5, 10, 21, 0, 0, 0);

/** Local time on NOW's date (or `days` later), as an ISO string. */
const at = (hhmm: string, days = 0): string => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)), 0, 0);
  return d.toISOString();
};

const ALL_READ = [
  'Steps',
  'SleepSession',
  'ExerciseSession',
  'ActiveCaloriesBurned',
  'Hydration',
].map((recordType) => ({ accessType: 'read', recordType }));

const client = (options: HealthDataOptions = {}) =>
  createHealthData({ now: () => NOW, ...options });

/** The value of a result the test expects to succeed. */
function value<T>(result: HealthResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

/** HealthKit native methods take (options, callback) or (callback). */
const answers =
  (result: unknown) =>
  (...args: unknown[]) => {
    (args[args.length - 1] as (e: unknown, r: unknown) => void)(null, result);
  };

function useIos(module: Record<string, unknown> = {}) {
  rn.Platform.OS = 'ios';
  rn.NativeModules.AppleHealthKit = {
    isAvailable: jest.fn(answers(true)),
    ...module,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: a rejection set by one test must not
  // leak into the next.
  jest.resetAllMocks();
  rn.Platform.OS = 'android';
  delete rn.NativeModules.AppleHealthKit;
  mock('initialize').mockResolvedValue(true);
  mock('getGrantedPermissions').mockResolvedValue(ALL_READ);
  mock('readRecords').mockResolvedValue({ records: [] });
  mock('aggregateRecord').mockResolvedValue({});
});

describe('the public API', () => {
  it('is a factory: no class, no shared instance, no global configuration', () => {
    expect(typeof createHealthData).toBe('function');
    for (const gone of [
      'default',
      'HealthDataService',
      'configure',
      'getConfig',
      'resetConfig',
    ]) {
      expect(api).not.toHaveProperty(gone);
    }
  });

  it('freezes its defaults, its constants and every client', () => {
    const health = client();
    for (const frozen of [
      DEFAULT_OPTIONS,
      DEFAULT_OPTIONS.outdoorActivitiesIos,
      DEFAULT_OPTIONS.outdoorExerciseTypesAndroid,
      HEALTH_DATA_TYPES,
      health,
      health.options,
    ]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
  });

  it('has no module-level variables in its source', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    for (const file of fs
      .readdirSync(srcDir)
      .filter((f) => f.endsWith('.ts'))) {
      const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
      expect([file, /^(export\s+)?(let|var)\s/m.test(source)]).toEqual([
        file,
        false,
      ]);
    }
  });

  it('the iOS build never loads react-native-health-connect', async () => {
    // Metro resolves every require when it bundles, even one inside a try
    // block, so a reference in any file of the iOS build breaks apps that do
    // not install the Android library. Metro prefers name.ios.ts over name.ts.
    const srcDir = path.join(__dirname, '..', 'src');
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts'));
    const iosBuild = [
      ...files.filter(
        (f) =>
          !/\.(ios|android)\.ts$/.test(f) &&
          !files.includes(f.replace(/\.ts$/, '.ios.ts'))
      ),
      ...files.filter((f) => f.endsWith('.ios.ts')),
    ];
    const loadsIt =
      /require\(\s*['"]react-native-health-connect['"]\s*\)|from\s+['"]react-native-health-connect['"]/;
    for (const file of iosBuild) {
      expect([
        file,
        loadsIt.test(fs.readFileSync(path.join(srcDir, file), 'utf8')),
      ]).toEqual([file, false]);
    }
    const ios = (await import('../src/healthConnect.ios')) as {
      loadHealthConnect: () => unknown;
    };
    expect(ios.loadHealthConnect()).toBeNull();
  });
});

describe('options', () => {
  it('refuses a mistyped or invalid option instead of ignoring it', () => {
    const bad: unknown[] = [
      { outdoorActivities: [] },
      { sleepWindowStartHour: 24 },
      { sleepWindowEndHour: 1.5 },
      { summaryDays: 0 },
      { outdoorExerciseTypesAndroid: ['56'] },
      { outdoorActivitiesIos: 'Running' },
      { now: new Date() },
      null,
      42,
      [],
    ];
    for (const options of bad) {
      expect(() => createHealthData(options as HealthDataOptions)).toThrow(
        TypeError
      );
    }
  });

  it('copies the lists, so changing them afterwards changes nothing', async () => {
    useIos({
      getAnchoredWorkouts: jest.fn(
        answers({
          data: [
            {
              activityName: 'Yoga',
              duration: 600,
              start: at('07:00'),
              end: at('07:10'),
            },
          ],
        })
      ),
    });
    const list = ['Running'];
    const health = client({ outdoorActivitiesIos: list });
    list.push('Yoga');

    const [workout] = value(
      await health.getWorkouts({ start: new Date(at('00:00')), end: NOW })
    );
    expect(workout?.isOutdoor).toBe(false);
    expect(Object.isFrozen(health.options.outdoorActivitiesIos)).toBe(true);
  });

  it('two clients classify the same workout by their own lists', async () => {
    useIos({
      getAnchoredWorkouts: jest.fn(
        answers({
          data: [
            {
              activityName: 'Yoga',
              duration: 600,
              start: at('07:00'),
              end: at('07:10'),
            },
          ],
        })
      ),
    });
    const range = { start: new Date(at('00:00')), end: NOW };

    const withYoga = value(
      await client({ outdoorActivitiesIos: ['Yoga'] }).getWorkouts(range)
    );
    const plain = value(await client().getWorkouts(range));

    expect(withYoga[0]?.isOutdoor).toBe(true);
    expect(plain[0]?.isOutdoor).toBe(false);
  });

  it('uses the real clock by default', () => {
    const before = Date.now();
    const clock = DEFAULT_OPTIONS.now();
    expect(clock).toBeInstanceOf(Date);
    expect(clock.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rejects when the clock returns something that is not a date', async () => {
    const health = createHealthData({ now: () => new Date(Number.NaN) });
    await expect(health.getSteps()).rejects.toThrow(/now/);
  });
});

describe('availability', () => {
  it('maps the Health Connect SDK status, asking every time', async () => {
    mock('getSdkStatus')
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const health = client();

    expect(value(await health.getAvailability())).toBe('available');
    expect(value(await health.getAvailability())).toBe('update_required');
    expect(value(await health.getAvailability())).toBe('not_installed');
    expect(mock('getSdkStatus')).toHaveBeenCalledTimes(3);
  });

  it('reports a Health Connect error as an error, not as unavailable', async () => {
    mock('getSdkStatus').mockRejectedValue(
      Object.assign(new Error('boom'), { code: 'UNKNOWN_ERROR' })
    );
    expect(await client().getAvailability()).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'boom' },
    });
  });

  it('asks HealthKit on iOS', async () => {
    useIos();
    expect(value(await client().getAvailability())).toBe('available');

    useIos({ isAvailable: jest.fn(answers(false)) });
    expect(value(await client().getAvailability())).toBe(
      'unsupported_platform'
    );

    useIos({
      isAvailable: jest.fn((cb: (e: unknown) => void) => {
        cb('HealthKit exploded');
      }),
    });
    expect(await client().getAvailability()).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'HealthKit exploded' },
    });
  });

  it('says when the HealthKit module is not linked', async () => {
    rn.Platform.OS = 'ios';
    expect(value(await client().getAvailability())).toBe('module_missing');
    expect(await client().getSteps()).toMatchObject({
      ok: false,
      error: { code: 'module_missing' },
    });
  });

  it('says when react-native-health-connect is not installed', async () => {
    // Loading a package that is not installed throws.
    const cause = new Error("Cannot find module 'react-native-health-connect'");
    jest
      .spyOn(healthConnectLoader, 'loadHealthConnect')
      .mockImplementation(() => {
        throw cause;
      });

    expect(value(await client().getAvailability())).toBe('module_missing');
    expect(await client().getSteps()).toMatchObject({
      ok: false,
      error: { code: 'module_missing', cause },
    });
    expect(mock('getSdkStatus')).not.toHaveBeenCalled();

    // A loader that finds nothing is the same answer.
    jest.spyOn(healthConnectLoader, 'loadHealthConnect').mockReturnValue(null);
    expect(await client().getSteps()).toMatchObject({
      ok: false,
      error: { code: 'module_missing' },
    });
  });

  it('says when the platform has no health store at all', async () => {
    rn.Platform.OS = 'web';
    expect(value(await client().getAvailability())).toBe(
      'unsupported_platform'
    );
    expect(await client().getSteps()).toMatchObject({
      ok: false,
      error: { code: 'unsupported_platform' },
    });
    expect(await client().requestPermissions()).toMatchObject({
      ok: false,
      error: { code: 'unsupported_platform' },
    });
    expect(await client().getPermissionStatus()).toMatchObject({ ok: false });
  });
});

describe('permissions', () => {
  beforeEach(() => {
    mock('requestPermission').mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'Hydration' },
    ]);
  });

  it('asks for read access to all five kinds by default, and says what was granted', async () => {
    const status = value(await client().requestPermissions());

    expect(mock('requestPermission').mock.calls[0]?.[0]).toEqual(
      ALL_READ.map((p) => ({ ...p }))
    );
    expect(status).toEqual({
      known: true,
      granted: ['steps', 'water'],
      denied: ['sleep', 'workouts', 'activeEnergy'],
    });
  });

  it('asks only for the listed kinds, once each', async () => {
    await client().requestPermissions(['water', 'steps', 'water']);

    expect(mock('requestPermission').mock.calls[0]?.[0]).toEqual([
      { accessType: 'read', recordType: 'Hydration' },
      { accessType: 'read', recordType: 'Steps' },
    ]);
  });

  it('on iOS asks HealthKit for read access only, and cannot know the answer', async () => {
    const initHealthKit = jest.fn(answers(true));
    useIos({ initHealthKit });

    const status = value(
      await client().requestPermissions(['sleep', 'workouts'])
    );

    expect(initHealthKit.mock.calls[0]?.[0]).toEqual({
      permissions: { read: ['SleepAnalysis', 'Workout'], write: [] },
    });
    expect(status).toEqual({ known: false, requested: ['sleep', 'workouts'] });
  });

  it('reports a HealthKit error from the permission sheet', async () => {
    useIos({
      initHealthKit: jest.fn((_: unknown, cb: (e: unknown) => void) => {
        cb(new Error('denied by policy'));
      }),
    });
    expect(await client().requestPermissions()).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'denied by policy' },
    });
  });

  it('refuses an unknown, empty or missing list before asking the user anything', async () => {
    const health = client();
    for (const types of [['steps', 'heartRate'], [], 'steps']) {
      await expect(health.requestPermissions(types as never)).rejects.toThrow(
        TypeError
      );
    }
    expect(mock('requestPermission')).not.toHaveBeenCalled();
  });

  it('says Health Connect is unavailable when it cannot start', async () => {
    mock('initialize').mockResolvedValue(false);
    expect(await client().requestPermissions()).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    });
    expect(await client().getPermissionStatus()).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    });
    expect(mock('requestPermission')).not.toHaveBeenCalled();
  });

  it('maps a Health Connect rejection', async () => {
    mock('requestPermission').mockRejectedValue(
      Object.assign(new Error('no'), { code: 'SERVICE_UNAVAILABLE' })
    );
    expect(await client().requestPermissions()).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    });
    mock('getGrantedPermissions').mockRejectedValue(new Error('odd'));
    expect(await client().getPermissionStatus()).toMatchObject({
      ok: false,
      error: { code: 'native_error' },
    });
  });

  it('checks status without asking: known on Android, not on iOS', async () => {
    mock('getGrantedPermissions').mockResolvedValue([
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'write', recordType: 'Steps' },
    ]);
    expect(
      value(await client().getPermissionStatus(['sleep', 'steps']))
    ).toEqual({
      known: true,
      granted: ['sleep'],
      denied: ['steps'],
    });
    expect(mock('requestPermission')).not.toHaveBeenCalled();

    const initHealthKit = jest.fn();
    useIos({ initHealthKit });
    expect(value(await client().getPermissionStatus())).toEqual({
      known: false,
      requested: HEALTH_DATA_TYPES,
    });
    expect(initHealthKit).not.toHaveBeenCalled();
  });
});

describe('reading on Android (Health Connect)', () => {
  it("today's steps are Health Connect's de-duplicated total, midnight to now", async () => {
    mock('aggregateRecord').mockResolvedValue({ COUNT_TOTAL: 8421 });

    expect(value(await client().getSteps())).toBe(8421);
    expect(mock('initialize')).toHaveBeenCalled();
    expect(mock('aggregateRecord')).toHaveBeenCalledWith({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime: at('00:00'),
        endTime: NOW.toISOString(),
      },
    });
    expect(mock('readRecords')).not.toHaveBeenCalled();
  });

  it('reads a whole past day, and nothing for a day that has not started', async () => {
    mock('aggregateRecord').mockResolvedValue({ COUNT_TOTAL: 100 });
    await client().getSteps(new Date(at('15:00', -2)));
    expect(mock('aggregateRecord').mock.calls[0]?.[0]).toMatchObject({
      timeRangeFilter: { startTime: at('00:00', -2), endTime: at('00:00', -1) },
    });

    mock('aggregateRecord').mockClear();
    expect(value(await client().getSteps(new Date(at('09:00', 3))))).toBe(0);
    expect(
      value(await client().getWaterLitres(new Date(at('09:00', 3))))
    ).toBeNull();
    expect(mock('aggregateRecord')).not.toHaveBeenCalled();
  });

  it('says read access is missing instead of returning zero', async () => {
    mock('getGrantedPermissions').mockResolvedValue([
      { accessType: 'read', recordType: 'Hydration' },
    ]);

    const result = await client().getSteps();

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'not_permitted' },
    });
    expect(!result.ok && result.error.message).toMatch(/steps/);
    expect(mock('aggregateRecord')).not.toHaveBeenCalled();
  });

  it('starts Health Connect before reading, and says when it cannot', async () => {
    mock('initialize').mockResolvedValue(false);
    expect(await client().getWaterLitres()).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    });
    expect(mock('aggregateRecord')).not.toHaveBeenCalled();
  });

  it('maps Health Connect rejections during a read', async () => {
    const cases: [string, string][] = [
      ['PERMISSION_ERROR', 'not_permitted'],
      ['SDK_VERSION_ERROR', 'unavailable'],
      ['CLIENT_NOT_INITIALIZED', 'unavailable'],
      ['IO_EXCEPTION', 'native_error'],
    ];
    for (const [nativeCode, code] of cases) {
      const cause = Object.assign(new Error(nativeCode), { code: nativeCode });
      mock('aggregateRecord').mockRejectedValueOnce(cause);
      expect(await client().getSteps()).toEqual({
        ok: false,
        error: { code, message: nativeCode, cause },
      });
    }
    mock('readRecords').mockRejectedValueOnce('a string, not an Error');
    expect(
      await client().getSleep({ start: new Date(at('00:00')), end: NOW })
    ).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'a string, not an Error' },
    });
  });

  it('water reads VOLUME_TOTAL.inLiters, and is null when nothing is recorded', async () => {
    mock('aggregateRecord').mockResolvedValue({
      VOLUME_TOTAL: { inLiters: 1.75, inMilliliters: 1750 },
    });
    expect(value(await client().getWaterLitres())).toBe(1.75);

    mock('aggregateRecord').mockResolvedValue({
      VOLUME_TOTAL: { inLiters: 0 },
    });
    expect(value(await client().getWaterLitres())).toBeNull();

    mock('aggregateRecord').mockResolvedValue(null);
    expect(value(await client().getWaterLitres())).toBeNull();
  });

  it('active energy reads energy.inKilocalories', async () => {
    mock('readRecords').mockResolvedValue({
      records: [
        {
          startTime: at('08:00'),
          endTime: at('09:00'),
          energy: { inKilocalories: 312.5 },
        },
        { startTime: at('10:00'), endTime: at('11:00') },
      ],
    });

    expect(
      value(
        await client().getActiveEnergy({
          start: new Date(at('00:00')),
          end: NOW,
        })
      )
    ).toEqual([
      { startDate: at('08:00'), endDate: at('09:00'), kilocalories: 312.5 },
      { startDate: at('10:00'), endDate: at('11:00'), kilocalories: 0 },
    ]);
  });

  it('follows every page of records', async () => {
    mock('readRecords')
      .mockResolvedValueOnce({
        records: [
          { startTime: at('07:00'), endTime: at('07:30'), exerciseType: 56 },
        ],
        pageToken: 'next',
      })
      .mockResolvedValueOnce(null);

    const workouts = value(
      await client().getWorkouts({ start: new Date(at('00:00')), end: NOW })
    );

    expect(workouts).toHaveLength(1);
    expect(mock('readRecords')).toHaveBeenCalledTimes(2);
    expect(mock('readRecords').mock.calls[1]?.[1]).toMatchObject({
      pageToken: 'next',
    });
  });

  it('gives sleep stages the same names as on iOS', async () => {
    mock('readRecords').mockResolvedValue({
      records: [
        {
          startTime: at('00:00'),
          endTime: at('07:00'),
          stages: [0, 1, 2, 3, 4, 5, 6, 9].map((stage, i) => ({
            startTime: at(`0${String(i)}:00`),
            endTime: at(`0${String(i)}:30`),
            stage,
          })),
        },
        { startTime: at('08:00'), endTime: at('09:00') },
      ],
    });

    const stages = value(
      await client().getSleep({ start: new Date(at('00:00')), end: NOW })
    ).map((s) => s.stage);

    expect(stages).toEqual([
      'unknown',
      'awake',
      'asleep',
      'out_of_bed',
      'light',
      'deep',
      'rem',
      'unknown',
      'asleep', // a session without stages is recorded sleep as a whole
    ]);
  });

  it('sleep hours count asleep stages only, and overlapping sessions once', async () => {
    mock('readRecords').mockResolvedValue({
      records: [
        {
          startTime: at('00:00'),
          endTime: at('07:00'),
          stages: [
            { startTime: at('00:00'), endTime: at('00:30'), stage: 1 }, // awake
            { startTime: at('00:30'), endTime: at('02:30'), stage: 4 }, // light
            { startTime: at('02:30'), endTime: at('04:30'), stage: 5 }, // deep
            { startTime: at('04:30'), endTime: at('05:00'), stage: 3 }, // out of bed
            { startTime: at('05:00'), endTime: at('06:00'), stage: 6 }, // REM
          ],
        },
        // A second app recorded the same hour without stages: counted once.
        { startTime: at('05:00'), endTime: at('06:00') },
      ],
    });

    expect(value(await client().getSleepHours())).toBe(5);
    expect(mock('readRecords').mock.calls[0]?.[1]).toMatchObject({
      timeRangeFilter: { startTime: at('18:00', -1), endTime: at('12:00') },
    });
  });

  it('sleep hours use the window the app chose, and are null with no sleep', async () => {
    const health = client({ sleepWindowStartHour: 20, sleepWindowEndHour: 10 });

    expect(
      value(await health.getSleepHours(new Date(at('15:00', -1))))
    ).toBeNull();
    expect(mock('readRecords').mock.calls[0]?.[1]).toMatchObject({
      timeRangeFilter: { startTime: at('20:00', -2), endTime: at('10:00', -1) },
    });
  });

  it('workouts have minutes and the outdoor flag', async () => {
    mock('readRecords').mockResolvedValue({
      records: [
        {
          startTime: at('07:00'),
          endTime: at('07:45'),
          exerciseType: 56,
          title: 'Morning run',
        },
        { startTime: at('18:00'), endTime: at('18:30'), exerciseType: 999 },
      ],
    });

    expect(
      value(
        await client().getWorkouts({ start: new Date(at('00:00')), end: NOW })
      )
    ).toEqual([
      {
        activityType: 'Morning run',
        durationMinutes: 45,
        startDate: at('07:00'),
        endDate: at('07:45'),
        isOutdoor: true,
      },
      {
        activityType: 'Exercise 999',
        durationMinutes: 30,
        startDate: at('18:00'),
        endDate: at('18:30'),
        isOutdoor: false,
      },
    ]);
    expect(value(await client().getOutdoorMinutes())).toBe(45);
  });

  it('summarises outdoor minutes, active days and average steps', async () => {
    const health = client({ summaryDays: 2 });
    mock('readRecords').mockResolvedValue({
      records: [
        {
          startTime: at('07:00', -2),
          endTime: at('07:40', -2),
          exerciseType: 56,
        },
        {
          startTime: at('07:00', -1),
          endTime: at('07:20', -1),
          exerciseType: 79,
        },
        {
          startTime: at('12:00', -1),
          endTime: at('12:30', -1),
          exerciseType: 999,
        },
      ],
    });
    mock('aggregateRecord')
      .mockResolvedValueOnce({ COUNT_TOTAL: 4000 })
      .mockResolvedValueOnce({ COUNT_TOTAL: 0 })
      .mockResolvedValueOnce({ COUNT_TOTAL: 8000 });

    expect(value(await health.getOutdoorSummary())).toEqual({
      totalOutdoorMinutes: 60,
      averageDailySteps: 6000,
      activeDays: 2,
    });
    expect(mock('readRecords').mock.calls[0]?.[1]).toMatchObject({
      timeRangeFilter: {
        startTime: at('00:00', -2),
        endTime: NOW.toISOString(),
      },
    });
  });

  it('a summary fails when either read fails', async () => {
    mock('getGrantedPermissions').mockResolvedValue([
      { accessType: 'read', recordType: 'ExerciseSession' },
    ]);
    expect(await client().getOutdoorSummary()).toMatchObject({
      ok: false,
      error: { code: 'not_permitted' },
    });
    mock('getGrantedPermissions').mockResolvedValue([]);
    expect(await client().getOutdoorSummary()).toMatchObject({ ok: false });
  });
});

describe('reading on iOS (HealthKit)', () => {
  it("today's steps come from HealthKit's day total", async () => {
    const getStepCount = jest.fn(answers({ value: 5210 }));
    useIos({ getStepCount });

    expect(value(await client().getSteps())).toBe(5210);
    expect(getStepCount.mock.calls[0]?.[0]).toEqual({ date: at('00:00') });

    useIos({ getStepCount: jest.fn(answers(null)) });
    expect(value(await client().getSteps())).toBe(0);
  });

  it('daily steps get a local date, in order, without empty days', async () => {
    useIos({
      getDailyStepCountSamples: jest.fn(
        answers([
          { value: 900, startDate: at('00:00'), endDate: at('00:00', 1) },
          { value: 0, startDate: at('00:00', -2), endDate: at('00:00', -1) },
          { value: 1200, startDate: at('00:00', -1), endDate: at('00:00') },
        ])
      ),
    });

    expect(
      value(
        await client().getDailySteps({
          start: new Date(at('00:00', -2)),
          end: NOW,
        })
      )
    ).toEqual([
      {
        date: '2026-06-09',
        startDate: at('00:00', -1),
        endDate: at('00:00'),
        steps: 1200,
      },
      {
        date: '2026-06-10',
        startDate: at('00:00'),
        endDate: at('00:00', 1),
        steps: 900,
      },
    ]);
  });

  it('outdoor minutes convert HealthKit seconds', async () => {
    useIos({
      getAnchoredWorkouts: jest.fn(
        answers({
          data: [
            {
              activityName: 'Running',
              duration: 1800,
              start: at('07:00'),
              end: at('07:30'),
            },
            {
              activityName: 'Yoga',
              duration: 3600,
              start: at('08:00'),
              end: at('09:00'),
            },
            { start: at('10:00'), end: at('10:05') },
          ],
        })
      ),
    });

    expect(value(await client().getOutdoorMinutes())).toBe(30);
    const workouts = value(
      await client().getWorkouts({ start: new Date(at('00:00')), end: NOW })
    );
    expect(workouts[2]).toMatchObject({
      activityType: 'Unknown',
      durationMinutes: 0,
      isOutdoor: false,
    });
  });

  it('sleep leaves out time in bed and awake, and merges overlapping stages', async () => {
    const samples = [
      { value: 'INBED', startDate: at('23:00', -1), endDate: at('07:00') },
      { value: 'ASLEEP', startDate: at('00:00'), endDate: at('03:00') },
      { value: 'CORE', startDate: at('02:00'), endDate: at('04:00') },
      { value: 'AWAKE', startDate: at('04:00'), endDate: at('04:30') },
      { value: 'REM', startDate: at('04:30'), endDate: at('05:30') },
      { value: 'SOMETHING_NEW', startDate: at('05:30'), endDate: at('06:00') },
    ];
    useIos({ getSleepSamples: jest.fn(answers(samples)) });

    expect(value(await client().getSleepHours())).toBe(5);
    expect(
      value(
        await client().getSleep({ start: new Date(at('00:00', -1)), end: NOW })
      ).map((s) => s.stage)
    ).toEqual(['in_bed', 'asleep', 'light', 'awake', 'rem', 'unknown']);
  });

  it('water and energy read HealthKit values', async () => {
    useIos({
      getWater: jest.fn(answers({ value: 0.5 })),
      getActiveEnergyBurned: jest.fn(
        answers([{ value: 120, startDate: at('08:00'), endDate: at('09:00') }])
      ),
    });

    expect(value(await client().getWaterLitres())).toBe(0.5);
    expect(
      value(
        await client().getActiveEnergy({
          start: new Date(at('00:00')),
          end: NOW,
        })
      )
    ).toEqual([
      { startDate: at('08:00'), endDate: at('09:00'), kilocalories: 120 },
    ]);

    useIos({
      getWater: jest.fn(answers(null)),
      getActiveEnergyBurned: jest.fn(answers(null)),
    });
    expect(value(await client().getWaterLitres())).toBeNull();
    expect(
      value(
        await client().getActiveEnergy({
          start: new Date(at('00:00')),
          end: NOW,
        })
      )
    ).toEqual([]);
  });

  it('empty HealthKit answers are empty lists, not errors', async () => {
    useIos({
      getDailyStepCountSamples: jest.fn(answers(null)),
      getSleepSamples: jest.fn(answers(null)),
      getAnchoredWorkouts: jest.fn(answers(null)),
    });
    const range = { start: new Date(at('00:00')), end: NOW };

    expect(value(await client().getDailySteps(range))).toEqual([]);
    expect(value(await client().getSleep(range))).toEqual([]);
    expect(value(await client().getWorkouts(range))).toEqual([]);
  });

  it('reports a HealthKit error, including one thrown synchronously', async () => {
    useIos({
      getWater: jest.fn((_: unknown, cb: (e: unknown) => void) => {
        cb(new Error('not authorised'));
      }),
      getStepCount: jest.fn(() => {
        throw new Error('bridge gone');
      }),
      getSleepSamples: jest.fn(() => {
        throw 'plain string';
      }),
    });

    expect(await client().getWaterLitres()).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'not authorised' },
    });
    expect(await client().getSteps()).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'bridge gone' },
    });
    expect(await client().getSleepHours()).toMatchObject({
      ok: false,
      error: { code: 'native_error', message: 'plain string' },
    });
  });
});

describe('arguments', () => {
  it('rejects an invalid range or day before reading anything', async () => {
    const health = client();
    const invalid: unknown[] = [
      undefined,
      { start: new Date(), end: 'tomorrow' },
      { start: new Date(Number.NaN), end: new Date() },
      { start: new Date(at('10:00')), end: new Date(at('09:00')) },
    ];
    for (const range of invalid) {
      await expect(health.getWorkouts(range as never)).rejects.toThrow(
        TypeError
      );
      await expect(health.getDailySteps(range as never)).rejects.toThrow(
        TypeError
      );
      await expect(health.getActiveEnergy(range as never)).rejects.toThrow(
        TypeError
      );
      await expect(health.getSleep(range as never)).rejects.toThrow(TypeError);
    }
    for (const call of [
      () => health.getSteps(new Date('nope')),
      () => health.getWaterLitres('2026-06-10' as never),
      () => health.getOutdoorMinutes(new Date(Number.NaN)),
      () => health.getSleepHours(new Date(Number.NaN)),
    ]) {
      await expect(call()).rejects.toThrow(TypeError);
    }
    expect(mock('readRecords')).not.toHaveBeenCalled();
    expect(mock('aggregateRecord')).not.toHaveBeenCalled();
  });
});
