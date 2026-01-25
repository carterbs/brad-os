import { Router } from 'express';
import { healthRouter } from './health.js';
import { exerciseRouter } from './exercise.routes.js';
import { planRouter } from './plan.routes.js';
import { mesocycleRouter } from './mesocycle.routes.js';
import { workoutRouter } from './workout.routes.js';
import { workoutSetRouter } from './workout-set.routes.js';
import { testRouter } from './test.routes.js';
import { notificationRouter } from './notification.routes.js';
import { stretchSessionRouter } from './stretchSession.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/exercises', exerciseRouter);
apiRouter.use('/plans', planRouter);
apiRouter.use('/mesocycles', mesocycleRouter);
apiRouter.use('/workouts', workoutRouter);
apiRouter.use('/workout-sets', workoutSetRouter);
apiRouter.use('/test', testRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/stretch-sessions', stretchSessionRouter);
