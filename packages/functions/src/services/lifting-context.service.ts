/**
 * Lifting Context Service
 *
 * Shared helpers for building lifting workout context.
 * Used by both the cycling coach and today coach.
 *
 * Extracted from cycling-coach.ts to avoid duplication.
 */

import {
  getWorkoutRepository,
  getPlanDayRepository,
  getWorkoutSetRepository,
} from '../repositories/index.js';
import { MesocycleService } from './mesocycle.service.js';
import { getFirestoreDb } from '../firebase.js';
import type {
  LiftingWorkoutSummary,
  LiftingScheduleContext,
  MesocycleContext,
  Workout,
} from '../shared.js';

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Detect if a workout name suggests lower body exercises.
 */
function isLowerBodyWorkout(planDayName: string): boolean {
  const lower = planDayName.toLowerCase();
  return (
    lower.includes('leg') ||
    lower.includes('lower') ||
    lower.includes('squat') ||
    lower.includes('deadlift')
  );
}

/**
 * Build lifting workout context from the last 7 days of completed workouts.
 */
export async function buildLiftingContext(timezoneOffset: number): Promise<LiftingWorkoutSummary[]> {
  const workoutRepo = getWorkoutRepository();
  const planDayRepo = getPlanDayRepository();
  const workoutSetRepo = getWorkoutSetRepository();

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const startDate = formatDate(sevenDaysAgo);
  const endDate = formatDate(now);

  const completedWorkouts = await workoutRepo.findCompletedInDateRange(
    startDate,
    endDate,
    timezoneOffset
  );

  const summaries: LiftingWorkoutSummary[] = [];

  for (const workout of completedWorkouts) {
    let workoutDayName = 'Workout';
    let lowerBody = false;
    if (workout.plan_day_id) {
      const planDay = await planDayRepo.findById(workout.plan_day_id);
      if (planDay) {
        workoutDayName = planDay.name;
        lowerBody = isLowerBodyWorkout(planDay.name);
      }
    }

    const sets = await workoutSetRepo.findByWorkoutId(workout.id);
    let setsCompleted = 0;
    let totalVolume = 0;

    for (const set of sets) {
      if (set.status === 'completed') {
        setsCompleted++;
        if (set.actual_weight !== null && set.actual_reps !== null) {
          totalVolume += set.actual_weight * set.actual_reps;
        }
      }
    }

    let durationMinutes = 0;
    if (workout.started_at !== null && workout.completed_at !== null) {
      const startMs = new Date(workout.started_at).getTime();
      const endMs = new Date(workout.completed_at).getTime();
      durationMinutes = Math.round((endMs - startMs) / (1000 * 60));
    }

    summaries.push({
      date: workout.completed_at ?? workout.scheduled_date,
      durationMinutes,
      avgHeartRate: 0,
      maxHeartRate: 0,
      activeCalories: 0,
      workoutDayName,
      setsCompleted,
      totalVolume,
      isLowerBody: lowerBody,
    });
  }

  return summaries;
}

/**
 * Build lifting schedule context for today/tomorrow/yesterday.
 */
export async function buildLiftingSchedule(): Promise<LiftingScheduleContext> {
  const workoutRepo = getWorkoutRepository();
  const planDayRepo = getPlanDayRepository();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const todayStr = formatDate(now);
  const yesterdayStr = formatDate(yesterday);
  const tomorrowStr = formatDate(tomorrow);

  async function getWorkoutInfo(workout: Workout): Promise<{ name: string; isLowerBody: boolean }> {
    if (workout.plan_day_id) {
      const planDay = await planDayRepo.findById(workout.plan_day_id);
      if (planDay) {
        return { name: planDay.name, isLowerBody: isLowerBodyWorkout(planDay.name) };
      }
    }
    return { name: 'Workout', isLowerBody: false };
  }

  const yesterdayWorkouts = await workoutRepo.findCompletedInDateRange(yesterdayStr, yesterdayStr);
  let yesterdayResult: LiftingScheduleContext['yesterday'] = { completed: false };
  if (yesterdayWorkouts.length > 0 && yesterdayWorkouts[0]) {
    const info = await getWorkoutInfo(yesterdayWorkouts[0]);
    yesterdayResult = { completed: true, workoutName: info.name, isLowerBody: info.isLowerBody };
  }

  const todayWorkouts = await workoutRepo.findByDate(todayStr);
  const todayPlanned = todayWorkouts.filter(
    (w) => w.status === 'pending' || w.status === 'in_progress'
  );
  let todayResult: LiftingScheduleContext['today'] = { planned: false };
  if (todayPlanned.length > 0 && todayPlanned[0]) {
    const info = await getWorkoutInfo(todayPlanned[0]);
    todayResult = { planned: true, workoutName: info.name, isLowerBody: info.isLowerBody };
  }

  const tomorrowWorkouts = await workoutRepo.findByDate(tomorrowStr);
  const tomorrowPlanned = tomorrowWorkouts.filter((w) => w.status === 'pending');
  let tomorrowResult: LiftingScheduleContext['tomorrow'] = { planned: false };
  if (tomorrowPlanned.length > 0 && tomorrowPlanned[0]) {
    const info = await getWorkoutInfo(tomorrowPlanned[0]);
    tomorrowResult = { planned: true, workoutName: info.name, isLowerBody: info.isLowerBody };
  }

  return {
    today: todayResult,
    tomorrow: tomorrowResult,
    yesterday: yesterdayResult,
  };
}

// Lazy MesocycleService initialization
let mesocycleServiceInstance: MesocycleService | null = null;
function getMesocycleServiceInstance(): MesocycleService {
  if (mesocycleServiceInstance === null) {
    mesocycleServiceInstance = new MesocycleService(getFirestoreDb());
  }
  return mesocycleServiceInstance;
}

/**
 * Build mesocycle context.
 */
export async function buildMesocycleContext(): Promise<MesocycleContext | undefined> {
  const service = getMesocycleServiceInstance();
  const active = await service.getActive();
  if (!active) {
    return undefined;
  }

  return {
    currentWeek: active.current_week,
    isDeloadWeek: active.current_week === 7,
    planName: active.plan_name,
  };
}
