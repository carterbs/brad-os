/**
 * Firestore Cycling Service
 *
 * CRUD operations for cycling-related data stored in Firestore.
 *
 * Collections structure:
 * - /users/{userId}/cyclingActivities/{activityId}
 * - /users/{userId}/trainingBlocks/{blockId}
 * - /users/{userId}/ftpHistory/{entryId}
 * - /users/{userId}/stravaTokens (single doc)
 * - /users/{userId}/weightGoal (single doc)
 */

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import type {
  CyclingActivity,
  TrainingBlock,
  FTPEntry,
  WeightGoal,
  StravaTokens,
  VO2MaxEstimate,
  CyclingProfile,
  CreateFTPEntryInput,
  CreateTrainingBlockInput,
  CreateWeightGoalInput,
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

// ============ Cycling Activities ============

/**
 * Get cycling activities for a user, most recent first.
 *
 * @param userId - The user ID
 * @param limit - Optional limit on number of results
 * @returns Array of cycling activities
 */
export async function getCyclingActivities(
  userId: string,
  limit?: number
): Promise<CyclingActivity[]> {
  const userDoc = getUserDoc(userId);
  let query = userDoc
    .collection('cyclingActivities')
    .orderBy('date', 'desc');

  if (limit !== undefined && limit > 0) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return mapActivityDoc(doc.id, data);
  });
}

/**
 * Map a Firestore document to a CyclingActivity.
 */
function mapActivityDoc(
  id: string,
  data: FirebaseFirestore.DocumentData
): CyclingActivity {
  return {
    id,
    stravaId: data['stravaId'] as number,
    userId: data['userId'] as string,
    date: data['date'] as string,
    durationMinutes: data['durationMinutes'] as number,
    avgPower: data['avgPower'] as number,
    normalizedPower: data['normalizedPower'] as number,
    maxPower: data['maxPower'] as number,
    avgHeartRate: data['avgHeartRate'] as number,
    maxHeartRate: data['maxHeartRate'] as number,
    tss: data['tss'] as number,
    intensityFactor: data['intensityFactor'] as number,
    type: data['type'] as CyclingActivity['type'],
    source: data['source'] as CyclingActivity['source'],
    ef: data['ef'] as number | undefined,
    createdAt: data['createdAt'] as string,
  };
}

/**
 * Get a cycling activity by ID.
 *
 * @param userId - The user ID
 * @param activityId - The activity ID
 * @returns The cycling activity or null if not found
 */
export async function getCyclingActivityById(
  userId: string,
  activityId: string
): Promise<CyclingActivity | null> {
  const userDoc = getUserDoc(userId);
  const doc = await userDoc.collection('cyclingActivities').doc(activityId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  return mapActivityDoc(doc.id, data);
}

/**
 * Get a cycling activity by Strava ID.
 *
 * @param userId - The user ID
 * @param stravaId - The Strava activity ID
 * @returns The cycling activity or null if not found
 */
export async function getCyclingActivityByStravaId(
  userId: string,
  stravaId: number
): Promise<CyclingActivity | null> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('cyclingActivities')
    .where('stravaId', '==', stravaId)
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
  return mapActivityDoc(doc.id, data);
}

/**
 * Create a new cycling activity.
 *
 * @param userId - The user ID
 * @param activity - The activity data (without id)
 * @returns The created activity with ID
 */
export async function createCyclingActivity(
  userId: string,
  activity: Omit<CyclingActivity, 'id'>
): Promise<CyclingActivity> {
  const userDoc = getUserDoc(userId);
  const id = randomUUID();

  const activityData: Record<string, unknown> = {
    stravaId: activity.stravaId,
    userId: activity.userId,
    date: activity.date,
    durationMinutes: activity.durationMinutes,
    avgPower: activity.avgPower,
    normalizedPower: activity.normalizedPower,
    maxPower: activity.maxPower,
    avgHeartRate: activity.avgHeartRate,
    maxHeartRate: activity.maxHeartRate,
    tss: activity.tss,
    intensityFactor: activity.intensityFactor,
    type: activity.type,
    source: activity.source,
    createdAt: activity.createdAt,
  };

  if (activity.ef !== undefined) {
    activityData['ef'] = activity.ef;
  }

  await userDoc.collection('cyclingActivities').doc(id).set(activityData);

  return {
    id,
    stravaId: activity.stravaId,
    userId: activity.userId,
    date: activity.date,
    durationMinutes: activity.durationMinutes,
    avgPower: activity.avgPower,
    normalizedPower: activity.normalizedPower,
    maxPower: activity.maxPower,
    avgHeartRate: activity.avgHeartRate,
    maxHeartRate: activity.maxHeartRate,
    tss: activity.tss,
    intensityFactor: activity.intensityFactor,
    type: activity.type,
    source: activity.source,
    ef: activity.ef,
    createdAt: activity.createdAt,
  };
}

