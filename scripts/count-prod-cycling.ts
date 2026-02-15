#!/usr/bin/env tsx
/**
 * Count cycling activities in PROD Firestore
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

async function countActivities() {
  console.log('Counting cycling activities in PROD (users/default-user)...\n');

  const activitiesRef = db
    .collection('users')
    .doc('default-user')
    .collection('cyclingActivities');

  const snapshot = await activitiesRef.get();

  console.log(`Total cycling activities: ${snapshot.size}`);

  if (snapshot.size > 0) {
    console.log('\nMost recent 10 activities:');
    const sorted = snapshot.docs.sort((a, b) => {
      const dateA = a.data().date as string;
      const dateB = b.data().date as string;
      return dateB.localeCompare(dateA);
    });

    sorted.slice(0, 10).forEach((doc) => {
      const data = doc.data();
      console.log(
        `  ${data.date}: ${data.durationMinutes}min, ${Math.round(data.normalizedPower)}W NP, ${Math.round(data.tss)} TSS (${data.type})`
      );
    });
  }
}

countActivities()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
