import type { Firestore } from 'firebase-admin/firestore';
import type {
  Workout,
  CreateWorkoutDTO,
  UpdateWorkoutDTO,
  WorkoutStatus,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';

/**
 * Convert a local date boundary to a UTC timestamp.
 * @param localDate - Local date in YYYY-MM-DD format
 * @param isEndOfDay - If true, returns end of day (23:59:59.999), otherwise start of day (00:00:00.000)
 * @param timezoneOffsetMinutes - Timezone offset in minutes from Date.getTimezoneOffset()
 *                                 (positive for west of UTC, negative for east)
 * @returns UTC timestamp in ISO format
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

export class WorkoutRepository extends BaseRepository<
  Workout,
  CreateWorkoutDTO,
  UpdateWorkoutDTO
> {
  constructor(db?: Firestore) {
    super('workouts', db);
  }

  async create(data: CreateWorkoutDTO): Promise<Workout> {
    const workoutData = {
      mesocycle_id: data.mesocycle_id,
      plan_day_id: data.plan_day_id,
      week_number: data.week_number,
      scheduled_date: data.scheduled_date,
      status: 'pending' as WorkoutStatus,
      started_at: null,
      completed_at: null,
    };

    const docRef = await this.collection.add(workoutData);
    const workout: Workout = {
      id: docRef.id,
      ...workoutData,
    };

    return workout;
  }

  async findById(id: string): Promise<Workout | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Workout;
  }

  async findByMesocycleId(mesocycleId: string): Promise<Workout[]> {
    const snapshot = await this.collection
      .where('mesocycle_id', '==', mesocycleId)
      .orderBy('scheduled_date')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Workout);
  }

  async findByStatus(status: WorkoutStatus): Promise<Workout[]> {
    const snapshot = await this.collection
      .where('status', '==', status)
      .orderBy('scheduled_date')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Workout);
  }

  /**
   * Find workouts by scheduled date (YYYY-MM-DD).
   * scheduled_date is stored as a simple date string.
   */
  async findByDate(date: string): Promise<Workout[]> {
    const snapshot = await this.collection
      .where('scheduled_date', '==', date)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Workout);
  }

  /**
   * Find workouts completed within a date range (ISO timestamps).
   * Used to find workouts completed today/yesterday regardless of scheduled date.
   */
  async findByCompletedAtRange(startTimestamp: string, endTimestamp: string): Promise<Workout[]> {
    const snapshot = await this.collection
      .where('completed_at', '>=', startTimestamp)
      .where('completed_at', '<=', endTimestamp)
      .orderBy('completed_at', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Workout);
  }

  /**
   * Find the previous week's workout for the same plan day within the same mesocycle
   */
  async findPreviousWeekWorkout(
    mesocycleId: string,
    planDayId: string,
    currentWeekNumber: number
  ): Promise<Workout | null> {
    if (currentWeekNumber <= 1) {
      return null;
    }

    const snapshot = await this.collection
      .where('mesocycle_id', '==', mesocycleId)
      .where('plan_day_id', '==', planDayId)
      .where('week_number', '==', currentWeekNumber - 1)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    if (doc === undefined) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Workout;
  }

  /**
   * Find the next upcoming workout (pending or in_progress) ordered by scheduled date.
   */
  async findNextPending(): Promise<Workout | null> {
    // Query for pending workouts
    const pendingSnapshot = await this.collection
      .where('status', '==', 'pending')
      .orderBy('scheduled_date')
      .limit(1)
      .get();

    // Query for in_progress workouts
    const inProgressSnapshot = await this.collection
      .where('status', '==', 'in_progress')
      .orderBy('scheduled_date')
      .limit(1)
      .get();

    const candidates: Workout[] = [];

    if (!pendingSnapshot.empty) {
      const doc = pendingSnapshot.docs[0];
      if (doc !== undefined) {
        candidates.push({ id: doc.id, ...doc.data() } as Workout);
      }
    }

    if (!inProgressSnapshot.empty) {
      const doc = inProgressSnapshot.docs[0];
      if (doc !== undefined) {
        candidates.push({ id: doc.id, ...doc.data() } as Workout);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return the one with earliest scheduled_date
    candidates.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    return candidates[0] ?? null;
  }

  async findAll(): Promise<Workout[]> {
    const snapshot = await this.collection.orderBy('scheduled_date', 'desc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Workout);
  }

  /**
   * Find completed workouts where completed_at falls within the date range.
   */
  async findCompletedInDateRange(
    startDate: string,
    endDate: string,
    timezoneOffset: number = 0
  ): Promise<Workout[]> {
    const startTimestamp = localDateToUtcBoundary(startDate, false, timezoneOffset);
    const endTimestamp = localDateToUtcBoundary(endDate, true, timezoneOffset);

    const snapshot = await this.collection
      .where('status', '==', 'completed')
      .where('completed_at', '>=', startTimestamp)
      .where('completed_at', '<=', endTimestamp)
      .orderBy('completed_at')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Workout);
  }

  async update(id: string, data: UpdateWorkoutDTO): Promise<Workout | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | null> = {};

    if (data.status !== undefined) {
      updates['status'] = data.status;
    }

    if (data.started_at !== undefined) {
      updates['started_at'] = data.started_at;
    }

    if (data.completed_at !== undefined) {
      updates['completed_at'] = data.completed_at;
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    await this.collection.doc(id).update(updates);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }
}
