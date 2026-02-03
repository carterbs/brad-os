import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';

// Create mock types
interface MockDocumentSnapshot {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface MockQueryDocumentSnapshot {
  id: string;
  data: () => Record<string, unknown>;
}

interface MockQuerySnapshot {
  empty: boolean;
  docs: MockQueryDocumentSnapshot[];
}

const createMockDoc = (id: string, data: Record<string, unknown> | null): MockDocumentSnapshot => ({
  id,
  exists: data !== null,
  data: () => data ?? undefined,
});

const createMockQuerySnapshot = (docs: Array<{ id: string; data: Record<string, unknown> }>): MockQuerySnapshot => ({
  empty: docs.length === 0,
  docs: docs.map((doc) => ({
    id: doc.id,
    data: () => doc.data,
  })),
});

describe('StretchRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let StretchRepository: typeof import('./stretch.repository.js').StretchRepository;

  beforeEach(async () => {
    vi.resetModules();

    mockDocRef = {
      id: 'test-id',
      get: vi.fn(),
      set: vi.fn(),
    };

    mockCollection = {
      doc: vi.fn().mockReturnValue(mockDocRef),
      orderBy: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
      batch: vi.fn().mockReturnValue({
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      }),
    };

    vi.doMock('../firebase.js', () => ({
      getFirestoreDb: vi.fn().mockReturnValue(mockDb),
      getCollectionName: vi.fn((name: string) => `test_${name}`),
    }));

    const module = await import('./stretch.repository.js');
    StretchRepository = module.StretchRepository;
  });

  describe('findAll', () => {
    it('should return all regions ordered by region', async () => {
      const mockDocs = createMockQuerySnapshot([
        {
          id: 'back',
          data: {
            region: 'back',
            displayName: 'Back',
            iconName: 'figure.flexibility',
            stretches: [{ id: 'back-childs-pose', name: "Child's Pose", description: 'Kneel...', bilateral: false }],
          },
        },
        {
          id: 'neck',
          data: {
            region: 'neck',
            displayName: 'Neck',
            iconName: 'figure.head',
            stretches: [{ id: 'neck-rotation', name: 'Neck Rotation', description: 'Slowly...', bilateral: true }],
          },
        },
      ]);

      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('back');
      expect(result[1]?.id).toBe('neck');
      expect(mockCollection.orderBy).toHaveBeenCalledWith('region');
    });

    it('should return empty array when no regions exist', async () => {
      const mockDocs = createMockQuerySnapshot([]);
      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('findByRegion', () => {
    it('should return a region when it exists', async () => {
      const regionData = {
        region: 'back',
        displayName: 'Back',
        iconName: 'figure.flexibility',
        stretches: [{ id: 'back-childs-pose', name: "Child's Pose", description: 'Kneel...', bilateral: false }],
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('back', regionData));

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.findByRegion('back');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('back');
      expect(result?.region).toBe('back');
      expect(mockCollection.doc).toHaveBeenCalledWith('back');
    });

    it('should return null when region does not exist', async () => {
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('invalid', null));

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.findByRegion('invalid');

      expect(result).toBeNull();
    });
  });

  describe('seed', () => {
    it('should batch write all regions with timestamps', async () => {
      const mockBatch = {
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      (mockDb.batch as ReturnType<typeof vi.fn>).mockReturnValue(mockBatch);

      const regions = [
        {
          region: 'back' as const,
          displayName: 'Back',
          iconName: 'figure.flexibility',
          stretches: [{ id: 'back-childs-pose', name: "Child's Pose", description: 'Kneel...', bilateral: false }],
        },
      ];

      const repo = new StretchRepository(mockDb as Firestore);
      await repo.seed(regions);

      expect(mockBatch.set).toHaveBeenCalledTimes(1);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // Verify the set call includes timestamps
      const setCall = mockBatch.set.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(setCall[1]).toHaveProperty('created_at');
      expect(setCall[1]).toHaveProperty('updated_at');
      expect(setCall[1].region).toBe('back');
    });

    it('should use region as document ID (idempotent)', async () => {
      const mockBatch = {
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      (mockDb.batch as ReturnType<typeof vi.fn>).mockReturnValue(mockBatch);

      const regions = [
        {
          region: 'back' as const,
          displayName: 'Back',
          iconName: 'figure.flexibility',
          stretches: [],
        },
      ];

      const repo = new StretchRepository(mockDb as Firestore);
      await repo.seed(regions);

      // Verify doc() was called with region key
      expect(mockCollection.doc).toHaveBeenCalledWith('back');
    });
  });
});
