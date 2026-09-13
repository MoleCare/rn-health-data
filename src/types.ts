/** The kinds of health data this package reads. */
export type HealthDataType =
  'steps' | 'sleep' | 'workouts' | 'activeEnergy' | 'water';

/**
 * Whether health data can be read on this device.
 *
 * - `available`: HealthKit is available, or the Health Connect SDK is.
 * - `not_installed`: Health Connect is not installed (Android).
 * - `update_required`: Health Connect needs an update (Android).
 * - `unsupported_platform`: neither iOS nor Android.
 * - `module_missing`: the native library for this platform is not linked.
 */
export type Availability =
  | 'available'
  | 'not_installed'
  | 'update_required'
  | 'unsupported_platform'
  | 'module_missing';

export type HealthErrorCode =
  /** Neither iOS nor Android. */
  | 'unsupported_platform'
  /** react-native-health or react-native-health-connect is not installed or linked. */
  | 'module_missing'
  /** Health Connect is not installed or needs an update. */
  | 'unavailable'
  /** Read access to this data was not granted (Android; HealthKit never says). */
  | 'not_permitted'
  /** The platform reported an error. `cause` holds it. */
  | 'native_error';

export interface HealthError {
  readonly code: HealthErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * Every read resolves to a result instead of throwing, so "no data" and "could
 * not read" are never confused. Only programming errors (invalid arguments or
 * options) throw.
 */
export type HealthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: HealthError };

export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

/**
 * What the user allowed. On Android Health Connect reports it. On iOS
 * HealthKit never tells an app whether read access was granted, so the status
 * is not known there.
 */
export type PermissionStatus =
  | {
      readonly known: true;
      readonly granted: readonly HealthDataType[];
      readonly denied: readonly HealthDataType[];
    }
  | { readonly known: false; readonly requested: readonly HealthDataType[] };

export interface DailySteps {
  /** Local calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly steps: number;
}

export interface EnergySample {
  readonly startDate: string;
  readonly endDate: string;
  readonly kilocalories: number;
}

export type SleepStage =
  | 'asleep'
  | 'light'
  | 'deep'
  | 'rem'
  | 'awake'
  | 'in_bed'
  | 'out_of_bed'
  | 'unknown';

export interface SleepInterval {
  readonly startDate: string;
  readonly endDate: string;
  readonly stage: SleepStage;
}

export interface Workout {
  readonly activityType: string;
  readonly durationMinutes: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly isOutdoor: boolean;
}

export interface OutdoorSummary {
  readonly totalOutdoorMinutes: number;
  readonly averageDailySteps: number;
  readonly activeDays: number;
}
