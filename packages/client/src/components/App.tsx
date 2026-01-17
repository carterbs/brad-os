import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, Container, Heading, Text, Flex } from '@radix-ui/themes';
import { BottomNav } from './Navigation';
import {
  ExerciseLibraryPage,
  PlansPage,
  CreatePlanPage,
  PlanDetailPage,
} from '../pages';

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
  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Mesocycle</Heading>
        <Box
          p="4"
          style={{
            backgroundColor: 'var(--gray-2)',
            borderRadius: 'var(--radius-3)',
          }}
        >
          <Text color="gray">No active mesocycle. Create a plan first!</Text>
        </Box>
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
