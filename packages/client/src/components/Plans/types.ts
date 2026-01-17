import type { DayOfWeek, Plan, PlanDay, PlanDayExercise, Exercise } from '@lifting/shared';

// Form state types for Plan creation/editing

export interface PlanExerciseFormState {
  tempId: string; // for React key before saved
  exerciseId: number | null;
  sets: number;
  reps: number;
  weight: number;
  restSeconds: number;
  weightIncrement: number;
}

export interface PlanDayFormState {
  tempId: string;
  dayOfWeek: DayOfWeek;
  name: string;
  exercises: PlanExerciseFormState[];
}

export interface PlanFormState {
  name: string;
  durationWeeks: number;
  days: PlanDayFormState[];
}

// Default values per plan spec
export const DEFAULT_EXERCISE_CONFIG = {
  sets: 2,
  reps: 8,
  weight: 30,
  restSeconds: 60,
  weightIncrement: 5,
} as const;

export const DEFAULT_DURATION_WEEKS = 6;

// Dropdown options per plan spec
export const SETS_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i === 0 ? 'set' : 'sets'}`,
}));

export const REPS_OPTIONS = Array.from({ length: 20 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i === 0 ? 'rep' : 'reps'}`,
}));

// Weight options (5-300 in 5lb increments)
export const WEIGHT_OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  value: String((i + 1) * 5),
  label: `${(i + 1) * 5} lbs`,
}));

// Rest time options (30-300 in 30s increments)
export const REST_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String((i + 1) * 30),
  label: `${(i + 1) * 30}s`,
}));

// Weight increment options (5-20 in 5lb increments)
export const WEIGHT_INCREMENT_OPTIONS = Array.from({ length: 4 }, (_, i) => ({
  value: String((i + 1) * 5),
  label: `+${(i + 1) * 5} lbs`,
}));

// Duration weeks options (1-52)
export const DURATION_WEEKS_OPTIONS = Array.from({ length: 52 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i === 0 ? 'week' : 'weeks'}`,
}));

export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

// Utility function to create a new exercise form state
export function createEmptyExerciseFormState(): PlanExerciseFormState {
  return {
    tempId: crypto.randomUUID(),
    exerciseId: null,
    ...DEFAULT_EXERCISE_CONFIG,
  };
}

// Utility function to create a new day form state
export function createDayFormState(dayOfWeek: DayOfWeek): PlanDayFormState {
  return {
    tempId: crypto.randomUUID(),
    dayOfWeek,
    name: DAY_NAMES[dayOfWeek],
    exercises: [],
  };
}

// Type for plan with related data (for detail views)
export interface PlanWithDetails extends Plan {
  days: (PlanDay & { exercises: (PlanDayExercise & { exercise: Exercise })[] })[];
}
