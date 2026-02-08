/**
 * Firestore Recovery Service
 *
 * CRUD operations for recovery data synced from HealthKit.
 *
 * Collections structure:
 * - /users/{userId}/recoverySnapshots/{YYYY-MM-DD}  (date as doc ID for upsert)
 * - /users/{userId}/recoveryBaseline               (single doc)
 * - /users/{userId}/weightHistory/{entryId}
 */

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import type {
  RecoverySnapshot,
  StoredRecoverySnapshot,
  RecoveryBaseline,
  WeightEntry,
  RecoverySource,
} from '../shared.js';

/**
 * Get the Firestore database instance.
 */
function getDb(): Firestore {
  return getFirestoreDb();
}

/**
 * Get the user document reference.
 */
function getUserDoc(userId: string): FirebaseFirestore.DocumentReference {
  const db = getDb();
  const usersCollection = getCollectionName('users');
  return db.collection(usersCollection).doc(userId);
}

// ============ Recovery Snapshots ============

/**
 * Get a recovery snapshot for a specific date.
 *
 * @param userId - The user ID
 * @param date - The date in YYYY-MM-DD format
 * @returns The recovery snapshot or null if not found
 */
export async function getRecoverySnapshot(
  userId: string,
  date: string
): Promise<StoredRecoverySnapshot | null> {
  const userDoc = getUserDoc(userId);
  const doc = await userDoc.collection('recoverySnapshots').doc(date).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  return {
    date: data['date'] as string,
    hrvMs: data['hrvMs'] as number,
    hrvVsBaseline: data['hrvVsBaseline'] as number,
    rhrBpm: data['rhrBpm'] as number,
    rhrVsBaseline: data['rhrVsBaseline'] as number,
    sleepHours: data['sleepHours'] as number,
    sleepEfficiency: data['sleepEfficiency'] as number,
    deepSleepPercent: data['deepSleepPercent'] as number,
    score: data['score'] as number,
    state: data['state'] as StoredRecoverySnapshot['state'],
    source: data['source'] as StoredRecoverySnapshot['source'],
    syncedAt: data['syncedAt'] as string,
  };
}

/**
 * Get the latest recovery snapshot for a user.
 *
 * @param userId - The user ID
 * @returns The most recent recovery snapshot or null if none exist
 */
export async function getLatestRecoverySnapshot(
  userId: string
): Promise<StoredRecoverySnapshot | null> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('recoverySnapshots')
    .orderBy('date', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  if (!doc) {
    return null;
  }

  const data = doc.data();
  return {
    date: data['date'] as string,
    hrvMs: data['hrvMs'] as number,
    hrvVsBaseline: data['hrvVsBaseline'] as number,
    rhrBpm: data['rhrBpm'] as number,
    rhrVsBaseline: data['rhrVsBaseline'] as number,
    sleepHours: data['sleepHours'] as number,
    sleepEfficiency: data['sleepEfficiency'] as number,
    deepSleepPercent: data['deepSleepPercent'] as number,
    score: data['score'] as number,
    state: data['state'] as StoredRecoverySnapshot['state'],
    source: data['source'] as StoredRecoverySnapshot['source'],
    syncedAt: data['syncedAt'] as string,
  };
}

/**
 * Get recovery history for a user.
 *
 * @param userId - The user ID
 * @param days - Number of days of history to fetch
 * @returns Array of recovery snapshots, most recent first
 */
export async function getRecoveryHistory(
  userId: string,
  days: number
): Promise<StoredRecoverySnapshot[]> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('recoverySnapshots')
    .orderBy('date', 'desc')
    .limit(days)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      date: data['date'] as string,
      hrvMs: data['hrvMs'] as number,
      hrvVsBaseline: data['hrvVsBaseline'] as number,
      rhrBpm: data['rhrBpm'] as number,
      rhrVsBaseline: data['rhrVsBaseline'] as number,
      sleepHours: data['sleepHours'] as number,
      sleepEfficiency: data['sleepEfficiency'] as number,
      deepSleepPercent: data['deepSleepPercent'] as number,
      score: data['score'] as number,
      state: data['state'] as StoredRecoverySnapshot['state'],
      source: data['source'] as StoredRecoverySnapshot['source'],
      syncedAt: data['syncedAt'] as string,
    };
  });
}

/**
 * Upsert a recovery snapshot.
 * Uses the date as the document ID for natural deduplication.
 *
 * @param userId - The user ID
 * @param snapshot - The recovery snapshot data
 * @returns The upserted recovery snapshot
 */