/**
 * Delete a cycling activity.
 *
 * @param userId - The user ID
 * @param activityId - The activity ID
 * @returns True if deleted, false if not found
 */
export async function deleteCyclingActivity(
  userId: string,
  activityId: string
): Promise<boolean> {
  const userDoc = getUserDoc(userId);
  const docRef = userDoc.collection('cyclingActivities').doc(activityId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  await docRef.delete();
  return true;
}

// ============ FTP History ============

/**
 * Get the current (most recent) FTP entry for a user.
 *
 * @param userId - The user ID
 * @returns The most recent FTP entry or null if none exist
 */
export async function getCurrentFTP(userId: string): Promise<FTPEntry | null> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('ftpHistory')
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
    userId: data['userId'] as string,
    value: data['value'] as number,
    date: data['date'] as string,
    source: data['source'] as FTPEntry['source'],
  };
}

/**
 * Get the FTP history for a user, most recent first.
 *
 * @param userId - The user ID
 * @returns Array of FTP entries
 */
export async function getFTPHistory(userId: string): Promise<FTPEntry[]> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('ftpHistory')
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data['userId'] as string,
      value: data['value'] as number,
      date: data['date'] as string,
      source: data['source'] as FTPEntry['source'],
    };
  });
}

/**
 * Create a new FTP entry.
 *
 * @param userId - The user ID
 * @param entry - The FTP entry data
 * @returns The created FTP entry with ID
 */
export async function createFTPEntry(
  userId: string,
  entry: CreateFTPEntryInput
): Promise<FTPEntry> {
  const userDoc = getUserDoc(userId);
  const id = randomUUID();

  const ftpData = {
    userId,
    value: entry.value,
    date: entry.date,
    source: entry.source,
  };

  await userDoc.collection('ftpHistory').doc(id).set(ftpData);

  return {
    id,
    ...ftpData,
  };
}

// ============ Training Blocks ============

/**
 * Get the current (active) training block for a user.
 *
 * @param userId - The user ID
 * @returns The active training block or null if none
 */
export async function getCurrentTrainingBlock(
  userId: string
): Promise<TrainingBlock | null> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('trainingBlocks')
    .where('status', '==', 'active')
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
    userId: data['userId'] as string,
    startDate: data['startDate'] as string,
    endDate: data['endDate'] as string,
    currentWeek: data['currentWeek'] as number,
    goals: data['goals'] as TrainingBlock['goals'],
    status: data['status'] as TrainingBlock['status'],
  };
}

/**
 * Get all training blocks for a user, most recent first.
 *
 * @param userId - The user ID
 * @returns Array of training blocks
 */
export async function getTrainingBlocks(
  userId: string
): Promise<TrainingBlock[]> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('trainingBlocks')
    .orderBy('startDate', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data['userId'] as string,
      startDate: data['startDate'] as string,
      endDate: data['endDate'] as string,
      currentWeek: data['currentWeek'] as number,
      goals: data['goals'] as TrainingBlock['goals'],
      status: data['status'] as TrainingBlock['status'],
    };
  });
}

/**
 * Create a new training block.
 *
 * Note: Creating a new block does NOT automatically complete existing active blocks.
 * Call completeTrainingBlock first if needed.
 *
 * @param userId - The user ID
 * @param block - The training block data
 * @returns The created training block with ID
 */
