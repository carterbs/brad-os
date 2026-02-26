import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type {
  MeditationSessionRecord,
  CreateMeditationSessionRequest,
} from '../shared.js';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import {
  isRecord,
  readBoolean,
  readNumber,
  readString,
} from './firestore-type-guards.js';

/**
 * Convert a local date boundary to a UTC timestamp.
 */
function localDateToUtcBoundary(
  localDate: string,
  isEndOfDay: boolean,
  timezoneOffsetMinutes: number
): string {
  const parts = localDate.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  const localMs = Date.UTC(
    year,
    month - 1,
    day,
    isEndOfDay ? 23 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 999 : 0
  );

  const utcMs = localMs + timezoneOffsetMinutes * 60 * 1000;
  return new Date(utcMs).toISOString();
}

interface MeditationStats {
  totalSessions: number;
  totalMinutes: number;
}

export class MeditationSessionRepository {
  private db: Firestore;
  private collectionName: string;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreDb();
    this.collectionName = getCollectionName('meditation_sessions');
  }

  private get collection(): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData> {
    return this.db.collection(this.collectionName);
  }

  /**
   * Create a new meditation session record.
   */
  async create(
    data: CreateMeditationSessionRequest
  ): Promise<MeditationSessionRecord> {
    const id = randomUUID();

    const sessionData = {
      completedAt: data.completedAt,
      sessionType: data.sessionType,
      plannedDurationSeconds: data.plannedDurationSeconds,
      actualDurationSeconds: data.actualDurationSeconds,
      completedFully: data.completedFully,
    };

    await this.collection.doc(id).set(sessionData);

    const record: MeditationSessionRecord = {
      id,
      ...sessionData,
    };

    return record;
  }

  /**
   * Find a meditation session by ID.
   */
  async findById(id: string): Promise<MeditationSessionRecord | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
  }

  /**
   * Get the most recent meditation session.
   */
  async findLatest(): Promise<MeditationSessionRecord | null> {
    const snapshot = await this.collection
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    if (doc === undefined) {
      return null;
    }
    const data = doc.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
  }

  /**
   * Get all meditation sessions, most recent first.
   */
  async findAll(): Promise<MeditationSessionRecord[]> {
    const snapshot = await this.collection.orderBy('completedAt', 'desc').get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((session): session is MeditationSessionRecord => session !== null);
  }

  /**
   * Find meditation sessions within a date range.
   */
  async findInDateRange(
    startDate: string,
    endDate: string,
    timezoneOffset: number = 0
  ): Promise<MeditationSessionRecord[]> {
    const startTimestamp = localDateToUtcBoundary(startDate, false, timezoneOffset);
    const endTimestamp = localDateToUtcBoundary(endDate, true, timezoneOffset);

    const snapshot = await this.collection
      .where('completedAt', '>=', startTimestamp)
      .where('completedAt', '<=', endTimestamp)
      .orderBy('completedAt')
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((session): session is MeditationSessionRecord => session !== null);
  }

  /**
   * Get aggregate statistics for meditation sessions.
   */
  async getStats(): Promise<MeditationStats> {
    const snapshot = await this.collection.get();

    let totalSessions = 0;
    let totalSeconds = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!isRecord(data)) {
        continue;
      }
      const session = this.parseEntity(doc.id, data);
      if (session === null) {
        continue;
      }

      totalSessions++;
      totalSeconds += session.actualDurationSeconds;
    }

    return {
      totalSessions,
      totalMinutes: Math.floor(totalSeconds / 60),
    };
  }

  /**
   * Delete a meditation session by ID.
   */
  async delete(id: string): Promise<boolean> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }

  protected parseEntity(id: string, data: Record<string, unknown>): MeditationSessionRecord | null {
    const completedAt = readString(data, 'completedAt');
    const sessionType = readString(data, 'sessionType');
    const plannedDurationSeconds = readNumber(data, 'plannedDurationSeconds');
    const actualDurationSeconds = readNumber(data, 'actualDurationSeconds');
    const completedFully = readBoolean(data, 'completedFully');

    if (
      completedAt === null ||
      sessionType === null ||
      plannedDurationSeconds === null ||
      actualDurationSeconds === null ||
      completedFully === null
    ) {
      return null;
    }

    return {
      id,
      completedAt,
      sessionType,
      plannedDurationSeconds,
      actualDurationSeconds,
      completedFully,
    };
  }
}
