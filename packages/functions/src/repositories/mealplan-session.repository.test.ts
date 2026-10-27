import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference, Transaction } from 'firebase-admin/firestore';
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
  let transactionGet: ReturnType<typeof vi.fn>;
  let transactionUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    transactionGet = vi.fn();
    transactionUpdate = vi.fn();
    mockDb.runTransaction = vi.fn(async (callback: (transaction: Transaction) => Promise<unknown>): Promise<unknown> =>
      callback({ get: transactionGet, update: transactionUpdate } as unknown as Transaction)
    ) as unknown as Firestore['runTransaction'];

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
          audience: 'family',
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
          meal_track: 'family',
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

    it('should keep sessions whose meal snapshots contain null urls', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const sessions: Array<{ id: string; data: Record<string, unknown> }> = [
        {
          id: 'session-with-null-url',
          data: {
            plan: [
              {
                day_index: 0,
                meal_track: 'family',
                meal_type: 'breakfast',
                meal_id: 'meal-1',
                meal_name: 'Oatmeal',
              },
            ],
            meals_snapshot: [
              {
                id: 'meal-1',
                name: 'Oatmeal',
                meal_type: 'breakfast',
                audience: 'family',
                effort: 2,
                has_red_meat: false,
                prep_ahead: true,
                url: null,
                last_planned: null,
                created_at: '2024-01-02T00:00:00Z',
                updated_at: '2024-01-02T00:00:00Z',
              },
            ],
            history: [],
            is_finalized: false,
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];
      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.meals_snapshot[0]?.url).toBeNull();
    });
  });

  describe('findLatest', () => {
    it('should order descending and limit the query to one session', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const sessions = [
        {
          id: 'latest-session',
          data: {
            plan: [],
            meals_snapshot: [],
            history: [],
            is_finalized: true,
            created_at: '2026-07-26T00:00:00Z',
            updated_at: '2026-07-26T00:00:00Z',
          },
        },
      ];
      const mockQuery = createMockQuery(createMockQuerySnapshot(sessions));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findLatest();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockQuery.limit).toHaveBeenCalledWith(1);
      expect(result?.id).toBe('latest-session');
    });

    it('should return null when no session exists', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findLatest();

      expect(result).toBeNull();
    });
  });

  describe('appendHistory', () => {
    it('should return null and avoid update when session missing', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('missing', null));

      const result = await repository.appendHistory('missing', {
        role: 'user',
        content: 'new note',
      });

      expect(result).toBeNull();
      expect(transactionUpdate).not.toHaveBeenCalled();
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it('should append a repeated message without deduplicating conversation turns', async () => {
      const existing: MealPlanSession = {
        id: 'session-1',
        plan: [],
        meals_snapshot: [],
        history: [
          { role: 'user', content: 'initial message', operations: [{ day_index: 0, meal_track: 'family', meal_type: 'lunch', new_meal_id: null }] },
        ],
        is_finalized: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const message: ConversationMessage = {
        role: 'user',
        content: 'initial message',
        operations: [{ day_index: 0, meal_track: 'family', meal_type: 'lunch', new_meal_id: null }],
      };
      const refreshed: MealPlanSession = {
        ...existing,
        history: [
          ...existing.history,
          message,
        ],
        updated_at: existing.updated_at,
      };
      transactionGet.mockResolvedValue(createMockDoc('session-1', existing));

      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const result = await repository.appendHistory('session-1', message);

      expect(mockDb.runTransaction).toHaveBeenCalledTimes(1);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, {
        history: refreshed.history,
        updated_at: existing.updated_at,
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-1',
          history: refreshed.history,
          updated_at: existing.updated_at,
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
          meal_track: 'family',
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
            meal_track: 'family',
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
          meal_track: 'family',
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
    const userMessage: ConversationMessage = { role: 'user', content: 'adjust lunch' };
    const assistantMessage: ConversationMessage = { role: 'assistant', content: 'done' };
    const expectedSession: MealPlanSession = {
      id: 'session-1', plan: [], meals_snapshot: [], history: [userMessage, assistantMessage],
      is_finalized: false, created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z',
    };
    const updatedPlan: MealPlanEntry[] = [{
      day_index: 1, meal_track: 'family', meal_type: 'lunch', meal_id: 'meal-2', meal_name: 'Salad',
    }];

    it('atomically saves the plan and preserves repeated identical user and assistant turns', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('session-1', expectedSession));
      const saved = await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, expectedSession);
      expect(saved).toBe(true);
      expect(mockDb.runTransaction).toHaveBeenCalledTimes(1);
      expect(transactionGet).toHaveBeenCalledWith(mockDocRef);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, {
        history: [userMessage, assistantMessage, userMessage, assistantMessage],
        plan: updatedPlan,
        updated_at: expect.any(String) as unknown as string,
      });
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it.each([
      { updated_at: '2026-09-20T00:01:00Z' },
      { is_finalized: true },
      { history: [...expectedSession.history, userMessage] },
      { plan: updatedPlan },
    ])('rejects a changed session without overwriting any state: %j', async (change) => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('session-1', { ...expectedSession, ...change }));
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, expectedSession)).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('rejects a deleted session without resurrecting it', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('session-1', null));
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, expectedSession)).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('reads stored context and appends the next turn without losing evidence or causing a false conflict', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const priorMessage: ConversationMessage = {
        role: 'user', content: 'Revise this week',
        context: { original_request: 'Dinner out Tuesday', interpretation: 'Tuesday dinner empty', calendar_context: 'Reservation Tuesday at 6', planning_week_start: '2026-09-21' },
      };
      const stored = { ...expectedSession, history: [priorMessage, assistantMessage] };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', stored));
      const loaded = await repository.findById('session-1');
      expect(loaded?.history[0]).toEqual(priorMessage);
      expect(loaded).not.toBeNull();
      if (loaded === null) throw new Error('Expected stored session');
      transactionGet.mockResolvedValue(createMockDoc('session-1', stored));
      const nextMessage: ConversationMessage = { role: 'user', content: 'Keep breakfast', context: { original_request: 'Keep breakfast unchanged' } };
      expect(await repository.applyCritiqueUpdates('session-1', nextMessage, assistantMessage, updatedPlan, loaded)).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({
        history: [priorMessage, assistantMessage, nextMessage, assistantMessage],
      }));
    });

    it('round trips pre-edit slot identity and preserves it through another critique', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const historicalAssistant: ConversationMessage = {
        ...assistantMessage,
        operations: [{ day_index: 1, meal_track: 'family', meal_type: 'lunch', new_meal_id: 'meal-next' }],
        previous_assignments: updatedPlan,
      };
      const stored = { ...expectedSession, history: [userMessage, historicalAssistant] };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', stored));
      const loaded = await repository.findById('session-1');
      expect(loaded?.history[1]?.previous_assignments).toEqual(updatedPlan);
      expect(loaded).not.toBeNull();
      if (loaded === null) throw new Error('Expected stored session');
      transactionGet.mockResolvedValue(createMockDoc('session-1', stored));
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, loaded)).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({ history: [...stored.history, userMessage, assistantMessage] }));
    });

    it.each([{ previousAssignments: 'not an array' }, { previousAssignments: [{ day_index: 99, meal_id: 'missing fields' }] }])('rejects invalid previous assignments: %j', async ({ previousAssignments }) => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const stored = { ...expectedSession, history: [{ ...assistantMessage, previous_assignments: previousAssignments }] };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('session-1', stored));
      expect(await repository.findById('session-1')).toBeNull();
    });

    it('rejects a session whose context changed while the model was evaluating', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const prior = { ...expectedSession, history: [{ ...userMessage, context: { original_request: 'Keep breakfast' } }] };
      const current = { ...prior, history: [{ ...userMessage, context: { original_request: 'Replace breakfast' } }] };
      transactionGet.mockResolvedValue(createMockDoc('session-1', current));
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, prior)).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('saves a finalized revision while preserving finalization', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const finalizedSession = { ...expectedSession, is_finalized: true };
      transactionGet.mockResolvedValue(createMockDoc('session-1', finalizedSession));
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, finalizedSession)).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, expect.not.objectContaining({ is_finalized: false }));
    });

    it.each([false, true])('preserves the planning timestamp for history-only turns (finalized=%s)', async (isFinalized) => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const original = { ...expectedSession, plan: updatedPlan, is_finalized: isFinalized };
      transactionGet.mockResolvedValue(createMockDoc('session-1', original));

      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan.map((entry) => ({ ...entry })), original)).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, {
        history: [...original.history, userMessage, assistantMessage],
        plan: original.plan,
        updated_at: original.updated_at,
      });

      transactionGet.mockResolvedValue(createMockDoc('session-1', {
        ...original, history: [...original.history, userMessage, assistantMessage],
      }));
      transactionUpdate.mockClear();
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, original)).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('advances the planning timestamp when a saved assignment actually changes', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('session-1', expectedSession));
      expect(await repository.applyCritiqueUpdates('session-1', userMessage, assistantMessage, updatedPlan, expectedSession)).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({
        updated_at: expect.not.stringMatching(/^2026-09-20T00:00:00Z$/),
      }));
    });
  });

  describe('finalize', () => {
    const expectedSession: MealPlanSession = {
      id: 'session-1', plan: [{ day_index: 0, meal_track: 'family', meal_type: 'dinner', meal_id: 'meal-1', meal_name: 'Original dinner' }],
      meals_snapshot: [], history: [], is_finalized: false,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    const mealData = {
      name: 'Original dinner', meal_type: 'dinner', audience: 'family', effort: 3,
      has_red_meat: false, prep_ahead: false, url: null, last_planned: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    let mealRefs: Map<string, DocumentReference>;
    let mealDoc: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mealRefs = new Map();
      mealDoc = vi.fn((id: string) => {
        const ref = { id } as DocumentReference;
        mealRefs.set(id, ref);
        return ref;
      });
      (mockDb.collection as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
        name === 'test_meals' ? { doc: mealDoc } : mockCollection
      );
      transactionGet.mockImplementation(async (ref: DocumentReference) =>
        createMockDoc(ref.id, ref.id === 'missing' ? null : ref.id === 'invalid' ? { name: 'Invalid meal' } : mealData)
      );
    });

    it('finalizes only active meal recency while retaining disabled legacy assignments', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const adult = { day_index: 0, meal_track: 'adult' as const, meal_type: 'breakfast' as const, meal_id: 'adult', meal_name: 'Protein oats' };
      const original = { ...expectedSession, plan: [...expectedSession.plan, adult] };
      transactionGet.mockResolvedValueOnce(createMockDoc('session-1', original));
      const finalized = await repository.finalize('session-1', original, ['meal-1']);
      expect(finalized?.plan).toEqual(original.plan);
      expect(finalized?.is_finalized).toBe(true);
      expect(mealDoc).not.toHaveBeenCalledWith('adult');
      expect(transactionUpdate).toHaveBeenCalledTimes(2);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, expect.not.objectContaining({ plan: expect.anything() }));
    });

    it('atomically finalizes the exact reviewed snapshot and returns its committed timestamp', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValueOnce(createMockDoc('session-1', expectedSession));
      const finalized = await repository.finalize('session-1', expectedSession);
      expect(finalized).toEqual({ ...expectedSession, is_finalized: true, updated_at: expect.any(String) });
      expect(finalized?.updated_at).not.toBe(expectedSession.updated_at);
      expect(transactionUpdate).toHaveBeenCalledWith(mockDocRef, {
        is_finalized: true, updated_at: finalized?.updated_at,
      });
      expect(transactionUpdate).toHaveBeenCalledWith(mealRefs.get('meal-1'), {
        last_planned: finalized?.updated_at, updated_at: finalized?.updated_at,
      });
      expect(mockDb.collection).toHaveBeenCalledWith('test_meals');
      expect(Math.max(...transactionGet.mock.invocationCallOrder)).toBeLessThan(Math.min(...transactionUpdate.mock.invocationCallOrder));
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it('updates unique present meals only, preserving missing and invalid meal semantics', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const original = { ...expectedSession, plan: [
        ...expectedSession.plan,
        { ...expectedSession.plan[0]!, day_index: 1 },
        { ...expectedSession.plan[0]!, day_index: 2, meal_id: null, meal_name: null },
        { ...expectedSession.plan[0]!, day_index: 3, meal_id: 'missing' },
        { ...expectedSession.plan[0]!, day_index: 4, meal_id: 'invalid' },
      ] };
      transactionGet.mockResolvedValueOnce(createMockDoc('session-1', original));
      expect(await repository.finalize('session-1', original)).not.toBeNull();
      expect(mealDoc.mock.calls.map(([id]) => id)).toEqual(['meal-1', 'missing', 'invalid']);
      expect(transactionUpdate).toHaveBeenCalledTimes(2);
      expect(transactionUpdate).not.toHaveBeenCalledWith(mealRefs.get('missing'), expect.anything());
      expect(transactionUpdate).not.toHaveBeenCalledWith(mealRefs.get('invalid'), expect.anything());
    });

    it('does not stage finalization or recency writes if a meal read fails', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValueOnce(createMockDoc('session-1', expectedSession)).mockRejectedValueOnce(new Error('Meal read failed'));
      await expect(repository.finalize('session-1', expectedSession)).rejects.toThrow('Meal read failed');
      expect(transactionUpdate).not.toHaveBeenCalled();
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it('keeps session and recency writes inside the same transaction if commit fails', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValueOnce(createMockDoc('session-1', expectedSession));
      (mockDb.runTransaction as ReturnType<typeof vi.fn>).mockImplementationOnce(async (callback: (transaction: Transaction) => Promise<unknown>): Promise<unknown> => {
        await callback({ get: transactionGet, update: transactionUpdate } as unknown as Transaction);
        throw new Error('Atomic commit failed');
      });
      await expect(repository.finalize('session-1', expectedSession)).rejects.toThrow('Atomic commit failed');
      expect(transactionUpdate).toHaveBeenCalledTimes(2);
      expect(mockDocRef.update).not.toHaveBeenCalled();
    });

    it.each([
      { updated_at: '2026-01-01T00:01:00Z' },
      { is_finalized: true },
      { history: [{ role: 'user', content: 'New feedback', context: { original_request: 'Keep dinner' } }] },
      { plan: [{ ...expectedSession.plan[0], meal_id: 'meal-2', meal_name: 'Different dinner' }] },
    ])('rejects concurrent changes before finalization: %j', async (change) => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('session-1', { ...expectedSession, ...change }));
      expect(await repository.finalize('session-1', expectedSession)).toBeNull();
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('rejects deletion without recreating the session', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      transactionGet.mockResolvedValue(createMockDoc('session-1', null));
      expect(await repository.finalize('session-1', expectedSession)).toBeNull();
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not finalize an already finalized expected snapshot twice', async () => {
      const repository = new MealPlanSessionRepository(mockDb as Firestore);
      const finalized = { ...expectedSession, is_finalized: true };
      transactionGet.mockResolvedValue(createMockDoc('session-1', finalized));
      expect(await repository.finalize('session-1', finalized)).toBeNull();
      expect(transactionUpdate).not.toHaveBeenCalled();
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

// Legacy cases explicitly exercise the enabled feature.
beforeEach(() => vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'true'));
afterEach(() => vi.unstubAllEnvs());
