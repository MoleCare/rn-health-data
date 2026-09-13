import { Platform } from 'react-native';

import {
  loadHealthConnect,
  type HealthConnectModule,
  type HealthConnectPermission,
  type TimeRangeFilter,
} from './healthConnect';
import {
  callHealthKit,
  loadHealthKit,
  type HealthKitModule,
} from './healthKit';
import {
  resolveOptions,
  type HealthDataOptions,
  type ResolvedOptions,
} from './options';
import {
  addDays,
  atHour,
  isValidDate,
  localDateKey,
  mergedDurationMs,
  startOfDay,
} from './time';
import type {
  Availability,
  DailySteps,
  DateRange,
  EnergySample,
  HealthErrorCode,
  HealthDataType,
  HealthResult,
  OutdoorSummary,
  PermissionStatus,
  SleepInterval,
  SleepStage,
  Workout,
} from './types';

/** What each kind of data is called on each platform. */
const PLATFORM_TYPES: Readonly<
  Record<HealthDataType, { readonly ios: string; readonly android: string }>
> = Object.freeze({
  steps: { ios: 'StepCount', android: 'Steps' },
  sleep: { ios: 'SleepAnalysis', android: 'SleepSession' },
  workouts: { ios: 'Workout', android: 'ExerciseSession' },
  activeEnergy: { ios: 'ActiveEnergyBurned', android: 'ActiveCaloriesBurned' },
  water: { ios: 'Water', android: 'Hydration' },
});

export const HEALTH_DATA_TYPES: readonly HealthDataType[] = Object.freeze([
  'steps',
  'sleep',
  'workouts',
  'activeEnergy',
  'water',
]);

// HealthKit sleep values. CORE is Apple's name for light sleep.
const IOS_SLEEP_STAGES: Readonly<Record<string, SleepStage>> = Object.freeze({
  INBED: 'in_bed',
  ASLEEP: 'asleep',
  CORE: 'light',
  DEEP: 'deep',
  REM: 'rem',
  AWAKE: 'awake',
});

// Health Connect SleepStageType, by number.
const ANDROID_SLEEP_STAGES: readonly SleepStage[] = Object.freeze([
  'unknown', // 0 UNKNOWN
  'awake', // 1 AWAKE
  'asleep', // 2 SLEEPING
  'out_of_bed', // 3 OUT_OF_BED
  'light', // 4 LIGHT
  'deep', // 5 DEEP
  'rem', // 6 REM
]);

const ASLEEP: readonly SleepStage[] = Object.freeze([
  'asleep',
  'light',
  'deep',
  'rem',
]);

// Health Connect SdkAvailabilityStatus.
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;
const SDK_AVAILABLE = 3;

export interface HealthData {
  /** The frozen options this client was created with. */
  readonly options: ResolvedOptions;
  /** Asked of the platform every time; never cached. */
  getAvailability(): Promise<HealthResult<Availability>>;
  /**
   * Ask the user for read access, only to the types listed (all by default).
   * Nothing is ever written. On iOS, call it once per app launch before
   * reading: HealthKit only shows its sheet for types not yet decided.
   */
  requestPermissions(
    types?: readonly HealthDataType[]
  ): Promise<HealthResult<PermissionStatus>>;
  /** Without asking. Known on Android; never known on iOS. */
  getPermissionStatus(
    types?: readonly HealthDataType[]
  ): Promise<HealthResult<PermissionStatus>>;
  /** Steps on one local calendar day (today by default), up to now. */
  getSteps(day?: Date): Promise<HealthResult<number>>;
  /** One entry per local calendar day that has steps. */
  getDailySteps(range: DateRange): Promise<HealthResult<DailySteps[]>>;
  getActiveEnergy(range: DateRange): Promise<HealthResult<EnergySample[]>>;
  /** Sleep stages in the range, the same stage names on both platforms. */
  getSleep(range: DateRange): Promise<HealthResult<SleepInterval[]>>;
  /**
   * Hours asleep on the night ending on `night` (today by default): from
   * sleepWindowStartHour the day before to sleepWindowEndHour that day. Only
   * time asleep counts, and overlapping samples count once. `null` when
   * nothing was recorded.
   */
  getSleepHours(night?: Date): Promise<HealthResult<number | null>>;
  getWorkouts(range: DateRange): Promise<HealthResult<Workout[]>>;
  /** Outdoor workout minutes on one local calendar day (today by default). */
  getOutdoorMinutes(day?: Date): Promise<HealthResult<number>>;
  /** Litres of water on one local calendar day, or `null` when none recorded. */
  getWaterLitres(day?: Date): Promise<HealthResult<number | null>>;
  /** From midnight `summaryDays` days ago until now. */
  getOutdoorSummary(): Promise<HealthResult<OutdoorSummary>>;
}

