import type { Database } from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { ExerciseRepository } from './exercise.repository.js';
import { PlanRepository } from './plan.repository.js';
import { PlanDayRepository } from './plan-day.repository.js';
import { PlanDayExerciseRepository } from './plan-day-exercise.repository.js';
import { MesocycleRepository } from './mesocycle.repository.js';
import { WorkoutRepository } from './workout.repository.js';
import { WorkoutSetRepository } from './workout-set.repository.js';
import { StretchSessionRepository } from './stretchSession.repository.js';

export { BaseRepository } from './base.repository.js';
export { ExerciseRepository } from './exercise.repository.js';
export { PlanRepository } from './plan.repository.js';
export { PlanDayRepository } from './plan-day.repository.js';
export { PlanDayExerciseRepository } from './plan-day-exercise.repository.js';
export { MesocycleRepository } from './mesocycle.repository.js';
export { WorkoutRepository } from './workout.repository.js';
export { WorkoutSetRepository } from './workout-set.repository.js';
export { StretchSessionRepository } from './stretchSession.repository.js';

// Singleton instances for use with the default database
let exerciseRepository: ExerciseRepository | null = null;
let planRepository: PlanRepository | null = null;
let planDayRepository: PlanDayRepository | null = null;
let planDayExerciseRepository: PlanDayExerciseRepository | null = null;
let mesocycleRepository: MesocycleRepository | null = null;
let workoutRepository: WorkoutRepository | null = null;
let workoutSetRepository: WorkoutSetRepository | null = null;
let stretchSessionRepository: StretchSessionRepository | null = null;

// Reset all repository singletons (for testing)
export function resetRepositories(): void {
  exerciseRepository = null;
  planRepository = null;
  planDayRepository = null;
  planDayExerciseRepository = null;
  mesocycleRepository = null;
  workoutRepository = null;
  workoutSetRepository = null;
  stretchSessionRepository = null;
}

export function getExerciseRepository(): ExerciseRepository {
  if (!exerciseRepository) {
    exerciseRepository = new ExerciseRepository(getDatabase());
  }
  return exerciseRepository;
}

export function getPlanRepository(): PlanRepository {
  if (!planRepository) {
    planRepository = new PlanRepository(getDatabase());
  }
  return planRepository;
}

export function getPlanDayRepository(): PlanDayRepository {
  if (!planDayRepository) {
    planDayRepository = new PlanDayRepository(getDatabase());
  }
  return planDayRepository;
}

export function getPlanDayExerciseRepository(): PlanDayExerciseRepository {
  if (!planDayExerciseRepository) {
    planDayExerciseRepository = new PlanDayExerciseRepository(getDatabase());
  }
  return planDayExerciseRepository;
}

export function getMesocycleRepository(): MesocycleRepository {
  if (!mesocycleRepository) {
    mesocycleRepository = new MesocycleRepository(getDatabase());
  }
  return mesocycleRepository;
}

export function getWorkoutRepository(): WorkoutRepository {
  if (!workoutRepository) {
    workoutRepository = new WorkoutRepository(getDatabase());
  }
  return workoutRepository;
}

export function getWorkoutSetRepository(): WorkoutSetRepository {
  if (!workoutSetRepository) {
    workoutSetRepository = new WorkoutSetRepository(getDatabase());
  }
  return workoutSetRepository;
}

export function getStretchSessionRepository(): StretchSessionRepository {
  if (!stretchSessionRepository) {
    stretchSessionRepository = new StretchSessionRepository(getDatabase());
  }
  return stretchSessionRepository;
}

// Helper to create repositories with a custom database (useful for testing)
export function createRepositories(db: Database): {
  exercise: ExerciseRepository;
  plan: PlanRepository;
  planDay: PlanDayRepository;
  planDayExercise: PlanDayExerciseRepository;
  mesocycle: MesocycleRepository;
  workout: WorkoutRepository;
  workoutSet: WorkoutSetRepository;
  stretchSession: StretchSessionRepository;
} {
  return {
    exercise: new ExerciseRepository(db),
    plan: new PlanRepository(db),
    planDay: new PlanDayRepository(db),
    planDayExercise: new PlanDayExerciseRepository(db),
    mesocycle: new MesocycleRepository(db),
    workout: new WorkoutRepository(db),
    workoutSet: new WorkoutSetRepository(db),
    stretchSession: new StretchSessionRepository(db),
  };
}
