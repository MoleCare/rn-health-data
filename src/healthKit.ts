import { NativeModules } from 'react-native';

/**
 * The parts of react-native-health's native module this package calls. It uses
 * NativeModules.AppleHealthKit directly rather than the library's JavaScript
 * wrapper, which can lose native method references.
 */

type Callback<T> = (error: unknown, result: T) => void;

export interface HealthKitValue {
  value: number;
  startDate: string;
  endDate: string;
}

export interface HealthKitSleepSample {
  value: string;
  startDate: string;
  endDate: string;
}

export interface HealthKitWorkout {
  activityName?: string;
  /** Seconds (NSTimeInterval). */
  duration?: number;
  start: string;
  end: string;
}

export interface HealthKitModule {
  isAvailable(callback: Callback<boolean>): void;
  initHealthKit(
    permissions: { permissions: { read: string[]; write: string[] } },
    callback: Callback<unknown>
  ): void;
  getStepCount(
    options: { date: string },
    callback: Callback<HealthKitValue | null>
  ): void;
  getDailyStepCountSamples(
    options: { startDate: string; endDate: string },
    callback: Callback<HealthKitValue[] | null>
  ): void;
  getActiveEnergyBurned(
    options: { startDate: string; endDate: string; unit: 'kilocalorie' },
    callback: Callback<HealthKitValue[] | null>
  ): void;
  getSleepSamples(
    options: { startDate: string; endDate: string },
    callback: Callback<HealthKitSleepSample[] | null>
  ): void;
  getAnchoredWorkouts(
    options: { startDate: string; endDate: string },
    callback: Callback<{ data?: HealthKitWorkout[] } | null>
  ): void;
  getWater(
    options: { date: string },
    callback: Callback<HealthKitValue | null>
  ): void;
}

export function loadHealthKit(): HealthKitModule | null {
  const candidate = NativeModules.AppleHealthKit as
    Partial<HealthKitModule> | undefined;
  return typeof candidate?.isAvailable === 'function'
    ? (candidate as HealthKitModule)
    : null;
}

/** Call a HealthKit method that takes a Node-style callback. */
export function callHealthKit<T>(
  invoke: (callback: Callback<T>) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      invoke((error, result) => {
        if (error) {
          reject(
            error instanceof Error
              ? error
              : new Error(
                  typeof error === 'string'
                    ? error
                    : 'HealthKit reported an error',
                  { cause: error }
                )
          );
        } else {
          resolve(result);
        }
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
