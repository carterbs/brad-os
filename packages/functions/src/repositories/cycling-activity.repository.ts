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
import {
  isRecord,
  readEnum,
  readNumber,
  readNumberArray,
  readString,
} from './firestore-type-guards.js';

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
    data: Record<string, unknown>
  ): CyclingActivity | null {
    const stravaId = readNumber(data, 'stravaId');
    const userId = readString(data, 'userId');
    const date = readString(data, 'date');
    const durationMinutes = readNumber(data, 'durationMinutes');
    const avgPower = readNumber(data, 'avgPower');
    const normalizedPower = readNumber(data, 'normalizedPower');
    const maxPower = readNumber(data, 'maxPower');
    const avgHeartRate = readNumber(data, 'avgHeartRate');
    const maxHeartRate = readNumber(data, 'maxHeartRate');
    const tss = readNumber(data, 'tss');
    const intensityFactor = readNumber(data, 'intensityFactor');
    const type = readEnum(
      data,
      'type',
      ['vo2max', 'threshold', 'fun', 'recovery', 'unknown'] as const
    );
    const source = readEnum(data, 'source', ['strava'] as const);
    const createdAt = readString(data, 'createdAt');

    const rawEf = data['ef'];
    const rawPeak5MinPower = data['peak5MinPower'];
    const rawPeak20MinPower = data['peak20MinPower'];
    const rawHrCompleteness = data['hrCompleteness'];

    const parsedEf = rawEf === undefined || rawEf === null ? undefined : readNumber(data, 'ef');
    const peak5MinPower =
      rawPeak5MinPower === undefined || rawPeak5MinPower === null
        ? undefined
        : readNumber(data, 'peak5MinPower');
    const peak20MinPower =
      rawPeak20MinPower === undefined || rawPeak20MinPower === null
        ? undefined
        : readNumber(data, 'peak20MinPower');
    const hrCompleteness =
      rawHrCompleteness === undefined || rawHrCompleteness === null
        ? undefined
        : readNumber(data, 'hrCompleteness');

    const ef = parsedEf ?? undefined;
    const sanitizedPeak5MinPower = peak5MinPower ?? undefined;
    const sanitizedPeak20MinPower = peak20MinPower ?? undefined;
    const sanitizedHrCompleteness = hrCompleteness ?? undefined;

    if (
      stravaId === null ||
      userId === null ||
      date === null ||
      durationMinutes === null ||
      avgPower === null ||
      normalizedPower === null ||
      maxPower === null ||
      avgHeartRate === null ||
      maxHeartRate === null ||
      tss === null ||
      intensityFactor === null ||
      type === null ||
      source === null ||
      createdAt === null ||
      (rawEf !== undefined && rawEf !== null && ef === undefined) ||
      (rawPeak5MinPower !== undefined && rawPeak5MinPower !== null && sanitizedPeak5MinPower === undefined) ||
      (rawPeak20MinPower !== undefined && rawPeak20MinPower !== null && sanitizedPeak20MinPower === undefined) ||
      (rawHrCompleteness !== undefined && rawHrCompleteness !== null && sanitizedHrCompleteness === undefined)
    ) {
      return null;
    }

    return {
      id,
      stravaId,
      userId,
      date,
      durationMinutes,
      avgPower,
      normalizedPower,
      maxPower,
      avgHeartRate,
      maxHeartRate,
      tss,
      intensityFactor,
      type,
      source,
      ef,
      peak5MinPower: sanitizedPeak5MinPower,
      peak20MinPower: sanitizedPeak20MinPower,
      hrCompleteness: sanitizedHrCompleteness,
      createdAt,
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

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.mapActivityDoc(doc.id, data);
      })
      .filter((activity): activity is CyclingActivity => activity !== null);
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
    if (!data || !isRecord(data)) {
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
    if (!isRecord(data)) {
      return null;
    }

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
    if (!data || !isRecord(data)) {
      return null;
    }

    const activityIdField = readString(data, 'activityId');
    const stravaActivityId = readNumber(data, 'stravaActivityId');
    const sampleCount = readNumber(data, 'sampleCount');
    const wattsRaw = data['watts'];
    const heartrateRaw = data['heartrate'];
    const timeRaw = data['time'];
    const cadenceRaw = data['cadence'];

    const rawWatts = wattsRaw === undefined || wattsRaw === null ? undefined : readNumberArray(data, 'watts');
    const rawHeartrate =
      heartrateRaw === undefined || heartrateRaw === null ? undefined : readNumberArray(data, 'heartrate');
    const rawTime = timeRaw === undefined || timeRaw === null ? undefined : readNumberArray(data, 'time');
    const rawCadence =
      cadenceRaw === undefined || cadenceRaw === null ? undefined : readNumberArray(data, 'cadence');

    const watts = rawWatts === null ? undefined : rawWatts;
    const heartrate = rawHeartrate === null ? undefined : rawHeartrate;
    const time = rawTime === null ? undefined : rawTime;
    const cadence = rawCadence === null ? undefined : rawCadence;
    const createdAt = readString(data, 'createdAt');

    if (
      activityIdField === null ||
      stravaActivityId === null ||
      sampleCount === null ||
      (wattsRaw !== undefined && wattsRaw !== null && watts === null) ||
      (heartrateRaw !== undefined && heartrateRaw !== null && heartrate === null) ||
      (timeRaw !== undefined && timeRaw !== null && time === null) ||
      (cadenceRaw !== undefined && cadenceRaw !== null && cadence === null) ||
      createdAt === null
    ) {
      return null;
    }

    return {
      activityId: activityIdField,
      stravaActivityId,
      watts,
      heartrate,
      time,
      cadence,
      sampleCount,
      createdAt,
    };
  }
}
