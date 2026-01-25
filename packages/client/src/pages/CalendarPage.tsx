/**
 * Calendar Page
 *
 * Displays a monthly calendar view with activity indicators.
 * Shows workouts, stretch sessions, and meditations completed on each day.
 * Clicking a day opens a detail dialog with the list of activities.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Heading, Flex, Text, Spinner, Box } from '@radix-ui/themes';
import type { CalendarDayData, CalendarActivity } from '@brad-os/shared';
import { MonthCalendar, DayDetailDialog } from '../components/Calendar';
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

export function CalendarPage(): JSX.Element {
  const navigate = useNavigate();

  // Current month/year being viewed (defaults to current date)
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed for API

  // Selected day for the detail dialog
  const [selectedDay, setSelectedDay] = useState<CalendarDayData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch calendar data for the current month
  const { data: calendarData, isLoading, error } = useCalendarMonth(year, month);

  // Transform days Record to array for MonthCalendar
  const activities = useMemo((): CalendarDayData[] => {
    if (!calendarData?.days) {
      return [];
    }
    return Object.values(calendarData.days);
  }, [calendarData]);

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
      const dayData = calendarData?.days[dateKey];

      if (dayData) {
        setSelectedDay(dayData);
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
    [calendarData]
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
        // Navigate to workout detail page
        // The activity ID is in format "workout-{id}", extract the numeric ID
        const workoutId = activity.id.replace('workout-', '');
        void navigate(`/workouts/${workoutId}`);
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
          <Heading size="6">Calendar</Heading>
          <Flex
            direction="column"
            align="center"
            justify="center"
            style={{ minHeight: '50vh' }}
          >
            <Spinner size="3" />
            <Text size="2" color="gray" mt="3">
              Loading calendar...
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
          <Heading size="6">Calendar</Heading>
          <Box style={{ padding: '16px' }}>
            <Text color="red">Error loading calendar: {error.message}</Text>
          </Box>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Calendar</Heading>

        <MonthCalendar
          activities={activities}
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
