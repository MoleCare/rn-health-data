/**
 * Today's steps and last night's sleep, each with its own state.
 *
 * A failed read is a result, not a zero: "not permitted" and "nothing
 * recorded" are shown as what they are, never as 0 steps. Numbers only,
 * with no goals or judgements attached.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { HealthResult } from '@molecare/health-data';
import { health } from './healthService';

type Reading<T> =
  { state: 'loading' } | { state: 'done'; result: HealthResult<T> };

function describe<T>(
  reading: Reading<T>,
  format: (value: T) => string
): string {
  if (reading.state === 'loading') return '…';
  const { result } = reading;
  if (result.ok) return format(result.value);
  switch (result.error.code) {
    case 'not_permitted':
      return 'Not shared. You can allow it in Health Connect settings.';
    case 'unavailable':
    case 'module_missing':
    case 'unsupported_platform':
      return 'Not available on this device.';
    default:
      return 'Could not be read just now.';
  }
}

export function TodayCard() {
  const [steps, setSteps] = useState<Reading<number>>({ state: 'loading' });
  const [sleep, setSleep] = useState<Reading<number | null>>({
    state: 'loading',
  });

  useEffect(() => {
    void health.getSteps().then((result) => {
      setSteps({ state: 'done', result });
    });
    void health.getSleepHours().then((result) => {
      setSleep({ state: 'done', result });
    });
  }, []);

  return (
    <View>
      <Text accessibilityRole="header">Today</Text>
      <Text>Steps: {describe(steps, (n) => n.toLocaleString())}</Text>
      <Text>
        Last night:{' '}
        {describe(sleep, (hours) =>
          hours === null
            ? 'no sleep recorded'
            : `${hours.toFixed(1)} hours asleep`
        )}
      </Text>
    </View>
  );
}
