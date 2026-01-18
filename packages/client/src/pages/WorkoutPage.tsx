import { useParams, useNavigate } from 'react-router-dom';
import { Container, Flex, Heading, Box, Text, Spinner, Button } from '@radix-ui/themes';
import { WorkoutView } from '../components/Workout';

function ArrowLeftIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.85355 3.14645C7.04882 3.34171 7.04882 3.65829 6.85355 3.85355L3.70711 7H12.5C12.7761 7 13 7.22386 13 7.5C13 7.77614 12.7761 8 12.5 8H3.70711L6.85355 11.1464C7.04882 11.3417 7.04882 11.6583 6.85355 11.8536C6.65829 12.0488 6.34171 12.0488 6.14645 11.8536L2.14645 7.85355C1.95118 7.65829 1.95118 7.34171 2.14645 7.14645L6.14645 3.14645C6.34171 2.95118 6.65829 2.95118 6.85355 3.14645Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
import {
  useWorkout,
  useStartWorkout,
  useCompleteWorkout,
  useSkipWorkout,
  useLogSet,
  useUnlogSet,
  useAddSet,
  useRemoveSet,
} from '../hooks/useWorkout';
import type { LogWorkoutSetInput } from '@lifting/shared';

export function WorkoutPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workoutId = Number(id);

  const { data: workout, isLoading, error } = useWorkout(workoutId);
  const startMutation = useStartWorkout();
  const completeMutation = useCompleteWorkout();
  const skipWorkoutMutation = useSkipWorkout();
  const logSetMutation = useLogSet();
  const unlogSetMutation = useUnlogSet();
  const addSetMutation = useAddSet();
  const removeSetMutation = useRemoveSet();

  const handleStart = (): void => {
    startMutation.mutate(workoutId);
  };

  const handleComplete = (): void => {
    completeMutation.mutate(workoutId);
  };

  const handleSkipWorkout = (): void => {
    skipWorkoutMutation.mutate(workoutId);
  };

  const handleLogSet = (setId: number, data: LogWorkoutSetInput): void => {
    logSetMutation.mutate({ setId, data, workoutId });
  };

  const handleUnlogSet = (setId: number): void => {
    unlogSetMutation.mutate({ setId, workoutId });
  };

  const handleAddSet = (exerciseId: number): void => {
    addSetMutation.mutate({ workoutId, exerciseId });
  };

  const handleRemoveSet = (exerciseId: number): void => {
    removeSetMutation.mutate({ workoutId, exerciseId });
  };

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
          <Button variant="ghost" onClick={() => void navigate(-1)}>
            <ArrowLeftIcon /> Back
          </Button>
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
          <Button variant="ghost" onClick={() => void navigate(-1)}>
            <ArrowLeftIcon /> Back
          </Button>
          <Box
            p="4"
            style={{
              backgroundColor: 'var(--gray-2)',
              borderRadius: 'var(--radius-3)',
            }}
          >
            <Text color="gray">Workout not found.</Text>
          </Box>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Flex align="center" gap="2">
          <Button variant="ghost" onClick={() => void navigate(-1)}>
            <ArrowLeftIcon />
          </Button>
          <Heading size="6">{workout.plan_day_name}</Heading>
        </Flex>
        <WorkoutView
          workout={workout}
          onSetLogged={handleLogSet}
          onSetUnlogged={handleUnlogSet}
          onAddSet={handleAddSet}
          onRemoveSet={handleRemoveSet}
          onWorkoutStarted={handleStart}
          onWorkoutCompleted={handleComplete}
          onWorkoutSkipped={handleSkipWorkout}
          isStarting={startMutation.isPending}
          isCompleting={completeMutation.isPending}
          isSkipping={skipWorkoutMutation.isPending}
        />
      </Flex>
    </Container>
  );
}
