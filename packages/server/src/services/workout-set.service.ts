import type { Database } from 'better-sqlite3';
import type { WorkoutSet, LogWorkoutSetInput, ModifySetCountResult } from '@lifting/shared';
import {
  WorkoutSetRepository,
  WorkoutRepository,
  ExerciseRepository,
  createRepositories,
} from '../repositories/index.js';
import { PlanModificationService } from './plan-modification.service.js';
import { ProgressionService } from './progression.service.js';

export class WorkoutSetService {
  private db: Database;
  private workoutSetRepo: WorkoutSetRepository;
  private workoutRepo: WorkoutRepository;
  private exerciseRepo: ExerciseRepository;

  constructor(db: Database) {
    this.db = db;
    this.workoutSetRepo = new WorkoutSetRepository(db);
    this.workoutRepo = new WorkoutRepository(db);
    this.exerciseRepo = new ExerciseRepository(db);
  }

  /**
   * Get a workout set by ID
   */
  getById(id: number): WorkoutSet | null {
    return this.workoutSetRepo.findById(id);
  }

  /**
   * Log actual reps and weight for a set
   * Auto-starts the workout if not already started
   */
  log(id: number, data: LogWorkoutSetInput): WorkoutSet {
    const workoutSet = this.workoutSetRepo.findById(id);
    if (!workoutSet) {
      throw new Error(`WorkoutSet with id ${id} not found`);
    }

    // Validate input
    if (data.actual_reps < 0) {
      throw new Error('Reps must be a non-negative number');
    }

    if (data.actual_weight < 0) {
      throw new Error('Weight must be a non-negative number');
    }

    // Check workout status
    const workout = this.workoutRepo.findById(workoutSet.workout_id);
    if (!workout) {
      throw new Error(`Workout with id ${workoutSet.workout_id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot log sets for a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot log sets for a skipped workout');
    }

    // Auto-start workout if pending
    if (workout.status === 'pending') {
      this.workoutRepo.update(workout.id, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
    }

    // Update the set
    const updated = this.workoutSetRepo.update(id, {
      actual_reps: data.actual_reps,
      actual_weight: data.actual_weight,
      status: 'completed',
    });

    if (!updated) {
      throw new Error(`Failed to update WorkoutSet with id ${id}`);
    }

    return updated;
  }

  /**
   * Skip a set
   * Auto-starts the workout if not already started
   * Clears any previously logged values
   */
  skip(id: number): WorkoutSet {
    const workoutSet = this.workoutSetRepo.findById(id);
    if (!workoutSet) {
      throw new Error(`WorkoutSet with id ${id} not found`);
    }

    // Check workout status
    const workout = this.workoutRepo.findById(workoutSet.workout_id);
    if (!workout) {
      throw new Error(`Workout with id ${workoutSet.workout_id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot skip sets for a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot skip sets for a skipped workout');
    }

    // Auto-start workout if pending
    if (workout.status === 'pending') {
      this.workoutRepo.update(workout.id, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
    }

    // Update the set - clear actual values and set status to skipped
    const updated = this.workoutSetRepo.update(id, {
      actual_reps: null,
      actual_weight: null,
      status: 'skipped',
    });

    if (!updated) {
      throw new Error(`Failed to update WorkoutSet with id ${id}`);
    }

    return updated;
  }

  /**
   * Unlog a set (revert to pending)
   * Clears actual_reps/actual_weight and sets status back to pending
   */
  unlog(id: number): WorkoutSet {
    const workoutSet = this.workoutSetRepo.findById(id);
    if (!workoutSet) {
      throw new Error(`WorkoutSet with id ${id} not found`);
    }

    // Check workout status
    const workout = this.workoutRepo.findById(workoutSet.workout_id);
    if (!workout) {
      throw new Error(`Workout with id ${workoutSet.workout_id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot unlog sets for a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot unlog sets for a skipped workout');
    }

    // Update the set - clear actual values and set status to pending
    const updated = this.workoutSetRepo.update(id, {
      actual_reps: null,
      actual_weight: null,
      status: 'pending',
    });

    if (!updated) {
      throw new Error(`Failed to update WorkoutSet with id ${id}`);
    }

    return updated;
  }

  /**
   * Add a new set to an exercise in a workout.
   * Copies target values from the last existing set.
   * Propagates the change to all future pending workouts in the mesocycle.
   */
  addSetToExercise(workoutId: number, exerciseId: number): ModifySetCountResult {
    const workout = this.workoutRepo.findById(workoutId);
    if (!workout) {
      throw new Error(`Workout with id ${workoutId} not found`);
    }

    // Validate workout status
    if (workout.status === 'completed') {
      throw new Error('Cannot add sets to a completed workout');
    }
    if (workout.status === 'skipped') {
      throw new Error('Cannot add sets to a skipped workout');
    }

    // Get existing sets for this exercise
    const existingSets = this.workoutSetRepo.findByWorkoutAndExercise(
      workoutId,
      exerciseId
    );

    if (existingSets.length === 0) {
      throw new Error(`No sets found for exercise ${exerciseId} in workout ${workoutId}`);
    }

    // Get the last set to copy target values
    const sortedSets = [...existingSets].sort((a, b) => a.set_number - b.set_number);
    const lastSet = sortedSets[sortedSets.length - 1];
    if (!lastSet) {
      throw new Error('Could not find last set');
    }

    // Create new set with next set number
    const newSetNumber = lastSet.set_number + 1;
    const newSet = this.workoutSetRepo.create({
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_number: newSetNumber,
      target_reps: lastSet.target_reps,
      target_weight: lastSet.target_weight,
    });

    // Propagate to future workouts
    const propagationResult = this.propagateSetCountToFutureWorkouts(
      workout.mesocycle_id,
      workout.plan_day_id,
      exerciseId,
      newSetNumber // New total set count
    );

    return {
      currentWorkoutSet: newSet,
      futureWorkoutsAffected: propagationResult.affectedWorkoutCount,
      futureSetsModified: propagationResult.modifiedSetsCount,
    };
  }

  /**
   * Remove the last pending set from an exercise in a workout.
   * Cannot remove completed/logged sets.
   * Must keep at least 1 set per exercise.
   * Propagates the change to all future pending workouts in the mesocycle.
   */
  removeSetFromExercise(workoutId: number, exerciseId: number): ModifySetCountResult {
    const workout = this.workoutRepo.findById(workoutId);
    if (!workout) {
      throw new Error(`Workout with id ${workoutId} not found`);
    }

    // Validate workout status
    if (workout.status === 'completed') {
      throw new Error('Cannot remove sets from a completed workout');
    }
    if (workout.status === 'skipped') {
      throw new Error('Cannot remove sets from a skipped workout');
    }

    // Get existing sets for this exercise
    const existingSets = this.workoutSetRepo.findByWorkoutAndExercise(
      workoutId,
      exerciseId
    );

    if (existingSets.length === 0) {
      throw new Error(`No sets found for exercise ${exerciseId} in workout ${workoutId}`);
    }

    // Must keep at least 1 set
    if (existingSets.length === 1) {
      throw new Error('Cannot remove the last set from an exercise');
    }

    // Find the last pending set (sorted by set_number descending)
    const sortedPendingSets = existingSets
      .filter((s) => s.status === 'pending')
      .sort((a, b) => b.set_number - a.set_number);

    if (sortedPendingSets.length === 0) {
      throw new Error('No pending sets to remove');
    }

    const setToRemove = sortedPendingSets[0];
    if (!setToRemove) {
      throw new Error('Could not find set to remove');
    }

    // Delete the set
    this.workoutSetRepo.delete(setToRemove.id);

    // Calculate new set count
    const newSetCount = existingSets.length - 1;

    // Propagate to future workouts
    const propagationResult = this.propagateSetCountToFutureWorkouts(
      workout.mesocycle_id,
      workout.plan_day_id,
      exerciseId,
      newSetCount
    );

    return {
      currentWorkoutSet: null,
      futureWorkoutsAffected: propagationResult.affectedWorkoutCount,
      futureSetsModified: propagationResult.modifiedSetsCount,
    };
  }

  /**
   * Propagate set count changes to future pending workouts.
   * Uses PlanModificationService.updateExerciseTargetsForFutureWorkouts internally.
   */
  private propagateSetCountToFutureWorkouts(
    mesocycleId: number,
    planDayId: number,
    exerciseId: number,
    newSetCount: number
  ): { affectedWorkoutCount: number; modifiedSetsCount: number } {
    // Get exercise for weight increment
    const exercise = this.exerciseRepo.findById(exerciseId);
    if (!exercise) {
      return { affectedWorkoutCount: 0, modifiedSetsCount: 0 };
    }

    // Create PlanModificationService instance
    const repos = createRepositories(this.db);
    const progressionService = new ProgressionService();
    const planModService = new PlanModificationService(repos, progressionService);

    // Call updateExerciseTargetsForFutureWorkouts with the new set count
    const result = planModService.updateExerciseTargetsForFutureWorkouts(
      mesocycleId,
      planDayId,
      exerciseId,
      { sets: newSetCount },
      exercise.weight_increment
    );

    return {
      affectedWorkoutCount: result.affectedWorkoutCount,
      modifiedSetsCount: result.modifiedSetsCount,
    };
  }
}
