import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WorkoutSetService } from '../workout-set.service.js';
import { createRepositories } from '../../repositories/index.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';
import type { DayOfWeek } from '@brad-os/shared';

describe('WorkoutSetService', () => {
  let db: Database.Database;
  let service: WorkoutSetService;

  // Test data setup helpers
  function createTestData(): {
    exerciseId: number;
    planId: number;
    mesocycleId: number;
    workoutId: number;
    workoutSetId: number;
  } {
    const repos = createRepositories(db);

    // Create exercise
    const exercise = repos.exercise.create({
      name: 'Test Exercise',
      weight_increment: 5,
    });

    // Create plan
    const plan = repos.plan.create({ name: 'Test Plan', duration_weeks: 6 });

    // Create plan day
    const day = repos.planDay.create({
      plan_id: plan.id,
      day_of_week: 1 as DayOfWeek,
      name: 'Day 1',
      sort_order: 0,
    });

    // Add exercise to plan day
    repos.planDayExercise.create({
      plan_day_id: day.id,
      exercise_id: exercise.id,
      sets: 3,
      reps: 10,
      weight: 100,
      rest_seconds: 90,
      sort_order: 0,
    });

    // Create mesocycle
    const mesocycle = repos.mesocycle.create({
      plan_id: plan.id,
      start_date: '2024-01-01',
    });

    // Create workout
    const workout = repos.workout.create({
      mesocycle_id: mesocycle.id,
      plan_day_id: day.id,
      week_number: 1,
      scheduled_date: '2024-01-01',
    });

    // Create workout set
    const workoutSet = repos.workoutSet.create({
      workout_id: workout.id,
      exercise_id: exercise.id,
      set_number: 1,
      target_reps: 10,
      target_weight: 100,
    });

    return {
      exerciseId: exercise.id,
      planId: plan.id,
      mesocycleId: mesocycle.id,
      workoutId: workout.id,
      workoutSetId: workoutSet.id,
    };
  }

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    service = new WorkoutSetService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getById', () => {
    it('should return null for non-existent set', () => {
      const result = service.getById(999);
      expect(result).toBeNull();
    });

    it('should return set with all fields', () => {
      const { workoutSetId } = createTestData();

      const result = service.getById(workoutSetId);

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.id).toBe(workoutSetId);
      expect(result.set_number).toBe(1);
      expect(result.target_reps).toBe(10);
      expect(result.target_weight).toBe(100);
      expect(result.actual_reps).toBeNull();
      expect(result.actual_weight).toBeNull();
      expect(result.status).toBe('pending');
    });
  });

  describe('log', () => {
    it('should throw for non-existent set', () => {
      expect(() =>
        service.log(999, { actual_reps: 8, actual_weight: 30 })
      ).toThrow('WorkoutSet with id 999 not found');
    });

    it('should update actualReps and actualWeight', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      // Start the workout first
      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.log(workoutSetId, {
        actual_reps: 8,
        actual_weight: 95,
      });

      expect(result.actual_reps).toBe(8);
      expect(result.actual_weight).toBe(95);
    });

    it('should set status to completed', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      // Start the workout first
      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.log(workoutSetId, {
        actual_reps: 8,
        actual_weight: 95,
      });

      expect(result.status).toBe('completed');
    });

    it('should auto-start workout if not started', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      // Workout is in 'pending' status by default
      service.log(workoutSetId, { actual_reps: 8, actual_weight: 95 });

      const workout = repos.workout.findById(workoutId);
      if (!workout) throw new Error('Workout not found');
      expect(workout.status).toBe('in_progress');
      expect(workout.started_at).not.toBeNull();
    });

    it('should throw for completed workout', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      // Complete the workout
      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      expect(() =>
        service.log(workoutSetId, { actual_reps: 8, actual_weight: 30 })
      ).toThrow('Cannot log sets for a completed workout');
    });

    it('should throw for skipped workout', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      // Skip the workout
      repos.workout.update(workoutId, { status: 'skipped' });

      expect(() =>
        service.log(workoutSetId, { actual_reps: 8, actual_weight: 30 })
      ).toThrow('Cannot log sets for a skipped workout');
    });

    it('should throw for negative reps', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      expect(() =>
        service.log(workoutSetId, { actual_reps: -1, actual_weight: 30 })
      ).toThrow('Reps must be a non-negative number');
    });

    it('should throw for negative weight', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      expect(() =>
        service.log(workoutSetId, { actual_reps: 8, actual_weight: -5 })
      ).toThrow('Weight must be a non-negative number');
    });

    it('should allow zero weight (bodyweight exercises)', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.log(workoutSetId, {
        actual_reps: 8,
        actual_weight: 0,
      });

      expect(result.actual_weight).toBe(0);
    });

    it('should allow zero reps', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.log(workoutSetId, {
        actual_reps: 0,
        actual_weight: 100,
      });

      expect(result.actual_reps).toBe(0);
    });

    it('should allow re-logging a set', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // First log
      service.log(workoutSetId, { actual_reps: 8, actual_weight: 95 });

      // Re-log with different values
      const result = service.log(workoutSetId, {
        actual_reps: 10,
        actual_weight: 100,
      });

      expect(result.actual_reps).toBe(10);
      expect(result.actual_weight).toBe(100);
    });
  });

  describe('skip', () => {
    it('should throw for non-existent set', () => {
      expect(() => service.skip(999)).toThrow('WorkoutSet with id 999 not found');
    });

    it('should set status to skipped', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.skip(workoutSetId);

      expect(result.status).toBe('skipped');
    });

    it('should clear actual values if previously logged', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Log the set first
      service.log(workoutSetId, { actual_reps: 8, actual_weight: 95 });

      // Then skip it
      const result = service.skip(workoutSetId);

      expect(result.status).toBe('skipped');
      expect(result.actual_reps).toBeNull();
      expect(result.actual_weight).toBeNull();
    });

    it('should auto-start workout if not started', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      // Workout is in 'pending' status by default
      service.skip(workoutSetId);

      const workout = repos.workout.findById(workoutId);
      if (!workout) throw new Error('Workout not found');
      expect(workout.status).toBe('in_progress');
      expect(workout.started_at).not.toBeNull();
    });

    it('should throw for completed workout', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      expect(() => service.skip(workoutSetId)).toThrow(
        'Cannot skip sets for a completed workout'
      );
    });

    it('should throw for skipped workout', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, { status: 'skipped' });

      expect(() => service.skip(workoutSetId)).toThrow(
        'Cannot skip sets for a skipped workout'
      );
    });

    it('should allow skipping an already skipped set (idempotent)', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Skip once
      service.skip(workoutSetId);

      // Skip again - should not throw
      const result = service.skip(workoutSetId);
      expect(result.status).toBe('skipped');
    });
  });

  describe('unlog', () => {
    it('should throw for non-existent set', () => {
      expect(() => service.unlog(999)).toThrow('WorkoutSet with id 999 not found');
    });

    it('should set status to pending', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Log the set first
      service.log(workoutSetId, { actual_reps: 8, actual_weight: 95 });

      // Then unlog it
      const result = service.unlog(workoutSetId);

      expect(result.status).toBe('pending');
    });

    it('should clear actual values', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Log the set first
      service.log(workoutSetId, { actual_reps: 8, actual_weight: 95 });

      // Then unlog it
      const result = service.unlog(workoutSetId);

      expect(result.actual_reps).toBeNull();
      expect(result.actual_weight).toBeNull();
    });

    it('should throw for completed workout', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      expect(() => service.unlog(workoutSetId)).toThrow(
        'Cannot unlog sets for a completed workout'
      );
    });

    it('should throw for skipped workout', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, { status: 'skipped' });

      expect(() => service.unlog(workoutSetId)).toThrow(
        'Cannot unlog sets for a skipped workout'
      );
    });

    it('should unlog a skipped set', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Skip the set first
      service.skip(workoutSetId);

      // Then unlog it
      const result = service.unlog(workoutSetId);

      expect(result.status).toBe('pending');
      expect(result.actual_reps).toBeNull();
      expect(result.actual_weight).toBeNull();
    });

    it('should allow unlogging an already pending set (idempotent)', () => {
      const { workoutSetId, workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Unlog a pending set - should not throw
      const result = service.unlog(workoutSetId);
      expect(result.status).toBe('pending');
    });
  });
});
