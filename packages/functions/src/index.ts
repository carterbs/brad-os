import { onRequest, type HttpsFunction, type HttpsOptions } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeFirebase } from './firebase.js';

// Initialize Firebase at cold start
initializeFirebase();

// Import handler apps
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
import { mealplanDebugApp } from './handlers/mealplan-debug.js';
import { ttsApp } from './handlers/tts.js';
import { guidedMeditationsApp } from './handlers/guidedMeditations.js';
import { stretchesApp } from './handlers/stretches.js';
import { cyclingApp } from './handlers/cycling.js';
import { stravaWebhookApp } from './handlers/strava-webhook.js';
import { cyclingCoachApp } from './handlers/cycling-coach.js';
import { todayCoachApp } from './handlers/today-coach.js';
import { healthSyncApp } from './handlers/health-sync.js';

// Secrets
const openaiApiKey = defineSecret('OPENAI_API_KEY');
// Common options
const defaultOptions: HttpsOptions = {
  region: 'us-central1',
  cors: true,
  invoker: 'public', // Allow unauthenticated access (App Check middleware handles auth)
};

// Options for functions that need the OpenAI API key
const withOpenAiOptions: HttpsOptions = {
  ...defaultOptions,
  secrets: [openaiApiKey],
  timeoutSeconds: 180,
};

// Options for TTS functions (uses ADC, no secret needed, shorter timeout)
const withTtsOptions: HttpsOptions = {
  ...defaultOptions,
  timeoutSeconds: 30,
};

/** Register a dev/prod function pair from an Express app. */
function register(
  app: import('express').Application,
  options: HttpsOptions = defaultOptions
): { dev: HttpsFunction; prod: HttpsFunction } {
  return {
    dev: onRequest(options, app),
    prod: onRequest(options, app),
  };
}

// ============ Function Registration ============
const { dev: devHealth, prod: prodHealth } = register(healthApp);
const { dev: devExercises, prod: prodExercises } = register(exercisesApp);
const { dev: devStretchSessions, prod: prodStretchSessions } = register(stretchSessionsApp);
const { dev: devMeditationSessions, prod: prodMeditationSessions } = register(meditationSessionsApp);
const { dev: devPlans, prod: prodPlans } = register(plansApp);
const { dev: devWorkouts, prod: prodWorkouts } = register(workoutsApp);
const { dev: devWorkoutSets, prod: prodWorkoutSets } = register(workoutSetsApp);
const { dev: devCalendar, prod: prodCalendar } = register(calendarApp);
const { dev: devMesocycles, prod: prodMesocycles } = register(mesocyclesApp);
const { dev: devBarcodes, prod: prodBarcodes } = register(barcodesApp);
const { dev: devMeals, prod: prodMeals } = register(mealsApp);
const { dev: devMealplans, prod: prodMealplans } = register(mealplansApp, withOpenAiOptions);
const { dev: devIngredients, prod: prodIngredients } = register(ingredientsApp);
const { dev: devRecipes, prod: prodRecipes } = register(recipesApp);
const { dev: devTts, prod: prodTts } = register(ttsApp, withTtsOptions);
const { dev: devGuidedMeditations, prod: prodGuidedMeditations } = register(guidedMeditationsApp);
const { dev: devStretches, prod: prodStretches } = register(stretchesApp);
const { dev: devCycling, prod: prodCycling } = register(cyclingApp);
const { dev: devStrava, prod: prodStrava } = register(stravaWebhookApp);
const { dev: devCyclingCoach, prod: prodCyclingCoach } = register(cyclingCoachApp, withOpenAiOptions);
const { dev: devTodayCoach, prod: prodTodayCoach } = register(todayCoachApp, withOpenAiOptions);
const { dev: devHealthSync, prod: prodHealthSync } = register(healthSyncApp);

export {
  devHealth, prodHealth,
  devExercises, prodExercises,
  devStretchSessions, prodStretchSessions,
  devMeditationSessions, prodMeditationSessions,
  devPlans, prodPlans,
  devWorkouts, prodWorkouts,
  devWorkoutSets, prodWorkoutSets,
  devCalendar, prodCalendar,
  devMesocycles, prodMesocycles,
  devBarcodes, prodBarcodes,
  devMeals, prodMeals,
  devMealplans, prodMealplans,
  devIngredients, prodIngredients,
  devRecipes, prodRecipes,
  devTts, prodTts,
  devGuidedMeditations, prodGuidedMeditations,
  devStretches, prodStretches,
  devCycling, prodCycling,
  devStrava, prodStrava,
  devCyclingCoach, prodCyclingCoach,
  devTodayCoach, prodTodayCoach,
  devHealthSync, prodHealthSync,
};

// ============ Debug Functions (emulator only) ============
export const devMealplanDebug = onRequest(defaultOptions, mealplanDebugApp);
