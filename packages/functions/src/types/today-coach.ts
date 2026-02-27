import type {
  RecoveryHistoryEntry,
  LiftingWorkoutSummary,
  LiftingScheduleContext,
  MesocycleContext,
  WeightMetrics,
  VO2MaxContext,
  EFTrendSummary,
} from './cycling.js';
import { z } from 'zod';

export type {
  RecoveryHistoryEntry,
  LiftingWorkoutSummary,
  LiftingScheduleContext,
  MesocycleContext,
  WeightMetrics,
  VO2MaxContext,
  EFTrendSummary,
};

export type HealthTrends = z.infer<
  typeof import('../schemas/today-coach.schema.js').healthTrendsSchema
>;
export type TimeContext = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachTimeContextSchema
>;
export type CompletedActivities = z.infer<
  typeof import('../schemas/today-coach.schema.js').completedActivitiesSchema
>;
export type TodayWorkoutContext = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayWorkoutContextSchema
>;
export type RecentRideStreamSummary = z.infer<
  typeof import('../schemas/today-coach.schema.js').recentRideStreamSummarySchema
>;
export type TodayCoachCyclingContext = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachCyclingContextSchema
>;
export type TodayCoachCyclingActivitySummary = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachCyclingActivitySummarySchema
>;
export type StretchingContext = z.infer<
  typeof import('../schemas/today-coach.schema.js').stretchingContextSchema
>;
export type MeditationContext = z.infer<
  typeof import('../schemas/today-coach.schema.js').meditationContextSchema
>;
export type TodayCoachRequest = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachRequestSchema
>;

export type TodayCoachRecoverySection = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections']['recovery'];
export type TodayCoachLiftingSection = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections']['lifting'];
export type TodayCoachCyclingSection = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections']['cycling'];
export type TodayCoachStretchingSection = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections']['stretching'];
export type TodayCoachMeditationSection = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections']['meditation'];
export type TodayCoachWeightSection = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections']['weight'];
export type TodayCoachWarning = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['warnings'][number];
export type TodayCoachSections = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>['sections'];
export type TodayCoachResponse = z.infer<
  typeof import('../schemas/today-coach.schema.js').todayCoachResponseSchema
>;
