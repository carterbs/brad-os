import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference, Query } from 'firebase-admin/firestore';

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

// Helper functions
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

const createMockQuery = (snapshot: MockQuerySnapshot): Partial<Query> => ({
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue(snapshot),
});

describe('StretchSessionRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let StretchSessionRepository: typeof import('./stretchSession.repository.js').StretchSessionRepository;

  beforeEach(async () => {
    vi.resetModules();

    mockDocRef = {
      id: 'test-id',
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn() as unknown as DocumentReference['update'],
      delete: vi.fn(),
    };

    mockCollection = {
      doc: vi.fn().mockReturnValue(mockDocRef),
      add: vi.fn().mockResolvedValue({ id: 'generated-id' }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    vi.doMock('../firebase.js', () => ({
      getFirestoreDb: vi.fn().mockReturnValue(mockDb),
      getCollectionName: vi.fn((name: string) => `test_${name}`),
    }));

    // Mock crypto for UUID generation
    vi.doMock('node:crypto', () => ({
      randomUUID: vi.fn().mockReturnValue('mock-uuid-1234'),
    }));

    const module = await import('./stretchSession.repository.js');
    StretchSessionRepository = module.StretchSessionRepository;
  });

  describe('create', () => {
    it('should create stretch session with generated id', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const stretches = [
        { region: 'hamstrings' as const, stretchId: 'seated-toe-touch', stretchName: 'Seated Toe Touch', durationSeconds: 30, skippedSegments: 0 },
      ];

      const result = await repository.create({
        completedAt: '2024-01-15T10:00:00Z',
        totalDurationSeconds: 300,
        regionsCompleted: 5,
        regionsSkipped: 1,
        stretches,
      });

      expect(mockCollection.doc).toHaveBeenCalledWith('mock-uuid-1234');
      expect(mockDocRef.set).toHaveBeenCalledWith({
        completedAt: '2024-01-15T10:00:00Z',
        totalDurationSeconds: 300,
        regionsCompleted: 5,
        regionsSkipped: 1,
        stretches,
      });
      expect(result.id).toBe('mock-uuid-1234');
    });

    it('should preserve all session data', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const stretches = [
        { region: 'hamstrings' as const, stretchId: 'seated-toe-touch', stretchName: 'Seated Toe Touch', durationSeconds: 30, skippedSegments: 0 },
        { region: 'quads' as const, stretchId: 'standing-quad', stretchName: 'Standing Quad', durationSeconds: 30, skippedSegments: 0 },
        { region: 'calves' as const, stretchId: 'wall-calf', stretchName: 'Wall Calf', durationSeconds: 0, skippedSegments: 2 },
      ];

      const result = await repository.create({
        completedAt: '2024-01-15T10:30:00Z',
        totalDurationSeconds: 600,
        regionsCompleted: 2,
        regionsSkipped: 1,
        stretches,
      });

      expect(result.completedAt).toBe('2024-01-15T10:30:00Z');
      expect(result.totalDurationSeconds).toBe(600);
      expect(result.regionsCompleted).toBe(2);
      expect(result.regionsSkipped).toBe(1);
      expect(result.stretches).toEqual(stretches);
    });

    it('should handle empty stretches array', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.create({
        completedAt: '2024-01-15T10:00:00Z',
        totalDurationSeconds: 0,
        regionsCompleted: 0,
        regionsSkipped: 0,
        stretches: [],
      });

      expect(result.stretches).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return stretch session when found', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const sessionData = {
        completedAt: '2024-01-15T10:00:00Z',
        totalDurationSeconds: 300,
        regionsCompleted: 5,
        regionsSkipped: 1,
        stretches: [
          { regionId: 'hamstrings', stretchId: 'seated-toe-touch', durationSeconds: 30, skipped: false },
        ],
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', sessionData));

      const result = await repository.findById('session-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('session-1');
      expect(result).toEqual({
        id: 'session-1',
        ...sessionData,
      });
    });

    it('should return null when stretch session not found', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findLatest', () => {
    it('should return most recent stretch session', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const sessionData = {
        completedAt: '2024-01-15T10:00:00Z',
        totalDurationSeconds: 300,
        regionsCompleted: 5,
        regionsSkipped: 1,
        stretches: [],
      };

      const mockQuery = createMockQuery(createMockQuerySnapshot([{ id: 'latest-session', data: sessionData }]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findLatest();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('completedAt', 'desc');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('latest-session');
    });

    it('should return null when no sessions exist', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findLatest();

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all sessions ordered by completedAt desc', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-2', data: { completedAt: '2024-01-16T10:00:00Z', totalDurationSeconds: 300, regionsCompleted: 5, regionsSkipped: 0, stretches: [] } },
        { id: 's-1', data: { completedAt: '2024-01-15T10:00:00Z', totalDurationSeconds: 250, regionsCompleted: 4, regionsSkipped: 1, stretches: [] } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('completedAt', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no sessions exist', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete existing session and return true', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const sessionData = {
        completedAt: '2024-01-15T10:00:00Z',
        totalDurationSeconds: 300,
        regionsCompleted: 5,
        regionsSkipped: 1,
        stretches: [],
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', sessionData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('session-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent session', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('findInDateRange', () => {
    it('should return sessions within date range', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-1', data: { completedAt: '2024-01-15T10:00:00Z', totalDurationSeconds: 300, regionsCompleted: 5, regionsSkipped: 0, stretches: [] } },
        { id: 's-2', data: { completedAt: '2024-01-20T10:00:00Z', totalDurationSeconds: 250, regionsCompleted: 4, regionsSkipped: 1, stretches: [] } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findInDateRange('2024-01-01', '2024-01-31', 0);

      expect(mockCollection.where).toHaveBeenCalledWith('completedAt', '>=', expect.any(String));
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no sessions in range', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findInDateRange('2024-06-01', '2024-06-30', 0);

      expect(result).toEqual([]);
    });

    it('should apply timezone offset to date boundaries', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      await repository.findInDateRange('2024-01-15', '2024-01-15', 300); // EST offset

      expect(mockCollection.where).toHaveBeenCalled();
    });

    it('should use default timezone offset of 0', async () => {
      const repository = new StretchSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      await repository.findInDateRange('2024-01-15', '2024-01-31');

      expect(mockCollection.where).toHaveBeenCalled();
    });
  });
});
