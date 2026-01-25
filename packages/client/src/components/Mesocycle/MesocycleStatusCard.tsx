import {
  Box,
  Flex,
  Text,
  Heading,
  Button,
  Progress,
} from '@radix-ui/themes';
import type { MesocycleWithDetails } from '@brad-os/shared';

interface MesocycleStatusCardProps {
  mesocycle: MesocycleWithDetails;
  onComplete?: () => void;
  onCancel?: () => void;
  isCompleting?: boolean;
  isCancelling?: boolean;
}

function formatDate(dateString: string): string {
  // Append T00:00:00 to parse as local time, not UTC (avoids off-by-one day in negative UTC timezones)
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MesocycleStatusCard({
  mesocycle,
  onComplete,
  onCancel,
  isCompleting = false,
  isCancelling = false,
}: MesocycleStatusCardProps): JSX.Element {
  const progressPercent =
    mesocycle.total_workouts > 0
      ? Math.round(
          (mesocycle.completed_workouts / mesocycle.total_workouts) * 100
        )
      : 0;

  const isActive = mesocycle.status === 'active';

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-4)',
      }}
      data-testid="mesocycle-status-card"
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" align="start">
          <Flex direction="column" gap="1">
            <Heading size="4" data-testid="mesocycle-plan-name">
              {mesocycle.plan_name}
            </Heading>
            <Text size="1" color="gray">
              Started {formatDate(mesocycle.start_date)}
            </Text>
          </Flex>

          <Text
            size="1"
            color="gray"
            weight="medium"
            data-testid="mesocycle-status-badge"
          >
            {mesocycle.status.charAt(0).toUpperCase() +
              mesocycle.status.slice(1)}
          </Text>
        </Flex>

        <Flex direction="column" gap="2">
          <Flex justify="between" align="center">
            <Text size="2" color="gray" data-testid="mesocycle-progress-text">
              Week {mesocycle.current_week} of 7 · {mesocycle.completed_workouts}/{mesocycle.total_workouts} workouts
            </Text>
            <Text size="1" color="gray">
              {progressPercent}%
            </Text>
          </Flex>
          <Progress
            value={progressPercent}
            size="1"
            data-testid="mesocycle-progress-bar"
          />
        </Flex>

        {isActive && (onComplete != null || onCancel != null) && (
          <Flex gap="2" mt="1">
            {onComplete && (
              <Button
                size="2"
                variant="solid"
                onClick={onComplete}
                disabled={isCompleting || isCancelling}
                data-testid="complete-mesocycle-button"
              >
                {isCompleting ? 'Completing...' : 'Complete'}
              </Button>
            )}
            {onCancel && (
              <Button
                size="2"
                variant="soft"
                color="gray"
                onClick={onCancel}
                disabled={isCompleting || isCancelling}
                data-testid="cancel-mesocycle-button"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel'}
              </Button>
            )}
          </Flex>
        )}
      </Flex>
    </Box>
  );
}
