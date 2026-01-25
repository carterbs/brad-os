import type { Database } from 'better-sqlite3';
import type {
  Workout,
  WorkoutSet,
  WorkoutExercise,
  ExerciseProgression,
  PreviousWeekPerformance,
} from '@brad-os/shared';
import {
  WorkoutRepository,
  WorkoutSetRepository,
  PlanDayRepository,
  PlanDayExerciseRepository,
  ExerciseRepository,
} from '../repositories/index.js';
import {
  DynamicProgressionService,
  type DynamicProgressionResult,
} from './dynamic-progression.service.js';

/**
 * Extended workout type with all sets grouped by exercise
 */
export interface WorkoutWithExercises extends Workout {
  plan_day_name: string;
  exercises: WorkoutExerciseWithSets[];
}

export interface WorkoutExerciseWithSets extends WorkoutExercise {
  rest_seconds: number;
}

export class WorkoutService {
  private workoutRepo: WorkoutRepository;
  private workoutSetRepo: WorkoutSetRepository;
  private planDayRepo: PlanDayRepository;
  private planDayExerciseRepo: PlanDayExerciseRepository;
  private exerciseRepo: ExerciseRepository;
  private progressionService: DynamicProgressionService;

  constructor(db: Database) {
    this.workoutRepo = new WorkoutRepository(db);
    this.workoutSetRepo = new WorkoutSetRepository(db);
    this.planDayRepo = new PlanDayRepository(db);
    this.planDayExerciseRepo = new PlanDayExerciseRepository(db);
    this.exerciseRepo = new ExerciseRepository(db);
    this.progressionService = new DynamicProgressionService();
  }

  /**
   * Get a workout by ID with all sets grouped by exercise
   */
  getById(id: number): WorkoutWithExercises | null {
    const workout = this.workoutRepo.findById(id);
    if (!workout) {
      return null;
    }

    return this.buildWorkoutWithExercises(workout);
  }

  /**
   * Get the next pending or in_progress workout.
   * Returns the first workout by scheduled_date that hasn't been completed or skipped,
   * regardless of whether its scheduled_date is today, past, or future.
   */
  getTodaysWorkout(): WorkoutWithExercises | null {
    const nextWorkout = this.workoutRepo.findNextPending();

    if (!nextWorkout) {
      return null;
    }

    return this.buildWorkoutWithExercises(nextWorkout);
  }

