# @molecare/health-data

Unified HealthKit (iOS) + Health Connect (Android) facade for React Native.

**Status:** private package under the [MoleCare](https://github.com/MoleCare) org. Not published to npm yet.

## Peer dependencies

Install the platform modules in the **host app** (not bundled here):

| Platform | Package | Notes |
|----------|---------|--------|
| iOS | `react-native-health` `>=1.19.0` | Exposes `NativeModules.AppleHealthKit`. Follow that library's HealthKit entitlement / Info.plist setup. |
| Android | `react-native-health-connect` `>=3.5.0` | Requires Health Connect on device / Play services. |

Both peers are marked optional so a single-platform app can omit the other.

## Install

```bash
npm install @molecare/health-data
# iOS
npm install react-native-health
# Android
npm install react-native-health-connect
```

## Usage

```js
import HealthData, {
  configure,
  HealthDataService,
  DEFAULT_OUTDOOR_ACTIVITIES_IOS,
} from '@molecare/health-data';

// Optional: override which activities count as outdoor
configure({
  outdoorActivitiesIos: [...DEFAULT_OUTDOOR_ACTIVITIES_IOS, 'Yoga'],
  outdoorExerciseTypesAndroid: [56, 79, 8],
});

await HealthData.requestPermissions();
const steps = await HealthData.getTodaySteps();
```

Default export is a shared singleton (same pattern as the phone app).
`HealthDataService` is the class if you need a fresh instance.

## What this package deliberately omits

- No product backend URLs or API clients
- No Firebase / CDN hosts
- No App Group identifiers

## License

Apache-2.0 © MoleCare LTD
