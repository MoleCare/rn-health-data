# Examples

Complete, copy-paste starting points. CI typechecks every file here against
the package, and runs the plain ones, so they stay in step with the API.

| File                                                 | Shows                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`healthService.ts`](healthService.ts)               | Creating the client once, with your settings                                                                     |
| [`ConnectHealthScreen.tsx`](ConnectHealthScreen.tsx) | A gentle, skippable connect screen: Health Connect missing or out of date, and iOS never saying what was allowed |
| [`TodayCard.tsx`](TodayCard.tsx)                     | Today's steps and last night's sleep, each with its own state, never a silent zero                               |
| [`weeklySummary.ts`](weeklySummary.ts)               | A weekly summary from any client, tested with a fake one                                                         |

You still need the native setup from the main README (iOS entitlement and
usage text, Android permissions and the Health Connect rationale).
