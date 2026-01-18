import { APIRequestContext } from '@playwright/test';

// Types matching the server's response format
export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Exercise {
  id: number;
  name: string;
  weight_increment: number;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: number;
  name: string;
  duration_weeks: number;
  created_at: string;
  updated_at: string;
}

export interface PlanDay {
  id: number;
  plan_id: number;
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  sort_order: number;
}

export interface PlanDayExercise {
  id: number;
  plan_day_id: number;
  exercise_id: number;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  sort_order: number;
}

export interface Mesocycle {
  id: number;
  plan_id: number;
  start_date: string;
  current_week: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: number;
  mesocycle_id: number;
  plan_day_id: number;
  week_number: number;
  scheduled_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkoutSet {
  id: number;
  workout_id: number;
  exercise_id: number;
  set_number: number;
  target_reps: number;
  target_weight: number;
  actual_reps: number | null;
  actual_weight: number | null;
  status: 'pending' | 'completed' | 'skipped';
}

export interface WorkoutExercise {
  exercise_id: number;
  exercise_name: string;
  sets: WorkoutSet[];
  total_sets: number;
  completed_sets: number;
}

export interface WorkoutWithExercises extends Workout {
  plan_day_name: string;
  exercises: WorkoutExercise[];
}

export interface CreatePlanDayInput {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  sort_order: number;
}

export interface CreatePlanDayExerciseInput {
  exercise_id: number;
  sets?: number;
  reps?: number;
  weight?: number;
  rest_seconds?: number;
  sort_order: number;
}

/**
 * API Helper for seeding test data via the backend API
 */
export class ApiHelper {
  private apiUrl: string;

  constructor(
    private request: APIRequestContext,
    baseUrl = 'http://localhost:3001'
  ) {
    this.apiUrl = `${baseUrl}/api`;
  }

  /**
   * Reset the database to a clean state
   */
  async resetDatabase(): Promise<void> {
    const response = await this.request.post(`${this.apiUrl}/test/reset`);
    if (!response.ok()) {
      throw new Error(`Failed to reset database: ${response.status()}`);
    }
  }

  // ============ Exercises ============

