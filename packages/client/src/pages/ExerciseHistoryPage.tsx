import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Flex, Heading, Text, Box, Button, IconButton, Spinner, Badge } from '@radix-ui/themes';
import { useExerciseHistory, useExercise } from '../hooks/useExercises';
import { WeightProgressionChart } from '../components/ExerciseHistory/WeightProgressionChart';
import { SetHistoryTable } from '../components/ExerciseHistory/SetHistoryTable';
import { EditExerciseDialog } from '../components/ExerciseLibrary/EditExerciseDialog';

export function ExerciseHistoryPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exerciseId = parseInt(id ?? '', 10);
  const { data: history, isLoading, error } = useExerciseHistory(exerciseId);
  const { data: exercise } = useExercise(exerciseId);
  const [isEditOpen, setIsEditOpen] = useState(false);

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
          <Button variant="soft" color="gray" onClick={() => void navigate('/lifting/exercises')}>
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
          onClick={() => void navigate('/lifting/exercises')}
        >
          &larr; Back to Exercises
        </Button>

        <Flex align="center" gap="3">
          <Heading size="6">{history.exercise_name}</Heading>
          <IconButton
            size="2"
            variant="ghost"
            color="gray"
            aria-label="Edit exercise"
            onClick={() => setIsEditOpen(true)}
          >
            <EditIcon />
          </IconButton>
        </Flex>

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

      <EditExerciseDialog
        exercise={isEditOpen ? (exercise ?? null) : null}
        onClose={() => setIsEditOpen(false)}
      />
    </Container>
  );
}

function EditIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
