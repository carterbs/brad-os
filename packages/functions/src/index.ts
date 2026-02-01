import { onRequest, type HttpsOptions } from 'firebase-functions/v2/https';
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
import { ingredientsApp } from './handlers/ingredients.js';
import { recipesApp } from './handlers/recipes.js';

// Common options
const defaultOptions: HttpsOptions = {
  region: 'us-central1',
  cors: true,
  invoker: 'public', // Allow unauthenticated access (App Check middleware handles auth)
};

// ============ DEV Functions ============
export const devHealth = onRequest(defaultOptions, healthApp);
export const devExercises = onRequest(defaultOptions, exercisesApp);
export const devStretchSessions = onRequest(defaultOptions, stretchSessionsApp);
export const devMeditationSessions = onRequest(defaultOptions, meditationSessionsApp);
export const devPlans = onRequest(defaultOptions, plansApp);
export const devWorkouts = onRequest(defaultOptions, workoutsApp);
export const devWorkoutSets = onRequest(defaultOptions, workoutSetsApp);
export const devCalendar = onRequest(defaultOptions, calendarApp);
export const devMesocycles = onRequest(defaultOptions, mesocyclesApp);
export const devBarcodes = onRequest(defaultOptions, barcodesApp);
export const devIngredients = onRequest(defaultOptions, ingredientsApp);
export const devRecipes = onRequest(defaultOptions, recipesApp);

// ============ PROD Functions ============
export const prodHealth = onRequest(defaultOptions, healthApp);
export const prodExercises = onRequest(defaultOptions, exercisesApp);
export const prodStretchSessions = onRequest(defaultOptions, stretchSessionsApp);
export const prodMeditationSessions = onRequest(defaultOptions, meditationSessionsApp);
export const prodPlans = onRequest(defaultOptions, plansApp);
export const prodWorkouts = onRequest(defaultOptions, workoutsApp);
export const prodWorkoutSets = onRequest(defaultOptions, workoutSetsApp);
export const prodCalendar = onRequest(defaultOptions, calendarApp);
export const prodMesocycles = onRequest(defaultOptions, mesocyclesApp);
export const prodBarcodes = onRequest(defaultOptions, barcodesApp);
export const prodIngredients = onRequest(defaultOptions, ingredientsApp);
export const prodRecipes = onRequest(defaultOptions, recipesApp);
