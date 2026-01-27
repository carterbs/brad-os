#!/usr/bin/env npx tsx
/**
 * Seed Data Generator for Firebase Emulator
 *
 * This script populates the Firestore emulator with sample data for local development.
 * Run with: npx tsx scripts/generate-seed-data.ts
 *
 * Prerequisites:
 * - Firebase emulator running (npm run emulators:fresh)
 * - FIRESTORE_EMULATOR_HOST env var set (automatic when using emulator)
 */

import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, FieldValue } from 'firebase-admin/firestore';

// Check emulator is running
if (!process.env['FIRESTORE_EMULATOR_HOST']) {
  console.error('❌ FIRESTORE_EMULATOR_HOST is not set.');
  console.error('   Make sure the Firebase emulator is running first:');
  console.error('   npm run emulators:fresh');
  process.exit(1);
}

console.log(`📡 Connecting to Firestore emulator at ${process.env['FIRESTORE_EMULATOR_HOST']}`);

// Initialize Firebase Admin with project ID only (no credentials needed for emulator)
const app: App = initializeApp({
  projectId: 'brad-os',
});

const db: Firestore = getFirestore(app);

// Use dev_ prefix for collections (matching the dev API endpoints)
const prefix = 'dev_';

interface Exercise {
  id: string;
  name: string;
  weight_increment: number;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
  created_at: string;
  updated_at: string;
}

interface PlanDay {
  id: string;
  plan_id: string;
  day_of_week: number;
  name: string;
  sort_order: number;
}

interface PlanDayExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  sort_order: number;
  min_reps: number;
  max_reps: number;
}

interface Mesocycle {
  id: string;
  plan_id: string;
  start_date: string;
  current_week: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

interface StretchSession {
  id: string;
  completedAt: string;
  totalDurationSeconds: number;
  regionsCompleted: number;
  regionsSkipped: number;
  stretches: Array<{
    region: string;
    stretchId: string;
    stretchName: string;
    durationSeconds: number;
    skippedSegments: number;
  }>;
  created_at: string;
}

interface MeditationSession {
  id: string;
  completedAt: string;
  sessionType: string;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  completedFully: boolean;
  created_at: string;
}

// Generate a UUID-like ID
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Get ISO timestamp
function now(): string {
  return new Date().toISOString();
}

// Get date N days ago
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// Get date string (YYYY-MM-DD)
function dateString(daysFromNow: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0] as string;
}

async function seedExercises(): Promise<Exercise[]> {
  console.log('💪 Seeding exercises...');

  const exercises: Exercise[] = [
    {
      id: generateId(),
      name: 'Bench Press',
      weight_increment: 5,
      is_custom: false,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: generateId(),
      name: 'Squat',
      weight_increment: 5,
      is_custom: false,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: generateId(),
      name: 'Deadlift',
      weight_increment: 5,
      is_custom: false,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: generateId(),
      name: 'Overhead Press',
      weight_increment: 2.5,
      is_custom: false,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: generateId(),
      name: 'Barbell Row',
      weight_increment: 5,
      is_custom: false,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: generateId(),
      name: 'Pull-ups',
      weight_increment: 2.5,
      is_custom: false,
      created_at: now(),
      updated_at: now(),
    },
  ];

  const batch = db.batch();
  for (const exercise of exercises) {
    const ref = db.collection(`${prefix}exercises`).doc(exercise.id);
    batch.set(ref, exercise);
  }
  await batch.commit();

  console.log(`   ✅ Created ${exercises.length} exercises`);
  return exercises;
}

