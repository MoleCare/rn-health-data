/**
 * A weekly summary as plain text, from any HealthData client.
 *
 * It takes the client as an argument, so it runs in tests with a fake client
 * (see __tests__/examples.test.ts) and needs no phone.
 */
import type { HealthData } from '@molecare/health-data';

export async function weeklySummary(
  health: HealthData,
  today: Date
): Promise<string[]> {
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const days = await health.getDailySteps({ start, end: today });
  if (!days.ok) return ['Steps are not available this week.'];
  if (days.value.length === 0) return ['No steps recorded this week.'];

  const total = days.value.reduce((sum, day) => sum + day.steps, 0);
  const busiest = days.value.reduce((best, day) =>
    day.steps > best.steps ? day : best
  );
  return [
    `${total.toLocaleString('en-GB')} steps over ${String(days.value.length)} days with steps.`,
    `Most steps on ${busiest.date}: ${busiest.steps.toLocaleString('en-GB')}.`,
  ];
}
