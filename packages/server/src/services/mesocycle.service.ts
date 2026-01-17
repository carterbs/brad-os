import type { Database } from 'better-sqlite3';
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
} from '@lifting/shared';
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

export class MesocycleService {
  private mesocycleRepo: MesocycleRepository;
  private planRepo: PlanRepository;
  private planDayRepo: PlanDayRepository;
  private planDayExerciseRepo: PlanDayExerciseRepository;
  private exerciseRepo: ExerciseRepository;
  private workoutRepo: WorkoutRepository;
  private workoutSetRepo: WorkoutSetRepository;

  constructor(db: Database) {
    this.mesocycleRepo = new MesocycleRepository(db);
    this.planRepo = new PlanRepository(db);
    this.planDayRepo = new PlanDayRepository(db);
    this.planDayExerciseRepo = new PlanDayExerciseRepository(db);
    this.exerciseRepo = new ExerciseRepository(db);
    this.workoutRepo = new WorkoutRepository(db);
    this.workoutSetRepo = new WorkoutSetRepository(db);
  }

  /**
   * Create a new mesocycle from a plan
   * Validates plan exists, no active mesocycle, and generates workouts
   */
  create(request: CreateMesocycleRequest): Mesocycle {
    // Check if plan exists
    const plan = this.planRepo.findById(request.plan_id);
    if (!plan) {
      throw new Error(`Plan with id ${request.plan_id} not found`);
    }

    // Check for existing active mesocycle
    const activeMesocycles = this.mesocycleRepo.findActive();
    if (activeMesocycles.length > 0) {
      throw new Error('An active mesocycle already exists');
    }

    // Get plan days with exercises
    const planDays = this.planDayRepo.findByPlanId(request.plan_id);
    if (planDays.length === 0) {
      throw new Error('Plan has no workout days configured');
    }

    // Get exercises for each plan day
    const planDaysWithExercises: PlanDayWithExercises[] = planDays.map(
      (day) => {
        const planDayExercises = this.planDayExerciseRepo.findByPlanDayId(
          day.id
        );
        const exercises = planDayExercises.map((pde) => {
          const exercise = this.exerciseRepo.findById(pde.exercise_id);
          if (!exercise) {
            throw new Error(`Exercise with id ${pde.exercise_id} not found`);
          }
          return {
            planDayExercise: pde,
            exercise,
          };
        });
        return { day, exercises };
      }
    );

    // Create mesocycle
    const mesocycle = this.mesocycleRepo.create({
      plan_id: request.plan_id,
      start_date: request.start_date,
    });

    // Generate workouts for each week (7 weeks total: 6 regular + 1 deload)
    this.generateWorkouts(
      mesocycle.id,
      planDaysWithExercises,
      request.start_date
    );

    return mesocycle;
  }

  /**
   * Get the currently active mesocycle with details
   */
  getActive(): MesocycleWithDetails | null {
    const activeMesocycles = this.mesocycleRepo.findActive();
    const firstActive = activeMesocycles[0];
    if (!firstActive) {
      return null;
    }

    return this.getById(firstActive.id);
  }

  /**
   * Get a mesocycle by ID with full details
   */
  getById(id: number): MesocycleWithDetails | null {
    const mesocycle = this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      return null;
    }

    const plan = this.planRepo.findById(mesocycle.plan_id);
    const workouts = this.workoutRepo.findByMesocycleId(id);
    const planDays = this.planDayRepo.findByPlanId(mesocycle.plan_id);