async function seedPlan(exercises: Exercise[]): Promise<{
  plan: Plan;
  days: PlanDay[];
  dayExercises: PlanDayExercise[];
}> {
  console.log('📋 Seeding plan (Push/Pull/Legs)...');

  const plan: Plan = {
    id: generateId(),
    name: 'Push/Pull/Legs',
    duration_weeks: 6,
    created_at: now(),
    updated_at: now(),
  };

  // Create plan days
  const pushDay: PlanDay = {
    id: generateId(),
    plan_id: plan.id,
    day_of_week: 1, // Monday
    name: 'Push Day',
    sort_order: 0,
  };

  const pullDay: PlanDay = {
    id: generateId(),
    plan_id: plan.id,
    day_of_week: 3, // Wednesday
    name: 'Pull Day',
    sort_order: 1,
  };

  const legsDay: PlanDay = {
    id: generateId(),
    plan_id: plan.id,
    day_of_week: 5, // Friday
    name: 'Legs Day',
    sort_order: 2,
  };

  const days = [pushDay, pullDay, legsDay];

  // Find exercises by name
  const findExercise = (name: string): Exercise => {
    const ex = exercises.find((e) => e.name === name);
    if (!ex) throw new Error(`Exercise not found: ${name}`);
    return ex;
  };

  const bench = findExercise('Bench Press');
  const ohp = findExercise('Overhead Press');
  const row = findExercise('Barbell Row');
  const pullup = findExercise('Pull-ups');
  const squat = findExercise('Squat');
  const deadlift = findExercise('Deadlift');

  // Create plan day exercises
  const dayExercises: PlanDayExercise[] = [
    // Push day
    {
      id: generateId(),
      plan_day_id: pushDay.id,
      exercise_id: bench.id,
      sets: 3,
      reps: 10,
      weight: 135,
      rest_seconds: 90,
      sort_order: 0,
      min_reps: 8,
      max_reps: 12,
    },
    {
      id: generateId(),
      plan_day_id: pushDay.id,
      exercise_id: ohp.id,
      sets: 3,
      reps: 10,
      weight: 65,
      rest_seconds: 90,
      sort_order: 1,
      min_reps: 8,
      max_reps: 12,
    },
    // Pull day
    {
      id: generateId(),
      plan_day_id: pullDay.id,
      exercise_id: row.id,
      sets: 3,
      reps: 10,
      weight: 95,
      rest_seconds: 90,
      sort_order: 0,
      min_reps: 8,
      max_reps: 12,
    },
    {
      id: generateId(),
      plan_day_id: pullDay.id,
      exercise_id: pullup.id,
      sets: 3,
      reps: 8,
      weight: 0,
      rest_seconds: 120,
      sort_order: 1,
      min_reps: 6,
      max_reps: 10,
    },
    // Legs day
    {
      id: generateId(),
      plan_day_id: legsDay.id,
      exercise_id: squat.id,
      sets: 3,
      reps: 10,
      weight: 135,
      rest_seconds: 120,
      sort_order: 0,
      min_reps: 8,
      max_reps: 12,
    },
    {
      id: generateId(),
      plan_day_id: legsDay.id,
      exercise_id: deadlift.id,
      sets: 3,
      reps: 8,
      weight: 185,
      rest_seconds: 180,
      sort_order: 1,
      min_reps: 6,
      max_reps: 10,
    },
  ];

  // Write to Firestore
  const batch = db.batch();

  // Plan
  batch.set(db.collection(`${prefix}plans`).doc(plan.id), plan);

  // Plan days
  for (const day of days) {
    batch.set(db.collection(`${prefix}plan_days`).doc(day.id), day);
  }

  // Plan day exercises
  for (const pde of dayExercises) {
    batch.set(db.collection(`${prefix}plan_day_exercises`).doc(pde.id), pde);
  }

  await batch.commit();

  console.log(`   ✅ Created plan with ${days.length} days and ${dayExercises.length} exercises`);
  return { plan, days, dayExercises };
}

async function seedMesocycle(planId: string): Promise<Mesocycle> {
  console.log('🔄 Seeding mesocycle (pending)...');

  // Start date is next Monday
  const today = new Date();
  const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const startDate = nextMonday.toISOString().split('T')[0] as string;

  const mesocycle: Mesocycle = {
    id: generateId(),
    plan_id: planId,
    start_date: startDate,
    current_week: 0,
    status: 'pending',
    created_at: now(),
    updated_at: now(),
  };

  await db.collection(`${prefix}mesocycles`).doc(mesocycle.id).set(mesocycle);

  console.log(`   ✅ Created pending mesocycle starting ${startDate}`);
  return mesocycle;
}