  async createExercise(
    name: string,
    weightIncrement = 5
  ): Promise<Exercise> {
    const response = await this.request.post(`${this.apiUrl}/exercises`, {
      data: {
        name,
        weight_increment: weightIncrement,
        is_custom: true,
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to create exercise: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Exercise>;
    return json.data;
  }

  async getExercises(): Promise<Exercise[]> {
    const response = await this.request.get(`${this.apiUrl}/exercises`);

    if (!response.ok()) {
      throw new Error(`Failed to get exercises: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Exercise[]>;
    return json.data;
  }

  async getExerciseByName(name: string): Promise<Exercise | undefined> {
    const exercises = await this.getExercises();
    return exercises.find((e) => e.name === name);
  }

  async deleteExercise(id: number): Promise<void> {
    const response = await this.request.delete(
      `${this.apiUrl}/exercises/${id}`
    );

    if (!response.ok()) {
      throw new Error(`Failed to delete exercise: ${response.status()}`);
    }
  }

  // ============ Plans ============

  async createPlan(name: string, durationWeeks = 6): Promise<Plan> {
    const response = await this.request.post(`${this.apiUrl}/plans`, {
      data: {
        name,
        duration_weeks: durationWeeks,
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to create plan: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Plan>;
    return json.data;
  }

  async getPlans(): Promise<Plan[]> {
    const response = await this.request.get(`${this.apiUrl}/plans`);

    if (!response.ok()) {
      throw new Error(`Failed to get plans: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Plan[]>;
    return json.data;
  }

  async deletePlan(id: number): Promise<void> {
    const response = await this.request.delete(`${this.apiUrl}/plans/${id}`);

    if (!response.ok()) {
      throw new Error(`Failed to delete plan: ${response.status()}`);
    }
  }

  // ============ Plan Days ============

  async createPlanDay(
    planId: number,
    input: CreatePlanDayInput
  ): Promise<PlanDay> {
    const response = await this.request.post(
      `${this.apiUrl}/plans/${planId}/days`,
      {
        data: input,
      }
    );

    if (!response.ok()) {
      throw new Error(`Failed to create plan day: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<PlanDay>;
    return json.data;
  }

  async getPlanDays(planId: number): Promise<PlanDay[]> {
    const response = await this.request.get(
      `${this.apiUrl}/plans/${planId}/days`
    );

    if (!response.ok()) {
      throw new Error(`Failed to get plan days: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<PlanDay[]>;
    return json.data;
  }

  // ============ Plan Day Exercises ============

  async addExerciseToPlanDay(
    planId: number,
    dayId: number,
    input: CreatePlanDayExerciseInput
  ): Promise<PlanDayExercise> {
    const response = await this.request.post(
      `${this.apiUrl}/plans/${planId}/days/${dayId}/exercises`,
      {
        data: input,
      }
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to add exercise to plan day: ${response.status()}`
      );
    }

    const json = (await response.json()) as ApiResponse<PlanDayExercise>;
    return json.data;
  }

  // ============ Mesocycles ============

  async createMesocycle(planId: number, startDate: string): Promise<Mesocycle> {
    const response = await this.request.post(`${this.apiUrl}/mesocycles`, {
      data: {
        plan_id: planId,
        start_date: startDate,
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to create mesocycle: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Mesocycle>;
    return json.data;
  }

  async getActiveMesocycle(): Promise<Mesocycle | null> {
    const response = await this.request.get(`${this.apiUrl}/mesocycles/active`);

    if (!response.ok()) {
      throw new Error(`Failed to get active mesocycle: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Mesocycle | null>;
    return json.data;
  }

  async cancelMesocycle(id: number): Promise<Mesocycle> {
    const response = await this.request.put(
      `${this.apiUrl}/mesocycles/${id}/cancel`
    );

    if (!response.ok()) {
      throw new Error(`Failed to cancel mesocycle: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Mesocycle>;
    return json.data;
  }

  async startMesocycle(id: number): Promise<Mesocycle> {
    const response = await this.request.put(
      `${this.apiUrl}/mesocycles/${id}/start`
    );

    if (!response.ok()) {
      throw new Error(`Failed to start mesocycle: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Mesocycle>;
    return json.data;
  }

  // ============ Workouts ============

  async getTodaysWorkout(): Promise<WorkoutWithExercises | null> {
    const response = await this.request.get(`${this.apiUrl}/workouts/today`);

    if (!response.ok()) {
      throw new Error(`Failed to get today's workout: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<WorkoutWithExercises | null>;
    return json.data;
  }

  async getWorkouts(): Promise<Workout[]> {
    const response = await this.request.get(`${this.apiUrl}/workouts`);

    if (!response.ok()) {
      throw new Error(`Failed to get workouts: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Workout[]>;
    return json.data;
  }

  async getWorkoutById(id: number): Promise<WorkoutWithExercises> {
    const response = await this.request.get(`${this.apiUrl}/workouts/${id}`);

    if (!response.ok()) {
      throw new Error(`Failed to get workout: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<WorkoutWithExercises>;
    return json.data;
  }

  async startWorkout(id: number): Promise<Workout> {
    const response = await this.request.put(
      `${this.apiUrl}/workouts/${id}/start`
    );

    if (!response.ok()) {
      throw new Error(`Failed to start workout: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Workout>;
    return json.data;
  }

  async completeWorkout(id: number): Promise<Workout> {
    const response = await this.request.put(
      `${this.apiUrl}/workouts/${id}/complete`
    );

    if (!response.ok()) {
      throw new Error(`Failed to complete workout: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<Workout>;
    return json.data;
  }

  // ============ Workout Sets ============

  async logSet(
    setId: number,
    actualReps: number,
    actualWeight: number
  ): Promise<WorkoutSet> {
    const response = await this.request.put(
      `${this.apiUrl}/workout-sets/${setId}/log`,
      {
        data: {
          actual_reps: actualReps,
          actual_weight: actualWeight,
        },
      }
    );

    if (!response.ok()) {
      throw new Error(`Failed to log set: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<WorkoutSet>;
    return json.data;
  }

  async skipSet(setId: number): Promise<WorkoutSet> {
    const response = await this.request.put(
      `${this.apiUrl}/workout-sets/${setId}/skip`
    );

    if (!response.ok()) {
      throw new Error(`Failed to skip set: ${response.status()}`);
    }

    const json = (await response.json()) as ApiResponse<WorkoutSet>;
    return json.data;
  }

  // ============ Complex Setup Helpers ============

  /**
   * Creates a complete plan with days and exercises.
   * This is a convenience method for setting up test data.
   */
  async createCompletePlan(config: {
    planName: string;
    durationWeeks?: number;
    days: Array<{
      dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
      name: string;
      exercises: Array<{
        exerciseId: number;
        sets?: number;
        reps?: number;
        weight?: number;
        restSeconds?: number;
      }>;
    }>;
  }): Promise<{
    plan: Plan;
    days: PlanDay[];
  }> {
    const plan = await this.createPlan(config.planName, config.durationWeeks);

    const days: PlanDay[] = [];
    for (let i = 0; i < config.days.length; i++) {
      const dayConfig = config.days[i];
      if (!dayConfig) continue;

      const day = await this.createPlanDay(plan.id, {
        day_of_week: dayConfig.dayOfWeek,
        name: dayConfig.name,
        sort_order: i,
      });
      days.push(day);

      for (let j = 0; j < dayConfig.exercises.length; j++) {
        const exerciseConfig = dayConfig.exercises[j];
        if (!exerciseConfig) continue;

        const exerciseInput: CreatePlanDayExerciseInput = {
          exercise_id: exerciseConfig.exerciseId,
          sort_order: j,
        };
        if (exerciseConfig.sets !== undefined) exerciseInput.sets = exerciseConfig.sets;
        if (exerciseConfig.reps !== undefined) exerciseInput.reps = exerciseConfig.reps;
        if (exerciseConfig.weight !== undefined) exerciseInput.weight = exerciseConfig.weight;
        if (exerciseConfig.restSeconds !== undefined) exerciseInput.rest_seconds = exerciseConfig.restSeconds;

        await this.addExerciseToPlanDay(plan.id, day.id, exerciseInput);
      }
    }

    return { plan, days };
  }

  /**
   * Sets up a complete test scenario with a plan and active mesocycle
   * scheduled for today.
   */
  async setupWorkoutScenario(exerciseName = 'Bench Press'): Promise<{
    exercise: Exercise;
    plan: Plan;
    mesocycle: Mesocycle;
  }> {
    // Find or create the exercise
    let exercise = await this.getExerciseByName(exerciseName);
    if (!exercise) {
      exercise = await this.createExercise(exerciseName, 5);
    }

    // Get current day of week (0 = Sunday, 6 = Saturday)
    const today = new Date();
    const dayOfWeek = today.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // Create a plan with today as a workout day
    const { plan } = await this.createCompletePlan({
      planName: 'E2E Test Plan',
      days: [
        {
          dayOfWeek,
          name: 'Test Day',
          exercises: [
            {
              exerciseId: exercise.id,
              sets: 3,
              reps: 8,
              weight: 135,
              restSeconds: 90,
            },
          ],
        },
      ],
    });

    // Calculate start date to make today week 1
    // Start date should be the most recent occurrence of day 0 (Sunday)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - today.getDay());
    const startDateStr = startDate.toISOString().split('T')[0] ?? '';

    // Create mesocycle (pending status)
    const pendingMesocycle = await this.createMesocycle(plan.id, startDateStr);

    // Start the mesocycle (generates workouts and sets status to active)
    const mesocycle = await this.startMesocycle(pendingMesocycle.id);

    return { exercise, plan, mesocycle };
  }
}
