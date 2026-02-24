import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuery,
  createMockQuerySnapshot,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';
import type {
  MealPlanSession,
  MealPlanEntry,
  ConversationMessage,
  Meal,
} from '../shared.js';

describe('MealPlanSessionRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let MealPlanSessionRepository: typeof import('./mealplan-session.repository.js').MealPlanSessionRepository;
  let fieldValueArrayUnionMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    fieldValueArrayUnionMock = vi.fn();
    vi.doMock('firebase-admin/firestore', () => ({
      FieldValue: {
        arrayUnion: fieldValueArrayUnionMock,
      },
    }));

    const module = await import('./mealplan-session.repository.js');
    MealPlanSessionRepository = module.MealPlanSessionRepository;
  });

  describe('create', () => {
    it('should create a session with required payload and timestamps', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'session-id' });

      const meals: Meal[] = [
        {
          id: 'meal-1',
          name: 'Oatmeal',
          meal_type: 'breakfast',
          effort: 2,
          has_red_meat: false,
          prep_ahead: false,
          url: 'https://example.com/oatmeal',
          last_planned: null,
        },
      ];
      const plan: MealPlanEntry[] = [
        {
          day_index: 0,
          meal_type: 'breakfast',
          meal_id: 'meal-1',
          meal_name: 'Oatmeal',
        },
      ];
      const history: ConversationMessage[] = [
        { role: 'assistant', content: 'created plan' },
      ];

      const result = await repository.create({
        plan,
        meals_snapshot: meals,
        history,
        is_finalized: false,
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          plan,
          meals_snapshot: meals,
          history,
          is_finalized: false,
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-id',
          plan,
          meals_snapshot: meals,
          history,
          is_finalized: false,
        })
      );
    });
  });

  describe('findAll', () => {
    it('should return all sessions ordered by created_at descending', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const sessions: Array<{ id: string; data: Record<string, unknown> }> = [
        {
          id: 's1',
          data: {
            plan: [],
            meals_snapshot: [],
            history: [],
            is_finalized: false,
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
        {
          id: 's2',
          data: {
            plan: [],
            meals_snapshot: [],
            history: [],
            is_finalized: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      ];
      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result[0]?.id).toBe('s1');
      expect(result[1]?.id).toBe('s2');
    });

    it('should return empty array when no sessions exist', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('appendHistory', () => {
    it('should return null and avoid update when session missing', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.appendHistory('missing', {
        role: 'user',
        content: 'new note',
      });

      expect(result).toBeNull();
      expect(fieldValueArrayUnionMock).not.toHaveBeenCalled();
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it('should append message with FieldValue.arrayUnion and updated timestamp', async () => {
      const existing: MealPlanSession = {
        id: 'session-1',
        plan: [],
        meals_snapshot: [],
        history: [
          { role: 'assistant', content: 'initial message' },
        ],
        is_finalized: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const message: ConversationMessage = {
        role: 'user',
        content: 'append this',
        operations: [{ day_index: 0, meal_type: 'lunch', new_meal_id: null }],
      };
      const refreshed: MealPlanSession = {
        ...existing,
        history: [
          ...existing.history,
          message,
        ],
        updated_at: '2024-01-02T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('session-1', existing))
        .mockResolvedValueOnce(createMockDoc('session-1', refreshed));
      const arrayUnionPayload = { historyUnion: true };
      fieldValueArrayUnionMock.mockReturnValue(arrayUnionPayload);

      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const result = await repository.appendHistory('session-1', message);

      expect(fieldValueArrayUnionMock).toHaveBeenCalledWith(message);
      expect(mockDocRef.update).toHaveBeenCalledWith({
        history: arrayUnionPayload,
        updated_at: expect.any(String) as unknown as string,
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-1',
          history: refreshed.history,
        })
      );
    });
  });

  describe('updatePlan', () => {
    it('should return null when session is missing', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.updatePlan('missing', [
        {
          day_index: 0,
          meal_type: 'breakfast',
          meal_id: 'meal-1',
          meal_name: 'Oatmeal',
        },
      ]);

      expect(result).toBeNull();
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it('should update plan and updated_at when session exists', async () => {
      const existing: MealPlanSession = {
        id: 'session-1',
        plan: [
          {
            day_index: 0,
            meal_type: 'breakfast',
            meal_id: 'meal-1',
            meal_name: 'Oatmeal',
          },
        ],
        meals_snapshot: [],
        history: [],
        is_finalized: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const updatedPlan: MealPlanEntry[] = [
        {
          day_index: 0,
          meal_type: 'dinner',
          meal_id: 'meal-3',
          meal_name: 'Stir-fry',
        },
      ];
      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('session-1', existing))
        .mockResolvedValueOnce(
          createMockDoc('session-1', {
            ...existing,
            plan: updatedPlan,
            updated_at: '2024-01-02T00:00:00Z',
          })
        );

      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const result = await repository.updatePlan('session-1', updatedPlan);

      expect(mockDocRef.update).toHaveBeenCalledWith({
        plan: updatedPlan,
        updated_at: expect.any(String) as unknown as string,
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-1',
          plan: updatedPlan,
        })
      );
    });
  });

  describe('applyCritiqueUpdates', () => {
    it('should append messages and update plan in one operation', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const userMessage: ConversationMessage = {
        role: 'user',
        content: 'adjust lunch',
      };
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: 'done',
      };
      const updatedPlan: MealPlanEntry[] = [
        {
          day_index: 1,
          meal_type: 'lunch',
          meal_id: 'meal-2',
          meal_name: 'Salad',
        },
      ];
      const unionPayload = { critiqueUnion: true };
      fieldValueArrayUnionMock.mockReturnValue(unionPayload);

      await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan);

      expect(fieldValueArrayUnionMock).toHaveBeenCalledWith(userMessage, assistantMessage);
      expect(mockDocRef.update).toHaveBeenCalledWith({
        history: unionPayload,
        plan: updatedPlan,
        updated_at: expect.any(String) as unknown as string,
      });
      expect(mockCollection.doc).toHaveBeenCalledWith('session-1');
    });
  });

  describe('findById', () => {
    it('should return meal plan session when found', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const session: MealPlanSession = {
        id: 'session-1',
        plan: [],
        meals_snapshot: [],
        history: [],
        is_finalized: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', session));

      const result = await repository.findById('session-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('session-1');
      expect(result).toEqual(session);
    });

    it('should return null when session is missing', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update session fields and updated_at', async () => {
      const existing: MealPlanSession = {
        id: 'session-1',
        plan: [],
        meals_snapshot: [],
        history: [],
        is_finalized: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const payload = {
        is_finalized: true,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('session-1', existing))
        .mockResolvedValueOnce(
          createMockDoc('session-1', {
            ...existing,
            is_finalized: true,
            updated_at: '2024-01-02T00:00:00Z',
          })
        );

      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const result = await repository.update('session-1', payload);

      expect(mockDocRef.update).toHaveBeenCalledWith({
        is_finalized: true,
        updated_at: expect.any(String) as unknown as string,
      });
      expect(result?.is_finalized).toBe(true);
    });

    it('should return null when session missing', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.update('missing', {
        is_finalized: true,
      });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when session exists', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const session: MealPlanSession = {
        id: 'session-1',
        plan: [],
        meals_snapshot: [],
        history: [],
        is_finalized: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', session));

      const result = await repository.delete('session-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when session does not exist', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.delete('missing');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
