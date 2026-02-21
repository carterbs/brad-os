import type { Firestore } from 'firebase-admin/firestore';
import type {
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO,
  MesocycleStatus,
} from '../shared.js';
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
}
