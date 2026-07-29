import express from 'express';
import { healthApp } from './handlers/health.js';
import { exercisesApp } from './handlers/exercises.js';
import { stretchSessionsApp } from './handlers/stretchSessions.js';
import { meditationSessionsApp } from './handlers/meditationSessions.js';
import { plansApp } from './handlers/plans.js';
import { workoutsApp } from './handlers/workouts.js';
import { workoutSetsApp } from './handlers/workoutSets.js';
import { calendarApp } from './handlers/calendar.js';
import { mesocyclesApp } from './handlers/mesocycles.js';
import { barcodesApp } from './handlers/barcodes.js';
import { mealsApp } from './handlers/meals.js';
import { mealplansApp } from './handlers/mealplans.js';
import { ingredientsApp } from './handlers/ingredients.js';
import { recipesApp } from './handlers/recipes.js';
import { guidedMeditationsApp } from './handlers/guidedMeditations.js';
import { stretchesApp } from './handlers/stretches.js';
import { cyclingApp } from './handlers/cycling.js';
import { stravaWebhookApp } from './handlers/strava-webhook.js';
import { todayCoachApp } from './handlers/today-coach.js';
import { healthSyncApp } from './handlers/health-sync.js';

export interface ApiRouteMount {
  routePath: string;
  handlerFile: string;
  app: express.Application;
}

/**
 * Explicit registry kept structurally comparable with ENDPOINT_MANIFEST.
 *
 * Express applications cannot be imported dynamically during synchronous
 * startup without obscuring failures, so the manifest contract test enforces
 * exact parity between these mounts and the deploy manifest.
 */
export const API_ROUTE_MOUNTS = [
  { routePath: 'health', handlerFile: 'health', app: healthApp },
  { routePath: 'exercises', handlerFile: 'exercises', app: exercisesApp },
  {
    routePath: 'stretch-sessions',
    handlerFile: 'stretchSessions',
    app: stretchSessionsApp,
  },
  {
    routePath: 'meditation-sessions',
    handlerFile: 'meditationSessions',
    app: meditationSessionsApp,
  },
  { routePath: 'plans', handlerFile: 'plans', app: plansApp },
  { routePath: 'workouts', handlerFile: 'workouts', app: workoutsApp },
  {
    routePath: 'workout-sets',
    handlerFile: 'workoutSets',
    app: workoutSetsApp,
  },
  { routePath: 'calendar', handlerFile: 'calendar', app: calendarApp },
  { routePath: 'mesocycles', handlerFile: 'mesocycles', app: mesocyclesApp },
  { routePath: 'barcodes', handlerFile: 'barcodes', app: barcodesApp },
  { routePath: 'meals', handlerFile: 'meals', app: mealsApp },
  { routePath: 'mealplans', handlerFile: 'mealplans', app: mealplansApp },
  { routePath: 'ingredients', handlerFile: 'ingredients', app: ingredientsApp },
  { routePath: 'recipes', handlerFile: 'recipes', app: recipesApp },
  { routePath: 'stretches', handlerFile: 'stretches', app: stretchesApp },
  {
    routePath: 'guidedMeditations',
    handlerFile: 'guidedMeditations',
    app: guidedMeditationsApp,
  },
  { routePath: 'cycling', handlerFile: 'cycling', app: cyclingApp },
  {
    routePath: 'strava',
    handlerFile: 'strava-webhook',
    app: stravaWebhookApp,
  },
  {
    routePath: 'today-coach',
    handlerFile: 'today-coach',
    app: todayCoachApp,
  },
  {
    routePath: 'health-sync',
    handlerFile: 'health-sync',
    app: healthSyncApp,
  },
] as const satisfies readonly ApiRouteMount[];

export function createApiRouter(): express.Router {
  const router = express.Router({ strict: true });
  for (const route of API_ROUTE_MOUNTS) {
    router.use(`/${route.routePath}`, route.app);
  }
  return router;
}

export const apiRouter = createApiRouter();
