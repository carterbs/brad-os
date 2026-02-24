import type { Firestore } from 'firebase-admin/firestore';
import type {
  Workout,
  WorkoutSet,
  WorkoutExercise,
  WarmupSet,
  ExerciseProgression,
  PreviousWeekPerformance,
} from '../shared.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
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

  constructor(db: Firestore) {
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
  async getById(id: string): Promise<WorkoutWithExercises | null> {
    const workout = await this.workoutRepo.findById(id);
    if (!workout) {
      return null;
    }

    return this.buildWorkoutWithExercises(workout);
  }

  /**
   * Get the next pending or in_progress workout.
   */
  async getTodaysWorkout(): Promise<WorkoutWithExercises | null> {
    const nextWorkout = await this.workoutRepo.findNextPending();

    if (!nextWorkout) {
      return null;
    }

    return this.buildWorkoutWithExercises(nextWorkout);
  }

  /**
   * Start a workout (mark as in_progress)
   * Applies dynamic progression from previous week to update targets
   */
  async start(id: string): Promise<Workout> {
    const workout = await this.workoutRepo.findById(id);
    if (!workout) {
      throw new NotFoundError('Workout', id);
    }

    if (workout.status === 'in_progress') {
      throw new ValidationError('Workout is already in progress');
    }

    if (workout.status === 'completed') {
      throw new ValidationError('Cannot start a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new ValidationError('Cannot start a skipped workout');
    }

    // Apply dynamic progression and persist targets to DB before starting
    await this.persistDynamicProgressionToSets(workout);

    const updated = await this.workoutRepo.update(id, {
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
   */
  private async getPreviousWeekPerformance(
    workout: Workout
  ): Promise<Map<string, PreviousWeekPerformance>> {
    const performanceByExercise = new Map<string, PreviousWeekPerformance>();

    // Week 1 has no previous week data
    if (workout.week_number <= 1) {
      return performanceByExercise;
    }

    // Get the immediately previous week's workout
    const previousWorkout = await this.workoutRepo.findPreviousWeekWorkout(
      workout.mesocycle_id,
      workout.plan_day_id,
      workout.week_number
    );

    if (!previousWorkout || previousWorkout.status === 'skipped') {
      return performanceByExercise;
    }

    const previousSets = await this.workoutSetRepo.findByWorkoutId(previousWorkout.id);
    const planDayExercises = await this.planDayExerciseRepo.findByPlanDayId(
      workout.plan_day_id
    );

    // Build a map of plan day exercise configs for minReps lookup
    const pdeMap = new Map(planDayExercises.map((pde) => [pde.exercise_id, pde]));

    // Group completed sets by exercise
    const setsByExercise = new Map<
      string,
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
    const performanceHistory = await this.getPerformanceHistory(workout, 5);

    // Build PreviousWeekPerformance for each exercise
    for (const [exerciseId, sets] of setsByExercise) {
      const pde = pdeMap.get(exerciseId);
      if (!pde) continue;

      const firstSet = sets[0];
      if (!firstSet) continue;

      // Get history for this specific exercise
      const exerciseHistory = performanceHistory.get(exerciseId) ?? [];

      const perf = this.progressionService.buildPreviousWeekPerformance(
        exerciseId,
        previousWorkout.week_number,
        firstSet.targetWeight,
        firstSet.targetReps,
        sets.map((s) => ({ actualWeight: s.actualWeight, actualReps: s.actualReps })),
        pde.min_reps ?? 8,
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
   */
  private async getPerformanceHistory(
    workout: Workout,
    limit: number
  ): Promise<Map<string, PreviousWeekPerformance[]>> {
    const historyByExercise = new Map<string, PreviousWeekPerformance[]>();

    // Start from week before the previous week
    for (
      let week = workout.week_number - 2;
      week >= 1 && workout.week_number - week <= limit;
      week--
    ) {
      const historicalWorkout = await this.workoutRepo.findPreviousWeekWorkout(
        workout.mesocycle_id,
        workout.plan_day_id,
        week + 1
      );

      if (!historicalWorkout || historicalWorkout.status === 'skipped') {
        continue;
      }

      const sets = await this.workoutSetRepo.findByWorkoutId(historicalWorkout.id);
      const planDayExercises = await this.planDayExerciseRepo.findByPlanDayId(
        workout.plan_day_id
      );
      const pdeMap = new Map(planDayExercises.map((pde) => [pde.exercise_id, pde]));

      // Group by exercise
      const setsByExercise = new Map<
        string,
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
          exerciseId,
          weekNumber: historicalWorkout.week_number,
          targetWeight: bestSet.targetWeight,
          targetReps: bestSet.targetReps,
          actualWeight: bestSet.actualWeight,
          actualReps: bestSet.actualReps,
          hitTarget: bestSet.actualReps >= bestSet.targetReps,
          consecutiveFailures: 0,
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
  private async calculateDynamicTargets(
    workout: Workout
  ): Promise<Map<string, DynamicProgressionResult>> {
    const targetsByExercise = new Map<string, DynamicProgressionResult>();

    const planDayExercises = await this.planDayExerciseRepo.findByPlanDayId(
      workout.plan_day_id
    );
    const previousPerformance = await this.getPreviousWeekPerformance(workout);
    const isDeloadWeek = workout.week_number === 7;

    for (const pde of planDayExercises) {
      const exercise = await this.exerciseRepo.findById(pde.exercise_id);
      if (!exercise) continue;

      const progression: ExerciseProgression = {
        exerciseId: pde.exercise_id,
        planExerciseId: pde.id,
        baseWeight: pde.weight,
        baseReps: pde.reps,
        baseSets: pde.sets,
        weightIncrement: exercise.weight_increment,
        minReps: pde.min_reps ?? 8,
        maxReps: pde.max_reps ?? 12,
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
   */
  private async persistDynamicProgressionToSets(workout: Workout): Promise<void> {
    const dynamicTargets = await this.calculateDynamicTargets(workout);
    if (dynamicTargets.size === 0) {
      return;
    }

    const currentSets = await this.workoutSetRepo.findByWorkoutId(workout.id);

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
        await this.workoutSetRepo.update(set.id, {
          target_weight: targets.targetWeight,
          target_reps: targets.targetReps,
        });
      }
    }
  }

  /**
   * Complete a workout
   */
  async complete(id: string): Promise<Workout> {
    const workout = await this.workoutRepo.findById(id);
    if (!workout) {
      throw new NotFoundError('Workout', id);
    }

    if (workout.status === 'pending') {
      throw new ValidationError('Cannot complete a workout that has not been started');
    }

    if (workout.status === 'completed') {
      throw new ValidationError('Workout is already completed');
    }

    if (workout.status === 'skipped') {
      throw new ValidationError('Cannot complete a skipped workout');
    }

    const updated = await this.workoutRepo.update(id, {
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
   */
  async skip(id: string): Promise<Workout> {
    const workout = await this.workoutRepo.findById(id);
    if (!workout) {
      throw new NotFoundError('Workout', id);
    }

    if (workout.status === 'completed') {
      throw new ValidationError('Cannot skip a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new ValidationError('Workout is already skipped');
    }

    // Mark all pending sets as skipped
    const sets = await this.workoutSetRepo.findByWorkoutId(id);
    for (const set of sets) {
      if (set.status === 'pending') {
        await this.workoutSetRepo.update(set.id, { status: 'skipped' });
      }
    }

    const updated = await this.workoutRepo.update(id, { status: 'skipped' });

    if (!updated) {
      throw new Error(`Failed to update workout with id ${id}`);
    }

    return updated;
  }

  /**
   * Build a workout with exercises grouped
   */
  private async buildWorkoutWithExercises(
    workout: Workout
  ): Promise<WorkoutWithExercises> {
    const planDay = await this.planDayRepo.findById(workout.plan_day_id);
    const planDayExercises = await this.planDayExerciseRepo.findByPlanDayId(
      workout.plan_day_id
    );
    const sets = await this.workoutSetRepo.findByWorkoutId(workout.id);

    // Calculate dynamic targets for preview (only for pending workouts)
    const dynamicTargets =
      workout.status === 'pending'
        ? await this.calculateDynamicTargets(workout)
        : new Map<string, DynamicProgressionResult>();

    // Group sets by exercise and apply dynamic progression adjustments
    const setsByExercise = new Map<string, WorkoutSet[]>();
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
      const exercise = await this.exerciseRepo.findById(pde.exercise_id);
      if (!exercise) continue;

      const exerciseSets = setsByExercise.get(pde.exercise_id) ?? [];
      // Sort sets by set_number
      exerciseSets.sort((a, b) => a.set_number - b.set_number);

      const completedSets = exerciseSets.filter(
        (s) => s.status === 'completed'
      ).length;

      const firstSet = exerciseSets[0];
      const warmupSets = firstSet
        ? WorkoutService.calculateWarmupSets(firstSet.target_weight, firstSet.target_reps)
        : [];

      exercises.push({
        exercise_id: pde.exercise_id,
        exercise_name: exercise.name,
        sets: exerciseSets,
        total_sets: exerciseSets.length,
        completed_sets: completedSets,
        rest_seconds: pde.rest_seconds,
        warmup_sets: warmupSets,
      });
    }

    return {
      ...workout,
      plan_day_name: planDay?.name ?? 'Unknown',
      exercises,
    };
  }

  /**
   * Calculate warm-up sets for an exercise.
   * Returns 2 warm-up sets at 40% and 60% of working weight.
   * Skips warm-ups if working weight is too low (≤ 20 lbs).
   */
  static calculateWarmupSets(workingWeight: number, targetReps: number): WarmupSet[] {
    if (workingWeight <= 20) {
      return [];
    }

    const WARMUP_PERCENTAGES = [0.4, 0.6];
    const ROUNDING_INCREMENT = 2.5;

    return WARMUP_PERCENTAGES.map((pct, index) => ({
      warmup_number: index + 1,
      target_weight: Math.round((workingWeight * pct) / ROUNDING_INCREMENT) * ROUNDING_INCREMENT,
      target_reps: targetReps,
    }));
  }
}
