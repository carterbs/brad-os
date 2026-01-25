import { Box, Badge, Flex, Text } from '@radix-ui/themes';
import type {
  CalendarActivity,
  WorkoutActivitySummary,
  StretchActivitySummary,
  MeditationActivitySummary,
} from '@brad-os/shared';

interface ActivityItemProps {
  activity: CalendarActivity;
  onClick: (activity: CalendarActivity) => void;
}

function getActivityBadgeColor(type: CalendarActivity['type']): 'indigo' | 'teal' | 'purple' {
  switch (type) {
    case 'workout':
      return 'indigo';
    case 'stretch':
      return 'teal';
    case 'meditation':
      return 'purple';
    default:
      return 'indigo';
  }
}

function getActivityBadgeLabel(type: CalendarActivity['type']): string {
  switch (type) {
    case 'workout':
      return 'Workout';
    case 'stretch':
      return 'Stretch';
    case 'meditation':
      return 'Meditation';
    default:
      return 'Activity';
  }
}

function getBackgroundColor(type: CalendarActivity['type']): string {
  switch (type) {
    case 'workout':
      return 'rgba(99, 102, 241, 0.15)'; // indigo with transparency for dark theme
    case 'stretch':
      return 'rgba(20, 184, 166, 0.15)'; // teal with transparency for dark theme
    case 'meditation':
      return 'rgba(168, 85, 247, 0.15)'; // purple with transparency for dark theme
    default:
      return 'rgba(107, 114, 128, 0.15)'; // gray with transparency
  }
}

function formatWorkoutSummary(summary: WorkoutActivitySummary): string {
  return `${summary.dayName} - ${summary.exerciseCount} exercises`;
}

function formatStretchSummary(summary: StretchActivitySummary): string {
  const minutes = Math.floor(summary.totalDurationSeconds / 60);
  return `${summary.regionsCompleted} regions - ${minutes} min`;
}

function formatMeditationSummary(summary: MeditationActivitySummary): string {
  const minutes = Math.floor(summary.durationSeconds / 60);
  return `${summary.meditationType} - ${minutes} min`;
}

function getSummaryText(activity: CalendarActivity): string {
  switch (activity.type) {
    case 'workout':
      return formatWorkoutSummary(activity.summary as WorkoutActivitySummary);
    case 'stretch':
      return formatStretchSummary(activity.summary as StretchActivitySummary);
    case 'meditation':
      return formatMeditationSummary(activity.summary as MeditationActivitySummary);
    default:
      return '';
  }
}

export function ActivityItem({ activity, onClick }: ActivityItemProps): JSX.Element {
  const handleClick = (): void => {
    onClick(activity);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(activity);
    }
  };

  const backgroundColor = getBackgroundColor(activity.type);
  const badgeColor = getActivityBadgeColor(activity.type);
  const badgeLabel = getActivityBadgeLabel(activity.type);
  const summaryText = getSummaryText(activity);

  return (
    <Box
      data-testid={`activity-item-${activity.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      style={{
        padding: '12px',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor,
      }}
    >
      <Flex justify="between" align="center" gap="2">
        <Flex direction="column" gap="1">
          <Badge color={badgeColor} size="1">
            {badgeLabel}
          </Badge>
          <Text size="2" color="gray">
            {summaryText}
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}
