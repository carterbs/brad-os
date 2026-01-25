import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Heading, Flex } from '@radix-ui/themes';
import { MesoTab, CompleteMesocycleDialog } from '../components/Mesocycle';
import { usePlans } from '../hooks/usePlans';
import {
  useActiveMesocycle,
  useMesocycles,
  useCreateMesocycle,
  useCompleteMesocycle,
  useCancelMesocycle,
} from '../hooks/useMesocycles';

export function MesoPage(): JSX.Element {
  const navigate = useNavigate();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const { data: activeMesocycle, isLoading: isLoadingMesocycle } =
    useActiveMesocycle();
  const { data: allMesocycles, isLoading: isLoadingAllMesocycles } =
    useMesocycles();
  const { data: plans, isLoading: isLoadingPlans } = usePlans();

  // Filter for completed mesocycles (most recent first)
  const completedMesocycles = (allMesocycles ?? [])
    .filter((m) => m.status === 'completed')
    .sort((a, b) => b.id - a.id);

  const createMesocycle = useCreateMesocycle();
  const completeMesocycle = useCompleteMesocycle();
  const cancelMesocycle = useCancelMesocycle();

  const handleCreate = (planId: number, startDate: string): void => {
    createMesocycle.mutate({ plan_id: planId, start_date: startDate });
  };

  const handleCompleteClick = (): void => {
    setShowCompleteDialog(true);
  };

  const handleConfirmComplete = (): void => {
    if (activeMesocycle) {
      completeMesocycle.mutate(activeMesocycle.id, {
        onSuccess: () => {
          setShowCompleteDialog(false);
        },
      });
    }
  };

  const handleCancel = (): void => {
    if (activeMesocycle) {
      cancelMesocycle.mutate(activeMesocycle.id);
    }
  };

  const handleWorkoutClick = (workoutId: number): void => {
    void navigate(`/lifting/workouts/${workoutId}`);
  };

  const progressPercent =
    activeMesocycle && activeMesocycle.total_workouts > 0
      ? Math.round(
          (activeMesocycle.completed_workouts / activeMesocycle.total_workouts) * 100
        )
      : 0;

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Mesocycle</Heading>

        <MesoTab
          activeMesocycle={activeMesocycle ?? null}
          completedMesocycles={completedMesocycles}
          plans={plans ?? []}
          isLoading={isLoadingMesocycle || isLoadingPlans || isLoadingAllMesocycles}
          isCreating={createMesocycle.isPending}
          isCompleting={completeMesocycle.isPending}
          isCancelling={cancelMesocycle.isPending}
          createError={createMesocycle.error?.message ?? null}
          onCreateMesocycle={handleCreate}
          onCompleteMesocycle={handleCompleteClick}
          onCancelMesocycle={handleCancel}
          onWorkoutClick={handleWorkoutClick}
        />
      </Flex>

      <CompleteMesocycleDialog
        open={showCompleteDialog}
        onClose={() => setShowCompleteDialog(false)}
        onConfirm={handleConfirmComplete}
        isCompleting={completeMesocycle.isPending}
        progressPercent={progressPercent}
        completedWorkouts={activeMesocycle?.completed_workouts ?? 0}
        totalWorkouts={activeMesocycle?.total_workouts ?? 0}
      />
    </Container>
  );
}
