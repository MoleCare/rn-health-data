/**
 * Health Connect, loaded only where it can exist.
 *
 * Metro picks `healthConnect.ios.js` for iOS builds, so an iOS-only app does
 * not need react-native-health-connect installed: Metro resolves every
 * `require` at bundle time, even one inside a try block.
 */
export function loadHealthConnect() {
  return require('react-native-health-connect');
}
