import type { Firestore } from 'firebase-admin/firestore';
import type { WorkoutSet, LogWorkoutSetInput, ModifySetCountResult } from '@brad-os/shared';
import {
  WorkoutSetRepository,
  WorkoutRepository,
  ExerciseRepository,
  createRepositories,
} from '../repositories/index.js';
import { PlanModificationService } from './plan-modification.service.js';
import { ProgressionService } from './progression.service.js';

export class WorkoutSetService {
  private db: Firestore;
  private workoutSetRepo: WorkoutSetRepository;
  private workoutRepo: WorkoutRepository;
  private exerciseRepo: ExerciseRepository;

  constructor(db: Firestore) {
    this.db = db;
    this.workoutSetRepo = new WorkoutSetRepository(db);
    this.workoutRepo = new WorkoutRepository(db);
    this.exerciseRepo = new ExerciseRepository(db);
  }

  async getById(id: string): Promise<WorkoutSet | null> {
    return this.workoutSetRepo.findById(id);
  }

  async log(id: string, data: LogWorkoutSetInput): Promise<WorkoutSet> {
    const workoutSet = await this.workoutSetRepo.findById(id);
    if (!workoutSet) {
      throw new Error(`WorkoutSet with id ${id} not found`);
    }

    if (data.actual_reps < 0) {
      throw new Error('Reps must be a non-negative number');
    }

    if (data.actual_weight < 0) {
      throw new Error('Weight must be a non-negative number');
    }

    const workout = await this.workoutRepo.findById(workoutSet.workout_id);
    if (!workout) {
      throw new Error(`Workout with id ${workoutSet.workout_id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot log sets for a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot log sets for a skipped workout');
    }

    if (workout.status === 'pending') {
      await this.workoutRepo.update(workout.id, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
    }

    const updated = await this.workoutSetRepo.update(id, {
      actual_reps: data.actual_reps,
      actual_weight: data.actual_weight,
      status: 'completed',
    });

    if (!updated) {
      throw new Error(`Failed to update WorkoutSet with id ${id}`);
    }

    return updated;
  }

  async skip(id: string): Promise<WorkoutSet> {
    const workoutSet = await this.workoutSetRepo.findById(id);
    if (!workoutSet) {
      throw new Error(`WorkoutSet with id ${id} not found`);
    }

    const workout = await this.workoutRepo.findById(workoutSet.workout_id);
    if (!workout) {
      throw new Error(`Workout with id ${workoutSet.workout_id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot skip sets for a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot skip sets for a skipped workout');
    }

    if (workout.status === 'pending') {
      await this.workoutRepo.update(workout.id, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
    }

    const updated = await this.workoutSetRepo.update(id, {
      actual_reps: null,
      actual_weight: null,
      status: 'skipped',
    });

    if (!updated) {
      throw new Error(`Failed to update WorkoutSet with id ${id}`);
    }

    return updated;
  }

  async unlog(id: string): Promise<WorkoutSet> {
    const workoutSet = await this.workoutSetRepo.findById(id);
    if (!workoutSet) {
      throw new Error(`WorkoutSet with id ${id} not found`);
    }

    const workout = await this.workoutRepo.findById(workoutSet.workout_id);
    if (!workout) {
      throw new Error(`Workout with id ${workoutSet.workout_id} not found`);
    }

    if (workout.status === 'completed') {
      throw new Error('Cannot unlog sets for a completed workout');
    }

    if (workout.status === 'skipped') {
      throw new Error('Cannot unlog sets for a skipped workout');
    }

    const updated = await this.workoutSetRepo.update(id, {
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
  async addSetToExercise(workoutId: string, exerciseId: string): Promise<ModifySetCountResult> {
    const workout = await this.workoutRepo.findById(workoutId);
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
    const existingSets = await this.workoutSetRepo.findByWorkoutAndExercise(
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
    const newSet = await this.workoutSetRepo.create({
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_number: newSetNumber,
      target_reps: lastSet.target_reps,
      target_weight: lastSet.target_weight,
    });

    // Propagate to future workouts
    const propagationResult = await this.propagateSetCountToFutureWorkouts(
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
  async removeSetFromExercise(workoutId: string, exerciseId: string): Promise<ModifySetCountResult> {
    const workout = await this.workoutRepo.findById(workoutId);
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
    const existingSets = await this.workoutSetRepo.findByWorkoutAndExercise(
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
    await this.workoutSetRepo.delete(setToRemove.id);

    // Calculate new set count
    const newSetCount = existingSets.length - 1;

    // Propagate to future workouts
    const propagationResult = await this.propagateSetCountToFutureWorkouts(
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
  private async propagateSetCountToFutureWorkouts(
    mesocycleId: string,
    planDayId: string,
    exerciseId: string,
    newSetCount: number
  ): Promise<{ affectedWorkoutCount: number; modifiedSetsCount: number }> {
    // Get exercise for weight increment
    const exercise = await this.exerciseRepo.findById(exerciseId);
    if (!exercise) {
      return { affectedWorkoutCount: 0, modifiedSetsCount: 0 };
    }

    // Create PlanModificationService instance
    const repos = createRepositories(this.db);
    const progressionService = new ProgressionService();
    const planModService = new PlanModificationService(repos, progressionService);

    // Call updateExerciseTargetsForFutureWorkouts with the new set count
    const result = await planModService.updateExerciseTargetsForFutureWorkouts(
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
