import type { Firestore } from 'firebase-admin/firestore';
import { ExerciseRepository } from '../repositories/exercise.repository.js';
import { PlanRepository } from '../repositories/plan.repository.js';
import { PlanDayRepository } from '../repositories/plan-day.repository.js';
import { PlanDayExerciseRepository } from '../repositories/plan-day-exercise.repository.js';
import { MesocycleService } from '../services/mesocycle.service.js';

export const DEFAULT_EXERCISES = [
  { name: 'Dumbbell Press (Flat)', weight_increment: 5.0 },
  { name: 'Seated Cable Row', weight_increment: 5.0 },
  { name: 'Leg Extension', weight_increment: 5.0 },
  { name: 'Machine Triceps Extension', weight_increment: 5.0 },
  { name: 'Machine Preacher Curl', weight_increment: 5.0 },
  { name: 'Dumbbell Lateral Raise (Super ROM)', weight_increment: 2.5 },
  { name: 'Pulldown (Narrow Grip)', weight_increment: 5.0 },
  { name: 'Pec Dec Flye', weight_increment: 5.0 },
  { name: 'Machine Reverse Flye', weight_increment: 5.0 },
  { name: 'Cable Triceps Pushdown (Single-Arm)', weight_increment: 5.0 },
  { name: 'Cable Curl', weight_increment: 5.0 },
  { name: 'Single-Leg Leg Curl', weight_increment: 5.0 },
] as const;

export async function seedDefaultExercises(db: Firestore): Promise<void> {
  const repository = new ExerciseRepository(db);

  for (const exercise of DEFAULT_EXERCISES) {
    const existing = await repository.findByName(exercise.name);
    if (!existing) {
      await repository.create({
        name: exercise.name,
        weight_increment: exercise.weight_increment,
        is_custom: false,
      });
    }
  }
}

export async function seedDefaultPlanAndMesocycle(db: Firestore): Promise<void> {
  const planRepo = new PlanRepository(db);
  const planDayRepo = new PlanDayRepository(db);
  const planDayExerciseRepo = new PlanDayExerciseRepository(db);
  const exerciseRepo = new ExerciseRepository(db);
  const mesocycleService = new MesocycleService(db);

  // Check if plan already exists
  const existingPlans = await planRepo.findAll();
  if (existingPlans.some((p) => p.name === 'Mon/Thu Split')) {
    return;
  }

  // Create the plan
  const plan = await planRepo.create({ name: 'Mon/Thu Split', duration_weeks: 6 });

  // Helper to get exercise ID by name
  const getExerciseId = async (name: string): Promise<string> => {
    const exercise = await exerciseRepo.findByName(name);
    if (!exercise) {
      throw new Error(`Exercise not found: ${name}`);
    }
    return exercise.id;
  };

  // Day 1: Monday (day_of_week = 1)
  const day1 = await planDayRepo.create({
    plan_id: plan.id,
    day_of_week: 1,
    name: 'Day 1',
    sort_order: 0,
  });

  const day1Exercises = [
    { name: 'Dumbbell Press (Flat)', sets: 2 },
    { name: 'Seated Cable Row', sets: 3 },
    { name: 'Leg Extension', sets: 4 },
    { name: 'Machine Triceps Extension', sets: 5 },
    { name: 'Machine Preacher Curl', sets: 6 },
    { name: 'Dumbbell Lateral Raise (Super ROM)', sets: 3 },
  ];

  for (let index = 0; index < day1Exercises.length; index++) {
    const ex = day1Exercises[index];
    if (ex === undefined) continue;
    await planDayExerciseRepo.create({
      plan_day_id: day1.id,
      exercise_id: await getExerciseId(ex.name),
      sets: ex.sets,
      reps: 8,
      weight: 30,
      rest_seconds: 60,
      sort_order: index,
    });
  }

  // Day 2: Thursday (day_of_week = 4)
  const day2 = await planDayRepo.create({
    plan_id: plan.id,
    day_of_week: 4,
    name: 'Day 2',
    sort_order: 1,
  });

  const day2Exercises = [
    { name: 'Pulldown (Narrow Grip)', sets: 2 },
    { name: 'Pec Dec Flye', sets: 3 },
    { name: 'Machine Reverse Flye', sets: 4 },
    { name: 'Cable Triceps Pushdown (Single-Arm)', sets: 5 },
    { name: 'Cable Curl', sets: 6 },
    { name: 'Single-Leg Leg Curl', sets: 3 },
  ];

  for (let index = 0; index < day2Exercises.length; index++) {
    const ex = day2Exercises[index];
    if (ex === undefined) continue;
    await planDayExerciseRepo.create({
      plan_day_id: day2.id,
      exercise_id: await getExerciseId(ex.name),
      sets: ex.sets,
      reps: 8,
      weight: 30,
      rest_seconds: 60,
      sort_order: index,
    });
  }

  // Create an unstarted mesocycle (status defaults to 'pending')
  const today = new Date().toISOString().slice(0, 10);
  await mesocycleService.create({
    plan_id: plan.id,
    start_date: today,
  });
}

export async function seedDatabase(db: Firestore): Promise<void> {
  await seedDefaultExercises(db);
  await seedDefaultPlanAndMesocycle(db);
}
