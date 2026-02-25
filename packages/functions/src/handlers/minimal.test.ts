import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

const mockRecoveryService = vi.hoisted(() => ({
  addWeightEntries: vi.fn(),
}));

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  },
}));

vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService);

import { healthSyncApp } from './health-sync.js';

describe('Minimal Test', () => {
  it('should import app', () => {
    expect(healthSyncApp).toBeDefined();
    expect(healthSyncApp).not.toBeNull();
  });

  it('should make request', async () => {
    const response = await request(healthSyncApp)
      .post('/weight/bulk')
      .send({ weights: [{ weightLbs: 180, date: '2026-02-07' }] });
    
    console.log('Response status:', response.status);
    console.log('Response body:', response.body);
    expect(response).toBeDefined();
  });
});
