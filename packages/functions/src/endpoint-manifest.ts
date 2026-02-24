export type OptionsPreset = 'default' | 'withOpenAi' | 'withTts';

export interface EndpointEntry {
  /** Route path segment in URL (e.g., 'exercises', 'workout-sets', 'guidedMeditations') */
  routePath: string;
  /** Handler file basename without .ts (e.g., 'exercises', 'workoutSets', 'strava-webhook') */
  handlerFile: string;
  /** Options preset for Cloud Function registration. Default: 'default' */
  options?: OptionsPreset;
  /** If true, only register a dev function (no prod export). Default: false */
  devOnly?: boolean;
  /** Override the PascalCase function stem derived from routePath. */
  functionStem?: string;
  /** Override the URL source pattern. Default: /api/{env}/{routePath} */
  customSource?: string;
}

export const ENDPOINT_MANIFEST: readonly EndpointEntry[] = [
  { routePath: 'health', handlerFile: 'health' },
  { routePath: 'exercises', handlerFile: 'exercises' },
  { routePath: 'stretch-sessions', handlerFile: 'stretchSessions' },
  { routePath: 'meditation-sessions', handlerFile: 'meditationSessions' },
  { routePath: 'plans', handlerFile: 'plans' },
  { routePath: 'workouts', handlerFile: 'workouts' },
  { routePath: 'workout-sets', handlerFile: 'workoutSets' },
  { routePath: 'calendar', handlerFile: 'calendar' },
  { routePath: 'mesocycles', handlerFile: 'mesocycles' },
  { routePath: 'barcodes', handlerFile: 'barcodes' },
  { routePath: 'meals', handlerFile: 'meals' },
  { routePath: 'mealplans', handlerFile: 'mealplans', options: 'withOpenAi' },
  { routePath: 'ingredients', handlerFile: 'ingredients' },
  { routePath: 'recipes', handlerFile: 'recipes' },
  { routePath: 'tts', handlerFile: 'tts', options: 'withTts' },
  { routePath: 'stretches', handlerFile: 'stretches' },
  { routePath: 'guidedMeditations', handlerFile: 'guidedMeditations' },
  { routePath: 'cycling', handlerFile: 'cycling' },
  { routePath: 'strava', handlerFile: 'strava-webhook' },
  { routePath: 'cycling-coach', handlerFile: 'cycling-coach', options: 'withOpenAi' },
  { routePath: 'today-coach', handlerFile: 'today-coach', options: 'withOpenAi' },
  { routePath: 'health-sync', handlerFile: 'health-sync' },
  { routePath: '', handlerFile: 'mealplan-debug', devOnly: true, functionStem: 'MealplanDebug', customSource: '/debug' },
];