type Backend =
  | { readonly platform: 'ios'; readonly healthKit: HealthKitModule }
  | {
      readonly platform: 'android';
      readonly healthConnect: HealthConnectModule;
    };

interface HcInterval {
  startTime: string;
  endTime: string;
}
interface HcEnergyRecord extends HcInterval {
  energy?: { inKilocalories?: number };
}
interface HcSleepRecord extends HcInterval {
  stages?: { startTime: string; endTime: string; stage: number }[];
}
interface HcExerciseRecord extends HcInterval {
  exerciseType: number;
  title?: string;
}

type Failure = Extract<HealthResult<never>, { ok: false }>;

const ok = <T>(value: T): HealthResult<T> => Object.freeze({ ok: true, value });

const fail = (
  code: HealthErrorCode,
  message: string,
  cause?: unknown
): Failure =>
  Object.freeze({
    ok: false,
    error: Object.freeze(
      cause === undefined ? { code, message } : { code, message, cause }
    ),
  });

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Health Connect rejects with a code; map the ones that mean something. */
function healthConnectFailure(e: unknown): Failure {
  const code =
    typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : '';
  switch (code) {
    case 'PERMISSION_ERROR':
      return fail('not_permitted', messageOf(e), e);
    case 'SERVICE_UNAVAILABLE':
    case 'SDK_VERSION_ERROR':
    case 'CLIENT_NOT_INITIALIZED':
      return fail('unavailable', messageOf(e), e);
    default:
      return fail('native_error', messageOf(e), e);
  }
}

function loadBackend(): HealthResult<Backend> {
  if (Platform.OS === 'ios') {
    const healthKit = loadHealthKit();
    return healthKit
      ? ok({ platform: 'ios', healthKit })
      : fail(
          'module_missing',
          'react-native-health is not installed or not linked (NativeModules.AppleHealthKit is missing)'
        );
  }
  if (Platform.OS === 'android') {
    try {
      const healthConnect = loadHealthConnect();
      if (healthConnect) {
        return ok({ platform: 'android', healthConnect });
      }
    } catch (e) {
      return fail(
        'module_missing',
        'react-native-health-connect is not installed or not linked',
        e
      );
    }
    return fail(
      'module_missing',
      'react-native-health-connect is not installed or not linked'
    );
  }
  return fail(
    'unsupported_platform',
    `Health data is not available on ${Platform.OS}`
  );
}

function checkTypes(
  types: readonly HealthDataType[] | undefined
): readonly HealthDataType[] {
  if (types === undefined) {
    return HEALTH_DATA_TYPES;
  }
  // JavaScript callers are not type-checked, so check every element.
  const list: unknown = types;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.some((t) => !(HEALTH_DATA_TYPES as readonly unknown[]).includes(t))
  ) {
    throw new TypeError(
      `health-data expects a non-empty list of: ${HEALTH_DATA_TYPES.join(', ')}`
    );
  }
  return Object.freeze([...new Set(types)]);
}

function checkRange(range: DateRange): void {
  // JavaScript callers are not type-checked.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!isValidDate(range?.start) || !isValidDate(range?.end)) {
    throw new TypeError(
      'health-data range needs valid `start` and `end` dates'
    );
  }
  if (range.end.getTime() < range.start.getTime()) {
    throw new TypeError('health-data range `end` is before `start`');
  }
}

function checkDay(day: Date | undefined, name: string): void {
  if (day !== undefined && !isValidDate(day)) {
    throw new TypeError(`health-data \`${name}\` must be a valid Date`);
  }
}