  /**
   * Start a workout (mark as in_progress)
   * Applies dynamic progression from previous week to update targets
   */
  start(id: number): Workout {
    const workout = this.workoutRepo.findById(id);
    if (!workout) {
      throw new Error(`Workout with id ${id} not found`);
    }

    if (workout.status === 'in_progress') {
      throw new Error('Workout is already in progress');
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot start a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot start a skipped workout');
    }

    // Apply dynamic progression and persist targets to DB before starting
    this.persistDynamicProgressionToSets(workout);

    const updated = this.workoutRepo.update(id, {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error(`Failed to update workout with id ${id}`);
    }

    return updated;
  }

  /**
   * Get previous week performance data for each exercise.
   * Returns the immediately previous week's actual performance (not peak of all weeks).
   * This is used by the dynamic progression algorithm.
   */
  private getPreviousWeekPerformance(
    workout: Workout
  ): Map<number, PreviousWeekPerformance> {
    const performanceByExercise = new Map<number, PreviousWeekPerformance>();

    // Week 1 has no previous week data
    if (workout.week_number <= 1) {
      return performanceByExercise;
    }

    // Get the immediately previous week's workout
    const previousWorkout = this.workoutRepo.findPreviousWeekWorkout(
      workout.mesocycle_id,
      workout.plan_day_id,
      workout.week_number
    );

    if (!previousWorkout || previousWorkout.status === 'skipped') {
      return performanceByExercise;
    }

    const previousSets = this.workoutSetRepo.findByWorkoutId(previousWorkout.id);
    const planDayExercises = this.planDayExerciseRepo.findByPlanDayId(
      workout.plan_day_id
    );

    // Build a map of plan day exercise configs for minReps lookup
    const pdeMap = new Map(planDayExercises.map((pde) => [pde.exercise_id, pde]));

    // Group completed sets by exercise
    const setsByExercise = new Map<
      number,
      Array<{
        actualWeight: number;
        actualReps: number;
        targetWeight: number;
        targetReps: number;
      }>
    >();

    for (const set of previousSets) {
      if (
        set.status !== 'completed' ||
        set.actual_weight === null ||
        set.actual_reps === null
      ) {
        continue;
      }

      const existing = setsByExercise.get(set.exercise_id) ?? [];
      existing.push({
        actualWeight: set.actual_weight,
        actualReps: set.actual_reps,
        targetWeight: set.target_weight,
        targetReps: set.target_reps,
      });
      setsByExercise.set(set.exercise_id, existing);
    }

    // Build performance history for consecutive failure calculation
    const performanceHistory = this.getPerformanceHistory(workout, 5);

    // Build PreviousWeekPerformance for each exercise
    for (const [exerciseId, sets] of setsByExercise) {
      const pde = pdeMap.get(exerciseId);
      if (!pde) continue;

      const firstSet = sets[0];
      if (!firstSet) continue;

      // Get history for this specific exercise
      const exerciseHistory = performanceHistory.get(exerciseId) ?? [];

      const perf = this.progressionService.buildPreviousWeekPerformance(
        String(exerciseId),
        previousWorkout.week_number,
        firstSet.targetWeight, // All sets have same target
        firstSet.targetReps,
        sets.map((s) => ({ actualWeight: s.actualWeight, actualReps: s.actualReps })),
        pde.min_reps,
        exerciseHistory
      );

      if (perf) {
        performanceByExercise.set(exerciseId, perf);
      }
    }

    return performanceByExercise;
  }

  /**
   * Get performance history for consecutive failure calculation.
   * Returns up to `limit` weeks of history, newest first.
   */
  private getPerformanceHistory(
    workout: Workout,
    limit: number
  ): Map<number, PreviousWeekPerformance[]> {
    const historyByExercise = new Map<number, PreviousWeekPerformance[]>();

    // Start from week before the previous week
    for (
      let week = workout.week_number - 2;
      week >= 1 && workout.week_number - week <= limit;
      week--
    ) {
      const historicalWorkout = this.workoutRepo.findPreviousWeekWorkout(
        workout.mesocycle_id,
        workout.plan_day_id,
        week + 1
      );

      if (!historicalWorkout || historicalWorkout.status === 'skipped') {
        continue;
      }

      const sets = this.workoutSetRepo.findByWorkoutId(historicalWorkout.id);
      const planDayExercises = this.planDayExerciseRepo.findByPlanDayId(
        workout.plan_day_id
      );
      const pdeMap = new Map(planDayExercises.map((pde) => [pde.exercise_id, pde]));

      // Group by exercise
      const setsByExercise = new Map<
        number,
        Array<{ actualWeight: number; actualReps: number; targetWeight: number; targetReps: number }>
      >();

      for (const set of sets) {
        if (
          set.status !== 'completed' ||
          set.actual_weight === null ||
          set.actual_reps === null
        ) {
          continue;
        }

        const existing = setsByExercise.get(set.exercise_id) ?? [];
        existing.push({
          actualWeight: set.actual_weight,
          actualReps: set.actual_reps,
          targetWeight: set.target_weight,
          targetReps: set.target_reps,
        });
        setsByExercise.set(set.exercise_id, existing);
      }

      for (const [exerciseId, exerciseSets] of setsByExercise) {
        const pde = pdeMap.get(exerciseId);
        if (!pde) continue;

        const firstSet = exerciseSets[0];
        if (!firstSet) continue;

        // Find best set
        let bestSet = firstSet;
        for (const s of exerciseSets) {
          if (
            s.actualWeight > bestSet.actualWeight ||
            (s.actualWeight === bestSet.actualWeight &&
              s.actualReps > bestSet.actualReps)
          ) {
            bestSet = s;
          }
        }

        const perf: PreviousWeekPerformance = {
          exerciseId: String(exerciseId),
          weekNumber: historicalWorkout.week_number,
          targetWeight: bestSet.targetWeight,
          targetReps: bestSet.targetReps,
          actualWeight: bestSet.actualWeight,
          actualReps: bestSet.actualReps,
          hitTarget: bestSet.actualReps >= bestSet.targetReps,
          consecutiveFailures: 0, // Calculated later by progressionService
        };

        const existing = historyByExercise.get(exerciseId) ?? [];
        existing.push(perf);
        historyByExercise.set(exerciseId, existing);
      }
    }

    return historyByExercise;
  }

  /**
   * Calculate dynamic progression targets for each exercise in a workout.
   */
  private calculateDynamicTargets(
    workout: Workout
  ): Map<number, DynamicProgressionResult> {
    const targetsByExercise = new Map<number, DynamicProgressionResult>();

    const planDayExercises = this.planDayExerciseRepo.findByPlanDayId(
      workout.plan_day_id
    );
    const previousPerformance = this.getPreviousWeekPerformance(workout);
    const isDeloadWeek = workout.week_number === 7;

    for (const pde of planDayExercises) {
      const exercise = this.exerciseRepo.findById(pde.exercise_id);
      if (!exercise) continue;

      const progression: ExerciseProgression = {
        exerciseId: String(pde.exercise_id),
        planExerciseId: String(pde.id),
        baseWeight: pde.weight,
        baseReps: pde.reps,
        baseSets: pde.sets,
        weightIncrement: exercise.weight_increment,
        minReps: pde.min_reps,
        maxReps: pde.max_reps,
      };

      const prevPerf = previousPerformance.get(pde.exercise_id) ?? null;

      const result = this.progressionService.calculateNextWeekTargets(
        progression,
        prevPerf,
        isDeloadWeek
      );

      targetsByExercise.set(pde.exercise_id, result);
    }

    return targetsByExercise;
  }

  /**
   * Persist dynamic progression targets to current workout's sets.
   * Called when starting a workout to save the calculated targets to DB.
   */
  private persistDynamicProgressionToSets(workout: Workout): void {
    const dynamicTargets = this.calculateDynamicTargets(workout);
    if (dynamicTargets.size === 0) {
      return;
    }

    const currentSets = this.workoutSetRepo.findByWorkoutId(workout.id);

    for (const set of currentSets) {
      if (set.status !== 'pending') {
        continue;
      }

      const targets = dynamicTargets.get(set.exercise_id);
      if (!targets) {
        continue;
      }

      // Update the set with dynamic targets
      if (
        targets.targetWeight !== set.target_weight ||
        targets.targetReps !== set.target_reps
      ) {
        this.workoutSetRepo.update(set.id, {
          target_weight: targets.targetWeight,
          target_reps: targets.targetReps,
        });
      }
    }
  }

  /**
   * Complete a workout
   */
  complete(id: number): Workout {
    const workout = this.workoutRepo.findById(id);
    if (!workout) {
      throw new Error(`Workout with id ${id} not found`);
    }

    if (workout.status === 'pending') {
      throw new Error('Cannot complete a workout that has not been started');
    }

    if (workout.status === 'completed') {
      throw new Error('Workout is already completed');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot complete a skipped workout');
    }

    const updated = this.workoutRepo.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error(`Failed to update workout with id ${id}`);
    }

    return updated;
  }

