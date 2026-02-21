import type { Firestore } from 'firebase-admin/firestore';
import type {
  WorkoutSet,
  CreateWorkoutSetDTO,
  UpdateWorkoutSetDTO,
  WorkoutSetStatus,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { getCollectionName } from '../firebase.js';

export interface CompletedSetRow {
  workout_id: string;
  exercise_id: string;
  set_number: number;
  actual_weight: number;
  actual_reps: number;
  scheduled_date: string;
  completed_at: string | null;
  week_number: number;
  mesocycle_id: string;
}

export class WorkoutSetRepository extends BaseRepository<
  WorkoutSet,
  CreateWorkoutSetDTO,
  UpdateWorkoutSetDTO
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

  async findByWorkoutId(workoutId: string): Promise<WorkoutSet[]> {
    const snapshot = await this.collection
      .where('workout_id', '==', workoutId)
      .orderBy('exercise_id')
      .orderBy('set_number')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSet);
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSet);
  }

  async findByStatus(status: WorkoutSetStatus): Promise<WorkoutSet[]> {
    const snapshot = await this.collection.where('status', '==', status).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSet);
  }

  async findAll(): Promise<WorkoutSet[]> {
    const snapshot = await this.collection
      .orderBy('workout_id')
      .orderBy('exercise_id')
      .orderBy('set_number')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSet);
  }

  async findCompletedByExerciseId(exerciseId: string): Promise<CompletedSetRow[]> {
    const setsSnapshot = await this.collection
      .where('exercise_id', '==', exerciseId)
      .where('status', '==', 'completed')
      .get();

    if (setsSnapshot.empty) {
      return [];
    }

    const workoutIds = new Set<string>();
    for (const doc of setsSnapshot.docs) {
      const data = doc.data();
      if (data['actual_weight'] !== null && data['actual_reps'] !== null) {
        workoutIds.add(data['workout_id'] as string);
      }
    }

    if (workoutIds.size === 0) {
      return [];
    }

    const workoutsCollection = this.db.collection(getCollectionName('workouts'));
    const workoutMap = new Map<
      string,
      {
        scheduled_date: string;
        completed_at: string | null;
        week_number: number;
        mesocycle_id: string;
        status: string;
      }
    >();

    for (const workoutId of workoutIds) {
      const workoutDoc = await workoutsCollection.doc(workoutId).get();
      if (workoutDoc.exists) {
        const data = workoutDoc.data();
        if (data && data['status'] === 'completed') {
          workoutMap.set(workoutId, {
            scheduled_date: data['scheduled_date'] as string,
            completed_at: data['completed_at'] as string | null,
            week_number: data['week_number'] as number,
            mesocycle_id: data['mesocycle_id'] as string,
            status: data['status'] as string,
          });
        }
      }
    }

    const results: CompletedSetRow[] = [];
    for (const doc of setsSnapshot.docs) {
      const setData = doc.data();
      const workoutId = setData['workout_id'] as string;
      const workout = workoutMap.get(workoutId);

      if (
        workout &&
        setData['actual_weight'] !== null &&
        setData['actual_reps'] !== null
      ) {
        results.push({
          workout_id: workoutId,
          exercise_id: setData['exercise_id'] as string,
          set_number: setData['set_number'] as number,
          actual_weight: setData['actual_weight'] as number,
          actual_reps: setData['actual_reps'] as number,
          scheduled_date: workout.scheduled_date,
          completed_at: workout.completed_at,
          week_number: workout.week_number,
          mesocycle_id: workout.mesocycle_id,
        });
      }
    }

    results.sort((a, b) => {
      if (a.completed_at !== null && b.completed_at !== null) {
        const cmp = a.completed_at.localeCompare(b.completed_at);
        if (cmp !== 0) return cmp;
      }
      const dateCmp = a.scheduled_date.localeCompare(b.scheduled_date);
      if (dateCmp !== 0) return dateCmp;
      return a.set_number - b.set_number;
    });

    return results;
  }
}
