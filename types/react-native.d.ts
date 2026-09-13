// The two react-native exports this package uses, so building and type-checking
// do not need React Native installed. Nothing here is part of the published
// types: no exported type refers to react-native.
declare module 'react-native' {
  export const Platform: { readonly OS: string };
  export const NativeModules: Record<string, unknown>;
}
