import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createExerciseSchema,
  updateExerciseSchema,
  type ApiResponse,
  type Exercise,
  type ExerciseHistory,
  type CreateExerciseDTO,
  type UpdateExerciseDTO,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { getExerciseRepository } from '../repositories/index.js';
import { getExerciseHistoryService } from '../services/index.js';

export const exerciseRouter = Router();

// GET /api/exercises
exerciseRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getExerciseRepository();
      const exercises = await repository.findAll();

      const response: ApiResponse<Exercise[]> = {
        success: true,
        data: exercises,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/exercises/:id/history
exerciseRouter.get(
  '/:id/history',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Exercise', 'unknown');
      }

      const exerciseHistoryService = getExerciseHistoryService();
      const history = await exerciseHistoryService.getHistory(id);

      if (!history) {
        throw new NotFoundError('Exercise', id);
      }

      const response: ApiResponse<ExerciseHistory> = {
        success: true,
        data: history,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/exercises/:id
exerciseRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getExerciseRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Exercise', 'unknown');
      }

      const exercise = await repository.findById(id);

      if (!exercise) {
        throw new NotFoundError('Exercise', id);
      }

      const response: ApiResponse<Exercise> = {
        success: true,
        data: exercise,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/exercises
exerciseRouter.post(
  '/',
  validate(createExerciseSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getExerciseRepository();
      const exercise = await repository.create(req.body as CreateExerciseDTO);

      const response: ApiResponse<Exercise> = {
        success: true,
        data: exercise,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/exercises/:id
exerciseRouter.put(
  '/:id',
  validate(updateExerciseSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getExerciseRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Exercise', 'unknown');
      }

      const exercise = await repository.update(id, req.body as UpdateExerciseDTO);

      if (!exercise) {
        throw new NotFoundError('Exercise', id);
      }

      const response: ApiResponse<Exercise> = {
        success: true,
        data: exercise,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/exercises/:id
exerciseRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getExerciseRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Exercise', 'unknown');
      }

      const exercise = await repository.findById(id);

      if (!exercise) {
        throw new NotFoundError('Exercise', id);
      }

      if (await repository.isInUse(id)) {
        throw new ConflictError('Cannot delete exercise that is used in a plan');
      }

      await repository.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
