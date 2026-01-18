import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MesocycleRepository } from '../mesocycle.repository.js';
import { PlanRepository } from '../plan.repository.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';

describe('MesocycleRepository', () => {
  let db: Database.Database;
  let repository: MesocycleRepository;
  let planRepository: PlanRepository;
  let testPlanId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    repository = new MesocycleRepository(db);
    planRepository = new PlanRepository(db);

    // Create a test plan
    const plan = planRepository.create({ name: 'Test Plan' });
    testPlanId = plan.id;
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a mesocycle with all fields', () => {
      const mesocycle = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });

      expect(mesocycle).toMatchObject({
        plan_id: testPlanId,
        start_date: '2024-01-01',
        current_week: 1,
        status: 'pending',
      });
      expect(mesocycle.id).toBeDefined();
      expect(mesocycle.created_at).toBeDefined();
      expect(mesocycle.updated_at).toBeDefined();
    });

    it('should reject non-existent plan_id', () => {
      expect(() =>
        repository.create({
          plan_id: 999,
          start_date: '2024-01-01',
        })
      ).toThrow();
    });
  });

  describe('findById', () => {
    it('should return mesocycle when found', () => {
      const created = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      const found = repository.findById(created.id);
      expect(found).toEqual(created);
    });

    it('should return null when not found', () => {
      const found = repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('findByPlanId', () => {
    it('should return all mesocycles for a plan', () => {
      repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      repository.create({
        plan_id: testPlanId,
        start_date: '2024-03-01',
      });

      const mesocycles = repository.findByPlanId(testPlanId);
      expect(mesocycles).toHaveLength(2);
    });

    it('should return empty array for plan with no mesocycles', () => {
      const mesocycles = repository.findByPlanId(testPlanId);
      expect(mesocycles).toEqual([]);
    });
  });

  describe('findActive', () => {
    it('should return only active mesocycles', () => {
      const active = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      // Set to active (create defaults to pending)
      repository.update(active.id, { status: 'active' });

      const pending = repository.create({
        plan_id: testPlanId,
        start_date: '2024-02-01',
      });

      const completed = repository.create({
        plan_id: testPlanId,
        start_date: '2024-03-01',
      });
      repository.update(completed.id, { status: 'completed' });

      const activeMesocycles = repository.findActive();
      expect(activeMesocycles).toHaveLength(1);
      expect(activeMesocycles[0].id).toBe(active.id);
      // Verify pending and completed are not returned
      expect(activeMesocycles.find((m) => m.id === pending.id)).toBeUndefined();
      expect(activeMesocycles.find((m) => m.id === completed.id)).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all mesocycles', () => {
      repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      repository.create({
        plan_id: testPlanId,
        start_date: '2024-03-01',
      });

      const mesocycles = repository.findAll();
      expect(mesocycles).toHaveLength(2);
    });

    it('should return empty array when none exist', () => {
      const mesocycles = repository.findAll();
      expect(mesocycles).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update current_week', () => {
      const created = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      const updated = repository.update(created.id, { current_week: 3 });

      expect(updated?.current_week).toBe(3);
      expect(updated?.updated_at).not.toBe(created.updated_at);
    });

    it('should update status to completed', () => {
      const created = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      const updated = repository.update(created.id, { status: 'completed' });

      expect(updated?.status).toBe('completed');
    });

    it('should update status to cancelled', () => {
      const created = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      const updated = repository.update(created.id, { status: 'cancelled' });

      expect(updated?.status).toBe('cancelled');
    });

    it('should return null for non-existent id', () => {
      const updated = repository.update(999, { current_week: 3 });
      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing mesocycle', () => {
      const created = repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.findById(created.id)).toBeNull();
    });

    it('should return false for non-existent id', () => {
      const deleted = repository.delete(999);
      expect(deleted).toBe(false);
    });

    it('should prevent deletion of plan with active mesocycle', () => {
      repository.create({
        plan_id: testPlanId,
        start_date: '2024-01-01',
      });

      expect(() => planRepository.delete(testPlanId)).toThrow();
    });
  });
});
