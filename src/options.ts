export const DEFAULT_OUTDOOR_ACTIVITIES_IOS: readonly string[] = Object.freeze([
  'Running',
  'Walking',
  'Cycling',
  'Hiking',
  'Golf',
  'Soccer',
  'Tennis',
  'Cricket',
  'Baseball',
  'Softball',
  'Lacrosse',
  'Rugby',
  'AmericanFootball',
  'AustralianFootball',
  'TrackAndField',
  'Rowing',
  'Sailing',
  'SurfingSports',
  'Swimming',
  'WaterSports',
  'Fishing',
  'Hunting',
  'EquestrianSports',
  'SnowSports',
  'CrossCountrySkiing',
  'DownhillSkiing',
  'Snowboarding',
]);

/** Health Connect exercise type numbers that are usually outdoors. */
export const DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID: readonly number[] =
  Object.freeze([
    56, // RUNNING
    79, // WALKING
    8, // CYCLING
    37, // HIKING
    35, // GOLF
    64, // SOCCER
    76, // TENNIS
    6, // CRICKET
    3, // BASEBALL
    67, // SOFTBALL
    58, // RUGBY
    1, // AMERICAN_FOOTBALL
    74, // SWIMMING_POOL
    73, // SWIMMING_OPEN_WATER
    57, // ROWING
    59, // SAILING
    62, // SKATEBOARDING
    63, // SKIING
    66, // SNOWBOARDING
  ]);

export interface HealthDataOptions {
  /** HealthKit activity names counted as outdoor. */
  outdoorActivitiesIos?: readonly string[];
  /** Health Connect exercise type numbers counted as outdoor. */
  outdoorExerciseTypesAndroid?: readonly number[];
  /** "Last night" starts at this local hour on the previous day. Default 18. */
  sleepWindowStartHour?: number;
  /** ...and ends at this local hour. Default 12. */
  sleepWindowEndHour?: number;
  /** getOutdoorSummary reads from midnight this many days ago. Default 7. */
  summaryDays?: number;
  /** The clock, for "today" and "last night". Default `() => new Date()`. */
  now?: () => Date;
}

export type ResolvedOptions = Readonly<Required<HealthDataOptions>>;

export const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  outdoorActivitiesIos: DEFAULT_OUTDOOR_ACTIVITIES_IOS,
  outdoorExerciseTypesAndroid: DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID,
  sleepWindowStartHour: 18,
  sleepWindowEndHour: 12,
  summaryDays: 7,
  now: () => new Date(),
});

const wholeNumber = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

const CHECKS: Readonly<
  Record<keyof HealthDataOptions, [(value: unknown) => boolean, string]>
> = Object.freeze({
  outdoorActivitiesIos: [
    (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    'a list of HealthKit activity names',
  ],
  outdoorExerciseTypesAndroid: [
    (v: unknown) => Array.isArray(v) && v.every((x) => Number.isInteger(x)),
    'a list of Health Connect exercise type numbers',
  ],
  sleepWindowStartHour: [
    (v: unknown) => wholeNumber(v, 0, 23),
    'a whole hour from 0 to 23',
  ],
  sleepWindowEndHour: [
    (v: unknown) => wholeNumber(v, 0, 23),
    'a whole hour from 0 to 23',
  ],
  summaryDays: [
    (v: unknown) => wholeNumber(v, 1, 366),
    'a whole number of days from 1 to 366',
  ],
  now: [(v: unknown) => typeof v === 'function', 'a function returning a Date'],
});

const isOptionKey = (key: string): key is keyof HealthDataOptions =>
  Object.prototype.hasOwnProperty.call(CHECKS, key);

/**
 * Options over the defaults, copied and frozen, so changing the object or the
 * lists passed in later changes nothing.
 *
 * @throws {TypeError} for an unknown or invalid option
 */
export function resolveOptions(
  options: HealthDataOptions | undefined
): ResolvedOptions {
  if (options === undefined) {
    return DEFAULT_OPTIONS;
  }
  if (
    // The types rule this out, but JavaScript callers are not type-checked.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    throw new TypeError('health-data options must be an object');
  }
  const resolved: Record<string, unknown> = { ...DEFAULT_OPTIONS };
  for (const [key, value] of Object.entries(options)) {
    if (!isOptionKey(key)) {
      throw new TypeError(`Unknown health-data option "${key}"`);
    }
    const [check, expected] = CHECKS[key];
    if (!check(value)) {
      throw new TypeError(`health-data option "${key}" must be ${expected}`);
    }
    resolved[key] = Array.isArray(value)
      ? Object.freeze([...(value as readonly unknown[])])
      : value;
  }
  return Object.freeze(resolved) as ResolvedOptions;
}
