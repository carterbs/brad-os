import type { CyclingActivityType } from './cycling.js';

/**
 * Calendar View Types
 *
 * Types for the calendar view feature that displays workout, stretch,
 * and meditation activities across days.
 */

/**
 * Types of activities that can appear on the calendar.
 * Extensible for future activity types (e.g., cardio).
 */
export type ActivityType = 'workout' | 'stretch' | 'meditation' | 'cycling';

/**
 * Summary data specific to workout activities.
 */
export interface WorkoutActivitySummary {
  /** Name of the workout day (e.g., "Push Day", "Leg Day") */
  dayName: string;
  /** Total number of exercises in the workout */
  exerciseCount: number;
  /** Total number of sets completed */
  setsCompleted: number;
  /** Total number of sets in the workout */
  totalSets: number;
  /** Week number within the mesocycle (1-7) */
  weekNumber: number;
  /** Whether this was a deload week workout */
  isDeload: boolean;
}

/**
 * Summary data specific to stretch session activities.
 */
export interface StretchActivitySummary {
  /** Total duration of the stretch session in seconds */
  totalDurationSeconds: number;
  /** Number of body regions that were stretched */
  regionsCompleted: number;
  /** Number of body regions that were skipped */
  regionsSkipped: number;
}

/**
 * Summary data specific to meditation activities.
 * Placeholder for future meditation feature.
 */
export interface MeditationActivitySummary {
  /** Duration of the meditation session in seconds */
  durationSeconds: number;
  /** Type of meditation (e.g., "guided", "unguided") */
  meditationType: string;
}

/**
 * Summary data specific to cycling activities.
 */
export interface CyclingActivitySummary {
  /** Duration of the ride in minutes */
  durationMinutes: number;
  /** Training stress score */
  tss: number;
  /** Cycling workout type */
  cyclingType: CyclingActivityType;
}

/**
 * Union type of all possible activity summaries.
 */
export type ActivitySummary =
  | WorkoutActivitySummary
  | StretchActivitySummary
  | MeditationActivitySummary
  | CyclingActivitySummary;

/**
 * A single activity entry for the calendar.
 * Represents any completable activity (workout, stretch, meditation).
 */
export interface CalendarActivity {
  /** Unique identifier for the activity */
  id: string;
  /** Type of activity */
  type: ActivityType;
  /** Date the activity was scheduled/completed (ISO 8601 date string, YYYY-MM-DD) */
  date: string;
  /** Timestamp when the activity was completed (ISO 8601), null if not completed */
  completedAt: string | null;
  /** Type-specific summary data for display */
  summary: ActivitySummary;
}

/**
 * Type guard to check if an activity is a workout.
 */
export function isWorkoutActivity(
  activity: CalendarActivity
): activity is CalendarActivity & { summary: WorkoutActivitySummary } {
  return activity.type === 'workout';
}

/**
 * Type guard to check if an activity is a stretch session.
 */
export function isStretchActivity(
  activity: CalendarActivity
): activity is CalendarActivity & { summary: StretchActivitySummary } {
  return activity.type === 'stretch';
}

/**
 * Type guard to check if an activity is a meditation session.
 */
export function isMeditationActivity(
  activity: CalendarActivity
): activity is CalendarActivity & { summary: MeditationActivitySummary } {
  return activity.type === 'meditation';
}

/**
 * Type guard to check if an activity is a cycling session.
 */
export function isCyclingActivity(
  activity: CalendarActivity
): activity is CalendarActivity & { summary: CyclingActivitySummary } {
  return activity.type === 'cycling';
}

/**
 * Aggregated data for a single calendar day.
 * Groups all activities that occurred on that date.
 */
export interface CalendarDayData {
  /** Date string (ISO 8601 date format, YYYY-MM-DD) */
  date: string;
  /** All activities for this day, ordered by completion time */
  activities: CalendarActivity[];
  /** Quick summary counts for the day */
  summary: {
    /** Total number of activities */
    totalActivities: number;
    /** Number of completed activities */
    completedActivities: number;
    /** Whether any workout was completed this day */
    hasWorkout: boolean;
    /** Whether any stretch session was completed this day */
    hasStretch: boolean;
    /** Whether any meditation was completed this day */
    hasMeditation: boolean;
    /** Whether any cycling activity was completed this day */
    hasCycling: boolean;
  };
}

/**
 * Response type for calendar data API endpoint.
 * Returns activities grouped by date for a date range.
 */
export interface CalendarDataResponse {
  /** Start date of the range (ISO 8601 date string) */
  startDate: string;
  /** End date of the range (ISO 8601 date string) */
  endDate: string;
  /** Days with activity data, keyed by date string */
  days: Record<string, CalendarDayData>;
}