const timeRange = (start: Date, end: Date): TimeRangeFilter => ({
  operator: 'between',
  startTime: start.toISOString(),
  endTime: end.toISOString(),
});

const statusFrom = (
  types: readonly HealthDataType[],
  permissions: readonly HealthConnectPermission[]
): PermissionStatus => {
  const isGranted = (t: HealthDataType) =>
    permissions.some(
      (p) =>
        p.accessType === 'read' && p.recordType === PLATFORM_TYPES[t].android
    );
  return Object.freeze({
    known: true,
    granted: Object.freeze(types.filter(isGranted)),
    denied: Object.freeze(types.filter((t) => !isGranted(t))),
  });
};

async function readAllRecords<T>(
  healthConnect: HealthConnectModule,
  recordType: string,
  start: Date,
  end: Date
): Promise<T[]> {
  const records: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await healthConnect.readRecords(recordType, {
      timeRangeFilter: timeRange(start, end),
      ...(pageToken ? { pageToken } : {}),
    });
    records.push(...((page?.records ?? []) as T[]));
    pageToken = page?.pageToken;
  } while (pageToken);
  return records;
}

async function aggregate(
  healthConnect: HealthConnectModule,
  recordType: string,
  start: Date,
  end: Date
): Promise<Record<string, unknown>> {
  return (
    (await healthConnect.aggregateRecord({
      recordType,
      timeRangeFilter: timeRange(start, end),
    })) ?? {}
  );
}

const positiveNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Every method returns a promise, so a programming error (an invalid argument)
 * becomes a rejection too, never a synchronous throw from some methods only.
 */
const asPromise =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> =>
    fn(...args);

/**
 * A health data client. It keeps no state of its own: options are fixed at
 * creation, and every call asks the platform.
 *
 * @throws {TypeError} for an unknown or invalid option
 */
