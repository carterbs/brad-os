import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('MeditationSessionRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let MeditationSessionRepository: typeof import('./meditationSession.repository.js').MeditationSessionRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    vi.doMock('node:crypto', () => ({
      randomUUID: vi.fn().mockReturnValue('mock-uuid-5678'),
    }));

    const module = await import('./meditationSession.repository.js');
    MeditationSessionRepository = module.MeditationSessionRepository;
  });

  describe('create', () => {
    it('should create meditation session with generated id', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.create({
        completedAt: '2024-01-15T08:00:00Z',
        sessionType: 'guided',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 600,
        completedFully: true,
      });

      expect(mockCollection.doc).toHaveBeenCalledWith('mock-uuid-5678');
      expect(mockDocRef.set).toHaveBeenCalledWith({
        completedAt: '2024-01-15T08:00:00Z',
        sessionType: 'guided',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 600,
        completedFully: true,
      });
      expect(result.id).toBe('mock-uuid-5678');
    });

    it('should preserve all session data', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.create({
        completedAt: '2024-01-15T08:30:00Z',
        sessionType: 'breathing',
        plannedDurationSeconds: 300,
        actualDurationSeconds: 250,
        completedFully: false,
      });

      expect(result.completedAt).toBe('2024-01-15T08:30:00Z');
      expect(result.sessionType).toBe('breathing');
      expect(result.plannedDurationSeconds).toBe(300);
      expect(result.actualDurationSeconds).toBe(250);
      expect(result.completedFully).toBe(false);
    });

    it('should handle different session types', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.create({
        completedAt: '2024-01-15T09:00:00Z',
        sessionType: 'silent',
        plannedDurationSeconds: 1200,
        actualDurationSeconds: 1200,
        completedFully: true,
      });

      expect(result.sessionType).toBe('silent');
    });

    it('should track completed vs incomplete sessions', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.create({
        completedAt: '2024-01-15T09:30:00Z',
        sessionType: 'guided',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 180,
        completedFully: false,
      });

      expect(result.completedFully).toBe(false);
      expect(result.actualDurationSeconds).toBeLessThan(result.plannedDurationSeconds);
    });
  });

  describe('findById', () => {
    it('should return meditation session when found', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessionData = {
        completedAt: '2024-01-15T08:00:00Z',
        sessionType: 'guided',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 600,
        completedFully: true,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', sessionData));

      const result = await repository.findById('session-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('session-1');
      expect(result).toEqual({
        id: 'session-1',
        ...sessionData,
      });
    });

    it('should return null when meditation session not found', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when session payload is malformed', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockDoc('session-invalid', { completedAt: 123, plannedDurationSeconds: '600' } as unknown as Record<string, unknown>)
      );

      const result = await repository.findById('session-invalid');

      expect(result).toBeNull();
    });
  });

  describe('findLatest', () => {
    it('should return most recent meditation session', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessionData = {
        completedAt: '2024-01-15T08:00:00Z',
        sessionType: 'guided',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 600,
        completedFully: true,
      };

      const mockQuery = createMockQuery(createMockQuerySnapshot([{ id: 'latest-session', data: sessionData }]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findLatest();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('completedAt', 'desc');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('latest-session');
    });

    it('should return null when no sessions exist', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findLatest();

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all sessions ordered by completedAt desc', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-2', data: { completedAt: '2024-01-16T08:00:00Z', sessionType: 'guided', plannedDurationSeconds: 600, actualDurationSeconds: 600, completedFully: true } },
        { id: 's-1', data: { completedAt: '2024-01-15T08:00:00Z', sessionType: 'breathing', plannedDurationSeconds: 300, actualDurationSeconds: 300, completedFully: true } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('completedAt', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no sessions exist', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should skip malformed sessions from list results', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        {
          id: 'valid',
          data: {
            completedAt: '2024-01-15T08:00:00Z',
            sessionType: 'guided',
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true,
          },
        },
        {
          id: 'invalid',
          data: {
            completedAt: '2024-01-16T08:00:00Z',
            sessionType: 'guided',
            plannedDurationSeconds: '600',
            actualDurationSeconds: null,
            completedFully: 'yes',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('valid');
    });
  });

  describe('findInDateRange', () => {
    it('should return sessions within date range', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-1', data: { completedAt: '2024-01-15T08:00:00Z', sessionType: 'guided', plannedDurationSeconds: 600, actualDurationSeconds: 600, completedFully: true } },
        { id: 's-2', data: { completedAt: '2024-01-20T08:00:00Z', sessionType: 'breathing', plannedDurationSeconds: 300, actualDurationSeconds: 300, completedFully: true } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findInDateRange('2024-01-01', '2024-01-31', 0);

      expect(mockCollection.where).toHaveBeenCalledWith('completedAt', '>=', expect.any(String));
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no sessions in range', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findInDateRange('2024-06-01', '2024-06-30', 0);

      expect(result).toEqual([]);
    });

    it('should apply timezone offset to date boundaries', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      await repository.findInDateRange('2024-01-15', '2024-01-15', 300); // EST offset

      expect(mockCollection.where).toHaveBeenCalled();
    });

    it('should use default timezone offset of 0', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      await repository.findInDateRange('2024-01-15', '2024-01-31');

      expect(mockCollection.where).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return aggregate statistics', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-1', data: { completedAt: '2024-01-15T08:00:00Z', sessionType: 'guided', plannedDurationSeconds: 600, actualDurationSeconds: 600, completedFully: true } },
        { id: 's-2', data: { completedAt: '2024-01-16T08:00:00Z', sessionType: 'breathing', plannedDurationSeconds: 300, actualDurationSeconds: 300, completedFully: true } },
        { id: 's-3', data: { completedAt: '2024-01-17T08:00:00Z', sessionType: 'silent', plannedDurationSeconds: 1200, actualDurationSeconds: 1200, completedFully: true } },
      ];

      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockQuerySnapshot(sessions));

      const result = await repository.getStats();

      expect(result.totalSessions).toBe(3);
      expect(result.totalMinutes).toBe(35); // (600 + 300 + 1200) / 60 = 35
    });

    it('should return zero stats when no sessions', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockQuerySnapshot([]));

      const result = await repository.getStats();

      expect(result.totalSessions).toBe(0);
      expect(result.totalMinutes).toBe(0);
    });

    it('should floor total minutes', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-1', data: { completedAt: '2024-01-15T08:00:00Z', sessionType: 'guided', plannedDurationSeconds: 90, actualDurationSeconds: 90, completedFully: true } },
      ];

      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockQuerySnapshot(sessions));

      const result = await repository.getStats();

      expect(result.totalMinutes).toBe(1); // 90 / 60 = 1.5, floored to 1
    });

    it('should handle sessions with zero duration', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 's-1', data: { completedAt: '2024-01-15T08:00:00Z', sessionType: 'guided', plannedDurationSeconds: 600, actualDurationSeconds: 0, completedFully: false } },
      ];

      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockQuerySnapshot(sessions));

      const result = await repository.getStats();

      expect(result.totalSessions).toBe(1);
      expect(result.totalMinutes).toBe(0);
    });

    it('should ignore malformed sessions when computing stats', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessions = [
        { id: 'good', data: { completedAt: '2024-01-15T08:00:00Z', sessionType: 'guided', plannedDurationSeconds: 600, actualDurationSeconds: 600, completedFully: true } },
        { id: 'bad', data: { completedAt: '2024-01-16T08:00:00Z', sessionType: 'breathing', plannedDurationSeconds: '600', actualDurationSeconds: 600, completedFully: true } },
      ];

      (mockCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockQuerySnapshot(sessions));

      const result = await repository.getStats();

      expect(result).toEqual({
        totalSessions: 1,
        totalMinutes: 10,
      });
    });
  });

  describe('delete', () => {
    it('should delete existing session and return true', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      const sessionData = {
        completedAt: '2024-01-15T08:00:00Z',
        sessionType: 'guided',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 600,
        completedFully: true,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', sessionData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('session-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent session', async () => {
      const repository = new MeditationSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
