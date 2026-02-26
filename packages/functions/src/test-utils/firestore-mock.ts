import { vi } from 'vitest';
import type {
  Firestore,
  CollectionReference,
  DocumentReference,
  Query,
} from 'firebase-admin/firestore';

export interface MockDocumentSnapshot {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

export interface MockQueryDocumentSnapshot {
  id: string;
  data: () => Record<string, unknown>;
}

export interface MockQuerySnapshot {
  empty: boolean;
  docs: MockQueryDocumentSnapshot[];
}

export interface MockFirestoreQuery {
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

export function createFirestoreQueryChain(): MockFirestoreQuery {
  const chain: MockFirestoreQuery = {
    get: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };

  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);

  return chain;
}

export function createMockDoc(
  id: string,
  data: Record<string, unknown> | null
): MockDocumentSnapshot {
  return {
    id,
    exists: data !== null,
    data: () => data ?? undefined,
  };
}

export function createMockQuerySnapshot(
  docs: Array<{ id: string; data: Record<string, unknown> }>
): MockQuerySnapshot {
  return {
    empty: docs.length === 0,
    docs: docs.map((doc) => ({
      id: doc.id,
      data: () => doc.data,
    })),
  };
}

export function createMockQuery(snapshot: MockQuerySnapshot): Partial<Query> {
  return {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(snapshot),
  };
}

export interface FirestoreMocks {
  mockDb: Partial<Firestore>;
  mockCollection: Partial<CollectionReference>;
  mockDocRef: Partial<DocumentReference>;
}

export function createFirestoreMocks(): FirestoreMocks {
  const queryChain = createFirestoreQueryChain();

  const mockDocRef: Partial<DocumentReference> = {
    id: 'test-id',
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn() as unknown as DocumentReference['update'],
    delete: vi.fn(),
  };

  const mockCollection: Partial<CollectionReference> = {
    doc: vi.fn().mockReturnValue(mockDocRef),
    add: vi.fn().mockResolvedValue({ id: 'generated-id' }),
    where: queryChain.where as unknown as CollectionReference['where'],
    orderBy: queryChain.orderBy as unknown as CollectionReference['orderBy'],
    limit: queryChain.limit as unknown as CollectionReference['limit'],
    get: queryChain.get as unknown as CollectionReference['get'],
  };

  const mockDb: Partial<Firestore> = {
    collection: vi.fn().mockReturnValue(mockCollection),
  };

  return { mockDb, mockCollection, mockDocRef };
}

export interface UserScopedFirestoreMocks {
  mockDb: Partial<Firestore>;
  mockCollection: Partial<CollectionReference>;
  mockDocRef: Partial<DocumentReference>;
  mockUsersCollection: Partial<CollectionReference>;
  mockUserDoc: Partial<DocumentReference>;
  mockQueryChain: MockFirestoreQuery;
  mockBatchSet: ReturnType<typeof vi.fn>;
  mockBatchCommit: ReturnType<typeof vi.fn>;
}

export function createUserScopedFirestoreMocks(): UserScopedFirestoreMocks {
  const mockBatchSet = vi.fn();
  const mockBatchCommit = vi.fn();
  const mockQueryChain = createFirestoreQueryChain();

  const mockDocRef: Partial<DocumentReference> = {
    id: 'test-doc-id',
    get: mockQueryChain.get as unknown as DocumentReference['get'],
    set: vi.fn(),
    update: vi.fn() as unknown as DocumentReference['update'],
    delete: vi.fn(),
    collection: vi.fn(),
  };

  const mockCollection: Partial<CollectionReference> = {
    doc: vi.fn(() => mockDocRef) as unknown as CollectionReference['doc'],
    where: mockQueryChain.where as unknown as CollectionReference['where'],
    orderBy: mockQueryChain.orderBy as unknown as CollectionReference['orderBy'],
    limit: mockQueryChain.limit as unknown as CollectionReference['limit'],
    get: mockQueryChain.get as unknown as CollectionReference['get'],
  };

  (mockDocRef.collection as ReturnType<typeof vi.fn>).mockReturnValue(
    mockCollection as unknown as CollectionReference
  );

  const mockUserDoc: Partial<DocumentReference> = {
    get: mockQueryChain.get as unknown as DocumentReference['get'],
    set: vi.fn(),
    collection: vi.fn(() => mockCollection as unknown as CollectionReference),
  };

  const mockUsersCollection: Partial<CollectionReference> = {
    doc: vi.fn(() => mockUserDoc as unknown as DocumentReference) as unknown as CollectionReference['doc'],
  };

  const mockDb: Partial<Firestore> = {
    collection: vi.fn(() => mockUsersCollection as unknown as CollectionReference),
    batch: vi.fn().mockReturnValue({
      set: mockBatchSet,
      commit: mockBatchCommit,
    }),
  };

  return {
    mockDb,
    mockCollection,
    mockDocRef,
    mockUsersCollection,
    mockUserDoc,
    mockQueryChain,
    mockBatchSet,
    mockBatchCommit,
  };
}

export function setupFirebaseMock(
  mocks: FirestoreMocks
): void {
  vi.doMock('../firebase.js', () => ({
    getFirestoreDb: vi.fn().mockReturnValue(mocks.mockDb),
    getCollectionName: vi.fn((name: string) => `test_${name}`),
  }));
}
