import { onRequest, type HttpsOptions } from 'firebase-functions/v2/https';
import { initializeFirebase } from './firebase.js';

// Initialize Firebase at cold start
initializeFirebase();

// Import handler apps - Phase 3: Simple Functions
import { healthApp } from './handlers/health.js';
import { exercisesApp } from './handlers/exercises.js';
import { stretchSessionsApp } from './handlers/stretchSessions.js';
import { meditationSessionsApp } from './handlers/meditationSessions.js';

// Import handler apps - Phase 4: Complex Functions
import { plansApp } from './handlers/plans.js';
import { workoutsApp } from './handlers/workouts.js';
import { workoutSetsApp } from './handlers/workoutSets.js';
import { calendarApp } from './handlers/calendar.js';

// Common options
const defaultOptions: HttpsOptions = {
  region: 'us-central1',
  cors: true,
};

// Export functions - Phase 3: Simple Functions
export const health = onRequest(defaultOptions, healthApp);
export const exercises = onRequest(defaultOptions, exercisesApp);
export const stretchSessions = onRequest(defaultOptions, stretchSessionsApp);
export const meditationSessions = onRequest(defaultOptions, meditationSessionsApp);

// Export functions - Phase 4: Complex Functions
export const plans = onRequest(defaultOptions, plansApp);
export const workouts = onRequest(defaultOptions, workoutsApp);
export const workoutSets = onRequest(defaultOptions, workoutSetsApp);
export const calendar = onRequest(defaultOptions, calendarApp);
