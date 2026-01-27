import type {
  PlanDayExercise,
  Workout,
  Exercise,
  PlanDiff,
  ModificationResult,
  ExerciseChanges,
  AddedExercise,
  RemovedExercise,
  ModifiedExercise,
} from '@brad-os/shared';
import type { createRepositories } from '../repositories/index.js';
import type { ProgressionService } from './progression.service.js';

type Repositories = ReturnType<typeof createRepositories>;

interface ExerciseInfo {
  exercise: Exercise;
  pde: PlanDayExercise;
}

interface RemoveExerciseResult {
  removedSetsCount: number;
  preservedCount: number;
  warnings: string[];
}

interface AddExerciseResult {
  addedSetsCount: number;
  affectedWorkoutCount: number;
}

interface UpdateExerciseResult {
  modifiedSetsCount: number;
  affectedWorkoutCount: number;
}

/**
 * Service for modifying plans during an active mesocycle.
 * All changes apply only to FUTURE workouts, preserving past and logged data.
 */
export class PlanModificationService {
  private repos: Repositories;
  private progressionService: ProgressionService;

  constructor(repos: Repositories, progressionService: ProgressionService) {
    this.repos = repos;
    this.progressionService = progressionService;
  }

  /**
   * Get all pending workouts for a mesocycle that can be modified.
   * A workout is considered "modifiable" if:
   * - It has status 'pending' (not started, completed, skipped, or in_progress)
   */
  async getFutureWorkouts(mesocycleId: string): Promise<Workout[]> {
    const allWorkouts = await this.repos.workout.findByMesocycleId(mesocycleId);

    return allWorkouts.filter((workout) => {
      // Only include pending workouts
      return workout.status === 'pending';
    });
  }

  /**
   * Compare old and new exercise lists to determine changes.
   */
  diffPlanDayExercises(
    planDayId: string,
    oldExercises: PlanDayExercise[],
    newExercises: PlanDayExercise[]
  ): PlanDiff {
    const diff: PlanDiff = {
      addedExercises: [],
      removedExercises: [],
      modifiedExercises: [],
      addedDays: [],
      removedDays: [],
    };

    const oldExerciseMap = new Map(
      oldExercises.map((e) => [e.exercise_id, e])
    );
    const newExerciseMap = new Map(
      newExercises.map((e) => [e.exercise_id, e])
    );

    // Find added exercises
    for (const newPde of newExercises) {
      if (!oldExerciseMap.has(newPde.exercise_id)) {
        const added: AddedExercise = {
          planDayId,
          exerciseId: newPde.exercise_id,
          planDayExercise: newPde,
        };
        diff.addedExercises.push(added);
      }
    }

    // Find removed exercises
    for (const oldPde of oldExercises) {
      if (!newExerciseMap.has(oldPde.exercise_id)) {
        const removed: RemovedExercise = {
          planDayId,
          exerciseId: oldPde.exercise_id,
          planDayExerciseId: oldPde.id,
        };
        diff.removedExercises.push(removed);
      }
    }

    // Find modified exercises
    for (const newPde of newExercises) {
      const oldPde = oldExerciseMap.get(newPde.exercise_id);
      if (oldPde) {
        const changes = this.getExerciseChanges(oldPde, newPde);
        if (Object.keys(changes).length > 0) {
          const modified: ModifiedExercise = {
            planDayId,
            exerciseId: newPde.exercise_id,
            planDayExerciseId: newPde.id,
            changes,
          };
          diff.modifiedExercises.push(modified);
        }
      }
    }

    return diff;
  }

