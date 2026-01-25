/**
 * Stretch Complete Component
 *
 * Session summary displayed after completing a stretching session.
 * Shows total time, stretches completed, and skipped stretches.
 * Saves the session record to the server on mount.
 */

import { useEffect, useRef } from 'react';
import { Box, Flex, Text, Heading, Button, Card } from '@radix-ui/themes';
import type { CompletedStretch } from '@brad-os/shared';
import { BODY_REGION_LABELS } from '@brad-os/shared';
import { useSaveStretchSession } from '../../hooks/useStretchHistory';

interface StretchCompleteProps {
  completedStretches: CompletedStretch[];
  sessionStartedAt: number | null;
  onDone: () => void;
}

export function StretchComplete({
  completedStretches,
  sessionStartedAt,
  onDone,
}: StretchCompleteProps): JSX.Element {
  const saveSession = useSaveStretchSession();
  const hasSavedRef = useRef(false);

  // Calculate session duration
  const sessionDuration =
    sessionStartedAt !== null
      ? Math.floor((Date.now() - sessionStartedAt) / 1000)
      : 0;

  // Save session on mount (only once)
  useEffect(() => {
    if (hasSavedRef.current || completedStretches.length === 0) {
      return;
    }

    hasSavedRef.current = true;

    // Calculate regions stats
    const regionsCompleted = completedStretches.filter(
      (s) => s.skippedSegments < 2
    ).length;
    const regionsSkipped = completedStretches.filter(
      (s) => s.skippedSegments === 2
    ).length;

    saveSession.mutate({
      completedAt: new Date().toISOString(),
      totalDurationSeconds: sessionDuration,
      regionsCompleted,
      regionsSkipped,
      stretches: completedStretches,
    });
  }, [completedStretches, sessionDuration, saveSession]);

  // Format duration as minutes:seconds
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) {
      return `${secs}s`;
    }
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  // Count fully completed vs partially skipped
  const fullyCompleted = completedStretches.filter(
    (s) => s.skippedSegments === 0
  ).length;
  const partiallySkipped = completedStretches.filter(
    (s) => s.skippedSegments > 0
  ).length;

  // Total planned duration
  const plannedDuration = completedStretches.reduce(
    (sum, s) => sum + s.durationSeconds,
    0
  );

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
            label="Duration"
            value={formatDuration(sessionDuration)}
            subtext={`of ${formatDuration(plannedDuration)} planned`}
          />
          <StatCard
            label="Stretches"
            value={String(completedStretches.length)}
            subtext={
              partiallySkipped > 0
                ? `${fullyCompleted} full, ${partiallySkipped} partial`
                : 'all completed'
            }
          />
        </Flex>

        {/* Stretch List */}
        <Box style={{ width: '100%', marginTop: '16px' }}>
          <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
            Stretches Performed
          </Text>
          <Flex direction="column" gap="2">
            {completedStretches.map((stretch, index) => (
              <Card key={index} size="1">
                <Flex justify="between" align="center">
                  <Box>
                    <Text size="2" weight="medium">
                      {stretch.stretchName}
                    </Text>
                    <Text size="1" color="gray">
                      {BODY_REGION_LABELS[stretch.region]}
                    </Text>
                  </Box>
                  <Flex align="center" gap="2">
                    <Text size="1" color="gray">
                      {formatDuration(stretch.durationSeconds)}
                    </Text>
                    {stretch.skippedSegments > 0 && (
                      <Text size="1" color="orange">
                        {stretch.skippedSegments === 2 ? 'skipped' : 'partial'}
                      </Text>
                    )}
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Flex>
        </Box>

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
