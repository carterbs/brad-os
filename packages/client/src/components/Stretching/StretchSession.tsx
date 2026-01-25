/**
 * Stretch Session Component
 *
 * Active stretching session view showing:
 * - Current stretch name and image
 * - Stretch description/instructions
 * - Segment-aware countdown timer
 * - Progress indicators
 * - Skip and control buttons
 */

import { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Heading,
  Button,
  AlertDialog,
} from '@radix-ui/themes';
import type { SelectedStretch } from '@brad-os/shared';
import { BODY_REGION_LABELS } from '@brad-os/shared';
import { getStretchImageUrl } from '../../utils/stretchData';
import type { AudioErrorState } from '../../hooks/useStretchSession';
import styles from './StretchSession.module.css';

interface StretchSessionProps {
  currentStretch: SelectedStretch;
  currentStretchIndex: number;
  totalStretches: number;
  currentSegment: 1 | 2;
  segmentRemaining: number;
  isPaused: boolean;
  audioError: AudioErrorState | null;
  onPause: () => void;
  onResume: () => void;
  onSkipSegment: () => void;
  onSkipStretch: () => void;
  onEnd: () => void;
  onRetryAudio: () => Promise<void>;
  onSkipAudio: () => void;
}

export function StretchSession({
  currentStretch,
  currentStretchIndex,
  totalStretches,
  currentSegment,
  segmentRemaining,
  isPaused,
  audioError,
  onPause,
  onResume,
  onSkipSegment,
  onSkipStretch,
  onEnd,
  onRetryAudio,
  onSkipAudio,
}: StretchSessionProps): JSX.Element {
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const { stretch, region, segmentDuration } = currentStretch;
  const regionLabel = BODY_REGION_LABELS[region];
  const imageUrl = getStretchImageUrl(stretch);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progressPercent = Math.max(
    0,
    ((segmentDuration - segmentRemaining) / segmentDuration) * 100
  );

  // Segment label
  const segmentLabel = stretch.bilateral
    ? currentSegment === 1
      ? 'Left Side'
      : 'Right Side'
    : `Segment ${currentSegment} of 2`;

  return (
    <Box className={styles['container']}>
      {/* Header */}
      <Box className={styles['header']}>
        <Text size="2" color="gray" className={styles['regionLabel']}>
          {regionLabel}
        </Text>
        <Heading size="6" className={styles['stretchName']}>
          {stretch.name}
        </Heading>
        <Text size="2" color="gray">
          {currentStretchIndex + 1} of {totalStretches} stretches
        </Text>
      </Box>

      {/* Stretch Image */}
      {imageUrl !== null && (
        <Box className={styles['imageContainer']}>
          <img
            src={imageUrl}
            alt={stretch.name}
            className={styles['stretchImage']}
          />
        </Box>
      )}

      {/* Description */}
      <Text as="p" size="3" className={styles['description']}>
        {stretch.description}
      </Text>

      {/* Timer Section */}
      <Box className={styles['timerSection']}>
        <Text
          className={`${styles['timer']} ${isPaused ? styles['paused'] : ''}`}
        >
          {formatTime(segmentRemaining)}
        </Text>
        <Text size="2" color="gray" className={styles['segmentLabel']}>
          {segmentLabel}
        </Text>

        {/* Progress Bar */}
        <Box className={styles['progressContainer']}>
          <Box
            className={styles['progressBar']}
            style={{ width: `${progressPercent}%` }}
          />
        </Box>
      </Box>

      {/* Controls */}
      <Box className={styles['controls']}>
        {/* Skip Buttons */}
        <Flex gap="3" className={styles['skipButtons']}>
          <Button
            variant="soft"
            color="gray"
            size="2"
            onClick={onSkipSegment}
            style={{ flex: 1 }}
          >
            Skip Segment
          </Button>
          <Button
            variant="soft"
            color="gray"
            size="2"
            onClick={onSkipStretch}
            style={{ flex: 1 }}
          >
            Skip Stretch
          </Button>
        </Flex>

        {/* Main Controls */}
        <Flex className={styles['mainControls']}>
          <Button
            size="3"
            variant="soft"
            color="red"
            onClick={() => setShowStopConfirm(true)}
          >
            Stop
          </Button>
          <Button size="3" onClick={isPaused ? onResume : onPause}>
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
        </Flex>
      </Box>

      {/* Stop Confirmation Dialog */}
      <AlertDialog.Root
        open={showStopConfirm}
        onOpenChange={setShowStopConfirm}
      >
        <AlertDialog.Content maxWidth="320px">
          <AlertDialog.Title>End Session?</AlertDialog.Title>
          <AlertDialog.Description>
            <Text color="gray">
              Are you sure you want to end your stretching session early?
            </Text>
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              color="red"
              onClick={() => {
                setShowStopConfirm(false);
                onEnd();
              }}
            >
              End Session
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Audio Error Overlay */}
      {audioError !== null && (
        <Box className={styles['errorOverlay']}>
          <Box className={styles['errorDialog']}>
            <Heading size="4" mb="2">
              Audio Error
            </Heading>
            <Text as="p" size="2" color="gray" mb="4">
              {audioError.message}
            </Text>
            <Flex gap="3" justify="center">
              <Button variant="soft" color="gray" onClick={onSkipAudio}>
                Skip
              </Button>
              <Button onClick={() => void onRetryAudio()}>Retry</Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Box>
  );
}
