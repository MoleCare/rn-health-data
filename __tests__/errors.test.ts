// Failure paths that the main suite does not reach: a combined read that
// fails part-way, and HealthKit errors that are neither Errors nor strings.

import { createHealthData } from '../src';

jest.mock(
  'react-native',
  () => ({ Platform: { OS: 'android' }, NativeModules: {} }),
  { virtual: true }
);
jest.mock(
  'react-native-health-connect',
  () => ({
    initialize: jest.fn(),
    getGrantedPermissions: jest.fn(),
    readRecords: jest.fn(),
  }),
  { virtual: true }
);

const rn = jest.requireMock<{
  Platform: { OS: string };
  NativeModules: Record<string, unknown>;
}>('react-native');
const hc = jest.requireMock<{
  initialize: jest.Mock;
  getGrantedPermissions: jest.Mock;
  readRecords: jest.Mock;
}>('react-native-health-connect');

beforeEach(() => {
  jest.resetAllMocks();
  rn.Platform.OS = 'android';
  delete rn.NativeModules.AppleHealthKit;
  hc.initialize.mockResolvedValue(true);
});

it('outdoor minutes fail with the reason instead of returning zero', async () => {
  hc.getGrantedPermissions.mockResolvedValue([
    { accessType: 'read', recordType: 'Steps' },
  ]);

  expect(await createHealthData().getOutdoorMinutes()).toMatchObject({
    ok: false,
    error: { code: 'not_permitted' },
  });
  expect(hc.readRecords).not.toHaveBeenCalled();
});

it('keeps a HealthKit error object as the cause', async () => {
  const nativeError = { domain: 'com.apple.healthkit', code: 5 };
  rn.Platform.OS = 'ios';
  rn.NativeModules.AppleHealthKit = {
    isAvailable: jest.fn(),
    getWater: jest.fn((_: unknown, cb: (e: unknown) => void) => {
      cb(nativeError);
    }),
  };

  const result = await createHealthData().getWaterLitres();

  expect(result).toMatchObject({
    ok: false,
    error: { code: 'native_error', message: 'HealthKit reported an error' },
  });
  expect(!result.ok && (result.error.cause as Error).cause).toBe(nativeError);
});
