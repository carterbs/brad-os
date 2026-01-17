import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, Container, Heading, Text, Flex } from '@radix-ui/themes';
import { BottomNav } from './Navigation';
import { MesoTab } from './Mesocycle';
import {
  ExerciseLibraryPage,
  PlansPage,
  CreatePlanPage,
  PlanDetailPage,
} from '../pages';
import { usePlans } from '../hooks/usePlans';
import {
  useActiveMesocycle,
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

function TodayPage(): JSX.Element {
  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Today</Heading>
        <Box
          p="4"
          style={{
            backgroundColor: 'var(--gray-2)',
            borderRadius: 'var(--radius-3)',
          }}
        >
          <Text color="gray">No workout scheduled for today.</Text>
        </Box>
      </Flex>
    </Container>
  );
}

function MesoPage(): JSX.Element {
  const { data: activeMesocycle, isLoading: isLoadingMesocycle } =
    useActiveMesocycle();
  const { data: plans, isLoading: isLoadingPlans } = usePlans();

  const createMesocycle = useCreateMesocycle();
  const completeMesocycle = useCompleteMesocycle();
  const cancelMesocycle = useCancelMesocycle();

  const handleCreate = (planId: number, startDate: string): void => {
    createMesocycle.mutate({ plan_id: planId, start_date: startDate });
  };

  const handleComplete = (): void => {
    if (activeMesocycle) {
      completeMesocycle.mutate(activeMesocycle.id);
    }
  };

  const handleCancel = (): void => {
    if (activeMesocycle) {
      cancelMesocycle.mutate(activeMesocycle.id);
    }
  };

  const handleWorkoutClick = (workoutId: number): void => {
    // TODO: Navigate to workout tracking page when implemented
    console.log('Workout clicked:', workoutId);
  };

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Mesocycle</Heading>

        <MesoTab
          activeMesocycle={activeMesocycle ?? null}
          plans={plans ?? []}
          isLoading={isLoadingMesocycle || isLoadingPlans}
          isCreating={createMesocycle.isPending}
          isCompleting={completeMesocycle.isPending}
          isCancelling={cancelMesocycle.isPending}
          createError={createMesocycle.error?.message ?? null}
          onCreateMesocycle={handleCreate}
          onCompleteMesocycle={handleComplete}
          onCancelMesocycle={handleCancel}
          onWorkoutClick={handleWorkoutClick}
        />
      </Flex>
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
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/plans/new" element={<CreatePlanPage />} />
          <Route path="/plans/:id" element={<PlanDetailPage />} />
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
