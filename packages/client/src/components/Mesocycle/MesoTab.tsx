import { Box, Flex, Text, Heading, Spinner } from '@radix-ui/themes';
import type { MesocycleWithDetails, Plan } from '@lifting/shared';
import { MesocycleStatusCard } from './MesocycleStatusCard';
import { WeekCard } from './WeekCard';
import { StartMesocycleForm } from './StartMesocycleForm';

interface MesoTabProps {
  activeMesocycle: MesocycleWithDetails | null;
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

export function MesoTab({
  activeMesocycle,
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
  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="6">
        <Spinner size="3" />
      </Flex>
    );
  }

  // No active mesocycle - show form to start one
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
