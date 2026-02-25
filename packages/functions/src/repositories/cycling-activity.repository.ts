/**
 * Cycling Activity Repository
 *
 * Encapsulates user-scoped cycling activities and stream data persistence.
 *
 * Collections structure:
 * - /users/{userId}/cyclingActivities/{activityId}
 * - /users/{userId}/cyclingActivities/{activityId}/streams/data
 */

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import type { CyclingActivity, ActivityStreamData, CyclingActivityUpdate, DeleteCyclingActivityResult } from '../types/cycling.js';

export class CyclingActivityRepository {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreDb();
  }

  /**
   * Get the user document reference.
   */
  private getUserDoc(userId: string): FirebaseFirestore.DocumentReference {
    const usersCollection = getCollectionName('users');
    return this.db.collection(usersCollection).doc(userId);
  }

  /**
   * Map a Firestore document to a CyclingActivity.
   */
  private mapActivityDoc(
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
      peak5MinPower: data['peak5MinPower'] as number | undefined,
      peak20MinPower: data['peak20MinPower'] as number | undefined,
      hrCompleteness: data['hrCompleteness'] as number | undefined,
      createdAt: data['createdAt'] as string,
    };
  }

  /**
   * Get cycling activities for a user, most recent first.
   *
   * @param userId - The user ID
   * @param limit - Optional limit on number of results
   * @returns Array of cycling activities
   */
  async findAllByUser(userId: string, limit?: number): Promise<CyclingActivity[]> {
    const userDoc = this.getUserDoc(userId);
    let query = userDoc.collection('cyclingActivities').orderBy('date', 'desc');

    if (limit !== undefined && limit > 0) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return this.mapActivityDoc(doc.id, data);
    });
  }

  /**
   * Get a cycling activity by ID.
   *
   * @param userId - The user ID
   * @param activityId - The activity ID
   * @returns The cycling activity or null if not found
   */
  async findById(userId: string, activityId: string): Promise<CyclingActivity | null> {
    const userDoc = this.getUserDoc(userId);
    const doc = await userDoc.collection('cyclingActivities').doc(activityId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return this.mapActivityDoc(doc.id, data);
  }

  /**
   * Get a cycling activity by Strava ID.
   *
   * @param userId - The user ID
   * @param stravaId - The Strava activity ID
   * @returns The cycling activity or null if not found
   */
  async findByStravaId(userId: string, stravaId: number): Promise<CyclingActivity | null> {
    const userDoc = this.getUserDoc(userId);
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
    return this.mapActivityDoc(doc.id, data);
  }

  /**
   * Create a new cycling activity.
   *
   * @param userId - The user ID
   * @param activity - The activity data (without id)
   * @returns The created activity with ID
   */
  async create(userId: string, activity: Omit<CyclingActivity, 'id'>): Promise<CyclingActivity> {
    const userDoc = this.getUserDoc(userId);
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
    if (activity.peak5MinPower !== undefined) {
      activityData['peak5MinPower'] = activity.peak5MinPower;
    }
    if (activity.peak20MinPower !== undefined) {
      activityData['peak20MinPower'] = activity.peak20MinPower;
    }
    if (activity.hrCompleteness !== undefined) {
      activityData['hrCompleteness'] = activity.hrCompleteness;
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
      peak5MinPower: activity.peak5MinPower,
      peak20MinPower: activity.peak20MinPower,
      hrCompleteness: activity.hrCompleteness,
      createdAt: activity.createdAt,
    };
  }

  /**
   * Update specific fields on a cycling activity.
   *
   * @param userId - The user ID
   * @param activityId - The activity ID
   * @param updates - Fields to update
   * @returns True if updated, false if not found
   */
  async update(userId: string, activityId: string, updates: CyclingActivityUpdate): Promise<boolean> {
    const userDoc = this.getUserDoc(userId);
    const docRef = userDoc.collection('cyclingActivities').doc(activityId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return false;
    }

    await docRef.update(updates);
    return true;
  }

  /**
   * Delete a cycling activity and its streams.
   *
   * @param userId - The user ID
   * @param activityId - The activity ID
   * @returns Result containing deleted flag and hadStreams flag
   */
  async delete(userId: string, activityId: string): Promise<DeleteCyclingActivityResult> {
    const userDoc = this.getUserDoc(userId);
    const docRef = userDoc.collection('cyclingActivities').doc(activityId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { deleted: false, hadStreams: false };
    }

    // Delete streams subcollection doc if it exists
    const streamsDocRef = docRef.collection('streams').doc('data');
    const streamsDoc = await streamsDocRef.get();
    let hadStreams = false;

    if (streamsDoc.exists) {
      await streamsDocRef.delete();
      hadStreams = true;
    }

    await docRef.delete();
    return { deleted: true, hadStreams };
  }

  /**
   * Save raw stream data for a cycling activity.
   *
   * @param userId - The user ID
   * @param activityId - The cycling activity document ID
   * @param streams - The stream data to save
   * @returns The saved stream data with createdAt timestamp
   */
  async saveStreams(
    userId: string,
    activityId: string,
    streams: Omit<ActivityStreamData, 'createdAt'>
  ): Promise<ActivityStreamData> {
    const userDoc = this.getUserDoc(userId);
    const streamData: ActivityStreamData = {
      ...streams,
      createdAt: new Date().toISOString(),
    };

    await userDoc
      .collection('cyclingActivities')
      .doc(activityId)
      .collection('streams')
      .doc('data')
      .set(streamData);

    return streamData;
  }

  /**
   * Get raw stream data for a cycling activity.
   *
   * @param userId - The user ID
   * @param activityId - The cycling activity document ID
   * @returns The stream data or null if not found
   */
  async getStreams(userId: string, activityId: string): Promise<ActivityStreamData | null> {
    const userDoc = this.getUserDoc(userId);
    const doc = await userDoc
      .collection('cyclingActivities')
      .doc(activityId)
      .collection('streams')
      .doc('data')
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return {
      activityId: data['activityId'] as string,
      stravaActivityId: data['stravaActivityId'] as number,
      watts: data['watts'] as number[] | undefined,
      heartrate: data['heartrate'] as number[] | undefined,
      time: data['time'] as number[] | undefined,
      cadence: data['cadence'] as number[] | undefined,
      sampleCount: data['sampleCount'] as number,
      createdAt: data['createdAt'] as string,
    };
  }
}
