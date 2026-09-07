import {Platform, NativeModules} from 'react-native';
import {
  outdoorActivitiesIosSet,
  outdoorExerciseTypesAndroidSet,
} from './config';

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
 * No backend URLs or product hosts are used in this package.
 */

const HK_PERMISSIONS = {
  StepCount: 'StepCount',
  SleepAnalysis: 'SleepAnalysis',
  Workout: 'Workout',
  ActiveEnergyBurned: 'ActiveEnergyBurned',
  Water: 'Water',
};

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

function lastNightStart() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

function lastNightEnd() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export class HealthDataService {
  constructor() {
    this._initialized = false;
    this._available = null;
    this._healthKit = null;
    this._healthConnect = null;
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
        this._healthConnect = require('react-native-health-connect');
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

  async isAvailable() {
    if (this._available !== null) return this._available;
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const available = await this._callNative('isAvailable');
        this._available = !!available;
      } catch (e) {
        console.warn('[HealthDataService] isAvailable check failed:', e);
        this._available = false;
      }
    } else if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const status = await this._healthConnect.getSdkStatus();
        this._available = status === 3; // SDK_AVAILABLE
      } catch (e) {
        console.warn('[HealthDataService] getSdkStatus failed:', e);
        this._available = false;
      }
    } else {
      this._available = false;
    }
    return this._available;
  }

  async requestPermissions() {
    this._loadModules();

    if (Platform.OS === 'ios' && this._healthKit) {
      const permissions = {
        permissions: {
          read: [
            HK_PERMISSIONS.StepCount,
            HK_PERMISSIONS.SleepAnalysis,
            HK_PERMISSIONS.Workout,
            HK_PERMISSIONS.ActiveEnergyBurned,
            HK_PERMISSIONS.Water,
          ],
          write: [],
        },
      };
      const results = await this._callNative('initHealthKit', permissions);
      this._initialized = true;
      return results;
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      await this._healthConnect.initialize();
      const granted = await this._healthConnect.requestPermission([
        {accessType: 'read', recordType: 'Steps'},
        {accessType: 'read', recordType: 'SleepSession'},
        {accessType: 'read', recordType: 'ExerciseSession'},
        {accessType: 'read', recordType: 'ActiveCaloriesBurned'},
        {accessType: 'read', recordType: 'Hydration'},
      ]);
      this._initialized = true;
      return granted;
    }

    return null;
  }

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
        const result = await this._healthConnect.readRecords('Steps', {
          timeRangeFilter: {
            operator: 'between',
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
          },
        });
        return (result.records || []).map(r => ({
          startDate: r.startTime,
          endDate: r.endTime,
          value: r.count,
        }));
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
        const result = await this._healthConnect.readRecords('Steps', {
          timeRangeFilter: {
            operator: 'between',
            startTime: today.toISOString(),
            endTime: now.toISOString(),
          },
        });
        let total = 0;
        (result.records || []).forEach(r => {
          total += r.count || 0;
        });
        return total;
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
        const result = await this._healthConnect.readRecords(
          'ActiveCaloriesBurned',
          {
            timeRangeFilter: {
              operator: 'between',
              startTime: startDate.toISOString(),
              endTime: endDate.toISOString(),
            },
          },
        );
        return (result.records || []).map(r => ({
          startDate: r.startTime,
          endDate: r.endTime,
          value: r.energy?.value || 0,
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
        const result = await this._healthConnect.readRecords('SleepSession', {
          timeRangeFilter: {
            operator: 'between',
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
          },
        });
        return (result.records || []).map(r => ({
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

  async getLastNightSleepHours() {
    this._loadModules();
    const start = lastNightStart();
    const end = lastNightEnd();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const results = await this._callNative('getSleepSamples', {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        });
        if (!results || !Array.isArray(results) || results.length === 0) {
          return null;
        }
        let totalMs = 0;
        results.forEach(s => {
          const sStart = new Date(s.startDate).getTime();
          const sEnd = new Date(s.endDate).getTime();
          if (sEnd > sStart) {
            totalMs += sEnd - sStart;
          }
        });
        return totalMs > 0 ? totalMs / (1000 * 60 * 60) : null;
      } catch (e) {
        return null;
      }
    }

    if (Platform.OS === 'android' && this._healthConnect) {
      try {
        const result = await this._healthConnect.readRecords('SleepSession', {
          timeRangeFilter: {
            operator: 'between',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          },
        });
        const records = result.records || [];
        if (records.length === 0) return null;

        let totalMs = 0;
        records.forEach(r => {
          const sStart = new Date(r.startTime).getTime();
          const sEnd = new Date(r.endTime).getTime();
          if (sEnd > sStart) {
            totalMs += sEnd - sStart;
          }
        });
        return totalMs > 0 ? totalMs / (1000 * 60 * 60) : null;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  async getWorkouts(startDate, endDate) {
    this._loadModules();
    const outdoorIos = outdoorActivitiesIosSet();
    const outdoorAndroid = outdoorExerciseTypesAndroidSet();

    if (Platform.OS === 'ios' && this._healthKit) {
      try {
        const results = await this._callNative('getAnchoredWorkouts', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
        if (!results || !results.data) return [];
        return results.data.map(w => ({
          activityType: w.activityName || 'Unknown',
          duration: w.duration || 0,
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
        const result = await this._healthConnect.readRecords(
          'ExerciseSession',
          {
            timeRangeFilter: {
              operator: 'between',
              startTime: startDate.toISOString(),
              endTime: endDate.toISOString(),
            },
          },
        );
        return (result.records || []).map(r => {
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
        const result = await this._healthConnect.readRecords('Hydration', {
          timeRangeFilter: {
            operator: 'between',
            startTime: today.toISOString(),
            endTime: now.toISOString(),
          },
        });
        const records = result.records || [];
        if (records.length === 0) return null;

        let totalL = 0;
        records.forEach(r => {
          if (r.volume) {
            let litres = r.volume.value || 0;
            if (r.volume.unit === 'milliliters') litres /= 1000;
            else if (r.volume.unit === 'fluidOuncesUs') litres *= 0.0295735;
            totalL += litres;
          }
        });
        return totalL > 0 ? totalL : null;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  async getWeeklyOutdoorSummary() {
    const weekStart = daysAgo(7);
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

  isInitialized() {
    return this._initialized;
  }
}

const defaultInstance = new HealthDataService();
export default defaultInstance;
