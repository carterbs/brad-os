import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { getCollectionName } from '../firebase.js';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/error-handler.js';
import type {
  Mesocycle,
  CreateMesocycleRequest,
  MesocycleWithDetails,
  WeekSummary,
  WorkoutSummary,
  DayOfWeek,
  PlanDay,
  PlanDayExercise,
  Exercise,
} from '../shared.js';
import {
  MesocycleRepository,
  PlanRepository,
  PlanDayRepository,
  PlanDayExerciseRepository,
  ExerciseRepository,
  WorkoutRepository,
  WorkoutSetRepository,
} from '../repositories/index.js';

interface PlanDayWithExercises {
  day: PlanDay;
  exercises: Array<{
    planDayExercise: PlanDayExercise;
    exercise: Exercise;
  }>;
}

interface WorkoutSetData {
  workout_id: string;
  exercise_id: string;
  set_number: number;
  target_reps: number;
  target_weight: number;
}

interface WorkoutData {
  mesocycle_id: string;
  plan_day_id: string;
  week_number: number;
  scheduled_date: string;
}

// Firestore batch limit is 500 writes
const BATCH_SIZE = 500;

export class MesocycleService {
  private db: Firestore;
  private mesocycleRepo: MesocycleRepository;
  private planRepo: PlanRepository;
  private planDayRepo: PlanDayRepository;
  private planDayExerciseRepo: PlanDayExerciseRepository;
  private exerciseRepo: ExerciseRepository;
  private workoutRepo: WorkoutRepository;
  private workoutSetRepo: WorkoutSetRepository;

  constructor(db: Firestore) {
    this.db = db;
    this.mesocycleRepo = new MesocycleRepository(db);
    this.planRepo = new PlanRepository(db);
    this.planDayRepo = new PlanDayRepository(db);
    this.planDayExerciseRepo = new PlanDayExerciseRepository(db);
    this.exerciseRepo = new ExerciseRepository(db);
    this.workoutRepo = new WorkoutRepository(db);
    this.workoutSetRepo = new WorkoutSetRepository(db);
  }

  /**
   * Create a new mesocycle from a plan (in pending status, no workouts yet)
   * Validates plan exists and has workout days configured
   */
  async create(request: CreateMesocycleRequest): Promise<Mesocycle> {
    // Check if plan exists
    const plan = await this.planRepo.findById(request.plan_id);
    if (!plan) {
      throw new NotFoundError('Plan', request.plan_id);
    }

    // Get plan days with exercises to validate plan is properly configured
    const planDays = await this.planDayRepo.findByPlanId(request.plan_id);
    if (planDays.length === 0) {
      throw new ValidationError('Plan has no workout days configured');
    }

    // Create mesocycle (defaults to 'pending' status)
    const mesocycle = await this.mesocycleRepo.create({
      plan_id: request.plan_id,
      start_date: request.start_date,
    });

    return mesocycle;
  }

  /**
   * Start a pending mesocycle - generates workouts and sets status to active
   * Uses batched writes for performance with Firestore
   * Only one mesocycle can be active at a time
   */
  async start(id: string): Promise<Mesocycle> {
    const mesocycle = await this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      throw new NotFoundError('Mesocycle', id);
    }

    if (mesocycle.status !== 'pending') {
      throw new ValidationError('Only pending mesocycles can be started');
    }

    // Check for existing active mesocycle
    const activeMesocycles = await this.mesocycleRepo.findActive();
    if (activeMesocycles.length > 0) {
      throw new ConflictError('An active mesocycle already exists');
    }

    // Get plan days with exercises
    const planDays = await this.planDayRepo.findByPlanId(mesocycle.plan_id);
    const planDaysWithExercises: PlanDayWithExercises[] = [];

    for (const day of planDays) {
      const planDayExercises = await this.planDayExerciseRepo.findByPlanDayId(
        day.id
      );
      const exercises: Array<{
        planDayExercise: PlanDayExercise;
        exercise: Exercise;
      }> = [];

      for (const pde of planDayExercises) {
        const exercise = await this.exerciseRepo.findById(pde.exercise_id);
        if (!exercise) {
          throw new NotFoundError('Exercise', pde.exercise_id);
        }
        exercises.push({
          planDayExercise: pde,
          exercise,
        });
      }

      planDaysWithExercises.push({ day, exercises });
    }

    // Generate workouts using batched writes for performance
    await this.generateWorkoutsBatched(
      mesocycle.id,
      planDaysWithExercises,
      mesocycle.start_date
    );

