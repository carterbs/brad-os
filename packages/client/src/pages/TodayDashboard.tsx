import { Container, Heading, Flex } from '@radix-ui/themes';
import { WorkoutCard, StretchCard, MeditationCard } from '../components/Dashboard';
import { useTodaysWorkout } from '../hooks/useWorkout';
import { useLatestStretchSession } from '../hooks/useStretchHistory';
import { useLatestMeditationSession } from '../hooks/useMeditationHistory';

export function TodayDashboard(): JSX.Element {
  const { data: workout, isLoading: isLoadingWorkout } = useTodaysWorkout();
  const { data: lastStretch, isLoading: isLoadingStretch } = useLatestStretchSession();
  const { data: lastMeditation, isLoading: isLoadingMeditation } = useLatestMeditationSession();

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Today</Heading>

        <WorkoutCard
          workout={workout}
          isLoading={isLoadingWorkout}
        />

        <StretchCard
          lastSession={lastStretch}
          isLoading={isLoadingStretch}
        />

        <MeditationCard
          lastSession={lastMeditation}
          isLoading={isLoadingMeditation}
        />
      </Flex>
    </Container>
  );
}
