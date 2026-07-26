import { pathToFileURL } from 'node:url';
import { getFirestoreDb, initializeFirebase } from '../firebase.js';

const PREFLIGHT_COLLECTION = 'dev_meals';

export interface DevFirestorePreflightDependencies {
  initialize: () => void;
  readOneDevelopmentDocument: () => Promise<void>;
}

const defaultDependencies: DevFirestorePreflightDependencies = {
  initialize: (): void => {
    initializeFirebase();
  },
  readOneDevelopmentDocument: async (): Promise<void> => {
    await getFirestoreDb().collection(PREFLIGHT_COLLECTION).limit(1).get();
  },
};

/**
 * Prove the local standalone runtime can authenticate to the real development
 * Firestore namespace before reporting the QA environment as ready.
 */
export async function verifyRealDevFirestoreAccess(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: DevFirestorePreflightDependencies = defaultDependencies
): Promise<void> {
  if (environment['FIRESTORE_EMULATOR_HOST'] !== undefined) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST must be unset for the real development database preflight'
    );
  }
  if (
    environment['GOOGLE_CLOUD_PROJECT'] === undefined &&
    environment['GCLOUD_PROJECT'] === undefined
  ) {
    throw new Error('A Google Cloud project ID is required for the preflight');
  }

  dependencies.initialize();
  await dependencies.readOneDevelopmentDocument();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runDevFirestorePreflight(): Promise<number> {
  try {
    await verifyRealDevFirestoreAccess();
    process.stdout.write('Real development Firestore preflight passed.\n');
    return 0;
  } catch (error: unknown) {
    process.stderr.write(
      `Real development Firestore preflight failed: ${errorMessage(error)}\n` +
        'Run `gcloud auth application-default login`, then retry QA startup.\n'
    );
    return 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  process.exitCode = await runDevFirestorePreflight();
}
