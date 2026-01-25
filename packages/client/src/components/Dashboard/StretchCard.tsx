import { useNavigate } from 'react-router-dom';
import { Box, Flex, Text, Button } from '@radix-ui/themes';
import type { StretchSessionRecord } from '@brad-os/shared';

interface StretchCardProps {
  lastSession: StretchSessionRecord | null | undefined;
  isLoading: boolean;
}

function getDaysSinceDate(dateString: string): number {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getStatusMessage(daysSince: number): { message: string; isUrgent: boolean } {
  if (daysSince === 0) {
    return { message: 'Stretched today!', isUrgent: false };
  }
  if (daysSince === 1) {
    return { message: 'Last stretched yesterday', isUrgent: false };
  }
  if (daysSince <= 2) {
    return { message: `${daysSince} days ago`, isUrgent: false };
  }
  return { message: `${daysSince} days ago - time to stretch!`, isUrgent: true };
}

export function StretchCard({ lastSession, isLoading }: StretchCardProps): JSX.Element {
  const navigate = useNavigate();

  const handleClick = (): void => {
    void navigate('/stretch');
  };

  if (isLoading) {
    return (
      <Box
        p="4"
        style={{
          backgroundColor: 'rgba(20, 184, 166, 0.1)',
          border: '1px solid var(--teal-6)',
          borderRadius: '12px',
        }}
      >
        <Text size="2" color="gray">Loading stretch data...</Text>
      </Box>
    );
  }

  const daysSince = lastSession ? getDaysSinceDate(lastSession.completedAt) : null;
  const status = daysSince !== null ? getStatusMessage(daysSince) : null;

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        border: `1px solid ${status?.isUrgent === true ? 'var(--orange-7)' : 'var(--teal-6)'}`,
        borderRadius: '12px',
      }}
    >
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <StretchIcon />
          <Text size="3" weight="medium">Stretch</Text>
        </Flex>

        {lastSession !== null && lastSession !== undefined && status !== null ? (
          <Text size="2" color={status.isUrgent === true ? 'orange' : 'gray'}>
            {status.message}
          </Text>
        ) : (
          <Text size="2" color="gray">No stretch sessions yet</Text>
        )}

        <Button
          size="2"
          variant="soft"
          onClick={handleClick}
          style={{ marginTop: '4px' }}
        >
          Stretch Now
        </Button>
      </Flex>
    </Box>
  );
}

function StretchIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--teal-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="4" r="2" />
      <path d="M22 14l-4-4-3 3" />
      <path d="M15 13l-5 5-4-4" />
      <path d="M2 18l4 4" />
      <path d="M18 10l-5 5" />
    </svg>
  );
}
