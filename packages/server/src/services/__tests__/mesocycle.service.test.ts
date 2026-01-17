import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MesocycleService } from '../mesocycle.service.js';
import { createRepositories } from '../../repositories/index.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';
import type { DayOfWeek } from '@lifting/shared';

describe('MesocycleService', () => {
  let db: Database.Database;
  let service: MesocycleService;

  // Test data setup helpers
  function createTestPlan(): number {
    const repos = createRepositories(db);
    const plan = repos.plan.create({ name: 'Test Plan', duration_weeks: 6 });
    return plan.id;
  }

  function createTestPlanWithDays(numDays: number = 3): {
    planId: number;
    dayIds: number[];
    exerciseId: number;
  } {
    const repos = createRepositories(db);

    // Create exercise first
    const exercise = repos.exercise.create({
      name: 'Test Exercise',
      weight_increment: 5,
    });

    // Create plan
    const plan = repos.plan.create({ name: 'Test Plan', duration_weeks: 6 });

    // Create plan days
    const dayIds: number[] = [];
    for (let i = 0; i < numDays; i++) {
      const day = repos.planDay.create({
        plan_id: plan.id,
        day_of_week: (i + 1) as DayOfWeek,
        name: `Day ${i + 1}`,
        sort_order: i,
      });
      dayIds.push(day.id);

      // Add exercise to each day
      repos.planDayExercise.create({
        plan_day_id: day.id,
        exercise_id: exercise.id,
        sets: 3,
        reps: 10,
        weight: 100,
        rest_seconds: 90,
        sort_order: 0,
      });
    }

    return { planId: plan.id, dayIds, exerciseId: exercise.id };
  }

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    service = new MesocycleService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a new mesocycle with generated workouts', () => {
      const { planId, dayIds } = createTestPlanWithDays(3);

      const result = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      expect(result.id).toBeDefined();
      expect(result.plan_id).toBe(planId);
      expect(result.status).toBe('active');
      expect(result.current_week).toBe(1);
    });

    it('should generate workouts for each week including deload', () => {
      const { planId, dayIds } = createTestPlanWithDays(3);

      service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const repos = createRepositories(db);
      const workouts = repos.workout.findAll();

      // 7 weeks * 3 days per week = 21 workouts
      expect(workouts).toHaveLength(21);
    });

    it('should reject creation when an active mesocycle exists', () => {
      const { planId } = createTestPlanWithDays(2);

      // Create first mesocycle
      service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      // Try to create another
      expect(() =>
        service.create({
          plan_id: planId,
          start_date: '2024-03-01',
        })
      ).toThrow('An active mesocycle already exists');
    });

    it('should reject creation with non-existent plan', () => {
      expect(() =>
        service.create({
          plan_id: 999,
          start_date: '2024-01-01',
        })
      ).toThrow('Plan with id 999 not found');
    });

    it('should reject creation with plan that has no days', () => {
      const planId = createTestPlan();

      expect(() =>
        service.create({
          plan_id: planId,
          start_date: '2024-01-01',
        })
      ).toThrow('Plan has no workout days configured');
    });

    it('should generate workout sets with base values for week 1', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const repos = createRepositories(db);
      const workouts = repos.workout.findByMesocycleId(mesocycle.id);
      const week1Workout = workouts.find((w) => w.week_number === 1);
      expect(week1Workout).toBeDefined();

      const sets = repos.workoutSet.findByWorkoutId(week1Workout!.id);
      // Week 1 (odd): base reps (10), base weight (100)
      expect(sets[0].target_reps).toBe(10);
      expect(sets[0].target_weight).toBe(100);
    });

    it('should apply progressive overload: +1 rep on odd weeks', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const repos = createRepositories(db);
      const workouts = repos.workout.findByMesocycleId(mesocycle.id);

      // Week 1: base reps (10)
      const week1Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 1)!.id
      );
      expect(week1Sets[0].target_reps).toBe(10);

      // Week 3: +1 rep = 11 (after week 2 weight increase resets reps)
      const week3Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 3)!.id
      );
      expect(week3Sets[0].target_reps).toBe(11);

      // Week 5: +1 rep = 11 (after week 4 weight increase resets reps)
      const week5Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 5)!.id
      );
      expect(week5Sets[0].target_reps).toBe(11);
    });

    it('should apply progressive overload: +weight on even weeks', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const repos = createRepositories(db);
      const workouts = repos.workout.findByMesocycleId(mesocycle.id);

      // Week 2: +5 lbs = 105, reps reset to base (10)
      const week2Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 2)!.id
      );
      expect(week2Sets[0].target_weight).toBe(105);
      expect(week2Sets[0].target_reps).toBe(10);

      // Week 4: +5 lbs = 110, reps reset to base (10)
      const week4Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 4)!.id
      );
      expect(week4Sets[0].target_weight).toBe(110);
      expect(week4Sets[0].target_reps).toBe(10);

      // Week 6: +5 lbs = 115, reps reset to base (10)
      const week6Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 6)!.id
      );
      expect(week6Sets[0].target_weight).toBe(115);
      expect(week6Sets[0].target_reps).toBe(10);
    });

    it('should generate deload week (week 7) with 50% volume', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const repos = createRepositories(db);
      const workouts = repos.workout.findByMesocycleId(mesocycle.id);

      const week6Workout = workouts.find((w) => w.week_number === 6);
      const week7Workout = workouts.find((w) => w.week_number === 7);

      expect(week6Workout).toBeDefined();
      expect(week7Workout).toBeDefined();

      const week6Sets = repos.workoutSet.findByWorkoutId(week6Workout!.id);
      const week7Sets = repos.workoutSet.findByWorkoutId(week7Workout!.id);

      // Original: 3 sets, Deload: 2 sets (50% rounded up)
      expect(week6Sets.length).toBe(3);
      expect(week7Sets.length).toBe(2);

      // Weight should be same as week 6 (115)
      expect(week7Sets[0].target_weight).toBe(115);
    });

    it('should schedule workouts on correct dates based on day_of_week', () => {
      const { planId } = createTestPlanWithDays(1); // day_of_week = 1 (Monday)

      // Start date is Monday 2024-01-01
      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const repos = createRepositories(db);
      const workouts = repos.workout.findByMesocycleId(mesocycle.id);

      // Week 1 workout should be on 2024-01-01 (Monday)
      const week1Workout = workouts.find((w) => w.week_number === 1);
      expect(week1Workout?.scheduled_date).toBe('2024-01-01');

      // Week 2 workout should be on 2024-01-08 (next Monday)
      const week2Workout = workouts.find((w) => w.week_number === 2);
      expect(week2Workout?.scheduled_date).toBe('2024-01-08');
    });
  });

  describe('getActive', () => {
    it('should return null when no active mesocycle exists', () => {
      const result = service.getActive();
      expect(result).toBeNull();
    });

    it('should return the active mesocycle with details', () => {
      const { planId } = createTestPlanWithDays(2);

      service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const result = service.getActive();

      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
      expect(result!.plan_name).toBe('Test Plan');
      expect(result!.weeks).toHaveLength(7);
    });

    it('should not return completed mesocycles', () => {
      const { planId } = createTestPlanWithDays(2);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      service.complete(mesocycle.id);

      const result = service.getActive();
      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('should return mesocycle with full details', () => {
      const { planId } = createTestPlanWithDays(2);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const result = service.getById(mesocycle.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(mesocycle.id);
      expect(result!.plan_name).toBe('Test Plan');
      expect(result!.weeks).toHaveLength(7);
      expect(result!.total_workouts).toBe(14); // 7 weeks * 2 days
    });

    it('should return null for non-existent mesocycle', () => {
      const result = service.getById(999);
      expect(result).toBeNull();
    });

    it('should include workout summaries in weeks', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const result = service.getById(mesocycle.id);

      expect(result!.weeks[0].workouts).toHaveLength(1);
      expect(result!.weeks[0].workouts[0].plan_day_name).toBe('Day 1');
      expect(result!.weeks[0].workouts[0].status).toBe('pending');
    });

    it('should correctly mark deload week', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const result = service.getById(mesocycle.id);

      // Weeks 1-6 should not be deload
      for (let i = 0; i < 6; i++) {
        expect(result!.weeks[i].is_deload).toBe(false);
      }

      // Week 7 should be deload
      expect(result!.weeks[6].is_deload).toBe(true);
    });
  });

  describe('list', () => {
    it('should return empty array when no mesocycles exist', () => {
      const result = service.list();
      expect(result).toEqual([]);
    });

    it('should return all mesocycles ordered by start_date desc', () => {
      const { planId: planId1 } = createTestPlanWithDays(1);

      const meso1 = service.create({
        plan_id: planId1,
        start_date: '2024-01-01',
      });

      // Complete first mesocycle so we can create another
      service.complete(meso1.id);

      const meso2 = service.create({
        plan_id: planId1,
        start_date: '2024-03-01',
      });

      const result = service.list();

      expect(result).toHaveLength(2);
      // Most recent first
      expect(result[0].id).toBe(meso2.id);
      expect(result[1].id).toBe(meso1.id);
    });
  });

  describe('complete', () => {
    it('should mark mesocycle as completed', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const result = service.complete(mesocycle.id);

      expect(result.status).toBe('completed');
    });

    it('should throw error for non-existent mesocycle', () => {
      expect(() => service.complete(999)).toThrow(
        'Mesocycle with id 999 not found'
      );
    });

    it('should throw error if mesocycle is not active', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      service.complete(mesocycle.id);

      expect(() => service.complete(mesocycle.id)).toThrow(
        'Mesocycle is not active'
      );
    });

    it('should allow creating new mesocycle after completion', () => {
      const { planId } = createTestPlanWithDays(1);

      const meso1 = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      service.complete(meso1.id);

      // Should not throw
      const meso2 = service.create({
        plan_id: planId,
        start_date: '2024-03-01',
      });

      expect(meso2.status).toBe('active');
    });
  });

  describe('cancel', () => {
    it('should mark mesocycle as cancelled', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const result = service.cancel(mesocycle.id);

      expect(result.status).toBe('cancelled');
    });

    it('should preserve workout data when cancelled', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      service.cancel(mesocycle.id);

      const repos = createRepositories(db);
      const workouts = repos.workout.findByMesocycleId(mesocycle.id);

      // Workouts should still exist
      expect(workouts.length).toBeGreaterThan(0);
    });

    it('should throw error for non-existent mesocycle', () => {
      expect(() => service.cancel(999)).toThrow(
        'Mesocycle with id 999 not found'
      );
    });

    it('should throw error if mesocycle is not active', () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycle = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      service.cancel(mesocycle.id);

      expect(() => service.cancel(mesocycle.id)).toThrow(
        'Mesocycle is not active'
      );
    });

    it('should allow creating new mesocycle after cancellation', () => {
      const { planId } = createTestPlanWithDays(1);

      const meso1 = service.create({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      service.cancel(meso1.id);

      // Should not throw
      const meso2 = service.create({
        plan_id: planId,
        start_date: '2024-03-01',
      });

      expect(meso2.status).toBe('active');
    });
  });

  describe('calculateProgression', () => {
    it('should use custom weight_increment per exercise', () => {
      const repos = createRepositories(db);

      // Create exercise with custom weight increment
      const exercise = repos.exercise.create({
        name: 'Custom Increment Exercise',
        weight_increment: 2.5,
      });

      const plan = repos.plan.create({ name: 'Test Plan', duration_weeks: 6 });
      const day = repos.planDay.create({
        plan_id: plan.id,
        day_of_week: 1,
        name: 'Day 1',
        sort_order: 0,
      });

      repos.planDayExercise.create({
        plan_day_id: day.id,
        exercise_id: exercise.id,
        sets: 3,
        reps: 10,
        weight: 100,
        rest_seconds: 90,
        sort_order: 0,
      });

      const mesocycle = service.create({
        plan_id: plan.id,
        start_date: '2024-01-01',
      });

      const workouts = repos.workout.findByMesocycleId(mesocycle.id);

      // Week 2: +2.5 lbs = 102.5
      const week2Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 2)!.id
      );
      expect(week2Sets[0].target_weight).toBe(102.5);

      // Week 4: +2.5 lbs = 105
      const week4Sets = repos.workoutSet.findByWorkoutId(
        workouts.find((w) => w.week_number === 4)!.id
      );
      expect(week4Sets[0].target_weight).toBe(105);
    });
  });
});
