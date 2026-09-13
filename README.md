# @molecare/health-data

Read steps, sleep, workouts, active energy and water from Apple HealthKit (iOS)
and Google Health Connect (Android) through one JavaScript API for React Native.

It only reads. It never writes health data.

## Not a medical device

This package reads activity numbers the user already has in Apple Health or
Health Connect. It does not diagnose or treat anything, and its results are not
for clinical use. The numbers are only as good as the apps and devices that
recorded them.

## Privacy

- The package stores nothing, sends nothing over the network and has no
  analytics. Data leaves the phone only if your app sends it.
- It logs error messages, never health values.
- Your app is responsible for its own privacy policy. Google Play asks apps
  that use Health Connect for a health apps declaration and a privacy policy.
  Apple requires a HealthKit usage description and does not allow HealthKit
  data to be used for advertising.

## Install

```bash
npm install @molecare/health-data
npm install react-native-health           # iOS
npm install react-native-health-connect   # Android
```

| Platform | Peer dependency | Version |
|---|---|---|
| iOS | [`react-native-health`](https://github.com/agencyenterprise/react-native-health) | `>=1.19.0` |
| Android | [`react-native-health-connect`](https://github.com/matinzd/react-native-health-connect) | `>=3.5.0` |

Both peers are optional. An iOS-only app does not need
`react-native-health-connect` (the Android module is loaded from a
platform-specific file, so Metro leaves it out of iOS builds), and an
Android-only app does not need `react-native-health`.

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
   [`react-native-health-connect` permissions guide](https://matinzd.github.io/react-native-health-connect/docs/permissions)
   for details.

## Usage

```js
import {HealthDataService} from '@molecare/health-data';

// Create it once and keep it with your app's other services.
const health = new HealthDataService();

if (await health.isAvailable()) {
  // Ask only for what your app uses.
  await health.requestPermissions(['steps', 'sleep']);

  const steps = await health.getTodaySteps();
  const sleepHours = await health.getLastNightSleepHours(); // null when nothing is recorded
}
```

## No state, no global settings

The package has no shared instance and no global configuration. Your app
creates a `HealthDataService` and chooses its settings; two services with
different settings never affect each other. Options are copied and frozen when
the service is created, and an unknown or invalid option throws a `TypeError`.

| Option | Default | Meaning |
|---|---|---|
| `outdoorActivitiesIos` | `DEFAULT_OUTDOOR_ACTIVITIES_IOS` | HealthKit activity names `getWorkouts` marks `isOutdoor` |
| `outdoorExerciseTypesAndroid` | `DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID` | Health Connect exercise type numbers marked `isOutdoor` |
| `sleepWindowStartHour` | `18` | "Last night" starts at this hour yesterday (local time) |
| `sleepWindowEndHour` | `12` | ...and ends at this hour today |
| `summaryDays` | `7` | `getWeeklyOutdoorSummary` reads from midnight this many days ago |

```js
import {HealthDataService, DEFAULT_OUTDOOR_ACTIVITIES_IOS} from '@molecare/health-data';

const health = new HealthDataService({
  outdoorActivitiesIos: [...DEFAULT_OUTDOOR_ACTIVITIES_IOS, 'Yoga'],
  outdoorExerciseTypesAndroid: [56, 79, 8],
  sleepWindowStartHour: 20,
});
```

Nothing is cached: `isAvailable()` asks the platform each time, because Health
Connect can be installed while your app is running. The package stores no
health data; what to keep, and where, is your app's decision.

## API

| Method | Returns | Notes |
|---|---|---|
| `isAvailable()` | `boolean` | HealthKit is available, or the Health Connect SDK is available |
| `requestPermissions(types?)` | platform result | `types` from `HEALTH_DATA_TYPES`: `'steps'`, `'sleep'`, `'workouts'`, `'activeEnergy'`, `'water'`. All five by default. Throws on an unknown type. Read access only. |
| `getTodaySteps()` | `number` | On Android, Health Connect's total, de-duplicated across apps and devices |
| `getStepsData(start, end)` | `[{startDate, endDate, value}]` | One entry per day |
| `getActiveEnergyBurned(start, end)` | `[{startDate, endDate, value}]` | Kilocalories |
| `getSleepData(start, end)` | raw samples | iOS: HealthKit sleep samples. Android: sessions, with stages in `value` |
| `getLastNightSleepHours()` | `number \| null` | `sleepWindowStartHour` yesterday to `sleepWindowEndHour` today (18:00 to 12:00 by default). Time asleep only; overlapping samples count once |
| `getWorkouts(start, end)` | `[{activityType, duration, startDate, endDate, isOutdoor}]` | `duration` in minutes |
| `getTodayOutdoorWorkoutMinutes()` | `number` | |
| `getTodayWaterIntake()` | `number \| null` | Litres |
| `getWeeklyOutdoorSummary()` | `{totalOutdoorMinutes, avgDailySteps, activeDays}` | From midnight `summaryDays` (7) days ago until now |
| `isInitialized()` | `boolean` | `true` once `requestPermissions` has finished on this service. It does not mean access was granted; HealthKit never tells apps that |
| `options` | `object` | The frozen options the service was created with |

When a read fails (no permission, module missing, platform error) the method
returns an empty value (`0`, `[]` or `null`) instead of throwing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as
described in [SECURITY.md](SECURITY.md).

## License

Apache-2.0 © MoleCare LTD
