import type { Firestore } from 'firebase-admin/firestore';
import type {
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO,
  MesocycleStatus,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readEnum,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class MesocycleRepository extends BaseRepository<
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO & Record<string, unknown>
> {
  constructor(db?: Firestore) {
    super('mesocycles', db);
  }

  async create(data: CreateMesocycleDTO): Promise<Mesocycle> {
    const timestamps = this.createTimestamps();
    const mesocycleData = {
      plan_id: data.plan_id,
      start_date: data.start_date,
      current_week: 1,
      status: 'pending' as MesocycleStatus,
      ...timestamps,
    };

    const docRef = await this.collection.add(mesocycleData);
    const mesocycle: Mesocycle = {
      id: docRef.id,
      ...mesocycleData,
    };

    return mesocycle;
  }

  protected parseEntity(id: string, data: Record<string, unknown>): Mesocycle | null {
    const planId = readString(data, 'plan_id');
    const startDate = readString(data, 'start_date');
    const currentWeek = readNumber(data, 'current_week');
    const status = readEnum(data, 'status', ['pending', 'active', 'completed', 'cancelled'] as const);
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      planId === null ||
      startDate === null ||
      currentWeek === null ||
      status === null ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    return {
      id,
      plan_id: planId,
      start_date: startDate,
      current_week: currentWeek,
      status,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async findByPlanId(planId: string): Promise<Mesocycle[]> {
    const snapshot = await this.collection
      .where('plan_id', '==', planId)
      .orderBy('start_date', 'desc')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((mesocycle): mesocycle is Mesocycle => mesocycle !== null);
  }

  async findActive(): Promise<Mesocycle[]> {
    const snapshot = await this.collection
      .where('status', '==', 'active')
      .orderBy('start_date', 'desc')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((mesocycle): mesocycle is Mesocycle => mesocycle !== null);
  }

  async findAll(): Promise<Mesocycle[]> {
    const snapshot = await this.collection.orderBy('start_date', 'desc').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((mesocycle): mesocycle is Mesocycle => mesocycle !== null);
  }
}
