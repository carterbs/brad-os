import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase at cold start.
 * In Cloud Functions, credentials are automatic - no config needed.
 */
export function initializeFirebase(): App {
  if (app) return app;

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    app = existingApps[0];
    return app;
  }

  // In Cloud Functions, default credentials are automatic
  app = initializeApp();
  return app;
}

/**
 * Get the Firestore database instance.
 */
export function getFirestoreDb(): Firestore {
  if (db) return db;
  if (!app) initializeFirebase();
  db = getFirestore();
  return db;
}

/**
 * Detect environment based on Cloud Function name.
 * Functions prefixed with 'dev' use dev collections.
 * Functions prefixed with 'prod' use production collections.
 */
export function getEnvironment(): 'dev' | 'prod' {
  // K_SERVICE is the function name in Cloud Functions v2
  // FUNCTION_NAME is for v1 (fallback)
  const functionName = process.env.K_SERVICE || process.env.FUNCTION_NAME || '';
  return functionName.startsWith('dev') ? 'dev' : 'prod';
}

/**
 * Get the prefixed collection name based on environment.
 * Dev functions use 'dev_' prefix (e.g., dev_exercises).
 * Prod functions use no prefix (e.g., exercises).
 */
export function getCollectionName(baseName: string): string {
  const env = getEnvironment();
  return env === 'dev' ? `dev_${baseName}` : baseName;
}

export { type Firestore };
