import type { Firestore } from 'firebase-admin/firestore';
import type {
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO,
  MesocycleStatus,
} from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';

export class MesocycleRepository extends BaseRepository<
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO
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

  async findById(id: string): Promise<Mesocycle | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Mesocycle;
  }

  async findByPlanId(planId: string): Promise<Mesocycle[]> {
    const snapshot = await this.collection
      .where('plan_id', '==', planId)
      .orderBy('start_date', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Mesocycle);
  }

  async findActive(): Promise<Mesocycle[]> {
    const snapshot = await this.collection
      .where('status', '==', 'active')
      .orderBy('start_date', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Mesocycle);
  }

  async findAll(): Promise<Mesocycle[]> {
    const snapshot = await this.collection.orderBy('start_date', 'desc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Mesocycle);
  }

  async update(id: string, data: UpdateMesocycleDTO): Promise<Mesocycle | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | number> = {};

    if (data.current_week !== undefined) {
      updates['current_week'] = data.current_week;
    }

    if (data.status !== undefined) {
      updates['status'] = data.status;
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
}
