/**
 * History Page
 *
 * Enhanced calendar view with activity type filters.
 * Shows workouts, stretch sessions, and meditations completed on each day.
 * Clicking a day opens a detail dialog with the list of activities.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Heading, Flex, Text, Spinner, Box } from '@radix-ui/themes';
import type { CalendarDayData, CalendarActivity } from '@brad-os/shared';
import { MonthCalendar, DayDetailDialog } from '../components/Calendar';
import { ActivityFilter, type ActivityFilterType } from '../components/History';
import { useCalendarMonth } from '../hooks/useCalendarData';

/**
 * Format a date key from a Date object (YYYY-MM-DD)
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function HistoryPage(): JSX.Element {
  const navigate = useNavigate();

  // Current month/year being viewed (defaults to current date)
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed for API

  // Activity type filter
  const [filter, setFilter] = useState<ActivityFilterType>('all');

  // Selected day for the detail dialog
  const [selectedDay, setSelectedDay] = useState<CalendarDayData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch calendar data for the current month
  const { data: calendarData, isLoading, error } = useCalendarMonth(year, month);

  // Filter activities based on selected filter
  const filteredActivities = useMemo((): CalendarDayData[] => {
    if (!calendarData?.days) {
      return [];
    }

    const days = Object.values(calendarData.days);

    if (filter === 'all') {
      return days;
    }

    // Filter each day's activities based on the selected filter
    return days
      .map((day) => ({
        ...day,
        activities: day.activities.filter((a) => a.type === filter),
        summary: {
          ...day.summary,
          totalActivities: day.activities.filter((a) => a.type === filter).length,
          completedActivities: day.activities.filter((a) => a.type === filter).length,
          hasWorkout: filter === 'workout' ? day.summary.hasWorkout : false,
          hasStretch: filter === 'stretch' ? day.summary.hasStretch : false,
          hasMeditation: filter === 'meditation' ? day.summary.hasMeditation : false,
        },
      }))
      .filter((day) => day.activities.length > 0);
  }, [calendarData, filter]);

  // Current date for the calendar display
  const currentDate = useMemo(() => {
    return new Date(year, month - 1, 1);
  }, [year, month]);

  // Handle month navigation from calendar
  const handleMonthChange = useCallback((date: Date) => {
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }, []);

  // Handle day click - open detail dialog
  const handleDayClick = useCallback(
    (date: Date) => {
      const dateKey = formatDateKey(date);
      const allDays = calendarData?.days ?? {};
      const dayData = allDays[dateKey];

      if (dayData) {
        // Apply filter to the day's activities
        const filteredDay: CalendarDayData =
          filter === 'all'
            ? dayData
            : {
                ...dayData,
                activities: dayData.activities.filter((a) => a.type === filter),
              };
        setSelectedDay(filteredDay);
        setDialogOpen(true);
      } else {
        // Create an empty day data for days with no activities
        setSelectedDay({
          date: dateKey,
          activities: [],
          summary: {
            totalActivities: 0,
            completedActivities: 0,
            hasWorkout: false,
            hasStretch: false,
            hasMeditation: false,
          },
        });
        setDialogOpen(true);
      }
    },
    [calendarData, filter]
  );

  // Handle closing the detail dialog
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedDay(null);
  }, []);

  // Handle activity click from the detail dialog
  const handleActivityClick = useCallback(
    (activity: CalendarActivity) => {
      if (activity.type === 'workout') {
        // Navigate to workout detail page under lifting prefix
        const workoutId = activity.id.replace('workout-', '');
        void navigate(`/lifting/workouts/${workoutId}`);
      }
      // For stretch and meditation, just close the dialog (no detail pages exist)
      handleCloseDialog();
    },
    [navigate, handleCloseDialog]
  );

  // Loading state
  if (isLoading) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4">
          <Heading size="6">History</Heading>
          <ActivityFilter value={filter} onChange={setFilter} />
          <Flex
            direction="column"
            align="center"
            justify="center"
            style={{ minHeight: '50vh' }}
          >
            <Spinner size="3" />
            <Text size="2" color="gray" mt="3">
              Loading history...
            </Text>
          </Flex>
        </Flex>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4">
          <Heading size="6">History</Heading>
          <ActivityFilter value={filter} onChange={setFilter} />
          <Box style={{ padding: '16px' }}>
            <Text color="red">Error loading history: {error.message}</Text>
          </Box>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">History</Heading>

        <ActivityFilter value={filter} onChange={setFilter} />

        <MonthCalendar
          activities={filteredActivities}
          currentDate={currentDate}
          onDayClick={handleDayClick}
          onMonthChange={handleMonthChange}
        />

        <DayDetailDialog
          day={selectedDay}
          open={dialogOpen}
          onClose={handleCloseDialog}
          onActivityClick={handleActivityClick}
        />
      </Flex>
    </Container>
  );
}