  /**
   * Get the changes between two exercise configurations.
   * Only includes fields that are different.
   */
  private getExerciseChanges(
    oldPde: PlanDayExercise,
    newPde: PlanDayExercise
  ): ExerciseChanges {
    const changes: ExerciseChanges = {};

    if (oldPde.sets !== newPde.sets) {
      changes.sets = newPde.sets;
    }
    if (oldPde.reps !== newPde.reps) {
      changes.reps = newPde.reps;
    }
    if (oldPde.weight !== newPde.weight) {
      changes.weight = newPde.weight;
    }
    if (oldPde.rest_seconds !== newPde.rest_seconds) {
      changes.rest_seconds = newPde.rest_seconds;
    }

    return changes;
  }

  /**
   * Add a new exercise to all future workouts for a specific plan day.
   */
  async addExerciseToFutureWorkouts(
    mesocycleId: string,
    planDayId: string,
    planDayExercise: PlanDayExercise,
    exercise: Exercise
  ): Promise<AddExerciseResult> {
    const futureWorkouts = await this.getFutureWorkouts(mesocycleId);
    const matchingWorkouts = futureWorkouts.filter(
      (w) => w.plan_day_id === planDayId
    );

    let addedSetsCount = 0;

    for (const workout of matchingWorkouts) {
      // Calculate progressive overload based on week number
      const targets = this.progressionService.calculateTargetsForWeek(
        {
          exerciseId: exercise.id,
          planExerciseId: planDayExercise.id,
          baseWeight: planDayExercise.weight,
          baseReps: planDayExercise.reps,
          baseSets: planDayExercise.sets,
          weightIncrement: exercise.weight_increment,
          minReps: planDayExercise.min_reps,
          maxReps: planDayExercise.max_reps,
        },
        workout.week_number,
        true // Assume previous weeks completed for new exercises
      );

      // Create workout sets for this exercise
      for (let setNum = 1; setNum <= targets.targetSets; setNum++) {
        await this.repos.workoutSet.create({
          workout_id: workout.id,
          exercise_id: exercise.id,
          set_number: setNum,
          target_reps: targets.targetReps,
          target_weight: targets.targetWeight,
        });
        addedSetsCount++;
      }
    }

    return {
      addedSetsCount,
      affectedWorkoutCount: matchingWorkouts.length,
    };
  }

  /**
   * Remove an exercise from all future workouts for a specific plan day.
   * Preserves sets that have logged data.
   */
  async removeExerciseFromFutureWorkouts(
    mesocycleId: string,
    planDayId: string,
    exerciseId: string
  ): Promise<RemoveExerciseResult> {
    const futureWorkouts = await this.getFutureWorkouts(mesocycleId);
    const matchingWorkouts = futureWorkouts.filter(
      (w) => w.plan_day_id === planDayId
    );

    let removedSetsCount = 0;
    let preservedCount = 0;
    const warnings: string[] = [];

    for (const workout of matchingWorkouts) {
      const sets = await this.repos.workoutSet.findByWorkoutAndExercise(
        workout.id,
        exerciseId
      );

      // Check if any sets have logged data
      const hasLoggedData = sets.some(
        (s) => s.status === 'completed' || s.actual_reps !== null
      );

      if (hasLoggedData) {
        preservedCount++;
        warnings.push(
          `Workout on ${workout.scheduled_date} has logged data - exercise sets preserved`
        );
      } else {
        // Delete all sets for this exercise in this workout
        for (const set of sets) {
          await this.repos.workoutSet.delete(set.id);
          removedSetsCount++;
        }
      }
    }

    return {
      removedSetsCount,
      preservedCount,
      warnings,
    };
  }