export async function createTrainingBlock(
  userId: string,
  block: CreateTrainingBlockInput
): Promise<TrainingBlock> {
  const userDoc = getUserDoc(userId);
  const id = randomUUID();

  const blockData = {
    userId,
    startDate: block.startDate,
    endDate: block.endDate,
    currentWeek: 1, // Always starts at week 1
    goals: block.goals,
    status: 'active' as const,
  };

  await userDoc.collection('trainingBlocks').doc(id).set(blockData);

  return {
    id,
    ...blockData,
  };
}

/**
 * Complete a training block.
 *
 * @param userId - The user ID
 * @param blockId - The training block ID
 * @returns True if updated, false if not found
 */
export async function completeTrainingBlock(
  userId: string,
  blockId: string
): Promise<boolean> {
  const userDoc = getUserDoc(userId);
  const docRef = userDoc.collection('trainingBlocks').doc(blockId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  await docRef.update({ status: 'completed' });
  return true;
}

/**
 * Update the current week of a training block.
 *
 * @param userId - The user ID
 * @param blockId - The training block ID
 * @param currentWeek - The new current week (1-8)
 * @returns True if updated, false if not found
 */
export async function updateTrainingBlockWeek(
  userId: string,
  blockId: string,
  currentWeek: number
): Promise<boolean> {
  const userDoc = getUserDoc(userId);
  const docRef = userDoc.collection('trainingBlocks').doc(blockId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  await docRef.update({ currentWeek });
  return true;
}

// ============ Weight Goal ============

/**
 * Get the weight goal for a user.
 *
 * @param userId - The user ID
 * @returns The weight goal or null if not set
 */
export async function getWeightGoal(
  userId: string
): Promise<WeightGoal | null> {
  const userDoc = getUserDoc(userId);
  const doc = await userDoc.collection('settings').doc('weightGoal').get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  return {
    userId: data['userId'] as string,
    targetWeightLbs: data['targetWeightLbs'] as number,
    targetDate: data['targetDate'] as string,
    startWeightLbs: data['startWeightLbs'] as number,
    startDate: data['startDate'] as string,
  };
}

/**
 * Set the weight goal for a user.
 *
 * @param userId - The user ID
 * @param goal - The weight goal data
 */
export async function setWeightGoal(
  userId: string,
  goal: CreateWeightGoalInput
): Promise<WeightGoal> {
  const userDoc = getUserDoc(userId);

  const goalData: WeightGoal = {
    userId,
    targetWeightLbs: goal.targetWeightLbs,
    targetDate: goal.targetDate,
    startWeightLbs: goal.startWeightLbs,
    startDate: goal.startDate,
  };

  await userDoc.collection('settings').doc('weightGoal').set(goalData);

  return goalData;
}

// ============ Strava Tokens ============

/**
 * Get Strava tokens for a user.
 *
 * @param userId - The user ID
 * @returns The Strava tokens or null if not linked
 */
export async function getStravaTokens(
  userId: string
): Promise<StravaTokens | null> {
  const userDoc = getUserDoc(userId);
  const doc = await userDoc.collection('integrations').doc('strava').get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  return {
    accessToken: data['accessToken'] as string,
    refreshToken: data['refreshToken'] as string,
    expiresAt: data['expiresAt'] as number,
    athleteId: data['athleteId'] as number,
  };
}

/**
 * Set Strava tokens for a user.
 *
 * @param userId - The user ID
 * @param tokens - The Strava tokens
 */
export async function setStravaTokens(
  userId: string,
  tokens: StravaTokens
): Promise<void> {
  const userDoc = getUserDoc(userId);

  await userDoc.collection('integrations').doc('strava').set({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    athleteId: tokens.athleteId,
  });
}

/**
 * Delete Strava tokens for a user (unlink Strava).
 *
 * @param userId - The user ID
 * @returns True if deleted, false if not found
 */
export async function deleteStravaTokens(userId: string): Promise<boolean> {
  const userDoc = getUserDoc(userId);
  const docRef = userDoc.collection('integrations').doc('strava');
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  await docRef.delete();
  return true;
}

// ============ VO2 Max Estimates ============

/**
 * Save a VO2 max estimate.
 *
 * @param userId - The user ID
 * @param estimate - The VO2 max estimate data (without id)
 * @returns The created estimate with ID
 */
export async function saveVO2MaxEstimate(
  userId: string,
  estimate: Omit<VO2MaxEstimate, 'id'>
): Promise<VO2MaxEstimate> {
  const userDoc = getUserDoc(userId);
  const id = randomUUID();

  const estimateData: Record<string, unknown> = {
    userId: estimate.userId,
    date: estimate.date,
    value: estimate.value,
    method: estimate.method,
    sourcePower: estimate.sourcePower,
    sourceWeight: estimate.sourceWeight,
    createdAt: estimate.createdAt,
  };

  if (estimate.activityId !== undefined) {
    estimateData['activityId'] = estimate.activityId;
  }

  await userDoc.collection('vo2maxEstimates').doc(id).set(estimateData);

  return {
    id,
    ...estimate,
  };
}

/**
 * Get the latest VO2 max estimate for a user.
 *
 * @param userId - The user ID
 * @returns The most recent VO2 max estimate or null
 */
export async function getLatestVO2Max(
  userId: string
): Promise<VO2MaxEstimate | null> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('vo2maxEstimates')
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
    userId: data['userId'] as string,
    date: data['date'] as string,
    value: data['value'] as number,
    method: data['method'] as VO2MaxEstimate['method'],
    sourcePower: data['sourcePower'] as number,
    sourceWeight: data['sourceWeight'] as number,
    activityId: data['activityId'] as string | undefined,
    createdAt: data['createdAt'] as string,
  };
}

