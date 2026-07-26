import type {
  CollectionReference,
  DocumentData,
  Firestore,
} from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { runWithEnvironment } from '../runtime/environment-context.js';
import { BaseRepository } from './base.repository.js';

interface ProbeEntity {
  id: string;
}

class ProbeRepository extends BaseRepository<
  ProbeEntity,
  Record<string, never>,
  Record<string, never>
> {
  constructor(db: Firestore) {
    super('probes', db);
  }

  create(): Promise<ProbeEntity> {
    return Promise.resolve({ id: 'probe' });
  }

  findAll(): Promise<ProbeEntity[]> {
    void this.collection;
    return Promise.resolve([]);
  }

  resolveCollectionId(): string {
    return this.collection.id;
  }

  protected parseEntity(id: string): ProbeEntity {
    return { id };
  }
}

describe('BaseRepository environment isolation', () => {
  it('resolves its collection on every operation instead of at construction', async () => {
    const collection = {} as CollectionReference<DocumentData>;
    const collectionMock = vi.fn(() => collection);
    const db = { collection: collectionMock } as unknown as Firestore;
    const repository = new ProbeRepository(db);

    await Promise.all([
      runWithEnvironment('dev', () => repository.findAll()),
      runWithEnvironment('prod', () => repository.findAll()),
      runWithEnvironment('dev', () => repository.findAll()),
    ]);

    expect(collectionMock.mock.calls.map(([name]) => name)).toEqual([
      'dev_probes',
      'probes',
      'dev_probes',
    ]);
  });

  it('keeps 100 deliberately interleaved reads in their requested namespace', async () => {
    const db = {
      collection: (name: string) => ({ id: name }),
    } as unknown as Firestore;
    const repository = new ProbeRepository(db);
    const operations = Array.from({ length: 100 }, (_, index) => {
      const environment = index % 2 === 0 ? 'dev' : 'prod';
      const expected = environment === 'dev' ? 'dev_probes' : 'probes';

      return runWithEnvironment(environment, async () => {
        await Promise.resolve();
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        return {
          expected,
          actual: repository.resolveCollectionId(),
        };
      });
    });

    const results = await Promise.all(operations);

    expect(results).toHaveLength(100);
    expect(results.every((result) => result.actual === result.expected)).toBe(
      true
    );
  });
});
