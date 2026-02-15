#!/usr/bin/env tsx
/**
 * Check cycling activities in Firestore for dev and prod
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  '/Users/bradcarter/Downloads/firebase-service-account.json';

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccountPath),
  projectId: 'brad-os',
});

const db = getFirestore();

async function checkCyclingData() {
  console.log('Checking cycling activities in Firestore...\n');

  // Check both dev and prod collections
  for (const prefix of ['', 'dev_']) {
    const collectionName = `${prefix}users`;
    console.log(`\n=== ${prefix ? 'DEV' : 'PROD'} (${collectionName}) ===`);

    try {
      const usersSnapshot = await db.collection(collectionName).limit(5).get();

      if (usersSnapshot.empty) {
        console.log(`No users found in ${collectionName}`);
        continue;
      }

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        console.log(`\nUser: ${userId}`);

        // Check cycling activities
        const activitiesSnapshot = await userDoc.ref
          .collection('cyclingActivities')
          .orderBy('date', 'desc')
          .limit(5)
          .get();

        if (activitiesSnapshot.empty) {
          console.log('  No cycling activities found');
        } else {
          console.log(`  Found ${activitiesSnapshot.size} cycling activities (showing first 5):`);
          activitiesSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            console.log(`    - ${data.date}: ${data.durationMinutes}min, ${data.normalizedPower}W NP, ${data.tss} TSS`);
          });
        }

        // Check Strava tokens
        const tokensDoc = await userDoc.ref.collection('stravaTokens').doc('current').get();
        if (tokensDoc.exists) {
          const tokens = tokensDoc.data();
          console.log(`  Strava connected: athlete ${tokens?.athleteId}`);
        } else {
          console.log('  Strava not connected');
        }
      }
    } catch (error) {
      console.error(`Error checking ${collectionName}:`, error);
    }
  }
}

checkCyclingData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
