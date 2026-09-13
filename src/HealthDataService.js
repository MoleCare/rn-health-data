import {Platform, NativeModules} from 'react-native';
import {resolveOptions} from './defaults';
import {loadHealthConnect} from './healthConnect';

/**
 * HealthDataService — abstraction over HealthKit (iOS) and Health Connect (Android).
 *
 * Peer dependencies (install in the host app):
 * - iOS: `react-native-health` (exposes NativeModules.AppleHealthKit)
 * - Android: `react-native-health-connect`
 *
 * iOS uses NativeModules.AppleHealthKit directly rather than the library's
 * index.js Object.assign export, which can lose native method references.
 *
 * No module state and no shared instance: the app creates a service with its
 * own options and keeps it. No backend URLs or product hosts are used.
 */

/**
 * The data this package reads, and what each is called on each platform.
 * Apps pass the keys to requestPermissions() to ask only for what they use.
 */
const PERMISSIONS = {
  steps: {ios: 'StepCount', android: 'Steps'},
  sleep: {ios: 'SleepAnalysis', android: 'SleepSession'},
  workouts: {ios: 'Workout', android: 'ExerciseSession'},
  activeEnergy: {ios: 'ActiveEnergyBurned', android: 'ActiveCaloriesBurned'},
  water: {ios: 'Water', android: 'Hydration'},
};

export const HEALTH_DATA_TYPES = Object.freeze(Object.keys(PERMISSIONS));

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The same local time on the next calendar day. Calendar arithmetic, not
 * 24 hours of milliseconds: the days the clocks change are 23 or 25 hours long.
 */
function nextDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function lastNightStart(hour) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function lastNightEnd(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

// HealthKit sleep values that mean asleep (INBED and AWAKE do not).
const IOS_ASLEEP_VALUES = new Set(['ASLEEP', 'CORE', 'DEEP', 'REM']);

// Health Connect SleepStageType: SLEEPING 2, LIGHT 4, DEEP 5, REM 6.
// AWAKE 1, OUT_OF_BED 3 and UNKNOWN 0 are not sleep.
const ANDROID_ASLEEP_STAGES = new Set([2, 4, 5, 6]);

/**
 * Total length of a set of time intervals, counting overlaps once. Phones and
 * watches (and several apps) often write overlapping samples for the same
 * night; adding them up counts that time twice.
 */
export function mergedDurationMs(intervals) {
  const spans = intervals
    .map(({start, end}) => [new Date(start).getTime(), new Date(end).getTime()])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let current = null;
  for (const [s, e] of spans) {
    if (!current || s > current[1]) {
      if (current) {
        total += current[1] - current[0];
      }
      current = [s, e];
    } else if (e > current[1]) {
      current[1] = e;
    }
  }
  if (current) {
    total += current[1] - current[0];
  }
  return total;
}

function timeRange(startDate, endDate) {
  return {
    operator: 'between',
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
  };
}

export class HealthDataService {
  /**
   * @param {Object} [options] - see DEFAULT_OPTIONS: outdoorActivitiesIos,
   *   outdoorExerciseTypesAndroid, sleepWindowStartHour, sleepWindowEndHour,
   *   summaryDays. Copied and frozen; an unknown or invalid option throws.
   */
  constructor(options) {
    this._options = resolveOptions(options);
    this._outdoorIos = new Set(this._options.outdoorActivitiesIos);
    this._outdoorAndroid = new Set(this._options.outdoorExerciseTypesAndroid);
    this._initialized = false;
    this._healthKit = null;
    this._healthConnect = null;
  }

  /** The options this service was created with (frozen). */
  get options() {
    return this._options;
  }

  _loadModules() {
    if (Platform.OS === 'ios' && !this._healthKit) {
      try {
        const nativeModule = NativeModules.AppleHealthKit;
        if (nativeModule && typeof nativeModule.isAvailable === 'function') {
          this._healthKit = nativeModule;
        } else {
          console.warn(
            '[HealthDataService] AppleHealthKit native module not found in NativeModules',
          );
          this._healthKit = null;
        }
      } catch (e) {
        console.warn('[HealthDataService] Failed to load iOS health module:', e);
        this._healthKit = null;
      }
    }
    if (Platform.OS === 'android' && !this._healthConnect) {
      try {
        this._healthConnect = loadHealthConnect();
      } catch (e) {
        console.warn(
          '[HealthDataService] Failed to load Android health module:',
          e,
        );
        this._healthConnect = null;
      }
    }
  }

  _callNative(methodName, ...args) {
    if (!this._healthKit || typeof this._healthKit[methodName] !== 'function') {
      return Promise.reject(
        new Error(`HealthKit method "${methodName}" not available`),
      );
    }
    return new Promise((resolve, reject) => {
      try {
        this._healthKit[methodName](...args, (err, results) => {
          if (err) {
            reject(typeof err === 'string' ? new Error(err) : err);
          } else {
            resolve(results);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Every record in the range. Health Connect pages its results; reading only
   * the first page silently dropped the rest.
   */
  async _readAllRecords(recordType, startDate, endDate) {
    const records = [];
    let pageToken;
    do {
      const options = {timeRangeFilter: timeRange(startDate, endDate)};
      if (pageToken) {
        options.pageToken = pageToken;
      }
      const result = await this._healthConnect.readRecords(recordType, options);
      records.push(...((result && result.records) || []));
      pageToken = result && result.pageToken;
    } while (pageToken);
    return records;
  }

  /** Health Connect's own total, which removes duplicates across apps and devices. */
  async _aggregate(recordType, startDate, endDate) {
    return this._healthConnect.aggregateRecord({
      recordType,
      timeRangeFilter: timeRange(startDate, endDate),
    });
  }

  /**
   * Asked of the platform every time, never cached: Health Connect can be
   * installed or updated while the app is running.
   */
  async isAvailable() {
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        return !!(await this._callNative('isAvailable'));
      } catch (e) {
        console.warn('[HealthDataService] isAvailable check failed:', e);
        return false;
      }
    }
    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const status = await this._healthConnect.getSdkStatus();
        return status === 3; // SDK_AVAILABLE
      } catch (e) {
        console.warn('[HealthDataService] getSdkStatus failed:', e);
        return false;
      }
    }
    return false;
  }

  /**
   * Ask the user for read access. Read-only: nothing is ever written.
   *
   * @param {string[]} [types] keys of HEALTH_DATA_TYPES; all of them by default.
   *   Ask only for what the app uses.
   */
  async requestPermissions(types = HEALTH_DATA_TYPES) {
    const unknown = (Array.isArray(types) ? types : [types]).filter(
      t => !Object.prototype.hasOwnProperty.call(PERMISSIONS, t),
    );
    if (!Array.isArray(types) || types.length === 0 || unknown.length > 0) {
      throw new Error(
        `requestPermissions expects a non-empty list of: ${HEALTH_DATA_TYPES.join(', ')}` +
          (unknown.length > 0 ? ` (got ${unknown.join(', ')})` : ''),
      );
    }
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      const permissions = {
        permissions: {
          read: types.map(t => PERMISSIONS[t].ios),
          write: [],
        },
      };
      const results = await this._callNative('initHealthKit', permissions);
      this._initialized = true;
      return results;
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      await this._healthConnect.initialize();
      const granted = await this._healthConnect.requestPermission(
        types.map(t => ({accessType: 'read', recordType: PERMISSIONS[t].android})),
      );
      this._initialized = true;
      return granted;
    }

    return null;
  }

  /**
   * Steps per day in the range, as `{startDate, endDate, value}`. On Android
   * each day is Health Connect's de-duplicated total (raw records double-count
   * steps when a phone and a watch both record them), matching the daily
   * samples HealthKit returns on iOS.
   */
  async getStepsData(startDate, endDate) {
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        return await this._callNative('getDailyStepCountSamples', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
      } catch (e) {
        return [];
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const days = [];
        for (
          let dayStart = new Date(startDate);
          dayStart < endDate;
          dayStart = nextDay(dayStart)
        ) {
          const dayEnd = new Date(
            Math.min(nextDay(dayStart).getTime(), endDate.getTime()),
          );
          const result = await this._aggregate('Steps', dayStart, dayEnd);
          const value = (result && result.COUNT_TOTAL) || 0;
          if (value > 0) {
            days.push({
              startDate: dayStart.toISOString(),
              endDate: dayEnd.toISOString(),
              value,
            });
          }
        }
        return days;
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  async getTodaySteps() {
    this._loadModules();
    const today = startOfToday();
    const now = new Date();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const results = await this._callNative('getStepCount', {
          date: today.toISOString(),
        });
        return (results && results.value) || 0;
      } catch (e) {
        return 0;
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const result = await this._aggregate('Steps', today, now);
        return (result && result.COUNT_TOTAL) || 0;
      } catch (e) {
        return 0;
      }
    }

    return 0;
  }

  async getActiveEnergyBurned(startDate, endDate) {
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        return await this._callNative('getActiveEnergyBurned', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          unit: 'kilocalorie',
        });
      } catch (e) {
        return [];
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const records = await this._readAllRecords(
          'ActiveCaloriesBurned',
          startDate,
          endDate,
        );
        // Health Connect energy is {inKilocalories, inCalories, ...}; there is no `.value`.
        return records.map(r => ({
          startDate: r.startTime,
          endDate: r.endTime,
          value: (r.energy && r.energy.inKilocalories) || 0,
        }));
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  async getSleepData(startDate, endDate) {
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        return await this._callNative('getSleepSamples', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
      } catch (e) {
        return [];
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const records = await this._readAllRecords(
          'SleepSession',
          startDate,
          endDate,
        );
        return records.map(r => ({
          startDate: r.startTime,
          endDate: r.endTime,
          value: r.stages || [],
        }));
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  /**
   * Hours asleep between sleepWindowStartHour yesterday and sleepWindowEndHour
   * today (18:00 and 12:00 by default), or null when there is no sleep data.
   * Only time asleep counts (not time in bed or awake), and overlapping samples
   * from several sources count once.
   */
  async getLastNightSleepHours() {
    this._loadModules();
    const start = lastNightStart(this._options.sleepWindowStartHour);
    const end = lastNightEnd(this._options.sleepWindowEndHour);
    const toHours = ms => (ms > 0 ? ms / (1000 * 60 * 60) : null);

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const results = await this._callNative('getSleepSamples', {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        });
        if (!results || !Array.isArray(results) || results.length === 0) {
          return null;
        }
        const asleep = results
          .filter(s => IOS_ASLEEP_VALUES.has(s.value))
          .map(s => ({start: s.startDate, end: s.endDate}));
        return toHours(mergedDurationMs(asleep));
      } catch (e) {
        return null;
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const records = await this._readAllRecords('SleepSession', start, end);
        if (records.length === 0) return null;

        const asleep = [];
        records.forEach(r => {
          const stages = Array.isArray(r.stages) ? r.stages : [];
          if (stages.length > 0) {
            stages
              .filter(st => ANDROID_ASLEEP_STAGES.has(st.stage))
              .forEach(st => asleep.push({start: st.startTime, end: st.endTime}));
          } else {
            // A session without stages is recorded sleep as a whole.
            asleep.push({start: r.startTime, end: r.endTime});
          }
        });
        return toHours(mergedDurationMs(asleep));
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /** Workouts in the range; `duration` is in minutes on both platforms. */
  async getWorkouts(startDate, endDate) {
    this._loadModules();
    const outdoorIos = this._outdoorIos;
    const outdoorAndroid = this._outdoorAndroid;

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const results = await this._callNative('getAnchoredWorkouts', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
        if (!results || !results.data) return [];
        return results.data.map(w => ({
          activityType: w.activityName || 'Unknown',
          // react-native-health reports duration in seconds (NSTimeInterval).
          duration: (w.duration || 0) / 60,
          startDate: w.start,
          endDate: w.end,
          isOutdoor: outdoorIos.has(w.activityName),
        }));
      } catch (e) {
        return [];
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const records = await this._readAllRecords(
          'ExerciseSession',
          startDate,
          endDate,
        );
        return records.map(r => {
          const sStart = new Date(r.startTime).getTime();
          const sEnd = new Date(r.endTime).getTime();
          return {
            activityType: r.title || `Exercise ${r.exerciseType}`,
            duration: (sEnd - sStart) / (1000 * 60),
            startDate: r.startTime,
            endDate: r.endTime,
            isOutdoor: outdoorAndroid.has(r.exerciseType),
          };
        });
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  async getTodayOutdoorWorkoutMinutes() {
    const today = startOfToday();
    const now = new Date();
    const workouts = await this.getWorkouts(today, now);

    let totalMinutes = 0;
    workouts.forEach(w => {
      if (w.isOutdoor) {
        totalMinutes += w.duration || 0;
      }
    });
    return Math.round(totalMinutes);
  }

  /** Litres drunk today, or null when nothing is recorded. */
  async getTodayWaterIntake() {
    this._loadModules();
    const today = startOfToday();
    const now = new Date();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const results = await this._callNative('getWater', {
          date: today.toISOString(),
        });
        if (!results) return null;
        const value = results.value || 0;
        return value > 0 ? value : null;
      } catch (e) {
        return null;
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        // Volume is {inLiters, inMilliliters, inFluidOuncesUs}; there is no `.value`.
        const result = await this._aggregate('Hydration', today, now);
        const litres =
          (result && result.VOLUME_TOTAL && result.VOLUME_TOTAL.inLiters) || 0;
        return litres > 0 ? litres : null;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /** From midnight `summaryDays` (7 by default) days ago until now. */
  async getWeeklyOutdoorSummary() {
    const weekStart = daysAgo(this._options.summaryDays);
    const now = new Date();

    const workouts = await this.getWorkouts(weekStart, now);
    let totalOutdoorMinutes = 0;
    const activeDaysSet = new Set();

    workouts.forEach(w => {
      if (w.isOutdoor) {
        totalOutdoorMinutes += w.duration || 0;
        const dayKey = new Date(w.startDate).toDateString();
        activeDaysSet.add(dayKey);
      }
    });

    const stepsData = await this.getStepsData(weekStart, now);
    let totalSteps = 0;
    const stepDays = new Set();
    if (Array.isArray(stepsData)) {
      stepsData.forEach(s => {
        totalSteps += s.value || 0;
        const dayKey = new Date(s.startDate || s.date).toDateString();
        stepDays.add(dayKey);
      });
    }

    const dayCount = Math.max(stepDays.size, 1);

    return {
      totalOutdoorMinutes: Math.round(totalOutdoorMinutes),
      avgDailySteps: Math.round(totalSteps / dayCount),
      activeDays: activeDaysSet.size,
    };
  }

  /**
   * Whether requestPermissions has finished on this instance. It does not say
   * access was granted: HealthKit never tells apps whether read access was.
   */
  isInitialized() {
    return this._initialized;
  }
}
