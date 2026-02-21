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
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
  };

  const mockDb: Partial<Firestore> = {
    collection: vi.fn().mockReturnValue(mockCollection),
  };

  return { mockDb, mockCollection, mockDocRef };
}

export function setupFirebaseMock(
  mocks: FirestoreMocks
): void {
  vi.doMock('../firebase.js', () => ({
    getFirestoreDb: vi.fn().mockReturnValue(mocks.mockDb),
    getCollectionName: vi.fn((name: string) => `test_${name}`),
  }));
}
