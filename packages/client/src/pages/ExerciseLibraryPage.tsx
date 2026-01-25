import { useState } from 'react';
import { Container, Flex, Heading } from '@radix-ui/themes';
import type { Exercise } from '@brad-os/shared';
import {
  ExerciseList,
  AddExerciseForm,
  DeleteExerciseDialog,
} from '../components/ExerciseLibrary';

export function ExerciseLibraryPage(): JSX.Element {
  const [deletingExercise, setDeletingExercise] = useState<Exercise | null>(null);

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Exercise Library</Heading>

        <AddExerciseForm />

        <ExerciseList
          onDelete={setDeletingExercise}
        />

        <DeleteExerciseDialog
          exercise={deletingExercise}
          onClose={() => setDeletingExercise(null)}
        />
      </Flex>
    </Container>
  );
}