    // Build week summaries
    const weeks: WeekSummary[] = [];
    for (let weekNum = 1; weekNum <= 7; weekNum++) {
      const weekWorkouts = workouts.filter((w) => w.week_number === weekNum);
      const workoutSummaries: WorkoutSummary[] = weekWorkouts.map((workout) => {
        const planDay = planDays.find((d) => d.id === workout.plan_day_id);
        const sets = this.workoutSetRepo.findByWorkoutId(workout.id);
        const uniqueExercises = new Set(sets.map((s) => s.exercise_id));
        const completedSets = sets.filter(
          (s) => s.status === 'completed'
        ).length;

        const dayOfWeek: DayOfWeek = (planDay?.day_of_week ?? 0);
        return {
          id: workout.id,
          plan_day_id: workout.plan_day_id,
          plan_day_name: planDay?.name ?? 'Unknown',
          day_of_week: dayOfWeek,
          week_number: workout.week_number,
          scheduled_date: workout.scheduled_date,
          status: workout.status,
          exercise_count: uniqueExercises.size,
          set_count: sets.length,
          completed_set_count: completedSets,
        };
      });

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
  list(): Mesocycle[] {
    return this.mesocycleRepo.findAll();
  }

  /**
   * Mark a mesocycle as completed
   */
  complete(id: number): Mesocycle {
    const mesocycle = this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      throw new Error(`Mesocycle with id ${id} not found`);
    }

    if (mesocycle.status !== 'active') {
      throw new Error('Mesocycle is not active');
    }

    const updated = this.mesocycleRepo.update(id, { status: 'completed' });
    if (!updated) {
      throw new Error(`Failed to update mesocycle with id ${id}`);
    }
    return updated;
  }

  /**
   * Cancel a mesocycle (preserves data)
   */
  cancel(id: number): Mesocycle {
    const mesocycle = this.mesocycleRepo.findById(id);
    if (!mesocycle) {
      throw new Error(`Mesocycle with id ${id} not found`);
    }

    if (mesocycle.status !== 'active') {
      throw new Error('Mesocycle is not active');
    }

    const updated = this.mesocycleRepo.update(id, { status: 'cancelled' });
    if (!updated) {
      throw new Error(`Failed to update mesocycle with id ${id}`);
    }
    return updated;
  }

  /**
   * Generate all workouts and sets for a mesocycle
   */
  private generateWorkouts(
    mesocycleId: number,
    planDaysWithExercises: PlanDayWithExercises[],
    startDate: string
  ): void {
    const startDateObj = new Date(startDate + 'T00:00:00');

    for (let weekNum = 1; weekNum <= 7; weekNum++) {
      const isDeload = weekNum === 7;

      for (const { day, exercises } of planDaysWithExercises) {
        // Calculate scheduled date based on week number and day_of_week
        const scheduledDate = this.calculateScheduledDate(
          startDateObj,
          weekNum,
          day.day_of_week
        );

        // Create workout
        const workout = this.workoutRepo.create({
          mesocycle_id: mesocycleId,
          plan_day_id: day.id,
          week_number: weekNum,
          scheduled_date: scheduledDate,
        });

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
            this.workoutSetRepo.create({
              workout_id: workout.id,
              exercise_id: exercise.id,
              set_number: setNum,
              target_reps: targetReps,
              target_weight: targetWeight,
            });
          }
        }
      }
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

    // If target day is before or same as start day in week 1, it should be in that week
    // For subsequent weeks, add (weekNumber - 1) * 7 days

    // Calculate the date
    const daysToAdd = (weekNumber - 1) * 7 + dayOffset;
    date.setDate(date.getDate() + daysToAdd);

    // Format as YYYY-MM-DD
    const isoDate = date.toISOString().split('T')[0];
    if (isoDate === undefined || isoDate === '') {
      throw new Error('Failed to format date');
    }
    return isoDate;
  }

  /**
   * Calculate progressive overload values for a week
   *
   * Progression scheme:
   * - Week 1: Base values
   * - Odd weeks (3, 5): +1 rep from previous even week
   * - Even weeks (2, 4, 6): +weight, reset reps to base
   * - Week 7 (deload): Same weight as week 6, 50% sets
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
      // Deload week: use week 6 weight, 50% sets (rounded up)
      const week6Weight = baseWeight + weightIncrement * 3; // 3 weight increases (weeks 2, 4, 6)
      return {
        targetReps: baseReps,
        targetWeight: week6Weight,
        setCount: Math.ceil(baseSets / 2),
      };
    }

    // Calculate weight based on even weeks completed
    // Week 1: 0 increases, Week 2: 1, Week 3: 1, Week 4: 2, Week 5: 2, Week 6: 3
    const weightIncreases = Math.floor(weekNumber / 2);
    const targetWeight = baseWeight + weightIncrement * weightIncreases;

    // Calculate reps
    // Even weeks: base reps (after weight increase)
    // Odd weeks (except 1): base reps + 1
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
