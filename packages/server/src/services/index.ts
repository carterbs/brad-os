import type { Database } from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { MesocycleService } from './mesocycle.service.js';
import { WorkoutSetService } from './workout-set.service.js';
import { WorkoutService } from './workout.service.js';
import { ProgressionService } from './progression.service.js';
import { DeloadService } from './deload.service.js';

export { MesocycleService } from './mesocycle.service.js';
export { WorkoutSetService } from './workout-set.service.js';
export { WorkoutService } from './workout.service.js';
export { ProgressionService } from './progression.service.js';
export { DeloadService } from './deload.service.js';
export type {
  WorkoutWithExercises,
  WorkoutExerciseWithSets,
} from './workout.service.js';

// Singleton instances for use with the default database
let mesocycleService: MesocycleService | null = null;
let workoutSetService: WorkoutSetService | null = null;
let workoutService: WorkoutService | null = null;
let progressionService: ProgressionService | null = null;
let deloadService: DeloadService | null = null;

// Reset all service singletons (for testing)
export function resetServices(): void {
  mesocycleService = null;
  workoutSetService = null;
  workoutService = null;
  progressionService = null;
  deloadService = null;
}

export function getMesocycleService(): MesocycleService {
  if (!mesocycleService) {
    mesocycleService = new MesocycleService(getDatabase());
  }
  return mesocycleService;
}

export function getWorkoutSetService(): WorkoutSetService {
  if (!workoutSetService) {
    workoutSetService = new WorkoutSetService(getDatabase());
  }
  return workoutSetService;
}

export function getWorkoutService(): WorkoutService {
  if (!workoutService) {
    workoutService = new WorkoutService(getDatabase());
  }
  return workoutService;
}

export function getProgressionService(): ProgressionService {
  if (!progressionService) {
    progressionService = new ProgressionService();
  }
  return progressionService;
}

export function getDeloadService(): DeloadService {
  if (!deloadService) {
    deloadService = new DeloadService();
  }
  return deloadService;
}

// Helper to create services with a custom database (useful for testing)
export function createServices(db: Database): {
  mesocycle: MesocycleService;
  workoutSet: WorkoutSetService;
  workout: WorkoutService;
  progression: ProgressionService;
  deload: DeloadService;
} {
  return {
    mesocycle: new MesocycleService(db),
    workoutSet: new WorkoutSetService(db),
    workout: new WorkoutService(db),
    progression: new ProgressionService(),
    deload: new DeloadService(),
  };
}
