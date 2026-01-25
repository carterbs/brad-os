import type { Database } from 'better-sqlite3';
import type {
  CalendarActivity,
  CalendarDayData,
  CalendarDataResponse,
  WorkoutActivitySummary,
  StretchActivitySummary,
  MeditationActivitySummary,
} from '@brad-os/shared';
import {
  WorkoutRepository,
  WorkoutSetRepository,
  PlanDayRepository,
  StretchSessionRepository,
  MeditationSessionRepository,
} from '../repositories/index.js';

export class CalendarService {
  private workoutRepo: WorkoutRepository;
  private workoutSetRepo: WorkoutSetRepository;
  private planDayRepo: PlanDayRepository;
  private stretchSessionRepo: StretchSessionRepository;
  private meditationSessionRepo: MeditationSessionRepository;

  constructor(db: Database) {
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
   * @returns CalendarDataResponse with activities grouped by date
   */
  getMonthData(year: number, month: number): CalendarDataResponse {
    const { startDate, endDate } = this.getMonthBoundaries(year, month);

    // Query completed workouts, stretch sessions, and meditation sessions for the date range
    const workouts = this.workoutRepo.findCompletedInDateRange(startDate, endDate);
    const stretchSessions = this.stretchSessionRepo.findInDateRange(startDate, endDate);
    const meditationSessions = this.meditationSessionRepo.findInDateRange(startDate, endDate);

    // Transform to CalendarActivity[]
    const activities: CalendarActivity[] = [];

    // Transform workouts
    for (const workout of workouts) {
      const planDay = this.planDayRepo.findById(workout.plan_day_id);
      const sets = this.workoutSetRepo.findByWorkoutId(workout.id);

      // Count unique exercises
      const uniqueExerciseIds = new Set(sets.map((s) => s.exercise_id));

      // Count completed sets
      const completedSets = sets.filter((s) => s.status === 'completed').length;

      // Extract date from completed_at
      const completedAt = workout.completed_at;
      const date =
        completedAt !== null && completedAt !== ''
          ? completedAt.substring(0, 10)
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
      // Extract date from completedAt
      const date = session.completedAt.substring(0, 10);

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
      const date = session.completedAt.substring(0, 10);

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
