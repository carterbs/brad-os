import { useState, useEffect, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Box, Button, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import type { WorkoutSet, LogWorkoutSetInput } from '@lifting/shared';

interface LogSetModalProps {
  open: boolean;
  set: WorkoutSet | null;
  onSave: (data: LogWorkoutSetInput) => void;
  onClose: () => void;
}

export function LogSetModal({
  open,
  set,
  onSave,
  onClose,
}: LogSetModalProps): JSX.Element {
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill values when modal opens
  useEffect(() => {
    if (open && set) {
      // Use actual values if re-logging, otherwise use target values
      const defaultReps = set.actual_reps ?? set.target_reps;
      const defaultWeight = set.actual_weight ?? set.target_weight;

      setReps(String(defaultReps));
      setWeight(String(defaultWeight));
      setError(null);
    }
  }, [open, set]);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();

    const repsNum = parseInt(reps, 10);
    const weightNum = parseFloat(weight);

    // Validate
    if (isNaN(repsNum) || repsNum < 0) {
      setError('Reps must be a non-negative number');
      return;
    }

    if (isNaN(weightNum) || weightNum < 0) {
      setError('Weight must be a non-negative number');
      return;
    }

    onSave({
      actual_reps: repsNum,
      actual_weight: weightNum,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  if (!set) return <></>;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="dialog-overlay"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            position: 'fixed',
            inset: 0,
          }}
        />
        <Dialog.Content
          className="dialog-content"
          data-testid="log-set-modal"
          style={{
            backgroundColor: 'var(--color-background)',
            borderRadius: 'var(--radius-3)',
            padding: '24px',
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90vw',
            maxWidth: '400px',
            maxHeight: '85vh',
            overflow: 'auto',
          }}
          onKeyDown={handleKeyDown}
        >
          <Dialog.Title asChild>
            <Heading size="5" mb="4" as="h2">
              Log Set {set.set_number}
            </Heading>
          </Dialog.Title>

          <Dialog.Description asChild>
            <Text size="2" color="gray" mb="4" as="p">
              Target: {set.target_reps} reps @ {set.target_weight} lbs
            </Text>
          </Dialog.Description>

          <form onSubmit={handleSubmit} noValidate>
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="medium" mb="1">
                  Reps
                </Text>
                <TextField.Root
                  data-testid="reps-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  placeholder="Enter reps"
                  size="3"
                />
              </Box>

              <Box>
                <Text as="label" size="2" weight="medium" mb="1">
                  Weight (lbs)
                </Text>
                <TextField.Root
                  data-testid="weight-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Enter weight"
                  size="3"
                />
              </Box>

              {error !== null && (
                <Text color="red" size="2" data-testid="error-message">
                  {error}
                </Text>
              )}

              <Flex gap="3" mt="2" justify="end">
                <Dialog.Close asChild>
                  <Button variant="soft" color="gray" data-testid="cancel-button">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" data-testid="save-button">
                  Save
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
