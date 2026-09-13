# Contributing to @molecare/health-data

Thanks for being here. This package is small, pure JavaScript, and its tests
run in plain Node, so it is a good place for a first contribution.

## The rules that are not negotiable

**This package reads health data and hands it to the app. Nothing else.**

- **Read-only.** No change that writes to HealthKit or Health Connect.
- **Nothing leaves the package.** No network calls, no storage, no analytics,
  and no logging of health values (logging an error message is fine).
- **Least access.** Apps ask only for the data types they pass to
  `requestPermissions`.
- **Numbers, not judgements.** It reports steps, hours and litres. It is not a
  medical device, and changes that turn numbers into health advice, scores or
  warnings will be declined, however good the code is.

If you are unsure whether a change fits, open an issue and ask before writing
the code.

## Getting set up

```bash
git clone https://github.com/MoleCare/rn-health-data.git
cd rn-health-data
npm ci
npm test
```

You need Node 20 or newer. The tests mock `react-native`, HealthKit and Health
Connect, so no simulator or device is needed.

## Units and field names

Most bugs here are a unit or a field name: HealthKit workout durations are in
seconds, Health Connect energy is `{inKilocalories}` and volume is
`{inLiters}`, Health Connect pages its records. When you touch a reading,
add a test that pins the unit or field the platform library really returns,
and link to where that library documents it.

## Test data

**Never commit, attach or link real health data**, or an export from Apple
Health or Health Connect, in code, tests, issues or pull requests. Tests build
their samples in code.

## Pull requests

- One change per pull request, with a test for the behaviour you changed.
- `npm test` passes; CI runs it on Node 20 and 22.
- Keep defaults brand-neutral: no product names, hosts or IDs.
- Describe what changed and why in plain words.

## Releases

Maintainers publish to npm from a GitHub Release. The release workflow checks
that the tag matches `package.json`, runs the tests, and publishes with npm
provenance through GitHub's OIDC trusted publishing, so no npm token is stored
anywhere.

## Code of conduct

Everyone taking part is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
