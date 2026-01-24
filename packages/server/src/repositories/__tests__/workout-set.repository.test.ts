import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WorkoutSetRepository } from '../workout-set.repository.js';
import { WorkoutRepository } from '../workout.repository.js';
import { MesocycleRepository } from '../mesocycle.repository.js';
import { PlanRepository } from '../plan.repository.js';
import { PlanDayRepository } from '../plan-day.repository.js';
import { ExerciseRepository } from '../exercise.repository.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';
import type { CompletedSetRow } from '../workout-set.repository.js';

describe('WorkoutSetRepository', () => {
  let db: Database.Database;
  let repository: WorkoutSetRepository;
  let workoutRepository: WorkoutRepository;
  let exerciseRepository: ExerciseRepository;
  let testWorkoutId: number;
  let testExerciseId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    repository = new WorkoutSetRepository(db);
    workoutRepository = new WorkoutRepository(db);
    exerciseRepository = new ExerciseRepository(db);

    // Create test data
    const planRepository = new PlanRepository(db);
    const planDayRepository = new PlanDayRepository(db);
    const mesocycleRepository = new MesocycleRepository(db);

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
    const workout = workoutRepository.create({
      mesocycle_id: mesocycle.id,
      plan_day_id: planDay.id,
      week_number: 1,
      scheduled_date: '2024-01-01',
    });
    const exercise = exerciseRepository.create({ name: 'Bench Press' });

    testWorkoutId = workout.id;
    testExerciseId = exercise.id;
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a workout set with all fields', () => {
      const workoutSet = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });

      expect(workoutSet).toMatchObject({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      });
      expect(workoutSet.id).toBeDefined();
    });

    it('should reject duplicate set_number for same workout/exercise', () => {
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });

      expect(() =>
        repository.create({
          workout_id: testWorkoutId,
          exercise_id: testExerciseId,
          set_number: 1,
          target_reps: 10,
          target_weight: 135,
        })
      ).toThrow();
    });

    it('should allow same set_number for different exercises', () => {
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });

      const exercise2 = exerciseRepository.create({ name: 'Squat' });

      const workoutSet = repository.create({
        workout_id: testWorkoutId,
        exercise_id: exercise2.id,
        set_number: 1,
        target_reps: 8,
        target_weight: 225,
      });

      expect(workoutSet.set_number).toBe(1);
    });

    it('should reject non-existent workout_id', () => {
      expect(() =>
        repository.create({
          workout_id: 999,
          exercise_id: testExerciseId,
          set_number: 1,
          target_reps: 10,
          target_weight: 135,
        })
      ).toThrow();
    });

    it('should reject non-existent exercise_id', () => {
      expect(() =>
        repository.create({
          workout_id: testWorkoutId,
          exercise_id: 999,
          set_number: 1,
          target_reps: 10,
          target_weight: 135,
        })
      ).toThrow();
    });
  });

  describe('findById', () => {
    it('should return workout set when found', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const found = repository.findById(created.id);
      expect(found).toEqual(created);
    });

    it('should return null when not found', () => {
      const found = repository.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('findByWorkoutId', () => {
    it('should return all sets for a workout ordered by exercise and set_number', () => {
      const exercise2 = exerciseRepository.create({ name: 'Squat' });

      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 2,
        target_reps: 10,
        target_weight: 135,
      });
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: exercise2.id,
        set_number: 1,
        target_reps: 8,
        target_weight: 225,
      });

      const sets = repository.findByWorkoutId(testWorkoutId);
      expect(sets).toHaveLength(3);
    });

    it('should return empty array for workout with no sets', () => {
      const sets = repository.findByWorkoutId(testWorkoutId);
      expect(sets).toEqual([]);
    });
  });

  describe('findByWorkoutAndExercise', () => {
    it('should return all sets for a specific workout/exercise ordered by set_number', () => {
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 2,
        target_reps: 10,
        target_weight: 135,
      });
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });

      const sets = repository.findByWorkoutAndExercise(
        testWorkoutId,
        testExerciseId
      );
      expect(sets).toHaveLength(2);
      expect(sets[0].set_number).toBe(1);
      expect(sets[1].set_number).toBe(2);
    });
  });

  describe('findByStatus', () => {
    it('should return only sets with matching status', () => {
      const pending = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const completed = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 2,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(completed.id, {
        status: 'completed',
        actual_reps: 10,
        actual_weight: 135,
      });

      const pendingSets = repository.findByStatus('pending');
      expect(pendingSets).toHaveLength(1);
      expect(pendingSets[0].id).toBe(pending.id);

      const completedSets = repository.findByStatus('completed');
      expect(completedSets).toHaveLength(1);
      expect(completedSets[0].id).toBe(completed.id);
    });
  });

  describe('findAll', () => {
    it('should return all workout sets', () => {
      repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });

      const sets = repository.findAll();
      expect(sets).toHaveLength(1);
    });

    it('should return empty array when none exist', () => {
      const sets = repository.findAll();
      expect(sets).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update actual_reps', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const updated = repository.update(created.id, { actual_reps: 8 });

      expect(updated?.actual_reps).toBe(8);
    });

    it('should update actual_weight', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const updated = repository.update(created.id, { actual_weight: 140 });

      expect(updated?.actual_weight).toBe(140);
    });

    it('should update status to completed', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const updated = repository.update(created.id, { status: 'completed' });

      expect(updated?.status).toBe('completed');
    });

    it('should update status to skipped', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const updated = repository.update(created.id, { status: 'skipped' });

      expect(updated?.status).toBe('skipped');
    });

    it('should update multiple fields', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const updated = repository.update(created.id, {
        actual_reps: 10,
        actual_weight: 135,
        status: 'completed',
      });

      expect(updated?.actual_reps).toBe(10);
      expect(updated?.actual_weight).toBe(135);
      expect(updated?.status).toBe('completed');
    });

    it('should allow setting actual_reps to null', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(created.id, { actual_reps: 8 });
      const updated = repository.update(created.id, { actual_reps: null });

      expect(updated?.actual_reps).toBeNull();
    });

    it('should return null for non-existent id', () => {
      const updated = repository.update(999, { actual_reps: 10 });
      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing workout set', () => {
      const created = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.findById(created.id)).toBeNull();
    });

    it('should return false for non-existent id', () => {
      const deleted = repository.delete(999);
      expect(deleted).toBe(false);
    });

    it('should cascade delete when workout is deleted', () => {
      const workoutSet = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });

      workoutRepository.delete(testWorkoutId);

      expect(repository.findById(workoutSet.id)).toBeNull();
    });
  });

  describe('findCompletedByExerciseId', () => {
    let planRepository: PlanRepository;
    let planDayRepository: PlanDayRepository;
    let mesocycleRepository: MesocycleRepository;

    beforeEach(() => {
      planRepository = new PlanRepository(db);
      planDayRepository = new PlanDayRepository(db);
      mesocycleRepository = new MesocycleRepository(db);
    });

    function createCompletedWorkoutWithSets(options: {
      exerciseId: number;
      mesocycleId: number;
      planDayId: number;
      weekNumber: number;
      scheduledDate: string;
      completedAt: string | null;
      sets: Array<{
        setNumber: number;
        actualWeight: number | null;
        actualReps: number | null;
        status: 'completed' | 'skipped' | 'pending';
      }>;
      workoutStatus?: 'completed' | 'pending' | 'skipped' | 'in_progress';
    }): number {
      const workout = workoutRepository.create({
        mesocycle_id: options.mesocycleId,
        plan_day_id: options.planDayId,
        week_number: options.weekNumber,
        scheduled_date: options.scheduledDate,
      });

      const workoutStatus = options.workoutStatus ?? 'completed';
      workoutRepository.update(workout.id, {
        status: workoutStatus,
        started_at: options.completedAt ?? options.scheduledDate,
        completed_at: workoutStatus === 'completed' ? options.completedAt : null,
      });

      for (const set of options.sets) {
        const created = repository.create({
          workout_id: workout.id,
          exercise_id: options.exerciseId,
          set_number: set.setNumber,
          target_reps: 10,
          target_weight: set.actualWeight ?? 100,
        });
        repository.update(created.id, {
          actual_weight: set.actualWeight,
          actual_reps: set.actualReps,
          status: set.status,
        });
      }

      return workout.id;
    }

    it('should return only completed sets from completed workouts', () => {
      // Mark the default workout as completed
      workoutRepository.update(testWorkoutId, {
        status: 'completed',
        started_at: '2024-01-01T09:00:00Z',
        completed_at: '2024-01-01T10:00:00Z',
      });

      // Create a completed set
      const set1 = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(set1.id, {
        actual_weight: 135,
        actual_reps: 10,
        status: 'completed',
      });

      // Create a skipped set (same workout)
      const set2 = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 2,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(set2.id, {
        status: 'skipped',
      });

      const results = repository.findCompletedByExerciseId(testExerciseId);

      expect(results).toHaveLength(1);
      expect(results[0]?.actual_weight).toBe(135);
      expect(results[0]?.actual_reps).toBe(10);
    });

    it('should exclude sets with null actual_weight or actual_reps', () => {
      workoutRepository.update(testWorkoutId, {
        status: 'completed',
        started_at: '2024-01-01T09:00:00Z',
        completed_at: '2024-01-01T10:00:00Z',
      });

      // Set with null actual_weight
      const set1 = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(set1.id, {
        actual_weight: null,
        actual_reps: 10,
        status: 'completed',
      });

      // Set with null actual_reps
      const set2 = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 2,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(set2.id, {
        actual_weight: 135,
        actual_reps: null,
        status: 'completed',
      });

      // Set with both values present
      const set3 = repository.create({
        workout_id: testWorkoutId,
        exercise_id: testExerciseId,
        set_number: 3,
        target_reps: 10,
        target_weight: 135,
      });
      repository.update(set3.id, {
        actual_weight: 135,
        actual_reps: 10,
        status: 'completed',
      });

      const results = repository.findCompletedByExerciseId(testExerciseId);

      expect(results).toHaveLength(1);
      expect(results[0]?.set_number).toBe(3);
    });

    it('should exclude sets from skipped/pending workouts', () => {
      const plan = planRepository.create({ name: 'History Plan' });
      const planDay = planDayRepository.create({
        plan_id: plan.id,
        day_of_week: 1,
        name: 'Day 1',
        sort_order: 0,
      });
      const mesocycle = mesocycleRepository.create({
        plan_id: plan.id,
        start_date: '2024-01-01',
      });

      // Completed workout with completed sets
      createCompletedWorkoutWithSets({
        exerciseId: testExerciseId,
        mesocycleId: mesocycle.id,
        planDayId: planDay.id,
        weekNumber: 1,
        scheduledDate: '2024-01-01',
        completedAt: '2024-01-01T10:00:00Z',
        sets: [{ setNumber: 1, actualWeight: 100, actualReps: 10, status: 'completed' }],
        workoutStatus: 'completed',
      });

      // Pending workout with completed sets (should be excluded)
      createCompletedWorkoutWithSets({
        exerciseId: testExerciseId,
        mesocycleId: mesocycle.id,
        planDayId: planDay.id,
        weekNumber: 2,
        scheduledDate: '2024-01-08',
        completedAt: null,
        sets: [{ setNumber: 1, actualWeight: 105, actualReps: 10, status: 'completed' }],
        workoutStatus: 'pending',
      });

      // Skipped workout with completed sets (should be excluded)
      createCompletedWorkoutWithSets({
        exerciseId: testExerciseId,
        mesocycleId: mesocycle.id,
        planDayId: planDay.id,
        weekNumber: 3,
        scheduledDate: '2024-01-15',
        completedAt: null,
        sets: [{ setNumber: 1, actualWeight: 110, actualReps: 10, status: 'completed' }],
        workoutStatus: 'skipped',
      });

      const results = repository.findCompletedByExerciseId(testExerciseId);

      expect(results).toHaveLength(1);
      expect(results[0]?.actual_weight).toBe(100);
    });

    it('should return results ordered by date ascending, then set_number', () => {
      const plan = planRepository.create({ name: 'History Plan' });
      const planDay = planDayRepository.create({
        plan_id: plan.id,
        day_of_week: 1,
        name: 'Day 1',
        sort_order: 0,
      });
      const mesocycle = mesocycleRepository.create({
        plan_id: plan.id,
        start_date: '2024-01-01',
      });

      // Second workout (later date)
      createCompletedWorkoutWithSets({
        exerciseId: testExerciseId,
        mesocycleId: mesocycle.id,
        planDayId: planDay.id,
        weekNumber: 2,
        scheduledDate: '2024-01-08',
        completedAt: '2024-01-08T10:00:00Z',
        sets: [
          { setNumber: 2, actualWeight: 110, actualReps: 10, status: 'completed' },
          { setNumber: 1, actualWeight: 110, actualReps: 10, status: 'completed' },
        ],
        workoutStatus: 'completed',
      });

      // First workout (earlier date)
      createCompletedWorkoutWithSets({
        exerciseId: testExerciseId,
        mesocycleId: mesocycle.id,
        planDayId: planDay.id,
        weekNumber: 1,
        scheduledDate: '2024-01-01',
        completedAt: '2024-01-01T10:00:00Z',
        sets: [
          { setNumber: 1, actualWeight: 100, actualReps: 10, status: 'completed' },
          { setNumber: 2, actualWeight: 100, actualReps: 10, status: 'completed' },
        ],
        workoutStatus: 'completed',
      });

      const results = repository.findCompletedByExerciseId(testExerciseId);

      expect(results).toHaveLength(4);
      // First workout should come first (earlier completed_at)
      expect(results[0]?.actual_weight).toBe(100);
      expect(results[0]?.set_number).toBe(1);
      expect(results[1]?.actual_weight).toBe(100);
      expect(results[1]?.set_number).toBe(2);
      // Second workout next
      expect(results[2]?.actual_weight).toBe(110);
      expect(results[2]?.set_number).toBe(1);
      expect(results[3]?.actual_weight).toBe(110);
      expect(results[3]?.set_number).toBe(2);
    });

    it('should return empty array for exercise with no history', () => {
      const exercise2 = exerciseRepository.create({ name: 'No History Exercise' });

      const results = repository.findCompletedByExerciseId(exercise2.id);

      expect(results).toEqual([]);
    });

    it('should include workout metadata (week_number, mesocycle_id, dates)', () => {
      const plan = planRepository.create({ name: 'History Plan' });
      const planDay = planDayRepository.create({
        plan_id: plan.id,
        day_of_week: 1,
        name: 'Day 1',
        sort_order: 0,
      });
      const mesocycle = mesocycleRepository.create({
        plan_id: plan.id,
        start_date: '2024-01-01',
      });

      createCompletedWorkoutWithSets({
        exerciseId: testExerciseId,
        mesocycleId: mesocycle.id,
        planDayId: planDay.id,
        weekNumber: 3,
        scheduledDate: '2024-01-15',
        completedAt: '2024-01-15T11:30:00Z',
        sets: [{ setNumber: 1, actualWeight: 150, actualReps: 8, status: 'completed' }],
        workoutStatus: 'completed',
      });

      const results = repository.findCompletedByExerciseId(testExerciseId);

      expect(results).toHaveLength(1);
      const row = results[0] as CompletedSetRow;
      expect(row.week_number).toBe(3);
      expect(row.mesocycle_id).toBe(mesocycle.id);
      expect(row.scheduled_date).toBe('2024-01-15');
      expect(row.completed_at).toBe('2024-01-15T11:30:00Z');
      expect(row.workout_id).toBeDefined();
      expect(row.exercise_id).toBe(testExerciseId);
    });
  });
});
