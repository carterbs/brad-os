import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button, Flex, Text, Heading, Box } from '@radix-ui/themes';

interface ActivePlanWarningDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  affectedWorkoutCount?: number;
}

export function ActivePlanWarningDialog({
  open,
  onConfirm,
  onCancel,
  affectedWorkoutCount,
}: ActivePlanWarningDialogProps): JSX.Element | null {
  if (!open) {
    return null;
  }

  const workoutText =
    affectedWorkoutCount === 1 ? 'future workout' : 'future workout(s)';

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            position: 'fixed',
            inset: 0,
          }}
          data-testid="active-plan-warning-overlay"
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
            maxWidth: '450px',
          }}
          data-testid="active-plan-warning-dialog"
        >
          <AlertDialog.Title asChild>
            <Heading size="4" mb="2">
              Edit Active Plan
            </Heading>
          </AlertDialog.Title>

          <AlertDialog.Description asChild>
            <Box>
              <Text color="gray" as="p" mb="3">
                This plan has an active mesocycle. Any changes you make will
                only apply to <strong>future workouts</strong>.
              </Text>

              <Box
                mb="3"
                style={{
                  paddingLeft: 'var(--space-4)',
                  listStyle: 'disc',
                }}
                asChild
              >
                <ul>
                <li>
                  <Text size="2" color="gray">
                    Past workouts will remain unchanged
                  </Text>
                </li>
                <li>
                  <Text size="2" color="gray">
                    Your current in-progress workout will not be affected
                  </Text>
                </li>
                <li>
                  <Text size="2" color="gray">
                    Any logged sets will be preserved
                  </Text>
                </li>
                </ul>
              </Box>

              {affectedWorkoutCount !== undefined && (
                <Text as="p" size="2" mb="3">
                  This change will affect approximately{' '}
                  <strong>
                    {affectedWorkoutCount} {workoutText}
                  </strong>
                  .
                </Text>
              )}
            </Box>
          </AlertDialog.Description>

          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel asChild>
              <Button variant="soft" color="gray" onClick={onCancel}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button onClick={onConfirm}>Continue Editing</Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