export async function upsertRecoverySnapshot(
  userId: string,
  snapshot: RecoverySnapshot & { source: RecoverySource }
): Promise<StoredRecoverySnapshot> {
  const userDoc = getUserDoc(userId);
  const syncedAt = new Date().toISOString();

  const snapshotData = {
    date: snapshot.date,
    hrvMs: snapshot.hrvMs,
    hrvVsBaseline: snapshot.hrvVsBaseline,
    rhrBpm: snapshot.rhrBpm,
    rhrVsBaseline: snapshot.rhrVsBaseline,
    sleepHours: snapshot.sleepHours,
    sleepEfficiency: snapshot.sleepEfficiency,
    deepSleepPercent: snapshot.deepSleepPercent,
    score: snapshot.score,
    state: snapshot.state,
    source: snapshot.source,
    syncedAt,
  };

  // Use date as document ID for natural upsert
  await userDoc.collection('recoverySnapshots').doc(snapshot.date).set(snapshotData);

  return snapshotData;
}

// ============ Recovery Baseline ============

/**
 * Get the recovery baseline for a user.
 *
 * @param userId - The user ID
 * @returns The recovery baseline or null if not set
 */
export async function getRecoveryBaseline(
  userId: string
): Promise<RecoveryBaseline | null> {
  const userDoc = getUserDoc(userId);
  const doc = await userDoc.collection('settings').doc('recoveryBaseline').get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  return {
    hrvMedian: data['hrvMedian'] as number,
    hrvStdDev: data['hrvStdDev'] as number,
    rhrMedian: data['rhrMedian'] as number,
    calculatedAt: data['calculatedAt'] as string,
    sampleCount: data['sampleCount'] as number,
  };
}

/**
 * Upsert the recovery baseline for a user.
 *
 * @param userId - The user ID
 * @param baseline - The recovery baseline data
 * @returns The upserted recovery baseline
 */
export async function upsertRecoveryBaseline(
  userId: string,
  baseline: Omit<RecoveryBaseline, 'calculatedAt'> & { calculatedAt?: string }
): Promise<RecoveryBaseline> {
  const userDoc = getUserDoc(userId);
  const calculatedAt = baseline.calculatedAt ?? new Date().toISOString();

  const baselineData: RecoveryBaseline = {
    hrvMedian: baseline.hrvMedian,
    hrvStdDev: baseline.hrvStdDev,
    rhrMedian: baseline.rhrMedian,
    calculatedAt,
    sampleCount: baseline.sampleCount,
  };

  await userDoc.collection('settings').doc('recoveryBaseline').set(baselineData);

  return baselineData;
}

// ============ Weight History ============

/**
 * Add a weight entry for a user.
 *
 * @param userId - The user ID
 * @param weight - The weight data
 * @returns The created weight entry
 */
export async function addWeightEntry(
  userId: string,
  weight: { weightLbs: number; date: string; source?: WeightEntry['source'] }
): Promise<WeightEntry> {
  const userDoc = getUserDoc(userId);
  const id = randomUUID();
  const syncedAt = new Date().toISOString();

  const weightData: Omit<WeightEntry, 'id'> = {
    date: weight.date,
    weightLbs: weight.weightLbs,
    source: weight.source ?? 'healthkit',
    syncedAt,
  };

  await userDoc.collection('weightHistory').doc(id).set(weightData);

  return {
    id,
    ...weightData,
  };
}

/**
 * Get weight history for a user.
 *
 * @param userId - The user ID
 * @param days - Number of days of history to fetch
 * @returns Array of weight entries, most recent first
 */
export async function getWeightHistory(
  userId: string,
  days: number
): Promise<WeightEntry[]> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('weightHistory')
    .orderBy('date', 'desc')
    .limit(days)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      date: data['date'] as string,
      weightLbs: data['weightLbs'] as number,
      source: data['source'] as WeightEntry['source'],
      syncedAt: data['syncedAt'] as string,
    };
  });
}

/**
 * Get the latest weight entry for a user.
 *
 * @param userId - The user ID
 * @returns The most recent weight entry or null if none exist
 */
export async function getLatestWeight(
  userId: string
): Promise<WeightEntry | null> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('weightHistory')
    .orderBy('date', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  if (!doc) {
    return null;
  }

  const data = doc.data();
  return {
    id: doc.id,
    date: data['date'] as string,
    weightLbs: data['weightLbs'] as number,
    source: data['source'] as WeightEntry['source'],
    syncedAt: data['syncedAt'] as string,
  };
}