  /**
   * Update exercise targets (reps, weight, sets, rest) for all future workouts.
   * Recalculates progressive overload from the new base values.
   */
  async updateExerciseTargetsForFutureWorkouts(
    mesocycleId: string,
    planDayId: string,
    exerciseId: string,
    changes: ExerciseChanges,
    weightIncrement: number
  ): Promise<UpdateExerciseResult> {
    const futureWorkouts = await this.getFutureWorkouts(mesocycleId);
    const matchingWorkouts = futureWorkouts.filter(
      (w) => w.plan_day_id === planDayId
    );

    // Look up the plan day exercise to get min_reps/max_reps
    const planDayExercises =
      await this.repos.planDayExercise.findByPlanDayId(planDayId);
    const pde = planDayExercises.find((p) => p.exercise_id === exerciseId);

    let modifiedSetsCount = 0;
    let affectedWorkoutCount = 0;

    for (const workout of matchingWorkouts) {
      const existingSets = await this.repos.workoutSet.findByWorkoutAndExercise(
        workout.id,
        exerciseId
      );

      if (existingSets.length === 0) continue;

      // Get the current base values from the first pending set
      const pendingSets = existingSets.filter((s) => s.status === 'pending');
      const firstPendingSet = pendingSets[0];
      if (firstPendingSet === undefined) continue;

      // Calculate base values for progression
      const baseSets = changes.sets ?? existingSets.length;

      // Calculate new targets with progression
      const newTargets = this.progressionService.calculateTargetsForWeek(
        {
          exerciseId: exerciseId,
          planExerciseId: 'updated',
          baseWeight: changes.weight ?? firstPendingSet.target_weight,
          baseReps: changes.reps ?? this.reverseProgressionReps(
            firstPendingSet.target_reps,
            workout.week_number
          ),
          baseSets,
          weightIncrement,
          minReps: pde?.min_reps ?? 8,
          maxReps: pde?.max_reps ?? 12,
        },
        workout.week_number,
        true
      );

      // Handle set count changes
      const newSetCount = changes.sets;
      if (newSetCount !== undefined) {
        const currentSetCount = existingSets.length;

        if (newSetCount > currentSetCount) {
          // Add more sets
          for (let i = currentSetCount + 1; i <= newSetCount; i++) {
            await this.repos.workoutSet.create({
              workout_id: workout.id,
              exercise_id: exerciseId,
              set_number: i,
              target_reps: newTargets.targetReps,
              target_weight: newTargets.targetWeight,
            });
            modifiedSetsCount++;
          }
        } else if (newSetCount < currentSetCount) {
          // Remove sets from the end (only pending ones)
          const setsToRemove = pendingSets
            .filter((s) => s.set_number > newSetCount)
            .sort((a, b) => b.set_number - a.set_number);

          for (const set of setsToRemove) {
            await this.repos.workoutSet.delete(set.id);
            modifiedSetsCount++;
          }
        }
      }

      // Update target values for remaining pending sets when reps or weight change
      if (changes.reps !== undefined || changes.weight !== undefined) {
        const updatedPendingSets = (await this.repos.workoutSet
          .findByWorkoutAndExercise(workout.id, exerciseId))
          .filter((s) => s.status === 'pending');

        for (const set of updatedPendingSets) {
          // Delete old set and create new one with updated targets
          // This is a workaround since our update doesn't support target_reps/target_weight
          const setNumber = set.set_number;
          await this.repos.workoutSet.delete(set.id);
          await this.repos.workoutSet.create({
            workout_id: workout.id,
            exercise_id: exerciseId,
            set_number: setNumber,
            target_reps: newTargets.targetReps,
            target_weight: newTargets.targetWeight,
          });
          modifiedSetsCount++;
        }
      }

      affectedWorkoutCount++;
    }

    return {
      modifiedSetsCount,
      affectedWorkoutCount,
    };
  }

  /**
   * Reverse the progression calculation to get base reps from current target reps.
   * This is an approximation since we don't know the exact progression history.
   */
  private reverseProgressionReps(targetReps: number, weekNumber: number): number {
    // Odd weeks add 1 rep, so we need to subtract accumulated reps
    // Week 1: +1, Week 3: +1, Week 5: +1
    const repAdds = Math.ceil(weekNumber / 2);
    return Math.max(1, targetReps - repAdds);
  }

