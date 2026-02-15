#!/usr/bin/env tsx
/**
 * Check all subcollections for default-user
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

async function checkUserSubcollections() {
  console.log('Checking subcollections for default-user in dev_users...\n');

  const userRef = db.collection('dev_users').doc('default-user');
  const subcollections = await userRef.listCollections();

  console.log('Found subcollections:', subcollections.map((c) => c.id).join(', '));
  console.log('');

  for (const subcollection of subcollections) {
    console.log(`\n=== ${subcollection.id} ===`);
    const snapshot = await subcollection.limit(5).get();
    console.log(`  Documents: ${snapshot.size}`);

    if (!snapshot.empty) {
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`  [${index}] ${doc.id}:`, JSON.stringify(data, null, 2).substring(0, 200));
      });
    }
  }

  // Also explicitly check cyclingActivities even if not listed
  console.log('\n=== Explicit check for cyclingActivities ===');
  const cyclingSnapshot = await userRef.collection('cyclingActivities').limit(5).get();
  console.log(`  Documents: ${cyclingSnapshot.size}`);

  if (!cyclingSnapshot.empty) {
    cyclingSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      console.log(`  - ${data.date}: ${data.normalizedPower}W NP, ${data.tss} TSS`);
    });
  }
}

checkUserSubcollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
