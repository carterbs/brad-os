import { useState } from 'react';
import { Box, Button, Callout, Card, Flex, Text } from '@radix-ui/themes';
import { useNotificationPermission } from '../../hooks/useNotificationPermission';
import { usePwaInstallStatus } from '../../hooks/usePwaInstallStatus';
import { initializeNotifications, scheduleTimerNotification, scheduleLocalNotification } from '../../utils/timerNotifications';
import { getSubscription } from '../../utils/subscriptionStorage';

export function NotificationSettings(): JSX.Element {
  const { isGranted, canRequest, isDenied } = useNotificationPermission();
  const { isInstalled, canInstall } = usePwaInstallStatus();

  const [isEnabling, setIsEnabling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  const hasSubscription = getSubscription() !== null;
  const isFullyEnabled = isGranted;
  const hasPushSubscription = isGranted && hasSubscription;

  const handleEnable = async (): Promise<void> => {
    setIsEnabling(true);
    setError(null);

    try {
      // Request permission first (works without server config)
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        throw new Error(`Permission ${result}`);
      }

      // Try to set up push subscription for lock-screen delivery (optional)
      try {
        const response = await fetch('/api/notifications/vapid-key');
        if (response.ok) {
          const { publicKey } = (await response.json()) as { publicKey: string };
          await initializeNotifications(publicKey);
        }
      } catch {
        // Push setup failed - local notifications will still work
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsEnabling(false);
    }
  };

  const handleTest = async (): Promise<void> => {
    setIsTesting(true);
    setError(null);
    setTestSent(false);

    try {
      // Schedule local notification (always works with permission)
      scheduleLocalNotification(5000, 'Test Exercise', 1);

      // Also try push if subscription available
      if (hasPushSubscription) {
        await scheduleTimerNotification(5000, 'Test Exercise', 1).catch(() => {
          // Push failed - local will still fire
        });
      }
      setTestSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <Flex direction="column" gap="4">
        <Text weight="bold" size="3">Push Notifications</Text>

        {/* PWA Install Banner - Show prominently when not installed */}
        {canInstall && (
          <Callout.Root color="blue">
            <Callout.Icon>
              <InfoIcon />
            </Callout.Icon>
            <Callout.Text>
              <Text weight="bold" as="p" mb="2">Install for Lock Screen Notifications</Text>
              <Text as="p" size="2" color="gray">
                To receive notifications when your phone is locked, install this app:
              </Text>
              <Box mt="2">
                <Text as="p" size="2">1. Tap the Share button (box with arrow) in Safari</Text>
                <Text as="p" size="2">2. Scroll down and tap &quot;Add to Home Screen&quot;</Text>
                <Text as="p" size="2">3. Tap &quot;Add&quot;</Text>
                <Text as="p" size="2">4. Open the app from your home screen</Text>
              </Box>
            </Callout.Text>
          </Callout.Root>
        )}

        {/* Status Indicator */}
        <Flex align="center" gap="2">
          <StatusIcon status={getStatus(isFullyEnabled, isDenied, canInstall)} />
          <Text size="2">
            {getStatusText(isFullyEnabled, isDenied, canRequest, canInstall, isInstalled)}
          </Text>
        </Flex>

        {/* Permission Denied Recovery Instructions */}
        {isDenied && (
          <Callout.Root color="red">
            <Callout.Icon>
              <AlertIcon />
            </Callout.Icon>
            <Callout.Text>
              <Text weight="bold" as="p" mb="2">Notifications Blocked</Text>
              <Text as="p" size="2" color="gray">
                To enable notifications:
              </Text>
              <Box mt="2">
                <Text as="p" size="2">1. Open iOS Settings</Text>
                <Text as="p" size="2">2. Scroll down and tap &quot;Lifting&quot;</Text>
                <Text as="p" size="2">3. Tap &quot;Notifications&quot;</Text>
                <Text as="p" size="2">4. Toggle &quot;Allow Notifications&quot; on</Text>
              </Box>
            </Callout.Text>
          </Callout.Root>
        )}

        {/* Error Display */}
        {error !== null && (
          <Callout.Root color="red">
            <Callout.Icon>
              <AlertIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Test Sent Confirmation */}
        {testSent && (
          <Callout.Root color="green">
            <Callout.Icon>
              <CheckIcon />
            </Callout.Icon>
            <Callout.Text>Test notification scheduled! It will arrive in 5 seconds.</Callout.Text>
          </Callout.Root>
        )}

        {/* Action Buttons */}
        <Flex gap="2">
          {canRequest && (
            <Button
              onClick={() => { void handleEnable(); }}
              disabled={isEnabling}
              data-testid="enable-notifications-btn"
            >
              {isEnabling ? 'Enabling...' : 'Enable Notifications'}
            </Button>
          )}

          {isFullyEnabled && (
            <Button
              variant="soft"
              onClick={() => { void handleTest(); }}
              disabled={isTesting}
              data-testid="test-notification-btn"
            >
              {isTesting ? 'Sending...' : 'Send Test Notification'}
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

type StatusType = 'enabled' | 'warning' | 'error';

function getStatus(isFullyEnabled: boolean, isDenied: boolean, canInstall: boolean): StatusType {
  if (isDenied) return 'error';
  if (canInstall) return 'warning';
  if (isFullyEnabled) return 'enabled';
  return 'warning';
}

function getStatusText(
  isFullyEnabled: boolean,
  isDenied: boolean,
  canRequest: boolean,
  canInstall: boolean,
  isInstalled: boolean
): string {
  if (isDenied) return 'Notifications blocked';
  if (isFullyEnabled) return 'Notifications enabled';
  if (canInstall) return 'Not installed as app';
  if (canRequest) return 'Notifications not set up';
  if (!isInstalled) return 'Not installed as app';
  return 'Notifications not set up';
}

function StatusIcon({ status }: { status: StatusType }): JSX.Element {
  if (status === 'enabled') {
    return <CheckIcon color="var(--green-9)" />;
  }
  if (status === 'error') {
    return <CrossIcon color="var(--red-9)" />;
  }
  return <WarningIcon color="var(--yellow-9)" />;
}

function CheckIcon({ color }: { color?: string }): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function CrossIcon({ color }: { color?: string }): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function WarningIcon({ color }: { color?: string }): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function InfoIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function AlertIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
