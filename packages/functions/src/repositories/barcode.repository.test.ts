import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuery,
  createMockQuerySnapshot,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';
import type { Barcode } from '../shared.js';

describe('BarcodeRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let BarcodeRepository: typeof import('./barcode.repository.js').BarcodeRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    const module = await import('./barcode.repository.js');
    BarcodeRepository = module.BarcodeRepository;
  });

  describe('create', () => {
    it('should write expected fields and timestamps', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'barcode-id' });

      const result = await repository.create({
        label: 'Grocery',
        value: '123456789',
        barcode_type: 'code128',
        color: 'blue',
        sort_order: 5,
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Grocery',
          value: '123456789',
          barcode_type: 'code128',
          color: 'blue',
          sort_order: 5,
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'barcode-id',
          label: 'Grocery',
          value: '123456789',
          barcode_type: 'code128',
          color: 'blue',
          sort_order: 5,
        })
      );
    });

    it('should default sort_order to 0 when omitted', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'barcode-id-2' });

      await repository.create({
        label: 'Gym',
        value: '987654321',
        barcode_type: 'qr',
        color: 'red',
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_order: 0,
        })
      );
    });
  });

  describe('findAll', () => {
    it('should return barcodes ordered by sort_order', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(
        createMockQuerySnapshot([
          {
            id: 'b-1',
            data: {
              label: 'One',
              value: '111',
              barcode_type: 'code128',
              color: 'green',
              sort_order: 1,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          },
          {
            id: 'b-2',
            data: {
              label: 'Two',
              value: '222',
              barcode_type: 'code39',
              color: 'yellow',
              sort_order: 2,
              created_at: '2024-01-02T00:00:00Z',
              updated_at: '2024-01-02T00:00:00Z',
            },
          },
        ])
      );
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('sort_order');
      expect(result).toEqual([
        {
          id: 'b-1',
          label: 'One',
          value: '111',
          barcode_type: 'code128',
          color: 'green',
          sort_order: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'b-2',
          label: 'Two',
          value: '222',
          barcode_type: 'code39',
          color: 'yellow',
          sort_order: 2,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ]);
    });

    it('should return an empty array when no barcodes exist', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return barcode when found', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      const barcode: Barcode = {
        id: 'barcode-1',
        label: 'Laundry',
        value: '555',
        barcode_type: 'qr',
        color: 'gray',
        sort_order: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('barcode-1', barcode));

      const result = await repository.findById('barcode-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('barcode-1');
      expect(result).toEqual(barcode);
    });

    it('should return null when barcode is missing', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update barcode fields and inject updated_at', async () => {
      const existing: Barcode = {
        id: 'barcode-1',
        label: 'Laundry',
        value: '555',
        barcode_type: 'qr',
        color: 'gray',
        sort_order: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('barcode-1', existing))
        .mockResolvedValueOnce(
          createMockDoc('barcode-1', {
            ...existing,
            color: 'black',
            sort_order: 3,
            updated_at: '2024-01-02T00:00:00Z',
          })
        );

      const repository = new BarcodeRepository(mockDb as Firestore);
      const result = await repository.update('barcode-1', {
        color: 'black',
        sort_order: 3,
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'black',
          sort_order: 3,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).toEqual({
        id: 'barcode-1',
        label: 'Laundry',
        value: '555',
        barcode_type: 'qr',
        color: 'black',
        sort_order: 3,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      });
    });

    it('should return existing barcode when no fields are supplied', async () => {
      const existing: Barcode = {
        id: 'barcode-1',
        label: 'Laundry',
        value: '555',
        barcode_type: 'qr',
        color: 'gray',
        sort_order: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('barcode-1', existing));

      const repository = new BarcodeRepository(mockDb as Firestore);
      const result = await repository.update('barcode-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });
  });

  describe('delete', () => {
    it('should delete existing barcode', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      const existing = {
        label: 'Laundry',
        value: '555',
        barcode_type: 'qr',
        color: 'gray',
        sort_order: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('barcode-1', existing));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('barcode-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('barcode-1');
      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent barcode', async () => {
      const repository = new BarcodeRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.delete('missing');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
