import type { Migration } from '../migrator.js';

import { migration as migration001 } from './001_create_exercises.js';
import { migration as migration002 } from './002_create_plans.js';
import { migration as migration003 } from './003_create_plan_days.js';
import { migration as migration004 } from './004_create_plan_day_exercises.js';
import { migration as migration005 } from './005_create_mesocycles.js';
import { migration as migration006 } from './006_create_workouts.js';
import { migration as migration007 } from './007_create_workout_sets.js';
import { migration as migration008 } from './008_add_rep_range_columns.js';

export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
];