export function createHealthData(options?: HealthDataOptions): HealthData {
  const opts = resolveOptions(options);

  const now = (): Date => {
    const value = opts.now();
    if (!isValidDate(value)) {
      throw new TypeError('health-data option "now" must return a valid Date');
    }
    return value;
  };

  /** Local calendar day of `day`, ending now if it is today. */
  const dayRange = (day: Date | undefined): DateRange => {
    const current = now();
    const start = startOfDay(day ?? current);
    const end = new Date(
      Math.max(
        start.getTime(),
        Math.min(addDays(start, 1).getTime(), current.getTime())
      )
    );
    return { start, end };
  };

  /** Run one read: platform module, Android readiness, then the query. */
  async function read<T>(
    types: readonly HealthDataType[],
    ios: (healthKit: HealthKitModule) => Promise<T>,
    android: (healthConnect: HealthConnectModule) => Promise<T>
  ): Promise<HealthResult<T>> {
    const backend = loadBackend();
    if (!backend.ok) {
      return backend;
    }
    if (backend.value.platform === 'ios') {
      try {
        return ok(await ios(backend.value.healthKit));
      } catch (e) {
        return fail('native_error', messageOf(e), e);
      }
    }
    const { healthConnect } = backend.value;
    try {
      if (!(await healthConnect.initialize())) {
        return fail(
          'unavailable',
          'Health Connect is not available on this device'
        );
      }
      const status = statusFrom(
        types,
        await healthConnect.getGrantedPermissions()
      );
      if (status.known && status.denied.length > 0) {
        return fail(
          'not_permitted',
          `Read access is not granted for: ${status.denied.join(', ')}`
        );
      }
      return ok(await android(healthConnect));
    } catch (e) {
      return healthConnectFailure(e);
    }
  }

  const getAvailability = async (): Promise<HealthResult<Availability>> => {
    const backend = loadBackend();
    if (!backend.ok) {
      return ok(
        backend.error.code === 'unsupported_platform'
          ? 'unsupported_platform'
          : 'module_missing'
      );
    }
    try {
      if (backend.value.platform === 'ios') {
        const { healthKit } = backend.value;
        const available = await callHealthKit<boolean>((cb) => {
          healthKit.isAvailable(cb);
        });
        return ok(available ? 'available' : 'unsupported_platform');
      }
      const status = await backend.value.healthConnect.getSdkStatus();
      if (status === SDK_AVAILABLE) {
        return ok('available');
      }
      return ok(
        status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
          ? 'update_required'
          : 'not_installed'
      );
    } catch (e) {
      return backend.value.platform === 'ios'
        ? fail('native_error', messageOf(e), e)
        : healthConnectFailure(e);
    }
  };

  const requestPermissions = async (
    types?: readonly HealthDataType[]
  ): Promise<HealthResult<PermissionStatus>> => {
    const wanted = checkTypes(types);
    const backend = loadBackend();
    if (!backend.ok) {
      return backend;
    }
    if (backend.value.platform === 'ios') {
      const { healthKit } = backend.value;
      try {
        await callHealthKit((cb) => {
          healthKit.initHealthKit(
            {
              permissions: {
                read: wanted.map((t) => PLATFORM_TYPES[t].ios),
                write: [],
              },
            },
            cb
          );
        });
        return ok(Object.freeze({ known: false, requested: wanted }));
      } catch (e) {
        return fail('native_error', messageOf(e), e);
      }
    }
    const { healthConnect } = backend.value;
    try {
      if (!(await healthConnect.initialize())) {
        return fail(
          'unavailable',
          'Health Connect is not available on this device'
        );
      }
      const granted = await healthConnect.requestPermission(
        wanted.map((t) => ({
          accessType: 'read',
          recordType: PLATFORM_TYPES[t].android,
        }))
      );
      return ok(statusFrom(wanted, granted));
    } catch (e) {
      return healthConnectFailure(e);
    }
  };

  const getPermissionStatus = async (
    types?: readonly HealthDataType[]
  ): Promise<HealthResult<PermissionStatus>> => {
    const wanted = checkTypes(types);
    const backend = loadBackend();
    if (!backend.ok) {
      return backend;
    }
    if (backend.value.platform === 'ios') {
      return ok(Object.freeze({ known: false, requested: wanted }));
    }
    const { healthConnect } = backend.value;
    try {
      if (!(await healthConnect.initialize())) {
        return fail(
          'unavailable',
          'Health Connect is not available on this device'
        );
      }
      return ok(
        statusFrom(wanted, await healthConnect.getGrantedPermissions())
      );
    } catch (e) {
      return healthConnectFailure(e);
    }
  };

  const getSteps = (day?: Date): Promise<HealthResult<number>> => {
    checkDay(day, 'day');
    const { start, end } = dayRange(day);
    return read(
      ['steps'],
      async (healthKit) => {
        const result = await callHealthKit<{ value?: number } | null>((cb) => {
          healthKit.getStepCount({ date: start.toISOString() }, cb);
        });
        return positiveNumber(result?.value);
      },
      async (healthConnect) =>
        end > start
          ? positiveNumber(
              (await aggregate(healthConnect, 'Steps', start, end)).COUNT_TOTAL
            )
          : 0
    );
  };

  const getDailySteps = (
    range: DateRange
  ): Promise<HealthResult<DailySteps[]>> => {
    checkRange(range);
    const { start, end } = range;
    return read(
      ['steps'],
      async (healthKit) => {
        const samples = await callHealthKit<
          { value?: number; startDate: string; endDate: string }[] | null
        >((cb) => {
          healthKit.getDailyStepCountSamples(
            { startDate: start.toISOString(), endDate: end.toISOString() },
            cb
          );
        });
        return (samples ?? [])
          .filter((s) => positiveNumber(s.value) > 0)
          .map((s) =>
            Object.freeze({
              date: localDateKey(new Date(s.startDate)),
              startDate: s.startDate,
              endDate: s.endDate,
              steps: positiveNumber(s.value),
            })
          )
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
      },
      async (healthConnect) => {
        const days: DailySteps[] = [];
        for (
          let dayStart = new Date(start);
          dayStart < end;
          dayStart = addDays(dayStart, 1)
        ) {
          const dayEnd = new Date(
            Math.min(addDays(dayStart, 1).getTime(), end.getTime())
          );
          const steps = positiveNumber(
            (await aggregate(healthConnect, 'Steps', dayStart, dayEnd))
              .COUNT_TOTAL
          );
          if (steps > 0) {
            days.push(
              Object.freeze({
                date: localDateKey(dayStart),
                startDate: dayStart.toISOString(),
                endDate: dayEnd.toISOString(),
                steps,
              })
            );
          }
        }
        return days;
      }
    );
  };

  const getActiveEnergy = (
    range: DateRange
  ): Promise<HealthResult<EnergySample[]>> => {
    checkRange(range);
    const { start, end } = range;
    return read(
      ['activeEnergy'],
      async (healthKit) => {
        const samples = await callHealthKit<
          { value?: number; startDate: string; endDate: string }[] | null
        >((cb) => {
          healthKit.getActiveEnergyBurned(
            {
              startDate: start.toISOString(),
              endDate: end.toISOString(),
              unit: 'kilocalorie',
            },
            cb
          );
        });
        return (samples ?? []).map((s) =>
          Object.freeze({
            startDate: s.startDate,
            endDate: s.endDate,
            kilocalories: positiveNumber(s.value),
          })
        );
      },
      async (healthConnect) =>
        (
          await readAllRecords<HcEnergyRecord>(
            healthConnect,
            'ActiveCaloriesBurned',
            start,
            end
          )
        ).map((r) =>
          Object.freeze({
            startDate: r.startTime,
            endDate: r.endTime,
            // Health Connect energy is {inKilocalories, ...}; there is no `.value`.
            kilocalories: positiveNumber(r.energy?.inKilocalories),
          })
        )
    );
  };

  const readSleep = (
    start: Date,
    end: Date
  ): Promise<HealthResult<SleepInterval[]>> =>
    read(
      ['sleep'],
      async (healthKit) => {
        const samples = await callHealthKit<
          { value: string; startDate: string; endDate: string }[] | null
        >((cb) => {
          healthKit.getSleepSamples(
            { startDate: start.toISOString(), endDate: end.toISOString() },
            cb
          );
        });
        return (samples ?? []).map((s) =>
          Object.freeze({
            startDate: s.startDate,
            endDate: s.endDate,
            stage: IOS_SLEEP_STAGES[s.value] ?? 'unknown',
          })
        );
      },
      async (healthConnect) => {
        const sessions = await readAllRecords<HcSleepRecord>(
          healthConnect,
          'SleepSession',
          start,
          end
        );
        return sessions.flatMap((session) =>
          session.stages && session.stages.length > 0
            ? session.stages.map((s) =>
                Object.freeze({
                  startDate: s.startTime,
                  endDate: s.endTime,
                  stage: ANDROID_SLEEP_STAGES[s.stage] ?? 'unknown',
                })
              )
            : // A session without stages is recorded sleep as a whole.
              [
                Object.freeze({
                  startDate: session.startTime,
                  endDate: session.endTime,
                  stage: 'asleep' as const,
                }),
              ]
        );
      }
    );

  const getSleep = (
    range: DateRange
  ): Promise<HealthResult<SleepInterval[]>> => {
    checkRange(range);
    return readSleep(range.start, range.end);
  };

  const getSleepHours = async (
    night?: Date
  ): Promise<HealthResult<number | null>> => {
    checkDay(night, 'night');
    const day = startOfDay(night ?? now());
    const result = await readSleep(
      atHour(addDays(day, -1), opts.sleepWindowStartHour),
      atHour(day, opts.sleepWindowEndHour)
    );
    if (!result.ok) {
      return result;
    }
    const asleepMs = mergedDurationMs(
      result.value
        .filter((s) => ASLEEP.includes(s.stage))
        .map((s) => ({ start: s.startDate, end: s.endDate }))
    );
    return ok(asleepMs > 0 ? asleepMs / (60 * 60 * 1000) : null);
  };

  const readWorkouts = (
    start: Date,
    end: Date
  ): Promise<HealthResult<Workout[]>> =>
    read(
      ['workouts'],
      async (healthKit) => {
        const result = await callHealthKit<{
          data?: {
            activityName?: string;
            duration?: number;
            start: string;
            end: string;
          }[];
        } | null>((cb) => {
          healthKit.getAnchoredWorkouts(
            { startDate: start.toISOString(), endDate: end.toISOString() },
            cb
          );
        });
        return (result?.data ?? []).map((w) =>
          Object.freeze({
            activityType: w.activityName ?? 'Unknown',
            // react-native-health reports duration in seconds (NSTimeInterval).
            durationMinutes: positiveNumber(w.duration) / 60,
            startDate: w.start,
            endDate: w.end,
            isOutdoor:
              w.activityName !== undefined &&
              opts.outdoorActivitiesIos.includes(w.activityName),
          })
        );
      },
      async (healthConnect) =>
        (
          await readAllRecords<HcExerciseRecord>(
            healthConnect,
            'ExerciseSession',
            start,
            end
          )
        ).map((r) =>
          Object.freeze({
            activityType: r.title ?? `Exercise ${String(r.exerciseType)}`,
            durationMinutes: positiveNumber(
              (new Date(r.endTime).getTime() -
                new Date(r.startTime).getTime()) /
                60000
            ),
            startDate: r.startTime,
            endDate: r.endTime,
            isOutdoor: opts.outdoorExerciseTypesAndroid.includes(
              r.exerciseType
            ),
          })
        )
    );

  const getWorkouts = (range: DateRange): Promise<HealthResult<Workout[]>> => {
    checkRange(range);
    return readWorkouts(range.start, range.end);
  };

  const outdoorMinutes = (workouts: readonly Workout[]): number =>
    workouts.reduce((sum, w) => sum + (w.isOutdoor ? w.durationMinutes : 0), 0);

  const getOutdoorMinutes = async (
    day?: Date
  ): Promise<HealthResult<number>> => {
    checkDay(day, 'day');
    const { start, end } = dayRange(day);
    const result = await readWorkouts(start, end);
    return result.ok ? ok(Math.round(outdoorMinutes(result.value))) : result;
  };

  const getWaterLitres = (day?: Date): Promise<HealthResult<number | null>> => {
    checkDay(day, 'day');
    const { start, end } = dayRange(day);
    return read(
      ['water'],
      async (healthKit) => {
        const result = await callHealthKit<{ value?: number } | null>((cb) => {
          healthKit.getWater({ date: start.toISOString() }, cb);
        });
        return positiveNumber(result?.value) || null;
      },
      async (healthConnect) => {
        if (end <= start) {
          return null;
        }
        // Volume is {inLiters, inMilliliters, inFluidOuncesUs}; there is no `.value`.
        const volume = (await aggregate(healthConnect, 'Hydration', start, end))
          .VOLUME_TOTAL as { inLiters?: number } | undefined;
        return positiveNumber(volume?.inLiters) || null;
      }
    );
  };

  const getOutdoorSummary = async (): Promise<HealthResult<OutdoorSummary>> => {
    const end = now();
    const start = addDays(startOfDay(end), -opts.summaryDays);
    const workouts = await readWorkouts(start, end);
    if (!workouts.ok) {
      return workouts;
    }
    const steps = await getDailySteps({ start, end });
    if (!steps.ok) {
      return steps;
    }
    const outdoor = workouts.value.filter((w) => w.isOutdoor);
    const activeDays = new Set(
      outdoor.map((w) => localDateKey(new Date(w.startDate)))
    ).size;
    const totalSteps = steps.value.reduce((sum, d) => sum + d.steps, 0);
    return ok(
      Object.freeze({
        totalOutdoorMinutes: Math.round(outdoorMinutes(outdoor)),
        averageDailySteps: Math.round(
          totalSteps / Math.max(steps.value.length, 1)
        ),
        activeDays,
      })
    );
  };

  return Object.freeze({
    options: opts,
    getAvailability: asPromise(getAvailability),
    requestPermissions: asPromise(requestPermissions),
    getPermissionStatus: asPromise(getPermissionStatus),
    getSteps: asPromise(getSteps),
    getDailySteps: asPromise(getDailySteps),
    getActiveEnergy: asPromise(getActiveEnergy),
    getSleep: asPromise(getSleep),
    getSleepHours: asPromise(getSleepHours),
    getWorkouts: asPromise(getWorkouts),
    getOutdoorMinutes: asPromise(getOutdoorMinutes),
    getWaterLitres: asPromise(getWaterLitres),
    getOutdoorSummary: asPromise(getOutdoorSummary),
  });
}
