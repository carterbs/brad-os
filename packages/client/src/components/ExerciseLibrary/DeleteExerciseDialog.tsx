import { AlertDialog, Button, Flex, Text } from '@radix-ui/themes';
import type { Exercise } from '@brad-os/shared';
import { useDeleteExercise } from '../../hooks/useExercises';

interface DeleteExerciseDialogProps {
  exercise: Exercise | null;
  onClose: () => void;
}

export function DeleteExerciseDialog({
  exercise,
  onClose,
}: DeleteExerciseDialogProps): JSX.Element {
  const deleteExercise = useDeleteExercise();

  const handleDelete = (): void => {
    if (!exercise) return;

    deleteExercise.mutate(exercise.id, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <AlertDialog.Root open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Content maxWidth="400px" data-testid="delete-exercise-dialog">
        <AlertDialog.Title>Delete Exercise</AlertDialog.Title>

        <AlertDialog.Description>
          <Text color="gray" as="p">
            Are you sure you want to delete <strong>{exercise?.name}</strong>? This action cannot be undone.
          </Text>
        </AlertDialog.Description>

        {deleteExercise.isError && (
          <Text color="red" size="2" mt="2" as="p">
            {deleteExercise.error.message}
          </Text>
        )}

        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button color="red" onClick={handleDelete} disabled={deleteExercise.isPending}>
            {deleteExercise.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
