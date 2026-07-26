import { describe, expect, it, vi } from 'vitest';
import { verifyRealDevFirestoreAccess } from './dev-firestore-preflight.js';

describe('real development Firestore preflight', () => {
  it('initializes Firebase and performs one bounded development read', async () => {
    const initialize = vi.fn();
    const readOneDevelopmentDocument = vi.fn(async (): Promise<void> => {});

    await verifyRealDevFirestoreAccess(
      { GOOGLE_CLOUD_PROJECT: 'brad-os' },
      { initialize, readOneDevelopmentDocument }
    );

    expect(initialize).toHaveBeenCalledOnce();
    expect(readOneDevelopmentDocument).toHaveBeenCalledOnce();
  });

  it('refuses to run against the Firestore emulator', async () => {
    const initialize = vi.fn();
    const readOneDevelopmentDocument = vi.fn(async (): Promise<void> => {});

    await expect(
      verifyRealDevFirestoreAccess(
        {
          GOOGLE_CLOUD_PROJECT: 'brad-os',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        },
        { initialize, readOneDevelopmentDocument }
      )
    ).rejects.toThrow(
      'FIRESTORE_EMULATOR_HOST must be unset for the real development database preflight'
    );
    expect(initialize).not.toHaveBeenCalled();
    expect(readOneDevelopmentDocument).not.toHaveBeenCalled();
  });

  it('requires an explicit project ID', async () => {
    await expect(
      verifyRealDevFirestoreAccess(
        {},
        {
          initialize: vi.fn(),
          readOneDevelopmentDocument: vi.fn(async (): Promise<void> => {}),
        }
      )
    ).rejects.toThrow('A Google Cloud project ID is required for the preflight');
  });
});
