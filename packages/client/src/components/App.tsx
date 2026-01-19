import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, Container, Heading, Flex } from '@radix-ui/themes';
import { BottomNav } from './Navigation';
import { MesoTab, CompleteMesocycleDialog } from './Mesocycle';
import {
  ExerciseLibraryPage,
  PlansPage,
  CreatePlanPage,
  PlanDetailPage,
  EditPlanPage,
  TodayPage,
  WorkoutPage,
} from '../pages';
import { usePlans } from '../hooks/usePlans';
import {
  useActiveMesocycle,
  useMesocycles,
  useCreateMesocycle,
  useCompleteMesocycle,
  useCancelMesocycle,
} from '../hooks/useMesocycles';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function MesoPage(): JSX.Element {
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
    void navigate(`/workouts/${workoutId}`);
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

function AppContent(): JSX.Element {
  return (
    <>
      <Box style={{ paddingBottom: '80px' }}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/meso" element={<MesoPage />} />
          <Route path="/workouts/:id" element={<WorkoutPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/plans/new" element={<CreatePlanPage />} />
          <Route path="/plans/:id" element={<PlanDetailPage />} />
          <Route path="/plans/:id/edit" element={<EditPlanPage />} />
          <Route path="/exercises" element={<ExerciseLibraryPage />} />
        </Routes>
      </Box>
      <BottomNav />
    </>
  );
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
