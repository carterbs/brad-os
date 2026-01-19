import type { Database } from 'better-sqlite3';
import type {
  Workout,
  WorkoutSet,
  WorkoutExercise,
} from '@lifting/shared';
import {
  WorkoutRepository,
  WorkoutSetRepository,
  PlanDayRepository,
  PlanDayExerciseRepository,
  ExerciseRepository,
} from '../repositories/index.js';

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

  constructor(db: Database) {
    this.workoutRepo = new WorkoutRepository(db);
    this.workoutSetRepo = new WorkoutSetRepository(db);
    this.planDayRepo = new PlanDayRepository(db);
    this.planDayExerciseRepo = new PlanDayExerciseRepository(db);
    this.exerciseRepo = new ExerciseRepository(db);
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
   * Get the next upcoming workout that is pending or in_progress
   * Looks from today onwards, so "Today" always shows the next workout to do
   */
  getTodaysWorkout(): WorkoutWithExercises | null {
    // Format today's date in local timezone to avoid UTC conversion issues
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // Find the next upcoming workout (today or future)
    const nextWorkout = this.workoutRepo.findNextUpcoming(today);

    if (!nextWorkout) {
      return null;
    }

    return this.buildWorkoutWithExercises(nextWorkout);
  }

  /**
   * Start a workout (mark as in_progress)
   * Also applies peak performance from previous week to update targets
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

    // Persist peak performance from previous week to DB before starting
    this.persistPeakPerformanceToSets(workout);

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
   * Get peak performance from all previous weeks for each exercise.
   * Returns a map of exercise_id -> { weight, reps } representing the best
   * performance achieved in any previous same-day workout within the mesocycle.
   */
  private getPreviousWeekPeakPerformance(
    workout: Workout
  ): Map<number, { weight: number; reps: number }> {
    const peakByExercise = new Map<number, { weight: number; reps: number }>();

    // Only look for previous week data for weeks 2+
    if (workout.week_number <= 1) {
      return peakByExercise;
    }

    // Look back through all previous weeks to find peak performance
    for (let week = workout.week_number - 1; week >= 1; week--) {
      const previousWorkout = this.workoutRepo.findPreviousWeekWorkout(
        workout.mesocycle_id,
        workout.plan_day_id,
        week + 1 // findPreviousWeekWorkout takes current week and looks at week-1
      );

      if (!previousWorkout) {
        continue;
      }

      const previousSets = this.workoutSetRepo.findByWorkoutId(previousWorkout.id);

      for (const set of previousSets) {
        // Only consider completed sets with actual values
        if (
          set.status !== 'completed' ||
          set.actual_weight === null ||
          set.actual_reps === null
        ) {
          continue;
        }

        const existing = peakByExercise.get(set.exercise_id);
        if (!existing) {
          peakByExercise.set(set.exercise_id, {
            weight: set.actual_weight,
            reps: set.actual_reps,
          });
        } else {
          // Update if this set has higher weight or same weight with higher reps
          if (
            set.actual_weight > existing.weight ||
            (set.actual_weight === existing.weight &&
              set.actual_reps > existing.reps)
          ) {
            peakByExercise.set(set.exercise_id, {
              weight: set.actual_weight,
              reps: set.actual_reps,
            });
          }
        }
      }
    }

    return peakByExercise;
  }

  /**
   * Persist peak performance from previous week to current workout's sets.
   * Called when starting a workout to save the adjusted targets to DB.
   */
  private persistPeakPerformanceToSets(workout: Workout): void {
    const peakByExercise = this.getPreviousWeekPeakPerformance(workout);
    if (peakByExercise.size === 0) {
      return;
    }

    const currentSets = this.workoutSetRepo.findByWorkoutId(workout.id);

    for (const set of currentSets) {
      if (set.status !== 'pending') {
        continue;
      }

      const peak = peakByExercise.get(set.exercise_id);
      if (!peak) {
        continue;
      }

      const newTargetWeight = Math.max(set.target_weight, peak.weight);
      const newTargetReps = Math.max(set.target_reps, peak.reps);

      if (
        newTargetWeight !== set.target_weight ||
        newTargetReps !== set.target_reps
      ) {
        this.workoutSetRepo.update(set.id, {
          target_weight: newTargetWeight,
          target_reps: newTargetReps,
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

    // Get peak performance from previous week to adjust targets for preview
    const peakByExercise = this.getPreviousWeekPeakPerformance(workout);

    // Group sets by exercise and apply peak performance adjustments
    const setsByExercise = new Map<number, WorkoutSet[]>();
    for (const set of sets) {
      // For pending sets, adjust targets based on previous week's peak
      let adjustedSet = set;
      if (set.status === 'pending') {
        const peak = peakByExercise.get(set.exercise_id);
        if (peak) {
          const newTargetWeight = Math.max(set.target_weight, peak.weight);
          const newTargetReps = Math.max(set.target_reps, peak.reps);
          if (newTargetWeight !== set.target_weight || newTargetReps !== set.target_reps) {
            adjustedSet = {
              ...set,
              target_weight: newTargetWeight,
              target_reps: newTargetReps,
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
