import type { Firestore } from 'firebase-admin/firestore';
import type {
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';

export class PlanDayExerciseRepository extends BaseRepository<
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO
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

  async findByPlanDayId(planDayId: string): Promise<PlanDayExercise[]> {
    const snapshot = await this.collection
      .where('plan_day_id', '==', planDayId)
      .orderBy('sort_order')
      .get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as PlanDayExercise
    );
  }

  async findAll(): Promise<PlanDayExercise[]> {
    const snapshot = await this.collection
      .orderBy('plan_day_id')
      .orderBy('sort_order')
      .get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as PlanDayExercise
    );
  }
}
