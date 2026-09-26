// Just enough of React Native's types for the examples to typecheck without
// installing React Native itself (it includes the two exports the package
// uses). Apps use the real 'react-native' types.
declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';

  export const Platform: { readonly OS: string };
  export const NativeModules: Record<string, unknown>;
  export const Linking: { openURL: (url: string) => Promise<void> };
  export const View: ComponentType<{ style?: object; children?: ReactNode }>;
  export const Text: ComponentType<{
    style?: object;
    children?: ReactNode;
    accessibilityRole?: 'header' | 'text';
  }>;
  export const Button: ComponentType<{ title: string; onPress: () => void }>;
  export const ActivityIndicator: ComponentType<{
    accessibilityLabel?: string;
  }>;
}
