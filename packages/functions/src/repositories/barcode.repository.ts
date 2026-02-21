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

  async findAll(): Promise<Barcode[]> {
    const snapshot = await this.collection.orderBy('sort_order').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Barcode);
  }
}
