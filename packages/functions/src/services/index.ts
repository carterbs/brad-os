import type { Firestore } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../firebase.js';
import { MesocycleService } from './mesocycle.service.js';
import { WorkoutSetService } from './workout-set.service.js';
import { WorkoutService } from './workout.service.js';
import { ProgressionService } from './progression.service.js';
import { DynamicProgressionService } from './dynamic-progression.service.js';
import { PlanModificationService } from './plan-modification.service.js';
import { CalendarService } from './calendar.service.js';
import { createRepositories } from '../repositories/index.js';

export { MesocycleService } from './mesocycle.service.js';
export { WorkoutSetService } from './workout-set.service.js';
export { WorkoutService } from './workout.service.js';
export { ProgressionService } from './progression.service.js';
export { DynamicProgressionService } from './dynamic-progression.service.js';
export { PlanModificationService } from './plan-modification.service.js';
export { CalendarService } from './calendar.service.js';
export type {
  WorkoutWithExercises,
  WorkoutExerciseWithSets,
} from './workout.service.js';
export type {
  DynamicProgressionResult,
  ProgressionReason,
} from './dynamic-progression.service.js';

// Singleton instances for use with the default database
let mesocycleService: MesocycleService | null = null;
let workoutSetService: WorkoutSetService | null = null;
let workoutService: WorkoutService | null = null;
let progressionService: ProgressionService | null = null;
let dynamicProgressionService: DynamicProgressionService | null = null;
let planModificationService: PlanModificationService | null = null;
let calendarService: CalendarService | null = null;

// Reset all service singletons (for testing)
export function resetServices(): void {
  mesocycleService = null;
  workoutSetService = null;
  workoutService = null;
  progressionService = null;
  dynamicProgressionService = null;
  planModificationService = null;
  calendarService = null;
}

export function getMesocycleService(): MesocycleService {
  if (!mesocycleService) {
    mesocycleService = new MesocycleService(getFirestoreDb());
  }
  return mesocycleService;
}

export function getWorkoutSetService(): WorkoutSetService {
  if (!workoutSetService) {
    workoutSetService = new WorkoutSetService(getFirestoreDb());
  }
  return workoutSetService;
}

export function getWorkoutService(): WorkoutService {
  if (!workoutService) {
    workoutService = new WorkoutService(getFirestoreDb());
  }
  return workoutService;
}

export function getProgressionService(): ProgressionService {
  if (!progressionService) {
    progressionService = new ProgressionService();
  }
  return progressionService;
}

export function getDynamicProgressionService(): DynamicProgressionService {
  if (!dynamicProgressionService) {
    dynamicProgressionService = new DynamicProgressionService();
  }
  return dynamicProgressionService;
}

export function getPlanModificationService(): PlanModificationService {
  if (!planModificationService) {
    const repos = createRepositories(getFirestoreDb());
    planModificationService = new PlanModificationService(
      repos,
      getProgressionService()
    );
  }
  return planModificationService;
}

export function getCalendarService(): CalendarService {
  if (!calendarService) {
    calendarService = new CalendarService(getFirestoreDb());
  }
  return calendarService;
}

// Helper to create services with a custom database (useful for testing)
export function createServices(db: Firestore): {
  mesocycle: MesocycleService;
  workoutSet: WorkoutSetService;
  workout: WorkoutService;
  progression: ProgressionService;
  dynamicProgression: DynamicProgressionService;
  planModification: PlanModificationService;
  calendar: CalendarService;
} {
  const repos = createRepositories(db);
  const progression = new ProgressionService();
  return {
    mesocycle: new MesocycleService(db),
    workoutSet: new WorkoutSetService(db),
    workout: new WorkoutService(db),
    progression,
    dynamicProgression: new DynamicProgressionService(),
    planModification: new PlanModificationService(repos, progression),
    calendar: new CalendarService(db),
  };
}
