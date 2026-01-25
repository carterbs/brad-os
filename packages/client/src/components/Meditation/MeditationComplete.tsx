/**
 * Meditation Complete Component
 *
 * Session summary displayed after completing a meditation session.
 * Shows planned duration, actual duration, and completion status.
 * Saves the session record to the server on mount.
 */

import { useEffect, useRef } from 'react';
import { Box, Flex, Text, Heading, Button, Card } from '@radix-ui/themes';
import type { MeditationDuration } from '@brad-os/shared';
import { useSaveMeditationSession } from '../../hooks/useMeditationHistory';

interface MeditationCompleteProps {
  plannedDurationMinutes: MeditationDuration;
  actualDurationSeconds: number;
  completedFully: boolean;
  onDone: () => void;
}

export function MeditationComplete({
  plannedDurationMinutes,
  actualDurationSeconds,
  completedFully,
  onDone,
}: MeditationCompleteProps): JSX.Element {
  const saveSession = useSaveMeditationSession();
  const hasSavedRef = useRef(false);

  // Save session on mount (only once)
  useEffect(() => {
    if (hasSavedRef.current) {
      return;
    }

    hasSavedRef.current = true;

    saveSession.mutate({
      completedAt: new Date().toISOString(),
      sessionType: 'basic-breathing',
      plannedDurationSeconds: plannedDurationMinutes * 60,
      actualDurationSeconds,
      completedFully,
    });
  }, [plannedDurationMinutes, actualDurationSeconds, completedFully, saveSession]);

  // Format duration as minutes and seconds
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) {
      return `${secs}s`;
    }
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <Box style={{ padding: '16px' }}>
      <Flex direction="column" align="center" gap="4">
        {/* Success Icon */}
        <Box
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: 'var(--green-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon />
        </Box>

        <Heading size="6">Session Complete!</Heading>

        {/* Stats Summary */}
        <Flex gap="4" wrap="wrap" justify="center">
          <StatCard
            label="Planned"
            value={`${plannedDurationMinutes}m`}
            subtext="duration"
          />
          <StatCard
            label="Actual"
            value={formatDuration(actualDurationSeconds)}
            subtext={
              completedFully
                ? 'completed fully'
                : 'ended early'
            }
          />
        </Flex>

        {/* Completion Status */}
        <Text size="2" color={completedFully ? 'green' : 'gray'}>
          {completedFully
            ? 'Great job completing your full session!'
            : 'Any meditation is beneficial. Well done!'}
        </Text>

        {/* Done Button */}
        <Button size="3" onClick={onDone} style={{ marginTop: '24px' }}>
          Done
        </Button>
      </Flex>
    </Box>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subtext: string;
}

function StatCard({ label, value, subtext }: StatCardProps): JSX.Element {
  return (
    <Card size="2" style={{ minWidth: '140px', textAlign: 'center' }}>
      <Text size="1" color="gray" style={{ display: 'block' }}>
        {label}
      </Text>
      <Text size="6" weight="bold" style={{ display: 'block' }}>
        {value}
      </Text>
      <Text size="1" color="gray" style={{ display: 'block' }}>
        {subtext}
      </Text>
    </Card>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--green-11)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
