import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import request from 'supertest';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { createResourceRouter } from './create-resource-router.js';
import type { IBaseRepository } from '../types/repository.js';
import { ConflictError } from '../types/errors.js';

const getFirestoreDbMock = vi.hoisted(() => vi.fn());

vi.mock('./app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

vi.mock('../firebase.js', () => ({
  getFirestoreDb: getFirestoreDbMock,
}));

interface TestItem {
  id: string;
  title: string;
  count: number;
}

const createItemSchema = z.object({
  title: z.string().trim().min(1),
  count: z.coerce.number().int().positive(),
});
type CreateItemDTO = z.infer<typeof createItemSchema>;

const updateItemSchema = createItemSchema.partial();
type UpdateItemDTO = z.infer<typeof updateItemSchema>;

const repository = {
  findAll: vi.fn<[], Promise<TestItem[]>>(),
  findById: vi.fn<[string], Promise<TestItem | null>>(),
  create: vi.fn<[CreateItemDTO], Promise<TestItem>>(),
  update: vi.fn<[string, UpdateItemDTO], Promise<TestItem | null>>(),
  delete: vi.fn<[string], Promise<boolean>>(),
};

class TestResourceRepository implements IBaseRepository<TestItem, CreateItemDTO, UpdateItemDTO> {
  constructor(_db: Firestore) {}

  create(data: CreateItemDTO): Promise<TestItem> {
    return repository.create(data);
  }

  findAll(): Promise<TestItem[]> {
    return repository.findAll();
  }

  findById(id: string): Promise<TestItem | null> {
    return repository.findById(id);
  }

  update(id: string, data: UpdateItemDTO): Promise<TestItem | null> {
    return repository.update(id, data);
  }

  delete(id: string): Promise<boolean> {
    return repository.delete(id);
  }
}

describe('createResourceRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFirestoreDbMock.mockReturnValue({});
  });

  it('should validate and forward transformed POST payloads to repository create', async () => {
    repository.create.mockResolvedValue({
      id: 'item-1',
      title: 'Clean',
      count: 3,
    });

    const app = createResourceRouter<TestItem, CreateItemDTO, UpdateItemDTO, TestResourceRepository>({
      resourceName: 'tests',
      displayName: 'TestItem',
      RepoClass: TestResourceRepository,
      createSchema: createItemSchema,
      updateSchema: updateItemSchema,
    });

    const response = await request(app).post('/').send({
      title: '  Clean  ',
      count: '3',
    });

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({
      title: 'Clean',
      count: 3,
    });
  });

  it('should validate and forward transformed PUT payloads to repository update', async () => {
    repository.update.mockResolvedValue({
      id: 'item-2',
      title: 'Update',
      count: 9,
    });

    const app = createResourceRouter<TestItem, CreateItemDTO, UpdateItemDTO, TestResourceRepository>({
      resourceName: 'tests',
      displayName: 'TestItem',
      RepoClass: TestResourceRepository,
      createSchema: createItemSchema,
      updateSchema: updateItemSchema,
    });

    const response = await request(app).put('/item-2').send({
      title: '  Update  ',
      count: '9',
    });

    expect(response.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith('item-2', {
      title: 'Update',
      count: 9,
    });
  });

  it('should return bad request when POST body fails validation', async () => {
    const app = createResourceRouter<TestItem, CreateItemDTO, UpdateItemDTO, TestResourceRepository>({
      resourceName: 'tests',
      displayName: 'TestItem',
      RepoClass: TestResourceRepository,
      createSchema: createItemSchema,
      updateSchema: updateItemSchema,
    });

    const response = await request(app).post('/').send({
      title: '',
      count: 'invalid',
    });

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('should register custom routes before built-in id routes', async () => {
    const app = createResourceRouter<TestItem, CreateItemDTO, UpdateItemDTO, TestResourceRepository>({
      resourceName: 'tests',
      displayName: 'TestItem',
      RepoClass: TestResourceRepository,
      createSchema: createItemSchema,
      updateSchema: updateItemSchema,
      registerCustomRoutes: ({ app: customApp }) => {
        customApp.get('/default', (_req: Request, res: Response) => {
          res.json({ success: true, data: 'custom-route' });
        });
      },
    });

    const response = await request(app).get('/default');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: 'custom-route',
    });
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('should block DELETE via beforeDelete hook and skip repository delete', async () => {
    const beforeDelete = vi.fn(async () => {
      throw new ConflictError('Cannot delete this item');
    });

    const app = createResourceRouter<TestItem, CreateItemDTO, UpdateItemDTO, TestResourceRepository>({
      resourceName: 'tests',
      displayName: 'TestItem',
      RepoClass: TestResourceRepository,
      createSchema: createItemSchema,
      updateSchema: updateItemSchema,
      beforeDelete,
    });

    repository.delete.mockResolvedValue(true);

    const response = await request(app).delete('/item-1');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Cannot delete this item',
      },
    });
    expect(beforeDelete).toHaveBeenCalledWith({
      id: 'item-1',
      req: expect.any(Object),
      repo: expect.anything(),
    });
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
