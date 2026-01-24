import { useState } from 'react';
import { AlertDialog, Button, Flex, Text } from '@radix-ui/themes';
import { requestNotificationPermission } from '../../utils/notifications';
import { initializeNotifications } from '../../utils/timerNotifications';

interface NotificationPromptProps {
  open: boolean;
  onClose: () => void;
  onEnabled?: () => void;
}

export function NotificationPrompt({
  open,
  onClose,
  onEnabled,
}: NotificationPromptProps): JSX.Element {
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async (): Promise<void> => {
    setIsEnabling(true);
    setError(null);

    try {
      // Request permission (works without server config)
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        setError(`Notification permission ${permission}. Please allow notifications to continue.`);
        setIsEnabling(false);
        return;
      }

      // Try to set up push subscription for lock-screen delivery (optional)
      try {
        const response = await fetch('/api/notifications/vapid-key');
        if (response.ok) {
          const data = await response.json() as { publicKey: string };
          await initializeNotifications(data.publicKey);
        }
      } catch {
        // Push setup failed - local notifications will still work
      }

      // Success
      setIsEnabling(false);
      onEnabled?.();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsEnabling(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialog.Content maxWidth="400px" data-testid="notification-prompt-dialog">
        <AlertDialog.Title>Enable Rest Timer Notifications?</AlertDialog.Title>

        <AlertDialog.Description>
          <Text color="gray" as="p">
            Get notified when your rest timer completes, even when your phone is locked.
            This helps you know when it&apos;s time for your next set.
          </Text>
        </AlertDialog.Description>

        {error !== null && error !== '' && (
          <Text color="red" size="2" mt="2" as="p" data-testid="notification-prompt-error">
            {error}
          </Text>
        )}

        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" disabled={isEnabling}>
              Not Now
            </Button>
          </AlertDialog.Cancel>
          <Button
            color="green"
            onClick={() => { void handleEnable(); }}
            disabled={isEnabling}
            data-testid="enable-notifications-button"
          >
            {isEnabling ? 'Enabling...' : 'Enable Notifications'}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
