/**
 * Runtime configuration for @molecare/health-data.
 * Outdoor activity sets are injectable options (defaults match common outdoor sports).
 */

export const DEFAULT_OUTDOOR_ACTIVITIES_IOS = Object.freeze([
  'Running',
  'Walking',
  'Cycling',
  'Hiking',
  'Golf',
  'Soccer',
  'Tennis',
  'Cricket',
  'Baseball',
  'Softball',
  'Lacrosse',
  'Rugby',
  'AmericanFootball',
  'AustralianFootball',
  'TrackAndField',
  'Rowing',
  'Sailing',
  'SurfingSports',
  'Swimming',
  'WaterSports',
  'Fishing',
  'Hunting',
  'EquestrianSports',
  'SnowSports',
  'CrossCountrySkiing',
  'DownhillSkiing',
  'Snowboarding',
]);

/** Health Connect exercise type integers typically outdoors */
export const DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID = Object.freeze([
  56, // RUNNING
  79, // WALKING
  8, // CYCLING
  37, // HIKING
  35, // GOLF
  64, // SOCCER
  76, // TENNIS
  6, // CRICKET
  3, // BASEBALL
  67, // SOFTBALL
  58, // RUGBY
  1, // AMERICAN_FOOTBALL
  74, // SWIMMING_POOL
  73, // SWIMMING_OPEN_WATER
  57, // ROWING
  59, // SAILING
  62, // SKATEBOARDING
  63, // SKIING
  66, // SNOWBOARDING
]);

const DEFAULTS = Object.freeze({
  outdoorActivitiesIos: DEFAULT_OUTDOOR_ACTIVITIES_IOS,
  outdoorExerciseTypesAndroid: DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID,
});

let config = {
  outdoorActivitiesIos: [...DEFAULT_OUTDOOR_ACTIVITIES_IOS],
  outdoorExerciseTypesAndroid: [...DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID],
};

export function configure(partial = {}) {
  if (partial.outdoorActivitiesIos) {
    config.outdoorActivitiesIos = [...partial.outdoorActivitiesIos];
  }
  if (partial.outdoorExerciseTypesAndroid) {
    config.outdoorExerciseTypesAndroid = [
      ...partial.outdoorExerciseTypesAndroid,
    ];
  }
  return getConfig();
}

export function getConfig() {
  return {
    outdoorActivitiesIos: [...config.outdoorActivitiesIos],
    outdoorExerciseTypesAndroid: [...config.outdoorExerciseTypesAndroid],
  };
}

export function resetConfig() {
  config = {
    outdoorActivitiesIos: [...DEFAULT_OUTDOOR_ACTIVITIES_IOS],
    outdoorExerciseTypesAndroid: [...DEFAULT_OUTDOOR_EXERCISE_TYPES_ANDROID],
  };
}

export function outdoorActivitiesIosSet() {
  return new Set(config.outdoorActivitiesIos);
}

export function outdoorExerciseTypesAndroidSet() {
  return new Set(config.outdoorExerciseTypesAndroid);
}
