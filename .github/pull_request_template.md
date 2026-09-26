## What this changes

<!-- One change per pull request. What does a user notice? -->

## Checklist

- [ ] A test for the behaviour I changed (100% coverage stays)
- [ ] A line in the top section of `CHANGELOG.md`, if a user would notice
- [ ] Read-only: nothing writes to HealthKit or Health Connect
- [ ] Nothing leaves the package: no network, storage, analytics or logging
- [ ] Stateless: no module-level `let` or `var`, no caches, no `configure()`
- [ ] Failures are `{ok: false, error}` results, never a silent `0`, `[]` or `null`
- [ ] A touched unit or field name has a test and a link to the platform docs
- [ ] iOS builds still do not reference `react-native-health-connect`
- [ ] No real health data or exports; samples are built in code
- [ ] Numbers, not judgements: no advice, scores or warnings
