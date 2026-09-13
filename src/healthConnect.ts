/**
 * Health Connect, loaded only where it can exist.
 *
 * Metro picks `healthConnect.ios.ts` for iOS builds, so an iOS-only app does
 * not need react-native-health-connect installed: Metro resolves every
 * `require` at bundle time, even one inside a try block. The build keeps this
 * import extensionless so that still works from the published package.
 */

export interface TimeRangeFilter {
  operator: 'between';
  startTime: string;
  endTime: string;
}

export interface HealthConnectPermission {
  accessType: string;
  recordType: string;
}

export interface HealthConnectModule {
  getSdkStatus(): Promise<number>;
  initialize(): Promise<boolean>;
  requestPermission(
    permissions: HealthConnectPermission[]
  ): Promise<HealthConnectPermission[]>;
  getGrantedPermissions(): Promise<HealthConnectPermission[]>;
  readRecords(
    recordType: string,
    options: { timeRangeFilter: TimeRangeFilter; pageToken?: string }
  ): Promise<{ records?: unknown[]; pageToken?: string } | null>;
  aggregateRecord(request: {
    recordType: string;
    timeRangeFilter: TimeRangeFilter;
  }): Promise<Record<string, unknown> | null>;
}

export function loadHealthConnect(): HealthConnectModule | null {
  // A static require, so Metro can bundle it; see above.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-health-connect') as HealthConnectModule;
}
