import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface FirebaseConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let firebaseApp: App | null = null;
let firestoreDb: Firestore | null = null;

/**
 * Get the environment prefix for collections.
 * - 'dev_' for development
 * - 'test_' for test environment
 * - '' (no prefix) for production
 */
export function getCollectionPrefix(): string {
  const env = process.env['NODE_ENV'] ?? 'development';
  const workerId = process.env['TEST_WORKER_ID'];

  switch (env) {
    case 'test':
      // Support per-worker isolation for parallel testing
      return workerId !== undefined ? `test_${workerId}_` : 'test_';
    case 'production':
      return '';
    default:
      return 'dev_';
  }
}

/**
 * Get the prefixed collection name based on environment.
 */
export function getCollectionName(baseName: string): string {
  return `${getCollectionPrefix()}${baseName}`;
}

/**
 * Get Firebase configuration from environment variables.
 */
export function getFirebaseConfig(): FirebaseConfig {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['FIREBASE_PRIVATE_KEY'];

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase configuration. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.'
    );
  }

  return {
    projectId,
    clientEmail,
    // Private key comes with escaped newlines from env vars
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

/**
 * Initialize Firebase with the given configuration.
 * If already initialized, returns the existing instance.
 */
export function initializeFirebase(config?: FirebaseConfig): App {
  if (firebaseApp) {
    return firebaseApp;
  }

  // Check if already initialized (e.g., in tests)
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0] !== undefined) {
    firebaseApp = existingApps[0];
    return firebaseApp;
  }

  const firebaseConfig = config ?? getFirebaseConfig();

  firebaseApp = initializeApp({
    credential: cert({
      projectId: firebaseConfig.projectId,
      clientEmail: firebaseConfig.clientEmail,
      privateKey: firebaseConfig.privateKey,
    }),
  });

  return firebaseApp;
}

/**
 * Get the Firestore database instance.
 * Initializes Firebase if not already done.
 */
export function getFirestoreDb(): Firestore {
  if (firestoreDb) {
    return firestoreDb;
  }

  if (!firebaseApp) {
    initializeFirebase();
  }

  firestoreDb = getFirestore();
  return firestoreDb;
}

/**
 * Initialize Firestore and return the database instance.
 * This is the main entry point for database initialization.
 */
export function initializeFirestore(config?: FirebaseConfig): Firestore {
  initializeFirebase(config);
  return getFirestoreDb();
}

/**
 * Reset Firebase state (for testing).
 */
export function resetFirebase(): void {
  firebaseApp = null;
  firestoreDb = null;
}

/**
 * Set a custom Firestore instance (for testing with emulator).
 */
export function setTestFirestore(db: Firestore): void {
  firestoreDb = db;
}

export { type Firestore };