  /**
   * Sync all plan exercises to future workouts.
   * This compares the current plan state to what exists in workouts
   * and adds/removes/updates as needed.
   */
  async syncPlanToMesocycle(
    mesocycleId: string,
    planDayId: string,
    planExercises: PlanDayExercise[],
    exercises: Map<string, Exercise>
  ): Promise<ModificationResult> {
    const result: ModificationResult = {
      affectedWorkoutCount: 0,
      warnings: [],
      addedSetsCount: 0,
      removedSetsCount: 0,
      modifiedSetsCount: 0,
    };

    const futureWorkouts = await this.getFutureWorkouts(mesocycleId);
    const matchingWorkouts = futureWorkouts.filter(
      (w) => w.plan_day_id === planDayId
    );

    if (matchingWorkouts.length === 0) {
      return result;
    }

    // Get exercise IDs that should be in workouts
    const planExerciseIds = new Set(planExercises.map((pe) => pe.exercise_id));

    for (const workout of matchingWorkouts) {
      // Get all existing sets for this workout
      const existingSets = await this.repos.workoutSet.findByWorkoutId(workout.id);
      const existingExerciseIds = new Set(existingSets.map((s) => s.exercise_id));

      // Find exercises to add (in plan but not in workout)
      for (const planExercise of planExercises) {
        if (!existingExerciseIds.has(planExercise.exercise_id)) {
          // Add this exercise to the workout
          const exercise = exercises.get(planExercise.exercise_id);
          if (exercise) {
            const targets = this.progressionService.calculateTargetsForWeek(
              {
                exerciseId: exercise.id,
                planExerciseId: planExercise.id,
                baseWeight: planExercise.weight,
                baseReps: planExercise.reps,
                baseSets: planExercise.sets,
                weightIncrement: exercise.weight_increment,
                minReps: planExercise.min_reps,
                maxReps: planExercise.max_reps,
              },
              workout.week_number,
              true
            );

            for (let setNum = 1; setNum <= targets.targetSets; setNum++) {
              await this.repos.workoutSet.create({
                workout_id: workout.id,
                exercise_id: exercise.id,
                set_number: setNum,
                target_reps: targets.targetReps,
                target_weight: targets.targetWeight,
              });
              result.addedSetsCount++;
            }
          }
        }
      }

      // Find exercises to remove (in workout but not in plan)
      for (const existingSet of existingSets) {
        if (!planExerciseIds.has(existingSet.exercise_id)) {
          // Check if the set has logged data
          if (existingSet.status === 'completed' || existingSet.actual_reps !== null) {
            result.warnings.push(
              `Preserved logged set in workout ${workout.id} for exercise ${existingSet.exercise_id}`
            );
          } else {
            await this.repos.workoutSet.delete(existingSet.id);
            result.removedSetsCount++;
          }
        }
      }

      // Update set counts for existing exercises
      for (const planExercise of planExercises) {
        if (existingExerciseIds.has(planExercise.exercise_id)) {
          const exercise = exercises.get(planExercise.exercise_id);
          if (!exercise) continue;

          const currentSets = existingSets.filter(
            (s) => s.exercise_id === planExercise.exercise_id
          );
          const pendingSets = currentSets.filter((s) => s.status === 'pending');

          const targets = this.progressionService.calculateTargetsForWeek(
            {
              exerciseId: exercise.id,
              planExerciseId: planExercise.id,
              baseWeight: planExercise.weight,
              baseReps: planExercise.reps,
              baseSets: planExercise.sets,
              weightIncrement: exercise.weight_increment,
              minReps: planExercise.min_reps,
              maxReps: planExercise.max_reps,
            },
            workout.week_number,
            true
          );

          // Add or remove sets to match plan
          if (pendingSets.length < targets.targetSets) {
            // Add more sets
            for (let i = pendingSets.length + 1; i <= targets.targetSets; i++) {
              await this.repos.workoutSet.create({
                workout_id: workout.id,
                exercise_id: exercise.id,
                set_number: i,
                target_reps: targets.targetReps,
                target_weight: targets.targetWeight,
              });
              result.addedSetsCount++;
            }
          } else if (pendingSets.length > targets.targetSets) {
            // Remove extra pending sets (from the end)
            const setsToRemove = pendingSets
              .filter((s) => s.set_number > targets.targetSets)
              .sort((a, b) => b.set_number - a.set_number);

            for (const set of setsToRemove) {
              await this.repos.workoutSet.delete(set.id);
              result.removedSetsCount++;
            }
          }

          // Update targets for remaining pending sets
          const updatedPendingSets = (await this.repos.workoutSet
            .findByWorkoutAndExercise(workout.id, exercise.id))
            .filter((s) => s.status === 'pending');

          for (const set of updatedPendingSets) {
            if (
              set.target_reps !== targets.targetReps ||
              set.target_weight !== targets.targetWeight
            ) {
              // Delete and recreate to update targets
              const setNumber = set.set_number;
              await this.repos.workoutSet.delete(set.id);
              await this.repos.workoutSet.create({
                workout_id: workout.id,
                exercise_id: exercise.id,
                set_number: setNumber,
                target_reps: targets.targetReps,
                target_weight: targets.targetWeight,
              });
              result.modifiedSetsCount++;
            }
          }
        }
      }

      result.affectedWorkoutCount++;
    }

    return result;
  }