async function seedStretchSessions(): Promise<void> {
  console.log('🧘 Seeding stretch sessions...');

  const sessions: StretchSession[] = [
    {
      id: generateId(),
      completedAt: daysAgo(1),
      totalDurationSeconds: 480,
      regionsCompleted: 8,
      regionsSkipped: 0,
      stretches: [
        {
          region: 'neck',
          stretchId: 'neck-forward-tilt',
          stretchName: 'Neck Forward Tilt',
          durationSeconds: 60,
          skippedSegments: 0,
        },
        {
          region: 'shoulders',
          stretchId: 'cross-body-shoulder',
          stretchName: 'Cross Body Shoulder',
          durationSeconds: 60,
          skippedSegments: 0,
        },
        {
          region: 'back',
          stretchId: 'cat-cow',
          stretchName: 'Cat Cow',
          durationSeconds: 120,
          skippedSegments: 0,
        },
      ],
      created_at: daysAgo(1),
    },
    {
      id: generateId(),
      completedAt: daysAgo(3),
      totalDurationSeconds: 420,
      regionsCompleted: 7,
      regionsSkipped: 1,
      stretches: [
        {
          region: 'hip_flexors',
          stretchId: 'kneeling-hip-flexor',
          stretchName: 'Kneeling Hip Flexor',
          durationSeconds: 60,
          skippedSegments: 0,
        },
        {
          region: 'hamstrings',
          stretchId: 'seated-forward-fold',
          stretchName: 'Seated Forward Fold',
          durationSeconds: 60,
          skippedSegments: 0,
        },
      ],
      created_at: daysAgo(3),
    },
  ];

  const batch = db.batch();
  for (const session of sessions) {
    const ref = db.collection(`${prefix}stretch_sessions`).doc(session.id);
    batch.set(ref, session);
  }
  await batch.commit();

  console.log(`   ✅ Created ${sessions.length} stretch sessions`);
}

async function seedMeditationSessions(): Promise<void> {
  console.log('🧘‍♂️ Seeding meditation sessions...');

  const sessions: MeditationSession[] = [
    {
      id: generateId(),
      completedAt: daysAgo(0), // Today
      sessionType: 'basic-breathing',
      plannedDurationSeconds: 600,
      actualDurationSeconds: 600,
      completedFully: true,
      created_at: daysAgo(0),
    },
    {
      id: generateId(),
      completedAt: daysAgo(2),
      sessionType: 'basic-breathing',
      plannedDurationSeconds: 300,
      actualDurationSeconds: 300,
      completedFully: true,
      created_at: daysAgo(2),
    },
    {
      id: generateId(),
      completedAt: daysAgo(5),
      sessionType: 'basic-breathing',
      plannedDurationSeconds: 1200,
      actualDurationSeconds: 900,
      completedFully: false,
      created_at: daysAgo(5),
    },
  ];

  const batch = db.batch();
  for (const session of sessions) {
    const ref = db.collection(`${prefix}meditation_sessions`).doc(session.id);
    batch.set(ref, session);
  }
  await batch.commit();

  console.log(`   ✅ Created ${sessions.length} meditation sessions`);
}

async function main(): Promise<void> {
  console.log('🌱 Starting seed data generation...\n');

  try {
    // Seed in order
    const exercises = await seedExercises();
    const { plan } = await seedPlan(exercises);
    await seedMesocycle(plan.id);
    await seedStretchSessions();
    await seedMeditationSessions();

    console.log('\n✨ Seed data generation complete!');
    console.log('   View data at: http://localhost:4000/firestore');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed data generation failed:', error);
    process.exit(1);
  }
}

main();
