// The examples in examples/ are documentation; this runs the plain one with a
// fake client, so a change that breaks it fails here, not in someone's app.
import type { HealthData, HealthResult } from '@molecare/health-data';
import { weeklySummary } from '../examples/weeklySummary';

type DailySteps = Awaited<ReturnType<HealthData['getDailySteps']>>;

const fakeClient = (result: DailySteps) => {
  const calls: { start: Date; end: Date }[] = [];
  const client = {
    getDailySteps: (range: { start: Date; end: Date }) => {
      calls.push(range);
      return Promise.resolve(result);
    },
  } as unknown as HealthData;
  return { client, calls };
};

const day = (date: string, steps: number) => ({
  date,
  startDate: `${date}T00:00:00.000Z`,
  endDate: `${date}T23:59:59.999Z`,
  steps,
});

const today = new Date('2026-06-10T15:00:00');

describe('examples/weeklySummary', () => {
  it('sums the week and names the day with most steps', async () => {
    const { client, calls } = fakeClient({
      ok: true,
      value: [
        day('2026-06-08', 4200),
        day('2026-06-09', 11050),
        day('2026-06-10', 3000),
      ],
    });
    await expect(weeklySummary(client, today)).resolves.toEqual([
      '18,250 steps over 3 days with steps.',
      'Most steps on 2026-06-09: 11,050.',
    ]);
    // From local midnight six days before today, up to now.
    expect(calls[0]?.start.getDate()).toBe(4);
    expect(calls[0]?.start.getHours()).toBe(0);
    expect(calls[0]?.end).toBe(today);
  });

  it('says so when nothing was recorded', async () => {
    const { client } = fakeClient({ ok: true, value: [] });
    await expect(weeklySummary(client, today)).resolves.toEqual([
      'No steps recorded this week.',
    ]);
  });

  it('says so when steps cannot be read, instead of showing zero', async () => {
    const failure: HealthResult<never> = {
      ok: false,
      error: {
        code: 'not_permitted',
        message: 'Read access to steps was not granted',
      },
    };
    const { client } = fakeClient(failure);
    await expect(weeklySummary(client, today)).resolves.toEqual([
      'Steps are not available this week.',
    ]);
  });
});
