import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CalendarService, utcToLocalDate } from '../calendar.service.js';
import { Migrator } from '../../db/migrator.js';
import { migrations } from '../../db/migrations/index.js';
import { PlanRepository } from '../../repositories/plan.repository.js';
import { PlanDayRepository } from '../../repositories/plan-day.repository.js';
import { MesocycleRepository } from '../../repositories/mesocycle.repository.js';
import { WorkoutRepository } from '../../repositories/workout.repository.js';
import { WorkoutSetRepository } from '../../repositories/workout-set.repository.js';
import { ExerciseRepository } from '../../repositories/exercise.repository.js';
import { StretchSessionRepository } from '../../repositories/stretchSession.repository.js';

describe('CalendarService', () => {
  let db: Database.Database;
  let service: CalendarService;
  let planRepo: PlanRepository;
  let planDayRepo: PlanDayRepository;
  let mesocycleRepo: MesocycleRepository;
  let workoutRepo: WorkoutRepository;
  let workoutSetRepo: WorkoutSetRepository;
  let exerciseRepo: ExerciseRepository;
  let stretchSessionRepo: StretchSessionRepository;

  // Test data IDs
  let testPlanId: number;
  let testPlanDayId: number;
  let testMesocycleId: number;
  let testExerciseId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const migrator = new Migrator(db, migrations);
    migrator.up();

    service = new CalendarService(db);
    planRepo = new PlanRepository(db);
    planDayRepo = new PlanDayRepository(db);
    mesocycleRepo = new MesocycleRepository(db);
    workoutRepo = new WorkoutRepository(db);
    workoutSetRepo = new WorkoutSetRepository(db);
    exerciseRepo = new ExerciseRepository(db);
    stretchSessionRepo = new StretchSessionRepository(db);

    // Create base test data
    const plan = planRepo.create({ name: 'Test Plan' });
    testPlanId = plan.id;

    const planDay = planDayRepo.create({
      plan_id: testPlanId,
      day_of_week: 1,
      name: 'Push Day',
      sort_order: 0,
    });
    testPlanDayId = planDay.id;

    const mesocycle = mesocycleRepo.create({
      plan_id: testPlanId,
      start_date: '2024-01-01',
    });
    testMesocycleId = mesocycle.id;

    const exercise = exerciseRepo.create({
      name: 'Bench Press',
      weight_increment: 5,
    });
    testExerciseId = exercise.id;
  });

  afterEach(() => {
    db.close();
  });

  describe('getMonthData', () => {
    it('should return empty data for a month with no activities', () => {
      const result = service.getMonthData(2024, 1);

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
      expect(result.days).toEqual({});
    });

    it('should correctly calculate month boundaries for January', () => {
      const result = service.getMonthData(2024, 1);

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
    });

    it('should correctly calculate month boundaries for February in leap year', () => {
      const result = service.getMonthData(2024, 2);

      expect(result.startDate).toBe('2024-02-01');
      expect(result.endDate).toBe('2024-02-29');
    });

    it('should correctly calculate month boundaries for February in non-leap year', () => {
      const result = service.getMonthData(2023, 2);

      expect(result.startDate).toBe('2023-02-01');
      expect(result.endDate).toBe('2023-02-28');
    });

    it('should correctly calculate month boundaries for December', () => {
      const result = service.getMonthData(2024, 12);

      expect(result.startDate).toBe('2024-12-01');
      expect(result.endDate).toBe('2024-12-31');
    });

    describe('workout activities', () => {
      it('should transform completed workout to CalendarActivity', () => {
        // Create a workout and complete it
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });

        // Add workout sets
        workoutSetRepo.create({
          workout_id: workout.id,
          exercise_id: testExerciseId,
          set_number: 1,
          target_reps: 10,
          target_weight: 100,
        });
        workoutSetRepo.create({
          workout_id: workout.id,
          exercise_id: testExerciseId,
          set_number: 2,
          target_reps: 10,
          target_weight: 100,
        });

        // Complete one set
        const sets = workoutSetRepo.findByWorkoutId(workout.id);
        workoutSetRepo.update(sets[0].id, {
          status: 'completed',
          actual_reps: 10,
          actual_weight: 100,
        });

        // Complete the workout
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days['2024-01-15']).toBeDefined();
        const dayData = result.days['2024-01-15'];
        expect(dayData.activities).toHaveLength(1);

        const activity = dayData.activities[0];
        expect(activity.type).toBe('workout');
        expect(activity.id).toBe(`workout-${workout.id}`);
        expect(activity.date).toBe('2024-01-15');
        expect(activity.completedAt).toBe('2024-01-15T10:30:00.000Z');

        // Check workout-specific summary
        expect(activity.summary).toMatchObject({
          dayName: 'Push Day',
          exerciseCount: 1,
          setsCompleted: 1,
          totalSets: 2,
          weekNumber: 1,
          isDeload: false,
        });
      });

      it('should mark week 7 workouts as deload', () => {
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 7,
          scheduled_date: '2024-01-15',
        });

        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);
        const activity = result.days['2024-01-15'].activities[0];

        expect(activity.summary).toMatchObject({
          isDeload: true,
        });
      });

      it('should count unique exercises correctly', () => {
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });

        // Add sets for first exercise
        workoutSetRepo.create({
          workout_id: workout.id,
          exercise_id: testExerciseId,
          set_number: 1,
          target_reps: 10,
          target_weight: 100,
        });
        workoutSetRepo.create({
          workout_id: workout.id,
          exercise_id: testExerciseId,
          set_number: 2,
          target_reps: 10,
          target_weight: 100,
        });

        // Add sets for second exercise
        const exercise2 = exerciseRepo.create({
          name: 'Overhead Press',
          weight_increment: 5,
        });
        workoutSetRepo.create({
          workout_id: workout.id,
          exercise_id: exercise2.id,
          set_number: 1,
          target_reps: 10,
          target_weight: 50,
        });

        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);
        const activity = result.days['2024-01-15'].activities[0];

        expect(activity.summary).toMatchObject({
          exerciseCount: 2,
          totalSets: 3,
        });
      });

      it('should not include pending workouts', () => {
        workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days).toEqual({});
      });

      it('should not include in_progress workouts', () => {
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days).toEqual({});
      });

      it('should not include skipped workouts', () => {
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, { status: 'skipped' });

        const result = service.getMonthData(2024, 1);

        expect(result.days).toEqual({});
      });
    });

    describe('stretch activities', () => {
      it('should transform stretch session to CalendarActivity', () => {
        const session = stretchSessionRepo.create({
          completedAt: '2024-01-15T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 1,
          stretches: [
            {
              region: 'neck',
              stretchName: 'Neck Tilt',
              side: 'left',
              durationSeconds: 30,
              skipped: false,
            },
          ],
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days['2024-01-15']).toBeDefined();
        const dayData = result.days['2024-01-15'];
        expect(dayData.activities).toHaveLength(1);

        const activity = dayData.activities[0];
        expect(activity.type).toBe('stretch');
        expect(activity.id).toBe(`stretch-${session.id}`);
        expect(activity.date).toBe('2024-01-15');
        expect(activity.completedAt).toBe('2024-01-15T08:00:00.000Z');

        // Check stretch-specific summary
        expect(activity.summary).toMatchObject({
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 1,
        });
      });
    });

    describe('grouping by date', () => {
      it('should group multiple activities on same day', () => {
        // Create stretch session
        stretchSessionRepo.create({
          completedAt: '2024-01-15T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        // Create completed workout
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days['2024-01-15']).toBeDefined();
        const dayData = result.days['2024-01-15'];
        expect(dayData.activities).toHaveLength(2);
        expect(dayData.summary.totalActivities).toBe(2);
        expect(dayData.summary.completedActivities).toBe(2);
        expect(dayData.summary.hasWorkout).toBe(true);
        expect(dayData.summary.hasStretch).toBe(true);
        expect(dayData.summary.hasMeditation).toBe(false);
      });

      it('should order activities by completion time', () => {
        // Stretch at 8am
        stretchSessionRepo.create({
          completedAt: '2024-01-15T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        // Workout at 10:30am
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);
        const activities = result.days['2024-01-15'].activities;

        // Stretch should come first (earlier completion time)
        expect(activities[0].type).toBe('stretch');
        expect(activities[1].type).toBe('workout');
      });

      it('should separate activities on different days', () => {
        stretchSessionRepo.create({
          completedAt: '2024-01-15T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        stretchSessionRepo.create({
          completedAt: '2024-01-20T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        const result = service.getMonthData(2024, 1);

        expect(Object.keys(result.days)).toHaveLength(2);
        expect(result.days['2024-01-15']).toBeDefined();
        expect(result.days['2024-01-20']).toBeDefined();
        expect(result.days['2024-01-15'].activities).toHaveLength(1);
        expect(result.days['2024-01-20'].activities).toHaveLength(1);
      });
    });

    describe('day summary', () => {
      it('should correctly calculate day summary', () => {
        stretchSessionRepo.create({
          completedAt: '2024-01-15T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);
        const summary = result.days['2024-01-15'].summary;

        expect(summary.totalActivities).toBe(2);
        expect(summary.completedActivities).toBe(2);
        expect(summary.hasWorkout).toBe(true);
        expect(summary.hasStretch).toBe(true);
        expect(summary.hasMeditation).toBe(false);
      });

      it('should set hasWorkout false when no workout', () => {
        stretchSessionRepo.create({
          completedAt: '2024-01-15T08:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        const result = service.getMonthData(2024, 1);
        const summary = result.days['2024-01-15'].summary;

        expect(summary.hasWorkout).toBe(false);
        expect(summary.hasStretch).toBe(true);
      });

      it('should set hasStretch false when no stretch', () => {
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:30:00.000Z',
        });

        const result = service.getMonthData(2024, 1);
        const summary = result.days['2024-01-15'].summary;

        expect(summary.hasWorkout).toBe(true);
        expect(summary.hasStretch).toBe(false);
      });
    });

    describe('date extraction from completedAt', () => {
      it('should extract date from ISO timestamp correctly', () => {
        stretchSessionRepo.create({
          completedAt: '2024-01-15T23:59:59.999Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days['2024-01-15']).toBeDefined();
        expect(result.days['2024-01-15'].date).toBe('2024-01-15');
      });

      it('should use completed_at for workout date extraction', () => {
        // Create workout scheduled for Jan 15 but completed on Jan 16
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-16T02:00:00.000Z',
        });

        const result = service.getMonthData(2024, 1);

        // Should be grouped by completion date, not scheduled date
        expect(result.days['2024-01-16']).toBeDefined();
        expect(result.days['2024-01-15']).toBeUndefined();
      });
    });

    describe('multiple workouts on same day', () => {
      it('should handle multiple workouts on same day', () => {
        // Create second plan day (different day_of_week to avoid unique constraint)
        const planDay2 = planDayRepo.create({
          plan_id: testPlanId,
          day_of_week: 2,
          name: 'Pull Day',
          sort_order: 1,
        });

        // Create and complete first workout
        const workout1 = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout1.id, {
          status: 'completed',
          completed_at: '2024-01-15T08:00:00.000Z',
        });

        // Create and complete second workout
        const workout2 = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: planDay2.id,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout2.id, {
          status: 'completed',
          completed_at: '2024-01-15T10:00:00.000Z',
        });

        const result = service.getMonthData(2024, 1);

        expect(result.days['2024-01-15'].activities).toHaveLength(2);
        expect(
          result.days['2024-01-15'].activities.filter((a) => a.type === 'workout')
        ).toHaveLength(2);
      });
    });

    describe('timezone handling', () => {
      it('should convert UTC timestamp to correct local date for EST (UTC-5)', () => {
        // 10 PM EST on Jan 15 = 3 AM UTC on Jan 16
        // EST has timezone offset of 300 minutes (5 hours * 60)
        const utcTimestamp = '2024-01-16T03:00:00.000Z';
        const estOffset = 300; // EST is UTC-5, so offset is positive

        const localDate = utcToLocalDate(utcTimestamp, estOffset);

        // Should be Jan 15 in EST, not Jan 16 (which is the UTC date)
        expect(localDate).toBe('2024-01-15');
      });

      it('should convert UTC timestamp to correct local date for UTC+2', () => {
        // 1 AM UTC+2 on Jan 16 = 11 PM UTC on Jan 15
        // UTC+2 has timezone offset of -120 minutes
        const utcTimestamp = '2024-01-15T23:00:00.000Z';
        const utcPlus2Offset = -120; // UTC+2 is negative offset

        const localDate = utcToLocalDate(utcTimestamp, utcPlus2Offset);

        // Should be Jan 16 in UTC+2
        expect(localDate).toBe('2024-01-16');
      });

      it('should show session at 10 PM EST on correct local date', () => {
        // Scenario: User completes stretch session at 10 PM EST on Jan 15
        // This is stored as 3 AM UTC on Jan 16
        stretchSessionRepo.create({
          completedAt: '2024-01-16T03:00:00.000Z', // 10 PM EST = 3 AM UTC next day
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        // Query with EST timezone offset (300 minutes)
        const result = service.getMonthData(2024, 1, 300);

        // Activity should appear on Jan 15 (local date), not Jan 16 (UTC date)
        expect(result.days['2024-01-15']).toBeDefined();
        expect(result.days['2024-01-16']).toBeUndefined();
        expect(result.days['2024-01-15'].activities[0].date).toBe('2024-01-15');
      });

      it('should show workout completed at 11:30 PM EST on correct local date', () => {
        // User completes workout at 11:30 PM EST on Jan 15
        // This is 4:30 AM UTC on Jan 16
        const workout = workoutRepo.create({
          mesocycle_id: testMesocycleId,
          plan_day_id: testPlanDayId,
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
        workoutRepo.update(workout.id, {
          status: 'completed',
          completed_at: '2024-01-16T04:30:00.000Z', // 11:30 PM EST
        });

        // Query with EST timezone offset
        const result = service.getMonthData(2024, 1, 300);

        // Should appear on Jan 15 in EST
        expect(result.days['2024-01-15']).toBeDefined();
        expect(result.days['2024-01-16']).toBeUndefined();
      });

      it('should include activities that cross month boundary correctly', () => {
        // Session at 10 PM EST on Jan 31 = 3 AM UTC on Feb 1
        stretchSessionRepo.create({
          completedAt: '2024-02-01T03:00:00.000Z', // 10 PM EST on Jan 31
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        // Query January with EST offset - should find the activity
        const januaryResult = service.getMonthData(2024, 1, 300);
        expect(januaryResult.days['2024-01-31']).toBeDefined();

        // Query February with EST offset - should NOT find the activity
        const februaryResult = service.getMonthData(2024, 2, 300);
        expect(februaryResult.days['2024-01-31']).toBeUndefined();
      });

      it('should default to UTC when no timezone offset is provided', () => {
        // Session at 3 AM UTC on Jan 16
        stretchSessionRepo.create({
          completedAt: '2024-01-16T03:00:00.000Z',
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
          stretches: [],
        });

        // Query without timezone offset (defaults to 0 / UTC)
        const result = service.getMonthData(2024, 1);

        // Should appear on Jan 16 (UTC date)
        expect(result.days['2024-01-16']).toBeDefined();
        expect(result.days['2024-01-15']).toBeUndefined();
      });
    });
  });
});
