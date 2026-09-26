# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `examples/`: create-once service, a skippable connect screen, a today card
  with per-reading states, and a weekly summary tested with a fake client. CI
  typechecks and runs them. Not part of the published package.

## 1.0.0

First public release. Breaking changes from 0.x, which was never published.

### Changed

- Written in TypeScript and published as built code: CommonJS and ES modules,
  each with its own type declarations, behind an `exports` map.
- `createHealthData(options)` replaces the `HealthDataService` class. The
  client is frozen and keeps no state of its own.
- **Every read resolves to a `HealthResult`**: `{ok: true, value}` or
  `{ok: false, error: {code, message, cause?}}`. The codes are
  `unsupported_platform`, `module_missing`, `unavailable`, `not_permitted`
  and `native_error`. 0.x returned `0`, `[]` or `null` for every failure, so
  "no permission" looked like "no activity".
- The same result shapes on both platforms:
  - `getSleep` returns intervals with a named `stage` (`asleep`, `light`,
    `deep`, `rem`, `awake`, `in_bed`, `out_of_bed`, `unknown`) instead of raw
    HealthKit samples or Health Connect stage numbers.
  - `getDailySteps` returns `{date, startDate, endDate, steps}`.
  - Workouts have `durationMinutes`.
- `getAvailability()` says why data is unavailable (`not_installed`,
  `update_required`, `module_missing`, `unsupported_platform`) instead of
  `false`.
- `requestPermissions` and the new `getPermissionStatus` return a
  `PermissionStatus`. It is known on Android and explicitly unknown on iOS,
  where HealthKit never reveals read access.
- On Android every read now starts Health Connect and checks read access first.
  In 0.x, reads before `requestPermissions` in the same app session failed and
  came back as `0`.
- Renamed: `getTodaySteps` → `getSteps(day?)`,
  `getTodayOutdoorWorkoutMinutes` → `getOutdoorMinutes(day?)`,
  `getTodayWaterIntake` → `getWaterLitres(day?)`,
  `getLastNightSleepHours` → `getSleepHours(night?)`,
  `getWeeklyOutdoorSummary` → `getOutdoorSummary` (`avgDailySteps` is now
  `averageDailySteps`), `getStepsData` → `getDailySteps({start, end})`,
  `getActiveEnergyBurned` → `getActiveEnergy({start, end})`,
  `getSleepData` → `getSleep({start, end})`. The "today" methods take an
  optional day.
- New `now` option: the clock used for "today" and "last night".
- An invalid argument or option is a programming error: the method rejects
  with a `TypeError` (the factory throws one).
- Peer dependency `react-native-health-connect` is `>=3.5.0 <5`, and
  `react-native-health` is `^1.19.0`.

### Removed

- The `HealthDataService` class, `isInitialized()` (keep track in your app if
  you need to), and the default export.
- `console.warn` calls. Errors are returned, not logged.
