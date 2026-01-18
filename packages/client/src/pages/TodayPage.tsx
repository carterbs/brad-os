import { useCallback } from 'react';
import { Container, Flex, Heading, Box, Text, Spinner } from '@radix-ui/themes';
import { WorkoutView } from '../components/Workout';
import { useWorkoutTracking, useAddSet, useRemoveSet } from '../hooks/useWorkout';

export function TodayPage(): JSX.Element {
  const {
    workout,
    isLoading,
    error,
    startWorkout,
    completeWorkout,
    skipWorkout,
    logSet,
    unlogSet,
    isStarting,
    isCompleting,
    isSkippingWorkout,
  } = useWorkoutTracking();

  const addSetMutation = useAddSet();
  const removeSetMutation = useRemoveSet();

  const handleAddSet = useCallback(
    (exerciseId: number) => {
      if (workout) {
        addSetMutation.mutate({ workoutId: workout.id, exerciseId });
      }
    },
    [workout, addSetMutation]
  );

  const handleRemoveSet = useCallback(
    (exerciseId: number) => {
      if (workout) {
        removeSetMutation.mutate({ workoutId: workout.id, exerciseId });
      }
    },
    [workout, removeSetMutation]
  );

  if (isLoading) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4" align="center" justify="center" py="9">
          <Spinner size="3" />
          <Text color="gray">Loading workout...</Text>
        </Flex>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4">
          <Heading size="6">Today</Heading>
          <Box
            p="4"
            style={{
              backgroundColor: 'var(--red-2)',
              borderRadius: 'var(--radius-3)',
            }}
          >
            <Text color="red">Error loading workout: {error.message}</Text>
          </Box>
        </Flex>
      </Container>
    );
  }

  if (!workout) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4">
          <Heading size="6">Today</Heading>
          <Box
            p="4"
            data-testid="no-workout-message"
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

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Today</Heading>
        <WorkoutView
          workout={workout}
          onSetLogged={(setId, data) => logSet(setId, data)}
          onSetUnlogged={(setId) => unlogSet(setId)}
          onAddSet={handleAddSet}
          onRemoveSet={handleRemoveSet}
          onWorkoutStarted={startWorkout}
          onWorkoutCompleted={completeWorkout}
          onWorkoutSkipped={skipWorkout}
          isStarting={isStarting}
          isCompleting={isCompleting}
          isSkipping={isSkippingWorkout}
        />
      </Flex>
    </Container>
  );
}
