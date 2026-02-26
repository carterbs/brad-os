import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';
import type {
  GuidedMeditationScript,
  GuidedMeditationCategory,
  CreateGuidedMeditationScriptDTO,
  GuidedMeditationSegment,
  GuidedMeditationInterjection,
} from '../shared.js';

describe('GuidedMeditationRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let GuidedMeditationRepository: typeof import('./guided-meditation.repository.js').GuidedMeditationRepository;
  let randomUUIDMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    let generatedCount = 0;
    randomUUIDMock = vi.fn(() => `segment-id-${++generatedCount}`);
    vi.doMock('crypto', () => ({
      randomUUID: randomUUIDMock,
    }));

    const module = await import('./guided-meditation.repository.js');
    GuidedMeditationRepository = module.GuidedMeditationRepository;
  });

  describe('create', () => {
    it('should write full script payload with timestamps and generated segment ids', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'script-id-1' });

      const segments: Omit<GuidedMeditationSegment, 'id'>[] = [
        {
          startSeconds: 0,
          text: 'Breathe in',
          phase: 'opening',
        },
        {
          startSeconds: 30,
          text: 'Hold',
          phase: 'teachings',
        },
      ];
      const interjections: GuidedMeditationInterjection[] = [
        {
          windowStartSeconds: 10,
          windowEndSeconds: 20,
          textOptions: ['A', 'B'],
        },
      ];
      const payload: CreateGuidedMeditationScriptDTO = {
        category: 'morning',
        title: 'Calm Start',
        subtitle: 'Gentle opening',
        orderIndex: 1,
        durationSeconds: 120,
        segments,
        interjections,
      };

      const result = await repository.create(payload);

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'morning',
          title: 'Calm Start',
          subtitle: 'Gentle opening',
          orderIndex: 1,
          durationSeconds: 120,
          segments: [
            {
              startSeconds: 0,
              text: 'Breathe in',
              phase: 'opening',
              id: 'segment-id-1',
            },
            {
              startSeconds: 30,
              text: 'Hold',
              phase: 'teachings',
              id: 'segment-id-2',
            },
          ],
          interjections,
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).toEqual({
        id: 'script-id-1',
        category: 'morning',
        title: 'Calm Start',
        subtitle: 'Gentle opening',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [
          {
            id: 'segment-id-1',
            startSeconds: 0,
            text: 'Breathe in',
            phase: 'opening',
          },
          {
            id: 'segment-id-2',
            startSeconds: 30,
            text: 'Hold',
            phase: 'teachings',
          },
        ],
        interjections,
        created_at: expect.any(String) as unknown as string,
        updated_at: expect.any(String) as unknown as string,
      } as GuidedMeditationScript);
      expect(randomUUIDMock).toHaveBeenCalledTimes(2);
    });

    it('should write matching created and updated timestamps', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'script-id-2' });

      await repository.create({
        category: 'focus',
        title: 'Focus Wave',
        subtitle: 'Attention',
        orderIndex: 2,
        durationSeconds: 60,
        segments: [],
        interjections: [],
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
    });
  });

  describe('findAll', () => {
    it('should order scripts by orderIndex and map documents', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts = [
        {
          id: 'script-1',
          data: {
            category: 'focus',
            title: 'Focus',
            subtitle: 'Stay',
            orderIndex: 1,
            durationSeconds: 200,
            segments: [],
            interjections: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'script-2',
          data: {
            category: 'focus',
            title: 'Focus 2',
            subtitle: 'Again',
            orderIndex: 2,
            durationSeconds: 300,
            segments: [],
            interjections: [],
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];
      const mockQuery = createMockQuery(createMockQuerySnapshot(scripts));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('orderIndex');
      expect(result).toEqual([
        {
          id: 'script-1',
          category: 'focus',
          title: 'Focus',
          subtitle: 'Stay',
          orderIndex: 1,
          durationSeconds: 200,
          segments: [],
          interjections: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'script-2',
          category: 'focus',
          title: 'Focus 2',
          subtitle: 'Again',
          orderIndex: 2,
          durationSeconds: 300,
          segments: [],
          interjections: [],
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ]);
    });

    it('should return an empty array when no scripts exist', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should skip malformed scripts when listing all scripts', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts = [
        {
          id: 'valid',
          data: {
            category: 'focus',
            title: 'Focus',
            subtitle: 'Breath',
            orderIndex: 1,
            durationSeconds: 120,
            segments: [{ id: 'seg', startSeconds: 0, text: 'Breathe', phase: 'opening' }],
            interjections: [{ windowStartSeconds: 0, windowEndSeconds: 10, textOptions: ['calm'] }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'invalid',
          data: {
            category: 'focus',
            title: 'Broken',
            subtitle: 'Bad segment',
            orderIndex: 2,
            durationSeconds: 90,
            segments: ['not-a-segment'],
            interjections: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(scripts));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('valid');
    });
  });

  describe('findAllByCategory', () => {
    it('should filter by category, order by orderIndex, and project lightweight fields', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts = [
        {
          id: 'a',
          data: {
            category: 'focus',
            title: 'Focus One',
            subtitle: 'Alpha',
            orderIndex: 1,
            durationSeconds: 120,
            segments: [{ id: 'seg', startSeconds: 0, text: 'x', phase: 'opening' }],
            interjections: [{ windowStartSeconds: 0, windowEndSeconds: 5, textOptions: ['a'] }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'b',
          data: {
            category: 'focus',
            title: 'Focus Two',
            subtitle: 'Beta',
            orderIndex: 2,
            durationSeconds: 180,
            segments: [{ id: 'seg2', startSeconds: 10, text: 'y', phase: 'closing' }],
            interjections: [],
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];
      const mockQuery = createMockQuery(createMockQuerySnapshot(scripts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAllByCategory('focus');

      expect(mockCollection.where).toHaveBeenCalledWith('category', '==', 'focus');
      expect(mockQuery.orderBy).toHaveBeenCalledWith('orderIndex');
      expect(result).toEqual([
        {
          id: 'a',
          category: 'focus',
          title: 'Focus One',
          subtitle: 'Alpha',
          orderIndex: 1,
          durationSeconds: 120,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'b',
          category: 'focus',
          title: 'Focus Two',
          subtitle: 'Beta',
          orderIndex: 2,
          durationSeconds: 180,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ] as Omit<GuidedMeditationScript, 'segments' | 'interjections'>[]);
      expect((result[0] as Record<string, unknown>)).not.toHaveProperty('segments');
      expect((result[0] as Record<string, unknown>)).not.toHaveProperty('interjections');
    });

    it('should skip malformed scripts in category results', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts = [
        {
          id: 'good',
          data: {
            category: 'focus',
            title: 'Focus',
            subtitle: 'Stay',
            orderIndex: 1,
            durationSeconds: 100,
            segments: [],
            interjections: [{ windowStartSeconds: 0, windowEndSeconds: 1, textOptions: ['a'] }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'bad',
          data: {
            category: 'focus',
            title: 'Focus',
            subtitle: 'Bad',
            orderIndex: 2,
            durationSeconds: 100,
            segments: [],
            interjections: [{ windowStartSeconds: 0, windowEndSeconds: 1, textOptions: [1] }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(scripts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAllByCategory('focus');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('good');
    });
  });

  describe('getCategories', () => {
    it('should aggregate unique categories with script counts', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts = [
        { id: 'a', data: { category: 'focus' } },
        { id: 'b', data: { category: 'focus' } },
        { id: 'c', data: { category: 'sleep' } },
      ];
      const mockSnapshot = createMockQuerySnapshot(scripts);
      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSnapshot);

      const result = await repository.getCategories();

      expect(mockCollection.get).toHaveBeenCalled();
      expect(result).toEqual([
        {
          id: 'focus',
          name: 'focus',
          scriptCount: 2,
        },
        {
          id: 'sleep',
          name: 'sleep',
          scriptCount: 1,
        },
      ] as GuidedMeditationCategory[]);
    });

    it('should return an empty array when no scripts exist', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const mockSnapshot = createMockQuerySnapshot([]);
      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSnapshot);

      const result = await repository.getCategories();

      expect(result).toEqual([]);
    });

    it('should skip invalid category payloads when aggregating', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts = [
        { id: 'a', data: { category: 'focus' } },
        { id: 'b', data: { category: 2 as unknown } },
        { id: 'c', data: {} },
      ];
      const mockSnapshot = createMockQuerySnapshot(scripts);
      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSnapshot);

      const result = await repository.getCategories();

      expect(result).toEqual([
        {
          id: 'focus',
          name: 'focus',
          scriptCount: 1,
        },
      ]);
    });
  });

  describe('update', () => {
    it('should return null when updating a missing script', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.update('missing', {
        title: 'Nope',
      });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing script when no fields are provided', async () => {
      const existing: GuidedMeditationScript = {
        id: 'script-1',
        category: 'focus',
        title: 'Focus',
        subtitle: 'One',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [{ id: 'seg-1', startSeconds: 0, text: 'x', phase: 'opening' }],
        interjections: [{ windowStartSeconds: 0, windowEndSeconds: 1, textOptions: ['a'] }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockDoc('script-1', existing));

      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const result = await repository.update('script-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('should update scalar and segment fields, regenerating segment ids', async () => {
      const existing: GuidedMeditationScript = {
        id: 'script-1',
        category: 'focus',
        title: 'Focus',
        subtitle: 'One',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [{ id: 'seg-old', startSeconds: 0, text: 'x', phase: 'opening' }],
        interjections: [{ windowStartSeconds: 0, windowEndSeconds: 1, textOptions: ['a'] }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const updated: GuidedMeditationScript = {
        id: 'script-1',
        category: 'focus',
        title: 'Evening',
        subtitle: 'Updated',
        orderIndex: 3,
        durationSeconds: 150,
        segments: [{ id: 'segment-id-1', startSeconds: 15, text: 'y', phase: 'closing' }],
        interjections: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: expect.any(String) as unknown as string,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('script-1', existing))
        .mockResolvedValueOnce(createMockDoc('script-1', {
          ...updated,
          updated_at: '2024-01-02T00:00:00Z',
        }));

      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const result = await repository.update('script-1', {
        title: 'Evening',
        orderIndex: 3,
        durationSeconds: 150,
        subtitle: 'Updated',
        interjections: [],
        segments: [{ startSeconds: 15, text: 'y', phase: 'closing' }],
      });
      if (result === null) {
        throw new Error('Expected repository.update to return a script when script exists');
      }

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Evening',
          orderIndex: 3,
          durationSeconds: 150,
          subtitle: 'Updated',
          interjections: [],
          segments: [
            {
              id: 'segment-id-1',
              startSeconds: 15,
              text: 'y',
              phase: 'closing',
            },
          ],
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result.title).toBe('Evening');
      expect(result.updated_at).toBe('2024-01-02T00:00:00Z');
      expect(result.segments[0].id).toBe('segment-id-1');
      expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    });

    it('should update scalar fields only without regenerating segment ids when segments are not provided', async () => {
      const existing: GuidedMeditationScript = {
        id: 'script-1',
        category: 'focus',
        title: 'Focus',
        subtitle: 'One',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [{ id: 'seg-old', startSeconds: 0, text: 'x', phase: 'opening' }],
        interjections: [{ windowStartSeconds: 0, windowEndSeconds: 1, textOptions: ['a'] }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const updated: GuidedMeditationScript = {
        id: 'script-1',
        category: 'focus',
        title: 'Updated Title',
        subtitle: 'One',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [{ id: 'seg-old', startSeconds: 0, text: 'x', phase: 'opening' }],
        interjections: [{ windowStartSeconds: 0, windowEndSeconds: 1, textOptions: ['a'] }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: expect.any(String) as unknown as string,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('script-1', existing))
        .mockResolvedValueOnce(createMockDoc('script-1', {
          ...updated,
          updated_at: '2024-01-02T00:00:00Z',
        }));

      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const initialCallCount = randomUUIDMock.mock.calls.length;

      const result = await repository.update('script-1', {
        title: 'Updated Title',
      });
      if (result === null) {
        throw new Error('Expected repository.update to return a script when script exists');
      }

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result.title).toBe('Updated Title');
      expect(result.segments[0].id).toBe('seg-old');
      // Verify no new UUIDs were generated for this scalar-only update
      expect(randomUUIDMock.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('seed', () => {
    it('should batch write scripts with timestamps and segment ids', async () => {
      const mockBatch = {
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      const seededDocRefs = [{ id: 'seed-id-1' }, { id: 'seed-id-2' }];
      let docCall = 0;
      const seededQuery = seededDocRefs;
      mockCollection.doc = vi.fn().mockImplementation(() => {
        const docRef = seededQuery[docCall];
        docCall += 1;
        return docRef;
      });

      mockDb.batch = vi.fn().mockReturnValue(mockBatch);

      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const scripts: CreateGuidedMeditationScriptDTO[] = [
        {
          category: 'focus',
          title: 'Seeded 1',
          subtitle: 'alpha',
          orderIndex: 1,
          durationSeconds: 180,
          segments: [{ startSeconds: 0, text: 'start', phase: 'opening' }],
          interjections: [{ windowStartSeconds: 0, windowEndSeconds: 10, textOptions: ['a'] }],
        },
        {
          category: 'focus',
          title: 'Seeded 2',
          subtitle: 'beta',
          orderIndex: 2,
          durationSeconds: 220,
          segments: [
            { startSeconds: 0, text: 'intro', phase: 'opening' },
            { startSeconds: 50, text: 'close', phase: 'closing' },
          ],
          interjections: [],
        },
      ];

      const result = await repository.seed(scripts);

      expect(mockDb.batch).toHaveBeenCalledTimes(1);
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(mockBatch.set).toHaveBeenNthCalledWith(
        1,
        seededDocRefs[0],
        expect.objectContaining({
          category: 'focus',
          title: 'Seeded 1',
          subtitle: 'alpha',
          orderIndex: 1,
          durationSeconds: 180,
          segments: [{ id: 'segment-id-1', startSeconds: 0, text: 'start', phase: 'opening' }],
          interjections: [{ windowStartSeconds: 0, windowEndSeconds: 10, textOptions: ['a'] }],
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(mockBatch.set).toHaveBeenNthCalledWith(
        2,
        seededDocRefs[1],
        expect.objectContaining({
          category: 'focus',
          title: 'Seeded 2',
          subtitle: 'beta',
          orderIndex: 2,
          durationSeconds: 220,
          segments: [
            { id: 'segment-id-2', startSeconds: 0, text: 'intro', phase: 'opening' },
            { id: 'segment-id-3', startSeconds: 50, text: 'close', phase: 'closing' },
          ],
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).toEqual([
        {
          id: 'seed-id-1',
          category: 'focus',
          title: 'Seeded 1',
          subtitle: 'alpha',
          orderIndex: 1,
          durationSeconds: 180,
          segments: [
            { id: 'segment-id-1', startSeconds: 0, text: 'start', phase: 'opening' },
          ],
          interjections: [{ windowStartSeconds: 0, windowEndSeconds: 10, textOptions: ['a'] }],
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        },
        {
          id: 'seed-id-2',
          category: 'focus',
          title: 'Seeded 2',
          subtitle: 'beta',
          orderIndex: 2,
          durationSeconds: 220,
          segments: [
            { id: 'segment-id-2', startSeconds: 0, text: 'intro', phase: 'opening' },
            { id: 'segment-id-3', startSeconds: 50, text: 'close', phase: 'closing' },
          ],
          interjections: [],
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        },
      ]);
      expect(randomUUIDMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('findById and delete', () => {
    it('should return script by id', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const script: GuidedMeditationScript = {
        id: 'script-1',
        category: 'focus',
        title: 'Focus',
        subtitle: 'One',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [],
        interjections: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('script-1', script));

      const result = await repository.findById('script-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('script-1');
      expect(result).toEqual(script);
    });

    it('should return null when script is not found by id', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.findById('missing');

      expect(result).toBeNull();
    });

    it('should delete an existing script', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      const script = {
        category: 'focus',
        title: 'Focus',
        subtitle: 'One',
        orderIndex: 1,
        durationSeconds: 120,
        segments: [],
        interjections: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('script-1', script));

      const result = await repository.delete('script-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting a missing script', async () => {
      const repository = new GuidedMeditationRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.delete('missing');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
