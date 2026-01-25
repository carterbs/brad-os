import Calendar from 'react-calendar';
import { Box } from '@radix-ui/themes';
import type { CalendarDayData } from '@lifting/shared';

interface MonthCalendarProps {
  activities: CalendarDayData[];
  currentDate: Date;
  onDayClick: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function MonthCalendar({
  activities,
  currentDate,
  onDayClick,
  onMonthChange,
}: MonthCalendarProps): JSX.Element {
  // Create a lookup map for quick access to day data
  const activityMap = new Map<string, CalendarDayData>();
  for (const dayData of activities) {
    activityMap.set(dayData.date, dayData);
  }

  // Render colored dots for days with activities
  const tileContent = ({ date, view }: { date: Date; view: string }): JSX.Element | null => {
    if (view !== 'month') {
      return null;
    }

    const dateKey = formatDateKey(date);
    const dayData = activityMap.get(dateKey);

    if (!dayData) {
      return null;
    }

    const { hasWorkout, hasStretch, hasMeditation } = dayData.summary;

    return (
      <Box
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2px',
          marginTop: '2px',
        }}
      >
        {hasWorkout && (
          <span
            data-testid={`workout-dot-${dateKey}`}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              display: 'inline-block',
              backgroundColor: '#6366f1', // indigo-500
            }}
          />
        )}
        {hasStretch && (
          <span
            data-testid={`stretch-dot-${dateKey}`}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              display: 'inline-block',
              backgroundColor: '#14b8a6', // teal-500
            }}
          />
        )}
        {hasMeditation && (
          <span
            data-testid={`meditation-dot-${dateKey}`}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              display: 'inline-block',
              backgroundColor: '#a855f7', // purple-500
            }}
          />
        )}
      </Box>
    );
  };

  const handleClickDay = (value: Date): void => {
    onDayClick(value);
  };

  const handleActiveStartDateChange = ({
    activeStartDate,
  }: {
    activeStartDate: Date | null;
  }): void => {
    if (activeStartDate) {
      onMonthChange(activeStartDate);
    }
  };

  return (
    <Box data-testid="month-calendar">
      <Calendar
        value={currentDate}
        onClickDay={handleClickDay}
        onActiveStartDateChange={handleActiveStartDateChange}
        tileContent={tileContent}
        prevLabel="< Prev"
        nextLabel="Next >"
        prev2Label={null}
        next2Label={null}
      />
    </Box>
  );
}
