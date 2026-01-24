import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WorkoutRepository } from '../workout.repository.js';
import { MesocycleRepository } from '../mesocycle.repository.js';
import { PlanRepository } from '../plan.repository.js';
import { PlanDayRepository } from '../plan-day.repository.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';

describe('WorkoutRepository', () => {
  let db: Database.Database;
  let repository: WorkoutRepository;
  let mesocycleRepository: MesocycleRepository;
  let planRepository: PlanRepository;
  let planDayRepository: PlanDayRepository;
  let testMesocycleId: number;
  let testPlanDayId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    repository = new WorkoutRepository(db);
    mesocycleRepository = new MesocycleRepository(db);
    planRepository = new PlanRepository(db);
    planDayRepository = new PlanDayRepository(db);

    // Create test data
    const plan = planRepository.create({ name: 'Test Plan' });
    const planDay = planDayRepository.create({
      plan_id: plan.id,
      day_of_week: 1,
      name: 'Push Day',
      sort_order: 0,
    });
    const mesocycle = mesocycleRepository.create({
      plan_id: plan.id,
      start_date: '2024-01-01',
    });

    testMesocycleId = mesocycle.id;
    testPlanDayId = planDay.id;
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a workout with all fields', () => {
      const workout = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });

      expect(workout).toMatchObject({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
        status: 'pending',
        started_at: null,
        completed_at: null,
      });
      expect(workout.id).toBeDefined();
    });

    it('should reject duplicate workout for same mesocycle/day/week', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });

      expect(() =>
        repository.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-01',
        })
      ).toThrow();
    });

    it('should reject non-existent mesocycle_id', () => {
      expect(() =>
        repository.create({
          mesocycle_id: 999,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-01',
        })
      ).toThrow();
    });

    it('should reject non-existent plan_day_id', () => {
      expect(() =>
        repository.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: 999,
          week_number: 1,
          scheduled_date: '2024-01-01',
        })
      ).toThrow();
    });
  });

  describe('findById', () => {
    it('should return workout when found', () => {
      const created = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const found = repository.findById(created.id);
      expect(found).toEqual(created);
    });

    it('should return null when not found', () => {
      const found = repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('findByMesocycleId', () => {
    it('should return all workouts for a mesocycle', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });

      const workouts = repository.findByMesocycleId(testMesocycleId);
      expect(workouts).toHaveLength(2);
    });

    it('should return workouts ordered by scheduled_date', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });

      const workouts = repository.findByMesocycleId(testMesocycleId);
      expect(workouts[0].scheduled_date).toBe('2024-01-01');
      expect(workouts[1].scheduled_date).toBe('2024-01-08');
    });

    it('should return empty array for mesocycle with no workouts', () => {
      const workouts = repository.findByMesocycleId(testMesocycleId);
      expect(workouts).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should return only workouts with matching status', () => {
      const pending = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const inProgress = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });
      repository.update(inProgress.id, { status: 'in_progress' });

      const pendingWorkouts = repository.findByStatus('pending');
      expect(pendingWorkouts).toHaveLength(1);
      expect(pendingWorkouts[0].id).toBe(pending.id);

      const inProgressWorkouts = repository.findByStatus('in_progress');
      expect(inProgressWorkouts).toHaveLength(1);
      expect(inProgressWorkouts[0].id).toBe(inProgress.id);
    });
  });

  describe('findByDate', () => {
    it('should return workouts scheduled for a specific date', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });

      const workouts = repository.findByDate('2024-01-01');
      expect(workouts).toHaveLength(1);
      expect(workouts[0].scheduled_date).toBe('2024-01-01');
    });
  });

  describe('findAll', () => {
    it('should return all workouts', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });

      const workouts = repository.findAll();
      expect(workouts).toHaveLength(1);
    });

    it('should return empty array when none exist', () => {
      const workouts = repository.findAll();
      expect(workouts).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update status to in_progress', () => {
      const created = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const updated = repository.update(created.id, { status: 'in_progress' });

      expect(updated?.status).toBe('in_progress');
    });

    it('should update started_at', () => {
      const created = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const startTime = '2024-01-01T10:00:00.000Z';
      const updated = repository.update(created.id, { started_at: startTime });

      expect(updated?.started_at).toBe(startTime);
    });

    it('should update completed_at', () => {
      const created = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const endTime = '2024-01-01T11:00:00.000Z';
      const updated = repository.update(created.id, { completed_at: endTime });

      expect(updated?.completed_at).toBe(endTime);
    });

    it('should update multiple fields', () => {
      const created = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const startTime = '2024-01-01T10:00:00.000Z';
      const updated = repository.update(created.id, {
        status: 'in_progress',
        started_at: startTime,
      });

      expect(updated?.status).toBe('in_progress');
      expect(updated?.started_at).toBe(startTime);
    });

    it('should return null for non-existent id', () => {
      const updated = repository.update(999, { status: 'in_progress' });
      expect(updated).toBeNull();
    });
  });

  describe('findNextPending', () => {
    it('should return the earliest pending workout by scheduled_date', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-08',
      });
      const earlier = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-01',
      });

      const result = repository.findNextPending();
      expect(result?.id).toBe(earlier.id);
      expect(result?.scheduled_date).toBe('2024-01-01');
    });

    it('should return pending workout even if scheduled_date is in the past', () => {
      const pastWorkout = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2020-01-01',
      });

      const result = repository.findNextPending();
      expect(result?.id).toBe(pastWorkout.id);
    });

    it('should return in_progress workout', () => {
      const workout = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.update(workout.id, { status: 'in_progress' });

      const result = repository.findNextPending();
      expect(result?.id).toBe(workout.id);
      expect(result?.status).toBe('in_progress');
    });

    it('should skip completed workouts', () => {
      const completed = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.update(completed.id, { status: 'completed' });

      const pending = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });

      const result = repository.findNextPending();
      expect(result?.id).toBe(pending.id);
    });

    it('should skip skipped workouts', () => {
      const skipped = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.update(skipped.id, { status: 'skipped' });

      const pending = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });

      const result = repository.findNextPending();
      expect(result?.id).toBe(pending.id);
    });

    it('should return null when no pending or in_progress workouts exist', () => {
      const workout = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.update(workout.id, { status: 'completed' });

      const result = repository.findNextPending();
      expect(result).toBeNull();
    });

    it('should return null when no workouts exist', () => {
      const result = repository.findNextPending();
      expect(result).toBeNull();
    });

    it('should prefer in_progress over pending when earlier by date', () => {
      repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 2,
        scheduled_date: '2024-01-08',
      });
      const inProgress = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      repository.update(inProgress.id, { status: 'in_progress' });

      const result = repository.findNextPending();
      expect(result?.id).toBe(inProgress.id);
      expect(result?.status).toBe('in_progress');
    });
  });

  describe('delete', () => {
    it('should delete existing workout', () => {
      const created = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.findById(created.id)).toBeNull();
    });

    it('should return false for non-existent id', () => {
      const deleted = repository.delete(999);
      expect(deleted).toBe(false);
    });

    it('should cascade delete when mesocycle is deleted', () => {
      const workout = repository.create({
        mesocycle_id: testMesocycleId,
        plan_day_id: testPlanDayId,
        week_number: 1,
        scheduled_date: '2024-01-01',
      });

      mesocycleRepository.delete(testMesocycleId);

      expect(repository.findById(workout.id)).toBeNull();
    });
  });
});
