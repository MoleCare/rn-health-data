/**
 * Constants and option handling only. Nothing in this package keeps module
 * state: each HealthDataService is created by the app with its own options,
 * and these are the values used when it passes none.
 */

export const DEFAULT_OUTDOOR_ACTIVITIES_IOS = Object.freeze([
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

/** Health Connect exercise type integers typically outdoors */
export const DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID = Object.freeze([
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

export const DEFAULT_OPTIONS = Object.freeze({
  outdoorActivitiesIos: DEFAULT_OUTDOOR_ACTIVITIES_IOS,
  outdoorExerciseTypesAndroid: DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID,
  // "Last night" runs from this hour yesterday...
  sleepWindowStartHour: 18,
  // ...to this hour today (local time).
  sleepWindowEndHour: 12,
  // getWeeklyOutdoorSummary reads from midnight this many days ago until now.
  summaryDays: 7,
});

const isWholeNumber = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

const CHECKS = {
  outdoorActivitiesIos: value =>
    Array.isArray(value) && value.every(v => typeof v === 'string'),
  outdoorExerciseTypesAndroid: value =>
    Array.isArray(value) && value.every(v => Number.isInteger(v)),
  sleepWindowStartHour: value => isWholeNumber(value, 0, 23),
  sleepWindowEndHour: value => isWholeNumber(value, 0, 23),
  summaryDays: value => isWholeNumber(value, 1, 366),
};

const EXPECTED = {
  outdoorActivitiesIos: 'a list of HealthKit activity names',
  outdoorExerciseTypesAndroid: 'a list of Health Connect exercise type numbers',
  sleepWindowStartHour: 'a whole hour from 0 to 23',
  sleepWindowEndHour: 'a whole hour from 0 to 23',
  summaryDays: 'a whole number of days from 1 to 366',
};

/**
 * Options over the defaults, copied and frozen, so changing the object or the
 * lists passed in later changes nothing. A mistyped or invalid option throws.
 *
 * @param {Object} [options]
 * @returns {Object}
 * @throws {TypeError}
 */
export function resolveOptions(options) {
  if (options === undefined || options === null) {
    return DEFAULT_OPTIONS;
  }
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('HealthDataService options must be an object');
  }
  const resolved = {...DEFAULT_OPTIONS};
  for (const key of Object.keys(options)) {
    if (!Object.prototype.hasOwnProperty.call(CHECKS, key)) {
      throw new TypeError(`Unknown HealthDataService option "${key}"`);
    }
    const value = options[key];
    if (!CHECKS[key](value)) {
      throw new TypeError(`HealthDataService option "${key}" must be ${EXPECTED[key]}`);
    }
    resolved[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(resolved);
}
