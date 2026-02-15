#!/usr/bin/env tsx
/**
 * Copy Strava tokens and athlete mapping from prod to dev Firestore.
 * This avoids needing to re-authenticate Strava on the simulator.
 *
 * Paths:
 *   Prod tokens: users/default-user/integrations/strava
 *   Dev tokens:  dev_users/default-user/integrations/strava
 *   Prod mapping: athleteToUser/{athleteId}
 *   Dev mapping:  dev_athleteToUser/{athleteId}
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath =
  process.env['GOOGLE_APPLICATION_CREDENTIALS'] ??
  '/Users/bradcarter/Downloads/firebase-service-account.json';

initializeApp({
  credential: cert(serviceAccountPath),
  projectId: 'brad-os',
});
const db = getFirestore();

async function main(): Promise<void> {
  // Read prod tokens
  const prodTokensDoc = await db
    .doc('users/default-user/integrations/strava')
    .get();

  if (!prodTokensDoc.exists) {
    console.error('No prod Strava tokens found at users/default-user/integrations/strava');
    process.exit(1);
  }

  const tokens = prodTokensDoc.data();
  if (!tokens) {
    console.error('Token document exists but has no data');
    process.exit(1);
  }

  console.log('Found prod tokens:', {
    athleteId: tokens['athleteId'],
    expiresAt: tokens['expiresAt'],
    expiresAtISO: new Date((tokens['expiresAt'] as number) * 1000).toISOString(),
    hasAccessToken: Boolean(tokens['accessToken']),
    hasRefreshToken: Boolean(tokens['refreshToken']),
  });

  // Write to dev
  await db.doc('dev_users/default-user/integrations/strava').set(tokens);
  console.log('Wrote tokens to dev_users/default-user/integrations/strava');

  // Copy athlete-to-user mapping
  const athleteId = tokens['athleteId'] as number;
  if (athleteId) {
    await db
      .doc(`dev_athleteToUser/${athleteId}`)
      .set({ userId: 'default-user' });
    console.log(`Wrote dev_athleteToUser/${athleteId}`);
  }

  console.log('\nDone! Dev Firestore now has Strava tokens.');
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
