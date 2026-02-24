// Base entity with timestamps
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// Exercises
export interface Exercise extends BaseEntity {
  name: string;
  weight_increment: number;
  is_custom: boolean;
}

// Plans
export interface Plan extends BaseEntity {
  name: string;
  duration_weeks: number;
}

// Plan Days
export interface PlanDay {
  id: string;
  plan_id: string;
  day_of_week: DayOfWeek;
  name: string;
  sort_order: number;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Plan Day Exercises
export interface PlanDayExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  sort_order: number;
  /** Minimum reps in the rep range (drop to this after adding weight). Default: 8 */
  min_reps: number;
  /** Maximum reps in the rep range (triggers weight increase). Default: 12 */
  max_reps: number;
}

// Mesocycles
export type MesocycleStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface Mesocycle extends BaseEntity {
  plan_id: string;
  start_date: string;
  current_week: number;
  status: MesocycleStatus;
}

// Workouts
export type WorkoutStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface Workout {
  id: string;
  mesocycle_id: string;
  plan_day_id: string;
  week_number: number;
  scheduled_date: string;
  status: WorkoutStatus;
  started_at: string | null;
  completed_at: string | null;
}

// Workout Sets
export type WorkoutSetStatus = 'pending' | 'completed' | 'skipped';

export interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  target_reps: number;
  target_weight: number;
  actual_reps: number | null;
  actual_weight: number | null;
  status: WorkoutSetStatus;
}

// ============ Extended Types for Mesocycle Management ============

// Workout with related data for display
export interface WorkoutWithSets extends Workout {
  sets: WorkoutSet[];
  plan_day_name: string;
}

// Computed warm-up set (not persisted, calculated on-the-fly)
export interface WarmupSet {
  warmup_number: number;
  target_weight: number;
  target_reps: number;
}

// Exercise info with target values for a workout
export interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  sets: WorkoutSet[];
  total_sets: number;
  completed_sets: number;
  warmup_sets: WarmupSet[];
}

// Workout summary for week display
export interface WorkoutSummary {
  id: string;
  plan_day_id: string;
  plan_day_name: string;
  day_of_week: DayOfWeek;
  week_number: number;
  scheduled_date: string;
  status: WorkoutStatus;
  completed_at: string | null;
  exercise_count: number;
  set_count: number;
  completed_set_count: number;
}

// Week summary for mesocycle view
export interface WeekSummary {
  week_number: number;
  is_deload: boolean;
  workouts: WorkoutSummary[];
  total_workouts: number;
  completed_workouts: number;
  skipped_workouts: number;
}

// Mesocycle with all related data
export interface MesocycleWithDetails extends Mesocycle {
  plan_name: string;
  weeks: WeekSummary[];
  total_workouts: number;
  completed_workouts: number;
}

// Request types for mesocycle creation
export interface CreateMesocycleRequest {
  plan_id: string;
  start_date: string;
}

// Plan with days and exercises for mesocycle creation
export interface PlanWithDays extends Plan {
  days: PlanDayWithExercises[];
}

export interface PlanDayWithExercises extends PlanDay {
  exercises: PlanDayExerciseWithDetails[];
}

export interface PlanDayExerciseWithDetails extends PlanDayExercise {
  exercise_name: string;
  weight_increment: number;
}

// ============ Extended Workout Types ============

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

/**
 * A completed set row with workout context for exercise history.
 */
export interface CompletedSetRow {
  workout_id: string;
  exercise_id: string;
  set_number: number;
  actual_weight: number;
  actual_reps: number;
  scheduled_date: string;
  completed_at: string | null;
  week_number: number;
  mesocycle_id: string;
}

// ============ Set Modification Types ============

export interface ModifySetCountResult {
  currentWorkoutSet: WorkoutSet | null;
  futureWorkoutsAffected: number;
  futureSetsModified: number;
}

// ============ Exercise History Types ============

/** A single historical data point for an exercise (one workout session) */
export interface ExerciseHistoryEntry {
  workout_id: string;
  date: string;
  week_number: number;
  mesocycle_id: string;
  sets: Array<{
    set_number: number;
    weight: number;
    reps: number;
  }>;
  best_weight: number;
  best_set_reps: number;
}

/** Full exercise history response */
export interface ExerciseHistory {
  exercise_id: string;
  exercise_name: string;
  entries: ExerciseHistoryEntry[];
  personal_record: {
    weight: number;
    reps: number;
    date: string;
  } | null;
}

// ============ Barcodes ============

export type BarcodeType = 'code128' | 'code39' | 'qr';

export interface Barcode extends BaseEntity {
  label: string;
  value: string;
  barcode_type: BarcodeType;
  color: string;
  sort_order: number;
}

