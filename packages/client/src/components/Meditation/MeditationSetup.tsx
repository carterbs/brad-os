/**
 * Meditation Setup Component
 *
 * Configuration screen for meditation sessions. Users can:
 * - Select meditation duration (5, 10, or 20 minutes)
 * - See when they last meditated
 * - Start a meditation session
 */

import { Box, Flex, Text, Button, Heading } from '@radix-ui/themes';
import type { MeditationDuration } from '@brad-os/shared';
import { MEDITATION_DURATIONS, MEDITATION_DURATION_LABELS } from '@brad-os/shared';
import styles from './MeditationSetup.module.css';

interface MeditationSetupProps {
  selectedDuration: MeditationDuration;
  onDurationChange: (duration: MeditationDuration) => void;
  onStart: () => void;
  lastMeditatedAt?: string | null;
}

export function MeditationSetup({
  selectedDuration,
  onDurationChange,
  onStart,
  lastMeditatedAt,
}: MeditationSetupProps): JSX.Element {
  return (
    <Box style={{ padding: '16px', paddingBottom: '100px' }}>
      <Heading size="6" mb="4">
        Meditation
      </Heading>

      {lastMeditatedAt !== undefined && lastMeditatedAt !== null && (
        <Text size="2" color="gray" style={{ display: 'block', marginBottom: '16px' }}>
          Last meditated: {lastMeditatedAt}
        </Text>
      )}

      <Box mb="4">
        <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
          Select Duration
        </Text>
        <Text size="1" color="gray" mb="3" style={{ display: 'block' }}>
          Choose how long you want to meditate.
        </Text>

        <Flex direction="column" gap="3">
          {MEDITATION_DURATIONS.map((duration) => (
            <button
              key={duration}
              type="button"
              className={`${styles['durationCard']} ${
                selectedDuration === duration ? styles['selected'] : ''
              }`}
              onClick={() => onDurationChange(duration)}
              aria-pressed={selectedDuration === duration}
            >
              <Text size="5" weight="medium">
                {MEDITATION_DURATION_LABELS[duration]}
              </Text>
              <Text size="2" color="gray">
                {getDurationDescription(duration)}
              </Text>
            </button>
          ))}
        </Flex>
      </Box>

      <Flex
        justify="center"
        align="center"
        style={{
          position: 'fixed',
          bottom: '64px',
          left: 0,
          right: 0,
          padding: '16px',
          backgroundColor: 'var(--gray-1)',
          borderTop: '1px solid var(--gray-5)',
        }}
      >
        <Button size="3" onClick={onStart} style={{ minWidth: '200px' }}>
          Begin Meditation
        </Button>
      </Flex>
    </Box>
  );
}

function getDurationDescription(duration: MeditationDuration): string {
  switch (duration) {
    case 5:
      return 'Quick mindfulness break';
    case 10:
      return 'Standard practice';
    case 20:
      return 'Deep relaxation';
  }
}
