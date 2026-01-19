import { AlertDialog, Button, Flex, Text } from '@radix-ui/themes';

interface CompleteMesocycleDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isCompleting: boolean;
  progressPercent: number;
  completedWorkouts: number;
  totalWorkouts: number;
}

export function CompleteMesocycleDialog({
  open,
  onClose,
  onConfirm,
  isCompleting,
  progressPercent,
  completedWorkouts,
  totalWorkouts,
}: CompleteMesocycleDialogProps): JSX.Element {
  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialog.Content maxWidth="400px" data-testid="complete-mesocycle-dialog">
        <AlertDialog.Title>Complete Mesocycle</AlertDialog.Title>

        <AlertDialog.Description>
          <Text color="gray" as="p">
            Are you sure you want to complete this mesocycle?
          </Text>
        </AlertDialog.Description>

        {progressPercent < 100 && (
          <Text color="orange" size="2" mt="2" as="p">
            Warning: Only {completedWorkouts} of {totalWorkouts} workouts completed ({progressPercent}%).
          </Text>
        )}

        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" data-testid="cancel-complete-button">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button
            color="green"
            onClick={onConfirm}
            disabled={isCompleting}
            data-testid="confirm-complete-button"
          >
            {isCompleting ? 'Completing...' : 'Complete'}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
