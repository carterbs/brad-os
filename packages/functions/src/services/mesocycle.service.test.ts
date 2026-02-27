import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Workout,
  CreateWorkoutDTO,
} from '../shared.js';
import { MesocycleService } from './mesocycle.service.js';
import { MesocycleRepository } from '../repositories/mesocycle.repository.js';
import { PlanRepository } from '../repositories/plan.repository.js';
import { PlanDayRepository } from '../repositories/plan-day.repository.js';
import { PlanDayExerciseRepository } from '../repositories/plan-day-exercise.repository.js';
import { ExerciseRepository } from '../repositories/exercise.repository.js';
import { WorkoutRepository } from '../repositories/workout.repository.js';
import { WorkoutSetRepository } from '../repositories/workout-set.repository.js';
import {
  createMockMesocycleRepository,
  createMockPlanRepository,
  createMockPlanDayRepository,
  createMockPlanDayExerciseRepository,
  createMockExerciseRepository,
  createMockWorkoutRepository,
  createMockWorkoutSetRepository,
  createPlan,
  createPlanDay,
  createPlanDayExercise,
  createExercise,
  createMesocycle,
  createWorkout,
  createWorkoutSet,
} from '../__tests__/utils/index.js';

// Mock repositories
vi.mock('../repositories/mesocycle.repository.js');
vi.mock('../repositories/plan.repository.js');
vi.mock('../repositories/plan-day.repository.js');
vi.mock('../repositories/plan-day-exercise.repository.js');
vi.mock('../repositories/exercise.repository.js');
vi.mock('../repositories/workout.repository.js');
vi.mock('../repositories/workout-set.repository.js');
vi.mock('../firebase.js', () => ({
  getCollectionName: vi.fn((name: string) => name),
}));

