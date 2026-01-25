import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { setupTestApp, teardownTestApp, type TestContext } from '../../test/test-app.js';
import { ExerciseRepository } from '../../repositories/exercise.repository.js';
import type { ApiResult, Exercise, ExerciseHistory } from '@brad-os/shared';

describe('Exercise Routes', () => {
  let ctx: TestContext;
  let app: Express;
  let db: Database.Database;
  let repository: ExerciseRepository;

  beforeEach(() => {
    ctx = setupTestApp(true); // with seeds
    app = ctx.app;
    db = ctx.db;
    repository = new ExerciseRepository(db);
  });

  afterEach(() => {
    teardownTestApp(ctx);
  });

  describe('GET /api/exercises', () => {
    it('should return 200 with array of exercises', async () => {
      const response = await request(app).get('/api/exercises');
      const body = response.body as ApiResult<Exercise[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(Array.isArray(body.data)).toBe(true);
      }
    });

    it('should return exercises in alphabetical order', async () => {
      const response = await request(app).get('/api/exercises');
      const body = response.body as ApiResult<Exercise[]>;

      expect(response.status).toBe(200);
      if (body.success) {
        const names = body.data.map((e) => e.name);
        const sortedNames = [...names].sort();
        expect(names).toEqual(sortedNames);
      }
    });

    it('should include all seeded built-in exercises', async () => {
      const response = await request(app).get('/api/exercises');
      const body = response.body as ApiResult<Exercise[]>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.length).toBe(12);

        // Check for specific exercises
        const names = body.data.map((e) => e.name);
        expect(names).toContain('Dumbbell Press (Flat)');
        expect(names).toContain('Seated Cable Row');
        expect(names).toContain('Leg Extension');
      }
    });

    it('should include both built-in and custom exercises', async () => {
      // Add a custom exercise
      repository.create({ name: 'Custom Squat', is_custom: true });

      const response = await request(app).get('/api/exercises');
      const body = response.body as ApiResult<Exercise[]>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.length).toBe(13);

        const customExercise = body.data.find((e) => e.name === 'Custom Squat');
        expect(customExercise).toBeDefined();
        expect(customExercise?.is_custom).toBe(true);
      }
    });
  });

  describe('GET /api/exercises/:id', () => {
    it('should return 200 with exercise when found', async () => {
      const exercise = repository.findByName('Leg Extension');
      expect(exercise).not.toBeNull();
      if (!exercise) return;

      const response = await request(app).get(`/api/exercises/${exercise.id}`);
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.name).toBe('Leg Extension');
        expect(body.data.id).toBe(exercise.id);
      }
    });

    it('should return 404 when exercise not found', async () => {
      const response = await request(app).get('/api/exercises/99999');
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 404 for invalid id format', async () => {
      const response = await request(app).get('/api/exercises/invalid');
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/exercises', () => {
    it('should return 201 with created exercise', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: 'Barbell Squat', weight_increment: 10 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.name).toBe('Barbell Squat');
        expect(body.data.weight_increment).toBe(10);
        expect(body.data.is_custom).toBe(true);
        expect(body.data.id).toBeDefined();
      }
    });

    it('should use default weight_increment of 5 when not provided', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: 'Barbell Deadlift' });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(201);
      if (body.success) {
        expect(body.data.weight_increment).toBe(5);
      }
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ weight_increment: 5 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 400 when name is empty', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: '' });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 400 when name exceeds 100 characters', async () => {
      const longName = 'A'.repeat(101);
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: longName });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 400 when weight_increment is negative', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: 'Test Exercise', weight_increment: -5 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 400 when weight_increment is zero', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: 'Test Exercise', weight_increment: 0 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 409 when exercise name already exists', async () => {
      const response = await request(app)
        .post('/api/exercises')
        .send({ name: 'Leg Extension' }); // Already exists as built-in
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('PUT /api/exercises/:id', () => {
    let customExercise: { id: number; name: string };

    beforeEach(() => {
      customExercise = repository.create({
        name: 'Custom Press',
        weight_increment: 5,
        is_custom: true,
      });
    });

    it('should return 200 with updated exercise', async () => {
      const response = await request(app)
        .put(`/api/exercises/${customExercise.id}`)
        .send({ name: 'Updated Custom Press' });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.name).toBe('Updated Custom Press');
      }
    });

    it('should update weight_increment', async () => {
      const response = await request(app)
        .put(`/api/exercises/${customExercise.id}`)
        .send({ weight_increment: 2.5 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.weight_increment).toBe(2.5);
      }
    });

    it('should update multiple fields', async () => {
      const response = await request(app)
        .put(`/api/exercises/${customExercise.id}`)
        .send({ name: 'New Name', weight_increment: 10 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.name).toBe('New Name');
        expect(body.data.weight_increment).toBe(10);
      }
    });

    it('should return 404 when exercise not found', async () => {
      const response = await request(app)
        .put('/api/exercises/99999')
        .send({ name: 'New Name' });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });

    it('should return 404 for invalid id format', async () => {
      const response = await request(app)
        .put('/api/exercises/invalid')
        .send({ name: 'New Name' });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });

    it('should return 400 when name is empty string', async () => {
      const response = await request(app)
        .put(`/api/exercises/${customExercise.id}`)
        .send({ name: '' });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 409 when updating to existing name', async () => {
      const response = await request(app)
        .put(`/api/exercises/${customExercise.id}`)
        .send({ name: 'Leg Extension' }); // Already exists
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
    });

    it('should allow updating built-in exercises', async () => {
      const builtIn = repository.findByName('Leg Extension');
      expect(builtIn).not.toBeNull();
      if (!builtIn) return;

      const response = await request(app)
        .put(`/api/exercises/${builtIn.id}`)
        .send({ weight_increment: 2.5 });
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.weight_increment).toBe(2.5);
      }
    });
  });

  describe('DELETE /api/exercises/:id', () => {
    it('should return 204 on successful deletion', async () => {
      const exercise = repository.create({
        name: 'Test Exercise',
        is_custom: true,
      });

      const response = await request(app).delete(
        `/api/exercises/${exercise.id}`
      );

      expect(response.status).toBe(204);

      // Verify exercise is deleted
      const found = repository.findById(exercise.id);
      expect(found).toBeNull();
    });

    it('should allow deleting any exercise regardless of is_custom flag', async () => {
      const builtIn = repository.findByName('Leg Extension');
      expect(builtIn).not.toBeNull();
      if (!builtIn) return;
      expect(builtIn.is_custom).toBe(false);

      const response = await request(app).delete(
        `/api/exercises/${builtIn.id}`
      );

      expect(response.status).toBe(204);

      // Verify exercise is deleted
      const found = repository.findById(builtIn.id);
      expect(found).toBeNull();
    });

    it('should return 404 when exercise not found', async () => {
      const response = await request(app).delete('/api/exercises/99999');
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });

    it('should return 404 for invalid id format', async () => {
      const response = await request(app).delete('/api/exercises/invalid');
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });

    it('should return 409 when exercise is used in a plan', async () => {
      // Create a plan and day to link an exercise
      const planStmt = db.prepare(
        'INSERT INTO plans (name, duration_weeks) VALUES (?, ?)'
      );
      const planResult = planStmt.run('Test Plan', 6);
      const planId = planResult.lastInsertRowid;

      const dayStmt = db.prepare(
        'INSERT INTO plan_days (plan_id, day_of_week, name, sort_order) VALUES (?, ?, ?, ?)'
      );
      const dayResult = dayStmt.run(planId, 1, 'Day 1', 0);
      const dayId = dayResult.lastInsertRowid;

      // Create a custom exercise and link it
      const customExercise = repository.create({
        name: 'Linked Exercise',
        is_custom: true,
      });

      const linkStmt = db.prepare(
        'INSERT INTO plan_day_exercises (plan_day_id, exercise_id, sets, reps, weight, rest_seconds, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      linkStmt.run(dayId, customExercise.id, 3, 8, 100, 60, 0);

      const response = await request(app).delete(
        `/api/exercises/${customExercise.id}`
      );
      const body = response.body as ApiResult<Exercise>;

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('GET /api/exercises/:id/history', () => {
    function seedWorkoutHistory(exerciseId: number): void {
      // Create a plan with a day
      const planResult = db
        .prepare('INSERT INTO plans (name, duration_weeks) VALUES (?, ?)')
        .run('History Test Plan', 6);
      const planId = planResult.lastInsertRowid;

      const dayResult = db
        .prepare(
          'INSERT INTO plan_days (plan_id, day_of_week, name, sort_order) VALUES (?, ?, ?, ?)'
        )
        .run(planId, 1, 'Day 1', 0);
      const planDayId = dayResult.lastInsertRowid;

      // Create a mesocycle
      const mesocycleResult = db
        .prepare(
          'INSERT INTO mesocycles (plan_id, start_date, current_week, status) VALUES (?, ?, ?, ?)'
        )
        .run(planId, '2025-01-06', 2, 'active');
      const mesocycleId = mesocycleResult.lastInsertRowid;

      // Create a completed workout
      const workoutResult = db
        .prepare(
          'INSERT INTO workouts (mesocycle_id, plan_day_id, week_number, scheduled_date, status, completed_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(mesocycleId, planDayId, 1, '2025-01-06', 'completed', '2025-01-06T18:00:00.000Z');
      const workoutId = workoutResult.lastInsertRowid;

      // Create completed workout sets
      db.prepare(
        'INSERT INTO workout_sets (workout_id, exercise_id, set_number, target_reps, target_weight, actual_reps, actual_weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(workoutId, exerciseId, 1, 8, 100, 8, 100, 'completed');

      db.prepare(
        'INSERT INTO workout_sets (workout_id, exercise_id, set_number, target_reps, target_weight, actual_reps, actual_weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(workoutId, exerciseId, 2, 8, 100, 7, 100, 'completed');

      db.prepare(
        'INSERT INTO workout_sets (workout_id, exercise_id, set_number, target_reps, target_weight, actual_reps, actual_weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(workoutId, exerciseId, 3, 8, 105, 6, 105, 'completed');
    }

    it('should return 200 with ExerciseHistory shape for valid exercise with sets', async () => {
      const exercise = repository.findByName('Leg Extension');
      expect(exercise).not.toBeNull();
      if (!exercise) return;

      seedWorkoutHistory(exercise.id);

      const response = await request(app).get(
        `/api/exercises/${exercise.id}/history`
      );
      const body = response.body as ApiResult<ExerciseHistory>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.exercise_id).toBe(exercise.id);
        expect(body.data.exercise_name).toBe('Leg Extension');
        expect(Array.isArray(body.data.entries)).toBe(true);
        expect(body.data.entries.length).toBe(1);

        const entry = body.data.entries[0];
        expect(entry).toBeDefined();
        if (entry) {
          expect(entry.sets.length).toBe(3);
          expect(entry.best_weight).toBe(105);
          expect(entry.best_set_reps).toBe(6);
          expect(entry.week_number).toBe(1);
        }

        expect(body.data.personal_record).not.toBeNull();
        if (body.data.personal_record) {
          expect(body.data.personal_record.weight).toBe(105);
          expect(body.data.personal_record.reps).toBe(6);
        }
      }
    });

    it('should return 404 for non-existent exercise ID', async () => {
      const response = await request(app).get('/api/exercises/99999/history');
      const body = response.body as ApiResult<ExerciseHistory>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 404 for non-numeric ID', async () => {
      const response = await request(app).get('/api/exercises/abc/history');
      const body = response.body as ApiResult<ExerciseHistory>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return entries: [] and personal_record: null for exercise with no completed sets', async () => {
      const exercise = repository.findByName('Leg Extension');
      expect(exercise).not.toBeNull();
      if (!exercise) return;

      const response = await request(app).get(
        `/api/exercises/${exercise.id}/history`
      );
      const body = response.body as ApiResult<ExerciseHistory>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.exercise_id).toBe(exercise.id);
        expect(body.data.exercise_name).toBe('Leg Extension');
        expect(body.data.entries).toEqual([]);
        expect(body.data.personal_record).toBeNull();
      }
    });
  });
});
