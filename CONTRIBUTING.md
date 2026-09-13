# Contributing to @molecare/health-data

Thanks for being here. This package is a small TypeScript library, and its
tests run in plain Node with the platforms mocked, so it is a good place for a
first contribution.

## The rules that are not negotiable

**This package reads health data and hands it to the app. Nothing else.**

- **Read-only.** No change that writes to HealthKit or Health Connect.
- **Nothing leaves the package.** No network calls, no storage, no analytics,
  no logging.
- **Least access.** Apps ask only for the data types they pass to
  `requestPermissions`.
- **Numbers, not judgements.** It reports steps, hours and litres. It is not a
  medical device, and changes that turn numbers into health advice, scores or
  warnings will be declined, however good the code is.

If you are unsure whether a change fits, open an issue and ask before writing
the code.

## Design rules

- **Stateless.** No module-level `let` or `var` (a test checks), no caches, no
  singletons, no `configure()`. A setting is an option with its default in
  `src/options.ts`.
- **Results, not silent defaults.** A read never returns `0`, `[]` or `null` for
  a failure; it returns `{ok: false, error}` with a code. Only programming
  errors throw or reject.
- **Same shape on both platforms.** Normalise platform values (units, stage
  names, field names) inside the package; never pass raw platform objects on.
- **Be honest about the platforms.** If a platform can't know something (iOS
  read access), say so in the type, as `PermissionStatus` does.
- **iOS builds must not reference `react-native-health-connect`.** Only
  `src/healthConnect.ts` loads it, and `src/healthConnect.ios.ts` replaces it
  for iOS; a test checks.
- **Calendar days, not 24 hours.** Use the helpers in `src/time.ts`; the suite
  runs in `Europe/London` so daylight saving bugs show up.

## Getting set up

```bash
git clone https://github.com/MoleCare/rn-health-data.git
cd rn-health-data
npm ci
```

You need Node 20.19 or newer to work on it. The tests mock `react-native`,
HealthKit and Health Connect, so no simulator or device is needed.

| Command                           | What it does                                                                |
| --------------------------------- | --------------------------------------------------------------------------- |
| `npm test`                        | Jest tests (TypeScript, via Babel), in `Europe/London`                      |
| `npm run typecheck`               | `tsc` in strict mode                                                        |
| `npm run lint` / `npm run format` | ESLint (typescript-eslint, strict) and Prettier                             |
| `npm run build`                   | Builds `lib/` with react-native-builder-bob: CommonJS, ES modules and types |
| `npm run check:package`           | Builds, then publint and arethetypeswrong on the packed package             |
| `npm run check:consumer -- pnpm`  | Installs the packed package with that package manager and loads it          |

CI runs all of these on every pull request.

## Units and field names

Most bugs here are a unit or a field name: HealthKit workout durations are in
seconds, Health Connect energy is `{inKilocalories}` and volume is
`{inLiters}`, and Health Connect pages its records. When you touch a reading,
add a test that pins the unit or field the platform library really returns,
and link to where that library documents it.

## Test data

**Never commit, attach or link real health data**, or an export from Apple
Health or Health Connect, in code, tests, issues or pull requests. Tests build
their samples in code.

## Pull requests

- One change per pull request, with a test for the behaviour you changed.
- Add a line to the top section of `CHANGELOG.md` for anything a user would notice.
- Keep defaults brand-neutral: no product names, hosts or IDs.

## Releases

Maintainers bump the version in `package.json`, add its `CHANGELOG.md`
section, and publish a GitHub Release tagged `v<version>`. The release workflow
checks the tag and the changelog, runs every check, builds once, and publishes
to npm with provenance through GitHub's OIDC trusted publishing, so no npm
token is stored anywhere.

## Code of conduct

Everyone taking part is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
