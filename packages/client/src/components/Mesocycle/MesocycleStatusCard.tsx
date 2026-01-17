import {
  Box,
  Flex,
  Text,
  Heading,
  Badge,
  Button,
  Progress,
} from '@radix-ui/themes';
import type { MesocycleWithDetails, MesocycleStatus } from '@lifting/shared';

interface MesocycleStatusCardProps {
  mesocycle: MesocycleWithDetails;
  onComplete?: () => void;
  onCancel?: () => void;
  isCompleting?: boolean;
  isCancelling?: boolean;
}

function getStatusColor(
  status: MesocycleStatus
): 'green' | 'gray' | 'red' {
  switch (status) {
    case 'active':
      return 'green';
    case 'completed':
      return 'gray';
    case 'cancelled':
      return 'red';
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
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
        border: '1px solid var(--gray-5)',
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

          <Badge
            color={getStatusColor(mesocycle.status)}
            variant="soft"
            size="2"
            data-testid="mesocycle-status-badge"
          >
            {mesocycle.status.charAt(0).toUpperCase() +
              mesocycle.status.slice(1)}
          </Badge>
        </Flex>

        <Flex direction="column" gap="2">
          <Flex justify="between" align="center">
            <Text size="2" weight="medium">
              Progress
            </Text>
            <Text size="2" color="gray" data-testid="mesocycle-progress-text">
              {mesocycle.completed_workouts} / {mesocycle.total_workouts}{' '}
              workouts ({progressPercent}%)
            </Text>
          </Flex>
          <Progress
            value={progressPercent}
            size="2"
            color="green"
            data-testid="mesocycle-progress-bar"
          />
        </Flex>

        <Flex gap="3" wrap="wrap">
          <Badge color="blue" variant="soft" size="1">
            Week {mesocycle.current_week} of 7
          </Badge>
          <Badge color="gray" variant="soft" size="1">
            {mesocycle.total_workouts} total workouts
          </Badge>
        </Flex>

        {isActive && (onComplete != null || onCancel != null) && (
          <Flex gap="2" mt="2">
            {onComplete && (
              <Button
                size="2"
                variant="soft"
                color="green"
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
                color="red"
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
