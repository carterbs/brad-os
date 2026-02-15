#!/usr/bin/env tsx
/**
 * Get detailed ride data for analysis
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

async function getRideDetails() {
  console.log('Getting ride details for 2026-02-14...\n');

  // Get the activity
  const activitiesRef = db
    .collection('users')
    .doc('default-user')
    .collection('cyclingActivities');

  const snapshot = await activitiesRef
    .where('date', '>=', '2026-02-14')
    .where('date', '<', '2026-02-15')
    .get();

  if (snapshot.empty) {
    console.log('No ride found for 2026-02-14');
    return;
  }

  const activity = snapshot.docs[0].data();
  const activityId = snapshot.docs[0].id;

  console.log('Activity Details:');
  console.log('================');
  console.log(`Activity ID: ${activityId}`);
  console.log(`Strava ID: ${activity.stravaId}`);
  console.log(`Date: ${activity.date}`);
  console.log(`Duration: ${activity.durationMinutes} minutes`);
  console.log(`Type: ${activity.type}`);
  console.log('');
  console.log('Power Metrics:');
  console.log(`  Avg Power: ${Math.round(activity.avgPower)}W`);
  console.log(`  Normalized Power: ${Math.round(activity.normalizedPower)}W`);
  console.log(`  Max Power: ${Math.round(activity.maxPower)}W`);
  console.log(`  Intensity Factor: ${activity.intensityFactor.toFixed(2)}`);
  console.log(`  TSS: ${Math.round(activity.tss)}`);
  console.log('');
  console.log('Heart Rate:');
  console.log(`  Avg HR: ${Math.round(activity.avgHeartRate)} bpm`);
  console.log(`  Max HR: ${Math.round(activity.maxHeartRate)} bpm`);
  if (activity.hrCompleteness !== undefined) {
    console.log(`  HR Completeness: ${activity.hrCompleteness}%`);
  }
  console.log('');

  if (activity.ef !== undefined) {
    console.log(`Efficiency Factor: ${activity.ef.toFixed(2)}`);
  }
  if (activity.peak5MinPower !== undefined) {
    console.log(`Peak 5min Power: ${activity.peak5MinPower}W`);
  }
  if (activity.peak20MinPower !== undefined) {
    console.log(`Peak 20min Power: ${activity.peak20MinPower}W`);
  }

  // Check for activity streams (detailed power/HR data)
  console.log('\nChecking for activity streams...');
  const streamsRef = db
    .collection('users')
    .doc('default-user')
    .collection('activityStreams')
    .doc(activityId);

  const streamsDoc = await streamsRef.get();

  if (streamsDoc.exists) {
    const streams = streamsDoc.data();
    console.log(`✅ Streams available (${streams?.sampleCount || 0} samples)`);

    if (streams?.watts && Array.isArray(streams.watts)) {
      const watts = streams.watts as number[];
      const sorted = [...watts].sort((a, b) => b - a);
      const p95 = sorted[Math.floor(watts.length * 0.05)];
      const p50 = sorted[Math.floor(watts.length * 0.50)];

      console.log('\nPower Distribution:');
      console.log(`  95th percentile: ${Math.round(p95)}W`);
      console.log(`  Median: ${Math.round(p50)}W`);
      console.log(`  Samples: ${watts.length}`);

      // Count time in zones (assuming FTP = 129)
      const ftp = 129;
      const zone1 = watts.filter(w => w < ftp * 0.55).length;
      const zone2 = watts.filter(w => w >= ftp * 0.55 && w < ftp * 0.75).length;
      const zone3 = watts.filter(w => w >= ftp * 0.75 && w < ftp * 0.90).length;
      const zone4 = watts.filter(w => w >= ftp * 0.90 && w < ftp * 1.05).length;
      const zone5 = watts.filter(w => w >= ftp * 1.05 && w < ftp * 1.20).length;
      const zone6 = watts.filter(w => w >= ftp * 1.20).length;

      console.log('\nTime in Power Zones:');
      console.log(`  Z1 (Active Recovery <71W): ${Math.round(zone1 / watts.length * 100)}%`);
      console.log(`  Z2 (Endurance 71-97W): ${Math.round(zone2 / watts.length * 100)}%`);
      console.log(`  Z3 (Tempo 97-116W): ${Math.round(zone3 / watts.length * 100)}%`);
      console.log(`  Z4 (Lactate Threshold 116-135W): ${Math.round(zone4 / watts.length * 100)}%`);
      console.log(`  Z5 (VO2 Max 135-155W): ${Math.round(zone5 / watts.length * 100)}%`);
      console.log(`  Z6 (Anaerobic >155W): ${Math.round(zone6 / watts.length * 100)}%`);
    }
  } else {
    console.log('❌ No streams available - only summary metrics');
  }
}

getRideDetails()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
