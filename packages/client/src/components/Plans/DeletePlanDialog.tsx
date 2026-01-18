import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button, Flex, Text, Heading } from '@radix-ui/themes';
import type { Plan } from '@lifting/shared';
import { useDeletePlan } from '../../hooks/usePlans';
import { ConflictError } from '../../api/exerciseApi';

interface DeletePlanDialogProps {
  plan: Plan | null;
  onClose: () => void;
}

export function DeletePlanDialog({
  plan,
  onClose,
}: DeletePlanDialogProps): JSX.Element {
  const deletePlan = useDeletePlan();

  const handleDelete = (): void => {
    if (!plan) return;

    deletePlan.mutate(plan.id, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  const isConflictError = deletePlan.error instanceof ConflictError;

  return (
    <AlertDialog.Root
      open={plan !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            position: 'fixed',
            inset: 0,
          }}
          data-testid="delete-dialog-overlay"
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
          data-testid="delete-plan-dialog"
        >
          <AlertDialog.Title asChild>
            <Heading size="4" mb="2">
              Delete Plan
            </Heading>
          </AlertDialog.Title>

          <AlertDialog.Description asChild>
            <Text color="gray" mb="4" as="p">
              Are you sure you want to delete <strong>{plan?.name}</strong>?
              This action cannot be undone.
            </Text>
          </AlertDialog.Description>

          {deletePlan.isError && (
            <Text
              color="red"
              size="2"
              mb="4"
              as="p"
              data-testid="delete-error"
            >
              {isConflictError
                ? 'Cannot delete plan with an active mesocycle. Complete or cancel the mesocycle first.'
                : deletePlan.error.message}
            </Text>
          )}

          <Flex gap="3" justify="end">
            <AlertDialog.Cancel asChild>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              color="red"
              onClick={handleDelete}
              disabled={deletePlan.isPending || isConflictError}
              data-testid="confirm-delete-button"
            >
              {deletePlan.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
