#!/usr/bin/env tsx
/**
 * List all top-level collections in Firestore
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

async function listCollections() {
  console.log('Top-level Firestore collections:\n');

  const collections = await db.listCollections();

  for (const collection of collections) {
    console.log(`\n=== ${collection.id} ===`);

    // Get first few docs to understand structure
    const snapshot = await collection.limit(3).get();
    console.log(`  Documents: ${snapshot.size}`);

    if (!snapshot.empty) {
      const firstDoc = snapshot.docs[0];
      console.log(`  Sample doc ID: ${firstDoc.id}`);

      // Check for subcollections
      const subcollections = await firstDoc.ref.listCollections();
      if (subcollections.length > 0) {
        console.log(`  Subcollections: ${subcollections.map((c) => c.id).join(', ')}`);
      }
    }
  }
}

listCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
