import type { Firestore } from 'firebase-admin/firestore';
import type {
  Exercise,
  CreateExerciseDTO,
  UpdateExerciseDTO,
} from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';
import { getCollectionName } from '../firebase/index.js';

export class ExerciseRepository extends BaseRepository<
  Exercise,
  CreateExerciseDTO,
  UpdateExerciseDTO
> {
  constructor(db?: Firestore) {
    super('exercises', db);
  }

  async create(data: CreateExerciseDTO): Promise<Exercise> {
    const timestamps = this.createTimestamps();
    const exerciseData = {
      name: data.name,
      weight_increment: data.weight_increment ?? 5.0,
      is_custom: data.is_custom ?? false,
      ...timestamps,
    };

    const docRef = await this.collection.add(exerciseData);
    const exercise: Exercise = {
      id: docRef.id,
      ...exerciseData,
    };

    return exercise;
  }

  async findById(id: string): Promise<Exercise | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Exercise;
  }

  async findByName(name: string): Promise<Exercise | null> {
    const snapshot = await this.collection.where('name', '==', name).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Exercise;
  }

  async findAll(): Promise<Exercise[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Exercise);
  }

  async findDefaultExercises(): Promise<Exercise[]> {
    const snapshot = await this.collection
      .where('is_custom', '==', false)
      .orderBy('name')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Exercise);
  }

  async findCustomExercises(): Promise<Exercise[]> {
    const snapshot = await this.collection
      .where('is_custom', '==', true)
      .orderBy('name')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Exercise);
  }

  async update(id: string, data: UpdateExerciseDTO): Promise<Exercise | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | number> = {};

    if (data.name !== undefined) {
      updates['name'] = data.name;
    }

    if (data.weight_increment !== undefined) {
      updates['weight_increment'] = data.weight_increment;
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    updates['updated_at'] = this.updateTimestamp();

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

  /**
   * Check if exercise is referenced by any plan_day_exercises
   */
  async isInUse(id: string): Promise<boolean> {
    const planDayExercisesCollection = this.db.collection(
      getCollectionName('plan_day_exercises')
    );
    const snapshot = await planDayExercisesCollection
      .where('exercise_id', '==', id)
      .limit(1)
      .get();
    return !snapshot.empty;
  }
}
