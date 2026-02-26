import type { Firestore } from 'firebase-admin/firestore';
import type {
  WorkoutSet,
  CreateWorkoutSetDTO,
  UpdateWorkoutSetDTO,
  WorkoutSetStatus,
  CompletedSetRow,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { getCollectionName } from '../firebase.js';
import {
  isRecord,
  readEnum,
  readNumber,
  readString,
} from './firestore-type-guards.js';

type CompletedSetWithValues = Omit<WorkoutSet, 'actual_reps' | 'actual_weight'> & {
  actual_reps: number;
  actual_weight: number;
};

export class WorkoutSetRepository extends BaseRepository<
  WorkoutSet,
  CreateWorkoutSetDTO,
  UpdateWorkoutSetDTO & Record<string, unknown>
> {
  protected override includeTimestampOnUpdate = false;

  constructor(db?: Firestore) {
    super('workout_sets', db);
  }

  async create(data: CreateWorkoutSetDTO): Promise<WorkoutSet> {
    const setData = {
      workout_id: data.workout_id,
      exercise_id: data.exercise_id,
      set_number: data.set_number,
      target_reps: data.target_reps,
      target_weight: data.target_weight,
      actual_reps: null,
      actual_weight: null,
      status: 'pending' as WorkoutSetStatus,
    };

    const docRef = await this.collection.add(setData);
    const workoutSet: WorkoutSet = {
      id: docRef.id,
      ...setData,
    };

    return workoutSet;
  }

  protected parseEntity(id: string, data: Record<string, unknown>): WorkoutSet | null {
    const workoutId = readString(data, 'workout_id');
    const exerciseId = readString(data, 'exercise_id');
    const setNumber = readNumber(data, 'set_number');
    const targetReps = readNumber(data, 'target_reps');
    const targetWeight = readNumber(data, 'target_weight');
    const status = readEnum(data, 'status', ['pending', 'completed', 'skipped'] as const);
    const rawActualReps = data['actual_reps'];
    const rawActualWeight = data['actual_weight'];

    const actualReps =
      rawActualReps === null ? null : readNumber(data, 'actual_reps');
    const actualWeight =
      rawActualWeight === null ? null : readNumber(data, 'actual_weight');

    if (
      workoutId === null ||
      exerciseId === null ||
      setNumber === null ||
      targetReps === null ||
      targetWeight === null ||
      status === null ||
      (rawActualReps !== null && actualReps === null) ||
      (rawActualWeight !== null && actualWeight === null)
    ) {
      return null;
    }

    return {
      id,
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_number: setNumber,
      target_reps: targetReps,
      target_weight: targetWeight,
      actual_reps: actualReps,
      actual_weight: actualWeight,
      status,
    };
  }

  protected parseCompletedSetRow(
    set: Omit<WorkoutSet, 'actual_reps' | 'actual_weight'> & {
      actual_reps: number;
      actual_weight: number;
    },
    workoutSummary: {
      scheduled_date: string;
      completed_at: string | null;
      week_number: number;
      mesocycle_id: string;
    }
  ): CompletedSetRow {
    return {
      workout_id: set.workout_id,
      exercise_id: set.exercise_id,
      set_number: set.set_number,
      actual_weight: set.actual_weight,
      actual_reps: set.actual_reps,
      scheduled_date: workoutSummary.scheduled_date,
      completed_at: workoutSummary.completed_at,
      week_number: workoutSummary.week_number,
      mesocycle_id: workoutSummary.mesocycle_id,
    };
  }

  protected parseCompletedWorkoutSummary(data: Record<string, unknown>): {
    scheduled_date: string;
    completed_at: string | null;
    week_number: number;
    mesocycle_id: string;
  } | null {
    const scheduledDate = readString(data, 'scheduled_date');
    const rawCompletedAt = data['completed_at'];
    const completedAt = rawCompletedAt === null ? null : readString(data, 'completed_at');
    const weekNumber = readNumber(data, 'week_number');
    const mesocycleId = readString(data, 'mesocycle_id');
    const status = readEnum(
      data,
      'status',
      ['pending', 'in_progress', 'completed', 'skipped'] as const
    );

    if (
      scheduledDate === null ||
      weekNumber === null ||
      mesocycleId === null ||
      status === null ||
      status !== 'completed' ||
      (rawCompletedAt !== null && completedAt === null)
    ) {
      return null;
    }

    return {
      scheduled_date: scheduledDate,
      completed_at: completedAt,
      week_number: weekNumber,
      mesocycle_id: mesocycleId,
    };
  }

  async findByWorkoutId(workoutId: string): Promise<WorkoutSet[]> {
    const snapshot = await this.collection
      .where('workout_id', '==', workoutId)
      .orderBy('exercise_id')
      .orderBy('set_number')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((set): set is WorkoutSet => set !== null);
  }

  async findByWorkoutAndExercise(
    workoutId: string,
    exerciseId: string
  ): Promise<WorkoutSet[]> {
    const snapshot = await this.collection
      .where('workout_id', '==', workoutId)
      .where('exercise_id', '==', exerciseId)
      .orderBy('set_number')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((set): set is WorkoutSet => set !== null);
  }

  async findByStatus(status: WorkoutSetStatus): Promise<WorkoutSet[]> {
    const snapshot = await this.collection.where('status', '==', status).get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((set): set is WorkoutSet => set !== null);
  }

  async findAll(): Promise<WorkoutSet[]> {
    const snapshot = await this.collection
      .orderBy('workout_id')
      .orderBy('exercise_id')
      .orderBy('set_number')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((set): set is WorkoutSet => set !== null);
  }

  async findCompletedByExerciseId(exerciseId: string): Promise<CompletedSetRow[]> {
    const setsSnapshot = await this.collection
      .where('exercise_id', '==', exerciseId)
      .where('status', '==', 'completed')
      .get();

    if (setsSnapshot.empty) {
      return [];
    }

    const completedSetRows: CompletedSetRow[] = [];
    const setResults = setsSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        const set = this.parseEntity(doc.id, data);
        if (set === null) {
          return null;
        }
        if (set.actual_weight === null || set.actual_reps === null) {
          return null;
        }
        return {
          ...set,
          actual_reps: set.actual_reps,
          actual_weight: set.actual_weight,
        };
      })
      .filter((set): set is CompletedSetWithValues => set !== null);

    if (setResults.length === 0) {
      return [];
    }

    const workoutIds = new Set<string>(
      setResults.map((set) => set.workout_id)
    );

    const workoutsCollection = this.db.collection(getCollectionName('workouts'));
    const workoutMap = new Map<
      string,
      {
        scheduled_date: string;
        completed_at: string | null;
        week_number: number;
        mesocycle_id: string;
      }
    >();

    for (const workoutId of workoutIds) {
      const workoutDoc = await workoutsCollection.doc(workoutId).get();
      if (!workoutDoc.exists) {
        continue;
      }

      const data = workoutDoc.data();
      if (!isRecord(data)) {
        continue;
      }
      const workoutSummary = this.parseCompletedWorkoutSummary(data);
      if (workoutSummary !== null) {
        workoutMap.set(workoutId, workoutSummary);
      }
    }

    for (const set of setResults) {
      const workoutSummary = workoutMap.get(set.workout_id);
      if (workoutSummary === undefined) {
        continue;
      }

      completedSetRows.push(this.parseCompletedSetRow(set, workoutSummary));
    }

    completedSetRows.sort((a, b) => {
      if (a.completed_at !== null && b.completed_at !== null) {
        const cmp = a.completed_at.localeCompare(b.completed_at);
        if (cmp !== 0) {
          return cmp;
        }
      }

      const dateCmp = a.scheduled_date.localeCompare(b.scheduled_date);
      if (dateCmp !== 0) {
        return dateCmp;
      }
      return a.set_number - b.set_number;
    });

    return completedSetRows;
  }
}
