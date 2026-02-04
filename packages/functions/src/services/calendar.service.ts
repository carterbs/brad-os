import type { Firestore } from 'firebase-admin/firestore';
import type {
  CalendarActivity,
  CalendarDayData,
  CalendarDataResponse,
  WorkoutActivitySummary,
  StretchActivitySummary,
  MeditationActivitySummary,
} from '../shared.js';
import {
  WorkoutRepository,
  WorkoutSetRepository,
  PlanDayRepository,
  StretchSessionRepository,
  MeditationSessionRepository,
} from '../repositories/index.js';

/**
 * Convert a UTC ISO timestamp to a local date string (YYYY-MM-DD) given a timezone offset.
 * @param isoTimestamp - UTC timestamp in ISO format (e.g., "2024-01-15T03:00:00.000Z")
 * @param timezoneOffsetMinutes - Timezone offset in minutes from TimeZone.secondsFromGMT() / 60
 *                                 (negative for west of UTC, positive for east)
 * @returns Local date string in YYYY-MM-DD format
 */
export function utcToLocalDate(isoTimestamp: string, timezoneOffsetMinutes: number): string {
  const utcTime = new Date(isoTimestamp).getTime();
  // Add offset because iOS sends secondsFromGMT/60 (negative for west, e.g., -300 for EST)
  // localTime = utcTime + (offsetMinutes * 60 * 1000)
  const localTime = utcTime + timezoneOffsetMinutes * 60 * 1000;
  const localDate = new Date(localTime);
  // Extract the UTC components of the adjusted date (which now represent local time)
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class CalendarService {
  private workoutRepo: WorkoutRepository;
  private workoutSetRepo: WorkoutSetRepository;
  private planDayRepo: PlanDayRepository;
  private stretchSessionRepo: StretchSessionRepository;
  private meditationSessionRepo: MeditationSessionRepository;

  constructor(db: Firestore) {
    this.workoutRepo = new WorkoutRepository(db);
    this.workoutSetRepo = new WorkoutSetRepository(db);
    this.planDayRepo = new PlanDayRepository(db);
    this.stretchSessionRepo = new StretchSessionRepository(db);
    this.meditationSessionRepo = new MeditationSessionRepository(db);
  }

  /**
   * Get calendar data for a specific month.
   * @param year - The year (e.g., 2024)
   * @param month - The month (1-12)
   * @param timezoneOffset - Timezone offset in minutes from Date.getTimezoneOffset()
   *                         (positive for west of UTC, negative for east). Defaults to 0 (UTC).
   * @returns CalendarDataResponse with activities grouped by date
   */
  async getMonthData(year: number, month: number, timezoneOffset: number = 0): Promise<CalendarDataResponse> {
    const { startDate, endDate } = this.getMonthBoundaries(year, month);

    // Query completed workouts, stretch sessions, and meditation sessions for the date range
    // Pass timezone offset so repositories can adjust UTC boundaries to match local dates
    const workouts = await this.workoutRepo.findCompletedInDateRange(startDate, endDate, timezoneOffset);
    const stretchSessions = await this.stretchSessionRepo.findInDateRange(startDate, endDate, timezoneOffset);
    const meditationSessions = await this.meditationSessionRepo.findInDateRange(startDate, endDate, timezoneOffset);

    // Transform to CalendarActivity[]
    const activities: CalendarActivity[] = [];

    // Batch-fetch plan days and workout sets to avoid N+1 queries
    const uniquePlanDayIds = [...new Set(workouts.map((w) => w.plan_day_id))];
    const workoutIds = workouts.map((w) => w.id);

    const [planDayMap, workoutSetsMap] = await Promise.all([
      this.planDayRepo.findByIds(uniquePlanDayIds),
      this.workoutSetRepo.findByWorkoutIds(workoutIds),
    ]);

    // Transform workouts using pre-fetched data
    for (const workout of workouts) {
      const planDay = planDayMap.get(workout.plan_day_id) ?? null;
      const sets = workoutSetsMap.get(workout.id) ?? [];

      // Count unique exercises
      const uniqueExerciseIds = new Set(sets.map((s) => s.exercise_id));

      // Count completed sets
      const completedSets = sets.filter((s) => s.status === 'completed').length;

      // Extract date from completed_at, converting UTC to local date
      const completedAt = workout.completed_at;
      const date =
        completedAt !== null && completedAt !== ''
          ? utcToLocalDate(completedAt, timezoneOffset)
          : workout.scheduled_date;

      const summary: WorkoutActivitySummary = {
        dayName: planDay?.name ?? 'Unknown',
        exerciseCount: uniqueExerciseIds.size,
        setsCompleted: completedSets,
        totalSets: sets.length,
        weekNumber: workout.week_number,
        isDeload: workout.week_number === 7,
      };

      activities.push({
        id: `workout-${workout.id}`,
        type: 'workout',
        date,
        completedAt: workout.completed_at,
        summary,
      });
    }

    // Transform stretch sessions
    for (const session of stretchSessions) {
      // Extract date from completedAt, converting UTC to local date
      const date = utcToLocalDate(session.completedAt, timezoneOffset);

      const summary: StretchActivitySummary = {
        totalDurationSeconds: session.totalDurationSeconds,
        regionsCompleted: session.regionsCompleted,
        regionsSkipped: session.regionsSkipped,
      };

      activities.push({
        id: `stretch-${session.id}`,
        type: 'stretch',
        date,
        completedAt: session.completedAt,
        summary,
      });
    }

    // Transform meditation sessions
    for (const session of meditationSessions) {
      // Convert UTC timestamp to local date
      const date = utcToLocalDate(session.completedAt, timezoneOffset);

      const summary: MeditationActivitySummary = {
        durationSeconds: session.actualDurationSeconds,
        meditationType: session.sessionType,
      };

      activities.push({
        id: `meditation-${session.id}`,
        type: 'meditation',
        date,
        completedAt: session.completedAt,
        summary,
      });
    }

    // Group activities by date
    const days: Record<string, CalendarDayData> = {};

    for (const activity of activities) {
      const existingDay = days[activity.date];
      const dayData: CalendarDayData = existingDay ?? {
        date: activity.date,
        activities: [],
        summary: {
          totalActivities: 0,
          completedActivities: 0,
          hasWorkout: false,
          hasStretch: false,
          hasMeditation: false,
        },
      };

      if (!existingDay) {
        days[activity.date] = dayData;
      }

      dayData.activities.push(activity);
      dayData.summary.totalActivities++;
      dayData.summary.completedActivities++;

      if (activity.type === 'workout') {
        dayData.summary.hasWorkout = true;
      } else if (activity.type === 'stretch') {
        dayData.summary.hasStretch = true;
      } else if (activity.type === 'meditation') {
        dayData.summary.hasMeditation = true;
      }
    }

    // Sort activities within each day by completion time
    for (const dayData of Object.values(days)) {
      dayData.activities.sort((a, b) => {
        const timeA = a.completedAt ?? '';
        const timeB = b.completedAt ?? '';
        return timeA.localeCompare(timeB);
      });
    }

    return {
      startDate,
      endDate,
      days,
    };
  }

  /**
   * Calculate the start and end dates for a given month.
   * @param year - The year
   * @param month - The month (1-12)
   * @returns Object with startDate and endDate in YYYY-MM-DD format
   */
  private getMonthBoundaries(
    year: number,
    month: number
  ): { startDate: string; endDate: string } {
    // Start date is the first day of the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    // End date is the last day of the month
    // Create a date for the first day of the next month, then go back one day
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const lastDay = new Date(nextYear, nextMonth - 1, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
  }
}
