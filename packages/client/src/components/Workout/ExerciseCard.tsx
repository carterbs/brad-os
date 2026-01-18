import { Card, Flex, Text, Badge, Box } from '@radix-ui/themes';
import type { WorkoutStatus, LogWorkoutSetInput } from '@lifting/shared';
import type { WorkoutExerciseWithSets } from '../../api/workoutApi';
import { SetRow } from './SetRow';

interface ExerciseCardProps {
  exercise: WorkoutExerciseWithSets;
  workoutStatus: WorkoutStatus;
  activeSetId: number | null;
  onSetLogged: (setId: number, data: LogWorkoutSetInput) => void;
  onSetUnlogged: (setId: number) => void;
}

function formatRestTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export function ExerciseCard({
  exercise,
  workoutStatus,
  activeSetId,
  onSetLogged,
  onSetUnlogged,
}: ExerciseCardProps): JSX.Element {
  const completedSets = exercise.sets.filter(
    (s) => s.status === 'completed'
  ).length;
  const totalSets = exercise.sets.length;
  const allComplete = completedSets === totalSets;

  return (
    <Card data-testid={`exercise-card-${exercise.exercise_id}`}>
      {/* Exercise header */}
      <Flex justify="between" align="center" mb="3">
        <Box>
          <Text size="4" weight="bold">
            {exercise.exercise_name}
          </Text>
          <Text size="2" color="gray" as="p">
            Rest: {formatRestTime(exercise.rest_seconds)}
          </Text>
        </Box>
        <Badge
          color={allComplete ? 'green' : 'gray'}
          size="2"
          data-testid="progress-badge"
        >
          {completedSets}/{totalSets} sets
        </Badge>
      </Flex>

      {/* Sets list */}
      <Flex direction="column" gap="2">
        {exercise.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            workoutStatus={workoutStatus}
            isActive={set.id === activeSetId}
            onLog={(data) => onSetLogged(set.id, data)}
            onUnlog={() => onSetUnlogged(set.id)}
          />
        ))}
      </Flex>
    </Card>
  );
}
