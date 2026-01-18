import { Box, Flex, Text, Spinner } from '@radix-ui/themes';
import type { Exercise } from '@lifting/shared';
import { useExercises } from '../../hooks/useExercises';
import { ExerciseListItem } from './ExerciseListItem';

interface ExerciseListProps {
  onEdit?: (exercise: Exercise) => void;
  onDelete?: (exercise: Exercise) => void;
}

export function ExerciseList({
  onEdit,
  onDelete,
}: ExerciseListProps): JSX.Element {
  const { data: exercises, isLoading, error } = useExercises();

  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="6">
        <Spinner size="3" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box p="4" style={{ backgroundColor: 'var(--red-2)', borderRadius: 'var(--radius-3)' }}>
        <Text color="red">Error loading exercises: {error.message}</Text>
      </Box>
    );
  }

  if (!exercises || exercises.length === 0) {
    return (
      <Box p="4" style={{ backgroundColor: 'var(--gray-2)', borderRadius: 'var(--radius-3)' }}>
        <Text color="gray">No exercises found. Add your first exercise above!</Text>
      </Box>
    );
  }

  return (
    <Flex direction="column" gap="2" data-testid="exercise-list">
      {exercises.map((exercise) => (
        <ExerciseListItem
          key={exercise.id}
          exercise={exercise}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </Flex>
  );
}