/**
 * Get VO2 max history for a user, most recent first.
 *
 * @param userId - The user ID
 * @param limit - Max number of results (default 10)
 * @returns Array of VO2 max estimates
 */
export async function getVO2MaxHistory(
  userId: string,
  limit: number = 10
): Promise<VO2MaxEstimate[]> {
  const userDoc = getUserDoc(userId);
  const snapshot = await userDoc
    .collection('vo2maxEstimates')
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data['userId'] as string,
      date: data['date'] as string,
      value: data['value'] as number,
      method: data['method'] as VO2MaxEstimate['method'],
      sourcePower: data['sourcePower'] as number,
      sourceWeight: data['sourceWeight'] as number,
      activityId: data['activityId'] as string | undefined,
      createdAt: data['createdAt'] as string,
    };
  });
}

// ============ Cycling Profile ============

/**
 * Get the cycling profile for a user.
 *
 * @param userId - The user ID
 * @returns The cycling profile or null
 */
export async function getCyclingProfile(
  userId: string
): Promise<CyclingProfile | null> {
  const userDoc = getUserDoc(userId);
  const doc = await userDoc.collection('settings').doc('cyclingProfile').get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  return {
    userId: data['userId'] as string,
    weightKg: data['weightKg'] as number,
    maxHR: data['maxHR'] as number | undefined,
    restingHR: data['restingHR'] as number | undefined,
  };
}

/**
 * Set or update the cycling profile for a user.
 *
 * @param userId - The user ID
 * @param profile - The profile data
 * @returns The saved profile
 */
export async function setCyclingProfile(
  userId: string,
  profile: Omit<CyclingProfile, 'userId'>
): Promise<CyclingProfile> {
  const userDoc = getUserDoc(userId);

  const profileData: Record<string, unknown> = {
    userId,
    weightKg: profile.weightKg,
  };

  if (profile.maxHR !== undefined) {
    profileData['maxHR'] = profile.maxHR;
  }
  if (profile.restingHR !== undefined) {
    profileData['restingHR'] = profile.restingHR;
  }

  await userDoc.collection('settings').doc('cyclingProfile').set(profileData, { merge: true });

  return {
    userId,
    ...profile,
  };
}

// ============ Activity Update ============

/**
 * Update specific fields on a cycling activity.
 *
 * @param userId - The user ID
 * @param activityId - The activity ID
 * @param updates - Fields to update
 * @returns True if updated, false if not found
 */
export async function updateCyclingActivity(
  userId: string,
  activityId: string,
  updates: Partial<Pick<CyclingActivity, 'ef'>>
): Promise<boolean> {
  const userDoc = getUserDoc(userId);
  const docRef = userDoc.collection('cyclingActivities').doc(activityId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  await docRef.update(updates);
  return true;
}
