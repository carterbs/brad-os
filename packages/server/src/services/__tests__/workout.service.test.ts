import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WorkoutService } from '../workout.service.js';
import { createRepositories } from '../../repositories/index.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';
import type { DayOfWeek } from '@brad-os/shared';

describe('WorkoutService', () => {
  let db: Database.Database;
  let service: WorkoutService;

  // Test data setup helpers
  function createTestData(options?: {
    exerciseCount?: number;
    setsPerExercise?: number;
    scheduledDate?: string;
  }): {
    exerciseIds: number[];
    planId: number;
    planDayId: number;
    mesocycleId: number;
    workoutId: number;
    workoutSetIds: number[];
  } {
    const repos = createRepositories(db);
    const exerciseCount = options?.exerciseCount ?? 1;
    const setsPerExercise = options?.setsPerExercise ?? 3;
    const scheduledDate = options?.scheduledDate ?? (new Date().toISOString().split('T')[0] ?? '');

    // Create exercises
    const exerciseIds: number[] = [];
    for (let i = 0; i < exerciseCount; i++) {
      const exercise = repos.exercise.create({
        name: `Test Exercise ${i + 1}`,
        weight_increment: 5,
      });
      exerciseIds.push(exercise.id);
    }

    // Create plan
    const plan = repos.plan.create({ name: 'Test Plan', duration_weeks: 6 });

    // Create plan day
    const day = repos.planDay.create({
      plan_id: plan.id,
      day_of_week: 1 as DayOfWeek,
      name: 'Day 1',
      sort_order: 0,
    });

    // Add exercises to plan day
    for (let i = 0; i < exerciseIds.length; i++) {
      const exerciseId = exerciseIds[i];
      if (exerciseId === undefined) continue;
      repos.planDayExercise.create({
        plan_day_id: day.id,
        exercise_id: exerciseId,
        sets: setsPerExercise,
        reps: 10,
        weight: 100 + i * 10,
        rest_seconds: 90,
        sort_order: i,
      });
    }

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
      scheduled_date: scheduledDate,
    });

    // Create workout sets
    const workoutSetIds: number[] = [];
    for (let exerciseIdx = 0; exerciseIdx < exerciseIds.length; exerciseIdx++) {
      const exerciseId = exerciseIds[exerciseIdx];
      if (exerciseId === undefined) continue;
      for (let setNum = 1; setNum <= setsPerExercise; setNum++) {
        const workoutSet = repos.workoutSet.create({
          workout_id: workout.id,
          exercise_id: exerciseId,
          set_number: setNum,
          target_reps: 10,
          target_weight: 100 + exerciseIdx * 10,
        });
        workoutSetIds.push(workoutSet.id);
      }
    }

    return {
      exerciseIds,
      planId: plan.id,
      planDayId: day.id,
      mesocycleId: mesocycle.id,
      workoutId: workout.id,
      workoutSetIds,
    };
  }

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    service = new WorkoutService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getById', () => {
    it('should return null for non-existent workout', () => {
      const result = service.getById(999);
      expect(result).toBeNull();
    });

    it('should return workout with sets grouped by exercise', () => {
      const { workoutId } = createTestData({
        exerciseCount: 2,
        setsPerExercise: 3,
      });

      const result = service.getById(workoutId);

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.id).toBe(workoutId);
      expect(result.exercises).toHaveLength(2);
      expect(result.exercises[0]?.sets).toHaveLength(3);
      expect(result.exercises[1]?.sets).toHaveLength(3);
    });

    it('should order exercises by plan order', () => {
      const { workoutId } = createTestData({
        exerciseCount: 3,
        setsPerExercise: 2,
      });

      const result = service.getById(workoutId);

      if (!result) throw new Error('Result not found');
      // Exercises should be in sort_order
      expect(result.exercises[0]?.exercise_name).toBe('Test Exercise 1');
      expect(result.exercises[1]?.exercise_name).toBe('Test Exercise 2');
      expect(result.exercises[2]?.exercise_name).toBe('Test Exercise 3');
    });

    it('should order sets by set number within each exercise', () => {
      const { workoutId } = createTestData({
        exerciseCount: 1,
        setsPerExercise: 3,
      });

      const result = service.getById(workoutId);

      if (!result) throw new Error('Result not found');
      const sets = result.exercises[0]?.sets;
      if (!sets) throw new Error('Sets not found');
      expect(sets[0]?.set_number).toBe(1);
      expect(sets[1]?.set_number).toBe(2);
      expect(sets[2]?.set_number).toBe(3);
    });

    it('should include rest_seconds from plan_day_exercises', () => {
      const { workoutId } = createTestData({
        exerciseCount: 1,
        setsPerExercise: 2,
      });

      const result = service.getById(workoutId);

      if (!result) throw new Error('Result not found');
      expect(result.exercises[0]?.rest_seconds).toBe(90);
    });

    it('should include plan_day_name', () => {
      const { workoutId } = createTestData();

      const result = service.getById(workoutId);

      if (!result) throw new Error('Result not found');
      expect(result.plan_day_name).toBe('Day 1');
    });
  });

  describe('getTodaysWorkout', () => {
    it('should return null when no pending workouts exist', () => {
      const { workoutId } = createTestData({ scheduledDate: '2020-01-01' });
      const repos = createRepositories(db);

      // Complete the only workout
      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      const result = service.getTodaysWorkout();
      expect(result).toBeNull();
    });

    it('should return a pending workout even if scheduled in the past', () => {
      const { workoutId } = createTestData({ scheduledDate: '2020-01-01' });

      const result = service.getTodaysWorkout();

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.id).toBe(workoutId);
    });

    it('should return in-progress workout', () => {
      const { workoutId } = createTestData({ scheduledDate: '2020-01-01' });
      const repos = createRepositories(db);

      // Start the workout
      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.getTodaysWorkout();

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.id).toBe(workoutId);
      expect(result.status).toBe('in_progress');
    });

    it('should not return completed workout', () => {
      const { workoutId } = createTestData({ scheduledDate: '2024-01-01' });
      const repos = createRepositories(db);

      // Complete the workout
      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      const result = service.getTodaysWorkout();

      expect(result).toBeNull();
    });

    it('should not return skipped workout', () => {
      const { workoutId } = createTestData({ scheduledDate: '2024-01-01' });
      const repos = createRepositories(db);

      // Skip the workout
      repos.workout.update(workoutId, { status: 'skipped' });

      const result = service.getTodaysWorkout();

      expect(result).toBeNull();
    });

    it('should return next pending workout when earlier ones are completed', () => {
      // Create first workout (earlier date)
      const { workoutId, mesocycleId, planDayId } = createTestData({ scheduledDate: '2024-01-01' });
      const repos = createRepositories(db);

      // Create second workout in the same mesocycle (later date)
      const secondWorkout = repos.workout.create({
        mesocycle_id: mesocycleId,
        plan_day_id: planDayId,
        week_number: 2,
        scheduled_date: '2024-01-03',
      });

      // Complete the first workout
      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      const result = service.getTodaysWorkout();

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.id).toBe(secondWorkout.id);
    });

    it('should return next pending workout when earlier ones are skipped', () => {
      // Create first workout (earlier date)
      const { workoutId, mesocycleId, planDayId } = createTestData({ scheduledDate: '2024-01-01' });
      const repos = createRepositories(db);

      // Create second workout in the same mesocycle (later date)
      const secondWorkout = repos.workout.create({
        mesocycle_id: mesocycleId,
        plan_day_id: planDayId,
        week_number: 2,
        scheduled_date: '2024-01-03',
      });

      // Skip the first workout
      repos.workout.update(workoutId, { status: 'skipped' });

      const result = service.getTodaysWorkout();

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.id).toBe(secondWorkout.id);
    });
  });

  describe('start', () => {
    it('should throw when workout not found', () => {
      expect(() => service.start(999)).toThrow('Workout with id 999 not found');
    });

    it('should set status to in_progress', () => {
      const { workoutId } = createTestData();

      const result = service.start(workoutId);

      expect(result.status).toBe('in_progress');
    });

    it('should set startedAt timestamp', () => {
      const { workoutId } = createTestData();

      const result = service.start(workoutId);

      expect(result.started_at).not.toBeNull();
    });

    it('should throw when workout already started', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      expect(() => service.start(workoutId)).toThrow(
        'Workout is already in progress'
      );
    });

    it('should throw when workout completed', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      expect(() => service.start(workoutId)).toThrow(
        'Cannot start a completed workout'
      );
    });

    it('should throw when workout skipped', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, { status: 'skipped' });

      expect(() => service.start(workoutId)).toThrow(
        'Cannot start a skipped workout'
      );
    });
  });

  describe('complete', () => {
    it('should throw when workout not found', () => {
      expect(() => service.complete(999)).toThrow(
        'Workout with id 999 not found'
      );
    });

    it('should set status to completed', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      // Start the workout first
      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.complete(workoutId);

      expect(result.status).toBe('completed');
    });

    it('should set completedAt timestamp', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.complete(workoutId);

      expect(result.completed_at).not.toBeNull();
    });

    it('should throw when workout not started', () => {
      const { workoutId } = createTestData();

      expect(() => service.complete(workoutId)).toThrow(
        'Cannot complete a workout that has not been started'
      );
    });

    it('should throw when workout already completed', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      expect(() => service.complete(workoutId)).toThrow(
        'Workout is already completed'
      );
    });

    it('should throw when trying to complete a skipped workout', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, { status: 'skipped' });

      expect(() => service.complete(workoutId)).toThrow(
        'Cannot complete a skipped workout'
      );
    });

    it('should allow completing workout with pending sets', () => {
      const { workoutId, workoutSetIds } = createTestData({
        exerciseCount: 1,
        setsPerExercise: 3,
      });
      const repos = createRepositories(db);

      // Start the workout
      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      // Log only one set
      const firstSetId = workoutSetIds[0];
      if (firstSetId !== undefined) {
        repos.workoutSet.update(firstSetId, {
          actual_reps: 10,
          actual_weight: 100,
          status: 'completed',
        });
      }

      // Complete workout - should succeed even with pending sets
      const result = service.complete(workoutId);

      expect(result.status).toBe('completed');
    });
  });

  describe('skip', () => {
    it('should throw when workout not found', () => {
      expect(() => service.skip(999)).toThrow('Workout with id 999 not found');
    });

    it('should set status to skipped', () => {
      const { workoutId } = createTestData();

      const result = service.skip(workoutId);

      expect(result.status).toBe('skipped');
    });

    it('should mark all pending sets as skipped', () => {
      const { workoutId, workoutSetIds } = createTestData({
        exerciseCount: 1,
        setsPerExercise: 3,
      });
      const repos = createRepositories(db);

      service.skip(workoutId);

      // Check all sets are skipped
      for (const setId of workoutSetIds) {
        const set = repos.workoutSet.findById(setId);
        if (!set) throw new Error(`Set ${setId} not found`);
        expect(set.status).toBe('skipped');
      }
    });

    it('should preserve logged set data', () => {
      const { workoutId, workoutSetIds } = createTestData({
        exerciseCount: 1,
        setsPerExercise: 3,
      });
      const repos = createRepositories(db);

      // Start and log one set
      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const firstSetId = workoutSetIds[0];
      const secondSetId = workoutSetIds[1];
      if (firstSetId === undefined) throw new Error('First set ID not found');
      if (secondSetId === undefined) throw new Error('Second set ID not found');

      repos.workoutSet.update(firstSetId, {
        actual_reps: 10,
        actual_weight: 100,
        status: 'completed',
      });

      // Skip the workout
      service.skip(workoutId);

      // Logged set should still have its data
      const loggedSet = repos.workoutSet.findById(firstSetId);
      if (!loggedSet) throw new Error('Logged set not found');
      expect(loggedSet.actual_reps).toBe(10);
      expect(loggedSet.actual_weight).toBe(100);
      expect(loggedSet.status).toBe('completed');

      // Other sets should be skipped
      const pendingSet = repos.workoutSet.findById(secondSetId);
      if (!pendingSet) throw new Error('Pending set not found');
      expect(pendingSet.status).toBe('skipped');
    });

    it('should throw when workout completed', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      expect(() => service.skip(workoutId)).toThrow(
        'Cannot skip a completed workout'
      );
    });

    it('should throw when workout already skipped', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, { status: 'skipped' });

      expect(() => service.skip(workoutId)).toThrow(
        'Workout is already skipped'
      );
    });

    it('should allow skipping scheduled (pending) workout', () => {
      const { workoutId } = createTestData();

      const result = service.skip(workoutId);

      expect(result.status).toBe('skipped');
    });

    it('should allow skipping in_progress workout', () => {
      const { workoutId } = createTestData();
      const repos = createRepositories(db);

      repos.workout.update(workoutId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });

      const result = service.skip(workoutId);

      expect(result.status).toBe('skipped');
    });
  });
});
