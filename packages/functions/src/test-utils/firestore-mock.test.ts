import { describe, it, expect, vi } from 'vitest';
import { createUserScopedFirestoreMocks } from './index.js';

describe('createUserScopedFirestoreMocks', () => {
  it('creates a stable users -> userDoc -> subcollection -> doc mock graph', () => {
    const mocks = createUserScopedFirestoreMocks();
    const { mockDb, mockUsersCollection, mockUserDoc, mockCollection, mockDocRef } = mocks;

    const usersCollectionResult = mockDb.collection?.('users');
    expect(usersCollectionResult).toBe(mockUsersCollection);
    expect(mockUsersCollection.doc).toBeInstanceOf(Function);

    const userDoc = mockUsersCollection.doc?.('user-123');
    expect(userDoc).toBe(mockUserDoc);
    expect(mockUserDoc.collection).toBeInstanceOf(Function);

    const userSubcollection = mockUserDoc.collection?.('activities');
    expect(userSubcollection).toBe(mockCollection);
    expect(mockCollection.doc).toBeInstanceOf(Function);

    const activityDoc = mockCollection.doc?.('activity-1');
    expect(activityDoc).toBe(mockDocRef);
    expect(mockDocRef.collection).toBeInstanceOf(Function);

    const streamsDoc = mockDocRef.collection?.('streams');
    expect(streamsDoc).toBe(mockCollection);
  });

  it('returns query-chain helpers that can be chained and overridden', () => {
    const mocks = createUserScopedFirestoreMocks();
    const { mockCollection, mockQueryChain } = mocks;

    const queryByWhere = mockCollection.where?.('date', '==', '2026-01-01');
    expect(queryByWhere).toBe(mockQueryChain);
    expect(mockQueryChain.where).toHaveBeenCalledTimes(1);
    expect(mockQueryChain.where).toHaveBeenCalledWith('date', '==', '2026-01-01');

    const orderByQuery = mockQueryChain.orderBy?.('date', 'desc');
    expect(orderByQuery).toBe(mockQueryChain);
    expect(mockQueryChain.orderBy).toHaveBeenCalledTimes(1);
    expect(mockQueryChain.orderBy).toHaveBeenCalledWith('date', 'desc');

    const limitQuery = mockQueryChain.limit?.(20);
    expect(limitQuery).toBe(mockQueryChain);
    expect(mockQueryChain.limit).toHaveBeenCalledTimes(1);
    expect(mockQueryChain.limit).toHaveBeenCalledWith(20);

    const customQuery = {
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    };
    mockQueryChain.where.mockReturnValue(customQuery as ReturnType<typeof createUserScopedFirestoreMocks>['mockQueryChain']);

    const overriddenQuery = mockCollection.where?.('isActive', '==', true);
    expect(overriddenQuery).toBe(customQuery);
    expect(mockQueryChain.where).toHaveBeenCalledWith('isActive', '==', true);
  });

  it('wires batch write helpers through mockDb.batch()', () => {
    const mocks = createUserScopedFirestoreMocks();
    const { mockDb, mockBatchSet, mockBatchCommit } = mocks;

    const batch = mockDb.batch?.();
    batch?.set?.('doc-ref' as never, { value: 'test' } as never);
    batch?.commit?.();

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledWith('doc-ref' as never, { value: 'test' } as never);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});