  /**
   * Skip a workout
   * Also marks all pending sets as skipped (preserves logged sets)
   */
  skip(id: number): Workout {
    const workout = this.workoutRepo.findById(id);
    if (!workout) {
      throw new Error(`Workout with id ${id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot skip a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Workout is already skipped');
    }

    // Mark all pending sets as skipped
    const sets = this.workoutSetRepo.findByWorkoutId(id);
    for (const set of sets) {
      if (set.status === 'pending') {
        this.workoutSetRepo.update(set.id, { status: 'skipped' });
      }
    }

    const updated = this.workoutRepo.update(id, { status: 'skipped' });

    if (!updated) {
      throw new Error(`Failed to update workout with id ${id}`);
    }

    return updated;
  }

  /**
   * Build a workout with exercises grouped
   */
  private buildWorkoutWithExercises(workout: Workout): WorkoutWithExercises {
    const planDay = this.planDayRepo.findById(workout.plan_day_id);
    const planDayExercises = this.planDayExerciseRepo.findByPlanDayId(
      workout.plan_day_id
    );
    const sets = this.workoutSetRepo.findByWorkoutId(workout.id);

    // Calculate dynamic targets for preview (only for pending workouts)
    const dynamicTargets =
      workout.status === 'pending'
        ? this.calculateDynamicTargets(workout)
        : new Map<number, DynamicProgressionResult>();

    // Group sets by exercise and apply dynamic progression adjustments
    const setsByExercise = new Map<number, WorkoutSet[]>();
    for (const set of sets) {
      // For pending sets in pending workouts, adjust targets with dynamic progression
      let adjustedSet = set;
      if (set.status === 'pending' && workout.status === 'pending') {
        const targets = dynamicTargets.get(set.exercise_id);
        if (targets) {
          if (
            targets.targetWeight !== set.target_weight ||
            targets.targetReps !== set.target_reps
          ) {
            adjustedSet = {
              ...set,
              target_weight: targets.targetWeight,
              target_reps: targets.targetReps,
            };
          }
        }
      }
      const existing = setsByExercise.get(adjustedSet.exercise_id) ?? [];
      existing.push(adjustedSet);
      setsByExercise.set(adjustedSet.exercise_id, existing);
    }

    // Build exercises array in plan order
    const exercises: WorkoutExerciseWithSets[] = [];

    // Sort plan day exercises by sort_order
    const sortedPlanDayExercises = [...planDayExercises].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    for (const pde of sortedPlanDayExercises) {
      const exercise = this.exerciseRepo.findById(pde.exercise_id);
      if (!exercise) continue;

      const exerciseSets = setsByExercise.get(pde.exercise_id) ?? [];
      // Sort sets by set_number
      exerciseSets.sort((a, b) => a.set_number - b.set_number);

      const completedSets = exerciseSets.filter(
        (s) => s.status === 'completed'
      ).length;

      exercises.push({
        exercise_id: pde.exercise_id,
        exercise_name: exercise.name,
        sets: exerciseSets,
        total_sets: exerciseSets.length,
        completed_sets: completedSets,
        rest_seconds: pde.rest_seconds,
      });
    }

    return {
      ...workout,
      plan_day_name: planDay?.name ?? 'Unknown',
      exercises,
    };
  }
}
