import type { Firestore } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../firebase.js';
import { ExerciseRepository } from './exercise.repository.js';
import { PlanRepository } from './plan.repository.js';
import { PlanDayRepository } from './plan-day.repository.js';
import { PlanDayExerciseRepository } from './plan-day-exercise.repository.js';
import { MesocycleRepository } from './mesocycle.repository.js';
import { WorkoutRepository } from './workout.repository.js';
import { WorkoutSetRepository } from './workout-set.repository.js';
import { StretchSessionRepository } from './stretchSession.repository.js';
import { MeditationSessionRepository } from './meditationSession.repository.js';

export { BaseRepository } from './base.repository.js';
export { ExerciseRepository } from './exercise.repository.js';
export { PlanRepository } from './plan.repository.js';
export { PlanDayRepository } from './plan-day.repository.js';
export { PlanDayExerciseRepository } from './plan-day-exercise.repository.js';
export { MesocycleRepository } from './mesocycle.repository.js';
export { WorkoutRepository } from './workout.repository.js';
export { WorkoutSetRepository } from './workout-set.repository.js';
export { StretchSessionRepository } from './stretchSession.repository.js';
export { MeditationSessionRepository } from './meditationSession.repository.js';
export type { CompletedSetRow } from './workout-set.repository.js';

// Singleton instances for use with the default database
let exerciseRepository: ExerciseRepository | null = null;
let planRepository: PlanRepository | null = null;
let planDayRepository: PlanDayRepository | null = null;
let planDayExerciseRepository: PlanDayExerciseRepository | null = null;
let mesocycleRepository: MesocycleRepository | null = null;
let workoutRepository: WorkoutRepository | null = null;
let workoutSetRepository: WorkoutSetRepository | null = null;
let stretchSessionRepository: StretchSessionRepository | null = null;
let meditationSessionRepository: MeditationSessionRepository | null = null;

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
  meditationSessionRepository = null;
}

export function getExerciseRepository(): ExerciseRepository {
  if (!exerciseRepository) {
    exerciseRepository = new ExerciseRepository(getFirestoreDb());
  }
  return exerciseRepository;
}

export function getPlanRepository(): PlanRepository {
  if (!planRepository) {
    planRepository = new PlanRepository(getFirestoreDb());
  }
  return planRepository;
}

export function getPlanDayRepository(): PlanDayRepository {
  if (!planDayRepository) {
    planDayRepository = new PlanDayRepository(getFirestoreDb());
  }
  return planDayRepository;
}

export function getPlanDayExerciseRepository(): PlanDayExerciseRepository {
  if (!planDayExerciseRepository) {
    planDayExerciseRepository = new PlanDayExerciseRepository(getFirestoreDb());
  }
  return planDayExerciseRepository;
}

export function getMesocycleRepository(): MesocycleRepository {
  if (!mesocycleRepository) {
    mesocycleRepository = new MesocycleRepository(getFirestoreDb());
  }
  return mesocycleRepository;
}

export function getWorkoutRepository(): WorkoutRepository {
  if (!workoutRepository) {
    workoutRepository = new WorkoutRepository(getFirestoreDb());
  }
  return workoutRepository;
}

export function getWorkoutSetRepository(): WorkoutSetRepository {
  if (!workoutSetRepository) {
    workoutSetRepository = new WorkoutSetRepository(getFirestoreDb());
  }
  return workoutSetRepository;
}

export function getStretchSessionRepository(): StretchSessionRepository {
  if (!stretchSessionRepository) {
    stretchSessionRepository = new StretchSessionRepository(getFirestoreDb());
  }
  return stretchSessionRepository;
}

export function getMeditationSessionRepository(): MeditationSessionRepository {
  if (!meditationSessionRepository) {
    meditationSessionRepository = new MeditationSessionRepository(getFirestoreDb());
  }
  return meditationSessionRepository;
}

// Helper to create repositories with a custom database (useful for testing)
export function createRepositories(db: Firestore): {
  exercise: ExerciseRepository;
  plan: PlanRepository;
  planDay: PlanDayRepository;
  planDayExercise: PlanDayExerciseRepository;
  mesocycle: MesocycleRepository;
  workout: WorkoutRepository;
  workoutSet: WorkoutSetRepository;
  stretchSession: StretchSessionRepository;
  meditationSession: MeditationSessionRepository;
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
    meditationSession: new MeditationSessionRepository(db),
  };
}
