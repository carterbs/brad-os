import { useParams, useNavigate } from 'react-router-dom';
import { Container, Flex, Heading, Text, Box, Button, Spinner, Badge } from '@radix-ui/themes';
import { useExerciseHistory } from '../hooks/useExercises';
import { WeightProgressionChart } from '../components/ExerciseHistory/WeightProgressionChart';
import { SetHistoryTable } from '../components/ExerciseHistory/SetHistoryTable';

export function ExerciseHistoryPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exerciseId = parseInt(id ?? '', 10);
  const { data: history, isLoading, error } = useExerciseHistory(exerciseId);

  if (isLoading) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4" align="center" justify="center" py="9">
          <Spinner size="3" />
          <Text color="gray">Loading history...</Text>
        </Flex>
      </Container>
    );
  }

  if (error != null || !history) {
    return (
      <Container size="2" p="4">
        <Flex direction="column" gap="4">
          <Button variant="soft" color="gray" onClick={() => void navigate('/exercises')}>
            &larr; Back to Exercises
          </Button>
          <Box p="4" style={{ backgroundColor: 'var(--red-2)', borderRadius: 'var(--radius-3)' }}>
            <Text color="red">{error ? 'Failed to load exercise history' : 'Exercise not found'}</Text>
          </Box>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Button
          variant="soft"
          color="gray"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => void navigate('/exercises')}
        >
          &larr; Back to Exercises
        </Button>

        <Heading size="6">{history.exercise_name}</Heading>

        {history.personal_record && (
          <Box
            p="3"
            style={{
              backgroundColor: 'var(--yellow-2)',
              borderRadius: 'var(--radius-3)',
              border: '1px solid var(--yellow-5)',
            }}
          >
            <Flex align="center" gap="2" wrap="wrap">
              <Badge color="yellow" variant="solid" size="2">PR</Badge>
              <Text weight="bold" size="3">
                {history.personal_record.weight} lbs x {history.personal_record.reps} reps
              </Text>
              <Text size="2" color="gray">
                {new Date(history.personal_record.date).toLocaleDateString()}
              </Text>
            </Flex>
          </Box>
        )}

        {history.entries.length === 0 ? (
          <Box
            p="4"
            style={{ backgroundColor: 'var(--gray-2)', borderRadius: 'var(--radius-3)' }}
          >
            <Text color="gray">No history yet</Text>
          </Box>
        ) : (
          <>
            <WeightProgressionChart entries={history.entries} />
            <SetHistoryTable entries={history.entries} />
          </>
        )}
      </Flex>
    </Container>
  );
}
