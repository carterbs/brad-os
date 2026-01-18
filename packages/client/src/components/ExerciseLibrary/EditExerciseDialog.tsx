import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Box, Button, Flex, Text, TextField, Heading } from '@radix-ui/themes';
import type { Exercise } from '@lifting/shared';
import { useUpdateExercise } from '../../hooks/useExercises';

interface EditExerciseDialogProps {
  exercise: Exercise | null;
  onClose: () => void;
}

export function EditExerciseDialog({
  exercise,
  onClose,
}: EditExerciseDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const [weightIncrement, setWeightIncrement] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateExercise = useUpdateExercise();

  // Reset form when exercise changes
  useEffect(() => {
    if (exercise) {
      setName(exercise.name);
      setWeightIncrement(exercise.weight_increment.toString());
      setValidationError(null);
    }
  }, [exercise]);

  const handleSave = (): void => {
    if (!exercise) return;

    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Exercise name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setValidationError('Exercise name must be 100 characters or less');
      return;
    }

    // Validate weight increment
    const increment = parseFloat(weightIncrement);
    if (isNaN(increment) || increment <= 0) {
      setValidationError('Weight increment must be a positive number');
      return;
    }

    setValidationError(null);

    updateExercise.mutate(
      {
        id: exercise.id,
        data: { name: trimmedName, weight_increment: increment },
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Dialog.Root open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            position: 'fixed',
            inset: 0,
          }}
        />
        <Dialog.Content
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
          data-testid="edit-exercise-dialog"
        >
          <Dialog.Title asChild>
            <Heading size="4" mb="4">Edit Exercise</Heading>
          </Dialog.Title>

          <Flex direction="column" gap="4">
            <Box>
              <Text as="label" size="2" weight="medium" htmlFor="edit-exercise-name">
                Exercise Name
              </Text>
              <TextField.Root
                id="edit-exercise-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationError) setValidationError(null);
                }}
              />
            </Box>

            <Box>
              <Text as="label" size="2" weight="medium" htmlFor="edit-weight-increment">
                Weight Increment (lbs)
              </Text>
              <TextField.Root
                id="edit-weight-increment"
                type="number"
                min="0.5"
                step="0.5"
                value={weightIncrement}
                onChange={(e) => {
                  setWeightIncrement(e.target.value);
                  if (validationError) setValidationError(null);
                }}
              />
            </Box>

            {validationError && (
              <Text color="red" size="2">
                {validationError}
              </Text>
            )}

            {updateExercise.isError && (
              <Text color="red" size="2">
                {updateExercise.error.message}
              </Text>
            )}

            <Flex gap="3" justify="end">
              <Dialog.Close asChild>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button onClick={handleSave} disabled={updateExercise.isPending}>
                {updateExercise.isPending ? 'Saving...' : 'Save'}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
