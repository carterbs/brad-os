import type { Firestore } from 'firebase-admin/firestore';
import type {
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class PlanDayExerciseRepository extends BaseRepository<
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO & Record<string, unknown>
> {
  protected override includeTimestampOnUpdate = false;

  constructor(db?: Firestore) {
    super('plan_day_exercises', db);
  }

  async create(data: CreatePlanDayExerciseDTO): Promise<PlanDayExercise> {
    const exerciseData = {
      plan_day_id: data.plan_day_id,
      exercise_id: data.exercise_id,
      sets: data.sets ?? 2,
      reps: data.reps ?? 8,
      weight: data.weight ?? 30.0,
      rest_seconds: data.rest_seconds ?? 60,
      sort_order: data.sort_order,
      min_reps: data.min_reps ?? 8,
      max_reps: data.max_reps ?? 12,
    };

    const docRef = await this.collection.add(exerciseData);
    const planDayExercise: PlanDayExercise = {
      id: docRef.id,
      ...exerciseData,
    };

    return planDayExercise;
  }

  protected parseEntity(id: string, data: Record<string, unknown>): PlanDayExercise | null {
    const planDayId = readString(data, 'plan_day_id');
    const exerciseId = readString(data, 'exercise_id');
    const sets = readNumber(data, 'sets');
    const reps = readNumber(data, 'reps');
    const weight = readNumber(data, 'weight');
    const restSeconds = readNumber(data, 'rest_seconds');
    const sortOrder = readNumber(data, 'sort_order');
    const minReps = readNumber(data, 'min_reps');
    const maxReps = readNumber(data, 'max_reps');

    if (
      planDayId === null ||
      exerciseId === null ||
      sets === null ||
      reps === null ||
      weight === null ||
      restSeconds === null ||
      sortOrder === null ||
      minReps === null ||
      maxReps === null
    ) {
      return null;
    }

    return {
      id,
      plan_day_id: planDayId,
      exercise_id: exerciseId,
      sets,
      reps,
      weight,
      rest_seconds: restSeconds,
      sort_order: sortOrder,
      min_reps: minReps,
      max_reps: maxReps,
    };
  }

  async findByPlanDayId(planDayId: string): Promise<PlanDayExercise[]> {
    const snapshot = await this.collection
      .where('plan_day_id', '==', planDayId)
      .orderBy('sort_order')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((planDayExercise): planDayExercise is PlanDayExercise => planDayExercise !== null);
  }

  async findAll(): Promise<PlanDayExercise[]> {
    const snapshot = await this.collection
      .orderBy('plan_day_id')
      .orderBy('sort_order')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((planDayExercise): planDayExercise is PlanDayExercise => planDayExercise !== null);
  }
}
