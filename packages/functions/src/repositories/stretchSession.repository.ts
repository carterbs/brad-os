import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type {
  StretchSessionRecord,
  CreateStretchSessionRequest,
  CompletedStretch,
} from '@brad-os/shared';
import { getFirestoreDb, getCollectionName } from '../firebase.js';

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

export class StretchSessionRepository {
  private db: Firestore;
  private collectionName: string;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreDb();
    this.collectionName = getCollectionName('stretch_sessions');
  }

  private get collection() {
    return this.db.collection(this.collectionName);
  }

  /**
   * Create a new stretch session record.
   */
  async create(data: CreateStretchSessionRequest): Promise<StretchSessionRecord> {
    const id = randomUUID();

    const sessionData = {
      completedAt: data.completedAt,
      totalDurationSeconds: data.totalDurationSeconds,
      regionsCompleted: data.regionsCompleted,
      regionsSkipped: data.regionsSkipped,
      stretches: data.stretches,
    };

    await this.collection.doc(id).set(sessionData);

    const record: StretchSessionRecord = {
      id,
      ...sessionData,
    };

    return record;
  }

  /**
   * Find a stretch session by ID.
   */
  async findById(id: string): Promise<StretchSessionRecord | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    return {
      id: doc.id,
      completedAt: data?.['completedAt'] as string,
      totalDurationSeconds: data?.['totalDurationSeconds'] as number,
      regionsCompleted: data?.['regionsCompleted'] as number,
      regionsSkipped: data?.['regionsSkipped'] as number,
      stretches: data?.['stretches'] as CompletedStretch[],
    };
  }

  /**
   * Get the most recent stretch session.
   */
  async findLatest(): Promise<StretchSessionRecord | null> {
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
    return {
      id: doc.id,
      completedAt: data['completedAt'] as string,
      totalDurationSeconds: data['totalDurationSeconds'] as number,
      regionsCompleted: data['regionsCompleted'] as number,
      regionsSkipped: data['regionsSkipped'] as number,
      stretches: data['stretches'] as CompletedStretch[],
    };
  }

  /**
   * Get all stretch sessions, most recent first.
   */
  async findAll(): Promise<StretchSessionRecord[]> {
    const snapshot = await this.collection.orderBy('completedAt', 'desc').get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        completedAt: data['completedAt'] as string,
        totalDurationSeconds: data['totalDurationSeconds'] as number,
        regionsCompleted: data['regionsCompleted'] as number,
        regionsSkipped: data['regionsSkipped'] as number,
        stretches: data['stretches'] as CompletedStretch[],
      };
    });
  }

  /**
   * Delete a stretch session by ID.
   */
  async delete(id: string): Promise<boolean> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }

  /**
   * Find stretch sessions where completedAt falls within the date range.
   */
  async findInDateRange(
    startDate: string,
    endDate: string,
    timezoneOffset: number = 0
  ): Promise<StretchSessionRecord[]> {
    const startTimestamp = localDateToUtcBoundary(startDate, false, timezoneOffset);
    const endTimestamp = localDateToUtcBoundary(endDate, true, timezoneOffset);

    const snapshot = await this.collection
      .where('completedAt', '>=', startTimestamp)
      .where('completedAt', '<=', endTimestamp)
      .orderBy('completedAt')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        completedAt: data['completedAt'] as string,
        totalDurationSeconds: data['totalDurationSeconds'] as number,
        regionsCompleted: data['regionsCompleted'] as number,
        regionsSkipped: data['regionsSkipped'] as number,
        stretches: data['stretches'] as CompletedStretch[],
      };
    });
  }
}