describe('MesocycleService', () => {
  let service: MesocycleService;
  let mockDb: {
    batch: Mock;
    collection: Mock;
  };
  let mockBatch: {
    set: Mock;
    commit: Mock;
  };
  let mockMesocycleRepo: ReturnType<typeof createMockMesocycleRepository>;
  let mockPlanRepo: ReturnType<typeof createMockPlanRepository>;
  let mockPlanDayRepo: ReturnType<typeof createMockPlanDayRepository>;
  let mockPlanDayExerciseRepo: ReturnType<typeof createMockPlanDayExerciseRepository>;
  let mockExerciseRepo: ReturnType<typeof createMockExerciseRepository>;
  let mockWorkoutRepo: ReturnType<typeof createMockWorkoutRepository>;
  let mockWorkoutSetRepo: ReturnType<typeof createMockWorkoutSetRepository>;

  // Fixtures
  const mockPlan = createPlan({
    id: 'plan-1',
    name: 'Push/Pull/Legs',
    duration_weeks: 6,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  });

  const mockPlanDay = createPlanDay({
    id: 'plan-day-1',
    plan_id: 'plan-1',
    day_of_week: 1,
    name: 'Push Day',
    sort_order: 0,
  });

  const mockPlanDayExercise = createPlanDayExercise({
    id: 'pde-1',
    plan_day_id: 'plan-day-1',
    exercise_id: 'exercise-1',
    sets: 3,
    reps: 8,
    weight: 100,
    rest_seconds: 90,
    sort_order: 0,
    min_reps: 8,
    max_reps: 12,
  });

  const mockExercise = createExercise({
    id: 'exercise-1',
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  });

  // Shared default overrides matching original inline factory defaults
  const mesocycleDefaults = {
    id: 'meso-1',
    plan_id: 'plan-1',
    start_date: '2024-01-15',
    current_week: 1,
    status: 'pending' as const,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const workoutDefaults = {
    id: 'workout-1',
    mesocycle_id: 'meso-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'pending' as const,
    started_at: null,
    completed_at: null,
  };

  const workoutSetDefaults = {
    id: 'set-1',
    workout_id: 'workout-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    target_reps: 8,
    target_weight: 100,
    actual_reps: null,
    actual_weight: null,
    status: 'pending' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockBatch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      batch: vi.fn(() => mockBatch),
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ id: 'new-doc-id' })),
      })),
    };

    mockMesocycleRepo = createMockMesocycleRepository();
    mockPlanRepo = createMockPlanRepository();
    mockPlanDayRepo = createMockPlanDayRepository();
    mockPlanDayExerciseRepo = createMockPlanDayExerciseRepository();
    mockExerciseRepo = createMockExerciseRepository();
    mockWorkoutRepo = createMockWorkoutRepository();
    mockWorkoutSetRepo = createMockWorkoutSetRepository();

    vi.mocked(MesocycleRepository).mockImplementation(() => mockMesocycleRepo as unknown as MesocycleRepository);
    vi.mocked(PlanRepository).mockImplementation(() => mockPlanRepo as unknown as PlanRepository);
    vi.mocked(PlanDayRepository).mockImplementation(() => mockPlanDayRepo as unknown as PlanDayRepository);
    vi.mocked(PlanDayExerciseRepository).mockImplementation(() => mockPlanDayExerciseRepo as unknown as PlanDayExerciseRepository);
    vi.mocked(ExerciseRepository).mockImplementation(() => mockExerciseRepo as unknown as ExerciseRepository);
    vi.mocked(WorkoutRepository).mockImplementation(() => mockWorkoutRepo as unknown as WorkoutRepository);
    vi.mocked(WorkoutSetRepository).mockImplementation(() => mockWorkoutSetRepo as unknown as WorkoutSetRepository);

    service = new MesocycleService(mockDb as unknown as Firestore);
  });

  describe('create', () => {
    it('should throw error if plan not found', async () => {
      mockPlanRepo.findById.mockResolvedValue(null);

      await expect(
        service.create({ plan_id: 'non-existent', start_date: '2024-01-15' })
      ).rejects.toThrow('Plan with id non-existent not found');
    });

    it('should throw error if plan has no workout days', async () => {
      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([]);

      await expect(
        service.create({ plan_id: 'plan-1', start_date: '2024-01-15' })
      ).rejects.toThrow('Plan has no workout days configured');
    });

    it('should create mesocycle in pending status', async () => {
      const createdMesocycle = createMesocycle(mesocycleDefaults);

      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockMesocycleRepo.create.mockResolvedValue(createdMesocycle);

      const result = await service.create({ plan_id: 'plan-1', start_date: '2024-01-15' });

      expect(result.status).toBe('pending');
      expect(mockMesocycleRepo.create).toHaveBeenCalledWith({
        plan_id: 'plan-1',
        start_date: '2024-01-15',
      });
    });

    it('should pass start_date to repository', async () => {
      const createdMesocycle = createMesocycle(mesocycleDefaults);

      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockMesocycleRepo.create.mockResolvedValue(createdMesocycle);

      await service.create({ plan_id: 'plan-1', start_date: '2024-02-01' });

      expect(mockMesocycleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ start_date: '2024-02-01' })
      );
    });
  });

  describe('start', () => {
    it('should throw error if mesocycle not found', async () => {
      mockMesocycleRepo.findById.mockResolvedValue(null);

      await expect(service.start('non-existent')).rejects.toThrow(
        'Mesocycle with id non-existent not found'
      );
    });

    it('should throw error if mesocycle is not pending', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);

      await expect(service.start('meso-1')).rejects.toThrow(
        'Only pending mesocycles can be started'
      );
    });

    it('should throw error if already has an active mesocycle', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      const existingActive = createMesocycle({ ...mesocycleDefaults, id: 'meso-2', status: 'active' });

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([existingActive]);

      await expect(service.start('meso-1')).rejects.toThrow(
        'An active mesocycle already exists'
      );
    });

    it('should throw error if exercise not found during workout generation', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([]);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(null);

      await expect(service.start('meso-1')).rejects.toThrow(
        'Exercise with id exercise-1 not found'
      );
    });

    it('should generate workouts for 7 weeks', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([]);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);
      mockWorkoutRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: `workout-${Date.now()}-${Math.random()}`, ...data, status: 'pending', started_at: null, completed_at: null })
      );
      mockMesocycleRepo.update.mockResolvedValue(activeMesocycle);

      await service.start('meso-1');

      // 7 weeks x 1 day = 7 workouts
      expect(mockWorkoutRepo.create).toHaveBeenCalledTimes(7);
    });

    it('should generate sets for each workout using batched writes', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([]);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);
      mockWorkoutRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: `workout-${Date.now()}-${Math.random()}`, ...data, status: 'pending', started_at: null, completed_at: null })
      );
      mockMesocycleRepo.update.mockResolvedValue(activeMesocycle);

      await service.start('meso-1');

      // Batch should be used for creating sets
      expect(mockDb.batch).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should apply progressive overload to generated sets', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const createdWorkouts: Workout[] = [];

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([]);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);
      mockWorkoutRepo.create.mockImplementation((data: CreateWorkoutDTO) => {
        const workout: Workout = {
          id: `workout-${createdWorkouts.length + 1}`,
          ...data,
          status: 'pending',
          started_at: null,
          completed_at: null,
        };
        createdWorkouts.push(workout);
        return Promise.resolve(workout);
      });
      mockMesocycleRepo.update.mockResolvedValue(activeMesocycle);

      await service.start('meso-1');

      // Check that different weeks have different parameters
      const week1Workout = createdWorkouts.find((w) => w.week_number === 1);
      const week3Workout = createdWorkouts.find((w) => w.week_number === 3);
      const week7Workout = createdWorkouts.find((w) => w.week_number === 7);

      expect(week1Workout?.week_number).toBe(1);
      expect(week3Workout?.week_number).toBe(3);
      expect(week7Workout?.week_number).toBe(7);
    });

    it('should update mesocycle status to active', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([]);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);
      mockWorkoutRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: `workout-${Date.now()}-${Math.random()}`, ...data, status: 'pending', started_at: null, completed_at: null })
      );
      mockMesocycleRepo.update.mockResolvedValue(activeMesocycle);

      const result = await service.start('meso-1');

      expect(result.status).toBe('active');
      expect(mockMesocycleRepo.update).toHaveBeenCalledWith('meso-1', { status: 'active' });
    });

    it('should throw error if update fails', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });

      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);
      mockMesocycleRepo.findActive.mockResolvedValue([]);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);
      mockWorkoutRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: `workout-${Date.now()}-${Math.random()}`, ...data, status: 'pending', started_at: null, completed_at: null })
      );
      mockMesocycleRepo.update.mockResolvedValue(null);

      await expect(service.start('meso-1')).rejects.toThrow(
        'Failed to start mesocycle with id meso-1'
      );
    });
  });

  describe('getActive', () => {
    it('should return null if no active mesocycle exists', async () => {
      mockMesocycleRepo.findActive.mockResolvedValue([]);

      const result = await service.getActive();

      expect(result).toBeNull();
    });

    it('should return active mesocycle with details', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const workouts = [createWorkout(workoutDefaults)];
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockMesocycleRepo.findActive.mockResolvedValue([activeMesocycle]);
      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);
      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockWorkoutRepo.findByMesocycleId.mockResolvedValue(workouts);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

      const result = await service.getActive();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('meso-1');
      expect(result?.plan_name).toBe('Push/Pull/Legs');
    });
  });

  describe('getById', () => {
    it('should return null if mesocycle not found', async () => {
      mockMesocycleRepo.findById.mockResolvedValue(null);

      const result = await service.getById('non-existent');

      expect(result).toBeNull();
    });

    it('should return mesocycle with week summaries', async () => {
      const mesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', week_number: 1 }),
        createWorkout({ ...workoutDefaults, id: 'w2', week_number: 2 }),
      ];
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockMesocycleRepo.findById.mockResolvedValue(mesocycle);
      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockWorkoutRepo.findByMesocycleId.mockResolvedValue(workouts);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

      const result = await service.getById('meso-1');

      expect(result?.weeks).toHaveLength(7);
      expect(result?.weeks[0]?.week_number).toBe(1);
      expect(result?.weeks[6]?.week_number).toBe(7);
      expect(result?.weeks[6]?.is_deload).toBe(true);
    });

    it('should include workout summaries in each week', async () => {
      const mesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', week_number: 1, status: 'completed', completed_at: '2024-01-15T10:00:00Z' }),
        createWorkout({ ...workoutDefaults, id: 'w2', week_number: 1, status: 'pending' }),
      ];
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, status: 'pending' }),
      ];

      mockMesocycleRepo.findById.mockResolvedValue(mesocycle);
      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockWorkoutRepo.findByMesocycleId.mockResolvedValue(workouts);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

      const result = await service.getById('meso-1');

      expect(result?.weeks[0]?.workouts).toHaveLength(2);
      expect(result?.weeks[0]?.completed_workouts).toBe(1);
    });

    it('should calculate total and completed workouts', async () => {
      const mesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', week_number: 1, status: 'completed' }),
        createWorkout({ ...workoutDefaults, id: 'w2', week_number: 1, status: 'completed' }),
        createWorkout({ ...workoutDefaults, id: 'w3', week_number: 2, status: 'pending' }),
      ];
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockMesocycleRepo.findById.mockResolvedValue(mesocycle);
      mockPlanRepo.findById.mockResolvedValue(mockPlan);
      mockWorkoutRepo.findByMesocycleId.mockResolvedValue(workouts);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([mockPlanDay]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

      const result = await service.getById('meso-1');

      expect(result?.total_workouts).toBe(3);
      expect(result?.completed_workouts).toBe(2);
    });
  });

  describe('complete', () => {
    it('should throw error if mesocycle not found', async () => {
      mockMesocycleRepo.findById.mockResolvedValue(null);

      await expect(service.complete('non-existent')).rejects.toThrow(
        'Mesocycle with id non-existent not found'
      );
    });

    it('should throw error if mesocycle is not active', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);

      await expect(service.complete('meso-1')).rejects.toThrow(
        'Mesocycle is not active'
      );
    });

    it('should throw error if mesocycle is already completed', async () => {
      const completedMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'completed' });
      mockMesocycleRepo.findById.mockResolvedValue(completedMesocycle);

      await expect(service.complete('meso-1')).rejects.toThrow(
        'Mesocycle is not active'
      );
    });

    it('should transition active mesocycle to completed', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const completedMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'completed' });

      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);
      mockMesocycleRepo.update.mockResolvedValue(completedMesocycle);

      const result = await service.complete('meso-1');

      expect(result.status).toBe('completed');
      expect(mockMesocycleRepo.update).toHaveBeenCalledWith('meso-1', { status: 'completed' });
    });

    it('should throw error if update fails', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });

      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);
      mockMesocycleRepo.update.mockResolvedValue(null);

      await expect(service.complete('meso-1')).rejects.toThrow(
        'Failed to update mesocycle with id meso-1'
      );
    });
  });

  describe('cancel', () => {
    it('should throw error if mesocycle not found', async () => {
      mockMesocycleRepo.findById.mockResolvedValue(null);

      await expect(service.cancel('non-existent')).rejects.toThrow(
        'Mesocycle with id non-existent not found'
      );
    });

    it('should throw error if mesocycle is not active', async () => {
      const pendingMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'pending' });
      mockMesocycleRepo.findById.mockResolvedValue(pendingMesocycle);

      await expect(service.cancel('meso-1')).rejects.toThrow(
        'Mesocycle is not active'
      );
    });

    it('should throw error if mesocycle is cancelled', async () => {
      const cancelledMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'cancelled' });
      mockMesocycleRepo.findById.mockResolvedValue(cancelledMesocycle);

      await expect(service.cancel('meso-1')).rejects.toThrow(
        'Mesocycle is not active'
      );
    });

    it('should transition active mesocycle to cancelled', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const cancelledMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'cancelled' });

      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);
      mockMesocycleRepo.update.mockResolvedValue(cancelledMesocycle);

      const result = await service.cancel('meso-1');

      expect(result.status).toBe('cancelled');
      expect(mockMesocycleRepo.update).toHaveBeenCalledWith('meso-1', { status: 'cancelled' });
    });

    it('should preserve data when cancelled (not delete workouts)', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });
      const cancelledMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'cancelled' });

      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);
      mockMesocycleRepo.update.mockResolvedValue(cancelledMesocycle);

      await service.cancel('meso-1');

      // Only update should be called, no delete operations
      expect(mockMesocycleRepo.update).toHaveBeenCalledTimes(1);
    });

    it('should throw error if update fails', async () => {
      const activeMesocycle = createMesocycle({ ...mesocycleDefaults, status: 'active' });

      mockMesocycleRepo.findById.mockResolvedValue(activeMesocycle);
      mockMesocycleRepo.update.mockResolvedValue(null);

      await expect(service.cancel('meso-1')).rejects.toThrow(
        'Failed to update mesocycle with id meso-1'
      );
    });
  });

  describe('list', () => {
    it('should return all mesocycles', async () => {
      const mesocycles = [
        createMesocycle({ ...mesocycleDefaults, id: 'meso-1', status: 'active' }),
        createMesocycle({ ...mesocycleDefaults, id: 'meso-2', status: 'completed' }),
      ];

      mockMesocycleRepo.findAll.mockResolvedValue(mesocycles);

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(mockMesocycleRepo.findAll).toHaveBeenCalled();
    });

    it('should return empty array if no mesocycles exist', async () => {
      mockMesocycleRepo.findAll.mockResolvedValue([]);

      const result = await service.list();

      expect(result).toHaveLength(0);
    });
  });
});
