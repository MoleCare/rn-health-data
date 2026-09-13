import type { HealthConnectModule } from './healthConnect';

/** Health Connect is Android only; see healthConnect.ts. */
export function loadHealthConnect(): HealthConnectModule | null {
  return null;
}
