import type { Firestore } from 'firebase-admin/firestore';
import type {
  Barcode,
  CreateBarcodeDTO,
  UpdateBarcodeDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';

export class BarcodeRepository extends BaseRepository<
  Barcode,
  CreateBarcodeDTO,
  UpdateBarcodeDTO
> {
  constructor(db?: Firestore) {
    super('barcodes', db);
  }

  async create(data: CreateBarcodeDTO): Promise<Barcode> {
    const timestamps = this.createTimestamps();
    const barcodeData = {
      label: data.label,
      value: data.value,
      barcode_type: data.barcode_type,
      color: data.color,
      sort_order: data.sort_order ?? 0,
      ...timestamps,
    };

    const docRef = await this.collection.add(barcodeData);
    const barcode: Barcode = {
      id: docRef.id,
      ...barcodeData,
    };

    return barcode;
  }

  async findById(id: string): Promise<Barcode | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Barcode;
  }

  async findAll(): Promise<Barcode[]> {
    const snapshot = await this.collection.orderBy('sort_order').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Barcode);
  }

  async update(id: string, data: UpdateBarcodeDTO): Promise<Barcode | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | number> = {};

    if (data.label !== undefined) {
      updates['label'] = data.label;
    }

    if (data.value !== undefined) {
      updates['value'] = data.value;
    }

    if (data.barcode_type !== undefined) {
      updates['barcode_type'] = data.barcode_type;
    }

    if (data.color !== undefined) {
      updates['color'] = data.color;
    }

    if (data.sort_order !== undefined) {
      updates['sort_order'] = data.sort_order;
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
