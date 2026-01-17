import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PlanModificationService } from '../plan-modification.service.js';
import { createRepositories } from '../../repositories/index.js';
import { ProgressionService } from '../progression.service.js';
import type {
  Plan,
  PlanDay,
  PlanDayExercise,
  Mesocycle,
  Workout,
  Exercise,
} from '@lifting/shared';

describe('PlanModificationService', () => {
  let db: Database.Database;
  let service: PlanModificationService;
  let repos: ReturnType<typeof createRepositories>;
  let progressionService: ProgressionService;

  // Test data
  let testPlan: Plan;
  let testPlanDay: PlanDay;
  let testExercise: Exercise;
  let testPlanDayExercise: PlanDayExercise;
  let testMesocycle: Mesocycle;
  let testWorkouts: Workout[];

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create schema
    db.exec(`
      CREATE TABLE exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        weight_increment REAL DEFAULT 5,
        is_custom BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        duration_weeks INTEGER DEFAULT 6,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE plan_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
      );

      CREATE TABLE plan_day_exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_day_id INTEGER NOT NULL,
        exercise_id INTEGER NOT NULL,
        sets INTEGER DEFAULT 2,
        reps INTEGER DEFAULT 8,
        weight REAL DEFAULT 30.0,
        rest_seconds INTEGER DEFAULT 60,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (plan_day_id) REFERENCES plan_days(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id)
      );

      CREATE TABLE mesocycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        current_week INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      );

      CREATE TABLE workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mesocycle_id INTEGER NOT NULL,
        plan_day_id INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        scheduled_date TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (mesocycle_id) REFERENCES mesocycles(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_day_id) REFERENCES plan_days(id)
      );

      CREATE TABLE workout_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_id INTEGER NOT NULL,
        exercise_id INTEGER NOT NULL,
        set_number INTEGER NOT NULL,
        target_reps INTEGER NOT NULL,
        target_weight REAL NOT NULL,
        actual_reps INTEGER,
        actual_weight REAL,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id)
      );
    `);

    repos = createRepositories(db);
    progressionService = new ProgressionService();
    service = new PlanModificationService(repos, progressionService);

    // Seed test data
    testExercise = repos.exercise.create({
      name: 'Bench Press',
      weight_increment: 5,
    });

    testPlan = repos.plan.create({
      name: 'Test Plan',
      duration_weeks: 6,
    });

    testPlanDay = repos.planDay.create({
      plan_id: testPlan.id,
      day_of_week: 1, // Monday
      name: 'Monday',
      sort_order: 0,
    });

    testPlanDayExercise = repos.planDayExercise.create({
      plan_day_id: testPlanDay.id,
      exercise_id: testExercise.id,
      sets: 3,
      reps: 8,
      weight: 100,
      rest_seconds: 60,
      sort_order: 0,
    });

    // Create mesocycle starting today
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Started 1 week ago

    testMesocycle = repos.mesocycle.create({
      plan_id: testPlan.id,
      start_date: startDate.toISOString().split('T')[0] ?? '',
    });

    // Create workouts for all 7 weeks
    testWorkouts = [];
    for (let week = 0; week <= 6; week++) {
      const workoutDate = new Date(startDate);
      workoutDate.setDate(workoutDate.getDate() + week * 7);

      const workout = repos.workout.create({
        mesocycle_id: testMesocycle.id,
        plan_day_id: testPlanDay.id,
        week_number: week,
        scheduled_date: workoutDate.toISOString().split('T')[0] ?? '',
      });

      // Create workout sets for the exercise
      for (let setNum = 1; setNum <= 3; setNum++) {
        repos.workoutSet.create({
          workout_id: workout.id,
          exercise_id: testExercise.id,
          set_number: setNum,
          target_reps: 8,
          target_weight: 100,
        });
      }

      testWorkouts.push(workout);
    }

    // Mark week 0 as completed
    const week0Workout = testWorkouts[0];
    if (week0Workout !== undefined) {
      repos.workout.update(week0Workout.id, { status: 'completed' });
    }
  });

  describe('getFutureWorkouts', () => {
    it('should return workouts with scheduled date after now', () => {
      const futureWorkouts = service.getFutureWorkouts(testMesocycle.id);

      // Week 0 is completed, week 1+ should be future
      expect(futureWorkouts.length).toBeGreaterThan(0);
      expect(futureWorkouts.every((w) => w.status !== 'completed')).toBe(true);
    });

    it('should exclude completed workouts', () => {
      const futureWorkouts = service.getFutureWorkouts(testMesocycle.id);

      const week0 = testWorkouts[0];
      if (week0 !== undefined) {
        const completedWorkout = futureWorkouts.find((w) => w.id === week0.id);
        expect(completedWorkout).toBeUndefined();
      }
    });

    it('should exclude in-progress workouts', () => {
      // Mark week 1 as in_progress
      const week1 = testWorkouts[1];
      if (week1 !== undefined) {
        repos.workout.update(week1.id, { status: 'in_progress' });

        const futureWorkouts = service.getFutureWorkouts(testMesocycle.id);

        const inProgressWorkout = futureWorkouts.find((w) => w.id === week1.id);
        expect(inProgressWorkout).toBeUndefined();
      }
    });

    it('should include pending workouts scheduled for today', () => {
      // Create a workout scheduled for today
      const today = new Date().toISOString().split('T')[0] ?? '';
      const todayWorkout = repos.workout.create({
        mesocycle_id: testMesocycle.id,
        plan_day_id: testPlanDay.id,
        week_number: 1,
        scheduled_date: today,
      });

      const futureWorkouts = service.getFutureWorkouts(testMesocycle.id);

      const foundTodayWorkout = futureWorkouts.find(
        (w) => w.id === todayWorkout.id
      );
      expect(foundTodayWorkout).toBeDefined();
    });
  });

  describe('diffPlanDayExercises', () => {
    it('should detect added exercises', () => {
      // Add a new exercise to the plan
      const newExercise = repos.exercise.create({
        name: 'Squat',
        weight_increment: 5,
      });

      const newPlanDayExercise = repos.planDayExercise.create({
        plan_day_id: testPlanDay.id,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 1,
      });

      const oldExercises = [testPlanDayExercise];
      const newExercises = [testPlanDayExercise, newPlanDayExercise];

      const diff = service.diffPlanDayExercises(
        testPlanDay.id,
        oldExercises,
        newExercises
      );

      expect(diff.addedExercises).toHaveLength(1);
      const added = diff.addedExercises[0];
      expect(added?.exerciseId).toBe(newExercise.id);
    });

    it('should detect removed exercises', () => {
      const oldExercises = [testPlanDayExercise];
      const newExercises: PlanDayExercise[] = [];

      const diff = service.diffPlanDayExercises(
        testPlanDay.id,
        oldExercises,
        newExercises
      );

      expect(diff.removedExercises).toHaveLength(1);
      const removed = diff.removedExercises[0];
      expect(removed?.exerciseId).toBe(testExercise.id);
    });

    it('should detect modified exercise parameters', () => {
      // Create a modified version with different parameters
      const modifiedPlanDayExercise: PlanDayExercise = {
        ...testPlanDayExercise,
        sets: 4, // Changed from 3
        reps: 10, // Changed from 8
        weight: 110, // Changed from 100
        rest_seconds: 90, // Changed from 60
      };

      const oldExercises = [testPlanDayExercise];
      const newExercises = [modifiedPlanDayExercise];

      const diff = service.diffPlanDayExercises(
        testPlanDay.id,
        oldExercises,
        newExercises
      );

      expect(diff.modifiedExercises).toHaveLength(1);
      const modification = diff.modifiedExercises[0];
      expect(modification?.changes.sets).toBe(4);
      expect(modification?.changes.reps).toBe(10);
      expect(modification?.changes.weight).toBe(110);
      expect(modification?.changes.rest_seconds).toBe(90);
    });
  });

  describe('addExerciseToFutureWorkouts', () => {
    it('should create workout_sets for matching plan days', () => {
      const newExercise = repos.exercise.create({
        name: 'Squat',
        weight_increment: 5,
      });

      const newPde = repos.planDayExercise.create({
        plan_day_id: testPlanDay.id,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 1,
      });

      const initialSetCount = repos.workoutSet.findAll().length;

      const result = service.addExerciseToFutureWorkouts(
        testMesocycle.id,
        testPlanDay.id,
        newPde,
        newExercise
      );

      const finalSetCount = repos.workoutSet.findAll().length;

      expect(result.addedSetsCount).toBeGreaterThan(0);
      expect(finalSetCount).toBeGreaterThan(initialSetCount);
    });
  });

  describe('removeExerciseFromFutureWorkouts', () => {
    it('should delete workout_sets for future workouts', () => {
      const initialSetCount = repos.workoutSet.findAll().length;

      const result = service.removeExerciseFromFutureWorkouts(
        testMesocycle.id,
        testPlanDay.id,
        testExercise.id
      );

      const finalSetCount = repos.workoutSet.findAll().length;

      expect(result.removedSetsCount).toBeGreaterThan(0);
      expect(finalSetCount).toBeLessThan(initialSetCount);
    });

    it('should preserve workout_sets with logged data', () => {
      // Mark a set as completed with actual data
      const futureWorkouts = service.getFutureWorkouts(testMesocycle.id);
      const workoutWithSets = futureWorkouts[0];

      if (workoutWithSets !== undefined) {
        const sets = repos.workoutSet.findByWorkoutAndExercise(
          workoutWithSets.id,
          testExercise.id
        );

        const firstSet = sets[0];
        if (firstSet !== undefined) {
          // Log actual data
          repos.workoutSet.update(firstSet.id, {
            actual_reps: 8,
            actual_weight: 100,
            status: 'completed',
          });
        }
      }

      const result = service.removeExerciseFromFutureWorkouts(
        testMesocycle.id,
        testPlanDay.id,
        testExercise.id
      );

      expect(result.preservedCount).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should not affect past workouts', () => {
      // Week 0 is completed (past)
      const pastWorkout = testWorkouts[0];
      if (pastWorkout === undefined) {
        throw new Error('Past workout not found');
      }

      const pastSets = repos.workoutSet.findByWorkoutId(pastWorkout.id);
      const pastSetCount = pastSets.length;

      service.removeExerciseFromFutureWorkouts(
        testMesocycle.id,
        testPlanDay.id,
        testExercise.id
      );

      // Past workout sets should remain unchanged
      const pastSetsAfter = repos.workoutSet.findByWorkoutId(pastWorkout.id);
      expect(pastSetsAfter.length).toBe(pastSetCount);
    });
  });

  describe('applyDiffToMesocycle', () => {
    it('should process all detected changes', () => {
      // Add a new exercise
      const newExercise = repos.exercise.create({
        name: 'Squat',
        weight_increment: 5,
      });

      const newPde = repos.planDayExercise.create({
        plan_day_id: testPlanDay.id,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 1,
      });

      // Modify existing exercise
      const modifiedPde: PlanDayExercise = {
        ...testPlanDayExercise,
        sets: 4,
        reps: 10,
      };

      const oldExercises = [testPlanDayExercise];
      const newExercises = [modifiedPde, newPde];

      const diff = service.diffPlanDayExercises(
        testPlanDay.id,
        oldExercises,
        newExercises
      );

      const result = service.applyDiffToMesocycle(testMesocycle.id, diff, [
        { exercise: newExercise, pde: newPde },
      ]);

      expect(result.affectedWorkoutCount).toBeGreaterThan(0);
      expect(result.addedSetsCount).toBeGreaterThan(0);
      expect(result.modifiedSetsCount).toBeGreaterThan(0);
    });

    it('should return summary of changes', () => {
      const newExercise = repos.exercise.create({
        name: 'Squat',
        weight_increment: 5,
      });

      const newPde = repos.planDayExercise.create({
        plan_day_id: testPlanDay.id,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 1,
      });

      const oldExercises: PlanDayExercise[] = [];
      const newExercises = [newPde];

      const diff = service.diffPlanDayExercises(
        testPlanDay.id,
        oldExercises,
        newExercises
      );

      const result = service.applyDiffToMesocycle(testMesocycle.id, diff, [
        { exercise: newExercise, pde: newPde },
      ]);

      expect(typeof result.affectedWorkoutCount).toBe('number');
      expect(typeof result.addedSetsCount).toBe('number');
      expect(typeof result.removedSetsCount).toBe('number');
      expect(typeof result.modifiedSetsCount).toBe('number');
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
