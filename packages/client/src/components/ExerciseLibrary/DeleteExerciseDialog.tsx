import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button, Flex, Text, Heading } from '@radix-ui/themes';
import type { Exercise } from '@lifting/shared';
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
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            position: 'fixed',
            inset: 0,
          }}
        />
        <AlertDialog.Content
          style={{
            backgroundColor: 'var(--gray-1)',
            borderRadius: 'var(--radius-3)',
            padding: 'var(--space-5)',
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90vw',
            maxWidth: '400px',
          }}
          data-testid="delete-exercise-dialog"
        >
          <AlertDialog.Title asChild>
            <Heading size="4" mb="2">Delete Exercise</Heading>
          </AlertDialog.Title>

          <AlertDialog.Description asChild>
            <Text color="gray" mb="4" as="p">
              Are you sure you want to delete <strong>{exercise?.name}</strong>? This action cannot be undone.
            </Text>
          </AlertDialog.Description>

          {deleteExercise.isError && (
            <Text color="red" size="2" mb="4" as="p">
              {deleteExercise.error.message}
            </Text>
          )}

          <Flex gap="3" justify="end">
            <AlertDialog.Cancel asChild>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button color="red" onClick={handleDelete} disabled={deleteExercise.isPending}>
              {deleteExercise.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
