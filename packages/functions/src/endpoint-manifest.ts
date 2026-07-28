export interface EndpointEntry {
  /** Route path segment in URL (e.g., 'exercises', 'workout-sets', 'guidedMeditations') */
  routePath: string;
  /** Handler file basename without .ts (e.g., 'exercises', 'workoutSets', 'strava-webhook') */
  handlerFile: string;
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
  { routePath: 'mealplans', handlerFile: 'mealplans' },
  { routePath: 'ingredients', handlerFile: 'ingredients' },
  { routePath: 'recipes', handlerFile: 'recipes' },
  { routePath: 'tts', handlerFile: 'tts' },
  { routePath: 'stretches', handlerFile: 'stretches' },
  { routePath: 'guidedMeditations', handlerFile: 'guidedMeditations' },
  { routePath: 'cycling', handlerFile: 'cycling' },
  { routePath: 'strava', handlerFile: 'strava-webhook' },
  { routePath: 'today-coach', handlerFile: 'today-coach' },
  { routePath: 'health-sync', handlerFile: 'health-sync' },
];
