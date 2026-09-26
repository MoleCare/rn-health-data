/**
 * Create the client once and keep it with your app's other services.
 *
 * The package keeps no state of its own, so "once" is your app's choice: a
 * module like this one, a React context, or your dependency container. Pass
 * settings here; there is no global configure().
 */
import { createHealthData } from '@molecare/health-data';

export const health = createHealthData({
  // "Last night" runs from 20:00 the day before until 11:00.
  sleepWindowStartHour: 20,
  sleepWindowEndHour: 11,
  // The weekly summary covers two weeks in this app.
  summaryDays: 14,
});
