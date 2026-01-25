import { useNavigate } from 'react-router-dom';
import { Box, Flex, Text, Button } from '@radix-ui/themes';
import type { MeditationSessionRecord } from '@brad-os/shared';

interface MeditationCardProps {
  lastSession: MeditationSessionRecord | null | undefined;
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

function getStatusMessage(daysSince: number): string {
  if (daysSince === 0) {
    return 'Meditated today!';
  }
  if (daysSince === 1) {
    return 'Last meditated yesterday';
  }
  return `${daysSince} days ago`;
}

export function MeditationCard({ lastSession, isLoading }: MeditationCardProps): JSX.Element {
  const navigate = useNavigate();

  const handleClick = (): void => {
    void navigate('/meditation');
  };

  if (isLoading) {
    return (
      <Box
        p="4"
        style={{
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          border: '1px solid var(--purple-6)',
          borderRadius: '12px',
        }}
      >
        <Text size="2" color="gray">Loading meditation data...</Text>
      </Box>
    );
  }

  const daysSince = lastSession ? getDaysSinceDate(lastSession.completedAt) : null;
  const statusMessage = daysSince !== null ? getStatusMessage(daysSince) : null;
  const lastDuration = lastSession ? Math.floor(lastSession.actualDurationSeconds / 60) : null;

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        border: '1px solid var(--purple-6)',
        borderRadius: '12px',
      }}
    >
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <MeditationIcon />
          <Text size="3" weight="medium">Meditation</Text>
        </Flex>

        {lastSession !== null && lastSession !== undefined && statusMessage !== null ? (
          <Box>
            <Text size="2" color="gray" style={{ display: 'block' }}>
              {statusMessage}
            </Text>
            {lastDuration !== null && (
              <Text size="1" color="gray">
                Last session: {lastDuration} min
              </Text>
            )}
          </Box>
        ) : (
          <Text size="2" color="gray">No meditation sessions yet</Text>
        )}

        <Button
          size="2"
          variant="soft"
          onClick={handleClick}
          style={{ marginTop: '4px' }}
        >
          Meditate
        </Button>
      </Flex>
    </Box>
  );
}

function MeditationIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--purple-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
