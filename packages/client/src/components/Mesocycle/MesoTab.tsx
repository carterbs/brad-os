import { Box, Flex, Text, Heading, Spinner, Badge, Card } from '@radix-ui/themes';
import type { MesocycleWithDetails, Plan, Mesocycle } from '@brad-os/shared';
import { MesocycleStatusCard } from './MesocycleStatusCard';
import { WeekCard } from './WeekCard';
import { StartMesocycleForm } from './StartMesocycleForm';

interface MesoTabProps {
  activeMesocycle: MesocycleWithDetails | null;
  completedMesocycles?: Mesocycle[];
  plans: Plan[];
  isLoading?: boolean;
  isCreating?: boolean;
  isCompleting?: boolean;
  isCancelling?: boolean;
  createError?: string | null;
  onCreateMesocycle: (planId: number, startDate: string) => void;
  onCompleteMesocycle?: () => void;
  onCancelMesocycle?: () => void;
  onWorkoutClick?: (workoutId: number) => void;
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

interface CompletedMesocycleCardProps {
  mesocycle: Mesocycle;
  planName: string;
}

function CompletedMesocycleCard({
  mesocycle,
  planName,
}: CompletedMesocycleCardProps): JSX.Element {
  return (
    <Card data-testid={`completed-mesocycle-${mesocycle.id}`}>
      <Flex justify="between" align="center">
        <Flex direction="column" gap="1">
          <Text weight="medium">{planName}</Text>
          <Text size="1" color="gray">
            Started {formatDate(mesocycle.start_date)}
          </Text>
        </Flex>
        <Badge color="gray" variant="soft">
          Completed
        </Badge>
      </Flex>
    </Card>
  );
}

export function MesoTab({
  activeMesocycle,
  completedMesocycles = [],
  plans,
  isLoading = false,
  isCreating = false,
  isCompleting = false,
  isCancelling = false,
  createError = null,
  onCreateMesocycle,
  onCompleteMesocycle,
  onCancelMesocycle,
  onWorkoutClick,
}: MesoTabProps): JSX.Element {
  // Build a map of plan_id to plan name for displaying completed mesocycles
  const planNameMap = new Map(plans.map((p) => [p.id, p.name]));
  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="6">
        <Spinner size="3" />
      </Flex>
    );
  }

  // No active mesocycle - show form to start one and history
  if (!activeMesocycle) {
    return (
      <Flex direction="column" gap="4">
        <Box
          p="4"
          style={{
            backgroundColor: 'var(--gray-2)',
            borderRadius: 'var(--radius-3)',
          }}
        >
          <Text color="gray">No active mesocycle</Text>
        </Box>

        <StartMesocycleForm
          plans={plans}
          onSubmit={onCreateMesocycle}
          isSubmitting={isCreating}
          error={createError}
        />

        {completedMesocycles.length > 0 && (
          <>
            <Heading size="4" data-testid="completed-mesocycles-heading">
              History
            </Heading>
            <Flex direction="column" gap="2" data-testid="completed-mesocycles-list">
              {completedMesocycles.map((meso) => (
                <CompletedMesocycleCard
                  key={meso.id}
                  mesocycle={meso}
                  planName={planNameMap.get(meso.plan_id) ?? 'Unknown Plan'}
                />
              ))}
            </Flex>
          </>
        )}
      </Flex>
    );
  }

  // Active mesocycle - show status and weeks
  return (
    <Flex direction="column" gap="4">
      <MesocycleStatusCard
        mesocycle={activeMesocycle}
        {...(onCompleteMesocycle && { onComplete: onCompleteMesocycle })}
        {...(onCancelMesocycle && { onCancel: onCancelMesocycle })}
        isCompleting={isCompleting}
        isCancelling={isCancelling}
      />

      <Heading size="4">Weekly Schedule</Heading>

      <Flex direction="column" gap="3">
        {activeMesocycle.weeks.map((week) => (
          <WeekCard
            key={week.week_number}
            week={week}
            isCurrentWeek={week.week_number === activeMesocycle.current_week}
            {...(onWorkoutClick && { onWorkoutClick })}
          />
        ))}
      </Flex>
    </Flex>
  );
}
