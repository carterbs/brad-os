import type { Firestore } from 'firebase-admin/firestore';
import type {
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO,
} from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';

export class PlanDayExerciseRepository extends BaseRepository<
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO
> {
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

  async findById(id: string): Promise<PlanDayExercise | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as PlanDayExercise;
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

  async update(
    id: string,
    data: UpdatePlanDayExerciseDTO
  ): Promise<PlanDayExercise | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, number> = {};

    if (data.sets !== undefined) {
      updates['sets'] = data.sets;
    }

    if (data.reps !== undefined) {
      updates['reps'] = data.reps;
    }

    if (data.weight !== undefined) {
      updates['weight'] = data.weight;
    }

    if (data.rest_seconds !== undefined) {
      updates['rest_seconds'] = data.rest_seconds;
    }

    if (data.sort_order !== undefined) {
      updates['sort_order'] = data.sort_order;
    }

    if (data.min_reps !== undefined) {
      updates['min_reps'] = data.min_reps;
    }

    if (data.max_reps !== undefined) {
      updates['max_reps'] = data.max_reps;
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
