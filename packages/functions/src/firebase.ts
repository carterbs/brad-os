import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  getRequestEnvironment,
  type ApiEnvironment,
} from './runtime/environment-context.js';

let app: App | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase at cold start.
 * Cloud Run and local development both use Application Default Credentials.
 */
export function initializeFirebase(): App {
  if (app) return app;

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    app = existingApps[0];
    return app;
  }

  // Firebase Admin resolves the active Application Default Credentials.
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
 * Read the environment selected by the mounted request router.
 */
export function getEnvironment(): ApiEnvironment {
  return getRequestEnvironment();
}

/**
 * Get the prefixed collection name based on environment.
 * Dev requests use a 'dev_' prefix (e.g., dev_exercises).
 * Production requests use no prefix (e.g., exercises).
 */
export function getCollectionName(baseName: string): string {
  const env = getEnvironment();
  return env === 'dev' ? `dev_${baseName}` : baseName;
}

export { type Firestore };
