import { AlertDialog, Button, Flex, Text } from '@radix-ui/themes';
import type { Plan } from '@brad-os/shared';
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
      <AlertDialog.Content maxWidth="400px" data-testid="delete-confirm-dialog">
        <AlertDialog.Title>Delete Plan</AlertDialog.Title>

        <AlertDialog.Description>
          <Text color="gray" as="p">
            Are you sure you want to delete <strong>{plan?.name}</strong>?
            This action cannot be undone.
          </Text>
        </AlertDialog.Description>

        {deletePlan.isError && (
          <Text
            color="red"
            size="2"
            mt="2"
            as="p"
            data-testid="delete-error"
          >
            {isConflictError
              ? 'Cannot delete plan with an active mesocycle. Complete or cancel the mesocycle first.'
              : deletePlan.error.message}
          </Text>
        )}

        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
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
    </AlertDialog.Root>
  );
}