  /**
   * Apply a diff to an active mesocycle.
   * This is the main entry point for applying plan modifications.
   */
  async applyDiffToMesocycle(
    mesocycleId: string,
    diff: PlanDiff,
    exerciseInfo: ExerciseInfo[]
  ): Promise<ModificationResult> {
    const result: ModificationResult = {
      affectedWorkoutCount: 0,
      warnings: [],
      addedSetsCount: 0,
      removedSetsCount: 0,
      modifiedSetsCount: 0,
    };

    // Get mesocycle to access plan info
    const mesocycle = await this.repos.mesocycle.findById(mesocycleId);
    if (!mesocycle) {
      result.warnings.push('Mesocycle not found');
      return result;
    }

    // Process removed exercises first
    for (const removed of diff.removedExercises) {
      const removeResult = await this.removeExerciseFromFutureWorkouts(
        mesocycleId,
        removed.planDayId,
        removed.exerciseId
      );
      result.removedSetsCount += removeResult.removedSetsCount;
      result.warnings.push(...removeResult.warnings);
      if (removeResult.preservedCount > 0) {
        result.warnings.push(
          `${removeResult.preservedCount} workout(s) preserved logged data for removed exercise`
        );
      }
    }

    // Process added exercises
    for (const added of diff.addedExercises) {
      const info = exerciseInfo.find(
        (e) => e.pde.exercise_id === added.exerciseId
      );
      if (info) {
        const addResult = await this.addExerciseToFutureWorkouts(
          mesocycleId,
          added.planDayId,
          added.planDayExercise,
          info.exercise
        );
        result.addedSetsCount += addResult.addedSetsCount;
        result.affectedWorkoutCount = Math.max(
          result.affectedWorkoutCount,
          addResult.affectedWorkoutCount
        );
      }
    }

    // Process modified exercises
    for (const modified of diff.modifiedExercises) {
      const info = exerciseInfo.find(
        (e) => e.pde.exercise_id === modified.exerciseId
      );
      const weightIncrement = info?.exercise.weight_increment ?? 5;

      const updateResult = await this.updateExerciseTargetsForFutureWorkouts(
        mesocycleId,
        modified.planDayId,
        modified.exerciseId,
        modified.changes,
        weightIncrement
      );
      result.modifiedSetsCount += updateResult.modifiedSetsCount;
      result.affectedWorkoutCount = Math.max(
        result.affectedWorkoutCount,
        updateResult.affectedWorkoutCount
      );
    }

    return result;
  }
}
