import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';
import type { StretchRegion } from '../types/stretch.js';

describe('StretchRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let StretchRepository: typeof import('./stretch.repository.js').StretchRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDocRef = mocks.mockDocRef;
    mockCollection = mocks.mockCollection;

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
      batch: vi.fn().mockReturnValue({
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      }),
    };
    mocks.mockDb = mockDb;

    setupFirebaseMock(mocks);

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
            stretches: [{ id: 'back-childs-pose', name: "Child's Pose", description: 'Kneel...', bilateral: false, image: null }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'neck',
          data: {
            region: 'neck',
            displayName: 'Neck',
            iconName: 'figure.head',
            stretches: [{ id: 'neck-rotation', name: 'Neck Rotation', description: 'Slowly...', bilateral: true, image: null }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
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
        stretches: [
          {
            id: 'back-childs-pose',
            name: "Child's Pose",
            description: 'Kneel...',
            bilateral: false,
            image: null,
          },
        ],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
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

  describe('create', () => {
    it('should persist region using region as document id', async () => {
      const repo = new StretchRepository(mockDb as Firestore);
      const input = {
        region: 'back',
        displayName: 'Back',
        iconName: 'figure.flexibility',
        stretches: [
          {
            id: 'back-childs-pose',
            name: "Child's Pose",
            description: 'Kneel...',
            bilateral: false,
            image: null,
          },
        ],
      };

      const result = await repo.create(input);

      expect(mockCollection.doc).toHaveBeenCalledWith('back');
      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'back',
          displayName: 'Back',
          iconName: 'figure.flexibility',
          stretches: input.stretches,
          created_at: expect.any(String),
          updated_at: expect.any(String),
        })
      );
      expect(result).toEqual({
        id: 'back',
        region: 'back',
        displayName: 'Back',
        iconName: 'figure.flexibility',
        stretches: [
          {
            id: 'back-childs-pose',
            name: "Child's Pose",
            description: 'Kneel...',
            bilateral: false,
            image: null,
          },
        ],
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });
  });

  describe('update', () => {
    it('should update stretch region and return refreshed doc', async () => {
      const existing: StretchRegion = {
        id: 'back',
        region: 'back',
        displayName: 'Back',
        iconName: 'figure.flexibility',
        stretches: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('back', existing))
        .mockResolvedValueOnce(
          createMockDoc('back', {
            region: 'back',
            displayName: 'Core Back',
            iconName: 'figure.flexibility',
            stretches: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          })
        );

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.update('back', {
        displayName: 'Core Back',
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Core Back',
          updated_at: expect.any(String),
        })
      );
      expect(result).not.toBeNull();
      expect(result?.displayName).toBe('Core Back');
      expect(result?.updated_at).toBe('2024-01-02T00:00:00Z');
    });
  });

  describe('delete', () => {
    it('should return true when deleting an existing region', async () => {
      const existing: StretchRegion = {
        id: 'back',
        region: 'back',
        displayName: 'Back',
        iconName: 'figure.flexibility',
        stretches: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('back', existing));

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.delete('back');

      expect(mockDocRef.delete).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('should return false when deleting a missing region', async () => {
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const repo = new StretchRepository(mockDb as Firestore);
      const result = await repo.delete('missing');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
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