    // Update status to active
    const updated = await this.mesocycleRepo.update(id, { status: 'active' });
    if (!updated) {
      throw new Error(`Failed to start mesocycle with id ${id}`);
    }

    return updated;
  }

  /**
   * Get the currently active mesocycle with details
   */
  async getActive(): Promise<MesocycleWithDetails | null> {
    const activeMesocycles = await this.mesocycleRepo.findActive();
    const firstActive = activeMesocycles[0];
    if (!firstActive) {
      return null;
    }

    return this.getById(firstActive.id);
  }

  /**
   * Get a mesocycle by ID with full details
   */
  async getById(id: string): Promise<MesocycleWithDetails | null> {
    const mesocycle = await this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      return null;
    }

    const plan = await this.planRepo.findById(mesocycle.plan_id);
    const workouts = await this.workoutRepo.findByMesocycleId(id);
    const planDays = await this.planDayRepo.findByPlanId(mesocycle.plan_id);

    // Build week summaries
    const weeks: WeekSummary[] = [];
    for (let weekNum = 1; weekNum <= 7; weekNum++) {
      const weekWorkouts = workouts.filter((w) => w.week_number === weekNum);
      const workoutSummaries: WorkoutSummary[] = [];

      for (const workout of weekWorkouts) {
        const planDay = planDays.find((d) => d.id === workout.plan_day_id);
        const sets = await this.workoutSetRepo.findByWorkoutId(workout.id);
        const uniqueExercises = new Set(sets.map((s) => s.exercise_id));
        const completedSets = sets.filter(
          (s) => s.status === 'completed'
        ).length;

        const dayOfWeek: DayOfWeek = planDay?.day_of_week ?? 0;
        workoutSummaries.push({
          id: workout.id,
          plan_day_id: workout.plan_day_id,
          plan_day_name: planDay?.name ?? 'Unknown',
          day_of_week: dayOfWeek,
          week_number: workout.week_number,
          scheduled_date: workout.scheduled_date,
          status: workout.status,
          completed_at: workout.completed_at,
          exercise_count: uniqueExercises.size,
          set_count: sets.length,
          completed_set_count: completedSets,
        });
      }

      const completedWorkouts = weekWorkouts.filter(
        (w) => w.status === 'completed'
      ).length;
      const skippedWorkouts = weekWorkouts.filter(
        (w) => w.status === 'skipped'
      ).length;

      weeks.push({
        week_number: weekNum,
        is_deload: weekNum === 7,
        workouts: workoutSummaries,
        total_workouts: weekWorkouts.length,
        completed_workouts: completedWorkouts,
        skipped_workouts: skippedWorkouts,
      });
    }

    const totalWorkouts = workouts.length;
    const completedWorkouts = workouts.filter(
      (w) => w.status === 'completed'
    ).length;

    return {
      ...mesocycle,
      plan_name: plan?.name ?? 'Unknown',
      weeks,
      total_workouts: totalWorkouts,
      completed_workouts: completedWorkouts,
    };
  }

  /**
   * List all mesocycles
   */
  async list(): Promise<Mesocycle[]> {
    return this.mesocycleRepo.findAll();
  }

  /**
   * Mark a mesocycle as completed
   */
  async complete(id: string): Promise<Mesocycle> {
    const mesocycle = await this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      throw new NotFoundError('Mesocycle', id);
    }

    if (mesocycle.status !== 'active') {
      throw new ValidationError('Mesocycle is not active');
    }

    const updated = await this.mesocycleRepo.update(id, { status: 'completed' });
    if (!updated) {
      throw new Error(`Failed to update mesocycle with id ${id}`);
    }
    return updated;
  }

  /**
   * Cancel a mesocycle (preserves data)
   */
  async cancel(id: string): Promise<Mesocycle> {
    const mesocycle = await this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      throw new NotFoundError('Mesocycle', id);
    }

    if (mesocycle.status !== 'active') {
      throw new ValidationError('Mesocycle is not active');
    }

    const updated = await this.mesocycleRepo.update(id, { status: 'cancelled' });
    if (!updated) {
      throw new Error(`Failed to update mesocycle with id ${id}`);
    }
    return updated;
  }

  /**
   * Generate all workouts and sets for a mesocycle using batched writes
   * This is more efficient than individual writes, especially for Cloud Functions
   */
  private async generateWorkoutsBatched(
    mesocycleId: string,
    planDaysWithExercises: PlanDayWithExercises[],
    startDate: string
  ): Promise<void> {
    const startDateObj = new Date(startDate + 'T00:00:00');

    // First pass: collect all workout and set data
    const workoutsToCreate: Array<{ data: WorkoutData; sets: WorkoutSetData[] }> = [];

    for (let weekNum = 1; weekNum <= 7; weekNum++) {
      const isDeload = weekNum === 7;

      for (const { day, exercises } of planDaysWithExercises) {
        // Calculate scheduled date based on week number and day_of_week
        const scheduledDate = this.calculateScheduledDate(
          startDateObj,
          weekNum,
          day.day_of_week
        );

        const workoutData: WorkoutData = {
          mesocycle_id: mesocycleId,
          plan_day_id: day.id,
          week_number: weekNum,
          scheduled_date: scheduledDate,
        };

        const setsForWorkout: WorkoutSetData[] = [];

        // Create workout sets with progressive overload
        for (const { planDayExercise, exercise } of exercises) {
          const { targetReps, targetWeight, setCount } =
            this.calculateProgression(
              planDayExercise.reps,
              planDayExercise.weight,
              planDayExercise.sets,
              exercise.weight_increment,
              weekNum,
              isDeload
            );

          for (let setNum = 1; setNum <= setCount; setNum++) {
            setsForWorkout.push({
              workout_id: '', // Will be filled in after workout creation
              exercise_id: exercise.id,
              set_number: setNum,
              target_reps: targetReps,
              target_weight: targetWeight,
            });
          }
        }

        workoutsToCreate.push({ data: workoutData, sets: setsForWorkout });
      }
    }

    // Second pass: create workouts and sets in batches
    // First create all workouts to get their IDs
    const workoutIds: string[] = [];

    for (const workoutInfo of workoutsToCreate) {
      const workout = await this.workoutRepo.create(workoutInfo.data);
      workoutIds.push(workout.id);
    }

    // Now batch create all sets
    let batch: WriteBatch = this.db.batch();
    let writeCount = 0;
    const workoutSetsCollection = this.db.collection(getCollectionName('workout_sets'));

    for (let i = 0; i < workoutsToCreate.length; i++) {
      const workoutId = workoutIds[i];
      const sets = workoutsToCreate[i]?.sets ?? [];

      if (workoutId === undefined) continue;

      for (const setData of sets) {
        const docRef = workoutSetsCollection.doc();
        const now = new Date().toISOString();

        batch.set(docRef, {
          ...setData,
          workout_id: workoutId,
          status: 'pending',
          actual_reps: null,
          actual_weight: null,
          created_at: now,
        });

        writeCount++;

        // Commit batch when we hit the limit
        if (writeCount >= BATCH_SIZE) {
          await batch.commit();
          batch = this.db.batch();
          writeCount = 0;
        }
      }
    }

    // Commit any remaining writes
    if (writeCount > 0) {
      await batch.commit();
    }
  }

  /**
   * Calculate scheduled date for a workout
   */
  private calculateScheduledDate(
    startDate: Date,
    weekNumber: number,
    dayOfWeek: DayOfWeek
  ): string {
    // Clone start date
    const date = new Date(startDate);

    // Calculate offset from start date's day of week to target day
    const startDayOfWeek = date.getDay();
    const dayOffset = dayOfWeek - startDayOfWeek;

    // Calculate the date
    const daysToAdd = (weekNumber - 1) * 7 + dayOffset;
    date.setDate(date.getDate() + daysToAdd);

    // Format as YYYY-MM-DD in local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Calculate progressive overload values for a week
   */
  private calculateProgression(
    baseReps: number,
    baseWeight: number,
    baseSets: number,
    weightIncrement: number,
    weekNumber: number,
    isDeload: boolean
  ): { targetReps: number; targetWeight: number; setCount: number } {
    if (isDeload) {
      return {
        targetReps: baseReps,
        targetWeight: baseWeight,
        setCount: Math.ceil(baseSets / 2),
      };
    }

    const weightIncreases = Math.floor(weekNumber / 2);
    const targetWeight = baseWeight + weightIncrement * weightIncreases;

    let targetReps = baseReps;
    if (weekNumber > 1 && weekNumber % 2 === 1) {
      targetReps = baseReps + 1;
    }

    return {
      targetReps,
      targetWeight,
      setCount: baseSets,
    };
  }
}
