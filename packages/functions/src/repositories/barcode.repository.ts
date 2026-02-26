import type { Firestore } from 'firebase-admin/firestore';
import type {
  Barcode,
  CreateBarcodeDTO,
  UpdateBarcodeDTO,
  BarcodeType,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readNumber,
  readString,
  readEnum,
} from './firestore-type-guards.js';

const VALID_BARCODE_TYPES: readonly BarcodeType[] = ['code128', 'code39', 'qr'];

export class BarcodeRepository extends BaseRepository<
  Barcode,
  CreateBarcodeDTO,
  UpdateBarcodeDTO & Record<string, unknown>
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

  protected parseEntity(id: string, data: Record<string, unknown>): Barcode | null {
    const label = readString(data, 'label');
    const value = readString(data, 'value');
    const barcodeType = readEnum(data, 'barcode_type', VALID_BARCODE_TYPES);
    const color = readString(data, 'color');
    const sortOrder = readNumber(data, 'sort_order');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      label === null ||
      value === null ||
      barcodeType === null ||
      color === null ||
      sortOrder === null ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    return {
      id,
      label,
      value,
      barcode_type: barcodeType,
      color,
      sort_order: sortOrder,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async findAll(): Promise<Barcode[]> {
    const snapshot = await this.collection.orderBy('sort_order').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((barcode): barcode is Barcode => barcode !== null);
  }
}
