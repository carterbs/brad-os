import { Box, Flex, Text, Heading } from '@radix-ui/themes';
import type { WeekSummary, WorkoutStatus } from '@brad-os/shared';

interface WeekCardProps {
  week: WeekSummary;
  isCurrentWeek?: boolean;
  onWorkoutClick?: (workoutId: number) => void;
}

function formatStatus(status: WorkoutStatus): string {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatDate(dateString: string): string {
  // Append T00:00:00 to parse as local time, not UTC (avoids off-by-one day in negative UTC timezones)
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatCompletedAt(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function WeekCard({
  week,
  isCurrentWeek = false,
  onWorkoutClick,
}: WeekCardProps): JSX.Element {
  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-4)',
        borderLeft: isCurrentWeek
          ? '3px solid var(--accent-9)'
          : '1px solid var(--gray-4)',
      }}
      data-testid={`week-card-${week.week_number}`}
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Flex gap="2" align="baseline">
            <Heading size="3">Week {week.week_number}</Heading>
            {week.is_deload && (
              <Text size="1" color="gray" data-testid="deload-badge">
                Deload
              </Text>
            )}
          </Flex>

          <Text size="1" color="gray" data-testid="workout-summary">
            {week.completed_workouts}/{week.total_workouts} completed
          </Text>
        </Flex>

        {week.workouts.length > 0 ? (
          <Flex direction="column" gap="0">
            {week.workouts.map((workout, index) => (
              <Box
                key={workout.id}
                py="3"
                style={{
                  borderTop: index > 0 ? '1px solid var(--gray-4)' : undefined,
                  cursor: onWorkoutClick ? 'pointer' : 'default',
                }}
                onClick={() => onWorkoutClick?.(workout.id)}
                data-testid={`workout-item-${workout.id}`}
              >
                <Flex justify="between" align="center" gap="2">
                  <Flex direction="column" gap="1">
                    <Text size="2" weight="medium">
                      {workout.plan_day_name}
                    </Text>
                    {workout.status === 'completed' && workout.completed_at !== null ? (
                      <Text size="1" color="gray">
                        Completed {formatCompletedAt(workout.completed_at)}
                      </Text>
                    ) : (
                      <Text size="1" color="gray">
                        {formatDate(workout.scheduled_date)}
                      </Text>
                    )}
                  </Flex>

                  <Flex gap="3" align="center">
                    <Text size="1" color="gray">
                      {workout.completed_set_count}/{workout.set_count} sets
                    </Text>
                    <Text size="1" color="gray">
                      {formatStatus(workout.status)}
                    </Text>
                  </Flex>
                </Flex>
              </Box>
            ))}
          </Flex>
        ) : (
          <Text size="2" color="gray">
            No workouts this week
          </Text>
        )}
      </Flex>
    </Box>
  );
}
