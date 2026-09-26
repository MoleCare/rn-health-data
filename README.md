# @molecare/health-data

[![CI](https://github.com/MoleCare/rn-health-data/actions/workflows/ci.yml/badge.svg)](https://github.com/MoleCare/rn-health-data/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@molecare/health-data)](https://www.npmjs.com/package/@molecare/health-data)
![types included](https://img.shields.io/npm/types/@molecare/health-data)
[![licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

Read steps, sleep, workouts, active energy and water from Apple HealthKit (iOS)
and Google Health Connect (Android) through one typed API for React Native.

It only reads. It never writes health data. Every read tells you whether it
worked, so "no permission" is never mistaken for "no activity".

## Not a medical device

This package reads activity numbers the user already has in Apple Health or
Health Connect. It does not diagnose or treat anything, and its results are not
for clinical use. The numbers are only as good as the apps and devices that
recorded them.

## Privacy

- The package stores nothing, sends nothing over the network, has no analytics
  and logs nothing. Data leaves the phone only if your app sends it.
- Your app is responsible for its own privacy policy. Google Play asks apps
  that use Health Connect for a health apps declaration and a privacy policy.
  Apple requires a HealthKit usage description and does not allow HealthKit
  data to be used for advertising.

## Install

Use your project's package manager; they all install from the npm registry.
Add the platform libraries for the platforms you ship.

```bash
npm install @molecare/health-data react-native-health react-native-health-connect
yarn add @molecare/health-data react-native-health react-native-health-connect
pnpm add @molecare/health-data react-native-health react-native-health-connect
bun add @molecare/health-data react-native-health react-native-health-connect
```

| Platform | Peer dependency                                                                         | Version      |
| -------- | --------------------------------------------------------------------------------------- | ------------ |
| iOS      | [`react-native-health`](https://github.com/agencyenterprise/react-native-health)        | `^1.19.0`    |
| Android  | [`react-native-health-connect`](https://github.com/matinzd/react-native-health-connect) | `>=3.5.0 <5` |

Both are optional. An iOS-only app does not need `react-native-health-connect`
(it is loaded from a platform-specific file, so Metro leaves it out of iOS
builds), and an Android-only app does not need `react-native-health`.

### Works with

|                  |                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| React Native     | Metro, with or without package `exports` enabled                                                      |
| Package managers | npm, Yarn 1, Yarn 4 (Plug'n'Play and `node_modules`), pnpm, Bun, each checked in CI                   |
| Bundlers         | Metro, webpack, esbuild: the ES module build, with iOS and Android files chosen by platform extension |
| Node             | `require` (the CommonJS build). Not plain-Node `import`: the platform file needs a bundler            |
| Jest             | default settings; mock `react-native` and the platform libraries as usual                             |
| TypeScript       | types included; `moduleResolution` `bundler`, `node16` and `nodenext`                                 |

**Expo:** this package has no native code of its own. Use a development build
and the platform libraries' own config plugins. `react-native-health-connect`
4.x ships one, and `react-native-health` documents its Expo setup.

## iOS setup

1. In Xcode, add the **HealthKit** capability to your app target.
2. Add both usage descriptions to `Info.plist`. `react-native-health` expects
   the update description even though this package only reads.

   ```xml
   <key>NSHealthShareUsageDescription</key>
   <string>Explain, in your users' words, why your app reads this data.</string>
   <key>NSHealthUpdateUsageDescription</key>
   <string>Explain why your app would write health data.</string>
   ```

3. Follow the rest of the
   [`react-native-health` setup](https://github.com/agencyenterprise/react-native-health#installation).

## Android setup

1. `minSdkVersion` 26 or higher.
2. Set the permission delegate in `MainActivity.kt`:

   ```kotlin
   import android.os.Bundle
   import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate

   override fun onCreate(savedInstanceState: Bundle?) {
     super.onCreate(savedInstanceState)
     HealthConnectPermissionDelegate.setPermissionDelegate(this)
   }
   ```

3. In `AndroidManifest.xml`, declare only the data you read, and the two
   entries Health Connect uses to show your privacy policy:

   ```xml
   <manifest ...>
     <uses-permission android:name="android.permission.health.READ_STEPS" />
     <uses-permission android:name="android.permission.health.READ_SLEEP" />
     <uses-permission android:name="android.permission.health.READ_EXERCISE" />
     <uses-permission android:name="android.permission.health.READ_ACTIVE_CALORIES_BURNED" />
     <uses-permission android:name="android.permission.health.READ_HYDRATION" />

     <queries>
       <package android:name="com.google.android.apps.healthdata" />
     </queries>

     <application ...>
       <activity android:name=".MainActivity" ...>
         <intent-filter>
           <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
         </intent-filter>
       </activity>

       <activity-alias
         android:name="ViewPermissionUsageActivity"
         android:exported="true"
         android:targetActivity=".MainActivity"
         android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
         <intent-filter>
           <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
           <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
         </intent-filter>
       </activity-alias>
     </application>
   </manifest>
   ```

   See the
   [`react-native-health-connect` permissions guide](https://matinzd.github.io/react-native-health-connect/docs/permissions).

## Use

```ts
import { createHealthData } from '@molecare/health-data';

// Create it once and keep it with your app's other services.
const health = createHealthData();

const availability = await health.getAvailability();
if (availability.ok && availability.value === 'available') {
  // Ask only for what your app uses. On iOS, call this once per app launch
  // before reading; HealthKit only shows its sheet for types not yet decided.
  await health.requestPermissions(['steps', 'sleep']);

  const steps = await health.getSteps();
  if (steps.ok) {
    show(steps.value);
  } else if (steps.error.code === 'not_permitted') {
    askAgainLater();
  }

  const sleep = await health.getSleepHours(); // value is null when nothing was recorded
}
```

### Results, not silent zeros

Every method resolves to a `HealthResult<T>`:

```ts
type HealthResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: { code: HealthErrorCode; message: string; cause?: unknown };
    };
```

| `error.code`           | Meaning                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `unsupported_platform` | Neither iOS nor Android                                                        |
| `module_missing`       | `react-native-health` or `react-native-health-connect` is not installed/linked |
| `unavailable`          | Health Connect is not installed, needs an update, or could not start           |
| `not_permitted`        | Read access was not granted (Android only; see below)                          |
| `native_error`         | The platform reported an error; `cause` holds it                               |

Only programming errors are thrown: an invalid option makes `createHealthData`
throw a `TypeError`, and an invalid argument (a bad date or range, an unknown
data type) makes the method reject with one.

**What iOS can't tell you.** HealthKit never tells an app whether read access
was granted. Reading data the user declined returns no samples, which looks
like no activity. So on iOS `getPermissionStatus` answers `{known: false}`, and
reads never fail with `not_permitted`. On Android both are exact.

## API

| Method                          | Value                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAvailability()`             | `'available' \| 'not_installed' \| 'update_required' \| 'unsupported_platform' \| 'module_missing'`                                                |
| `requestPermissions(types?)`    | `PermissionStatus`. Read access to the listed `HealthDataType`s (all five by default)                                                              |
| `getPermissionStatus(types?)`   | `PermissionStatus` without asking: `{known: true, granted, denied}` on Android, `{known: false, requested}` on iOS                                 |
| `getSteps(day?)`                | Steps on a local calendar day (today up to now by default)                                                                                         |
| `getDailySteps({start, end})`   | `{date, startDate, endDate, steps}[]`, days with steps only                                                                                        |
| `getActiveEnergy({start, end})` | `{startDate, endDate, kilocalories}[]`                                                                                                             |
| `getSleep({start, end})`        | `{startDate, endDate, stage}[]`, stages `asleep`, `light`, `deep`, `rem`, `awake`, `in_bed`, `out_of_bed`, `unknown`                               |
| `getSleepHours(night?)`         | Hours asleep, or `null` with no sleep recorded. From `sleepWindowStartHour` the day before to `sleepWindowEndHour`; overlapping samples count once |
| `getWorkouts({start, end})`     | `{activityType, durationMinutes, startDate, endDate, isOutdoor}[]`                                                                                 |
| `getOutdoorMinutes(day?)`       | Outdoor workout minutes on a local calendar day                                                                                                    |
| `getWaterLitres(day?)`          | Litres, or `null` with none recorded                                                                                                               |
| `getOutdoorSummary()`           | `{totalOutdoorMinutes, averageDailySteps, activeDays}` from midnight `summaryDays` ago                                                             |

`HealthDataType` is `'steps' | 'sleep' | 'workouts' | 'activeEnergy' | 'water'`
(all listed in `HEALTH_DATA_TYPES`). Days are local calendar days, including the
days the clocks change.

On Android, Health Connect's totals are used for steps and water, so steps
recorded by both a phone and a watch count once.

## No state, no global settings

`createHealthData` returns a frozen client with no state of its own: no cache,
no singleton, no global configuration. Options are copied and frozen at
creation, and an unknown or invalid option throws a `TypeError`.

| Option                        | Default                                  | Meaning                                                    |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `outdoorActivitiesIos`        | `DEFAULT_OUTDOOR_ACTIVITIES_IOS`         | HealthKit activity names counted as outdoor                |
| `outdoorExerciseTypesAndroid` | `DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID` | Health Connect exercise type numbers counted as outdoor    |
| `sleepWindowStartHour`        | `18`                                     | "Last night" starts at this local hour the day before      |
| `sleepWindowEndHour`          | `12`                                     | ...and ends at this local hour                             |
| `summaryDays`                 | `7`                                      | `getOutdoorSummary` reads from midnight this many days ago |
| `now`                         | `() => new Date()`                       | The clock for "today" and "last night"                     |

```ts
import {
  createHealthData,
  DEFAULT_OUTDOOR_ACTIVITIES_IOS,
} from '@molecare/health-data';

const health = createHealthData({
  outdoorActivitiesIos: [...DEFAULT_OUTDOOR_ACTIVITIES_IOS, 'Yoga'],
  sleepWindowStartHour: 20,
});
```

## Upgrading from 0.x

See [CHANGELOG.md](CHANGELOG.md): the class became `createHealthData`, reads
return `HealthResult`s, and the "today" methods were renamed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as
described in [SECURITY.md](SECURITY.md).

## License

Apache-2.0 © MoleCare LTD
