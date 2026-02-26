import type { Firestore } from 'firebase-admin/firestore';
import type {
  Exercise,
  CreateExerciseDTO,
  UpdateExerciseDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { getCollectionName } from '../firebase.js';
import {
  isRecord,
  readBoolean,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class ExerciseRepository extends BaseRepository<
  Exercise,
  CreateExerciseDTO,
  UpdateExerciseDTO & Record<string, unknown>
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

  protected parseEntity(id: string, data: Record<string, unknown>): Exercise | null {
    const name = readString(data, 'name');
    const weightIncrement = readNumber(data, 'weight_increment');
    const isCustom = readBoolean(data, 'is_custom');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      name === null ||
      weightIncrement === null ||
      isCustom === null ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    return {
      id,
      name,
      weight_increment: weightIncrement,
      is_custom: isCustom,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async findByName(name: string): Promise<Exercise | null> {
    const snapshot = await this.collection.where('name', '==', name).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    if (!doc || !isRecord(doc.data())) {
      return null;
    }
    return this.parseEntity(doc.id, doc.data());
  }

  async findAll(): Promise<Exercise[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((exercise): exercise is Exercise => exercise !== null);
  }

  async findDefaultExercises(): Promise<Exercise[]> {
    const snapshot = await this.collection
      .where('is_custom', '==', false)
      .orderBy('name')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((exercise): exercise is Exercise => exercise !== null);
  }

  async findCustomExercises(): Promise<Exercise[]> {
    const snapshot = await this.collection
      .where('is_custom', '==', true)
      .orderBy('name')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((exercise): exercise is Exercise => exercise !== null);
  }

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
