/**
 * A gentle "connect your health data" screen.
 *
 * - Always skippable: the app works without it.
 * - Asks only for the two types this app reads.
 * - Handles Health Connect not installed or out of date on Android.
 * - Is honest that iOS never says whether access was granted.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Linking,
  Platform,
  Text,
  View,
} from 'react-native';
import type { Availability } from '@molecare/health-data';
import { health } from './healthService';

const HEALTH_CONNECT_ON_PLAY =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

type Step = 'checking' | Availability | 'connected' | 'asked_ios' | 'declined';

export function ConnectHealthScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('checking');

  useEffect(() => {
    void health.getAvailability().then((result) => {
      // A failed check is treated like "not available": the screen offers to skip.
      setStep(result.ok ? result.value : 'unsupported_platform');
    });
  }, []);

  const connect = async () => {
    const result = await health.requestPermissions(['steps', 'sleep']);
    if (!result.ok) {
      setStep('declined');
    } else if (!result.value.known) {
      // iOS: HealthKit never tells apps what was allowed. Reads of declined
      // types simply come back empty, so the app carries on either way.
      setStep('asked_ios');
    } else {
      setStep(result.value.granted.length > 0 ? 'connected' : 'declined');
    }
  };

  const message: Record<Step, string> = {
    checking: '',
    available:
      'Show your steps and sleep next to your notes. You can change this at any time.',
    not_installed:
      'Steps and sleep come from Health Connect, which is not on this phone yet.',
    update_required:
      'Health Connect needs an update before it can share steps and sleep.',
    unsupported_platform:
      'Health data is not available on this device. Everything else works.',
    module_missing: 'Health data is not set up in this build.',
    connected:
      'Connected. Your steps and sleep will appear on the home screen.',
    asked_ios:
      'Done. If you allowed access, your steps and sleep will appear on the home screen.',
    declined: 'No problem. You can connect later in Settings.',
  };

  if (step === 'checking')
    return <ActivityIndicator accessibilityLabel="Checking health data" />;

  return (
    <View>
      <Text accessibilityRole="header">Steps and sleep</Text>
      <Text>{message[step]}</Text>
      {step === 'available' && (
        <Button
          title="Connect"
          onPress={() => {
            void connect();
          }}
        />
      )}
      {Platform.OS === 'android' &&
        (step === 'not_installed' || step === 'update_required') && (
          <Button
            title={
              step === 'not_installed'
                ? 'Get Health Connect'
                : 'Update Health Connect'
            }
            onPress={() => {
              void Linking.openURL(HEALTH_CONNECT_ON_PLAY);
            }}
          />
        )}
      <Button
        title={step === 'available' ? 'Not now' : 'Continue'}
        onPress={onDone}
      />
    </View>
  );
}
