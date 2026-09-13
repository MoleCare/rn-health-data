// Used by Jest only. The published build is made by react-native-builder-bob
// with its own preset (npm run build).
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
};
